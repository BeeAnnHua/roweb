const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const core = JSON.parse(fs.readFileSync(path.join(root, 'data/skills/skills_core_1.json'), 'utf8'));
const runtime = JSON.parse(fs.readFileSync(path.join(root, 'data/skill_runtime/runtime_generated_all.json'), 'utf8'));

function findSkill(node, id) {
  if (Array.isArray(node)) {
    for (const row of node) {
      const found = findSkill(row, id);
      if (found) return found;
    }
  } else if (node && typeof node === 'object') {
    if (Number(node.officialId ?? node.id) === Number(id)) return node;
    for (const value of Object.values(node)) {
      const found = findSkill(value, id);
      if (found) return found;
    }
  }
  return null;
}

const skill = findSkill(core, 44);
if (!skill) throw new Error('AC_VULTURE / skill 44 missing from core');
const runtimeRow = runtime.skills?.['44'];
if (!runtimeRow?.runtimeProfile) throw new Error('AC_VULTURE runtime profile missing');

const bowItem = { id: 1001, range: 5, dbSubType: 'Bow', weaponType: 'bow', name: 'Test Bow' };
const context = {
  console,
  window: null,
  player: { learnedSkills: { '44': 10 }, equipment: { weapon: 1001 } },
  skillsData: {
    skillIndex: { '44': skill },
    runtimeProfiles: { '44': runtimeRow }
  },
  getCurrentJobSkills: () => [skill],
  getExtraSkillSkillList: () => [],
  getSkillLevel: id => Number(id?.officialId ?? id?.id ?? id) === 44 ? 10 : 0,
  getSkillDataById: id => Number(id?.officialId ?? id?.id ?? id) === 44 ? skill : null,
  getItemData: id => Number(id) === 1001 ? bowItem : null,
  getExtraSkillLevel: () => 0,
  getSkillPrimaryId: value => value,
  Date,
  Math,
  setTimeout,
  clearTimeout
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'js/skill_engine.js'), 'utf8'), context, { filename: 'skill_engine.js' });

if (!context.isRuntimePassiveSkill(skill)) {
  throw new Error(`skill 44 was not recognized as passive: type=${skill.type}, skillType=${skill.skillType}`);
}
const totals = context.getPassiveSkillBonusTotals();
if (Number(totals.attackRangeCells) !== 10) {
  throw new Error(`expected AC_VULTURE +10 cells, got ${JSON.stringify(totals)}`);
}

context.POSITION_CELL_SIZE_PX = 36;
context.weaponRangeConfigCache = null;
context.DEFAULT_WEAPON_RANGE_CELLS = { fist: 1, bow: 5 };
context.RO_WEB_DATA = {
  'data/weapon_types.json': {
    cellSizePx: 36,
    types: { fist: { attackRangeCells: 1 }, bow: { attackRangeCells: 5 } }
  }
};
const positionSource = fs.readFileSync(path.join(root, 'js/position_engine.js'), 'utf8');
const rangeStart = positionSource.indexOf('function getEquippedWeaponData()');
const rangeEnd = positionSource.indexOf('function getSkillRangeCells(skill)');
if (rangeStart < 0 || rangeEnd < 0) throw new Error('position range functions not found');
vm.runInContext(positionSource.slice(rangeStart, rangeEnd), context, { filename: 'position_range_slice.js' });

const cells = context.getPlayerNormalAttackRangeCells();
const pixels = context.getPlayerNormalAttackRange();
if (cells !== 15) throw new Error(`expected 15 cells, got ${cells}`);
if (pixels !== 540) throw new Error(`expected 540 px, got ${pixels}`);

for (const rel of ['js/player_atlas_runtime.js', 'js/monster_atlas_runtime.js', 'js/world_monster_test_runtime.js']) {
  const text = fs.readFileSync(path.join(root, rel), 'utf8');
  if (/\bnew\s+Image\s*\(/.test(text) || /(^|[^\w])Image\s*\(/m.test(text)) {
    throw new Error(`${rel} still depends on global Image constructor`);
  }
  if (!text.includes('document.createElement("img")')) {
    throw new Error(`${rel} does not create an img element`);
  }
}

const playerAtlasText = fs.readFileSync(path.join(root, 'js/player_atlas_runtime.js'), 'utf8');
const activateCount = (playerAtlasText.match(/^function activateROStudioPlayerCanvas\s*\(/gm) || []).length;
if (activateCount !== 1) throw new Error(`activateROStudioPlayerCanvas declaration count=${activateCount}`);

console.log(JSON.stringify({
  skillId: 44,
  declaredType: skill.type,
  legacySkillType: skill.skillType,
  passiveRangeCells: totals.attackRangeCells,
  baseBowCells: 5,
  totalCells: cells,
  totalPixels: pixels,
  imageLoaders: 'DOM img element',
  activateFunctionDeclarations: activateCount,
  status: 'PASS'
}, null, 2));
