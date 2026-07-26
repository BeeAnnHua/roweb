const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..'),j=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const core=j('data/skills/skills_core_1.json').skills,runtime=j('data/skill_runtime/runtime_core_1_v1.json').skills;
const generated=j('data/skill_runtime/runtime_generated_all.json'),pending=j('data/skill_runtime/runtime_pending_review.json');
const ids=[304,305,307,308,309,310,313];
assert.strictEqual(generated.version,'0.9.82CE');
assert.strictEqual(generated.summary.officialRuntime,741);assert.strictEqual(generated.summary.pending,398);assert.strictEqual(pending.skills.length,398);
for(const id of ids){assert(runtime[id],`runtime ${id}`);assert.strictEqual(runtime[id].executionEnabled,true);assert.strictEqual(core[id].implementationStatus,'runtime_ready');}
assert.deepStrictEqual(runtime[307].runtimeProfile.duration,[60000,120000,180000,240000,300000]);
assert.deepStrictEqual(runtime[307].runtimeProfile.sustainedSpCostPer5s,[4,5,6,7,8]);
assert.deepStrictEqual(runtime[308].runtimeProfile.statusDuration,[300000]);
let now=1700000000000;class FakeDate extends Date{static now(){return now;}}
const ctx={window:null,console,setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},Math:Object.create(Math),Date:FakeDate};ctx.window=ctx;ctx.Math.random=()=>0;
ctx.__player={jobKey:'clown',baseLevel:99,jobLevel:70,hp:10000,maxHp:10000,sp:10000,maxSp:10000,stats:{str:60,agi:100,vit:60,int:80,dex:120,luk:90},equipment:{weapon:1},learnedSkills:{304:1,305:1,307:5,308:1,309:5,310:5,313:5,319:10,330:10},activeBuffs:{},position:{x:0,y:0},walkSpeed:150};
const makeMonster=(name,x)=>({name,currentHp:999999,maxHp:999999,element:'Neutral',elementLevel:1,race:'Formless',size:'Medium',position:{x,y:0},stats:{agi:0,luk:0,mdef:0,vit:0,int:0},hardDef:100,softDef:20,hardMdef:0,softMdef:0,runtimeState:{statuses:{}}});
const m1=makeMonster('TargetA',64),m2=makeMonster('TargetB',128);ctx.currentMonster=m1;ctx.activeMonsters=[m1,m2];
ctx.__runtime=runtime;ctx.__core=core;ctx.skillsData={runtimeProfiles:runtime,skillIndex:core};ctx.getSkillLevel=id=>Number(ctx.__player.learnedSkills[id]||0);ctx.getSkillDataById=id=>core[String(id)]||null;ctx.getCurrentJobSkills=()=>Object.keys(ctx.__player.learnedSkills).map(id=>core[id]).filter(Boolean);ctx.getExtraSkillSkillList=()=>[];
ctx.calculateDerivedPlayerStats=()=>({stats:{str:60,agi:100,vit:60,int:80,dex:120,luk:90},atk:500,def:200,hit:300,flee:200,cri:31,aspd:170,walkSpeed:150,hardDef:200,softDef:50});ctx.getTrainingBonusTotals=()=>({baseExpRate:0,jobExpRate:0,dropRate:0,zenyRate:0});ctx.getPassiveSkillBonusTotals=()=>({});ctx.getPassiveCombatModifierTotals=()=>({elementResist:{}});ctx.getPassiveTargetDamageBonus=()=>0;ctx.getItemData=()=>({weaponType:'instrument',dbSubType:'instrument',atk:200,range:5,element:'Neutral'});ctx.getEquippedWeaponTypeRuntime=()=> 'instrument';
ctx.RO_WEB_CELL_SIZE=32;ctx.getCombatGroundCandidates=()=>ctx.activeMonsters;ctx.getRuntimeCombatCandidates=()=>ctx.activeMonsters;ctx.canAttackMonsterByRange=()=>true;ctx.getSkillRangePx=()=>9999;ctx.movePlayerTowardMonster=()=>{};ctx.addBattleLog=()=>{};ctx.showDamageNumber=()=>{};ctx.playMonsterHitAnimation=()=>{};ctx.updateMonsterUI=()=>{};ctx.updatePlayerUI=()=>{};ctx.saveGame=()=>{};ctx.recalculatePlayerStats=()=>{};ctx.defeatMonster=()=>{};ctx.renderPositionSprites=()=>{};ctx.document={getElementById:()=>null,querySelectorAll:()=>[],body:{classList:{add(){},remove(){}}}};ctx.localStorage={getItem:()=>null,setItem:()=>{}};
vm.createContext(ctx);
for(const file of ['js/player.js','js/job.js','js/combat_mechanics_runtime.js','js/combat_formula_runtime.js','js/ra_renewal_damage_pipeline.js','js/combat_damage_pipeline.js','js/position_engine.js','js/skill_engine.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
vm.runInContext("player=__player; window.player=__player; skillsData={runtimeProfiles:__runtime,skillIndex:__core}; getPlayerSpRecoveryAmount=()=>0; getPlayerHpRecoveryAmount=()=>0; getItemData=()=>({weaponType:'instrument',dbSubType:'instrument',atk:200,range:5,element:'Neutral'}); updatePlayerUI=()=>{}; saveGame=()=>{}; recalculatePlayerStats=()=>{};",ctx);
// EXP song and reward path
assert(ctx.castBuffSkill(core['307'],5));assert.strictEqual(ctx.__player.activeBuffs['307'].effects.baseExpRate,60);assert.strictEqual(ctx.getRewardBonusRate('baseExp'),60);assert.strictEqual(ctx.getRewardBonusRate('jobExp'),60);assert.strictEqual(ctx.__player.activeBuffs['307'].expiresAt-now,300000);assert.strictEqual(ctx.__player.activeBuffs['307'].sustainedSpCostPer5s,8);
// Battle drum stacks and Adaptation removes newest only
assert(ctx.castBuffSkill(core['309'],5));assert.strictEqual(ctx.__player.activeBuffs['309'].effects.atkRate,40);assert.strictEqual(ctx.__player.activeBuffs['309'].effects.defFlat,75);assert(ctx.castBuffSkill(core['304'],1));assert(!ctx.__player.activeBuffs['309']);assert(ctx.__player.activeBuffs['307']);
// Encore refreshes last performance for only 1 SP
now+=1000;const spBefore=ctx.__player.sp;assert(ctx.castBuffSkill(core['305'],1));assert(ctx.__player.activeBuffs['309']);assert.strictEqual(ctx.__player.activeBuffs['309'].expiresAt-now,300000);assert.strictEqual(spBefore-ctx.__player.sp,1);
// Nibelungen deterministic SP reduction branch and player SP cost integration
assert(ctx.castBuffSkill(core['310'],5,{forcedDynamicRoll:8}));assert.strictEqual(ctx.__player.activeBuffs['310'].effects.spCostReductionRate,30);assert.strictEqual(ctx.getRuntimeSkillSpCost(core['319'],10),28);
// Siegfried resistances apply to status calculation and all-element damage defense
const beforeChance=ctx.StatusManager.chance(ctx.__player,'silence',100,{allowBoss:true});assert(ctx.castBuffSkill(core['313'],5));const afterChance=ctx.StatusManager.chance(ctx.__player,'silence',100,{allowBoss:true});assert.strictEqual(beforeChance-afterChance,25);assert.strictEqual(ctx.getActiveBuffBonusTotals().elementResistAll,15);
// Eternal Chaos applies DEF -100% and can be cleared with Adaptation
assert(ctx.castTimedStatusSkill(core['308'],1));assert.strictEqual(ctx.getMonsterRuntimeBonuses(m1).defRate,-100);assert(ctx.__player.activeBuffs['308']);assert(ctx.castBuffSkill(core['304'],1));assert(!ctx.__player.activeBuffs['308']);assert.strictEqual(ctx.getMonsterRuntimeBonuses(m1).defRate||0,0);
// Multiple ensemble upkeep stacks, natural recovery remains a separate first step
ctx.__player.activeBuffs={};ctx.__player.sp=1000;assert(ctx.castBuffSkill(core['307'],5));assert(ctx.castBuffSkill(core['309'],5));ctx.__player.sp=100;ctx.runPlayerRecoveryTick();assert.strictEqual(ctx.__player.sp,84); // 8 + 8 upkeep
console.log(JSON.stringify({result:'PASS',version:'0.9.82CE',officialRuntime:741,pending:398,skills:ids,encoreRefresh:true,adaptationLatestOnly:true,expReward:true,nibelungenRandom:true,siegfriedResistance:true,ensembleUpkeepStack:true},null,2));
