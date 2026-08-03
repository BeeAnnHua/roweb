#!/usr/bin/env node
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const items = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/items/item_index.json'), 'utf8'));
const support = items['600012'];
const failures = [];
const check = (ok, label, detail = '') => { if (!ok) failures.push({ label, detail }); };

check(support.noSell === false, 'support noSell false', JSON.stringify(support.noSell));
check(support.noDecompose === false, 'support noDecompose false', JSON.stringify(support.noDecompose));
check(support.noStorage === true, 'support noStorage true', JSON.stringify(support.noStorage));
check(Number(support.sellPrice) > 0, 'support positive sell price', String(support.sellPrice));

// Execute the actual player.js decomposition functions against a granted support item.
const pctx = {
  console,
  items,
  window: { RO_EQUIPMENT_JOB_MAP: { jobs: { rune_knight: { jobKey: 'Rune_Knight', classKey: 'Normal' } } } },
  document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  setTimeout: fn => { fn(); return 1; },
  clearTimeout: () => {},
  structuredClone: global.structuredClone
};
vm.createContext(pctx);
let playerSource = fs.readFileSync(path.join(ROOT, 'js/player.js'), 'utf8');
playerSource += `\n;globalThis.__disposeTest={setPlayer(v){player=v},getPlayer(){return player},isInventoryItemDecomposeEligible,estimateInventoryDecompose,executeInventoryDecompose};`;
vm.runInContext(playerSource, pctx, { filename: 'player.js' });
pctx.addBattleLog = () => {};
pctx.updatePlayerUI = () => {};
pctx.updateInventoryUI = () => {};
pctx.saveGame = () => true;
pctx.getPassiveSkillBonusTotals = () => ({});
const row = { id: 600012, count: 1, locked: false, instanceId: 'support_1', characterBound: true, supportEquipment: true, noStorage: true, noDecompose: false, noSell: false };
pctx.__disposeTest.setPlayer({ inventory: [row], equipmentInstances: {}, zeny: 0 });
check(pctx.__disposeTest.isInventoryItemDecomposeEligible(row) === true, 'actual decompose eligibility');
const preview = pctx.__disposeTest.estimateInventoryDecompose({ mode: 'item', target: { itemRef: row } }, 1);
check(preview.amount === 1 && preview.zenyGain === Number(support.sellPrice), 'actual decompose preview', JSON.stringify(preview));
const result = pctx.__disposeTest.executeInventoryDecompose({ mode: 'item', target: { itemRef: row } }, 1);
check(result.ok === true, 'actual decompose execution', JSON.stringify(result));
check(pctx.__disposeTest.getPlayer().inventory.length === 0, 'decompose removes one item');
check(pctx.__disposeTest.getPlayer().zeny === Number(support.sellPrice), 'decompose credits sell value', String(pctx.__disposeTest.getPlayer().zeny));


// Execute the actual item detail sale runtime against an inventory support item.
const uictx = {
  console,
  window: null,
  player: { inventory: [], zeny: 0, equipment: {}, equipmentInstances: {} },
  items,
  document: { addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
  setTimeout: () => 1,
  clearTimeout: () => {},
  structuredClone: global.structuredClone,
  DEFAULT_EQUIPMENT: {},
  normalizeItemId: value => Number(value),
  getItemData: id => items[String(Number(id))] || null,
  normalizePlayerData() {}, showItemInfo() {}, closeItemInfo() {}, buildItemTooltip() {}, buildEquipmentTooltip() {},
  handleInventorySlotClick() {}, setEquipmentSlot() {}, equipItem() {}, moveEquipmentSlotToInventory() {},
  fixEquippedItemsInInventoryOnce() {}, addItemBackToInventory() {}, useItem() {}, addItem() {},
  getItemName: id => items[String(Number(id))]?.name || String(id),
  getEquipmentSlotName: slot => String(slot),
  canEquipItem: () => ({ ok:true }),
  saveGame: () => true,
  updatePlayerUI() {}, updateInventoryUI() {},
  logs: [],
  confirm: () => true
};
uictx.window = uictx;
uictx.addBattleLog = message => uictx.logs.push(String(message));
vm.createContext(uictx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/item_instance_ui.js'), 'utf8'), uictx, { filename: 'item_instance_ui.js' });
const saleRow = { ...row, instanceId:'support_sale_1' };
uictx.player.inventory = [saleRow];
const saleResult = uictx.sellSupportEquipmentInstance(saleRow);
check(saleResult.ok === true, 'actual sale execution', JSON.stringify(saleResult));
check(uictx.player.inventory.length === 0, 'sale removes exact support instance');
check(uictx.player.zeny === Number(support.sellPrice), 'sale credits sell value', String(uictx.player.zeny));
check(uictx.logs.some(line => line.includes('已販售')), 'sale writes system log', JSON.stringify(uictx.logs));
check(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').includes('item-detail-sell-action'), 'sale button in item detail HTML');

// Execute the actual storage runtime and verify the same support item is rejected.
const memory = {};
const sctx = {
  console,
  window: null,
  player: { inventory: [{ ...row }] },
  document: {
    getElementById: () => null,
    querySelectorAll: () => [],
    body: { classList: { add() {}, remove() {} } }
  },
  localStorage: {
    getItem: key => memory[key] ?? null,
    setItem: (key, value) => { memory[key] = String(value); },
    removeItem: key => { delete memory[key]; }
  },
  setTimeout,
  clearTimeout,
  structuredClone: global.structuredClone
};
sctx.window = sctx;
sctx.getItemData = id => items[String(Number(id))] || null;
sctx.normalizeItemId = id => Number(id);
sctx.updateInventoryUI = () => {};
sctx.saveGame = () => true;
sctx.renderStorageWindow = () => {};
sctx.bringWindowToFront = () => {};
vm.createContext(sctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/storage_runtime.js'), 'utf8'), sctx, { filename: 'storage_runtime.js' });
const before = sctx.player.inventory.length;
const deposited = sctx.depositStorageItem('instance:support_1', 1);
check(deposited === false, 'actual storage rejection', String(deposited));
check(sctx.player.inventory.length === before, 'storage rejection preserves item');
check((sctx.getAccountStorageSnapshot()?.items || []).length === 0, 'storage remains empty');

// The real grant path must preserve the custom policy on the inventory instance.
const runtime = fs.readFileSync(path.join(ROOT, 'js/newcomer_support_runtime.js'), 'utf8');
check(runtime.includes('noStorage:true,noDecompose:false,noSell:false'), 'grant instance policy');

const total = 18;
const report = { version: '0.9.83A', suite: 'support-disposal-storage', passed: total - failures.length, failed: failures.length, failures };
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(1);
