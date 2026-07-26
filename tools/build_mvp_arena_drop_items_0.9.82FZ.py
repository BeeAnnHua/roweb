#!/usr/bin/env python3
from __future__ import annotations
import json, re, zipfile
from pathlib import Path
import yaml

ROOT=Path(__file__).resolve().parents[1]
RA=Path('/mnt/data/ra_extract/rathena-master/db/re')
ITEMINFO=Path('/mnt/data/itemInfo_UTF8.lub')
ICON_ZIP=Path('/mnt/data/items(1).zip')
OUT=ROOT/'data/items/mvp_arena_original_drops_0_9_82FZ.json'
ICON_DIR=ROOT/'images/items'
VERSION='0.9.82FZ'
MAP_ID='geffenia_mvp_arena_3x3_region_camera'


def load_existing_ids():
    manifest=json.loads((ROOT/'data/items/database_manifest.json').read_text(encoding='utf-8'))
    ids=set()
    for rel in manifest.get('allDataPaths',[]):
        p=ROOT/rel
        if not p.exists() or p.name=='mvp_arena_original_drops_0_9_82FZ.json': continue
        d=json.loads(p.read_text(encoding='utf-8-sig'))
        rows=d.values() if isinstance(d,dict) else d if isinstance(d,list) else []
        for r in rows:
            if not isinstance(r,dict): continue
            x=r.get('id',r.get('Id',r.get('officialId')))
            try: ids.add(int(x))
            except: pass
    return ids,manifest


def arena_monster_ids():
    maps=json.loads((ROOT/'data/maps.json').read_text(encoding='utf-8'))
    row=next((m for m in maps if m.get('id')==MAP_ID),None)
    return {int(x) for x in (row or {}).get('monsters',[])}

def drop_ids():
    target=arena_monster_ids()
    mons=json.loads((ROOT/'data/monsters.json').read_text(encoding='utf-8'))
    return {int(d['itemId']) for m in mons if int(m.get('id',0)) in target for d in m.get('drops',[]) if int(d.get('itemId',0))>0}


def lua_unescape(s:str)->str:
    return (s.replace('\\r','\r').replace('\\n','\n').replace('\\t','\t')
             .replace('\\"','"').replace("\\'", "'").replace('\\\\','\\'))


def parse_iteminfo(target:set[int]):
    text=ITEMINFO.read_text(encoding='utf-8-sig')
    pat=re.compile(r'^\s*\[(\d+)\]\s*=\s*\{',re.M)
    matches=list(pat.finditer(text)); out={}
    for i,m in enumerate(matches):
        iid=int(m.group(1))
        if iid not in target: continue
        block=text[m.end(): matches[i+1].start() if i+1<len(matches) else len(text)]
        nm=re.search(r'(?m)^\s*identifiedDisplayName\s*=\s*"((?:\\.|[^"\\])*)"',block)
        if not nm:
            nm=re.search(r'(?m)^\s*unidentifiedDisplayName\s*=\s*"((?:\\.|[^"\\])*)"',block)
        name=lua_unescape(nm.group(1)) if nm else str(iid)
        dm=re.search(r'(?ms)^\s*identifiedDescriptionName\s*=\s*\{(.*?)\}\s*,',block)
        descriptions=[]
        if dm:
            for sm in re.finditer(r'"((?:\\.|[^"\\])*)"',dm.group(1)):
                line=lua_unescape(sm.group(1)).strip()
                plain=re.sub(r'\^[0-9A-Fa-f]{6}','',line).strip()
                if not plain or plain=='_': continue
                if plain.startswith('重量 :') or plain.startswith('重量:'): continue
                descriptions.append(line)
        slots=re.search(r'slotCount\s*=\s*(\d+)',block)
        cls=re.search(r'ClassNum\s*=\s*(\d+)',block)
        out[iid]={'name':name,'description':descriptions,'slotCount':int(slots.group(1)) if slots else 0,'ClassNum':int(cls.group(1)) if cls else 0}
    return out


def load_ra_items():
    out={}
    for filename in ['item_db_usable.yml','item_db_equip.yml']:
        d=yaml.safe_load((RA/filename).read_text(encoding='utf-8')) or {}
        for row in d.get('Body',[]) or []:
            if isinstance(row,dict) and 'Id' in row: out[int(row['Id'])]=row
    return out

WEAPON_MAP={
'Dagger':'dagger','1hSword':'sword','2hSword':'twoHandSword','1hSpear':'spear','2hSpear':'spear',
'1hAxe':'axe','2hAxe':'axe','Mace':'mace','2hMace':'mace','Staff':'staff','2hStaff':'staff',
'Bow':'bow','Knuckle':'knuckle','Musical':'instrument','Whip':'whip','Book':'book','Katar':'katar',
'Revolver':'gun','Rifle':'gun','Gatling':'gun','Shotgun':'gun','Grenade':'gun','Huuma':'ninja','Shuriken':'ninja'
}

def infer_slot(row):
    typ=str(row.get('Type',''))
    loc=row.get('Locations') or {}
    if typ=='Weapon': return 'weapon'
    if loc.get('Left_Hand') and not loc.get('Right_Hand') and not loc.get('Both_Hand'): return 'shield'
    if loc.get('Armor'): return 'armor'
    if loc.get('Garment'): return 'garment'
    if loc.get('Shoes'): return 'shoes'
    if loc.get('Head_Top'): return 'headTop'
    if loc.get('Head_Mid'): return 'headMid'
    if loc.get('Head_Low'): return 'headLow'
    if loc.get('Accessory_Left') and not loc.get('Accessory_Right'): return 'accessory1'
    if loc.get('Accessory_Right') and not loc.get('Accessory_Left'): return 'accessory2'
    if loc.get('Accessory_Left') or loc.get('Accessory_Right'): return 'accessory1'
    return None


def classify(row):
    typ=str(row.get('Type','Etc'))
    if typ=='Weapon': return 'equipment','weapon',WEAPON_MAP.get(str(row.get('SubType','')),'other')
    if typ in {'Armor','ShadowGear'}: return 'equipment','shadow' if typ=='ShadowGear' else 'armor',str(row.get('SubType','other')).lower()
    if typ=='Card': return 'card','card','monster_card'
    if typ in {'Healing','Usable','Delayconsume','Cash'}: return 'consume','consumable',typ.lower()
    if typ in {'PetEgg','PetArmor'}: return 'pet','pet',typ.lower()
    if typ=='Ammo': return 'etc','ammo','ammunition'
    return 'etc','drop_misc','material'


def make_record(iid,ra,info):
    ra=ra or {'Id':iid,'AegisName':str(iid),'Name':str(iid),'Type':'Etc','Buy':20}
    info=info or {}
    typ,cat,sub=classify(ra)
    buy=int(ra.get('Buy',20) or 20); sell=int(ra.get('Sell',buy//2) if ra.get('Sell') is not None else buy//2)
    slots=int(ra.get('Slots',info.get('slotCount',0)) or 0)
    name=info.get('name') or ra.get('Name') or str(iid)
    rec={
      'id':iid,'officialId':iid,'name':name,'type':typ,'category':cat,'subCategory':sub,
      'sellPrice':sell,'description':info.get('description',[]),'icon':f'images/items/{iid}.webp',
      'buyPrice':buy,'slots':slots,'slotCount':slots,'ClassNum':int(info.get('ClassNum',0) or 0),
      'dataSource':'itemInfo_UTF8.lub identified fields + rAthena Renewal 2026-06-08 item DB; activated for 0.9.82FZ MVP arena original drops',
      'Id':iid,'Name':name,'Buy':buy,'Sell':sell,'Slots':slots,
      'AegisName':ra.get('AegisName',str(iid)),'aegisName':ra.get('AegisName',str(iid)),
      'Type':ra.get('Type','Etc'),'dbType':ra.get('Type','Etc')
    }
    for key,alias in [('SubType','dbSubType'),('Attack','atk'),('MagicAttack','matk'),('Defense','def'),('Range','range'),('WeaponLevel','weaponLevel'),('ArmorLevel','armorLevel'),('EquipLevelMin','equipLevelMin'),('Jobs','equipJobs'),('Classes','equipClasses'),('Locations','locations'),('Refineable','refineable'),('Gradable','gradable'),('View','viewId'),('Script','scriptRaw'),('EquipScript','equipScriptRaw'),('UnEquipScript','unEquipScriptRaw')]:
        if key in ra:
            rec[key]=ra[key]; rec[alias]=ra[key]
    slot=infer_slot(ra)
    if slot: rec['slot']=slot
    if rec.get('EquipLevelMin') is not None: rec['requiredLevel']=rec['EquipLevelMin']
    if rec.get('Type')=='Weapon':
        rec['weaponType']=WEAPON_MAP.get(str(rec.get('SubType','')),'other')
        loc=rec.get('Locations') or {}
        rec['handed']=2 if loc.get('Both_Hand') else 1
    if rec.get('Type')=='Card': rec['cardTarget']=[]
    return rec


def extract_icons(ids:set[int]):
    ICON_DIR.mkdir(parents=True,exist_ok=True)
    missing=[]; extracted=0
    with zipfile.ZipFile(ICON_ZIP) as z:
        suffix_to_name={}
        for n in z.namelist():
            if n.endswith('.webp'):
                if '/items/' in n: suffix=n.rsplit('/items/',1)[1]
                elif n.startswith('items/'): suffix=n.split('/',1)[1]
                else: continue
                suffix_to_name[suffix]=n
        for iid in sorted(ids):
            dest=ICON_DIR/f'{iid}.webp'
            if dest.exists(): continue
            n=suffix_to_name.get(f'{iid}.webp')
            if not n: missing.append(iid); continue
            dest.write_bytes(z.read(n)); extracted+=1
    return extracted,missing


def main():
    old_records={}
    if OUT.exists():
        try: old_records=json.loads(OUT.read_text(encoding='utf-8-sig'))
        except Exception: old_records={}
    existing,manifest=load_existing_ids(); needed=drop_ids()-existing
    info=parse_iteminfo(needed); ra=load_ra_items()
    records={str(i):make_record(i,ra.get(i),info.get(i)) for i in sorted(needed)}
    OUT.write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    rel=str(OUT.relative_to(ROOT)).replace('\\','/')
    paths=manifest.setdefault('allDataPaths',[])
    if rel not in paths: paths.append(rel)
    manifest['version']=VERSION
    manifest['monsterDropActivation']={
      'version':VERSION,'recordCount':len(records),'source':'51 MVP original rAthena Renewal drop tables',
      'note':'Only item IDs referenced by the active MVP arena monster pools and missing from the existing split Item DB are added here.'
    }
    (ROOT/'data/items/database_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    idx_path=ROOT/'data/items/item_index.json'
    index=json.loads(idx_path.read_text(encoding='utf-8'))
    for key in old_records:
        index.pop(str(key),None)
    for key,rec in records.items():
        index[key]={k:rec[k] for k in ('id','officialId','name','type','category','subCategory','slot','icon','buyPrice','sellPrice','slots','slotCount','requiredLevel','ClassNum','AegisName','aegisName','weaponType','handed','dataSource') if k in rec}
    idx_path.write_text(json.dumps(index,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    record_ids={int(i) for i in records}
    extracted,missing_icons=extract_icons(record_ids)
    missing_ra=sorted(record_ids-set(ra)); missing_info=sorted(record_ids-set(info))
    report={'version':VERSION,'status':'PASS' if not missing_icons else 'WARN','needed':len(needed),'records':len(records),'iconsExtracted':extracted,'missingIcons':missing_icons,'missingRa':missing_ra,'missingItemInfo':missing_info}
    (ROOT/'tools/mvp_arena_drop_item_audit_0.9.82FZ.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__': main()
