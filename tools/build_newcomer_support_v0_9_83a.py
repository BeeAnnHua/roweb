#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
import json, re, zipfile, yaml, shutil

ROOT = Path(__file__).resolve().parents[1]
RA = Path('/mnt/data/booster_check/ra/rathena-master/db/re')
ITEMINFO = Path('/mnt/data/itemInfo_UTF8.lub')
ASSET_ZIP = Path('/mnt/data/RO_WEB專案資料(1).zip')
VERSION = '0.9.83A'
PACKAGE_ID = 101538
STAGE_BOX_IDS = {100: 101538, 130: 1000994, 160: 1000985}
NEXT_STAGE_BOX_IDS = {100: 1000994, 130: 1000985, 160: None}

WEAPON_ROUTES = {
    'rune_knight': [600012, 630008],
    'royal_guard': [530005, 500015],
    'mechanic': [620003, 590008],
    'genetic': [590009, 500016],
    'guillotine_cross': [610013, 610028],
    'shadow_chaser': [700014, 510018],
    'warlock': [640009, 640010],
    'sorcerer': [540009, 550010],
    'arch_bishop': [550011, 590010],
    'sura': [560006, 560007],
    'ranger': [700015, 700016],
    'minstrel': [570024, 570010],
    'wanderer': [580024, 580010],
}
FOURTH_TO_THIRD = {
    'dragon_knight':'rune_knight', 'imperial_guard':'royal_guard',
    'meister':'mechanic', 'biolo':'genetic',
    'shadow_cross':'guillotine_cross', 'abyss_chaser':'shadow_chaser',
    'arch_mage':'warlock', 'elemental_master':'sorcerer',
    'cardinal':'arch_bishop', 'inquisitor':'sura',
    'windhawk':'ranger', 'troubadour':'minstrel', 'trouvere':'wanderer'
}
ARMOR_SETS = {
    'attack': {'name':'攻擊蹦級套裝','style':'近距離物理／暴擊','items':[450001,480000,470000,490004], 'recommended':['rune_knight','royal_guard','mechanic','genetic','guillotine_cross','shadow_chaser','arch_bishop','sura']},
    'range': {'name':'廣域蹦級套裝','style':'遠距離物理','items':[450004,480003,470003,490007], 'recommended':['royal_guard','mechanic','genetic','shadow_chaser','ranger','minstrel','wanderer']},
    'elemental': {'name':'元素蹦級套裝','style':'水／風／地／火／無屬性魔法','items':[450002,480001,470001,490005], 'recommended':['warlock','sorcerer']},
    'resistance': {'name':'反抗蹦級套裝','style':'念／聖／暗／不死／毒屬性魔法','items':[450003,480002,470002,490006], 'recommended':['warlock','sorcerer','arch_bishop']},
}
ILLUSION_SETS = {
    'physical': {'name':'幻象物理 A 型套裝','style':'物理','items':[450147,480062,470054,490072,490073], 'refines':[10,10,10,0,0]},
    'magic': {'name':'幻象魔法 B 型套裝','style':'魔法','items':[450148,480063,470055,490074,490075], 'refines':[10,10,10,0,0]},
}
AUTOMATIC_SETS = {
    'physical': {'name':'全自動物理 A 型套裝','style':'物理','items':[450218,480185,470125,490214,490215], 'refines':[11,11,11,0,0]},
    'magic': {'name':'全自動魔法 B 型套裝','style':'魔法','items':[450219,480186,470126,490216,490217], 'refines':[11,11,11,0,0]},
}
BOX_IDS=[101538,1000253,101423,100043,1000994,100341,1000985,101455]
ENCHANT_AEGIS=['Sharp5','Hit_Plus5','Attack_Delay_5','Caster5','Expert_Fighter5','Expert_Archer5','Expert_Magician5']
ALL_EQUIP_IDS=sorted({x for values in WEAPON_ROUTES.values() for x in values} | {x for s in ARMOR_SETS.values() for x in s['items']} | {x for s in ILLUSION_SETS.values() for x in s['items']} | {x for s in AUTOMATIC_SETS.values() for x in s['items']})


def lua_unescape(s:str)->str:
    return s.replace('\\r','\r').replace('\\n','\n').replace('\\t','\t').replace('\\"','"').replace("\\'", "'").replace('\\\\','\\')

def parse_iteminfo(target:set[int]):
    text=ITEMINFO.read_text(encoding='utf-8-sig',errors='ignore')
    pat=re.compile(r'^\s*\[(\d+)\]\s*=\s*\{',re.M); ms=list(pat.finditer(text)); out={}
    for idx,m in enumerate(ms):
        iid=int(m.group(1))
        if iid not in target: continue
        block=text[m.end():ms[idx+1].start() if idx+1<len(ms) else len(text)]
        nm=re.search(r'(?m)^\s*(?<!un)identifiedDisplayName\s*=\s*"((?:\\.|[^"\\])*)"',block) or re.search(r'(?m)^\s*unidentifiedDisplayName\s*=\s*"((?:\\.|[^"\\])*)"',block)
        dm=re.search(r'(?ms)^\s*(?<!un)identifiedDescriptionName\s*=\s*\{(.*?)\}\s*,',block)
        desc=[]
        if dm:
            for sm in re.finditer(r'"((?:\\.|[^"\\])*)"',dm.group(1)):
                line=lua_unescape(sm.group(1)).strip()
                plain=re.sub(r'\^[0-9A-Fa-f]{6}','',line).strip()
                if not plain or plain in {'_','＿'} or re.match(r'^重量\s*[:：]',plain): continue
                desc.append(line)
        slots=re.search(r'slotCount\s*=\s*(\d+)',block); cls=re.search(r'ClassNum\s*=\s*(\d+)',block)
        out[iid]={'name':lua_unescape(nm.group(1)) if nm else str(iid),'description':desc,'slotCount':int(slots.group(1)) if slots else 0,'ClassNum':int(cls.group(1)) if cls else 0}
    return out

def load_ra_items():
    by_id={}; by_aegis={}
    for p in RA.glob('item_db_*.yml'):
        try: data=yaml.safe_load(p.read_text(encoding='utf-8')) or {}
        except Exception: continue
        for r in data.get('Body',[]) or []:
            if r.get('Id') is not None: by_id[int(r['Id'])]=r
            if r.get('AegisName'): by_aegis[str(r['AegisName'])]=r
    return by_id,by_aegis

def transform_script(src):
    src=(src or '').replace('\r',''); src=re.sub(r'\.@([A-Za-z_]\w*)',r'v.\1',src)
    commands={'bonus','bonus2','bonus3','bonus4','bonus5','skill','autobonus','autobonus2','autobonus3','sc_start','heal','showscript','specialeffect2','active_transform'}
    out=[];i=0;n=len(src)
    while i<n:
        ch=src[i]
        if ch in "\"'":
            q=ch;j=i+1;esc=False
            while j<n:
                c=src[j]
                if esc:esc=False
                elif c=='\\':esc=True
                elif c==q:j+=1;break
                j+=1
            out.append(src[i:j]);i=j;continue
        if ch.isalpha() or ch=='_':
            m=re.match(r'[A-Za-z_]\w*',src[i:]);word=m.group(0);j=i+len(word)
            if word in commands:
                probe=j
                while probe<n and src[probe].isspace():probe+=1
                if probe>=n or src[probe]!='(':
                    k=j;q=None;esc=False;depth=0
                    while k<n:
                        c=src[k]
                        if q:
                            if esc:esc=False
                            elif c=='\\':esc=True
                            elif c==q:q=None
                        else:
                            if c in "\"'":q=c
                            elif c in '([':depth+=1
                            elif c in ')]':depth=max(0,depth-1)
                            elif c==';' and depth==0:break
                        k+=1
                    args=src[j:k].strip();parts=[];start=0;q=None;esc=False;dep=0
                    for z,c in enumerate(args):
                        if q:
                            if esc:esc=False
                            elif c=='\\':esc=True
                            elif c==q:q=None
                        else:
                            if c in "\"'":q=c
                            elif c in '([{':dep+=1
                            elif c in ')]}':dep=max(0,dep-1)
                            elif c==',' and dep==0:parts.append(args[start:z].strip());start=z+1
                    parts.append(args[start:].strip())
                    if (word.startswith('bonus') or word in {'skill','sc_start','active_transform'}) and parts and re.fullmatch(r'[A-Za-z_]\w*',parts[0] or ''): parts[0]=json.dumps(parts[0])
                    out.append(f'{word}({", ".join(parts)})')
                    if k<n and src[k]==';':out.append(';');k+=1
                    i=k;continue
            out.append(word);i=j;continue
        out.append(ch);i+=1
    return ''.join(out)

def weapon_path(row):
    st=str(row.get('SubType',''))
    map_={'1hSword':'sword','2hSword':'sword','1hSpear':'spear','2hSpear':'spear','1hAxe':'axe','2hAxe':'axe','Mace':'mace','Katar':'katar','Bow':'bow','Dagger':'dagger','Staff':'staff','2hStaff':'staff','Book':'book','Knuckle':'knuckle','Musical':'instrument','Whip':'whip'}
    return f"data/equipment/weapon/{map_.get(st,'other')}.json", map_.get(st,'other')

def armor_path(row):
    loc=row.get('Locations') or {}
    if loc.get('Armor'):return 'data/equipment/armor/body.json','armor','body'
    if loc.get('Garment'):return 'data/equipment/armor/garment.json','garment','garment'
    if loc.get('Shoes'):return 'data/equipment/armor/shoes.json','shoes','shoes'
    if loc.get('Right_Accessory'):return 'data/equipment/armor/accessory_h2.json','accessory2','accessory'
    if loc.get('Left_Accessory'):return 'data/equipment/armor/accessory_h1.json','accessory1','accessory'
    if loc.get('Both_Accessory'):return 'data/equipment/armor/accessory_h1.json','accessory1','accessory'
    return 'data/equipment/armor/other.json','other','other'

def make_equipment(iid,row,info):
    is_weapon=str(row.get('Type','')).lower()=='weapon'
    if is_weapon:
        path,sub=weapon_path(row); slot='weapon'; category='weapon'
    else:
        path,slot,sub=armor_path(row); category='armor'
    buy=int(row.get('Buy',20) or 20); sell=max(1,int(row.get('Sell') if row.get('Sell') is not None else buy//2)); slots=int(row.get('Slots',info.get('slotCount',0)) or 0)
    rec={
        'id':iid,'officialId':iid,'name':info.get('name') or row.get('Name') or str(iid),
        'type':'equipment','category':category,'subCategory':sub,'slot':slot,
        'buyPrice':buy,'sellPrice':sell,'description':info.get('description',[]),
        'icon':f'images/items/{iid}.webp','slots':slots,'slotCount':slots,'ClassNum':int(info.get('ClassNum',0) or 0),
        'characterBound':True,'supportEquipment':True,'noStorage':True,'noDecompose':False,'noSell':False,
        'dataSource':'itemInfo_UTF8.lub + rAthena Renewal 2026-06-08; RO_WEB V0.9.83 newcomer support',
        'Id':iid,'Name':info.get('name') or row.get('Name') or str(iid),'Buy':buy,'Sell':sell,'Slots':slots
    }
    fields=[('AegisName','aegisName'),('Type','dbType'),('SubType','dbSubType'),('Attack','atk'),('MagicAttack','matk'),('Defense','def'),('Range','range'),('WeaponLevel','weaponLevel'),('ArmorLevel','armorLevel'),('EquipLevelMin','equipLevelMin'),('Jobs','equipJobs'),('Classes','equipClasses'),('Locations','locations'),('Refineable','refineable'),('Gradable','gradable'),('View','viewId'),('Script','scriptRaw'),('Trade','trade')]
    for k,a in fields:
        if k in row: rec[k]=row[k]; rec[a]=row[k]
    if row.get('EquipLevelMin') is not None: rec['requiredLevel']=int(row['EquipLevelMin'])
    if is_weapon:
        rec['handed']=2 if (row.get('Locations') or {}).get('Both_Hand') else 1
        rec['weaponType']=sub
    if rec.get('scriptRaw'): rec['compiledScript']=transform_script(rec['scriptRaw'])
    rec['supportStage']=100 if iid in {x for s in ARMOR_SETS.values() for x in s['items']} or iid in {x for v in WEAPON_ROUTES.values() for x in v} else 130 if iid in {x for s in ILLUSION_SETS.values() for x in s['items']} else 160
    return rec,path

def make_box(iid,row,info):
    names={101538:'蹦級箱',1000253:'蹦級武器兌換券',101423:'蹦級防具箱',100043:'蹦級防具精煉箱',1000994:'幻象裝備兌換券',100341:'幻象(歸屬)精煉箱',1000985:'全自動裝備兌換券',101455:'全自動(歸屬)精煉箱'}
    stage_by_box = {box_id: stage for stage, box_id in STAGE_BOX_IDS.items()}
    stage = stage_by_box.get(iid)
    rec={
        'id':iid,'officialId':iid,'name':info.get('name') or names[iid],
        'type':'consume','category':'cashitem','subCategory':'newcomer_support_box' if stage else 'newcomer_support_reference',
        'buyPrice':0,'sellPrice':0,'description':info.get('description',[]),
        'icon':f'images/items/{iid}.webp','slots':0,'slotCount':0,'ClassNum':int(info.get('ClassNum',0) or 0),
        'manualUseOnly':True,'characterBound':True,'noStorage':True,'noDecompose':True,'noSell':True,
        'dataSource':'TWRO booster package + rAthena Renewal 2026-06-08; RO_WEB V0.9.83 newcomer support',
        'Id':iid,'Name':info.get('name') or names[iid],'Buy':0,'Sell':0,'Slots':0
    }
    if row:
        for k,a in [('AegisName','aegisName'),('Type','dbType'),('EquipLevelMin','equipLevelMin'),('EquipLevelMax','equipLevelMax'),('Flags','flags'),('Trade','trade'),('Script','scriptRaw')]:
            if k in row: rec[k]=row[k]; rec[a]=row[k]
    if stage:
        if stage == 100:
            rec['description']=[
                'RO_WEB Base Lv.100 新人銜接裝備支援箱。每個人物限領一次。',
                '達到 Base Lv.100 並完成三轉後，可依目前三轉／四轉職業選擇 1 把蹦級武器，並從 4 種蹦級防具套裝中擇一。',
                '完成本階段後，自動獲得 Base Lv.130 才能開啟的「幻象裝備兌換券」。',
                '支援裝備可販售、可分解，但不可存入帳號共用倉庫。'
            ]
            rec['newcomerSupportPackage']=True
        elif stage == 130:
            rec['description']=[
                'RO_WEB Base Lv.130 新人銜接裝備箱。',
                '需先完成 Base Lv.100 蹦級裝備階段，並達到 Base Lv.130 才能開啟。',
                '可選擇 +10 幻象（歸屬）物理 A 型或魔法 B 型套裝。',
                '完成本階段後，自動獲得 Base Lv.160 才能開啟的「全自動裝備兌換券」。'
            ]
        elif stage == 160:
            rec['description']=[
                'RO_WEB Base Lv.160 新人銜接裝備箱。',
                '需先完成 Base Lv.130 幻象裝備階段，並達到 Base Lv.160 才能開啟。',
                '可選擇 +11 全自動（歸屬）物理 A 型或魔法 B 型套裝。',
                '這是新人銜接裝備支援的最終階段。'
            ]
        rec['newcomerSupportStage']=stage
        rec['nextStageBoxId']=NEXT_STAGE_BOX_IDS.get(stage)
    return rec

def upsert(path:Path,record:dict):
    data=json.loads(path.read_text(encoding='utf-8-sig')) if path.exists() else {}
    if isinstance(data,list):
        data=[x for x in data if not (isinstance(x,dict) and str(x.get('id'))==str(record['id']))]
        data.append(record)
    else:
        data[str(record['id'])]=record
        data=dict(sorted(data.items(),key=lambda kv:int(kv[0]) if str(kv[0]).isdigit() else str(kv[0])))
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

def main():
    by_id,by_aegis=load_ra_items()
    enchant_rows=[by_aegis[x] for x in ENCHANT_AEGIS]
    target=set(ALL_EQUIP_IDS+BOX_IDS+[int(r['Id']) for r in enchant_rows])
    info=parse_iteminfo(target)
    missing=[i for i in target if i not in info]
    if missing: raise SystemExit(f'itemInfo missing: {missing}')

    item_index=json.loads((ROOT/'data/items/item_index.json').read_text(encoding='utf-8'))
    changed_paths=set()
    equipment_records=[]
    for iid in ALL_EQUIP_IDS:
        row=by_id.get(iid)
        if not row: raise SystemExit(f'RA equipment missing {iid}')
        rec,rel=make_equipment(iid,row,info[iid])
        upsert(ROOT/rel,rec); changed_paths.add(rel); equipment_records.append(rec)
        item_index[str(iid)]={k:v for k,v in rec.items() if k not in {'compiledScript'}}
    for iid in BOX_IDS:
        rec=make_box(iid,by_id.get(iid),info[iid])
        upsert(ROOT/'data/items/consumables.json',rec); changed_paths.add('data/items/consumables.json')
        item_index[str(iid)]=rec
    (ROOT/'data/items/item_index.json').write_text(json.dumps(dict(sorted(item_index.items(),key=lambda kv:int(kv[0]))),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

    enchant_runtime=json.loads((ROOT/'data/enchant_runtime/enchant_effects.json').read_text(encoding='utf-8'))
    enchant_options=[]
    slot_map={'Sharp5':3,'Hit_Plus5':3,'Attack_Delay_5':3,'Caster5':3,'Expert_Fighter5':2,'Expert_Archer5':2,'Expert_Magician5':2}
    role_map={'Sharp5':'暴擊','Hit_Plus5':'命中','Attack_Delay_5':'攻速','Caster5':'詠唱','Expert_Fighter5':'近距離物理','Expert_Archer5':'遠距離物理','Expert_Magician5':'魔法'}
    for row in enchant_rows:
        iid=int(row['Id']); inf=info[iid]
        record={
            'id':iid,'name':inf['name'],'aegisName':row['AegisName'],'scriptRaw':row.get('Script',''),
            'compiledScript':transform_script(row.get('Script','')),'sourceType':'enchant',
            'sourcePath':'rAthena db/re/item_db_etc.yml','effectText':'\n'.join(re.sub(r'\^[0-9A-Fa-f]{6}','',x) for x in inf['description']),
            'playerSlots':[slot_map[row['AegisName']]],'icon':f'images/items/{iid}.webp'
        }
        enchant_runtime[str(iid)]=record
        enchant_options.append({'id':iid,'name':inf['name'],'slot':slot_map[row['AegisName']],'role':role_map[row['AegisName']],'icon':f'images/items/{iid}.webp','effectText':record['effectText']})
        # Add display-only item index record so the detail UI can resolve icon/name.
        item_index[str(iid)]={'id':iid,'officialId':iid,'name':inf['name'],'type':'enchant','category':'stone','subCategory':'booster_weapon_enchant','icon':f'images/items/{iid}.webp','description':inf['description'],'sellPrice':0,'noSell':True,'dataSource':'itemInfo_UTF8.lub + rAthena Renewal 2026-06-08'}
    (ROOT/'data/enchant_runtime/enchant_effects.json').write_text(json.dumps(dict(sorted(enchant_runtime.items(),key=lambda kv:int(kv[0]))),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (ROOT/'data/items/item_index.json').write_text(json.dumps(dict(sorted(item_index.items(),key=lambda kv:int(kv[0]))),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

    jobs=json.loads((ROOT/'data/jobs.json').read_text(encoding='utf-8'))
    job_routes={}
    for third,weapons in WEAPON_ROUTES.items():
        keys=[third]+[fourth for fourth,parent in FOURTH_TO_THIRD.items() if parent==third]
        for key in keys:
            jd=jobs.get(key,{})
            job_routes[key]={'route':third,'jobName':jd.get('name',key),'tier':jd.get('tier'), 'weapons':weapons}

    cfg={
        'version':VERSION,'packageId':PACKAGE_ID,'stageBoxIds':{str(k):v for k,v in STAGE_BOX_IDS.items()},
        'nextStageBoxIds':{str(k):v for k,v in NEXT_STAGE_BOX_IDS.items()},'chainPolicy':'100→130→160；後續箱由前一階段自動發放。',
        'newCharacterAutoGrant':True,'legacyNpcClaim':True,
        'perCharacterClaimFlag':'newcomerSupportClaimedV1','progressField':'newcomerSupportProgressV1',
        'supportedPolicy':'六大職業系列三轉／四轉；擴充職業暫緩。',
        'jobRoutes':job_routes,'fourthToThird':FOURTH_TO_THIRD,'weaponRoutes':WEAPON_ROUTES,
        'weaponEnchantOptions':{'slot3':[x for x in enchant_options if x['slot']==3],'slot2':[x for x in enchant_options if x['slot']==2]},
        'stages':{
            '100':{'baseLevel':100,'requireTier':3,'voucherIcon':'images/items/1000253.webp','armorBoxIcon':'images/items/101423.webp','armorRefineBoxIcon':'images/items/100043.webp','armorRefine':10,'armorSets':ARMOR_SETS},
            '130':{'baseLevel':130,'voucherIcon':'images/items/1000994.webp','refineBoxIcon':'images/items/100341.webp','sets':ILLUSION_SETS},
            '160':{'baseLevel':160,'voucherIcon':'images/items/1000985.webp','refineBoxIcon':'images/items/101455.webp','sets':AUTOMATIC_SETS},
        },
        'binding':{'characterBound':True,'noStorage':True,'noDecompose':False,'noSell':False}
    }
    (ROOT/'data/newcomer_support.json').write_text(json.dumps(cfg,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

    # Add Prontera central claim NPC once.
    npc_path=ROOT/'data/npcs.json'; npcs=json.loads(npc_path.read_text(encoding='utf-8'))
    npc_id='prontera_newcomer_support_npc'
    npcs=[x for x in npcs if x.get('id')!=npc_id]
    npcs.append({'id':npc_id,'cityId':'prontera','name':'新人裝備支援員','type':'newcomer_support','description':'普隆德拉中央新人銜接裝備支援。既有角色每個人物限補領一次。','position':'中央廣場'})
    npc_path.write_text(json.dumps(npcs,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

    # Copy official item icons into the live project.
    icon_ids=sorted(target)
    out_dir=ROOT/'images/items'; out_dir.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(ASSET_ZIP) as z:
        names=set(z.namelist())
        missed=[]
        for iid in icon_ids:
            src=f'items/{iid}.webp'
            if src not in names: missed.append(iid); continue
            (out_dir/f'{iid}.webp').write_bytes(z.read(src))
    if missed: raise SystemExit(f'icon missing: {missed}')

    audit={
        'version':VERSION,'packageId':PACKAGE_ID,'stageBoxIds':STAGE_BOX_IDS,'nextStageBoxIds':NEXT_STAGE_BOX_IDS,
        'equipmentCount':len(ALL_EQUIP_IDS),
        'weaponCount':sum(len(x) for x in WEAPON_ROUTES.values()),'stage100ArmorCount':sum(len(x['items']) for x in ARMOR_SETS.values()),
        'stage130EquipmentCount':len({i for s in ILLUSION_SETS.values() for i in s['items']}),'stage160EquipmentCount':len({i for s in AUTOMATIC_SETS.values() for i in s['items']}),
        'enchantOptionCount':len(enchant_options),'iconCount':len(icon_ids),'missingIcons':[],
        'changedEquipmentPaths':sorted(changed_paths),'npcId':npc_id
    }
    (ROOT/'data/newcomer_support_build_audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(audit,ensure_ascii=False))

if __name__=='__main__': main()
