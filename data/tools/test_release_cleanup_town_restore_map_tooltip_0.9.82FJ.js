const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const index=read('index.html');
const game=read('js/game.js');
const playerJs=read('js/player.js');
const battle=read('js/battle.js');
const town=read('js/town.js');
const world=read('js/world_monster_test_runtime.js');
const mapJs=read('js/map.js');
const css=read('css/style.css');

// Minimal share card metadata.
assert(index.includes('<meta property="og:title" content="RO_WEB">'),'OG title missing');
assert(index.includes('<meta property="og:description" content="&#8203;">'),'Blank OG description guard missing');
assert(index.includes('<meta name="twitter:card" content="summary">'),'Twitter metadata missing');

// Legacy singleton waiting panel remains removed.
assert(!index.includes('等待怪物出現'),'Legacy waiting text must not remain in HTML');
assert(!battle.includes('正在搜尋怪物...'),'Legacy searching text must not remain');
assert(battle.includes('monsterSpriteEl.classList.toggle("no-target", !inTown && !currentMonster)'),'No-target toggle missing');
assert(css.includes('.monster-sprite.no-target') && css.includes('visibility: hidden !important'),'No-target CSS missing');

// Town reload remains a pure town scene.
assert(game.includes('if (savedCity) {') && game.includes('currentMap = null;') && game.includes('player.map = null;'),'Town startup field clear missing');
assert(playerJs.includes('if (player.currentCity) {') && playerJs.includes('player.state = "Town";'),'Town normalization missing');
assert(world.includes('!player?.currentCity &&\n    currentMap?.monsterStreaming'),'World monsters must be disabled in town');
assert(town.includes('clearWorldMonsterFieldTest({ persist: true, save: false })'),'Town restore monster clear missing');

// FH compact monster list: names only for ordinary mobs; Boss/MVP state remains live.
assert(mapJs.includes('return `<div class="map-monster-distribution-row"><span>${name}</span>${stateHtml}</div>`'),'Monster rows must contain names and optional live state only');
assert(!mapJs.includes('${name}${categoryBadge}'),'Monster category badges must be removed for compact UI');
const distributionRenderer=mapJs.slice(mapJs.indexOf('function createMapMonsterDistributionSection'),mapJs.indexOf('function getMapMonsterDistributionTooltip'));
assert(!distributionRenderer.includes('formatMapMonsterCount') && !distributionRenderer.includes('×'),'Tooltip renderer must not render ordinary quantities');
assert(mapJs.includes('重生倒數 ${formatMapMonsterRespawnDuration(state.remainingSeconds)}'),'Boss/MVP countdown missing');
assert(mapJs.includes('map-monster-state is-alive') && mapJs.includes('map-monster-state is-respawning'),'Live state classes missing');
assert(mapJs.includes('tooltip.classList.add("is-embedded")'),'Touch tooltip must be embedded in map window');
assert(mapJs.includes('currentCard?.classList.add("has-monster-info")'),'Map current card embed marker missing');
assert(mapJs.includes('btn.dataset.previewArmed = "1"') && mapJs.includes('showMapMonsterDistributionTooltip(dest.data, btn);'),'Touch field buttons must preview before teleporting');
assert(css.includes('.map-monster-distribution-tooltip.is-embedded'),'Embedded tooltip CSS missing');
assert(css.includes('overflow-y: auto') && css.includes('touch-action: pan-y'),'Scrollable monster info missing');
assert(mapJs.includes('const previousScrollTop = tooltip.scrollTop;') && mapJs.includes('tooltip.scrollTop = previousScrollTop;'),'Countdown refresh must preserve scroll position');

assert(game.includes('const RO_WEB_VERSION = "0.9.82FJ";'),'Runtime version must be FH');
assert([...index.matchAll(/\?v=([^"']+)/g)].every(m=>m[1]==='0.9.82FJ'),'All entry cache keys must be FH');
console.log(JSON.stringify({version:'0.9.82FJ',status:'PASS',townRestore:true,namesOnlyTooltip:true,mobileEmbedded:true},null,2));
