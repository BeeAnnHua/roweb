#!/usr/bin/env python3
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
load=lambda p:json.loads((ROOT/p).read_text(encoding='utf-8'))
enchant=load(Path('data/dim_glacier_enchant.json')); effects=load(Path('data/enchant_runtime/enchant_effects.json')); ex=load(Path('data/enchant_material_exchange.json')); monsters=load(Path('data/monsters.json')); idx=load(Path('data/items/item_index.json'))
checks=[]
def check(name,ok,detail=None):checks.append({'name':name,'pass':bool(ok),'detail':detail})
check('formal mode enabled',enchant.get('previewOnly') is False and ex.get('previewOnly') is False,{'enchant':enchant.get('previewOnly'),'exchange':ex.get('previewOnly')})
check('26 target weapons',len(enchant.get('targetWeaponIds',[]))==26 and enchant.get('targetWeaponCount')==26,None)
check('slot counts 179/99/2',{k:int(v.get('count',0)) for k,v in enchant['slots'].items()}=={'4':179,'3':99,'2':2},None)
check('189 unique runtime enchants',len(effects)==189,None)
check('8 upgrade steps',len(enchant.get('upgrades',[]))==8,None)
check('12 formal recipes',len(ex.get('recipes',[]))==12,None)
check('pure magic EP20 excluded',not ({1001248,1001249,1001250}&{int(x['id']) for x in ex.get('catalog',[])}),None)
recipe={r['id']:r for r in ex['recipes']}
check('flower 1:1 amethyst',recipe['amethyst_fragment']['inputs']==[{'id':1000608,'amount':1}] and recipe['amethyst_fragment']['output']=={'id':1000405,'amount':1},recipe['amethyst_fragment'])
check('flower 1:1 corroded stone 1001029',recipe['corroded_magic_stone']['inputs']==[{'id':1000608,'amount':1}] and recipe['corroded_magic_stone']['output']=={'id':1001029,'amount':1},recipe['corroded_magic_stone'])
# All required images.
required=set(enchant['targetWeaponIds'])|set(map(int,effects.keys()))|{int(x['id']) for x in ex['catalog']}|{1000322,1000608,1100100}
for r in ex['recipes']:
 required.add(int(r['output']['id']));required.update(int(x['id']) for x in r['inputs'])
missing=[i for i in sorted(required) if not (ROOT/f'images/items/{i}.webp').is_file()]
check('all formal images exist',not missing,missing)
# Serpent drops.
worm_ids=[21526,21527,21528,21529];expected_box=[10,15,20,30];worm_rows=[]
for mid,boxrate in zip(worm_ids,expected_box):
 m=next(x for x in monsters if int(x['id'])==mid); dm={int(x['itemId']):x for x in m.get('drops',[])}
 row={'monsterId':mid,'box':dm.get(1100100),'flower':dm.get(1000608),'etel':dm.get(1000322)};worm_rows.append(row)
 check(f'worm {mid} normal drops',all(row[k] and row[k].get('dropClass')=='normal' and row[k].get('applyGlobalDropMultiplier') is True for k in ('box','flower','etel')),row)
 check(f'worm {mid} exact rates',int(row['box']['chance'])==boxrate and int(row['flower']['chance'])==100 and int(row['etel']['chance'])==100,row)
# Acquisition matrix: direct drops and recipe outputs.
direct={}
for m in monsters:
 for d in m.get('drops',[]): direct.setdefault(int(d.get('itemId',0)),[]).append({'monsterId':m['id'],'chance':d.get('chance')})
outputs={int(r['output']['id']):r['id'] for r in ex['recipes']}
material_ids=sorted({int(x['id']) for slot in enchant['slots'].values() for row in slot['items'] for x in row.get('materials',[])}|{int(x['id']) for u in enchant['upgrades'] for x in u.get('materials',[])}|{1000811,1000608,1000322,1100100,1000405,1001029})
acquisition=[]
for i in material_ids:
 acquisition.append({'id':i,'name':idx.get(str(i),{}).get('name'),'directDrops':direct.get(i,[]),'recipe':outputs.get(i),'available':bool(direct.get(i) or outputs.get(i))})
known_gaps=[x for x in acquisition if not x['available']]
# 1001033 is intentionally not invented; all other formal ingredients should be obtainable.
check('only known acquisition gap is poison gas 1001033',[x['id'] for x in known_gaps]==[1001033],known_gaps)
failed=[x for x in checks if not x['pass']]
report={'version':'0.9.82GY','checks':checks,'passed':len(checks)-len(failed),'failed':len(failed),'requiredImageCount':len(required),'missingImages':missing,'wormDrops':worm_rows,'acquisitionMatrix':acquisition,'knownAcquisitionGap':known_gaps}
(ROOT/'GY_DATA_CONTRACT_TEST.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps({'passed':report['passed'],'failed':report['failed'],'requiredImages':len(required),'knownGap':known_gaps},ensure_ascii=False,indent=2));raise SystemExit(1 if failed else 0)
