const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '..');
const autoSource = fs.readFileSync(path.join(root, 'js', 'auto_battle.js'), 'utf8');
const playerSource = fs.readFileSync(path.join(root, 'js', 'player.js'), 'utf8');
const positionSource = fs.readFileSync(path.join(root, 'js', 'position_engine.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const cssSource = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

const items = {
  506: { id: 506, officialId: 506, name: '綠色藥水', buyPrice: 40, description: ['治療毒、沉默、暗黑、混亂、幻覺。'] },
  511: { id: 511, officialId: 511, name: '綠色藥草', buyPrice: 20, hp: 30, description: ['可中和所有毒性，具有解毒功效。'] },
  525: { id: 525, officialId: 525, name: '萬能藥', buyPrice: 500, Script: 'sc_end SC_POISON; sc_end SC_SILENCE; sc_end SC_BLIND; sc_end SC_CONFUSION; sc_end SC_CURSE; sc_end SC_Hallucination;' },
  526: { id: 526, officialId: 526, name: '蜂膠', buyPrice: 7000, scriptRaw: 'itemheal rand(325,405),rand(40,60); sc_end SC_POISON; sc_end SC_SILENCE; sc_end SC_BLIND; sc_end SC_CONFUSION; sc_end SC_CURSE;' }
};

const context = {
  console, Date, Math, Number, String, Boolean, Object, Array, Set, Map, JSON,
  setTimeout: fn => { fn(); return 1; }, clearTimeout: () => {},
  document: {
    getElementById: () => null,
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: () => ({ appendChild() {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, addEventListener() {} }),
    createTextNode: text => ({ textContent: text })
  }
};
context.window = context;
vm.createContext(context);
vm.runInContext(`
  let currentMonster = null;
  let __learnedBuffs = [];
  let __learnedHeals = [];
  let __casts = [];
  let __logs = [];
  let __flyUses = 0;
  let __butterflyUses = 0;
  let player = {
    hp: 100, maxHp: 1000, sp: 10, maxSp: 100,
    currentCity: null, position: { x: 0, y: 0 }, inventory: [], activeBuffs: {}, runtimeState: { statuses: {} },
    autoCombat: { detox: { enabled: true }, teleport: { lowHpEnabled: false, lowHpPercent: 30, returnHome: { enabled: false, hpPercent: 10, cityId: 'prontera' } } }
  };
  function normalizeItemId(value) { return value === null || value === undefined || value === '' ? null : String(value); }
  function getItemData(id) { return __items[Number(id)] || null; }
  function findInventoryItemById(id) { return player.inventory.find(row => String(row.id) === String(id)) || null; }
  function getLearnedSkillsByType(type) { return type === 'buff' ? __learnedBuffs : type === 'heal' ? __learnedHeals : []; }
  function getSkillLevel(skillId) { return [...__learnedBuffs, ...__learnedHeals].some(skill => Number(skill.id) === Number(skillId)) ? 1 : 0; }
  function getSkillRuntimeProfile(skill) { return skill.runtimeProfile || {}; }
  function getRuntimeSkillUiType(skill) { return skill.skillType || skill.runtimeProfile?.handler || 'buff'; }
  function canCastSkill(skill, level) { return { ok: true, level }; }
  function getRuntimeAdjustedCastTime() { return { totalMs: 0 }; }
  function isRuntimeSkillCasting() { return false; }
  function castBuffSkill(skill) {
    __casts.push(skill.id);
    const profile = skill.runtimeProfile || {};
    const rows = [...(profile.effects?.clearStatuses || []), ...(profile.clearStatusesOnlyWhenPresent || [])];
    rows.forEach(key => { const normalized = String(key).toLowerCase().replace(/[ _-]/g, ''); delete player.runtimeState.statuses[normalized]; });
    return true;
  }
  function castHealSkill(skill) {
    __casts.push(skill.id);
    const profile = skill.runtimeProfile || {};
    (profile.clearStatuses || []).forEach(key => { const normalized = String(key).toLowerCase().replace(/[ _-]/g, ''); delete player.runtimeState.statuses[normalized]; });
    return true;
  }
  function calculateItemRecoveryAmount(value) { return Number(value || 0); }
  function addBattleLog(text) { __logs.push(text); }
  function updatePlayerUI() {}
  function updateInventoryUI() {}
  function saveGame() {}
  function useFlyWing() { __flyUses += 1; return true; }
  function useButterflyWing() { __butterflyUses += 1; return true; }
  function clearAutoBattleTarget() { currentMonster = null; }
  function maintainWorldMonsterPopulation() {}
  function acquireAutoBattleTarget() { return null; }
  function scheduleAutoBattleTick() {}
  function isAutoBattleRunning() { return true; }
  function resetAutoNoTargetTimer() {}
  function getActiveBuffBonusTotals() { return {}; }
  function isPlayerActiveSkillLocked() { return false; }
  function normalizeActiveBuffs() {}
  window.__items = ${JSON.stringify(items)};
  window.__player = () => player;
  window.__setStatuses = keys => { player.runtimeState = { statuses: {} }; keys.forEach(key => { player.runtimeState.statuses[key] = { id: key, expiresAt: 0 }; }); };
  window.__setInventory = rows => { player.inventory = rows.map(row => ({ ...row })); };
  window.__setLearned = (buffs, heals = []) => { __learnedBuffs = buffs; __learnedHeals = heals; };
  window.__casts = () => __casts.slice();
  window.__logs = () => __logs.slice();
  window.__escapeUses = () => ({ fly: __flyUses, butterfly: __butterflyUses });
`, context);
vm.runInContext(autoSource, context, { filename: 'auto_battle.js' });

const results = [];
function test(name, fn) { fn(); results.push(name); }

function statusSkill(id, name, statuses, type = 'buff') {
  return {
    id, officialId: id, name, skillType: type,
    runtimeProfile: type === 'heal'
      ? { handler: 'heal', targetPolicy: 'self', clearStatuses: statuses }
      : { handler: 'buff', targetPolicy: 'self', duration: 1000, effects: { clearStatuses: statuses } }
  };
}

test('item scripts dynamically expose every sc_end status', () => {
  const profile = context.getItemStatusCureProfile({ scriptRaw: 'sc_end SC_STUN; sc_end SC_BLEEDING; sc_end SC_BLIND;' });
  assert.deepStrictEqual([...profile.statuses].sort(), ['bleeding', 'blind', 'stun']);
});

test('Green Potion and Green Herb use itemInfo fallback cure profiles', () => {
  assert.deepStrictEqual([...context.getItemStatusCureProfile(items[506]).statuses].sort(), ['blind', 'confusion', 'hallucination', 'poison', 'silence']);
  const herb = context.getItemStatusCureProfile(items[511]).statuses;
  assert(herb.includes('poison'));
  assert(herb.includes('deadlypoison'));
});

test('Panacea and Royal Jelly are detected without a name whitelist', () => {
  assert(context.isAutoStatusCureItem(items[525]));
  assert(context.isAutoStatusCureItem(items[526]));
  assert(context.getItemStatusCureProfile(items[525]).statuses.includes('hallucination'));
  assert(context.getItemStatusCureProfile(items[526]).statuses.includes('curse'));
});

test('narrow cheap cure is selected for poison only', () => {
  context.__setStatuses(['poison']);
  context.__setInventory([{ id: 511, count: 2 }, { id: 506, count: 2 }, { id: 525, count: 2 }, { id: 526, count: 2 }]);
  assert.strictEqual(Number(context.findAutoStatusCureItem().item.id), 511);
});

test('one item covering more active ailments outranks a one-status herb', () => {
  context.__setStatuses(['poison', 'silence']);
  context.__setInventory([{ id: 511, count: 2 }, { id: 506, count: 2 }, { id: 525, count: 2 }]);
  assert.strictEqual(Number(context.findAutoStatusCureItem().item.id), 506);
});

test('Panacea is preferred over Royal Jelly for curse when both are available', () => {
  context.__setStatuses(['curse']);
  context.__setInventory([{ id: 525, count: 1 }, { id: 526, count: 1 }]);
  assert.strictEqual(Number(context.findAutoStatusCureItem().item.id), 525);
});

test('Royal Jelly clears ailments and applies script HP-SP recovery', () => {
  const player = context.__player();
  player.hp = 100; player.maxHp = 1000; player.sp = 10; player.maxSp = 100;
  context.__setStatuses(['curse']);
  context.__setInventory([{ id: 526, count: 1 }]);
  context.__setLearned([]);
  assert.strictEqual(context.tryAutoStatusCure(), true);
  assert.strictEqual(context.getPlayerActiveStatusKeys().length, 0);
  assert(player.hp >= 425 && player.hp <= 505);
  assert(player.sp >= 50 && player.sp <= 70);
  assert.strictEqual(player.inventory.length, 0);
});

test('learned cure skill is used before consuming an item', () => {
  context.__setStatuses(['blind']);
  context.__setInventory([{ id: 525, count: 1 }]);
  context.__setLearned([statusSkill(72, '痊癒術', ['blind', 'silence'])]);
  const beforeCount = context.__player().inventory[0].count;
  assert.strictEqual(context.tryAutoStatusCure(), true);
  assert.strictEqual(context.__casts().at(-1), 72);
  assert.strictEqual(context.__player().inventory[0].count, beforeCount);
  assert.strictEqual(context.getPlayerActiveStatusKeys().length, 0);
});

test('future learned heal-type cure skills are auto-discovered too', () => {
  context.__setStatuses(['stun']);
  context.__setInventory([]);
  context.__setLearned([], [statusSkill(9999, '未來治療技能', ['stun'], 'heal')]);
  assert.strictEqual(context.tryAutoStatusCure(), true);
  assert.strictEqual(context.__casts().at(-1), 9999);
});

test('all status-cure items are reserved from normal HP-SP auto supply', () => {
  assert.match(autoSource, /!isAutoStatusCureItem\(row\.item\)/);
  assert.match(autoSource, /isAutoStatusCureItem\(itemData\)/);
});

test('critical HP butterfly return has priority over low-HP fly wing', () => {
  const player = context.__player();
  player.currentCity = null; player.hp = 5; player.maxHp = 100;
  context.normalizeAutoCombatSettings();
  player.autoCombat.teleport.returnHome = { enabled: true, hpPercent: 10, cityId: 'prontera' };
  player.autoCombat.teleport.lowHpEnabled = true;
  player.autoCombat.teleport.lowHpPercent = 30;
  context.AUTO_BATTLE_CONTROLLER.lastButterflyAt = 0;
  context.AUTO_BATTLE_CONTROLLER.lastLowHpTeleportAt = 0;
  assert.strictEqual(context.tryAutoEmergencyEscape(), 'butterfly');
  const uses = context.__escapeUses();
  assert.strictEqual(uses.butterfly, 1);
  assert.strictEqual(uses.fly, 0);
});

test('escape thresholds are clamped to the requested 1-99 range', () => {
  const player = context.__player();
  player.autoCombat.teleport.lowHpPercent = 999;
  player.autoCombat.teleport.returnHome.hpPercent = 0;
  context.normalizeAutoCombatSettings();
  assert.strictEqual(player.autoCombat.teleport.lowHpPercent, 99);
  assert.strictEqual(player.autoCombat.teleport.returnHome.hpPercent, 1);
});

test('settings panel contains only direct controls and four numbered skill slots', () => {
  const panel = htmlSource.slice(htmlSource.indexOf('<section id="auto-combat-panel"'), htmlSource.indexOf('<div class="dev-buttons">'));
  assert.doesNotMatch(panel, /class="auto-hint"/);
  assert.match(panel, /自動解除異常狀態/);
  assert.match(panel, /autoCombatLowHpFlyPercent/);
  assert.match(panel, /autoCombatButterflyPercent/);
  assert.strictEqual((panel.match(/id="autoCombatAttackSkill[1-4]"/g) || []).length, 4);
});

test('number inputs use dark panel color and gold custom arrows', () => {
  assert.match(cssSource, /\.auto-number-control[\s\S]*background:\s*rgba\(31, 20, 8/);
  assert.match(cssSource, /\.auto-number-stepper button[\s\S]*color:\s*#e8b94f/);
  assert.match(autoSource, /\[\["▲", 1, "增加"\], \["▼", -1, "減少"\]\]/);
});

test('manual consumables also use itemheal and sc_end runtime helpers', () => {
  assert.match(playerSource, /getItemRecoveryProfile\(itemData, \{ roll: true \}\)/);
  assert.match(playerSource, /getItemStatusCureProfile\(itemData\)/);
  assert.match(playerSource, /clearPlayerStatuses\(matchedStatusKeys\)/);
});

test('butterfly wing runtime consumes item 602 and enters the selected city', () => {
  assert.match(positionSource, /BUTTERFLY_WING_ITEM_ID = 602/);
  assert.match(positionSource, /consumeInventoryItemCount\(BUTTERFLY_WING_ITEM_ID, 1\)/);
  assert.match(positionSource, /enterCity\(city\.id\)/);
});

console.log(`Auto Battle Survival 0.9.82FB: ${results.length}/${results.length} PASS`);
for (const name of results) console.log(`PASS - ${name}`);
