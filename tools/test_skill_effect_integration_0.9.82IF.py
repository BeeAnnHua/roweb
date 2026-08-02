#!/usr/bin/env python3
from __future__ import annotations
import json, math, pathlib, subprocess, sys, hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
ASSET=ROOT/'assets/skill_effects/v92'
errors=[]; checks={}

def load(path):
    with open(path,encoding='utf-8') as f:
        return json.load(f, parse_constant=lambda x: (_ for _ in ()).throw(ValueError(f'non-finite {x}')))

def check(name, ok, detail=None):
    checks[name]={'pass':bool(ok)}
    if detail is not None: checks[name]['detail']=detail
    if not ok: errors.append(name if detail is None else f'{name}: {detail}')

manifest=load(ASSET/'V92_RUNTIME_TIMELINE_MANIFEST.json')
effects=load(ASSET/'V92_EFFECT_MANIFEST.json')
gate=load(ASSET/'V92_RUNTIME_GATE_INDEX.json')
audit=load(ROOT/'SKILL_EFFECT_PASSIVE_EXCLUSION_AUDIT_0.9.82IB.json')
runtime=load(ROOT/'data/skill_runtime/runtime_generated_all.json')['skills']
skill_rows=manifest['skills']; effect_rows=effects['effects']
check('manifest_skill_count',len(skill_rows)==55,len(skill_rows))
check('manifest_effect_count',len(effect_rows)==454,len(effect_rows))
check('passive_runtime_count',audit['summary']['roWebPassiveSkillCount']==216,audit['summary']['roWebPassiveSkillCount'])
check('candidate_passive_intersection_zero',audit['summary']['candidatePassiveIntersection']==0,audit['summary']['candidatePassiveIntersection'])
check('localization_writeback_disabled',all(s.get('allowNameWriteback') is False and s.get('allowDescriptionWriteback') is False for s in skill_rows))
ids={int(s['skillId']) for s in skill_rows}
check('active_id_index_matches',ids==set(map(int,gate['candidateActiveIds'])))
check('excluded_ids_absent',not(ids & set(map(int,gate['candidateExcludedIds']))))
passive_ids={int(k) for k,v in runtime.items() if str((v.get('runtimeProfile') or {}).get('handler') or v.get('handler') or '').lower()=='passive'}
check('no_passive_deployed',not(ids & passive_ids),sorted(ids & passive_ids))
for s in skill_rows:
    r=runtime.get(str(s['skillId']))
    h=str((r.get('runtimeProfile') or {}).get('handler') or r.get('handler') or '').lower() if r else ''
    if not r or r.get('executionEnabled') is not True or h in ('','pending','passive'):
        errors.append(f'ineligible_deployed_skill:{s["skillId"]}:{h}:{r and r.get("executionEnabled")}')
check('all_deployed_runtime_active',not any(x.startswith('ineligible_deployed_skill') for x in errors))
fxids={x['effectId'] for x in effect_rows}; refs=set()
for s in skill_rows:
    for e in s.get('events',[]):
        refs.update(x for x in (e.get('full_effect'),e.get('min_effect')) if x)
        refs.update(x for x in e.get('source_effect_ids',[]) if x)
check('timeline_effect_closure',refs==fxids,{'refs':len(refs),'effects':len(fxids),'missing':sorted(refs-fxids)[:5],'extra':sorted(fxids-refs)[:5]})
strict_count=0; dep_count=0; missing_deps=[]
for row in effect_rows:
    p=ASSET/row['data']
    if not p.exists(): errors.append(f'missing_effect_json:{p}'); continue
    data=load(p); strict_count+=1
    if data.get('effectId')!=row['effectId']: errors.append(f'effect_id_mismatch:{row["effectId"]}')
    for dep in data.get('dependencies',[]):
        if dep.get('missing'): errors.append(f'declared_missing_dependency:{row["effectId"]}:{dep.get("declared")}'); continue
        png=dep.get('png')
        if png:
            dep_count+=1
            if not (ASSET/png).is_file(): missing_deps.append(f'{row["effectId"]}:{png}')
check('strict_effect_json_count',strict_count==454,strict_count)
check('all_png_dependencies_exist',not missing_deps,missing_deps[:10])
check('dependency_count_nonzero',dep_count>0,dep_count)
index=(ROOT/'index.html').read_text(encoding='utf-8')
skill_engine=(ROOT/'js/skill_engine.js').read_text(encoding='utf-8')
runtime_js=(ROOT/'js/skill_effect_runtime_v92.js').read_text(encoding='utf-8')
check('index_loads_v92_runtime','skill_effect_runtime_v92.js?v=0.9.82IF' in index)
check('begin_hook_present','SkillEffectRuntimeV92?.onSkillBegin' in skill_engine)
check('commit_hook_present','SkillEffectRuntimeV92?.onSkillCommit' in skill_engine)
check('hit_hook_present',skill_engine.count('SkillEffectRuntimeV92?.onSkillHit')>=2,skill_engine.count('SkillEffectRuntimeV92?.onSkillHit'))
check('dynamic_passive_guard_present',"handler === 'passive'" in runtime_js and 'executionEnabled === false' in runtime_js)
check('dual_canvas_present','skill-effect-back-canvas' in runtime_js and 'skill-effect-front-canvas' in runtime_js)
check('skill_end_lifecycle_present','cleanupLifecycle' in runtime_js and "event.trigger === 'SKILL_END'" in runtime_js)
check('projectile_anchor_present',"target === 'PROJECTILE_PATH'" in runtime_js)
check('ground_world_snapshot_policy_present', 'GROUND_WORLD_SNAPSHOT' in runtime_js and 'captureGroundAnchor' in runtime_js)
check('target_payload_capture_present', 'captureTargetPayload' in runtime_js and 'targetWorldPosition' in skill_engine)
check('no_caster_ground_fallback', 'GROUND_WORLD_FALLBACK_CASTER' not in runtime_js and 'GROUND_CANVAS_FALLBACK_CENTER' not in runtime_js)
check('pending_ground_hit_repair_present', 'pendingGroundEvents' in runtime_js and 'flushPendingGroundEvents' in runtime_js and 'repairRecentGroundAnchors' in runtime_js)
check('commit_target_payload_present', 'buildSkillEffectTargetContext' in skill_engine and 'commitRuntimeSkillTiming(skill, level, options)' in skill_engine)
check('acidified_ground_snapshot_ids_present', 'new Set([5340, 5341, 5342])' in runtime_js)
check('world_coordinate_conversion_present', 'anchorFromWorldPosition' in runtime_js and 'getLogicalPointClientPosition' in runtime_js)
check('buff_caster_live_policy_present', "target === 'CASTER_FOOT'" in runtime_js and "currentPlayerObject()" in runtime_js)
check('version_updated','RO_WEB 0.9.82IF' in index and 'const RO_WEB_VERSION = "0.9.82IF";' in (ROOT/'js/game.js').read_text(encoding='utf-8'))
node_files=[ROOT/'js/skill_effect_runtime_v92.js',ROOT/'js/skill_engine.js',ROOT/'js/game.js']
node_ok=True; node_output=[]
for p in node_files:
    result=subprocess.run(['node','--check',str(p)],capture_output=True,text=True)
    node_output.append({'file':str(p.relative_to(ROOT)),'returncode':result.returncode,'stderr':result.stderr.strip()})
    node_ok &= result.returncode==0
check('node_syntax',node_ok,node_output)
vm=subprocess.run(['node',str(ROOT/'tools/test_skill_effect_runtime_0.9.82IF.js')],capture_output=True,text=True)
check('node_vm_runtime_selftest',vm.returncode==0,{'stdout':vm.stdout[-3000:],'stderr':vm.stderr[-1000:]})
result={'version':'0.9.82IF','pass':not errors,'summary':{'skills':len(skill_rows),'effects':len(effect_rows),'strictEffectJson':strict_count,'pngDependencyReferences':dep_count,'passiveRuntimeSkills':len(passive_ids),'candidatePassiveIntersection':len(ids&passive_ids),'checksPassed':sum(1 for x in checks.values() if x['pass']),'checksTotal':len(checks)},'checks':checks,'errors':errors}
out=ROOT/'TEST_REPORT_0.9.82IF_SKILL_EFFECT_RUNTIME.json'
out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
(ROOT/'TEST_REPORT_0.9.82IF_SKILL_EFFECT_RUNTIME.txt').write_text('\n'.join([
 'RO_WEB 0.9.82IF V92 Skill Effect Runtime Test',
 '='*56,
 f"Result: {'PASS' if result['pass'] else 'FAIL'}",
 f"Skills: {len(skill_rows)}",
 f"Effects: {len(effect_rows)}",
 f"RO_WEB passive skills recorded/excluded by policy: {len(passive_ids)}",
 f"Passive intersection with V91.6 Ready candidates: {len(ids&passive_ids)}",
 f"Strict Effect JSON: {strict_count}",
 f"PNG dependency references checked: {dep_count}",
 f"Checks: {result['summary']['checksPassed']}/{result['summary']['checksTotal']}",
 *([f'ERROR: {e}' for e in errors] if errors else ['All static, closure, passive-gate, Node syntax and VM runtime checks passed.'])
])+'\n',encoding='utf-8')
print(json.dumps(result['summary']|{'pass':result['pass'],'errors':errors[:10]},ensure_ascii=False,indent=2))
sys.exit(0 if result['pass'] else 1)
