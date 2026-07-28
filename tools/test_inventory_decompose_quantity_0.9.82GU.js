#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'js/player.js'), 'utf8');
const start = source.indexOf('function cloneInventoryForDecompose(source) {');
const end = source.indexOf('\nfunction initEquipmentTabs()', start);
assert(start >= 0 && end > start, 'decompose runtime block not found');
const block = source.slice(start, end);

global.window = global;
global.document = { getElementById(){ return null; } };
const db = {
  512:{id:512,name:'蘋果',type:'consume',sellPrice:10},
  909:{id:909,name:'傑勒比結晶',type:'etc',sellPrice:3},
  501:{id:501,name:'紅色藥水',type:'consume',sellPrice:25},
  1101:{id:1101,name:'短劍',type:'equipment',sellPrice:50},
  14848:{id:14848,name:'MVP幸運轉蛋',type:'consume',sellPrice:1,manualUseOnly:true,subCategory:'mvp_gacha'}
};
global.getItemData = id => db[id] || null;
global.getInventoryFilterForItem = data => !data ? 'etc' : data.type === 'consume' ? 'consume' : data.type === 'equipment' ? 'equipment' : 'etc';
global.getPassiveSkillBonusTotals = () => ({shopSellBonusRate:0});
global.saveGame = () => true;
global.updatePlayerUI = () => {};
global.updateInventoryUI = () => {};
global.addBattleLog = () => {};
global.RO_WEB_PENDING_SAVE_TIMER = null;
global.activeInventoryFilter = 'consume';
global.activeInventoryPage = 0;
global.inventoryDecomposeActive = false;
global.inventoryDecomposeCooldownUntil = 0;
global.pendingInventoryDecomposeRequest = null;
global.INVENTORY_DECOMPOSE_LIMIT = 100;
global.INVENTORY_DECOMPOSE_MAX_INPUT = 999999999;
global.player = {
  inventory:[
    {id:512,count:3000,locked:false},
    {id:909,count:3000,locked:false},
    {id:14848,count:50,locked:false},
    {id:1101,count:1,locked:false,instanceId:'knife_1'},
    {id:501,count:100,locked:true}
  ],
  equipmentInstances:{},
  zeny:0
};
vm.runInThisContext(block, {filename:'player.decompose.runtime.js'});
const checks=[];
function check(name, fn){
  try { fn(); checks.push({name,ok:true}); }
  catch(error){ checks.push({name,ok:false,error:String(error.stack||error)}); }
}
function resetLock(){ inventoryDecomposeActive=false; inventoryDecomposeCooldownUntil=0; }

check('Apple 3000 minus 100 remains 2900', () => {
  const row=player.inventory.find(x=>x.id===512);
  const result=executeInventoryDecompose({mode:'item',target:{itemRef:row,itemId:512}},100);
  assert.equal(result.ok,true); assert.equal(result.removedCount,100); assert.equal(player.inventory.find(x=>x.id===512).count,2900);
});
resetLock();
check('Jellopy 3000 minus 100 remains 2900', () => {
  const row=player.inventory.find(x=>x.id===909);
  const result=executeInventoryDecompose({mode:'item',target:{itemRef:row,itemId:909}},100);
  assert.equal(result.ok,true); assert.equal(player.inventory.find(x=>x.id===909).count,2900);
});
resetLock();
check('Manual MVP gacha is protected', () => {
  const row=player.inventory.find(x=>x.id===14848);
  assert.equal(estimateInventoryDecompose({mode:'item',target:{itemRef:row,itemId:14848}},1).availableCount,0);
  assert.equal(player.inventory.find(x=>x.id===14848).count,50);
});
check('Locked item is protected', () => {
  const row=player.inventory.find(x=>x.id===501);
  assert.equal(estimateInventoryDecompose({mode:'item',target:{itemRef:row,itemId:501}},10).availableCount,0);
});
check('Equipped instance is protected', () => {
  const row=player.inventory.find(x=>x.instanceId==='knife_1');
  player.equipmentInstances.weapon=row;
  assert.equal(estimateInventoryDecompose({mode:'item',target:{itemRef:row,instanceId:'knife_1'}},1).availableCount,0);
  player.equipmentInstances={};
});
resetLock();
check('Inventory equipment removes exactly one instance', () => {
  const row=player.inventory.find(x=>x.instanceId==='knife_1');
  const result=executeInventoryDecompose({mode:'item',target:{itemRef:row,instanceId:'knife_1',itemId:1101}},1);
  assert.equal(result.ok,true); assert.equal(result.removedCount,1); assert.equal(player.inventory.some(x=>x.instanceId==='knife_1'),false);
});
resetLock();
check('Huge stack uses constant stack loop and exact subtraction', () => {
  const row=player.inventory.find(x=>x.id===909); row.count=1000000;
  const t0=performance.now();
  const result=executeInventoryDecompose({mode:'item',target:{itemRef:row,itemId:909}},500000);
  const elapsed=performance.now()-t0;
  assert.equal(result.removedCount,500000); assert.equal(player.inventory.find(x=>x.id===909).count,500000); assert(elapsed<1000,`elapsed ${elapsed}ms`);
});
resetLock();
check('Amount is clamped to available count', () => {
  const row=player.inventory.find(x=>x.id===512);
  const preview=estimateInventoryDecompose({mode:'item',target:{itemRef:row,itemId:512}},999999999);
  assert.equal(preview.amount,2900);
});
check('Zero and invalid amount fall back safely', () => {
  const row=player.inventory.find(x=>x.id===512);
  assert.equal(estimateInventoryDecompose({mode:'item',target:{itemRef:row,itemId:512}},0).amount,100);
  assert.equal(estimateInventoryDecompose({mode:'item',target:{itemRef:row,itemId:512}},'abc').amount,100);
});

const failed=checks.filter(x=>!x.ok);
const report={version:'0.9.82GU',checks,passed:checks.length-failed.length,failed:failed.length};
fs.writeFileSync(path.join(ROOT,'tools/test_inventory_decompose_quantity_report_0.9.82GU.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
process.exitCode=failed.length?1:0;
