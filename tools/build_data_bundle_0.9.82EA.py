#!/usr/bin/env python3
from pathlib import Path
import json

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'js/data_bundle.js'
entries={}
# Only package JSON that the game may load at runtime. Generated audits under
# tools/docs are intentionally excluded so verification reports cannot make the
# runtime bundle self-invalidating.
runtime_json = sorted(list((ROOT/'data').rglob('*.json')) + list((ROOT/'assets').rglob('*.json')))
for p in runtime_json:
    rel=p.relative_to(ROOT).as_posix()
    entries[rel]=json.loads(p.read_text(encoding='utf-8-sig'))
text='window.RO_WEB_DATA = '+json.dumps(entries,ensure_ascii=False,separators=(',',':'))+';\n'
OUT.write_text(text,encoding='utf-8')
print(json.dumps({'version':'0.9.82EA','entries':len(entries),'bytes':OUT.stat().st_size},ensure_ascii=False))
