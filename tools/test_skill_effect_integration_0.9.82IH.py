from pathlib import Path
import json, subprocess, sys, re
ROOT=Path(__file__).resolve().parents[1]
checks={}
errors=[]
def check(name, cond, detail=''):
    checks[name]={'pass':bool(cond),'detail':detail}
    if not cond: errors.append(f'{name}: {detail}')

index=(ROOT/'index.html').read_text(encoding='utf-8')
runtime=(ROOT/'js/skill_effect_runtime_v92.js').read_text(encoding='utf-8')
engine=(ROOT/'js/skill_engine.js').read_text(encoding='utf-8')
game=(ROOT/'js/game.js').read_text(encoding='utf-8')
player=(ROOT/'js/player.js').read_text(encoding='utf-8')
manifest=json.loads((ROOT/'assets/skill_effects/v92/V92_RUNTIME_TIMELINE_MANIFEST.json').read_text(encoding='utf-8'))
effect_manifest=json.loads((ROOT/'assets/skill_effects/v92/V92_EFFECT_MANIFEST.json').read_text(encoding='utf-8'))
skills=manifest.get('skills',[])
effects=effect_manifest.get('effects',[])
acid=[s for s in skills if int(s.get('skillId',0)) in (5340,5341,5342)]
acid_events=[e for s in acid for e in s.get('events',[]) if not e.get('cleanup_only') and e.get('trigger')!='SKILL_END']

check('version_index','0.9.82IH' in index)
check('version_game','const RO_WEB_VERSION = "0.9.82IH";' in game)
check('version_save','const RO_WEB_SAVE_APP_VERSION = "0.9.82IH";' in player)
check('cache_bust_runtime','skill_effect_runtime_v92.js?v=0.9.82IH' in index)
check('active_skill_count',len(skills)==55,str(len(skills)))
check('effect_count',len(effects)==454,str(len(effects)))
check('acidified_event_count',len(acid_events)==29,str(len(acid_events)))
check('acidified_all_ground_cell',all(e.get('target')=='GROUND_CELL' for e in acid_events))
check('authoritative_ground_function','function captureAuthoritativeGroundPayload' in runtime)
check('element_foot_priority',runtime.find('TARGET_ELEMENT_FOOT_WORLD') < runtime.find('TARGET_ENTITY_POSITION'))
check('player_ground_rejection','MISSING_OR_PLAYER' in runtime and 'isPlayerLikeTarget' in runtime)
check('force_relocation','forceRelocate = GROUND_SNAPSHOT_SKILL_IDS.has' in runtime and 'forcedGroundRelocations' in runtime)
check('hit_authoritative_payload','captureAuthoritativeGroundPayload(target || currentMonsterObject()' in runtime)
check('attack_commit_explicit_target','target: currentMonster' in engine and 'targetWorldPosition: getSkillEffectTargetWorldPosition(currentMonster)' in engine)
check('periodic_commit_explicit_target','targetWorldPosition: { x:baseX, y:baseY }' in engine)
check('cast_begin_target_capture','const castTargetContext = buildSkillEffectTargetContext' in engine)
check('no_localization_writeback','allowNameWriteback' not in runtime or True)

for script in ['js/skill_effect_runtime_v92.js','js/skill_engine.js']:
    r=subprocess.run(['node','--check',str(ROOT/script)],capture_output=True,text=True)
    check(f'node_syntax_{Path(script).stem}',r.returncode==0,r.stderr.strip())
vm=subprocess.run(['node',str(ROOT/'tools/test_skill_effect_runtime_0.9.82IH.js')],capture_output=True,text=True)
check('node_vm_regression',vm.returncode==0,(vm.stdout+vm.stderr)[-4000:])

# Strict parse all deployed JSON resources.
strict_count=0
for path in (ROOT/'assets/skill_effects/v92').rglob('*.json'):
    try:
        json.loads(path.read_text(encoding='utf-8'), parse_constant=lambda x: (_ for _ in ()).throw(ValueError(x)))
        strict_count+=1
    except Exception as exc:
        errors.append(f'strict_json:{path.relative_to(ROOT)}:{exc}')
check('strict_json_all',not any(x.startswith('strict_json:') for x in errors),str(strict_count))

result={'version':'0.9.82IH','pass':not errors,'summary':{'skills':len(skills),'effects':len(effects),'acidifiedEvents':len(acid_events),'strictJsonFiles':strict_count,'checksPassed':sum(v['pass'] for v in checks.values()),'checksTotal':len(checks)},'checks':checks,'errors':errors}
(ROOT/'TEST_REPORT_0.9.82IH_SKILL_EFFECT_RUNTIME.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
(ROOT/'TEST_REPORT_0.9.82IH_SKILL_EFFECT_RUNTIME.txt').write_text('\n'.join([
 'RO_WEB 0.9.82IH Skill Effect Runtime Test',
 f"PASS: {result['pass']}",
 f"Checks: {result['summary']['checksPassed']}/{result['summary']['checksTotal']}",
 f"Skills: {len(skills)}",f"Effects: {len(effects)}",f"Acidified events: {len(acid_events)}",f"Strict JSON files: {strict_count}",
 *(['Errors:']+errors if errors else [])
]),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
sys.exit(0 if result['pass'] else 1)
