import { describe, expect, it } from "vitest";
import { CATEGORY, bestHand, compareHands, compareShowdown, holeTiebreak, scoreFive } from "@/lib/game/evaluator";
import type { Card, Suit } from "@/lib/game/types";

function card(id: string, rank: number, suit: Suit, deck: Card["deck_type"] = "FULL"): Card {
  return { id, deck_type: deck, rank, suit, visibility: "PUBLIC", mini_deck: deck === "MINI" ? 1 : undefined };
}

describe("poker evaluation", () => {
  it("names the standard ladder and the wheel", () => {
    const royal = scoreFive([
      card("a", 14, "SPADES"),
      card("k", 13, "SPADES"),
      card("q", 12, "SPADES"),
      card("j", 11, "SPADES"),
      card("t", 10, "SPADES"),
    ]);
    expect(royal.name).toBe("Royal Flush");
    expect(royal.category).toBe(CATEGORY.STRAIGHT_FLUSH);

    const wheel = scoreFive([
      card("a", 14, "HEARTS"),
      card("2", 2, "CLUBS"),
      card("3", 3, "DIAMONDS"),
      card("4", 4, "SPADES"),
      card("5", 5, "HEARTS"),
    ]);
    expect(wheel.category).toBe(CATEGORY.STRAIGHT);
    expect(wheel.tiebreak).toEqual([5]);

    const six = scoreFive([
      card("6", 6, "HEARTS"),
      card("2", 2, "CLUBS"),
      card("3", 3, "DIAMONDS"),
      card("4", 4, "SPADES"),
      card("5", 5, "HEARTS"),
    ]);
    expect(compareHands(six, wheel)).toBeGreaterThan(0);
  });

  it("lets duplicate rank and suit count as a pair, a flush, and five of a kind", () => {
    const pairedKings = scoreFive([
      card("full_KS", 13, "SPADES", "FULL"),
      card("mini_KS", 13, "SPADES", "MINI"),
      card("2", 2, "HEARTS"),
      card("5", 5, "CLUBS"),
      card("9", 9, "DIAMONDS"),
    ]);
    expect(pairedKings.category).toBe(CATEGORY.PAIR);
    expect(pairedKings.tiebreak[0]).toBe(13);

    const flush = scoreFive([
      card("full_AS", 14, "SPADES", "FULL"),
      card("mini_AS", 14, "SPADES", "MINI"),
      card("k", 13, "SPADES"),
      card("7", 7, "SPADES"),
      card("4", 4, "SPADES"),
    ]);
    expect(flush.category).toBe(CATEGORY.FLUSH);
    expect(flush.tiebreak.slice(0, 2)).toEqual([14, 14]);

    const five = scoreFive([
      card("k1", 13, "SPADES"),
      card("k2", 13, "HEARTS"),
      card("k3", 13, "CLUBS"),
      card("k4", 13, "DIAMONDS"),
      card("k5", 13, "SPADES", "MINI"),
    ]);
    expect(five.category).toBe(CATEGORY.FIVE);
    expect(compareHands(five, flush)).toBeGreaterThan(0);
    expect(compareHands(five, scoreFive([
      card("a", 14, "HEARTS"),
      card("k", 13, "HEARTS"),
      card("q", 12, "HEARTS"),
      card("j", 11, "HEARTS"),
      card("t", 10, "HEARTS"),
    ]))).toBeGreaterThan(0);
  });

  it("picks the best five from a seven-card pool", () => {
    const hand = bestHand([
      card("as", 14, "SPADES"),
      card("ah", 14, "HEARTS"),
      card("ad", 14, "DIAMONDS"),
      card("ks", 13, "SPADES"),
      card("kh", 13, "HEARTS"),
      card("2c", 2, "CLUBS"),
      card("3d", 3, "DIAMONDS"),
    ]);
    expect(hand.category).toBe(CATEGORY.FULL_HOUSE);
    expect(hand.tiebreak).toEqual([14, 13]);
  });

  it("breaks a showdown tie on the highest hole card, then suit", () => {
    const shared = scoreFive([
      card("as", 14, "SPADES"),
      card("ks", 13, "SPADES"),
      card("qs", 12, "SPADES"),
      card("js", 11, "SPADES"),
      card("ts", 10, "SPADES"),
    ]);
    const clubs = holeTiebreak([card("9c", 9, "CLUBS"), card("8d", 8, "DIAMONDS")]);
    const spades = holeTiebreak([card("9s", 9, "SPADES"), card("2c", 2, "CLUBS")]);
    const ace = holeTiebreak([card("ad", 14, "DIAMONDS"), card("3c", 3, "CLUBS")]);
    expect(compareShowdown({ hand: shared, hole_tiebreak: spades }, { hand: shared, hole_tiebreak: clubs })).toBeGreaterThan(0);
    expect(compareShowdown({ hand: shared, hole_tiebreak: ace }, { hand: shared, hole_tiebreak: spades })).toBeGreaterThan(0);
    expect(spades).toEqual([9, 4]);
    expect(clubs).toEqual([9, 2]);
  });
});
