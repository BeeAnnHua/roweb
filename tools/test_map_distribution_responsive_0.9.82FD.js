const fs=require('fs'),path=require('path'),assert=require('assert'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const json=rel=>JSON.parse(read(rel));
const mapJs=read('js/map.js');
const positionJs=read('js/position_engine.js');
const worldJs=read('js/world_monster_test_runtime.js');
const css=read('css/style.css');
const index=read('index.html');
const maps=json('data/maps.json');
const monsters=json('data/monsters.json');
const spawn=json('data/monster_spawn_config.json');
const monsterIds=new Set(monsters.map(m=>Number(m.id)));

assert(mapJs.includes('map-monster-distribution-tooltip'),'Region monster tooltip runtime missing');
assert(mapJs.includes('createMapMonsterDistributionSection("一般怪物", "🐾"'),'Ordinary monster section missing');
assert(mapJs.includes('createMapMonsterDistributionSection("Boss 怪物", "👑"'),'Boss section missing');
assert(mapJs.includes('createMapMonsterDistributionSection("MVP", "🏆"'),'MVP section missing');
assert(mapJs.includes('重生倒數 ${state.remainingSeconds} 秒'),'Respawn countdown must display seconds');
assert(mapJs.includes('map-monster-state is-alive">存在中'),'Alive state text missing');
assert(worldJs.includes('getWorldMonsterRegionUniqueAvailability'),'Persistent unique monster availability bridge missing');
assert(worldJs.includes('state?.alive === false && nextSpawnAt > now'),'Respawn state must use saved nextSpawnAt');

assert(css.includes('.map-monster-state.is-alive') && css.includes('color: #70e77e'),'Alive state must be green');
assert(css.includes('.map-monster-state.is-respawning') && css.includes('color: #ff6262'),'Respawn countdown must be red');
assert(css.includes('border: 2px solid #d3a34a'),'Tooltip must use gold border');
assert(css.includes('background:\n    linear-gradient(180deg, rgba(50, 31, 12, .98), rgba(10, 7, 4, .99))'),'Tooltip must use dark background');

assert(css.includes('#status-window.true-status-window .status-advanced-detail-row[open] > summary::before') && css.includes('content: none !important'),'Advanced detail +/- markers must be removed');
assert(css.includes('width: min(100vw, var(--world-camera-width, 1280px))'),'Desktop world camera responsive width missing');
assert(css.includes('height: min(100vh, var(--world-camera-height, 720px))'),'Desktop world camera responsive height missing');
assert(positionJs.includes('if (rect?.width && rect?.height)'),'World camera must use rendered battle-field rect on all viewport sizes');
assert(!positionJs.includes('if (mobile && rect?.width && rect?.height)'),'World viewport must no longer be mobile-only');

assert.strictEqual(maps.length,10,'Expected ten world regions');
for(const map of maps){
  const profile=spawn.regions[map.monsterSpawnProfile||map.id];
  assert(profile,`Missing spawn profile for ${map.id}`);
  assert(Array.isArray(profile.pool)&&profile.pool.length>0,`Empty monster pool for ${map.id}`);
  for(const entry of profile.pool) assert(monsterIds.has(Number(entry.monsterId)),`Unknown monster ${entry.monsterId} in ${map.id}`);
}
const uniqueCounts=Object.values(spawn.regions).reduce((acc,r)=>{
  for(const e of r.pool){const c=String(e.category);if(c==='boss'||c==='mvp')acc[c]++;}
  return acc;
},{boss:0,mvp:0});
assert(uniqueCounts.boss>0&&uniqueCounts.mvp>0,'Boss/MVP data required for live state tooltip');


// Execute the map tooltip builder with a saved MVP respawn state.
const sampleMap=maps.find(m=>Object.values(spawn.regions[m.id]?.pool||{}).some?.(()=>false)) || maps.find(m=>(spawn.regions[m.id]?.pool||[]).some(e=>e.category==='mvp'));
const sampleProfile=spawn.regions[sampleMap.id];
const sampleMvp=sampleProfile.pool.find(e=>e.category==='mvp');
const ctx={console,Math,Date,JSON,Number,String,Object,Array,Set,Map,
  monsters,maps,player:{worldMonsterState:{regions:{[sampleMap.id]:{unique:{[String(sampleMvp.monsterId)]:{alive:false,nextSpawnAt:Date.now()+65000}}}}}},
  document:{getElementById:()=>null,createElement:()=>({addEventListener(){},setAttribute(){},style:{},hidden:true}),body:{appendChild(){}}},
  window:null
};
ctx.window=ctx;ctx.window.addEventListener=()=>{};ctx.window.clearTimeout=clearTimeout;ctx.window.clearInterval=clearInterval;ctx.window.setTimeout=setTimeout;ctx.window.setInterval=setInterval;
ctx.getWorldMonsterProfile=map=>spawn.regions[map.monsterSpawnProfile||map.id];
ctx.getWorldMonsterRegionUniqueAvailability=(mapId,monsterId,now=Date.now())=>{const st=ctx.player.worldMonsterState.regions?.[mapId]?.unique?.[String(monsterId)];const next=Number(st?.nextSpawnAt||0);const resp=st?.alive===false&&next>now;return {alive:!resp,respawning:resp,nextSpawnAt:next,remainingSeconds:resp?Math.max(1,Math.ceil((next-now)/1000)):0};};
vm.createContext(ctx);vm.runInContext(mapJs,ctx,{filename:'map.js'});
vm.runInContext(`RO_MAP_MONSTER_TOOLTIP_STATE.mapId=${JSON.stringify(sampleMap.id)}`,ctx);
const respawnHtml=vm.runInContext(`buildMapMonsterDistributionHtml(maps.find(m=>m.id===${JSON.stringify(sampleMap.id)}))`,ctx);
assert(/is-respawning/.test(respawnHtml)&&/重生倒數\s+6[45]\s+秒/.test(respawnHtml),'MVP respawn HTML must show red countdown seconds');
ctx.player.worldMonsterState.regions[sampleMap.id].unique[String(sampleMvp.monsterId)]={alive:true,nextSpawnAt:0};
const aliveHtml=vm.runInContext(`buildMapMonsterDistributionHtml(maps.find(m=>m.id===${JSON.stringify(sampleMap.id)}))`,ctx);
assert(/is-alive">存在中/.test(aliveHtml),'MVP alive HTML must show green existence state');

assert([...index.matchAll(/\?v=([^"']+)/g)].every(m=>m[1]==='0.9.82FD'),'All entry cache keys must be FD');
console.log(JSON.stringify({version:'0.9.82FD',status:'PASS',regions:maps.length,bossEntries:uniqueCounts.boss,mvpEntries:uniqueCounts.mvp},null,2));
