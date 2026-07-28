#!/usr/bin/env python3
import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
ITEM=(ROOT/'js/item_instance_ui.js').read_text(encoding='utf-8')
STORAGE=(ROOT/'js/storage_runtime.js').read_text(encoding='utf-8')
item=json.loads((ROOT/'data/items/item_index.json').read_text(encoding='utf-8'))['600030']
HTML='''<!doctype html><html><body>
<section id="item-detail-modal" class="hidden-window"><b id="item-detail-title"></b><button id="item-detail-close"></button><div id="item-detail-body"></div><div id="item-detail-actions"></div><button id="item-detail-decompose-action"></button><button id="item-detail-primary-action"></button><div id="item-detail-quick-picker"></div></section>
<section id="storageWindow" hidden><b id="storageNpcName"></b><div id="storageMessage"></div><div id="storageInventoryList"></div><div id="storageAccountList"></div><span id="storageCapacityText"></span><span id="storageInventoryCountText"></span></section>
</body></html>'''
BOOT=f'''
var window=globalThis;var DEFAULT_EQUIPMENT={{weapon:null,shield:null,headTop:null,headMid:null,headLow:null,armor:null,garment:null,shoes:null,accessory1:null,accessory2:null}};
var db={{600030:{json.dumps(item,ensure_ascii=False)},4001:{{id:4001,name:'波利卡片',type:'card',description:['LUK+2']}}}};
function normalizeItemId(v){{return Number(v?.id??v?.itemId??v)}} function getItemData(id){{return db[Number(id)]||null}};
var player=window.player={{inventory:[{{id:600030,itemId:600030,name:'黯淡冰晶雙手巨劍',count:1,instanceId:'gy-persist',refine:12,enchantGrade:4,cards:[4001,null,null,null],enchants:[{{id:311192,name:'雪花魔力（龍之氣息）',slot:4,playerSlot:4}},{{id:311272,name:'雪花魔力（死侍武器）',slot:3,playerSlot:3}},{{id:311449,name:'雪花魔力（物理等級） Lv.1',slot:2,playerSlot:2}}]}}],equipment:{{...DEFAULT_EQUIPMENT}},equipmentInstances:{{}},zeny:0}};
function getInventoryFilterForItem(d){{return d?.type==='equipment'?'equipment':'item'}} function getItemTypeText(){{return '裝備'}} function getEquipmentSlotCount(d){{return Number(d?.slots||0)}} function getEquipmentSlotName(s){{return s}} function canEquipItem(){{return {{ok:true}}}} function equipItem(){{}} function unequipItem(){{}} function cleanItemDescriptionLines(d){{return d?.description||[]}} function stripROColorCodesForCheck(x){{return x}} function isTwoHandedWeaponItem(){{return true}} function isWeaponEquipmentItem(d){{return d?.type==='equipment'}} function hideGameTooltip(){{}} function renderQuickSlotPicker(){{}} function saveGame(){{window.__save=(window.__save||0)+1}} function updatePlayerUI(){{}} function updateInventoryUI(){{}} function updateEquipmentUI(){{}} function addBattleLog(){{}} function bringWindowToFront(){{}}
window.normalizePlayerData=function(){{}};window.addItem=function(){{}};window.showItemInfo=function(){{}};window.closeItemInfo=function(){{}};window.buildItemTooltip=function(){{}};window.buildEquipmentTooltip=function(){{}};window.handleInventorySlotClick=function(){{}};window.setEquipmentSlot=function(){{}};window.moveEquipmentSlotToInventory=function(){{}};window.fixEquippedItemsInInventoryOnce=function(){{}};window.addItemBackToInventory=function(){{}};window.useItem=function(){{}};
'''
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  page=await browser.new_page(); errs=[];page.on('pageerror',lambda e:errs.append(str(e)))
  await page.set_content(HTML);await page.add_script_tag(content=BOOT);await page.add_script_tag(content=ITEM);await page.add_script_tag(content=STORAGE);await page.evaluate("document.dispatchEvent(new Event('DOMContentLoaded'))")
  before=await page.evaluate("() => {normalizeAllItemInstances();const w=player.inventory[0];return {id:w.id,instanceId:w.instanceId,cards:w.cards,enchants:w.enchants}}")
  dep=await page.evaluate("depositStorageItem('instance:gy-persist',1)")
  stored=await page.evaluate("getAccountStorageSnapshot().items[0]")
  wd=await page.evaluate("withdrawStorageItem('instance:gy-persist',1)")
  returned=await page.evaluate("player.inventory.find(x=>x.instanceId==='gy-persist')")
  serialized=await page.evaluate("() => JSON.parse(JSON.stringify(player.inventory.find(x=>x.instanceId==='gy-persist')))")
  # Legacy save with optionId/playerSlot must normalize without loss.
  legacy=await page.evaluate("() => normalizeEquipmentInstance({id:600030,instanceId:'legacy',cards:[4001],randomOptions:[{optionId:311192,displayName:'雪花魔力（龍之氣息）',playerSlot:4}]},getItemData(600030))")
  checks={
   'normalizePreserves':before['instanceId']=='gy-persist' and len(before['enchants'])==3 and before['cards'][0]==4001,
   'deposit':dep and stored['instanceId']=='gy-persist' and len(stored['enchants'])==3 and stored['cards'][0]==4001,
   'withdraw':wd and returned and len(returned['enchants'])==3 and returned['cards'][0]==4001,
   'jsonRoundTrip':serialized['enchants'][2]['slot']==2 and serialized['refine']==12 and serialized['enchantGrade']==4,
   'legacyMigration':legacy['instanceId']=='legacy' and legacy['enchants'][0]['id']==311192 and legacy['enchants'][0]['playerSlot']==4,
   'noErrors':not errs
  }
  report={'version':'0.9.82GY','checks':checks,'passed':sum(checks.values()),'failed':sum(not x for x in checks.values()),'stored':stored,'returned':returned,'legacy':legacy,'errors':errs}
  (ROOT/'GY_STORAGE_SAVE_PERSISTENCE_TEST.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps({'checks':checks,'errors':errs},ensure_ascii=False,indent=2));assert all(checks.values());await browser.close()
asyncio.run(main())
