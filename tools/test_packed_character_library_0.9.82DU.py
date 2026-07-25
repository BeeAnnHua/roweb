#!/usr/bin/env python3
from __future__ import annotations

import json
import pathlib
import struct
import sys
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parents[1]
CHAR_ROOT = ROOT / "assets" / "characters"
MANIFEST_PATH = ROOT / "data" / "character_atlas_manifest.json"

EXPECTED_MOUNTED = {
    "crusader_female", "crusader_male",
    "knight_female", "knight_male",
    "royal_guard_female", "royal_guard_male",
    "rune_knight_female", "rune_knight_male",
    "imperial_guard_female", "imperial_guard_male",
    "dragon_knight_female", "dragon_knight_male",
}
DIRECTIONS = {
    "front", "front_left", "left", "back_left",
    "back", "back_right", "right", "front_right",
}


def load_json(path: pathlib.Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def png_size(path: pathlib.Path) -> tuple[int, int]:
    with path.open("rb") as fh:
        sig = fh.read(24)
    if len(sig) < 24 or sig[:8] != b"\x89PNG\r\n\x1a\n" or sig[12:16] != b"IHDR":
        raise ValueError(f"not a valid PNG: {path}")
    return struct.unpack(">II", sig[16:24])


def rel(path: pathlib.Path) -> str:
    return path.relative_to(ROOT).as_posix()


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []
    info = Counter()

    manifest = load_json(MANIFEST_PATH)
    chars = manifest.get("characters") or {}
    if manifest.get("schema_version") != "3.1":
        errors.append(f"manifest schema_version={manifest.get('schema_version')}")
    if len(chars) != 90:
        errors.append(f"manifest characters={len(chars)} expected=90")

    mounted_keys = {key for key, row in chars.items() if row.get("has_mounted_variant")}
    if mounted_keys != EXPECTED_MOUNTED:
        errors.append(
            "mounted manifest mismatch: "
            f"missing={sorted(EXPECTED_MOUNTED-mounted_keys)} extra={sorted(mounted_keys-EXPECTED_MOUNTED)}"
        )

    referenced_json: set[pathlib.Path] = set()
    referenced_png: set[pathlib.Path] = set()
    atlas_policy = Counter()
    motion_counts = Counter()
    variant_counts = Counter()

    for key, row in sorted(chars.items()):
        idle = ROOT / row.get("idle_image", "")
        motion_map_path = ROOT / (row.get("motion_map") or row.get("motions_json") or "")
        if not idle.is_file():
            errors.append(f"{key}: missing idle {rel(idle) if idle.is_absolute() and ROOT in idle.parents else idle}")
        else:
            referenced_png.add(idle)
            try:
                if png_size(idle) != (256, 256):
                    warnings.append(f"{key}: idle size={png_size(idle)}")
            except Exception as exc:
                errors.append(f"{key}: idle PNG invalid: {exc}")
        if not motion_map_path.is_file():
            errors.append(f"{key}: missing motion map {motion_map_path}")
            continue
        referenced_json.add(motion_map_path)
        mm = load_json(motion_map_path)
        if mm.get("schema_version") != "3.1" or mm.get("schema") != "ro_web_character_motion_map":
            errors.append(f"{key}: bad motion map schema {mm.get('schema')} {mm.get('schema_version')}")
        variants = mm.get("variants") or {}
        expected_variants = {"on_foot", "mounted"} if key in EXPECTED_MOUNTED else {"on_foot"}
        if set(variants) != expected_variants:
            errors.append(f"{key}: variants={sorted(variants)} expected={sorted(expected_variants)}")
        if bool(mm.get("rules", {}).get("profileAndTownAlwaysOnFootIdle")) is not True:
            errors.append(f"{key}: profileAndTownAlwaysOnFootIdle missing")
        if mm.get("rules", {}).get("anchor") != {"x": 128, "y": 140}:
            errors.append(f"{key}: motion map anchor mismatch")

        for variant_name, variant in variants.items():
            variant_counts[variant_name] += 1
            for motion_id in ("idle", "walk", "cast", "dead", "hurt"):
                p = ROOT / str(variant.get(motion_id) or "")
                if not p.is_file():
                    errors.append(f"{key}/{variant_name}: missing {motion_id} JSON {p}")
                    continue
                referenced_json.add(p)
                check_atlas_json(
                    p, motion_id, errors, warnings, referenced_png, atlas_policy, motion_counts
                )
            attacks = variant.get("attack") or {}
            if not attacks:
                errors.append(f"{key}/{variant_name}: no attack animations")
            default_weapon = str(row.get("weapon_type_default") or "fist")
            if variant_name == "on_foot" and default_weapon not in attacks:
                errors.append(f"{key}/{variant_name}: default weapon {default_weapon} missing")
            for weapon, path_str in sorted(attacks.items()):
                p = ROOT / path_str
                if not p.is_file():
                    errors.append(f"{key}/{variant_name}: missing attack/{weapon} JSON {p}")
                    continue
                referenced_json.add(p)
                check_atlas_json(
                    p, "attack", errors, warnings, referenced_png, atlas_policy, motion_counts
                )

    all_atlas_json = {
        p for p in CHAR_ROOT.rglob("*.json")
        if p.name not in {"motions.json", "manifest.generated.json"}
    }
    all_motion_maps = set(CHAR_ROOT.glob("*/*/motions.json"))
    all_png = set(CHAR_ROOT.rglob("*.png"))
    old_fixed_png = [p for p in all_png if p.name in {"body_hair.png", "body_hair_weapon.png"}]
    old_hurt_dead_dirs = [p for p in CHAR_ROOT.rglob("hurt_dead") if p.is_dir()]

    if len(all_motion_maps) != 90:
        errors.append(f"motion maps on disk={len(all_motion_maps)} expected=90")
    if len(all_atlas_json) != 888:
        errors.append(f"atlas JSON on disk={len(all_atlas_json)} expected=888")
    if len(all_png) != 978:
        errors.append(f"PNG on disk={len(all_png)} expected=978")
    if old_fixed_png:
        errors.append(f"legacy fixed-grid PNG remain: {[rel(p) for p in old_fixed_png[:10]]}")
    if old_hurt_dead_dirs:
        errors.append(f"legacy hurt_dead directories remain: {[rel(p) for p in old_hurt_dead_dirs[:10]]}")
    if referenced_json - (all_atlas_json | all_motion_maps):
        errors.append(f"referenced JSON outside library set: {len(referenced_json-(all_atlas_json|all_motion_maps))}")
    unreferenced_atlas = all_atlas_json - referenced_json
    if unreferenced_atlas:
        errors.append(f"unreferenced atlas JSON={len(unreferenced_atlas)} first={[rel(p) for p in sorted(unreferenced_atlas)[:5]]}")
    unreferenced_png = all_png - referenced_png
    if unreferenced_png:
        errors.append(f"unreferenced PNG={len(unreferenced_png)} first={[rel(p) for p in sorted(unreferenced_png)[:5]]}")

    expected_policies = {
        "idle": {"five-source"},
        "walk": {"five-source"},
        "attack": {"two-source"},
        "cast": {"full-eight-fallback"},
        "dead": {"full-eight-fallback"},
        "hurt": {"full-eight-fallback"},
    }
    for motion_id, expected in expected_policies.items():
        actual = {policy for (mid, policy), count in atlas_policy.items() if mid == motion_id and count}
        if not actual.issubset(expected):
            errors.append(f"{motion_id}: unexpected policies={sorted(actual)} expected subset={sorted(expected)}")

    print("RO_WEB 0.9.82DU Packed Character Library Test")
    print("=" * 58)
    print(f"Manifest characters : {len(chars)}")
    print(f"Motion maps         : {len(all_motion_maps)}")
    print(f"Mounted variants    : {variant_counts['mounted']}")
    print(f"Atlas JSON          : {len(all_atlas_json)}")
    print(f"PNG                 : {len(all_png)}")
    print(f"Referenced JSON     : {len(referenced_json)}")
    print(f"Referenced PNG      : {len(referenced_png)}")
    print(f"Policies            : {dict(atlas_policy)}")
    print(f"Errors              : {len(errors)}")
    print(f"Warnings            : {len(warnings)}")
    for item in errors:
        print(f"[ERROR] {item}")
    for item in warnings:
        print(f"[WARN] {item}")
    print("STATUS              : " + ("PASS" if not errors else "FAIL"))
    return 0 if not errors else 1


def check_atlas_json(
    path: pathlib.Path,
    requested_motion: str,
    errors: list[str],
    warnings: list[str],
    referenced_png: set[pathlib.Path],
    atlas_policy: Counter,
    motion_counts: Counter,
) -> None:
    data = load_json(path)
    label = rel(path)
    if data.get("schema") != "ro_web_packed_character_atlas" or data.get("schema_version") != "2.1":
        errors.append(f"{label}: bad atlas schema {data.get('schema')} {data.get('schema_version')}")
        return
    if data.get("cell") != {"width": 256, "height": 256}:
        errors.append(f"{label}: logical cell mismatch {data.get('cell')}")
    if data.get("anchor") != {"x": 128, "y": 140}:
        errors.append(f"{label}: anchor mismatch {data.get('anchor')}")
    if not data.get("atlas", {}).get("packed"):
        errors.append(f"{label}: atlas.packed is not true")

    image_path = path.parent / str(data.get("image") or "")
    if not image_path.is_file():
        errors.append(f"{label}: missing image {image_path.name}")
        return
    referenced_png.add(image_path)
    try:
        image_w, image_h = png_size(image_path)
    except Exception as exc:
        errors.append(f"{label}: invalid PNG {exc}")
        return
    if (image_w, image_h) != (
        int(data.get("atlas", {}).get("width", 0)),
        int(data.get("atlas", {}).get("height", 0)),
    ):
        errors.append(f"{label}: PNG size {(image_w,image_h)} != atlas metadata")

    frame_sets = data.get("frame_sets") or {}
    fs = frame_sets.get(requested_motion)
    if fs is None and requested_motion == "hurt":
        fs = frame_sets.get("hurt") or frame_sets.get("dead")
    if fs is None:
        errors.append(f"{label}: frame_set {requested_motion} missing")
        return

    expected_frames = {"idle": 1, "hurt": 3, "dead": 4}.get(requested_motion)
    frame_count = int(fs.get("frameCount", 0))
    if expected_frames is not None and frame_count != expected_frames:
        errors.append(f"{label}: {requested_motion} frameCount={frame_count} expected={expected_frames}")
    if frame_count <= 0:
        errors.append(f"{label}: non-positive frameCount")

    directions = fs.get("directions") or {}
    if set(directions) != DIRECTIONS:
        errors.append(f"{label}: directions={sorted(directions)}")
    aliases = fs.get("directionAliases") or {}
    if set(aliases) != DIRECTIONS:
        errors.append(f"{label}: directionAliases={sorted(aliases)}")

    for direction, frames in directions.items():
        if len(frames) != frame_count:
            errors.append(f"{label}: {requested_motion}/{direction} frames={len(frames)} expected={frame_count}")
        for i, frame in enumerate(frames):
            region = frame.get("region") or {}
            x, y, w, h = (int(region.get(k, -1)) for k in ("x", "y", "w", "h"))
            if min(x, y, w, h) < 0 or w <= 0 or h <= 0 or x + w > image_w or y + h > image_h:
                errors.append(f"{label}: region out of bounds {direction}[{i}]={region} image={(image_w,image_h)}")
            dx = int(frame.get("targetOffsetX", frame.get("offsetX", -9999)))
            dy = int(frame.get("targetOffsetY", frame.get("offsetY", -9999)))
            if dx < 0 or dy < 0 or dx + w > 256 or dy + h > 256:
                errors.append(f"{label}: logical placement out of bounds {direction}[{i}]={(dx,dy,w,h)}")
            if not isinstance(frame.get("flipX"), bool):
                errors.append(f"{label}: flipX not bool {direction}[{i}]")
            if frame.get("sourceDirection") not in DIRECTIONS:
                errors.append(f"{label}: invalid sourceDirection {direction}[{i}]={frame.get('sourceDirection')}")

    policy = str(data.get("optimization", {}).get("directionPolicy") or "")
    atlas_policy[(requested_motion, policy)] += 1
    motion_counts[requested_motion] += 1


if __name__ == "__main__":
    raise SystemExit(main())
