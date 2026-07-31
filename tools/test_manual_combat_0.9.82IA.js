#!/usr/bin/env node
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.resolve(__dirname, '..');
const failures = [];
const passes = [];
function assert(name, condition, details = '') {
  if (condition) passes.push(name);
  else failures.push(`${name}${details ? `: ${details}` : ''}`);
}

let nextTimerId = 1;
const timers = new Map();
const dummyClassList = { add(){}, remove(){}, toggle(){} };
const dummyElement = {
  dataset: {}, classList: dummyClassList, style: {}, children: [],
  addEventListener(){}, removeEventListener(){}, appendChild(){}, append(){}, remove(){},
  querySelector(){ return null; }, querySelectorAll(){ return []; },
  setAttribute(){}, getAttribute(){ return null; },
  getBoundingClientRect(){ return {left:0,top:0,right:100,bottom:100,width:100,height:100}; }
};
const documentStub = {
  readyState: 'loading', activeElement: null,
  addEventListener(){}, removeEventListener(){},
  getElementById(){ return null; },
  querySelector(){ return null; },
  querySelectorAll(){ return []; },
  createElement(){ return Object.assign({}, dummyElement, { dataset:{}, classList:dummyClassList, style:{}, children:[] }); },
  createDocumentFragment(){ return { appendChild(){}, append(){} }; }
};

const ctx = {
  console,
  Math,
  Date,
  JSON,
  Map,
  Set,
  Promise,
  document: documentStub,
  navigator: {},
  location: { href: 'http://test/' },
  requestAnimationFrame(){ return 1; },
  cancelAnimationFrame(){},
  setTimeout(fn, delay){ const id = nextTimerId++; timers.set(id, {fn, delay}); return id; },
  clearTimeout(id){ timers.delete(id); },
  setInterval(){ return 1; },
  clearInterval(){},
  player: {
    hp: 100, maxHp: 100, sp: 100, maxSp: 100, currentCity: null,
    state: 'Idle', position: {x:0,y:0,targetX:null,targetY:null},
    equipment: {}, autoCombat: { normalAttack:{enabled:true}, attacks:[], buffs:{} },
    skillTimingState: {}
  },
  currentMap: { id:'manual_test', monsters:[1], monsterVisualTest:true },
  updateMonsterUI(){}, updatePlayerUI(){}, updateQuickSlotUI(){}, saveGame(){},
  addBattleLog(){}, playPlayerAttackAnimation(){}, playMonsterHitAnimation(){}, showDamageNumber(){}, showSlashEffect(){},
  getActiveBuffBonusTotals(){ return {}; },
  getPlayerNormalAttackRange(){ return 55; },
  canAttackMonsterByRange(){ return true; },
  stopPlayerCombatMovementForAttack(){}, movePlayerTowardMonster(){ return false; },
  canPlayerAttackNow(){ return false; },
  getPlayerAttackRemainingMs(){ return 100; },
  isRuntimeSkillCasting(){ return false; },
  runVirtualSummonAssistTick(){ return null; },
  isAutoBattleTargetValid(){ return false; },
  acquireAutoBattleTarget(){ return null; },
  getAutoCombatAttackAction(){ return {action:'normal'}; },
  normalizeAutoCombatSettings(){},
  getAutoAttackSkill(){ return null; },
  spawnMonsterFromCurrentMap(){},
  getManualQuickSlots(){ return []; },
  isRuntimeSkillQuickSlotEligible(){ return true; }
};
ctx.window = ctx;
vm.createContext(ctx);

vm.runInContext(fs.readFileSync(path.join(root, 'js/battle.js'), 'utf8'), ctx, {filename:'battle.js'});
vm.runInContext(fs.readFileSync(path.join(root, 'js/quick_slots.js'), 'utf8'), ctx, {filename:'quick_slots.js'});

const targetA = {_worldTestEntity:true, id:1, name:'主動怪A', currentHp:100, hp:100, position:{x:10,y:0}};
const targetB = {_worldTestEntity:true, id:2, name:'怪物B', currentHp:100, hp:100, position:{x:20,y:0}};
ctx.selectWorldMonsterTestTarget = monster => { ctx.currentMonster = monster; return true; };

assert('manual validator ignores auto-battle filter', ctx.isManualCombatTargetValid(targetA) === true);
assert('manual click starts attack while auto off', ctx.startManualMonsterAttack(targetA, {immediate:true}) === true);
assert('manual controller running', ctx.isManualMonsterAttackRunning() === true);
assert('manual target stored', ctx.getManualMonsterAttackTarget() === targetA);
assert('manual timer scheduled', timers.size > 0);

// Quick-slot target validation must use manual validity when auto battle is off,
// even though the auto filter rejects the target.
assert('quick-slot accepts manually selected target excluded by auto filter', vm.runInContext('quickSlotEnsureFieldMonster()', ctx) === true);

// A different aggressive monster must not steal an existing manual lock.
assert('retaliation does not steal another manual target', ctx.requestManualRetaliationAgainstMonster(targetB) === false);
assert('existing manual target preserved', ctx.getManualMonsterAttackTarget() === targetA);

ctx.stopManualMonsterAttack({clearTarget:true, silent:true});
assert('manual controller stops cleanly', ctx.isManualMonsterAttackRunning() === false);
ctx.currentMonster = null;
assert('aggressive monster starts manual retaliation', ctx.requestManualRetaliationAgainstMonster(targetA, {announce:false}) === true);
assert('retaliation locks attacker', ctx.getManualMonsterAttackTarget() === targetA && ctx.currentMonster === targetA);

// Static integration guards for the streaming monster bridge.
const worldSource = fs.readFileSync(path.join(root, 'js/world_monster_test_runtime.js'), 'utf8');
assert('world-stream attack calls manual retaliation bridge', worldSource.includes('requestManualRetaliationAgainstMonster(entity'));
assert('world click branches between auto forced target and manual attack', worldSource.includes('forceAutoBattleTarget(entity') && worldSource.includes('startManualMonsterAttack(entity'));

// Execute the actual world-stream bridge in isolation: no selected target -> retaliation;
// an existing selected target -> restore it and do not steal the lock.
const worldAttackSource = worldSource.slice(
  worldSource.indexOf('function worldMonsterAttackPlayer(entity) {'),
  worldSource.indexOf('function getWorldMonsterRespawnRateForEntry', worldSource.indexOf('function worldMonsterAttackPlayer(entity) {'))
);
const attacker = {name:'主動怪', currentHp:100};
const selected = {name:'玩家選定目標', currentHp:100};
let retaliationCalls = 0;
const worldCtx = {
  currentMonster:null, player:{hp:100},
  isAutoBattleRunning(){ return false; },
  isManualMonsterAttackRunning(){ return false; },
  getManualMonsterAttackTarget(){ return null; },
  monsterAttackPlayer(){}, updateMonsterUI(){},
  requestManualRetaliationAgainstMonster(monster){ retaliationCalls += monster === attacker ? 1 : 100; return true; }
};
vm.createContext(worldCtx);
vm.runInContext(worldAttackSource, worldCtx, {filename:'worldMonsterAttackPlayer.js'});
worldCtx.worldMonsterAttackPlayer(attacker);
assert('world-stream aggressive attack starts retaliation with no selected target', retaliationCalls === 1);
worldCtx.currentMonster = selected;
worldCtx.worldMonsterAttackPlayer(attacker);
assert('world-stream aggressive attack preserves existing selected target', worldCtx.currentMonster === selected);
assert('world-stream aggressive attack does not steal selected target', retaliationCalls === 1);

const battleSource = fs.readFileSync(path.join(root, 'js/battle.js'), 'utf8');
const manualValidatorBody = battleSource.match(/function isManualCombatTargetValid\(monster\) \{([\s\S]*?)\n\}/)?.[1] || '';
assert('manual target path does not use auto monster whitelist', !manualValidatorBody.includes('isAutoBattleMonsterAllowed'));

const report = {
  version: '0.9.82IA',
  suite: 'manual-combat-and-aggressive-retaliation',
  passed: passes.length,
  failed: failures.length,
  passes,
  failures
};
fs.writeFileSync(path.join(root, 'TEST_REPORT_0.9.82IA_MANUAL_COMBAT.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(1);
