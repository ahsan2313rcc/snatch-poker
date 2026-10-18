import { cardLabel, roundName } from "@/lib/game/cards";
import { canMulligan } from "@/lib/game/engine";
import type { BidSource, Card, MatchState, Phase } from "@/lib/game/types";

export const SEAT_TINTS = ["#e4c576", "#8eb7ff", "#f0a3c2", "#8fd6a8", "#e7a15a", "#c7b3f5"];

export function heroSeat(state: MatchState): number {
  return state.players.find((player) => player.is_human)?.seat_index ?? 0;
}

export function phaseLabel(state: MatchState): string {
  const round = roundName(state.current_round);
  const step: Record<Phase, string> = {
    MULLIGAN: "Mulligan",
    BLIND: "The Blind",
    REVEAL: "The Reveal",
    COMMIT: "The Commit",
    FLIP: "Commits flip",
    RESOLVE: "Bid resolved",
    HIJACK: "The Hijack",
    DISCARD: "Discard",
    SHOWDOWN: "Showdown",
    MATCH_OVER: "Match over",
  };
  if (state.phase === "SHOWDOWN" || state.phase === "MATCH_OVER") return step[state.phase];
  return `${round} · ${step[state.phase]}`;
}

export function coachLine(state: MatchState, seat: number): string {
  const actor = state.actor_seat === null ? null : state.players[state.actor_seat];
  const mine = state.actor_seat === seat;
  switch (state.phase) {
    case "MULLIGAN":
      if (!mine) return `${actor?.name ?? "The table"} is in the mulligan window.`;
      return "Discard your mini hand and draw one fewer card, or keep it. One mulligan per match, and only if you can still bid twice in every remaining round.";
    case "BLIND":
      if (!mine) return `${actor?.name ?? "A player"} is choosing a face-up blind.`;
      return "Play one mini card face up, from your hand or your vault. A vault card is a victory point on the table.";
    case "REVEAL":
      return `Flipping the ${roundName(state.current_round).toLowerCase()}.`;
    case "COMMIT":
      if (state.commits_locked[seat]) return "Your commit is locked face down. The cards flip together.";
      return "Lock a second mini card face down. It meets the board at the same moment as everyone else's.";
    case "FLIP":
      return "Both bid cards are face up.";
    case "RESOLVE":
      if (state.bid_tie) return "The bid is a draw. The board stays where it is.";
      if (state.round_winner_seat === seat) return "You won the bid. You may hijack one face-up board card.";
      return `${state.players[state.round_winner_seat ?? 0]?.name ?? "The winner"} won the bid.`;
    case "HIJACK":
      if (!mine) return `${actor?.name ?? "The winner"} may swap a hole card with the board, or pass.`;
      return "Swap one of your three hole cards with a face-up board card, or pass. The card you give up becomes public. What you discard afterward stays secret.";
    case "DISCARD":
      if (state.discards_locked[seat]) return "Your discard is locked. The table throws away one hole card face down.";
      return "Discard one hole card face down. If you pulled a dangerous board card, you can throw that same card away and nobody sees it.";
    case "SHOWDOWN":
      return "Best five cards from your two hole cards and the board. The winner banks every mini card still in hand.";
    case "MATCH_OVER":
      return `${state.players[state.match_winner_seat ?? 0]?.name ?? "A player"} wins the match.`;
    default:
      return "";
  }
}

export function heroCanAct(state: MatchState, seat: number): boolean {
  if (state.phase === "MULLIGAN" || state.phase === "BLIND" || state.phase === "HIJACK") {
    return state.actor_seat === seat;
  }
  if (state.phase === "COMMIT") return !state.commits_locked[seat];
  if (state.phase === "DISCARD") return !state.discards_locked[seat];
  return false;
}

export function shownBid(state: MatchState, seat: number): {
  cards: [Card | null, Card | null];
  sources: [BidSource | null, BidSource | null];
  handName?: string;
} {
  if (
    state.last_bid.length > 0 &&
    (state.phase === "RESOLVE" || state.phase === "HIJACK" || state.phase === "DISCARD" || state.phase === "SHOWDOWN")
  ) {
    const row = state.last_bid.find((bid) => bid.seat === seat);
    if (row) return { cards: row.cards, sources: row.sources, handName: row.hand.name };
  }
  const player = state.players[seat];
  if (!player) return { cards: [null, null], sources: [null, null] };
  return { cards: player.active_bid_cards, sources: player.bid_sources };
}

export function cardIsOpen(card: Card, ownerSeat: number, viewerSeat: number): boolean {
  if (card.visibility === "PUBLIC") return true;
  return card.visibility === "OWNER_ONLY" && ownerSeat === viewerSeat;
}

export function opponentsFrom(state: MatchState, hero: number) {
  const seats = [];
  for (let step = 1; step < state.players.length; step++) {
    seats.push(state.players[(hero + step) % state.players.length]!);
  }
  return seats;
}

export const OPPONENT_LAYOUT: Record<number, Array<[string, string]>> = {
  1: [["50%", "16%"]],
  2: [["24%", "20%"], ["76%", "20%"]],
  3: [["14%", "36%"], ["50%", "12%"], ["86%", "36%"]],
  4: [["12%", "40%"], ["32%", "14%"], ["68%", "14%"], ["88%", "40%"]],
  5: [["10%", "42%"], ["26%", "14%"], ["50%", "8%"], ["74%", "14%"], ["90%", "42%"]],
};

export function mulliganPreview(state: MatchState, seat: number): string | null {
  const player = state.players[seat];
  if (!player || !canMulligan(player, state.current_round)) return null;
  const count = player.mini_hand.length;
  const need = 2 * (4 - state.current_round);
  return `Discard ${count}, draw ${count - 1}. You must still cover ${need} bids with the new hand plus your vault.`;
}

export function boardCaption(state: MatchState): string | null {
  if (!state.last_swap) return null;
  if (state.phase !== "DISCARD" && state.phase !== "HIJACK") return null;
  return `${cardLabel(state.last_swap.left_board)} left the board. ${cardLabel(state.last_swap.entered_board)} entered.`;
}
