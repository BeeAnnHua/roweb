#!/usr/bin/env python3
from pathlib import Path
import json, re, sys
ROOT=Path(__file__).resolve().parents[1]

def load(rel): return json.loads((ROOT/rel).read_text(encoding='utf-8-sig'))
def check(cond,msg):
    if not cond: raise AssertionError(msg)

maps=load('data/maps.json')
mons=load('data/monsters.json')
config=load('data/monster_spawn_config.json')
server=load('data/server_config.json')
manifest=load('data/world_region_manifest.json')
mon_by_id={int(m['id']):m for m in mons}
check(config.get('version')=='0.9.82EM','spawn config version')
check(manifest.get('version')=='0.9.82EM','manifest version')
check(len(maps)==10,'ten maps')
check(len(config.get('regions',{}))==10,'ten profiles')
check(config['global']['baseMonstersPerSource512']==15,'15 per 512')
check(config['global']['activeWindowSourceSize']==1024,'active 1024')
check(config['global']['retainWindowSourceSize']==1280,'retain 1280')
check(config['global']['normalHardCap']==120,'hard cap 120')
valves=server.get('server',{}).get('monsters',{})
for key in ['mob_count_rate','mob_spawn_delay','plant_spawn_delay','boss_spawn_delay','mob_spawn_variance']:
    check(key in valves,f'missing server valve {key}')

all_ids=set()
for m in maps:
    mid=m['id']; profile=config['regions'].get(m.get('monsterSpawnProfile'))
    check(profile is not None,f'missing profile {mid}')
    check(m.get('monsterStreaming') is True,f'streaming false {mid}')
    check(m.get('monsterVisualTest') is True,f'visual runtime false {mid}')
    check(m.get('noMonster') is False,f'noMonster true {mid}')
    check(m.get('monsterTestSequence')==[],f'test sequence remains {mid}')
    ids=[int(e['monsterId']) for e in profile['pool']]
    check(ids==[int(x) for x in m.get('monsters',[])],f'map/profile ID mismatch {mid}')
    cats={}
    for e in profile['pool']:
        cat=e['category']; cats[cat]=cats.get(cat,0)+1
        monster_id=int(e['monsterId']); all_ids.add(monster_id)
        check(monster_id in mon_by_id,f'missing monster {monster_id}')
        monster=mon_by_id[monster_id]
        jp=ROOT/monster['animationJson']; check(jp.is_file(),f'missing json {jp}')
        anim=json.loads(jp.read_text(encoding='utf-8-sig'))
        atlases=anim.get('atlases') or ([anim['atlas']] if anim.get('atlas') else [])
        check(atlases,f'no atlas defs {monster_id}')
        for atlas in atlases:
            check((jp.parent/atlas['file']).is_file(),f'missing atlas {monster_id}:{atlas["file"]}')
        if cat in ('rare','boss','mvp'):
            check(e.get('maxAlive')==1,f'unique maxAlive {mid}:{monster_id}')
            check(e.get('countRateEligible') is False,f'unique count rate {mid}:{monster_id}')
            check(e.get('persistentTimer') is True,f'unique timer {mid}:{monster_id}')
    check(cats.get('normal',0)>0,f'no normal pool {mid}')

# User-requested Poring Island concurrent unique monsters.
payon=config['regions']['payon_3x3_region_camera']['pool']
by_id={int(e['monsterId']):e for e in payon}
for monster_id in [1090,1096,1120,1582]:
    check(monster_id in by_id,f'Payon unique missing {monster_id}')
    check(by_id[monster_id]['maxAlive']==1,f'Payon unique max {monster_id}')
check(by_id[1090]['baseRespawnMs']==3600000 and by_id[1090]['respawnVarianceMs']==1800000,'Mastering timer')
check(by_id[1096]['baseRespawnMs']==3600000 and by_id[1096]['respawnVarianceMs']==1800000,'Angeling timer')
check(by_id[1120]['baseRespawnMs']==3600000 and by_id[1120]['respawnVarianceMs']==1800000,'Ghostring timer')
check(by_id[1582]['baseRespawnMs']==7200000 and by_id[1582]['respawnVarianceMs']==3600000,'Deviling timer')

# The previous forced Mjolnir Poring/Scorpion field test must be gone.
mj_ids={int(e['monsterId']) for e in config['regions']['mjolnir_3x3_region_camera']['pool']}
check(1001 not in mj_ids and 1002 not in mj_ids,'old Mjolnir test pair remains')

# rAthena Renewal AI/Modes were imported for every selected monster.
ai_modes=load('data/monster_ai_modes.json')
check(ai_modes.get('version')=='0.9.82EM','AI mode version')
check(ai_modes['aegisAiTypes']['02']['bitmask']==0x83,'Aegis AI 02 mask')
check(ai_modes['aegisAiTypes']['21']['bitmask']==0x3695,'Aegis AI 21 mask')
for monster_id in all_ids:
    monster=mon_by_id[monster_id]
    check(isinstance(monster.get('modeBitmask'),int),f'mode bitmask missing {monster_id}')
    check(isinstance(monster.get('behavior'),dict),f'behavior missing {monster_id}')
    for key in ['canMove','canAttack','aggressive','assist','castSensorIdle','noRandomWalk','randomWalk','knockbackImmune']:
        check(key in monster['behavior'],f'behavior {key} missing {monster_id}')

runtime=(ROOT/'js/world_monster_test_runtime.js').read_text(encoding='utf-8')
for token in ['markWorldMonsterAttacked','retaliationChaseMinCells','preferredSpawnRadiusWorldPx','nearSpawnBias','monster_spawn_config.json','monsterCountRate','normalSpawnDelayRate','plantSpawnDelayRate','bossSpawnDelayRate','activeWindowSourceSize','retainWindowSourceSize','normalHardCap','respawnQueue','nextSpawnAt','frame.atlas','animationAtlases','onWorldMonsterDefeated','getWorldMonsterTestEntities']:
    check(token in runtime,f'runtime token missing {token}')
for forbidden in ['getWorldMonsterSpawnOffsets','Displays only Poring','world-monster-debug-cross']:
    check(forbidden not in runtime,f'old test runtime remains: {forbidden}')

battle=(ROOT/'js/battle.js').read_text(encoding='utf-8')
check('onWorldMonsterDefeated(defeatedMonster)' in battle,'battle death hook missing')
check('附近暫時沒有可鎖定的怪物' in battle,'streaming target message missing')
css=(ROOT/'css/style.css').read_text(encoding='utf-8')
check('V0.9.82EM - RA regional monster streaming' in css,'stream CSS missing')
check('.world-monster-debug-cross' not in css,'debug cross CSS remains')
index=(ROOT/'index.html').read_text(encoding='utf-8')
versions=set(re.findall(r'[?&]v=([^"&]+)',index))
check(versions=={'0.9.82EM'},f'cache versions {versions}')
check('RO_WEB V0.9.82EM' in index,'title version')

data_bundle=(ROOT/'js/data_bundle.js').read_text(encoding='utf-8')
check('data/monster_spawn_config.json' in data_bundle,'spawn config absent from bundle')
check('data/monster_ai_modes.json' in data_bundle,'AI modes absent from bundle')
check('assets/monsters/animations/1010/1010.json' in data_bundle,'multi-atlas monster absent from bundle')

print(json.dumps({
  'version':'0.9.82EM','status':'PASS','raAiModes':True,'regions':10,'selectedSpecies':len(all_ids),
  'monsterRecords':len(mons),'payonConcurrentUnique':[1090,1096,1120,1582],
  'densityAt100':60,'normalHardCap':120,'cacheVersions':sorted(versions)
},ensure_ascii=False,indent=2))
