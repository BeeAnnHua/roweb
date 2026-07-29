#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/temporary_test_supplies.json'), 'utf8'));
const itemIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/items/item_index.json'), 'utf8'));
const playerSource = fs.readFileSync(path.join(ROOT, 'js/player.js'), 'utf8');
const start = playerSource.indexOf('// 0.9.82HI 暫時單機測試補給');
const endMarker = 'window.grantTemporaryTestSuppliesOnce = grantTemporaryTestSuppliesOnce;';
const end = playerSource.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error('找不到 0.9.82HI 測試補給 Runtime。');
const block = playerSource.slice(start, end + endMarker.length);

const checks = [];
function check(name, ok, detail = null) { checks.push({ name, ok: Boolean(ok), detail }); }
function total(inv, id) {
  return (inv || []).filter(row => String(row.id) === String(id) && !row.instanceId)
    .reduce((sum, row) => sum + Number(row.count || 0), 0);
}
function createRuntime(initialPlayer) {
  const logs = [];
  const context = {
    window: { RO_WEB_DATA: { 'data/temporary_test_supplies.json': config } },
    player: JSON.parse(JSON.stringify(initialPlayer)),
    normalizeItemId: value => Number.isFinite(Number(value)) ? Number(value) : value,
    addBattleLog: text => logs.push(String(text)),
    console
  };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(block, context, { filename: 'player.js#temporary-test-supplies' });
  return { context, logs };
}

check('config_enabled_temporary', config.enabled === true && config.temporary === true, { enabled: config.enabled, temporary: config.temporary });
check('box_50', config.boxes?.length === 1 && Number(config.boxes[0].id) === 1100100 && Number(config.boxes[0].count) === 50, config.boxes);
check('materials_unique_44', config.materials?.length === 44 && new Set(config.materials.map(row => String(row.id))).size === 44, config.materials?.length);
check('materials_each_1000', config.materials.every(row => Number(row.count) === 1000), config.materials.filter(row => Number(row.count) !== 1000));
check('zeny_minimum_1b', Number(config.zenyMinimum) === 1000000000, config.zenyMinimum);

function collectSourceMaterialIds() {
  const refine = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/refine_rules.json'), 'utf8'));
  const grade = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/enchant_grade_rules.json'), 'utf8'));
  const dim = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/dim_glacier_enchant.json'), 'utf8'));
  const exchange = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/enchant_material_exchange.json'), 'utf8'));
  const ids = new Set();
  Object.values(refine.materials || {}).forEach(row => row?.itemId != null && ids.add(Number(row.itemId)));
  Object.values(grade.materials || {}).forEach(row => row?.id != null && ids.add(Number(row.id)));
  Object.values(dim.slots || {}).forEach(slot => (slot.items || []).forEach(item => (item.materials || []).forEach(row => ids.add(Number(row.id)))));
  (dim.upgrades || []).forEach(upgrade => (upgrade.materials || []).forEach(row => ids.add(Number(row.id))));
  (dim.reset?.materials || []).forEach(row => ids.add(Number(row.id)));
  (exchange.catalog || []).forEach(row => row?.id != null && ids.add(Number(row.id)));
  (exchange.recipes || []).forEach(recipe => {
    ['output','result'].forEach(key => recipe[key]?.id != null && ids.add(Number(recipe[key].id)));
    ['materials','inputs','costs'].forEach(key => {
      const value = recipe[key];
      const rows = Array.isArray(value) ? value : (value && typeof value === 'object' ? Object.values(value) : []);
      rows.forEach(row => row?.id != null && ids.add(Number(row.id)));
    });
  });
  return [...ids].sort((a,b)=>a-b);
}
const sourceIds = collectSourceMaterialIds();
const configIds = config.materials.map(row => Number(row.id)).sort((a,b)=>a-b);
check('materials_exact_source_union', JSON.stringify(sourceIds) === JSON.stringify(configIds), { sourceIds, configIds });

const missingData = [];
const missingIcons = [];
for (const row of [...config.boxes, ...config.materials]) {
  const data = itemIndex[String(row.id)];
  if (!data) missingData.push(row.id);
  const icon = data?.icon || data?.image;
  if (!icon || !fs.existsSync(path.join(ROOT, String(icon).replace(/^\.\//, '')))) missingIcons.push({ id: row.id, icon });
}
check('all_item_data_present', missingData.length === 0, missingData);
check('all_item_icons_present', missingIcons.length === 0, missingIcons);

const fresh = createRuntime({ inventory: [{ id: 1101, count: 1 }, { id: 501, count: 30 }, { id: 601, count: 100 }], zeny: 0 });
const freshGranted = fresh.context.window.grantTemporaryTestSuppliesOnce();
check('fresh_grant_returns_true', freshGranted === true, freshGranted);
check('fresh_marker_written', fresh.context.player[config.markerField] === config.grantOnceKey, fresh.context.player[config.markerField]);
check('fresh_box_exact_50', total(fresh.context.player.inventory, 1100100) === 50, total(fresh.context.player.inventory, 1100100));
const freshBad = config.materials.filter(row => total(fresh.context.player.inventory, row.id) !== 1000).map(row => ({ id: row.id, count: total(fresh.context.player.inventory, row.id) }));
check('fresh_materials_exact_1000', freshBad.length === 0, freshBad);
check('fresh_zeny_minimum', fresh.context.player.zeny === 1000000000, fresh.context.player.zeny);
check('fresh_summary_log', fresh.logs.length === 1 && fresh.logs[0].includes('44 種材料各 x1000'), fresh.logs);

const secondGranted = fresh.context.window.grantTemporaryTestSuppliesOnce();
check('second_grant_returns_false', secondGranted === false, secondGranted);
check('second_no_box_duplicate', total(fresh.context.player.inventory, 1100100) === 50, total(fresh.context.player.inventory, 1100100));
const secondBad = config.materials.filter(row => total(fresh.context.player.inventory, row.id) !== 1000).map(row => ({ id: row.id, count: total(fresh.context.player.inventory, row.id) }));
check('second_no_material_duplicate', secondBad.length === 0, secondBad);
check('second_no_extra_log', fresh.logs.length === 1, fresh.logs);

const existing = createRuntime({ inventory: [{ id: 501, count: 7 }, { id: 984, count: 12 }, { id: 1100100, count: 3 }], zeny: 7654321 });
existing.context.window.grantTemporaryTestSuppliesOnce();
check('existing_inventory_preserved', total(existing.context.player.inventory, 501) === 7, total(existing.context.player.inventory, 501));
check('existing_adds_exact_box_50', total(existing.context.player.inventory, 1100100) === 53, total(existing.context.player.inventory, 1100100));
check('existing_adds_material_1000', total(existing.context.player.inventory, 984) === 1012, total(existing.context.player.inventory, 984));
check('existing_zeny_raised_to_minimum', existing.context.player.zeny === 1000000000, existing.context.player.zeny);

const rich = createRuntime({ inventory: [], zeny: 2000000000 });
rich.context.window.grantTemporaryTestSuppliesOnce();
check('higher_zeny_not_reduced', rich.context.player.zeny === 2000000000, rich.context.player.zeny);

const failed = checks.filter(row => !row.ok);
const report = { version: '0.9.82HI', passed: checks.length - failed.length, failed: failed.length, checks };
fs.writeFileSync(path.join(ROOT, 'tools/test_hi_temporary_supplies_report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exit(failed.length ? 1 : 0);
