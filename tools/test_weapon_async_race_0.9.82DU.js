'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

(async () => {
  const jobs = readJson('data/jobs.json');
  const manifest = readJson('data/character_atlas_manifest.json');
  const context = {
    console, Math, Date, Promise, setTimeout, clearTimeout,
    requestAnimationFrame: () => 0,
    performance: { now: () => 1000 }, navigator: {}, jobs,
    player: {
      jobKey: 'swordman', gender: 'male', state: 'Idle',
      equipment: {}, position: { x: 0, y: 0, targetX: null, targetY: null },
      mountState: { mounted: false, type: null, assetKey: null }
    },
    getJobData(key) { return jobs[key] || null; },
    document: { getElementById() { return null; }, createElement() { return null; } },
    window: null, Image: function MockImage() {}, currentMonster: null,
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/player_atlas_runtime.js'), 'utf8'), context, {
    filename: 'player_atlas_runtime.js'
  });

  const state = context.RO_STUDIO_PLAYER_ATLAS;
  const map = readJson('assets/characters/swordman/male/motions.json');
  state.manifest = manifest;
  state.motionMap = map;
  state.variantKey = 'on_foot';
  state.characterKey = 'swordman_male';
  state.characterEntry = manifest.characters.swordman_male;
  state.weaponType = 'fist';
  state.resolvedWeaponKey = 'fist';

  const pending = new Map();
  context.loadROStudioAtlasAsset = jsonPath => new Promise(resolve => pending.set(jsonPath, resolve));

  const spearPath = map.variants.on_foot.attack.spear;
  const swordPath = map.variants.on_foot.attack.sword;
  const spearPromise = context.setROStudioPlayerWeaponType('spear');
  const swordPromise = context.setROStudioPlayerWeaponType('sword');
  assert(pending.has(spearPath), 'spear request was not started');
  assert(pending.has(swordPath), 'sword request was not started');

  const swordAsset = { marker: 'sword' };
  const spearAsset = { marker: 'spear' };
  pending.get(swordPath)({ data: swordAsset, image: { marker: 'sword-image' } });
  assert(await swordPromise === true, 'newest sword request should apply');
  pending.get(spearPath)({ data: spearAsset, image: { marker: 'spear-image' } });
  assert(await spearPromise === false, 'older spear request must be discarded');

  assert(state.weaponType === 'sword', `weaponType reverted to ${state.weaponType}`);
  assert(state.resolvedWeaponKey === 'sword', `resolved weapon reverted to ${state.resolvedWeaponKey}`);
  assert(state.assets.attack === swordAsset, 'older loaded Atlas overwrote newest sword Atlas');
  assert(state.pendingWeaponType === null, 'pending weapon state was not cleared');

  console.log('RO_WEB 0.9.82DU Weapon Async Race Test');
  console.log('================================================');
  console.log('Late old request discard : PASS');
  console.log('Newest weapon preserved  : PASS');
  console.log('STATUS                   : PASS');
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
