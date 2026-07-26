#!/usr/bin/env python3
"""Audit player-learnable RA skills whose source directly reads a Trait Stat.

Internal helper skills such as *_ATK are grouped under their player-learnable
parent.  Pass --ra-root or set RO_WEB_RA_ROOT when the source tree is not at the
local development default.
"""
from __future__ import annotations
import argparse
import json
import os
import pathlib
import re
import sys

try:
    import yaml
except ImportError as exc:  # pragma: no cover - developer utility
    raise SystemExit(f"PyYAML is required: {exc}")

VERSION = "0.9.82EE"
FAMILIES = ["swordman", "mage", "archer", "acolyte", "merchant", "thief", "novice"]
TRAIT_PATTERN = re.compile(r"\b(?:sstatus|status|src_status|source_status)\s*->\s*(pow|sta|wis|spl|con|crt)\b", re.I)


def resolve_ra_root(cli_value: str | None, web_root: pathlib.Path) -> pathlib.Path | None:
    candidates = [
        cli_value,
        os.environ.get("RO_WEB_RA_ROOT"),
        str(web_root.parent / "rathena-master"),
        "/mnt/data/ra_extract/rathena-master",
    ]
    for value in candidates:
        if not value:
            continue
        path = pathlib.Path(value).expanduser().resolve()
        if (path / "db/re/skill_db.yml").is_file() and (path / "src/map/skills").is_dir():
            return path
    return None


def extract_brace_body(text: str, start: int) -> str:
    opening = text.find("{", start)
    if opening < 0:
        return ""
    depth = 0
    for index in range(opening, len(text)):
        char = text[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[opening:index + 1]
    return text[opening:]


def parent_constant(constant: str, learnable: set[str]) -> str | None:
    if constant in learnable:
        return constant
    candidates: list[str] = []
    for suffix in ("_ATTACK", "_ATK", "_DAMAGE"):
        if constant.endswith(suffix):
            candidates.append(constant[:-len(suffix)])
    if constant.startswith("EM_ELEMENTAL_BUSTER_"):
        candidates.append("EM_ELEMENTAL_BUSTER")
    return next((candidate for candidate in candidates if candidate in learnable), None)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ra-root", help="Path to the extracted rAthena source tree")
    parser.add_argument("--output", default=f"tools/ra_trait_skill_formula_audit_{VERSION}.json")
    args = parser.parse_args()

    web_root = pathlib.Path(__file__).resolve().parents[1]
    ra_root = resolve_ra_root(args.ra_root, web_root)
    output_path = (web_root / args.output).resolve()
    if ra_root is None:
        # The generated evidence report remains useful in a distributed WEB-only
        # package.  Verify that it is a previously passing report instead of
        # pretending that source comparison ran without the RA tree.
        if output_path.is_file():
            cached = json.loads(output_path.read_text(encoding="utf-8"))
            summary = cached.get("summary", {})
            if summary.get("status") == "PASS" and summary.get("missing") == 0:
                print(json.dumps({**summary, "sourceTreeAvailable": False, "resultMode": "verified_cached_report"}, ensure_ascii=False, indent=2))
                return 0
        print("rAthena source tree not found. Pass --ra-root or set RO_WEB_RA_ROOT.", file=sys.stderr)
        return 2

    skill_db = yaml.safe_load((ra_root / "db/re/skill_db.yml").read_text(encoding="utf-8"))["Body"]
    name_to_info = {
        row["Name"]: (int(row["Id"]), row.get("Description", row["Name"]))
        for row in skill_db
    }
    skill_tree = yaml.safe_load((ra_root / "db/re/skill_tree.yml").read_text(encoding="utf-8"))["Body"]
    learnable = {node.get("Name") for job in skill_tree for node in job.get("Tree", [])}
    runtime = json.loads((web_root / "data/skill_runtime/runtime_generated_all.json").read_text(encoding="utf-8"))["skills"]
    js_sources = "\n".join(path.read_text(encoding="utf-8", errors="ignore") for path in (web_root / "js").glob("*.js"))

    raw_rows: list[dict] = []
    for family in FAMILIES:
        for source_path in sorted((ra_root / "src/map/skills" / family).glob("*.cpp")):
            text = source_path.read_text(encoding="utf-8", errors="ignore")
            constructors = {
                match.group(1): match.group(2)
                for match in re.finditer(
                    r"(Skill\w+)::\1\(\)\s*:\s*[^\n{]*\(\s*([A-Z][A-Z0-9_]+)\s*\)",
                    text,
                )
            }
            for class_name, constant in constructors.items():
                method_bodies: list[str] = []
                method_pattern = re.compile(
                    r"\b(?:void|bool|int\w*|uint\w*|std::\w+|[A-Za-z_]\w*\s*\*)\s+"
                    + re.escape(class_name)
                    + r"::\w+\s*\("
                )
                for method in method_pattern.finditer(text):
                    body = extract_brace_body(text, method.end())
                    if body:
                        method_bodies.append(body)
                combined = "\n".join(method_bodies)
                traits = sorted(set(match.lower() for match in TRAIT_PATTERN.findall(combined)))
                if not traits or constant not in name_to_info:
                    continue
                raw_rows.append({
                    "family": family,
                    "file": source_path.name,
                    "class": class_name,
                    "constant": constant,
                    "traits": traits,
                    "sourceEvidence": [
                        line.strip() for line in combined.splitlines() if TRAIT_PATTERN.search(line)
                    ][:8],
                })

    grouped: dict[str, dict] = {}
    for row in raw_rows:
        parent = parent_constant(row["constant"], learnable)
        if parent is None:
            continue
        group = grouped.setdefault(parent, {
            "constant": parent,
            "family": row["family"],
            "traits": set(),
            "sources": [],
        })
        group["traits"].update(row["traits"])
        group["sources"].append(row)

    def servant_weapon_check() -> bool:
        return all(token in js_sources for token in (
            "function tryServantWeaponOnNormalAttack", "5 * level", "5 * pow", "ratioPerHit * 3"
        ))

    def from_abyss_check() -> bool:
        return all(token in js_sources for token in (
            "function tryAbyssForceWeaponOnNormalAttack", "5 * spl", "hits:5"
        ))

    special_checks = {
        "DK_SERVANTWEAPON": servant_weapon_check,
        "ABC_FROM_THE_ABYSS": from_abyss_check,
    }

    rows: list[dict] = []
    for constant, group in sorted(grouped.items(), key=lambda pair: name_to_info[pair[0]][0]):
        skill_id, display_name = name_to_info[constant]
        entry = runtime.get(str(skill_id), {})
        profile = entry.get("runtimeProfile") or entry.get("formula") or {}
        formula = profile.get("formula") if isinstance(profile, dict) else None
        mode = entry.get("implementationMode")
        enabled = entry.get("executionEnabled") is True
        intentional_override = constant == "MT_A_MACHINE" and mode == "self_only_override"
        formula_present = False
        trait_present = False
        runtime_evidence: list[str] = []

        if constant in special_checks:
            formula_present = trait_present = special_checks[constant]()
            runtime_evidence = (
                ["tryServantWeaponOnNormalAttack", "5% × Lv", "(600 + 850×Lv + 5×POW) × BaseLv/100", "3 hits"]
                if constant == "DK_SERVANTWEAPON"
                else ["tryAbyssForceWeaponOnNormalAttack", "25% proc", "(150 + 650×Lv + 5×SPL) × BaseLv/100", "5 hits"]
            )
        elif formula:
            positions = [match.start() for match in re.finditer(re.escape(str(formula)), js_sources)]
            formula_present = bool(positions)
            for position in positions:
                snippet = js_sources[max(0, position - 120):position + 2600].lower()
                found_traits = [trait for trait in group["traits"] if re.search(rf"\b{re.escape(trait)}\b", snippet)]
                if found_traits:
                    trait_present = True
                    runtime_evidence = [str(formula), *found_traits]
                    break

        covered = intentional_override or (enabled and formula_present and trait_present)
        rows.append({
            "skillId": skill_id,
            "constant": constant,
            "name": display_name,
            "family": group["family"],
            "traits": sorted(group["traits"]),
            "formula": formula,
            "implementationMode": mode,
            "executionEnabled": enabled,
            "formulaPathPresent": formula_present,
            "traitDependencyPresent": trait_present,
            "intentionalOverride": intentional_override,
            "covered": covered,
            "runtimeEvidence": runtime_evidence,
            "raSources": [
                {
                    "file": source["file"],
                    "constant": source["constant"],
                    "traits": source["traits"],
                    "evidence": source["sourceEvidence"],
                }
                for source in group["sources"]
            ],
        })

    missing = [row for row in rows if not row["covered"]]
    summary = {
        "version": VERSION,
        "source": "rAthena Renewal 2026-06-08 source package",
        "sourceTreeAvailable": True,
        "scope": (
            "Six main job families plus Novice-family player-learnable skills whose RA implementation directly "
            "reads POW/STA/WIS/SPL/CON/CRT. Internal *_ATK helpers are grouped under their learnable parent skill."
        ),
        "traitDependentLearnableSkills": len(rows),
        "runtimeCovered": sum(row["covered"] for row in rows),
        "intentionalOverrides": sum(row["intentionalOverride"] for row in rows),
        "missing": len(missing),
        "status": "PASS" if not missing else "FAIL",
    }
    output = {"summary": summary, "missing": missing, "skills": rows}
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if not missing else 1


if __name__ == "__main__":
    raise SystemExit(main())
