"use client";

import { useEffect, useState } from "react";
import { Lobby } from "@/components/game/lobby";
import { TableScreen } from "@/components/game/table-screen";
import { progressAi } from "@/lib/game/ai";
import { createMatch } from "@/lib/game/engine";
import type { MatchState, Phase } from "@/lib/game/types";

export function GameApp() {
  const [match, setMatch] = useState<MatchState | null>(null);

  useEffect(() => {
    if (!match) return;
    const timer = window.setTimeout(() => {
      setMatch((current) => {
        if (!current) return current;
        const next = progressAi(current);
        return next ?? current;
      });
    }, delayFor(match));
    return () => window.clearTimeout(timer);
  }, [match]);

  if (!match) {
    return (
      <Lobby
        onStart={({ name, players, mulligan }) => {
          setMatch(
            createMatch({
              player_count: players,
              human_name: name,
              human_seat: 0,
              mulligan,
              seed: Math.floor(Math.random() * 1_000_000_000),
            }),
          );
        }}
      />
    );
  }

  return <TableScreen state={match} onChange={setMatch} onLeave={() => setMatch(null)} />;
}

function delayFor(state: MatchState): number {
  const pace: Partial<Record<Phase, number>> = {
    REVEAL: 900,
    FLIP: 1200,
    RESOLVE: 1700,
    MULLIGAN: 650,
    BLIND: 700,
    HIJACK: 800,
    COMMIT: 450,
    DISCARD: 450,
  };
  return pace[state.phase] ?? 500;
}
