'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const ROOT=path.resolve(__dirname,'..');
const j=rel=>JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'));
const core={...j('data/skills/skills_core_1.json').skills,...j('data/skills/skills_core_2.json').skills};
const runtime=j('data/skill_runtime/runtime_core_1_v1.json').skills;
let now=1700000000000;
class FakeDate extends Date{static now(){return now;}}
const ctx={window:null,console,Math:Object.create(Math),Date:FakeDate,JSON,Number,String,Object,Array,Set,Map,Promise,
 setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},performance:{now:()=>now},
 document:{getElementById:()=>null,querySelectorAll:()=>[],body:{classList:{add(){},remove(){}}}},localStorage:{getItem:()=>null,setItem:()=>{}},
 skillsData:{runtimeProfiles:runtime,skillIndex:core},
 __player:{jobKey:'dragon_knight',baseLevel:200,jobLevel:60,hp:500,maxHp:1000,sp:400,maxSp:1000,aspd:180,stats:{str:100,agi:100,vit:100,int:100,dex:100,luk:100},equipment:{},learnedSkills:{5014:5,2467:3},activeBuffs:{},runtimeState:{},skillTimingState:{}},
 getSkillLevel:id=>Number(ctx.__player.learnedSkills[id]||0),getSkillDataById:id=>core[String(id)]||null,getCurrentJobSkills:()=>[],getExtraSkillSkillList:()=>[],
 addBattleLog:()=>{},updatePlayerUI:()=>{},saveGame:()=>{},recalculatePlayerStats:()=>{},calculateDerivedPlayerStats:()=>({stats:ctx.__player.stats}),
 getTrainingBonusTotals:()=>({}),getPassiveSkillBonusTotals:()=>({}),getItemData:()=>null,getEquippedWeaponTypeRuntime:()=> 'fist'
};ctx.window=ctx;ctx.Math.random=()=>0;vm.createContext(ctx);
for(const file of ['js/player.js','js/skill_engine.js']) vm.runInContext(fs.readFileSync(path.join(ROOT,file),'utf8'),ctx,{filename:file});
vm.runInContext('player=__player; getPlayerHpRecoveryAmount=()=>100; getPlayerSpRecoveryAmount=()=>100; updatePlayerUI=()=>{}; saveGame=()=>{}; recalculatePlayerStats=()=>{};',ctx);

// Wind Insignia Lv3 must reduce Wind magic common delay by 50%, while non-Wind stays unchanged.
ctx.__player.activeBuffs['2467']={id:2467,name:'風之紋章',level:3,effects:{windMagicCommonDelayReductionRate:50},expiresAt:now+60000};
assert.strictEqual(ctx.getRuntimeSkillTimingProfile(core['20'],10).rawAfterCastMs,1400);
assert.strictEqual(ctx.getRuntimeSkillTimingProfile(core['20'],10).afterCastActDelayMs,700,'Wind common delay reduction must apply');
assert.strictEqual(ctx.getRuntimeSkillTimingProfile(core['19'],10).afterCastActDelayMs,ctx.getRuntimeSkillTimingProfile(core['19'],10).rawAfterCastMs,'Non-Wind skill must not receive Wind reduction');

// Expired Full Throttle must create its 10-second recovery penalty.
ctx.__player.activeBuffs={
  '5014':{id:5014,name:'突破極限',level:5,effects:{allStatsRate:20,moveSpeedRate:100},expiresAt:now-1,afterEffect:{duration:10000,effects:{disableHpRegen:1,disableSpRegen:1,moveSpeedRate:-25}}}
};
ctx.normalizeActiveBuffs();
const after=ctx.__player.activeBuffs['5014_after_effect'];
assert(after,'Full Throttle after-effect must be created');
assert.strictEqual(after.expiresAt-now,10000);
assert.strictEqual(after.effects.disableHpRegen,1);
assert.strictEqual(after.effects.disableSpRegen,1);

// Natural recovery is blocked, but other explicit recovery systems remain separate.
ctx.__player.hp=500;ctx.__player.sp=400;ctx.runPlayerRecoveryTick();
assert.strictEqual(ctx.__player.hp,500,'HP natural regeneration must be disabled');
assert.strictEqual(ctx.__player.sp,400,'SP natural regeneration must be disabled');
now+=10001;ctx.normalizeActiveBuffs();ctx.runPlayerRecoveryTick();
assert.strictEqual(ctx.__player.hp,600,'HP regeneration must resume after penalty');
assert.strictEqual(ctx.__player.sp,500,'SP regeneration must resume after penalty');

console.log(JSON.stringify({version:'0.9.82DW',status:'PASS',windAfterCastMs:700,fullThrottleAfterEffectMs:10000,naturalRecoveryBlock:'PASS'},null,2));
