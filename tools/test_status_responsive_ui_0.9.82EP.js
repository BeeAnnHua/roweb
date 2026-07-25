const fs = require('fs');
const vm = require('vm');
function assert(v, m) { if (!v) throw new Error(m); }
function eq(a, b, m) { if (a !== b) throw new Error(`${m}: expected ${b}, got ${a}`); }

const jobs = JSON.parse(fs.readFileSync('data/jobs.json', 'utf8'));
const traitData = JSON.parse(fs.readFileSync('data/trait_statpoints.json', 'utf8'));
const ctx = {
  console, Math, Date, setTimeout, clearTimeout, requestAnimationFrame: fn => fn(),
  innerWidth: 1200,
  matchMedia: query => ({ matches: false, media: query }),
  addEventListener: () => {},
  window: null,
  document: { getElementById: () => null, createElement: () => ({}), querySelectorAll: () => [] },
  player: {
    baseLevel: 200, jobLevel: 1, jobKey: 'dragon_knight',
    stats: { str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1 },
    traits: { pow: 0, sta: 0, wis: 0, spl: 0, con: 0, crt: 0 },
    equipment: {}, equipmentCards: {}, activeBuffs: {}, combatModifiers: {}
  },
  getJobData: key => jobs[key] || { tier: 4, routeGroup: 'fourth', raJob: 'Novice' },
  getCurrentJobData: () => ({ raJob: 'Novice' }),
  getItemData: () => null,
  getTrainingBonusTotals: () => ({}), getPassiveSkillBonusTotals: () => ({}),
  getPassiveCombatModifierTotals: () => ({}), getActiveBuffBonusTotals: () => ({}),
  isPlayerMounted: () => false,
  RA_WALK_SPEED: { DEFAULT: 150 }, clampRaWalkSpeed: n => n,
  recalculatePlayerStats: () => {}, updatePlayerUI: () => {}, saveGame: () => {}, addBattleLog: () => {}
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('js/status_system.js', 'utf8'), ctx, { filename: 'status_system.js' });
vm.runInContext(`
  statPointData = ${JSON.stringify(JSON.parse(fs.readFileSync('data/statpoints.json', 'utf8')))};
  traitPointData = ${JSON.stringify(traitData)};
  jobStatBonuses = {};
  jobBasePoints = {};
  renewalJobAspd = {jobs:{Novice:{Fist:40,Shield:10}}};
`, ctx);
ctx.normalizeStatusData();

eq(ctx.isStatusAdvancedInlineMode(), false, 'Wide desktop uses side panel');
ctx.innerWidth = 800;
eq(ctx.isStatusAdvancedInlineMode(), true, 'Narrow viewport uses in-place replacement');
ctx.innerWidth = 1200;
ctx.matchMedia = () => ({ matches: true });
eq(ctx.isStatusAdvancedInlineMode(), true, 'Coarse pointer uses in-place replacement');

const source = fs.readFileSync('js/status_system.js', 'utf8');
for (const token of [
  'status-advanced-inline', 'advanced-inline-mode', 'isStatusAdvancedInlineMode',
  'close.textContent = "◀"', 'advancedToggle.textContent = player.statusAdvancedExpanded ? "◀" : "▶"',
  '返回能力值與特性素質', 'ensureStatusAdvancedResponsiveBinding'
]) assert(source.includes(token), `Missing responsive UI token ${token}`);
assert(!source.includes('角色＋裝備＋卡片＋技能＋Buff 最終加總'), 'Header subtitle must be removed');
assert(!source.includes('依 rAthena Renewal 與 ROItemSearch 效果分類顯示'), 'Damage-tab intro must be removed');

const css = fs.readFileSync('css/style.css', 'utf8');
for (const token of [
  '.status-advanced-panel:not(.status-advanced-inline)',
  'top: 0 !important;', 'bottom: 0 !important;',
  '.status-advanced-header .status-advanced-back',
  '.status-template-body.advanced-inline-mode',
  '.status-advanced-panel.status-advanced-inline'
]) assert(css.includes(token), `Missing responsive CSS token ${token}`);

const html = fs.readFileSync('index.html', 'utf8');
assert(!html.includes('?v=0.9.82EF'), 'Old EF cache key must be removed');
assert((html.match(/\?v=0\.9\.82EP/g) || []).length >= 30, 'All entry assets use EP cache key');
const policy = JSON.parse(fs.readFileSync('data/trait_combat_policy.json', 'utf8'));
eq(policy.version, '0.9.82EH', 'Policy version');
eq(policy.display.advancedPanelIntroVisible, false, 'Intro hidden policy');
assert(policy.display.advancedPanelMobile.includes('replace'), 'Mobile replacement policy');

console.log('PASS 0.9.82EP advanced status desktop alignment and mobile in-place replacement');
console.log(JSON.stringify({desktop:'side-by-side aligned',mobile:'in-place replacement',arrows:'plain triangles',introVisible:false,cache:'0.9.82EP'}, null, 2));
