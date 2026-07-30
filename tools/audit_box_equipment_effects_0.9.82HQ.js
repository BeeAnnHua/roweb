#!/usr/bin/env node
const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const read=rel=>JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'));
const manifest=read('data/items/database_manifest.json');
const itemMap={};
for(const rel of manifest.allDataPaths){const full=path.join(ROOT,rel);if(!fs.existsSync(full))continue;const data=read(rel);for(const row of (Array.isArray(data)?data:Object.values(data))){if(row&&typeof row==='object'&&(row.id!==undefined||row.Id!==undefined))itemMap[String(Number(row.id??row.Id))]=row;}}
const boxes=read('data/item_boxes.json');
const boxSources={};
for(const [key,box] of Object.entries(boxes.boxes||{}))for(const reward of box.rewards||[]){const id=String(Number(reward.itemId));(boxSources[id]??=[]).push(key);}
const equipmentIds=[...new Set(Object.keys(boxSources).filter(id=>String(itemMap[id]?.type)==='equipment'))].map(Number).sort((a,b)=>a-b);

global.window=global;global.document=undefined;global.setInterval=()=>0;global.CustomEvent=function(){};global.dispatchEvent=()=>true;
window.RO_WEB_DATA={
 'data/card_runtime/card_effects.json':read('data/card_runtime/card_effects.json'),
 'data/card_runtime/equipment_effects.json':read('data/card_runtime/equipment_effects.json'),
 'data/card_runtime/card_combos.json':read('data/card_runtime/card_combos.json'),
 'data/card_runtime/item_groups.json':read('data/card_runtime/item_groups.json'),
 'data/card_runtime/card_drop_sources.json':read('data/card_runtime/card_drop_sources.json'),
 'data/jobs.json':read('data/jobs.json')
};
window.getItemData=id=>itemMap[String(Number(id))]||null;
window.getEquipmentInstance=slot=>window.player?.equipmentInstances?.[slot]||null;
window.getSkillLevel=()=>10;window.getCurrentJobData=()=>({});window.getTrainingBonusTotals=()=>({});window.getPassiveSkillBonusTotals=()=>({});window.getPassiveCombatModifierTotals=()=>({});window.getActiveBuffBonusTotals=()=>({});
window.recalculatePlayerStats=()=>{};window.updatePlayerUI=()=>{};window.updateInventoryUI=()=>{};window.updateEquipmentUI=()=>{};window.saveGame=()=>{};window.syncEquipmentGrantedSkills=()=>{};window.addBattleLog=()=>{};
window.player={baseLevel:275,jobLevel:60,job:'dragon_knight',jobKey:'dragon_knight',gender:'male',stats:{str:130,agi:130,vit:130,int:130,dex:130,luk:130},traitStats:{pow:110,sta:110,wis:110,spl:110,con:110,crt:110},learnedSkills:{},equipment:{},equipmentInstances:{},inventory:[],activeBuffs:{}};
vm.runInThisContext(fs.readFileSync(path.join(ROOT,'js/card_runtime.js'),'utf8'),{filename:'card_runtime.js'});
vm.runInThisContext(fs.readFileSync(path.join(ROOT,'js/effect_runtime.js'),'utf8'),{filename:'effect_runtime.js'});
CardRuntime.init();
const ignoreKeys=new Set(['id','name','sourceId','sourceType','runtimeError','dynamic','scriptMessages','visualEffects']);
function meaningful(out){for(const [k,v] of Object.entries(out||{})){if(ignoreKeys.has(k))continue;if(typeof v==='number'&&v!==0)return true;if(Array.isArray(v)&&v.length)return true;if(v&&typeof v==='object'&&Object.keys(v).length)return true;}return false;}
const baseKeys=['atk','matk','def','mdef','weaponLevel','armorLevel','range','slotCount','slots'];
const rows=[];let runtimeErrors=0,unhandled=0,scriptEmpty=0,baseOnly=0,scriptEffect=0,officialNoEffect=0;
const oldWarn=console.warn,oldError=console.error;console.warn=()=>{};console.error=()=>{};
for(const id of equipmentIds){
 const item=itemMap[String(id)];const script=String(item.scriptRaw||item.Script||item.script||'').trim();
 const record=CardRuntime.getRuntimeRecord(id,'equipment');
 const context={sourceType:'equipment',slot:item.equipSlot||item.slot||'body',hostRow:{slot:item.equipSlot||item.slot||'body',itemId:id,refine:10,grade:4,instance:{enchantGrade:4,cards:[],enchants:[]},item},equippedIds:[id],maxRefine:10,maxGrade:4};
 const out=record?CardRuntime._debugEvaluateRecord(record,context):null;
 const diagnostics={runtimeError:out?.runtimeError||null,rawBonuses:out?.rawBonuses||{}};
 if(diagnostics.runtimeError)runtimeErrors++;
 if(Object.keys(diagnostics.rawBonuses).length)unhandled++;
 const base={};for(const k of baseKeys){const v=item[k]??item[k[0].toUpperCase()+k.slice(1)];if(v!==undefined&&v!==null&&Number(v)!==0)base[k]=v;}
 const hasBase=Object.keys(base).some(k=>!['slotCount','slots'].includes(k));const hasScript=!!script;const hasEffect=meaningful(out);
 let classification='official-no-stat-effect';
 if(hasScript&&hasEffect){classification='script-effect-active';scriptEffect++;}
 else if(hasBase){classification=hasScript?'base-effect-active-script-empty':'base-effect-active';baseOnly++;if(hasScript&&!hasEffect)scriptEmpty++;}
 else {officialNoEffect++;if(hasScript&&!hasEffect)scriptEmpty++;}
 rows.push({id,name:item.name,boxes:boxSources[String(id)],slot:item.equipSlot||item.slot||item.locations||null,classification,hasOfficialScript:hasScript,base,scriptPreview:script.slice(0,240),runtimeRecord:!!record,dynamicRecord:!!record?.dynamic,runtimeError:diagnostics.runtimeError,unhandledBonuses:Object.keys(diagnostics.rawBonuses),emittedKeys:out?Object.keys(out).filter(k=>!ignoreKeys.has(k)&&((typeof out[k]==='number'&&out[k]!==0)||(Array.isArray(out[k])&&out[k].length)||(out[k]&&typeof out[k]==='object'&&Object.keys(out[k]).length))):[]});
}
console.warn=oldWarn;console.error=oldError;
const failures=rows.filter(r=>r.runtimeError||r.unhandledBonuses.length||(r.hasOfficialScript&&r.classification==='official-no-stat-effect'));
const report={version:'0.9.82HQ',summary:{uniqueEquipmentRewards:rows.length,scriptEffectActive:scriptEffect,baseEffectActive:baseOnly,officialNoStatEffect:officialNoEffect,scriptCompiledButNoEmittedEffect:scriptEmpty,runtimeErrors,unhandledBonusItems:unhandled,failures:failures.length},policy:'Every box equipment reward is evaluated through CardRuntime dynamic fallback at +10 / Grade A context. Base ATK/MATK/DEF/MDEF remains consumed by StatusSystem; official script effects must emit canonical runtime keys without errors or raw bonuses.',failures,rows};
fs.writeFileSync(path.join(ROOT,'BOX_EQUIPMENT_EFFECT_AUDIT_0.9.82HQ.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.summary,null,2));
if(failures.length){console.log('failure samples',JSON.stringify(failures.slice(0,20),null,2));}
process.exit(failures.length?1:0);
