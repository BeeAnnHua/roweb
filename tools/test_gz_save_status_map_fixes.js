const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

// Player minute backup runtime.
const storage = new Map();
let intervalFn = null;
const ctx = {
  console,
  Math,
  Date,
  JSON,
  Number,
  String,
  Object,
  Array,
  Set,
  Map,
  currentMap: { id: 'prontera_3x3_region_camera' },
  localStorage: {
    getItem: key => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
    key: index => Array.from(storage.keys())[index] ?? null,
    get length() { return storage.size; }
  },
  setTimeout: fn => { fn(); return 1; },
  clearTimeout: () => {},
  setInterval: fn => { intervalFn = fn; return 123; },
  clearInterval: () => {},
  document: { addEventListener() {}, getElementById() { return null; }, querySelectorAll() { return []; }, body: { classList: { add(){}, remove(){} } } },
  addBattleLog() {},
  window: null
};
ctx.window = ctx;
ctx.window.addEventListener = () => {};
ctx.window.setTimeout = ctx.setTimeout;
ctx.window.clearTimeout = ctx.clearTimeout;
ctx.window.setInterval = ctx.setInterval;
ctx.window.clearInterval = ctx.clearInterval;
vm.createContext(ctx);
vm.runInContext(read('js/player.js'), ctx, { filename: 'player.js' });
vm.runInContext(`player={gender:'male',genderChosen:true,currentCity:null,map:'prontera_3x3_region_camera',state:'Idle',pendingSkillAdds:{1:1},inventory:[],equipment:{}}; window.player=player;`, ctx);
assert.strictEqual(vm.runInContext('saveGame()', ctx), true);
assert.strictEqual(vm.runInContext('writeMinutePlayerBackup("unit-test")', ctx), true);
const mainKey = 'ro_web_save_v0_9_19_ui_scroll_quickbar';
const backupKey = `${mainKey}_minute_backup_v1`;
assert(storage.has(mainKey), 'main save missing');
assert(storage.has(backupKey), 'minute backup missing');
const main = JSON.parse(storage.get(mainKey));
const backup = JSON.parse(storage.get(backupKey));
assert(!('pendingSkillAdds' in main), 'temporary skill allocation leaked into main save');
assert(!('pendingSkillAdds' in backup.player), 'temporary skill allocation leaked into backup');
assert.strictEqual(backup.reason, 'unit-test');
assert.strictEqual(backup.player.map, 'prontera_3x3_region_camera');
assert.strictEqual(vm.runInContext('startMinutePlayerBackup()', ctx), true);
assert(intervalFn, 'minute interval not registered');
vm.runInContext(`player.zeny=98765;`, ctx);
intervalFn();
assert.strictEqual(JSON.parse(storage.get(backupKey)).player.zeny, 98765, 'interval backup did not refresh snapshot');

// Map drop detail pinning/auto-scroll contract.
const mapSource = read('js/map.js');
for (const token of [
  'scrollMapMonsterDropDetailIntoView',
  'event.stopImmediatePropagation?.()',
  'row.addEventListener("pointerdown"',
  'if(options.pin===true)scrollMapMonsterDropDetailIntoView(tooltip,host)'
]) assert(mapSource.includes(token), `map fix token missing: ${token}`);

const css = read('css/style.css');
for (const token of [
  'RO_WEB 0.9.82GZ',
  'width: min(560px, calc(100vw - 8px)) !important;',
  'grid-template-columns: clamp(166px, 40%, 200px) minmax(0, 1fr) !important;',
  'max-height: min(72dvh, 650px) !important;',
  'max-height: min(78dvh, 680px) !important;'
]) assert(css.includes(token), `CSS fix token missing: ${token}`);

const index = read('index.html');
assert(index.includes('<title>RO_WEB 0.9.82GZ</title>'), 'GZ title missing');
const cacheKeys = [...index.matchAll(/\?v=([^"']+)/g)].map(match => match[1]);
assert(cacheKeys.length >= 30, 'entry cache keys missing');
assert(cacheKeys.every(key => key === '0.9.82GZ'), 'mixed cache versions remain');
assert(read('js/game.js').includes('const RO_WEB_VERSION = "0.9.82GZ";'), 'runtime version not GZ');

console.log(JSON.stringify({
  version: '0.9.82GZ',
  status: 'PASS',
  minuteBackup: true,
  backupRecoveryKey: backupKey,
  mobileStatusWidth: 560,
  mapDropPinGuard: true,
  longDropScroll: true
}, null, 2));
