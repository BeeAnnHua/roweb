#!/usr/bin/env python3
from pathlib import Path
import json, re, collections
ROOT=Path(__file__).resolve().parents[1]
VERSION='0.9.82EA'

def load(p): return json.loads((ROOT/p).read_text(encoding='utf-8-sig'))
skills={}
for rel in ('data/skills/skills_core_1.json','data/skills/skills_core_2.json'):
    data=load(rel)
    for k,v in (data.get('skills') or {}).items():
        if isinstance(v,dict): skills[int(k)]=v
runtime=load('data/skill_runtime/runtime_generated_all.json')['skills']
pending_scope=load('tools/pending_skill_scope_audit_0.9.82DZ.json') if (ROOT/'tools/pending_skill_scope_audit_0.9.82DZ.json').exists() else {}
handlers=collections.Counter(); errors=[]; warnings=[]
counts=collections.Counter(); ground_rows=[]; attack_rows=[]; magic_rows=[]; physical_rows=[]
attack_handlers={'physical_attack','physical_attack_size_hits','physical_attack_formula','physical_charge','magic_multihit','magic_damage','misc_damage','ground_damage','chain_magic','combo_sequence','warg_sensitive_keen','follow_area'}
physical_handlers={'physical_attack','physical_attack_size_hits','physical_attack_formula','physical_charge','warg_sensitive_keen'}
magic_handlers={'magic_multihit','magic_damage','chain_magic'}
ground_handlers={'ground_damage','ground_debuff','ground_protection','sanctuary_area','follow_area'}
for sid_s,row in runtime.items():
    sid=int(sid_s); skill=skills.get(sid)
    if not skill:
        errors.append(f'{sid}: runtime row missing Skill Core'); continue
    p=row.get('runtimeProfile') or row.get('formula') or {}
    if not isinstance(p,dict):
        errors.append(f'{sid}: runtimeProfile not object'); continue
    h=str(p.get('handler') or row.get('handler') or '')
    handlers[h]+=1
    maxlv=max(1,int(skill.get('maxLevel') or 1))
    if h=='pending' or not h:
        counts['pending']+=1; continue
    counts['implemented']+=1
    if h in attack_handlers:
        attack_rows.append(sid); counts['attack']+=1
        if h not in {'combo_sequence'} and not any(k in p for k in ('ratio','matkRatio','matkRatioPerHit','fixedDamage','formula','damageHandler','dotFlatDamage','miscFormulaMode','sequence')):
            errors.append(f'{sid} {skill.get("name")}: attack handler lacks damage formula metadata')
    if h in physical_handlers or str(p.get('damageHandler') or '').startswith('physical'):
        physical_rows.append(sid); counts['physical']+=1
    if h in magic_handlers or str(p.get('damageHandler') or '').startswith('magic'):
        magic_rows.append(sid); counts['magic']+=1
    target_type=str(skill.get('targetType') or '').lower()
    has_ground=isinstance(p.get('ground'),dict)
    if target_type=='ground' or h in ground_handlers or has_ground:
        ground_rows.append(sid); counts['ground']+=1
        targeting=p.get('targeting') or {}
        if not isinstance(targeting,dict): errors.append(f'{sid}: ground targeting not object')
        else:
            radius=targeting.get('radius',targeting.get('rangeCells'))
            area_meta=p.get('area')
            adapted_non_ground = h in {'passive','buff','heal','heal_fixed'} or str(p.get('targetPolicy') or '').lower()=='self'
            specialized_ground = h in {'teleport','movement','warp_portal','ground_clear','monster_info','trap_remove','trap_detonator','combo_sequence'}
            if radius is None and not isinstance(area_meta,dict) and not adapted_non_ground and not specialized_ground and h not in {'ground_protection'}:
                warnings.append(f'{sid} {skill.get("name")}: ground radius absent')
        area_meta=p.get('area')
        direct_area = (isinstance(targeting,dict) and any(k in targeting for k in ('radius','rangeCells','shape','widthCells'))) or isinstance(area_meta,dict)
        specialized_ground = h in {'teleport','movement','warp_portal','ground_clear','monster_info','trap_remove','trap_detonator','debuff','timed_status','combo_sequence'}
        adapted_non_ground = h in {'passive','buff','heal','heal_fixed'} or str(p.get('targetPolicy') or '').lower()=='self'
        if h not in ground_handlers and not has_ground and not direct_area and not specialized_ground and not adapted_non_ground:
            errors.append(f'{sid} {skill.get("name")}: Ground skill lacks target-area or ground runtime semantics')
        if has_ground:
            mode=str(p['ground'].get('triggerMode') or '')
            if mode=='periodic':
                interval=p['ground'].get('tickIntervalMs') or skill.get('unit',{}).get('Interval')
                if not interval or (isinstance(interval,(int,float)) and interval<=0): errors.append(f'{sid}: periodic ground interval invalid')
                duration=p['ground'].get('durationMs',skill.get('duration1'))
                if duration is None: errors.append(f'{sid}: periodic ground duration missing')
            if mode=='stay' and h not in {'timed_status','magic_damage','magic_multihit'}: warnings.append(f'{sid}: stay mode with handler {h}')
    # distance metadata must resolve to something for active target skills
    if h not in {'passive','pending'} and str(skill.get('targetType') or '').lower() in {'attack','ground','support'}:
        target_origin=(p.get('targeting') or {}).get('origin') if isinstance(p.get('targeting'),dict) else None
        if skill.get('range') is None and target_origin!='self' and str(p.get('targetPolicy') or '').lower()!='self': warnings.append(f'{sid}: active target skill range absent')
    # arrays must not exceed max level badly (extra RA over-level rows allowed by one)
    for key in ('ratio','matkRatio','matkRatioPerHit','damageHitCount','visualHitCount','duration','tickIntervalMs','maxTicks'):
        val=p.get(key)
        if isinstance(val,list) and len(val)<maxlv: errors.append(f'{sid}: {key} has {len(val)} levels, expected {maxlv}')

# key official behavior checks
key={sid:(skills[sid],(runtime[str(sid)].get('runtimeProfile') or {})) for sid in (83,85,89,92)}
if key[83][1].get('ground',{}).get('maxTicks',[None]*10)[9]!=7: errors.append('Meteor Lv10 must schedule 7 meteors')
if key[85][1].get('damageHitCount')!=1 or key[85][1].get('visualHitCount')!=20: errors.append('Lord of Vermilion logical/visual hit split incorrect')
if key[89][1].get('ground',{}).get('maxTicks')!=10 or key[89][1].get('ground',{}).get('tickIntervalMs')!=450: errors.append('Storm Gust must be 10 waves at 450ms')
if key[92][1].get('ground',{}).get('activeInstanceLimit')!=3: errors.append('Quagmire active instance limit must be 3')

src=(ROOT/'js/skill_engine.js').read_text(encoding='utf-8')
mechanics=(ROOT/'js/combat_mechanics_runtime.js').read_text(encoding='utf-8')
required_tokens=[
 'const RO_WEB_ACTIVE_ATTACK_MIN_INTERVAL_MS = 140',
 'getLevelValue(profile.matkRatioPerHit, level, 100)',
 '["periodic","stay"].includes(String(profile?.ground?.triggerMode || ""))',
 'profile?.ground?.triggerMode === "stay"',
 'profileOverride:tickProfile',
 'GroundPlacementResolver.resolve'
]
for token in required_tokens:
    if token not in src and token not in mechanics: errors.append(f'missing runtime token: {token}')
legacy_patterns={
 'legacy_hit_plus_80':r'hit\s*-\s*flee\s*\+\s*80',
 'legacy_aspd_formula':r'2000\s*-\s*\(\s*aspd\s*-\s*150\s*\)\s*\*\s*45',
 'legacy_32px_cell':r'CELL_SIZE[^\n=]*=\s*32'
}
legacy={name:len(re.findall(pattern,src+'\n'+mechanics,re.I)) for name,pattern in legacy_patterns.items()}
for name,n in legacy.items():
    if n: errors.append(f'{name}: {n}')

pending=int(counts['pending'])
unexpected_pending=int(pending_scope.get('unexpectedPending',0)) if pending_scope else 0
if unexpected_pending: errors.append(f'unexpected pending skills: {unexpected_pending}')
result={
 'version':VERSION,'ruleset':'rAthena Renewal','cellSizePx':36,
 'counts':dict(counts),'handlers':dict(sorted(handlers.items())),
 'implementedSkillIds':sorted(int(x) for x in runtime if str((runtime[x].get('handler') or (runtime[x].get('runtimeProfile') or {}).get('handler') or ''))!='pending'),
 'physicalSkillCount':len(set(physical_rows)),'magicSkillCount':len(set(magic_rows)),'groundSkillCount':len(set(ground_rows)),
 'groundSkillIds':sorted(set(ground_rows)),
 'keyGroundSkills':{
  'meteor':{'rangeCells':9,'radiusCells':3,'tickMs':1000,'maxTicksLv10':7},
  'lordOfVermilion':{'rangeCells':9,'radiusCells':6,'logicalDamageApplications':1,'visualHits':20},
  'stormGust':{'rangeCells':9,'radiusCells':4,'tickMs':450,'maxTicks':10,'knockbackCells':2},
  'quagmire':{'rangeCells':9,'radiusCells':2,'maxInstances':3,'durationLv5Ms':25000}
 },
 'legacyFormulaFindings':legacy,
 'pending':{'total':pending,'expandedJobsDeferred':pending_scope.get('expandedJobsDeferred'),'intentionalSystemPending':pending_scope.get('intentionalSystemPending'),'unexpected':unexpected_pending},
 'errors':errors,'warnings':warnings,
 'summary':{'status':'PASS' if not errors else 'FAIL','errors':len(errors),'warnings':len(warnings)}
}
out=ROOT/'tools/full_combat_ground_runtime_audit_0.9.82EA.json'
out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result['summary'],ensure_ascii=False))
print(json.dumps({k:result[k] for k in ('physicalSkillCount','magicSkillCount','groundSkillCount','pending')},ensure_ascii=False,indent=2))
if errors:
    print('\n'.join(errors[:100])); raise SystemExit(1)
