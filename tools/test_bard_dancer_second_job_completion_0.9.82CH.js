const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..'),j=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const core=j('data/skills/skills_core_1.json').skills,runtime=j('data/skill_runtime/runtime_core_1_v1.json').skills;
const generated=j('data/skill_runtime/runtime_generated_all.json'),pending=j('data/skill_runtime/runtime_pending_review.json');
const ids=[306,311,312,317,325,1010,1011];
assert.strictEqual(generated.version,'0.9.82CH');
assert.strictEqual(generated.summary.officialRuntime, 762);assert.strictEqual(generated.summary.pending,377);assert.strictEqual(pending.skills.length,377);
for(const id of ids){assert(runtime[id],`runtime ${id}`);assert.strictEqual(runtime[id].executionEnabled,true);assert.strictEqual(core[id].implementationStatus,'runtime_ready');}
assert.deepStrictEqual(runtime[317].runtimeProfile.duration,[60000,120000,180000,240000,300000]);
assert.deepStrictEqual(runtime[325].runtimeProfile.performancePulseValue,[12,14,16,18,20]);
assert.strictEqual(runtime[306].runtimeProfile.performancePulseFormula,'renewal_lullaby');
assert.strictEqual(runtime[311].runtimeProfile.performancePulseFormula,'renewal_classical_pluck');
let now=1700000000000;class FakeDate extends Date{static now(){return now;}}
const ctx={window:null,console,setTimeout:(fn)=>{fn();return 0;},clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},Math:Object.create(Math),Date:FakeDate};ctx.window=ctx;ctx.Math.random=()=>0;
ctx.weaponType='instrument';
ctx.__player={jobKey:'clown',baseLevel:99,jobLevel:70,hp:10000,maxHp:10000,sp:20000,maxSp:20000,stats:{str:60,agi:100,vit:60,int:80,dex:120,luk:90},equipment:{weapon:1},learnedSkills:{306:1,311:1,312:1,317:5,325:5,1010:1,1011:1},activeBuffs:{},position:{x:0,y:0},walkSpeed:150};
const makeMonster=(name,x)=>({name,level:50,currentHp:999999,maxHp:999999,element:'Neutral',elementLevel:1,race:'Formless',size:'Medium',position:{x,y:0},stats:{agi:0,luk:0,mdef:0,vit:0,int:0},hardDef:100,softDef:20,hardMdef:0,softMdef:0,runtimeState:{statuses:{}}});
const m1=makeMonster('TargetA',64),m2=makeMonster('TargetB',96);ctx.currentMonster=m1;ctx.activeMonsters=[m1,m2];
ctx.__runtime=runtime;ctx.__core=core;ctx.skillsData={runtimeProfiles:runtime,skillIndex:core};ctx.getSkillLevel=id=>Number(ctx.__player.learnedSkills[id]||0);ctx.getSkillDataById=id=>core[String(id)]||null;ctx.getCurrentJobSkills=()=>Object.keys(ctx.__player.learnedSkills).map(id=>core[id]).filter(Boolean);ctx.getExtraSkillSkillList=()=>[];
ctx.calculateDerivedPlayerStats=()=>({stats:{str:60,agi:100,vit:60,int:80,dex:120,luk:90},atk:500,def:200,hit:300,flee:200,cri:31,aspd:170,walkSpeed:150,hardDef:200,softDef:50});ctx.getTrainingBonusTotals=()=>({baseExpRate:0,jobExpRate:0,dropRate:0,zenyRate:0});ctx.getPassiveSkillBonusTotals=()=>({});ctx.getPassiveCombatModifierTotals=()=>({elementResist:{}});ctx.getPassiveTargetDamageBonus=()=>0;ctx.getItemData=()=>({weaponType:ctx.weaponType,dbSubType:ctx.weaponType,atk:200,range:5,element:'Neutral'});ctx.getEquippedWeaponTypeRuntime=()=>ctx.weaponType;
ctx.RO_WEB_CELL_SIZE=32;ctx.getCombatGroundCandidates=()=>ctx.activeMonsters;ctx.getRuntimeCombatCandidates=()=>ctx.activeMonsters;ctx.canAttackMonsterByRange=()=>true;ctx.getSkillRangePx=()=>9999;ctx.movePlayerTowardMonster=()=>{};ctx.addBattleLog=()=>{};ctx.showDamageNumber=()=>{};ctx.playMonsterHitAnimation=()=>{};ctx.updateMonsterUI=()=>{};ctx.updatePlayerUI=()=>{};ctx.saveGame=()=>{};ctx.recalculatePlayerStats=()=>{};ctx.defeatMonster=()=>{};ctx.renderPositionSprites=()=>{};ctx.document={getElementById:()=>null,querySelectorAll:()=>[],body:{classList:{add(){},remove(){}}}};ctx.localStorage={getItem:()=>null,setItem:()=>{}};
vm.createContext(ctx);
for(const file of ['js/player.js','js/job.js','js/combat_mechanics_runtime.js','js/combat_formula_runtime.js','js/ra_renewal_damage_pipeline.js','js/combat_damage_pipeline.js','js/position_engine.js','js/skill_engine.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
vm.runInContext("player=__player; window.player=__player; skillsData={runtimeProfiles:__runtime,skillIndex:__core}; getPlayerSpRecoveryAmount=()=>0; getPlayerHpRecoveryAmount=()=>0; getItemData=()=>({weaponType:window.weaponType,dbSubType:window.weaponType,atk:200,range:5,element:'Neutral'}); updatePlayerUI=()=>{}; saveGame=()=>{}; recalculatePlayerStats=()=>{};",ctx);
// 317: periodic physical damage performance.
const hpBeforeDissonance=m1.currentHp;assert(ctx.castBuffSkill(core['317'],5));now+=3000;ctx.normalizeActiveBuffs();assert(m1.currentHp<hpBeforeDissonance);assert.strictEqual(ctx.__player.activeBuffs['317'].expiresAt-(now-3000),300000);
// 325: monster without SP receives non-lethal fixed HP loss equal to 10+2*Lv.
ctx.weaponType='whip';ctx.__player.activeBuffs={};const hpBeforeUgly=m1.currentHp;assert(ctx.castBuffSkill(core['325'],5));now+=3000;ctx.normalizeActiveBuffs();assert.strictEqual(hpBeforeUgly-m1.currentHp,20);assert(m1.currentHp>=1);
// 306: sleep aura blocks action and movement.
ctx.weaponType='instrument';ctx.__player.activeBuffs={};assert(ctx.castBuffSkill(core['306'],1));now+=5000;ctx.normalizeActiveBuffs();assert(ctx.StatusManager.has(m1,'sleep'));let sleepBonus=ctx.getMonsterRuntimeBonuses(m1);assert.strictEqual(sleepBonus.blocksActions,1);assert.strictEqual(sleepBonus.rooted,1);
// 311: Classical Pluck applies skill-use lock.
ctx.__player.activeBuffs={};m1.runtimeState={statuses:{}};assert(ctx.castBuffSkill(core['311'],1));now+=3000;ctx.normalizeActiveBuffs();assert(ctx.StatusManager.has(m1,'classical_pluck'));assert.strictEqual(ctx.getMonsterRuntimeBonuses(m1).skillUseBlocked,1);
// 312: active-skill SP cost reduction works.
ctx.__player.activeBuffs={};assert(ctx.castBuffSkill(core['312'],1));assert.strictEqual(ctx.__player.activeBuffs['312'].effects.spCostReductionRate,10);assert.strictEqual(ctx.getRuntimeSkillSpCost(core['1010'],1),36);
// 1010: confusion plus bleeding, including periodic non-lethal damage.
ctx.__player.activeBuffs={};m1.runtimeState={statuses:{}};ctx.currentMonster=m1;const hpBeforePang=m1.currentHp;assert(ctx.castTimedStatusSkill(core['1010'],1));assert(ctx.StatusManager.has(m1,'confusion'));assert(ctx.StatusManager.has(m1,'bleeding'));now+=2000;ctx.StatusManager.tickPeriodic(m1,now);assert(m1.currentHp<hpBeforePang);assert(m1.currentHp>=1);
// 1011: level-difference charm formula and immobilization.
m1.runtimeState={statuses:{}};assert(ctx.castTimedStatusSkill(core['1011'],1));assert(ctx.StatusManager.has(m1,'wink_charm'));const charmBonus=ctx.getMonsterRuntimeBonuses(m1);assert.strictEqual(charmBonus.blocksActions,1);assert.strictEqual(charmBonus.rooted,1);
console.log(JSON.stringify({result:'PASS',version:'0.9.82CH',officialRuntime:762,pending:377,skills:ids,dissonancePulse:true,uglyDanceFallback:true,lullabyRoot:true,classicalPluck:true,intoAbyssSpReduction:true,pangVoiceDualStatus:true,winkCharm:true},null,2));
