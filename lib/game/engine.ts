import {
  buildFullDeck,
  buildMiniDeck,
  cardLabel,
  nextRandom,
  roundName,
  shuffleInPlace,
  resolvedMulligan,
  tableScale,
  uniqueCards,
} from "@/lib/game/cards";
import { bestHand, compareHands, compareShowdown, holeTiebreak } from "@/lib/game/evaluator";
import type {
  Action,
  BidSnapshot,
  BidSource,
  Card,
  DealPreset,
  LogEntry,
  MatchConfig,
  MatchState,
  Phase,
  PlayerState,
} from "@/lib/game/types";

export const BOT_NAMES = ["Vesper", "Calder", "Juniper", "Rook", "Mara", "Silas", "Nell"];

export function seatOrder(button: number, count: number): number[] {
  const order: number[] = [];
  for (let step = 1; step <= count; step++) order.push((button + step) % count);
  return order;
}

export function canMulligan(player: PlayerState, round: number): boolean {
  if (player.has_used_mulligan) return false;
  if (player.mini_hand.length < 2) return false;
  const need = 2 * (4 - round);
  return player.mini_hand.length - 1 + player.reserve_vp_pile.length >= need;
}

export function publicBoard(state: MatchState): Card[] {
  return state.community_board.filter((card) => card.visibility === "PUBLIC");
}

export function createMatch(config: MatchConfig, preset?: DealPreset): MatchState {
  if (config.player_count < 2 || config.player_count > 7) {
    throw new Error("Hold'em Hijack seats 2 to 7 players.");
  }
  if (config.human_seat < -1 || config.human_seat >= config.player_count) {
    throw new Error("The human seat is outside the table.");
  }
  config = { ...config, mulligan: resolvedMulligan(config.player_count, config.mulligan) };
  const scale = tableScale(config.player_count);
  const players: PlayerState[] = [];
  let bot = 0;
  for (let seat = 0; seat < config.player_count; seat++) {
    const isHuman = seat === config.human_seat;
    players.push({
      id: `seat_${seat}`,
      name: isHuman ? config.human_name.trim() || "Player" : BOT_NAMES[bot++]!,
      is_human: isHuman,
      seat_index: seat,
      full_hand: [],
      mini_hand: [],
      reserve_vp_pile: [],
      has_used_mulligan: false,
      active_bid_cards: [null, null],
      bid_sources: [null, null],
    });
  }
  const state: MatchState = {
    config,
    players,
    dealer_button_index: 0,
    vp_target: scale.vpTarget,
    mini_decks_used: scale.miniDecks,
    full_deck: [],
    full_discard_pile: [],
    mini_deck: [],
    mini_discard_pile: [],
    community_board: [],
    current_round: 1,
    phase: "MULLIGAN",
    actor_seat: null,
    round_winner_seat: null,
    bid_tie: false,
    last_bid: [],
    last_swap: null,
    commits_locked: players.map(() => false),
    discards_locked: players.map(() => false),
    pending_discards: players.map(() => null),
    showdown: null,
    match_winner_seat: null,
    deal_number: 1,
    action_log: [],
    log_seq: 0,
    rng: config.seed >>> 0,
    error: null,
  };
  if (preset?.button !== undefined) {
    state.dealer_button_index = preset.button % config.player_count;
  } else {
    state.dealer_button_index = Math.floor(drawUnit(state) * config.player_count);
  }
  dealSetup(state, preset);
  return state;
}

export function apply(state: MatchState, action: Action): MatchState {
  const next = structuredClone(state);
  try {
    reduce(next, action);
    next.error = null;
    return next;
  } catch (error) {
    return {
      ...state,
      error: error instanceof Error ? error.message : "That action is not legal.",
    };
  }
}

export function drawMiniCards(state: MatchState, count: number): Card[] {
  const drawn: Card[] = [];
  for (let i = 0; i < count; i++) {
    if (state.mini_deck.length === 0) {
      if (state.mini_discard_pile.length === 0) {
        throw new Error("No mini cards left to draw.");
      }
      state.mini_deck = state.mini_discard_pile;
      state.mini_discard_pile = [];
      state.rng = shuffleInPlace(state.mini_deck, state.rng);
    }
    const card = state.mini_deck.pop();
    if (!card) throw new Error("No mini cards left to draw.");
    drawn.push(card);
  }
  return drawn;
}

export function auditCards(state: MatchState): string[] {
  const problems: string[] = [];
  const full: Card[] = [
    ...state.full_deck,
    ...state.full_discard_pile,
    ...state.community_board,
  ];
  const mini: Card[] = [...state.mini_deck, ...state.mini_discard_pile];
  for (const player of state.players) {
    full.push(...player.full_hand);
    mini.push(...player.mini_hand, ...player.reserve_vp_pile);
    for (const card of player.active_bid_cards) if (card) mini.push(card);
  }
  if (uniqueCards(full).length !== 52 || full.length !== 52) {
    problems.push(`Full deck count is ${full.length}, unique ${uniqueCards(full).length}.`);
  }
  const expectedMini = state.mini_decks_used * 52;
  if (uniqueCards(mini).length !== expectedMini || mini.length !== expectedMini) {
    problems.push(`Mini deck count is ${mini.length}, unique ${uniqueCards(mini).length}.`);
  }
  const reserved = new Set(state.players.flatMap((player) => player.reserve_vp_pile.map((card) => card.id)));
  for (const card of state.mini_deck) {
    if (reserved.has(card.id)) problems.push(`${card.id} is both reserved and in the mini deck.`);
  }
  const threeCard = state.phase === "HIJACK" || state.phase === "DISCARD";
  for (const player of state.players) {
    const size = player.full_hand.length;
    if (threeCard && size !== 3) problems.push(`${player.name} should hold 3 hole cards.`);
    if (!threeCard && size !== 2) problems.push(`${player.name} should hold 2 hole cards.`);
  }
  if ((state.phase === "SHOWDOWN" || state.phase === "MATCH_OVER") && state.players.some((p) => p.mini_hand.length > 0)) {
    problems.push("Mini hands should be empty after showdown banking.");
  }
  return problems;
}

function reduce(state: MatchState, action: Action): void {
  switch (action.type) {
    case "MULLIGAN":
      return mulligan(state, action.seat, true);
    case "DECLINE_MULLIGAN":
      return mulligan(state, action.seat, false);
    case "BLIND":
      return playBid(state, action.seat, action.card_id, 0);
    case "COMMIT":
      return playBid(state, action.seat, action.card_id, 1);
    case "ADVANCE":
      return advance(state);
    case "HIJACK_PASS":
      return hijackPass(state, action.seat);
    case "HIJACK_SWAP":
      return hijackSwap(state, action.seat, action.hand_card_id, action.board_index);
    case "DISCARD":
      return discard(state, action.seat, action.card_id);
    case "START_SHOWDOWN":
      return beginShowdown(state);
    case "CONTINUE":
      return continueMatch(state);
    default:
      throw new Error("Unknown action.");
  }
}

function mulligan(state: MatchState, seat: number, use: boolean): void {
  if (state.config.mulligan === "none") throw new Error("This table does not play a mulligan.");
  assertPhase(state, "MULLIGAN");
  if (state.actor_seat !== seat) throw new Error("It is not your turn to mulligan.");
  const player = seatPlayer(state, seat);
  if (use) {
    if (!canMulligan(player, state.current_round)) {
      throw new Error("A mulligan would leave you short of bid cards.");
    }
    const count = player.mini_hand.length;
    for (const card of player.mini_hand) {
      card.visibility = "HIDDEN";
      state.mini_discard_pile.push(card);
    }
    player.mini_hand = [];
    const drawn = drawMiniCards(state, count - 1);
    for (const card of drawn) card.visibility = "OWNER_ONLY";
    player.mini_hand = drawn;
    player.has_used_mulligan = true;
    log(
      state,
      `${player.name} mulligans, discarding ${count} mini cards and drawing ${count - 1}.`,
      "warn",
    );
  } else {
    log(state, `${player.name} keeps the mini hand.`);
  }
  state.actor_seat = nextMulliganSeat(state, seat);
  if (state.actor_seat === null) startBlind(state);
}

function playBid(state: MatchState, seat: number, cardId: string, slot: 0 | 1): void {
  const player = seatPlayer(state, seat);
  if (slot === 0) {
    assertPhase(state, "BLIND");
    if (state.actor_seat !== seat) throw new Error("It is not your turn to blind.");
    if (player.active_bid_cards[0]) throw new Error("You already played a blind.");
  } else {
    assertPhase(state, "COMMIT");
    if (state.commits_locked[seat]) throw new Error("Your commit is already locked.");
    if (!player.active_bid_cards[0]) throw new Error("The blind is missing.");
  }
  const taken = takeMini(player, cardId);
  taken.card.visibility = slot === 0 ? "PUBLIC" : "OWNER_ONLY";
  player.active_bid_cards[slot] = taken.card;
  player.bid_sources[slot] = taken.source;
  const from = taken.source === "RESERVE" ? "the vault" : "hand";
  if (slot === 0) {
    log(state, `${player.name} blinds ${cardLabel(taken.card)} from ${from}.`, taken.source === "RESERVE" ? "warn" : "info");
    const order = seatOrder(state.dealer_button_index, state.players.length);
    const index = order.indexOf(seat);
    state.actor_seat = index === order.length - 1 ? null : order[index + 1]!;
    if (state.actor_seat === null) state.phase = "REVEAL";
  } else {
    state.commits_locked[seat] = true;
    if (state.commits_locked.every(Boolean)) {
      for (const bidder of state.players) {
        const commit = bidder.active_bid_cards[1];
        if (!commit) throw new Error("A commit is missing.");
        commit.visibility = "PUBLIC";
      }
      state.phase = "FLIP";
      state.actor_seat = null;
      log(state, "All commits flip face up.");
    }
  }
}

function advance(state: MatchState): void {
  if (state.phase === "REVEAL") {
    revealBoard(state);
    return;
  }
  if (state.phase === "FLIP") {
    resolveBid(state);
    return;
  }
  if (state.phase === "RESOLVE") {
    beginCycle(state);
    return;
  }
  throw new Error("Nothing is waiting to advance.");
}

function revealBoard(state: MatchState): void {
  const indexes =
    state.current_round === 1 ? [0, 1, 2] : state.current_round === 2 ? [3] : [4];
  for (const index of indexes) {
    const card = state.community_board[index];
    if (!card) throw new Error("The board is short a card.");
    card.visibility = "PUBLIC";
  }
  const flipped = indexes.map((index) => cardLabel(state.community_board[index]!));
  const street = publicBoard(state).map(cardLabel).join(" ");
  log(state, `${roundName(state.current_round)}: ${flipped.join(" ")}. Board is ${street}.`);
  state.phase = "COMMIT";
  state.actor_seat = null;
  state.commits_locked = state.players.map(() => false);
}

function resolveBid(state: MatchState): void {
  const board = publicBoard(state);
  const snapshots: BidSnapshot[] = [];
  for (const player of state.players) {
    const blind = player.active_bid_cards[0];
    const commit = player.active_bid_cards[1];
    const source0 = player.bid_sources[0];
    const source1 = player.bid_sources[1];
    if (!blind || !commit || !source0 || !source1) throw new Error("A bid is incomplete.");
    const scored = bestHand([blind, commit, ...board]);
    snapshots.push({
      seat: player.seat_index,
      cards: [structuredClone(blind), structuredClone(commit)],
      sources: [source0, source1],
      hand: { ...scored, cards: scored.cards.map((card) => structuredClone(card)) },
    });
  }
  let best = snapshots[0]!;
  let tie = false;
  for (const snapshot of snapshots.slice(1)) {
    const cmp = compareHands(snapshot.hand, best.hand);
    if (cmp > 0) {
      best = snapshot;
      tie = false;
    } else if (cmp === 0) tie = true;
  }
  state.last_bid = snapshots;
  state.bid_tie = tie;
  state.round_winner_seat = tie ? null : best.seat;
  for (const snapshot of snapshots) {
    const player = state.players[snapshot.seat]!;
    log(state, `${player.name} bids ${snapshot.hand.name}.`);
  }
  if (tie) {
    log(state, `The ${roundName(state.current_round).toLowerCase()} bid is a draw. Nobody swaps.`, "warn");
  } else {
    log(
      state,
      `${state.players[best.seat]!.name} wins the ${roundName(state.current_round).toLowerCase()} with ${best.hand.name}.`,
      "win",
    );
  }
  for (const player of state.players) {
    for (const card of player.active_bid_cards) {
      if (!card) continue;
      card.visibility = "HIDDEN";
      state.mini_discard_pile.push(card);
    }
    player.active_bid_cards = [null, null];
    player.bid_sources = [null, null];
  }
  state.phase = "RESOLVE";
  state.actor_seat = null;
}

function beginCycle(state: MatchState): void {
  const order = seatOrder(state.dealer_button_index, state.players.length);
  for (const seat of order) {
    const card = state.full_deck.pop();
    if (!card) throw new Error("The full deck ran out before the draw.");
    card.visibility = "OWNER_ONLY";
    state.players[seat]!.full_hand.push(card);
  }
  log(state, "Every player draws one hole card.");
  state.discards_locked = state.players.map(() => false);
  state.pending_discards = state.players.map(() => null);
  if (state.round_winner_seat === null) {
    state.phase = "DISCARD";
    state.actor_seat = null;
    return;
  }
  state.phase = "HIJACK";
  state.actor_seat = state.round_winner_seat;
}

function hijackPass(state: MatchState, seat: number): void {
  assertPhase(state, "HIJACK");
  if (state.actor_seat !== seat) throw new Error("Only the bid winner can answer the hijack.");
  log(state, `${seatPlayer(state, seat).name} passes the swap.`);
  openDiscard(state);
}

function hijackSwap(state: MatchState, seat: number, handCardId: string, boardIndex: number): void {
  assertPhase(state, "HIJACK");
  if (state.actor_seat !== seat) throw new Error("Only the bid winner can swap the board.");
  const player = seatPlayer(state, seat);
  const handIndex = player.full_hand.findIndex((card) => card.id === handCardId);
  if (handIndex < 0) throw new Error("That hole card is not in your hand.");
  const boardCard = state.community_board[boardIndex];
  if (!boardCard || boardCard.visibility !== "PUBLIC") {
    throw new Error("Choose a face-up community card.");
  }
  const handCard = player.full_hand[handIndex]!;
  const left = structuredClone(boardCard);
  const entered = structuredClone(handCard);
  left.visibility = "PUBLIC";
  entered.visibility = "PUBLIC";
  player.full_hand[handIndex] = boardCard;
  boardCard.visibility = "OWNER_ONLY";
  state.community_board[boardIndex] = handCard;
  handCard.visibility = "PUBLIC";
  state.last_swap = { seat, left_board: left, entered_board: entered, board_index: boardIndex };
  log(
    state,
    `Board swap: ${cardLabel(left)} leaves the board. ${cardLabel(entered)} enters.`,
    "swap",
  );
  openDiscard(state);
}

function openDiscard(state: MatchState): void {
  state.phase = "DISCARD";
  state.actor_seat = null;
  state.discards_locked = state.players.map(() => false);
  state.pending_discards = state.players.map(() => null);
}

function discard(state: MatchState, seat: number, cardId: string): void {
  assertPhase(state, "DISCARD");
  if (state.discards_locked[seat]) throw new Error("Your discard is already locked.");
  const player = seatPlayer(state, seat);
  if (!player.full_hand.some((card) => card.id === cardId)) {
    throw new Error("That card is not in your hand.");
  }
  if (player.full_hand.length !== 3) throw new Error("Discard happens from a 3-card hand.");
  state.pending_discards[seat] = cardId;
  state.discards_locked[seat] = true;
  if (!state.discards_locked.every(Boolean)) return;
  for (const bidder of state.players) {
    const id = state.pending_discards[bidder.seat_index];
    const index = bidder.full_hand.findIndex((card) => card.id === id);
    if (index < 0) throw new Error("A locked discard disappeared.");
    const [card] = bidder.full_hand.splice(index, 1);
    card!.visibility = "HIDDEN";
    state.full_discard_pile.push(card!);
  }
  log(state, "All players discard one hole card face down.");
  if (state.current_round < 3) {
    state.current_round = (state.current_round + 1) as 1 | 2 | 3;
    state.dealer_button_index = (state.dealer_button_index + 1) % state.players.length;
    state.round_winner_seat = null;
    state.bid_tie = false;
    log(state, `Button moves to ${state.players[state.dealer_button_index]!.name}.`);
    enterMulligan(state);
    return;
  }
  callShowdown(state);
}

function callShowdown(state: MatchState): void {
  state.current_round = 4;
  state.phase = "SHOWDOWN_CALL";
  state.actor_seat = null;
  log(state, "The river is finished. Start the final showdown when the table is ready.");
}

function beginShowdown(state: MatchState): void {
  assertPhase(state, "SHOWDOWN_CALL");
  showdown(state);
}

function showdown(state: MatchState): void {
  state.current_round = 4;
  for (const card of state.community_board) card.visibility = "PUBLIC";
  for (const player of state.players) {
    for (const card of player.full_hand) card.visibility = "PUBLIC";
  }
  const entries = state.players.map((player) => ({
    seat: player.seat_index,
    hand: bestHand([...player.full_hand, ...state.community_board]),
    hole_tiebreak: holeTiebreak(player.full_hand),
  }));
  let winner = entries[0]!;
  for (const entry of entries.slice(1)) {
    if (compareShowdown(entry, winner) > 0) winner = entry;
  }
  const pokerTie = entries.filter((entry) => compareHands(entry.hand, winner.hand) === 0).length > 1;
  const vpBefore = state.players.map((player) => player.reserve_vp_pile.length);
  const winnerPlayer = state.players[winner.seat]!;
  const banked = winnerPlayer.mini_hand.length;
  for (const card of winnerPlayer.mini_hand) {
    card.visibility = "OWNER_ONLY";
    winnerPlayer.reserve_vp_pile.push(card);
  }
  winnerPlayer.mini_hand = [];
  for (const player of state.players) {
    if (player.seat_index === winner.seat) continue;
    for (const card of player.mini_hand) {
      card.visibility = "HIDDEN";
      state.mini_discard_pile.push(card);
    }
    player.mini_hand = [];
  }
  const vpAfter = state.players.map((player) => player.reserve_vp_pile.length);
  state.showdown = {
    winner_seat: winner.seat,
    entries,
    vp_before: vpBefore,
    vp_after: vpAfter,
    banked,
    poker_tie: pokerTie,
  };
  log(
    state,
    `${winnerPlayer.name} wins the showdown with ${winner.hand.name}${pokerTie ? ", breaking a poker tie on the highest hole card" : ""}.`,
    "win",
  );
  log(
    state,
    `${winnerPlayer.name} banks ${banked} mini ${banked === 1 ? "card" : "cards"}. Vault is ${vpAfter[winner.seat]}/${state.vp_target}.`,
    "win",
  );
  for (const player of state.players) {
    if (player.seat_index === winner.seat) continue;
    const before = vpBefore[player.seat_index] ?? 0;
    const after = vpAfter[player.seat_index] ?? 0;
    const spent = before - after;
    log(
      state,
      spent > 0
        ? `${player.name} loses the showdown and ${spent} vault ${spent === 1 ? "card" : "cards"}. Vault is ${after}/${state.vp_target}.`
        : `${player.name} loses the showdown. Vault stays ${after}/${state.vp_target}.`,
    );
  }
  const victor = state.players.find((player) => player.reserve_vp_pile.length >= state.vp_target);
  if (victor) {
    state.match_winner_seat = victor.seat_index;
    state.phase = "MATCH_OVER";
    state.actor_seat = null;
    log(state, `${victor.name} reaches ${victor.reserve_vp_pile.length} victory points and takes the match.`, "win");
    return;
  }
  state.phase = "SHOWDOWN";
  state.actor_seat = null;
}

function continueMatch(state: MatchState): void {
  if (state.phase !== "SHOWDOWN") throw new Error("The next deal is not ready.");
  state.dealer_button_index = (state.dealer_button_index + 1) % state.players.length;
  state.deal_number += 1;
  state.showdown = null;
  state.match_winner_seat = null;
  dealSetup(state);
}

function dealSetup(state: MatchState, preset?: DealPreset): void {
  const full = uniqueCards([
    ...state.full_deck,
    ...state.full_discard_pile,
    ...state.community_board,
    ...state.players.flatMap((player) => player.full_hand),
  ]);
  const reservedIds = new Set(
    state.players.flatMap((player) => player.reserve_vp_pile.map((card) => card.id)),
  );
  const mini = uniqueCards([
    ...state.mini_deck,
    ...state.mini_discard_pile,
    ...state.players.flatMap((player) => [
      ...player.mini_hand,
      ...player.active_bid_cards.filter((card): card is Card => card !== null),
    ]),
  ]).filter((card) => !reservedIds.has(card.id));

  if (full.length === 0) full.push(...buildFullDeck());
  if (mini.length === 0 && reservedIds.size === 0) {
    mini.push(...buildMiniDeck(1));
    if (state.mini_decks_used === 2) mini.push(...buildMiniDeck(2));
  }
  if (preset?.reserves) {
    for (let seat = 0; seat < state.players.length; seat++) {
      for (const id of preset.reserves[seat] ?? []) {
        const index = mini.findIndex((card) => card.id === id);
        if (index < 0) throw new Error(`Preset reserve card ${id} is missing.`);
        const [card] = mini.splice(index, 1);
        card!.visibility = "OWNER_ONLY";
        state.players[seat]!.reserve_vp_pile.push(card!);
      }
    }
  }
  const reserveCount = state.players.reduce((sum, player) => sum + player.reserve_vp_pile.length, 0);
  if (full.length !== 52) throw new Error(`Deal setup found ${full.length} full cards.`);
  if (mini.length + reserveCount !== state.mini_decks_used * 52) {
    throw new Error(`Deal setup found ${mini.length} mini cards and ${reserveCount} in vaults.`);
  }

  for (const player of state.players) {
    player.full_hand = [];
    player.mini_hand = [];
    player.active_bid_cards = [null, null];
    player.bid_sources = [null, null];
  }
  for (const card of full) card.visibility = "HIDDEN";
  for (const card of mini) card.visibility = "HIDDEN";
  state.rng = shuffleInPlace(full, state.rng);
  state.rng = shuffleInPlace(mini, state.rng);
  state.full_deck = full;
  state.mini_deck = mini;
  state.full_discard_pile = [];
  state.mini_discard_pile = [];
  state.community_board = [];
  state.last_bid = [];
  state.last_swap = null;
  state.round_winner_seat = null;
  state.bid_tie = false;
  state.showdown = null;
  state.current_round = 1;
  if (state.config.mulligan === "per_deal") {
    for (const player of state.players) player.has_used_mulligan = false;
  }

  const takeFull = (id?: string) => takeById(state.full_deck, id);
  const takeMini = (id?: string) => takeById(state.mini_deck, id);
  for (let index = 0; index < 5; index++) {
    const card = takeFull(preset?.board?.[index]);
    card.visibility = "HIDDEN";
    state.community_board.push(card);
  }
  const order = seatOrder(state.dealer_button_index, state.players.length);
  for (let round = 0; round < 2; round++) {
    for (const seat of order) {
      const card = takeFull(preset?.holes?.[seat]?.[round]);
      card.visibility = "OWNER_ONLY";
      state.players[seat]!.full_hand.push(card);
    }
  }
  const miniCounts = miniDealCounts(state);
  for (let round = 0; round < Math.max(...miniCounts); round++) {
    for (const seat of order) {
      if (round >= miniCounts[seat]!) continue;
      const card = takeMini(preset?.minis?.[seat]?.[round]);
      card.visibility = "OWNER_ONLY";
      state.players[seat]!.mini_hand.push(card);
    }
  }
  const short = state.players.filter((player) => player.mini_hand.length < 7);
  if (short.length > 0) {
    log(
      state,
      `The mini shoe is short. ${short.map((player) => `${player.name} is dealt ${player.mini_hand.length}`).join(", ")}.`,
    );
  }
  if (state.action_log.length === 0) {
    log(state, `Match starts. First vault to ${state.vp_target} cards wins.`);
  }
  log(
    state,
    `Deal ${state.deal_number}. Dealer button is on ${state.players[state.dealer_button_index]!.name}.`,
  );
  enterMulligan(state);
}

function enterMulligan(state: MatchState): void {
  state.phase = "MULLIGAN";
  state.last_bid = [];
  state.last_swap = null;
  state.commits_locked = state.players.map(() => false);
  state.discards_locked = state.players.map(() => false);
  state.pending_discards = state.players.map(() => null);
  state.actor_seat = nextMulliganSeat(state, null);
  if (state.actor_seat === null) startBlind(state);
}

function startBlind(state: MatchState): void {
  state.phase = "BLIND";
  state.actor_seat = seatOrder(state.dealer_button_index, state.players.length)[0] ?? null;
}

function miniDealCounts(state: MatchState): number[] {
  const available = state.mini_deck.length;
  const counts = state.players.map((player) => Math.min(7, Math.max(0, 6 - player.reserve_vp_pile.length)));
  const minimum = counts.reduce((sum, count) => sum + count, 0);
  if (available < minimum) {
    throw new Error("Not enough mini cards left to cover six bids at this table.");
  }
  let extra = available - minimum;
  const order = seatOrder(state.dealer_button_index, state.players.length);
  for (const seat of order) {
    while (extra > 0 && counts[seat]! < 7) {
      counts[seat] = counts[seat]! + 1;
      extra -= 1;
    }
  }
  return counts;
}

function nextMulliganSeat(state: MatchState, afterSeat: number | null): number | null {
  if (state.config.mulligan === "none") return null;
  const order = seatOrder(state.dealer_button_index, state.players.length);
  const start = afterSeat === null ? 0 : order.indexOf(afterSeat) + 1;
  for (let index = start; index < order.length; index++) {
    const seat = order[index]!;
    if (canMulligan(state.players[seat]!, state.current_round)) return seat;
  }
  return null;
}

function takeMini(player: PlayerState, cardId: string): { card: Card; source: BidSource } {
  const handIndex = player.mini_hand.findIndex((card) => card.id === cardId);
  if (handIndex >= 0) {
    const [card] = player.mini_hand.splice(handIndex, 1);
    return { card: card!, source: "HAND" };
  }
  const vaultIndex = player.reserve_vp_pile.findIndex((card) => card.id === cardId);
  if (vaultIndex >= 0) {
    const [card] = player.reserve_vp_pile.splice(vaultIndex, 1);
    return { card: card!, source: "RESERVE" };
  }
  throw new Error("That mini card is not in your hand or vault.");
}

function takeById(deck: Card[], id?: string): Card {
  if (!id) {
    const card = deck.pop();
    if (!card) throw new Error("The deck ran out.");
    return card;
  }
  const index = deck.findIndex((card) => card.id === id);
  if (index < 0) throw new Error(`Preset card ${id} is not in the deck.`);
  const [card] = deck.splice(index, 1);
  return card!;
}

function seatPlayer(state: MatchState, seat: number): PlayerState {
  const player = state.players[seat];
  if (!player) throw new Error("That seat is empty.");
  return player;
}

function assertPhase(state: MatchState, phase: Phase): void {
  if (state.phase !== phase) throw new Error(`The table is in ${state.phase}, not ${phase}.`);
}

function drawUnit(state: MatchState): number {
  const next = nextRandom(state.rng);
  state.rng = next.seed;
  return next.value;
}

function log(state: MatchState, text: string, tone: LogEntry["tone"] = "info"): void {
  state.log_seq += 1;
  state.action_log.push({ id: state.log_seq, text, tone });
  if (state.action_log.length > 300) state.action_log.splice(0, state.action_log.length - 300);
}
