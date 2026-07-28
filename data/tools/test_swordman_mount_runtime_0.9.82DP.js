const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const manifest = readJson('data/mounts/mount_manifest.json');
const runtime = readJson('data/skill_runtime/runtime_generated_all.json').skills;
const core = readJson('data/skills/skills_core_1.json').skills;
const jobConstitution = readJson('data/job_constitution.json');
const logs = [];
const learned = {63: 1, 2007: 0};
const context = {
  console, Date, Math, setTimeout, clearTimeout,
  window: null,
  player: {jobKey: 'knight', mountState: {mounted:false,type:null}, runtimeState:{}, learnedSkills:{}},
  skillsData: { runtimeProfiles: runtime },
  getSkillLevel: id => Number(learned[Number(id)] || 0),
  recalculatePlayerStats: () => {}, updatePlayerUI: () => {}, saveGame: () => {},
  addBattleLog: msg => logs.push(String(msg)),
  normalizeActiveBuffs: () => {},
  getActiveSkillLockState: () => null,
  getMagicSkillLockState: () => null,
  getActiveBuffBonusTotals: () => ({}),
  getPassiveSkillBonusTotals: () => ({}),
  getEquippedWeaponTypeRuntime: () => 'spear',
  hasEquippedShieldRuntime: () => false,
  currentMonster: null
};
context.window = context;
context.RO_WEB_DATA = {'data/mounts/mount_manifest.json': manifest};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/skill_engine.js'), 'utf8'), context, {filename:'skill_engine.js'});

assert(core['63'].skillType === 'support', 'KN_RIDING must be active/support for quick slot use');
const mountCheck = jobConstitution.commonRequirements.requiredUnequippedSystems.find(row => row.id === 'mount');
assert(mountCheck && mountCheck.playerFields.includes('mountState.mounted'), 'Job change must detect the real mountState.mounted field');
assert(context.resolvePlayerMountType('swordman') === 'peco', 'Knight must resolve to Peco');
assert(context.togglePlayerMount('swordman') === true, 'Knight must mount Peco');
assert(context.player.mountState.mounted && context.player.mountState.type === 'peco', 'Knight mount state mismatch');
assert(context.togglePlayerMount('swordman') === true && !context.player.mountState.mounted, 'Knight must dismount');

context.player.jobKey = 'rune_knight';
assert(context.resolvePlayerMountType('swordman') === 'dragon', 'Rune Knight must resolve to Dragon');
assert(context.togglePlayerMount('swordman') === false, 'Rune Knight without Dragon Training must not mount');
learned[2007] = 5;
assert(context.togglePlayerMount('swordman') === true, 'Rune Knight with Dragon Training must mount');
assert(context.player.mountState.type === 'dragon', 'Rune Knight must mount Dragon');

for (const sid of [2008, 2009, 5004, 6001]) {
  const p = runtime[String(sid)].runtimeProfile;
  assert(p.requiresMounted === true, `${sid} missing requiresMounted`);
  assert(p.requiresMountType === 'dragon', `${sid} missing dragon mount type`);
}
assert(runtime['57'].runtimeProfile.requiresMounted === true, 'Brandish Spear must require mount');
assert(runtime['64'].runtimeProfile.requiresMounted === true, 'Cavalier Mastery must be mount-only');
assert(runtime['397'].runtimeProfile.requiresMounted !== true, 'Spiral Pierce must remain usable unmounted');

context.player.mountState = {mounted:false,type:null};
context.player.jobKey = 'royal_guard';
assert(context.resolvePlayerMountType('swordman') === 'griffon', 'Royal Guard must resolve to Griffon');
assert(context.togglePlayerMount('swordman') === true, 'Royal Guard must mount Griffon');
assert(context.player.mountState.type === 'griffon', 'Royal Guard mount state mismatch');

context.player.jobKey = 'mage';
context.normalizeRuntimeCombatState();
assert(context.player.mountState.mounted === false, 'Incompatible job must auto-dismount');

for (const [key, def] of Object.entries(manifest.mounts)) {
  if (key === 'mado') continue;
  assert(Number(def.carryingCapacityBonus || 0) === 0, `${key} must not add carrying capacity`);
}
const training = runtime['2007'].runtimeProfile;
assert(!training.passiveBonuses.carryingCapacity && !training.passiveBonuses.weight, 'Dragon Training must not add carrying capacity');

console.log(JSON.stringify({
  version:'0.9.82DP',
  status:'PASS',
  mountTypes:['peco','dragon','griffon'],
  mountedRequiredSkills:[57,2008,2009,5004,6001],
  conditionalMountedSkills:[64,397],
  noWeightBonus:true,
  logCount:logs.length
}, null, 2));
