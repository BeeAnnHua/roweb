const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const manifest = readJson('data/mounts/mount_manifest.json');
const runtime = readJson('data/skill_runtime/runtime_generated_all.json').skills;
const skills = readJson('data/skills/skills_core_1.json').skills;
const logs = [];
const learned = {57: 10, 2007: 5, 2008: 10};
const context = {
  console, Date, Math, setTimeout, clearTimeout,
  window: null,
  player: {
    jobKey: 'knight',
    mountState: {mounted:false,type:null},
    runtimeState: {}, activeBuffs: {}, learnedSkills: {},
    sp: 999, hp: 999, maxSp: 999, maxHp: 999, zeny: 999999
  },
  skillsData: { runtimeProfiles: runtime },
  getSkillLevel: id => Number(learned[Number(id)] || 0),
  getCurrentJobSkills: () => [],
  getExtraSkillSkillList: () => [],
  normalizeActiveBuffs: () => {},
  getActiveSkillLockState: () => null,
  getMagicSkillLockState: () => null,
  getActiveBuffBonusTotals: () => ({}),
  getPassiveSkillBonusTotals: () => ({}),
  getEquippedWeaponTypeRuntime: () => 'spear',
  hasEquippedShieldRuntime: () => false,
  addBattleLog: (msg, type = null) => logs.push({msg:String(msg), type}),
  recalculatePlayerStats: () => {}, updatePlayerUI: () => {}, saveGame: () => {}
};
context.window = context;
context.RO_WEB_DATA = {'data/mounts/mount_manifest.json': manifest};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/skill_engine.js'), 'utf8'), context, {filename:'skill_engine.js'});

const expected = '需要使用坐騎才能使用該技能。';
assert(manifest.uiText.skillRequiresMount === expected, 'Manifest message mismatch');

const spBefore = context.player.sp;
const stateBefore = JSON.stringify(context.player.runtimeState);
let check = context.canCastSkill(skills['57'], 10);
assert(check.ok === false, 'Unmounted mounted-only skill must fail');
assert(check.reason === expected, 'Unmounted message must be unified');
assert(context.player.sp === spBefore, 'Precheck must not consume SP');
assert(JSON.stringify(context.player.runtimeState) === stateBefore, 'Precheck must not start cooldown/runtime state');
context.reportPendingRuntime(skills['57'], check.reason);
assert(logs.length === 1, 'Exactly one log expected');
assert(logs[0].msg === expected, 'Log must not prepend skill name');
assert(logs[0].type === 'error', 'Log must use red error type');

context.player.mountState = {mounted:true,type:'peco'};
context.player.jobKey = 'rune_knight';
check = context.canCastSkill(skills['2008'], 10);
assert(check.ok === false, 'Wrong mount type must fail');
assert(check.reason === expected, 'Wrong mount type must use same generic message');

context.player.mountState = {mounted:true,type:'dragon'};
check = context.canCastSkill(skills['2008'], 10);
assert(check.ok === true, 'Correct mount type must pass mount requirement');

const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
assert(/\.log-error\s*\{[^}]*#ff5a5a/i.test(css), 'Red log-error CSS missing');
const battle = fs.readFileSync(path.join(ROOT, 'js/battle.js'), 'utf8');
assert(/需要使用坐騎才能使用該技能/.test(battle) && /return\s+"error"/.test(battle), 'Battle log error classification missing');

console.log(JSON.stringify({
  version:'0.9.82DQ', status:'PASS', message:expected,
  unmountedNoSpCost:true, unmountedNoCooldown:true,
  wrongMountTypeUsesSameMessage:true, redLogType:true
}, null, 2));
