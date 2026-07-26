#!/usr/bin/env python3
from pathlib import Path
import json,collections
ROOT=Path(__file__).resolve().parents[1]
pending=json.loads((ROOT/'data/skill_runtime/runtime_pending_review.json').read_text(encoding='utf8'))['skills']
expanded_prefixes={'TK','SG','SL','SJ','SP','SKE','SU','SH','NJ','KO','KG','OB','GS','RL','NW','SS','SOA'}
expanded=[];intentional=[];unexpected=[]
for row in pending:
    key=str(row.get('skillKey','')); prefix=key.split('_',1)[0]
    if prefix in expanded_prefixes: expanded.append(row)
    elif int(row.get('skillId',0))==247: intentional.append({**row,'decision':'RO_WEB lightweight homunculus has no HP/death state; resurrection remains intentionally unavailable.'})
    else: unexpected.append(row)
counts=collections.Counter(str(x.get('skillKey','')).split('_',1)[0] for x in pending)
result={
 'version':'0.9.82EA','totalPending':len(pending),'expandedJobsDeferred':len(expanded),'intentionalSystemPending':len(intentional),'unexpectedPending':len(unexpected),
 'policy':'Expanded job runtime remains deferred by the current project scope; all metadata, official IDs, timing and range are still audited. Current six families + Novice have no unexplained pending skills.',
 'prefixCounts':dict(sorted(counts.items())),'intentionalSystemPendingSkills':intentional,'unexpectedPendingSkills':unexpected,
 'expandedSkills':expanded,
 'summary':{'status':'PASS' if len(pending)==311 and len(expanded)==310 and len(intentional)==1 and not unexpected else 'FAIL'}
}
out=ROOT/'tools/pending_skill_scope_audit_0.9.82EA.json';out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({k:result[k] for k in ['totalPending','expandedJobsDeferred','intentionalSystemPending','unexpectedPending'] }|result['summary'],ensure_ascii=False,indent=2))
raise SystemExit(0 if result['summary']['status']=='PASS' else 1)
