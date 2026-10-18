"use client";

import { Button } from "@/components/ui/button";
import { coachLine, heroCanAct, mulliganPreview } from "@/lib/game/view";
import type { MatchState } from "@/lib/game/types";

export function ActionBar({
  state,
  hero,
  selectedMini,
  selectedHole,
  selectedBoard,
  onMulligan,
  onDecline,
  onBid,
  onPass,
  onSwap,
  onDiscard,
  onContinue,
  onNewMatch,
}: {
  state: MatchState;
  hero: number;
  selectedMini: string | null;
  selectedHole: string | null;
  selectedBoard: number | null;
  onMulligan: () => void;
  onDecline: () => void;
  onBid: () => void;
  onPass: () => void;
  onSwap: () => void;
  onDiscard: () => void;
  onContinue: () => void;
  onNewMatch: () => void;
}) {
  const acting = heroCanAct(state, hero);
  const preview = state.phase === "MULLIGAN" && acting ? mulliganPreview(state, hero) : null;
  return (
    <div className="action-shell rounded-2xl border border-[#e4c576]/20 bg-[#0c1c17]/90 p-3 shadow-lg backdrop-blur-sm">
      <p className="text-sm leading-6 text-[#f6f1e7]" aria-live="polite">
        {coachLine(state, hero)}
      </p>
      {preview ? <p className="mt-1 text-xs leading-5 text-[#c9bfae]">{preview}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {state.phase === "MULLIGAN" && acting ? (
          <>
            <Button className="h-10 bg-[#e4c576] px-4 text-[#1a1206] hover:bg-[#f0d48a]" onClick={onMulligan}>
              Mulligan
            </Button>
            <Button variant="outline" className="h-10 border-[#e4c576]/40 bg-transparent text-[#f6f1e7]" onClick={onDecline}>
              Keep hand
            </Button>
          </>
        ) : null}
        {(state.phase === "BLIND" || state.phase === "COMMIT") && acting ? (
          <Button className="h-10 bg-[#e4c576] px-4 text-[#1a1206] hover:bg-[#f0d48a]" disabled={!selectedMini} onClick={onBid}>
            {state.phase === "BLIND" ? "Play face up" : "Lock face down"}
          </Button>
        ) : null}
        {state.phase === "HIJACK" && acting ? (
          <>
            <Button
              className="h-10 bg-[#e4c576] px-4 text-[#1a1206] hover:bg-[#f0d48a]"
              disabled={!selectedHole || selectedBoard === null}
              onClick={onSwap}
            >
              Swap with the board
            </Button>
            <Button variant="outline" className="h-10 border-[#e4c576]/40 bg-transparent text-[#f6f1e7]" onClick={onPass}>
              Pass
            </Button>
          </>
        ) : null}
        {state.phase === "DISCARD" && acting ? (
          <Button className="h-10 bg-[#e4c576] px-4 text-[#1a1206] hover:bg-[#f0d48a]" disabled={!selectedHole} onClick={onDiscard}>
            Discard face down
          </Button>
        ) : null}
        {state.phase === "SHOWDOWN" ? (
          <Button className="h-10 bg-[#e4c576] px-4 text-[#1a1206] hover:bg-[#f0d48a]" onClick={onContinue}>
            Deal the next hand
          </Button>
        ) : null}
        {state.phase === "MATCH_OVER" ? (
          <Button className="h-10 bg-[#e4c576] px-4 text-[#1a1206] hover:bg-[#f0d48a]" onClick={onNewMatch}>
            New match
          </Button>
        ) : null}
      </div>
    </div>
  );
}
