const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
let pass=0,fail=0;
function check(ok,label,detail=''){ if(ok){pass++; console.log('PASS',label);} else {fail++; console.error('FAIL',label,detail);} }
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'css/style.css'),'utf8');
const playerJs=fs.readFileSync(path.join(root,'js/player.js'),'utf8');
const cfg=JSON.parse(fs.readFileSync(path.join(root,'data/monster_spawn_config.json'),'utf8'));
const runtime=fs.readFileSync(path.join(root,'js/world_monster_test_runtime.js'),'utf8');
const battle=fs.readFileSync(path.join(root,'js/battle.js'),'utf8');
check(index.includes('id="mobilePlayerJob"')&&index.includes('id="mobilePlayerId"')&&index.includes('id="mobilePlayerIdEditButton"'),'mobile identity stack exists');
check(css.includes('flex-direction: column')&&css.includes('#player-info.character-card .level-line')&&css.includes('top: 64px'),'mobile identity is vertical and level line moved down');
check(playerJs.includes('setOptionalText("mobilePlayerJob", currentJobName)')&&playerJs.includes('setOptionalText("mobilePlayerId", playerId || "未設定")'),'mobile job and ID render independently');
const crowd=cfg.regions.geffenia_mvp_arena_3x3_region_camera.crowdControl;
check(crowd?.enabled===true,'Geffenia crowd control enabled');
check(crowd.maxConcurrentAttackers===6&&crowd.maxConcurrentAttackersCoarse===4,'desktop/mobile front-line caps are 6/4',JSON.stringify(crowd));
check(crowd.reserveAiIntervalMs>=150&&crowd.renderCrowdedIntervalMs>=120,'reserve AI/render are throttled');
check(runtime.includes('function refreshWorldMonsterCrowdPlan')&&runtime.includes('function getWorldMonsterCrowdTarget'),'crowd planner and ring target exist');
check(runtime.includes('entity.aiState = "RESERVE"')&&runtime.includes('assignment.engaged === false'),'reserve MVPs cannot all attack simultaneously');
check(runtime.includes('function getWorldMonsterRenderIntervalMs')&&runtime.includes('visibleCount'),'adaptive render LOD exists');
check(runtime.includes('_lastRenderLeft')&&runtime.includes('_uiAiState'),'DOM writes are cached');
check(battle.includes('requestWorldMonsterCombatSave(600)')&&battle.includes('RO_WEB_WORLD_MONSTER_COMBAT_SAVE_TIMER'),'dense incoming attacks use a throttled save gate');

// Dynamic 51-MVP plan and attack-front simulation.
const classList=()=>({add(){},remove(){},toggle(){},contains(){return false;}});
const host={classList:classList(),appendChild(){}};
let coarse=false,attackCalls=0;
const context={
  console,Math,Date,Map,Set,WeakMap,Promise,JSON,Number,String,Boolean,Array,Object,Infinity,
  window:null,navigator:{maxTouchPoints:0},
  document:{getElementById:()=>host,createElement:()=>({classList:classList(),style:{setProperty(){}},dataset:{},appendChild(){},querySelector(){return null;},remove(){}})},
  performance:{now:()=>Date.now()},requestAnimationFrame:()=>0,
  currentMap:{id:'geffenia_mvp_arena_3x3_region_camera',monsterStreaming:true,monsterVisualTest:true,monsterSpawnProfile:'geffenia_mvp_arena_3x3_region_camera',worldWidth:4608,worldHeight:4608,worldScale:3},
  player:{position:{x:2304,y:2304},currentCity:null},currentMonster:null,
  serverConfig:{server:{monsters:{}}},monsters:[],
  getViewportLogicalSize:()=>({width:1280,height:720}),getMapCameraOffset:()=>({x:1664,y:1944}),
  clampPositionToBounds:p=>({x:Math.max(0,Math.min(4608,Number(p.x||0))),y:Math.max(0,Math.min(4608,Number(p.y||0)))}),
  getMonsterAiBehavior:e=>e.behavior,getMonsterAttackRangePx:()=>55,getMonsterViewRangePx:()=>360,
  getMonsterChaseRangePx:()=>1400,getMonsterRetaliationChaseRangePx:()=>1600,getMonsterMoveSpeedPx:()=>120,
  getRuntimeSkillCastState:()=>null,monsterAttackPlayer:()=>{attackCalls++;},updateMonsterUI:()=>{},
  saveGame:()=>{},loadJson:async()=>cfg
};
context.window=context;
context.window.matchMedia=()=>({matches:coarse});
vm.createContext(context);vm.runInContext(runtime,context,{filename:'world_monster_test_runtime.js'});
const state=context.RO_WORLD_MONSTER_TEST;
state.ready=true;state.config=cfg;state.profile=cfg.regions.geffenia_mvp_arena_3x3_region_camera;state.mapId=context.currentMap.id;state.lastMaintenanceAt=Date.now();
const now=Date.now();
state.entities=Array.from({length:51},(_,i)=>({
  id:1000+i,name:`MVP${i+1}`,currentHp:100,maxHp:100,position:{x:2304+(i%9)*2,y:2304+Math.floor(i/9)*2},spawnPosition:{x:2304,y:2304},
  _instanceId:i+1,_worldTestIndex:i+1,_category:'mvp',_deathHandled:false,provoked:true,_aggroReason:'aggressive',_aggroSince:now,_aggroLastSeenAt:now,
  _nextAiUpdateAt:0,_lastAiUpdateAt:now-100,_animation:{overrideMotion:null,overrideHoldLast:false,frameCursor:0,frameElapsed:0},
  behavior:{aggressive:true,castSensorIdle:false,canMove:true,canAttack:true,randomWalk:false}
}));
state.entities.forEach(context.refreshWorldMonsterSpatialEntity);
let plan=context.refreshWorldMonsterCrowdPlan(now,{force:true});
check(plan.total===51&&[...plan.assignments.values()].filter(v=>v.engaged).length===6,'51 MVPs keep full population with 6 desktop attackers',JSON.stringify({total:plan.total,engaged:[...plan.assignments.values()].filter(v=>v.engaged).length}));
const engagedTargets=[],reserveTargets=[];
for(const entity of state.entities){
  const a=plan.assignments.get(entity._instanceId); const target=context.getWorldMonsterCrowdTarget(entity,a,55);
  entity.position={...target}; entity._nextAiUpdateAt=0; entity._lastAiUpdateAt=now-100;
  (a.engaged?engagedTargets:reserveTargets).push(target);
}
const uniqueEngaged=new Set(engagedTargets.map(p=>`${Math.round(p.x)},${Math.round(p.y)}`));
const minReserve=Math.min(...reserveTargets.map(p=>Math.hypot(p.x-context.player.position.x,p.y-context.player.position.y)));
check(uniqueEngaged.size===6&&minReserve>=145,'front line spreads to six slots and reserves stay outside',JSON.stringify({unique:uniqueEngaged.size,minReserve}));
attackCalls=0;context.updateWorldMonsterFieldTest(0.05);
const reserveCount=state.entities.filter(e=>e.aiState==='RESERVE').length;
check(attackCalls<=6&&reserveCount>=45,'one AI tick never lets all 51 MVPs attack',JSON.stringify({attackCalls,reserveCount}));
const firstEngagedId=[...plan.assignments.entries()].find(([,value])=>value.engaged)?.[0];
const firstEngaged=state.entities.find(entity=>entity._instanceId===firstEngagedId);
if(firstEngaged){ firstEngaged.currentHp=0; firstEngaged._deathHandled=true; firstEngaged.provoked=false; }
const promotedPlan=context.refreshWorldMonsterCrowdPlan(Date.now()+250,{force:true});
const promotedCount=[...promotedPlan.assignments.values()].filter(value=>value.engaged).length;
check(state.entities.length===51&&promotedPlan.total===50&&promotedCount===6,'front-line vacancy promotes a reserve without deleting the 51-entry population',JSON.stringify({entities:state.entities.length,total:promotedPlan.total,promotedCount}));
coarse=true;context.navigator.maxTouchPoints=5;
plan=context.refreshWorldMonsterCrowdPlan(Date.now()+500,{force:true});
check([...plan.assignments.values()].filter(v=>v.engaged).length===4,'coarse pointer lowers attack front to four');

console.log(`RESULT ${pass}/${pass+fail}`); process.exit(fail?1:0);
