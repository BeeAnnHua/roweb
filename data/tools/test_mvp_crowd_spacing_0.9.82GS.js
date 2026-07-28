const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const config = JSON.parse(fs.readFileSync('data/monster_spawn_config.json','utf8'));
const source = fs.readFileSync('js/world_monster_test_runtime.js','utf8') + `\nwindow.__mvpTestExports={createWorldMonsterEntity,moveWorldMonsterToward,getWorldMonsterCrowdTarget,refreshWorldMonsterCrowdPlan,resolveWorldMonsterCrowdSeparation};`;
const noop=()=>{};
const context = {
  console,
  window:{},
  document:{getElementById:()=>null},
  navigator:{maxTouchPoints:0},
  performance:{now:()=>Date.now()},
  requestAnimationFrame:noop,
  setTimeout,
  clearTimeout,
  Math,
  Date,
  Map,
  Set,
  Promise,
  Number,
  String,
  Boolean,
  Array,
  Object,
  JSON,
  Infinity,
  player:{position:{x:2304,y:2304},worldMonsterState:{regions:{}}},
  currentMap:{id:'geffenia_mvp_arena_3x3_region_camera',monsterSpawnProfile:'geffenia_mvp_arena_3x3_region_camera',worldWidth:4608,worldHeight:4608,width:4608,height:4608,monsterStreaming:true,monsterVisualTest:true},
  currentMonster:null,
  serverConfig:{server:{monsters:{}}},
  loadJson:async()=>config,
  getMonsterMoveSpeedPx:()=>180,
  getMonsterAttackRangePx:()=>55,
  getMonsterChaseRangePx:()=>5000,
  getMonsterRetaliationChaseRangePx:()=>5000,
  getMonsterAiBehavior:()=>({canMove:true,canAttack:true,aggressive:true,assist:false,randomWalk:false}),
  getMonsterViewRangePx:()=>5000,
  monsterAttackPlayer:noop,
  updateMonsterUI:noop,
  saveGame:noop,
  requestGameSave:noop,
  addBattleLog:noop,
};
context.window = context;
vm.createContext(context);
vm.runInContext(source, context, {filename:'world_monster_test_runtime.js'});
const R=context.RO_WORLD_MONSTER_TEST;
R.ready=true;
R.config=config;
R.profile=config.regions.geffenia_mvp_arena_3x3_region_camera;
R.mapId=context.currentMap.id;
const X=context.__mvpTestExports;

const profile=R.profile;
assert.strictEqual(profile.fixedSpawnPositions,true,'fixedSpawnPositions must be enabled');
assert.strictEqual(profile.crowdControl.maxConcurrentAttackers,2,'frontline attacker limit');
assert.ok(profile.crowdControl.reserveRadiusWorldPx>=220,'reserve radius');
assert.ok(profile.crowdControl.reserveRingSpacingWorldPx>=140,'reserve ring spacing');
assert.strictEqual(profile.crowdControl.separationEnabled,true,'separation enabled');

// Saved chase coordinates must never override authored arena slots.
const unique={};
for(const entry of profile.pool){unique[String(entry.monsterId)]={alive:true,nextSpawnAt:0,currentHp:1000,position:{x:2304,y:2304},lastDeathAt:0};}
context.player.worldMonsterState.regions[context.currentMap.id]={unique};
R.entities=profile.pool.map((entry,i)=>X.createWorldMonsterEntity({id:entry.monsterId,name:`MVP${i}`,hp:1000,maxHp:1000,displayScale:1.5},entry,{}));
assert.strictEqual(R.entities.length,51,'arena monster count');
for(const e of R.entities){
  assert.strictEqual(e.position.x,e._spawnEntry.spawnPosition.x,`fixed x ${e.id}`);
  assert.strictEqual(e.position.y,e._spawnEntry.spawnPosition.y,`fixed y ${e.id}`);
  e.provoked=true;
  e._aggroReason='damage';
  context.refreshWorldMonsterSpatialEntity(e);
}

// Replanning must not reshuffle slots.
let now=Date.now();
let plan=X.refreshWorldMonsterCrowdPlan(now,{force:true});
const first=new Map([...plan.assignments].map(([id,a])=>[id,`${a.engaged?'E':'R'}:${a.slotIndex}`]));
for(let i=0;i<30;i++){now+=250;plan=X.refreshWorldMonsterCrowdPlan(now,{force:true});}
for(const [id,a] of plan.assignments){assert.strictEqual(`${a.engaged?'E':'R'}:${a.slotIndex}`,first.get(id),`stable slot ${id}`);}
assert.strictEqual([...plan.assignments.values()].filter(a=>a.engaged).length,2,'only two frontline MVPs');
const reserves=[...plan.assignments.values()].filter(a=>!a.engaged);
assert.strictEqual(new Set(reserves.map(a=>a.slotIndex)).size,reserves.length,'reserve slots unique');

// Simulate all MVPs moving toward their assigned slots. Separation must prevent a pile.
for(let step=0;step<500;step++){
  now+=50;
  plan=X.refreshWorldMonsterCrowdPlan(now,{force:true});
  for(const e of R.entities){
    const a=plan.assignments.get(e._instanceId);
    const target=X.getWorldMonsterCrowdTarget(e,a,55);
    X.moveWorldMonsterToward(e,target,0.05,a.engaged?4:8);
  }
}
let min=Infinity, pair=null;
for(let i=0;i<R.entities.length;i++)for(let j=i+1;j<R.entities.length;j++){
  const a=R.entities[i],b=R.entities[j];
  const d=Math.hypot(a.position.x-b.position.x,a.position.y-b.position.y);
  if(d<min){min=d;pair=[a.id,b.id];}
}
assert.ok(min>=70,`minimum spacing ${min.toFixed(2)} for ${pair}`);
const engaged=R.entities.filter(e=>e._crowdEngaged);
assert.strictEqual(engaged.length,2,'engaged entity count');
const report={
  version:'0.9.82GS',
  status:'PASS',
  monsters:R.entities.length,
  engaged:engaged.length,
  reserve:R.entities.length-engaged.length,
  minimumPairDistance:Number(min.toFixed(2)),
  fixedSpawnReset:true,
  stableAssignments:true,
  uniqueReserveSlots:true
};
fs.writeFileSync('MVP_CROWD_TEST_0.9.82GS.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
