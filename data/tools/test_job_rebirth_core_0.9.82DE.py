#!/usr/bin/env python3
import json, pathlib, sys
root=pathlib.Path(__file__).resolve().parents[1]
jobs=json.loads((root/'data/jobs.json').read_text(encoding='utf-8'))
routes=json.loads((root/'data/job_change.json').read_text(encoding='utf-8'))
npcs={x['id'] for x in json.loads((root/'data/npcs.json').read_text(encoding='utf-8'))}
manifest=json.loads((root/'data/skill_manifest.json').read_text(encoding='utf-8'))
trees={json.loads((root/p).read_text(encoding='utf-8')).get('job') for p in manifest['trees']}
normal={k:v for k,v in jobs.items() if v.get('classFamily')=='normal'}
assert len(normal)==66, len(normal)
assert len(routes)==80, len(routes)
for r in routes:
 assert r['fromJob'] in jobs, r
 assert r['toJob'] in jobs, r
 assert r['npcId'] in npcs, r
for k,v in normal.items():
 for tier,ks in (v.get('skillTierTrees') or {}).items():
  for x in ks: assert x in trees, (k,tier,x)
 for x in v.get('nextJobs',[]): assert x in jobs,(k,x)
# 13 normal second branches each must rebirth
seconds=[k for k,v in normal.items() if v.get('routeGroup')=='second']
assert len(seconds)==13, seconds
for k in seconds:
 rr=[r for r in routes if r['fromJob']==k and r['toJob']=='high_novice' and r.get('type')=='rebirth']
 assert len(rr)==1,(k,rr)
# 13 trans, third, fourth
for grp,n in [('trans_second',13),('third',13),('fourth',13),('first',6),('high_first',6)]:
 assert len([1 for v in normal.values() if v.get('routeGroup')==grp])==n,grp
# linear last-job restrictions on each high-first -> trans route
lin=[r for r in routes if jobs[r['fromJob']].get('routeGroup')=='high_first' and jobs[r['toJob']].get('routeGroup')=='trans_second']
assert len(lin)==13 and all(r.get('requiredRebirthOrigin') for r in lin)
# exact constitution
c=json.loads((root/'data/job_constitution.json').read_text(encoding='utf-8'))
assert c['rebirth']['status']=='enabled'
assert c['rebirth']['fixedStartingStatusPoints']==125
print('PASS job/rebirth structural audit:',len(normal),'normal jobs /',len(routes),'routes')
