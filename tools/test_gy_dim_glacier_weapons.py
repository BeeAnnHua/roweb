#!/usr/bin/env python3
from __future__ import annotations
import json,re
from pathlib import Path
import yaml
ROOT=Path(__file__).resolve().parents[1]
RA=Path('/mnt/data/_ra/rathena-master/db/re/item_db_equip.yml')
idx=json.loads((ROOT/'data/items/item_index.json').read_text(encoding='utf-8'))
catalog=json.loads((ROOT/'data/dim_glacier_enchant.json').read_text(encoding='utf-8'))
ids=[int(x) for x in catalog['targetWeaponIds']]
ra_doc=yaml.safe_load(RA.read_text(encoding='utf-8'))
ra_rows={int(x['Id']):x for x in ra_doc.get('Body',[]) if int(x.get('Id',0)) in ids}
checks=[]
def check(name,ok,detail=None): checks.append({'name':name,'pass':bool(ok),'detail':detail})
check('exactly 26 target weapons',len(ids)==26 and len(set(ids))==26,ids)
check('all 26 exist in RA',len(ra_rows)==26,sorted(set(ids)-set(ra_rows)))
rows=[]
for item_id in ids:
    item=idx.get(str(item_id)); ra=ra_rows.get(item_id,{}); errors=[]
    if not item: errors.append('missing item_index')
    else:
        if item.get('type')!='equipment' or item.get('category')!='weapon': errors.append('not equipment weapon')
        if int(item.get('atk',0))!=int(ra.get('Attack',0)): errors.append(f"ATK {item.get('atk')} != RA {ra.get('Attack')}")
        # RA may store MATK in MagicAttack or as an item script (bows/guns).
        script=str(ra.get('Script','') or '')
        m=re.search(r'bonus\s+bMatk\s*,\s*(-?\d+)\s*;',script)
        script_matk=int(m.group(1)) if m else 0
        base_matk=int(ra.get('MagicAttack',0) or 0)
        expected_matk=base_matk+script_matk
        runtime_script=str(item.get('scriptRaw') or item.get('Script') or '')
        actual_matk=int(item.get('matk',0))+ (script_matk if 'bMatk' in runtime_script else 0)
        if actual_matk!=expected_matk: errors.append(f"effective MATK {actual_matk} != RA {expected_matk}")
        if int(item.get('weaponLevel',0))!=int(ra.get('WeaponLevel',0)): errors.append('weaponLevel mismatch')
        if int(item.get('requiredLevel',0))!=int(ra.get('EquipLevelMin',0)): errors.append('requiredLevel mismatch')
        if int(item.get('slotCount',0))!=int(ra.get('Slots',0)): errors.append('slot count mismatch')
        if not item.get('refineable'): errors.append('not refineable')
        if not item.get('gradable'): errors.append('not gradable')
        if not item.get('equipJobs'): errors.append('missing jobs')
        if not item.get('locations'): errors.append('missing locations')
        if not item.get('weaponType'): errors.append('missing weapon type')
        if not (ROOT/item.get('icon','')).is_file(): errors.append('missing icon')
        # Base effect values must be positive and usable by status/combat systems.
        if int(item.get('atk',0))<=0: errors.append('nonpositive ATK')
        if expected_matk>0 and actual_matk<=0: errors.append('missing effective MATK')
        # Script-only properties from RA must remain in item data.
        if 'bUnbreakableWeapon' in script and 'bUnbreakableWeapon' not in str(item.get('scriptRaw') or item.get('Script') or ''): errors.append('lost unbreakable script')
    rows.append({'id':item_id,'name':item.get('name') if item else None,'atk':item.get('atk') if item else None,'matk':item.get('matk') if item else None,'weaponType':item.get('weaponType') if item else None,'jobs':sorted((item.get('equipJobs') or {}).keys()) if item else [],'errors':errors})
check('all 26 base weapon definitions match RA',all(not x['errors'] for x in rows),[x for x in rows if x['errors']])
# Static integration assertions: status system consumes item atk/matk and CardRuntime sources.
status=(ROOT/'js/status_system.js').read_text(encoding='utf-8')
check('status runtime consumes base equipment ATK/MATK','equip.atk' in status and 'equip.matk' in status and 'getEquippedStatusSources()' in status,None)
check('status runtime includes CardRuntime enchant sources','window.CardRuntime?.getSources' in status,None)
report={'version':'0.9.82GY','weaponCount':len(rows),'checks':checks,'passed':sum(x['pass'] for x in checks),'failed':sum(not x['pass'] for x in checks),'weapons':rows}
(ROOT/'GY_DIM_GLACIER_WEAPON_EFFECT_TEST.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'passed':report['passed'],'failed':report['failed'],'weaponCount':len(rows),'bad':[x for x in rows if x['errors']]},ensure_ascii=False,indent=2))
raise SystemExit(1 if report['failed'] else 0)
