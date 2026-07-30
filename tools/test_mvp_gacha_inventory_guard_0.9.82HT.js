#!/usr/bin/env node
const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const read=rel=>JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'));
const cfg=read('data/mvp_gacha.json');
const itemIndex=read('data/items/item_index.json');
const cash=read('data/items/cash.json');
const checks=[];
const check=(ok,name,detail='')=>checks.push({ok:!!ok,name,detail:typeof detail==='string'?detail:JSON.stringify(detail)});
let autoRunning=true;
let timerId=0;
const intervalCallbacks=[];
const logs=[];

global.window=global;
global.document={
  getElementById:()=>null,
  createElement:()=>({className:'',textContent:'',style:{},children:[],appendChild(){},remove(){},setAttribute(){}}),
  head:{appendChild(){}},body:{appendChild(){}}
};
global.RO_WEB_DATA={'data/mvp_gacha.json':cfg};
global.player={name:'GT測試者',inventory:[],activeBuffs:{},hp:100,maxHp:1000,sp:20,maxSp:200,equipment:{},equipmentInstances:{}};
global.getItemData=id=>cash[String(id)]||itemIndex[String(id)]||{id:Number(id),name:`Item ${id}`,type:'consume'};
global.findInventoryItemById=id=>player.inventory.find(x=>String(x.id)===String(id)&&!x.instanceId)||null;
global.canUseConsumableItem=()=>({ok:true});
global.markConsumableItemUsed=()=>true;
global.recalculatePlayerStats=()=>{};
global.updatePlayerUI=()=>{};
global.updateInventoryUI=()=>{};
global.updateQuickSlotUI=()=>{};
global.requestGameSave=()=>{};
global.saveGame=()=>{};
global.invalidateCardRuntime=()=>{};
global.addBattleLog=(text,type)=>logs.push({text,type});
global.isAutoBattleRunning=()=>autoRunning;
global.setInterval=fn=>{intervalCallbacks.push(fn);return ++timerId;};
global.setTimeout=fn=>{fn();return ++timerId;};
global.clearInterval=()=>{};
global.clearTimeout=()=>{};
global.recordItemDrop=()=>{};
global.addItem=(item,count=1)=>{
  const data=getItemData(item.id)||item;
  if(String(data.type||'').toLowerCase()==='equipment'){
    for(let i=0;i<count;i++) player.inventory.push({id:Number(item.id),name:data.name,count:1,instanceId:`gt-${item.id}-${i}-${Date.now()}`});
    return;
  }
  let row=findInventoryItemById(item.id);
  if(!row){row={id:Number(item.id),name:data.name,count:0,locked:false};player.inventory.push(row);}
  row.count+=Number(count||0);
};
global.useItem=()=>false;

vm.runInThisContext(fs.readFileSync(path.join(ROOT,'js/mvp_gacha_runtime.js'),'utf8'),{filename:'mvp_gacha_runtime.js'});
const gachaCount=()=>Number(findInventoryItemById(cfg.gachaItemId)?.count||0);

check(MvpGachaRuntime.version==='0.9.82HT','Runtime version',MvpGachaRuntime.version);
check(getItemData(cfg.gachaItemId).manualUseOnly===true&&getItemData(cfg.gachaItemId).autoUse===false,'Gacha master data is manual-only');

player.inventory=[{id:cfg.gachaItemId,name:'MVP幸運轉蛋',count:5,locked:false}];
MvpGachaRuntime.auditInventoryGuard();
const blocked=useItem(cfg.gachaItemId,null,{});
check(blocked===false&&gachaCount()===5,'Unknown/programmatic useItem cannot consume gacha',gachaCount());

const oldRandom=Math.random;
Math.random=()=>0;
const opened=useItem(cfg.gachaItemId,null,{source:'item-info',userInitiated:true});
Math.random=oldRandom;
check(opened===true&&gachaCount()===4,'Authorized manual open consumes exactly one',gachaCount());
let audit=MvpGachaRuntime.auditInventoryGuard();
check(audit.restored===0&&gachaCount()===4,'Authorized spend is not restored',audit);

findInventoryItemById(cfg.gachaItemId).count-=1;
audit=MvpGachaRuntime.auditInventoryGuard();
check(audit.restored===1&&gachaCount()===4,'Unauthorized background decrement is restored during auto battle',audit);

// Consuming a different gacha reward food must not authorize a future gacha disappearance.
player.inventory.push({id:14849,name:'體力料理[轉蛋專用]',count:1,locked:false});
const foodUsed=MvpGachaRuntime.applyCashFood(getItemData(14849));
check(foodUsed===true&&gachaCount()===4,'Cash food consumption does not change gacha count',gachaCount());
findInventoryItemById(cfg.gachaItemId).count-=1;
audit=MvpGachaRuntime.auditInventoryGuard();
check(audit.restored===1&&gachaCount()===4,'Cash food cannot create gacha-spend authorization',audit);

// Arena drop is a legitimate increase and must become the new protected baseline.
global.currentMap={id:cfg.mapId};
const previousChance=cfg.mapExclusiveDropChanceBasisPoints;
cfg.mapExclusiveDropChanceBasisPoints=10000;
const dropped=MvpGachaRuntime.rollMapExclusiveDrop({id:1038,isMvp:true,lootRuntime:{}});
cfg.mapExclusiveDropChanceBasisPoints=previousChance;
audit=MvpGachaRuntime.auditInventoryGuard();
check(dropped===true&&gachaCount()===5&&audit.restored===0,'Legitimate arena drop increases protected count',audit);

// Outside auto battle the watchdog is intentionally passive, so storage/selling remains possible.
autoRunning=false;
findInventoryItemById(cfg.gachaItemId).count-=1;
audit=MvpGachaRuntime.auditInventoryGuard();
check(audit.active===false&&audit.restored===0&&gachaCount()===4,'Guard is passive outside auto battle',audit);

const playerJs=fs.readFileSync(path.join(ROOT,'js/player.js'),'utf8');
const quickJs=fs.readFileSync(path.join(ROOT,'js/quick_slots.js'),'utf8');
const autoJs=fs.readFileSync(path.join(ROOT,'js/auto_battle.js'),'utf8');
check(playerJs.includes('手動確認型消耗品不可落入通用 consumeItem')&&playerJs.includes('String(itemData.subCategory || "") === "mvp_gacha"'),'Generic consumeItem has gacha hard block');
check(quickJs.includes('if (event.repeat) return;'),'Quick-slot keyboard repeat is blocked');
check(autoJs.includes('轉蛋與其他手動確認型道具永遠不進入自動補品候選'),'Auto potion excludes manual-only gacha');

const report={
  version:'0.9.82HT',
  summary:{checks:checks.length,passed:checks.filter(x=>x.ok).length,failed:checks.filter(x=>!x.ok).length},
  checks,
  logs
};
fs.writeFileSync(path.join(ROOT,'tools/test_mvp_gacha_inventory_guard_report_0.9.82HT.json'),JSON.stringify(report,null,2)+'\n');
process.stdout.write(JSON.stringify(report,null,2)+'\n');
process.exit(report.summary.failed?1:0);
