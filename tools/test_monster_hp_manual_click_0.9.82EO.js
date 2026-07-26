const fs = require('fs');
const vm = require('vm');
function assert(value, message) { if (!value) throw new Error(message); }
function eq(actual, expected, message) { if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`); }

const battleSource = fs.readFileSync('js/battle.js', 'utf8');
const worldSource = fs.readFileSync('js/world_monster_test_runtime.js', 'utf8');
const positionSource = fs.readFileSync('js/position_engine.js', 'utf8');
const css = fs.readFileSync('css/style.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

for (const token of [
  'startManualMonsterAttack', 'stopManualMonsterAttack', 'scheduleManualMonsterAttack',
  'autoAttackMonster({ manual: true })', 'options.manual', 'manual_click'
]) assert(battleSource.includes(token), `Missing manual attack token ${token}`);
assert(worldSource.includes('startManualMonsterAttack(entity, { immediate: true })'), 'Monster hitbox must start direct attack');
assert(positionSource.includes('stopManualMonsterAttack({ clearTarget: true, silent: true })'), 'Ground click must stop direct attack');
assert(worldSource.includes('_hpBarRevealed: currentHp < maxHp'), 'Partially damaged restored monsters reveal HP');
assert(worldSource.includes('if (currentHp < maxHp) entity._hpBarRevealed = true'), 'Actual HP loss reveals bar');
assert(worldSource.includes('classList.toggle("hp-revealed"'), 'Runtime HP reveal class missing');
assert(css.includes('.world-monster-entity.hp-revealed .world-monster-hp'), 'HP reveal CSS missing');
assert(!css.includes('.world-monster-entity.is-selected .world-monster-hp'), 'Selection must not reveal HP');
assert(!css.includes('.world-monster-entity:hover .world-monster-hp'), 'Hover must not reveal HP');
assert(!css.includes('.world-monster-entity.is-damaged .world-monster-hp'), 'Temporary damage class must not own HP visibility');
assert((html.match(/\?v=0\.9\.82EO/g) || []).length >= 30, 'Entry assets must use EN cache key');

// Scheduler smoke test: direct click invokes only the manual normal-attack path and repeats.
const timers = [];
const monster = { name:'測試波利', currentHp:100, hp:100, maxHp:100, position:{x:100,y:100} };
const ctx = {
  console, Math, Date,
  window:null,
  document:{ querySelectorAll:()=>[], getElementById:()=>null, querySelector:()=>null },
  setTimeout:(fn,ms)=>{ timers.push({fn,ms}); return timers.length; },
  clearTimeout:()=>{},
  player:{ hp:100, maxHp:100, state:'Idle', position:{x:0,y:0}, skillTimingState:{}, activeBuffs:{}, autoCombat:{attack:{enabled:false}} },
  currentMap:{ id:'test', monsters:[1002] },
  updateMonsterUI:()=>{}, addBattleLog:()=>{}, saveGame:()=>{}, updatePlayerUI:()=>{}, updateInventoryUI:()=>{},
  getActiveBuffBonusTotals:()=>({}), recalculatePlayerStats:()=>{},
  getRuntimeSkillCastState:()=>({active:false,endsAt:0}),
  getPlayerNormalAttackRange:()=>36,
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(battleSource, ctx, { filename:'battle.js' });
let calls = 0;
let lastOptions = null;
ctx.autoAttackMonster = options => { calls += 1; lastOptions = options; monster.currentHp -= 10; };
assert(ctx.startManualMonsterAttack(monster), 'Manual attack should start');
assert(ctx.isManualMonsterAttackRunning(), 'Manual attack running flag');
assert(timers.length >= 1, 'Manual timer should be scheduled');
const first = timers.shift();
first.fn();
eq(calls, 1, 'First manual attack tick');
assert(lastOptions && lastOptions.manual === true, 'Manual tick must force manual normal-attack route');
assert(timers.length >= 1, 'Living target should schedule the next attack');
ctx.stopManualMonsterAttack({ clearTarget:false, silent:true });
assert(!ctx.isManualMonsterAttackRunning(), 'Manual attack stops safely');

console.log('PASS 0.9.82EO monster damage HP bar and left-click direct normal attack');
console.log(JSON.stringify({ hpBar:'damage-only persistent', clickAttack:'approach + ASPD normal attacks', autoSkillsInManualMode:false, cache:'0.9.82EO' }, null, 2));
