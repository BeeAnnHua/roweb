#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
failures: list[str] = []
checks = 0


def check(condition: bool, label: str) -> None:
    global checks
    checks += 1
    if not condition:
        failures.append(label)


def load(rel: str):
    return json.loads((ROOT / rel).read_text(encoding="utf-8"))


cfg = load("data/newcomer_support.json")
item_index = load("data/items/item_index.json")
consumables = load("data/items/consumables.json")
npcs_raw = load("data/npcs.json")
npcs = npcs_raw if isinstance(npcs_raw, list) else npcs_raw.get("npcs", [])
effects = load("data/card_runtime/equipment_effects.json")
enchant_effects = load("data/enchant_runtime/enchant_effects.json")

check(cfg.get("version") == "0.9.83", "config version")
check(cfg.get("packageId") == 101538, "package id")
check(cfg.get("stageBoxIds") == {"100": 101538, "130": 1000994, "160": 1000985}, "stage box chain ids")
check(cfg.get("nextStageBoxIds") == {"100": 1000994, "130": 1000985, "160": None}, "next stage box chain")
check("100→130→160" in str(cfg.get("chainPolicy", "")), "chain policy copy")
check(cfg.get("newCharacterAutoGrant") is True, "new character grant enabled")
check(cfg.get("legacyNpcClaim") is True, "legacy NPC claim enabled")
check(cfg.get("perCharacterClaimFlag") == "newcomerSupportClaimedV1", "per-character claim flag")
check(cfg.get("progressField") == "newcomerSupportProgressV1", "progress field")
check(cfg.get("binding") == {"characterBound": True, "noStorage": True, "noDecompose": True, "noSell": True}, "binding policy")

job_routes = cfg.get("jobRoutes", {})
check(len(job_routes) == 26, "26 supported third/fourth job keys")
expected_jobs = {
    "rune_knight", "dragon_knight", "royal_guard", "imperial_guard",
    "mechanic", "meister", "genetic", "biolo", "guillotine_cross", "shadow_cross",
    "shadow_chaser", "abyss_chaser", "warlock", "arch_mage", "sorcerer", "elemental_master",
    "arch_bishop", "cardinal", "sura", "inquisitor", "ranger", "windhawk",
    "minstrel", "troubadour", "wanderer", "trouvere"
}
check(set(job_routes) == expected_jobs, "supported job key set")
check(all(len(row.get("weapons", [])) == 2 for row in job_routes.values()), "two weapons per supported job")

weapon_ids = sorted({int(i) for row in job_routes.values() for i in row.get("weapons", [])})
check(len(weapon_ids) == 26, "26 unique classic-family booster weapons")

stage100 = cfg["stages"]["100"]
stage130 = cfg["stages"]["130"]
stage160 = cfg["stages"]["160"]
armor100_ids = sorted({int(i) for row in stage100["armorSets"].values() for i in row["items"]})
illusion_ids = sorted({int(i) for row in stage130["sets"].values() for i in row["items"]})
automatic_ids = sorted({int(i) for row in stage160["sets"].values() for i in row["items"]})
all_equipment_ids = sorted(set(weapon_ids + armor100_ids + illusion_ids + automatic_ids))
check(len(armor100_ids) == 16, "16 Lv100 armor items")
check(len(illusion_ids) == 10, "10 bound Illusion items")
check(len(automatic_ids) == 10, "10 bound Automatic items")
check(len(all_equipment_ids) == 62, "62 total support equipment items")
check(stage100.get("armorRefine") == 10, "Lv100 armor refine +10")
check(all(row.get("refines") == [10, 10, 10, 0, 0] for row in stage130["sets"].values()), "Lv130 refine layout")
check(all(row.get("refines") == [11, 11, 11, 0, 0] for row in stage160["sets"].values()), "Lv160 refine layout")

slot3 = cfg["weaponEnchantOptions"]["slot3"]
slot2 = cfg["weaponEnchantOptions"]["slot2"]
enchant_ids = [int(x["id"]) for x in slot3 + slot2]
check(len(slot3) == 4 and len(slot2) == 3 and len(set(enchant_ids)) == 7, "7 booster weapon enchant choices")
check(all(str(i) in enchant_effects for i in enchant_ids), "all enchant effects indexed")

for item_id in all_equipment_ids:
    row = item_index.get(str(item_id))
    check(isinstance(row, dict), f"item index {item_id}")
    if not isinstance(row, dict):
        continue
    check(row.get("characterBound") is True, f"character bound {item_id}")
    check(row.get("noStorage") is True, f"no storage {item_id}")
    check(row.get("noDecompose") is True, f"no decompose {item_id}")
    check(row.get("noSell") is True, f"no sell {item_id}")
    check(str(item_id) in effects, f"compiled equipment effect {item_id}")
    check((ROOT / f"images/items/{item_id}.webp").is_file(), f"equipment icon {item_id}")

reference_ids = [101538, 1000253, 101423, 100043, 1000994, 100341, 1000985, 101455]
for item_id in reference_ids:
    check(str(item_id) in item_index, f"reference item index {item_id}")
    check((ROOT / f"images/items/{item_id}.webp").is_file(), f"reference icon {item_id}")
check(str(101538) in consumables, "package consumable record")
for stage, box_id, next_box in [(100,101538,1000994),(130,1000994,1000985),(160,1000985,None)]:
    row = item_index.get(str(box_id), {})
    check(row.get("subCategory") == "newcomer_support_box", f"stage {stage} box category")
    check(row.get("newcomerSupportStage") == stage, f"stage {stage} marker")
    check(row.get("nextStageBoxId") == next_box, f"stage {stage} next box marker")
    check(row.get("manualUseOnly") is True, f"stage {stage} manual use")
    check(str(box_id) in consumables, f"stage {stage} consumable record")
check("Base Lv.130" in " ".join(item_index["101538"].get("description", [])), "Lv100 box announces Lv130 chain")
check("Base Lv.160" in " ".join(item_index["1000994"].get("description", [])), "Lv130 box announces Lv160 chain")
for item_id in enchant_ids:
    check((ROOT / f"images/items/{item_id}.webp").is_file(), f"enchant icon {item_id}")

npc = next((n for n in npcs if n.get("id") == "prontera_newcomer_support_npc"), None)
check(npc is not None, "Prontera support NPC exists")
if npc:
    check(npc.get("cityId") == "prontera", "NPC city")
    check(npc.get("type") == "newcomer_support", "NPC type")
    check(npc.get("position") == "中央廣場", "NPC central position")

runtime = (ROOT / "js/newcomer_support_runtime.js").read_text(encoding="utf-8")
player_js = (ROOT / "js/player.js").read_text(encoding="utf-8")
item_ui = (ROOT / "js/item_instance_ui.js").read_text(encoding="utf-8")
storage_js = (ROOT / "js/storage_runtime.js").read_text(encoding="utf-8")
town_js = (ROOT / "js/town.js").read_text(encoding="utf-8")
game_js = (ROOT / "js/game.js").read_text(encoding="utf-8")
index_html = (ROOT / "index.html").read_text(encoding="utf-8")

check("const VERSION = '0.9.83'" in runtime, "runtime version")
check('RO_WEB_SAVE_APP_VERSION = "0.9.83"' in player_js, "save version")
check("grantForNewCharacter" in game_js, "new character bootstrap hook")
check("newcomer_support" in town_js and "claimFromNpc" in town_js, "NPC interaction hook")
check("characterBound" in item_ui and "noDecompose" in item_ui, "instance binding fields preserved")
check("noStorage" in storage_js and "characterBound" in storage_js, "storage rejection")
check("newcomer_support_runtime.js?v=0.9.83" in index_html, "runtime script loaded")
check("RO_WEB V0.9.83" in index_html, "page title version")
check("每個人物只能領取一次" in runtime, "one-time confirmation copy")
check("const STAGE_BOX_IDS" in runtime and "const NEXT_BOX_BY_STAGE" in runtime, "runtime stage chain constants")
check("openForBox" in runtime and "removeBox(boxId)" in runtime, "runtime box-specific open and consume")
check("addBoxSilently(nextBoxId)" in runtime, "runtime grants next stage box")
check("body.innerHTML = renderStage100()" in runtime and "renderSimpleStage(130" in runtime and "renderSimpleStage(160" in runtime, "runtime renders only active stage")
check("window.NewcomerSupportRuntime?.BOX_STAGE_BY_ID" in item_ui, "item detail routes all chain boxes")
check("擴充職業將於後續版本加入" in runtime, "expansion job defer message")

# The compact runtime bundle must contain current config and omit the transient build audit.
bundle = (ROOT / "js/data_bundle.js").read_text(encoding="utf-8", errors="ignore")
check('"version":"0.9.83"' in bundle or "version: '0.9.83'" in bundle or 'version:"0.9.83"' in bundle, "data bundle version")
check("data/newcomer_support.json" in bundle, "newcomer config bundled")
check("newcomer_support_build_audit" not in bundle, "transient build audit excluded")

result = {"version": "0.9.83", "checks": checks, "passed": checks - len(failures), "failed": len(failures), "failures": failures}
print(json.dumps(result, ensure_ascii=False))
sys.exit(1 if failures else 0)
