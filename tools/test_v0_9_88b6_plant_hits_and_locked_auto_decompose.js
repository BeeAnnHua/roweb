const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const combatFormula = read('js/combat_formula_runtime.js');
const skillEngine = read('js/skill_engine.js');
const playerSource = read('js/player.js');
const html = read('index.html');

const checks = [];
function check(name, condition) {
  if (!condition) throw new Error(`FAIL: ${name}`);
  checks.push(name);
}

const formulaContext = { window: {}, console, Math };
vm.createContext(formulaContext);
vm.runInContext(combatFormula, formulaContext, { filename: 'combat_formula_runtime.js' });
const runtime = formulaContext.window.CombatFormulaRuntime;
check('combat formula runtime exposes infinite-defense normalization', typeof runtime?.normalizeIncomingDamage === 'function');
check('five-hit skill deals five total damage to grass', runtime.normalizeIncomingDamage({ infiniteDefense:true, fixedDamagePerHit:1 }, 999999, { damageType:'physical', hitCount:5 }) === 5);
check('seven-hit magic deals seven total damage to grass', runtime.normalizeIncomingDamage({ infiniteDefense:true, fixedDamagePerHit:1 }, 999999, { damageType:'magic', hitCount:7 }) === 7);
check('normal targets keep their calculated damage', runtime.normalizeIncomingDamage({ infiniteDefense:false }, 321, { damageType:'physical', hitCount:5 }) === 321);

check('physical skill pipeline now receives the actual hit count', /resolvePhysicalSkill\(profile, level, target, \{ ratio: totalRatio, flatAddition, hits: hitCount,/.test(skillEngine));
check('final skill application normalizes by damage hit count', /const calculatedDamage = normalizeRuntimeDamageForHitTarget\(target, damage, \{[\s\S]*?damageHitCount:hitMeta\.damageHitCount/.test(skillEngine));
check('shared calculated-damage path also uses target-hit normalization', /function applyRuntimeCalculatedDamage[\s\S]*?normalizeRuntimeDamageForHitTarget\(target, calculatedDamage, options\)/.test(skillEngine));

const toggleMatch = playerSource.match(/function toggleInventoryItemAutoDecompose\(item\) \{[\s\S]*?\n\}\n\nfunction toggleInventoryItemLock/);
check('auto-decompose toggle function is present', Boolean(toggleMatch));
const toggleSource = toggleMatch[0].replace(/\n\nfunction toggleInventoryItemLock[\s\S]*$/, '');
const logs = [];
let saveCount = 0;
let updateCount = 0;
const selectionContext = {
  normalizeItemId:value => Number(value),
  getInventoryAutoDecomposeMarkedIds:() => selectionContext.marked,
  getItemData:id => ({ id, name:'測試物品' }),
  addBattleLog:message => logs.push(message),
  updateInventoryUI:() => { updateCount += 1; },
  saveGame:() => { saveCount += 1; },
  marked:[],
  console
};
vm.createContext(selectionContext);
vm.runInContext(toggleSource, selectionContext, { filename:'toggleInventoryItemAutoDecompose.js' });
const lockedResult = selectionContext.toggleInventoryItemAutoDecompose({ id:501, locked:true });
check('locked item cannot be added to auto-decompose list', lockedResult === false && selectionContext.marked.length === 0);
check('blocked locked selection does not save or redraw', saveCount === 0 && updateCount === 0);
check('blocked locked selection explains how to proceed', logs.some(message => message.includes('請先解除鎖定')));
const unlockedResult = selectionContext.toggleInventoryItemAutoDecompose({ id:501, locked:false });
check('unlocked item can still be added normally', unlockedResult === true && selectionContext.marked.includes(501));
check('successful unlocked selection persists once', saveCount === 1 && updateCount === 1);

check('B6 cache-bust is present for changed skill engine', /skill_engine\.js\?v=0\.9\.88B6/.test(html));
check('B6 cache-bust is present for changed player runtime', /player\.js\?v=0\.9\.88B6/.test(html));

console.log(`PASS: ${checks.length} B6 plant-hit and locked-selection checks`);
