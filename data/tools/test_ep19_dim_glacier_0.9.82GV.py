#!/usr/bin/env python3
from pathlib import Path
import json, sys
ROOT=Path(__file__).resolve().parents[1]
W=[500054,500055,510075,510076,520021,530034,540056,550089,550090,560037,570032,580033,590047,590048,600030,610041,620019,630019,640034,650028,700059,800015,810015,820011,830015,840010]
M=[1000608,1000811,1000812,1000813,1000814,1001029,1001030,1001031,1001032,1001033,1001034,1001035,1001036,1001037,1001249,1001250]
BOX=1100100
errors=[]; checks=[]
def check(ok,msg):
 checks.append((ok,msg))
 if not ok: errors.append(msg)
idx=json.load(open(ROOT/'data/items/item_index.json',encoding='utf-8'))
for i in W:
 r=idx.get(str(i)); check(bool(r),f'weapon {i} indexed');
 if r:
  check(r.get('type')=='equipment' and r.get('category')=='weapon',f'weapon {i} type')
  check(int(r.get('weaponLevel',0))==5,f'weapon {i} level5')
  check(int(r.get('requiredLevel',0))==230,f'weapon {i} required230')
  check(Path(ROOT/r['icon']).is_file(),f'weapon {i} icon')
for i in M:
 r=idx.get(str(i)); check(bool(r),f'material {i} indexed')
 if r: check(Path(ROOT/r['icon']).is_file(),f'material {i} icon')
box=idx.get(str(BOX)); check(bool(box),'box indexed');
if box:
 check(box.get('sourceIconItemId')==101638,'box source icon id')
 check(Path(ROOT/box['icon']).is_file(),'box icon')
 check(box.get('manualUseOnly') is True and box.get('noDecompose') is True,'box protected')
config=json.load(open(ROOT/'data/item_boxes.json',encoding='utf-8'))
b=config['boxes']['ep19_dim_glacier_weapon_box']; rewards=b['rewards']
check(len(rewards)==26,'26 rewards')
check({x['itemId'] for x in rewards}==set(W),'reward ids exact')
check(all(x.get('weight')==1 and x.get('quantity')==1 for x in rewards),'uniform weights')
mon=json.load(open(ROOT/'data/monsters.json',encoding='utf-8'))
md={x['id']:x for x in mon}
expected_box={21526:10,21527:15,21528:20,21529:30}
for mid,rate in expected_box.items():
 rows=[x for x in md[mid]['drops'] if x['itemId']==BOX]
 check(len(rows)==1 and rows[0]['chance']==rate,f'mob {mid} box rate {rate}')
for mid in [21520,21521,21522,21523,21524,21525,21526,21527,21528,21529,21537,21599]:
 rows=[x for x in md[mid]['drops'] if x['itemId']==1000811]
 check(len(rows)==1 and rows[0]['chance']>0,f'mob {mid} snow ore')
index=(ROOT/'index.html').read_text(encoding='utf-8')
check('js/item_box_runtime.js?v=0.9.82GV' in index,'runtime script tag')
check('0.9.82GU' not in index,'index cache version advanced')
bundle=(ROOT/'js/data_bundle.js').read_text(encoding='utf-8')
check('data/item_boxes.json' in bundle,'box config bundled')
check('黯淡冰晶武器箱' in bundle,'box item bundled')
print(json.dumps({'version':'0.9.82GV','passed':sum(1 for ok,_ in checks if ok),'total':len(checks),'errors':errors},ensure_ascii=False,indent=2))
sys.exit(1 if errors else 0)
