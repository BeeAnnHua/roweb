const fs=require('fs'),vm=require('vm'),path=require('path');
function assert(v,m){if(!v)throw new Error(m)}
function read(p){return fs.readFileSync(p,'utf8')}
function json(p){return JSON.parse(read(p))}

const productionJs=fs.readdirSync('js').filter(n=>n.endsWith('.js')&&n!=='data_bundle.js').map(n=>`js/${n}`);
const joined=productionJs.map(p=>read(p)).join('\n');
const forbidden=[
  [/\+\s*80\s*\)?\s*\/\s*100/g,'legacy HIT +80 formula'],
  [/2000\s*-\s*\([^\n]*ASPD[^\n]*150[^\n]*45/gi,'legacy ASPD approximation'],
  [/RO_WEB_CELL_SIZE\s*\|\|\s*32/g,'legacy 32px cell fallback'],
  [/playerHitsMonster\s*\(/g,'legacy player hit entry'],
  [/monsterHitsPlayer\s*\(/g,'legacy monster hit entry'],
  [/calculatePlayerDamage\s*\(/g,'legacy player damage wrapper'],
  [/calculateMonsterDamage\s*\(/g,'legacy monster damage wrapper']
];
for(const [re,label] of forbidden)assert(!re.test(joined),`${label} remains`);

const ra=read('js/ra_renewal_damage_pipeline.js');
const formula=read('js/combat_formula_runtime.js');
const combat=read('js/combat_damage_pipeline.js');
assert(ra.includes('禁止退回舊公式'),'RA pipeline must fail closed when formula runtime is missing');
assert(formula.includes('禁止略過 Renewal 防禦公式'),'defense runtime must fail closed');
assert(combat.includes('RO_WEB_FORMULA_AUTHORITY'),'formula authority registry missing');
assert(combat.includes('禁止使用舊命中公式'),'hit resolver must fail closed');
assert(combat.includes('禁止使用舊暴擊公式'),'critical resolver must fail closed');
assert(combat.includes('禁止使用舊怪物傷害公式'),'monster formula must fail closed');

const maps=json('data/maps.json');
assert(maps.length===1,'only one field map should remain');
assert(maps[0].id==='mjolnir_3x3_region_camera','world map must be the sole field map');
assert(!JSON.stringify(maps).includes('prontera_south'),'removed map remains in maps.json');
const defaults=json('data/player_default.json');
assert(defaults.map==='mjolnir_3x3_region_camera','default map not migrated');
assert(defaults.lastFieldMap==='mjolnir_3x3_region_camera','default lastFieldMap not migrated');
assert(defaults.position.x===2304&&defaults.position.y===2304,'default world spawn mismatch');
assert(!fs.existsSync('images/maps/backgrounds/prontera_south_bg.webp'),'removed map background still exists');
assert(!fs.existsSync('images/maps/thumbs/prontera_south_small.webp'),'removed map thumbnail still exists');

// Old-save migration is executable, not just a static replacement.
const playerCtx={console,window:null,localStorage:{getItem:()=>null,setItem:()=>{}},document:{getElementById:()=>null,querySelectorAll:()=>[],addEventListener:()=>{}}};
playerCtx.window=playerCtx;vm.createContext(playerCtx);vm.runInContext(read('js/player.js'),playerCtx,{filename:'js/player.js'});
vm.runInContext(`player={map:'prontera_south',lastFieldMap:'prontera_south',currentCity:'prontera',position:{x:10,y:20,targetX:50,targetY:60},discoveredMaps:{prontera_south:true,keep:true},mapExploration:{prontera_south:{},keep:{}}};`,playerCtx);
assert(playerCtx.migrateRemovedFieldMapReferences()===true,'old-save migration did not report a change');
const migrated=vm.runInContext('JSON.parse(JSON.stringify(player))',playerCtx);
assert(migrated.map==='mjolnir_3x3_region_camera'&&migrated.lastFieldMap==='mjolnir_3x3_region_camera','old save did not migrate to world map');
assert(migrated.position.x===2304&&migrated.position.y===2304&&migrated.position.targetX===null,'old save position not reset');
assert(!('prontera_south' in migrated.discoveredMaps)&&!('prontera_south' in migrated.mapExploration),'removed exploration records remain');

// Travel cleanup must clear both classic and world monster runtimes.
const counters={stop:0,battle:0,world:0,ui:0};
const mapCtx={console,window:null,Date,document:{getElementById:()=>null,createElement:()=>({style:{},appendChild(){},set textContent(v){},set className(v){}})},
 maps:[],cities:[],player:{},currentMap:null,currentMonster:{id:1},
 stopAutoBattle:()=>counters.stop++,clearBattleTimersAndMonster:()=>counters.battle++,clearWorldMonsterFieldTest:()=>counters.world++,updateMonsterUI:()=>counters.ui++};
mapCtx.window=mapCtx;vm.createContext(mapCtx);vm.runInContext(read('js/map.js'),mapCtx,{filename:'js/map.js'});
assert(mapCtx.clearFieldCombatRuntimeForTravel()===true,'travel cleanup failed');
assert(counters.stop===1&&counters.battle===1&&counters.world===1&&counters.ui===1,'travel cleanup did not clear every runtime layer');
assert(vm.runInContext('currentMonster===null',mapCtx),'classic currentMonster was not cleared');

// Formula authority registry must point only at the current Renewal pipeline.
const authorityCtx={console,window:null,Math,Date,player:{equipment:{}},getPassiveSkillBonusTotals:()=>({}),getActiveBuffBonusTotals:()=>({})};
authorityCtx.window=authorityCtx;vm.createContext(authorityCtx);
vm.runInContext(read('js/combat_damage_pipeline.js'),authorityCtx,{filename:'js/combat_damage_pipeline.js'});
const authority=authorityCtx.RO_WEB_FORMULA_AUTHORITY;
assert(authority&&authority.version==='0.9.82EC'&&authority.ruleset==='rAthena Renewal','formula authority metadata invalid');
assert(authority.normalAttack==='CombatDamagePipeline.resolveNormalAttack','normal attack authority invalid');
assert(authority.magicSkill==='CombatDamagePipeline.resolveMagicSkill','magic authority invalid');
assert(authority.monsterAttack==='CombatDamagePipeline.resolveMonsterAttack','monster authority invalid');

console.log('PASS 0.9.82EC formula authority and removed-map cleanup');
console.log(JSON.stringify({maps:maps.length,defaultMap:defaults.map,cellSizePx:36,legacyFormulaPatterns:0,removedMapAssets:0,travelLayersCleared:4,authority},null,2));
