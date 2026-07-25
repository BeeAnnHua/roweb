const fs = require('fs');
function assert(value, message) { if (!value) throw new Error(message); }

const battle = fs.readFileSync('js/battle.js', 'utf8');
const quick = fs.readFileSync('js/quick_slots.js', 'utf8');
const skill = fs.readFileSync('js/skill_engine.js', 'utf8');
const css = fs.readFileSync('css/style.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const position = fs.readFileSync('js/position_engine.js', 'utf8');

assert(/critical: normalAttackResult\?\.critical === true \|\| normalAttackResult\?\.critical\?\.critical === true/.test(battle), 'battle normal attack accepts boolean and object critical result');
assert(/critical: normalAttackResult\?\.critical === true \|\| normalAttackResult\?\.critical\?\.critical === true/.test(quick), 'quick-slot normal attack forwards critical result');
assert(/const combo = options\.combo === true[\s\S]*?hitCount > 1;/.test(battle), 'damage renderer classifies multi-hit/combo damage');
assert(/classes\.push\("combo-damage-number"\)/.test(battle), 'combo damage class is attached');
assert(/classes\.push\("critical-damage-number"\)/.test(battle), 'critical damage class is attached');
assert(/hitCount:Math\.max\(1, Number\(hitMeta\.visualHitCount \|\| 1\), Number\(hitMeta\.damageHitCount \|\| 1\)\)/.test(skill), 'main skill runtime forwards hit count');
assert(/\.damage-number\.combo-damage-number\s*\{[\s\S]*?color:#ffe14f;/.test(css), 'combo damage is yellow');
assert(/\.damage-number\.critical-damage-number,[\s\S]*?color:#ff3434;/.test(css), 'critical damage is red and overrides combo');
assert(/\.damage-number\s*\{[\s\S]*?color:#ffad45;/.test(css), 'normal attack and normal skill share orange color');
assert(/POSITION_DEBUG_CROSS_ENABLED = false/.test(position), 'player foot debug cross is disabled at source');
assert(/#battle-log #position-coordinate-ui[\s\S]*?display:inline-flex !important;/.test(css), 'battle-log coordinate UI is restored');
assert((html.match(/0\.9\.82EW/g) || []).length >= 30, 'all entry cache keys use EV');
assert(!html.includes('0.9.82EU'), 'no stale EW cache key remains in index');
console.log('PASS 0.9.82EW damage colors, normal critical, coordinate UI and debug-cross removal');
