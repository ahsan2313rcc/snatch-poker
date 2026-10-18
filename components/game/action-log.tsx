"use client";

import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { LogEntry } from "@/lib/game/types";
import { cn } from "cn";

export function ActionLog({ entries, className }: { entries: LogEntry[]; className?: string }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [entries.length]);
  return (
    <ScrollArea className={cn("h-full min-h-0", className)}>
      <ol className="space-y-2 px-3 py-3" aria-label="Action log">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className={cn(
              "text-[0.82rem] leading-5",
              entry.tone === "win" && "text-[#f0d48a]",
              entry.tone === "warn" && "text-[#f0b4a2]",
              entry.tone === "swap" && "text-[#d7ecff]",
              entry.tone === "info" && "text-[#d9d0c2]",
            )}
          >
            {entry.text}
          </li>
        ))}
        <div ref={endRef} />
      </ol>
    </ScrollArea>
  );
}
