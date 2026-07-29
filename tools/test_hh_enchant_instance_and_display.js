const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const readJson = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

function makeClassList() {
  const set = new Set();
  return {
    add: (...names) => names.forEach(x => set.add(x)),
    remove: (...names) => names.forEach(x => set.delete(x)),
    toggle: (name, force) => {
      if (force === undefined) force = !set.has(name);
      force ? set.add(name) : set.delete(name);
      return force;
    },
    contains: name => set.has(name)
  };
}
function makeElement(id) {
  return {
    id, hidden: false, value: '', textContent: '', innerHTML: '', disabled: false,
    classList: makeClassList(), style: {}, dataset: {},
    setAttribute() {}, addEventListener() {}, querySelector() { return null; }
  };
}

// ---- Enchant transaction regression ----
global.window = global;
const elements = new Map();
for (const id of [
  'enchantPlatformWindow','enchantPlatformNpcName','enchantPlatformStoneSearch','enchantPlatformMessage',
  'enchantPlatformEquipmentList','enchantPlatformCenter','enchantPlatformStoneList','enchantPlatformStoneHeading',
  'enchantPlatformSearchWrap','enchantPlatformMaterialList','enchantPlatformZeny','enchantPlatformExecute',
  'enchantStoneInfoWindow','enchantStoneInfoTitle','enchantStoneInfoIcon','enchantStoneInfoGroup','enchantStoneInfoDescription'
]) elements.set(id, makeElement(id));
global.document = {
  getElementById: id => elements.get(id) || null,
  querySelectorAll: () => [],
  addEventListener() {}
};
global.RO_WEB_DATA = {
  'data/dim_glacier_enchant.json': readJson('data/dim_glacier_enchant.json'),
  'data/items/item_index.json': readJson('data/items/item_index.json')
};
global.getItemData = id => global.RO_WEB_DATA['data/items/item_index.json'][String(id)] || null;
let normalizeAllCalls = 0;
global.normalizeEquipmentInstance = (raw, data) => ({
  id: Number(raw.id), itemId: Number(raw.id), name: raw.name || data?.name || String(raw.id), count: 1,
  instanceId: String(raw.instanceId || 'generated'), refine: Number(raw.refine || 0),
  enchantGrade: Number(raw.enchantGrade || 0), cards: Array.isArray(raw.cards) ? raw.cards.slice() : [null,null,null,null],
  enchants: Array.isArray(raw.enchants) ? raw.enchants.map(x => ({...x})) : [], createdAt: Number(raw.createdAt || Date.now())
});
global.normalizeAllItemInstances = () => {
  normalizeAllCalls += 1;
  // Deliberately replace every object, reproducing the old stale-reference trigger.
  global.player.inventory = global.player.inventory.map(row => row.instanceId
    ? global.normalizeEquipmentInstance(row, global.getItemData(row.id))
    : {...row});
};
global.confirm = () => true;
global.invalidateCardRuntime = () => {};
global.invalidatePlayerUiRenderCaches = () => {};
global.syncEquipmentGrantedSkills = () => {};
global.recalculatePlayerStats = () => {};
global.updateInventoryUI = () => {};
global.updateEquipmentUI = () => {};
global.updatePlayerUI = () => {};
global.saveGame = () => {};
global.addBattleLog = () => {};
global.bringWindowToFront = () => {};

const catalog = global.RO_WEB_DATA['data/dim_glacier_enchant.json'];
const weaponId = Number(catalog.targetWeaponIds[0]);
const stone4 = catalog.slots['4'].items[0];
const weapon = {id: weaponId, instanceId: 'hh_weapon_1', refine: 13, enchantGrade: 4, cards:[null,null,null,null], enchants:[]};
const materials = stone4.materials.map(row => ({id:Number(row.id), name:row.name, count:Number(row.amount)+50}));
global.player = {inventory:[weapon, ...materials], equipment:{}, equipmentInstances:{}, zeny:999999};
vm.runInThisContext(fs.readFileSync(path.join(ROOT,'js/enchant_platform_runtime.js'),'utf8'), {filename:'enchant_platform_runtime.js'});

const checks = [];
function check(name, pass, detail) { checks.push({name, pass:Boolean(pass), detail}); }
check('platform opens', global.openEnchantPlatform({name:'test npc'}) === true, null);
check('global instance normalization only once on open', normalizeAllCalls === 1, normalizeAllCalls);
global.selectEnchantStone(4, stone4.id);
global.executeEnchantPlatformAction();
const liveWeapon = global.player.inventory.find(row => row.instanceId === 'hh_weapon_1');
const slot4 = (liveWeapon?.enchants || []).find(row => Number(row.slot ?? row.playerSlot) === 4);
check('slot 4 written to live inventory instance', Number(slot4?.id) === Number(stone4.id), slot4);
check('slot 3 unlocked after slot 4', global.DimGlacierEnchantRuntime.getState().currentSlot === 3, global.DimGlacierEnchantRuntime.getState());
check('normalizer not rerun during render/select/execute', normalizeAllCalls === 1, normalizeAllCalls);
check('platform display name order', global.DimGlacierEnchantRuntime._debug.weaponDisplayName(liveWeapon, global.getItemData(weaponId)).startsWith('+13 [A] '), global.DimGlacierEnchantRuntime._debug.weaponDisplayName(liveWeapon, global.getItemData(weaponId)));
for (const material of stone4.materials) {
  const remaining = global.player.inventory.find(row => Number(row.id) === Number(material.id))?.count || 0;
  check(`material ${material.id} consumed exactly`, remaining === 50, remaining);
}

// ---- Item detail compact-name regression in an isolated VM context ----
const itemContext = {
  console, setTimeout, clearTimeout,
  window: null,
  document: {addEventListener(){}, getElementById(){return null;}},
  player: {inventory:[], equipment:{}, equipmentInstances:{}},
  DEFAULT_EQUIPMENT: {},
  normalizeItemId: value => value && typeof value === 'object' ? Number(value.id ?? value.itemId) : Number(value),
  getItemData: id => global.RO_WEB_DATA['data/items/item_index.json'][String(Number(id))] || null,
  normalizePlayerData(){}, addItem(){}, showItemInfo(){}, closeItemInfo(){}, buildItemTooltip(){}, buildEquipmentTooltip(){},
  handleInventorySlotClick(){}, setEquipmentSlot(){}, equipItem(){}, moveEquipmentSlotToInventory(){},
  fixEquippedItemsInInventoryOnce(){}, addItemBackToInventory(){}, useItem(){},
  RO_WEB_DATA: global.RO_WEB_DATA
};
itemContext.window = itemContext;
vm.createContext(itemContext);
vm.runInContext(fs.readFileSync(path.join(ROOT,'js/item_instance_ui.js'),'utf8'), itemContext, {filename:'item_instance_ui.js'});
const itemName = itemContext.buildEquipmentInstanceName({id:weaponId,instanceId:'display',refine:13,enchantGrade:4,cards:[4001,null,null,null],enchants:[slot4]}, itemContext.getItemData(weaponId));
check('Dim Glacier title is +refine [grade] name [card slots]', /^\+13 \[A\] .+ \[1\]$/.test(itemName), itemName);
check('Dim Glacier title does not concatenate card/enchant prefixes', !itemName.includes(String(slot4?.name || '雪花魔力')), itemName);

const failed = checks.filter(x => !x.pass);
const report = {version:'0.9.82HH', passed:checks.length-failed.length, failed:failed.length, checks};
fs.writeFileSync(path.join(ROOT,'tools/test_hh_enchant_instance_and_display_report.json'), JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
process.exit(failed.length ? 1 : 0);
