#!/usr/bin/env python3
from pathlib import Path
import json, mimetypes
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
html=(ROOT/'index.html').read_text(encoding='utf-8')
item_start=html.index('<section id="item-detail-modal"')
item_end=html.index('<section id="skill-detail-modal"',item_start)
item_fragment=html[item_start:item_end]
platform_start=html.index('<section id="enchantPlatformWindow"')
platform_end=html.index('<section id="enchantMaterialExchangeWindow"',platform_start)
platform_fragment=html[platform_start:platform_end]
css=(ROOT/'css/style.css').read_text(encoding='utf-8')
item_js=(ROOT/'js/item_instance_ui.js').read_text(encoding='utf-8')
platform_js=(ROOT/'js/enchant_platform_runtime.js').read_text(encoding='utf-8')
catalog=json.loads((ROOT/'data/dim_glacier_enchant.json').read_text(encoding='utf-8'))
all_items=json.loads((ROOT/'data/items/item_index.json').read_text(encoding='utf-8'))
weapon_id=int(catalog['targetWeaponIds'][0])
stone=catalog['slots']['4']['items'][0]
needed={str(weapon_id):all_items[str(weapon_id)]}
for m in stone['materials']:
    needed[str(m['id'])]=all_items[str(m['id'])]

boot=f'''
var window=globalThis;
var DEFAULT_EQUIPMENT={{weapon:null,shield:null,headTop:null,headMid:null,headLow:null,armor:null,garment:null,shoes:null,accessory1:null,accessory2:null}};
window.RO_WEB_DATA={{
  "data/dim_glacier_enchant.json":{json.dumps(catalog,ensure_ascii=False)},
  "data/items/item_index.json":{json.dumps(needed,ensure_ascii=False)}
}};
var player=window.player={{inventory:[],equipment:{{...DEFAULT_EQUIPMENT}},equipmentInstances:{{}},zeny:999999}};
function normalizeItemId(v){{if(v&&typeof v==='object')v=v.id??v.itemId??v.officialId;const n=Number(v);return Number.isFinite(n)?n:v;}}
function getItemData(id){{return window.RO_WEB_DATA['data/items/item_index.json'][String(normalizeItemId(id))]||null;}}
function normalizePlayerData(){{}}
function addItem(){{}} function showItemInfo(){{}} function closeItemInfo(){{}} function buildItemTooltip(){{}} function buildEquipmentTooltip(){{}}
function handleInventorySlotClick(){{}} function setEquipmentSlot(){{}} function equipItem(){{}} function moveEquipmentSlotToInventory(){{}}
function fixEquippedItemsInInventoryOnce(){{}} function addItemBackToInventory(){{}} function useItem(){{}}
function getItemTypeText(d){{return d?.category==='weapon'?'武器':(d?.type||'物品');}}
function cleanItemDescriptionLines(d){{return Array.isArray(d?.description)?d.description:[];}}
function stripROColorCodesForCheck(x){{return String(x||'').replace(/\\^[0-9A-Fa-f]{{6}}/g,'');}}
function getItemName(id){{return getItemData(id)?.name||String(id);}}
function canEquipItem(){{return {{ok:true}};}} function unequipItem(){{}}
window.confirm=()=>true;
window.__saveCount=0;window.__recalcCount=0;window.__logs=[];
window.invalidateCardRuntime=()=>true;window.invalidatePlayerUiRenderCaches=()=>true;window.syncEquipmentGrantedSkills=()=>true;
window.recalculatePlayerStats=()=>{{window.__recalcCount++}};window.updateInventoryUI=()=>true;window.updateEquipmentUI=()=>true;window.updatePlayerUI=()=>true;
window.saveGame=()=>{{window.__saveCount++;window.__saved=JSON.stringify(window.player);return true;}};
window.addBattleLog=x=>window.__logs.push(String(x));window.bringWindowToFront=()=>true;window.ensureWindowSizeControl=()=>true;
'''
page_html=f'''<!doctype html><html><head><meta charset="utf-8"><base href="http://assets.local/"><style>html,body{{margin:0;width:100%;height:100%;background:#101820}}{css}</style></head><body>{item_fragment}{platform_fragment}<script>{boot}</script><script>{item_js}</script><script>{platform_js}</script></body></html>'''

checks=[]
def check(name,ok,detail=None):checks.append({'name':name,'pass':bool(ok),'detail':detail})
errors=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1280,'height':720})
    def route_handler(route):
        rel=route.request.url.split('http://assets.local/',1)[-1].split('?',1)[0]
        f=ROOT/rel
        if f.is_file():route.fulfill(status=200,body=f.read_bytes(),content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream')
        else:route.fulfill(status=404,body=b'')
    page.route('http://assets.local/**',route_handler)
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
    page.set_content(page_html,wait_until='load')
    setup=page.evaluate(f'''() => {{
      const base=getItemData({weapon_id});
      const stone=RO_WEB_DATA['data/dim_glacier_enchant.json'].slots['4'].items[0];
      player.inventory=[{{id:{weapon_id},itemId:{weapon_id},name:base.name,count:1,instanceId:'hh-browser-weapon',refine:13,enchantGrade:4,cards:[null,null,null,null],enchants:[],createdAt:1}},...stone.materials.map(m=>({{id:Number(m.id),name:m.name,count:Number(m.amount)+10,locked:false}}))];
      const opened=openEnchantPlatform({{name:'斐揚附魔研究員'}});
      selectEnchantStone(4,stone.id);closeEnchantStoneInfo();
      return {{opened,state:DimGlacierEnchantRuntime.getState(),name:base.name,stoneId:stone.id}};
    }}''')
    check('platform opens at slot 4',setup['opened'] and setup['state']['currentSlot']==4,setup)
    page.evaluate('executeEnchantPlatformAction()')
    result=page.evaluate('''() => {
      const w=player.inventory.find(x=>x.instanceId==='hh-browser-weapon');
      const e=(w?.enchants||[]).find(x=>Number(x.slot??x.playerSlot)===4)||null;
      const s4=document.querySelector('.enchant-visual-slot.slot-4');
      const s3=document.querySelector('.enchant-visual-slot.slot-3');
      return {weapon:w,enchant:e,state:DimGlacierEnchantRuntime.getState(),message:document.getElementById('enchantPlatformMessage').textContent,slot4Text:s4?.innerText||'',slot4Img:s4?.querySelector('img')?.getAttribute('src')||'',slot3Class:s3?.className||'',name:buildEquipmentInstanceName(w,getItemData(w.id)),saveCount:__saveCount};
    }''')
    check('slot 4 written to live inventory instance',result['enchant'] and int(result['enchant']['id'])==int(stone['id']),result)
    check('slot 3 unlocks immediately',result['state']['currentSlot']==3 and 'is-active' in result['slot3Class'],result)
    check('slot 4 image and name render',str(stone['id']) in result['slot4Img'] and result['enchant']['name'] in result['slot4Text'],result)
    check('success is saved and message reports slot 3',result['saveCount']>=1 and '解鎖第3洞' in result['message'],result)
    expected_prefix='+13 [A] '
    check('platform/item name uses +refine [grade] name [slot]',result['name'].startswith(expected_prefix) and result['name'].endswith('[1]'),result['name'])
    detail=page.evaluate('''() => {
      const w=player.inventory.find(x=>x.instanceId==='hh-browser-weapon');showItemDetail(w,{source:'inventory',inventoryItem:w});
      return {title:document.getElementById('item-detail-title').textContent,summary:document.querySelector('.item-detail-summary').innerText,flow:document.querySelector('.item-detail-dim-glacier-flow').textContent,slots:[...document.querySelectorAll('.item-detail-dim-slot')].map(x=>({className:x.className,text:x.innerText,img:x.querySelector('img')?.getAttribute('src')||''}))};
    }''')
    check('detail title uses standard format',detail['title'].startswith(expected_prefix) and detail['title'].endswith('[1]'),detail['title'])
    check('detail shows grade/card slot metadata','裝備階級：[A]' in detail['summary'] and '卡片插槽：[1]' in detail['summary'],detail['summary'])
    check('detail explains 4 -> 3 -> 2 order','第4洞 → 第3洞 → 第2洞' in detail['flow'],detail['flow'])
    for label in ['第1洞｜卡片','第4洞｜附魔','第2洞｜附魔','第3洞｜附魔']:
        check(f'detail explicitly labels {label}',any(label in r['text'] for r in detail['slots']),detail['slots'])
    check('detail slot 4 shows image and enchant name',any('slot-4' in r['className'] and r['img'] and result['enchant']['name'] in r['text'] for r in detail['slots']),detail['slots'])
    info=page.evaluate('''() => {document.querySelector('.item-detail-dim-slot.slot-4.filled')?.click();return {hidden:document.getElementById('enchantStoneInfoWindow').hidden,title:document.getElementById('enchantStoneInfoTitle').textContent,desc:document.getElementById('enchantStoneInfoDescription').textContent,icon:document.getElementById('enchantStoneInfoIcon').getAttribute('src')};}''')
    check('click slot 4 opens full image/name/description',info['hidden'] is False and info['title']==result['enchant']['name'] and str(stone['id']) in info['icon'] and len(info['desc'])>20,info)
    (ROOT/'docs/previews').mkdir(parents=True,exist_ok=True)
    page.screenshot(path=str(ROOT/'docs/previews/DIM_GLACIER_ENCHANT_0.9.82HH_desktop.png'),full_page=False)
    mobile=browser.new_page(viewport={'width':390,'height':844},has_touch=True,is_mobile=True)
    mobile.route('http://assets.local/**',route_handler)
    mobile.on('pageerror',lambda e:errors.append('mobile: '+str(e)))
    mobile.set_content(page_html,wait_until='load')
    mobile_result=mobile.evaluate(f'''() => {{const base=getItemData({weapon_id});const stone=RO_WEB_DATA['data/dim_glacier_enchant.json'].slots['4'].items[0];player.inventory=[{{id:{weapon_id},itemId:{weapon_id},name:base.name,count:1,instanceId:'hh-mobile',refine:13,enchantGrade:4,cards:[null,null,null,null],enchants:[{{id:stone.id,optionId:stone.id,name:stone.name,effect:stone.effect,slot:4,playerSlot:4}}]}}];showItemDetail(player.inventory[0],{{source:'inventory',inventoryItem:player.inventory[0]}});return {{title:document.getElementById('item-detail-title').textContent,slots:document.querySelectorAll('.item-detail-dim-slot').length,labels:[...document.querySelectorAll('.item-detail-dim-slot-kind')].map(x=>x.textContent),pageOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth}};}}''')
    check('mobile detail retains four explicit slots',mobile_result['slots']==4 and len(mobile_result['labels'])==4,mobile_result)
    check('mobile detail has no page horizontal overflow',mobile_result['pageOverflow']==0,mobile_result)
    mobile.screenshot(path=str(ROOT/'docs/previews/DIM_GLACIER_ENCHANT_0.9.82HH_mobile.png'),full_page=False)
    browser.close()
check('Chromium DOM test has no errors',not errors,errors)
failed=[x for x in checks if not x['pass']]
report={'version':'0.9.82HH','checks':checks,'passed':len(checks)-len(failed),'failed':len(failed),'errors':errors}
(ROOT/'tools/test_hh_enchant_browser_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'passed':report['passed'],'failed':report['failed'],'failedChecks':failed,'errors':errors},ensure_ascii=False,indent=2))
raise SystemExit(1 if failed else 0)
