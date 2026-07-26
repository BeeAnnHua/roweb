#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "data" / "character_atlas_manifest.json"
AUDIT = ROOT / "docs" / "CHARACTER_WEAPON_AUDIT_0.9.82DU.json"
CANONICAL = {
    "fist", "dagger", "sword", "dual_sword", "dual_dagger", "spear", "axe", "mace",
    "staff", "book", "bow", "katar", "knuckle", "instrument", "whip",
}


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def main() -> int:
    errors: list[str] = []
    manifest = load(MANIFEST)
    audit = load(AUDIT)
    chars = manifest.get("characters") or {}
    rows = audit.get("rows") or []
    summary = audit.get("summary") or {}

    if len(chars) != 90:
        errors.append(f"manifest characters={len(chars)} expected=90")
    if summary.get("status") != "PASS":
        errors.append(f"source weapon audit status={summary.get('status')}")
    if len(rows) != 480:
        errors.append(f"weapon audit rows={len(rows)} expected=480")
    for field in ("unknownClassifications", "classificationErrors", "missingOutputs"):
        if int(summary.get(field, 0)) != 0:
            errors.append(f"audit {field}={summary.get(field)}")

    expected: set[tuple[str, str, str]] = set()
    actual: set[tuple[str, str, str]] = set()
    hash_groups: dict[tuple[str, str], dict[str, str]] = defaultdict(dict)
    variants = 0

    for key, entry in sorted(chars.items()):
        mm_path = ROOT / str(entry.get("motion_map") or entry.get("motions_json") or "")
        if not mm_path.is_file():
            errors.append(f"{key}: missing motion map {mm_path}")
            continue
        mm = load(mm_path)
        for variant_name, variant in (mm.get("variants") or {}).items():
            variants += 1
            attacks = variant.get("attack") or {}
            for weapon_key, rel in attacks.items():
                actual.add((key, variant_name, weapon_key))
                if weapon_key not in CANONICAL:
                    errors.append(f"{key}/{variant_name}: non-canonical weapon key {weapon_key}")
                jp = ROOT / rel
                if not jp.is_file():
                    errors.append(f"{key}/{variant_name}/{weapon_key}: missing JSON {rel}")
                    continue
                data = load(jp)
                if data.get("schema") != "ro_web_packed_character_atlas":
                    errors.append(f"{rel}: bad schema {data.get('schema')}")
                if data.get("optimization", {}).get("directionPolicy") != "two-source":
                    errors.append(f"{rel}: attack policy={data.get('optimization',{}).get('directionPolicy')}")
                png = jp.parent / str(data.get("image") or "")
                if not png.is_file():
                    errors.append(f"{rel}: missing PNG {png.name}")
                    continue
                digest = hashlib.sha256(png.read_bytes()).hexdigest()
                hash_groups[(key, variant_name)][weapon_key] = digest

    for row in rows:
        key = f"{row['jobKey']}_{row['gender']}"
        triple = (key, row["variant"], row["weaponKey"])
        expected.add(triple)
        entry = chars.get(key)
        if not entry:
            errors.append(f"audit character missing from manifest: {key}")
            continue
        mm = load(ROOT / entry["motion_map"])
        rel = mm.get("variants", {}).get(row["variant"], {}).get("attack", {}).get(row["weaponKey"])
        if rel != row.get("outputJson"):
            errors.append(
                f"{key}/{row['variant']}/{row['weaponKey']}: motion path {rel} != audit {row.get('outputJson')}"
            )

    missing = expected - actual
    extra = actual - expected
    if missing:
        errors.append(f"missing audited attacks={len(missing)} first={sorted(missing)[:5]}")
    if extra:
        errors.append(f"extra attacks not in audit={len(extra)} first={sorted(extra)[:5]}")
    if variants != 102:
        errors.append(f"character variants={variants} expected=102")

    # 原始母庫稽核確認同一人物／變體的各武器 PNG 不相同；部署版若出現同 hash，通常代表輸出覆蓋。
    for group, hashes in sorted(hash_groups.items()):
        reverse: dict[str, list[str]] = defaultdict(list)
        for weapon, digest in hashes.items():
            reverse[digest].append(weapon)
        duplicates = [sorted(v) for v in reverse.values() if len(v) > 1]
        if duplicates:
            errors.append(f"{group[0]}/{group[1]} duplicate weapon PNG hashes: {duplicates}")

    print("RO_WEB 0.9.82DU All Character Weapon Test")
    print("=" * 64)
    print(f"Manifest characters : {len(chars)}")
    print(f"Character variants  : {variants}")
    print(f"Audited attacks     : {len(rows)}")
    print(f"Actual attacks      : {len(actual)}")
    print(f"Canonical keys      : {len(CANONICAL)}")
    print(f"Errors              : {len(errors)}")
    for item in errors:
        print(f"[ERROR] {item}")
    print("STATUS              : " + ("PASS" if not errors else "FAIL"))
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
