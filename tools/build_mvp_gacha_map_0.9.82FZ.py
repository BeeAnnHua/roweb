#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
from collections import defaultdict
import json,re,zipfile,shutil,hashlib,yaml,io
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
RA=Path('/mnt/data/ra_extract/rathena-master/db/re')
ITEMINFO=Path('/mnt/data/itemInfo_UTF8.lub')
ITEM_ZIP=Path('/mnt/data/items(1).zip')
MAP_ZIP=Path('/mnt/data/葛坡尼亞.zip')
VERSION='0.9.82FZ'
MAP_ID='geffenia_mvp_arena_3x3_region_camera'
MAP_DIR=ROOT/'images/maps/world/geffenia_mvp_arena_3x3'

MVP_IDS=[1038,1039,1046,1059,1086,1087,1112,1115,1147,1150,1157,1159,1190,1251,1252,1272,1312,1389,1418,1511,1518,1583,1623,1685,1688,1708,1719,1734,1751,1768,1779,1785,1832,1871,1874,1885,1956,2022,2068,2131,2189,2202,2249,2251,2253,2255,2319,2529,2564,2996,3254]
EXCLUDED_MVP_IDS={1646,1647,1648,1649,1650,1651,1658,1916,1917}
ZH={1038:'俄塞里斯',1039:'巴風特',1046:'死靈',1059:'蜂后',1086:'黃金蟲',1087:'獸人英雄',1112:'海盜之王',1115:'虎王',1147:'蟻后',1150:'月夜貓',1157:'法老王',1159:'皮里恩',1190:'獸人酋長',1251:'冰暴騎士',1252:'卡崙',1272:'黑暗之王',1312:'烏龜將軍',1389:'德古拉伯爵',1418:'墨蛇君',1511:'古埃及王',1518:'白素貞',1583:'塔奧群卡',1623:'RSX-0806',1646:'闇●騎士領主 賽依連',1647:'闇●十字刺客 艾勒梅斯',1648:'闇●神工匠 哈沃德',1649:'闇●神官 瑪嘉雷特',1650:'闇●神射手 迪文',1651:'闇●超魔導師 凱特莉娜',1658:'闇●劍士 賽尼亞',1685:'貝思波',1688:'嗒妮小姐',1708:'魔劍士 達納托斯的記憶',1719:'水晶龍',1734:'齊爾-D-01',1751:'蘭特克力斯',1768:'幽暗夢魘',1779:'冰晶龍',1785:'阿特羅斯',1832:'伊夫利特',1871:'墮落大神官',1874:'貝雷傑',1885:'闇影龍',1916:'魔王夢羅克',1917:'負傷夢羅克',1956:'夜勝魔',2022:'尼德霍格的影子',2068:'波伊塔塔',2131:'失落之龍',2189:'變異腔棘魚',2202:'克拉肯',2249:'憤怒學生傅立葉',2251:'喬伊亞',2253:'將軍達伊',2255:'亡靈的守護者卡德斯',2319:'布瓦亞',2529:'蠕蟲女王',2564:'芬里爾',2996:'席琳基米',3254:'T_W_O'}

EQUIP_IDS=[400368,420186,450175,480076,22202,490030,490097,450299,480312,470183,490404]
CONSUME_IDS=[14848,14849,14850,14851,14852,14853,14854,14841,14886,12739,23221,23222,23223,23224,23225,23226]
ALL_ICON_IDS=set(EQUIP_IDS+CONSUME_IDS+[4403])

# ---------- parsers ----------
def lua_unescape(s):
 return s.replace('\\r','\r').replace('\\n','\n').replace('\\t','\t').replace('\\"','"').replace("\\'", "'").replace('\\\\','\\')
def parse_iteminfo(target):
 text=ITEMINFO.read_text(encoding='utf-8-sig',errors='ignore'); pat=re.compile(r'^\s*\[(\d+)\]\s*=\s*\{',re.M); ms=list(pat.finditer(text)); out={}
 for idx,m in enumerate(ms):
  iid=int(m.group(1))
  if iid not in target: continue
  block=text[m.end():ms[idx+1].start() if idx+1<len(ms) else len(text)]
  nm=re.search(r'(?m)^\s*(?<!un)identifiedDisplayName\s*=\s*"((?:\\.|[^"\\])*)"',block) or re.search(r'(?m)^\s*unidentifiedDisplayName\s*=\s*"((?:\\.|[^"\\])*)"',block)
  dm=re.search(r'(?ms)^\s*(?<!un)identifiedDescriptionName\s*=\s*\{(.*?)\}\s*,',block)
  desc=[]
  if dm:
   for sm in re.finditer(r'"((?:\\.|[^"\\])*)"',dm.group(1)):
    line=lua_unescape(sm.group(1)).strip(); plain=re.sub(r'\^[0-9A-Fa-f]{6}','',line).strip()
    if not plain or plain in {'_','＿'} or re.match(r'^重量\s*[:：]',plain): continue
    desc.append(line)
  slots=re.search(r'slotCount\s*=\s*(\d+)',block); cls=re.search(r'ClassNum\s*=\s*(\d+)',block)
  out[iid]={'name':lua_unescape(nm.group(1)) if nm else str(iid),'description':desc,'slotCount':int(slots.group(1)) if slots else 0,'ClassNum':int(cls.group(1)) if cls else 0}
 return out

def load_ra_items():
 out={}; by_a={}
 for p in RA.glob('item_db_*.yml'):
  try: body=yaml.safe_load(p.read_text(encoding='utf-8')).get('Body',[])
  except Exception: continue
  for r in body or []:
   if r.get('Id') is not None: out[int(r['Id'])]=r
   if r.get('AegisName'): by_a[str(r['AegisName'])]=r
 return out,by_a

def transform_script(src):
 src=(src or '').replace('\r',''); src=re.sub(r'\.\@([A-Za-z_]\w*)',r'v.\1',src)
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
     out.append(f'{word}({", ".join(parts)})');
     if k<n and src[k]==';':out.append(';');k+=1
     i=k;continue
   out.append(word);i=j;continue
  out.append(ch);i+=1
 return ''.join(out)

def infer_slot(row):
 loc=row.get('Locations') or {}
 if loc.get('Armor'):return 'armor','data/equipment/armor/body.json','body'
 if loc.get('Garment'):return 'garment','data/equipment/armor/garment.json','garment'
 if loc.get('Shoes'):return 'shoes','data/equipment/armor/shoes.json','shoes'
 if loc.get('Head_Top'):return 'headTop','data/equipment/headgear/top.json','headgear'
 if loc.get('Head_Mid'):return 'headMid','data/equipment/headgear/mid.json','headgear'
 if loc.get('Head_Low'):return 'headLow','data/equipment/headgear/low.json','headgear'
 if loc.get('Left_Accessory') or loc.get('Accessory_Left'):return 'accessory1','data/equipment/armor/accessory_h1.json','accessory'
 if loc.get('Right_Accessory') or loc.get('Accessory_Right'):return 'accessory2','data/equipment/armor/accessory_h2.json','accessory'
 if loc.get('Both_Accessory'):return 'accessory1','data/equipment/armor/accessory_h1.json','accessory'
 return 'other','data/equipment/armor/other.json','other'

def make_equipment(iid,row,info):
 slot,path,sub=infer_slot(row);buy=int(row.get('Buy',20) or 20);sell=int(row.get('Sell',buy//2) if row.get('Sell') is not None else buy//2);slots=int(row.get('Slots',info.get('slotCount',0)) or 0)
 rec={'id':iid,'officialId':iid,'name':info.get('name') or row.get('Name'),'type':'equipment','category':'armor','subCategory':sub,'slot':slot,'buyPrice':buy,'sellPrice':sell,'description':info.get('description',[]),'icon':f'images/items/{iid}.webp','slots':slots,'slotCount':slots,'ClassNum':int(info.get('ClassNum',0) or 0),'dataSource':'itemInfo_UTF8.lub + rAthena Renewal 2026-06-08; RO_WEB 0.9.82FZ gacha equipment','Id':iid,'Name':info.get('name') or row.get('Name'),'Buy':buy,'Sell':sell,'Slots':slots}
 for k,a in [('AegisName','aegisName'),('Type','dbType'),('Defense','def'),('ArmorLevel','armorLevel'),('EquipLevelMin','equipLevelMin'),('Jobs','equipJobs'),('Classes','equipClasses'),('Locations','locations'),('Refineable','refineable'),('Gradable','gradable'),('View','viewId'),('Script','scriptRaw')]:
  if k in row:rec[k]=row[k];rec[a]=row[k]
 if 'EquipLevelMin' in row:rec['requiredLevel']=row['EquipLevelMin']
 if rec.get('scriptRaw'):rec['compiledScript']=transform_script(rec['scriptRaw'])
 return rec,path

def make_consume(iid,row,info):
 name=info.get('name') or (row or {}).get('Name') or ('MVP幸運轉蛋' if iid==14848 else str(iid));script=(row or {}).get('Script','')
 rec={'id':iid,'officialId':iid,'name':'MVP幸運轉蛋' if iid==14848 else name,'type':'consume','category':'cashitem','subCategory':'mvp_gacha' if iid==14848 else 'cash_food','buyPrice':int((row or {}).get('Buy',20) or 20),'sellPrice':int((row or {}).get('Sell',10) if (row or {}).get('Sell') is not None else 10),'description':info.get('description',[]),'icon':f'images/items/{iid}.webp','slots':0,'slotCount':0,'ClassNum':int(info.get('ClassNum',0) or 0),'Id':iid,'Name':'MVP幸運轉蛋' if iid==14848 else name,'Buy':int((row or {}).get('Buy',20) or 20),'Slots':0,'dataSource':'itemInfo_UTF8.lub + rAthena Renewal 2026-06-08; RO_WEB 0.9.82FZ MVP gacha'}
 if row:
  rec['AegisName']=row.get('AegisName');rec['aegisName']=row.get('AegisName');rec['Type']=row.get('Type');rec['dbType']=row.get('Type');rec['scriptRaw']=script
 if iid==14848: rec['description']=['葛坡尼亞 MVP 試煉場限定掉落。開啟後可獲得商城料理、時光超越者系列、20週年紀念裝備或齊爾-D-01卡片。']
 effects={14849:{'vitFlat':10},14850:{'lukFlat':10},14851:{'dexFlat':10},14852:{'intFlat':10},14853:{'agiFlat':10},14854:{'strFlat':10},14886:{'allStatsFlat':10,'atkFlat':30,'matkFlat':30},23221:{'dexFlat':15,'hitRandom':[11,33]},23222:{'lukFlat':15,'criRandom':[11,33]},23223:{'strFlat':15,'atkRandom':[11,111]},23224:{'vitFlat':15,'hpRecoveryRandom':[11,33]},23225:{'agiFlat':15,'fleeRandom':[11,33]},23226:{'intFlat':15,'matkRandom':[11,111]}}
 if iid in effects:rec['cashFoodEffect']={'durationMs':1800000,**effects[iid]}
 if iid==14841:rec['percentHeal']={'hp':10,'sp':0}
 if iid==12739:rec['percentHeal']={'hp':10,'sp':10}
 return rec

# ---------- map assets ----------
MAP_DIR.mkdir(parents=True,exist_ok=True);(MAP_DIR/'tiles').mkdir(exist_ok=True)
with zipfile.ZipFile(MAP_ZIP) as z:
 for idx,srcnum in enumerate(range(127,136),1):
  (MAP_DIR/'tiles'/f'{idx:03d}.webp').write_bytes(z.read(f'tiles/{srcnum}.webp'))
canvas=Image.new('RGB',(1536,1536))
for i in range(9):
 im=Image.open(MAP_DIR/'tiles'/f'{i+1:03d}.webp').convert('RGB');canvas.paste(im,((i%3)*512,(i//3)*512))
bg=MAP_DIR/'geffenia_mvp_arena_3x3_region_bg_0_9_82FZ.webp';thumb=MAP_DIR/'geffenia_mvp_arena_3x3_region_small_0_9_82FZ.webp'
canvas.save(bg,'WEBP',quality=88,method=6);canvas.resize((320,320),Image.Resampling.LANCZOS).save(thumb,'WEBP',quality=86,method=6)

# ---------- monsters ----------
mob_rows=yaml.safe_load((RA/'mob_db.yml').read_text(encoding='utf-8'))['Body'];M={int(r['Id']):r for r in mob_rows}
ra_items,by_a=load_ra_items();existing_list=json.loads((ROOT/'data/monsters.json').read_text(encoding='utf-8'));existing={int(x['id']):x for x in existing_list}
for mid in EXCLUDED_MVP_IDS:
 existing.pop(mid,None)
 shutil.rmtree(ROOT/f'assets/monsters/animations/{mid}',ignore_errors=True)
 (ROOT/f'images/monsters/{mid}.webp').unlink(missing_ok=True)
zip_paths=[Path('/mnt/data/MONSTER1001~2000.zip'),Path('/mnt/data/MONSTER2001~3000.zip'),Path('/mnt/data/MONSTER3001~3810.zip'),Path('/mnt/data/MONSTER20255~22589.zip')]
STATIC_MONSTER_ZIP=Path('/mnt/data/怪物圖檔.zip')
asset_z={};asset_files={}
for zp in zip_paths:
 with zipfile.ZipFile(zp) as z:
  names=z.namelist()
  for n in names:
   m=re.match(r'^(\d+)/\1\.json$',n)
   if m:
    mid=int(m.group(1));asset_z[mid]=zp;asset_files[mid]=[x for x in names if x.startswith(f'{mid}/') and not x.endswith('/')]
AI={1:{'canMove':True,'canAttack':True,'aggressive':False,'randomWalk':True},4:{'canMove':True,'canAttack':True,'aggressive':True,'randomWalk':True},5:{'canMove':True,'canAttack':True,'aggressive':True,'randomWalk':True},19:{'canMove':True,'canAttack':True,'aggressive':True,'randomWalk':True,'castSensorIdle':True},20:{'canMove':True,'canAttack':True,'aggressive':True,'randomWalk':True,'castSensorIdle':True,'castSensorChase':True},21:{'canMove':True,'canAttack':True,'aggressive':True,'randomWalk':True,'castSensorIdle':True,'castSensorChase':True}}
def atlas_files(mid):
 with zipfile.ZipFile(asset_z[mid]) as z:data=json.loads(z.read(f'{mid}/{mid}.json'))
 atlases=data.get('atlases') or ([data['atlas']] if data.get('atlas') else [])
 return [str(a.get('file')) for a in atlases if a.get('file')]
def make_mon(mid):
 r=M[mid];old=existing.get(mid,{});drops=[]
 for d in (r.get('Drops') or []):
  it=by_a.get(str(d.get('Item')))
  if it:drops.append({'itemId':int(it['Id']),'chance':int(d.get('Rate',0)),'qtyMin':1,'qtyMax':1,'name':str(d.get('Item')),'stealProtected':bool(d.get('StealProtected'))})
 for d in (r.get('MvpDrops') or []):
  it=by_a.get(str(d.get('Item')))
  if it:drops.append({'itemId':int(it['Id']),'chance':int(d.get('Rate',0)),'qtyMin':1,'qtyMax':1,'name':str(d.get('Item')),'mvpDrop':True})
 ai=int(r.get('Ai',4));behavior={**AI.get(ai,AI[4]),'source':f'rAthena Renewal Ai {str(ai).zfill(2)} + Modes'}
 record={'id':mid,'officialId':mid,'aegisName':str(r.get('AegisName')),'name':old.get('name') or ZH.get(mid) or str(r.get('Name')),'raEnglishName':str(r.get('Name')),'level':int(r.get('Level',1)),'hp':int(r.get('Hp',1)),'maxHp':int(r.get('Hp',1)),'sp':int(r.get('Sp',1)),'atk':int(r.get('Attack',0)),'atk2':int(r.get('Attack2',r.get('Attack',0))),'def':int(r.get('Defense',0)),'mdef':int(r.get('MagicDefense',0)),'res':int(r.get('Resistance',0)),'mres':int(r.get('MagicResistance',0)),'str':int(r.get('Str',1)),'agi':int(r.get('Agi',1)),'vit':int(r.get('Vit',1)),'int':int(r.get('Int',1)),'dex':int(r.get('Dex',1)),'luk':int(r.get('Luk',1)),'baseExp':int(r.get('BaseExp',0)),'jobExp':int(r.get('JobExp',0)),'mvpExp':int(r.get('MvpExp',0)),'drops':drops,'AttackRange':int(r.get('AttackRange',1)),'SkillRange':int(r.get('SkillRange',10)),'ChaseRange':int(r.get('ChaseRange',12)),'WalkSpeed':int(r.get('WalkSpeed',400)),'AttackDelay':int(r.get('AttackDelay',1000)),'AttackMotion':int(r.get('AttackMotion',500)),'ClientAttackMotion':int(r.get('ClientAttackMotion',r.get('AttackMotion',500))),'DamageMotion':int(r.get('DamageMotion',400)),'DamageTaken':int(r.get('DamageTaken',100)),'Ai':str(ai).zfill(2),'ai':ai,'Modes':[k for k,v in (r.get('Modes') or {}).items() if v],'behavior':behavior,'passive':not behavior.get('aggressive',False),'aggressive':behavior.get('aggressive',False),'detector':bool((r.get('Modes') or {}).get('Detector',False)),'size':str(r.get('Size','Small')),'race':str(r.get('Race','Formless')),'element':str(r.get('Element','Neutral')),'elementLevel':int(r.get('ElementLevel',1)),'monsterClass':'Boss','isBoss':True,'isMvp':True,'displayScale':1.5,'combatSource':f'rAthena Renewal db/re/mob_db.yml ID {mid}'}
 if mid in asset_z:
  files=atlas_files(mid);record.update({'animationAtlas':f'assets/monsters/animations/{mid}/{files[0]}','animationAtlases':[f'assets/monsters/animations/{mid}/{x}' for x in files],'animationJson':f'assets/monsters/animations/{mid}/{mid}.json','animationSchema':'ro_web_monster_animation_v2_shared_4dir','useAnimatedAtlas':True,'supportsFrameFlipX':True,'animationPipeline':'RO Studio V78 monster batch output'})
 else:
  record.update({'image':f'images/monsters/{mid}.webp','staticImage':f'images/monsters/{mid}.webp','useAnimatedAtlas':False,'animationPipeline':'RO_WEB static monster fallback'})
 return record
for mid in MVP_IDS:
 if mid not in existing: existing[mid]=make_mon(mid)
 if mid in asset_z:
  outdir=ROOT/f'assets/monsters/animations/{mid}'
  if not outdir.exists():
   with zipfile.ZipFile(asset_z[mid]) as z:
    for name in asset_files[mid]:
     dest=ROOT/'assets/monsters/animations'/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(z.read(name))
 else:
  with zipfile.ZipFile(STATIC_MONSTER_ZIP) as z:
   src=f'monsters/{mid}.webp'
   if src not in z.namelist(): raise RuntimeError(f'missing static monster image {mid}')
   raw=Image.open(io.BytesIO(z.read(src))).convert('RGBA');bbox=raw.getbbox() or (0,0,raw.width,raw.height)
   cropped=raw.crop(bbox);dest=ROOT/f'images/monsters/{mid}.webp';dest.parent.mkdir(parents=True,exist_ok=True)
   cropped.save(dest,'WEBP',lossless=True,method=6)
(ROOT/'data/monsters.json').write_text(json.dumps([existing[k] for k in sorted(existing)],ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

# distributed fixed positions, one per MVP
positions=[]
cols=8;rows=max(1,(len(MVP_IDS)+cols-1)//cols)
for idx in range(len(MVP_IDS)):
 c=idx%cols;r=idx//cols
 x=360+c*((4608-720)/(cols-1));y=360+r*((4608-720)/(rows-1));positions.append({'x':round(x),'y':round(y)})
pool=[]
for mid,pos in zip(MVP_IDS,positions):pool.append({'monsterId':mid,'weight':1,'category':'mvp','raSpawnCount':1,'sourceMaps':['RO_WEB_GEFFENIA_MVP_ARENA'],'baseRespawnMs':60000,'respawnVarianceMs':30000,'countRateEligible':False,'maxAlive':1,'minAlive':0,'persistentTimer':True,'spawnPosition':pos})
spawn_path=ROOT/'data/monster_spawn_config.json';spawn=json.loads(spawn_path.read_text(encoding='utf-8'));spawn['version']=VERSION;spawn['regions'][MAP_ID]={'name':'葛坡尼亞 MVP 試煉場','sourceSpawnFiles':['RO_WEB custom test arena; monster stats/drops from RA Renewal'],'targetNormalCountAt100':0,'pool':pool,'recommendedLevelMin':50,'recommendedLevelMax':275,'selectionRule':'使用者指定 MVP 測試場；每種 MVP 1 隻、固定分散位置、60±30秒重生；暫不加入 9 隻人形／夢羅克王。轉蛋掉落由地圖專屬 Runtime 額外判定。'}
spawn_path.write_text(json.dumps(spawn,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

maps_path=ROOT/'data/maps.json';maps=json.loads(maps_path.read_text(encoding='utf-8'));maps=[m for m in maps if m.get('id')!=MAP_ID]
tilepaths=[f'images/maps/world/geffenia_mvp_arena_3x3/tiles/{i:03d}.webp' for i in range(1,10)]
maps.append({'id':MAP_ID,'name':'葛坡尼亞 MVP 試煉場','displayName':'葛坡尼亞 MVP 試煉場','recommendedLevel':'MVP／轉蛋測試','environment':'大型 3×3 MVP 測試地圖｜51 種 MVP｜地圖限定轉蛋','background':str(bg.relative_to(ROOT)).replace('\\','/'),'thumb':str(thumb.relative_to(ROOT)).replace('\\','/'),'worldWidth':4608,'worldHeight':4608,'spawnPoint':{'x':2304,'y':2304},'monsters':MVP_IDS,'locked':False,'note':'0.9.82FZ：只在本地圖擊殺 MVP 時額外以固定 1% 判定掉落 MVP幸運轉蛋；同 ID MVP 在其他地圖不會追加。','description':'用於 MVP 戰鬥、原始掉落、轉蛋、稀有公告、裝備與卡片效果的綜合測試場。','noMonster':False,'worldCamera':True,'worldScale':3,'chunkSize':512,'chunkGrid':{'cols':3,'rows':3,'tileSize':512,'sourceTiles':tilepaths,'displayScale':3,'displayTileSize':1536,'worldWidth':4608,'worldHeight':4608},'playerWorldHeight':320,'cameraWidth':1280,'cameraHeight':720,'playerWorldWidth':240,'cameraZoom':1,'displayChunkSize':1536,'monsterTestSequence':[],'monsterVisualTest':True,'monsterGlobalScale':1.0,'regionOrder':18,'sourceChunkRange':'127-135','monsterStreaming':True,'monsterSpawnProfile':MAP_ID,'mapTags':['mvp_arena','gacha_test'],'exclusiveDropProfile':'mvp_gacha_0_9_82FZ'})
maps_path.write_text(json.dumps(maps,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

manifest_path=ROOT/'data/world_region_manifest.json';manifest=json.loads(manifest_path.read_text(encoding='utf-8'));manifest['version']=VERSION;manifest['regionCount']=len(maps);manifest['rule']='十八個邏輯地圖；新增葛坡尼亞 127-135 獨立 3×3 MVP／轉蛋測試地圖。';manifest['source']=str(manifest.get('source',''))+'、使用者提供葛坡尼亞 127-135'
manifest['regions']=[r for r in manifest.get('regions',[]) if r.get('id')!=MAP_ID];manifest['regions'].append({'order':18,'id':MAP_ID,'name':'葛坡尼亞 MVP 試煉場','sourceChunkRange':'127-135','runtimeTileNames':[f'{i:03d}.webp' for i in range(1,10)],'background':str(bg.relative_to(ROOT)).replace('\\','/'),'thumb':str(thumb.relative_to(ROOT)).replace('\\','/'),'worldSize':[4608,4608],'cameraSize':[1280,720],'worldScale':3,'monstersDeferred':False,'monsterSpecies':len(MVP_IDS)})
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

# ---------- items / effects / combos ----------
info=parse_iteminfo(ALL_ICON_IDS)
for iid in EQUIP_IDS:
 rec,path=make_equipment(iid,ra_items[iid],info.get(iid,{}));p=ROOT/path;d=json.loads(p.read_text(encoding='utf-8'));d[str(iid)]=rec;p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
cash_path=ROOT/'data/items/cash.json';cash=json.loads(cash_path.read_text(encoding='utf-8'))
for iid in CONSUME_IDS:cash[str(iid)]=make_consume(iid,ra_items.get(iid),info.get(iid,{}))
cash_path.write_text(json.dumps(cash,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
# icons exact source
with zipfile.ZipFile(ITEM_ZIP) as z:
 names=set(z.namelist())
 for iid in ALL_ICON_IDS:
  n=f'items/{iid}.webp'
  if n not in names:raise RuntimeError(f'missing icon {iid}')
  (ROOT/f'images/items/{iid}.webp').write_bytes(z.read(n))
# equipment runtime
fx_path=ROOT/'data/card_runtime/equipment_effects.json';fx=json.loads(fx_path.read_text(encoding='utf-8'))
for iid in EQUIP_IDS:
 row=ra_items[iid];fx[str(iid)]={'id':iid,'name':info.get(iid,{}).get('name') or row.get('Name'),'aegisName':row.get('AegisName'),'scriptRaw':row.get('Script',''),'compiledScript':transform_script(row.get('Script','')),'sourcePath':'RO_WEB 0.9.82FZ gacha equipment','sourceType':'equipment'}
fx_path.write_text(json.dumps(fx,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
# add pure set combos
combo_path=ROOT/'data/card_runtime/card_combos.json';combos=json.loads(combo_path.read_text(encoding='utf-8'));combos=[x for x in combos if not str(x.get('id','')).startswith('equipment_combo_fz_')];existing_sig={tuple(x.get('requiredItemIds',[])) for x in combos}
target=set(EQUIP_IDS);rows=yaml.safe_load((RA/'item_combos.yml').read_text(encoding='utf-8'))['Body'];added=0
for ri,row in enumerate(rows):
 script=row.get('Script','')
 for c in row.get('Combos') or []:
  names=c.get('Combo') if isinstance(c,dict) else None
  if not isinstance(names,list):continue
  entries=[by_a.get(str(n)) for n in names]
  if any(e is None for e in entries):continue
  ids=[int(e['Id']) for e in entries]
  # only combos made entirely from our gacha equipment and at least 2 items
  if len(ids)<2 or not set(ids).issubset(target):continue
  sig=tuple(ids)
  if sig in existing_sig:continue
  added+=1;existing_sig.add(sig);combos.append({'id':f'equipment_combo_fz_{added:03d}','rowIndex':ri,'requiredItemIds':ids,'requiredAegisNames':names,'scriptRaw':script,'compiledScript':transform_script(script),'source':'rAthena Renewal 2026-06-08 item_combos.yml; RO_WEB 0.9.82FZ equipment set'})
combo_path.write_text(json.dumps(combos,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
# item index compact additions
idx_path=ROOT/'data/items/item_index.json';index=json.loads(idx_path.read_text(encoding='utf-8'))
for iid in EQUIP_IDS+CONSUME_IDS:
 rec=None
 for p in [ROOT/'data/items/cash.json',ROOT/'data/equipment/armor/body.json',ROOT/'data/equipment/armor/garment.json',ROOT/'data/equipment/armor/shoes.json',ROOT/'data/equipment/armor/accessory_h1.json',ROOT/'data/equipment/armor/accessory_h2.json',ROOT/'data/equipment/headgear/top.json',ROOT/'data/equipment/headgear/low.json']:
  d=json.loads(p.read_text(encoding='utf-8'));rec=d.get(str(iid)) or rec
 if rec:
  keys=['id','officialId','name','type','category','subCategory','slot','icon','buyPrice','sellPrice','slots','slotCount','requiredLevel','ClassNum','AegisName','aegisName','Locations','locations','ArmorLevel','armorLevel','EquipLevelMin','equipLevelMin','Refineable','refineable','Gradable','gradable','cashFoodEffect','percentHeal','dataSource']
  index[str(iid)]={k:rec[k] for k in keys if k in rec}
idx_path.write_text(json.dumps(index,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
# manifest already includes cash/equipment paths; bump metadata
mp=ROOT/'data/items/database_manifest.json';dbm=json.loads(mp.read_text(encoding='utf-8'));dbm['version']=VERSION;dbm['note']='0.9.82FZ：MVP 地圖限定轉蛋、商城料理、20週年與時光超越者／LT 裝備；裝備 Script 與純裝備 Combo 進入 FX 統一效果 Runtime。';dbm['mvpGacha']={'gachaItemId':14848,'equipmentIds':EQUIP_IDS,'consumableIds':CONSUME_IDS,'setComboAdded':added};mp.write_text(json.dumps(dbm,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

# single 100% mother pool: fixed rare category chances, ordinary weights normalize remaining
gacha={'schema':'ro_web_mvp_gacha_v1','version':VERSION,'mapId':MAP_ID,'gachaItemId':14848,'mapExclusiveDropChanceBasisPoints':100,'dropRatePolicy':'fixed_exact_1_percent_not_scaled_by_global_drop_rate','rareCategories':[{'id':'kiel_card','chanceBasisPoints':1,'tier':'gold','bannerLabel':'0.01% 金色大獎','rewards':[{'itemId':4403,'quantity':1,'weight':1}]},{'id':'anniversary_20th','chanceBasisPoints':10,'tier':'purple','bannerLabel':'0.1% 紫色大獎','rewards':[{'itemId':400368,'quantity':1,'weight':1},{'itemId':420186,'quantity':1,'weight':1}]},{'id':'temporal_transcendent','chanceBasisPoints':100,'tier':'red','bannerLabel':'1% 紅色大獎','rewards':[{'itemId':450175,'quantity':1,'weight':1},{'itemId':480076,'quantity':1,'weight':1},{'itemId':22202,'quantity':1,'weight':1},{'itemId':490030,'quantity':1,'weight':1},{'itemId':490097,'quantity':1,'weight':1}]},{'id':'temporal_lt','chanceBasisPoints':10,'tier':'purple','bannerLabel':'0.1% 紫色大獎','rewards':[{'itemId':450299,'quantity':1,'weight':1},{'itemId':480312,'quantity':1,'weight':1},{'itemId':470183,'quantity':1,'weight':1},{'itemId':490404,'quantity':1,'weight':1}]}],'ordinaryFillBasisPoints':9879,'ordinaryRewards':[{'itemId':14849,'quantity':10,'weight':13},{'itemId':14850,'quantity':10,'weight':13},{'itemId':14851,'quantity':10,'weight':13},{'itemId':14852,'quantity':10,'weight':13},{'itemId':14853,'quantity':10,'weight':13},{'itemId':14854,'quantity':10,'weight':13},{'itemId':14841,'quantity':50,'weight':17},{'itemId':14886,'quantity':2,'weight':5},{'itemId':12739,'quantity':100,'weight':17},{'itemId':14886,'quantity':20,'weight':5},{'itemId':23221,'quantity':10,'weight':13},{'itemId':23222,'quantity':10,'weight':13},{'itemId':23223,'quantity':10,'weight':13},{'itemId':23224,'quantity':10,'weight':13},{'itemId':23225,'quantity':10,'weight':13},{'itemId':23226,'quantity':10,'weight':13}],'bannerColors':{'red':'1%','purple':'0.1%','gold':'0.01%'},'notes':['20週年帽與氣球共享 0.1% 類別，抽中後再等權選一件；兩件同時裝備啟用 RA Combo。','時光超越者系列 1% 類別與 LT 0.1% 類別均在類別內等權選一件。','普通物品依使用者表格權重合併成單一母池，等比例填滿稀有獎以外的 98.79%。']}
(ROOT/'data/mvp_gacha.json').write_text(json.dumps(gacha,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

report={'version':VERSION,'mapId':MAP_ID,'mvpSpecies':len(MVP_IDS),'mvpIds':MVP_IDS,'excludedMvpIds':sorted(EXCLUDED_MVP_IDS),'mapTiles':9,'mapExclusiveGachaDropBasisPoints':100,'gachaRareBasisPoints':121,'gachaOrdinaryFillBasisPoints':9879,'equipmentIds':EQUIP_IDS,'consumableIds':CONSUME_IDS,'equipmentCombosAdded':added,'monsterAssetsBytes':sum(p.stat().st_size for i in MVP_IDS for p in (ROOT/f'assets/monsters/animations/{i}').rglob('*') if p.is_file()),'status':'BUILT'}
(ROOT/'MVP_GACHA_BUILD_REPORT_0.9.82FZ.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
