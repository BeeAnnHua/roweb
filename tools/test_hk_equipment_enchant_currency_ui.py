#!/usr/bin/env python3
from pathlib import Path
import json, mimetypes
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
html=(ROOT/'index.html').read_text(encoding='utf-8')
css=(ROOT/'css/style.css').read_text(encoding='utf-8')
item_js=(ROOT/'js/item_instance_ui.js').read_text(encoding='utf-8')
enchant_js=(ROOT/'js/enchant_platform_runtime.js').read_text(encoding='utf-8')
ui_js=(ROOT/'js/ui.js').read_text(encoding='utf-8')

def fragment(start_marker,end_marker):
    a=html.index(start_marker); b=html.index(end_marker,a); return html[a:b]

item_fragment=fragment('<section id="item-detail-modal"','<section id="inventory-decompose-modal"')
platform_fragment=fragment('<section id="enchantGradeWindow"','<section id="enchantMaterialExchangeWindow"')
topbar_fragment=fragment('<div id="right-hud-shell"','<section id="player-info"')

catalog=json.loads((ROOT/'data/dim_glacier_enchant.json').read_text(encoding='utf-8'))
items=json.loads((ROOT/'data/items/item_index.json').read_text(encoding='utf-8'))
weapon_id=int(catalog['targetWeaponIds'][0]); card_id=4001
s4=catalog['slots']['4']['items'][0]; s3=catalog['slots']['3']['items'][0]; s2=catalog['slots']['2']['items'][0]
needed={str(weapon_id):items[str(weapon_id)],str(card_id):items[str(card_id)]}
for stone in (s4,s3,s2):
    needed[str(stone['id'])]=items.get(str(stone['id']),{'id':stone['id'],'name':stone['name'],'icon':f"images/items/{stone['id']}.webp",'description':[stone.get('effect','')]})

boot=rf'''
var window=globalThis;
var DEFAULT_EQUIPMENT={{weapon:null,shield:null,headTop:null,headMid:null,headLow:null,armor:null,garment:null,shoes:null,accessory1:null,accessory2:null}};
window.RO_WEB_DATA={{"data/dim_glacier_enchant.json":{json.dumps(catalog,ensure_ascii=False)},"data/items/item_index.json":{json.dumps(needed,ensure_ascii=False)}}};
var player=window.player={{inventory:[],equipment:{{...DEFAULT_EQUIPMENT}},equipmentInstances:{{}},zeny:1234567890,blueGem:234567,redGem:345678}};
function normalizeItemId(v){{if(v&&typeof v==='object')v=v.id??v.itemId??v.officialId;const n=Number(v);return Number.isFinite(n)?n:v;}}
function getItemData(id){{return window.RO_WEB_DATA['data/items/item_index.json'][String(normalizeItemId(id))]||null;}}
function normalizePlayerData(){{}} function addItem(){{}} function showItemInfo(){{}} function closeItemInfo(){{}} function buildItemTooltip(){{}} function buildEquipmentTooltip(){{}}
function handleInventorySlotClick(){{}} function setEquipmentSlot(){{}} function equipItem(){{}} function moveEquipmentSlotToInventory(){{}}
function fixEquippedItemsInInventoryOnce(){{}} function addItemBackToInventory(){{}} function useItem(){{}}
function getItemTypeText(d){{return d?.category==='weapon'?'武器':(d?.type||'物品');}}
function cleanItemDescriptionLines(d){{return Array.isArray(d?.description)?d.description:[];}}
function stripROColorCodesForCheck(x){{return String(x||'').replace(/\^[0-9A-Fa-f]{{6}}/g,'');}}
function getItemName(id){{return getItemData(id)?.name||String(id);}}
function canEquipItem(){{return {{ok:true}};}} function unequipItem(){{}}
function updateInventoryUI(){{}} function updateEquipmentUI(){{}} function updatePlayerUI(){{}} function updateStatusUI(){{}} function updateQuickSlotUI(){{}}
function saveGame(){{}} function requestGameSave(){{}} function addBattleLog(){{}} function recalculatePlayerStats(){{}} function syncEquipmentGrantedSkills(){{}}
function invalidateCardRuntime(){{}} function invalidatePlayerUiRenderCaches(){{}} function bringWindowToFront(){{}} function ensureWindowSizeControl(){{}}
function isMobileViewport(){{return innerWidth<=700;}}
window.CardRuntime={{getEnchantRecord:(id)=>Object.values(RO_WEB_DATA['data/dim_glacier_enchant.json'].slots).flatMap(x=>x.items).find(x=>Number(x.id)===Number(id))||null}};
window.ROGoldUI={{alert:()=>Promise.resolve(true)}};
'''
page_html=f'''<!doctype html><html><head><meta charset="utf-8"><base href="http://assets.local/"><style>html,body{{margin:0;width:100%;height:100%;background:#17202a}}{css}</style></head><body><div id="battle-field">{topbar_fragment}</div>{item_fragment}{platform_fragment}<button id="hover-target" type="button" style="position:fixed;left:20px;top:20px;width:180px;height:44px;z-index:40000;display:block!important;visibility:visible!important;opacity:1!important">hover</button><script>{boot}</script><script>{item_js}</script><script>{enchant_js}</script></body></html>'''

checks=[]; errors=[]
def check(name,ok,detail=None): checks.append({'name':name,'pass':bool(ok),'detail':detail})

def route_factory(route):
    rel=route.request.url.split('http://assets.local/',1)[-1].split('?',1)[0]
    f=ROOT/rel
    if f.is_file(): route.fulfill(status=200,body=f.read_bytes(),content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream')
    else: route.fulfill(status=404,body=b'')

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1280,'height':720})
    page.route('http://assets.local/**',route_factory)
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.on('console',lambda m: errors.append(m.text) if m.type=='error' else None)
    page.set_content(page_html,wait_until='load'); page.add_script_tag(content=ui_js); page.evaluate('() => {initGameTooltips();initCurrencyDetailPopup();}')

    setup=page.evaluate(f'''() => {{
      const base=getItemData({weapon_id});
      const w={{id:{weapon_id},itemId:{weapon_id},name:base.name,count:1,instanceId:'hk-ui',refine:11,enchantGrade:2,cards:[{card_id},null,null,null],enchants:[
        {{id:{s4['id']},name:{json.dumps(s4['name'],ensure_ascii=False)},effect:{json.dumps(s4.get('effect',''),ensure_ascii=False)},slot:4,playerSlot:4}},
        {{id:{s3['id']},name:{json.dumps(s3['name'],ensure_ascii=False)},effect:{json.dumps(s3.get('effect',''),ensure_ascii=False)},slot:3,playerSlot:3}},
        {{id:{s2['id']},name:{json.dumps(s2['name'],ensure_ascii=False)},effect:{json.dumps(s2.get('effect',''),ensure_ascii=False)},slot:2,playerSlot:2}}]}};
      window.__hkWeapon=w; const tooltip=buildEquipmentHoverTooltip(w,base); document.getElementById('hover-target').dataset.tooltip=tooltip; return {{tooltip}};
    }}''')
    tooltip=setup['tooltip']
    check('hover title includes refine and grade',tooltip.startswith('+11 [C]'),tooltip)
    check('hover title includes card item name',f"[卡片：{items[str(card_id)]['name']}]" in tooltip,tooltip)
    check('hover title includes all enchant item names',all(x['name'] in tooltip for x in (s4,s3,s2)),tooltip)
    check('hover title includes weapon item name',items[str(weapon_id)]['name'] in tooltip,tooltip)
    page.evaluate("() => { const t=document.getElementById('hover-target'); t.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,clientX:30,clientY:30})); t.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:40,clientY:40})); }"); page.wait_for_timeout(80)
    hover=page.evaluate("() => ({visible:document.getElementById('game-tooltip')?.classList.contains('is-visible'),text:document.getElementById('game-tooltip')?.innerText||''})")
    check('actual mouse hover opens tooltip',hover['visible'],hover)
    check('actual tooltip labels attached items',all(x in hover['text'] for x in ['卡片：','第4洞附魔：','第3洞附魔：','第2洞附魔：']),hover)
    out=ROOT/'docs/previews'; out.mkdir(parents=True,exist_ok=True)
    page.screenshot(path=str(out/'EQUIPMENT_ATTACHMENT_TOOLTIP_0.9.82HK_desktop.png'),full_page=False)

    page.evaluate("() => showItemDetail(window.__hkWeapon,{source:'inventory',inventoryItem:window.__hkWeapon})")
    page.click('.item-detail-dim-slot.slot-4'); page.wait_for_timeout(50)
    stone=page.evaluate("() => {const m=document.getElementById('enchantStoneInfoWindow');return {hidden:m.hidden,className:m.className,title:document.getElementById('enchantStoneInfoTitle').textContent,desc:document.getElementById('enchantStoneInfoDescription').textContent,position:getComputedStyle(m).position,z:getComputedStyle(m).zIndex,platformHidden:document.getElementById('enchantPlatformWindow').hidden};}")
    check('normal item detail click opens enchant info',not stone['hidden'] and 'hidden-window' not in stone['className'],stone)
    check('enchant info works while platform stays closed',stone['platformHidden'],stone)
    check('enchant info shows name and effect',stone['title']==s4['name'] and len(stone['desc'].strip())>0,stone)
    check('enchant info is global fixed overlay',stone['position']=='fixed' and int(stone['z'])>=30000,stone)
    page.screenshot(path=str(out/'ATTACHED_ENCHANT_INFO_0.9.82HK_desktop.png'),full_page=False)
    page.click('.enchant-stone-info-close'); page.evaluate('() => closeItemDetailModal()')

    page.click('#top-bar'); page.wait_for_timeout(50)
    currency=page.evaluate("() => {const p=document.getElementById('currency-detail-popup'),r=p.getBoundingClientRect();return {hidden:p.hidden,text:p.innerText,visible:p.classList.contains('is-visible'),rect:{left:r.left,right:r.right,top:r.top,bottom:r.bottom}};}")
    check('currency click opens full-number popup',currency['visible'] and not currency['hidden'],currency)
    check('currency popup shows full Zeny','1,234,567,890' in currency['text'],currency)
    check('currency popup shows full gem counts','234,567' in currency['text'] and '345,678' in currency['text'],currency)
    check('currency popup stays inside viewport',currency['rect']['left']>=0 and currency['rect']['right']<=1280 and currency['rect']['top']>=0,currency)
    page.screenshot(path=str(out/'EQUIPMENT_ENCHANT_CURRENCY_0.9.82HK_desktop.png'),full_page=False)

    mobile=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    mobile.route('http://assets.local/**',route_factory)
    mobile.set_content(page_html,wait_until='load'); mobile.add_script_tag(content=ui_js); mobile.evaluate('() => {initGameTooltips();initCurrencyDetailPopup();}')
    mobile.click('#top-bar'); mobile.wait_for_timeout(50)
    mcur=mobile.evaluate("() => {const p=document.getElementById('currency-detail-popup'),r=p.getBoundingClientRect();return {visible:p.classList.contains('is-visible'),text:p.innerText,left:r.left,right:r.right,viewport:innerWidth};}")
    check('mobile currency popup opens',mcur['visible'],mcur)
    check('mobile currency popup fits viewport',mcur['left']>=0 and mcur['right']<=mcur['viewport']+1,mcur)
    mobile.evaluate('() => hideCurrencyDetailPopup()')
    mobile.evaluate(f'''() => {{const base=getItemData({weapon_id});const w={{id:{weapon_id},itemId:{weapon_id},instanceId:'hk-mobile',refine:11,enchantGrade:2,cards:[{card_id}],enchants:[{{id:{s4['id']},name:{json.dumps(s4['name'],ensure_ascii=False)},effect:{json.dumps(s4.get('effect',''),ensure_ascii=False)},slot:4,playerSlot:4}}]}};showItemDetail(w,{{source:'inventory',inventoryItem:w}});}}''')
    mobile.click('.item-detail-dim-slot.slot-4'); mobile.wait_for_timeout(50)
    mstone=mobile.evaluate("() => {const m=document.getElementById('enchantStoneInfoWindow'),r=m.querySelector('.enchant-stone-info-card').getBoundingClientRect();return {visible:!m.hidden&&!m.classList.contains('hidden-window'),title:document.getElementById('enchantStoneInfoTitle').textContent,left:r.left,right:r.right,top:r.top,bottom:r.bottom,viewportW:innerWidth,viewportH:innerHeight};}")
    check('mobile attached enchant info opens',mstone['visible'] and mstone['title']==s4['name'],mstone)
    check('mobile attached enchant info fits viewport',mstone['left']>=0 and mstone['right']<=mstone['viewportW']+1 and mstone['top']>=0 and mstone['bottom']<=mstone['viewportH']+1,mstone)
    mobile.screenshot(path=str(out/'EQUIPMENT_ENCHANT_CURRENCY_0.9.82HK_mobile.png'),full_page=False)
    browser.close()

check('no browser runtime errors',not errors,errors)
failed=[x for x in checks if not x['pass']]
report={'version':'0.9.82HK','checks':checks,'passed':len(checks)-len(failed),'failed':len(failed),'errors':errors}
(ROOT/'tools/test_hk_equipment_enchant_currency_ui_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'passed':report['passed'],'failed':report['failed'],'failedChecks':failed,'errors':errors},ensure_ascii=False,indent=2))
raise SystemExit(1 if failed else 0)
