import { describe, expect, it } from "vitest";
import { apply, auditCards, canMulligan, createMatch, drawMiniCards } from "@/lib/game/engine";
import type { Action, Card, MatchConfig, MatchState, PlayerState } from "@/lib/game/types";

const config = (overrides: Partial<MatchConfig> = {}): MatchConfig => ({
  player_count: 2,
  human_name: "Ahasan",
  human_seat: 0,
  mulligan: "per_match",
  seed: 11,
  ...overrides,
});

function act(state: MatchState, action: Action): MatchState {
  const next = apply(state, action);
  if (next.error) throw new Error(next.error);
  return next;
}

function lowest(cards: Card[]): Card {
  return [...cards].sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id))[0]!;
}

function playCheapDeal(state: MatchState, options?: { mulliganSeat?: number; spendReserve?: boolean }): MatchState {
  let current = state;
  const startVault = current.players.map((player) => player.reserve_vp_pile.length);
  const spent = current.players.map(() => 0);
  const mulliganed = current.players.map(() => false);
  while (current.phase !== "SHOWDOWN" && current.phase !== "MATCH_OVER") {
    const phase = current.phase;
    if (phase === "MULLIGAN") {
      const seat = current.actor_seat!;
      const use = options?.mulliganSeat === seat && canMulligan(current.players[seat]!, current.current_round);
      if (use) mulliganed[seat] = true;
      current = act(current, use ? { type: "MULLIGAN", seat } : { type: "DECLINE_MULLIGAN", seat });
    } else if (phase === "BLIND" || phase === "COMMIT") {
      const seat = phase === "BLIND" ? current.actor_seat! : current.players.findIndex((_, index) => !current.commits_locked[index]);
      const player = current.players[seat]!;
      const reserve = options?.spendReserve && player.reserve_vp_pile.length > 0 ? player.reserve_vp_pile[0] : undefined;
      const card = reserve ?? lowest(player.mini_hand);
      if (reserve && card.id === reserve.id) spent[seat] = (spent[seat] ?? 0) + 1;
      current = act(current, phase === "BLIND" ? { type: "BLIND", seat, card_id: card.id } : { type: "COMMIT", seat, card_id: card.id });
    } else if (phase === "REVEAL" || phase === "FLIP" || phase === "RESOLVE") {
      current = act(current, { type: "ADVANCE" });
    } else if (phase === "HIJACK") {
      current = act(current, { type: "HIJACK_PASS", seat: current.actor_seat! });
    } else if (phase === "DISCARD") {
      const seat = current.players.findIndex((_, index) => !current.discards_locked[index]);
      const card = lowest(current.players[seat]!.full_hand);
      current = act(current, { type: "DISCARD", seat, card_id: card.id });
    } else if (phase === "SHOWDOWN_CALL") {
      current = act(current, { type: "START_SHOWDOWN" });
    } else {
      throw new Error(`Unhandled phase ${phase}`);
    }
    expect(auditCards(current)).toEqual([]);
  }
  const showdown = current.showdown;
  expect(showdown).not.toBeNull();
  const winners = new Set(showdown!.winner_seats);
  expect(winners.has(showdown!.winner_seat)).toBe(true);
  for (let seat = 0; seat < current.players.length; seat++) {
    const banked = winners.has(seat) ? 1 + (spent[seat] ?? 0) - (mulliganed[seat] ? 1 : 0) : 0;
    if (seat === showdown!.winner_seat) expect(showdown!.banked).toBe(banked);
    expect(showdown!.vp_after[seat]).toBe((startVault[seat] ?? 0) - (spent[seat] ?? 0) + banked);
  }
  return current;
}

function player(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: "p",
    name: "P",
    is_human: true,
    seat_index: 0,
    full_hand: [],
    mini_hand: [],
    reserve_vp_pile: [],
    has_used_mulligan: false,
    active_bid_cards: [null, null],
    bid_sources: [null, null],
    ...overrides,
  };
}

describe("match flow", () => {
  it("rejects tables outside 2 to 7", () => {
    expect(() => createMatch(config({ player_count: 1 }))).toThrow(/2 to 7/);
    expect(() => createMatch(config({ player_count: 8 }))).toThrow(/2 to 7/);
  });

  it("scales decks, the victory target, and the mulligan", () => {
    const three = createMatch(config({ player_count: 3, mulligan: "per_deal" }));
    expect(three.vp_target).toBe(5);
    expect(three.mini_decks_used).toBe(1);
    expect(three.config.mulligan).toBe("per_match");
    const four = createMatch(config({ player_count: 4, mulligan: "per_deal" }));
    expect(four.vp_target).toBe(3);
    expect(four.mini_decks_used).toBe(1);
    expect(four.config.mulligan).toBe("per_match");
    expect(four.phase).toBe("MULLIGAN");
    const six = createMatch(config({ player_count: 6, human_seat: 0, mulligan: "per_match" }));
    expect(six.vp_target).toBe(3);
    expect(six.mini_decks_used).toBe(1);
    expect(six.config.mulligan).toBe("none");
    expect(six.phase).toBe("BLIND");
    expect(auditCards(six)).toEqual([]);
    const seven = createMatch(config({ player_count: 7, human_seat: 0 }));
    expect(seven.vp_target).toBe(3);
    expect(seven.mini_decks_used).toBe(1);
    expect(seven.phase).toBe("BLIND");
    expect(seven.players.every((player) => player.mini_hand.length === 7)).toBe(true);
    expect(auditCards(seven)).toEqual([]);
    const blocked = apply(seven, { type: "MULLIGAN", seat: 0 });
    expect(blocked.error).toMatch(/does not play a mulligan/);
  });

  it("deals a short mini shoe once vaults consume the single deck", () => {
    const ids = ["A", "K", "Q", "J", "10", "9", "8"].flatMap((rank) =>
      ["S", "H"].map((suit) => `mini_1_${rank}${suit}`),
    );
    const reserves = Array.from({ length: 7 }, (_, seat) => [ids[seat * 2]!, ids[seat * 2 + 1]!]);
    const match = createMatch(config({ player_count: 7, human_seat: 0, seed: 4 }), { reserves, button: 0 });
    expect(match.players.every((player) => player.reserve_vp_pile.length === 2)).toBe(true);
    expect(match.players.every((player) => player.mini_hand.length + player.reserve_vp_pile.length >= 6)).toBe(true);
    expect(match.players.reduce((sum, player) => sum + player.mini_hand.length, 0)).toBe(52 - 14);
    expect(match.players[1]!.mini_hand.length).toBe(7);
    expect(match.players.some((player) => player.mini_hand.length < 7)).toBe(true);
    expect(auditCards(match)).toEqual([]);
  });

  it("uses the spec card ids", () => {
    const match = createMatch(config());
    const ids = [
      ...match.full_deck,
      ...match.community_board,
      ...match.players.flatMap((seat) => seat.full_hand),
    ].map((card) => card.id);
    expect(ids).toContain("full_AS");
    expect(ids).toContain("full_10H");
    const minis = match.players.flatMap((seat) => seat.mini_hand).map((card) => card.id);
    expect(minis.some((id) => id.startsWith("mini_1_"))).toBe(true);
  });

  it("keeps vault cards out of the deal and out of a mulligan", () => {
    const match = createMatch(config(), { reserves: [["mini_1_AS"], []], button: 0 });
    expect(match.players[0]!.reserve_vp_pile.map((card) => card.id)).toEqual(["mini_1_AS"]);
    expect(match.mini_deck.some((card) => card.id === "mini_1_AS")).toBe(false);
    expect(match.players[0]!.mini_hand).toHaveLength(7);
    let current = match;
    while (current.phase === "MULLIGAN") {
      const seat = current.actor_seat!;
      current = act(current, seat === 0 ? { type: "MULLIGAN", seat } : { type: "DECLINE_MULLIGAN", seat });
    }
    expect(current.players[0]!.reserve_vp_pile.map((card) => card.id)).toEqual(["mini_1_AS"]);
    expect(current.players[0]!.has_used_mulligan).toBe(true);
    expect(current.players[0]!.mini_hand).toHaveLength(6);
  });

  it("reshuffles the mini discard when a draw empties the deck", () => {
    const match = createMatch(config());
    const kept = match.mini_deck[match.mini_deck.length - 1]!;
    match.mini_discard_pile = match.mini_deck.splice(0, match.mini_deck.length - 1);
    const drawn = drawMiniCards(match, 3);
    expect(drawn).toHaveLength(3);
    expect(drawn[0]!.id).toBe(kept.id);
    expect(drawn.slice(1).every((card) => match.mini_discard_pile.every((left) => left.id !== card.id))).toBe(true);
    match.mini_discard_pile.push(...drawn);
    expect(auditCards(match)).toEqual([]);
  });

  it("enforces the mulligan card-count guardrail", () => {
    const cards = (count: number) => Array.from({ length: count }, (_, index) => ({
      id: `m${index}`,
      deck_type: "MINI" as const,
      rank: 2,
      suit: "CLUBS" as const,
      visibility: "OWNER_ONLY" as const,
    }));
    expect(canMulligan(player({ mini_hand: cards(7) }), 1)).toBe(true);
    expect(canMulligan(player({ mini_hand: cards(7), has_used_mulligan: true }), 1)).toBe(false);
    expect(canMulligan(player({ mini_hand: cards(3), reserve_vp_pile: cards(3) }), 1)).toBe(false);
    expect(canMulligan(player({ mini_hand: cards(3), reserve_vp_pile: cards(4) }), 1)).toBe(true);
    expect(canMulligan(player({ mini_hand: cards(2) }), 3)).toBe(false);
    expect(canMulligan(player({ mini_hand: cards(3) }), 3)).toBe(true);
  });

  it("rotates the button after each street and again before the next deal", () => {
    let match = createMatch(config(), { button: 0 });
    const seen: number[] = [];
    while (match.phase !== "SHOWDOWN") {
      if (match.phase === "BLIND" && match.actor_seat === (match.dealer_button_index + 1) % 2) {
        seen.push(match.dealer_button_index);
      }
      match = playOne(match);
    }
    expect(seen).toEqual([0, 1, 0]);
    expect(match.dealer_button_index).toBe(0);
    match = act(match, { type: "CONTINUE" });
    expect(match.deal_number).toBe(2);
    expect(match.dealer_button_index).toBe(1);
  });

  it("pays the showdown winner exactly one net vault card when nobody mulligans or risks the vault", () => {
    const match = playCheapDeal(createMatch(config(), { button: 0 }));
    const showdown = match.showdown!;
    expect(showdown.vp_after[showdown.winner_seat]).toBe(1);
    expect(showdown.vp_after[1 - showdown.winner_seat]).toBe(0);
    expect(match.players[showdown.winner_seat]!.reserve_vp_pile).toHaveLength(1);
    const next = act(match, { type: "CONTINUE" });
    const banked = match.players[showdown.winner_seat]!.reserve_vp_pile[0]!.id;
    expect(next.mini_deck.some((card) => card.id === banked)).toBe(false);
    expect(next.players[showdown.winner_seat]!.reserve_vp_pile.map((card) => card.id)).toContain(banked);
  });

  it("replaces spent vault cards when the showdown is won and drops them when it is lost", () => {
    const first = playCheapDeal(createMatch(config({ seed: 21 }), { button: 0 }));
    const winner = first.showdown!.winner_seat;
    const second = playCheapDeal(act(first, { type: "CONTINUE" }), { spendReserve: true });
    const showdown = second.showdown!;
    if (showdown.winner_seats.includes(winner)) expect(showdown.vp_after[winner]).toBe(2);
    else expect(showdown.vp_after[winner]).toBe(0);
  });

  it("banks nothing extra for a winner who mulliganed", () => {
    const match = playCheapDeal(createMatch(config({ seed: 4 }), { button: 1 }), { mulliganSeat: 0 });
    expect(match.players[0]!.has_used_mulligan).toBe(true);
    const showdown = match.showdown!;
    if (showdown.winner_seat === 0) expect(showdown.banked).toBe(0);
    const next = act(match, { type: "CONTINUE" });
    expect(next.players[0]!.has_used_mulligan).toBe(true);
    const reset = createMatch(config({ mulligan: "per_deal", seed: 4 }), { button: 1 });
    expect(reset.config.mulligan).toBe("per_match");
    const once = playCheapDeal(reset, { mulliganSeat: 0 });
    const again = act(once, { type: "CONTINUE" });
    expect(again.players[0]!.has_used_mulligan).toBe(true);
  });

  it("gives the royal-flush bidder the hijack and logs the swap without the discard", () => {
    let match = createMatch(config(), {
      button: 1,
      board: ["full_AS", "full_KS", "full_QS", "full_2C", "full_3D"],
      holes: [
        ["full_9C", "full_8D"],
        ["full_4C", "full_5C"],
      ],
      minis: [
        ["mini_1_JS", "mini_1_10S", "mini_1_2H", "mini_1_3H", "mini_1_4H", "mini_1_5H", "mini_1_6H"],
        ["mini_1_7C", "mini_1_8C", "mini_1_9C", "mini_1_4D", "mini_1_5D", "mini_1_6D", "mini_1_7D"],
      ],
    });
    const play = (seat: number, id: string, phase: "BLIND" | "COMMIT") => {
      match = act(match, phase === "BLIND" ? { type: "BLIND", seat, card_id: id } : { type: "COMMIT", seat, card_id: id });
    };
    while (match.phase === "MULLIGAN") match = act(match, { type: "DECLINE_MULLIGAN", seat: match.actor_seat! });
    play(match.actor_seat!, match.actor_seat === 0 ? "mini_1_JS" : "mini_1_7C", "BLIND");
    play(match.actor_seat!, match.actor_seat === 0 ? "mini_1_JS" : "mini_1_7C", "BLIND");
    match = act(match, { type: "ADVANCE" });
    play(0, "mini_1_10S", "COMMIT");
    play(1, "mini_1_8C", "COMMIT");
    match = act(match, { type: "ADVANCE" });
    match = act(match, { type: "ADVANCE" });
    expect(match.phase).toBe("HIJACK");
    expect(match.round_winner_seat).toBe(0);
    expect(match.players[0]!.full_hand).toHaveLength(3);
    match = act(match, { type: "HIJACK_SWAP", seat: 0, hand_card_id: "full_9C", board_index: 2 });
    expect(match.community_board[2]!.id).toBe("full_9C");
    expect(match.players[0]!.full_hand.some((card) => card.id === "full_QS")).toBe(true);
    const text = match.action_log.map((entry) => entry.text).join("\n");
    expect(text).toContain("Q♠ leaves the board");
    expect(text).toContain("9♣ enters");
    expect(text).not.toMatch(/discarded Q/i);
    expect(match.phase).toBe("DISCARD");
  });

  it("calls a bid a draw when the five-card hands match, and swaps nobody", () => {
    let match = createMatch(config(), {
      button: 0,
      board: ["full_9D", "full_9C", "full_KS", "full_3D", "full_4D"],
      minis: [
        ["mini_1_9S", "mini_1_2S", "mini_1_3H", "mini_1_4H", "mini_1_5H", "mini_1_6H", "mini_1_7H"],
        ["mini_1_9H", "mini_1_2H", "mini_1_3C", "mini_1_4C", "mini_1_5C", "mini_1_6C", "mini_1_8C"],
      ],
    });
    while (match.phase === "MULLIGAN") match = act(match, { type: "DECLINE_MULLIGAN", seat: match.actor_seat! });
    const blind = (seat: number) => act(match, {
      type: "BLIND",
      seat,
      card_id: seat === 0 ? "mini_1_9S" : "mini_1_9H",
    });
    match = blind(match.actor_seat!);
    match = blind(match.actor_seat!);
    match = act(match, { type: "ADVANCE" });
    match = act(match, { type: "COMMIT", seat: 0, card_id: "mini_1_2S" });
    match = act(match, { type: "COMMIT", seat: 1, card_id: "mini_1_2H" });
    match = act(match, { type: "ADVANCE" });
    expect(match.bid_tie).toBe(true);
    match = act(match, { type: "ADVANCE" });
    expect(match.phase).toBe("DISCARD");
    expect(match.community_board.map((card) => card.id).slice(0, 3)).toEqual(["full_9D", "full_9C", "full_KS"]);
    expect(match.action_log.some((entry) => entry.text.includes("draw"))).toBe(true);
  });

  it("splits a showdown when the hole cards match and ignores suits", () => {
    const keep = [
      new Set(["full_9C", "full_8D"]),
      new Set(["full_9S", "full_8H"]),
    ];
    let match = createMatch(config(), {
      button: 0,
      board: ["full_AS", "full_KS", "full_QS", "full_JS", "full_10S"],
      holes: [
        ["full_9C", "full_8D"],
        ["full_9S", "full_8H"],
      ],
    });
    while (match.phase !== "SHOWDOWN" && match.phase !== "MATCH_OVER") {
      if (match.phase === "MULLIGAN") match = act(match, { type: "DECLINE_MULLIGAN", seat: match.actor_seat! });
      else if (match.phase === "BLIND") {
        const seat = match.actor_seat!;
        match = act(match, { type: "BLIND", seat, card_id: lowest(match.players[seat]!.mini_hand).id });
      } else if (match.phase === "COMMIT") {
        const seat = match.players.findIndex((_, index) => !match.commits_locked[index]);
        match = act(match, { type: "COMMIT", seat, card_id: lowest(match.players[seat]!.mini_hand).id });
      } else if (match.phase === "REVEAL" || match.phase === "FLIP" || match.phase === "RESOLVE") {
        match = act(match, { type: "ADVANCE" });
      } else if (match.phase === "HIJACK") match = act(match, { type: "HIJACK_PASS", seat: match.actor_seat! });
      else if (match.phase === "DISCARD") {
        const seat = match.players.findIndex((_, index) => !match.discards_locked[index]);
        const drop = match.players[seat]!.full_hand.find((card) => !keep[seat]!.has(card.id));
        match = act(match, { type: "DISCARD", seat, card_id: drop!.id });
      } else if (match.phase === "SHOWDOWN_CALL") match = act(match, { type: "START_SHOWDOWN" });
    }
    expect(match.showdown!.winner_seats.sort()).toEqual([0, 1]);
    expect(match.showdown!.poker_tie).toBe(true);
    expect(match.players[0]!.reserve_vp_pile.length).toBeGreaterThan(0);
    expect(match.players[1]!.reserve_vp_pile.length).toBeGreaterThan(0);
    expect(match.players.every((seat) => seat.mini_hand.length === 0)).toBe(true);
  });

  it("lets the higher hole card win a tied board without using suits", () => {
    const keep = [
      new Set(["full_9C", "full_8D"]),
      new Set(["full_9S", "full_2C"]),
    ];
    let match = createMatch(config(), {
      button: 0,
      board: ["full_AS", "full_KS", "full_QS", "full_JS", "full_10S"],
      holes: [
        ["full_9C", "full_8D"],
        ["full_9S", "full_2C"],
      ],
    });
    while (match.phase !== "SHOWDOWN" && match.phase !== "MATCH_OVER") {
      if (match.phase === "MULLIGAN") match = act(match, { type: "DECLINE_MULLIGAN", seat: match.actor_seat! });
      else if (match.phase === "BLIND") {
        const seat = match.actor_seat!;
        match = act(match, { type: "BLIND", seat, card_id: lowest(match.players[seat]!.mini_hand).id });
      } else if (match.phase === "COMMIT") {
        const seat = match.players.findIndex((_, index) => !match.commits_locked[index]);
        match = act(match, { type: "COMMIT", seat, card_id: lowest(match.players[seat]!.mini_hand).id });
      } else if (match.phase === "REVEAL" || match.phase === "FLIP" || match.phase === "RESOLVE") {
        match = act(match, { type: "ADVANCE" });
      } else if (match.phase === "HIJACK") match = act(match, { type: "HIJACK_PASS", seat: match.actor_seat! });
      else if (match.phase === "DISCARD") {
        const seat = match.players.findIndex((_, index) => !match.discards_locked[index]);
        const drop = match.players[seat]!.full_hand.find((card) => !keep[seat]!.has(card.id));
        match = act(match, { type: "DISCARD", seat, card_id: drop!.id });
      } else if (match.phase === "SHOWDOWN_CALL") {
        expect(match.showdown).toBeNull();
        expect(match.players[0]!.full_hand[0]!.visibility).toBe("OWNER_ONLY");
        match = act(match, { type: "START_SHOWDOWN" });
      }
    }
    expect(match.showdown!.winner_seats).toEqual([0]);
    expect(match.showdown!.poker_tie).toBe(true);
    expect(match.community_board.map((card) => card.id)).toEqual(["full_AS", "full_KS", "full_QS", "full_JS", "full_10S"]);
    expect(match.players.every((seat) => seat.full_hand.every((card) => card.visibility === "PUBLIC"))).toBe(true);
  });

  it("ends the match once a vault reaches the target", () => {
    let match = createMatch(config({ player_count: 2, seed: 9 }));
    let guard = 0;
    while (match.phase !== "MATCH_OVER") {
      match = match.phase === "SHOWDOWN" ? act(match, { type: "CONTINUE" }) : playOne(match);
      guard += 1;
      if (guard > 4000) throw new Error("Match did not finish.");
    }
    const winner = match.players[match.match_winner_seat!]!;
    expect(winner.reserve_vp_pile.length).toBeGreaterThanOrEqual(match.vp_target);
    expect(auditCards(match)).toEqual([]);
  });
});

function playOne(state: MatchState): MatchState {
  if (state.phase === "MULLIGAN") return act(state, { type: "DECLINE_MULLIGAN", seat: state.actor_seat! });
  if (state.phase === "BLIND") {
    const seat = state.actor_seat!;
    return act(state, { type: "BLIND", seat, card_id: lowest(state.players[seat]!.mini_hand).id });
  }
  if (state.phase === "COMMIT") {
    const seat = state.players.findIndex((_, index) => !state.commits_locked[index]);
    return act(state, { type: "COMMIT", seat, card_id: lowest(state.players[seat]!.mini_hand).id });
  }
  if (state.phase === "REVEAL" || state.phase === "FLIP" || state.phase === "RESOLVE") return act(state, { type: "ADVANCE" });
  if (state.phase === "HIJACK") return act(state, { type: "HIJACK_PASS", seat: state.actor_seat! });
  if (state.phase === "DISCARD") {
    const seat = state.players.findIndex((_, index) => !state.discards_locked[index]);
    return act(state, { type: "DISCARD", seat, card_id: lowest(state.players[seat]!.full_hand).id });
  }
  if (state.phase === "SHOWDOWN_CALL") return act(state, { type: "START_SHOWDOWN" });
  throw new Error(`Cannot step ${state.phase}`);
}
