const fs = require('fs');
function assert(v,m){ if(!v) throw new Error(m); }
const css=fs.readFileSync('css/style.css','utf8');
const ui=fs.readFileSync('js/ui.js','utf8');
const monster=fs.readFileSync('js/world_monster_test_runtime.js','utf8');
const html=fs.readFileSync('index.html','utf8');
assert(css.includes('--ro-z-world-entity-max: 8999'), 'World entity cap variable missing');
assert(css.includes('--ro-z-ui-window: 20000'), 'UI window layer missing');
assert(css.includes('#battle-field > .game-window { z-index: var(--ro-z-ui-window); }'), 'Game windows must sit above world');
assert(css.includes('#battle-field > .fixed-panel { z-index: var(--ro-z-hud) !important; }'), 'Fixed HUD must sit above world');
assert(css.includes('--ro-z-ui-popup: 30000'), 'Popup layer missing');
assert(ui.includes('const RO_UI_WINDOW_Z_BASE = 20000'), 'Runtime bring-to-front base must start above world');
assert(monster.includes('const RO_WORLD_MONSTER_Z_MAX = 8999'), 'Monster world-layer cap missing');
assert(monster.includes('getWorldMonsterDepthZIndex(entity)'), 'Bounded monster depth helper missing');
assert(!monster.includes('200 + Math.round(Number(entity.position.y || 0))'), 'Unbounded monster z-index formula must be removed');
assert((html.match(/\?v=0\.9\.82EO/g)||[]).length >= 30, 'Entry cache key must be EN');
console.log('PASS 0.9.82EO UI windows above player/monster world layers');
console.log(JSON.stringify({worldEntityMax:8999,hud:12000,uiWindowBase:20000,popup:30000},null,2));
