const fs=require('fs'),vm=require('vm'),path=require('path');
function assert(v,m){if(!v)throw new Error(m);}
const worldSource=fs.readFileSync('js/world_monster_test_runtime.js','utf8');
const battleSource=fs.readFileSync('js/battle.js','utf8');
const engineSource=fs.readFileSync('js/skill_engine.js','utf8');
const mechanicsSource=fs.readFileSync('js/combat_mechanics_runtime.js','utf8');
for(const token of ['RO_WORLD_MONSTER_SPATIAL_INDEX','queryWorldMonsterEntitiesInBounds','refreshWorldMonsterSpatialEntity','registeredCount'])assert(worldSource.includes(token),`missing spatial token ${token}`);
for(const token of ['RO_WEB_MONSTER_IMPACT_BATCH','propagateWorldMonsterAssistBatch(targets)','updateWorldMonsterHpBarFast','maxPerFrame: 18'])assert(battleSource.includes(token),`missing impact batch token ${token}`);
for(const token of ['getRuntimeTargetingBounds','createRuntimeCombatEvaluationContext({ candidates:targets })','Candidate collection is intentionally opt-in','ignoreContext:true'])assert(engineSource.includes(token),`missing targeted cast token ${token}`);
assert(mechanicsSource.includes('effectCandidateBounds'), 'ground effects do not use bounded candidates');

const classList=()=>({add(){},remove(){},toggle(){},contains(){return false;}});
const host={classList:classList(),appendChild(){}};
const context={
 console,Math,Date,Map,Set,WeakMap,Promise,JSON,Number,String,Boolean,Array,Object,Infinity,
 window:null,document:{getElementById:()=>host,createElement:()=>({classList:classList(),style:{setProperty(){}},dataset:{},appendChild(){},querySelector(){return null;},remove(){}})},
 performance:{now:()=>0},requestAnimationFrame:()=>0,currentMap:{worldWidth:4608,worldHeight:4608},player:{position:{x:2304,y:2304}},currentMonster:null,
 serverConfig:{server:{monsters:{}}},monsters:[],getCurrentMapWorldSize:()=>({width:4608,height:4608}),getViewportLogicalSize:()=>({width:1280,height:720}),getMapCameraOffset:()=>({x:0,y:0}),
};context.window=context;vm.createContext(context);vm.runInContext(worldSource,context,{filename:'world_monster_test_runtime.js'});
const rows=[];let id=1;
for(let y=96;y<4608;y+=384){for(let x=96;x<4608;x+=384){if(rows.length>=120)break;rows.push({_instanceId:id++,id:1000+id,currentHp:100,maxHp:100,_worldTestEntity:true,_deathHandled:false,position:{x,y}});}if(rows.length>=120)break;}
context.RO_WORLD_MONSTER_TEST.entities=rows;rows.forEach(context.refreshWorldMonsterSpatialEntity);
assert(context.RO_WORLD_MONSTER_SPATIAL_INDEX.registeredCount===120,'not all entities registered');
const local=context.queryWorldMonsterEntitiesInBounds({minX:1900,maxX:2700,minY:1900,maxY:2700});
const stats=context.RO_WORLD_MONSTER_SPATIAL_INDEX.lastQuery;
assert(local.length>0,'local query empty');
assert(stats.visitedEntities<120,`spatial query still scanned all ${stats.visitedEntities}`);
assert(stats.visitedBuckets<=16,`too many spatial buckets ${stats.visitedBuckets}`);
const moving=rows[0],oldKey=moving._spatialCellKey;moving.position={x:2400,y:2400};context.refreshWorldMonsterSpatialEntity(moving);
assert(moving._spatialCellKey!==oldKey,'moving entity did not change spatial cell');
assert(context.queryWorldMonsterEntitiesInBounds({minX:2390,maxX:2410,minY:2390,maxY:2410}).includes(moving),'moved entity missing from new bucket');
console.log(JSON.stringify({version:'0.9.82EV',status:'PASS',totalEntities:120,localResults:local.length,visitedEntities:stats.visitedEntities,visitedBuckets:stats.visitedBuckets,damageDom:'raw queue + 24/frame',impact:'single RAF + batched Assist'},null,2));
