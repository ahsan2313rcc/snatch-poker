import { rankPlural, rankWord } from "@/lib/game/cards";
import type { Card, HandValue } from "@/lib/game/types";

export const CATEGORY = {
  HIGH_CARD: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  TRIPS: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  QUADS: 7,
  STRAIGHT_FLUSH: 8,
  FIVE: 9,
} as const;

export const CATEGORY_NAME = [
  "High Card",
  "One Pair",
  "Two Pair",
  "Three of a Kind",
  "Straight",
  "Flush",
  "Full House",
  "Four of a Kind",
  "Straight Flush",
  "Five of a Kind",
] as const;

const STRAIGHTS: { mask: number; high: number }[] = [];
for (let high = 14; high >= 6; high--) {
  let mask = 0;
  for (let rank = high; rank > high - 5; rank--) mask |= 1 << rank;
  STRAIGHTS.push({ mask, high });
}
STRAIGHTS.push({
  mask: (1 << 14) | (1 << 5) | (1 << 4) | (1 << 3) | (1 << 2),
  high: 5,
});

function combos(n: number, k: number): number[][] {
  const out: number[][] = [];
  const cur: number[] = [];
  const walk = (start: number) => {
    if (cur.length === k) {
      out.push([...cur]);
      return;
    }
    for (let i = start; i < n; i++) {
      cur.push(i);
      walk(i + 1);
      cur.pop();
    }
  };
  walk(0);
  return out;
}

const FIVE_OF: Record<number, number[][]> = {
  5: combos(5, 5),
  6: combos(6, 5),
  7: combos(7, 5),
};

function straightHigh(mask: number): number | null {
  for (const straight of STRAIGHTS) {
    if ((mask & straight.mask) === straight.mask) return straight.high;
  }
  return null;
}

function countsOf(cards: Card[]): Uint8Array {
  const count = new Uint8Array(15);
  for (const card of cards) count[card.rank] += 1;
  return count;
}

export function scoreFive(cards: Card[]): HandValue {
  if (cards.length !== 5) {
    throw new Error(`A poker hand is 5 cards, received ${cards.length}.`);
  }
  const count = countsOf(cards);
  let mask = 0;
  let flush = true;
  const suit = cards[0]!.suit;
  for (const card of cards) {
    mask |= 1 << card.rank;
    if (card.suit !== suit) flush = false;
  }
  const straight = straightHigh(mask);

  for (let rank = 14; rank >= 2; rank--) {
    if (count[rank] === 5) {
      return hand(CATEGORY.FIVE, [rank], cards, `Five of a Kind, ${rankPlural(rank)}`);
    }
  }

  if (flush && straight) {
    const name =
      straight === 14 ? "Royal Flush" : `Straight Flush, ${rankWord(straight)} high`;
    return hand(CATEGORY.STRAIGHT_FLUSH, [straight], cards, name);
  }

  let quad = 0;
  let trip = 0;
  let pairHigh = 0;
  let pairLow = 0;
  const kick: number[] = [];
  for (let rank = 14; rank >= 2; rank--) {
    const n = count[rank] ?? 0;
    if (n === 4) quad = rank;
    else if (n === 3) trip = rank;
    else if (n === 2) {
      if (!pairHigh) pairHigh = rank;
      else pairLow = rank;
    } else if (n === 1) kick.push(rank);
  }

  if (quad) {
    return hand(
      CATEGORY.QUADS,
      [quad, kick[0] ?? 0],
      cards,
      `Four of a Kind, ${rankPlural(quad)}`,
    );
  }
  if (trip && pairHigh) {
    return hand(
      CATEGORY.FULL_HOUSE,
      [trip, pairHigh],
      cards,
      `Full House, ${rankPlural(trip)} full of ${rankPlural(pairHigh)}`,
    );
  }
  if (flush) {
    const ranks = ranksDesc(count);
    return hand(CATEGORY.FLUSH, ranks, cards, `Flush, ${rankWord(ranks[0] ?? 0)} high`);
  }
  if (straight) {
    const name = straight === 14 ? "Straight, Ace high" : `Straight, ${rankWord(straight)} high`;
    return hand(CATEGORY.STRAIGHT, [straight], cards, name);
  }
  if (trip) {
    return hand(CATEGORY.TRIPS, [trip, ...kick], cards, `Three of a Kind, ${rankPlural(trip)}`);
  }
  if (pairHigh && pairLow) {
    return hand(
      CATEGORY.TWO_PAIR,
      [pairHigh, pairLow, kick[0] ?? 0],
      cards,
      `Two Pair, ${rankPlural(pairHigh)} and ${rankPlural(pairLow)}`,
    );
  }
  if (pairHigh) {
    return hand(CATEGORY.PAIR, [pairHigh, ...kick], cards, `Pair of ${rankPlural(pairHigh)}`);
  }
  const ranks = ranksDesc(count);
  return hand(CATEGORY.HIGH_CARD, ranks, cards, `${rankWord(ranks[0] ?? 0)} high`);
}

function ranksDesc(count: Uint8Array): number[] {
  const ranks: number[] = [];
  for (let rank = 14; rank >= 2; rank--) {
    for (let n = 0; n < (count[rank] ?? 0); n++) ranks.push(rank);
  }
  return ranks;
}

function hand(category: number, tiebreak: number[], cards: Card[], name: string): HandValue {
  return { category, tiebreak, cards, name };
}

export function compareHands(a: HandValue, b: HandValue): number {
  if (a.category !== b.category) return a.category - b.category;
  const length = Math.max(a.tiebreak.length, b.tiebreak.length);
  for (let i = 0; i < length; i++) {
    const diff = (a.tiebreak[i] ?? 0) - (b.tiebreak[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function bestHand(cards: Card[]): HandValue {
  if (cards.length < 5) {
    throw new Error(`Need at least 5 cards to evaluate, received ${cards.length}.`);
  }
  const indexSets = FIVE_OF[cards.length] ?? combos(cards.length, 5);
  let best: HandValue | null = null;
  for (const indexes of indexSets) {
    const five = indexes.map((index) => cards[index]!);
    const scored = scoreFive(five);
    if (!best || compareHands(scored, best) > 0) best = scored;
  }
  if (!best) throw new Error("Could not score a hand.");
  return best;
}

/** Hole-card ranks, high to low. Suits are not part of a showdown. */
export function holeTiebreak(holes: Card[]): number[] {
  if (holes.length === 0) throw new Error("Showdown tiebreak needs hole cards.");
  return holes.map((card) => card.rank).sort((a, b) => b - a);
}

export function compareShowdown(
  a: { hand: HandValue; hole_tiebreak: number[] },
  b: { hand: HandValue; hole_tiebreak: number[] },
): number {
  const poker = compareHands(a.hand, b.hand);
  if (poker !== 0) return poker;
  const length = Math.max(a.hole_tiebreak.length, b.hole_tiebreak.length);
  for (let index = 0; index < length; index++) {
    const diff = (a.hole_tiebreak[index] ?? 0) - (b.hole_tiebreak[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
