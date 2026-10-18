import { buildFullDeck, nextRandom } from "@/lib/game/cards";
import { bestHand, CATEGORY, compareHands, compareShowdown, holeTiebreak } from "@/lib/game/evaluator";
import { apply, canMulligan, publicBoard } from "@/lib/game/engine";
import type { Action, Card, HandValue, MatchState, PlayerState } from "@/lib/game/types";

/**
 * Bots may read public cards, their own hands, vault counts, and the rules.
 * They rebuild the unseen full-deck from scratch, so hidden board cards,
 * opponent hole cards, and face-down commits stay out of the decision.
 */
export function unknownFullCards(state: MatchState, seat: number): Card[] {
  const known = new Set<string>();
  for (const card of state.community_board) {
    if (card.visibility === "PUBLIC") known.add(card.id);
  }
  const self = state.players[seat];
  if (!self) return buildFullDeck();
  for (const card of self.full_hand) known.add(card.id);
  return buildFullDeck().filter((card) => !known.has(card.id));
}

export function decide(state: MatchState, seat: number): Action {
  const player = state.players[seat];
  if (!player) throw new Error("Bot seat is empty.");
  switch (state.phase) {
    case "MULLIGAN":
      return canMulligan(player, state.current_round) && weakMiniHand(player)
        ? { type: "MULLIGAN", seat }
        : { type: "DECLINE_MULLIGAN", seat };
    case "BLIND":
      return { type: "BLIND", seat, card_id: chooseBlind(state, seat).id };
    case "COMMIT":
      return { type: "COMMIT", seat, card_id: chooseCommit(state, seat).id };
    case "HIJACK":
      return chooseHijack(state, seat);
    case "DISCARD":
      return { type: "DISCARD", seat, card_id: chooseDiscard(state, seat).id };
    default:
      throw new Error(`A bot has nothing to decide during ${state.phase}.`);
  }
}

export function progressAi(state: MatchState): MatchState | null {
  if (state.error || state.phase === "MATCH_OVER") return null;
  if (state.phase === "SHOWDOWN") {
    if (state.players.some((player) => player.is_human)) return null;
    return apply(state, { type: "CONTINUE" });
  }
  if (state.phase === "REVEAL" || state.phase === "FLIP" || state.phase === "RESOLVE") {
    return apply(state, { type: "ADVANCE" });
  }
  if (state.phase === "MULLIGAN" || state.phase === "BLIND" || state.phase === "HIJACK") {
    const seat = state.actor_seat;
    if (seat === null || state.players[seat]?.is_human) return null;
    return safeDecide(state, seat);
  }
  if (state.phase === "COMMIT" || state.phase === "DISCARD") {
    const locked = (seat: number) =>
      state.phase === "COMMIT" ? state.commits_locked[seat] === true : state.discards_locked[seat] === true;
    if (state.players.some((player) => player.is_human && !locked(player.seat_index))) return null;
    let next = state;
    for (const player of state.players) {
      if (next.phase !== state.phase) break;
      if (player.is_human) continue;
      const seatLocked =
        next.phase === "COMMIT" ? next.commits_locked[player.seat_index] : next.discards_locked[player.seat_index];
      if (seatLocked) continue;
      next = safeDecide(next, player.seat_index);
      if (next.error) return next;
    }
    return next === state ? null : next;
  }
  return null;
}

export function runBots(state: MatchState, maxSteps = 8000): MatchState {
  let current = state;
  for (let step = 0; step < maxSteps; step++) {
    if (current.phase === "MATCH_OVER") return current;
    const next = progressAi(current);
    if (!next || next === current) {
      throw new Error(`Bots stuck in ${current.phase} on deal ${current.deal_number}.`);
    }
    if (next.error) throw new Error(next.error);
    current = next;
  }
  throw new Error("The bot match exceeded its step budget.");
}

function safeDecide(state: MatchState, seat: number): MatchState {
  try {
    return apply(state, decide(state, seat));
  } catch (error) {
    return {
      ...state,
      error: error instanceof Error ? error.message : "A bot failed to act.",
    };
  }
}

function weakMiniHand(player: PlayerState): boolean {
  const cards = player.mini_hand;
  if (cards.length === 0) return false;
  const average = cards.reduce((sum, card) => sum + card.rank, 0) / cards.length;
  const ranks = new Map<number, number>();
  const suits = new Map<string, number>();
  for (const card of cards) {
    ranks.set(card.rank, (ranks.get(card.rank) ?? 0) + 1);
    suits.set(card.suit, (suits.get(card.suit) ?? 0) + 1);
  }
  const paired = [...ranks.values()].some((count) => count >= 2);
  const suited = [...suits.values()].some((count) => count >= 3);
  return !paired && !suited && average <= 7.2;
}

function chooseBlind(state: MatchState, seat: number): Card {
  const player = state.players[seat]!;
  if (player.mini_hand.length === 0) return lowest(player.reserve_vp_pile);
  const random = makeRng(thinkSeed(state, seat));
  const boards = sampleUpcoming(state, seat, random);
  let bestCard = player.mini_hand[0]!;
  let bestScore = -Infinity;
  for (const card of player.mini_hand) {
    const rest = player.mini_hand.filter((other) => other.id !== card.id);
    let total = 0;
    for (const board of boards) {
      const commit = bestCommit(rest, card, board);
      const value = commit ? scoreOf(commit.hand) : card.rank;
      total += value;
    }
    const score = total / boards.length - card.rank * 0.35;
    if (score > bestScore) {
      bestScore = score;
      bestCard = card;
    }
  }
  return bestCard;
}

function chooseCommit(state: MatchState, seat: number): Card {
  const player = state.players[seat]!;
  const blind = player.active_bid_cards[0];
  if (!blind) throw new Error("The bot has no blind to commit behind.");
  const board = publicBoard(state);
  const fromHand = bestCommit(player.mini_hand, blind, board);
  if (!fromHand && player.reserve_vp_pile.length === 0) {
    throw new Error("The bot has no mini card left to commit.");
  }
  if (fromHand && losesToShowing(state, seat, fromHand.hand)) {
    if (state.current_round === 3 && player.reserve_vp_pile.length > 0 && mayRiskVault(state, seat)) {
      const fromVault = bestCommit(player.reserve_vp_pile, blind, board);
      if (fromVault && !losesToShowing(state, seat, fromVault.hand)) return fromVault.card;
    }
    return lowestPlayable(player.mini_hand.length ? player.mini_hand : player.reserve_vp_pile, board, blind);
  }
  if (fromHand && wantsDefensiveTie(state, seat)) {
    const boardHand = bestHand(board);
    const tying = player.mini_hand.filter(
      (card) => compareHands(bestHand([blind, card, ...board]), boardHand) === 0,
    );
    if (tying.length > 0) return lowestPlayable(tying, board, blind);
  }
  if (!fromHand) return lowest(player.reserve_vp_pile);
  return fromHand.card;
}

function chooseHijack(state: MatchState, seat: number): Action {
  const player = state.players[seat]!;
  const board = publicBoard(state);
  const pass = keepStrength(player.full_hand, board);
  let bestSwap: { handId: string; boardIndex: number; score: number; dangerous: boolean } | null = null;
  let bestBluff: { handId: string; boardIndex: number; score: number } | null = null;
  for (const give of player.full_hand) {
    for (let index = 0; index < board.length; index++) {
      const take = board[index]!;
      if (take.visibility !== "PUBLIC") continue;
      const newHoles = player.full_hand.map((card) => (card.id === give.id ? take : card));
      const newBoard = board.map((card, boardIndex) => (boardIndex === index ? give : card));
      const value = keepStrength(newHoles, newBoard);
      const dangerous = isDangerous(board, take);
      if (!bestSwap || value.score > bestSwap.score) {
        bestSwap = { handId: give.id, boardIndex: index, score: value.score, dangerous };
      }
      if (
        dangerous &&
        pass.category >= CATEGORY.FLUSH &&
        value.score >= pass.score - 8 &&
        (!bestBluff || value.score > bestBluff.score)
      ) {
        bestBluff = { handId: give.id, boardIndex: index, score: value.score };
      }
    }
  }
  if (bestBluff) {
    return { type: "HIJACK_SWAP", seat, hand_card_id: bestBluff.handId, board_index: bestBluff.boardIndex };
  }
  if (bestSwap && bestSwap.score > pass.score) {
    return { type: "HIJACK_SWAP", seat, hand_card_id: bestSwap.handId, board_index: bestSwap.boardIndex };
  }
  return { type: "HIJACK_PASS", seat };
}

function keepStrength(holes: Card[], board: Card[]): { score: number; category: number } {
  const keptHand = kept(holes, board);
  const kickers = keptHand.hand.tiebreak.reduce((total, rank, index) => total + rank / 15 ** index, 0);
  return { score: keptHand.hand.category * 100 + kickers, category: keptHand.hand.category };
}

function chooseDiscard(state: MatchState, seat: number): Card {
  const player = state.players[seat]!;
  const board = publicBoard(state);
  const stolen = state.last_swap?.seat === seat ? state.last_swap.left_board.id : null;
  let best = player.full_hand[0]!;
  let bestValue: HandValue | null = null;
  for (const drop of player.full_hand) {
    const keep = player.full_hand.filter((card) => card.id !== drop.id);
    const hand = bestHand([...keep, ...board]);
    if (!bestValue || compareHands(hand, bestValue) > 0) {
      bestValue = hand;
      best = drop;
      continue;
    }
    if (compareHands(hand, bestValue) === 0) {
      if (drop.id === stolen) best = drop;
      else if (best.id !== stolen && drop.rank < best.rank) best = drop;
    }
  }
  return best;
}

function wantsDefensiveTie(state: MatchState, seat: number): boolean {
  const board = publicBoard(state);
  if (board.length < 5) return false;
  const player = state.players[seat]!;
  if (player.full_hand.length < 2) return false;
  const showdown = bestHand([...player.full_hand, ...board]);
  if (showdown.category < CATEGORY.FLUSH) return false;
  const ranks = new Map<number, number>();
  for (const card of board) ranks.set(card.rank, (ranks.get(card.rank) ?? 0) + 1);
  const highPair = [...ranks.entries()].some(([rank, count]) => count >= 2 && rank >= 10);
  if (!highPair) return false;
  const boardHand = bestHand(board);
  for (const opponent of state.players) {
    if (opponent.seat_index === seat) continue;
    const blind = opponent.active_bid_cards[0];
    if (!blind || blind.visibility !== "PUBLIC") continue;
    if (compareHands(bestHand([...board, blind]), boardHand) > 0) return false;
  }
  return true;
}

function losesToShowing(state: MatchState, seat: number, hand: HandValue): boolean {
  const board = publicBoard(state);
  for (const opponent of state.players) {
    if (opponent.seat_index === seat) continue;
    const blind = opponent.active_bid_cards[0];
    if (!blind || blind.visibility !== "PUBLIC") continue;
    if (board.length + 1 >= 5) {
      if (compareHands(hand, bestHand([...board, blind])) < 0) return true;
      continue;
    }
    const pairsHigh = board.some((card) => card.rank === blind.rank && blind.rank >= 10);
    if (!pairsHigh) continue;
    const scare: HandValue = {
      category: CATEGORY.PAIR,
      tiebreak: [blind.rank, 0, 0, 0],
      cards: [],
      name: "pair",
    };
    if (compareHands(hand, scare) < 0) return true;
  }
  return false;
}

function mayRiskVault(state: MatchState, seat: number): boolean {
  const matchPoint = state.players.some(
    (player) => player.seat_index !== seat && player.reserve_vp_pile.length >= state.vp_target - 1,
  );
  if (matchPoint) return true;
  return swapSwing(state, seat) > 0.65;
}

function swapSwing(state: MatchState, seat: number): number {
  const player = state.players[seat]!;
  const board = publicBoard(state);
  if (board.length < 5 || player.full_hand.length < 2) return 0;
  const unknown = unknownFullCards(state, seat);
  const opponents = state.players.length - 1;
  const need = 1 + opponents * 3;
  if (unknown.length < need) return 0;
  const random = makeRng(thinkSeed(state, seat) ^ 0x51ed);
  let swings = 0;
  const sims = 8;
  for (let sim = 0; sim < sims; sim++) {
    const sample = shuffled(unknown, random).slice(0, need);
    const mine = [...player.full_hand, sample[0]!];
    const others: Card[][] = [];
    for (let index = 0; index < opponents; index++) {
      const start = 1 + index * 3;
      others.push(sample.slice(start, start + 3));
    }
    if (winsAgainst(mine, board, others)) continue;
    if (anySwapWins(mine, board, others)) swings += 1;
  }
  return swings / sims;
}

function anySwapWins(holes: Card[], board: Card[], opponents: Card[][]): boolean {
  for (const give of holes) {
    for (let index = 0; index < board.length; index++) {
      const take = board[index]!;
      const nextHoles = holes.map((card) => (card.id === give.id ? take : card));
      const nextBoard = board.map((card, boardIndex) => (boardIndex === index ? give : card));
      if (winsAgainst(nextHoles, nextBoard, opponents)) return true;
    }
  }
  return false;
}

function winsAgainst(holes: Card[], board: Card[], opponents: Card[][]): boolean {
  const mine = kept(holes, board);
  return opponents.every((opponent) => {
    const theirs = kept(opponent, board);
    return compareShowdown(mine, theirs) > 0;
  });
}

function kept(three: Card[], board: Card[]): { hand: HandValue; hole_tiebreak: [number, number] } {
  let best: { hand: HandValue; hole_tiebreak: [number, number] } | null = null;
  for (let index = 0; index < three.length; index++) {
    const holes = three.filter((_, cardIndex) => cardIndex !== index);
    if (holes.length + board.length < 5) continue;
    const entry = { hand: bestHand([...holes, ...board]), hole_tiebreak: holeTiebreak(holes) };
    if (!best || compareShowdown(entry, best) > 0) best = entry;
  }
  if (!best) throw new Error("Could not keep a showdown hand.");
  return best;
}

function sampleUpcoming(state: MatchState, seat: number, random: () => number): Card[][] {
  const showing = publicBoard(state);
  const missing = state.current_round === 1 ? 3 : 1;
  const unknown = unknownFullCards(state, seat);
  const boards: Card[][] = [];
  for (let index = 0; index < 6; index++) {
    boards.push([...showing, ...shuffled(unknown, random).slice(0, missing)]);
  }
  return boards;
}

function bestCommit(options: Card[], blind: Card, board: Card[]): { card: Card; hand: HandValue } | null {
  let best: { card: Card; hand: HandValue } | null = null;
  for (const card of options) {
    if (board.length + 2 < 5) continue;
    const hand = bestHand([blind, card, ...board]);
    if (
      !best ||
      compareHands(hand, best.hand) > 0 ||
      (compareHands(hand, best.hand) === 0 && card.rank < best.card.rank)
    ) {
      best = { card, hand };
    }
  }
  return best;
}

function lowestPlayable(cards: Card[], board: Card[], blind: Card): Card {
  const quiet = cards.filter((card) => unconnected(card, board, blind));
  return lowest(quiet.length > 0 ? quiet : cards);
}

function unconnected(card: Card, board: Card[], blind: Card): boolean {
  if (card.rank === blind.rank) return false;
  if (board.some((other) => other.rank === card.rank)) return false;
  if (board.filter((other) => other.suit === card.suit).length >= 2) return false;
  const close = board.filter((other) => other.rank !== card.rank && Math.abs(other.rank - card.rank) <= 2).length;
  return close < 2;
}

function isDangerous(board: Card[], card: Card): boolean {
  if (board.filter((other) => other.suit === card.suit).length >= 3) return true;
  if (board.filter((other) => other.rank === card.rank).length >= 2 && card.rank >= 10) return true;
  const close = board.filter((other) => other.id !== card.id && Math.abs(other.rank - card.rank) <= 4).length;
  return close >= 2;
}

function scoreOf(hand: HandValue): number {
  return hand.category * 15 + (hand.tiebreak[0] ?? 0);
}

function lowest(cards: Card[]): Card {
  const card = [...cards].sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id))[0];
  if (!card) throw new Error("The bot was asked to play from an empty pile.");
  return card;
}

function thinkSeed(state: MatchState, seat: number): number {
  return (state.rng + seat * 977 + state.deal_number * 131 + state.current_round * 17 + state.action_log.length * 3) >>> 0;
}

function makeRng(seed: number): () => number {
  let current = seed >>> 0;
  return () => {
    const next = nextRandom(current);
    current = next.seed;
    return next.value;
  };
}

function shuffled(cards: Card[], random: () => number): Card[] {
  const copy = [...cards];
  for (let index = copy.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    const tmp = copy[index]!;
    copy[index] = copy[swap]!;
    copy[swap] = tmp;
  }
  return copy;
}
