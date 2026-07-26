const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/player.js'), 'utf8');

function makeClassList(initial = []) {
  const set = new Set(initial);
  return {
    contains: value => set.has(value),
    add: (...values) => values.forEach(value => set.add(value)),
    remove: (...values) => values.forEach(value => set.delete(value)),
    toggle: (value, force) => {
      if (force === true) { set.add(value); return true; }
      if (force === false) { set.delete(value); return false; }
      if (set.has(value)) { set.delete(value); return false; }
      set.add(value); return true;
    }
  };
}

const elements = new Map();
function makeElement(id, classes = []) {
  const styleMap = new Map();
  const element = {
    id,
    textContent: '',
    classList: makeClassList(classes),
    style: {
      getPropertyValue: key => styleMap.get(key) || '',
      setProperty: (key, value) => styleMap.set(key, String(value))
    },
    closest: selector => selector === '.status-line' ? element : null,
    querySelector: () => null,
    querySelectorAll: () => [],
    childElementCount: 0,
    dataset: {}
  };
  elements.set(id, element);
  return element;
}

['playerName','playerJob','baseLevel','jobLevel','hp','sp','baseExp','jobExp','atk','def','matk','hit','flee','cri','aspd','zeny','blueGem','redGem','battlePlayerName','battlePlayerLevel'].forEach(id => makeElement(id));
makeElement('status-window');
makeElement('job-window');
makeElement('skill-window');

let statusRequests = 0;
let jobUpdates = 0;
let skillUpdates = 0;
let quickUpdates = 0;

const context = {
  console,
  window: {},
  document: {
    readyState: 'loading',
    addEventListener() {},
    getElementById: id => elements.get(id) || null,
    querySelectorAll: () => []
  },
  localStorage: { getItem: () => null, setItem() {}, clear() {}, length: 0, key: () => null, removeItem() {} },
  sessionStorage: { clear() {} },
  location: { origin: 'http://test', pathname: '/', replace() {} },
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  confirm: () => true,
  performance,
  getJobData: () => ({ name: '測試職業' }),
  getCurrentJobData: () => ({ name: '測試職業', baseMaxLevel:275, jobMaxLevel:60 }),
  expTables: { jobs: { test: { maxBaseLevel:275, maxJobLevel:60, base:[], job:[] }, novice: { maxBaseLevel:99, maxJobLevel:50, base:[], job:[] } } },
  getJobKeyFromName: () => 'novice',
  syncStatusPointCache() {},
  syncTraitPointCache() {},
  requestStatusUIUpdate() { statusRequests += 1; },
  updateStatusUI() { throw new Error('requestStatusUIUpdate fallback should not run'); },
  updateJobUI() { jobUpdates += 1; },
  updateSkillUI() { skillUpdates += 1; },
  updateQuickSlotUI() { quickUpdates += 1; },
  addBattleLog() {},
  loadJson: async () => ({}),
  caches: { keys: async () => [] }
};
context.window = context;
vm.createContext(context);

const appended = `
player = {
  jobKey:'test', job:'測試職業', baseLevel:200, jobLevel:60,
  hp:5000, maxHp:10000, sp:500, maxSp:1000,
  baseExp:0, baseExpToNext:100, jobExp:0, jobExpToNext:100,
  atk:100, def:50, matk:80, mdef:30, hit:200, flee:180, cri:20, aspd:190,
  pAtk:10, sMatk:8, res:20, mres:20, walkSpeed:150,
  stats:{str:100,agi:100,vit:100,int:100,dex:100,luk:100},
  traits:{pow:10,sta:10,wis:10,spl:10,con:10,crt:10},
  usedStatusPoints:10, usedTraitPoints:10,
  equipment:{weapon:1101}, equipmentInstances:{}, activeBuffs:{},
  statusTraitsExpanded:false, statusAdvancedExpanded:true, statusAdvancedTab:'damage',
  zeny:1000, blueGem:0, redGem:0, skills:{}, quickSlots:[]
};
for (let i = 0; i < 100; i += 1) updatePlayerUI();
if (${''}statusRequests !== 1) throw new Error('same status signature rebuilt more than once: ' + statusRequests);
if (${''}jobUpdates !== 1) throw new Error('same job signature rebuilt more than once: ' + jobUpdates);
if (${''}skillUpdates !== 1) throw new Error('same skill signature rebuilt more than once: ' + skillUpdates);
player.atk = 101;
updatePlayerUI();
if (${''}statusRequests !== 2) throw new Error('changed status signature did not refresh');
document.getElementById('status-window').classList.add('hidden-window');
player.atk = 102;
updatePlayerUI();
if (${''}statusRequests !== 2) throw new Error('hidden status window still refreshed');
document.getElementById('job-window').classList.add('hidden-window');
player.baseLevel = 201;
updatePlayerUI();
if (${''}jobUpdates !== 2) throw new Error('job update count changed unexpectedly before hidden test: ' + jobUpdates);
`;

// The last job assertion above is intentionally corrected below after running the visible update.
// Keep the test body readable by executing the real sequence in two stages.
vm.runInContext(source, context, { filename: 'player.js' });
vm.runInContext(`
player = {
  jobKey:'test', job:'測試職業', baseLevel:200, jobLevel:60,
  hp:5000, maxHp:10000, sp:500, maxSp:1000,
  baseExp:0, baseExpToNext:100, jobExp:0, jobExpToNext:100,
  atk:100, def:50, matk:80, mdef:30, hit:200, flee:180, cri:20, aspd:190,
  pAtk:10, sMatk:8, res:20, mres:20, walkSpeed:150,
  stats:{str:100,agi:100,vit:100,int:100,dex:100,luk:100},
  traits:{pow:10,sta:10,wis:10,spl:10,con:10,crt:10},
  usedStatusPoints:10, usedTraitPoints:10,
  equipment:{weapon:1101}, equipmentInstances:{}, activeBuffs:{},
  statusTraitsExpanded:false, statusAdvancedExpanded:true, statusAdvancedTab:'damage',
  zeny:1000, blueGem:0, redGem:0, skills:{}, quickSlots:[]
};
for (let i = 0; i < 100; i += 1) updatePlayerUI();
`, context);

if (statusRequests !== 1) throw new Error(`same status signature rebuilt ${statusRequests} times`);
if (jobUpdates !== 1) throw new Error(`same job signature rebuilt ${jobUpdates} times`);
if (skillUpdates !== 1) throw new Error(`same skill signature rebuilt ${skillUpdates} times`);
if (quickUpdates !== 100) throw new Error(`player did not delegate quick-slot diff checks: ${quickUpdates}`);

vm.runInContext('player.atk = 101; updatePlayerUI();', context);
if (statusRequests !== 2) throw new Error('changed status signature did not refresh');

context.document.getElementById('status-window').classList.add('hidden-window');
vm.runInContext('player.atk = 102; updatePlayerUI();', context);
if (statusRequests !== 2) throw new Error('hidden status window still refreshed');

context.document.getElementById('job-window').classList.add('hidden-window');
context.document.getElementById('skill-window').classList.add('hidden-window');
vm.runInContext('player.baseLevel = 201; player.skillPoints = 3; updatePlayerUI();', context);
if (jobUpdates !== 1) throw new Error('hidden job window still rebuilt');
if (skillUpdates !== 1) throw new Error('hidden skill window still rebuilt');

console.log('PASS 0.9.82FY status/runtime UI performance gating');
console.log(JSON.stringify({ statusRequests, jobUpdates, skillUpdates, quickUpdates }, null, 2));
