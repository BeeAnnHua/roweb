#!/usr/bin/env python3
"""Sync RO_WEB player-skill timing metadata from rAthena Renewal skill_db.yml.

Fields synchronized:
  CastTime -> castTime
  FixedCastTime -> fixedCastTime
  AfterCastActDelay -> afterCastActDelay
  AfterCastWalkDelay -> afterCastWalkDelay
  Cooldown -> cooldown
  CastTimeFlags -> castTimeFlags
  CastDelayFlags -> castDelayFlags

RO_WEB redesign exceptions are NOT encoded here. They must be explicit runtimeProfile
flags such as ignoreRaCooldown, so the source timing metadata stays auditable.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from typing import Any
import yaml

FIELD_MAP = {
    "CastTime": "castTime",
    "FixedCastTime": "fixedCastTime",
    "AfterCastActDelay": "afterCastActDelay",
    "AfterCastWalkDelay": "afterCastWalkDelay",
    "Cooldown": "cooldown",
    "CastTimeFlags": "castTimeFlags",
    "CastDelayFlags": "castDelayFlags",
}


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def write_json(path: Path, data: dict[str, Any]) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
        fh.write("\n")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ra-skill-db", required=True, type=Path)
    ap.add_argument("--core", action="append", required=True, type=Path)
    ap.add_argument("--report", required=True, type=Path)
    args = ap.parse_args()

    with args.ra_skill_db.open("r", encoding="utf-8") as fh:
        ra_doc = yaml.safe_load(fh)
    ra_rows = {int(row["Id"]): row for row in ra_doc.get("Body", []) if "Id" in row}

    summary = {
        "source": str(args.ra_skill_db),
        "fields": FIELD_MAP,
        "cores": [],
        "totalSkills": 0,
        "matchedRaSkills": 0,
        "missingRaSkills": [],
        "fieldSetCounts": {dst: 0 for dst in FIELD_MAP.values()},
        "fieldRemovedCounts": {dst: 0 for dst in FIELD_MAP.values()},
    }

    for core_path in args.core:
        doc = load_json(core_path)
        skills = doc.get("skills", {})
        core_result = {"path": str(core_path), "skills": len(skills), "matched": 0, "missing": 0}
        for sid_text, skill in skills.items():
            sid = int(skill.get("officialId", skill.get("id", sid_text)))
            summary["totalSkills"] += 1
            ra = ra_rows.get(sid)
            if ra is None:
                core_result["missing"] += 1
                summary["missingRaSkills"].append(sid)
                continue
            core_result["matched"] += 1
            summary["matchedRaSkills"] += 1
            for ra_key, web_key in FIELD_MAP.items():
                if ra_key in ra:
                    skill[web_key] = ra[ra_key]
                    summary["fieldSetCounts"][web_key] += 1
                elif web_key in skill:
                    del skill[web_key]
                    summary["fieldRemovedCounts"][web_key] += 1
            source = skill.setdefault("source", {})
            if isinstance(source, dict):
                source["timing"] = "rAthena db/re/skill_db.yml (2026-06-08 package)"
        doc["version"] = "0.9.82DX"
        write_json(core_path, doc)
        summary["cores"].append(core_result)

    summary["missingRaSkills"] = sorted(set(summary["missingRaSkills"]))
    summary["status"] = "PASS" if not summary["missingRaSkills"] else "PASS_WITH_NON_RA_SKILLS"
    args.report.parent.mkdir(parents=True, exist_ok=True)
    write_json(args.report, summary)
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
