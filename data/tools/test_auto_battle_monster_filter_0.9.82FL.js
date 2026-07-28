const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/auto_battle.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
const battleSource = fs.readFileSync(path.join(root, 'js/battle.js'), 'utf8');
const positionSource = fs.readFileSync(path.join(root, 'js/position_engine.js'), 'utf8');

const live = [
  { id: 1001, name: '波利', currentHp: 50, position: { x: 100, y: 0 }, _category: 'normal', aiState: 'IDLE' },
  { id: 1002, name: '瘋兔', currentHp: 50, position: { x: 20, y: 0 }, _category: 'normal', aiState: 'IDLE' },
  { id: 1003, name: '天使波利', currentHp: 500, position: { x: 40, y: 0 }, _category: 'boss', aiState: 'IDLE' }
];

const context = {
  console,
  Date,
  Math,
  Map,
  Set,
  Array,
  Object,
  Number,
  String,
  Boolean,
  JSON,
  player: {
    map: 'test_map',
    lastFieldMap: 'test_map',
    currentCity: null,
    position: { x: 0, y: 0 },
    autoCombat: {},
    inventory: [],
    activeBuffs: {},
    learnedSkills: {},
    hp: 100,
    maxHp: 100,
    sp: 100,
    maxSp: 100
  },
  currentMap: {
    id: 'test_map',
    name: '測試地圖',
    monsters: [1001, 1002, 1003]
  },
  currentMonster: null,
  monsters: live.map(monster => ({ ...monster, maxHp: monster.currentHp })),
  getWorldMonsterProfile: () => ({
    pool: [
      { monsterId: 1001, category: 'normal' },
      { monsterId: 1002, category: 'normal' },
      { monsterId: 1003, category: 'boss' }
    ]
  }),
  getWorldMonsterTestEntities: () => live,
  collectLiveCombatEnemies: () => live,
  getCurrentDistanceToMonster: monster => Math.hypot(monster.position.x, monster.position.y),
  resetAutoNoTargetTimer: () => true,
  updateMonsterUI: () => true,
  addBattleLog: () => true,
  saveGame: () => true,
  document: {
    getElementById: () => null,
    querySelectorAll: () => []
  },
  window: {}
};
context.window = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'auto_battle.js' });

context.normalizeAutoCombatSettings();
let filter = context.window.getAutoBattleMapMonsterFilter('test_map', { create: true });
assert.strictEqual(filter.mode, 'all');
assert.strictEqual(context.window.isAutoBattleMonsterAllowed(live[0]), true);

filter.mode = 'include';
filter.selectedIds = ['1002'];
assert.strictEqual(context.window.isAutoBattleMonsterAllowed(live[0]), false, 'include mode must reject unselected monster');
assert.strictEqual(context.window.isAutoBattleMonsterAllowed(live[1]), true, 'include mode must allow selected monster');
assert.strictEqual(context.window.isAutoBattleTargetValid(live[0]), false, 'target validity must apply filter');
assert.strictEqual(context.window.isAutoBattleTargetValid(live[1]), true);
assert.deepStrictEqual(Array.from(context.window.collectAutoBattleTargets()).map(monster => monster.id), [1002]);
context.window.resetAutoBattleController({ running: true });
assert.strictEqual(context.window.acquireAutoBattleTarget().id, 1002, 'controller must acquire nearest allowed monster only');

filter.mode = 'exclude';
filter.selectedIds = ['1002'];
context.currentMonster = null;
context.window.resetAutoBattleController({ running: true });
assert.strictEqual(context.window.isAutoBattleMonsterAllowed(live[1]), false, 'exclude mode must reject selected monster');
assert.strictEqual(context.window.isAutoBattleMonsterAllowed(live[0]), true);
assert.strictEqual(context.window.acquireAutoBattleTarget().id, 1003, 'nearest non-excluded monster should be acquired');

filter.mode = 'include';
filter.selectedIds = [];
assert.strictEqual(context.window.canAutoBattleSearchForConfiguredTargets(), false, 'empty include list must disable search/teleport spam');
assert.strictEqual(context.window.collectAutoBattleTargets().length, 0);

context.currentMap = { id: 'other_map', name: '另一張地圖', monsters: [1001] };
context.player.map = 'other_map';
const other = context.window.getAutoBattleMapMonsterFilter('other_map', { create: true });
assert.strictEqual(other.mode, 'all', 'each map must start with independent all-mode settings');
context.currentMap = { id: 'test_map', name: '測試地圖', monsters: [1001, 1002, 1003] };
context.player.map = 'test_map';
assert.strictEqual(context.window.getAutoBattleMapMonsterFilter('test_map').mode, 'include', 'original map settings must persist independently');

// Saved filters must survive controller ticks before the panel is rendered.
let saved = context.window.getAutoBattleMapMonsterFilter('test_map', { create: true });
saved.mode = 'include';
saved.selectedIds = ['1002'];
const modeStub = { value: 'all' };
const listStub = {
  dataset: { mapId: 'test_map' },
  querySelectorAll: () => [{ checked: true, dataset: { autoMonsterFilterId: '1003' } }]
};
context.document.getElementById = id => id === 'autoCombatMonsterFilterMode' ? modeStub : (id === 'autoCombatMonsterFilterList' ? listStub : null);
context.syncAutoCombatSettingsFromUI({ save: false });
saved = context.window.getAutoBattleMapMonsterFilter('test_map');
assert.strictEqual(saved.mode, 'include', 'unrendered HTML defaults must not erase saved mode');
assert.deepStrictEqual(Array.from(saved.selectedIds), ['1002'], 'unrendered HTML defaults must not erase saved IDs');
listStub.dataset.renderSignature = 'rendered';
modeStub.value = 'exclude';
context.syncAutoCombatSettingsFromUI({ save: false });
saved = context.window.getAutoBattleMapMonsterFilter('test_map');
assert.strictEqual(saved.mode, 'exclude', 'rendered panel mode must synchronize');
assert.deepStrictEqual(Array.from(saved.selectedIds), ['1003'], 'rendered checkbox selection must synchronize');
context.document.getElementById = () => null;

const catalog = context.window.getAutoBattleMonsterCatalog();
assert.deepStrictEqual(Array.from(catalog).map(row => row.id), ['1001', '1002', '1003']);
assert.strictEqual(catalog.find(row => row.id === '1002').aliveCount, 1);
assert.strictEqual(catalog.find(row => row.id === '1003').category, 'boss');

for (const id of [
  'autoCombatMonsterFilterMode',
  'autoCombatMonsterFilterList',
  'autoCombatMonsterFilterSummary',
  'autoCombatMonsterFilterStatus'
]) assert(indexHtml.includes(`id="${id}"`), `missing UI element ${id}`);
assert(indexHtml.includes('只攻擊勾選怪物'));
assert(indexHtml.includes('不攻擊勾選怪物'));
assert(css.includes('.auto-monster-filter-list'));
assert(css.includes('.auto-monster-filter-row'));
assert(positionSource.includes('canAutoBattleSearchForConfiguredTargets'), 'no-target teleport must respect empty include mode');
assert(battleSource.includes('eligibleMonsterIds'), 'legacy single-monster maps must also respect filter');
assert(indexHtml.includes('v=0.9.82FL'), 'cache-busting version must be FL');

console.log(JSON.stringify({
  version: '0.9.82FL',
  catalogSpecies: catalog.length,
  includeAcquire: 1002,
  excludeAcquire: 1003,
  perMapPersistence: true,
  emptyIncludeTeleportGuard: true,
  result: 'PASS'
}, null, 2));
