const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const logs = [];
const confirms = [];

const ctx = {
  window: null,
  console,
  Math, Date, JSON, Number, String, Object, Array, Set, Map,
  document: { getElementById: () => null, querySelectorAll: () => [] },
  confirm: message => { confirms.push(String(message)); return true; },
  addBattleLog: message => logs.push(String(message)),
  recalculatePlayerStats: () => {},
  updateSkillUI: () => {},
  updatePlayerUI: () => {},
  saveGame: () => {},
  updateInventoryUI: () => {},
  DEFAULT_EQUIPMENT: {},
  normalizeSkillPrerequisites: value => Array.isArray(value) ? value : [],
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(read('js/job.js'), ctx, { filename: 'job.js' });

const skill = (id, name, maxLevel, requires = []) => ({
  id, officialId: id, code: `SK_${id}`, name, maxLevel, requiredJobLevel: 1, requires
});
const target = skill(9000, '目標技能', 5, [{ id: 9001, level: 5 }]);
const a = skill(9001, '前置A', 10, [{ id: 9002, level: 3 }]);
const b = skill(9002, '前置B', 10, [{ id: 9003, level: 2 }]);
const c = skill(9003, '前置C', 10, []);
const firstAid = skill(142, '急救術', 1, []);
const cartRevolution = skill(153, '手推車攻擊', 1, []);

ctx.__jobs = {
  test_job: { id: 'test_job', name: '測試職業', skillTreeChain: ['test_job'] },
  novice: { id: 'novice', name: '初學者', skillTreeChain: ['novice'] },
  high_novice: { id: 'high_novice', name: '轉生初學者', skillTreeChain: ['novice'] },
  merchant: { id: 'merchant', name: '商人', skillTreeChain: ['novice', 'merchant'] }
};
ctx.__skills = {
  skillIndex: { '9000': target, '9001': a, '9002': b, '9003': c, '142': firstAid, '153': cartRevolution },
  jobs: { test_job: [target, a, b, c], novice: [firstAid], merchant: [cartRevolution] }
};
vm.runInContext(`
  jobs = __jobs;
  skillsData = __skills;
  player = { jobKey:'test_job', jobLevel:50, skillPoints:4, learnedSkills:{}, pendingSkillAdds:{}, inventory:[], equipment:{}, stats:{} };
`, ctx);

// Insufficient points may stage a partial prerequisite chain, but must not consume
// real points before confirmation and must never skip an unmet prerequisite.
vm.runInContext('learnSkill(9000)', ctx);
assert.strictEqual(vm.runInContext('player.skillPoints', ctx), 4, 'staging must not consume skill points');
assert.deepStrictEqual(
  JSON.parse(vm.runInContext('JSON.stringify(player.pendingSkillAdds)', ctx)),
  { '9002': 2, '9003': 2 },
  'partial plan must spend in prerequisite order without learning target early'
);
assert(logs.some(line => line.includes('仍需') && line.includes('確認配點後才會正式消耗')), 'partial plan must explain remaining requirements and confirmation');

vm.runInContext('confirmPendingSkillPoints()', ctx);
assert.strictEqual(vm.runInContext('player.skillPoints', ctx), 0, 'confirmed partial plan must consume the staged cost');
assert.strictEqual(vm.runInContext('getSkillLevel(9003)', ctx), 2);
assert.strictEqual(vm.runInContext('getSkillLevel(9002)', ctx), 2);
assert.strictEqual(vm.runInContext('getSkillLevel(9001)', ctx), 0);
assert.strictEqual(vm.runInContext('getSkillLevel(9000)', ctx), 0);
assert(confirms[0].includes('前置C +2') && confirms[0].includes('前置B +2'), 'confirmation must list all staged changes');

// With enough additional points, the next click finishes all remaining prerequisites
// and only then stages the target skill itself.
vm.runInContext('player.skillPoints=7; learnSkill(9000)', ctx);
assert.deepStrictEqual(
  JSON.parse(vm.runInContext('JSON.stringify(player.pendingSkillAdds)', ctx)),
  { '9000': 1, '9001': 5, '9002': 1 },
  'second plan must finish remaining chain and target exactly once'
);
assert.strictEqual(vm.runInContext('player.skillPoints', ctx), 7, 'second stage also must not consume before confirmation');
vm.runInContext('confirmPendingSkillPoints()', ctx);
assert.strictEqual(vm.runInContext('player.skillPoints', ctx), 0);
assert.strictEqual(vm.runInContext('getSkillLevel(9000)', ctx), 1);
assert.strictEqual(vm.runInContext('getSkillLevel(9001)', ctx), 5);
assert.strictEqual(vm.runInContext('getSkillLevel(9002)', ctx), 3);
assert.strictEqual(vm.runInContext('getSkillLevel(9003)', ctx), 2);

// 0–2 job quest skills are native level 1, cost no skill points and return after reset/rebirth.
vm.runInContext(`
  player = { jobKey:'novice', jobLevel:10, skillPoints:0, learnedSkills:{}, pendingSkillAdds:{}, inventory:[], equipment:{}, stats:{} };
`, ctx);
assert.strictEqual(vm.runInContext('getSkillLevel(142)', ctx), 1, 'novice must automatically own First Aid');
vm.runInContext('player.jobKey="high_novice"; player.learnedSkills={};', ctx);
assert.strictEqual(vm.runInContext('getSkillLevel(142)', ctx), 1, 'reborn novice must automatically regain First Aid');
vm.runInContext('player.jobKey="merchant"; player.learnedSkills={};', ctx);
assert.strictEqual(vm.runInContext('getSkillLevel(153)', ctx), 1, 'applicable first/second job quest skill must be automatically owned');
assert.strictEqual(vm.runInContext('player.skillPoints', ctx), 0, 'auto-granted quest skills must not consume skill points');

console.log(JSON.stringify({
  version: '0.9.82EV',
  status: 'PASS',
  partialPlan: { staged: 4, confirmed: true, remainingExplained: true },
  completedChainLevels: { target: 1, A: 5, B: 3, C: 2 },
  autoQuestSkills: [142, 153]
}, null, 2));
