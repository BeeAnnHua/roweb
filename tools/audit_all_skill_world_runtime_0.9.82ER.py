from pathlib import Path
import json,re,collections
ROOT=Path(__file__).resolve().parents[1]
rows=json.loads((ROOT/'data/skill_runtime/runtime_core_1_v1.json').read_text(encoding='utf-8'))['skills']
damage_handlers={'physical_attack','physical_attack_size_hits','physical_attack_formula','physical_charge','magic_multihit','magic_damage','misc_damage','warg_sensitive_keen','chain_magic','combo_sequence','ground_damage','follow_area'}
supported_shapes={'single','circle','square','directed_line','line','cone'}
issues=[]; damage=[]; directional=[]; handler_counts=collections.Counter(); shape_counts=collections.Counter()
for sid,row in rows.items():
    profile=row.get('runtimeProfile') or row
    handler=profile.get('damageHandler') or profile.get('handler') or row.get('handler')
    handler_counts[str(handler)]+=1
    if handler not in damage_handlers:
        continue
    damage.append(int(sid))
    targeting=profile.get('targeting') or profile.get('area')
    if handler in {'ground_damage','follow_area'} and not isinstance(targeting,dict):
        issues.append({'skillId':int(sid),'name':row.get('name'),'issue':'area_handler_without_targeting','handler':handler})
        continue
    if isinstance(targeting,dict):
        shape=str(targeting.get('shape','circle'))
        shape_counts[shape]+=1
        directional.append(int(sid))
        if shape not in supported_shapes:
            issues.append({'skillId':int(sid),'name':row.get('name'),'issue':'unsupported_shape','shape':shape})
        if shape!='single' and not any(k in targeting for k in ('radius','rangeCells')) and not targeting.get('rangeToPrimaryTarget'):
            issues.append({'skillId':int(sid),'name':row.get('name'),'issue':'area_without_range','shape':shape})
source=(ROOT/'js/skill_engine.js').read_text(encoding='utf-8')
# All skill targeting must use the formal common collector, never directly enumerate old arrays.
for forbidden in ('window.activeMonsters','window.mapMonsters'):
    for m in re.finditer(re.escape(forbidden),source):
        line=source.count('\n',0,m.start())+1
        issues.append({'file':'js/skill_engine.js','line':line,'issue':'direct_legacy_monster_container','token':forbidden})
required_tokens=['getCombatEnemyCandidates','getRuntimeCombatCandidates','resolveRuntimeSkillTargets','withRuntimeCombatEvaluationContext','applyRuntimeCalculatedDamage']
for token in required_tokens:
    if token not in source: issues.append({'file':'js/skill_engine.js','issue':'missing_runtime_bridge','token':token})
report={
 'version':'0.9.82ER','scope':'六大職業＋初學者 runtime_core_1_v1',
 'officialRuntimeProfiles':len(rows),'damageSkills':len(damage),'explicitExecutionEnabledDamageSkills':sum(1 for sid,row in rows.items() if row.get('executionEnabled') is True and (((row.get('runtimeProfile') or row).get('damageHandler') or (row.get('runtimeProfile') or row).get('handler') or row.get('handler')) in damage_handlers)),
 'areaOrDirectionalDamageSkills':len(directional),'damageHandlerCounts':dict(sorted((k,v) for k,v in handler_counts.items() if k in damage_handlers)),
 'targetShapeCounts':dict(sorted(shape_counts.items())),'supportedShapes':sorted(supported_shapes),
 'issues':issues,'status':'PASS' if not issues else 'FAIL'
}
(ROOT/'tools/all_skill_world_runtime_audit_0.9.82ER.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
if issues: raise SystemExit(1)
