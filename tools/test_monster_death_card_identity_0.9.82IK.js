const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const root=require('path').resolve(__dirname,'..');
const monsterRows=JSON.parse(fs.readFileSync(root+'/data/monsters.json','utf8'));
const detale=monsterRows.find(x=>Number(x.id)===1719);
const ktullanux=monsterRows.find(x=>Number(x.id)===1779);
assert(detale && ktullanux);
assert.strictEqual(detale.name,'迪塔勒泰晤勒斯');
assert.strictEqual(ktullanux.name,'冰晶龍');
// Simulate merged card rows, as loadMonsterData does before combat begins.
detale.drops=[...(detale.drops||[]),{itemId:4386,chance:10000,type:'card',category:'card',cardDropSource:true,sourceMonsterId:1719,sourceMonsterAegisName:'DETALE'}];
ktullanux.drops=[...(ktullanux.drops||[]),{itemId:4419,chance:10000,type:'card',category:'card',cardDropSource:true,sourceMonsterId:1779,sourceMonsterAegisName:'KTULLANUX'}];

const documentStub={readyState:'loading',addEventListener(){},getElementById(){return null;},querySelector(){return null;},querySelectorAll(){return []},createElement(){return {classList:{add(){},remove(){},toggle(){}},dataset:{},style:{},appendChild(){},append(){},setAttribute(){},querySelector(){return null}}},createDocumentFragment(){return {appendChild(){}}}};
const context={
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame:(fn)=>fn(), requestIdleCallback:(fn)=>fn({timeRemaining:()=>10}),
  window:{}, document:documentStub, monsters:monsterRows, player:{map:'arena',stats:{},skillTimingState:{}}, currentMap:{id:'arena'},
  Date, Math, Object, Array, Number, String, Boolean, JSON, Map, Set, WeakMap, Promise
};
context.window=context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(root+'/js/battle.js','utf8'),context,{filename:'battle.js'});
const runtimeEntity={...ktullanux,id:1779,officialId:1779,combatMonsterId:1779,_instanceId:77,_spawnEntry:{monsterId:1779},name:'錯誤暫存名稱',drops:[{itemId:4386,chance:10000,type:'card',category:'card',cardDropSource:true,sourceMonsterId:1719}]};
const snap=context.createMonsterDeathRewardSnapshot(runtimeEntity);
assert.strictEqual(snap.id,1779);
assert.strictEqual(snap.name,'冰晶龍');
assert.strictEqual(snap._deathIdentity.monsterId,1779);
assert(snap.drops.some(x=>Number(x.itemId)===4419));
assert(!snap.drops.some(x=>Number(x.itemId)===4386));

const added=[]; const logs=[]; const rare=[];
context.addItem=(item,qty)=>added.push({item,qty});
context.recordItemDrop=()=>{};
context.addBattleLog=(text,type)=>logs.push({text,type});
context.emitRewardAwareLog=(text,type)=>logs.push({text,type});
context.applyRate=(v)=>v;
context.applyTrainingRewardBonus=(v)=>v;
context.getRate=()=>1;
context.randomInt=(a)=>a;
context.normalizeItemId=(x)=>Number(x);
context.getItemData=(id)=>({
  id:Number(id),
  name:Number(id)===4386?'迪塔勒泰晤勒斯卡片':Number(id)===4419?'水晶龍卡片':`Item ${id}`,
  type:[4386,4419].includes(Number(id))?'card':'etc',
  category:[4386,4419].includes(Number(id))?'card':'etc'
});
context.CardRuntime={getCardRecord(id){return Number(id)===4386?{dropSources:[{monsterId:1719}]}:Number(id)===4419?{dropSources:[{monsterId:1779},{monsterId:2103}]}:null;}};
context.RareItemAnnouncementRuntime={announceAcquisition:(x)=>{rare.push(x);return {announced:true}}};
context.RO_WEB_REWARD_BATCH_ACTIVE=true;
context.queueRewardBatchLog=(text,type)=>logs.push({text,type});
context.window=context;
vm.runInContext(fs.readFileSync(root+'/js/loot.js','utf8'),context,{filename:'loot.js'});

// Corrupt drop on Ice Crystal Dragon must be blocked.
context.rollMonsterDrops({...snap,drops:[{itemId:4386,chance:10000,type:'card',category:'card',cardDropSource:true,sourceMonsterId:1719}]});
assert.strictEqual(added.length,0);
assert.strictEqual(context.RO_WEB_MONSTER_DEATH_IDENTITY_AUDIT.cardSourceMismatchBlocked,1);
// Correct Ice Crystal Dragon card must pass and log source.
context.rollMonsterDrops({...snap,drops:[{itemId:4419,chance:10000,type:'card',category:'card',cardDropSource:true,sourceMonsterId:1779}]});
assert.strictEqual(added.length,1);
assert.strictEqual(added[0].item.id,4419);
assert(logs.some(x=>x.text.includes('水晶龍卡片')&&x.text.includes('來源：冰晶龍')));
// Detale card must only pass for Detale snapshot.
const detaleSnap=context.createMonsterDeathRewardSnapshot({...detale,_instanceId:88,_spawnEntry:{monsterId:1719}});
context.rollMonsterDrops({...detaleSnap,drops:[{itemId:4386,chance:10000,type:'card',category:'card',cardDropSource:true,sourceMonsterId:1719}]});
assert.strictEqual(added.length,2);
assert.strictEqual(added[1].item.id,4386);
assert(logs.some(x=>x.text.includes('迪塔勒泰晤勒斯卡片')&&x.text.includes('來源：迪塔勒泰晤勒斯')));
console.log(JSON.stringify({status:'PASS',tests:12,audit:context.RO_WEB_MONSTER_DEATH_IDENTITY_AUDIT,logs},null,2));
