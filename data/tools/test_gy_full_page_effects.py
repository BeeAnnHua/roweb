#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
CARD=(ROOT/'js/card_runtime.js').read_text(encoding='utf-8')
STATUS=(ROOT/'js/status_system.js').read_text(encoding='utf-8')
read=lambda p:json.loads((ROOT/p).read_text(encoding='utf-8'))
data={
 'data/card_runtime/card_effects.json':read(Path('data/card_runtime/card_effects.json')),
 'data/card_runtime/card_combos.json':read(Path('data/card_runtime/card_combos.json')),
 'data/card_runtime/item_groups.json':read(Path('data/card_runtime/item_groups.json')),
 'data/card_runtime/card_drop_sources.json':read(Path('data/card_runtime/card_drop_sources.json')),
 'data/card_runtime/equipment_effects.json':read(Path('data/card_runtime/equipment_effects.json')),
 'data/enchant_runtime/enchant_effects.json':read(Path('data/enchant_runtime/enchant_effects.json')),
 'data/items/item_index.json':read(Path('data/items/item_index.json')),
 'data/jobs.json':read(Path('data/jobs.json'))
}
boot=f'''
var window=globalThis;window.RO_WEB_DATA={json.dumps(data,ensure_ascii=False)};var DEFAULT_EQUIPMENT={{weapon:null,shield:null,headTop:null,headMid:null,headLow:null,armor:null,garment:null,shoes:null,accessory1:null,accessory2:null}};
var player=window.player={{baseLevel:275,jobLevel:60,job:'Job_Dragon_Knight',jobKey:'dragon_knight',stats:{{str:100,agi:100,vit:100,int:100,dex:100,luk:100}},traits:{{pow:0,sta:0,wis:0,spl:0,con:0,crt:0}},traitStats:{{pow:0,sta:0,wis:0,spl:0,con:0,crt:0}},equipment:{{...DEFAULT_EQUIPMENT}},equipmentInstances:{{}},inventory:[],learnedSkills:{{}},hp:100,maxHp:100,sp:30,maxSp:30}};
var skillsData={{skillIndex:{{}}}},jobsData=RO_WEB_DATA['data/jobs.json'];
function getItemData(id){{return RO_WEB_DATA['data/items/item_index.json'][String(id)]||null}} function getEquipmentInstance(slot){{return player.equipmentInstances[slot]||null}} function getSkillDataById(){{return null}} function getSkillLevel(){{return 10}}
function getCurrentJobData(){{return {{tier:4,classFamily:'normal',routeGroup:'fourth',raJob:'Dragon_Knight'}}}} function getJobData(){{return getCurrentJobData()}} function getTrainingBonusTotals(){{return {{}}}} function getPassiveSkillBonusTotals(){{return {{}}}} function getActiveBuffBonusTotals(){{return {{}}}} function loadJson(){{return Promise.resolve({{}})}} function clampRaWalkSpeed(x){{return x}} function isPlayerMounted(){{return false}};
window.invalidatePlayerUiRenderCaches=()=>true;window.requestAnimationFrame=fn=>setTimeout(fn,0);window.addBattleLog=()=>true;window.updatePlayerUI=()=>true;window.saveGame=()=>true;
'''
checks=[]
def check(name,ok,detail=None):checks.append({'name':name,'pass':bool(ok),'detail':detail})
errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.set_content('<!doctype html><html><body><section id="status-window" class="hidden-window"></section></body></html>');page.add_script_tag(content=boot);page.add_script_tag(content=CARD);page.add_script_tag(content=STATUS)
 result=page.evaluate("""() => {
  CardRuntime.init();CardRuntime.invalidate();const base=calculateDerivedPlayerStats();
  player.equipment.weapon=600030;player.equipmentInstances.weapon={id:600030,itemId:600030,instanceId:'actual',refine:12,enchantGrade:4,cards:[null,null,null,null],enchants:[{id:311192,name:'雪花魔力（龍之氣息）',slot:4,playerSlot:4},{id:311449,name:'雪花魔力（物理等級） Lv.1',slot:2,playerSlot:2}]};CardRuntime.invalidate();
  const equipped=calculateDerivedPlayerStats(),merged=CardRuntime.getMergedSource(),sources=CardRuntime.getSources().filter(x=>x.sourceType==='enchant');
  player.equipment.weapon=null;delete player.equipmentInstances.weapon;CardRuntime.invalidate();const removed=calculateDerivedPlayerStats();
  return {base:{atk:base.atk,matk:base.matk},equipped:{atk:equipped.atk,matk:equipped.matk},removed:{atk:removed.atk,matk:removed.matk},sources:sources.map(x=>({id:x.sourceId,slot:x.enchantSlot})),merged:{atkFlat:merged.atkFlat||0,short:merged.shortDamageRate||0,long:merged.longDamageRate||0,dragon:merged.skillDamageRate?.RK_DRAGONBREATH||0},diag:CardRuntime.getDiagnostics()};
 }""")
 check('base weapon and enchant raise actual ATK',result['equipped']['atk']>result['base']['atk']+300,result)
 check('base weapon raises actual MATK',result['equipped']['matk']>=result['base']['matk']+270,result)
 check('actual enchant sources enter status runtime',len(result['sources'])==2 and {x['slot'] for x in result['sources']}=={2,4},result)
 check('actual combat enchant totals apply',result['merged']['dragon']>=100 and result['merged']['short']>=3 and result['merged']['long']>=3 and result['merged']['atkFlat']>=30,result)
 check('unequip removes weapon and enchant totals',result['removed']==result['base'],result)
 check('no actual runtime diagnostics or page errors',not result['diag']['runtimeErrors'] and not result['diag']['unhandledBonuses'] and not errors,{'diag':result['diag'],'pageErrors':errors})
 browser.close()
failed=[x for x in checks if not x['pass']]
report={'version':'0.9.82GY','checks':checks,'passed':len(checks)-len(failed),'failed':len(failed),'errors':errors}
(ROOT/'GY_FULL_PAGE_EFFECT_TEST.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(report,ensure_ascii=False,indent=2));raise SystemExit(1 if failed else 0)
