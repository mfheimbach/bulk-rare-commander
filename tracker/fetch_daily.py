"""Daily snapshot of EDHREC deck counts for the tracked cards.

Reads tracker/tracked_cards.csv, fetches https://edhrec.com/cards/<slug>/charts for each card,
extracts the embedded {inclusion, numDecks, potentialDecks} record and appends one row per card
to tracker/daily.csv. Exits non-zero (-> failed workflow -> email) if EDHREC data can't be read.
"""
import csv
import datetime as dt
import gzip
import os
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent
TODAY = dt.date.today().isoformat()
END = os.environ.get("TRACK_UNTIL")  # e.g. 2026-12-20; after that the job does nothing
UA = {"User-Agent": "Mozilla/5.0 (bulk-rare-commander research; github.com/mfheimbach/bulk-rare-commander)",
      "Accept-Encoding": "gzip"}
REC = re.compile(r'"rec\\?":\{\\?"inclusion\\?":([0-9.eE-]+),\\?"numDecks\\?":(\d+),\\?"potentialDecks\\?":(\d+)')

if END and TODAY > END:
    print(f"Tracking ended {END}; nothing to do.")
    sys.exit(0)


def fetch(slug):
    url = f"https://edhrec.com/cards/{slug}/charts"
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                b = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    b = gzip.decompress(b)
                m = REC.search(b.decode("utf-8", "replace"))
                return m and (int(m.group(2)), int(m.group(3)), float(m.group(1)))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(3 + 5 * attempt)
        except Exception:
            time.sleep(3 + 5 * attempt)
    return None


daily = ROOT / "daily.csv"
done = set()
if daily.exists():
    with daily.open() as f:
        done = {(r["date"], r["slug"]) for r in csv.DictReader(f)}

cards = list(csv.DictReader((ROOT / "tracked_cards.csv").open()))
rows, failed = [], []
for c in cards:
    if (TODAY, c["slug"]) in done:
        continue
    res = fetch(c["slug"])
    if res is None:
        failed.append(c["name"])
    else:
        rows.append([TODAY, c["set"], c["slug"], res[0], res[1], round(res[2], 6)])
    time.sleep(0.5)

with daily.open("a", newline="") as f:
    csv.writer(f).writerows(rows)

print(f"{TODAY}: {len(rows)} rows written, {len(failed)} failed")
if failed:
    print("failed:", "; ".join(failed))
# loud failure: EDHREC layout change or blocking shows up as many misses
if cards and len(failed) > 0.2 * len(cards):
    sys.exit(f"Too many failures ({len(failed)}/{len(cards)}) - EDHREC page format changed or requests blocked.")
