const fs=require('fs');
const path=require('path');
const vm=require('vm');
const assert=require('assert');
const root=path.resolve(__dirname,'..');

function makeLocalStorage(seed={}){
  const map=new Map(Object.entries(seed));
  return {
    get length(){return map.size;},
    key(i){return [...map.keys()][i] ?? null;},
    getItem(k){return map.has(String(k))?map.get(String(k)):null;},
    setItem(k,v){map.set(String(k),String(v));},
    removeItem(k){map.delete(String(k));},
    clear(){map.clear();},
    dump(){return Object.fromEntries(map)}
  };
}

const items={
  501:{id:501,officialId:501,name:'紅色藥水',type:'consume',icon:'images/items/501.webp'},
  1101:{id:1101,officialId:1101,name:'短劍',type:'equipment',icon:'images/items/1101.webp'}
};
const localStorage=makeLocalStorage();
const sandbox={
  console,
  JSON,
  Date,
  Math,
  setTimeout:(fn)=>fn(),
  clearTimeout:()=>{},
  localStorage,
  document:{getElementById:()=>null,body:{classList:{add(){},remove(){}}}},
  normalizeItemId:v=>{const n=Number(v);return Number.isFinite(n)?n:v;},
  getItemData:v=>items[Number(v?.id ?? v?.itemId ?? v)]||null,
  normalizeEquipmentInstance:(raw,data)=>({
    ...raw,id:Number(raw.id??raw.itemId),itemId:Number(raw.id??raw.itemId),name:raw.name||data.name,count:1,
    instanceId:String(raw.instanceId||'generated'),refine:Number(raw.refine||0),cards:Array.isArray(raw.cards)?raw.cards.slice():[],
    enchants:Array.isArray(raw.enchants)?raw.enchants.slice():[],locked:Boolean(raw.locked),broken:Boolean(raw.broken)
  }),
  buildCompactItemName:(row,data)=>`${Number(row.refine||0)>0?`+${row.refine} `:''}${data.name}`,
  updateInventoryUI:()=>{},
  saveGame:()=>true,
  addBattleLog:()=>{}
};
sandbox.window=sandbox;
sandbox.player=sandbox.window.player={inventory:[
  {id:501,count:10,locked:false},
  {id:1101,itemId:1101,name:'短劍',count:1,instanceId:'eq-1',refine:12,cards:[4001,null,null,null],enchants:[{id:1,name:'ATK+5'}],locked:false}
]};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root,'js/storage_runtime.js'),'utf8'),sandbox,{filename:'storage_runtime.js'});

assert.strictEqual(sandbox.storageSlotsUsed(),0);
assert.strictEqual(sandbox.depositStorageItem('stack:501',4),true);
assert.strictEqual(sandbox.player.inventory.find(x=>x.id===501).count,6);
let snap=sandbox.getAccountStorageSnapshot();
assert.strictEqual(snap.items.length,1);
assert.strictEqual(snap.items[0].count,4);

assert.strictEqual(sandbox.depositStorageItem('instance:eq-1',1),true);
assert.strictEqual(sandbox.player.inventory.some(x=>x.instanceId==='eq-1'),false);
snap=sandbox.getAccountStorageSnapshot();
const storedEq=snap.items.find(x=>x.instanceId==='eq-1');
assert.ok(storedEq);
assert.strictEqual(storedEq.refine,12);
assert.strictEqual(storedEq.cards[0],4001);
assert.strictEqual(storedEq.enchants[0].name,'ATK+5');

assert.strictEqual(sandbox.withdrawStorageItem('stack:501',2),true);
assert.strictEqual(sandbox.player.inventory.find(x=>x.id===501).count,8);
assert.strictEqual(sandbox.getAccountStorageSnapshot().items.find(x=>x.id===501).count,2);

assert.strictEqual(sandbox.withdrawStorageItem('instance:eq-1',1),true);
const returned=sandbox.player.inventory.find(x=>x.instanceId==='eq-1');
assert.ok(returned);
assert.strictEqual(returned.refine,12);
assert.strictEqual(returned.cards[0],4001);

// Locked inventory items cannot be deposited.
returned.locked=true;
assert.strictEqual(sandbox.depositStorageItem('instance:eq-1',1),false);
assert.ok(sandbox.player.inventory.find(x=>x.instanceId==='eq-1'));

// Verify character-only reset preservation with the real reset block.
const playerJs=fs.readFileSync(path.join(root,'js/player.js'),'utf8');
const start=playerJs.indexOf('//=======================================\n// 刪除存檔');
const end=playerJs.indexOf('//=======================================\n// 更新玩家資訊畫面',start);
assert.ok(start>=0 && end>start);
const resetCode=playerJs.slice(start,end);
const resetStorage=makeLocalStorage({
  'ro_web_save_v0_9_19_ui_scroll_quickbar':'CHARACTER',
  'ro_web_save_old':'OLD_CHARACTER',
  'ro_web_account_storage_v1':'WAREHOUSE',
  'ro_web_ui_positions':'UI'
});
const resetSandbox={
  console,
  localStorage:resetStorage,
  sessionStorage:{clear(){}},
  SAVE_KEY:'ro_web_save_v0_9_19_ui_scroll_quickbar',
  RO_WEB_PENDING_SAVE_TIMER:null,
  clearTimeout(){},
  Date,
  setTimeout:(fn)=>fn(),
  document:{getElementById:()=>null,body:{classList:{add(){},remove(){}}}},
  location:{origin:'http://localhost',pathname:'/index.html',replace(){}},
  Promise,
  caches:{keys:()=>Promise.resolve([]),delete:()=>Promise.resolve(true)}
};
resetSandbox.window=resetSandbox;
vm.createContext(resetSandbox);
vm.runInContext(resetCode,resetSandbox,{filename:'player-reset-block.js'});
assert.strictEqual(resetSandbox.clearCurrentCharacterSaveOnly(),true);
const after=resetStorage.dump();
assert.strictEqual(after['ro_web_save_v0_9_19_ui_scroll_quickbar'],undefined);
assert.strictEqual(after['ro_web_save_old'],undefined);
assert.strictEqual(after['ro_web_account_storage_v1'],'WAREHOUSE');
assert.strictEqual(after['ro_web_ui_positions'],'UI');

console.log(JSON.stringify({version:'0.9.82GH',storageTransfer:'PASS',instancePreservation:'PASS',characterResetPreservesWarehouse:'PASS'}));
