'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const ROOT=path.resolve(__dirname,'..');
const j=rel=>JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'));
const core=j('data/skills/skills_core_1.json').skills;
const runtime=j('data/skill_runtime/runtime_core_1_v1.json').skills;
const pending=j('data/skill_runtime/runtime_pending_review.json').skills;
assert(runtime['143']?.runtimeProfile?.handler==='buff');
assert(!pending.some(x=>Number(x.skillId)===143));
let now=1700000000000;
class FakeDate extends Date{static now(){return now;}}
const motions=[];const logs=[];
const ctx={window:null,console,Math:Object.create(Math),Date:FakeDate,JSON,Number,String,Object,Array,Set,Map,Promise,
 setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},performance:{now:()=>now},
 document:{getElementById:()=>null,querySelectorAll:()=>[],body:{classList:{add(){},remove(){}}}},localStorage:{getItem:()=>null,setItem:()=>{}},
 skillsData:{runtimeProfiles:runtime,skillIndex:core},
 __player:{jobKey:'novice',baseLevel:1,jobLevel:10,hp:100,maxHp:100,sp:20,maxSp:20,aspd:193,stats:{str:1,agi:1,vit:1,int:1,dex:1,luk:1},equipment:{},learnedSkills:{143:1},activeBuffs:{},runtimeState:{},skillTimingState:{},state:'Idle'},
 getSkillLevel:id=>Number(ctx.__player.learnedSkills[id]||0),getSkillDataById:id=>core[String(id)]||null,getCurrentJobSkills:()=>[],getExtraSkillSkillList:()=>[],
 addBattleLog:t=>logs.push(t),updatePlayerUI:()=>{},updateMonsterUI:()=>{},saveGame:()=>{},recalculatePlayerStats:()=>{},calculateDerivedPlayerStats:()=>({stats:ctx.__player.stats,aspd:ctx.__player.aspd}),
 getTrainingBonusTotals:()=>({}),getPassiveSkillBonusTotals:()=>({}),getItemData:()=>null,getEquippedWeaponTypeRuntime:()=> 'fist',
 getPlayerSkillActionLockMs:()=>140,getPlayerAttackDelayMs:()=>140,markPlayerAttackUsed:()=>{},
 playROStudioPlayerMotion:(m,o)=>motions.push({m,o}),currentMonster:null};
ctx.window=ctx;ctx.Math.random=()=>0;vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT,'js/skill_engine.js'),'utf8'),ctx,{filename:'js/skill_engine.js'});
vm.runInContext('player=__player;',ctx);
const skill=core['143'];
assert.strictEqual(ctx.castBuffSkill(skill,1,{silent:true}),true,'activate Trick Dead');
assert.strictEqual(ctx.__player.sp,15,'activation consumes official 5 SP');
const active=ctx.__player.activeBuffs['143'];
assert(active&&active.effects.trickDead===1,'Trick Dead buff active');
assert.strictEqual(active.effects.blocksActiveSkills,1);
assert.strictEqual(active.effects.blocksNormalAttack,1);
assert.strictEqual(active.effects.movementLocked,1);
assert.strictEqual(active.effects.untargetableByNormalAttack,1);
assert.strictEqual(ctx.__player.state,'TrickDead');
assert(motions.some(x=>x.m==='dead'),'dead motion played and held');
const other={id:999,officialId:999,name:'Other',maxLevel:1,type:'Magic'};ctx.skillsData.runtimeProfiles['999']={handler:'magic_damage'};ctx.__player.learnedSkills['999']=1;
now+=200;
const blocked=ctx.canCastSkill(other,1);
assert.strictEqual(blocked.ok,false,'other skills blocked while playing dead');
assert(/無法主動施放其他技能/.test(blocked.reason));
assert.strictEqual(ctx.castBuffSkill(skill,1,{silent:true}),true,'toggle Trick Dead off');
assert(!ctx.__player.activeBuffs['143'],'buff removed');
assert.strictEqual(ctx.__player.sp,15,'toggle off costs no additional SP');
assert.strictEqual(ctx.__player.state,'Idle');
assert(motions.some(x=>x.m==='idle'),'idle motion restored');
console.log(JSON.stringify({version:'0.9.82EA',status:'PASS',spAfterActivate:15,otherSkillsBlocked:true,normalAttackBlocked:true,monsterNormalTargetBlocked:true,toggleOffNoCost:true},null,2));
