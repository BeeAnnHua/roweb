const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
let now=1_000_000;const scheduled=[];
const player={aspd:193,hp:1000,maxHp:1000,state:'Idle',position:{x:0,y:0},skillTimingState:{},autoCombat:{attack:{enabled:true,skillId:2477,level:5}},equipment:{},activeBuffs:{}};
const ctx={console,Math,JSON,Number,String,Object,Array,Set,Map,Promise,Date:{now:()=>now},performance:{now:()=>now},window:{},player,
 currentMap:{id:'test',monsters:[1]},monsters:[{id:1,name:'Dummy',maxHp:999999,hp:999999}],
 addBattleLog:()=>{},updatePlayerUI:()=>{},saveGame:()=>{},updateMonsterUI:()=>{},assignMonsterSpawnPosition:m=>{m.position={x:0,y:0}},syncROStudioMonsterAtlas:()=>{},
 getRandomFromArray:a=>a[0],getActiveBuffBonusTotals:()=>({}),recalculatePlayerStats:()=>{},syncAutoCombatSettingsFromUI:()=>{},
 getSkillDataById:id=>({id:Number(id),officialId:Number(id)}),getSkillLevel:()=>5,
 getRuntimeSkillDelayBlock:()=>({type:'after_cast',remainingMs:Math.max(0,Number(player.skillTimingState.globalDelayUntil||0)-now)}),
 setTimeout:(fn,delay)=>{scheduled.push(delay);return scheduled.length},clearTimeout:()=>{},setInterval:()=>1,clearInterval:()=>{},document:undefined};
ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(ROOT,'js/battle.js'),'utf8')+'\nwindow.__setAutoBattleRunning=v=>{autoBattleRunning=!!v};window.__setCurrentMonster=v=>{currentMonster=v};',ctx,{filename:'battle.js'});
ctx.__setAutoBattleRunning(true);ctx.__setCurrentMonster({id:1,currentHp:999999,position:{x:0,y:0}});
function eq(a,b,m){if(a!==b)throw new Error(`${m}: ${a} !== ${b}`)}
// Cart Cannon zero cast + 75% ACD: 125ms, RA ASPD193 cast-begin lock: 140ms.
player.skillTimingState={globalDelayUntil:now+125,actionLockUntil:now+140};
eq(ctx.getAutoBattleNextDelayMs(now),140,'75% ACD scheduler waits for latest RA gate');
// 83% ACD: 85ms. Still 140ms only because the real RA action lock is later.
player.skillTimingState={globalDelayUntil:now+85,actionLockUntil:now+140};
eq(ctx.getAutoBattleNextDelayMs(now),140,'83% ACD remains RA action-lock limited');
// Prove there is no artificial sec-7 / 140ms floor: if actual gates are 85ms and 50ms,
// the scheduler returns 85ms rather than forcing 140ms.
player.skillTimingState={globalDelayUntil:now+85,actionLockUntil:now+50};
eq(ctx.getAutoBattleNextDelayMs(now),85,'no artificial 140ms network cap');
player.skillTimingState={};ctx.getRuntimeSkillDelayBlock=()=>null;
eq(ctx.getAutoBattleNextDelayMs(now),8,'idle combat scheduler reaches browser-safe 8ms floor');
console.log(JSON.stringify({version:'0.9.82DY',cartCannon75PercentMs:140,cartCannon83PercentMs:140,noArtificialCapExampleMs:85,browserTimerFloorMs:8,status:'PASS'},null,2));
