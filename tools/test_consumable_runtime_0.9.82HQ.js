#!/usr/bin/env node
const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const read=rel=>JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'));
const manifest=read('data/items/database_manifest.json');
const itemMap={};
for(const rel of manifest.allDataPaths){const full=path.join(ROOT,rel);if(!fs.existsSync(full))continue;const data=read(rel);const rows=Array.isArray(data)?data:Object.values(data);for(const row of rows){if(row&&typeof row==='object'&&(row.id!==undefined||row.Id!==undefined))itemMap[String(Number(row.id??row.Id))]=row;}}
const checks=[];const check=(ok,name,detail='')=>checks.push({ok:!!ok,name,detail:String(detail)});
global.window=global;global.document=undefined;global.CustomEvent=function(){};
window.RO_WEB_DATA={
 'data/card_runtime/card_effects.json':read('data/card_runtime/card_effects.json'),
 'data/card_runtime/equipment_effects.json':read('data/card_runtime/equipment_effects.json'),
 'data/card_runtime/card_combos.json':read('data/card_runtime/card_combos.json'),
 'data/card_runtime/item_groups.json':read('data/card_runtime/item_groups.json'),
 'data/card_runtime/card_drop_sources.json':read('data/card_runtime/card_drop_sources.json'),
 'data/jobs.json':read('data/jobs.json')
};
window.getItemData=id=>itemMap[String(id)]||null;
window.getEquipmentInstance=()=>null;window.getSkillLevel=()=>10;window.getCurrentJobData=()=>({});window.getTrainingBonusTotals=()=>({});window.getPassiveSkillBonusTotals=()=>({});window.getPassiveCombatModifierTotals=()=>({});window.getActiveBuffBonusTotals=()=>({});
window.addBattleLog=(text)=>logs.push(text);
window.updatePlayerUI=()=>{};window.updateInventoryUI=()=>{};window.saveGame=()=>{saves++};window.invalidateCardRuntime=()=>{};window.recalculatePlayerStats=()=>{};
window.markConsumableItemUsed=()=>{};window.calculateItemRecoveryAmount=(v)=>Number(v)*2;
window.addItem=(item,count=1)=>{let row=player.inventory.find(x=>String(x.id)===String(item.id));if(!row){row={id:item.id,name:item.name,count:0};player.inventory.push(row)}row.count+=count};
window.addZeny=v=>{player.zeny+=Number(v)};
window.normalizeAutoStatusKey=v=>String(v).replace(/^SC_/i,'').toLowerCase();
window.getPlayerActiveStatusKeys=()=>Object.keys(player.runtimeState?.statuses||{});
window.getMatchedStatusCureKeys=(profile,keys)=>keys.filter(k=>profile.statuses.includes(k));
window.clearPlayerStatuses=keys=>{for(const k of keys)delete player.runtimeState.statuses[k];return keys};
window.StatusManager={apply:(unit,key,opts)=>{unit.runtimeState=unit.runtimeState||{statuses:{}};unit.runtimeState.statuses[key]={expiresAt:Date.now()+opts.durationMs};return true}};
let logs=[],saves=0;
function reset(id,count=2){logs=[];saves=0;window.player={inventory:[{id,name:itemMap[String(id)]?.name||String(id),count}],activeBuffs:{},runtimeState:{statuses:{}},hp:100,maxHp:1000,sp:20,maxSp:200,zeny:0};}
reset(645);
vm.runInThisContext(fs.readFileSync(path.join(ROOT,'js/card_runtime.js'),'utf8'),{filename:'card_runtime.js'});CardRuntime.init();
vm.runInThisContext(fs.readFileSync(path.join(ROOT,'js/consumable_runtime.js'),'utf8'),{filename:'consumable_runtime.js'});

reset(645);let r=ConsumableRuntime.apply(itemMap['645']);
check(r.applied&&player.inventory[0].count===1,'集中藥水消耗一次',JSON.stringify(r));
check(Object.values(player.activeBuffs).some(b=>b.effects?.aspdFlat===4&&b.expiresAt>b.startedAt),'集中藥水 ASPD +4／30分鐘',JSON.stringify(player.activeBuffs));

reset(656);r=ConsumableRuntime.apply(itemMap['656']);
check(Object.values(player.activeBuffs).some(b=>b.effects?.aspdFlat===6),'覺醒藥水 ASPD +6');
reset(657);r=ConsumableRuntime.apply(itemMap['657']);
check(Object.values(player.activeBuffs).some(b=>b.effects?.aspdFlat===9),'菠色克藥水 ASPD +9');

reset(662);r=ConsumableRuntime.apply(itemMap['662']);
const horse=Object.values(player.activeBuffs).find(b=>b.sourceItemId===662);
check(r.applied&&horse?.effects?.moveSpeedRate===25,'馬牌移速 +25%',JSON.stringify(horse));
check(horse?.expiresAt-horse?.startedAt===180000,'馬牌持續 3 分鐘',horse?.expiresAt-horse?.startedAt);
check(ConsumableRuntime.hasActiveItemEffect(662,'SC_SPEEDUP0'),'馬牌 active detector');

reset(12030);r=ConsumableRuntime.apply(itemMap['12030']);
check(Object.values(player.activeBuffs).some(b=>b.effects?.atkFlat===20),'怨恨箱 ATK +20');

reset(12090);r=ConsumableRuntime.apply(itemMap['12090']);
check(player.hp===250,'蒸沙漠蠍子恢復 MaxHP 15%',player.hp);
check(player.sp===30,'蒸沙漠蠍子恢復 MaxSP 5%',player.sp);
check(Object.values(player.activeBuffs).some(b=>b.effects?.agiFlat===10),'蒸沙漠蠍子 AGI +10');

reset(536);Math.random=()=>0;r=ConsumableRuntime.apply(itemMap['536']);
check(player.hp===310,'霜淇淋固定恢復套用物品恢復倍率',player.hp);
check(!!player.runtimeState.statuses.freeze,'霜淇淋附帶冰凍機率效果');

const cure=itemMap['525'];reset(525);player.runtimeState.statuses={poison:{},silence:{},curse:{}};r=ConsumableRuntime.apply(cure);
check(!player.runtimeState.statuses.poison&&!player.runtimeState.statuses.silence,'異常解除 Script 有效',JSON.stringify(player.runtimeState.statuses));

reset(22511);r=ConsumableRuntime.apply(itemMap['22511']);
const talisman=Object.values(player.activeBuffs).find(b=>b.sourceItemId===22511);
check(r.applied&&talisman?.effects?.matkFlat===25,'bonus_script 魔法攻擊效果接入',JSON.stringify(talisman));
check(talisman?.expiresAt-talisman?.startedAt===300000,'bonus_script 持續時間接入',talisman?.expiresAt-talisman?.startedAt);

const pet=itemMap['659'];reset(659);r=ConsumableRuntime.apply(pet);
check(r.blocked&&player.inventory[0].count===2,'未實作寵物捕捉不扣道具',JSON.stringify(r));
check(logs.some(x=>x.includes('不會消耗')),'未實作效果有明確提示',logs.join('|'));

const report={version:'0.9.82HQ',summary:{checks:checks.length,passed:checks.filter(x=>x.ok).length,failed:checks.filter(x=>!x.ok).length},checks};
fs.writeFileSync(path.join(ROOT,'TEST_REPORT_0.9.82HQ_CONSUMABLE_RUNTIME.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));process.exit(report.summary.failed?1:0);
