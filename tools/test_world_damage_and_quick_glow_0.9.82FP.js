const fs = require('fs');
const vm = require('vm');
const root = process.cwd();
function assert(condition, message) { if (!condition) throw new Error(message); }
const playerSource = fs.readFileSync(`${root}/js/player.js`, 'utf8');
const moveStart = playerSource.indexOf('function moveEquipmentSlotToInventory');
const moveEnd = playerSource.indexOf('\nfunction normalizeEquipmentHandConflicts', moveStart);
const moveSource = playerSource.slice(moveStart, moveEnd);
assert(moveSource.includes('clearPhysicalElementEndow'), 'Weapon unequip does not call converter clear.');
assert(moveSource.indexOf('clearPhysicalElementEndow') < moveSource.indexOf('player.equipment[slot] = null'), 'Converter must clear before the weapon slot is emptied.');

const battleSource = fs.readFileSync(`${root}/js/battle.js`, 'utf8');
const match = battleSource.match(/function refreshWorldAnchoredDamageNumbers\([\s\S]*?\n}\nfunction showMissNumber/);
assert(match, 'Cannot locate world damage refresh function.');
const refreshSource = match[0].replace(/\nfunction showMissNumber$/, '');
const damageNode = { dataset:{ worldAnchorX:'500', worldAnchorY:'320' }, style:{} };
const sandbox = { console, window:null, document:{ querySelectorAll:() => [damageNode] } };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(refreshSource, sandbox);
sandbox.refreshWorldAnchoredDamageNumbers({ x:120, y:70 });
assert(damageNode.style.left === '380px' && damageNode.style.top === '250px', 'Damage number did not remain projected from its saved world position.');
assert(battleSource.includes('number.dataset.worldAnchorX = String(worldX)'), 'Damage node does not save world coordinates.');
const worldRuntime = fs.readFileSync(`${root}/js/world_monster_test_runtime.js`, 'utf8');
assert(worldRuntime.includes('window.refreshWorldAnchoredDamageNumbers(camera)'), 'Camera render does not refresh world damage positions.');

const css = fs.readFileSync(`${root}/css/style.css`, 'utf8');
const marker = css.lastIndexOf('RO_WEB 0.9.82FP');
const fpCss = css.slice(marker);
assert(fpCss.includes('inset: -1px !important'), 'Quick button glow is not limited to the border.');
assert(fpCss.includes('background: none !important'), 'Large quick button glow background remains enabled.');
assert(fpCss.includes('ro-web-auto-battle-border-breathe'), 'Gold border breathing animation is missing.');
assert(!fpCss.includes('conic-gradient'), 'FP override still contains the oversized rotating conic glow.');
console.log('PASS world-anchored damage and compact quick-button gold border');
