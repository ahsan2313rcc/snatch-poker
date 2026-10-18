"use client";

import { useState } from "react";
import { ActionBar } from "@/components/game/action-bar";
import { ActionLog } from "@/components/game/action-log";
import { PlayingCard } from "@/components/game/playing-card";
import { RulesDialog } from "@/components/game/rules-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { displaySort, roundName } from "@/lib/game/cards";
import { apply } from "@/lib/game/engine";
import type { Action, MatchState, PlayerState } from "@/lib/game/types";
import {
  OPPONENT_LAYOUT,
  SEAT_TINTS,
  boardCaption,
  cardIsOpen,
  heroCanAct,
  heroSeat,
  opponentsFrom,
  phaseLabel,
  shownBid,
} from "@/lib/game/view";

export function TableScreen({
  state,
  onChange,
  onLeave,
}: {
  state: MatchState;
  onChange: (state: MatchState) => void;
  onLeave: () => void;
}) {
  const hero = heroSeat(state);
  const you = state.players[hero]!;
  const [selectedMini, setSelectedMini] = useState<string | null>(null);
  const [selectedHole, setSelectedHole] = useState<string | null>(null);
  const [selectedBoard, setSelectedBoard] = useState<number | null>(null);
  const [vaultHiddenKey, setVaultHiddenKey] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [winDismissed, setWinDismissed] = useState(false);
  const selectionKey = `${state.deal_number}:${state.current_round}:${state.phase}:${state.actor_seat}:${state.commits_locked[hero]}:${state.discards_locked[hero]}`;
  const [seenKey, setSeenKey] = useState(selectionKey);
  if (seenKey !== selectionKey) {
    setSeenKey(selectionKey);
    setSelectedMini(null);
    setSelectedHole(null);
    setSelectedBoard(null);
  }
  const bidding = state.phase === "BLIND" || state.phase === "COMMIT";
  const vaultKey = `${state.deal_number}-${state.current_round}-${state.phase}`;
  const showVault =
    vaultHiddenKey === "open" ||
    (bidding && heroCanAct(state, hero) && vaultHiddenKey !== vaultKey && you.reserve_vp_pile.length > 0);

  function send(action: Action) {
    onChange(apply(state, action));
  }

  const opponents = opponentsFrom(state, hero);
  const layout = OPPONENT_LAYOUT[opponents.length] ?? [];
  const caption = boardCaption(state);
  const miniSelectable = (state.phase === "BLIND" || state.phase === "COMMIT") && heroCanAct(state, hero);
  const holeSelectable = (state.phase === "HIJACK" || state.phase === "DISCARD") && heroCanAct(state, hero);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-[1400px] flex-1 flex-col px-3 py-3 sm:px-5">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[0.68rem] tracking-[0.22em] text-[#e4c576] uppercase">Deal {state.deal_number}</p>
          <h1 className="font-heading text-2xl text-[#f6f1e7] sm:text-3xl">{phaseLabel(state)}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RulesDialog />
          <Button variant="outline" className="border-[#e4c576]/30 bg-transparent text-[#f6f1e7] lg:hidden" onClick={() => setLogOpen(true)}>
            Log
          </Button>
          <Button variant="outline" className="border-[#e4c576]/30 bg-transparent text-[#f6f1e7]" onClick={() => setLeaveOpen(true)}>
            Leave table
          </Button>
        </div>
      </header>
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {state.players.map((player) => (
          <VaultRace key={player.id} player={player} target={state.vp_target} hero={player.seat_index === hero} />
        ))}
      </div>
      {state.error ? (
        <p role="alert" className="mb-3 rounded-xl border border-[#e7a15a]/50 bg-[#3a1c14] px-3 py-2 text-sm text-[#f6d7c8]">
          {state.error}
        </p>
      ) : null}
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="flex min-w-0 flex-col">
          <div className="table-rail rounded-[1.8rem] p-2 sm:p-3">
            <div className="felt relative min-h-[26rem] rounded-[1.4rem] sm:min-h-[30rem] lg:min-h-[34rem]">
              <div className="mb-5 flex gap-2 overflow-x-auto px-3 pt-3 pb-2 lg:hidden">
                {opponents.map((player) => (
                  <SeatPlate key={player.id} player={player} state={state} viewer={hero} />
                ))}
              </div>
              <div className="pointer-events-none absolute inset-0 hidden lg:block">
                {opponents.map((player, index) => {
                  const spot = layout[index];
                  if (!spot) return null;
                  return (
                    <div
                      key={player.id}
                      className="pointer-events-auto absolute"
                      style={{ left: spot[0], top: spot[1], transform: "translate(-50%, -50%)" }}
                    >
                      <SeatPlate player={player} state={state} viewer={hero} />
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-col items-center px-3 pt-1 pb-20 lg:absolute lg:top-1/2 lg:left-1/2 lg:w-full lg:-translate-x-1/2 lg:-translate-y-[46%] lg:px-2 lg:pt-0 lg:pb-0">
                <Board state={state} hero={hero} selectedBoard={selectedBoard} onSelectBoard={holeSelectable && state.phase === "HIJACK" ? setSelectedBoard : undefined} />
                {caption ? <p className="mt-2 text-center text-sm text-[#d7ecff]">{caption}</p> : null}
                <ResultStrip state={state} hero={hero} />
              </div>
            </div>
          </div>
          <div className="relative z-10 -mt-12 flex flex-col items-center">
            <div className="mb-2 flex items-center gap-2">
              {state.dealer_button_index === hero ? <span className="dealer-chip">D</span> : null}
              <span className="font-heading text-lg text-[#f6f1e7]">{you.name}</span>
              <Badge className="bg-[#e4c576] text-[#1a1206]">
                Vault {you.reserve_vp_pile.length}/{state.vp_target}
              </Badge>
            </div>
            <div className="flex gap-2">
              {you.full_hand.map((card) => (
                <PlayingCard
                  key={card.id}
                  card={card}
                  size="hole"
                  selected={selectedHole === card.id}
                  onClick={holeSelectable ? () => setSelectedHole((current) => (current === card.id ? null : card.id)) : undefined}
                />
              ))}
            </div>
            <HeroBids state={state} hero={hero} />
          </div>
          <div className="mt-4 grid items-start gap-3 lg:grid-cols-[14rem_minmax(0,1fr)]">
            <div className="rounded-2xl border border-[#e4c576]/25 bg-[#10241c] p-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-heading text-lg text-[#f3e2b3]">Vault</h2>
                <Button
                  variant="ghost"
                  className="h-7 text-[#f6f1e7]"
                  onClick={() => setVaultHiddenKey(showVault ? vaultKey : "open")}
                >
                  {showVault ? "Close" : "Open"}
                </Button>
              </div>
              <p className="text-xs leading-5 text-[#c9bfae]">
                {you.reserve_vp_pile.length === 0
                  ? "Win a showdown to bank the mini cards you held back."
                  : "Opponents see the count. You can spend these on a bid."}
              </p>
              {showVault ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {displaySort(you.reserve_vp_pile).map((card) => (
                    <PlayingCard
                      key={card.id}
                      card={card}
                      mini
                      size="mini"
                      source="RESERVE"
                      selected={selectedMini === card.id}
                      onClick={
                        miniSelectable
                          ? () => setSelectedMini((current) => (current === card.id ? null : card.id))
                          : undefined
                      }
                    />
                  ))}
                </div>
              ) : null}
            </div>
            <div>
              <div className="mb-2 flex items-baseline gap-3">
                <h2 className="font-heading text-lg text-[#f6f1e7]">Mini hand</h2>
                <span className="text-xs text-[#c9bfae]">{you.mini_hand.length} cards</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {you.mini_hand.length === 0 ? (
                  <p className="text-sm text-[#c9bfae]">No mini cards left in hand.</p>
                ) : (
                  displaySort(you.mini_hand).map((card) => (
                    <PlayingCard
                      key={card.id}
                      card={card}
                      mini
                      size="mini"
                      selected={selectedMini === card.id}
                      onClick={
                        miniSelectable
                          ? () => setSelectedMini((current) => (current === card.id ? null : card.id))
                          : undefined
                      }
                    />
                  ))
                )}
              </div>
              <div className="mt-3">
                <ActionBar
                  state={state}
                  hero={hero}
                  selectedMini={selectedMini}
                  selectedHole={selectedHole}
                  selectedBoard={selectedBoard}
                  onMulligan={() => send({ type: "MULLIGAN", seat: hero })}
                  onDecline={() => send({ type: "DECLINE_MULLIGAN", seat: hero })}
                  onBid={() => {
                    if (!selectedMini) return;
                    send(state.phase === "BLIND" ? { type: "BLIND", seat: hero, card_id: selectedMini } : { type: "COMMIT", seat: hero, card_id: selectedMini });
                  }}
                  onPass={() => send({ type: "HIJACK_PASS", seat: hero })}
                  onSwap={() => {
                    if (!selectedHole || selectedBoard === null) return;
                    send({ type: "HIJACK_SWAP", seat: hero, hand_card_id: selectedHole, board_index: selectedBoard });
                  }}
                  onDiscard={() => {
                    if (!selectedHole) return;
                    send({ type: "DISCARD", seat: hero, card_id: selectedHole });
                  }}
                  onContinue={() => send({ type: "CONTINUE" })}
                  onNewMatch={onLeave}
                />
              </div>
            </div>
          </div>
        </section>
        <aside className="hidden min-h-[28rem] flex-col overflow-hidden rounded-2xl border border-[#e4c576]/20 bg-[#0c1c17] lg:flex">
          <h2 className="font-heading border-b border-[#e4c576]/15 px-3 py-3 text-lg text-[#f3e2b3]">Table log</h2>
          <ActionLog entries={state.action_log} />
        </aside>
      </div>
      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent className="h-[70vh] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Table log</DialogTitle>
            <DialogDescription>Swaps name both cards. Discards stay face down.</DialogDescription>
          </DialogHeader>
          <ActionLog entries={state.action_log} className="h-[50vh]" />
        </DialogContent>
      </Dialog>
      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave this match?</DialogTitle>
            <DialogDescription>The current deal is only on this table. Leaving returns you to the lobby.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaveOpen(false)}>
              Stay
            </Button>
            <Button className="bg-[#e4c576] text-[#1a1206] hover:bg-[#f0d48a]" onClick={onLeave}>
              Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={state.phase === "MATCH_OVER" && !winDismissed} onOpenChange={(open) => setWinDismissed(!open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl">
              {state.players[state.match_winner_seat ?? 0]?.name} takes the match
            </DialogTitle>
            <DialogDescription>
              The vault reached {state.vp_target}. A winning showdown banks the mini cards that were held back.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-1 text-sm text-[#d9d0c2]">
            {state.players.map((player) => (
              <li key={player.id}>
                {player.name}: {player.reserve_vp_pile.length} vault cards
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWinDismissed(true)}>
              See the board
            </Button>
            <Button className="bg-[#e4c576] text-[#1a1206] hover:bg-[#f0d48a]" onClick={onLeave}>
              New match
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Board({
  state,
  hero,
  selectedBoard,
  onSelectBoard,
}: {
  state: MatchState;
  hero: number;
  selectedBoard: number | null;
  onSelectBoard?: (index: number) => void;
}) {
  return (
    <div className="inline-flex max-w-full flex-col">
      <div className="flex items-end justify-center gap-1.5 sm:gap-2">
        {state.community_board.map((card, index) => {
          const open = card.visibility === "PUBLIC";
          return (
            <PlayingCard
              key={card.id}
              card={open ? card : undefined}
              faceDown={!open}
              size="board"
              selected={selectedBoard === index}
              pulse={state.last_swap?.board_index === index && (state.phase === "DISCARD" || state.phase === "HIJACK")}
              onClick={onSelectBoard && open ? () => onSelectBoard(index) : undefined}
            />
          );
        })}
      </div>
      <div className="mt-1.5 grid grid-cols-5 gap-1.5 text-center text-[0.62rem] tracking-[0.16em] text-[#e4c576]/80 uppercase sm:gap-2">
        <span className="col-span-3">{roundName(1)}</span>
        <span>{roundName(2)}</span>
        <span>{roundName(3)}</span>
      </div>
      <span className="sr-only">Viewing as seat {hero}</span>
    </div>
  );
}

function ResultStrip({ state, hero }: { state: MatchState; hero: number }) {
  if (state.phase === "RESOLVE" || state.phase === "HIJACK" || state.phase === "DISCARD") {
    if (state.last_bid.length === 0) return null;
    return (
      <ul className="mt-3 flex max-w-full gap-2 overflow-x-auto px-2">
        {state.last_bid.map((bid) => (
          <li
            key={bid.seat}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs ${bid.seat === state.round_winner_seat ? "border-[#e4c576] text-[#f3e2b3]" : "border-white/10 text-[#d9d0c2]"}`}
          >
            {state.players[bid.seat]?.name}: {bid.hand.name}
          </li>
        ))}
      </ul>
    );
  }
  if ((state.phase === "SHOWDOWN" || state.phase === "MATCH_OVER") && state.showdown) {
    const showdown = state.showdown;
    return (
      <div className="mt-3 w-full max-w-xl rounded-2xl bg-[#06140f]/80 p-3 text-left">
        {showdown.poker_tie ? (
          <p className="mb-2 text-xs text-[#d7ecff]">Poker hands tied. Highest hole card wins, spades high.</p>
        ) : null}
        <ul className="space-y-1">
          {showdown.entries
            .slice()
            .sort((a, b) => Number(b.seat === showdown.winner_seat) - Number(a.seat === showdown.winner_seat))
            .map((entry) => {
              const delta = (showdown.vp_after[entry.seat] ?? 0) - (showdown.vp_before[entry.seat] ?? 0);
              const player = state.players[entry.seat]!;
              return (
                <li key={entry.seat} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className={entry.seat === showdown.winner_seat ? "text-[#f3e2b3]" : "text-[#d9d0c2]"}>
                    {player.name}
                    {entry.seat === hero ? " (you)" : ""} · {entry.hand.name}
                  </span>
                  <span className="text-[#e4c576]">
                    {delta > 0 ? `+${delta}` : delta} vault
                  </span>
                </li>
              );
            })}
        </ul>
      </div>
    );
  }
  return null;
}

function HeroBids({ state, hero }: { state: MatchState; hero: number }) {
  const bid = shownBid(state, hero);
  if (!bid.cards[0] && !bid.cards[1]) return null;
  return (
    <div className="mt-2 flex items-center gap-2">
      {bid.cards.map((card, index) =>
        card ? (
          <PlayingCard
            key={`${card.id}-${index}`}
            card={card}
            mini
            size="mini"
            faceDown={!cardIsOpen(card, hero, hero)}
            source={bid.sources[index]}
          />
        ) : (
          <span key={index} className="text-xs text-[#c9bfae]">
            Waiting
          </span>
        ),
      )}
      {bid.handName ? <span className="text-xs text-[#f3e2b3]">{bid.handName}</span> : null}
    </div>
  );
}

function SeatPlate({ player, state, viewer }: { player: PlayerState; state: MatchState; viewer: number }) {
  const bid = shownBid(state, player.seat_index);
  const turn =
    state.actor_seat === player.seat_index ||
    (state.phase === "COMMIT" && !state.commits_locked[player.seat_index]) ||
    (state.phase === "DISCARD" && !state.discards_locked[player.seat_index]) ||
    ((state.phase === "SHOWDOWN" || state.phase === "MATCH_OVER") && state.showdown?.winner_seat === player.seat_index);
  const matchPoint = player.reserve_vp_pile.length === state.vp_target - 1;
  return (
    <article
      className={`w-[9.5rem] rounded-2xl border bg-[#07140f]/85 p-2 backdrop-blur-sm ${turn ? "border-[#e4c576]" : "border-white/10"}`}
      style={{ boxShadow: turn ? `0 0 0 1px ${SEAT_TINTS[player.seat_index]}` : undefined }}
    >
      <div className="flex items-center justify-between gap-1">
        <h3 className="truncate text-sm text-[#f6f1e7]">{player.name}</h3>
        {state.dealer_button_index === player.seat_index ? <span className="dealer-chip">D</span> : null}
      </div>
      <p className="text-[0.68rem] text-[#c9bfae]">
        Vault {player.reserve_vp_pile.length}/{state.vp_target}
        {matchPoint ? " · match point" : ""} · {player.mini_hand.length} mini
      </p>
      <div className="mt-1 flex gap-1">
        {player.full_hand.map((card) => (
          <PlayingCard
            key={card.id}
            card={card}
            size="seat"
            faceDown={!cardIsOpen(card, player.seat_index, viewer)}
          />
        ))}
      </div>
      <div className="mt-1 flex min-h-8 gap-1">
        {bid.cards.map((card, index) =>
          card ? (
            <PlayingCard
              key={`${card.id}-${index}`}
              card={card}
              mini
              size="seat"
              faceDown={!cardIsOpen(card, player.seat_index, viewer)}
              source={bid.sources[index]}
            />
          ) : null,
        )}
      </div>
      {bid.handName ? <p className="truncate text-[0.65rem] text-[#f3e2b3]">{bid.handName}</p> : null}
    </article>
  );
}

function VaultRace({ player, target, hero }: { player: PlayerState; target: number; hero: boolean }) {
  const count = player.reserve_vp_pile.length;
  const width = Math.min(100, (count / target) * 100);
  return (
    <div className={`min-w-[8.5rem] flex-1 rounded-xl border px-2 py-1.5 ${hero ? "border-[#e4c576]/50 bg-[#163028]" : "border-white/10 bg-[#0c1c17]"}`}>
      <div className="flex items-baseline justify-between text-xs text-[#f6f1e7]">
        <span className="truncate">{player.name}</span>
        <span>
          {count}/{target}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/40">
        <div className="h-full rounded-full bg-[#e4c576]" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
