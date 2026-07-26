const fs = require('fs');
const vm = require('vm');
function assert(value, message) { if (!value) throw new Error(message); }
function eq(actual, expected, message) { if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`); }

const monsters = JSON.parse(fs.readFileSync('data/monsters.json', 'utf8'));
const audit = JSON.parse(fs.readFileSync('data/monster_name_audit_2025_12.json', 'utf8'));
const byId = new Map(monsters.map(m => [Number(m.id), m]));
eq(monsters.length, 111, 'Active monster count');
eq(audit.changedCount, 44, '2025-12 mob_db corrected name count');
eq(byId.get(1165).name, '泥人', 'SAND_MAN translated name');
eq(byId.get(1386).name, '沙妖', 'SLEEPER translated name');
eq(byId.get(1372).name, '魔羌', 'GOAT translated name');
eq(byId.get(1025).name, '青蛇', 'SNAKE translated name');
eq(byId.get(1030).name, '毒蛇', 'ANACONDAQ translated name');

const infinite = monsters.filter(m => m.infiniteDefense === true);
eq(infinite.length, 8, 'RA plant/mushroom infinite-defense count');
for (const m of infinite) {
  eq(m.fixedDamagePerHit, 1, `${m.name} fixed damage`);
  for (const key of ['IgnoreMelee','IgnoreMagic','IgnoreRanged','IgnoreMisc']) assert(m.modeFlags?.[key] === true, `${m.name} missing ${key}`);
}

const formulaSource = fs.readFileSync('js/combat_formula_runtime.js', 'utf8');
const ctx = { console, Math, Date, window:null, player:{equipment:{}}, getItemData:()=>null };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(formulaSource, ctx, { filename:'combat_formula_runtime.js' });
const plant = byId.get(1078);
const baseContext = { target:plant, source:{}, applyDefense:false, applyElement:false, applyWeaponSize:false, applyEquipmentModifiers:false, applyRaceModifier:false };
eq(ctx.CombatFormulaRuntime.applyDamage(9999, {...baseContext, damageType:'physical', attackRangeType:'short'}), 1, 'Plant melee damage');
eq(ctx.CombatFormulaRuntime.applyDamage(9999, {...baseContext, damageType:'physical', attackRangeType:'long'}), 1, 'Plant ranged damage');
eq(ctx.CombatFormulaRuntime.applyDamage(9999, {...baseContext, damageType:'magic'}), 1, 'Plant magic damage');
eq(ctx.CombatFormulaRuntime.applyDamage(9999, {...baseContext, damageType:'misc'}), 1, 'Plant misc damage');
eq(ctx.CombatFormulaRuntime.applyDamage(9999, {...baseContext, damageType:'physical', attackRangeType:'short', hitCount:5}), 5, 'Plant five-hit physical damage');
eq(ctx.CombatFormulaRuntime.applyDamage(9999, {...baseContext, damageType:'magic', hitCount:7}), 7, 'Plant seven-hit magic damage');
const normal = { modeFlags:{}, race:'Brute', size:'Medium', element:'Neutral', elementLevel:1 };
eq(ctx.CombatFormulaRuntime.applyDamage(9999, {...baseContext, target:normal, damageType:'physical', attackRangeType:'short'}), 9999, 'Normal monster damage remains unchanged');

const world = fs.readFileSync('js/world_monster_test_runtime.js', 'utf8');
assert(world.includes('["CHASE", "RUSH", "WANDER"]'), 'RUSH must use walk animation');
assert(world.includes('_hurtLockUntil'), 'Monster hurt lock missing');
assert(world.includes('entity.aiState = "HURT"'), 'Monster hit-stun state missing');
assert(world.includes('overrideMotion === "hurt"'), 'Monster hurt override release missing');
const playerAtlas = fs.readFileSync('js/player_atlas_runtime.js', 'utf8');
assert(playerAtlas.includes('clearROStudioPlayerAttackMotionForMovement'), 'Player attack-to-walk interrupt missing');
assert(playerAtlas.includes('isROStudioPlayerActuallyMoving'), 'Actual player movement detector missing');
const battle = fs.readFileSync('js/battle.js', 'utf8');
assert(battle.includes('updateWorldMonsterHpBarFast(monster)'), 'Immediate monster HP refresh missing');
const css = fs.readFileSync('css/style.css', 'utf8');
assert(css.includes('transition: transform .035s linear'), 'Fast compositor HP response missing');
const html = fs.readFileSync('index.html', 'utf8');
assert((html.match(/\?v=0\.9\.82EV/g) || []).length >= 30, 'EV cache keys incomplete');

console.log('PASS 0.9.82EV monster name, movement animation, instant HP and RA plant damage');
console.log(JSON.stringify({ monsters:111, renamed:44, infiniteDefensePlants:8, fixedDamagePerHit:1, fiveHitDamage:5, cache:'0.9.82EV' }, null, 2));
