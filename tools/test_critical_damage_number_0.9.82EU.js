const fs = require('fs');
function assert(value, message) { if (!value) throw new Error(message); }

const battle = fs.readFileSync('js/battle.js', 'utf8');
const skill = fs.readFileSync('js/skill_engine.js', 'utf8');
const css = fs.readFileSync('css/style.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

assert(/const critical = options\.critical === true \|\| options\.isCritical === true \|\| options\.criticalResult\?\.critical === true;/.test(battle), 'damage number resolves the authoritative critical flag');
assert(/classes\.push\("critical-damage-number"\)/.test(battle), 'critical damage class is attached without a second DOM node');
assert(/critical: normalAttackResult\?\.critical\?\.critical === true/.test(battle), 'normal attack forwards CombatDamagePipeline critical result');
assert(/showDamageNumber\(calculatedDamage, \{ target, critical:crit\.critical === true \}\)/.test(skill), 'main physical skill runtime forwards per-target critical result');
assert(/critical:options\.critical === true \|\| options\.criticalResult\?\.critical === true/.test(skill), 'shared calculated-damage helper accepts critical metadata');
assert(/\.damage-number\.critical-damage-number\s*\{[\s\S]*?color:#ff3434;/.test(css), 'critical damage is displayed in red');
assert(/\.damage-number\s*\{[^}]*font-family:"Arial Black","Microsoft JhengHei",sans-serif;[^}]*-webkit-text-stroke:3px/.test(css), 'all damage numbers use the thicker font treatment');
assert((html.match(/0\.9\.82EU/g) || []).length >= 30, 'all entry cache keys use EU');
assert(!html.includes('0.9.82ES'), 'no stale ES cache key remains in index');

console.log('PASS 0.9.82EV critical red damage numbers and heavier typography');
