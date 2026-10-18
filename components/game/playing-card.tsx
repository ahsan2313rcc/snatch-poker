"use client";

import { cardName, isRed, rankCode } from "@/lib/game/cards";
import type { Card } from "@/lib/game/types";
import { cn } from "cn";

const SIZE = {
  hole: "h-[6.15rem] w-[4.35rem] sm:h-[7.15rem] sm:w-[5.05rem]",
  board: "h-[5.15rem] w-[3.6rem] sm:h-[6.45rem] sm:w-[4.55rem]",
  mini: "h-[3.7rem] w-[2.65rem] sm:h-[4.35rem] sm:w-[3.1rem]",
  seat: "h-[3.15rem] w-[2.25rem]",
} as const;

export function PlayingCard({
  card,
  size = "mini",
  faceDown = false,
  selected = false,
  disabled = false,
  mini = false,
  source,
  onClick,
  pulse = false,
  label,
}: {
  card?: Card | null;
  size?: keyof typeof SIZE;
  faceDown?: boolean;
  selected?: boolean;
  disabled?: boolean;
  mini?: boolean;
  source?: "HAND" | "RESERVE" | null;
  onClick?: () => void;
  pulse?: boolean;
  label?: string;
}) {
  const open = Boolean(card) && !faceDown;
  const interactive = Boolean(onClick) && !disabled;
  const Tag = interactive ? "button" : "div";
  const red = open && card ? isRed(card.suit) : false;
  const suit = card ? symbol(card.suit) : "";
  const rank = card ? rankCode(card.rank) : "";
  return (
    <Tag
      type={interactive ? "button" : undefined}
      onClick={interactive ? onClick : undefined}
      disabled={interactive ? disabled : undefined}
      aria-pressed={interactive ? selected : undefined}
      aria-label={
        open && card
          ? `${cardName(card)}${mini ? ", mini deck" : ""}${source === "RESERVE" ? ", from the vault" : ""}`
          : label
            ? `${label}, face down`
            : "Face-down card"
      }
      className={cn(
        "pcard relative inline-flex shrink-0 items-center justify-center rounded-lg select-none",
        SIZE[size],
        open ? (red ? "pcard-red" : "pcard-ink") : "pcard-back",
        mini && open && "pcard-mini",
        !open && mini && "pcard-back-mini",
        !open && !mini && !label && "pcard-back-full",
        label && !open && "pcard-slot",
        selected && "pcard-selected",
        pulse && "pcard-pulse",
        interactive && "cursor-pointer",
        disabled && interactive && "cursor-not-allowed opacity-50",
      )}
    >
      {open && card ? (
        <>
          <span className="absolute top-1 left-1.5 text-[0.78rem] leading-none font-semibold sm:text-sm">
            {rank}
            <span className="block text-[0.7rem]">{suit}</span>
          </span>
          <span className={cn("text-2xl sm:text-3xl", size === "mini" || size === "seat" ? "text-xl" : "")}>{suit}</span>
          <span className="absolute right-1.5 bottom-1 rotate-180 text-[0.78rem] leading-none font-semibold sm:text-sm">
            {rank}
            <span className="block text-[0.7rem]">{suit}</span>
          </span>
          {mini ? <span className="mini-mark">Mini</span> : null}
          {source === "RESERVE" ? <span className="vault-mark">Vault</span> : null}
        </>
      ) : label ? (
        <span className="px-1 text-center text-[0.62rem] tracking-[0.14em] text-[#e4c576]/80 uppercase">{label}</span>
      ) : (
        <span className={cn("back-diamond", mini && "back-diamond-mini")} />
      )}
    </Tag>
  );
}

function symbol(suit: Card["suit"]): string {
  if (suit === "SPADES") return "♠";
  if (suit === "HEARTS") return "♥";
  if (suit === "CLUBS") return "♣";
  return "♦";
}
