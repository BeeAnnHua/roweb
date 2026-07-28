#!/usr/bin/env python3
from pathlib import Path
import json, re, zipfile, shutil, yaml

ROOT=Path(__file__).resolve().parents[1]
ITEMINFO=Path('/mnt/data/itemInfo_UTF8.lub')
ASSET_ZIP=Path('/mnt/data/RO_WEB專案資料(1).zip')
RA_ROOT=Path('/mnt/data/ra_ep19_extract/rathena-master')
VERSION='0.9.82GV'
BOX_ID=1100100
BOX_ICON_SOURCE_ID=101638
BOX_KEY='ep19_dim_glacier_weapon_box'

WEAPON_IDS=[500054,500055,510075,510076,520021,530034,540056,550089,550090,560037,570032,580033,590047,590048,600030,610041,620019,630019,640034,650028,700059,800015,810015,820011,830015,840010]
MATERIAL_IDS=[1000608,1000811,1000812,1000813,1000814,1001029,1001030,1001031,1001032,1001033,1001034,1001035,1001036,1001037,1001249,1001250]

SUBTYPE_MAP={
 '1hSword':('sword','sword',1),'2hSword':('sword','sword',2),'Dagger':('dagger','dagger',1),
 '1hAxe':('axe','axe',1),'2hAxe':('axe','axe',2),'1hSpear':('spear','spear',1),'2hSpear':('spear','spear',2),
 'Book':('book','book',1),'Staff':('staff','staff',1),'2hStaff':('staff','staff',2),'Knuckle':('knuckle','knuckle',1),
 'Musical':('instrument','instrument',1),'Whip':('whip','whip',1),'Mace':('mace','mace',1),'Katar':('katar','katar',2),
 'Huuma':('ninja','ninja',2),'Bow':('bow','bow',2),
 'Revolver':('gun','gun',2),'Rifle':('gun','gun',2),'Shotgun':('gun','gun',2),'Gatling':('gun','gun',2),'Grenade':('gun','gun',2),
}

text=ITEMINFO.read_text(encoding='utf-8')

def lua_entry(iid:int):
    marker=f'[{iid}] = {{'
    start=text.find(marker)
    if start<0: raise RuntimeError(f'itemInfo missing {iid}')
    nxt=text.find('\n    [',start+len(marker))
    block=text[start:nxt if nxt>=0 else len(text)]
    def field(name):
        m=re.search(rf'\b{name}\s*=\s*"((?:\\.|[^"\\])*)"',block)
        return bytes(m.group(1),'utf-8').decode('unicode_escape') if m else None
    name=field('identifiedDisplayName') or field('unidentifiedDisplayName') or str(iid)
    descm=re.search(r'\bidentifiedDescriptionName\s*=\s*\{(.*?)\}\s*,',block,re.S)
    desc=[]
    if descm:
        for s in re.findall(r'"((?:\\.|[^"\\])*)"',descm.group(1)):
            try: desc.append(bytes(s,'utf-8').decode('unicode_escape'))
            except Exception: desc.append(s)
    cm=re.search(r'\bClassNum\s*=\s*(\d+)',block)
    return {'name':name,'description':desc,'ClassNum':int(cm.group(1)) if cm else 0}

# The unicode_escape trick corrupts direct CJK; repair by re-reading matched strings directly.
def lua_entry(iid:int):
    marker=f'[{iid}] = {{'
    start=text.find(marker)
    if start<0: raise RuntimeError(f'itemInfo missing {iid}')
    nxt=text.find('\n    [',start+len(marker))
    block=text[start:nxt if nxt>=0 else len(text)]
    def field(name):
        m=re.search(rf'\b{name}\s*=\s*"((?:\\.|[^"\\])*)"',block)
        return m.group(1).replace('\\"','"').replace('\\n','\n') if m else None
    name=field('identifiedDisplayName') or field('unidentifiedDisplayName') or str(iid)
    descm=re.search(r'\bidentifiedDescriptionName\s*=\s*\{(.*?)\}\s*,',block,re.S)
    desc=[]
    if descm:
        desc=[s.replace('\\"','"').replace('\\n','\n') for s in re.findall(r'"((?:\\.|[^"\\])*)"',descm.group(1))]
    cm=re.search(r'\bClassNum\s*=\s*(\d+)',block)
    return {'name':name,'description':desc,'ClassNum':int(cm.group(1)) if cm else 0}

# Load RA records.
equip_body=yaml.safe_load((RA_ROOT/'db/re/item_db_equip.yml').read_text(encoding='utf-8'))['Body']
etc_body=yaml.safe_load((RA_ROOT/'db/re/item_db_etc.yml').read_text(encoding='utf-8'))['Body']
RA_EQUIP={int(e['Id']):e for e in equip_body if int(e.get('Id',0)) in WEAPON_IDS}
RA_ETC={int(e['Id']):e for e in etc_body if int(e.get('Id',0)) in MATERIAL_IDS}
if set(RA_EQUIP)!=set(WEAPON_IDS): raise RuntimeError(f'RA missing weapons: {sorted(set(WEAPON_IDS)-set(RA_EQUIP))}')
if set(RA_ETC)!=set(MATERIAL_IDS): raise RuntimeError(f'RA missing materials: {sorted(set(MATERIAL_IDS)-set(RA_ETC))}')

# Mandatory source image audit; abort before modifying anything.
all_icon_sources=WEAPON_IDS+MATERIAL_IDS+[BOX_ICON_SOURCE_ID]
with zipfile.ZipFile(ASSET_ZIP) as z:
    names=set(z.namelist())
    icon_member={}
    for iid in all_icon_sources:
        candidates=[n for n in names if re.search(rf'(^|/){iid}\.webp$',n,re.I)]
        if not candidates: raise RuntimeError(f'MISSING REQUIRED IMAGE: item {iid}.webp')
        icon_member[iid]=candidates[0]

item_index=json.loads((ROOT/'data/items/item_index.json').read_text(encoding='utf-8'))
materials=json.loads((ROOT/'data/items/materials_2.json').read_text(encoding='utf-8'))
consumables=json.loads((ROOT/'data/items/consumables.json').read_text(encoding='utf-8'))

# Copy source images only after full audit has passed.
with zipfile.ZipFile(ASSET_ZIP) as z:
    for iid in WEAPON_IDS+MATERIAL_IDS:
        dest=ROOT/f'images/items/{iid}.webp'; dest.parent.mkdir(parents=True,exist_ok=True)
        with z.open(icon_member[iid]) as src, open(dest,'wb') as out: shutil.copyfileobj(src,out)
    with z.open(icon_member[BOX_ICON_SOURCE_ID]) as src, open(ROOT/f'images/items/{BOX_ID}.webp','wb') as out: shutil.copyfileobj(src,out)

# Build 26 full equipment records.
weapon_records={}
file_counts={}
for iid in WEAPON_IDS:
    ra=RA_EQUIP[iid]; cli=lua_entry(iid); subtype=ra['SubType']
    if subtype not in SUBTYPE_MAP: raise RuntimeError(f'No subtype mapping for {iid} {subtype}')
    file_key,weapon_type,handed=SUBTYPE_MAP[subtype]
    rec={
      'id':iid,'officialId':iid,'name':cli['name'],'type':'equipment','category':'weapon','subCategory':weapon_type,
      'sellPrice':0,'buyPrice':0,'description':cli['description'],'icon':f'images/items/{iid}.webp','slot':'weapon',
      'atk':int(ra.get('Attack',0)),'matk':int(ra.get('MagicAttack',0)),'handed':handed,'slots':int(ra.get('Slots',0)),
      'slotCount':int(ra.get('Slots',0)),'ClassNum':cli['ClassNum'],'weaponType':weapon_type,
      'aegisName':ra['AegisName'],'AegisName':ra['AegisName'],'dbType':'Weapon','Type':'Weapon','dbSubType':subtype,'SubType':subtype,
      'range':int(ra.get('Range',1)),'Range':int(ra.get('Range',1)),'weaponLevel':int(ra.get('WeaponLevel',1)),'WeaponLevel':int(ra.get('WeaponLevel',1)),
      'equipLevelMin':int(ra.get('EquipLevelMin',0)),'requiredLevel':int(ra.get('EquipLevelMin',0)),'EquipLevelMin':int(ra.get('EquipLevelMin',0)),
      'equipJobs':ra.get('Jobs',{}),'Jobs':ra.get('Jobs',{}),'equipClasses':ra.get('Classes',{}),'Classes':ra.get('Classes',{}),
      'locations':ra.get('Locations',{}),'Locations':ra.get('Locations',{}),'refineable':bool(ra.get('Refineable',False)),'Refineable':bool(ra.get('Refineable',False)),
      'gradable':bool(ra.get('Gradable',False)),'Gradable':bool(ra.get('Gradable',False)),
      'dataSource':'台服 itemInfo_UTF8.lub + rAthena Renewal 2026-06-08 item_db_equip.yml; RO_WEB 0.9.82GV 黯淡冰晶武器箱'
    }
    if ra.get('Script'):
        rec['Script']=ra['Script']; rec['scriptRaw']=ra['Script']
    weapon_records[str(iid)]=rec
    p=ROOT/f'data/equipment/weapon/{file_key}.json'; d=json.loads(p.read_text(encoding='utf-8')); d[str(iid)]=rec
    p.write_text(json.dumps(dict(sorted(d.items(),key=lambda kv:int(kv[0]))),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    file_counts[file_key]=file_counts.get(file_key,0)+1
    item_index[str(iid)]=rec

# Materials used by future exchange/enchant phases. Only Snow Flower Ore drops in this phase.
material_records={}
for iid in MATERIAL_IDS:
    ra=RA_ETC[iid]; cli=lua_entry(iid)
    rec={
      'id':iid,'officialId':iid,'name':cli['name'],'type':'etc','category':'drop_misc','subCategory':'ep19_glacier_material',
      'sellPrice':0,'buyPrice':0,'icon':f'images/items/{iid}.webp','Name':cli['name'],'description':cli['description'],
      'AegisName':ra['AegisName'],'aegisName':ra['AegisName'],'dbType':'Etc','Type':'Etc',
      'dataSource':'台服 itemInfo_UTF8.lub + rAthena Renewal 2026-06-08 item_db_etc.yml; RO_WEB 0.9.82GV'
    }
    materials[str(iid)]=rec; item_index[str(iid)]=rec; material_records[str(iid)]=rec

# Custom box. Do not reuse official item 101638 ID; only reuse its requested artwork.
box={
 'id':BOX_ID,'officialId':BOX_ID,'name':'黯淡冰晶武器箱','type':'consume','category':'loot_box','subCategory':'ep19_dim_glacier_weapon_box',
 'icon':f'images/items/{BOX_ID}.webp','buyPrice':0,'sellPrice':0,'manualUseOnly':True,'noDecompose':True,'lootBoxId':BOX_KEY,
 'description':['受到伊斯加爾特毒氣魔力侵蝕的武器箱。','開啟後，隨機獲得 26 種黯淡冰晶武器中的其中一把。','所有武器取得機率相同（每把約 3.8462%）。','箱子圖片使用台服物品 101638「黯淡冰晶武器強化」。'],
 'sourceIconItemId':BOX_ICON_SOURCE_ID,'dataSource':'RO_WEB 自訂箱子；圖片來源 item 101638；0.9.82GV'
}
consumables[str(BOX_ID)]=box; item_index[str(BOX_ID)]=box

(ROOT/'data/items/materials_2.json').write_text(json.dumps(dict(sorted(materials.items(),key=lambda kv:int(kv[0]))),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(ROOT/'data/items/consumables.json').write_text(json.dumps(dict(sorted(consumables.items(),key=lambda kv:int(kv[0]))),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(ROOT/'data/items/item_index.json').write_text(json.dumps(dict(sorted(item_index.items(),key=lambda kv:int(kv[0]))),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

# Generic loot-box data foundation for future Old Blue Box / Old Violet Box / Gift Box integration.
item_boxes={
 'version':VERSION,
 'schema':'ro_web_item_boxes_v1',
 'policy':{'selection':'weighted_single_reward','futureRAItemGroupCompatible':True,'consumeBeforeReward':True,'transactionRollback':True},
 'boxes':{
   BOX_KEY:{'itemId':BOX_ID,'name':'黯淡冰晶武器箱','consumeCount':1,'drawCount':1,'selection':'uniform',
            'rewards':[{'itemId':iid,'quantity':1,'weight':1} for iid in WEAPON_IDS],
            'publicProbability':{'rewardCount':len(WEAPON_IDS),'eachPercent':round(100/len(WEAPON_IDS),8)}}
 }
}
(ROOT/'data/item_boxes.json').write_text(json.dumps(item_boxes,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

# Add Snow Flower Ore to active EP19 maps and box drops to four Rgan worms.
monsters=json.loads((ROOT/'data/monsters.json').read_text(encoding='utf-8'))
ore_rates={21520:300,21521:300,21522:350,21523:350,21524:300,21525:400,21526:350,21527:400,21528:500,21529:600,21537:1000,21599:500}
box_rates={21526:10,21527:15,21528:20,21529:30}
changed_monsters=[]
for mob in monsters:
    mid=int(mob.get('id',0) or 0)
    if mid not in ore_rates and mid not in box_rates: continue
    drops=list(mob.get('drops') or [])
    drops=[d for d in drops if int(d.get('itemId',0) or 0) not in (1000811,BOX_ID)]
    if mid in ore_rates:
        drops.append({'itemId':1000811,'chance':ore_rates[mid],'qtyMin':1,'qtyMax':1,'name':'Snow_F_Ore','source':'RO_WEB 0.9.82GV; RA EP19 mob entries are commented and contain no drop table'})
    if mid in box_rates:
        drops.append({'itemId':BOX_ID,'chance':box_rates[mid],'qtyMin':1,'qtyMax':1,'name':'RO_WEB_Dim_Glacier_Weapon_Box','source':'RO_WEB design: 1x rates 0.10/0.15/0.20/0.30%; global drop multiplier applies'})
    mob['drops']=drops; changed_monsters.append(mid)
(ROOT/'data/monsters.json').write_text(json.dumps(monsters,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

# Manifest + server metadata.
manifest=json.loads((ROOT/'data/items/database_manifest.json').read_text(encoding='utf-8'))
manifest['version']=VERSION
_mn='0.9.82GV adds 26 Dim Glacier weapons, a uniform weapon box, and 16 EP19 glacier materials.'
if _mn not in str(manifest.get('note','')): manifest['note']=(str(manifest.get('note','')).rstrip()+' '+_mn).strip()
manifest['dimGlacierPhase1']={'version':VERSION,'weaponCount':26,'materialCount':16,'boxItemId':BOX_ID,'boxIconSourceItemId':BOX_ICON_SOURCE_ID,'eachWeaponChancePercent':round(100/26,8),'raMonsterDropSource':'Unavailable: EP19 mob_db entries are commented placeholders without drop tables.'}
(ROOT/'data/items/database_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
server=json.loads((ROOT/'data/server_config.json').read_text(encoding='utf-8'))
server['version']=VERSION
_sn='0.9.82GV：雪花魔力原石加入冰鱗山丘／蛇巢穴 EP19 怪物掉落；四種蠕蟲追加黯淡冰晶武器箱。箱子原始掉率為 0.10%/0.15%/0.20%/0.30%，再套用全域 drop 倍率。'
if _sn not in server.setdefault('notes',[]): server['notes'].append(_sn)
(ROOT/'data/server_config.json').write_text(json.dumps(server,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

# Generic runtime.
runtime=r'''//=======================================
// RO_WEB ItemBoxRuntime v0.9.82GV
// Generic weighted loot-box runtime. The first active box is the EP19
// Dim Glacier weapon box; future RA item groups can reuse the same schema.
//=======================================
(function () {
  "use strict";
  const VERSION = "0.9.82GV";
  const DATA_KEY = "data/item_boxes.json";
  const number = (v, f = 0) => Number.isFinite(Number(v)) ? Number(v) : f;
  const config = () => window.RO_WEB_DATA?.[DATA_KEY] || { boxes:{} };
  const allBoxes = () => Object.values(config().boxes || {});
  const itemData = id => window.getItemData?.(id) || null;
  function boxForItem(item) {
    if (!item) return null;
    const byKey = item.lootBoxId && config().boxes?.[String(item.lootBoxId)];
    return byKey || allBoxes().find(box => String(box.itemId) === String(item.id)) || null;
  }
  function inventoryStack(itemId) {
    return (window.player?.inventory || []).find(row => String(row.id) === String(itemId) && number(row.count) > 0) || null;
  }
  function removeStack(itemId, amount = 1) {
    const stack = inventoryStack(itemId); const count = Math.max(1, Math.floor(number(amount,1)));
    if (!stack || number(stack.count) < count) return false;
    stack.count = number(stack.count) - count;
    if (stack.count <= 0) {
      const index = window.player.inventory.indexOf(stack);
      if (index >= 0) window.player.inventory.splice(index,1);
    }
    return true;
  }
  function restoreStack(item, amount = 1) {
    const count = Math.max(1, Math.floor(number(amount,1))); const stack = inventoryStack(item.id);
    if (stack) stack.count = number(stack.count) + count;
    else window.player.inventory.push({ id:item.id, name:item.name, count, locked:false });
  }
  function weightedReward(box) {
    const rewards=(box?.rewards || []).filter(row => number(row.weight,1) > 0 && itemData(row.itemId));
    if (!rewards.length) return null;
    const total=rewards.reduce((sum,row)=>sum+number(row.weight,1),0);
    let roll=Math.random()*total;
    for (const row of rewards) { roll-=number(row.weight,1); if (roll < 0) return row; }
    return rewards[rewards.length-1];
  }
  function openBox(item) {
    const box=boxForItem(item); if (!box) return false;
    const consumeCount=Math.max(1,Math.floor(number(box.consumeCount,1)));
    const stack=inventoryStack(item.id);
    if (!stack || number(stack.count) < consumeCount) { window.addBattleLog?.(`背包裡沒有 ${item.name}。`); return false; }
    const reward=weightedReward(box);
    if (!reward) { window.addBattleLog?.(`${item.name} 的獎池資料異常，未消耗箱子。`); return false; }
    const rewardItem=itemData(reward.itemId);
    if (!rewardItem) { window.addBattleLog?.(`${item.name} 找不到獎勵物品 ${reward.itemId}，未消耗箱子。`); return false; }
    if (!removeStack(item.id,consumeCount)) return false;
    const oldBatch=window.RO_WEB_REWARD_BATCH_ACTIVE, oldSuppress=window.RO_WEB_SUPPRESS_REWARD_ADD_ITEM_LOG;
    try {
      window.RO_WEB_REWARD_BATCH_ACTIVE=true; window.RO_WEB_SUPPRESS_REWARD_ADD_ITEM_LOG=true;
      window.addItem?.({id:Number(rewardItem.id),name:rewardItem.name},Math.max(1,Math.floor(number(reward.quantity,1))));
    } catch (error) {
      restoreStack(item,consumeCount); console.error('[ItemBoxRuntime] rollback',error);
      window.addBattleLog?.(`${item.name} 開啟失敗，箱子已自動歸還。`); return false;
    } finally {
      window.RO_WEB_REWARD_BATCH_ACTIVE=oldBatch; window.RO_WEB_SUPPRESS_REWARD_ADD_ITEM_LOG=oldSuppress;
    }
    window.addBattleLog?.(`開啟 ${item.name}，獲得 ${rewardItem.name} ×${Math.max(1,Math.floor(number(reward.quantity,1)))}。`,'rare-item');
    window.updateInventoryUI?.(); window.saveGame?.();
    return true;
  }
  const previousUseItem=window.useItem;
  window.useItem=function itemBoxUseItem(itemId,instance=null,options={}) {
    const item=itemData(itemId); if (boxForItem(item)) return openBox(item);
    return previousUseItem?.(itemId,instance,options);
  };
  window.ItemBoxRuntime=Object.freeze({version:VERSION,config,boxForItem,weightedReward,openBox});
})();
'''
(ROOT/'js/item_box_runtime.js').write_text(runtime,encoding='utf-8')

# Insert runtime after MVP gacha and update cache version.
index=(ROOT/'index.html').read_text(encoding='utf-8')
index=index.replace('0.9.82GU',VERSION)
needle=f'  <script src="./js/mvp_gacha_runtime.js?v={VERSION}"></script>\n'
insert=needle+f'  <script src="./js/item_box_runtime.js?v={VERSION}"></script>\n'
if 'js/item_box_runtime.js' not in index:
    if needle not in index: raise RuntimeError('Unable to locate MVP gacha script tag')
    index=index.replace(needle,insert)
(ROOT/'index.html').write_text(index,encoding='utf-8')

# Version docs.
for name in ['README.md','AI_START_HERE.md','CHANGELOG.md']:
    p=ROOT/name
    if p.exists():
        s=p.read_text(encoding='utf-8')
        if name=='CHANGELOG.md' and f'## {VERSION} — EP19 黯淡冰晶武器箱第一階段' not in s: s=f'\n## {VERSION} — EP19 黯淡冰晶武器箱第一階段\n- 新增 26 把黯淡冰晶武器、16 種雪花／侵蝕／萃取材料。\n- 新增黯淡冰晶武器箱（圖片取自 101638），26 把等機率。\n- 四種蠕蟲掉箱率：0.10%／0.15%／0.20%／0.30% 原始率，套用全域掉寶倍率。\n- EP19 新地圖怪物追加雪花魔力原石；RA 2026-06-08 對應怪物僅有註解占位，沒有官方掉落表。\n'+s
        else: s=s.replace('0.9.82GU',VERSION)
        p.write_text(s,encoding='utf-8')

report={
 'version':VERSION,'boxId':BOX_ID,'boxIconSourceId':BOX_ICON_SOURCE_ID,'weapons':len(weapon_records),'materials':len(material_records),
 'weaponFiles':file_counts,'changedMonsters':changed_monsters,'oreRatesBasisPoints':ore_rates,'boxRatesBasisPoints':box_rates,
 'missingImages':[],'raEp19MobDropsAvailable':False,'eachWeaponChancePercent':100/26
}
(ROOT/f'EP19_DIM_GLACIER_BUILD_REPORT_{VERSION}.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
