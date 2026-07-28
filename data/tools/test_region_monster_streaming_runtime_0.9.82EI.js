const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const config=JSON.parse(fs.readFileSync(path.join(ROOT,'data/monster_spawn_config.json'),'utf8'));
const maps=JSON.parse(fs.readFileSync(path.join(ROOT,'data/maps.json'),'utf8'));
const monsters=JSON.parse(fs.readFileSync(path.join(ROOT,'data/monsters.json'),'utf8'));
function assert(c,m){if(!c)throw new Error(m);}
function classList(){const s=new Set();return{add:(...a)=>a.forEach(x=>s.add(x)),remove:(...a)=>a.forEach(x=>s.delete(x)),contains:x=>s.has(x),toggle:(x,v)=>v?s.add(x):s.delete(x)}}
const host={classList:classList(),appendChild(){},dataset:{}};
const context={
 console,Math,Date,Map,Set,Promise,JSON,Number,String,Boolean,Array,Object,Infinity,
 window:null,document:{getElementById:id=>(id==='battle-field'||id==='battle-area')?host:null,querySelectorAll:()=>[]},
 performance:{now:()=>Date.now()},requestAnimationFrame:()=>0,Image:function(){},
 currentMap:maps.find(m=>m.id==='payon_3x3_region_camera'),
 player:{position:{x:2304,y:2304},hp:1000,maxHp:1000,worldMonsterState:null},
 monsters,currentMonster:null,serverConfig:{server:{monsters:{monsterCountRate:100,normalSpawnDelayRate:100,plantSpawnDelayRate:100,bossSpawnDelayRate:100,spawnVariance:true}}},
 loadJson:async p=>p.includes('monster_spawn_config')?config:null,
 getCurrentMapWorldSize:()=>({width:4608,height:4608}),
 getViewportLogicalSize:()=>({width:1280,height:720}),
 getMapCameraOffset:()=>({x:1664,y:1944}),
 clampPositionToBounds:p=>({x:Math.max(1,Math.min(4607,Number(p.x))),y:Math.max(1,Math.min(4607,Number(p.y)))}),
 getMonsterAiBehavior:m=>m.behavior||{},getMonsterMoveSpeedPx:()=>80,getMonsterAttackRangePx:()=>55,getMonsterChaseRangePx:()=>360,
 updateMonsterUI(){},addBattleLog(){},saveGame(){},monsterAttackPlayer(){},playROStudioMonsterMotion(){},
};
context.window=context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(ROOT,'js/world_monster_test_runtime.js'),'utf8'),context,{filename:'world_monster_test_runtime.js'});
(async()=>{
 await context.initWorldMonsterFieldTestRuntime();
 let entities=context.RO_WORLD_MONSTER_TEST.entities;
 let ordinary=entities.filter(e=>['normal','plant'].includes(e._category)&&e.currentHp>0);
 let unique=entities.filter(e=>['rare','boss','mvp'].includes(e._category)&&e.currentHp>0);
 assert(ordinary.length===60,`100% ordinary ${ordinary.length}`);
 assert(unique.length===5,`Payon unique ${unique.length}`);
 for(const id of [1090,1096,1120,1582,1115])assert(unique.filter(e=>e.id===id).length===1,`unique ${id}`);
 assert(new Set(ordinary.map(e=>e.id)).size>=8,'weighted ordinary diversity too low');
 const plantCounts={}; ordinary.filter(e=>e._category==='plant').forEach(e=>plantCounts[e.id]=(plantCounts[e.id]||0)+1);
 for(const entry of config.regions.payon_3x3_region_camera.pool.filter(e=>e.category==='plant'))assert((plantCounts[entry.monsterId]||0)<=entry.maxAlive,`plant cap ${entry.monsterId}`);

 context.serverConfig.server.monsters.monsterCountRate=50;
 context.clearWorldMonsterFieldTest({persist:true}); context.ensureWorldMonsterFieldTest();
 ordinary=context.RO_WORLD_MONSTER_TEST.entities.filter(e=>['normal','plant'].includes(e._category)&&e.currentHp>0);
 assert(ordinary.length===30,`50% ordinary ${ordinary.length}`);

 context.serverConfig.server.monsters.monsterCountRate=200;
 context.clearWorldMonsterFieldTest({persist:true}); context.ensureWorldMonsterFieldTest();
 ordinary=context.RO_WORLD_MONSTER_TEST.entities.filter(e=>['normal','plant'].includes(e._category)&&e.currentHp>0);
 assert(ordinary.length===120,`200% hard cap ${ordinary.length}`);

 context.serverConfig.server.monsters.monsterCountRate=100;
 context.serverConfig.server.monsters.normalSpawnDelayRate=0;
 context.clearWorldMonsterFieldTest({persist:true}); context.ensureWorldMonsterFieldTest();
 const victim=context.RO_WORLD_MONSTER_TEST.entities.find(e=>e._category==='normal');
 context.onWorldMonsterDefeated(victim);
 context.maintainWorldMonsterPopulation(Date.now()+2000);
 ordinary=context.RO_WORLD_MONSTER_TEST.entities.filter(e=>['normal','plant'].includes(e._category)&&e.currentHp>0);
 assert(ordinary.length===60,`normal immediate-rate refill ${ordinary.length}`);

 context.serverConfig.server.monsters.bossSpawnDelayRate=100;
 const angeling=context.RO_WORLD_MONSTER_TEST.entities.find(e=>e.id===1096&&e.currentHp>0);
 context.onWorldMonsterDefeated(angeling);
 const future=context.player.worldMonsterState.regions.payon_3x3_region_camera.unique['1096'].nextSpawnAt;
 assert(future>Date.now()+3500000,'Angeling future timer missing');
 context.clearWorldMonsterFieldTest({persist:true}); context.ensureWorldMonsterFieldTest();
 assert(!context.RO_WORLD_MONSTER_TEST.entities.some(e=>e.id===1096&&e.currentHp>0),'Angeling respawned after map reload');
 const state=context.player.worldMonsterState.regions.payon_3x3_region_camera.unique['1096'];state.nextSpawnAt=0;state.alive=false;
 context.maintainWorldMonsterPopulation(Date.now()+future);
 assert(context.RO_WORLD_MONSTER_TEST.entities.filter(e=>e.id===1096&&e.currentHp>0).length===1,'Angeling did not respawn when due');

 console.log(JSON.stringify({status:'PASS',ordinary100:60,ordinary50:30,ordinary200:120,payonUnique:5,persistentBossTimer:true,weightedSpecies:new Set(ordinary.map(e=>e.id)).size}));
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
