#!/usr/bin/env python3
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"js/data_bundle.js"
entries={}
for p in sorted(list((ROOT/"data").rglob("*.json"))+list((ROOT/"assets").rglob("*.json"))):
    entries[p.relative_to(ROOT).as_posix()]=json.loads(p.read_text(encoding="utf-8-sig"))
OUT.write_text("window.RO_WEB_DATA = "+json.dumps(entries,ensure_ascii=False,separators=(",",":"))+";\n",encoding="utf-8")
print(json.dumps({"version":"0.9.82HG","entries":len(entries),"bytes":OUT.stat().st_size},ensure_ascii=False))
