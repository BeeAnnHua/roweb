#!/usr/bin/env python3
from pathlib import Path
import json,sys
ROOT=Path(__file__).resolve().parents[1]
skills=json.loads((ROOT/'data/skills/skills_core_1.json').read_text(encoding='utf-8-sig'))['skills']
runtime=json.loads((ROOT/'data/skill_runtime/runtime_generated_all.json').read_text(encoding='utf-8-sig'))['skills']
rows=[]; errors=[]; counts={'buff':0,'explicitDuration':0,'skillDuration':0,'infiniteToggle':0,'oneShotAction':0}
def positive(value,field='Time'):
    vals=value if isinstance(value,list) else [value]
    return any((isinstance(x,(int,float)) and x>0) or (isinstance(x,dict) and Number(x.get(field,0))>0) for x in vals if x is not None)
def Number(v):
    try:return float(v)
    except:return 0
for sid,row in runtime.items():
    p=row.get('runtimeProfile') or row.get('formula') or {}
    if p.get('handler')!='buff' or row.get('executionEnabled') is False:continue
    counts['buff']+=1; kind=''
    if p.get('performanceAction'):
        kind='one_shot_action';counts['oneShotAction']+=1
    elif p.get('infiniteDuration') is True and p.get('toggleBuff') is True:
        kind='infinite_toggle';counts['infiniteToggle']+=1
    elif p.get('duration') is not None and positive(p.get('duration')):
        kind='explicit_duration';counts['explicitDuration']+=1
    elif p.get('durationFromSkill') is True:
        s=skills.get(str(sid),{})
        source=s.get('duration1') if s.get('duration1') is not None else (s.get('duration2') if s.get('duration2') is not None else s.get('duration'))
        if positive(source):kind='skill_duration';counts['skillDuration']+=1
        else:errors.append(f'{sid} {row.get("name")}: durationFromSkill has no positive Duration1/Duration2')
    else:
        errors.append(f'{sid} {row.get("name")}: persistent buff has no duration/toggle/action rule')
    rows.append({'skillId':int(sid),'name':row.get('name'),'kind':kind,'performanceAction':p.get('performanceAction')})
result={'version':'0.9.82EO','status':'PASS' if not errors else 'FAIL','counts':counts,'errors':errors,'rows':rows}
(ROOT/'tools/buff_duration_audit_0.9.82EO.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'version':result['version'],'status':result['status'],'counts':counts,'errors':errors},ensure_ascii=False,indent=2))
sys.exit(1 if errors else 0)
