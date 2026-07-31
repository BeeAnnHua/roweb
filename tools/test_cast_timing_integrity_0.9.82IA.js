#!/usr/bin/env node
const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const checks=[];
function check(ok,name,detail=''){checks.push({ok:!!ok,name,detail:String(detail)});if(!ok)console.error('FAIL',name,detail);}
function eq(actual,expected,name){check(actual===expected,name,`${actual} !== ${expected}`);}
function approx(actual,expected,tol,name){check(Math.abs(actual-expected)<=tol,name,`${actual} != ${expected}`);}

const itemDb={
  1:{id:1,slot:'weapon',category:'weapon',weaponType:'sword'},
  2:{id:2,fixedCastReductionRate:30,skillFixedCastReductionRate:{'900001':20}},
  3:{id:3,fixedCastReductionRate:30,skillFixedCastReductionRate:{'900001':50}},
  4:{id:4,skillVariableCastReductionRate:{'900001':20}},
  5:{id:5,fixedCastReductionMs:100,skillFixedCastReductionMs:{'900001':100}},
  6:{id:6,skillFixedCastReductionRate:{'900001':20}},
  7:{id:7,skillFixedCastReductionRate:{'900001':30}},
  8:{id:8,fixedCastReductionRate:-20},
};
let active={},passive={};
const ctx={
  console,Math:Object.create(Math),Date,JSON,Number,String,Object,Array,Set,Map,Promise,
  performance:{now:()=>Date.now()},window:{},document:undefined,
  player:{baseLevel:200,stats:{str:1,agi:1,vit:1,int:100,dex:100,luk:1},equipment:{weapon:1},activeBuffs:{},skillTimingState:{},aspd:193,sp:99999,hp:99999,maxHp:99999,zeny:99999},
  skillsData:{runtimeProfiles:{},skillIndex:{}},
  getItemData:id=>itemDb[id]||null,getSkillLevel:()=>10,
  getActiveBuffBonusTotals:()=>active,getPassiveSkillBonusTotals:()=>passive,
  getPassiveCombatModifierTotals:()=>({}),getTrainingBonusTotals:()=>({}),
  calculateDerivedPlayerStats:()=>({stats:{...ctx.player.stats},aspd:ctx.player.aspd||193}),
  addBattleLog:()=>{},saveGame:()=>{},updatePlayerUI:()=>{},recalculatePlayerStats:()=>{},
  setInterval:()=>1,clearInterval:()=>{},setTimeout:()=>1,clearTimeout:()=>{},
  RO_WEB_DATA:{},CustomEvent:function(){},dispatchEvent:()=>true
};
ctx.window=ctx;
vm.createContext(ctx);
for(const rel of ['js/battle.js','js/skill_engine.js','js/card_runtime.js']){
  vm.runInContext(fs.readFileSync(path.join(ROOT,rel),'utf8'),ctx,{filename:rel});
}
ctx.getActiveBuffBonusTotals=()=>active;
ctx.getPassiveSkillBonusTotals=()=>passive;

const synthetic={id:900001,officialId:900001,key:'TEST_CAST_A',type:'magic',castTime:1000,fixedCastTime:500,afterCastActDelay:1000,afterCastWalkDelay:500,cooldown:2000};
const other={id:900002,officialId:900002,key:'TEST_CAST_B',type:'magic',castTime:1000,fixedCastTime:500};
ctx.skillsData.skillIndex['900001']=synthetic;ctx.skillsData.skillIndex['900002']=other;
ctx.skillsData.runtimeProfiles['900001']={handler:'magic_damage'};
ctx.skillsData.runtimeProfiles['900002']={handler:'magic_damage'};

// Renewal variable cast formula: DEX*2 + INT, scale 530.
ctx.player.stats={str:1,agi:1,vit:1,int:100,dex:100,luk:1};ctx.player.equipment={weapon:1};active={};passive={};
let timing=ctx.getRuntimeSkillTimingProfile(synthetic,1);
approx(timing.cast.statFactor,1-Math.sqrt(300/530),1e-12,'Renewal stat factor uses DEX*2+INT');
eq(timing.cast.variableMs,247,'300/530 variable cast result');
eq(timing.cast.fixedMs,500,'Stats do not reduce fixed cast');
ctx.player.stats.int=130;ctx.player.stats.dex=200;timing=ctx.getRuntimeSkillTimingProfile(synthetic,1);
eq(timing.cast.variableMs,0,'DEX*2+INT=530 reaches zero variable cast');
eq(timing.cast.fixedMs,500,'530 threshold leaves fixed cast intact');
ctx.player.stats.int=530;ctx.player.stats.dex=0;timing=ctx.getRuntimeSkillTimingProfile(synthetic,1);
eq(timing.cast.variableMs,0,'INT 530 also reaches variable zero cast');

// Fixed-cast percentage: strongest source only, never global + skill-specific stacking.
ctx.player.stats.int=0;ctx.player.stats.dex=0;ctx.player.equipment={weapon:1,accessory1:2};timing=ctx.getRuntimeSkillTimingProfile(synthetic,1);
eq(timing.cast.fixedReductionRate,30,'Global 30 and skill 20 choose strongest 30');
eq(timing.cast.fixedMs,350,'Strongest fixed rate gives 350ms');
ctx.player.equipment={weapon:1,accessory1:3};timing=ctx.getRuntimeSkillTimingProfile(synthetic,1);
eq(timing.cast.fixedReductionRate,50,'Skill-specific 50 beats global 30');
eq(timing.cast.fixedMs,250,'Skill-specific strongest fixed rate gives 250ms');
ctx.player.equipment={weapon:1,accessory1:6,accessory2:7};timing=ctx.getRuntimeSkillTimingProfile(synthetic,1);
eq(timing.cast.fixedReductionRate,50,'Two targeted fixed-cast item rates accumulate for the same skill');
eq(timing.cast.fixedMs,250,'Accumulated targeted candidate reduces fixed cast by 50%');
ctx.player.equipment={weapon:1,accessory1:8};timing=ctx.getRuntimeSkillTimingProfile(synthetic,1);
eq(timing.cast.fixedReductionRate,0,'Positive item bFixedCastrate does not become a fixed-cast penalty');
eq(timing.cast.fixedMs,500,'Ignored item non-reduction leaves fixed cast unchanged');
ctx.player.equipment={weapon:1,accessory1:3};active={fixedCastReductionRate:60};timing=ctx.getRuntimeSkillTimingProfile(synthetic,1);
eq(timing.cast.fixedReductionRate,60,'Status 60 beats item 50');
eq(timing.cast.fixedMs,200,'Strongest fixed source across groups');
active={fixedCastReductionRate:-50};ctx.player.equipment={weapon:1,accessory1:2};timing=ctx.getRuntimeSkillTimingProfile(synthetic,1);
eq(timing.cast.fixedReductionRate,-20,'Fixed-cast penalty combines with strongest reduction');
eq(timing.cast.fixedMs,600,'Fixed-cast penalty can lengthen fixed cast');
active={};ctx.player.equipment={weapon:1,accessory1:5};timing=ctx.getRuntimeSkillTimingProfile(synthetic,1);
eq(timing.cast.fixedMs,300,'Generic and skill-specific flat fixed reductions stack');

// Skill-specific variable cast rate must not leak to other skills.
ctx.player.equipment={weapon:1,accessory1:4};timing=ctx.getRuntimeSkillTimingProfile(synthetic,1);
eq(timing.cast.variableMs,800,'Target skill receives 20% variable cast reduction');
let otherTiming=ctx.getRuntimeSkillTimingProfile(other,1);
eq(otherTiming.cast.variableMs,1000,'Other skill does not receive target-specific variable cast reduction');

// Card script parser: skill-specific variable cast and bSkillDelay stay keyed.
const compiled=ctx.CardRuntime.compileRawScript('bonus2 bVariableCastrate,900001,-20; bonus2 bSkillDelay,900001,-300;');
const parsed=ctx.CardRuntime._debugEvaluateRecord({id:990001,name:'Timing Parser Probe',compiledScript:compiled},{sourceType:'equipment',hostRow:{itemId:990001,refine:0,item:{}},equippedIds:[990001]});
eq(Number(parsed.skillVariableCastReductionRate?.['900001']||0),20,'bonus2 bVariableCastrate is skill-specific');
eq(Number(parsed.variableCastReductionRate||0),0,'Skill variable cast does not become global');
eq(Number(parsed.skillAfterCastDelayReductionMs?.['900001']||0),300,'bonus2 bSkillDelay maps to targeted after-cast reduction');
check(ctx.CardRuntime.getSupportedBonusTypes().includes('bSkillDelay'),'bSkillDelay declared supported');

// rAthena combo delay special: max(0, (DB delay or 1000) - 4*AGI - 2*DEX).
ctx.player.stats={str:1,agi:100,vit:1,int:1,dex:100,luk:1};ctx.player.equipment={weapon:1};active={};
const chain={id:272,officialId:272,key:'MO_CHAINCOMBO',type:'weapon'};ctx.skillsData.runtimeProfiles['272']={handler:'physical_attack'};
timing=ctx.getRuntimeSkillTimingProfile(chain,5);
eq(timing.databaseAfterCastMs,0,'Chain Combo DB delay is zero');
eq(timing.comboStatDelayReductionMs,600,'Combo AGI/DEX reduction is 600ms');
eq(timing.rawAfterCastMs,400,'Zero DB combo delay falls back to 1000 then stats');
eq(timing.afterCastActDelayMs,400,'Combo final after-cast delay is applied');
const prominence={id:2593,officialId:2593,key:'SJ_PROMINENCEKICK',type:'weapon',afterCastActDelay:1000};ctx.skillsData.runtimeProfiles['2593']={handler:'physical_attack'};
timing=ctx.getRuntimeSkillTimingProfile(prominence,7);
eq(timing.databaseAfterCastMs,1000,'Prominence Kick DB delay retained');
eq(timing.afterCastActDelayMs,400,'Prominence Kick uses combo stat delay formula');
active={afterCastDelayReductionRate:50};timing=ctx.getRuntimeSkillTimingProfile(chain,5);
eq(timing.afterCastActDelayMs,200,'After-cast reduction applies after combo stat formula');
ctx.player.stats.agi=200;active={};timing=ctx.getRuntimeSkillTimingProfile(chain,5);
eq(timing.afterCastActDelayMs,0,'Combo stat delay floors at zero');

// Independent cooldown versus global after-cast delay.
ctx.player.stats={str:1,agi:193,vit:1,int:530,dex:0,luk:1};ctx.player.skillTimingState={};ctx.player.equipment={weapon:1};active={};
ctx.commitRuntimeSkillTiming(synthetic,1);
ctx.player.skillTimingState.actionLockUntil=0;ctx.player.skillTimingState.globalDelayUntil=0;
let block=ctx.getRuntimeSkillDelayBlock(synthetic,1);check(block?.type==='cooldown','Cooldown blocks the same skill',JSON.stringify(block));
block=ctx.getRuntimeSkillDelayBlock(other,1);check(!block,'Independent cooldown does not block another skill',JSON.stringify(block));
ctx.player.skillTimingState={};const delayOnly={...synthetic,cooldown:0,afterCastActDelay:1000};ctx.commitRuntimeSkillTiming(delayOnly,1);ctx.player.skillTimingState.actionLockUntil=0;
block=ctx.getRuntimeSkillDelayBlock(other,1);check(block?.type==='after_cast','After-cast delay blocks other active skills',JSON.stringify(block));

// Flags, walk delay and throughput floor.
const ignoreDex={...synthetic,castTimeFlags:{IgnoreDex:true}};ctx.player.stats.int=530;ctx.player.stats.dex=0;timing=ctx.getRuntimeSkillTimingProfile(ignoreDex,1);
eq(timing.cast.variableMs,1000,'IgnoreDex disables INT/DEX variable cast reduction');
timing=ctx.getRuntimeSkillTimingProfile(synthetic,1);
eq(timing.afterCastWalkDelayMs,800,'Walk delay = default 300 + DB 500');
eq(ctx.getRuntimeSkillPerformanceFloorMs(synthetic,1),140,'Attack skill throughput floor is 140ms');

const failed=checks.filter(row=>!row.ok);
const report={version:'0.9.82IA',source:'rAthena Renewal 2026-06-18 + RO_WEB runtime',checks:checks.length,passed:checks.length-failed.length,failed:failed.length,results:checks};
fs.writeFileSync(path.join(ROOT,'CAST_TIMING_AUDIT_0.9.82IA.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({version:report.version,checks:report.checks,passed:report.passed,failed:report.failed},null,2));
process.exit(failed.length?1:0);
