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
check('<title>RO_WEB 0.9.82GC</title>' in index,'index version')
check('const RO_WEB_VERSION = "0.9.82GC"' in game,'game version')
check(set(re.findall(r'\?v=([^"\']+)',index))=={'0.9.82GC'},'cache version consistency')
check('js/mvp_gacha_runtime.js?v=0.9.82GC' in index,'MVP gacha Runtime loaded')
check(index.index('js/item_instance_ui.js?v=0.9.82GC') < index.index('js/mvp_gacha_runtime.js?v=0.9.82GC') < index.index('js/loot.js?v=0.9.82GC'),'gacha Runtime load order')

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
check(cfg['mapId']==mapid and cfg['mapExclusiveDropChanceBasisPoints']==100,'map-exclusive raw 1% drop config before global valve')
check(rare==121 and cfg['ordinaryFillBasisPoints']==9879 and rare+cfg['ordinaryFillBasisPoints']==10000,'single gacha mother pool totals 100%',f'{rare}+{cfg["ordinaryFillBasisPoints"]}')
check([(x['chanceBasisPoints'],x['tier']) for x in cfg['rareCategories']]==[(1,'gold'),(10,'purple'),(100,'red'),(10,'purple')],'gold/purple/red banner tier mapping')
check(len(cfg['ordinaryRewards'])==16 and sum(x['weight'] for x in cfg['ordinaryRewards'])==200,'ordinary reward weights preserve both user tables')
loot=(ROOT/'js/loot.js').read_text(encoding='utf8'); gr=(ROOT/'js/mvp_gacha_runtime.js').read_text(encoding='utf8')
check('MvpGachaRuntime?.rollMapExclusiveDrop?.(monster)' in loot,'loot settlement calls map-exclusive hook')
for token in ('activeMap()?.id','mapExclusiveMvpGachaRolled','mapExclusiveDropChanceBasisPoints','getFinalDropChanceBasisPoints'):
    check(token in gr,f'gacha map/global-drop token {token}')
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
check(all((ROOT/all_items[iid]['icon']).is_file() for iid in required_items),'all gacha reward item icon references exist')
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

# GA targeting, rotation, converter priority, global drop valve, and gacha icon
skill_engine=(ROOT/'js/skill_engine.js').read_text(encoding='utf8')
auto_battle=(ROOT/'js/auto_battle.js').read_text(encoding='utf8')
pipeline=(ROOT/'js/ra_renewal_damage_pipeline.js').read_text(encoding='utf8')
server=load('data/server_config.json')['server']['rates']
check('function runtimeSkillRequiresPrimaryTargetRange' in skill_engine and 'officialSplashAreaExpanded' in skill_engine,'self-centred skill range bypass and official splash expansion are installed')
check('attackRotationCursor' in auto_battle and 'commitAutoAttackSkillRotation' in auto_battle,'four attack slots use round-robin rotation')
check('function physicalSkillElement' in pipeline and "mode==='fixed'" in pipeline,'fixed skill property overrides weapon converter')
check(server.get('drop')==10000 and server.get('cardDrop')==10000 and server.get('mapExclusiveDrop')==10000,'drop master and category valves are configured',server)
check(load('data/items/cash.json')['14848']['icon']=='images/items/9525.webp','gacha uses ITEM 9525 icon')
check(not (ROOT/'images/items/14848.webp').exists() and (ROOT/'images/items/9525.webp').is_file(),'unused duplicate gacha icon removed; ITEM 9525 retained')
audit=load('tools/melee_family_targeting_audit_0.9.82GB.json')
check(audit.get('status')=='PASS' and not audit.get('issues'),'five melee-family targeting audit passes',audit.get('issues'))


# GB: Renewal hit formula, card rarity, Knight names, resets, auto-battle safety and Time set cache hardening.
combat=(ROOT/'js/combat_mechanics_runtime.js').read_text(encoding='utf8')
check('const renewalBaseRate=(opt.baseRate===undefined||opt.baseRate===null)?80' in combat,'Renewal physical hit starts from 80 + HIT - FLEE')
check('let chance=renewalBaseRate+hit-flee' in combat,'Renewal HIT/FLEE delta is consumed')

card_effects=load('data/card_runtime/card_effects.json')
tier_counts={tier:sum(1 for row in card_effects.values() if row.get('cardVisualTier')==tier) for tier in ('normal','boss','mvp')}
check(tier_counts=={'normal':687,'boss':81,'mvp':142},'910 cards classified normal/Boss/MVP',tier_counts)
check(all((ROOT/f'images/items/card_{tier}.webp').is_file() for tier in ('normal','boss','mvp')),'three shared card rarity icons exist')
try:
    sizes={tier:Image.open(ROOT/f'images/items/card_{tier}.webp').size for tier in ('normal','boss','mvp')}
    check(all(size==(20,15) for size in sizes.values()),'shared card rarity icons preserve 20x15 pixel size',sizes)
except Exception as e: check(False,'shared card rarity icons readable',e)
item_index=load('data/items/item_index.json')
check(sum(1 for row in item_index.values() if row.get('cardVisualTier'))==910,'card rarity propagated to item index')
check(all(row.get('icon')=='images/items/card_mvp.webp' for row in item_index.values() if row.get('cardVisualTier')=='mvp'),'MVP cards use gold shared icon')
check(all(row.get('icon')=='images/items/card_boss.webp' for row in item_index.values() if row.get('cardVisualTier')=='boss'),'Boss cards use pale-purple shared icon')
check(all(row.get('icon')==('images/items/4001.webp' if int(row.get('id') or 0)==4001 else 'images/items/card_normal.webp') for row in item_index.values() if row.get('cardVisualTier')=='normal'),'normal cards share original card icon while 4001 keeps explicit original path')

knight_names={2:'單手劍使用熟練度',3:'雙手劍使用熟練度',4:'快速恢復',5:'狂擊',6:'挑釁',7:'怒爆',8:'霸體',144:'移動時恢復HP',145:'攻擊弱點',146:'狂暴狀態',55:'長矛使用熟練度',56:'連刺攻擊',57:'騎乘攻擊',58:'長矛刺擊',59:'投擲長矛攻擊',60:'雙手劍攻擊速度增加',61:'反擊',62:'怪物互擊',63:'騎乘術',64:'騎兵修練',1001:'衝鋒攻擊',495:'單手劍攻擊速度增加',355:'靈氣劍',356:'雙劍格擋',357:'集中攻擊',358:'極速回復',359:'狂怒之槍',397:'螺旋擊刺',398:'傷害增壓',399:'巧打',2001:'魔力劍',2002:'音速衝擊波',2003:'死亡反彈',2004:'百矛穿刺',2005:'風壓飛刃',2006:'致命爆裂',2007:'龍駕馭',2008:'龍之氣息',2009:'龍之咆哮',2010:'盧恩精熟',2020:'幻象突刺',5004:'龍之氣息-水',5014:'烈火戰車',5201:'死侍武器',5203:'死侍武器-標記',5204:'死侍武器-瞬幻',5205:'死侍武器-破滅',5206:'蓄力刺擊',5207:'雙向防禦',5208:'橫揮斬',6001:'天龍氣息',5210:'天龍光環',5211:'狂暴粉碎',5212:'活力之源',5213:'風暴斬擊',6502:'神龍貫刺'}
core=load('data/skills/skills_core_1.json').get('skills',{})
name_errors=[]
for sid,expected in knight_names.items():
    row=core.get(str(sid))
    if not row or row.get('name')!=expected: name_errors.append((sid,None if not row else row.get('name'),expected))
check(not name_errors and len(knight_names)==56,'Knight lineage 56 visible skill names are Traditional Chinese',name_errors[:10])
english_pattern=re.compile(r'"name"\s*:\s*"(?:Wind Cutter|Ignition Break|Aura Blade|Parrying|Concentration|Relax|Frenzy|Spiral Pierce|Death Bound|Hundred Spear|Sonic Wave|Servant Weapon|Madness Crusher|Dragonic Breath|Dragonic Aura)"')
english_hits=[]
for folder in ('data/skills','data/skill_runtime'):
    for path in (ROOT/folder).rglob('*.json'):
        if english_pattern.search(path.read_text(encoding='utf-8-sig')): english_hits.append(path.relative_to(ROOT).as_posix())
check(not english_hits,'Knight player-visible skill records contain no remaining English names',english_hits)

status_js=(ROOT/'js/status_system.js').read_text(encoding='utf8'); job_js=(ROOT/'js/job.js').read_text(encoding='utf8'); battle_js=(ROOT/'js/battle.js').read_text(encoding='utf8'); player_js=(ROOT/'js/player.js').read_text(encoding='utf8')
check('function resetAllPlayerStats(options = {})' in status_js and '免費重置素質' in status_js,'status window has free reset with confirmation')
check('function resetAllSkillsFree(options = {})' in job_js and '免費重置全部已學技能' in job_js,'skill window has free reset with confirmation')
check('window.RO_WEB_PLAYER_BUILD_MUTATION = true' in player_js and 'if (window.RO_WEB_PLAYER_BUILD_MUTATION === true) return true;' in battle_js,'point allocation/reset protects auto-battle loop')
check('fallbackFromFailedSkill:true' in battle_js and 'commitAutoAttackSkillRotation(autoAction.slotIndex)' in battle_js,'failed auto skill rotates and falls back to normal attack')
card_runtime=(ROOT/'js/card_runtime.js').read_text(encoding='utf8'); instance_ui=(ROOT/'js/item_instance_ui.js').read_text(encoding='utf8')
check('comboMatchMode=idsOk?"item_id":"aegis_name"' in card_runtime,'Time set Combo supports Item ID and AegisName matching')
check('invalidatePlayerUiRenderCaches?.("status")' in card_runtime and 'invalidatePlayerUiRenderCaches?.("status")' in instance_ui,'equipment/card changes invalidate visible status cache')

report={'version':'0.9.82GC','summary':{'checks':len(checks),'passed':sum(x['ok'] for x in checks),'failed':len(errors)},'errors':errors,'checks':checks}
(ROOT/'tools/test_report_0.9.82GC.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps(report,ensure_ascii=False,indent=2))
sys.exit(1 if errors else 0)
