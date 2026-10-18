# Hold'em Hijack

Hold'em Hijack is a Texas Hold'em variant for 2 to 7 players. A full-size deck deals hole cards and the community board. One mini deck is the currency you bid with. Across the flop, turn, and river, each player plays two mini cards. The best bid may swap one hole card with a face-up board card. At showdown, the winning poker hand banks every mini card still in hand as vault points.

This project is a complete table against bots: the rules engine, the vault economy, and a bot that sandbags hopeless bids, plays for a board-tie when its showdown hand is already made, bluffs a swap to strip a dangerous board card, and spends vault cards on the river only past a 65% swing or on match point.

## Play

```bash
npm install
npm run dev -- -p 4317
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317). Choose 2 to 7 seats. You play the bottom seat. The other seats are bots.

## Tests

```bash
npm test
```

The suite covers hand ranking (including duplicate cards and five of a kind), the mulligan guardrail, hijack privacy, bid ties, showdown suit breaks, the vault's +1 / −spent economy, and full bot matches at 2, 4, 6, and 7 seats.

## Rules, short version

- 2–3 players: one mini deck, first to 5 vault cards. Mulligan once a match, or once a deal.
- 4 players: one mini deck, first to 3, one mulligan for the match.
- 5–7 players: one mini deck, first to 3, no mulligan.
- Each deal deals 2 hole cards, 5 board cards face down, and up to 7 mini cards.
- Streets: mulligan when the table allows it, face-up blind, board reveal, face-down commit, then the bid.
- Bid ties swap nobody. Suits do not break a bid.
- The winner may hijack one face-up board card after everyone draws a third hole card. The discard back to two cards is face down, and the log does not name it.
- After the river, the table starts the final showdown. Mini cards stay hidden. Showdown uses both hole cards plus the board. A poker tie breaks on the highest hole card, then spades, hearts, clubs, diamonds.
- Winning the showdown banks the mini cards left in hand. Spending vault cards and then winning replaces them: net +1 if you did not mulligan. Losing the showdown drops every vault card you spent.
- The button moves after the flop, after the turn, and again before the next deal.

Five of a kind is enabled. It can only appear on a mini bid, when the board and the mini cards repeat a rank, and it ranks above a straight flush.
