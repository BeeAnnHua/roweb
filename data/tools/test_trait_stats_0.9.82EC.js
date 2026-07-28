const fs = require('fs');
const vm = require('vm');
function assertEq(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}
function assertTrue(value, label) {
  if (!value) throw new Error(`${label}: expected truthy, got ${value}`);
}
const jobBonusData = JSON.parse(fs.readFileSync('data/job_stat_bonuses.json', 'utf8'));
const traitData = JSON.parse(fs.readFileSync('data/trait_statpoints.json', 'utf8'));
const jobs = JSON.parse(fs.readFileSync('data/jobs.json', 'utf8'));
const context = {
  console, Math, Date, setTimeout, clearTimeout,
  window: null,
  document: { getElementById: () => null, createElement: () => ({}) },
  confirm: () => true,
  player: {
    baseLevel: 275, jobLevel: 60, jobKey: 'dragon_knight',
    stats: { str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1 },
    traits: { pow: 0, sta: 0, wis: 0, spl: 0, con: 0, crt: 0 },
    equipment: { weapon: null, shield: null, leftWeapon: null }, activeBuffs: {}
  },
  getJobData: key => jobs[key] || (key === 'test_fourth' ? { tier: 4, routeGroup: 'fourth', raJob: 'Novice' } : { tier: 1, routeGroup: 'first', raJob: 'Novice' }),
  getCurrentJobData: () => ({ raJob: 'Novice' }), getItemData: () => null,
  getTrainingBonusTotals: () => ({}), getPassiveSkillBonusTotals: () => ({}), getActiveBuffBonusTotals: () => ({}),
  isPlayerMounted: () => false, RA_WALK_SPEED: { DEFAULT: 150 }, clampRaWalkSpeed: n => n,
  recalculatePlayerStats: () => {}, updatePlayerUI: () => {}, saveGame: () => {}, addBattleLog: () => {}
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/status_system.js', 'utf8'), context, { filename: 'status_system.js' });
vm.runInContext(`
  statPointData = ${JSON.stringify(JSON.parse(fs.readFileSync('data/statpoints.json', 'utf8')))};
  traitPointData = ${JSON.stringify(traitData)};
  jobStatBonuses = ${JSON.stringify(jobBonusData)};
  jobBasePoints = {novice:{baseHp:{'275':1000},baseSp:{'275':100}},dragon_knight:{baseHp:{'275':1000},baseSp:{'275':100}},test_fourth:{baseHp:{'275':1000},baseSp:{'275':100}}};
  renewalJobAspd = {jobs:{Novice:{Fist:40,Shield:10}}};
`, context);

// rAthena gives 7 points immediately on changing to a trait/fourth job.
for (const [lv, expected] of [[200,7],[201,13],[205,45],[220,159],[250,387],[275,577]]) {
  assertEq(context.getTotalTraitPointsForLevel(lv), expected, `Trait-job total points Lv${lv}`);
}
for (const [lv, expected] of [[200,0],[201,6],[205,38],[220,152],[250,380],[275,570]]) {
  assertEq(context.getTraitLevelPointsForLevel(lv), expected, `RO_WEB doubled level points Lv${lv}`);
}
assertEq(context.getTotalTraitPointsForLevel(200, 'novice'), 0, 'Non-fourth Lv200 has no job-change bonus');
assertEq(context.getTraitJobChangeBonus('dragon_knight', 200), 7, 'Fourth-job change bonus at Lv200');
assertEq(context.getTraitJobChangeBonus('novice', 200), 0, 'Non-trait job has no change bonus');
assertEq(context.getTraitPointsGainedAtLevel(201), 6, 'Lv201 gain');
assertEq(context.getTraitPointsGainedAtLevel(205), 14, 'Lv205 gain');
assertEq(context.getTotalStatusPointsForLevel(275), 4099, 'Normal status points freeze at Lv200');
assertEq(traitData.playerAllocationCap, 110, 'Trait allocation cap metadata');
assertEq(traitData.perTraitAllocationCap, 110, 'Per-trait allocation cap metadata');
assertEq(traitData.jobChangeBonus, 7, 'RA fourth-job change bonus metadata');
assertEq(traitData.maximumTraitJobTotalAt275, 577, 'Lv275 total including job-change bonus');
context.normalizeStatusData();
assertEq(context.getAvailableTraitPoints(), 577, 'Lv275 initial available trait points including job-change bonus');
assertTrue(context.isTraitAllocationJob(), 'Dragon Knight can allocate traits');

const dk = context.getJobStatBonus('dragon_knight', 60);
assertEq(dk.pow, 10, 'Dragon Knight POW Job bonus');
assertEq(dk.sta, 7, 'Dragon Knight STA Job bonus');
assertEq(dk.wis, 3, 'Dragon Knight WIS Job bonus');
assertEq(dk.spl, 5, 'Dragon Knight SPL Job bonus');
assertEq(dk.con, 7, 'Dragon Knight CON Job bonus');
assertEq(dk.crt, 8, 'Dragon Knight CRT Job bonus');
assertEq(['pow','sta','wis','spl','con','crt'].reduce((n,k)=>n+dk[k],0), 40, 'Dragon Knight total trait Job bonus');
const hn = context.getJobStatBonus('hyper_novice', 60);
assertEq(['pow','sta','wis','spl','con','crt'].reduce((n,k)=>n+hn[k],0), 40, 'Hyper Novice total trait Job bonus');
for (const [jobKey, job] of Object.entries(jobs)) {
  if (!(Number(job.tier || 0) === 4 || jobKey === 'hyper_novice' || String(job.routeGroup || '') === 'fourth')) continue;
  const bonus = context.getJobStatBonus(jobKey, 60);
  assertEq(['pow','sta','wis','spl','con','crt'].reduce((n,k)=>n+Number(bonus[k]||0),0), 40, `${jobKey} Lv60 Job trait total`);
}

assertTrue(context.allocateTraitPoint('pow'), 'Allocate first POW');
assertEq(context.player.traits.pow, 1, 'Allocated POW stored');
assertEq(context.getAvailableTraitPoints(), 576, 'Available after allocation');
context.player.traits.pow = 110;
context.normalizeStatusData();
assertEq(context.allocateTraitPoint('pow'), false, 'Player allocation cap 110');
context.player.jobKey = 'novice';
assertEq(context.allocateTraitPoint('sta'), false, 'Non-fourth job allocation blocked');

context.player.jobKey = 'test_fourth';
context.player.jobLevel = 60;
context.player.baseLevel = 275;
// A legal Lv275 fourth-job build can spend 570 doubled level points + 7 job-change points = 577.
context.player.traits = { pow:110, sta:110, wis:110, spl:110, con:110, crt:27 };
context.player.traitStats = context.player.traits;
context.normalizeStatusData();
let d = context.calculateDerivedPlayerStats();
assertEq(d.res, 290, 'STA 110 => RES 290');
assertEq(d.mres, 290, 'WIS 110 => MRES 290');
assertEq(d.pAtk, 58, 'POW 110 + CON 110 => P.ATK 58');
assertEq(d.sMatk, 58, 'SPL 110 + CON 110 => S.MATK 58');
assertEq(d.hPlus, 27, 'CRT 27 => H.Plus 27 in legal 577-point build');
assertEq(d.crate, 9, 'CRT 27 => C.RATE floor 9');
// A corrupted 660-point save is repaired back to the 577-point budget.
context.player.traits = { pow:110, sta:110, wis:110, spl:110, con:110, crt:110 };
context.player.traitStats = context.player.traits;
context.normalizeStatusData();
assertEq(context.player.usedTraitPoints, 577, 'Illegal saved allocation trimmed to earned budget');
assertEq(context.player.traits.crt, 27, 'Deterministic reverse-order trim');
// Test CRT 110 formula on its own legal allocation.
context.player.traits = { pow:0, sta:0, wis:0, spl:0, con:0, crt:110 };
context.player.traitStats = context.player.traits;
context.normalizeStatusData();
d = context.calculateDerivedPlayerStats();
assertEq(d.hPlus, 110, 'CRT 110 => H.Plus 110');
assertEq(d.crate, 36, 'CRT 110 => C.RATE floor 36');

// CombatFormulaRuntime is the authority for final critical multiplier ordering.
vm.runInContext(fs.readFileSync('js/combat_formula_runtime.js', 'utf8'), context, { filename: 'combat_formula_runtime.js' });
const criticalDamage = context.CombatFormulaRuntime.applyDamage(100, {
  damageType: 'physical', source: context.player, target: {}, applyElement: false,
  applyEquipmentModifiers: false, applyDefense: false, critical: true, minimumDamage: 0
});
assertEq(criticalDamage, 176, 'C.RATE 36 => final critical multiplier 1.76');

const statusSource = fs.readFileSync('js/status_system.js', 'utf8');
for (const token of ['status-trait-toggle','status-trait-panel','免費重置特性','Base Lv.200 轉為四轉後即可獲得 7 點']) {
  assertTrue(statusSource.includes(token), `UI source includes ${token}`);
}
const styleSource = fs.readFileSync('css/style.css', 'utf8');
for (const token of ['.status-trait-toggle','.status-trait-panel','.status-trait-plus','.status-trait-reset']) {
  assertTrue(styleSource.includes(token), `CSS includes ${token}`);
}
const bundleSource = fs.readFileSync('js/data_bundle.js', 'utf8');
assertTrue(bundleSource.includes('data/trait_statpoints.json'), 'Data bundle includes trait point table');
const skillSource = fs.readFileSync('js/skill_engine.js', 'utf8');
assertTrue(skillSource.includes('derived?.hPlus'), 'H.Plus enters common healing layer');
console.log('PASS 0.9.82EC rAthena Renewal trait stats, Lv200 fourth-job bonus, doubled level points, allocation and critical formula');
console.log(JSON.stringify({points:{jobChange:7,level201:6,total201:13,level205:38,total205:45,level275:570,total275:577},dragonKnight:dk,hyperNovice:hn,formulaChecks:{res290:290,mres290:290,pAtk58:58,sMatk58:58,hPlus110:d.hPlus,crate36:d.crate,criticalDamage}},null,2));
