'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

let nowMs = 1000;
const rendered = [];
const context = {
  console,
  Math,
  Date,
  Promise,
  setTimeout,
  clearTimeout,
  requestAnimationFrame: () => 0,
  performance: { now: () => nowMs },
  navigator: {},
  jobs: readJson('data/jobs.json'),
  player: {
    jobKey: 'rune_knight',
    gender: 'male',
    state: 'Idle',
    equipment: {},
    position: { x: 0, y: 0, targetX: null, targetY: null },
    mountState: { mounted: false, type: null, assetKey: null }
  },
  currentMonster: null,
  getJobData(key) { return this.jobs[key] || null; },
  document: {
    getElementById() { return null; },
    createElement() { return null; }
  },
  window: null,
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/player_atlas_runtime.js'), 'utf8'), context, {
  filename: 'player_atlas_runtime.js'
});

const dead = readJson('assets/characters/rune_knight/male/on_foot/dead/body_hair.json');
const state = context.RO_STUDIO_PLAYER_ATLAS;
state.ready = true;
state.characterKey = 'rune_knight_male';
state.assets = { idle: dead, dead };
state.images = { idle: {}, dead: {} };
state.canvas = { width: 256, height: 256, style: {} };
state.ctx = {
  clearRect() {},
  save() {},
  restore() {},
  translate() {},
  scale() {},
  drawImage() {},
  set imageSmoothingEnabled(v) {},
  set webkitImageSmoothingEnabled(v) {},
  set mozImageSmoothingEnabled(v) {},
  set msImageSmoothingEnabled(v) {},
};
state.fpsMs.dead = 100;
state.lastTime = nowMs;

// Avoid unrelated manifest/DOM syncing while exercising the frame clock.
context.syncROStudioCharacterFromPlayer = () => false;
context.resizeROStudioPlayerCanvas = () => false;
context.updateROStudioPlayerDirection = () => false;
context.renderROStudioPlayerAtlasFrame = (motionId, frameIndex) => rendered.push([motionId, frameIndex]);

assert(context.playROStudioPlayerMotion('dead', { duration: 400, holdLast: true, compressFrames: true }), 'dead motion must start');
for (const t of [1100, 1200, 1300, 1400, 1500, 1800]) {
  nowMs = t;
  context.tickROStudioPlayerAtlasRuntime(t);
}
assert(state.frameIndex === 3, `dead must stop on frame 3, got ${state.frameIndex}`);
assert(context.getROStudioCurrentPlayerMotion(nowMs) === 'dead', 'holdLast dead must remain active after duration');
assert(rendered.some(row => row[0] === 'dead' && row[1] === 3), 'final dead frame must render');

context.clearROStudioPlayerMotionOverride();
assert(context.getROStudioCurrentPlayerMotion(nowMs) === 'idle', 'clearing death hold must return to idle');

console.log(JSON.stringify({
  version: '0.9.82DW',
  status: 'PASS',
  finalFrame: 3,
  renderedFrames: rendered,
  clearReturnsTo: 'idle'
}, null, 2));
