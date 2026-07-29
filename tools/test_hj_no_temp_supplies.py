#!/usr/bin/env python3
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
checks=[]
def add(name,ok,detail=''): checks.append({'name':name,'pass':bool(ok),'detail':detail})
text='\n'.join((ROOT/'js'/name).read_text(encoding='utf-8') for name in ['player.js','game.js','data_bundle.js'])
add('temporary grant function removed','grantTemporaryTestSuppliesOnce' not in text)
add('temporary grant marker removed','temporaryTestSupplyGrant' not in text and '0.9.82HI_LOCAL_REFINE_ENCHANT_GRADE_TEST_V1' not in text)
add('temporary supply data source deleted',not (ROOT/'data/temporary_test_supplies.json').exists())
add('temporary supply bundle entry removed','data/temporary_test_supplies.json' not in (ROOT/'js/data_bundle.js').read_text(encoding='utf-8'))
# Ensure normal item definitions still exist; only auto grant was removed.
idx=json.loads((ROOT/'data/items/item_index.json').read_text(encoding='utf-8'))
add('Dim Glacier box item remains available','1100100' in idx,idx.get('1100100',{}).get('name',''))
failed=[x for x in checks if not x['pass']]
report={'version':'0.9.82HJ','checks':checks,'passed':len(checks)-len(failed),'failed':len(failed)}
(ROOT/'tools/test_hj_no_temp_supplies_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
raise SystemExit(1 if failed else 0)
