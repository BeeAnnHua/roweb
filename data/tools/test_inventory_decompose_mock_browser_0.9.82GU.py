import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
_source=(ROOT/'js/player.js').read_text(encoding='utf-8')
_start=_source.index('function cloneInventoryForDecompose(source) {')
_end=_source.index('\nfunction initEquipmentTabs()',_start)
PLAYER_BLOCK=_source[_start:_end]
ITEM_UI=(ROOT/'js/item_instance_ui.js').read_text(encoding='utf-8')
HTML='''<!doctype html><html><body>
<section id="item-detail-modal" class="hidden-window"><div class="item-detail-card"><div><b id="item-detail-title"></b><button id="item-detail-close">x</button></div><div id="item-detail-body"></div><div id="item-detail-actions" hidden><button id="item-detail-decompose-action" hidden>分解</button><button id="item-detail-primary-action" hidden></button><div id="item-detail-quick-picker" hidden></div></div></div></section>
<section id="inventory-decompose-modal" class="hidden-window"><div><b id="inventory-decompose-title"></b><button id="inventory-decompose-close">x</button><div id="inventory-decompose-summary"></div><input id="inventory-decompose-amount" type="number" value="100"><div id="inventory-decompose-preview"></div><div id="inventory-decompose-note"></div><button id="inventory-decompose-cancel">取消</button><button id="inventory-decompose-confirm">確認分解</button></div></section>
<button id="inventoryDecomposeBtn">分解</button>
</body></html>'''

BOOT=r'''
var window = globalThis;
var DEFAULT_EQUIPMENT={weapon:null,shield:null,headTop:null,headMid:null,headLow:null,armor:null,garment:null,shoes:null,accessory1:null,accessory2:null};
var inventoryLockMode=false, activeInventoryFilter='consume', activeInventoryPage=0;
var inventoryDecomposeActive=false, inventoryDecomposeCooldownUntil=0, pendingInventoryDecomposeRequest=null;
var INVENTORY_DECOMPOSE_LIMIT=100, INVENTORY_DECOMPOSE_MAX_INPUT=999999999;
var RO_WEB_PENDING_SAVE_TIMER=null;
var itemDb={
  512:{id:512,officialId:512,name:'蘋果',type:'consume',sellPrice:10,description:['恢復少量 HP。']},
  909:{id:909,officialId:909,name:'傑勒比結晶',type:'etc',sellPrice:3,description:['怪物掉落的雜物。']},
  1101:{id:1101,officialId:1101,name:'短劍',type:'equipment',slot:'weapon',sellPrice:50,description:['基本短劍。'],slots:0},
  14848:{id:14848,officialId:14848,name:'MVP幸運轉蛋',type:'consume',sellPrice:1,manualUseOnly:true,subCategory:'mvp_gacha'}
};
var player=window.player={inventory:[
 {id:512,count:3000,locked:false},
 {id:909,count:3000,locked:false},
 {id:1101,count:1,locked:false,instanceId:'knife1',refine:0,cards:[null,null,null,null],enchants:[]},
 {id:14848,count:20,locked:false}
],equipment:{...DEFAULT_EQUIPMENT},equipmentInstances:{},zeny:0};
function normalizeItemId(v){return Number(v)}
function getItemData(id){return itemDb[Number(id)]||null}
function getInventoryFilterForItem(d){return !d?'etc':d.type==='consume'?'consume':d.type==='equipment'?'equipment':'etc'}
function getPassiveSkillBonusTotals(){return {shopSellBonusRate:0}}
function saveGame(){return true}
function updatePlayerUI(){}
function updateInventoryUI(){}
var logs=[]; function addBattleLog(x){logs.push(x)}
function getItemTypeText(d){return d.type==='equipment'?'裝備':d.type==='consume'?'消耗品':'其他'}
function getEquipmentSlotCount(d){return Number(d.slots||0)}
function getEquipmentSlotName(s){return s}
function canEquipItem(){return {ok:true}}
function equipItem(){}
function unequipItem(){}
function cleanItemDescriptionLines(d){return d.description||[]}
function stripROColorCodesForCheck(x){return x}
function isTwoHandedWeaponItem(){return false}
function isWeaponEquipmentItem(d){return d&&d.type==='equipment'}
function hideGameTooltip(){}
function renderQuickSlotPicker(el){el.textContent='quick'}
window.renderQuickSlotPicker=renderQuickSlotPicker;
window.normalizePlayerData=function(){}; window.addItem=function(){}; window.showItemInfo=function(){}; window.closeItemInfo=function(){}; window.buildItemTooltip=function(){}; window.buildEquipmentTooltip=function(){}; window.handleInventorySlotClick=function(){}; window.setEquipmentSlot=function(){}; window.moveEquipmentSlotToInventory=function(){}; window.fixEquippedItemsInInventoryOnce=function(){}; window.addItemBackToInventory=function(){}; window.useItem=function(){};
'''

async def main():
  async with async_playwright() as p:
    browser=await p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=await browser.new_page()
    errs=[]
    page.on('pageerror',lambda e: errs.append(str(e)))
    await page.set_content(HTML)
    await page.add_script_tag(content=BOOT)
    await page.add_script_tag(content=PLAYER_BLOCK)
    await page.add_script_tag(content=ITEM_UI)
    await page.evaluate("document.dispatchEvent(new Event('DOMContentLoaded'))")
    # bind decompose modal
    await page.evaluate("initInventoryDecomposeDialog()")
    equipment=await page.evaluate("""(()=>{const x=player.inventory.find(r=>r.instanceId==='knife1'); showItemDetail(x,{source:'inventory'}); const p=document.querySelector('#item-detail-primary-action'),d=document.querySelector('#item-detail-decompose-action'); return {primary:p.textContent,primaryHidden:p.hidden,decompose:d.textContent,decomposeHidden:d.hidden,decomposeDisabled:d.disabled};})()""")
    await page.click('#item-detail-decompose-action')
    eqdialog=await page.evaluate("""({open:!document.querySelector('#inventory-decompose-modal').classList.contains('hidden-window'),amount:document.querySelector('#inventory-decompose-amount').value,summary:document.querySelector('#inventory-decompose-summary').textContent})""")
    await page.click('#inventory-decompose-confirm')
    equipmentGone=await page.evaluate("!player.inventory.some(r=>r.instanceId==='knife1')")
    # stack item detail and 100 subtraction
    await page.evaluate("inventoryDecomposeActive=false;inventoryDecomposeCooldownUntil=0;showItemDetail(player.inventory.find(r=>r.id===512),{source:'inventory'})")
    await page.click('#item-detail-decompose-action')
    await page.fill('#inventory-decompose-amount','100')
    preview=await page.text_content('#inventory-decompose-preview')
    await page.click('#inventory-decompose-confirm')
    apple=await page.evaluate("player.inventory.find(r=>r.id===512).count")
    # special gacha decompose disabled
    await page.evaluate("inventoryDecomposeActive=false;inventoryDecomposeCooldownUntil=0;showItemDetail(player.inventory.find(r=>r.id===14848),{source:'inventory'})")
    gacha=await page.evaluate("({hidden:document.querySelector('#item-detail-decompose-action').hidden,disabled:document.querySelector('#item-detail-decompose-action').disabled,title:document.querySelector('#item-detail-decompose-action').title})")
    report={'version':'0.9.82GU','equipment':equipment,'eqdialog':eqdialog,'equipmentGone':equipmentGone,'preview':preview,'apple':apple,'gacha':gacha,'errors':errs}
    (ROOT/'tools/test_inventory_decompose_mock_browser_report_0.9.82GU.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
    assert equipment['primary']=='穿戴' and equipment['decompose']=='分解' and not equipment['decomposeHidden']
    assert eqdialog['open'] and eqdialog['amount']=='1' and equipmentGone
    assert apple==2900
    assert gacha['disabled']
    assert not errs
    await browser.close()

asyncio.run(main())
