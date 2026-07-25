#!/usr/bin/env python3
from __future__ import annotations
import json, pathlib, sys, yaml
from collections import Counter
ROOT=pathlib.Path(__file__).resolve().parents[1]
RA=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path('/mnt/data/ra_extract/rathena-master/db/re/skill_db.yml')
OUT=pathlib.Path(sys.argv[2]) if len(sys.argv)>2 else ROOT/'tools/ra_skill_range_audit_0.9.82EA.json'
CELL=36
BASE_CAP=14
INTENTIONAL={
  93:{'field':'range','note':'WZ_ESTIMATION was redesigned as a permanent ATK/MATK passive; official target range is intentionally unused.'},
  2242:{'field':'range','note':'RA_WUGDASH is a RO_WEB movement/runtime adaptation and keeps a project range value.'},
}
def norm(v):
    if isinstance(v,dict): return {str(k):norm(x) for k,x in sorted(v.items(),key=lambda kv:str(kv[0]))}
    if isinstance(v,list): return [norm(x) for x in v]
    return v
def level_value(raw, level, keys=('Size','Area','Range','Value')):
    if raw is None: return None
    if isinstance(raw,(int,float)): return float(raw)
    if isinstance(raw,list):
        rows=[]
        for idx,row in enumerate(raw):
            if isinstance(row,(int,float)): rows.append((idx+1,float(row))); continue
            if not isinstance(row,dict): continue
            val=next((row.get(k) for k in keys if isinstance(row.get(k),(int,float))),None)
            if val is not None: rows.append((int(row.get('Level',idx+1)),float(val)))
        if not rows:return None
        rows.sort(); selected=rows[0][1]
        for lv,val in rows:
            if lv>level: break
            selected=val
        return selected
    if isinstance(raw,dict):
        for k in keys:
            if isinstance(raw.get(k),(int,float)): return float(raw[k])
    return None
ra_doc=yaml.safe_load(RA.read_text(encoding='utf8'))
ra={int(x['Id']):x for x in ra_doc.get('Body',[]) if 'Id' in x}
skills={}
for rel in ('data/skills/skills_core_1.json','data/skills/skills_core_2.json'):
    doc=json.loads((ROOT/rel).read_text(encoding='utf8'))
    skills.update({int(k):v for k,v in doc['skills'].items()})
runtime={}
for rel in ('data/skill_runtime/runtime_generated_all.json','data/skill_runtime/runtime_core_1_v1.json'):
    doc=json.loads((ROOT/rel).read_text(encoding='utf8'))
    runtime.update({int(k):v for k,v in doc.get('skills',{}).items()})
errors=[]; exceptions=[]; adaptations=[]; rows=[]
targets=Counter(); flags=Counter(); negatives=0; level_arrays=0; ground=0; aoe=0
for sid,skill in sorted(skills.items()):
    rr=ra.get(sid)
    if not rr:
        errors.append({'skillId':sid,'code':'RA_SKILL_MISSING'});continue
    target=str(skill.get('targetType') or rr.get('TargetType') or 'None')
    targets[target]+=1
    if target in ('Ground','Trap'):ground+=1
    for flag,val in (skill.get('flags') or {}).items():
        if val is True and str(flag).startswith('AlterRange'):flags[flag]+=1
    raw=skill.get('range')
    if isinstance(raw,(int,float)) and raw<0:negatives+=1
    if isinstance(raw,list):level_arrays+=1
    # Cast range is the authoritative RA field and must match except for two
    # recorded RO_WEB redesigns. TargetType/SplashArea/Unit may intentionally
    # differ because many official party/material/ground mechanics were adapted
    # to Self Only or lightweight runtime; keep those differences visible rather
    # than incorrectly failing the range audit.
    a=norm(skill.get('range')); e=norm(rr.get('Range'))
    if a!=e:
        ex=INTENTIONAL.get(sid)
        if ex and ex['field']=='range':
            exceptions.append({'skillId':sid,'field':'range','expected':e,'actual':a,'note':ex['note']})
        else:
            errors.append({'skillId':sid,'code':'RANGE_METADATA_MISMATCH','field':'range','expected':e,'actual':a})
    for web_key,ra_key in [('targetType','TargetType'),('splashArea','SplashArea'),('unit','Unit')]:
        actual=norm(skill.get(web_key)); expected=norm(rr.get(ra_key))
        if isinstance(actual,str) and isinstance(expected,str) and actual.lower()==expected.lower(): continue
        if actual!=expected:
            adaptations.append({'skillId':sid,'field':web_key,'official':expected,'project':actual})
    max_lv=max(1,int(skill.get('maxLevel') or rr.get('MaxLevel') or 1))
    base=[]; splash=[]
    for lv in range(1,max_lv+1):
        value=level_value(raw,lv)
        if value is None:
            resolved=0 if target.lower() in ('self','passive') else None
        else:
            resolved=abs(value) if value<0 else value
            resolved=min(BASE_CAP,resolved)
        base.append(None if resolved is None else int(resolved))
        sv=level_value(skill.get('splashArea'),lv,('Area','Size','Range','Value'))
        splash.append(None if sv is None else int(abs(sv)))
    profile_row=runtime.get(sid,{})
    profile=(profile_row.get('runtimeProfile',profile_row) if isinstance(profile_row,dict) else {}) or {}
    targeting=profile.get('targeting') or profile.get('area') or {}
    radius=targeting.get('radius',targeting.get('rangeCells')) if isinstance(targeting,dict) else None
    if radius is not None or any(x not in (None,0) for x in splash):aoe+=1
    rows.append({'skillId':sid,'skillKey':skill.get('key'),'name':skill.get('name'),'maxLevel':max_lv,'targetType':target,
                 'rawRange':raw,'resolvedBaseRangeCells':base,'resolvedBaseRangePx':[None if x is None else x*CELL for x in base],
                 'splashRadiusCells':splash,'alterRangeFlags':[k for k,v in (skill.get('flags') or {}).items() if v is True and str(k).startswith('AlterRange')],
                 'runtimeHandler':profile.get('handler'),'runtimeTargeting':targeting or None})
result={
 'version':'0.9.82EA','renewalOnly':True,'source':str(RA),'cellSizePx':CELL,
 'renewalRules':{'skillRangeFromWeapon':False,'negativeRangeResolution':'absolute value','serverBaseRangeCapCells':BASE_CAP,'rangeBonusesAppliedAfterBaseCap':True},
 'summary':{'status':'PASS' if not errors else 'FAIL','skills':len(skills),'matchedRaSkills':len(skills)-sum(e['code']=='RA_SKILL_MISSING' for e in errors),'errors':len(errors),'intentionalExceptions':len(exceptions),'targetingOrAreaAdaptations':len(adaptations),'negativeRanges':negatives,'levelArrayRanges':level_arrays,'groundTargetSkills':ground,'aoeMetadataSkills':aoe},
 'targetTypeCounts':dict(sorted(targets.items())),'alterRangeFlagCounts':dict(sorted(flags.items())),
 'intentionalExceptions':exceptions,'targetingOrAreaAdaptations':adaptations,'errors':errors,'skills':rows
}
OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps(result['summary'],ensure_ascii=False,indent=2))
raise SystemExit(0 if not errors else 1)
