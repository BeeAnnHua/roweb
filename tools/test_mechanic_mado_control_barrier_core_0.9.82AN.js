const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const core=JSON.parse(fs.readFileSync(path.join(root,'data/skills/skills_core_1.json'),'utf8')).skills;
const rows=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_core_1_v1.json'),'utf8')).skills;
const generated=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_generated_all.json'),'utf8')).skills;
const pending=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_pending_review.json'),'utf8')).skills;
const runtimeProfiles={};for(const [id,row] of Object.entries(rows))runtimeProfiles[id]=row.runtimeProfile||row;
let logs=[], rooted=false;
const player={hp:1000,maxHp:1000,sp:999,maxSp:999,baseLevel:200,jobLevel:70,stats:{str:100,agi:100,vit:100,int:50,dex:100,luk:30},position:{x:500,y:500},activeBuffs:{},runtimeState:{statuses:{}},learnedSkills:{2271:3,2272:3,2273:3,2274:3},mountState:{mounted:true,type:'mado'}};
const monster={name:'測試怪物',currentHp:10000,maxHp:10000,position:{x:520,y:500},attackRange:5,runtimeState:{statuses:{}}};
const ctx={console,Date,Math:Object.create(Math),setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},window:null,player,currentMonster:monster,activeMonsters:[monster],skillsData:{runtimeProfiles},RO_WEB_CELL_SIZE:32,
 getSkillLevel:id=>Number(player.learnedSkills[id]||0),getSkillDataById:id=>core[String(id)]||null,getCurrentJobSkills:()=>Object.values(core),isSkillBasic:()=>false,getEquippedWeaponTypeRuntime:()=> 'axe',
 calculateDerivedPlayerStats:()=>({def:100,mdef:100,walkSpeed:150,stats:player.stats}),renderPositionSprites:()=>{},updatePlayerUI:()=>{},updateMonsterUI:()=>{},saveGame:()=>{},recalculatePlayerStats:()=>{},addBattleLog:x=>logs.push(x),paySkillCost:()=>{},playROStudioPlayerMotion:()=>{},
 CombatDamagePipeline:{resolvePhysicalSkill:()=>({damage:1}),resolveMagicSkill:()=>({damage:1})},HitResolver:{resolve:()=>({hit:true})},CriticalResolver:{resolve:()=>({critical:false,multiplier:1})},PerfectDodgeResolver:{resolve:()=>({dodged:false})},MultiHitResolver:{normalize:()=>({damageHitCount:1,visualHitCount:1,statusProcMode:'once'}),split:d=>[d]},TargetingResolver:{collect:(origin,candidates,opt)=>candidates}};
ctx.Math.random=()=>0;ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/combat_mechanics_runtime.js'),'utf8'),ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/skill_engine.js'),'utf8'),ctx);
function assert(c,m){if(!c)throw new Error(m);}
assert(Object.values(generated).filter(x=>x.implementationMode==='official'&&x.executionEnabled).length>=482,'official coverage');assert(pending.length<=657,'pending count');
for(const id of [2271,2272,2273,2274]){assert(runtimeProfiles[id]&&runtimeProfiles[id].handler!=='pending','runtime '+id);assert(!pending.some(x=>Number(x.skillId)===id),'pending '+id);}
assert(ctx.castDebuffSkill(core['2271'],3)===true,'analyze cast');let st=monster.runtimeState.statuses.analyze;assert(st&&st.effects.defRate===-42&&st.effects.mdefRate===-42,'analyze effects');
monster.runtimeState.statuses={};assert(ctx.castDebuffSkill(core['2272'],3)===true,'magnetic cast');st=monster.runtimeState.statuses.magneticfield;assert(st&&st.effects.noMove===1&&st.expiresAt-Date.now()>7900,'magnetic status');
monster.runtimeState.statuses={hovering:{id:'hovering',expiresAt:Date.now()+10000,effects:{hovering:1}}};assert(ctx.castDebuffSkill(core['2272'],3)===false,'hovering immunity');
assert(ctx.castBuffSkill(core['2273'],3,{silent:true})===true,'barrier cast');assert(player.activeBuffs[2273].effects.defRate===25&&player.activeBuffs[2273].effects.mdefRate===25&&player.activeBuffs[2273].effects.longRangePhysicalImmunity===1,'barrier effects');
assert(ctx.castBuffSkill(core['2274'],3,{silent:true})===true,'stealth cast');assert(!player.activeBuffs[2273]&&player.activeBuffs[2274].effects.stealthField===1&&player.activeBuffs[2274].effects.walkSpeedRate===30,'exclusive stealth');
// Dynamic battle validation: Neutral Barrier blocks ranged physical attacks; Stealth Field blocks ordinary monsters but not bosses/detectors.
const battleLogs=[];
const battlePlayer={hp:1000,maxHp:1000,flee:0,activeBuffs:{2273:{name:'中性防護罩',effects:{longRangePhysicalImmunity:1}}}};
const battleMonster={name:'遠距怪物',attackRange:5,hit:999,currentHp:1000};
const dummyEl={addEventListener(){},appendChild(){},removeChild(){},classList:{add(){},remove(){},toggle(){}},dataset:{},style:{},children:[],querySelector(){return null;},querySelectorAll(){return []}};
const battleCtx={console,Date,Math,window:null,player:battlePlayer,document:{getElementById(){return null;},querySelector(){return null;},querySelectorAll(){return [];},createElement(){return {...dummyEl};}},requestAnimationFrame:fn=>fn(),setInterval:()=>0,clearInterval(){},setTimeout:()=>0,clearTimeout(){},HitResolver:{resolve:()=>({hit:true})},PerfectDodgeResolver:{resolve:()=>({dodged:false})},recalculatePlayerStats(){},updatePlayerUI(){},saveGame(){},getActiveBuffBonusTotals:()=>Object.values(battlePlayer.activeBuffs).reduce((a,b)=>{for(const [k,v] of Object.entries(b.effects||{}))a[k]=(a[k]||0)+Number(v||0);return a;},{})};
battleCtx.window=battleCtx;vm.createContext(battleCtx);vm.runInContext(fs.readFileSync(path.join(root,'js/battle.js'),'utf8'),battleCtx);battleCtx.addBattleLog=x=>battleLogs.push(x);battleCtx.calculateMonsterDamage=()=>100;
battleCtx.currentMonster=battleMonster;battleCtx.monsterAttackPlayer();assert(battlePlayer.hp===1000&&battleLogs.some(x=>x.includes('中性防護罩')&&x.includes('完全擋下')),'neutral barrier ranged block');
battleLogs.length=0;battlePlayer.activeBuffs={2274:{name:'隱形力場',effects:{stealthField:1}}};battleMonster.attackRange=1;battleCtx.currentMonster=battleMonster;battleCtx.monsterAttackPlayer();assert(battlePlayer.hp===1000&&battleLogs.some(x=>x.includes('隱形力場')&&x.includes('不會成為')),'stealth ordinary target immunity');
battleLogs.length=0;battleMonster.isBoss=true;battleCtx.currentMonster=battleMonster;battleCtx.monsterAttackPlayer();assert(battlePlayer.hp===900,'stealth boss detector exception');

// Dynamic movement validation: Magnetic Field roots monster AI movement.
const rootedMonster={position:{x:100,y:100},aiState:'IDLE',runtimeState:{statuses:{magneticfield:{expiresAt:Date.now()+1000}}}};
const positionPlayer={position:{x:200,y:200},currentCity:null,walkSpeed:150};
const positionCtx={console,Date,Math,window:null,player:positionPlayer,currentMonster:rootedMonster,document:{getElementById:()=>null,querySelector:()=>null,addEventListener(){}},setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},requestAnimationFrame:()=>0,StatusManager:{has:(target,name)=>Boolean(target?.runtimeState?.statuses?.[name])}};
positionCtx.window=positionCtx;positionCtx.addEventListener=()=>{};vm.createContext(positionCtx);vm.runInContext(fs.readFileSync(path.join(root,'js/position_engine.js'),'utf8'),positionCtx);positionCtx.updateMonsterMovement(0.1);assert(rootedMonster.aiState==='ROOTED','magnetic field movement root');

console.log(JSON.stringify({result:'PASS',official:482,pending:657,skills:[2271,2272,2273,2274],analyzeDefRate:-42,magneticMs:8000,barrierDefRate:25,stealthSlowRate:30,dynamic:{neutralBarrierRangedBlock:true,stealthOrdinaryImmunity:true,stealthBossException:true,magneticMovementRoot:true}},null,2));
