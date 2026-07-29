#!/usr/bin/env python3
from pathlib import Path
import json,re
ROOT=Path(__file__).resolve().parents[1]
VER='0.9.82HG'
ids=[21520,21521,21522,21523,21524,21525,21526,21527,21537]
expected={6225:100,6226:100,1000368:500,1000369:100,1000370:500,1000371:100}
checks=[]
def ok(name,cond,detail=''):
    checks.append((name,bool(cond),detail))

drops=json.loads((ROOT/'data/enchant_grade_map_drops.json').read_text(encoding='utf-8'))
ice=drops['profiles']['ice_scale_hill_3x3_region_camera']['entries']
serp=drops['profiles']['serpent_nest_3x3_region_camera']['entries']
for item,chance in expected.items():
    rows=[e for e in ice if int(e.get('itemId',0))==item]
    ok(f'ice entry {item}',len(rows)==1,str(rows))
    if rows:
        e=rows[0]
        ok(f'ice ids {item}',e.get('monsterIds')==ids,str(e.get('monsterIds')))
        ok(f'ice chance {item}',int(e.get('chance',-1))==chance,str(e.get('chance')))
        ok(f'normal mode {item}',e.get('rateMode')=='normal',str(e.get('rateMode')))
    ok(f'not serpent {item}',not any(int(e.get('itemId',0))==item for e in serp))
idx=json.loads((ROOT/'data/items/item_index.json').read_text(encoding='utf-8'))
for item in expected:
    d=idx.get(str(item))
    ok(f'item data {item}',bool(d),str(d))
    ok(f'icon {item}',bool(d) and (ROOT/d['icon']).is_file(),d.get('icon') if d else '')
js=(ROOT/'js/enchant_grade_runtime.js').read_text(encoding='utf-8')
mapjs=(ROOT/'js/map.js').read_text(encoding='utf-8')
ok('runtime global scaler','getScaledMapDropChance' in js and 'getFinalDropChanceBasisPoints' in js)
ok('runtime roll uses entry','const chance=getScaledMapDropChance(e)' in js)
ok('map viewer scaler','getScaledMapDropChance?.(drop)' in mapjs)
ok('map viewer normal grouping','const mapNormal=' in mapjs and 'original:[...original,...mapNormal]' in mapjs)
ok('game version',f'RO_WEB_VERSION = "{VER}"' in (ROOT/'js/game.js').read_text(encoding='utf-8'))
ok('index cache',f'<title>RO_WEB {VER}</title>' in (ROOT/'index.html').read_text(encoding='utf-8') and '0.9.82HF' not in (ROOT/'index.html').read_text(encoding='utf-8'))
failed=[x for x in checks if not x[1]]
for name,passed,detail in checks: print(('PASS' if passed else 'FAIL'),name,detail)
print(json.dumps({'version':VER,'checks':len(checks),'failed':len(failed)},ensure_ascii=False))
raise SystemExit(1 if failed else 0)
