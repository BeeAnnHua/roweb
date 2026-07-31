#!/usr/bin/env node
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm"),assert=require("assert");
const ROOT=path.resolve(__dirname,"..");
const mvpConfig=JSON.parse(fs.readFileSync(path.join(ROOT,"data/mvp_gacha.json"),"utf8"));
const realBoxConfig=JSON.parse(fs.readFileSync(path.join(ROOT,"data/item_boxes.json"),"utf8"));
const consumables=JSON.parse(fs.readFileSync(path.join(ROOT,"data/items/consumables.json"),"utf8"));
const boxItem={id:999001,name:"測試箱子",type:"consume",manualUseOnly:true,lootBoxId:"test_box"};
const rewardItem={id:999002,name:"測試獎品",type:"etc"};
const gachaItem={id:Number(mvpConfig.gachaItemId),name:"MVP幸運轉蛋",type:"consume",manualUseOnly:true,subCategory:"mvp_gacha"};
const potion={id:501,name:"紅色藥水",type:"consume"};
const itemMap=new Map([[boxItem.id,boxItem],[rewardItem.id,rewardItem],[gachaItem.id,gachaItem],[potion.id,potion]]);
for(const id of [603,617,644,1100100,12922]) if(consumables[String(id)]) itemMap.set(id,consumables[String(id)]);
for(const cat of mvpConfig.rareCategories||[])for(const row of cat.rewards||[])itemMap.set(Number(row.itemId),{id:Number(row.itemId),name:`獎品${row.itemId}`,type:"etc"});
for(const row of mvpConfig.ordinaryRewards||[])itemMap.set(Number(row.itemId),{id:Number(row.itemId),name:`獎品${row.itemId}`,type:"etc"});

const listeners=new Map();
const timers=[];let timerId=0, saveCalls=0, inventoryUpdates=0, quickUpdates=0, logs=0, announceCalls=0;
function addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);}
function dispatchEvent(event){for(const fn of listeners.get(event.type)||[])fn(event);return true;}
function setTimeoutFake(fn,delay=0){const id=++timerId;timers.push({id,fn,delay});return id;}
function clearTimeoutFake(id){const index=timers.findIndex(row=>row.id===id);if(index>=0)timers.splice(index,1);}
function drainTimers(limit=10000){let steps=0;while(timers.length){const row=timers.shift();row.fn();if(++steps>limit)throw new Error("timer runaway");}return steps;}

const document={
  getElementById(){return null;},
  createElement(){throw new Error("DOM rendering not used in this VM test");}
};
const context={
  console,Math,Date,JSON,Promise,Map,Set,Object,Array,String,Number,Boolean,
  document,navigator:{},CustomEvent:function(type,options){this.type=type;this.detail=options?.detail||{};},
  addEventListener,dispatchEvent,setTimeout:setTimeoutFake,clearTimeout:clearTimeoutFake,
  setInterval(){return 1;},clearInterval(){},
  RO_WEB_DATA:{
    "data/mvp_gacha.json":mvpConfig,
    "data/item_boxes.json":{...realBoxConfig,boxes:{...(realBoxConfig.boxes||{}),test_box:{id:"test_box",itemId:boxItem.id,name:boxItem.name,consumeCount:1,rewards:[{itemId:rewardItem.id,quantity:1,weight:1}]}}}
  },
  player:{name:"批量測試",inventory:[{id:gachaItem.id,name:gachaItem.name,count:4000},{id:boxItem.id,name:boxItem.name,count:4000}]},
  currentMap:{id:mvpConfig.mapId},
  getItemData(id){return itemMap.get(Number(id))||{id:Number(id),name:`Item ${id}`,type:"etc"};},
  findInventoryItemById(id){return this.player.inventory.find(row=>String(row.id)===String(id)&&!row.instanceId)||null;},
  canUseConsumableItem(){return {ok:true};},markConsumableItemUsed(){return true;},isAutoBattleRunning(){return false;},
  addItem(item,count=1){let row=this.findInventoryItemById(item.id);if(!row){row={id:Number(item.id),name:item.name,count:0};this.player.inventory.push(row);}row.count+=Number(count||0);},
  addBattleLog(){logs++;},addBattleLogBatch(entries){logs+=Array.isArray(entries)?entries.length:1;},
  updateInventoryUI(){inventoryUpdates++;},updateQuickSlotUI(){quickUpdates++;},updatePlayerUI(){},
  requestGameSave(){saveCalls++;},saveGame(){saveCalls++;return true;},recordItemDrop(){},
  useItem(){return false;},
  RareItemAnnouncementRuntime:{
    weightedItemChanceBasisPoints(rows,selected,parent=10000){const total=rows.reduce((s,r)=>s+Number(r.weight||0),0);const same=rows.filter(r=>String(r.itemId)===String(selected.itemId)).reduce((s,r)=>s+Number(r.weight||0),0);return total?parent*same/total:0;},
    tierForChanceBasisPoints(value){return Number(value)<=100?"red":null;},
    announceBatch(rows){announceCalls+=rows.length;},announceAcquisition(){announceCalls++;}
  }
};
context.window=context;
vm.createContext(context);
for(const file of ["js/mvp_gacha_runtime.js","js/item_box_runtime.js","js/item_batch_open_runtime.js"]){
  vm.runInContext(fs.readFileSync(path.join(ROOT,file),"utf8"),context,{filename:file});
}

const count=id=>Number(context.findInventoryItemById(id)?.count||0);
const checks=[];const check=(condition,name,detail="")=>{checks.push({ok:Boolean(condition),name,detail:String(detail)});assert.ok(condition,`${name}: ${detail}`);};

check(context.ItemBatchOpenRuntime.version==="0.9.82HY","shared runtime version",context.ItemBatchOpenRuntime.version);
check(context.MvpGachaRuntime.version==="0.9.82HY","MVP adapter version",context.MvpGachaRuntime.version);
check(context.ItemBoxRuntime.version==="0.9.82HY","ItemBox adapter version",context.ItemBoxRuntime.version);
check(context.ItemBatchOpenRuntime.canBatchOpen(gachaItem),"MVP gacha is batch-openable");
check(context.ItemBatchOpenRuntime.canBatchOpen(boxItem),"generic item box is batch-openable");
check(!context.ItemBatchOpenRuntime.canBatchOpen(potion),"ordinary potion is not batch-openable");
for(const id of [603,617,644,1100100,12922]) check(context.ItemBatchOpenRuntime.canBatchOpen(context.getItemData(id)),`official/current box ${id} is batch-openable`);

let result=context.ItemBatchOpenRuntime.openQuantity(gachaItem,4000,{userInitiated:true});
check(result.ok&&result.accepted===4000,"queue 4000 MVP gacha in one call",JSON.stringify(result));
check(context.MvpGachaRuntime.getPendingOpenCount()===4000,"MVP pending count is 4000");
const gachaTimerSteps=drainTimers();
check(count(gachaItem.id)===0,"4000 MVP gacha consumed after sliced processing",count(gachaItem.id));
check(context.MvpGachaRuntime.getPendingOpenCount()===0,"MVP queue completed");
check(gachaTimerSteps>100,"MVP batch yielded across many timer slices",gachaTimerSteps);
check(inventoryUpdates<200,"MVP UI refresh count is bounded",inventoryUpdates);

const uiBeforeBox=inventoryUpdates;
result=context.ItemBatchOpenRuntime.openQuantity(boxItem,4000,{userInitiated:true});
check(result.ok&&result.accepted===4000,"queue 4000 generic boxes in one call",JSON.stringify(result));
const boxTimerSteps=drainTimers();
check(count(boxItem.id)===0,"4000 generic boxes consumed",count(boxItem.id));
check(count(rewardItem.id)===4000,"4000 rewards granted",count(rewardItem.id));
check(context.ItemBoxRuntime.getPendingOpenCount()===0,"generic box queue completed");
check(boxTimerSteps>100,"generic boxes yielded across many timer slices",boxTimerSteps);
check(inventoryUpdates-uiBeforeBox<200,"generic box UI refresh count is bounded",inventoryUpdates-uiBeforeBox);
check(saveCalls>=20,"checkpoint/final save hooks fired",saveCalls);

context.player.inventory.push({id:boxItem.id,name:boxItem.name,count:7});
result=context.ItemBatchOpenRuntime.openQuantity(boxItem,999999,{userInitiated:true});
check(result.ok&&result.accepted===7,"requested quantity is capped to held amount",JSON.stringify(result));
drainTimers();
check(count(boxItem.id)===0,"held-amount cap consumed exactly seven");

let futureOpened=0;
context.ItemBatchOpenRuntime.registerAdapter({
  id:"future_card_album",
  matches(item){return Number(item.id)===777001;},
  getAvailable(){return 3;},getState(){return {totalOpened:futureOpened};},
  enqueue(item,amount){futureOpened+=amount;return {ok:true,accepted:amount,totalOpened:futureOpened-amount};},
  flushPendingForSave(){return {opened:0,remaining:0};}
});
const future={id:777001,name:"未來卡冊",type:"consume"};itemMap.set(future.id,future);
check(context.ItemBatchOpenRuntime.canBatchOpen(future),"future card album can register without changing core");
result=context.ItemBatchOpenRuntime.openQuantity(future,9,{userInitiated:true});
check(result.ok&&result.accepted===3,"future adapter uses shared held-amount cap",JSON.stringify(result));

const source=fs.readFileSync(path.join(ROOT,"js/item_batch_open_runtime.js"),"utf8");
check(source.includes('input.type = "number"'),"UI uses numeric quantity input");
check(source.includes('event.key === "Enter"'),"quantity input supports Enter");
check(source.includes('const DEFAULT_AMOUNT = 100'),"default quantity is 100");
check(!/pointerdown|touchstart|touchend|pointerup/i.test(source),"no hold-to-repeat event handlers");

const report={version:"0.9.82HY",suite:"shared-explicit-quantity-batch-open",passed:checks.filter(x=>x.ok).length,failed:checks.filter(x=>!x.ok).length,metrics:{gachaTimerSteps,boxTimerSteps,inventoryUpdates,quickUpdates,saveCalls,logs,announceCalls},checks};
fs.writeFileSync(path.join(ROOT,"TEST_REPORT_0.9.82HY_ITEM_BATCH_OPEN.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
