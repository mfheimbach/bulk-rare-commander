"""Build userscript/bulk-rare-commander.user.js from data/banlist.json.

Usage: python scripts/build_userscript.py [version]
Mid-season additions live in banlist["added"] (list of {oracle_id, slug, name, date, reason})
and are merged into the ban list here.
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
ban = json.loads((ROOT / "data/banlist.json").read_text())
version = sys.argv[1] if len(sys.argv) > 1 else "1.0.0"

ids = set(ban["oracle_ids"])
slugs = set(ban["slugs"])
for a in ban.get("added", []):
    if a.get("oracle_id"):
        ids.add(a["oracle_id"])
    if a.get("slug"):
        slugs.add(a["slug"])

tpl = (ROOT / "userscript/template.user.js").read_text()
js = (tpl.replace("__IDS__", json.dumps(sorted(ids)))
         .replace("__SLUGS__", json.dumps(sorted(slugs)))
         .replace("__DATE__", ban["snapshot"])
         .replace("__CUTOFF__", str(ban["cutoff_rank"]))
         .replace("__N__", str(len(ids)))
         .replace("__VERSION__", version))
out = ROOT / "userscript/bulk-rare-commander.user.js"
out.write_text(js)
print(f"{out.name}: {len(ids)} banned cards, version {version}")
