"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BOT_NAMES } from "@/lib/game/engine";
import { resolvedMulligan, tableScale } from "@/lib/game/cards";
import type { MulliganRule } from "@/lib/game/types";
import { RulesDialog } from "@/components/game/rules-dialog";

export function Lobby({
  onStart,
}: {
  onStart: (options: { name: string; players: number; mulligan: MulliganRule }) => void;
}) {
  const [name, setName] = useState("Ahasan");
  const [players, setPlayers] = useState(3);
  const [mulligan, setMulligan] = useState<MulliganRule>("per_match");
  const scale = tableScale(players);
  const partners = BOT_NAMES.slice(0, players - 1);
  return (
    <main className="mx-auto flex min-h-full w-full max-w-6xl flex-1 flex-col justify-center px-4 py-10 sm:px-8">
      <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="text-xs tracking-[0.28em] text-[#e4c576] uppercase">Two decks, one board</p>
          <h1 className="font-heading mt-3 text-5xl leading-none text-[#f6f1e7] sm:text-7xl">Hold&apos;em Hijack</h1>
          <p className="mt-4 max-w-xl text-lg leading-8 text-[#d9d0c2]">
            Bid with mini cards for the right to rewrite the community board, then take the showdown
            with whatever hole cards you kept. The winner banks the rest of their mini hand as vault
            points.
          </p>
          <ol className="mt-8 grid gap-3 sm:grid-cols-2">
            {STEPS.map((step) => (
              <li key={step.title} className="rounded-2xl border border-[#e4c576]/15 bg-[#10241c]/80 p-4">
                <p className="text-xs tracking-[0.18em] text-[#e4c576] uppercase">{step.kicker}</p>
                <h2 className="font-heading mt-1 text-xl text-[#f6f1e7]">{step.title}</h2>
                <p className="mt-1 text-sm leading-6 text-[#c9bfae]">{step.copy}</p>
              </li>
            ))}
          </ol>
        </div>
        <form
          className="rounded-[1.6rem] border border-[#e4c576]/25 bg-[#0d1f19] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-7"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            onStart({ name: name.trim(), players, mulligan: resolvedMulligan(players, mulligan) });
          }}
        >
          <h2 className="font-heading text-2xl text-[#f6f1e7]">Sit down</h2>
          <label className="mt-5 block text-sm text-[#c9bfae]" htmlFor="player-name">
            Your name
          </label>
          <Input
            id="player-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={18}
            className="mt-2 h-11 border-[#e4c576]/30 bg-[#07140f] text-[#f6f1e7]"
            required
          />
          <p className="mt-5 text-sm text-[#c9bfae]">Seats</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[2, 3, 4, 5, 6, 7].map((count) => (
              <Button
                key={count}
                type="button"
                variant={players === count ? "default" : "outline"}
                className={
                  players === count
                    ? "h-10 min-w-10 bg-[#e4c576] text-[#1a1206] hover:bg-[#f0d48a]"
                    : "h-10 min-w-10 border-[#e4c576]/30 bg-transparent text-[#f6f1e7]"
                }
                onClick={() => setPlayers(count)}
                aria-pressed={players === count}
              >
                {count}
              </Button>
            ))}
          </div>
          <p className="mt-3 text-sm leading-6 text-[#d9d0c2]">
            With {partners.join(", ")}. First vault to {scale.vpTarget} cards. One mini deck in the shoe.
          </p>
          <p className="mt-5 text-sm text-[#c9bfae]">Mulligan</p>
          {players <= 3 ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={mulligan === "per_match" ? "default" : "outline"}
                className={choiceClass(mulligan === "per_match")}
                onClick={() => setMulligan("per_match")}
                aria-pressed={mulligan === "per_match"}
              >
                Once a match
              </Button>
              <Button
                type="button"
                variant={mulligan === "per_deal" ? "default" : "outline"}
                className={choiceClass(mulligan === "per_deal")}
                onClick={() => setMulligan("per_deal")}
                aria-pressed={mulligan === "per_deal"}
              >
                Once a deal
              </Button>
            </div>
          ) : (
            <p className="mt-2 text-sm leading-6 text-[#d9d0c2]">
              {players === 4
                ? "Four seats get one mulligan for the match."
                : "Five, six, and seven seats play with no mulligan."}
            </p>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button type="submit" className="h-11 bg-[#e4c576] px-5 text-base text-[#1a1206] hover:bg-[#f0d48a]" data-testid="start-match">
              Deal the match
            </Button>
            <RulesDialog />
          </div>
        </form>
      </div>
    </main>
  );
}

function choiceClass(active: boolean): string {
  return active
    ? "h-10 bg-[#e4c576] text-[#1a1206] hover:bg-[#f0d48a]"
    : "h-10 border-[#e4c576]/30 bg-transparent text-[#f6f1e7]";
}

const STEPS = [
  { kicker: "01", title: "Blind", copy: "One mini card face up, in turn, before the street is flipped." },
  { kicker: "02", title: "Commit", copy: "A second mini card, face down, revealed with the rest of the table." },
  { kicker: "03", title: "Hijack", copy: "Best bid swaps a hole card with the board. A tie swaps nobody." },
  { kicker: "04", title: "Bank", copy: "Showdown winner vaults the mini cards they did not spend." },
];
