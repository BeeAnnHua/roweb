#!/usr/bin/env python3
from __future__ import annotations
import json, pathlib, sys, yaml
ROOT=pathlib.Path(__file__).resolve().parents[1]
RA=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else None
OUT=pathlib.Path(sys.argv[2]) if len(sys.argv)>2 else ROOT/'tools/ra_skill_timing_audit_0.9.82DW.json'
FIELDS={'CastTime':'castTime','FixedCastTime':'fixedCastTime','AfterCastActDelay':'afterCastActDelay','AfterCastWalkDelay':'afterCastWalkDelay','Cooldown':'cooldown'}
ra_doc=yaml.safe_load(RA.read_text(encoding='utf-8'))
ra={int(r['Id']):r for r in ra_doc.get('Body',[]) if 'Id' in r}
skills={}
for rel in ('data/skills/skills_core_1.json','data/skills/skills_core_2.json'):
 d=json.loads((ROOT/rel).read_text(encoding='utf-8'))
 skills.update({int(k):v for k,v in d['skills'].items()})
errors=[]; counts={v:0 for v in FIELDS.values()}; zero_counts={v:0 for v in FIELDS.values()}
for sid,s in sorted(skills.items()):
 r=ra.get(sid)
 if not r:
  errors.append({'skillId':sid,'code':'RA_SKILL_MISSING'}); continue
 for rk,wk in FIELDS.items():
  expected=r.get(rk,None); actual=s.get(wk,None)
  if expected!=actual: errors.append({'skillId':sid,'code':'TIMING_MISMATCH','field':wk,'expected':expected,'actual':actual})
  if expected is not None: counts[wk]+=1
  else: zero_counts[wk]+=1
result={'version':'0.9.82DW','source':str(RA),'skillCount':len(skills),'matchedRaSkills':len(skills)-sum(1 for e in errors if e['code']=='RA_SKILL_MISSING'),'fieldPresentCounts':counts,'fieldDefaultZeroCounts':zero_counts,'errors':errors,'summary':{'status':'PASS' if not errors else 'FAIL','errors':len(errors)}}
OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
raise SystemExit(0 if not errors else 1)
