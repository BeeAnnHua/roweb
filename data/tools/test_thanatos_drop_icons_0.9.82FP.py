#!/usr/bin/env python3
from pathlib import Path
import json
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
spawn = json.loads((ROOT/'data/monster_spawn_config.json').read_text(encoding='utf-8'))
region = (spawn.get('regions') or spawn)['thanatos_tower_3x3_region_camera']
monster_ids = {int(row['monsterId']) for row in region['pool']}
monsters = {int(row['id']):row for row in json.loads((ROOT/'data/monsters.json').read_text(encoding='utf-8'))}
assert not (monster_ids - set(monsters)), f'Missing monsters: {sorted(monster_ids-set(monsters))}'
drop_ids = {int(drop['itemId']) for mid in monster_ids for drop in monsters[mid].get('drops', []) if drop.get('itemId')}
manifest = json.loads((ROOT/'data/items/database_manifest.json').read_text(encoding='utf-8'))
record_ids = set()
for relative in manifest['allDataPaths']:
    data = json.loads((ROOT/relative).read_text(encoding='utf-8'))
    rows = data if isinstance(data, list) else list(data.values())
    for row in rows:
        if isinstance(row, dict) and row.get('id', row.get('Id')) is not None:
            record_ids.add(int(row.get('id', row.get('Id'))))
assert not (drop_ids-record_ids), f'Missing item records: {sorted(drop_ids-record_ids)}'
for item_id in drop_ids:
    icon = ROOT/f'images/items/{item_id}.webp'
    if not icon.exists(): icon = ROOT/f'images/items/{item_id}.png'
    assert icon.exists(), f'Missing icon: {item_id}'
    with Image.open(icon) as image: image.verify()
print(f'PASS Thanatos: {len(monster_ids)} monsters, {len(drop_ids)} unique drops, all item records/icons decoded')
