const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '..');
const autoSource = fs.readFileSync(path.join(root, 'js', 'auto_battle.js'), 'utf8');
const battleSource = fs.readFileSync(path.join(root, 'js', 'battle.js'), 'utf8');
const positionSource = fs.readFileSync(path.join(root, 'js', 'position_engine.js'), 'utf8');

const context = {
  console,
  Date,
  Math,
  Number,
  String,
  Boolean,
  Object,
  Array,
  Set,
  Map,
  JSON,
  setTimeout: (fn) => { fn(); return 1; },
  clearTimeout: () => {},
  document: {
    getElementById: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ appendChild() {}, classList: { add() {}, remove() {}, toggle() {} } })
  }
};
context.window = context;
vm.createContext(context);
vm.runInContext(`
  let currentMonster = null;
  let __candidates = [];
  let __castCheck = { ok: true, level: 1 };
  let player = {
    hp: 100, maxHp: 100, sp: 100, maxSp: 100,
    currentCity: null, position: { x: 0, y: 0 }, inventory: [], activeBuffs: {},
    autoCombat: {
      hpPotion: { enabled: false, hpPercent: 50, itemId: null },
      spPotion: { enabled: false, spPercent: 30, itemId: null },
      heal: { enabled: false, skillId: null, hpPercent: 60, spPercent: 20, level: 1 },
      attack: { enabled: true, skillId: '100', spPercent: 0, level: 1, fallbackNormal: true },
      buffs: {}, teleport: { enabled: false, noTargetSeconds: 3 }
    }
  };
  function collectLiveCombatEnemies() { return __candidates; }
  function getCurrentDistanceToMonster(monster) { return Number(monster.distance || 0); }
  function selectWorldMonsterTestTarget(monster) { currentMonster = monster; return true; }
  function updateMonsterUI() {}
  function resetAutoNoTargetTimer() {}
  function addBattleLog() {}
  function getSkillDataById(id) { return { id: Number(id), officialId: Number(id), skillType: 'attack', name: 'Test Skill' }; }
  function getRuntimeSkillUiType() { return 'attack'; }
  function getSkillLevel() { return 1; }
  function canCastSkill() { return __castCheck; }
  function getActiveBuffBonusTotals() { return {}; }
  function isRuntimeSkillCasting() { return false; }
  function isPlayerActiveSkillLocked() { return false; }
  function normalizeActiveBuffs() {}
  function saveGame() {}
  function normalizeItemId(value) { return value; }
  window.__setCandidates = value => { __candidates = value; };
  window.__setCurrent = value => { currentMonster = value; };
  window.__getCurrent = () => currentMonster;
  window.__setCastCheck = value => { __castCheck = value; };
  window.__getPlayer = () => player;
`, context);
vm.runInContext(autoSource, context, { filename: 'auto_battle.js' });

function monster(name, distance, extra = {}) {
  return { name, currentHp: 100, hp: 100, distance, position: { x: distance, y: 0 }, _worldTestEntity: true, ...extra };
}

const results = [];
function test(name, fn) {
  fn();
  results.push(name);
}

const A = monster('A', 100);
const B = monster('B', 50);
const C = monster('C', 150);

test('nearest target is selected when there is no lock', () => {
  context.resetAutoBattleController({ running: true });
  context.__setCurrent(null);
  context.__setCandidates([A, B]);
  assert.strictEqual(context.acquireAutoBattleTarget(), B);
});

test('valid current lock is stable even when another neutral target is closer', () => {
  A.aiState = 'IDLE'; B.aiState = 'IDLE';
  context.resetAutoBattleController({ running: true, keepTarget: false });
  context.__setCurrent(A);
  context.__setCandidates([A, B]);
  assert.strictEqual(context.acquireAutoBattleTarget(), A);
});

test('monster actively attacking the player preempts a non-attacking current lock', () => {
  A.aiState = 'RUSH'; A.provoked = true;
  B.aiState = 'ATTACK'; B.provoked = true;
  context.resetAutoBattleController({ running: true, keepTarget: false });
  context.__setCurrent(A);
  context.__setCandidates([A, B]);
  assert.strictEqual(context.acquireAutoBattleTarget(), B);
});

test('manual forced target overrides automatic attacker priority until invalid', () => {
  context.resetAutoBattleController({ running: true });
  context.__setCandidates([A, B, C]);
  assert.strictEqual(context.forceAutoBattleTarget(C), true);
  assert.strictEqual(context.acquireAutoBattleTarget(), C);
  C.currentHp = 0;
  assert.strictEqual(context.acquireAutoBattleTarget(), B);
  C.currentHp = 100;
});

test('dead stale current target is cleared during target acquisition', () => {
  const dead = monster('Dead', 1, { currentHp: 0 });
  A.aiState = 'IDLE'; A.provoked = false; A._aggroReason = null;
  B.aiState = 'IDLE'; B.provoked = false; B._aggroReason = null;
  context.resetAutoBattleController({ running: true });
  context.__setCurrent(dead);
  context.__setCandidates([A]);
  assert.strictEqual(context.acquireAutoBattleTarget(), A);
  assert.strictEqual(context.__getCurrent(), A);
});

test('selected skill cooldown falls back to normal attack', () => {
  context.__getPlayer().autoCombat.attack.fallbackNormal = true;
  context.__setCastCheck({ ok: false, delayBlock: { type: 'cooldown', remainingMs: 900 } });
  const action = context.getAutoCombatAttackAction(A);
  assert.strictEqual(action.action, 'normal');
  assert.strictEqual(action.fallbackFromSkill, true);
});

test('after-cast and action locks never use cooldown fallback', () => {
  context.__getPlayer().autoCombat.attack.fallbackNormal = true;
  context.__setCastCheck({ ok: false, delayBlock: { type: 'after_cast', remainingMs: 500 } });
  const action = context.getAutoCombatAttackAction(A);
  assert.strictEqual(action.action, 'utility');
  assert.strictEqual(action.waitForSkill, true);
});

test('fallback can still be disabled for later per-skill options', () => {
  context.__getPlayer().autoCombat.attack.fallbackNormal = false;
  context.__setCastCheck({ ok: false, delayBlock: { type: 'cooldown', remainingMs: 900 } });
  const action = context.getAutoCombatAttackAction(A);
  assert.strictEqual(action.action, 'utility');
  assert.strictEqual(action.waitForSkill, true);
  context.__getPlayer().autoCombat.attack.fallbackNormal = true;
});

test('utility controller runs without any monster target', () => {
  vm.runInContext(`
    let __utilityCount = 0;
    syncAutoCombatSettingsFromUI = () => true;
    normalizeAutoCombatSettings = () => true;
    autoUsePotion = () => { __utilityCount += 1; return true; };
    tryAutoHeal = () => false;
    tryAutoBuffs = () => false;
    window.__utilityCount = () => __utilityCount;
  `, context);
  context.__setCurrent(null);
  const action = context.runAutoCombatUtilityTick();
  assert.strictEqual(action.action, 'none');
  assert.strictEqual(context.__utilityCount(), 1);
});

test('defeated target enters TARGET_DEFEATED and releases forced lock', () => {
  context.resetAutoBattleController({ running: true });
  C.currentHp = 100;
  context.forceAutoBattleTarget(C);
  context.noteAutoBattleTargetDefeated(C);
  assert.strictEqual(context.AUTO_BATTLE_CONTROLLER.state, context.AUTO_BATTLE_STATES.TARGET_DEFEATED);
  assert.strictEqual(context.AUTO_BATTLE_CONTROLLER.forcedTarget, null);
});

test('battle integration contains immediate formal-world reacquire without legacy delay', () => {
  assert.match(battleSource, /formalMultiMonsterMap/);
  assert.match(battleSource, /acquireAutoBattleTarget\(\{ reason: "target_defeated" \}\)/);
  assert.match(battleSource, /runAutoCombatUtilityTick[\s\S]*acquireAutoBattleTarget/);
});

test('teleport integration refreshes the stream and reacquires immediately', () => {
  assert.match(positionSource, /maintainWorldMonsterPopulation/);
  assert.match(positionSource, /acquireAutoBattleTarget\(\{ reason: "teleport_reacquire" \}\)/);
});

console.log(`Auto Battle Controller 0.9.82EZ: ${results.length}/${results.length} PASS`);
for (const name of results) console.log(`PASS - ${name}`);
