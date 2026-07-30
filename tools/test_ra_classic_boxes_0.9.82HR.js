const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = process.cwd();
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const boxes = read('data/item_boxes.json');
const itemIndex = read('data/items/item_index.json');
const manifest = read('data/items/database_manifest.json');
const checks = [];
function check(name, condition, detail = null) {
  if (!condition) throw new Error(`${name}: ${JSON.stringify(detail)}`);
  checks.push({ name, detail });
}

const expected = {
  ra_old_blue_box: { itemId: 603, rows: 1032, totalWeight: 8429, first: 501, last: 13304 },
  ra_old_violet_box: { itemId: 617, rows: 958, totalWeight: 9570, first: 501, last: 18103 },
  ra_gift_box: { itemId: 644, rows: 70, totalWeight: 88, first: 501, last: 7034 }
};

check('schema_v2', boxes.schema === 'ro_web_item_boxes_v2', boxes.schema);
check('version', boxes.version === '0.9.82HR', boxes.version);
check('dim_glacier_preserved', Boolean(boxes.boxes.ep19_dim_glacier_weapon_box));
check('manifest_reward_file', manifest.allDataPaths.includes('data/items/ra_classic_box_rewards_0_9_82HO.json'));

for (const [key, e] of Object.entries(expected)) {
  const box = boxes.boxes[key];
  const rewards = box?.rewards || [];
  check(`${key}_exists`, Boolean(box));
  check(`${key}_item`, Number(box.itemId) === e.itemId, box.itemId);
  check(`${key}_rows`, rewards.length === e.rows, rewards.length);
  check(`${key}_weight`, rewards.reduce((sum, row) => sum + Number(row.weight || 0), 0) === e.totalWeight);
  check(`${key}_first`, Number(rewards[0]?.itemId) === e.first, rewards[0]);
  check(`${key}_last`, Number(rewards.at(-1)?.itemId) === e.last, rewards.at(-1));
  check(`${key}_all_items_loaded`, rewards.every(row => itemIndex[String(row.itemId)]), rewards.filter(row => !itemIndex[String(row.itemId)]).slice(0, 10));
  const item = itemIndex[String(e.itemId)];
  check(`${key}_box_item_data`, item?.lootBoxId === key && item?.category === 'loot_box', item);
}

const giftSelf = boxes.boxes.ra_gift_box.rewards.find(row => Number(row.itemId) === 644);
check('gift_self_weight', Number(giftSelf?.weight) === 19, giftSelf);
const violetSelf = boxes.boxes.ra_old_violet_box.rewards.find(row => Number(row.itemId) === 617);
check('violet_self_weight', Number(violetSelf?.weight) === 103, violetSelf);

function makeSandbox(inventory) {
  const logs = [];
  let saves = 0;
  let updates = 0;
  const math = Object.create(Math);
  const sandbox = {
    console,
    Math: math,
    window: {},
    player: { inventory: JSON.parse(JSON.stringify(inventory)) },
    RO_WEB_DATA: { 'data/item_boxes.json': boxes },
    getItemData: id => itemIndex[String(id)] || null,
    addBattleLog: message => logs.push(message),
    updateInventoryUI: () => updates++,
    saveGame: options => { saves++; sandbox.lastSaveOptions = options; return true; },
    addItem: (item, count) => {
      const data = itemIndex[String(item.id)];
      if (!data) throw new Error(`missing item ${item.id}`);
      if (data.type === 'equipment') {
        for (let index = 0; index < count; index++) {
          sandbox.player.inventory.push({ id: data.id, name: data.name, count: 1, instanceId: `box-${data.id}-${index}-${sandbox.player.inventory.length}` });
        }
      } else {
        const stack = sandbox.player.inventory.find(row => String(row.id) === String(item.id) && !row.instanceId);
        if (stack) stack.count += count;
        else sandbox.player.inventory.push({ id: data.id, name: data.name, count });
      }
    },
    useItem: () => false
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/item_box_runtime.js'), 'utf8'), sandbox, { filename: 'item_box_runtime.js' });
  return { sandbox, logs, get saves() { return saves; }, get updates() { return updates; } };
}

// Boundary selection must retain the exact first/last RA rows.
{
  const runtime = makeSandbox([]).sandbox;
  for (const [key, e] of Object.entries(expected)) {
    runtime.Math.random = () => 0;
    check(`${key}_runtime_first`, Number(runtime.ItemBoxRuntime.weightedReward(boxes.boxes[key]).itemId) === e.first);
    runtime.Math.random = () => 0.999999999999;
    check(`${key}_runtime_last`, Number(runtime.ItemBoxRuntime.weightedReward(boxes.boxes[key]).itemId) === e.last);
  }
}

// Each official box opens through the same useItem chain as the Dim Glacier box.
for (const [key, e] of Object.entries(expected)) {
  const state = makeSandbox([{ id: e.itemId, name: itemIndex[String(e.itemId)].name, count: 1, locked: false }]);
  state.sandbox.Math.random = () => 0;
  check(`${key}_open`, state.sandbox.useItem(e.itemId) === true);
  check(`${key}_consumed`, !state.sandbox.player.inventory.some(row => Number(row.id) === e.itemId));
  check(`${key}_reward_added`, state.sandbox.player.inventory.some(row => Number(row.id) === e.first));
  check(`${key}_save`, state.saves === 1 && state.sandbox.lastSaveOptions?.reason === 'item-box-reward', state.sandbox.lastSaveOptions);
  check(`${key}_ui_update`, state.updates === 1);
}

// Official self-reward stays as a box in inventory; it does not recursively auto-open.
{
  const box = boxes.boxes.ra_gift_box;
  const before = box.rewards.slice(0, giftSelf.raIndex).reduce((sum, row) => sum + Number(row.weight), 0);
  const total = box.rewards.reduce((sum, row) => sum + Number(row.weight), 0);
  const state = makeSandbox([{ id: 644, name: itemIndex['644'].name, count: 1, locked: false }]);
  state.sandbox.Math.random = () => (before + Number(giftSelf.weight) / 2) / total;
  check('gift_self_open', state.sandbox.useItem(644) === true);
  check('gift_self_returns_one_box', state.sandbox.player.inventory.filter(row => Number(row.id) === 644).reduce((sum, row) => sum + Number(row.count || 0), 0) === 1, state.sandbox.player.inventory);
}

// Missing selected reward data aborts before consumption; probabilities are not silently reweighted.
{
  const mutableIndex = { ...itemIndex };
  delete mutableIndex['501'];
  const logs = [];
  const sandbox = {
    console,
    Math: Object.create(Math),
    window: {},
    player: { inventory: [{ id: 603, name: '神秘箱子', count: 1 }] },
    RO_WEB_DATA: { 'data/item_boxes.json': boxes },
    getItemData: id => mutableIndex[String(id)] || null,
    addBattleLog: message => logs.push(message),
    addItem: () => { throw new Error('must not add'); },
    updateInventoryUI: () => {},
    saveGame: () => { throw new Error('must not save'); },
    useItem: () => false
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/item_box_runtime.js'), 'utf8'), sandbox);
  sandbox.Math.random = () => 0;
  check('missing_reward_abort', sandbox.useItem(603) === false);
  check('missing_reward_not_consumed', sandbox.player.inventory[0].count === 1, sandbox.player.inventory);
  check('missing_reward_log', logs.some(message => message.includes('未消耗箱子')), logs);
}

const report = { version: '0.9.82HR', status: 'PASS', checks: checks.length, boxCount: 3, rewardUnion: 1081 };
fs.writeFileSync(path.join(ROOT, 'tools/test_ra_classic_boxes_report_0.9.82HR.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
