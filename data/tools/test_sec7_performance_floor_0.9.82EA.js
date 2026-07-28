const fs=require('fs'),vm=require('vm'),path=require('path');const ROOT=path.resolve(__dirname,'..');
const skills={999991:{id:999991,officialId:999991,name:'測試物理技能',maxLevel:1,type:'Weapon',targetType:'Attack',range:1,spCost:[0]},999992:{id:999992,officialId:999992,name:'測試 Buff',maxLevel:1,type:'Misc',targetType:'Self',spCost:[0]}};
const runtime={999991:{runtimeProfile:{handler:'physical_attack',ratio:100}},999992:{runtimeProfile:{handler:'buff',duration:1000,effects:{atkRate:1}}}};
const player={baseLevel:1,stats:{str:1,agi:1,vit:1,int:1,dex:1,luk:1},aspd:193,sp:999,hp:999,maxHp:999,zeny:999,activeBuffs:{},skillTimingState:{},equipment:{}};
const ctx={console,Math,Date,JSON,Number,String,Object,Array,Set,Map,Promise,performance:{now:()=>Date.now()},window:{},document:undefined,player,skillsData:{runtimeProfiles:runtime,skillIndex:skills},
 getSkillLevel:()=>1,getActiveBuffBonusTotals:()=>({}),getPassiveSkillBonusTotals:()=>({}),getPassiveCombatModifierTotals:()=>({}),getTrainingBonusTotals:()=>({}),getItemData:()=>null,
 calculateDerivedPlayerStats:()=>({stats:player.stats,aspd:193}),recalculatePlayerStats:()=>{},addBattleLog:()=>{},saveGame:()=>{},updatePlayerUI:()=>{},setInterval:()=>1,clearInterval:()=>{},setTimeout:()=>1,clearTimeout:()=>{}};
ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(ROOT,'js/battle.js'),'utf8'),ctx,{filename:'battle.js'});vm.runInContext(fs.readFileSync(path.join(ROOT,'js/skill_engine.js'),'utf8'),ctx,{filename:'skill_engine.js'});
function eq(a,b,m){if(a!==b)throw new Error(`${m}: ${a} !== ${b}`)}
eq(ctx.RO_WEB_ACTIVE_ATTACK_MIN_INTERVAL_MS,140,'global attack throughput floor');
ctx.getPlayerSkillActionLockMs=()=>50;
let p=ctx.getRuntimeSkillCastBeginLockProfile(skills[999991],1);eq(p.lockMs,140,'attack skill floor after all RA gates');eq(p.performanceFloorMs,140,'attack floor component');eq(p.type,'throughput','throughput lock type');
p=ctx.getRuntimeSkillCastBeginLockProfile(skills[999992],1);eq(p.performanceFloorMs,0,'buff no attack floor');eq(p.lockMs,100,'buff keeps RA min skill delay');
const battle=fs.readFileSync(path.join(ROOT,'js/battle.js'),'utf8');if(/AUTO_ATTACK_INTERVAL\s*=\s*250/.test(battle))throw new Error('legacy 250ms poll remains');
console.log(JSON.stringify({version:'0.9.82EA',activeAttackMinimumIntervalMs:140,theoreticalMaximumPerSecond:Number((1000/140).toFixed(3)),buffMinimumMs:100,legacy250msPoll:false,status:'PASS'},null,2));
