#!/usr/bin/env python3
from pathlib import Path
import json, hashlib, struct, sys
ROOT=Path(__file__).resolve().parents[1]
results=[]
def check(name,cond,detail=''):
    results.append({'name':name,'pass':bool(cond),'detail':detail})
def valid_webp(p):
    try:
        b=p.read_bytes()
        return len(b)>=12 and b[:4]==b'RIFF' and b[8:12]==b'WEBP' and struct.unpack('<I',b[4:8])[0]+8==len(b)
    except Exception:
        return False
manifest=json.loads((ROOT/'data/items/database_manifest.json').read_text('utf-8'))
item_ids=set()
for rel in manifest['allDataPaths']:
    data=json.loads((ROOT/rel).read_text('utf-8'))
    rows=data.values() if isinstance(data,dict) else data
    for row in rows:
        if isinstance(row,dict):
            iid=row.get('id',row.get('officialId',row.get('Id')))
            if iid is not None:
                item_ids.add(int(iid))
missing=[i for i in sorted(item_ids) if not (ROOT/f'images/items/{i}.webp').is_file()]
check('all_manifest_items_have_local_icons',not missing,f'{len(item_ids)-len(missing)}/{len(item_ids)}; missing={missing[:20]}')
boxes=json.loads((ROOT/'data/item_boxes.json').read_text('utf-8'))['boxes']
for key,b in boxes.items():
    rewards={int(r['itemId']) for r in b.get('rewards',[])}
    miss=[i for i in sorted(rewards) if not (ROOT/f'images/items/{i}.webp').is_file()]
    check(f'box_{key}_reward_icons_complete',not miss,f'{len(rewards)-len(miss)}/{len(rewards)}; missing={miss[:20]}')
numeric=[p for p in (ROOT/'images/items').glob('*.webp') if p.stem.isdigit()]
bad=[p.name for p in numeric if not valid_webp(p)]
check('all_numeric_item_webp_riff_valid',not bad,f'count={len(numeric)}; bad={bad[:20]}')
p500=ROOT/'images/items/500054.webp'
check('item_500054_official_hash',hashlib.sha256(p500.read_bytes()).hexdigest()=='3dbc4ff3f090332117bcaafd9b559b4ba5918495e0106e2a74fa35322f3c8145',hashlib.sha256(p500.read_bytes()).hexdigest())
custom=ROOT/'images/items/1100100.webp'
source=ROOT/'images/items/101638.webp'
check('custom_box_1100100_explicit_101638_mapping',custom.read_bytes()==source.read_bytes(),hashlib.sha256(custom.read_bytes()).hexdigest())
report=json.loads((ROOT/'ITEM_ICON_OFFICIALIZATION_0.9.82HP.json').read_text('utf-8'))
check('official_source_count',report['sourceOfficialIconCount']==20909,str(report['sourceOfficialIconCount']))
check('replaced_count',report['sameIdOfficialReplacedCount']==1,str(report['sameIdOfficialReplacedCount']))
check('required_icons_added_count',report['missingOfficialAddedCount']==1480,str(report['missingOfficialAddedCount']))
check('only_source_missing_is_custom_box',report['sourceMissingIds']==[1100100],str(report['sourceMissingIds']))
check('no_wrong_id_borrowed_candidates',report['wrongIdBorrowedCandidateCount']==0,str(report['wrongIdBorrowedCandidateCount']))
classic=('ra_old_blue_box','ra_old_violet_box','ra_gift_box')
check('all_ra_classic_box_icons_complete',all(report['boxCoverageAfter'][k]['localIconsPresent']==report['boxCoverageAfter'][k]['uniqueRewardIds'] for k in classic),str({k:report['boxCoverageAfter'][k] for k in classic}))
passed=sum(r['pass'] for r in results)
total=len(results)
out={'version':'0.9.82HP','passed':passed,'total':total,'status':'PASS' if passed==total else 'FAIL','results':results}
(ROOT/'tools/test_item_icons_report_0.9.82HP.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n','utf-8')
print(json.dumps(out,ensure_ascii=False,indent=2))
sys.exit(0 if passed==total else 1)
