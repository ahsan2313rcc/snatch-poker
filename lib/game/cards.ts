import type { Card, Suit } from "@/lib/game/types";

export const SUITS: Suit[] = ["SPADES", "HEARTS", "CLUBS", "DIAMONDS"];
export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;

export const SUIT_RANK: Record<Suit, number> = {
  SPADES: 4,
  HEARTS: 3,
  CLUBS: 2,
  DIAMONDS: 1,
};

const SUIT_CODE: Record<Suit, string> = {
  SPADES: "S",
  HEARTS: "H",
  CLUBS: "C",
  DIAMONDS: "D",
};

const SUIT_SYMBOL: Record<Suit, string> = {
  SPADES: "♠",
  HEARTS: "♥",
  CLUBS: "♣",
  DIAMONDS: "♦",
};

const RANK_WORD: Record<number, string> = {
  14: "Ace",
  13: "King",
  12: "Queen",
  11: "Jack",
  10: "Ten",
  9: "Nine",
  8: "Eight",
  7: "Seven",
  6: "Six",
  5: "Five",
  4: "Four",
  3: "Three",
  2: "Two",
};

const RANK_PLURAL: Record<number, string> = {
  14: "Aces",
  13: "Kings",
  12: "Queens",
  11: "Jacks",
  10: "Tens",
  9: "Nines",
  8: "Eights",
  7: "Sevens",
  6: "Sixes",
  5: "Fives",
  4: "Fours",
  3: "Threes",
  2: "Twos",
};

export function rankCode(rank: number): string {
  if (rank === 14) return "A";
  if (rank === 13) return "K";
  if (rank === 12) return "Q";
  if (rank === 11) return "J";
  if (rank === 10) return "10";
  return String(rank);
}

export function rankWord(rank: number): string {
  return RANK_WORD[rank] ?? String(rank);
}

export function rankPlural(rank: number): string {
  return RANK_PLURAL[rank] ?? String(rank);
}

export function suitWord(suit: Suit): string {
  if (suit === "SPADES") return "spades";
  if (suit === "HEARTS") return "hearts";
  if (suit === "CLUBS") return "clubs";
  return "diamonds";
}

export function cardLabel(card: Card): string {
  return `${rankCode(card.rank)}${SUIT_SYMBOL[card.suit]}`;
}

export function cardName(card: Card): string {
  return `${rankWord(card.rank)} of ${suitWord(card.suit)}`;
}

export function isRed(suit: Suit): boolean {
  return suit === "HEARTS" || suit === "DIAMONDS";
}

function makeCard(
  deck: "FULL" | "MINI",
  rank: number,
  suit: Suit,
  miniDeck?: 1 | 2,
): Card {
  const code = `${rankCode(rank)}${SUIT_CODE[suit]}`;
  if (deck === "FULL") {
    return {
      id: `full_${code}`,
      deck_type: "FULL",
      rank,
      suit,
      visibility: "HIDDEN",
    };
  }
  return {
    id: `mini_${miniDeck}_${code}`,
    deck_type: "MINI",
    rank,
    suit,
    visibility: "HIDDEN",
    mini_deck: miniDeck,
  };
}

export function buildFullDeck(): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) cards.push(makeCard("FULL", rank, suit));
  }
  return cards;
}

export function buildMiniDeck(index: 1 | 2): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) cards.push(makeCard("MINI", rank, suit, index));
  }
  return cards;
}

export function nextRandom(seed: number): { value: number; seed: number } {
  const a = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, seed: a >>> 0 };
}

export function shuffleInPlace<T>(items: T[], seed: number): number {
  let s = seed >>> 0;
  for (let i = items.length - 1; i > 0; i--) {
    const next = nextRandom(s);
    s = next.seed;
    const j = Math.floor(next.value * (i + 1));
    const tmp = items[i];
    items[i] = items[j]!;
    items[j] = tmp!;
  }
  return s;
}

export function tableScale(playerCount: number): { vpTarget: number; miniDecks: 1 } {
  if (playerCount <= 3) return { vpTarget: 5, miniDecks: 1 };
  return { vpTarget: 3, miniDecks: 1 };
}

/** Two to four seats get one mulligan for the whole match. Five to seven get none. */
export function resolvedMulligan(playerCount: number, _choice: "per_match" | "per_deal" | "none"): "per_match" | "per_deal" | "none" {
  if (playerCount >= 5) return "none";
  return "per_match";
}

export function roundName(round: number): string {
  if (round === 1) return "Flop";
  if (round === 2) return "Turn";
  if (round === 3) return "River";
  return "Showdown";
}

export function displaySort(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => b.rank - a.rank || SUIT_RANK[b.suit] - SUIT_RANK[a.suit]);
}

export function uniqueCards(cards: Card[]): Card[] {
  const seen = new Set<string>();
  const out: Card[] = [];
  for (const card of cards) {
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    out.push(card);
  }
  return out;
}
