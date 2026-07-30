#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[1]
RA = Path('/mnt/data/ra_work/rathena-master/db/re')
ITEMINFO = Path('/mnt/data/itemInfo_UTF8.lub')
VERSION = '0.9.82HO'
REWARD_DATA_PATH = ROOT / 'data/items/ra_classic_box_rewards_0_9_82HO.json'
BOX_DATA_PATH = ROOT / 'data/item_boxes.json'
CONSUMABLES_PATH = ROOT / 'data/items/consumables.json'
INDEX_PATH = ROOT / 'data/items/item_index.json'
MANIFEST_PATH = ROOT / 'data/items/database_manifest.json'

BOXES = {
    'ra_old_blue_box': {
        'itemId': 603,
        'group': 'BLUEBOX',
        'name': '神秘箱子',
        'subCategory': 'ra_old_blue_box',
    },
    'ra_old_violet_box': {
        'itemId': 617,
        'group': 'VIOLETBOX',
        'name': '神秘紫箱',
        'subCategory': 'ra_old_violet_box',
    },
    'ra_gift_box': {
        'itemId': 644,
        'group': 'GIFTBOX',
        'name': '禮物箱',
        'subCategory': 'ra_gift_box',
    },
}

WEAPON_MAP = {
    'Dagger': 'dagger', '1hSword': 'sword', '2hSword': 'twoHandSword',
    '1hSpear': 'spear', '2hSpear': 'spear', '1hAxe': 'axe', '2hAxe': 'axe',
    'Mace': 'mace', '2hMace': 'mace', 'Staff': 'staff', '2hStaff': 'staff',
    'Bow': 'bow', 'Knuckle': 'knuckle', 'Musical': 'instrument', 'Whip': 'whip',
    'Book': 'book', 'Katar': 'katar', 'Revolver': 'gun', 'Rifle': 'gun',
    'Gatling': 'gun', 'Shotgun': 'gun', 'Grenade': 'gun', 'Huuma': 'ninja',
    'Shuriken': 'ninja',
}


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def lua_unescape(value: str) -> str:
    return (value.replace('\\r', '\r').replace('\\n', '\n').replace('\\t', '\t')
            .replace('\\"', '"').replace("\\'", "'").replace('\\\\', '\\'))


def strip_ro_color(value: str) -> str:
    return re.sub(r'\^[0-9A-Fa-f]{6}', '', value).strip()


def parse_iteminfo(target_ids: set[int]) -> dict[int, dict[str, Any]]:
    source = ITEMINFO.read_text(encoding='utf-8-sig')
    pattern = re.compile(r'^\s*\[(\d+)\]\s*=\s*\{', re.M)
    matches = list(pattern.finditer(source))
    result: dict[int, dict[str, Any]] = {}
    for index, match in enumerate(matches):
        item_id = int(match.group(1))
        if item_id not in target_ids:
            continue
        end = matches[index + 1].start() if index + 1 < len(matches) else len(source)
        block = source[match.end():end]
        name_match = re.search(r'(?m)^\s*identifiedDisplayName\s*=\s*"((?:\\.|[^"\\])*)"', block)
        if not name_match:
            name_match = re.search(r'(?m)^\s*unidentifiedDisplayName\s*=\s*"((?:\\.|[^"\\])*)"', block)
        description_match = re.search(r'(?ms)^\s*identifiedDescriptionName\s*=\s*\{(.*?)\}\s*,', block)
        descriptions: list[str] = []
        if description_match:
            for string_match in re.finditer(r'"((?:\\.|[^"\\])*)"', description_match.group(1)):
                raw = lua_unescape(string_match.group(1)).strip()
                plain = strip_ro_color(raw)
                if not plain or plain == '_':
                    continue
                if plain.startswith('重量 :') or plain.startswith('重量:'):
                    continue
                descriptions.append(plain)
        slots = re.search(r'slotCount\s*=\s*(\d+)', block)
        class_num = re.search(r'ClassNum\s*=\s*(\d+)', block)
        resource = re.search(r'(?m)^\s*identifiedResourceName\s*=\s*"((?:\\.|[^"\\])*)"', block)
        result[item_id] = {
            'name': lua_unescape(name_match.group(1)) if name_match else str(item_id),
            'description': descriptions,
            'slotCount': int(slots.group(1)) if slots else 0,
            'ClassNum': int(class_num.group(1)) if class_num else 0,
            'resourceName': lua_unescape(resource.group(1)) if resource else '',
        }
    return result


def load_ra_items() -> tuple[dict[int, dict[str, Any]], dict[str, dict[str, Any]]]:
    by_id: dict[int, dict[str, Any]] = {}
    by_aegis: dict[str, dict[str, Any]] = {}
    for filename in ('item_db_usable.yml', 'item_db_etc.yml', 'item_db_equip.yml'):
        document = yaml.safe_load((RA / filename).read_text(encoding='utf-8')) or {}
        for row in document.get('Body', []) or []:
            if not isinstance(row, dict) or 'Id' not in row:
                continue
            item_id = int(row['Id'])
            by_id[item_id] = row
            if row.get('AegisName'):
                by_aegis[str(row['AegisName'])] = row
    return by_id, by_aegis


def load_ra_groups() -> dict[str, dict[str, Any]]:
    document = yaml.safe_load((RA / 'item_group_db.yml').read_text(encoding='utf-8')) or {}
    return {str(row.get('Group')): row for row in document.get('Body', []) or [] if isinstance(row, dict) and row.get('Group')}


def infer_slot(row: dict[str, Any]) -> str | None:
    item_type = str(row.get('Type', ''))
    locations = row.get('Locations') or {}
    if item_type == 'Weapon':
        return 'weapon'
    if locations.get('Left_Hand') and not locations.get('Right_Hand') and not locations.get('Both_Hand'):
        return 'shield'
    if locations.get('Armor'):
        return 'armor'
    if locations.get('Garment'):
        return 'garment'
    if locations.get('Shoes'):
        return 'shoes'
    if locations.get('Head_Top'):
        return 'headTop'
    if locations.get('Head_Mid'):
        return 'headMid'
    if locations.get('Head_Low'):
        return 'headLow'
    if locations.get('Accessory_Left') and not locations.get('Accessory_Right'):
        return 'accessory1'
    if locations.get('Accessory_Right') and not locations.get('Accessory_Left'):
        return 'accessory2'
    if locations.get('Accessory_Left') or locations.get('Accessory_Right'):
        return 'accessory1'
    return None


def classify(row: dict[str, Any]) -> tuple[str, str, str]:
    original = str(row.get('Type', 'Etc'))
    item_type = original.lower()
    if item_type == 'weapon':
        return 'equipment', 'weapon', WEAPON_MAP.get(str(row.get('SubType', '')), 'other')
    if item_type in {'armor', 'shadowgear'}:
        category = 'shadow' if item_type == 'shadowgear' else 'armor'
        return 'equipment', category, str(row.get('SubType', 'other')).lower()
    if item_type == 'card':
        return 'card', 'card', 'monster_card'
    if item_type in {'healing', 'usable', 'delayconsume', 'cash'}:
        return 'consume', 'consumable', item_type
    if item_type in {'petegg', 'petarmor'}:
        return 'pet', 'pet', item_type
    if item_type == 'ammo':
        return 'etc', 'ammo', 'ammunition'
    return 'etc', 'drop_misc', 'material'


def make_record(item_id: int, ra: dict[str, Any], info: dict[str, Any]) -> dict[str, Any]:
    runtime_type, category, sub_category = classify(ra)
    buy = int(ra.get('Buy', 20) or 20)
    sell = int(ra.get('Sell', buy // 2) if ra.get('Sell') is not None else buy // 2)
    slots = int(ra.get('Slots', info.get('slotCount', 0)) or 0)
    name = str(info.get('name') or ra.get('Name') or item_id)
    aegis = str(ra.get('AegisName') or item_id)
    record: dict[str, Any] = {
        'id': item_id,
        'officialId': item_id,
        'Id': item_id,
        'AegisName': aegis,
        'aegisName': aegis,
        'Name': name,
        'name': name,
        'Type': ra.get('Type', 'Etc'),
        'dbType': ra.get('Type', 'Etc'),
        'type': runtime_type,
        'category': category,
        'subCategory': sub_category,
        'Buy': buy,
        'buyPrice': buy,
        'Sell': sell,
        'sellPrice': sell,
        'description': info.get('description', []),
        'slots': slots,
        'slotCount': slots,
        'Slots': slots,
        'ClassNum': int(info.get('ClassNum', 0) or 0),
        'dataSource': '台服 itemInfo_UTF8.lub + rAthena Renewal 2026-06-08；0.9.82HO 經典箱子官方獎池啟用',
    }
    icon_path = ROOT / f'images/items/{item_id}.webp'
    if icon_path.exists():
        record['icon'] = f'images/items/{item_id}.webp'

    for key, alias in (
        ('SubType', 'dbSubType'), ('Attack', 'atk'), ('MagicAttack', 'matk'),
        ('Defense', 'def'), ('Range', 'range'), ('WeaponLevel', 'weaponLevel'),
        ('ArmorLevel', 'armorLevel'), ('EquipLevelMin', 'equipLevelMin'),
        ('Jobs', 'equipJobs'), ('Classes', 'equipClasses'), ('Locations', 'locations'),
        ('Refineable', 'refineable'), ('Gradable', 'gradable'), ('View', 'viewId'),
        ('Script', 'scriptRaw'), ('EquipScript', 'equipScriptRaw'), ('UnEquipScript', 'unEquipScriptRaw'),
    ):
        if key in ra:
            record[key] = ra[key]
            record[alias] = ra[key]
    slot = infer_slot(ra)
    if slot:
        record['slot'] = slot
    if record.get('EquipLevelMin') is not None:
        record['requiredLevel'] = record['EquipLevelMin']
    if record.get('Type') == 'Weapon':
        record['weaponType'] = WEAPON_MAP.get(str(record.get('SubType', '')), 'other')
        locations = record.get('Locations') or {}
        record['handed'] = 2 if locations.get('Both_Hand') else 1
    if record.get('Type') == 'Card':
        record['cardTarget'] = []
    return record


def compact_record(record: dict[str, Any]) -> dict[str, Any]:
    keys = (
        'id', 'officialId', 'name', 'type', 'category', 'subCategory', 'slot', 'icon',
        'buyPrice', 'sellPrice', 'slots', 'slotCount', 'requiredLevel', 'ClassNum',
        'AegisName', 'aegisName', 'weaponType', 'handed', 'manualUseOnly',
        'noDecompose', 'lootBoxId', 'dataSource',
    )
    return {key: record[key] for key in keys if key in record}


def build() -> dict[str, Any]:
    ra_by_id, ra_by_aegis = load_ra_items()
    ra_groups = load_ra_groups()
    item_index = read_json(INDEX_PATH)
    consumables = read_json(CONSUMABLES_PATH)
    manifest = read_json(MANIFEST_PATH)
    existing_box_data = read_json(BOX_DATA_PATH)
    previous_owned_ids = set()
    if REWARD_DATA_PATH.exists():
        previous_owned_ids = {int(key) for key in read_json(REWARD_DATA_PATH)}

    box_ids = {int(spec['itemId']) for spec in BOXES.values()}
    reward_rel = REWARD_DATA_PATH.relative_to(ROOT).as_posix()
    consumables_rel = CONSUMABLES_PATH.relative_to(ROOT).as_posix()

    # Build the authoritative existing-item set from full split files, not the
    # compact item_index (which intentionally does not cover every live item).
    # The three boxes used to exist as generic monster-drop records; migrate
    # them to consumables.json so each item ID has exactly one canonical source.
    canonical_records: dict[int, dict[str, Any]] = {}
    for rel in list(manifest.get('allDataPaths') or []):
        if rel == reward_rel:
            continue
        path = ROOT / rel
        if not path.exists():
            continue
        data = read_json(path)
        changed = False
        if isinstance(data, dict):
            cleaned = {}
            for key, row in data.items():
                if not isinstance(row, dict):
                    cleaned[key] = row
                    continue
                raw_id = row.get('id', row.get('Id', row.get('officialId', key)))
                try:
                    item_id = int(raw_id)
                except (TypeError, ValueError):
                    cleaned[key] = row
                    continue
                if item_id in box_ids and rel != consumables_rel:
                    changed = True
                    continue
                cleaned[key] = row
                if item_id not in box_ids:
                    canonical_records[item_id] = row
            if changed:
                write_json(path, cleaned)
        elif isinstance(data, list):
            cleaned_list = []
            for row in data:
                if not isinstance(row, dict):
                    cleaned_list.append(row)
                    continue
                raw_id = row.get('id', row.get('Id', row.get('officialId')))
                try:
                    item_id = int(raw_id)
                except (TypeError, ValueError):
                    cleaned_list.append(row)
                    continue
                if item_id in box_ids and rel != consumables_rel:
                    changed = True
                    continue
                cleaned_list.append(row)
                if item_id not in box_ids:
                    canonical_records[item_id] = row
            if changed:
                write_json(path, cleaned_list)

    reward_ids: set[int] = set()
    box_payloads: dict[str, Any] = {}
    pool_audit: dict[str, Any] = {}

    for box_key, spec in BOXES.items():
        group = ra_groups.get(spec['group'])
        if not group:
            raise RuntimeError(f"Missing RA group {spec['group']}")
        subgroups = group.get('SubGroups') or []
        subgroup = next((row for row in subgroups if int(row.get('SubGroup', -1)) == 6), None)
        if not subgroup or str(subgroup.get('Algorithm')) != 'Random':
            raise RuntimeError(f"Unexpected RA group schema for {spec['group']}")
        rewards: list[dict[str, Any]] = []
        total_weight = 0
        for source in subgroup.get('List') or []:
            aegis = str(source.get('Item') or '')
            ra_item = ra_by_aegis.get(aegis)
            if not ra_item:
                raise RuntimeError(f"Unknown Aegis item {aegis} in {spec['group']}")
            item_id = int(ra_item['Id'])
            quantity = max(1, int(source.get('Amount', 1) or 1))
            weight = max(0, int(source.get('Rate', 0) or 0))
            if weight <= 0:
                continue
            rewards.append({
                'itemId': item_id,
                'quantity': quantity,
                'weight': weight,
                'raIndex': int(source.get('Index', len(rewards))),
                'aegisName': aegis,
            })
            reward_ids.add(item_id)
            total_weight += weight
        if not rewards or total_weight <= 0:
            raise RuntimeError(f"Empty RA reward group {spec['group']}")
        box_payloads[box_key] = {
            'itemId': spec['itemId'],
            'name': spec['name'],
            'consumeCount': 1,
            'drawCount': 1,
            'selection': 'weighted',
            'source': {
                'engine': 'rAthena Renewal',
                'snapshot': '2026-06-08',
                'path': 'db/re/item_group_db.yml',
                'group': spec['group'],
                'subGroup': 6,
                'algorithm': 'Random',
            },
            'rewards': rewards,
            'publicProbability': {
                'rewardRows': len(rewards),
                'uniqueRewardItems': len({row['itemId'] for row in rewards}),
                'totalWeight': total_weight,
                'formula': 'reward.weight / totalWeight',
            },
        }
        pool_audit[box_key] = {
            'group': spec['group'],
            'itemId': spec['itemId'],
            'rewardRows': len(rewards),
            'uniqueRewardItems': len({row['itemId'] for row in rewards}),
            'totalWeight': total_weight,
        }

    all_target_ids = reward_ids | {int(spec['itemId']) for spec in BOXES.values()}
    item_info = parse_iteminfo(all_target_ids)
    missing_iteminfo = sorted(all_target_ids - set(item_info))
    if missing_iteminfo:
        raise RuntimeError(f"Missing itemInfo rows: {missing_iteminfo[:20]}")

    # Activate the three container items in the same consumable/loot-box format as the Dim Glacier box.
    for box_key, spec in BOXES.items():
        item_id = int(spec['itemId'])
        ra = ra_by_id[item_id]
        info = item_info[item_id]
        total_weight = int(box_payloads[box_key]['publicProbability']['totalWeight'])
        reward_rows = int(box_payloads[box_key]['publicProbability']['rewardRows'])
        box_record = make_record(item_id, ra, info)
        box_record.update({
            'type': 'consume',
            'category': 'loot_box',
            'subCategory': spec['subCategory'],
            'manualUseOnly': True,
            'noDecompose': True,
            'lootBoxId': box_key,
            'description': list(info.get('description') or []) + [
                f"開啟後依 rAthena Renewal {spec['group']} 官方獎池抽取 1 項物品。",
                f"官方獎池共 {reward_rows} 項加權結果，總權重 {total_weight}。",
            ],
            'dataSource': f"台服 itemInfo_UTF8.lub + rAthena Renewal 2026-06-08 {spec['group']}；RO_WEB 0.9.82HO",
        })
        consumables[str(item_id)] = box_record
        item_index[str(item_id)] = compact_record(box_record)

    # Add only rewards absent from all authoritative split files. Existing
    # richer records are reused, and their compact index summaries are restored
    # in case an earlier build temporarily overlaid them.
    for item_id in sorted(reward_ids & set(canonical_records)):
        item_index[str(item_id)] = compact_record(canonical_records[item_id])
    missing_reward_ids = sorted(reward_ids - set(canonical_records) - box_ids)
    reward_records: dict[str, Any] = {}
    for item_id in missing_reward_ids:
        reward_records[str(item_id)] = make_record(item_id, ra_by_id[item_id], item_info[item_id])
        item_index[str(item_id)] = compact_record(reward_records[str(item_id)])

    # Merge the three official boxes beside the existing Dim Glacier box.
    merged_boxes = dict(existing_box_data.get('boxes') or {})
    merged_boxes.update(box_payloads)
    item_boxes = {
        'version': VERSION,
        'schema': 'ro_web_item_boxes_v2',
        'policy': {
            'selection': 'weighted_single_reward',
            'futureRAItemGroupCompatible': True,
            'consumeBeforeReward': True,
            'transactionRollback': True,
            'missingRewardPolicy': 'abort_without_consuming; never reweight the pool silently',
        },
        'boxes': merged_boxes,
    }

    write_json(REWARD_DATA_PATH, dict(sorted(reward_records.items(), key=lambda pair: int(pair[0]))))
    write_json(CONSUMABLES_PATH, dict(sorted(consumables.items(), key=lambda pair: int(pair[0]))))
    write_json(INDEX_PATH, dict(sorted(item_index.items(), key=lambda pair: int(pair[0]))))
    write_json(BOX_DATA_PATH, item_boxes)

    paths = manifest.setdefault('allDataPaths', [])
    if reward_rel not in paths:
        paths.append(reward_rel)
    manifest['allDataPaths'] = sorted(dict.fromkeys(paths))
    manifest['version'] = VERSION
    note_line = '0.9.82HO enables the official RA Gift Box, Old Blue Box and Old Purple Box pools through ItemBoxRuntime.'
    base_note = str(manifest.get('note') or '')
    while note_line in base_note:
        base_note = base_note.replace(' ' + note_line, '').replace(note_line, '')
    manifest['note'] = (base_note.rstrip() + ' ' + note_line).strip()
    manifest['raClassicBoxes'] = {
        'version': VERSION,
        'source': 'rAthena Renewal 2026-06-08 db/re/item_group_db.yml',
        'boxes': pool_audit,
        'unionRewardItemCount': len(reward_ids),
        'newRewardItemRecords': len(reward_records),
        'boxItemIds': sorted(box_ids),
        'probabilityPolicy': 'Exact RA Rate weights; unavailable reward data aborts without consuming and is never removed from denominator.',
    }
    write_json(MANIFEST_PATH, manifest)

    missing_icons = sorted(item_id for item_id in all_target_ids if not (ROOT / f'images/items/{item_id}.webp').exists())
    report = {
        'version': VERSION,
        'status': 'PASS',
        'boxes': pool_audit,
        'unionRewardItemCount': len(reward_ids),
        'newRewardItemRecords': len(reward_records),
        'existingRewardItemRecordsReused': len(reward_ids) - len(reward_records),
        'boxItemIds': sorted(box_ids),
        'missingItemInfo': missing_iteminfo,
        'missingIcons': missing_icons,
        'missingIconCount': len(missing_icons),
        'missingIconPolicy': 'Inventory UI already hides unavailable image nodes; item data and exact probability remain active.',
    }
    write_json(ROOT / 'tools/ra_classic_boxes_build_report_0.9.82HO.json', report)
    return report


if __name__ == '__main__':
    print(json.dumps(build(), ensure_ascii=False, indent=2))
