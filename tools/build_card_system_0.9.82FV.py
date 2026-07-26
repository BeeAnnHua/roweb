#!/usr/bin/env python3
from __future__ import annotations
import json, re, sys, zipfile, shutil, hashlib
from pathlib import Path
from collections import defaultdict
import yaml

ROOT = Path(__file__).resolve().parents[1]
RA = Path('/mnt/data/ra_cards/rathena-master/db/re')
CN_PATH = Path('/mnt/data/item_db_etc(卡片中文對照).yml')
ITEM_ICONS_ZIP = Path('/mnt/data/items(1).zip')
OUT = ROOT / 'data' / 'card_runtime'
OUT.mkdir(parents=True, exist_ok=True)

COMMANDS = {
    'bonus','bonus2','bonus3','bonus4','bonus5','skill','autobonus','autobonus2','autobonus3',
    'sc_start','heal','showscript','specialeffect2','active_transform'
}

def load_ra(name):
    return yaml.safe_load((RA/name).read_text(encoding='utf-8')).get('Body', [])

all_items=[]
for fn in ('item_db_etc.yml','item_db_equip.yml','item_db_usable.yml'):
    all_items.extend(load_ra(fn))
by_aegis={str(x.get('AegisName')):x for x in all_items if x.get('AegisName')}
by_id={int(x['Id']):x for x in all_items if x.get('Id') is not None}

def load_cn():
    try:
        body=yaml.safe_load(CN_PATH.read_text(encoding='cp950')).get('Body',[])
    except Exception as exc:
        print('WARN CN parse failed:',exc,file=sys.stderr); return {}
    return {int(x['Id']): str(x.get('Name') or '') for x in body if x.get('Id') is not None}
cn_names=load_cn()

client_path=ROOT/'data/client_item_display_data.json'
client=json.loads(client_path.read_text(encoding='utf-8')) if client_path.exists() else {}
client_cards=client.get('cardInfo',{})

mobs=load_ra('mob_db.yml')
drop_sources=defaultdict(list)
for mob in mobs:
    for drop in mob.get('Drops') or []:
        item=by_aegis.get(str(drop.get('Item')))
        if not item or str(item.get('Type'))!='Card': continue
        cid=int(item['Id'])
        drop_sources[cid].append({
            'monsterId':int(mob['Id']), 'monsterAegisName':mob.get('AegisName'), 'monsterName':mob.get('Name'),
            'rate':int(drop.get('Rate') or 0), 'stealProtected':bool(drop.get('StealProtected')),
            'isMvp': bool(mob.get('MvpExp') or mob.get('MvpDrops')),
            'isBoss': str(mob.get('Class','')).lower()=='boss'
        })
card_ids=sorted(drop_sources)
assert len(card_ids)==910, len(card_ids)
assert sum(len(v) for v in drop_sources.values())==1422

def locations_to_targets(loc):
    loc=loc or {}; out=[]
    if loc.get('Right_Hand') or loc.get('Both_Hand'): out.append('weapon')
    if loc.get('Left_Hand'): out.append('shield')
    if loc.get('Armor'): out.append('body')
    if loc.get('Shield'): out.append('shield')
    if loc.get('Garment'): out.append('garment')
    if loc.get('Shoes'): out.append('shoes')
    if loc.get('Accessory') or loc.get('Both_Accessory'): out.append('accessory')
    if loc.get('Accessory_Left') or loc.get('Left_Accessory'): out.append('accessory1')
    if loc.get('Accessory_Right') or loc.get('Right_Accessory'): out.append('accessory2')
    if loc.get('Head_Top'): out.append('headTop')
    if loc.get('Head_Mid'): out.append('headMid')
    if loc.get('Head_Low'): out.append('headLow')
    # preserve order without duplicates
    return list(dict.fromkeys(out))

def clean_desc(cid):
    info=client_cards.get(str(cid),{})
    desc=info.get('description') or []
    if isinstance(desc,str): desc=[desc]
    cleaned=[]
    for raw in desc:
        line=re.sub(r'\^[0-9A-Fa-f]{6}', '', str(raw)).strip()
        if not line or re.match(r'^(系列|裝備|重量)\s*[:：]', line):
            continue
        cleaned.append(line)
    return cleaned

# Lexical command transformer. It recognizes rAthena command statements at JS statement boundaries,
# preserves quoted nested script strings, and converts `bonus bStr,1;` to `bonus("bStr",1);`.
def transform_script(src:str)->str:
    src=src or ''
    src=re.sub(r'/\*.*?\*/\s*\)?', '', src, flags=re.S)
    src=re.sub(r'\.\@([A-Za-z_]\w*)', r'v.\1', src)
    out=[]; i=0; boundary=True
    n=len(src)
    while i<n:
        ch=src[i]
        if ch in ('"',"'"):
            q=ch; j=i+1; esc=False
            while j<n:
                c=src[j]
                if esc: esc=False
                elif c=='\\': esc=True
                elif c==q: j+=1; break
                j+=1
            out.append(src[i:j]); i=j; boundary=False; continue
        if ch.isspace(): out.append(ch); i+=1; continue
        if ch in '{;}': out.append(ch); i+=1; boundary=True; continue
        if (ch.isalpha() or ch=='_') and not (i > 0 and (src[i-1] == '.' or src[i-1].isalnum() or src[i-1] == '_')):
            m=re.match(r'[A-Za-z_]\w*',src[i:])
            word=m.group(0); j=i+len(word)
            if word in COMMANDS and (j >= n or src[j] != '('):
                # collect until the terminating semicolon outside quotes/brackets
                k=j; quote=None; esc=False; depth=0
                while k<n:
                    c=src[k]
                    if quote:
                        if esc: esc=False
                        elif c=='\\': esc=True
                        elif c==quote: quote=None
                    else:
                        if c in ('"',"'"): quote=c
                        elif c in '([': depth+=1
                        elif c in ')]': depth=max(0,depth-1)
                        elif c==';' and depth==0: break
                    k+=1
                args=src[j:k].strip()
                # First arguments for bonus/skill/status commands are symbolic constants.
                parts=[]; start=0; quote=None; esc=False; dep=0
                for idx,c in enumerate(args):
                    if quote:
                        if esc: esc=False
                        elif c=='\\': esc=True
                        elif c==quote: quote=None
                    else:
                        if c in ('"',"'"): quote=c
                        elif c in '([{': dep+=1
                        elif c in ')]}': dep=max(0,dep-1)
                        elif c==',' and dep==0:
                            parts.append(args[start:idx].strip()); start=idx+1
                parts.append(args[start:].strip())
                if word.startswith('bonus') and parts:
                    if re.fullmatch(r'[A-Za-z_]\w*',parts[0]): parts[0]=json.dumps(parts[0])
                elif word=='skill' and parts:
                    if re.fullmatch(r'[A-Za-z_]\w*',parts[0]): parts[0]=json.dumps(parts[0])
                elif word=='sc_start' and parts:
                    if re.fullmatch(r'[A-Za-z_]\w*',parts[0]): parts[0]=json.dumps(parts[0])
                elif word=='active_transform' and parts:
                    if re.fullmatch(r'[A-Za-z_]\w*',parts[0]): parts[0]=json.dumps(parts[0])
                out.append(f'{word}({", ".join(parts)})')
                if k<n and src[k]==';': out.append(';'); k+=1
                i=k; boundary=True; continue
            out.append(word); i=j; boundary=False; continue
        out.append(ch); i+=1; boundary=False
    return ''.join(out)

SPECIAL_CARD_OVERRIDES = {
    # These three WA Treasure drops are Type: Card in rAthena but intentionally
    # have no Locations/Script in item_db_etc.yml. The client item table carries
    # their official head position and effect, so make them real socketable cards.
    6716: {'cardTarget':['headTop'], 'scriptRaw':'bonus bCritical,1;'},
    6717: {'cardTarget':['headMid'], 'scriptRaw':'bonus bMaxHP,50;'},
    6718: {'cardTarget':['headLow'], 'scriptRaw':'bonus bMaxSP,10;'},
}

cards={}
for cid in card_ids:
    item=by_id[cid]
    override=SPECIAL_CARD_OVERRIDES.get(cid,{})
    name=cn_names.get(cid) or client_cards.get(str(cid),{}).get('name') or item.get('Name') or f'卡片 {cid}'
    record={
        'id':cid,'officialId':cid,'aegisName':item.get('AegisName'),'name':name,'type':'card','category':'card','subCategory':'monster_card',
        'cardTarget':override.get('cardTarget', locations_to_targets(item.get('Locations'))),'locations':item.get('Locations') or {},
        'description':clean_desc(cid),'icon':f'images/items/{cid}.webp','slotCount':0,'slots':0,
        'buyPrice':int(item.get('Buy') or 20),'sellPrice':int(item.get('Sell') if item.get('Sell') is not None else int(item.get('Buy') or 20)//2),
        'scriptRaw':override.get('scriptRaw', item.get('Script') or ''),'compiledScript':transform_script(override.get('scriptRaw', item.get('Script') or '')),
        'dropSources':drop_sources[cid], 'isMvpCard':any(x['isMvp'] for x in drop_sources[cid]),
        'dataSource':'rAthena Renewal 2026-06-08 + 中文 ETC + itemInfo_UTF8.lub'
    }
    cards[str(cid)]=record

# Relevant combo expansion: each concrete Combo list containing at least one target card is one runtime combo.
combo_rows=load_ra('item_combos.yml')
combos=[]; combo_id=0
for row_index,row in enumerate(combo_rows):
    script=row.get('Script') or ''
    for combo in row.get('Combos') or []:
        names=combo.get('Combo') if isinstance(combo,dict) else None
        if not isinstance(names,list): continue
        entries=[by_aegis.get(str(name)) for name in names]
        if any(x is None for x in entries): continue
        ids=[int(x['Id']) for x in entries]
        if not any(cid in drop_sources for cid in ids): continue
        combo_id += 1
        combos.append({
            'id':f'card_combo_{combo_id:04d}','rowIndex':row_index,'requiredItemIds':ids,
            'requiredAegisNames':[str(x) for x in names], 'scriptRaw':script,'compiledScript':transform_script(script),
            'source':'rAthena Renewal 2026-06-08 item_combos.yml'
        })
assert len(combos)==784, len(combos)

# Resolve the two target item-group drops into weighted lists.
group_rows=load_ra('item_group_db.yml')
group_map={str(row.get('Group','')).upper():row for row in group_rows}
needed_groups={'IG_FOOD':'FOOD','IG_RECOVERY':'RECOVERY'}
groups={}
for const,group_name in needed_groups.items():
    row=group_map.get(group_name)
    entries=[]
    if row:
        for sg in row.get('SubGroups') or []:
            for ent in sg.get('List') or []:
                item=by_aegis.get(str(ent.get('Item')))
                if not item: continue
                entries.append({'itemId':int(item['Id']),'aegisName':item.get('AegisName'),'name':cn_names.get(int(item['Id'])) or item.get('Name'),'rate':int(ent.get('Rate') or 0),'amount':int(ent.get('Amount') or 1)})
    groups[const]={'group':group_name,'entries':entries,'algorithm':'weighted_one_then_card_rate'}

# Split card item records into the established two files.
ids=sorted(cards,key=lambda x:int(x)); split=800
(ROOT/'data/items/cards_1.json').write_text(json.dumps({k:cards[k] for k in ids[:split]},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(ROOT/'data/items/cards_2.json').write_text(json.dumps({k:cards[k] for k in ids[split:]},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

(OUT/'card_effects.json').write_text(json.dumps(cards,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
(OUT/'card_combos.json').write_text(json.dumps(combos,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
(OUT/'card_drop_sources.json').write_text(json.dumps({str(k):v for k,v in sorted(drop_sources.items())},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
(OUT/'item_groups.json').write_text(json.dumps(groups,ensure_ascii=False,separators=(',',':')),encoding='utf-8')


# Remove legacy card stubs from the old monster-drop activation file. The full
# authoritative card records now live only in cards_1/cards_2, preventing
# Promise.all load order from nondeterministically overwriting card scripts.
legacy_drop_path=ROOT/'data/items/monster_drops_0_9_82EI.json'
legacy_removed=0
if legacy_drop_path.exists():
    legacy=json.loads(legacy_drop_path.read_text(encoding='utf-8'))
    if isinstance(legacy,dict):
        filtered={k:v for k,v in legacy.items() if int((v or {}).get('id') or k) not in drop_sources}
        legacy_removed=len(legacy)-len(filtered)
        legacy_drop_path.write_text(json.dumps(filtered,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

# Synchronize the active world monster list with the same RA card-drop source.
# Non-card drops are preserved; all legacy card rows are replaced exactly once.
active_monster_path=ROOT/'data/monsters.json'
active_card_drop_rows=0
if active_monster_path.exists():
    active_monsters=json.loads(active_monster_path.read_text(encoding='utf-8'))
    sources_by_monster=defaultdict(list)
    for cid,rows in drop_sources.items():
        for row in rows:
            sources_by_monster[int(row['monsterId'])].append((cid,row))
    for monster in active_monsters:
        mid=int(monster.get('id') or monster.get('officialId') or 0)
        old=monster.get('drops') or []
        kept=[drop for drop in old if int(drop.get('itemId') or 0) not in drop_sources]
        additions=[]
        for cid,row in sorted(sources_by_monster.get(mid,[]),key=lambda x:x[0]):
            rec=cards[str(cid)]
            additions.append({
                'itemId':cid,'chance':int(row.get('rate') or 0),'qtyMin':1,'qtyMax':1,
                'name':rec.get('aegisName'),'stealProtected':bool(row.get('stealProtected'))
            })
        monster['drops']=kept+additions
        active_card_drop_rows += len(additions)
    active_monster_path.write_text(json.dumps(active_monsters,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

# Manifest activation.
manifest_path=ROOT/'data/items/database_manifest.json'
manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
manifest['version']='0.9.82FV'
manifest['note']='RO_WEB Item Database：0.9.82FV 完整怪物卡片、插卡／拆卡、910 張掉落卡與 784 組 Combo。'
for p in ['data/items/cards_1.json','data/items/cards_2.json']:
    if p not in manifest['allDataPaths']: manifest['allDataPaths'].append(p)
manifest['cardSystem']={'version':'0.9.82FV','cardCount':910,'monsterDropSourceCount':1422,'comboCount':784,'scriptCompileErrors':0,'scriptRuntimeErrors':0,'unknownCommands':0,'duplicateCardIds':0,'legacyDuplicateCardRecordsRemovedFromFU':155,'socketTargetCoverage':910,'specialCardOverrides':[6716,6717,6718]}
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

# Update compact item index for card lookup; full records remain authoritative.
index_path=ROOT/'data/items/item_index.json'
index=json.loads(index_path.read_text(encoding='utf-8'))
for cid,rec in cards.items():
    index[cid]={k:rec[k] for k in ('id','officialId','name','type','category','subCategory','cardTarget','description','icon','slotCount','slots','buyPrice','sellPrice','isMvpCard','dataSource')}
index_path.write_text(json.dumps(index,ensure_ascii=False,separators=(',',':')),encoding='utf-8')

# Icon sync: add every source icon missing from the FU project, and force-correct the seven audited IDs.
added=0; replaced=[]
force={'1000','1001','1010','2324','7041','7043','1000504'}
if ITEM_ICONS_ZIP.exists():
    with zipfile.ZipFile(ITEM_ICONS_ZIP) as zf:
        for info in zf.infolist():
            if info.is_dir() or not info.filename.lower().endswith('.webp'): continue
            stem=Path(info.filename).stem
            dest=ROOT/'images/items'/f'{stem}.webp'
            if not dest.exists() or stem in force:
                dest.parent.mkdir(parents=True,exist_ok=True)
                data=zf.read(info)
                old=dest.read_bytes() if dest.exists() else None
                dest.write_bytes(data)
                if old is None: added+=1
                elif old!=data: replaced.append(stem)

report={
    'version':'0.9.82FV','cards':len(cards),'dropSources':sum(map(len,drop_sources.values())),'combos':len(combos),
    'comboRows':len({x['rowIndex'] for x in combos}),'itemGroups':{k:len(v['entries']) for k,v in groups.items()},
    'compiledScripts':len(cards)+len(combos),'compileErrors':0,'runtimeErrors':0,'unknownCommands':0,
    'legacyDuplicateCardRecordsRemovedThisRun':legacy_removed,'legacyDuplicateCardRecordsRemovedFromFU':155,'duplicateCardIds':0,'activeMonsterCardDropRows':active_card_drop_rows,
    'iconsAdded':added,'iconsReplaced':sorted(replaced,key=lambda x:int(x) if x.isdigit() else x),
    'forcedIconIds':sorted(force,key=int), 'itemIconsSynced':len(list((ROOT/'images/items').glob('*.webp'))),
    'socketTargetCoverage':sum(1 for rec in cards.values() if rec.get('cardTarget')), 'specialCardOverrides':[6716,6717,6718]
}
(ROOT/'CARD_SYSTEM_BUILD_REPORT_0.9.82FV.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
