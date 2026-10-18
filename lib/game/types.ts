export type Suit = "SPADES" | "HEARTS" | "CLUBS" | "DIAMONDS";
export type DeckType = "FULL" | "MINI";
export type Visibility = "HIDDEN" | "PUBLIC" | "OWNER_ONLY";
export type BidSource = "HAND" | "RESERVE";
export type MulliganRule = "per_match" | "per_deal" | "none";

export type Phase =
  | "MULLIGAN"
  | "BLIND"
  | "REVEAL"
  | "COMMIT"
  | "FLIP"
  | "RESOLVE"
  | "HIJACK"
  | "DISCARD"
  | "SHOWDOWN_CALL"
  | "SHOWDOWN"
  | "MATCH_OVER";

export interface Card {
  id: string;
  deck_type: DeckType;
  rank: number;
  suit: Suit;
  visibility: Visibility;
  mini_deck?: 1 | 2;
}

export interface PlayerState {
  id: string;
  name: string;
  is_human: boolean;
  seat_index: number;
  full_hand: Card[];
  mini_hand: Card[];
  reserve_vp_pile: Card[];
  has_used_mulligan: boolean;
  active_bid_cards: [Card | null, Card | null];
  bid_sources: [BidSource | null, BidSource | null];
}

export interface HandValue {
  category: number;
  tiebreak: number[];
  cards: Card[];
  name: string;
}

export interface BidSnapshot {
  seat: number;
  cards: [Card, Card];
  sources: [BidSource, BidSource];
  hand: HandValue;
}

export interface SwapSnapshot {
  seat: number;
  left_board: Card;
  entered_board: Card;
  board_index: number;
}

export interface ShowdownEntry {
  seat: number;
  hand: HandValue;
  hole_tiebreak: [number, number];
}

export interface ShowdownResult {
  winner_seat: number;
  entries: ShowdownEntry[];
  vp_before: number[];
  vp_after: number[];
  banked: number;
  poker_tie: boolean;
}

export interface LogEntry {
  id: number;
  text: string;
  tone: "info" | "win" | "warn" | "swap";
}

export interface MatchConfig {
  player_count: number;
  human_name: string;
  /** -1 deals an all-bot match. */
  human_seat: number;
  mulligan: MulliganRule;
  seed: number;
}

export interface DealPreset {
  button?: number;
  board?: string[];
  holes?: string[][];
  minis?: string[][];
  reserves?: string[][];
}

export interface MatchState {
  config: MatchConfig;
  players: PlayerState[];
  dealer_button_index: number;
  vp_target: number;
  mini_decks_used: 1 | 2;
  full_deck: Card[];
  full_discard_pile: Card[];
  mini_deck: Card[];
  mini_discard_pile: Card[];
  community_board: Card[];
  current_round: 1 | 2 | 3 | 4;
  phase: Phase;
  actor_seat: number | null;
  round_winner_seat: number | null;
  bid_tie: boolean;
  last_bid: BidSnapshot[];
  last_swap: SwapSnapshot | null;
  commits_locked: boolean[];
  discards_locked: boolean[];
  pending_discards: (string | null)[];
  showdown: ShowdownResult | null;
  match_winner_seat: number | null;
  deal_number: number;
  action_log: LogEntry[];
  log_seq: number;
  rng: number;
  error: string | null;
}

export type Action =
  | { type: "MULLIGAN"; seat: number }
  | { type: "DECLINE_MULLIGAN"; seat: number }
  | { type: "BLIND"; seat: number; card_id: string }
  | { type: "COMMIT"; seat: number; card_id: string }
  | { type: "ADVANCE" }
  | { type: "HIJACK_PASS"; seat: number }
  | { type: "HIJACK_SWAP"; seat: number; hand_card_id: string; board_index: number }
  | { type: "DISCARD"; seat: number; card_id: string }
  | { type: "START_SHOWDOWN" }
  | { type: "CONTINUE" };
