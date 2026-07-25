const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
function assert(v,m){if(!v)throw new Error(m)}
function approx(actual,expected,tol,m){if(Math.abs(actual-expected)>tol)throw new Error(`${m}: ${actual} != ${expected}`)}
const itemDb={
  1:{id:1,slot:'weapon',category:'weapon',atk:100,weaponLevel:0,weaponType:'sword'},
  2:{id:2,variableCastReductionRate:10,fixedCastReductionRate:30,afterCastDelayReductionRate:10,cooldownReductionRate:20,cooldownReductionMs:100,bossDamageRate:20,criticalDamageRate:20,healPowerRate:20},
};
let active={};let passive={};
const ctx={console,Math:Object.create(Math),Date,JSON,Number,String,Object,Array,Set,Map,Promise,performance:{now:()=>Date.now()},window:{},document:undefined,
 player:{baseLevel:100,stats:{str:80,agi:1,vit:1,int:100,dex:100,luk:10},traitStats:{crt:30},equipment:{weapon:1,accessory1:2},activeBuffs:{},skillTimingState:{},sp:99999,hp:99999,maxHp:99999},
 skillsData:{runtimeProfiles:{},skillIndex:{}},currentMonster:null,
 getItemData:id=>itemDb[id]||null,getSkillLevel:()=>10,getActiveBuffBonusTotals:()=>active,getPassiveSkillBonusTotals:()=>passive,getPassiveCombatModifierTotals:()=>({}),getTrainingBonusTotals:()=>({}),getMonsterRuntimeBonuses:()=>({}),getPassiveTargetDamageBonus:()=>0,
 recalculatePlayerStats:()=>{},addBattleLog:()=>{},saveGame:()=>{},updatePlayerUI:()=>{},setInterval:()=>1,clearInterval:()=>{},setTimeout:()=>1,clearTimeout:()=>{},loadJson:async()=>({attributeLevels:{'1':{}},weaponSizeModifiers:{},weaponTypeToRa:{},elements:['Neutral','Water','Earth','Fire','Wind','Poison','Holy','Dark','Ghost','Undead'],races:['Formless','Undead','Brute','Plant','Insect','Fish','Demon','DemiHuman','Angel','Dragon','Player','Boss','NonBoss']})};
ctx.window=ctx;
ctx.calculateDerivedPlayerStats=()=>({stats:ctx.player.stats,atk:220,matk:150,cri:100,crate:Number(ctx.player.traitStats.crt||0)/3,hPlus:30,aspd:ctx.player.aspd||150,res:0,mres:0});
vm.createContext(ctx);
for(const rel of ['js/battle.js','js/skill_engine.js','js/combat_mechanics_runtime.js','js/combat_formula_runtime.js','js/ra_renewal_damage_pipeline.js','js/combat_damage_pipeline.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,rel),'utf8'),ctx,{filename:rel});
ctx.getActiveBuffBonusTotals=()=>active;ctx.getPassiveSkillBonusTotals=()=>passive;ctx.getPassiveCombatModifierTotals=()=>passive;

// Renewal ASPD / action lock.
ctx.player.aspd=150;assert(ctx.getPlayerAttackDelayMs()===1000,'150 ASPD normal interval');assert(ctx.getPlayerSkillActionLockMs()===570,'150 ASPD skill action lock');
ctx.player.aspd=190;assert(ctx.getPlayerAttackDelayMs()===200,'190 ASPD normal interval');assert(ctx.getPlayerSkillActionLockMs()===170,'190 ASPD skill action lock');
ctx.player.aspd=193;assert(ctx.getPlayerAttackDelayMs()===140,'193 ASPD normal interval');assert(ctx.getPlayerSkillActionLockMs()===140,'193 ASPD skill action lock');

// rAthena min_skill_delay_limit applies to every instant active skill, while
// zero-delay physical skills use the longer ASPD-derived cast-begin lock.
const instantMagic={id:900010,officialId:900010,type:'magic'};
const instantPhysical={id:900011,officialId:900011,type:'weapon'};
ctx.skillsData.runtimeProfiles['900010']={handler:'magic_damage'};
ctx.skillsData.runtimeProfiles['900011']={handler:'physical_attack'};
ctx.player.skillTimingState={};
let actionStart=Date.now();ctx.commitRuntimeSkillTiming(instantMagic,1);
let actionDelta=ctx.player.skillTimingState.actionLockUntil-actionStart;
assert(actionDelta>=95&&actionDelta<=120,'instant magic has 100ms generic action lock');
let actionBlock=ctx.getRuntimeSkillDelayBlock(instantPhysical,1);
assert(actionBlock&&actionBlock.type==='action_lock','generic action lock blocks every active skill');
ctx.player.skillTimingState={};ctx.player.aspd=193;actionStart=Date.now();ctx.commitRuntimeSkillTiming(instantPhysical,1);
actionDelta=ctx.player.skillTimingState.actionLockUntil-actionStart;
assert(actionDelta>=135&&actionDelta<=160,'193 ASPD physical skill has 140ms action lock');
actionBlock=ctx.getRuntimeSkillDelayBlock(instantMagic,1);
assert(actionBlock&&actionBlock.type==='aspd','physical ASPD lock remains globally authoritative');

const synthetic={id:900001,officialId:900001,type:'magic',castTime:1000,fixedCastTime:500,afterCastActDelay:1000,afterCastWalkDelay:500,cooldown:2000};
// No modifiers: DEX*2+INT=300.
ctx.player.equipment={weapon:1};active={};
let t=ctx.getRuntimeSkillTimingProfile(synthetic,1);approx(t.cast.statFactor,1-Math.sqrt(300/530),1e-9,'DEX/INT factor');assert(t.cast.variableMs===247,'variable cast stat result');assert(t.cast.fixedMs===500,'fixed cast unaffected by stats');assert(t.afterCastWalkDelayMs===800,'default 300ms + DB walk delay');
// Stat zero-cast threshold.
ctx.player.stats.dex=200;ctx.player.stats.int=130;t=ctx.getRuntimeSkillTimingProfile(synthetic,1);assert(t.cast.variableMs===0&&t.cast.fixedMs===500,'530 stat threshold only removes variable cast');
// Strongest fixed reduction, additive variable/after delay rates.
ctx.player.stats.dex=0;ctx.player.stats.int=0;ctx.player.equipment={weapon:1,accessory1:2};active={variableCastReductionRate:20,fixedCastReductionRate:50,afterCastDelayReductionRate:20,walkDelayReductionRate:20};
t=ctx.getRuntimeSkillTimingProfile(synthetic,1);assert(t.cast.variableMs===700,'item+status variable cast additive rate');assert(t.cast.fixedMs===250,'fixed cast strongest rate only');assert(t.afterCastActDelayMs===700,'after-cast item+status reduction');assert(t.cooldownMs===1520,'cooldown percent/ms extension');assert(t.afterCastWalkDelayMs===640,'walk delay reduction');
// Flags.
let flagged={...synthetic,castTimeFlags:{IgnoreItemBonus:true},castDelayFlags:{IgnoreStatus:true}};
t=ctx.getRuntimeSkillTimingProfile(flagged,1);assert(t.cast.variableMs===800&&t.cast.fixedMs===250,'IgnoreItemBonus cast flag');assert(t.afterCastActDelayMs===900,'IgnoreStatus delay flag');
flagged={...synthetic,castTimeFlags:{IgnoreDex:true}};ctx.player.stats.dex=200;ctx.player.stats.int=130;active={};ctx.player.equipment={weapon:1};t=ctx.getRuntimeSkillTimingProfile(flagged,1);assert(t.cast.variableMs===1000,'IgnoreDex flag');


// Renewal H.Plus and future equipment/card healing modifiers share one resolver.
ctx.player.equipment={weapon:1,accessory1:2};active={healingReceivedRate:10};
const healed=ctx.applyRuntimeHealingModifiers(1000,{source:ctx.player,target:ctx.player,includeAssumptio:false});
assert(healed===1600,'H.Plus + equipment heal power + received-heal modifier');
active={};

// Exact Renewal RES/MRES 80% asymptotic formula.
const noDef={def:0,mdef:0,res:100,mres:100,stats:{luk:0}};
assert(ctx.DefenseResolver.physical(1000,noDef,{hardDef:0,softDef:0,res:100})===840,'RES formula');
assert(ctx.DefenseResolver.magic(1000,noDef,{hardMdef:0,softMdef:0,mres:100})===840,'MRES formula');

// Renewal critical: bCritAtkRate pre-defense + 1.4 + CRATE final stage.
ctx.player.stats={str:80,agi:1,vit:1,int:1,dex:40,luk:10};ctx.player.traitStats.crt=30;ctx.player.equipment={weapon:1,accessory1:2};active={};passive={};
const target={race:'Brute',size:'Medium',element:'Neutral',elementLevel:1,def:0,mdef:0,res:0,mres:0,stats:{luk:0}};
ctx.Math.random=()=>0.5;
const normalNon=ctx.RARenewalDamagePipeline.resolveNormalAttack(target,{criticalResult:{critical:false}});
const normalCrit=ctx.RARenewalDamagePipeline.resolveNormalAttack(target,{criticalResult:{critical:true}});
approx(normalCrit.damage/normalNon.damage,1.8,0.02,'normal critical ratio = 1.2 * 1.5');
const skillNon=ctx.RARenewalDamagePipeline.resolvePhysicalSkill({ratio:100,criticalMode:'normal'},1,target,{criticalResult:{critical:false}});
const skillCrit=ctx.RARenewalDamagePipeline.resolvePhysicalSkill({ratio:100,criticalMode:'normal'},1,target,{criticalResult:{critical:true}});
approx(skillCrit.damage/skillNon.damage,1.65,0.02,'skill critical ratio = 1.1 * 1.5');
// Target critical damage reduction is after final critical multiplier.
target.criticalDefenseRate=20;const critReduced=ctx.RARenewalDamagePipeline.resolveNormalAttack(target,{criticalResult:{critical:true}});approx(critReduced.damage/normalNon.damage,1.44,0.02,'critical defense rate');delete target.criticalDefenseRate;
// Boss modifier from equipment/card-compatible common layer.
const boss={...target,isBoss:true};const bossDamage=ctx.applyROCombatDamageModifiers(1000,{damageType:'physical',target:boss,source:ctx.player,element:'Neutral',applyWeaponSize:false,applyDefense:false});assert(bossDamage===1200,'boss damage equipment modifier');

console.log('PASS 0.9.82DX Renewal timing/combat tests');
console.log(JSON.stringify({aspd:{a150:1000,a190:200,a193:140,skill150:570,skill193:140},cast:t.cast,res:840,normalRatio:normalCrit.damage/normalNon.damage,skillRatio:skillCrit.damage/skillNon.damage,bossDamage,healing:healed},null,2));
