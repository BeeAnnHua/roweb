const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '..');
const autoSource = fs.readFileSync(path.join(root, 'js', 'auto_battle.js'), 'utf8');
const battleSource = fs.readFileSync(path.join(root, 'js', 'battle.js'), 'utf8');
const positionSource = fs.readFileSync(path.join(root, 'js', 'position_engine.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const context = {
  console, Date, Math, Number, String, Boolean, Object, Array, Set, Map, JSON,
  setTimeout: (fn) => { fn(); return 1; }, clearTimeout: () => {},
  document: {
    getElementById: () => null,
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: () => ({ appendChild() {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {} }),
    createTextNode: text => ({ textContent: text })
  }
};
context.window = context;
vm.createContext(context);
vm.runInContext(`
  let currentMonster = null;
  let __candidates = [];
  let __castChecks = {};
  let __targetCounts = {};
  let __buffSkills = [];
  let __buffCasts = 0;
  let __flyWingUses = 0;
  let player = {
    hp: 100, maxHp: 100, sp: 100, maxSp: 100,
    currentCity: null, position: { x: 0, y: 0 }, inventory: [], activeBuffs: {},
    autoCombat: {
      attack: { enabled: true, skillId: '100', spPercent: 0, level: 1, fallbackNormal: true },
      buffs: { '300': true }, teleport: { enabled: false, noTargetSeconds: 3 }
    }
  };
  function normalizeItemId(value) { return value ? String(value) : null; }
  function collectLiveCombatEnemies() { return __candidates; }
  function getCurrentDistanceToMonster(monster) { return Number(monster.distance || 0); }
  function selectWorldMonsterTestTarget(monster) { currentMonster = monster; return true; }
  function updateMonsterUI() {}
  function resetAutoNoTargetTimer() {}
  function addBattleLog() {}
  function getSkillDataById(id) {
    const numeric = Number(id);
    if (numeric === 300) return { id: 300, officialId: 300, skillType: 'buff', name: 'Test Buff' };
    return { id: numeric, officialId: numeric, skillType: 'attack', name: 'Skill ' + numeric };
  }
  function getRuntimeSkillUiType(skill) { return skill.skillType; }
  function getSkillLevel() { return 5; }
  function canCastSkill(skill) { return __castChecks[String(skill.id)] || { ok: true, level: 1 }; }
  function getActiveBuffBonusTotals() { return {}; }
  function isRuntimeSkillCasting() { return false; }
  function isPlayerActiveSkillLocked() { return false; }
  function normalizeActiveBuffs() {}
  function saveGame() {}
  function getSkillRuntimeProfile() { return {}; }
  function resolveRuntimeSkillTargets(profile, target, level) {
    const count = Number(__targetCounts[String(target?.testSkillId || 0)] || __targetCounts.default || 1);
    return Array.from({ length: count }, (_, index) => index === 0 ? target : ({ currentHp: 10, hp: 10, position: { x: index, y: 0 } }));
  }
  function getLearnedSkillsByType(type) { return type === 'buff' ? __buffSkills : []; }
  function castBuffSkill() { __buffCasts += 1; return true; }
  function getRuntimeAdjustedCastTime() { return { totalMs: 0 }; }
  function useFlyWing() { __flyWingUses += 1; return true; }
  function maintainWorldMonsterPopulation() {}
  function scheduleAutoBattleTick() {}
  function isAutoBattleRunning() { return true; }
  window.__setCandidates = value => { __candidates = value; };
  window.__setCurrent = value => { currentMonster = value; };
  window.__getCurrent = () => currentMonster;
  window.__setCastCheck = (id, value) => { __castChecks[String(id)] = value; };
  window.__clearCastChecks = () => { __castChecks = {}; };
  window.__setTargetCount = value => { __targetCounts.default = value; };
  window.__setBuffSkills = value => { __buffSkills = value; };
  window.__buffCasts = () => __buffCasts;
  window.__flyWingUses = () => __flyWingUses;
  window.__getPlayer = () => player;
`, context);
vm.runInContext(autoSource, context, { filename: 'auto_battle.js' });

function monster(name, distance, extra = {}) {
  return { name, currentHp: 100, hp: 100, distance, position: { x: distance, y: 0 }, _worldTestEntity: true, ...extra };
}

const results = [];
function test(name, fn) { fn(); results.push(name); }

const target = monster('Target', 20);
context.__setCandidates([target]);
context.__setCurrent(target);

test('legacy single attack migrates to four ordered slots and fixed one-second teleport', () => {
  context.normalizeAutoCombatSettings();
  const cfg = context.__getPlayer().autoCombat;
  assert.strictEqual(cfg.attacks.length, 4);
  assert.strictEqual(cfg.attacks[0].skillId, '100');
  assert.strictEqual(cfg.teleport.noTargetSeconds, 1);
  assert.strictEqual(cfg.normalAttack.enabled, true);
});

test('script-only healing items are recognized automatically', () => {
  const redHerb = { Script: 'itemheal rand(18,28),0;' };
  const honey = { scriptRaw: 'itemheal rand(70,100),rand(20,40);' };
  assert.strictEqual(context.getItemRecoveryValue(redHerb, 'hp'), 23);
  assert.strictEqual(context.getItemRecoveryValue(honey, 'hp'), 85);
  assert.strictEqual(context.getItemRecoveryValue(honey, 'sp'), 30);
});

test('explicit Green Herb recovery remains selectable', () => {
  assert.strictEqual(context.getItemRecoveryValue({ name: '綠色藥草', hp: 30, sp: 0 }, 'hp'), 30);
});

test('four-skill priority falls through an independent cooldown to the next skill', () => {
  const cfg = context.__getPlayer().autoCombat;
  cfg.attacks[0] = { enabled: true, skillId: '100', spPercent: 0, level: 1, minMonsters: 1, fallbackNormal: true };
  cfg.attacks[1] = { enabled: true, skillId: '200', spPercent: 0, level: 1, minMonsters: 1, fallbackNormal: true };
  cfg.attacks[2].enabled = false;
  cfg.attacks[3].enabled = false;
  context.__setCastCheck(100, { ok: false, delayBlock: { type: 'cooldown', remainingMs: 900 } });
  context.__setCastCheck(200, { ok: true, level: 1 });
  const choice = context.getAutoAttackSkill(target);
  assert.strictEqual(choice.skill.id, 200);
  assert.strictEqual(choice.slotIndex, 1);
});

test('monster-count condition skips a skill until its affected target count is met', () => {
  const cfg = context.__getPlayer().autoCombat;
  context.__clearCastChecks();
  cfg.attacks[0] = { enabled: true, skillId: '100', spPercent: 0, level: 1, minMonsters: 3, fallbackNormal: true };
  cfg.attacks[1] = { enabled: true, skillId: '200', spPercent: 0, level: 1, minMonsters: 1, fallbackNormal: true };
  context.__setTargetCount(2);
  const choice = context.getAutoAttackSkill(target);
  assert.strictEqual(choice.skill.id, 200);
});

test('normal attack can be completely disabled', () => {
  const cfg = context.__getPlayer().autoCombat;
  cfg.normalAttack.enabled = false;
  cfg.attacks.forEach(slot => { slot.enabled = false; slot.skillId = null; });
  const action = context.getAutoCombatAttackAction(target);
  assert.strictEqual(action.action, 'utility');
  assert.strictEqual(action.waitForConfiguredAction, true);
  cfg.normalAttack.enabled = true;
});

test('Boss and MVP are classified separately', () => {
  assert.strictEqual(context.getAutoBattleMonsterClass(monster('Boss', 1, { _category: 'boss' })), 'boss');
  assert.strictEqual(context.getAutoBattleMonsterClass(monster('MVP', 1, { _category: 'mvp', isBoss: true })), 'mvp');
});

test('configured MVP escape consumes the fly-wing path and clears the target', () => {
  const mvp = monster('MVP', 1, { _category: 'mvp' });
  const cfg = context.__getPlayer().autoCombat;
  cfg.teleport.avoidMvp = true;
  context.__setCurrent(mvp);
  context.__setCandidates([]);
  context.AUTO_BATTLE_CONTROLLER.lastAvoidTeleportAt = 0;
  assert.strictEqual(context.maybeAutoEscapeFromTarget(mvp), true);
  assert.strictEqual(context.__flyWingUses(), 1);
  assert.strictEqual(context.__getCurrent(), null);
});

test('Buff SP threshold blocks and later allows the cast', () => {
  const buff = { id: 300, officialId: 300, skillType: 'buff', name: 'Test Buff' };
  const cfg = context.__getPlayer().autoCombat;
  context.__setBuffSkills([buff]);
  cfg.buffs['300'] = { enabled: true, spPercent: 60 };
  context.__getPlayer().sp = 50;
  context.__getPlayer().maxSp = 100;
  const before = context.__buffCasts();
  assert.strictEqual(context.tryAutoBuffs(), false);
  assert.strictEqual(context.__buffCasts(), before);
  context.__getPlayer().sp = 80;
  assert.strictEqual(context.tryAutoBuffs(), true);
  assert.strictEqual(context.__buffCasts(), before + 1);
});

test('UI removes manual fly-wing and wait selector while exposing four attack slots', () => {
  assert.doesNotMatch(htmlSource, /onclick="useFlyWing\(\)"/);
  assert.doesNotMatch(htmlSource, /autoCombatTeleportSeconds/);
  assert.strictEqual((htmlSource.match(/id="autoCombatAttackSkill[1-4]"/g) || []).length, 4);
  assert.match(htmlSource, /autoCombatAvoidBoss/);
  assert.match(htmlSource, /autoCombatAvoidMvp/);
  assert.match(htmlSource, /autoCombatNormalAttackEnabled/);
});

test('position runtime fixes no-target teleport to one second and preserves avoidance flags', () => {
  assert.match(positionSource, /const waitSeconds = 1;/);
  assert.match(positionSource, /avoidBoss: player\.autoCombat\.teleport\?\.avoidBoss/);
  assert.match(positionSource, /avoidMvp: player\.autoCombat\.teleport\?\.avoidMvp/);
});

test('battle controller checks Boss-MVP escape before attacking', () => {
  assert.match(battleSource, /maybeAutoEscapeFromTarget\(target\)/);
});

console.log(`Auto Battle Features 0.9.82FA: ${results.length}/${results.length} PASS`);
for (const name of results) console.log(`PASS - ${name}`);
