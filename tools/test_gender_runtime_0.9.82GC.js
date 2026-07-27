const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const failures = [];
function check(value, name) { if (!value) failures.push(name); }

const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, {
    id, hidden: true, disabled: false, textContent: '', title: '', dataset: {},
    classList: { toggle() {}, add() {}, remove() {} },
    setAttribute() {}, focus() {}, querySelector() { return null; }
  });
  return elements.get(id);
}
const genderCards = ['male','female'].map(gender => ({
  dataset: { characterGender: gender }, disabled: false,
  classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {}, focus() {}
}));
const logs = [];
let saved = 0;
const context = {
  console,
  setTimeout, clearTimeout,
  requestAnimationFrame: callback => callback(),
  document: {
    body: { classList: { add() {}, remove() {} } },
    getElementById: id => element(id),
    querySelectorAll: selector => selector === '[data-character-gender]' ? genderCards : [],
    addEventListener() {}
  },
  player: {
    gender: 'male', genderChosen: true, characterAtlas: 'novice_male',
    jobKey: 'bard', job: '吟遊詩人', baseLevel: 99, baseExp: 123, jobLevel: 50, jobExp: 456,
    stats: {str:90}, traits:{pow:10}, learnedSkills:{1:9}, skills:{1:9},
    equipment:{weapon:1101}, equipmentInstances:{}, inventory:[{id:501,count:30}], zeny:777,
    map:null, currentCity:'prontera', lastFieldMap:'prontera_3x3_region_camera'
  },
  normalizeCharacterGenderValue(value) { return value === 'female' ? 'female' : value === 'male' ? 'male' : null; },
  withPlayerBuildMutation(reason, callback) { check(reason === 'gender_change', 'mutation reason'); return callback(); },
  updatePlayerUI() {}, updateTownUI() {}, updateCharacterGenderUI: undefined,
  saveGame() { saved += 1; return true; },
  addBattleLog(message) { logs.push(message); },
  window: null
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/character_gender.js'), 'utf8'), context, {filename:'character_gender.js'});

(async () => {
  const before = JSON.stringify({
    jobKey: context.player.jobKey, job: context.player.job, baseLevel: context.player.baseLevel,
    baseExp: context.player.baseExp, jobLevel: context.player.jobLevel, jobExp: context.player.jobExp,
    stats: context.player.stats, traits: context.player.traits, learnedSkills: context.player.learnedSkills,
    equipment: context.player.equipment, inventory: context.player.inventory, zeny: context.player.zeny,
    currentCity: context.player.currentCity, lastFieldMap: context.player.lastFieldMap
  });
  const ok = await context.applyCharacterGender('female');
  const after = JSON.stringify({
    jobKey: context.player.jobKey, job: context.player.job, baseLevel: context.player.baseLevel,
    baseExp: context.player.baseExp, jobLevel: context.player.jobLevel, jobExp: context.player.jobExp,
    stats: context.player.stats, traits: context.player.traits, learnedSkills: context.player.learnedSkills,
    equipment: context.player.equipment, inventory: context.player.inventory, zeny: context.player.zeny,
    currentCity: context.player.currentCity, lastFieldMap: context.player.lastFieldMap
  });
  check(ok === true, 'gender apply succeeds');
  check(context.player.gender === 'female' && context.player.genderChosen === true, 'gender changed and chosen');
  check(context.player.characterAtlas === null, 'atlas invalidated');
  check(before === after, 'protected character state unchanged');
  check(saved === 1, 'save invoked once');
  check(logs.some(x => x.includes('職業與所有養成資料皆保留')), 'preservation log');

  console.log(JSON.stringify({version:'0.9.82GC', passed: failures.length === 0, failures}, null, 2));
  process.exit(failures.length ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
