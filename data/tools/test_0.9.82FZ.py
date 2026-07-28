#!/usr/bin/env python3
from pathlib import Path
from PIL import Image
import json,re,sys
ROOT=Path(__file__).resolve().parents[1]
checks=[]; errors=[]
def check(ok,name,detail=''):
    checks.append({'ok':bool(ok),'name':name,'detail':str(detail)})
    if not ok: errors.append(f'{name}: {detail}')
def load(rel): return json.loads((ROOT/rel).read_text(encoding='utf-8-sig'))

index=(ROOT/'index.html').read_text(encoding='utf8')
game=(ROOT/'js/game.js').read_text(encoding='utf8')
check('RO_WEB V0.9.82FZ' in index,'index version')
check('const RO_WEB_VERSION = "0.9.82FZ"' in game,'game version')
check(set(re.findall(r'\?v=([^"\']+)',index))=={'0.9.82FZ'},'cache version consistency')
check('js/mvp_gacha_runtime.js?v=0.9.82FZ' in index,'MVP gacha Runtime loaded')
check(index.index('js/item_instance_ui.js?v=0.9.82FZ') < index.index('js/mvp_gacha_runtime.js?v=0.9.82FZ') < index.index('js/loot.js?v=0.9.82FZ'),'gacha Runtime load order')

maps=load('data/maps.json'); mapid='geffenia_mvp_arena_3x3_region_camera'
row=next((x for x in maps if x.get('id')==mapid),None)
check(row is not None,'葛坡尼亞 map record exists')
if row:
    check(row.get('worldCamera') is True and row.get('worldWidth')==4608 and row.get('worldHeight')==4608,'large 3x3 world dimensions',f"{row.get('worldWidth')}x{row.get('worldHeight')}")
    tiles=(row.get('chunkGrid') or {}).get('sourceTiles') or []
    check(len(tiles)==9,'map has 9 chunk tiles',len(tiles))
    for rel in tiles:
        p=ROOT/rel
        try:
            with Image.open(p) as im: check(im.size==(512,512),f'tile {p.name} 512x512',im.size)
        except Exception as e: check(False,f'tile {p.name} readable',e)
    check((ROOT/row['background']).is_file() and (ROOT/row['thumb']).is_file(),'map composite and thumbnail exist')

monsters=load('data/monsters.json'); byid={int(x['id']):x for x in monsters}
mvp_ids=[int(x) for x in (row or {}).get('monsters',[])]
expected_mvp_ids={1038,1039,1046,1059,1086,1087,1112,1115,1147,1150,1157,1159,1190,1251,1252,1272,1312,1389,1418,1511,1518,1583,1623,1685,1688,1708,1719,1734,1751,1768,1779,1785,1832,1871,1874,1885,1956,2022,2068,2131,2189,2202,2249,2251,2253,2255,2319,2529,2564,2996,3254}
excluded_mvp_ids={1646,1647,1648,1649,1650,1651,1658,1916,1917}
check(len(mvp_ids)==51 and len(set(mvp_ids))==51 and set(mvp_ids)==expected_mvp_ids,'51 unique MVP species match final arena list',len(mvp_ids))
check(not (set(mvp_ids)&excluded_mvp_ids),'9 deferred MVP species are excluded from arena',sorted(set(mvp_ids)&excluded_mvp_ids))
check(all(mid in byid and byid[mid].get('isMvp') is True for mid in mvp_ids),'all arena species are MVP')
check(all(len(byid[mid].get('drops',[]))>0 for mid in mvp_ids),'all MVP retain original drop rows')
missing_visual=[]
animated_count=0; static_count=0
for mid in mvp_ids:
    mon=byid[mid]
    if mon.get('useAnimatedAtlas'):
        animated_count+=1
        for key in ('animationAtlas','animationJson'):
            rel=mon.get(key)
            if not rel or not (ROOT/rel).is_file(): missing_visual.append((mid,key,rel))
    else:
        static_count+=1
        rel=mon.get('staticImage') or mon.get('image')
        if not rel or not (ROOT/rel).is_file(): missing_visual.append((mid,'staticImage',rel))
check(not missing_visual and animated_count==51 and static_count==0,'all 51 MVP visual assets use complete animation atlases',{'missing':missing_visual[:5],'animated':animated_count,'static':static_count})

spawn=load('data/monster_spawn_config.json')['regions'][mapid]
pool=spawn.get('pool',[])
check(len(pool)==51 and {int(x['monsterId']) for x in pool}==set(mvp_ids),'spawn profile matches all 51 MVP',len(pool))
positions=[(int(x['spawnPosition']['x']),int(x['spawnPosition']['y'])) for x in pool]
check(len(positions)==len(set(positions)),'MVP fixed spawn positions are unique')
check(all(0<=x<=4608 and 0<=y<=4608 for x,y in positions),'MVP fixed positions stay inside world')
check(all(x.get('category')=='mvp' and x.get('maxAlive')==1 and x.get('countRateEligible') is False for x in pool),'MVP spawning is one-per-species and excluded from normal density')
world_js=(ROOT/'js/world_monster_test_runtime.js').read_text(encoding='utf8')
check('storedPos || configuredPos || chooseWorldMonsterSpawnPosition' in world_js,'fixed spawnPosition consumed by world Runtime')
check('staticFallback:true' in world_js and 'monster?.staticImage || monster?.image' in world_js,'static monster visual fallback consumed by world Runtime')

cfg=load('data/mvp_gacha.json')
rare=sum(int(x.get('chanceBasisPoints',0)) for x in cfg['rareCategories'])
check(cfg['mapId']==mapid and cfg['mapExclusiveDropChanceBasisPoints']==100,'map-exclusive exact 1% drop config')
check(rare==121 and cfg['ordinaryFillBasisPoints']==9879 and rare+cfg['ordinaryFillBasisPoints']==10000,'single gacha mother pool totals 100%',f'{rare}+{cfg["ordinaryFillBasisPoints"]}')
check([(x['chanceBasisPoints'],x['tier']) for x in cfg['rareCategories']]==[(1,'gold'),(10,'purple'),(100,'red'),(10,'purple')],'gold/purple/red banner tier mapping')
check(len(cfg['ordinaryRewards'])==16 and sum(x['weight'] for x in cfg['ordinaryRewards'])==200,'ordinary reward weights preserve both user tables')
loot=(ROOT/'js/loot.js').read_text(encoding='utf8'); gr=(ROOT/'js/mvp_gacha_runtime.js').read_text(encoding='utf8')
check('MvpGachaRuntime?.rollMapExclusiveDrop?.(monster)' in loot,'loot settlement calls map-exclusive hook')
for token in ('activeMap()?.id','mapExclusiveMvpGachaRolled','randomBasisPoint() >','mapExclusiveDropChanceBasisPoints'):
    check(token in gr,f'gacha map guard token {token}')
for token in ('ro-mvp-gacha-banner red','ro-mvp-gacha-banner purple','ro-mvp-gacha-banner gold'):
    # class strings are generated dynamically; verify CSS selectors instead
    selector='.'+token.replace(' ',' .')
check('.ro-mvp-gacha-banner.red' in gr and '.ro-mvp-gacha-banner.purple' in gr and '.ro-mvp-gacha-banner.gold' in gr,'red/purple/gold banner CSS exists')

# Items, equipment and effects
item_manifest=load('data/items/database_manifest.json'); all_items={}
for rel in item_manifest['allDataPaths']:
    data=load(rel)
    rows=data.values() if isinstance(data,dict) else data
    for item in rows:
        if isinstance(item,dict) and item.get('id') is not None: all_items[int(item['id'])]=item
required_items={14848,14849,14850,14851,14852,14853,14854,14841,14886,12739,23221,23222,23223,23224,23225,23226,400368,420186,450175,480076,22202,490030,490097,450299,480312,470183,490404,4403}
check(required_items.issubset(all_items),'all gacha reward item records exist',sorted(required_items-set(all_items)))
check(all((ROOT/f'images/items/{iid}.webp').is_file() for iid in required_items),'all gacha reward icons exist')
effects=load('data/card_runtime/equipment_effects.json'); combos=load('data/card_runtime/card_combos.json')
equip_ids={400368,420186,450175,480076,22202,490030,490097,450299,480312,470183,490404}
check(all(str(i) in effects for i in equip_ids),'all gacha equipment has Script Runtime')
check(len(combos)==797,'card/equipment combo count includes 13 new combos',len(combos))
check(any(set(x.get('requiredItemIds',[]))=={400368,420186} for x in combos),'20th hat + balloon combo exists')
card_js=(ROOT/'js/card_runtime.js').read_text(encoding='utf8'); inst=(ROOT/'js/item_instance_ui.js').read_text(encoding='utf8'); effect_js=(ROOT/'js/effect_runtime.js').read_text(encoding='utf8')
for token in ('getenchantgrade','ENCHANTGRADE_D','ENCHANTGRADE_C','ENCHANTGRADE_B','ENCHANTGRADE_A','bRes:"resFlat"','bMRes:"mresFlat"','bCriticalRate:"criRate"'):
    check(token in card_js,f'CardRuntime token {token}')
check('enchantGrade:' in inst,'equipment instances preserve enchant grade')
check('resFlat:"status"' in effect_js and 'mresFlat:"status"' in effect_js and 'criRate:"status"' in effect_js,'new equipment canonical keys have status consumers')

bundle=(ROOT/'js/data_bundle.js').read_text(encoding='utf8')
check('"data/mvp_gacha.json"' in bundle,'data bundle includes gacha config')
check('"geffenia_mvp_arena_3x3_region_camera"' in bundle,'data bundle includes arena map')

report={'version':'0.9.82FZ','summary':{'checks':len(checks),'passed':sum(x['ok'] for x in checks),'failed':len(errors)},'errors':errors,'checks':checks}
(ROOT/'tools/test_report_0.9.82FZ.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps(report,ensure_ascii=False,indent=2))
sys.exit(1 if errors else 0)
