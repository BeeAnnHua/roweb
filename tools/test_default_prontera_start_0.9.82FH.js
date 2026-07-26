const fs = require('fs');
const vm = require('vm');
function assert(ok, message) { if (!ok) throw new Error(message); }
const playerDefault = JSON.parse(fs.readFileSync('data/player_default.json', 'utf8'));
const cities = JSON.parse(fs.readFileSync('data/cities.json', 'utf8'));
const maps = JSON.parse(fs.readFileSync('data/maps.json', 'utf8'));
const playerJs = fs.readFileSync('js/player.js', 'utf8');
const townJs = fs.readFileSync('js/town.js', 'utf8');
const gameJs = fs.readFileSync('js/game.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');

assert(playerDefault.currentCity === 'prontera', 'Fresh character must start in Prontera town');
assert(playerDefault.map === null, 'Fresh town character must not be marked as standing on a field map');
assert(playerDefault.lastFieldMap === 'prontera_3x3_region_camera', 'Fresh character last field must be Prontera region');
assert(playerDefault.state === 'Town', 'Fresh character state must be Town');
assert(cities.some(city => city.id === 'prontera'), 'Prontera city data must exist');
assert(maps.some(map => map.id === 'prontera_3x3_region_camera'), 'Prontera field region must exist');
assert(playerJs.includes('const RO_WEB_DEFAULT_FIELD_MAP_ID = "prontera_3x3_region_camera";'), 'Canonical default field must be Prontera region');
assert(townJs.includes('window.RO_WEB_DEFAULT_FIELD_MAP_ID || "prontera_3x3_region_camera"'), 'Town leave fallback must be Prontera region');
assert(gameJs.includes('const RO_WEB_VERSION = "0.9.82FH";'), 'Runtime version must be FH');
assert([...index.matchAll(/\?v=([^"']+)/g)].every(m => m[1] === '0.9.82FH'), 'All entry cache keys must be FH');

const bundleText = fs.readFileSync('js/data_bundle.js', 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(bundleText, sandbox, { timeout: 30000 });
const bundled = sandbox.window.RO_WEB_DATA?.['data/player_default.json'];
assert(bundled?.currentCity === 'prontera', 'Bundled fresh character must start in Prontera');
assert(bundled?.map === null, 'Bundled fresh town character map must be null');
assert(bundled?.lastFieldMap === 'prontera_3x3_region_camera', 'Bundled last field must be Prontera region');

console.log(JSON.stringify({ version: '0.9.82FH', status: 'PASS', startCity: 'prontera', lastFieldMap: 'prontera_3x3_region_camera' }, null, 2));
