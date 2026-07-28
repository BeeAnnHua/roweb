#!/usr/bin/env node
const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const read=rel=>JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'));
const cards=read('data/card_runtime/card_effects.json');
const equipment=read('data/card_runtime/equipment_effects.json');
const combos=read('data/card_runtime/card_combos.json');
const groups=read('data/card_runtime/item_groups.json');
const drops=read('data/card_runtime/card_drop_sources.json');
const jobs=read('data/jobs.json');
const itemIndex=read('data/items/item_index.json');
const checks=[];
const check=(ok,name,detail='')=>checks.push({ok:!!ok,name,detail:String(detail)});
const clone=value=>JSON.parse(JSON.stringify(value));

global.window=global;
global.document=undefined;
global.setInterval=()=>0;
global.CustomEvent=function(type,options={}){this.type=type;this.detail=options.detail;};
global.dispatchEvent=()=>true;
window.RO_WEB_DATA={
  'data/card_runtime/card_effects.json':cards,
  'data/card_runtime/equipment_effects.json':equipment,
  'data/card_runtime/card_combos.json':combos,
  'data/card_runtime/item_groups.json':groups,
  'data/card_runtime/card_drop_sources.json':drops,
  'data/jobs.json':jobs
};
const itemMap={...itemIndex};
for(const row of Object.values(cards))itemMap[String(row.id)]={...(itemMap[String(row.id)]||{}),...row};
for(const row of Object.values(equipment))itemMap[String(row.id)]={...(itemMap[String(row.id)]||{}),id:row.id,name:row.name,type:'equipment',scriptRaw:row.scriptRaw,compiledScript:row.compiledScript};
window.getItemData=id=>itemMap[String(id)]||null;
window.getEquipmentInstance=slot=>window.player?.equipmentInstances?.[slot]||null;
window.getSkillLevel=()=>10;
window.getCurrentJobData=()=>jobs[window.player?.jobKey]||{};
window.getTrainingBonusTotals=()=>({});
window.getPassiveSkillBonusTotals=()=>({});
window.getPassiveCombatModifierTotals=()=>({});
window.getActiveBuffBonusTotals=()=>({});
window.recalculatePlayerStats=()=>{};
window.updatePlayerUI=()=>{};
window.updateInventoryUI=()=>{};
window.updateEquipmentUI=()=>{};
window.saveGame=()=>{};
window.syncEquipmentGrantedSkills=()=>{};
window.addBattleLog=()=>{};
window.showDamageNumber=()=>{};
window.playMonsterHitAnimation=()=>{};
window.queueMonsterDefeatResolution=()=>{};
window.refreshWorldMonsterSpatialEntity=()=>{};
window.renderPositionSprites=()=>{};
window.updateMonsterUI=()=>{};
window.emitLootRewardLog=()=>{};
window.recordItemDrop=()=>{};
window.applyRate=value=>value;
window.addItem=(item,count=1)=>{
  const id=Number(item?.id??item); let row=player.inventory.find(x=>Number(x.id)===id&&!x.instanceId);
  if(!row){row={id,count:0,name:item?.name||getItemData(id)?.name||String(id)};player.inventory.push(row);} row.count+=Number(count)||1; return row;
};
window.skillsData={skillIndex:{'777':{id:777,officialId:777,key:'TEST_MAGIC',handler:'magic',targetType:'attack',dealsDamage:true}}};
window.castAttackSkill=()=>true;
window.getCombatGroundCandidates=()=>[];

function resetPlayer(overrides={}){
  window.player={
    baseLevel:275,jobLevel:60,job:'dragon_knight',jobKey:'dragon_knight',gender:'male',
    stats:{str:120,agi:120,vit:120,int:120,dex:120,luk:120},traitStats:{pow:110,sta:110,wis:110,spl:110,con:110,crt:110},
    learnedSkills:{},equipment:{},equipmentInstances:{},inventory:[],activeBuffs:{},
    hp:5000,maxHp:10000,sp:500,maxSp:1000,zeny:0,...overrides
  };
}
function equip(slot,item,cardsInSlots=[]){
  itemMap[String(item.id)]=item;player.equipment[slot]=item.id;
  player.equipmentInstances[slot]={id:item.id,instanceId:`fx-${item.id}-${slot}`,refine:Number(item.refine||0),cards:[...cardsInSlots,null,null,null].slice(0,4)};
  CardRuntime.invalidate();
}
function clearEquipment(){player.equipment={};player.equipmentInstances={};player.cardRuntimeTempBonuses={};CardRuntime.invalidate();}
function evalRecord(record,context={}){
  return CardRuntime._debugEvaluateRecord(record,{sourceType:record.sourceType||context.sourceType||'audit',hostRow:{itemId:record.id,refine:context.refine||0,item:{id:record.id,weaponLevel:4,weaponType:'sword'}},maxRefine:context.refine||0,equippedIds:context.equippedIds||[record.id,...(record.requiredItemIds||[])],...context});
}

resetPlayer();
vm.runInThisContext(fs.readFileSync(path.join(ROOT,'js/card_runtime.js'),'utf8'),{filename:'card_runtime.js'});
vm.runInThisContext(fs.readFileSync(path.join(ROOT,'js/effect_runtime.js'),'utf8'),{filename:'effect_runtime.js'});
vm.runInThisContext(fs.readFileSync(path.join(ROOT,'js/combat_formula_runtime.js'),'utf8'),{filename:'combat_formula_runtime.js'});
CardRuntime.init();

// 1. Static source vocabulary must exactly match the runtime's declared parser vocabulary.
const rawScripts=[...Object.values(cards),...Object.values(equipment),...combos].map(row=>String(row.scriptRaw||''));
const usedBonusTypes=new Set();
for(const script of rawScripts)for(const match of script.matchAll(/\bbonus\d*\s+(b[A-Za-z0-9_]+)/g))usedBonusTypes.add(match[1]);
const supported=new Set(CardRuntime.getSupportedBonusTypes());
const missingBonusTypes=[...usedBonusTypes].filter(x=>!supported.has(x)).sort();
const extraSupported=[...supported].filter(x=>!usedBonusTypes.has(x)).sort();
check(usedBonusTypes.size===142,'Static rAthena bonus vocabulary count',usedBonusTypes.size);
check(missingBonusTypes.length===0,'All used bonus types have parsers',JSON.stringify(missingBonusTypes));
check(extraSupported.length===0,'Declared vocabulary matches project data exactly',JSON.stringify(extraSupported));

// 2. Wide matrix: all cards/equipment/combos in four player profiles and four refine levels.
const profiles=[
  {baseLevel:1,jobLevel:1,job:'novice',jobKey:'novice',gender:'male',stats:{str:1,agi:1,vit:1,int:1,dex:1,luk:1},traitStats:{}},
  {baseLevel:99,jobLevel:50,job:'knight',jobKey:'knight',gender:'female',stats:{str:77,agi:77,vit:77,int:77,dex:77,luk:77},traitStats:{}},
  {baseLevel:200,jobLevel:60,job:'rune_knight',jobKey:'rune_knight',gender:'male',stats:{str:110,agi:100,vit:120,int:90,dex:110,luk:80},traitStats:{pow:20,sta:20,wis:20,spl:20,con:20,crt:20}},
  {baseLevel:275,jobLevel:60,job:'dragon_knight',jobKey:'dragon_knight',gender:'female',stats:{str:130,agi:130,vit:130,int:130,dex:130,luk:130},traitStats:{pow:110,sta:110,wis:110,spl:110,con:110,crt:110}}
];
const refines=[0,5,10,20],records=[...Object.values(cards),...Object.values(equipment),...combos];
let evaluations=0,runtimeErrors=[],rawBonuses={},emitted=new Set(),coverageMissing=new Set();
const originalWarn=console.warn;console.warn=()=>{};
for(const profile of profiles){
  Object.assign(player,clone(profile));
  for(const refine of refines){
    for(const record of records){
      const out=evalRecord(record,{refine,sourceType:record.requiredItemIds?'combo':(cards[String(record.id)]?'card':'equipment'),equippedIds:[record.id,...(record.requiredItemIds||[])]});
      evaluations++;
      if(out.runtimeError)runtimeErrors.push({id:record.id,error:out.runtimeError});
      for(const [key,rows] of Object.entries(out.rawBonuses||{}))rawBonuses[key]=(rawBonuses[key]||0)+(Array.isArray(rows)?rows.length:1);
      const audit=EffectRuntime.auditCanonicalSource(out);audit.emitted.forEach(key=>emitted.add(key));audit.missing.forEach(key=>coverageMissing.add(key));
    }
  }
}
console.warn=originalWarn;
check(evaluations===29360,'Full effect matrix evaluation count',evaluations);
check(runtimeErrors.length===0,'Full effect matrix runtime errors',runtimeErrors.length);
check(Object.keys(rawBonuses).length===0,'Full effect matrix unhandled bonuses',JSON.stringify(rawBonuses));
check(coverageMissing.size===0,'Every emitted canonical key has a named consumer',JSON.stringify([...coverageMissing]));

// 3. Robust compiler: local variables, nested scripts, BF expressions and immediate commands.
resetPlayer({hp:100,maxHp:1000,sp:10,maxSp:100});
const complexRaw='/* nested compiler */ .@x=5; bonus bDex,.@x; bonus bMaxHPrate,10; autobonus "{ bonus bAgi,5; heal 10,2; }",10000,3000,BF_WEAPON|BF_NORMAL,"{ sc_start SC_SPEEDUP1,3000,50; }";';
const compiled=CardRuntime.compileRawScript(complexRaw);
const complexOut=CardRuntime._debugEvaluateRecord({id:990770,name:'Compiler Probe',compiledScript:compiled},{sourceType:'equipment',hostRow:{itemId:990770,refine:0,item:{}},equippedIds:[990770]});
const bf=CardRuntime.getBattleFlags();
check(!complexOut.runtimeError,'Complex raw script compiles without error',complexOut.runtimeError||'PASS');
check(complexOut.dexFlat===5&&complexOut.maxHpRate===10,'Complex raw script scalar effects',JSON.stringify(complexOut));
check(complexOut.autoBonuses?.[0]?.attackFlags===(bf.BF_WEAPON|bf.BF_NORMAL),'BF bitmask remains numeric',complexOut.autoBonuses?.[0]?.attackFlags);

// 4. Future item fallback: no generated equipment record required when scriptRaw is present.
resetPlayer();
const futureItem={id:990777,name:'Future Script Item',type:'equipment',equipSlot:'body',slot:'body',slotCount:1,scriptRaw:'bonus bDex,7; bonus bMaxHPrate,11;'};
equip('body',futureItem,[]);
let futureSource=CardRuntime.getSources().find(x=>Number(x.sourceId)===futureItem.id&&x.sourceType==='equipment');
check(futureSource?.dexFlat===7&&futureSource?.maxHpRate===11,'Future item scriptRaw fallback enters CardRuntime',JSON.stringify(futureSource));
check(EffectRuntime.collectScalar('dexFlat',[],player,{includePassive:false,includeActive:false})===7,'Future item reaches unified EffectRuntime consumer',EffectRuntime.collectScalar('dexFlat',[],player,{includePassive:false,includeActive:false}));

// 5. Autobonus immediate and persistent effects really execute.
resetPlayer({hp:50,maxHp:100,sp:5,maxSp:20});
const procItem={id:990778,name:'Proc Item',type:'equipment',equipSlot:'weapon',slot:'weapon',slotCount:0,weaponType:'sword',scriptRaw:'autobonus "{ bonus bAgi,5; heal 10,2; }",10000,3000,BF_WEAPON|BF_NORMAL,"{ sc_start SC_SPEEDUP1,3000,50; }";'};
equip('weapon',procItem,[]);
const appliedStatuses=[];window.StatusManager={apply:(unit,status,opt)=>{appliedStatuses.push({unit,status,opt});return{applied:true};}};
const oldRandom=Math.random;Math.random=()=>0;
let procCount=CardRuntime.onNormalAttack({id:1,hp:100,currentHp:100},10,{damageType:'physical',rangeType:'short'});
Math.random=oldRandom;
check(procCount>=1,'Autobonus triggers on matching normal weapon attack',procCount);
check(player.hp===60&&player.sp===7,'Autobonus immediate heal reaches player',`${player.hp}/${player.sp}`);
check(appliedStatuses.some(x=>x.status==='SPEEDUP1'),'Autobonus otherScript status executes',JSON.stringify(appliedStatuses));
check(CardRuntime.getMergedSource().agiFlat===5,'Autobonus persistent bonus enters merged source',CardRuntime.getMergedSource().agiFlat);

// 6. BF filter: magic-only attack proc must not fire from normal attacks, but must fire from damaging magic skills.
resetPlayer();
const magicProcItem={id:990779,name:'Magic Proc Item',type:'equipment',equipSlot:'weapon',slot:'weapon',weaponType:'staff',scriptRaw:'autobonus "{ bonus bDex,9; }",10000,3000,BF_MAGIC|BF_SKILL;'};
equip('weapon',magicProcItem,[]);Math.random=()=>0;
CardRuntime.onNormalAttack({id:2,hp:100,currentHp:100},10,{damageType:'physical'});
check(!player.cardRuntimeTempBonuses||Object.keys(player.cardRuntimeTempBonuses).length===0,'Magic-only proc rejected on normal weapon attack',JSON.stringify(player.cardRuntimeTempBonuses||{}));
CardRuntime.onSkillUsed({id:777,officialId:777,key:'TEST_MAGIC',handler:'magic',damageType:'magic',targetType:'attack',dealsDamage:true,rangeCells:5},{id:2,hp:100,currentHp:100});
Math.random=oldRandom;
check(CardRuntime.getMergedSource().dexFlat===9,'Magic-only proc triggers on damaging magic skill',CardRuntime.getMergedSource().dexFlat);

// 7. ATF target/type/range semantics and explicit self+target when hit.
resetPlayer();
const statusItem={id:990780,name:'ATF Status Item',type:'equipment',equipSlot:'body',slot:'body',scriptRaw:'bonus3 bAddEff,Eff_Silence,10000,ATF_MAGIC; bonus3 bAddEffWhenHit,Eff_Poison,10000,ATF_TARGET|ATF_SELF;'};
equip('body',statusItem,[]);const statusEvents=[];window.StatusManager={apply:(unit,status,opt)=>{statusEvents.push({unit,status,opt});return{applied:true};}};Math.random=()=>0;
const enemy={id:10,hp:100,currentHp:100},attacker={id:11,hp:100,currentHp:100};
CardRuntime.onNormalAttack(enemy,10,{damageType:'physical'});
check(!statusEvents.some(x=>x.status==='Silence'),'ATF_MAGIC does not proc on physical normal attack',JSON.stringify(statusEvents));
CardRuntime.onSkillUsed({id:777,officialId:777,key:'TEST_MAGIC',handler:'magic',damageType:'magic',targetType:'attack',dealsDamage:true},enemy);
check(statusEvents.some(x=>x.status==='Silence'&&x.unit===enemy),'ATF_MAGIC applies status to skill target',JSON.stringify(statusEvents.map(x=>x.status)));
CardRuntime.onPlayerDamaged(attacker,10,{damageType:'physical',rangeType:'short'});Math.random=oldRandom;
check(statusEvents.filter(x=>x.status==='Poison').some(x=>x.unit===attacker)&&statusEvents.filter(x=>x.status==='Poison').some(x=>x.unit===player),'ATF_TARGET|ATF_SELF applies to attacker and wearer',statusEvents.filter(x=>x.status==='Poison').length);

// 8. Targeted real data and real consumers.
function equipCard(cardId,slot='body',itemExtra={}){
  clearEquipment();const host={id:991000+Number(cardId),name:`Host ${cardId}`,type:'equipment',equipSlot:slot,slot,slotCount:4,weaponType:'dagger',...itemExtra};equip(slot,host,[Number(cardId)]);return CardRuntime.getSources().find(x=>Number(x.sourceId)===Number(cardId));
}
resetPlayer({maxHp:10000});
let source=equipCard(4392,'body');check(Math.floor(source.dexFlat)===6,'Observation Card conditional DEX parses in live source',source.dexFlat);
source=equipCard(4036,'accessory1');check(source.hpRecoveryRate===10&&EffectRuntime.collectScalar('hpRecoveryRate',[],player,{includePassive:false,includeActive:false})===10,'Muka HP recovery reaches unified source',JSON.stringify(source));
source=equipCard(4128,'shield');check(EffectRuntime.hasFlag('magicImmune',player)&&CombatFormulaRuntime.applyDamage(100,{source:{},target:player,damageType:'magic',applyDefense:false,applyElement:false})===0,'Golden Thief Bug magic immunity consumed by combat formula','PASS');
source=equipCard(4137,'weapon',{weaponType:'dagger'});const large={id:20,race:'Formless',size:'Large',element:'Neutral',elementLevel:1};check(EffectRuntime.hasFlag('ignoreWeaponSizePenalty',player)&&CombatFormulaRuntime.applyDamage(100,{source:player,target:large,damageType:'physical',weaponType:'dagger',applyDefense:false,applyElement:false})===100,'Drake removes weapon size penalty in formula','PASS');
source=equipCard(4610,'body');const capped=EffectRuntime.applyIncomingDamageCap(9000,player);check(capped.damage===4000&&capped.rate===40,'Sarah incoming damage MaxHP cap consumer',JSON.stringify(capped));
source=equipCard(4421,'weapon');check(EffectRuntime.collectScalar('longRangeCriticalChanceFlat',[],player,{includePassive:false,includeActive:false})===15,'Drosera long-range critical consumer source',source.longRangeCriticalChanceFlat);
source=equipCard(4144,'accessory1');check(EffectRuntime.hasFlag('restartFullRecover',player),'Osiris restart full recovery policy reaches runtime',JSON.stringify(source));
source=equipCard(4399,'weapon');check(source.spOnAttackFlat===-1&&source.defRatioAttackClass?.All===1,'Thanatos SP drain and DEF-ratio effects parse',JSON.stringify(source));
source=equipCard(300151,'weapon');check(source.perfectHitRate===5&&source.longDamageRate===25,'Deep Sea Kraken perfect hit and ranged damage parse',JSON.stringify(source));

// Baphomet splash hook actually damages nearby targets.
source=equipCard(4147,'weapon');const primary={id:30,currentHp:100,position:{x:0,y:0}},near={id:31,currentHp:100,position:{x:20,y:0}},far={id:32,currentHp:100,position:{x:200,y:0}};window.getCombatGroundCandidates=()=>[primary,near,far];
CardRuntime.onNormalAttack(primary,25,{damageType:'physical',rangeType:'short'});
check(near.currentHp===75&&far.currentHp===100,'Baphomet splash consumer damages only nearby target',`${near.currentHp}/${far.currentHp}`);

// Blue Mouse Zeny kill hook.
source=equipCard(4296,'headTop');player.zeny=0;Math.random=()=>0;CardRuntime.onMonsterDefeated({id:40,race:'Formless'});Math.random=oldRandom;
check(player.zeny===1,'Cramp card Zeny-on-kill hook executes',player.zeny);

// Race-conditioned extra drop: no reward for non-Insect, reward for Insect.
itemMap['12028']={id:12028,name:'打雷的箱子',type:'consume'};source=equipCard(4149,'accessory1');player.inventory=[];Math.random=()=>0;
const none=CardRuntime.rollExtraDrops({id:50,race:'Demon'}),yes=CardRuntime.rollExtraDrops({id:51,race:'Insect'});Math.random=oldRandom;
check(none.length===0&&yes.some(x=>x.itemId===12028),'Race-conditioned extra item drop hook executes',`${none.length}/${JSON.stringify(yes)}`);

// 9. Unified recovery, skill-cost, timing, visibility and periodic consumers.
resetPlayer({hp:100,maxHp:1000,sp:20,maxSp:200});
const recoveryItem={id:990781,name:'Recovery Integration Item',type:'equipment',equipSlot:'body',slot:'body',scriptRaw:'bonus bHPrecovRate,20; bonus bSPrecovRate,30; bonus2 bAddItemHealRate,501,50; bonus2 bAddItemSPHealRate,502,40; bonus2 bHPRegenRate,10,1000; bonus2 bSPRegenRate,5,1000; bonus bIntravision,1; bonus bNoWalkDelay,1;'};
equip('body',recoveryItem,[]);
check(EffectRuntime.collectScalar('hpRecoveryRate',[],player,{includePassive:false,includeActive:false})===20&&EffectRuntime.collectScalar('spRecoveryRate',[],player,{includePassive:false,includeActive:false})===30,'Natural HP/SP recovery rates reach EffectRuntime','20/30');
check(CardRuntime.getItemRecoveryRate({id:501},'hp')===50&&CardRuntime.getItemRecoveryRate({id:502},'sp')===40,'Specified HP/SP item recovery reaches item consumer',`${CardRuntime.getItemRecoveryRate({id:501},'hp')}/${CardRuntime.getItemRecoveryRate({id:502},'sp')}`);
let revealed=0;window.revealHiddenMonstersAroundPlayer=()=>{revealed++;return 1;};
CardRuntime.tickPeriodicEffects(2000000000000);
check(player.hp===110&&player.sp===25,'Periodic HP/SP effects modify live player resources',`${player.hp}/${player.sp}`);
check(revealed===1,'Intravision calls live hidden-monster reveal hook',revealed);
check(EffectRuntime.hasFlag('noWalkDelay',player),'No-walk-delay policy reaches shared Runtime','PASS');

resetPlayer();
const skillItem={id:990782,name:'Skill Integration Item',type:'equipment',equipSlot:'weapon',slot:'weapon',weaponType:'staff',scriptRaw:'bonus2 bSkillAtk,777,25; bonus2 bSkillUseSP,777,-5; bonus2 bSkillUseSPrate,777,-20; bonus bUseSPrate,10; bonus bReduceDamageReturn,35;'};
equip('weapon',skillItem,[]);
const skillProbe={id:777,officialId:777,key:'TEST_MAGIC'};
const costProbe=CardRuntime.getSkillSpCostModifier(skillProbe);
check(CardRuntime.getSkillDamageRate(skillProbe)===25,'Per-skill damage modifier reaches skill consumer',CardRuntime.getSkillDamageRate(skillProbe));
check(costProbe.flat===-5&&costProbe.rate===-10,'Per-skill/global SP cost modifiers merge correctly',JSON.stringify(costProbe));
check(EffectRuntime.applyReflectionReduction(100,player).damage===65,'Reflection damage reduction reaches incoming reflection consumer',JSON.stringify(EffectRuntime.applyReflectionReduction(100,player)));

// Every coverage domain declared by the registry must be represented by a live integration contract.
const coverageDomains=new Set(Object.values(EffectRuntime.getCoverageManifest()));
const requiredDomains=['status','natural_recovery','combat','critical','hit','defense','skill_damage','skill_timing','skill_cost','healing','item_recovery','periodic','attack_hook','status_hook','kill_hook','reward','movement','visibility','visual_transform'];
check(requiredDomains.every(domain=>coverageDomains.has(domain)),'Coverage registry spans all Runtime consumer domains',JSON.stringify([...coverageDomains].sort()));

// 10. Explicit source audit and fail-loud future command diagnostic.
const liveAudit=EffectRuntime.auditSources(CardRuntime.getSources());check(liveAudit.ok,'Live unified sources pass coverage audit',JSON.stringify(liveAudit));
resetPlayer();CardRuntime.clearDiagnostics();const unsupported={id:990799,name:'Unknown Command Probe',type:'equipment',equipSlot:'body',slot:'body',scriptRaw:'bonus bFutureUnknownBonus,1;'};equip('body',unsupported,[]);
const oldError=console.error;console.error=()=>{};CardRuntime.getSources();console.error=oldError;
const diagnostic=CardRuntime.getDiagnostics();
check(diagnostic.unhandledBonuses.bFutureUnknownBonus===1,'Unknown future bonus fails loudly instead of silently disappearing',JSON.stringify(diagnostic));
clearEquipment();CardRuntime.clearDiagnostics();

const report={
  version:'0.9.82FX',
  counts:{cards:Object.keys(cards).length,equipmentScripts:Object.keys(equipment).length,combos:combos.length,dropSources:Object.values(drops).reduce((sum,rows)=>sum+(rows?.length||0),0),bonusVocabulary:usedBonusTypes.size,matrixEvaluations:evaluations,canonicalKeys:emitted.size,coverageRegistryKeys:Object.keys(EffectRuntime.getCoverageManifest()).length},
  matrix:{runtimeErrors:runtimeErrors.length,rawBonuses,coverageMissing:[...coverageMissing].sort(),emitted:[...emitted].sort()},
  summary:{checks:checks.length,passed:checks.filter(x=>x.ok).length,failed:checks.filter(x=>!x.ok).length},
  checks
};
fs.writeFileSync(path.join(ROOT,'tools/test_effect_runtime_report_0.9.82FX.json'),JSON.stringify(report,null,2)+'\n');
process.stdout.write(JSON.stringify(report,null,2)+'\n');
process.exit(report.summary.failed?1:0);
