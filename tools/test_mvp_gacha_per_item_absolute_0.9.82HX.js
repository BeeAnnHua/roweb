#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const cfg = readJson('data/mvp_gacha.json');
const checks = [];
const check = (ok, name, detail='') => checks.push({ ok: !!ok, name, detail: String(detail) });

global.window = global;
global.document = undefined;
global.RO_WEB_DATA = { 'data/mvp_gacha.json': cfg };
global.player = { name:'測試者', inventory:[] };
global.getItemData = id => ({ id:Number(id), name:`Item ${id}` });
global.findInventoryItemById = () => null;
global.setInterval = () => 1;
global.setTimeout = () => 1;
global.useItem = () => false;
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'js/mvp_gacha_runtime.js'), 'utf8'), { filename:'mvp_gacha_runtime.js' });

check(MvpGachaRuntime.version === '0.9.82HX', 'Runtime version', MvpGachaRuntime.version);
check(cfg.version === '0.9.82HX', 'Config version', cfg.version);
const specialTotal = cfg.rareCategories.reduce((sum, row) => sum + Number(row.chanceBasisPoints || 0), 0);
check(specialTotal === 1061, 'Special reward total is 10.61%', specialTotal);
check(cfg.ordinaryFillBasisPoints === 8939, 'Ordinary pool is 89.39%', cfg.ordinaryFillBasisPoints);
check(specialTotal + cfg.ordinaryFillBasisPoints === 10000, 'Mother pool totals exactly 100%', specialTotal + cfg.ordinaryFillBasisPoints);

const expected = new Map([
  [4403, 1],
  [400368, 10], [420186, 10],
  [450175, 100], [480076, 100], [22202, 100], [490030, 100], [490097, 100],
  [450299, 10], [480312, 10], [470183, 10], [490404, 10],
  [12922, 500]
]);
const actual = new Map();
for (const category of cfg.rareCategories) {
  check(category.chanceMode === 'per_reward_absolute', `${category.id} uses per-reward absolute mode`, category.chanceMode);
  const rowSum = category.rewards.reduce((sum, reward) => sum + Number(reward.chanceBasisPoints || 0), 0);
  check(rowSum === Number(category.chanceBasisPoints), `${category.id} category total equals reward sum`, `${rowSum}/${category.chanceBasisPoints}`);
  for (const reward of category.rewards) actual.set(Number(reward.itemId), Number(reward.chanceBasisPoints));
}
check(JSON.stringify([...actual]) === JSON.stringify([...expected]), 'Every special reward has the requested absolute chance', JSON.stringify([...actual]));

const oldRandom = Math.random;
function rollAt(basisPoint) {
  Math.random = () => (basisPoint - 0.5) / 10000;
  try { return MvpGachaRuntime.rollReward(); }
  finally { Math.random = oldRandom; }
}

const boundaries = [
  [1, 4403, 1],
  [2, 400368, 10], [11, 400368, 10],
  [12, 420186, 10], [21, 420186, 10],
  [22, 450175, 100], [121, 450175, 100],
  [122, 480076, 100], [221, 480076, 100],
  [222, 22202, 100], [321, 22202, 100],
  [322, 490030, 100], [421, 490030, 100],
  [422, 490097, 100], [521, 490097, 100],
  [522, 450299, 10], [531, 450299, 10],
  [532, 480312, 10], [541, 480312, 10],
  [542, 470183, 10], [551, 470183, 10],
  [552, 490404, 10], [561, 490404, 10],
  [562, 12922, 500], [1061, 12922, 500]
];
for (const [roll, itemId, chance] of boundaries) {
  const result = rollAt(roll);
  check(result?.rare === true && Number(result?.row?.itemId) === itemId, `Roll ${roll} selects Item ${itemId}`, JSON.stringify(result));
  check(Number(result?.chanceBasisPoints) === chance, `Item ${itemId} announcement chance is absolute`, result?.chanceBasisPoints);
}
const ordinary = rollAt(1062);
check(ordinary?.rare === false, 'Ordinary pool starts immediately after 10.61%', JSON.stringify(ordinary));

const report = {
  version:'0.9.82HX',
  suite:'mvp-gacha-per-item-absolute-probability',
  passed:checks.filter(x => x.ok).length,
  failed:checks.filter(x => !x.ok).length,
  checks
};
fs.writeFileSync(path.join(ROOT, 'TEST_REPORT_0.9.82HX_MVP_GACHA_PER_ITEM.json'), JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
process.exit(report.failed ? 1 : 0);
