import { describe, expect, it } from "vitest";
import { decide, progressAi, runBots, unknownFullCards } from "@/lib/game/ai";
import { auditCards, createMatch } from "@/lib/game/engine";
import type { MatchState } from "@/lib/game/types";

function reachCommit(seed: number): MatchState {
  let state = createMatch({
    player_count: 2,
    human_name: "Ahasan",
    human_seat: -1,
    mulligan: "per_match",
    seed,
  });
  for (let step = 0; step < 40 && state.phase !== "COMMIT"; step++) {
    const next = progressAi(state);
    if (!next || next.error) throw new Error(next?.error ?? "stuck");
    state = next;
  }
  if (state.phase !== "COMMIT") throw new Error(`Stopped in ${state.phase}`);
  return state;
}

describe("bots", () => {
  it("treats hidden board cards and opponent holes as unknown", () => {
    const state = reachCommit(5);
    const unknown = new Set(unknownFullCards(state, 1).map((card) => card.id));
    const hidden = state.community_board.filter((card) => card.visibility !== "PUBLIC");
    expect(hidden.length).toBeGreaterThan(0);
    for (const card of hidden) expect(unknown.has(card.id)).toBe(true);
    for (const card of state.players[1]!.full_hand) expect(unknown.has(card.id)).toBe(false);
    for (const card of state.players[0]!.full_hand) expect(unknown.has(card.id)).toBe(true);
    const publicCount = state.community_board.filter((card) => card.visibility === "PUBLIC").length;
    expect(unknown.size).toBe(52 - publicCount - state.players[1]!.full_hand.length);
  });

  it("does not change a commit when hidden cards are rewritten", () => {
    const state = reachCommit(8);
    const original = decide(state, 1);
    const mutated = structuredClone(state);
    const deckCard = mutated.full_deck[0]!;
    const hole = mutated.players[0]!.full_hand[0]!;
    mutated.players[0]!.full_hand[0] = deckCard;
    mutated.full_deck[0] = hole;
    for (const card of mutated.community_board) {
      if (card.visibility !== "PUBLIC") card.rank = card.rank === 14 ? 2 : card.rank + 1;
    }
    for (const card of mutated.players[0]!.mini_hand) card.rank = 2;
    for (const card of mutated.players[0]!.full_hand) card.suit = "DIAMONDS";
    expect(decide(mutated, 1)).toEqual(original);
  });

  it("plays two, four, six, and seven-handed matches to a vault win", () => {
    for (const playerCount of [2, 4, 6, 7]) {
      const start = Date.now();
      let state = createMatch({
        player_count: playerCount,
        human_name: "Ahasan",
        human_seat: -1,
        mulligan: "per_match",
        seed: 3 + playerCount,
      });
      let steps = 0;
      while (state.phase !== "MATCH_OVER") {
        const next = progressAi(state);
        if (!next || next.error) throw new Error(next?.error ?? `stuck in ${state.phase}`);
        if (steps % 25 === 0) expect(auditCards(next)).toEqual([]);
        state = next;
        steps += 1;
        if (steps > 6000) throw new Error("too long");
      }
      const winner = state.players[state.match_winner_seat!]!;
      expect(winner.reserve_vp_pile.length).toBeGreaterThanOrEqual(state.vp_target);
      expect(auditCards(state)).toEqual([]);
      expect(Date.now() - start).toBeLessThan(20000);
      expect(runBots(state).phase).toBe("MATCH_OVER");
    }
  });
});
