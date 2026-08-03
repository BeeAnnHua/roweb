#!/usr/bin/env python3
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"js/data_bundle.js"
entries={}
for source in sorted(list((ROOT/"data").rglob("*.json"))+list((ROOT/"assets").rglob("*.json"))):
    rel=source.relative_to(ROOT).as_posix()
    if rel.startswith("assets/skill_effects/v92/"):
        continue
    if rel == "data/newcomer_support_build_audit.json":
        continue
    entries[rel]=json.loads(source.read_text(encoding="utf-8-sig"))
OUT.write_text("window.RO_WEB_DATA = "+json.dumps(entries,ensure_ascii=False,separators=(",",":"))+";\n",encoding="utf-8")
print(json.dumps({"version":"0.9.83A","entries":len(entries),"bytes":OUT.stat().st_size},ensure_ascii=False))
