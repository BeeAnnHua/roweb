const fs=require('fs'),path=require('path'),assert=require('assert'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const json=rel=>JSON.parse(read(rel));
const mapJs=read('js/map.js');
const worldJs=read('js/world_monster_test_runtime.js');
const index=read('index.html');
const spawn=json('data/monster_spawn_config.json');
const server=json('data/server_config.json');
const maps=json('data/maps.json');
const monsters=json('data/monsters.json');

assert(mapJs.includes('function formatMapMonsterRespawnDuration(totalSeconds)'),'Duration formatter missing');
assert(mapJs.includes('重生倒數 ${formatMapMonsterRespawnDuration(state.remainingSeconds)}'),'Tooltip must use duration formatter');
assert(worldJs.includes('initialSpawnBatchSize: 8'),'Runtime initial batch default missing');
assert(worldJs.includes('Math.min(targetTotal, Math.max(1, Number(valves.initialSpawnBatchSize || 8)))'),'Initial population must be batch-limited');
assert.strictEqual(spawn.global.monsterCountRate,33,'Spawn config ordinary count rate must be 33');
assert.strictEqual(server.server.monsters.mob_count_rate,33,'Server ordinary count rate must be 33');
assert.strictEqual(spawn.global.baseMonstersPerSource512,5,'Fallback density must be one third');
assert.strictEqual(spawn.global.normalHardCap,40,'Ordinary hard cap must be one third');
assert.strictEqual(spawn.global.initialSpawnBatchSize,8,'Initial ordinary batch must be 8');
assert.strictEqual(server.server.monsters.initialSpawnBatchSize,8,'Server initial ordinary batch must be 8');
for(const profile of Object.values(spawn.regions)){
  const target=Math.round(Number(profile.targetNormalCountAt100||60)*spawn.global.monsterCountRate/100);
  assert.strictEqual(target,20,'Each region should target about 20 ordinary monsters');
}

const ctx={console,Math,Date,JSON,Number,String,Object,Array,Set,Map,
  monsters,maps,player:{worldMonsterState:{regions:{}}},
  document:{getElementById:()=>null,createElement:()=>({addEventListener(){},setAttribute(){},style:{},hidden:true}),body:{appendChild(){}}},
  window:null
};
ctx.window=ctx;ctx.window.addEventListener=()=>{};ctx.window.clearTimeout=clearTimeout;ctx.window.clearInterval=clearInterval;ctx.window.setTimeout=setTimeout;ctx.window.setInterval=setInterval;
vm.createContext(ctx);vm.runInContext(mapJs,ctx,{filename:'map.js'});
assert.strictEqual(vm.runInContext('formatMapMonsterRespawnDuration(1)',ctx),'0小時 0分鐘 1秒');
assert.strictEqual(vm.runInContext('formatMapMonsterRespawnDuration(65)',ctx),'0小時 1分鐘 5秒');
assert.strictEqual(vm.runInContext('formatMapMonsterRespawnDuration(3661)',ctx),'1小時 1分鐘 1秒');

assert([...index.matchAll(/\?v=([^"']+)/g)].every(m=>m[1]==='0.9.82FH'),'All entry cache keys must be FH');
console.log(JSON.stringify({version:'0.9.82FH',status:'PASS',ordinaryTarget:20,initialBatch:8,hardCap:40,countRate:33},null,2));
