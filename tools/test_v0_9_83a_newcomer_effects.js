#!/usr/bin/env node
const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const read=rel=>JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'));
const cfg=read('data/newcomer_support.json');
const itemIndex=read('data/items/item_index.json');
const equipEffects=read('data/card_runtime/equipment_effects.json');
const enchantEffects=read('data/enchant_runtime/enchant_effects.json');
const jobs=read('data/jobs.json');

const refineById=new Map();
for(const row of Object.values(cfg.jobRoutes)) for(const id of row.weapons) refineById.set(Number(id),0);
for(const set of Object.values(cfg.stages['100'].armorSets)) set.items.forEach((id,i)=>refineById.set(Number(id),i<3?Number(cfg.stages['100'].armorRefine||10):0));
for(const stage of ['130','160']) for(const set of Object.values(cfg.stages[stage].sets)) set.items.forEach((id,i)=>refineById.set(Number(id),Number(set.refines[i]||0)));
const ids=[...refineById.keys()].sort((a,b)=>a-b);
const enchantIds=[...cfg.weaponEnchantOptions.slot3,...cfg.weaponEnchantOptions.slot2].map(x=>Number(x.id));

const failures=[]; const rows=[];
const check=(ok,label,detail='')=>{if(!ok) failures.push({label,detail});};
check(ids.length===62,'62 support equipment',String(ids.length));
check(enchantIds.length===7,'7 weapon enchant choices',String(enchantIds.length));

global.window=global;global.document=undefined;global.setInterval=()=>0;global.CustomEvent=function(){};global.dispatchEvent=()=>true;
window.RO_WEB_DATA={
 'data/card_runtime/card_effects.json':read('data/card_runtime/card_effects.json'),
 'data/card_runtime/equipment_effects.json':equipEffects,
 'data/card_runtime/card_combos.json':read('data/card_runtime/card_combos.json'),
 'data/card_runtime/item_groups.json':read('data/card_runtime/item_groups.json'),
 'data/card_runtime/card_drop_sources.json':read('data/card_runtime/card_drop_sources.json'),
 'data/enchant_runtime/enchant_effects.json':enchantEffects,
 'data/jobs.json':jobs
};
window.getItemData=id=>itemIndex[String(Number(id))]||null;
window.getEquipmentInstance=slot=>window.player?.equipmentInstances?.[slot]||null;
window.getSkillLevel=()=>10;window.getCurrentJobData=()=>({});window.getTrainingBonusTotals=()=>({});window.getPassiveSkillBonusTotals=()=>({});window.getPassiveCombatModifierTotals=()=>({});window.getActiveBuffBonusTotals=()=>({});
window.recalculatePlayerStats=()=>{};window.updatePlayerUI=()=>{};window.updateInventoryUI=()=>{};window.updateEquipmentUI=()=>{};window.saveGame=()=>{};window.syncEquipmentGrantedSkills=()=>{};window.addBattleLog=()=>{};
window.player={baseLevel:275,jobLevel:60,job:'dragon_knight',jobKey:'dragon_knight',gender:'male',stats:{str:130,agi:130,vit:130,int:130,dex:130,luk:130},traitStats:{pow:110,sta:110,wis:110,spl:110,con:110,crt:110},learnedSkills:{},equipment:{},equipmentInstances:{},inventory:[],activeBuffs:{}};
vm.runInThisContext(fs.readFileSync(path.join(ROOT,'js/card_runtime.js'),'utf8'),{filename:'card_runtime.js'});
vm.runInThisContext(fs.readFileSync(path.join(ROOT,'js/effect_runtime.js'),'utf8'),{filename:'effect_runtime.js'});
CardRuntime.init();
const ignored=new Set(['id','name','sourceId','sourceType','runtimeError','dynamic','scriptMessages','visualEffects','rawBonuses']);
function meaningful(out){return Object.entries(out||{}).some(([k,v])=>!ignored.has(k)&&((typeof v==='number'&&v!==0)||(Array.isArray(v)&&v.length)||(v&&typeof v==='object'&&Object.keys(v).length)));}
for(const id of ids){
 const item=itemIndex[String(id)],refine=refineById.get(id)||0,record=CardRuntime.getRuntimeRecord(id,'equipment');
 check(!!item,`item index ${id}`); check(!!record,`runtime record ${id}`);
 if(!item||!record) continue;
 const slot=item.slot||'body';
 const context={sourceType:'equipment',slot,hostRow:{slot,itemId:id,refine,grade:0,instance:{refine,cards:[],enchants:[]},item},equippedIds:[id],maxRefine:refine,maxGrade:0};
 let out=null; try{out=CardRuntime._debugEvaluateRecord(record,context);}catch(err){out={runtimeError:String(err)}}
 const raw=Object.keys(out?.rawBonuses||{}); const err=out?.runtimeError||null;
 check(!err,`runtime error ${id}`,String(err||''));
 check(raw.length===0,`unhandled bonus ${id}`,raw.join(','));
 check(meaningful(out),`no emitted effect ${id}`,JSON.stringify(out));
 rows.push({id,name:item.name,stage:item.supportStage,refine,sourcePath:record.sourcePath,runtimeError:err,unhandledBonuses:raw,emittedKeys:Object.keys(out||{}).filter(k=>!ignored.has(k)&&k!=='rawBonuses')});
}
for(const id of enchantIds){
 const rec=CardRuntime.getRuntimeRecord(id,'enchant'); check(!!rec,`enchant runtime record ${id}`);
 if(!rec) continue;
 let out=null; try{out=CardRuntime._debugEvaluateRecord(rec,{sourceType:'enchant',slot:'weapon',hostRow:{slot:'weapon',itemId:600012,refine:0,grade:0,instance:{enchants:[{id,slot:3}]}},equippedIds:[600012,id],maxRefine:0,maxGrade:0});}catch(err){out={runtimeError:String(err)}}
 const raw=Object.keys(out?.rawBonuses||{}); const err=out?.runtimeError||null;
 check(!err,`enchant runtime error ${id}`,String(err||''));
 check(raw.length===0,`enchant unhandled bonus ${id}`,raw.join(','));
 check(meaningful(out),`enchant no emitted effect ${id}`,JSON.stringify(out));
}

// Confirm the merged runtime actually sees the support weapon and both chosen enchants.
window.player.equipment={weapon:600012};
window.player.equipmentInstances={weapon:{id:600012,itemId:600012,refine:0,grade:0,cards:[],enchants:[{id:Number(cfg.weaponEnchantOptions.slot3[0].id),slot:3},{id:Number(cfg.weaponEnchantOptions.slot2[0].id),slot:2}]}};
CardRuntime.invalidate();
const sources=CardRuntime.getSources();
check(sources.some(x=>Number(x.sourceId)===600012&&x.sourceType==='equipment'),'merged weapon source');
for(const id of [Number(cfg.weaponEnchantOptions.slot3[0].id),Number(cfg.weaponEnchantOptions.slot2[0].id)]) check(sources.some(x=>Number(x.sourceId)===id&&x.sourceType==='enchant'),`merged enchant source ${id}`);

const report={version:'0.9.83A',suite:'newcomer-equipment-effects',equipmentCount:ids.length,enchantCount:enchantIds.length,passed:ids.length+enchantIds.length-failures.length,failed:failures.length,failures,rows};
console.log(JSON.stringify({version:report.version,equipmentCount:report.equipmentCount,enchantCount:report.enchantCount,failed:report.failed,failures:report.failures.slice(0,20)},null,2));
if(failures.length) process.exit(1);
