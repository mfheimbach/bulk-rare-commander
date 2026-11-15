# Bulk Rare Commander

An anti-meta Commander variant: normal Commander rules, minus the most-played cards.

## Rules (draft)

- **Ban list:** the top 10% of Commander-legal cards by Scryfall's EDHREC rank, frozen at each snapshot (every 6 months).
- **Current snapshot:** 2026-11-15 — 3,264 cards banned (EDHREC rank ≤ 3,275).
- Anything not on the list is legal, including new releases.
- New cards: mid-season additions by inclusion rate are being worked out (see `tracker/`).

## Userscript

`userscript/bulk-rare-commander.user.js` greys out or hides banned cards on Scryfall, EDHREC (incl. combos), Moxfield and TappedOut. Install with Tampermonkey or Violentmonkey; it updates itself from this repo. Toggle with the floating button or Alt+B (greyed → hidden → shown).

Rebuild after changing `data/banlist.json`:

```
python scripts/build_userscript.py   # version = build date, e.g. 2026.11.15
```

## Tracker

`tracker/fetch_daily.py` runs daily via GitHub Actions until `TRACK_UNTIL` and appends EDHREC deck counts (`num_decks`, `potential_decks`, `inclusion`) for the top 30 new cards of six recent sets (`tracker/tracked_cards.csv`) to `tracker/daily.csv`. Purpose: find the earliest point after release where inclusion rate is a stable signal.
