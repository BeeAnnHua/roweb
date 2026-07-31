#!/usr/bin/env node
"use strict";
const fs=require("fs"), path=require("path"), vm=require("vm"), assert=require("assert");
const ROOT=path.resolve(__dirname,"..");
const cfg=JSON.parse(fs.readFileSync(path.join(ROOT,"data/mvp_gacha.json"),"utf8"));

class StorageMock {
  constructor(){this.map=new Map();this.failSaveWrites=false;}
  getItem(key){return this.map.has(String(key))?this.map.get(String(key)):null;}
  setItem(key,value){
    const k=String(key);
    if(this.failSaveWrites && (k.includes("ro_web_save_v0_9_19_ui_scroll_quickbar") && !k.includes("writer_lease") && !k.includes("persist_requested") && !k.includes("session_id"))){
      const error=new Error("QuotaExceededError");error.name="QuotaExceededError";throw error;
    }
    this.map.set(k,String(value));
  }
  removeItem(key){this.map.delete(String(key));}
  clear(){this.map.clear();}
}
class FakeIndexedDB {
  constructor(){this.stores=new Map();}
  open(){
    const request={};
    setImmediate(()=>{
      const owner=this;
      const db={
        objectStoreNames:{contains:n=>owner.stores.has(n)},
        createObjectStore(n){if(!owner.stores.has(n))owner.stores.set(n,new Map());},
        transaction(name){
          if(!owner.stores.has(name))owner.stores.set(name,new Map());
          const values=owner.stores.get(name); const tx={};
          tx.objectStore=()=>({
            get(id){const r={};setImmediate(()=>{r.result=values.get(id);r.onsuccess?.();});return r;},
            getAll(){const r={};setImmediate(()=>{r.result=[...values.values()];r.onsuccess?.();});return r;},
            put(value){values.set(value.id,JSON.parse(JSON.stringify(value)));},
            clear(){values.clear();}
          });
          setTimeout(()=>tx.oncomplete?.(),15);
          return tx;
        }
      };
      request.result=db;request.onupgradeneeded?.();request.onsuccess?.();
    });
    return request;
  }
}
const localStorage=new StorageMock(), sessionStorage=new StorageMock(), indexedDB=new FakeIndexedDB();
const logs=[]; const timers=new Map(); let timerSeq=0;
const manualButton={disabled:false,dataset:{},textContent:"存檔"};
const context={
  console,Math,Date,JSON,Promise,Uint32Array,localStorage,sessionStorage,indexedDB,
  navigator:{storage:{}},crypto:{getRandomValues(a){a.fill(7);return a;}},
  CustomEvent:function(type,opt){this.type=type;this.detail=opt?.detail;},
  document:{
    visibilityState:"visible",addEventListener(){},querySelectorAll(){return[];},querySelector(){return null;},
    getElementById(id){if(id==="manualSaveButton")return manualButton;return null;},
    createElement(){return{style:{},classList:{add(){},remove(){},contains(){return true;}},appendChild(){},setAttribute(){},remove(){},children:[]};},
    head:{appendChild(){}},body:{appendChild(){},classList:{add(){},remove(){}}}
  },
  setTimeout(fn,delay=0){const id=++timerSeq;timers.set(id,{fn,delay});return id;},
  clearTimeout(id){timers.delete(id);},setInterval(){return ++timerSeq;},clearInterval(){},
  addEventListener(){},dispatchEvent(){return true;},addBattleLog(text,type){logs.push({text:String(text),type});}
};
context.window=context;vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(ROOT,"js/player.js"),"utf8"),context,{filename:"js/player.js"});

const gachaId=Number(cfg.gachaItemId);
context.currentMap={id:cfg.mapId};
vm.runInContext(`player={name:'四千轉蛋測試',gender:'male',genderChosen:true,baseLevel:1,jobLevel:1,baseExp:0,jobExp:0,zeny:0,
 inventory:[{id:${gachaId},name:'MVP幸運轉蛋',count:4000,locked:false}],equipment:{},equipmentInstances:{},stats:{str:1,agi:1,vit:1,int:1,dex:1,luk:1},currentCity:null,state:'Idle'};
 window.player=player;`,context);
context.RO_WEB_DATA={"data/mvp_gacha.json":cfg};
context.getItemData=id=>({id:Number(id),name:Number(id)===gachaId?"MVP幸運轉蛋":`Item ${id}`,type:"consume",manualUseOnly:Number(id)===gachaId,subCategory:Number(id)===gachaId?"mvp_gacha":"consume"});
context.findInventoryItemById=id=>context.player.inventory.find(row=>String(row.id)===String(id)&&!row.instanceId)||null;
context.canUseConsumableItem=()=>({ok:true});context.markConsumableItemUsed=()=>true;
context.updateInventoryUI=()=>{};context.updateQuickSlotUI=()=>{};context.updatePlayerUI=()=>{};
context.recordItemDrop=()=>{};context.isAutoBattleRunning=()=>false;context.useItem=()=>false;
context.addItem=(item,count=1)=>{let row=context.findInventoryItemById(item.id);if(!row){row={id:Number(item.id),name:item.name,count:0,locked:false};context.player.inventory.push(row);}row.count+=Number(count||0);};
vm.runInContext(fs.readFileSync(path.join(ROOT,"js/mvp_gacha_runtime.js"),"utf8"),context,{filename:"js/mvp_gacha_runtime.js"});

const countGacha=()=>Number(context.findInventoryItemById(gachaId)?.count||0);
const MAIN="ro_web_save_v0_9_19_ui_scroll_quickbar";
(async()=>{
  assert.strictEqual(context.MvpGachaRuntime.version,"0.9.82HX");
  for(let i=0;i<4000;i++) assert.strictEqual(context.MvpGachaRuntime.openGacha(context.getItemData(gachaId),{testAuthorized:true}),true);
  assert.strictEqual(context.MvpGachaRuntime.getPendingOpenCount(),4000);
  assert.strictEqual(countGacha(),4000,"queued openings are not consumed before settlement");

  // Simulate another tab lease: explicit manual save must reclaim writer ownership.
  localStorage.setItem(`${MAIN}_writer_lease_v2`,JSON.stringify({sessionId:"other-tab",heartbeatAt:Date.now()}));
  const saved=await context.manualSaveGame();
  assert.strictEqual(saved,true);
  assert.strictEqual(context.MvpGachaRuntime.getPendingOpenCount(),0);
  assert.strictEqual(countGacha(),0);
  const mainEnvelope=JSON.parse(localStorage.getItem(MAIN));
  const savedGacha=(mainEnvelope.player.inventory||[]).find(row=>Number(row.id)===gachaId);
  assert.strictEqual(Number(savedGacha?.count||0),0);
  let durable=await context.ROWebSaveManager.readDurableCandidates();
  let newest=context.ROWebSaveManager.chooseNewest([...context.ROWebSaveManager.readLocalCandidates(),...durable]);
  assert.strictEqual(Number((newest.player.inventory||[]).find(row=>Number(row.id)===gachaId)?.count||0),0);

  // localStorage quota failure must still commit a newer IndexedDB save.
  context.player.inventory.push({id:gachaId,name:"MVP幸運轉蛋",count:100,locked:false});
  for(let i=0;i<100;i++) context.MvpGachaRuntime.openGacha(context.getItemData(gachaId),{testAuthorized:true});
  localStorage.failSaveWrites=true;
  const quotaSaved=await context.manualSaveGame();
  localStorage.failSaveWrites=false;
  assert.strictEqual(quotaSaved,true);
  assert.strictEqual(countGacha(),0);
  durable=await context.ROWebSaveManager.readDurableCandidates();
  newest=context.ROWebSaveManager.chooseNewest([...context.ROWebSaveManager.readLocalCandidates(),...durable]);
  assert.strictEqual(newest.source,"indexeddb-primary");
  assert.strictEqual(Number((newest.player.inventory||[]).find(row=>Number(row.id)===gachaId)?.count||0),0);
  assert.strictEqual(context.RO_WEB_SAVE_STATE.lastManualSaveVerified,true);

  const report={version:"0.9.82HX",passed:18,failed:0,checks:{queued4000:true,manualDrain:true,writerReclaim:true,localReadback:true,durableReadback:true,quotaFallback:true},logs:logs.slice(-8)};
  fs.writeFileSync(path.join(ROOT,"tools/test_gacha_save_barrier_report_0.9.82HX.json"),JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error);process.exit(1);});
