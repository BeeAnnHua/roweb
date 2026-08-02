const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const consumables = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/items/consumables.json'), 'utf8'));
const context = {
  console,
  Date,
  Math,
  JSON,
  Promise,
  setTimeout,
  clearTimeout,
  window: null,
  document: {
    readyState: 'complete',
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener: () => {}
  },
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  }
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/player.js'), 'utf8'), context, { filename: 'player.js' });

const testItems = {
  12020: consumables['12020'],
  12114: consumables['12114'],
  12115: consumables['12115'],
  12116: consumables['12116'],
  12117: consumables['12117']
};
const logs = [];
context.__testLogs = logs;
context.__testItems = testItems;
vm.runInContext(`
  items = __testItems;
  player = {
    baseLevel: 200,
    inventory: Object.keys(items).map(id => ({ id: Number(id), count: Number(id) === 12114 ? 2 : 1, locked: false })),
    activeBuffs: {},
    itemReuseUntil: {},
    equipment: { weapon: null, shield: null }
  };
  addBattleLog = function(message){ __testLogs.push(String(message)); };
  updatePlayerUI = function(){};
  updateInventoryUI = function(){};
  saveGame = function(){};
  closeItemInfo = function(){};
  recalculatePlayerStats = function(){};
  invalidateCardRuntime = function(){};
`, context);
let genericRuntimeCalls = 0;
context.ConsumableRuntime = {
  apply() {
    genericRuntimeCalls += 1;
    return { handled: true, applied: false, blocked: true };
  }
};

const expectations = [
  [12114, 'Fire'],
  [12115, 'Water'],
  [12116, 'Earth'],
  [12117, 'Wind'],
  [12020, 'Dark']
];
const failures = [];
for (const [itemId, element] of expectations) {
  const beforeCount = vm.runInContext(`player.inventory.find(row => String(row.id) === String(${itemId}))?.count || 0`, context);
  if (beforeCount <= 0) failures.push(`${itemId}: initial stack missing`);
  const result = vm.runInContext(`consumeItem(items[${itemId}])`, context);
  const active = vm.runInContext('player.activeBuffs.item_physical_element_endow', context);
  const afterCount = vm.runInContext(`player.inventory.find(row => String(row.id) === String(${itemId}))?.count || 0`, context);
  if (result === false) failures.push(`${itemId}: consumeItem returned false`);
  if (!active || active.effects?.attackElementOverride !== element) {
    failures.push(`${itemId}: expected ${element} endow, got ${active?.effects?.attackElementOverride}`);
  }
  if (afterCount !== beforeCount - 1) failures.push(`${itemId}: expected exactly one item consumed, ${beforeCount} -> ${afterCount}`);

  // Reusing Fire while Fire is already active and after switching weapons must still refresh/consume.
  if (itemId === 12114) {
    vm.runInContext('player.equipment.weapon = { id: 999001, name: "測試新武器", element: "Neutral" };', context);
    const secondResult = vm.runInContext('consumeItem(items[12114])', context);
    const secondActive = vm.runInContext('player.activeBuffs.item_physical_element_endow', context);
    const secondCount = vm.runInContext('player.inventory.find(row => String(row.id) === "12114")?.count || 0', context);
    if (secondResult === false || secondActive?.effects?.attackElementOverride !== 'Fire') failures.push('12114: same-element refresh after weapon switch failed');
    if (secondCount !== 0) failures.push(`12114: second Fire converter was not consumed, remaining ${secondCount}`);
  }
}
if (genericRuntimeCalls !== 0) {
  failures.push(`element endow items incorrectly entered generic ConsumableRuntime ${genericRuntimeCalls} times`);
}
if (!logs.some(line => line.includes('火 肯貝特') && line.includes('火屬性'))) {
  failures.push('fire converter success log missing');
}
if (!logs.some(line => line.includes('暗水') && line.includes('暗屬性'))) {
  failures.push('dark water success log missing');
}

const report = {
  title: 'RO_WEB 0.9.82IC Elemental Converter Manual Use Regression',
  passed: 16 - failures.length,
  failed: failures.length,
  genericRuntimeCalls,
  finalElement: vm.runInContext('player.activeBuffs.item_physical_element_endow?.effects?.attackElementOverride || null', context),
  logs,
  failures
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(1);
