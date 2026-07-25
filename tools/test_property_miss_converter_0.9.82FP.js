const fs = require('fs');
const vm = require('vm');
const root = process.cwd();
const table = JSON.parse(fs.readFileSync(`${root}/data/combat_runtime/renewal_combat_tables.json`, 'utf8'));
function assert(condition, message) { if (!condition) throw new Error(message); }
const context = { console, Date, Math, setTimeout, clearTimeout, performance: { now: () => 0 } };
context.window = context;
context.player = {
  baseLevel: 100,
  stats: { str:100, agi:50, vit:50, int:100, dex:50, luk:1, pow:0, spl:0 },
  equipment: { weapon:1101, shield:null }, activeBuffs:{}, attackElement:null
};
context.loadJson = async () => table;
context.calculateDerivedPlayerStats = () => ({ stats:context.player.stats, atk:250, matk:250, matkMin:250, matkMax:250, patk:0, smatk:0, crate:0 });
context.getActiveBuffBonusTotals = () => ({});
context.getPassiveSkillBonusTotals = () => ({});
context.getTrainingBonusTotals = () => ({});
context.getItemData = id => id === 1101 ? { id:1101, slot:'weapon', category:'weapon', dbType:'Weapon', atk:100, weaponLevel:1, weaponType:'sword', dbSubType:'sword', element:'Neutral' } : null;
context.getSkillLevel = () => 0;
context.getActiveBuffSpecialValue = () => null;
context.getPassiveTargetDamageBonus = () => 0;
context.DefenseResolver = { physical: damage => damage, magic: damage => damage };
context.CriticalResolver = { resolve: () => ({ critical:false, multiplier:1 }) };
context.PerfectDodgeResolver = { resolve: () => ({ dodged:false, chance:0 }) };
context.HitResolver = { resolve: () => ({ hit:true, chance:100 }) };
context.getPlainPlayerObject = value => value || {};
context.addBattleLog = () => {};
vm.createContext(context);
for (const file of ['js/combat_formula_runtime.js', 'js/ra_renewal_damage_pipeline.js', 'js/combat_damage_pipeline.js']) {
  vm.runInContext(fs.readFileSync(`${root}/${file}`, 'utf8'), context, { filename:file });
}
const playerSource = fs.readFileSync(`${root}/js/player.js`, 'utf8');
const constantSource = playerSource.match(/const ITEM_PHYSICAL_ELEMENT_ENDOW_BUFF_ID\s*=\s*[^;]+;/);
const clearSource = playerSource.match(/function clearPhysicalElementEndow\([\s\S]*?\n}\nwindow\.clearPhysicalElementEndow = clearPhysicalElementEndow;/);
assert(constantSource && clearSource, 'Cannot locate converter clear function.');
vm.runInContext(`${constantSource[0]}\n${clearSource[0]}`, context);
(async () => {
  await context.CombatFormulaRuntime.load();
  const ghost4 = { element:'Ghost', elementLevel:4, size:'Medium', race:'Demon', def:0, mdef:0, currentHp:1000 };
  const normal = context.CombatDamagePipeline.resolveNormalAttack(ghost4, { skipHitCheck:true, criticalResult:{critical:false,multiplier:1} });
  assert(normal.damage === 0 && normal.miss === true && normal.propertyMiss === true, 'Neutral vs Ghost Lv4 must be MISS.');

  const fire2 = { element:'Fire', elementLevel:2, size:'Medium', race:'Formless', def:0, mdef:0, currentHp:1000 };
  context.player.activeBuffs.item_physical_element_endow = { expiresAt:Date.now()+100000, effects:{attackElementOverride:'Fire'} };
  context.player.attackElement = 'Fire';
  const blocked = context.CombatDamagePipeline.resolvePhysicalSkill({ elementSource:'weapon', handler:'physical_attack' }, 1, fire2, { ratio:100, skipHitCheck:true, criticalResult:{critical:false,multiplier:1} });
  assert(blocked.damage === 0 && blocked.miss === true, 'Fire converter vs Fire Lv2 must be MISS.');

  context.clearPhysicalElementEndow('weapon_unequip', { silent:true });
  assert(!context.player.activeBuffs.item_physical_element_endow && context.player.attackElement === null, 'Unequip must clear converter state.');
  const restored = context.CombatDamagePipeline.resolvePhysicalSkill({ elementSource:'weapon', handler:'physical_attack' }, 1, fire2, { ratio:100, skipHitCheck:true, criticalResult:{critical:false,multiplier:1} });
  assert(restored.damage > 0 && restored.miss !== true, 'Re-equipped neutral weapon must no longer use the old converter.');

  const holy1 = { element:'Holy', elementLevel:1, size:'Medium', race:'Angel', def:0, mdef:0, currentHp:1000 };
  const magic = context.CombatDamagePipeline.resolveMagicSkill({ elementSource:'skill', element:'Holy', handler:'magic_damage' }, 1, holy1, { ratio:100, hits:1, skipHitCheck:true });
  assert(magic.damage === 0 && magic.miss === true, 'Holy vs Holy Lv1 magic must be MISS.');
  console.log('PASS property MISS and converter clear/re-equip runtime');
})().catch(error => { console.error(error.stack || error); process.exit(1); });
