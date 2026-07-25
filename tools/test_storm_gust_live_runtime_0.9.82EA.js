const fs=require('fs'),vm=require('vm'),path=require('path');const ROOT=path.resolve(__dirname,'..');
const read=r=>JSON.parse(fs.readFileSync(path.join(ROOT,r),'utf8'));
const skills={...read('data/skills/skills_core_1.json').skills,...read('data/skills/skills_core_2.json').skills};
const runtime=read('data/skill_runtime/runtime_core_1_v1.json').skills;
let now=1_000_000;const target={id:1,name:'Dummy',currentHp:100000,maxHp:100000,position:{x:324,y:0},hardMdef:0,softMdef:0,mres:0,runtimeState:{statuses:{}}};
const player={baseLevel:100,jobLevel:70,stats:{str:1,agi:1,vit:1,int:100,dex:120,luk:1},aspd:193,sp:1000,hp:10000,maxHp:10000,zeny:0,position:{x:0,y:0},activeBuffs:{},skillTimingState:{},equipment:{}};
const math=Object.assign(Object.create(Math),{random:()=>0});
const ctx={console,Math:math,JSON,Number,String,Object,Array,Set,Map,Promise,Date:{now:()=>now},performance:{now:()=>now},window:{},document:undefined,
 player,currentMonster:target,activeMonsters:[target],skillsData:{runtimeProfiles:runtime,skillIndex:skills},RO_WEB_CELL_SIZE:36,
 getSkillLevel:id=>Number(id)===89?10:0,getSkillDataById:id=>skills[String(id)],getActiveBuffBonusTotals:()=>({}),getPassiveSkillBonusTotals:()=>({}),getPassiveCombatModifierTotals:()=>({}),getTrainingBonusTotals:()=>({}),getItemData:()=>null,
 calculateDerivedPlayerStats:()=>({stats:player.stats,matk:100,matkMin:100,matkMax:100,sMatk:0,aspd:193}),recalculatePlayerStats:()=>{},
 getSkillRangePx:()=>324,canAttackMonsterByRange:()=>true,movePlayerTowardMonster:()=>{},clampPositionToBounds:p=>p,isGroundSkillPlacementLegal:()=>true,
 addBattleLog:()=>{},updatePlayerUI:()=>{},updateMonsterUI:()=>{},saveGame:()=>{},showDamageNumber:()=>{},playMonsterHitAnimation:()=>{},renderPositionSprites:()=>{},
 setTimeout:()=>1,clearTimeout:()=>{},setInterval:()=>1,clearInterval:()=>{},
 CombatDamagePipeline:{resolveMagicSkill:(profile,level,t,opt)=>({damage:Math.max(1,Math.floor(Number(opt.ratio||100)*Number(opt.hits||1))),ratio:opt.ratio,hits:opt.hits})}
};ctx.window=ctx;vm.createContext(ctx);
for(const rel of ['js/combat_mechanics_runtime.js','js/battle.js','js/skill_engine.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,rel),'utf8'),ctx,{filename:rel});
ctx.currentMonster=target;ctx.MovementEffectResolver={knockback:()=>true};ctx.addBattleLog=()=>{};ctx.updatePlayerUI=()=>{};ctx.updateMonsterUI=()=>{};ctx.saveGame=()=>{};ctx.showDamageNumber=()=>{};ctx.playMonsterHitAnimation=()=>{};
function eq(a,b,m){if(a!==b)throw new Error(`${m}: ${a} !== ${b}`)}
function assert(v,m){if(!v)throw new Error(m)}
const skill=skills['89'];const ok=ctx.castAttackSkill(skill,10);assert(ok,'Storm Gust cast');
eq(player.sp,922,'Storm Gust SP cost once');eq(ctx.GroundEffectManager.effects.size,1,'Storm Gust ground instance created');
for(let i=0;i<10;i++){now=1_000_000+i*450;ctx.GroundEffectManager.update(now,[target]);}
eq(target.currentHp,100000-5700,'Storm Gust ten Renewal waves');eq(ctx.GroundEffectManager.effects.size,0,'Storm Gust expires after ten waves');
assert(ctx.StatusManager.has(target,'freeze'),'Storm Gust per-wave freeze status reached target');
const state=player.skillTimingState;assert(Number(state.skillCooldownUntil['89']||0)>1_000_000,'Storm Gust cooldown committed');assert(Number(state.globalDelayUntil||0)>1_000_000,'Storm Gust after-cast delay committed');
console.log(JSON.stringify({version:'0.9.82EA',castRangeCells:9,cellSizePx:36,area:'9x9',tickMs:450,waves:10,damagePerWave:570,totalDamage:5700,spSpent:78,freezeApplied:true,status:'PASS'},null,2));
