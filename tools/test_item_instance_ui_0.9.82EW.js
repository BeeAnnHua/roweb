const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const logs = [];
const itemDb = {
  100: { id: 100, officialId: 100, name: '巨大雙手劍', type: 'equipment', slotCount: 2, equipSlot: 'weapon', icon: 'images/items/100.webp', atk: 200 },
  101: { id: 101, officialId: 101, name: '無洞長劍', type: 'equipment', slotCount: 0, equipSlot: 'weapon', icon: 'images/items/101.webp', atk: 100 },
  4001: { id: 4001, officialId: 4001, name: '海葵卡片', type: 'card', slotCount: 0, icon: 'images/items/4001.webp', description: ['人形種族傷害增加。'] },
  4002: { id: 4002, officialId: 4002, name: '木乃伊卡片', type: 'card', slotCount: 0, icon: 'images/items/4002.webp', description: ['命中率增加。'] },
  501: { id: 501, officialId: 501, name: '紅色藥水', type: 'consume', slotCount: 0, icon: 'images/items/501.webp' }
};

const ctx = {
  window: null,
  console,
  Math, Date, JSON, Number, String, Object, Array, Set, Map,
  setTimeout, clearTimeout,
  document: { addEventListener: () => {}, getElementById: () => null, createElement: () => ({}) },
  DEFAULT_EQUIPMENT: { weapon: null, shield: null, armor: null, garment: null, shoes: null, accessory1: null, accessory2: null, head: null, headMid: null, headLow: null },
  player: {
    inventory: [{ id: 100, count: 2 }, { id: 501, count: 5 }],
    equipment: { weapon: 100 },
    equipmentInstances: { weapon: { id: 100, refine: 9, cards: [] } },
    equipmentCards: { weapon: [4001, 4001, null, null] }
  },
  normalizeItemId: value => value === null || value === undefined || value === '' ? null : Number(value),
  normalizePlayerData: () => {},
  getItemData: id => itemDb[Number(id)] || null,
  addItem: () => {},
  showItemInfo: () => {},
  closeItemInfo: () => {},
  buildItemTooltip: () => '',
  buildEquipmentTooltip: () => '',
  handleInventorySlotClick: () => {},
  setEquipmentSlot: () => {},
  equipItem: () => {},
  moveEquipmentSlotToInventory: () => {},
  fixEquippedItemsInInventoryOnce: () => {},
  addItemBackToInventory: () => {},
  useItem: () => {},
  inventoryLockMode: false,
  addBattleLog: message => logs.push(String(message)),
  updateInventoryUI: () => {}, updateEquipmentUI: () => {}, updatePlayerUI: () => {}, saveGame: () => {}, recalculatePlayerStats: () => {},
  canEquipItem: () => ({ ok: true }), resolveEquipmentTargetSlot: () => 'weapon',
  isTwoHandedWeaponItem: () => false, isWeaponEquipmentItem: data => data?.equipSlot === 'weapon', isAssassinOffhandWeaponItem: () => false,
  normalizeEquipmentHandConflicts: () => {}, syncEquipmentGrantedSkills: () => {}, syncROStudioWeaponTypeFromEquipment: () => {},
  getEquipmentSlotName: slot => slot,
  hideGameTooltip: () => {},
  findInventoryItemById: id => ctx.player.inventory.find(row => String(row.id) === String(id)) || null,
  getItemName: id => itemDb[Number(id)]?.name || String(id),
  getItemTypeText: data => data.type,
  cleanItemDescriptionLines: data => data.description || [],
  stripROColorCodesForCheck: value => String(value),
  RO_CLIENT_ITEM_DISPLAY: {
    duplicateCardPrefixes: { '2': '兩倍', '3': '三倍', '4': '四倍' },
    cardPrefixNames: { '4001': '海葵的', '4002': '木乃伊的' },
    cardPostfixIds: [], cardItemAliases: {}, cardInfo: {}
  }
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(read('js/item_instance_ui.js'), ctx, { filename: 'item_instance_ui.js' });

ctx.normalizeAllItemInstances();
assert.strictEqual(ctx.player.inventory.filter(row => row.id === 100).length, 2, 'legacy stacked equipment must split into distinct instances');
const swordInstances = ctx.player.inventory.filter(row => row.id === 100);
assert.notStrictEqual(swordInstances[0].instanceId, swordInstances[1].instanceId, 'split equipment must have unique instance IDs');
assert.strictEqual(ctx.player.inventory.find(row => row.id === 501).count, 5, 'non-equipment stacks must remain stacked');

const equipped = ctx.getEquipmentInstance('weapon');
assert.strictEqual(equipped.refine, 9, 'equipped refine must survive migration');
assert.deepStrictEqual(Array.from(equipped.cards), [4001, 4001, null, null], 'legacy equipped card arrays must migrate into the equipment instance');
assert.strictEqual(ctx.buildEquipmentInstanceName(equipped, itemDb[100]), '+9 兩倍海葵的 巨大雙手劍 [2]');
assert.strictEqual(ctx.buildEquipmentInstanceName({ id: 100, refine: 9, cards: [4001, 4002] }, itemDb[100]), '+9 海葵的 木乃伊的 巨大雙手劍 [2]');
assert.strictEqual(ctx.buildEquipmentInstanceName({ id: 101, refine: 0, cards: [4001] }, itemDb[101]), '無洞長劍 [0]', 'cards outside native slot count must not alter the equipment name');
assert.strictEqual(ctx.buildItemTooltip(equipped, itemDb[100]), '+9 兩倍海葵的 巨大雙手劍 [2]', 'hover must contain only compact instance name');

// Unequip/re-equip must preserve the exact instance instead of collapsing by item ID.
ctx.moveEquipmentSlotToInventory('weapon', { silent: true });
assert.strictEqual(ctx.player.equipment.weapon, null);
const returned = ctx.player.inventory.find(row => row.instanceId === equipped.instanceId);
assert(returned, 'unequipped instance must return to inventory');
assert.strictEqual(returned.refine, 9);
assert.deepStrictEqual(Array.from(returned.cards), [4001, 4001, null, null]);
ctx.equipItem(itemDb[100], returned);
assert.strictEqual(ctx.player.equipment.weapon, 100);
const reequipped = ctx.getEquipmentInstance('weapon');
assert.strictEqual(reequipped.instanceId, equipped.instanceId, 'double-click equip path must preserve instance identity');
assert.strictEqual(reequipped.refine, 9);
assert.deepStrictEqual(Array.from(reequipped.cards), [4001, 4001, null, null]);

const client = JSON.parse(read('data/client_item_display_data.json'));
assert.strictEqual(client.duplicateCardPrefixes['2'], '兩倍');
assert.strictEqual(client.duplicateCardPrefixes['3'], '三倍');
assert.strictEqual(client.duplicateCardPrefixes['4'], '四倍');
assert(Object.keys(client.cardPrefixNames).length > 1700, 'client card prefix table must be populated');
assert(Object.keys(client.cardInfo).length > 1800, 'itemInfo card details must be populated');

console.log(JSON.stringify({
  version: '0.9.82EW', status: 'PASS',
  migratedEquipmentInstances: swordInstances.length,
  compactName: ctx.buildEquipmentInstanceName(reequipped, itemDb[100]),
  clientCardPrefixes: Object.keys(client.cardPrefixNames).length,
  clientCardDetails: Object.keys(client.cardInfo).length
}, null, 2));
