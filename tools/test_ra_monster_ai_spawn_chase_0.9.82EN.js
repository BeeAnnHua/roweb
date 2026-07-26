const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const config=JSON.parse(fs.readFileSync(path.join(ROOT,'data/monster_spawn_config.json'),'utf8'));
const maps=JSON.parse(fs.readFileSync(path.join(ROOT,'data/maps.json'),'utf8'));
const monsters=JSON.parse(fs.readFileSync(path.join(ROOT,'data/monsters.json'),'utf8'));
function assert(c,m){if(!c)throw new Error(m);}
function classList(){const s=new Set();return{add:(...a)=>a.forEach(x=>s.add(x)),remove:(...a)=>a.forEach(x=>s.delete(x)),contains:x=>s.has(x),toggle:(x,v)=>v?s.add(x):s.delete(x)}}
let seed=0x82E1;
const seededMath=Object.create(Math);
seededMath.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const host={classList:classList(),appendChild(){},dataset:{}};
const player={position:{x:2304,y:2304},hp:1000,maxHp:1000,currentCity:false,worldMonsterState:null};
const context={
 console,Math:seededMath,Date,Map,Set,Promise,JSON,Number,String,Boolean,Array,Object,Infinity,
 window:null,document:{getElementById:id=>(id==='battle-field'||id==='battle-area')?host:null,querySelectorAll:()=>[]},
 performance:{now:()=>Date.now()},requestAnimationFrame:()=>0,Image:function(){},
 currentMap:maps.find(m=>m.id==='payon_3x3_region_camera'),player,monsters,currentMonster:null,
 serverConfig:{server:{monsters:{monsterCountRate:100,normalSpawnDelayRate:100,plantSpawnDelayRate:100,bossSpawnDelayRate:100,spawnVariance:true,
  minimumSpawnDistanceWorldPx:140,preferredSpawnRadiusWorldPx:760,nearSpawnBias:0.78,retaliationChaseMinCells:24,retaliationLeashCells:34,assistRangeCells:11,aggroForgetMs:12000,castSensorEnabled:true}}},
 loadJson:async p=>p.includes('monster_spawn_config')?config:null,
 getCurrentMapWorldSize:()=>({width:4608,height:4608}),getViewportLogicalSize:()=>({width:1280,height:720}),
 getMapCameraOffset:()=>({x:1664,y:1944}),clampPositionToBounds:p=>({x:Math.max(1,Math.min(4607,Number(p.x))),y:Math.max(1,Math.min(4607,Number(p.y)))}),
 getMonsterAiBehavior:m=>m.behavior||{},getMonsterMoveSpeedPx:()=>120,getMonsterAttackRangePx:m=>Math.max(55,Number(m.AttackRange||1)*36),
 getMonsterViewRangePx:m=>Math.max(55,Number(m.SkillRange||10)*36),getMonsterChaseRangePx:m=>Math.max(160,Number(m.ChaseRange||12)*36),
 getMonsterRetaliationChaseRangePx:m=>Math.max(Math.max(160,Number(m.ChaseRange||12)*36),24*36),
 getRuntimeSkillCastState:()=>null,updateMonsterUI(){},addBattleLog(){},saveGame(){},monsterAttackPlayer(){},playROStudioMonsterMotion(){},
};
context.window=context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(ROOT,'js/world_monster_test_runtime.js'),'utf8'),context,{filename:'world_monster_test_runtime.js'});
(async()=>{
 await context.initWorldMonsterFieldTestRuntime();
 const living=context.RO_WORLD_MONSTER_TEST.entities.filter(e=>e.currentHp>0&&['normal','plant'].includes(e._category));
 assert(living.length===60,`ordinary population ${living.length}`);
 const distances=living.map(e=>Math.hypot(e.position.x-player.position.x,e.position.y-player.position.y));
 assert(Math.min(...distances)>=139.9,`spawned inside safety radius ${Math.min(...distances)}`);
 const close=distances.filter(d=>d<=900).length;
 assert(close>=38,`near-player spawn count too low ${close}/60`);
 const visible=living.filter(e=>e.position.x>=1664&&e.position.x<=2944&&e.position.y>=1944&&e.position.y<=2664).length;
 assert(visible>=18,`viewport monster count too low ${visible}/60`);

 // Passive RA monster struck from beyond normal 12-cell chase range must rush toward the player.
 const passive=living.find(e=>e.behavior?.canMove&&!e.behavior?.aggressive);
 assert(passive,'no passive movable monster');
 passive.position={x:player.position.x+750,y:player.position.y};
 passive.spawnPosition={...passive.position};
 passive.provoked=false;
 context.markWorldMonsterAttacked(passive,{reason:'damage',propagateAssist:false});
 assert(passive.provoked&&passive.aiState==='RUSH','damage did not enter RUSH');
 const before=Math.hypot(passive.position.x-player.position.x,passive.position.y-player.position.y);
 context.RO_WORLD_MONSTER_TEST.lastMaintenanceAt=Date.now();
 context.updateWorldMonsterFieldTest(0.5);
 const after=Math.hypot(passive.position.x-player.position.x,passive.position.y-player.position.y);
 assert(after<before,`far-hit monster did not chase ${before}->${after}`);
 assert(passive.aiState==='RUSH'||passive.aiState==='ATTACK',`unexpected retaliation state ${passive.aiState}`);

 // RA Assist: one allied monster within 11 cells joins the retaliation.
 const attacked={...passive,_instanceId:900001,position:{x:2304+300,y:2304},spawnPosition:{x:2604,y:2304},currentHp:100,maxHp:100,_deathHandled:false,_worldTestEntity:true,behavior:{canMove:true,canAttack:true,assist:false,randomWalk:true}};
 const helper={...passive,_instanceId:900002,position:{x:2604+200,y:2304},spawnPosition:{x:2804,y:2304},currentHp:100,maxHp:100,_deathHandled:false,_worldTestEntity:true,provoked:false,behavior:{canMove:true,canAttack:true,assist:true,randomWalk:true}};
 context.RO_WORLD_MONSTER_TEST.entities.push(attacked,helper);
 context.markWorldMonsterAttacked(attacked,{reason:'damage',propagateAssist:true});
 assert(helper.provoked&&helper._aggroReason==='assist','RA Assist did not join');

 // Aggressive mode acquires inside SkillRange without needing damage.
 const aggro={...passive,_instanceId:900003,position:{x:player.position.x+300,y:player.position.y},spawnPosition:{x:2604,y:2304},currentHp:100,maxHp:100,_deathHandled:false,_worldTestEntity:true,provoked:false,behavior:{canMove:true,canAttack:true,aggressive:true,randomWalk:true},SkillRange:10,ChaseRange:12};
 context.RO_WORLD_MONSTER_TEST.entities.push(aggro);
 context.updateWorldMonsterFieldTest(0.05);
 assert(aggro.provoked&&aggro._aggroReason==='aggressive','RA Aggressive did not acquire player');

 console.log(JSON.stringify({status:'PASS',ordinary:living.length,within900:close,visible,minimumDistance:Math.round(Math.min(...distances)),farHitBefore:before,farHitAfter:after,assist:true,aggressive:true}));
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
