const fs=require('fs'),path=require('path'),assert=require('assert'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const json=rel=>JSON.parse(read(rel));
const index=read('index.html');
const game=read('js/game.js');
const playerJs=read('js/player.js');
const battle=read('js/battle.js');
const town=read('js/town.js');
const world=read('js/world_monster_test_runtime.js');
const mapJs=read('js/map.js');
const css=read('css/style.css');
const maps=json('data/maps.json');
const monsters=json('data/monsters.json');
const spawn=json('data/monster_spawn_config.json');

// Share cards: force a short explicit snippet instead of scraping the page's old test text.
assert(index.includes('<meta property="og:title" content="RO_WEB">'),'OG title missing');
assert(index.includes('<meta property="og:description" content="&#8203;">'),'Blank OG description guard missing');
assert(index.includes('<meta name="twitter:card" content="summary">'),'Twitter summary metadata missing');

// Legacy singleton waiting panel is hidden when no target exists.
assert(!index.includes('等待怪物出現'),'Legacy waiting text must not remain in HTML');
assert(!battle.includes('正在搜尋怪物...'),'Legacy searching text must not remain in monster singleton UI');
assert(battle.includes('monsterSpriteEl.classList.toggle("no-target", !inTown && !currentMonster)'),'No-target class toggle missing');
assert(css.includes('.monster-sprite.no-target') && css.includes('visibility: hidden !important'),'No-target singleton panel CSS missing');

// Town reload is a pure town scene: no currentMap and no world monster streaming.
assert(game.includes('if (savedCity) {') && game.includes('currentMap = null;') && game.includes('player.map = null;'),'Town startup must clear field currentMap/map');
assert(playerJs.includes('if (player.currentCity) {') && playerJs.includes('player.state = "Town";'),'Town save state normalization missing');
assert(world.includes('!player?.currentCity &&\n    currentMap?.monsterStreaming'),'World monster runtime must be disabled in town');
assert(town.includes('clearWorldMonsterFieldTest({ persist: true, save: false })'),'Town background restore must clear streamed monsters');

// Tooltip is compact, scrollable, and refreshes without snapping scroll back to the top.
assert(css.includes('max-height: min(430px, calc(100vh - 24px))'),'Desktop compact tooltip max-height missing');
assert(css.includes('max-height: min(42vh, 310px)'),'Mobile compact tooltip max-height missing');
assert(css.includes('touch-action: pan-y') && css.includes('overscroll-behavior: contain'),'Touch scrolling support missing');
assert(mapJs.includes('const previousScrollTop = tooltip.scrollTop;') && mapJs.includes('tooltip.scrollTop = previousScrollTop;'),'Countdown refresh must preserve tooltip scroll position');
assert(mapJs.includes('compactViewport') && mapJs.includes('top = 8;'),'Compact mobile placement missing');

// Execute dynamic count planning. Ordinary + plant counts must follow the live count valve.
let countRate=33;
const ctx={console,Math,Date,JSON,Number,String,Object,Array,Set,Map,
  monsters,maps,player:{worldMonsterState:{regions:{}}},
  document:{getElementById:()=>null,createElement:()=>({addEventListener(){},setAttribute(){},style:{},hidden:true,scrollTop:0}),body:{appendChild(){}}},
  window:null
};
ctx.window=ctx;
ctx.window.addEventListener=()=>{};
ctx.window.clearTimeout=clearTimeout;ctx.window.clearInterval=clearInterval;ctx.window.setTimeout=setTimeout;ctx.window.setInterval=setInterval;
ctx.window.matchMedia=()=>({matches:false});
ctx.getWorldMonsterProfile=map=>spawn.regions[map.monsterSpawnProfile||map.id];
ctx.getWorldMonsterRuntimeValves=()=>({...spawn.global,monsterCountRate:countRate});
ctx.getWorldMonsterWindowTargetCount=profile=>Math.max(0,Math.min(Number(spawn.global.normalHardCap||40),Math.round(Number(profile.targetNormalCountAt100||60)*countRate/100)));
vm.createContext(ctx);vm.runInContext(mapJs,ctx,{filename:'map.js'});
const sampleMap=maps[0];
ctx.sampleMap=sampleMap;ctx.sampleProfile=spawn.regions[sampleMap.monsterSpawnProfile||sampleMap.id];
const plan33=JSON.parse(vm.runInContext(`(()=>{const p=getMapMonsterDisplayCountPlan(sampleMap,sampleProfile);return JSON.stringify({target:p.targetTotal,sum:[...p.counts.values()].reduce((a,b)=>a+b,0),rate:p.countRate});})()`,ctx));
assert.deepStrictEqual(plan33,{target:20,sum:20,rate:33},'33% monster rate must display about 20 ordinary monsters total');
countRate=50;
const plan50=JSON.parse(vm.runInContext(`(()=>{const p=getMapMonsterDisplayCountPlan(sampleMap,sampleProfile);return JSON.stringify({target:p.targetTotal,sum:[...p.counts.values()].reduce((a,b)=>a+b,0),rate:p.countRate});})()`,ctx));
assert.deepStrictEqual(plan50,{target:30,sum:30,rate:50},'50% monster rate must update tooltip counts to 30 total');
countRate=100;
const plan100=JSON.parse(vm.runInContext(`(()=>{const p=getMapMonsterDisplayCountPlan(sampleMap,sampleProfile);return JSON.stringify({target:p.targetTotal,sum:[...p.counts.values()].reduce((a,b)=>a+b,0),rate:p.countRate});})()`,ctx));
assert.deepStrictEqual(plan100,{target:40,sum:40,rate:100},'100% monster rate must respect the live hard cap');
assert.strictEqual(vm.runInContext('formatMapMonsterRespawnDuration(3661)',ctx),'1小時 1分鐘 1秒','Respawn format regression');

assert(game.includes('const RO_WEB_VERSION = "0.9.82FG";'),'Runtime version must be FG');
assert([...index.matchAll(/\?v=([^"']+)/g)].every(m=>m[1]==='0.9.82FG'),'All entry cache keys must be FG');
console.log(JSON.stringify({version:'0.9.82FG',status:'PASS',townRestore:true,ordinaryTargets:[20,30,40],compactTooltip:true},null,2));
