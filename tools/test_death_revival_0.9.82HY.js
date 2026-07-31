#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const passes = [];
const failures = [];
function check(condition, name, detail = '') {
  if (condition) passes.push(name);
  else failures.push(`${name}${detail ? `: ${detail}` : ''}`);
}

function readJson(rel) { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); }
function valuesFromSplit(file) {
  const raw = readJson(file);
  return Array.isArray(raw) ? raw : (raw.items || raw.data || Object.values(raw));
}

// Official item / box / gacha data.
const materials = valuesFromSplit('data/items/materials_2.json');
const consumables = valuesFromSplit('data/items/consumables.json');
const token = materials.find(x => Number(x.id) === 7621);
const boxItem = consumables.find(x => Number(x.id) === 12922);
check(token?.name === '原地復活之證' && token?.usableOnDeath === true, 'Item 7621 原地復活之證資料存在且限死亡使用');
check(boxItem?.name === '原地復活之證箱子' && String(boxItem?.Script || boxItem?.scriptRaw || boxItem?.script || '').includes('getitem 7621,10'), 'Item 12922 箱子資料正確發放 10 個復活證');
check(fs.existsSync(path.join(ROOT, 'images/items/7621.webp')), 'Item 7621 正式圖示存在');
check(fs.existsSync(path.join(ROOT, 'images/items/12922.webp')), 'Item 12922 正式圖示存在');

const boxes = readJson('data/item_boxes.json');
const box = boxes.boxes?.token_of_siegfried_box || boxes.token_of_siegfried_box;
check(Number(box?.itemId) === 12922, '原地復活之證箱子已接入通用 ItemBox');
check(box?.rewards?.length === 1 && Number(box.rewards[0].itemId) === 7621 && Number(box.rewards[0].quantity) === 10, '開箱固定取得 10 個原地復活之證');

const gacha = readJson('data/mvp_gacha.json');
const category = (gacha.rareCategories || []).find(x => x.id === 'token_of_siegfried_box');
const totalBp = Number(gacha.ordinaryFillBasisPoints || 0) + (gacha.rareCategories || []).reduce((sum, x) => sum + Number(x.chanceBasisPoints || 0), 0);
check(Number(category?.chanceBasisPoints) === 500, 'MVP 轉蛋原地復活之證箱機率固定 5%');
check(category?.rewards?.length === 1 && Number(category.rewards[0].itemId) === 12922, 'MVP 轉蛋 5% 獎項指向 Item 12922');
check(totalBp === 10000, 'MVP 轉蛋機率總和維持 100%');

// Execute the real generic ItemBox runtime for the fixed 10-token reward.
{
  const boxSandbox = {
    console, Math:Object.create(Math),
    window:null, RO_WEB_DATA:{'data/item_boxes.json':boxes},
    player:{inventory:[{id:12922,name:'原地復活之證箱子',count:1}]},
    getItemData(id){ return Number(id)===12922?boxItem:(Number(id)===7621?token:null); },
    addBattleLog(){}, updateInventoryUI(){}, saveGame(){},
    addItem(item,count){
      let row=this.player.inventory.find(x=>Number(x.id)===Number(item.id));
      if(!row){row={id:Number(item.id),name:item.name,count:0};this.player.inventory.push(row);}
      row.count+=Number(count||0);
    },
    useItem(){return false;}
  };
  boxSandbox.window=boxSandbox;
  vm.createContext(boxSandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js/item_box_runtime.js'),'utf8'),boxSandbox,{filename:'item_box_runtime.js'});
  const opened=boxSandbox.ItemBoxRuntime.openBox(boxItem);
  check(opened===true,'ItemBoxRuntime 可開啟 Item 12922');
  check(!boxSandbox.player.inventory.some(x=>Number(x.id)===12922),'開箱後正確扣除 1 個 Item 12922');
  check(Number(boxSandbox.player.inventory.find(x=>Number(x.id)===7621)?.count||0)===10,'ItemBoxRuntime 實際發放 10 個 Item 7621');
}

// Static integration guards.
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const autoSource = fs.readFileSync(path.join(ROOT, 'js/auto_battle.js'), 'utf8');
const battleSource = fs.readFileSync(path.join(ROOT, 'js/battle.js'), 'utf8');
check(html.includes('id="playerDeathModal"') && html.includes('你已經死亡'), '死亡 UI 視窗已加入 index.html');
check(html.includes('id="deathReviveTokenButton"') && html.includes('id="deathReturnVillageButton"'), '死亡 UI 有原地復活與回村兩個選項');
check(html.includes('id="autoCombatAutoReviveTokenEnabled"'), '自動掛機設定有死亡自動使用復活證選項');
check(html.includes('death_revival_runtime.js?v=0.9.82HY'), '死亡 Runtime 以 HW 快取版本載入');
check(autoSource.includes('death: { autoUseToken: false, itemId: 7621 }'), 'AutoCombat 預設資料包含死亡策略');
check(autoSource.includes('player.autoCombat.death.autoUseToken = autoReviveTokenEnabled.checked === true'), '自動復活選項會寫入玩家存檔');
check(battleSource.includes('DeathRevivalRuntime.handleDeath({ defeatedBy, wasAutoBattle })'), 'playerDead 已委派給共用死亡 Runtime');
check(!battleSource.includes('HP 已恢復，自動掛機繼續運作。'), '舊版免費定時復活流程已移除');
check(battleSource.includes('角色已死亡，請先選擇原地復活或回到村莊。'), '死亡狀態禁止按開始掛機免費回血');

// Runtime behavior using the real JS file.
let timerId = 1;
const timers = new Map();
const logs = [];
const saved = [];
const classList = () => ({ values:new Set(), add(v){this.values.add(v)}, remove(v){this.values.delete(v)}, toggle(v,on){if(on)this.values.add(v);else this.values.delete(v)} });
function element() { return { hidden:true, disabled:false, textContent:'', title:'', dataset:{}, classList:classList(), setAttribute(){}, focus(){this.focused=true}, addEventListener(){} }; }
const elements = {
  playerDeathModal: element(), playerDeathCause: element(), deathReviveTokenButton: element(),
  deathReviveTokenCount: element(), deathReturnVillageButton: element(), autoCombatReviveTokenCount: element()
};
const listeners = {};
const ctx = {
  console, Math, Date, JSON, Object, Array, Number, String, Boolean, Set, Map, Promise,
  document: {
    readyState:'complete', body:{classList:classList()},
    getElementById(id){ return elements[id] || null; },
    addEventListener(name, fn){ listeners[name] = fn; }
  },
  setTimeout(fn, delay){ const id=timerId++; timers.set(id,{fn,delay}); return id; },
  clearTimeout(id){ timers.delete(id); },
  player: {
    hp:100,maxHp:400,sp:10,maxSp:80,currentCity:null,map:'field_1',lastFieldMap:'field_1',state:'Idle',
    inventory:[],autoCombat:{death:{autoUseToken:false,itemId:7621},teleport:{returnHome:{cityId:'prontera'}}}
  },
  currentMap:{id:'field_1'}, currentMonster:null, cities:[{id:'prontera',name:'普隆德拉'}],
  stopAutoBattle(){ctx.stopAutoCalls++}, stopManualMonsterAttack(){ctx.stopManualCalls++}, clearBattleTimersAndMonster(){},
  updateMonsterUI(){}, updateAutoBattleQuickToggleState(){}, updatePlayerUI(){}, updateInventoryUI(){}, updateAutoCombatUI(){},
  recalculatePlayerStats(){}, clearROStudioPlayerMotionOverride(){ctx.clearMotionCalls++},
  playROStudioPlayerMotion(){}, getROStudioMotionDuration(){return 900},
  addBattleLog(text){logs.push(text)},
  saveGame(){saved.push('save')},
  ROWebSaveManager:{saveNow(options){saved.push(options?.reason || 'save')}},
  startAutoBattle(){ctx.startAutoCalls++}, resetAutoBattleController(){},
  getCityData(id){return ctx.cities.find(c=>c.id===id)||null},
  enterCity(id){ctx.enteredCity=id;ctx.player.currentCity=id;ctx.player.map=null;ctx.player.state='Town'},
  stopAutoCalls:0,stopManualCalls:0,startAutoCalls:0,clearMotionCalls:0,enteredCity:null,
  addEventListener(name,fn){listeners[name]=fn}
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/death_revival_runtime.js'), 'utf8'), ctx, {filename:'death_revival_runtime.js'});

function runNextTimer(minDelay = -Infinity) {
  const first = [...timers.entries()].filter(([,value]) => Number(value.delay) >= minDelay).sort((a,b)=>a[0]-b[0])[0];
  if (!first) return false;
  timers.delete(first[0]); first[1].fn(); return true;
}
function flushImmediateTimers() { while (runNextTimer(0) && [...timers.values()].some(value => Number(value.delay) === 0)) {} }
function resetField() {
  ctx.player.currentCity=null; ctx.player.map='field_1'; ctx.player.lastFieldMap='field_1'; ctx.player.hp=100; ctx.player.sp=10;
  ctx.currentMap={id:'field_1'}; ctx.enteredCity=null;
}

// Manual death with no token: modal and disabled token option, no free recovery.
ctx.player.inventory=[];
ctx.DeathRevivalRuntime.handleDeath({defeatedBy:'波利',wasAutoBattle:false});
check(ctx.player.hp === 0, '手動死亡後 HP 保持 0，不會免費復活');
runNextTimer(900);
check(elements.playerDeathModal.hidden === false, '手動死亡動畫後顯示死亡 UI');
check(elements.deathReviveTokenButton.disabled === true, '沒有復活證時原地復活按鈕停用');
ctx.returnDeadPlayerToVillage();
check(ctx.enteredCity === 'prontera' && ctx.player.hp === 400 && ctx.player.sp === 80, '回到村莊後完整恢復並進入設定城鎮');

// Manual token revival consumes exactly one and stays in field.
resetField(); ctx.player.inventory=[{id:7621,count:2}];
ctx.DeathRevivalRuntime.handleDeath({defeatedBy:'瘋兔',wasAutoBattle:false}); runNextTimer(900);
check(elements.deathReviveTokenButton.disabled === false, '持有復活證時原地復活按鈕可用');
ctx.useDeathReviveToken();
check(ctx.player.inventory[0].count === 1, '手動原地復活只消耗 1 個原地復活之證');
check(ctx.player.hp === 400 && ctx.player.sp === 80 && ctx.player.currentCity === null, '手動原地復活在原地恢復完整 HP／SP');

// Auto death with token: consume and resume auto battle.
resetField(); ctx.player.autoCombat.death.autoUseToken=true; ctx.player.inventory=[{id:7621,count:1}];
const startsBefore=ctx.startAutoCalls;
ctx.DeathRevivalRuntime.handleDeath({defeatedBy:'主動怪',wasAutoBattle:true}); runNextTimer(900);
check((ctx.player.inventory.find(x=>x.id===7621)?.count || 0) === 0, '自動死亡復活消耗 1 個復活證');
check(elements.playerDeathModal.hidden === true, '自動復活成功時不殘留死亡 UI');
runNextTimer(100);
check(ctx.startAutoCalls === startsBefore + 1, '自動復活成功後恢復自動掛機');

// Auto death without token: stop and show modal.
resetField(); ctx.player.autoCombat.death.autoUseToken=true; ctx.player.inventory=[];
const startsNoToken=ctx.startAutoCalls;
ctx.DeathRevivalRuntime.handleDeath({defeatedBy:'米洛斯',wasAutoBattle:true}); runNextTimer(900);
check(ctx.player.hp === 0 && elements.playerDeathModal.hidden === false, '自動掛機死亡但無復活證時保持死亡並顯示 UI');
check(ctx.startAutoCalls === startsNoToken, '沒有復活證時不會重新啟動掛機');
check(logs.some(x=>x.includes('沒有原地復活之證') && x.includes('自動掛機已停止')), '沒有復活證時顯示明確停止掛機訊息');
ctx.returnDeadPlayerToVillage();

const report = {
  version:'0.9.82HY', suite:'death-revival-token-auto-revive-gacha',
  passed:passes.length, failed:failures.length, passes, failures
};
fs.writeFileSync(path.join(ROOT,'TEST_REPORT_0.9.82HY_DEATH_REVIVAL.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if (failures.length) process.exit(1);
