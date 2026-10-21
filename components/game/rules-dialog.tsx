"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function RulesDialog({
  open,
  onOpenChange,
  trigger = true,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? (
        <DialogTrigger render={<Button variant="outline" className="border-[#e4c576]/40 bg-transparent text-[#f6f1e7]" />}>
          Rules
        </DialogTrigger>
      ) : null}
      <DialogContent className="max-h-[min(85vh,44rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl">How Hold&apos;em Hijack plays</DialogTitle>
          <DialogDescription>
            A Texas Hold&apos;em variant where mini cards bid for the right to rewrite the board.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm leading-6 text-[#d9d0c2]">
          <section>
            <h3 className="font-heading text-base text-[#f3e2b3]">Two decks</h3>
            <p>
              The full-size deck deals two hole cards and the five community cards. One mini deck is
              the bidding currency at every table size. Two or three players race to 5 vault cards.
              Four to seven players race to 3. If vault cards thin the shoe, the players left of the
              button are dealt a full mini hand first. Everyone else still receives enough to bid.
            </p>
          </section>
          <section>
            <h3 className="font-heading text-base text-[#f3e2b3]">A deal, three streets</h3>
            <p>Each player is dealt 7 mini cards. Flop, turn, and river each follow the same five steps.</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Mulligan. Two, three, and four players get one mulligan for the whole match. Five, six, and seven players do not mulligan. A mulligan swaps the mini hand for the same number of cards. The cards you give up go to the bottom of the deck. The vault is never part of it, and you may only do it if the hand plus the vault still covers two cards for every street left.</li>
              <li>Blind. In order from the left of the button, each player plays one mini card face up, from the hand or the vault.</li>
              <li>Reveal. The flop shows three cards, the turn one, the river one.</li>
              <li>Commit. Everyone locks a second mini card face down. They flip together.</li>
              <li>Resolve. Best five-card hand from your two mini cards plus the face-up board wins the street and may hijack. A tie means nobody swaps.</li>
            </ol>
          </section>
          <section>
            <h3 className="font-heading text-base text-[#f3e2b3]">The hijack</h3>
            <p>
              Everyone draws one full-size card, so each hand is briefly three cards. The bid winner
              may swap one hole card with a face-up board card, or pass. Then every player discards
              back to two hole cards, face down. The table is told which card left the board and which
              card entered it. It is not told whether the winner kept the card they took.
            </p>
          </section>
          <section>
            <h3 className="font-heading text-base text-[#f3e2b3]">Showdown and the vault</h3>
            <p>
              After the river, the table starts the final showdown. Mini cards stay hidden. Hole cards
              turn up. Best five from the two hole cards and the five board cards wins the
              deal and banks every mini card still in hand. Everyone else discards those leftovers.
              Cards already in a vault stay there. If the poker hands tie, the higher hole card wins.
              Suits never break that tie. When the hole cards are the same rank, every tied player
              wins and each one banks the mini cards still in hand.
            </p>
            <p className="mt-2">
              You must play six mini cards over a deal and you were dealt seven. Win the showdown and
              the vault grows by one, no matter how many vault cards you spent — those spent cards are
              replaced by whatever you held back. Lose, and every vault card you spent is gone. A
              mulligan redraws the same number, so it does not spend that extra card.
            </p>
          </section>
          <section>
            <h3 className="font-heading text-base text-[#f3e2b3]">Identical cards</h3>
            <p>
              Mini cards and the board come from different decks, so a hand can hold two ace of spades.
              They pair. They both count as spades in a flush. Five of a kind, possible only on a mini
              bid, ranks above a straight flush. During a bid, suits do not break ties: the same five
              ranks are a draw, and nobody hijacks. The button moves after the flop, after the turn,
              and again before the next deal.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
