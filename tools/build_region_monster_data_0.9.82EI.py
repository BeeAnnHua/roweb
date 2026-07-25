#!/usr/bin/env python3
from pathlib import Path
from collections import defaultdict
import json, re, zipfile, yaml, shutil, statistics

ROOT=Path(__file__).resolve().parents[1]
RA=Path('/mnt/data/ra_extract/rathena-master')
VERSION='0.9.82EJ'

REGIONS={
 'prontera_3x3_region_camera': {'name':'普隆德拉地區','files':['prontera']},
 'geffen_3x3_region_camera': {'name':'吉芬地區','files':['geffen']},
 'morocc_3x3_region_camera': {'name':'夢羅克地區','files':['morocc']},
 'mjolnir_3x3_region_camera': {'name':'妙勒尼山脈','files':['mjolnir']},
 'rachel_3x3_region_camera': {'name':'拉赫地區','files':['rachel']},
 'payon_3x3_region_camera': {'name':'斐揚地區','files':['payon']},
 'juno_3x3_region_camera': {'name':'朱諾地區','files':['yuno']},
 'umbala_3x3_region_camera': {'name':'汶巴拉地區','files':['umbala']},
 'lighthouse_coast_3x3_region_camera': {'name':'燈塔海邊地區','files':['comodo']},
 'veins_3x3_region_camera': {'name':'菲音斯地區','files':['veins']},
}

# Existing localized names are authoritative where available. Extra entries are only
# common TW names that have already appeared in project discussions/UI.
COMMON_ZH={
 1001:'蠍子',1002:'波利',1004:'蜂兵',1007:'綠棉蟲',1008:'蛹',1009:'禿鷹',1010:'樹精',1011:'蒼蠅',
 1012:'羅達蛙',1013:'狼',1014:'蘑菇',1018:'克瑞米',1019:'大嘴鳥',1020:'曼陀羅魔花',1023:'獸人戰士',
 1024:'青蛇',1025:'森靈',1030:'森靈',1031:'波波利',1033:'長老樹精',1037:'黑蛇',1040:'巨石怪',1042:'綠蒼蠅',
 1047:'大嘴鳥蛋',1048:'盜蟲卵',1049:'小雞',1050:'小雞',1051:'盜蟲',1052:'蝗蟲',1055:'摩卡',1056:'狸貓',
 1057:'溜溜猴',1058:'重金屬蝗蟲',1059:'蜂后',1060:'大腳熊',1063:'瘋兔',1073:'螃蟹',1074:'貝殼魔靈',
 1078:'紅色草',1079:'藍色草',1080:'綠色草',1081:'黃色草',1082:'白色草',1083:'閃亮草',1084:'黑蘑菇',1085:'紅蘑菇',
 1087:'獸人英雄',1088:'蝗蟲之王',1089:'蛙王',1090:'波利之王',1091:'龍蠅',1093:'瘋兔之王',1094:'蝸牛',1096:'天使波利',
 1099:'艾吉歐蜈蚣',1100:'艾吉歐蜘蛛',1103:'卡拉蟹',1104:'松鼠',1106:'沙漠之狼',1107:'沙漠幼狼',1113:'土波利',
 1114:'塵世飛蛾',1115:'虎王',1118:'噬人花',1119:'泥人',1120:'幽靈波利',1126:'哥布靈',1128:'鍬形蟲',
 1138:'木乃伊犬',1139:'螳螂',1159:'皮里恩',1165:'沙妖',1166:'野豬',1167:'小野豬',1174:'蜻蜓',1190:'獸人酋長',
 1214:'巧克猴',1242:'冰波利',1254:'鳥人哈比',1261:'狂暴野貓',1262:'變異龍',1266:'海星',1271:'鱷魚人',
 1273:'獸人女戰士',1277:'將軍魔碑',1280:'哥布靈蒸汽車',1282:'犬妖弓箭手',1296:'犬妖首領',1299:'哥布靈首領',
 1308:'裝甲哥布靈',1313:'流氓',1317:'海豹寶寶',1323:'海獺',1368:'闇神官',1369:'七彩大嘴鳥',1372:'山羊',
 1376:'鳥人哈比',1380:'鑽地蟲',1386:'岩石龜',1388:'聖天使波利',1391:'加拉巴哥象龜',1392:'直升機哥布靈',
 1493:'森林妖姬',1494:'甲蟲之王',1495:'石砲火樹',1497:'木人',1498:'伍坦彈弓手',1499:'伍坦戰士',1500:'狂暴木怪',
 1582:'惡魔波利',1627:'蚊子',1680:'希爾隊長',1686:'獸人嬰兒',1687:'綠樹精',1780:'捕蟲草',1781:'食人草',
 1782:'希爾士兵',1783:'迦利',1784:'石頭波利',1785:'阿特羅斯',1836:'熔岩波利',1917:'負傷的夢羅克',
 1918:'夢羅克的現身',1919:'夢羅克的現身',1920:'夢羅克的現身',1921:'夢羅克的現身',2398:'小波利'
}

PLANT_IDS={1078,1079,1080,1081,1082,1083,1084,1085}
AI_FLAGS={
 1:{'canMove':True,'canAttack':True,'aggressive':False,'randomWalk':True},
 2:{'canMove':True,'canAttack':True,'aggressive':False,'randomWalk':True,'looter':True},
 3:{'canMove':True,'canAttack':True,'aggressive':False,'randomWalk':True,'assist':True},
 4:{'canMove':True,'canAttack':True,'aggressive':True,'randomWalk':True},
 5:{'canMove':True,'canAttack':True,'aggressive':True,'randomWalk':True},
 6:{'canMove':False,'canAttack':False,'aggressive':False,'randomWalk':False,'immobile':True},
 7:{'canMove':True,'canAttack':True,'aggressive':False,'randomWalk':True,'looter':True,'assist':True},
 8:{'canMove':True,'canAttack':True,'aggressive':True,'randomWalk':True,'targetWeak':True},
 9:{'canMove':True,'canAttack':True,'aggressive':True,'randomWalk':True},
 10:{'canMove':False,'canAttack':True,'aggressive':True,'randomWalk':False,'immobile':True},
 11:{'canMove':False,'canAttack':True,'aggressive':True,'randomWalk':False,'immobile':True},
 12:{'canMove':True,'canAttack':True,'aggressive':True,'randomWalk':True},
 13:{'canMove':True,'canAttack':True,'aggressive':True,'randomWalk':True,'assist':True},
 17:{'canMove':True,'canAttack':True,'aggressive':False,'randomWalk':True,'castSensorIdle':True},
 19:{'canMove':True,'canAttack':True,'aggressive':True,'randomWalk':True,'castSensorIdle':True},
 20:{'canMove':True,'canAttack':True,'aggressive':True,'randomWalk':True,'castSensorIdle':True,'castSensorChase':True},
 21:{'canMove':True,'canAttack':True,'aggressive':True,'randomWalk':True,'castSensorIdle':True,'castSensorChase':True},
 24:{'canMove':True,'canAttack':True,'aggressive':False,'randomWalk':False},
 25:{'canMove':True,'canAttack':False,'aggressive':False,'randomWalk':True},
 26:{'canMove':True,'canAttack':True,'aggressive':True,'randomWalk':True,'randomTarget':True},
 27:{'canMove':False,'canAttack':True,'aggressive':True,'randomWalk':False,'immobile':True,'randomTarget':True},
}

SPAWN_RE=re.compile(r'^(?P<map>[^,\s]+),(?P<coord>[^\t]*)\t(?P<kind>boss_monster|monster)\t(?P<label>[^\t]+)\t(?P<id>\d+),(?P<count>\d+),(?P<delay>\d+)(?:,(?P<variance>\d+))?')

with (RA/'db/re/mob_db.yml').open(encoding='utf-8') as f:
    mob_rows=yaml.safe_load(f)['Body']
MOBS={int(r['Id']):r for r in mob_rows}

# Aegis item -> numeric ID, for real drop records.
ITEM_IDS={}
for p in sorted((RA/'db/re').glob('item_db_*.yml')):
    try:
        body=yaml.safe_load(p.read_text(encoding='utf-8'))['Body']
    except Exception:
        continue
    for row in body or []:
        if row.get('AegisName') and row.get('Id'):
            ITEM_IDS[str(row['AegisName'])]=int(row['Id'])

# Animation folders are split into four user-provided archives.
ZIP_PATHS=[
 Path('/mnt/data/MONSTER1001~2000.zip'), Path('/mnt/data/MONSTER2001~3000.zip'),
 Path('/mnt/data/MONSTER3001~3810.zip'), Path('/mnt/data/MONSTER20255~22589.zip')
]
ASSET_ZIP={}
ASSET_FILES={}
for zp in ZIP_PATHS:
    with zipfile.ZipFile(zp) as zf:
        names=zf.namelist()
        ids=set()
        for n in names:
            m=re.match(r'^(\d+)/\1\.json$',n)
            if m: ids.add(int(m.group(1)))
        for mid in ids:
            ASSET_ZIP[mid]=zp
            ASSET_FILES[mid]=[n for n in names if n.startswith(f'{mid}/') and not n.endswith('/')]

existing={int(x['id']):x for x in json.loads((ROOT/'data/monsters.json').read_text(encoding='utf-8'))}

def is_mvp(row):
    return bool(row.get('MvpExp') or row.get('MvpDrops'))

def aggregate_region(file_names):
    agg=defaultdict(lambda:{'count':0,'maps':set(),'delays':[],'boss_line':False,'labels':set()})
    for fn in file_names:
        src=RA/f'npc/re/mobs/fields/{fn}.txt'
        for line in src.read_text(encoding='utf-8').splitlines():
            line=line.strip()
            if not line or line.startswith('//'): continue
            m=SPAWN_RE.match(line)
            if not m: continue
            g=m.groupdict(); mid=int(g['id'])
            e=agg[mid]
            e['count']+=int(g['count']); e['maps'].add(g['map']); e['boss_line'] |= g['kind']=='boss_monster'
            e['delays'].append({'baseMs':int(g['delay']),'varianceMs':int(g['variance'] or 0)})
            e['labels'].add(g['label'].strip())
    return agg

def classify(mid, spawn, mob):
    count=int(spawn['count']); min_delay=min((x['baseMs'] for x in spawn['delays']),default=5000)
    if is_mvp(mob): return 'mvp'
    if spawn['boss_line']: return 'boss'
    if mid in PLANT_IDS: return 'plant'
    # Class: Boss is also used by ordinary field mobs (Galion, Incarnation of Morocc, etc.).
    # Only single/slow spawns are treated as unique; groups stay in the normal weighted pool.
    if str(mob.get('Class','Normal')).lower()=='boss' and count <= 2: return 'boss'
    if count <= 2 or min_delay >= 180000: return 'rare'
    return 'normal'

def choose_pool(agg):
    all_rows=[]
    for mid,spawn in agg.items():
        mob=MOBS.get(mid)
        if not mob or mid not in ASSET_ZIP: continue
        cat=classify(mid,spawn,mob)
        all_rows.append((mid,spawn,mob,cat))
    normal=sorted([x for x in all_rows if x[3]=='normal'], key=lambda x:(-x[1]['count'],x[0]))[:10]
    rare=sorted([x for x in all_rows if x[3]=='rare'], key=lambda x:(-x[1]['count'],x[0]))
    plants=sorted([x for x in all_rows if x[3]=='plant'], key=lambda x:(-x[1]['count'],x[0]))[:6]
    unique=sorted([x for x in all_rows if x[3] in {'boss','mvp'}], key=lambda x:(x[3] != 'mvp',x[0]))
    selected=normal+rare+plants+unique
    # Stable unique by id.
    out=[]; seen=set()
    for x in selected:
        if x[0] in seen: continue
        seen.add(x[0]);out.append(x)
    return out, all_rows

def avg_delay(delays):
    if not delays: return (5000,0)
    # Use the shortest official occurrence when several original maps are merged into one RO_WEB region.
    chosen=min(delays,key=lambda x:(x['baseMs'],x['varianceMs']))
    return chosen['baseMs'],chosen['varianceMs']

def build_pool_entry(mid,spawn,mob,cat):
    base,var=avg_delay(spawn['delays'])
    raw=int(spawn['count'])
    entry={
      'monsterId':mid, 'weight':max(1,raw), 'category':cat, 'raSpawnCount':raw,
      'sourceMaps':sorted(spawn['maps']), 'baseRespawnMs':base, 'respawnVarianceMs':var,
      'countRateEligible':cat=='normal' and raw>1,
      'maxAlive': 1 if cat in {'rare','boss','mvp'} else (max(1,min(3,round(raw/18))) if cat=='plant' else None),
      'minAlive': 0 if cat in {'rare','plant','boss','mvp'} else 1,
      'persistentTimer':cat in {'rare','boss','mvp'},
    }
    if entry['maxAlive'] is None: entry.pop('maxAlive')
    return entry

def atlas_files(mid):
    zp=ASSET_ZIP[mid]
    with zipfile.ZipFile(zp) as zf:
        data=json.loads(zf.read(f'{mid}/{mid}.json'))
    atlases=data.get('atlases') or ([data['atlas']] if data.get('atlas') else [])
    return [str(a.get('file')) for a in atlases if a.get('file')]

def make_monster(mid):
    r=MOBS[mid]
    ai=int(r.get('Ai',1)); modes=[k for k,v in (r.get('Modes') or {}).items() if v]
    old=existing.get(mid,{})
    mvp=is_mvp(r); cls=str(r.get('Class','Normal'))
    drops=[]
    for d in r.get('Drops') or []:
        iid=ITEM_IDS.get(str(d.get('Item','')))
        if not iid: continue
        drops.append({'itemId':iid,'chance':int(d.get('Rate',0)),'qtyMin':1,'qtyMax':1,'name':str(d.get('Item',''))})
    for d in r.get('MvpDrops') or []:
        iid=ITEM_IDS.get(str(d.get('Item','')))
        if not iid: continue
        drops.append({'itemId':iid,'chance':int(d.get('Rate',0)),'qtyMin':1,'qtyMax':1,'name':str(d.get('Item','')),'mvpDrop':True})
    files=atlas_files(mid)
    scale=1.5 if mvp else (1.25 if cls.lower()=='boss' else 1.0)
    out={
      'id':mid,'officialId':mid,'aegisName':str(r.get('AegisName',mid)),
      'name':old.get('name') or COMMON_ZH.get(mid) or str(r.get('Name',mid)),
      'raEnglishName':str(r.get('Name',mid)), 'level':int(r.get('Level',1)),
      'hp':int(r.get('Hp',1)),'maxHp':int(r.get('Hp',1)),'sp':int(r.get('Sp',1)),
      'atk':int(r.get('Attack',0)),'atk2':int(r.get('Attack2',r.get('Attack',0))),
      'def':int(r.get('Defense',0)),'mdef':int(r.get('MagicDefense',0)),
      'res':int(r.get('Resistance',0)),'mres':int(r.get('MagicResistance',0)),
      'str':int(r.get('Str',1)),'agi':int(r.get('Agi',1)),'vit':int(r.get('Vit',1)),
      'int':int(r.get('Int',1)),'dex':int(r.get('Dex',1)),'luk':int(r.get('Luk',1)),
      'baseExp':int(r.get('BaseExp',0)),'jobExp':int(r.get('JobExp',0)),'mvpExp':int(r.get('MvpExp',0)),
      'drops':drops,'AttackRange':int(r.get('AttackRange',1)),'SkillRange':int(r.get('SkillRange',10)),
      'ChaseRange':int(r.get('ChaseRange',12)),'WalkSpeed':int(r.get('WalkSpeed',400)),
      'AttackDelay':int(r.get('AttackDelay',1000)),'AttackMotion':int(r.get('AttackMotion',500)),
      'ClientAttackMotion':int(r.get('ClientAttackMotion',r.get('AttackMotion',500))),
      'DamageMotion':int(r.get('DamageMotion',400)),'DamageTaken':int(r.get('DamageTaken',100)),
      'Ai':str(ai).zfill(2),'ai':ai,'Modes':modes,'behavior':{'source':f'RA Ai {str(ai).zfill(2)}; regenerate through data/monster_ai_modes.json',**AI_FLAGS.get(ai,AI_FLAGS[1])},
      'passive':not bool(AI_FLAGS.get(ai,AI_FLAGS[1]).get('aggressive')),
      'aggressive':bool(AI_FLAGS.get(ai,AI_FLAGS[1]).get('aggressive')),
      'detector':bool((r.get('Modes') or {}).get('Detector',False)),
      'size':str(r.get('Size','Small')),'race':str(r.get('Race','Formless')),
      'element':str(r.get('Element','Neutral')),'elementLevel':int(r.get('ElementLevel',1)),
      'monsterClass':cls,'isBoss':cls.lower()=='boss','isMvp':mvp,
      'displayScale':scale,'combatSource':f'rAthena Renewal db/re/mob_db.yml ID {mid}',
      'animationAtlas':f'assets/monsters/animations/{mid}/{files[0]}' if files else '',
      'animationAtlases':[f'assets/monsters/animations/{mid}/{x}' for x in files],
      'animationJson':f'assets/monsters/animations/{mid}/{mid}.json',
      'animationSchema':'ro_web_monster_animation_v2_shared_4dir','useAnimatedAtlas':True,
      'supportsFrameFlipX':True,'animationPipeline':'RO Studio V78 monster batch output'
    }
    # Preserve hand-curated old fields where they are still useful.
    for key in ('zenyMin','zenyMax','hitImage'):
        if key in old: out[key]=old[key]
    return out

regions={}; used=set(); audits={}; all_missing=[]
for rid,meta in REGIONS.items():
    agg=aggregate_region(meta['files'])
    selected,all_rows=choose_pool(agg)
    entries=[build_pool_entry(*x) for x in selected]
    used.update(x[0] for x in selected)
    levels=[int(x[2].get('Level',1)) for x in selected if x[3]=='normal']
    regions[rid]={
      'name':meta['name'],'sourceSpawnFiles':[f'npc/re/mobs/fields/{x}.txt' for x in meta['files']],
      'targetNormalCountAt100':60,'pool':entries,
      'recommendedLevelMin':min(levels) if levels else 1,'recommendedLevelMax':max(levels) if levels else 1,
      'selectionRule':'RA Renewal field spawns aggregated; top 10 ordinary species by official count + all rare/plants (up to 6)/Boss/MVP with available animation assets.'
    }
    missing=[{'id':x[0],'name':x[2].get('Name'),'count':x[1]['count']} for x in all_rows if x[0] not in ASSET_ZIP]
    audits[rid]={'selectedSpecies':len(entries),'normal':sum(e['category']=='normal' for e in entries),'rare':sum(e['category']=='rare' for e in entries),'plant':sum(e['category']=='plant' for e in entries),'boss':sum(e['category']=='boss' for e in entries),'mvp':sum(e['category']=='mvp' for e in entries),'missingAssets':missing}
    all_missing.extend(missing)

# Extract only selected animation folders. Old test folders are replaced by authoritative V78 output.
out_assets=ROOT/'assets/monsters/animations'
if out_assets.exists(): shutil.rmtree(out_assets)
out_assets.mkdir(parents=True,exist_ok=True)
for mid in sorted(used):
    zp=ASSET_ZIP[mid]
    with zipfile.ZipFile(zp) as zf:
        for name in ASSET_FILES[mid]:
            target=out_assets/name
            target.parent.mkdir(parents=True,exist_ok=True)
            with zf.open(name) as src, target.open('wb') as dst: shutil.copyfileobj(src,dst)

monster_list=[make_monster(mid) for mid in sorted(used)]
(ROOT/'data/monsters.json').write_text(json.dumps(monster_list,ensure_ascii=False,indent=2),encoding='utf-8')

spawn_config={
 'schema':'ro_web_region_monster_streaming_v1','version':VERSION,
 'source':{'mobDb':'rAthena Renewal db/re/mob_db.yml','spawnScripts':'rAthena Renewal npc/re/mobs/fields/*.txt','monsterAssets':'RO Studio V78 PNG+JSON batches'},
 'global':{
   'monsterCountRate':100,'normalSpawnDelayRate':100,'plantSpawnDelayRate':100,'bossSpawnDelayRate':100,
   'spawnVariance':True,'baseMonstersPerSource512':15,'activeWindowSourceSize':1024,'retainWindowSourceSize':1280,
   'normalHardCap':120,'spawnBatchSize':4,'spawnMaintenanceMs':500,'renderPaddingWorldPx':260,
   'minimumSpawnDistanceWorldPx':360,'normalOutsideCombatGraceMs':5000,
   'rules':['100 = RA/RO_WEB base rate; count rate scales ordinary group monsters only.','Normal/plant/Boss respawn delay rates are independent. 50 = twice as fast, 200 = twice as slow.','Unique rare/Boss/MVP species remain maxAlive 1 and are never duplicated by monsterCountRate.','Each region keeps about 60 non-Boss monsters around the player at 100% (15 per 512x512 source area across a 1024x1024 active window).']
 },
 'regions':regions
}
(ROOT/'data/monster_spawn_config.json').write_text(json.dumps(spawn_config,ensure_ascii=False,indent=2),encoding='utf-8')

# Centralize user-editable valves next to EXP/drop rates.
server_path=ROOT/'data/server_config.json'; server=json.loads(server_path.read_text(encoding='utf-8'))
server.setdefault('server',{})['monsters']={
 'monsterCountRate':100,'normalSpawnDelayRate':100,'plantSpawnDelayRate':100,'bossSpawnDelayRate':100,'spawnVariance':True,
 'baseMonstersPerSource512':15,'activeWindowSourceSize':1024,'retainWindowSourceSize':1280,'normalHardCap':120
}
notes=server.setdefault('notes',[])
for note in [
 '怪物倍率採 100 制：monsterCountRate 100 = 基準數量；200 = 普通群體怪物兩倍。單隻稀有怪、Mini Boss、MVP 不會被複製。',
 '重生倍率採時間倍率：normal/plant/boss SpawnDelayRate 50 = 等待時間減半；200 = 等待時間加倍。'
]:
 if note not in notes: notes.append(note)
server_path.write_text(json.dumps(server,ensure_ascii=False,indent=2),encoding='utf-8')

# Map records point at the new pools; the two old Mjolnir test monsters/overrides are removed.
maps_path=ROOT/'data/maps.json'; maps=json.loads(maps_path.read_text(encoding='utf-8'))
for mp in maps:
    reg=regions.get(mp.get('id'))
    if not reg: continue
    ids=[e['monsterId'] for e in reg['pool']]
    mp['monsters']=ids; mp['noMonster']=False; mp['monsterVisualTest']=True; mp['monsterStreaming']=True
    mp['monsterSpawnProfile']=mp['id']; mp['monsterTestSequence']=[]
    mp['recommendedLevel']=f"{reg['recommendedLevelMin']}-{reg['recommendedLevelMax']}"
    mp['environment']=f"3×3 世界地圖區域｜RA Renewal 怪物池 {len(ids)} 種｜玩家附近基準約 60 隻"
    mp['note']=f"{VERSION}：RA 區域怪物池＋玩家中心動態生成；地區傳送仍只透過地圖／傳送 UI。"
    mp['description']=f"{reg['name']}獨立世界地圖。普通怪依 RA 數量比例隨機生成；植物、稀有怪、Boss 與 MVP 使用獨立上限及重生計時。"
    mp.pop('_monsterTestCursor',None)
maps_path.write_text(json.dumps(maps,ensure_ascii=False,indent=2),encoding='utf-8')

# World manifest no longer says monsters deferred.
manifest_path=ROOT/'data/world_region_manifest.json'
manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
manifest['version']=VERSION
manifest['monsterPolicy']='RA Renewal 地區怪物池已啟用：每 512×512 來源區域基準 15 隻，玩家中心 1024×1024 維持約 60 隻；普通怪按權重，植物/稀有/Boss/MVP 使用獨立規則。'
for r in manifest.get('regions',[]):
    r['monstersDeferred']=False
    reg=regions.get(r.get('id'),{})
    r['monsterSpecies']=len(reg.get('pool',[]))
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')

audit={
 'version':VERSION,'regions':audits,'usedMonsterSpecies':len(used),'animationFoldersExtracted':len(used),
 'missingSelectedAssets':all_missing,'testOverridesRemoved':{'mjolnirScorpion1001':True,'mjolnirPoring1002':True},
 'notes':['Scorpion/Poring remain valid monster records only if selected by their correct RA region; they are not forced into Mjolnir.','English RA names are used only when no existing/common Traditional Chinese name is available.']
}
(ROOT/'tools/region_monster_pool_audit_0.9.82EI.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf-8')
(ROOT/'docs/REGION_MONSTER_STREAMING_0.9.82EI.json').write_text(json.dumps({'schema':'ro_web_region_monster_streaming_audit','version':VERSION,'global':spawn_config['global'],'regions':audits,'usedMonsterSpecies':len(used)},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'version':VERSION,'used':len(used),'regions':audits,'assetBytes':sum(p.stat().st_size for p in out_assets.rglob('*') if p.is_file())},ensure_ascii=False,indent=2))
