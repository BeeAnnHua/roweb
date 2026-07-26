const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.resolve(__dirname, '..');
const load = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const assert = (value, message) => { if (!value) throw new Error(message); };
const getLevelValue = (value, level) => Array.isArray(value) ? Number(value[level - 1] || 0) : Number(value || 0);

const core = load('data/skills/skills_core_1.json');
const runtime = load('data/skill_runtime/runtime_core_1_v1.json');
const generated = load('data/skill_runtime/runtime_generated_all.json');
const pending = load('data/skill_runtime/runtime_pending_review.json');
const ids = [1, 5075, 5076, 5077];

assert(runtime.version === '0.9.82CQ', 'runtime version');
assert(generated.summary.officialRuntime === 812, 'official count');
assert(generated.summary.pending === 327, 'pending count');
assert(pending.skills.length === 327, 'pending length');
ids.forEach(id => {
  assert(runtime.skills[String(id)]?.executionEnabled === true, `runtime ${id}`);
  assert(!pending.skills.some(entry => Number(entry.skillId) === id), `pending ${id}`);
});

// Basic Skill stays on the dedicated reward pipeline so it cannot be double-counted
// by the generic passive aggregation function.
const basicProfile = runtime.skills['1'].runtimeProfile;
assert(JSON.stringify(basicProfile.passiveBonuses.baseExpRate) === JSON.stringify([2,4,6,8,10,12,14,16,18]), 'basic Base EXP array');
assert(JSON.stringify(basicProfile.passiveBonuses.jobExpRate) === JSON.stringify([2,4,6,8,10,12,14,16,18]), 'basic Job EXP array');
assert(JSON.stringify(basicProfile.passiveBonuses.dropRate) === JSON.stringify([2,4,6,8,10,12,14,16,18]), 'basic drop array');
assert(JSON.stringify(basicProfile.passiveBonuses.zenyRate) === JSON.stringify([5,10,15,20,25,30,35,40,45]), 'basic Zeny array');
const jobJs = fs.readFileSync(path.join(root, 'js/job.js'), 'utf8');
assert(jobJs.includes('const zenyBonus = basicLevel * 5;'), 'Basic Skill Zeny implementation');
assert(jobJs.includes('totals.zenyRate += zenyBonus;'), 'Basic Skill Zeny reward aggregation');

let now = 1_000_000;
const sandbox = {
  console,
  window: null,
  document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
  setInterval: () => 0,
  clearInterval: () => {},
  setTimeout: () => 0,
  clearTimeout: () => {},
  Date: { now: () => now },
  Math: Object.create(Math),
};
sandbox.window = sandbox;
sandbox.player = {
  baseLevel: 100,
  jobLevel: 70,
  maxHp: 5000,
  hp: 1000,
  maxSp: 1000,
  sp: 100,
  stats: { str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1 },
  learnedSkills: { '5075': 5, '5076': 1, '5077': 5 },
  activeBuffs: {},
  equipment: {},
  position: { x: 0, y: 0 },
  jobKey: 'expanded_super_novice',
};
sandbox.skillsData = { skillIndex: {}, runtimeProfiles: runtime.skills };
ids.forEach(id => {
  sandbox.skillsData.skillIndex[String(id)] = {
    ...core.skills[String(id)],
    runtimeProfile: runtime.skills[String(id)].runtimeProfile,
  };
});
sandbox.getSkillLevel = id => Number(sandbox.player.learnedSkills[String(id)] || 0);
sandbox.getSkillDataById = id => sandbox.skillsData.skillIndex[String(id)] || null;
sandbox.getCurrentJobSkills = () => ids.map(id => sandbox.skillsData.skillIndex[String(id)]);
sandbox.getExtraSkillSkillList = () => [];
sandbox.getEquippedWeaponTypeRuntime = () => 'fist';
sandbox.recalculatePlayerStats = () => {};
sandbox.updatePlayerUI = () => {};
sandbox.saveGame = () => {};
sandbox.addBattleLog = () => {};

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'js/skill_engine.js'), 'utf8'), sandbox);

const passive = sandbox.getPassiveSkillBonusTotals();
assert(passive.maxHpFlat === 4000, `passive maxHpFlat ${passive.maxHpFlat}`);
assert(passive.maxSpFlat === 400, `passive maxSpFlat ${passive.maxSpFlat}`);
assert(passive.atkFlat === 100, `passive atkFlat ${passive.atkFlat}`);
assert(passive.matkFlat === 100, `passive matkFlat ${passive.matkFlat}`);
assert(passive.healPowerRate === 25, `passive healPowerRate ${passive.healPowerRate}`);

// Validate Help Angel's registered profile and the common periodic-heal engine.
const angelProfile = runtime.skills['5076'].runtimeProfile;
assert(angelProfile.targetPolicy === 'self', 'Help Angel Self Only');
assert(getLevelValue(angelProfile.duration, 1) === 20000, 'Help Angel duration');
assert(getLevelValue(angelProfile.periodicHpHealFlat, 1) === 1000, 'Help Angel HP heal');
assert(getLevelValue(angelProfile.periodicSpHealFlat, 1) === 350, 'Help Angel SP heal');
assert(getLevelValue(angelProfile.spCost, 1) === 1, 'Help Angel SP cost');

sandbox.player.sp -= 1;
sandbox.player.activeBuffs['5076'] = {
  id: 5076,
  name: '救援天使!',
  level: 1,
  effects: {},
  expiresAt: now + 20000,
  periodicIntervalMs: 1000,
  lastPeriodicTick: now,
  periodicHpHealFlat: 1000,
  periodicHpIntervalMs: 1000,
  lastPeriodicHpTick: now,
  periodicSpHealFlat: 350,
  periodicSpHealIntervalMs: 1000,
  lastPeriodicSpHealTick: now,
};
now += 1000;
sandbox.normalizeActiveBuffs();
assert(sandbox.player.hp === 2000, `Help Angel HP after 1s ${sandbox.player.hp}`);
assert(sandbox.player.sp === 449, `Help Angel SP after 1s ${sandbox.player.sp}`);

console.log(JSON.stringify({
  result: 'PASS',
  version: '0.9.82CQ',
  official: 812,
  pending: 327,
  noviceFamily: '102/118',
  basicRewardsAtLv9: { baseExpRate: 18, jobExpRate: 18, dropRate: 18, zenyRate: 45 },
  passive,
  helpAngelAfter1s: { hp: sandbox.player.hp, sp: sandbox.player.sp },
}, null, 2));
