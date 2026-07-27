#!/usr/bin/env python3
from pathlib import Path
import json, zipfile, yaml, re, sys
root=Path(__file__).resolve().parents[1]
ra_zip=Path('/mnt/data/RA開機檔案英文版20260608.zip')
errors=[]; checks=[]
def check(ok,name,detail=''):
    checks.append((bool(ok),name,detail))
    if not ok: errors.append(f'{name}: {detail}')

rules=json.loads((root/'data/refine_rules.json').read_text(encoding='utf-8'))
with zipfile.ZipFile(ra_zip) as z:
    source=yaml.safe_load(z.read('rathena-master/db/re/refine.yml').decode('utf-8'))
    etc=yaml.safe_load(z.read('rathena-master/db/re/item_db_etc.yml').decode('utf-8'))
by_aegis={r.get('AegisName'):r for r in etc.get('Body',[]) if r.get('AegisName')}
source_count=0; generated_count=0
for group in source['Body']:
    gname=group.get('Group')
    if gname not in ('Weapon','Armor'): continue
    for lev in group.get('Levels',[]):
        il=str(lev['Level']); gp=rules['groups'][gname]['levels'].get(il)
        check(gp is not None,f'{gname} level {il} profile exists')
        for row in lev.get('RefineLevels',[]):
            source_count+=1
            target=str(row['Level']); out=gp['refineLevels'].get(target) if gp else None
            check(out is not None,f'{gname} Lv{il} target +{target} exists')
            if not out: continue
            generated_count+=1
            scalar_fields=[('targetLevel','Level'),('bonus','Bonus'),('randomBonus','RandomBonus'),('blacksmithBlessingAmount','BlacksmithBlessingAmount')]
            for outk,ink in scalar_fields:
                check(int(out.get(outk,0))==int(row.get(ink,0)),f'{gname} Lv{il} +{target} {outk}',f"{out.get(outk)} != {row.get(ink,0)}")
            for outk,ink in [('broadcastSuccess','BroadcastSuccess'),('broadcastFailure','BroadcastFailure')]:
                check(bool(out.get(outk,False))==bool(row.get(ink,False)),f'{gname} Lv{il} +{target} {outk}')
            src_ch=row.get('Chances',[]); dst_ch=out.get('chances',[])
            check(len(src_ch)==len(dst_ch),f'{gname} Lv{il} +{target} chance count',f'{len(dst_ch)} != {len(src_ch)}')
            for i,(a,b) in enumerate(zip(src_ch,dst_ch)):
                for outk,ink in [('type','Type'),('rate','Rate'),('price','Price'),('materialAegis','Material'),('breakingRate','BreakingRate'),('downgradeAmount','DowngradeAmount')]:
                    av=a.get(ink,0); bv=b.get(outk,0)
                    if outk in ('type','materialAegis'): ok=str(av)==str(bv)
                    else: ok=int(av)==int(bv)
                    check(ok,f'{gname} Lv{il} +{target} chance {i} {outk}',f'{bv} != {av}')
                expected_id=int(by_aegis[a['Material']]['Id'])
                check(int(b.get('materialItemId',0))==expected_id,f'{gname} Lv{il} +{target} chance {i} material ID')
check(source_count==140,'RA profile count is 140',str(source_count))
check(generated_count==140,'generated profile count is 140',str(generated_count))

# Every referenced refine material has a live item record and icon.
item_index=json.loads((root/'data/items/item_index.json').read_text(encoding='utf-8'))
material_ids={int(c['materialItemId']) for g in rules['groups'].values() for lv in g['levels'].values() for rr in lv['refineLevels'].values() for c in rr['chances']}
material_ids.add(int(rules['blessingItemId']))
for iid in sorted(material_ids):
    check(str(iid) in item_index,f'material item {iid} exists')
    check((root/f'images/items/{iid}.webp').is_file(),f'material icon {iid} exists')

# Gacha exact 100.00% basis-point audit.
gacha=json.loads((root/'data/mvp_gacha.json').read_text(encoding='utf-8'))
rare=sum(int(x.get('chanceBasisPoints',0)) for x in gacha['rareCategories'])
ordinary=sum(int(x.get('weight',0)) for x in gacha['ordinaryRewards'])
check(rare==121,'rare pool 1.21%',str(rare))
check(ordinary==9879,'ordinary pool 98.79%',str(ordinary))
check(rare+ordinary==10000,'gacha total 100.00%',str(rare+ordinary))
weights={}
for row in gacha['ordinaryRewards']: weights.setdefault(int(row['itemId']),[]).append(int(row['weight']))
for iid in (7620,6240,7619,6241): check(weights.get(iid)==[800],f'gacha item {iid} is 8%',str(weights.get(iid)))
for iid in (1000331,1000332,1000333,1000334,1000335,1000336): check(weights.get(iid)==[500],f'gacha ether item {iid} is 5%',str(weights.get(iid)))
check(weights.get(6635)==[500],'Blacksmith Blessing is 5%',str(weights.get(6635)))

# NPC/UI/runtime integration.
npcs=json.loads((root/'data/npcs.json').read_text(encoding='utf-8'))
ref=[x for x in npcs if x.get('id')=='payon_refine_npc']
check(len(ref)==1,'exactly one Payon refine NPC',str(len(ref)))
check(ref and ref[0].get('cityId')=='payon','refine NPC city is Payon',str(ref[0].get('cityId') if ref else None))
html=(root/'index.html').read_text(encoding='utf-8')
css=(root/'css/style.css').read_text(encoding='utf-8')
town=(root/'js/town.js').read_text(encoding='utf-8')
for token in ('id="refineWindow"','id="refineMaterialChoices"','id="refineBlessingHost"','id="refineEquipmentList"','js/refine_runtime.js?v=0.9.82GG'):
    check(token in html,f'index contains {token}')
for token in ('.refine-dialog','max-height:min(760px,calc(100dvh - 24px))','.refine-equipment-list','overflow:auto','@media(max-width:760px)'):
    check(token in css,f'CSS contains {token}')
check('openRefineWindow(npc)' in town,'town NPC opens refine runtime')
check('RefineRuntime.decorateStatusSource' in (root/'js/effect_runtime.js').read_text(encoding='utf-8'),'status integration hook')
check('RefineRuntime.decorateCombatItem' in (root/'js/ra_renewal_damage_pipeline.js').read_text(encoding='utf-8'),'combat integration hook')

passed=sum(1 for ok,_,_ in checks if ok)
print(json.dumps({'version':'0.9.82GG','summary':{'checks':len(checks),'passed':passed,'failed':len(errors)},'errors':errors},ensure_ascii=False,indent=2))
sys.exit(1 if errors else 0)
