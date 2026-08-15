const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const player = read('js/player.js');
const autoBattle = read('js/auto_battle.js');
const itemInstanceUi = read('js/item_instance_ui.js');
const css = read('css/style.css');

const checks = [];
const check = (name, condition) => {
  if (!condition) throw new Error(`FAIL: ${name}`);
  checks.push(name);
};

check('AFK auto-decompose checkbox exists', /id="autoCombatAutoDecomposeEnabled"/.test(html));
check('AFK auto-decompose checkbox defaults to off', !/id="autoCombatAutoDecomposeEnabled"[^>]*\bchecked\b/.test(html));
check('manual marked-list button exists', /id="inventory-decompose-marked"[^>]*>分解自動分解名單</.test(html));
check('new settings default to disabled', /autoDecompose:\s*\{\s*enabled:\s*false\s*\}/.test(autoBattle));
check('saved checkbox value is read', /autoCombat\.autoDecompose\.enabled\s*=\s*autoDecomposeEnabled\.checked/.test(autoBattle));
check('saved checkbox value is rendered', /autoDecomposeEnabled\.checked\s*=\s*cfg\.autoDecompose\.enabled\s*===\s*true/.test(autoBattle));
check('timer requires explicit AFK setting', /function scheduleInventoryAutoDecomposeTimer[\s\S]*?!isInventoryAutoDecomposeAfkEnabled\(\)/.test(player));
check('manual marked list uses auto mode', /markedBtn[\s\S]*?openInventoryDecomposeDialog\(\{\s*mode:"auto"/.test(player));
check('auto-mode candidates use saved Item IDs', /request\.mode\s*===\s*"auto"[\s\S]*?getInventoryAutoDecomposeMarkedIds/.test(player));
check('decompose safety still rejects locked items', /if\s*\(!item\s*\|\|[\s\S]*?item\.locked\)\s*return false/.test(player));
check('decompose safety still rejects protected items', /manualUseOnly\s*===\s*true[\s\S]*?mvp_gacha[\s\S]*?noDecompose\s*===\s*true/.test(player));
check('lock marks only render while lock mode is active', /if\s*\(inventoryLockMode\)\s*\{[\s\S]*?inventory-lock-mark/.test(player));
check('auto marks only render while auto mode is active', /if\s*\(inventoryAutoDecomposeMode\)\s*\{[\s\S]*?inventory-auto-decompose-mark/.test(player));
check('saved auto mark does not force persistent slot styling', /inventoryAutoDecomposeMode\s*&&\s*autoDecomposeMarked/.test(player));
check('selection modes remain mutually exclusive', /if\s*\(inventoryLockMode\)\s*inventoryAutoDecomposeMode\s*=\s*false/.test(player)
  && /if\s*\(inventoryAutoDecomposeMode\)\s*inventoryLockMode\s*=\s*false/.test(player));
check('instance UI intercepts auto selection before item details', /if\s*\(typeof inventoryAutoDecomposeMode[\s\S]*?toggleInventoryItemAutoDecompose\(item\)[\s\S]*?return;/.test(itemInstanceUi));
check('lock and auto marks share one final CSS rule', /#inventory-window \.inventory-lock-mark,\s*#inventory-window \.inventory-auto-decompose-mark\s*\{/.test(css));
check('lock and auto checked states share one final CSS rule', /\.inventory-lock-mark\.is-locked,\s*#inventory-window \.inventory-auto-decompose-mark\.is-marked\s*\{/.test(css));

console.log(`PASS: ${checks.length} B5 auto-decompose control checks`);
