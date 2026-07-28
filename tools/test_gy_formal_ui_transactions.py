#!/usr/bin/env python3
from __future__ import annotations
import json, mimetypes
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
html=(ROOT/'index.html').read_text(encoding='utf-8')
start=html.index('<section id="enchantPlatformWindow"')
end=html.index('<section id="storageWindow"',start)
fragment=html[start:end]
css=(ROOT/'css/style.css').read_text(encoding='utf-8')
js_platform=(ROOT/'js/enchant_platform_runtime.js').read_text(encoding='utf-8')
js_exchange=(ROOT/'js/enchant_material_exchange_runtime.js').read_text(encoding='utf-8')
catalog=json.loads((ROOT/'data/dim_glacier_enchant.json').read_text(encoding='utf-8'))
exchange=json.loads((ROOT/'data/enchant_material_exchange.json').read_text(encoding='utf-8'))
items=json.loads((ROOT/'data/items/item_index.json').read_text(encoding='utf-8'))
# Give abundant formal materials; weapon has a card to prove reset preserves slot 1.
material_ids=sorted({int(x['id']) for slot in catalog['slots'].values() for row in slot['items'] for x in row.get('materials',[])} | {int(x['id']) for step in catalog['upgrades'] for x in step.get('materials',[])} | {1000811,1000608,1000405,1001029})
inv=[{'id':i,'name':items[str(i)]['name'],'count':100000,'locked':False} for i in material_ids]
weapon={'id':600030,'itemId':600030,'name':items['600030']['name'],'count':1,'locked':False,'instanceId':'gy-formal-weapon','identified':True,'refine':12,'enchantGrade':4,'broken':False,'cards':[4001,None,None,None],'enchants':[],'createdAt':1}
inv.insert(0,weapon)
boot=f'''
var window=globalThis;
window.RO_WEB_DATA={{
 "data/dim_glacier_enchant.json":{json.dumps(catalog,ensure_ascii=False)},
 "data/enchant_material_exchange.json":{json.dumps(exchange,ensure_ascii=False)},
 "data/items/item_index.json":{json.dumps(items,ensure_ascii=False)}
}};
window.player={{inventory:{json.dumps(inv,ensure_ascii=False)},equipment:{{weapon:null,shield:null,headTop:null,headMid:null,headLow:null,armor:null,garment:null,shoes:null,accessory1:null,accessory2:null}},equipmentInstances:{{}},zeny:999999999}};
window.confirm=()=>true;
window.__saveCount=0; window.__recalcCount=0; window.__logs=[];
window.getItemData=id=>window.RO_WEB_DATA['data/items/item_index.json'][String(id)]||null;
window.normalizeEquipmentInstance=(raw,data)=>{{const x=raw&&typeof raw==='object'?raw:{{id:raw}};return {{...x,id:Number(x.id),itemId:Number(x.id),name:x.name||data?.name||String(x.id),count:1,instanceId:String(x.instanceId||'inst-'+x.id),refine:Number(x.refine||0),enchantGrade:Number(x.enchantGrade||0),cards:Array.isArray(x.cards)?x.cards.slice(0,4):[null,null,null,null],enchants:Array.isArray(x.enchants)?x.enchants.map(e=>({{...e}})):[]}};}};
window.normalizeAllItemInstances=()=>true;
window.invalidateCardRuntime=()=>true;window.invalidatePlayerUiRenderCaches=()=>true;window.syncEquipmentGrantedSkills=()=>true;
window.recalculatePlayerStats=()=>{{window.__recalcCount++}};window.updateInventoryUI=()=>true;window.updateEquipmentUI=()=>true;window.updatePlayerUI=()=>true;
window.saveGame=()=>{{window.__saveCount++;window.__lastSave=JSON.stringify(window.player);return true;}};
window.addBattleLog=x=>window.__logs.push(String(x));window.bringWindowToFront=()=>true;
window.getCardInfo=id=>window.getItemData(id);
'''
page_html=f'''<!doctype html><html><head><meta charset="utf-8"><base href="http://assets.local/"><style>html,body{{margin:0;width:100%;height:100%;background:#101820}}{css}</style></head><body>{fragment}<script>{boot}</script><script>{js_platform}</script><script>{js_exchange}</script></body></html>'''
checks=[]
def check(name,ok,detail=None): checks.append({'name':name,'pass':bool(ok),'detail':detail})
errors=[]
with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':1440,'height':900})
  def route_handler(route):
    rel=route.request.url.split('http://assets.local/',1)[-1].split('?',1)[0]
    f=ROOT/rel
    if f.is_file(): route.fulfill(status=200,body=f.read_bytes(),content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream')
    else: route.fulfill(status=404,body=b'')
  page.route('http://assets.local/**',route_handler)
  page.on('pageerror',lambda exc: errors.append(str(exc)))
  page.set_content(page_html,wait_until='load')
  # Open, verify 26-weapon detection and material pill wrapping.
  page.evaluate("openEnchantPlatform({name:'附魔研究員'})")
  initial=page.evaluate("() => ({slot:DimGlacierEnchantRuntime.getState().currentSlot,eligible:DimGlacierEnchantRuntime.getEligibleEquipment().length,rows:document.querySelectorAll('.enchant-stone-row').length,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth})")
  check('formal platform opens at slot 4',initial['slot']==4,initial)
  check('detects actual inventory weapon',initial['eligible']==1,initial)
  check('slot 4 renders 179 stones',initial['rows']==179,initial)
  # Formal 4 -> 3 -> 2 transactions.
  page.locator('.enchant-stone-row').first.click(); page.evaluate('closeEnchantStoneInfo()'); before4=page.evaluate("player.inventory.find(x=>x.id===1001034).count")
  page.evaluate('executeEnchantPlatformAction()')
  after4=page.evaluate("() => ({slot:DimGlacierEnchantRuntime.getState().currentSlot,enchants:player.inventory.find(x=>x.instanceId==='gy-formal-weapon').enchants,mat:player.inventory.find(x=>x.id===1001034).count})")
  check('slot 4 saved and advances to slot 3',after4['slot']==3 and any(int(x['slot'])==4 for x in after4['enchants']),after4)
  check('slot 4 material deducted once',before4-after4['mat']==10,{'before':before4,'after':after4['mat']})
  page.locator('.enchant-stone-row').first.click(); page.evaluate('closeEnchantStoneInfo()'); page.evaluate('executeEnchantPlatformAction()')
  after3=page.evaluate("() => ({slot:DimGlacierEnchantRuntime.getState().currentSlot,enchants:player.inventory.find(x=>x.instanceId==='gy-formal-weapon').enchants})")
  check('slot 3 saved and advances to slot 2',after3['slot']==2 and any(int(x['slot'])==3 for x in after3['enchants']),after3)
  # Ensure physical grade Lv1 selected in slot2.
  page.evaluate('selectEnchantStone(2,311449)'); page.evaluate('closeEnchantStoneInfo()'); page.evaluate('executeEnchantPlatformAction()')
  complete=page.evaluate("() => ({slot:DimGlacierEnchantRuntime.getState().currentSlot,enchants:player.inventory.find(x=>x.instanceId==='gy-formal-weapon').enchants,saveCount:__saveCount,recalcCount:__recalcCount})")
  check('slot 2 saved and completes 4-3-2',complete['slot'] is None and {int(x['slot']) for x in complete['enchants']}=={2,3,4},complete)
  check('formal enchant recalculates and saves',complete['saveCount']>=3 and complete['recalcCount']>=3,complete)
  # Upgrade actual Lv1 -> Lv2.
  page.evaluate("setEnchantPlatformTab('upgrade')")
  from_id=page.evaluate("player.inventory.find(x=>x.instanceId==='gy-formal-weapon').enchants.find(x=>x.slot===2).id")
  page.evaluate('executeEnchantPlatformAction()')
  upgraded=page.evaluate("() => ({id:player.inventory.find(x=>x.instanceId==='gy-formal-weapon').enchants.find(x=>x.slot===2).id,saveCount:__saveCount})")
  check('slot 2 formal upgrade changes enchant ID',int(from_id)==311449 and int(upgraded['id'])==311450,{'from':from_id,'after':upgraded})
  # Reset keeps card and removes only 4/3/2.
  page.evaluate("setEnchantPlatformTab('reset')"); raw_before=page.evaluate("player.inventory.find(x=>x.id===1000811).count")
  page.evaluate('executeEnchantPlatformAction()')
  reset=page.evaluate("() => {const w=player.inventory.find(x=>x.instanceId==='gy-formal-weapon');return {enchants:w.enchants,cards:w.cards,raw:player.inventory.find(x=>x.id===1000811).count,slot:DimGlacierEnchantRuntime.getState().currentSlot}}")
  check('reset clears enchant slots only',len(reset['enchants'])==0 and reset['cards'][0]==4001 and reset['slot']==4,reset)
  check('reset consumes exactly 5 raw ore',raw_before-reset['raw']==5,{'before':raw_before,'after':reset['raw']})
  # Exchange 1:1 flower -> amethyst and corroded magic stone.
  page.evaluate("closeEnchantPlatform();openEnchantMaterialExchange({name:'綜合材料兌換研究員'})")
  page.evaluate("selectEnchantExchangeRecipe('amethyst_fragment')")
  flower_before=page.evaluate("player.inventory.find(x=>x.id===1000608).count")
  amethyst_before=page.evaluate("player.inventory.find(x=>x.id===1000405)?.count||0")
  page.evaluate('executeEnchantMaterialExchange()')
  one=page.evaluate("() => ({flower:player.inventory.find(x=>x.id===1000608).count,amethyst:player.inventory.find(x=>x.id===1000405).count})")
  check('flower 1:1 amethyst exchange',flower_before-one['flower']==1 and one['amethyst']-amethyst_before==1,one)
  page.evaluate("selectEnchantExchangeRecipe('corroded_magic_stone')")
  cor_before=page.evaluate("player.inventory.find(x=>x.id===1001029)?.count||0")
  page.evaluate('executeEnchantMaterialExchange()')
  two=page.evaluate("() => ({flower:player.inventory.find(x=>x.id===1000608).count,corroded:player.inventory.find(x=>x.id===1001029).count})")
  check('flower 1:1 corroded magic stone exchange',one['flower']-two['flower']==1 and two['corroded']-cor_before==1,two)
  # Persistence through JSON save/load and legacy normalizer preserving enchant rows.
  persistence=page.evaluate("() => {const saved=JSON.stringify(player);const loaded=JSON.parse(saved);const w=loaded.inventory.find(x=>x.instanceId==='gy-formal-weapon');w.enchants=[{id:311192,name:'雪花魔力（龍之氣息）',slot:4,playerSlot:4}];const norm=normalizeEquipmentInstance(w,getItemData(w.id));return {instanceId:norm.instanceId,cards:norm.cards,enchants:norm.enchants};}")
  check('JSON save/load preserves instance/card/enchant schema',persistence['instanceId']=='gy-formal-weapon' and persistence['cards'][0]==4001 and persistence['enchants'][0]['id']==311192 and persistence['enchants'][0]['slot']==4,persistence)
  # Mobile material row must wrap, not create page-level overflow.
  mobile=browser.new_page(viewport={'width':390,'height':844}); mobile.route('http://assets.local/**',route_handler); mobile.on('pageerror',lambda exc: errors.append(str(exc))); mobile.set_content(page_html,wait_until='load'); mobile.evaluate("player.inventory.find(x=>x.instanceId==='gy-formal-weapon').enchants=[{id:311192,name:'雪花魔力（龍之氣息）',slot:4,playerSlot:4},{id:311272,name:'雪花魔力（死侍武器）',slot:3,playerSlot:3},{id:311452,name:'雪花魔力（物理等級） Lv.4',slot:2,playerSlot:2}];openEnchantPlatform({name:'附魔研究員'});setEnchantPlatformTab('upgrade')")
  mobile_metrics=mobile.evaluate("() => ({pageOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,dialogOverflow:document.querySelector('.enchant-platform-dialog').scrollWidth-document.querySelector('.enchant-platform-dialog').clientWidth,costScroll:document.querySelector('.enchant-cost-materials')?.scrollWidth-document.querySelector('.enchant-cost-materials')?.clientWidth,labels:[...document.querySelectorAll('.enchant-cost-item small')].map(x=>x.textContent)})")
  check('mobile formal UI has no page horizontal overflow',mobile_metrics['pageOverflow']==0,mobile_metrics)
  check('mobile material pills use short labels',all(len(x)<=4 for x in mobile_metrics['labels']) and len(mobile_metrics['labels'])>=6,mobile_metrics)
  browser.close()
check('Chromium formal UI has no page errors',not errors,errors)
failed=[x for x in checks if not x['pass']]
report={'version':'0.9.82GY','checks':checks,'passed':len(checks)-len(failed),'failed':len(failed),'errors':errors}
(ROOT/'GY_FORMAL_UI_TRANSACTION_TEST.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
raise SystemExit(1 if failed else 0)
