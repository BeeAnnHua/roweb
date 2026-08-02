from pathlib import Path
import json, subprocess, sys, re
ROOT=Path(__file__).resolve().parents[1]
checks={}; errors=[]
def check(name,cond,detail=''):
    checks[name]={'pass':bool(cond),'detail':str(detail)}
    if not cond: errors.append(f'{name}: {detail}')
index=(ROOT/'index.html').read_text(encoding='utf8')
battle=(ROOT/'js/battle.js').read_text(encoding='utf8')
status=(ROOT/'js/status_system.js').read_text(encoding='utf8')
world=(ROOT/'js/world_monster_test_runtime.js').read_text(encoding='utf8')
skill=(ROOT/'js/skill_engine.js').read_text(encoding='utf8')
effect=(ROOT/'js/skill_effect_runtime_v92.js').read_text(encoding='utf8')
check('version_title','RO_WEB 0.9.82II' in index)
check('cache_bust','skill_effect_runtime_v92.js?v=0.9.82II' in index)
check('entity_before_dom',effect.find('EXACT_TARGET_ENTITY_POSITION') < effect.find('VALIDATED_TARGET_ELEMENT_FOOT_WORLD'))
check('no_species_first_match','sources.find(row => targetIdentity(row) === identity)' not in effect)
check('ambiguous_guard','ambiguousTargetIdentityRejects' in effect)
check('scheduler_finally','finally {' in battle[battle.index('function scheduleAutoBattleTick'):battle.index('function stopAutoBattleWatchdog')])
check('status_open_close_recovery',status.count('recoverAutoBattleScheduler(')>=3)
# isolate worldMonsterAttackPlayer body roughly
start=world.index('function worldMonsterAttackPlayer')
end=world.index('function getWorldMonsterRespawnRateForEntry',start)
check('no_autonomous_retaliation','requestManualRetaliationAgainstMonster(' not in world[start:end])
check('chain_key_alias','WL_CHAINLIGHTNING_ATK' in skill and 'profiles["2214"]' in skill)
for rel in ['js/skill_effect_runtime_v92.js','js/battle.js','js/status_system.js','js/world_monster_test_runtime.js','js/skill_engine.js']:
    r=subprocess.run(['node','--check',str(ROOT/rel)],capture_output=True,text=True)
    check('syntax_'+Path(rel).stem,r.returncode==0,r.stderr)
for test in ['tools/test_skill_effect_runtime_0.9.82II.js','tools/test_0.9.82II_runtime_recovery.js']:
    r=subprocess.run(['node',str(ROOT/test)],capture_output=True,text=True,timeout=30)
    check('run_'+Path(test).stem,r.returncode==0,(r.stdout+r.stderr)[-3000:])
result={'version':'0.9.82II','pass':not errors,'checks':checks,'errors':errors,'summary':{'passed':sum(v['pass'] for v in checks.values()),'total':len(checks)}}
(ROOT/'TEST_REPORT_0.9.82II_INTEGRATION.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(result,ensure_ascii=False,indent=2));sys.exit(0 if result['pass'] else 1)
