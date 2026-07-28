'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const ROOT = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const json = rel => JSON.parse(read(rel));
const exists = rel => fs.existsSync(path.join(ROOT, rel));

const battle = read('js/battle.js');
const quick = read('js/quick_slots.js');
const position = read('js/position_engine.js');
const auto = read('js/auto_battle.js');
const skill = read('js/skill_engine.js');
const player = read('js/player.js');
const css = read('css/style.css');
const html = read('index.html');
const bundle = read('js/data_bundle.js');

// Evaluate the production cumulative-step function itself.
const match = battle.match(/function buildCumulativeDamageSteps\([\s\S]*?\n}\n(?=function showDamageNumber)/);
assert(match, 'buildCumulativeDamageSteps production function missing');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(`${match[0]}\nthis.buildCumulativeDamageSteps = buildCumulativeDamageSteps;`, ctx);
assert.deepStrictEqual(Array.from(ctx.buildCumulativeDamageSteps(2000, 10)), [200,400,600,800,1000,1200,1400,1600,1800,2000]);
const capped = Array.from(ctx.buildCumulativeDamageSteps(99999999, 999, 30));
assert(capped.length <= 30, 'visual sequence exceeds 30 nodes');
assert.strictEqual(capped.at(-1), 99999999, 'final cumulative value must equal exact total');
assert(battle.includes('hitCount: Math.max(1, Number(normalAttackResult?.visualHits || 1))'));
assert(quick.includes('hitCount: Math.max(1, Number(normalAttackResult?.visualHits || 1))'));
assert(skill.includes('hitCount:getRuntimeHitCount(skill, level)'), 'Falcon multi-hit display missing');
assert(css.includes('.damage-number.cumulative-damage-number'));
assert(css.includes('.damage-number.cumulative-damage-final'));
const skillCore = json('data/skills/skills_core_1.json');
const fireBolt = Object.values(skillCore.skills || skillCore).find(row => Number(row.officialId ?? row.id) === 19);
assert(fireBolt && fireBolt.name === '火箭術', 'Fire Bolt data missing');
assert.strictEqual(Number(fireBolt.runtimeProfile.visualHitCount[9]), 10, 'Fire Bolt Lv10 must expose ten visual hits');

// Auto chase + teleport target reset.
assert(position.includes('function getAutoBattleEffectiveAttackRange'));
assert(position.includes('return range + 24'));
assert(position.includes('function getPredictedMonsterChasePosition'));
assert(position.includes('onAutoBattleTeleportCompleted(previousTarget, { source:"fly_wing" })'));
assert(position.includes('onAutoBattleTeleportCompleted(previousTarget, { source:"butterfly_wing"'));
assert(skill.includes('onAutoBattleTeleportCompleted(previousTarget, { source:"skill"'));
assert(auto.includes('function onAutoBattleTeleportCompleted'));
assert(auto.includes('reacquireSuppressedUntil'));
assert(auto.includes('ignoredTargetUntil'));

// FL monster filter UI must remain present after FM changes.
for (const id of ['autoCombatMonsterFilterMode','autoCombatMonsterFilterList','autoCombatMonsterFilterSummary','autoCombatMonsterFilterStatus']) {
  assert(html.includes(`id="${id}"`), `missing retained FL UI ${id}`);
}
assert(html.includes('只攻擊勾選怪物'));
assert(html.includes('不攻擊勾選怪物'));
assert(css.includes('.auto-monster-filter-list'));
assert(css.includes('.auto-monster-filter-row'));

// Full-height scroll and persistent save action.
assert(html.includes('id="autoCombatSaveSettings" class="auto-combat-save-settings"'));
assert(css.includes('max-height: calc(100dvh - 58px)'));
assert(css.includes('overflow-y: auto !important'));
assert(css.includes('touch-action: pan-y'));
assert(css.includes('#autoCombatSaveSettings.auto-combat-save-settings'));
assert(css.includes('position: sticky'));

// Thanatos Tower map + RA-derived monsters and animation assets.
const maps = json('data/maps.json');
assert.strictEqual(maps.length, 11);
const map = maps.find(row => row.id === 'thanatos_tower_3x3_region_camera');
assert(map, 'Thanatos Tower map missing');
assert.strictEqual(map.sourceChunkRange, '091-099');
assert.strictEqual(map.chunkGrid.sourceTiles.length, 9);
assert.strictEqual(map.monsters.length, 21);
assert.strictEqual(map.worldWidth, 4608);
assert.strictEqual(map.worldHeight, 4608);
for (const rel of [...map.chunkGrid.sourceTiles, map.background, map.thumb]) assert(exists(rel), `missing map asset ${rel}`);

const monsterIds = [1191,1195,1275,1295,1320,1377,1694,1695,1696,1697,1698,1699,1700,1701,1702,1703,1704,1705,1706,1707,1708];
const monsters = json('data/monsters.json');
for (const id of monsterIds) {
  const row = monsters.find(m => Number(m.id) === id);
  assert(row, `monster ${id} missing`);
  assert(Number(row.level) > 0 && Number(row.maxHp) > 0 && Number(row.atk) >= 0, `invalid RA stats for ${id}`);
  assert(String(row.combatSource || '').includes('rAthena Renewal'), `RA source missing for ${id}`);
  assert(exists(row.animationAtlas), `atlas missing for ${id}`);
  assert(exists(row.animationJson), `animation JSON missing for ${id}`);
}
const thanatos = monsters.find(m => Number(m.id) === 1708);
assert(thanatos.isMvp === true && thanatos.isBoss === true && thanatos.displayScale === 1.5);
const spawn = json('data/monster_spawn_config.json').regions.thanatos_tower_3x3_region_camera;
assert(spawn && spawn.pool.length === 21);
const mvpSpawn = spawn.pool.find(row => Number(row.monsterId) === 1708);
assert(mvpSpawn && mvpSpawn.category === 'mvp' && mvpSpawn.maxAlive === 1 && mvpSpawn.persistentTimer === true);
for (const id of [1704,1705,1706,1707]) {
  const row = spawn.pool.find(x => Number(x.monsterId) === id);
  assert(row && row.category === 'rare' && row.maxAlive === 1 && row.countRateEligible === false);
}

// Shop consumables, real scripts, restrictions, icons, and runtime compatibility.
const itemIds = ['505','11621','11622','11623','11624','1100003','1100004','1100005'];
const consumables = json('data/items/consumables.json');
const shop = json('data/shops.json').tool_common;
const shopIds = new Set(shop.items.map(row => String(row.itemId)));
for (const id of itemIds) {
  const item = consumables[id];
  assert(item, `consumable ${id} missing`);
  assert(shopIds.has(id), `shop item ${id} missing`);
  assert(exists(item.icon), `icon missing for ${id}`);
  assert(String(item.scriptRaw || '').includes('itemheal'), `itemheal script missing for ${id}`);
}
assert.strictEqual(consumables['11621'].requiredLevel, 60);
assert.strictEqual(consumables['11624'].reuseDelayMs, 10000);
assert.strictEqual(consumables['1100003'].requiredLevel, 120);
assert.strictEqual(consumables['1100005'].requiredLevel, 180);
assert(consumables['505'].scriptRaw.includes('rand(40,60)'));
assert(player.includes('function canUseConsumableItem'));
assert(player.includes('function markConsumableItemUsed'));
assert(auto.includes('canUseConsumableItem(row.item, { silent:true })'));
assert(auto.includes('markConsumableItemUsed(itemData)'));

// Cache and bundled data.
assert(html.includes('v=0.9.82FM'));
assert(bundle.includes('thanatos_tower_3x3_region_camera'));
for (const id of itemIds) assert(bundle.includes(`"${id}"`) || bundle.includes(`\\"${id}\\"`), `bundle item ${id} missing`);

console.log(JSON.stringify({
  version:'0.9.82FM',
  cumulativeExample:Array.from(ctx.buildCumulativeDamageSteps(2000,10)),
  maps:maps.length,
  thanatosSpecies:map.monsters.length,
  shopConsumables:itemIds.length,
  monsterFilterRetained:true,
  autoPanelBottomReachable:true,
  result:'PASS'
}, null, 2));
