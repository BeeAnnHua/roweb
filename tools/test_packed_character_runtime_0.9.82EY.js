'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const jobs = readJson('data/jobs.json');
const manifest = readJson('data/character_atlas_manifest.json');
const context = {
  console,
  Math,
  Date,
  Promise,
  setTimeout,
  clearTimeout,
  requestAnimationFrame: () => 0,
  performance: { now: () => 1000 },
  navigator: {},
  jobs,
  player: {
    jobKey: 'novice',
    gender: 'male',
    state: 'Idle',
    equipment: {},
    position: { x: 0, y: 0, targetX: null, targetY: null },
    mountState: { mounted: false, type: null, assetKey: null }
  },
  currentMonster: null,
  getJobData(key) { return jobs[key] || null; },
  document: {
    getElementById() { return null; },
    createElement() { return null; }
  },
  window: null,
  Image: function MockImage() {},
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/player_atlas_runtime.js'), 'utf8'), context, {
  filename: 'player_atlas_runtime.js'
});

const state = context.RO_STUDIO_PLAYER_ATLAS;
state.manifest = manifest;

// appearanceGroup / gender resolution
context.player.jobKey = 'lord_knight';
context.player.gender = 'male';
assert(context.resolveROStudioCharacterKey() === 'knight_male', 'lord_knight must share knight_male');
context.player.jobKey = 'merchant_high';
context.player.gender = 'female';
assert(context.resolveROStudioCharacterKey() === 'merchant_female', 'merchant_high must share merchant_female');
context.player.jobKey = 'dancer';
context.player.gender = 'male';
assert(context.resolveROStudioCharacterKey() === 'novice_male', 'missing cross-gender dancer asset must safely fallback');

// mount variant selection
const runeMap = readJson('assets/characters/rune_knight/male/motions.json');
state.motionMap = runeMap;
state.characterKey = 'rune_knight_male';
context.player.jobKey = 'rune_knight';
context.player.gender = 'male';
context.player.mountState = { mounted: false, type: null };
assert(context.getROStudioRequestedVariantKey(runeMap) === 'on_foot', 'unmounted rune knight must use on_foot');
context.player.mountState = { mounted: true, type: 'dragon' };
assert(context.getROStudioRequestedVariantKey(runeMap) === 'mounted', 'mounted rune knight must use mounted');

const merchantMap = readJson('assets/characters/merchant/male/motions.json');
context.player.mountState = { mounted: true, type: 'mado' };
assert(context.getROStudioRequestedVariantKey(merchantMap) === 'on_foot', 'non-sword mount without variant must stay on_foot');

// weapon aliases and fallback policy
let variant = runeMap.variants.on_foot;
let selected = context.resolveROStudioAttackSelection('twoHandSword', runeMap, variant, 'fist');
assert(selected.key === 'sword', `twoHandSword expected sword, got ${selected.key}`);
selected = context.resolveROStudioAttackSelection('two_hand_spear', runeMap, variant, 'fist');
assert(selected.key === 'spear', `two_hand_spear expected spear, got ${selected.key}`);

const wizardMap = readJson('assets/characters/wizard/female/motions.json');
selected = context.resolveROStudioAttackSelection('twoHandStaff', wizardMap, wizardMap.variants.on_foot, 'fist');
assert(selected.key === 'staff', `twoHandStaff expected staff, got ${selected.key}`);

const assassinMap = readJson('assets/characters/assassin/male/motions.json');
selected = context.resolveROStudioAttackSelection('swordDagger', assassinMap, assassinMap.variants.on_foot, 'fist');
assert(selected.key === 'dual_dagger', `swordDagger expected dual_dagger, got ${selected.key}`);
selected = context.resolveROStudioAttackSelection('daggerSword', assassinMap, assassinMap.variants.on_foot, 'fist');
assert(selected.key === 'dual_dagger', `daggerSword expected dual_dagger, got ${selected.key}`);

const archerMap = readJson('assets/characters/archer/male/motions.json');
selected = context.resolveROStudioAttackSelection('fist', archerMap, archerMap.variants.on_foot, 'bow');
assert(selected.key === 'fist', `archer unequipped expected fist, got ${selected.key}`);
const swordmanMap = readJson('assets/characters/swordman/male/motions.json');
selected = context.resolveROStudioAttackSelection('fist', swordmanMap, swordmanMap.variants.on_foot, 'sword');
assert(selected.key === 'fist', `swordman unequipped expected fist, got ${selected.key}`);

selected = context.resolveROStudioAttackSelection('sword', swordmanMap, swordmanMap.variants.on_foot, 'sword');
assert(selected.key === 'sword' && selected.path.includes('/attack/sword/'), `swordman sword mapping invalid: ${JSON.stringify(selected)}`);
selected = context.resolveROStudioAttackSelection('spear', swordmanMap, swordmanMap.variants.on_foot, 'sword');
assert(selected.key === 'spear' && selected.path.includes('/attack/spear/'), `swordman spear mapping invalid: ${JSON.stringify(selected)}`);

// packed frame lookup, mirror and frame counts
const idle = readJson('assets/characters/rune_knight/male/on_foot/idle/body_hair.json');
const walk = readJson('assets/characters/rune_knight/male/on_foot/walk/body_hair.json');
const attack = readJson('assets/characters/rune_knight/male/on_foot/attack/sword/body_hair_weapon.json');
const dead = readJson('assets/characters/rune_knight/male/on_foot/dead/body_hair.json');
const rightIdle = context.getROStudioPackedFrame(idle, 'idle', 0, 6);
assert(rightIdle && rightIdle.flipX === true, 'idle right must use runtime flipX');
assert(rightIdle.sourceDirection === 'left', 'idle right must source from left');
const frontAttack = context.getROStudioPackedFrame(attack, 'attack', 0, 0);
assert(frontAttack && frontAttack.sourceDirection, 'attack front alias frame must resolve');
assert(context.getROStudioMotionFrameCount(idle, 'idle') === 1, 'idle frame count must be 1');
assert(context.getROStudioMotionFrameCount(walk, 'walk') === 8, 'rune knight walk frame count must be 8');
assert(context.getROStudioMotionFrameCount(dead, 'hurt') === 3, 'hurt frame count must be 3');
assert(context.getROStudioMotionFrameCount(dead, 'dead') === 4, 'dead frame count must be 4');

// Long-cast action segmentation: preparation plays once and holds; release uses only final frames.
const noviceCast = readJson('assets/characters/novice/male/on_foot/cast/body_hair.json');
const castPrepare = context.getROStudioMotionFrameWindow(noviceCast, 'cast', 'prepare');
const castRelease = context.getROStudioMotionFrameWindow(noviceCast, 'cast', 'release');
assert(castPrepare.start === 0 && castPrepare.end === 3 && castPrepare.count === 4, `6-frame Cast preparation invalid: ${JSON.stringify(castPrepare)}`);
assert(castRelease.start === 4 && castRelease.end === 5 && castRelease.count === 2, `6-frame Cast release invalid: ${JSON.stringify(castRelease)}`);
const attackPrepare = context.getROStudioMotionFrameWindow(attack, 'attack', 'prepare');
const attackRelease = context.getROStudioMotionFrameWindow(attack, 'attack', 'release');
assert(attackPrepare.start === 0 && attackPrepare.end === 5 && attackPrepare.count === 6, `9-frame Attack preparation invalid: ${JSON.stringify(attackPrepare)}`);
assert(attackRelease.start === 6 && attackRelease.end === 8 && attackRelease.count === 3, `9-frame Attack release invalid: ${JSON.stringify(attackRelease)}`);

// render placement and flip transform use target offsets, not packed-atlas coordinates.
const calls = [];
const fakeCtx = {
  save() { calls.push(['save']); },
  restore() { calls.push(['restore']); },
  translate(x, y) { calls.push(['translate', x, y]); },
  scale(x, y) { calls.push(['scale', x, y]); },
  drawImage(...args) { calls.push(['drawImage', ...args.slice(1)]); }
};
const fakeCanvas = { width: 512, height: 512 };
const rendered = context.renderROStudioPackedFrame(fakeCtx, fakeCanvas, idle, {}, rightIdle);
assert(rendered === true, 'packed flip frame must render');
assert(calls.some(row => row[0] === 'scale' && row[1] === -1 && row[2] === 1), 'flipX must apply canvas scale(-1,1)');
const translate = calls.find(row => row[0] === 'translate');
const expectedTranslateX = (rightIdle.targetOffsetX + rightIdle.region.w) * 2;
const expectedTranslateY = rightIdle.targetOffsetY * 2;
assert(translate && translate[1] === expectedTranslateX && translate[2] === expectedTranslateY,
  `flip translation mismatch got=${translate} expected=${expectedTranslateX},${expectedTranslateY}`);

// Preserve the already verified RO_WEB screen-coordinate mapping.
assert(context.vectorToRODirectionId(-1, 1) === 7, 'down-left screen vector must map to atlas front_right');
assert(context.vectorToRODirectionId(1, 1) === 1, 'down-right screen vector must map to atlas front_left');
assert(context.vectorToRODirectionId(-1, 0) === 6, 'left screen vector must map to atlas right');
assert(context.vectorToRODirectionId(1, 0) === 2, 'right screen vector must map to atlas left');

console.log('RO_WEB 0.9.82EY Packed Character Runtime Test');
console.log('================================================');
console.log('Manifest characters :', Object.keys(manifest.characters).length);
console.log('Mounted switch      : PASS');
console.log('Weapon aliases      : PASS');
console.log('Mixed dual fallback : PASS');
console.log('Packed flip render  : PASS');
console.log('Hurt/Dead frames    : PASS');
console.log('Cast phase segments : PASS');
console.log('Direction mapping   : PASS');
console.log('STATUS              : PASS');
