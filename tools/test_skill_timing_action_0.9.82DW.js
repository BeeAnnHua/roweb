const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
function readJson(rel){ return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); }
const core1 = readJson('data/skills/skills_core_1.json').skills;
const core2 = readJson('data/skills/skills_core_2.json').skills;
const skillIndex = {...core1, ...core2};
const runtime = {};
for (const rel of ['data/skill_runtime/runtime_generated_all.json','data/skill_runtime/runtime_core_1_v1.json']) {
  const doc=readJson(rel); const rows=doc.skills||doc;
  for(const [id,row] of Object.entries(rows)) runtime[id]=row;
}
const ctx = {
  console,
  Math,
  Date,
  JSON,
  Number,
  String,
  Object,
  Array,
  Set,
  Map,
  Promise,
  performance: { now: () => Date.now() },
  window: {},
  document: undefined,
  player: { aspd: 150, sp: 999999, hp: 999999, maxHp: 999999, zeny: 999999, activeBuffs:{}, runtimeState:{}, skillTimingState:{} },
  skillsData: { runtimeProfiles: runtime, skillIndex },
  getSkillLevel: () => 10,
  getActiveBuffBonusTotals: () => ({}),
  getPassiveSkillBonusTotals: () => ({}),
  recalculatePlayerStats: () => {},
  addBattleLog: () => {},
  saveGame: () => {},
  updatePlayerUI: () => {},
  setInterval: () => 1,
  clearInterval: () => {},
  setTimeout: () => 1,
  clearTimeout: () => {},
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT,'js/battle.js'),'utf8'), ctx, {filename:'battle.js'});
vm.runInContext(fs.readFileSync(path.join(ROOT,'js/skill_engine.js'),'utf8'), ctx, {filename:'skill_engine.js'});
function assert(cond,msg){ if(!cond) throw new Error(msg); }
function skill(id){ return skillIndex[String(id)]; }

const bash=skill(5), double=skill(46), firebolt=skill(19), finger=skill(267), helpAngel=skill(5076), crisis=skill(5505), magnum=skill(7);
assert(bash && double && firebolt && finger && helpAngel && crisis && magnum, 'representative skills missing');

// RA metadata synchronization
assert(Number(ctx.getRuntimeSkillTimingProfile(double,10).afterCastActDelayMs)===100, 'Double Strafe RA after-cast delay should be 100ms');
assert(Number(ctx.getRuntimeSkillTimingProfile(firebolt,10).cast.totalMs)>0, 'Fire Bolt must have RA cast time');
assert(Number(ctx.getRuntimeSkillTimingProfile(firebolt,10).cast.fixedMs)>0, 'Fire Bolt fixed cast time was not synchronized from RA');
assert(Number(ctx.getRuntimeSkillTimingProfile(magnum,10).cooldownMs)===2000, 'Magnum Break cooldown should be 2000ms');
assert(Number(ctx.getRuntimeSkillTimingProfile(finger,1).afterCastWalkDelayMs)===0, 'Finger Offensive Lv1 omitted RA walk delay must remain 0ms');
assert(Number(ctx.getRuntimeSkillTimingProfile(finger,5).afterCastWalkDelayMs)===800, 'Finger Offensive Lv5 RA walk delay should be 800ms');
assert(Number(ctx.getRuntimeSkillTimingProfile(helpAngel,1).cooldownMs)===0, 'Help Angel approved cooldown override failed');
assert(Number(ctx.getRuntimeSkillTimingProfile(crisis,5).cooldownMs)===0, 'Overcoming Crisis approved cooldown override failed');
assert(Number(ctx.getRuntimeSkillTimingProfile(crisis,5).afterCastActDelayMs)===500, 'Overcoming Crisis RA after-cast delay must remain 500ms');

// Action classification
assert(ctx.getRuntimeSkillActionMotion(bash)==='attack', 'Bash must use weapon Attack motion');
assert(ctx.getRuntimeSkillActionMotion(double)==='attack', 'Double Strafe must use weapon Attack motion');
assert(ctx.getRuntimeSkillActionMotion(firebolt)==='cast', 'Fire Bolt must use Cast motion');
assert(ctx.getRuntimeSkillActionMotion(helpAngel)==='cast', 'Buff must use Cast motion');

// ASPD only applies to physical skills with no RA timing lock.
assert(ctx.isAspdLimitedZeroDelayPhysicalSkill(bash,10)===true, 'Bash should be ASPD-limited zero-delay physical skill');
assert(ctx.isAspdLimitedZeroDelayPhysicalSkill(double,10)===false, 'Double Strafe has RA after-cast delay and must not use ASPD gate');
ctx.player.aspd=150;
assert(ctx.getRuntimeSkillActionDurationMs(bash,10)===2000, '150 ASPD Bash interval mismatch');
ctx.player.aspd=190;
assert(ctx.getRuntimeSkillActionDurationMs(bash,10)===200, '190 ASPD Bash interval mismatch');

// Commit and blocking tests.
ctx.player.skillTimingState={};
ctx.player.aspd=190;
ctx.commitRuntimeSkillTiming(bash,10);
let block=ctx.getRuntimeSkillDelayBlock(bash,10);
assert(block && block.type==='aspd', 'Bash should be blocked by ASPD action interval immediately after use');
ctx.player.skillTimingState={};
ctx.commitRuntimeSkillTiming(double,10);
block=ctx.getRuntimeSkillDelayBlock(double,10);
assert(block && block.type==='after_cast' && block.remainingMs<=100, 'Double Strafe should create RA common delay');
ctx.player.skillTimingState={};
ctx.commitRuntimeSkillTiming(magnum,10);
block=ctx.getRuntimeSkillDelayBlock(magnum,10);
assert(block && block.type==='cooldown' && block.remainingMs<=2000, 'Magnum Break should create RA cooldown');

console.log('PASS 0.9.82DW skill timing/action tests');
console.log(JSON.stringify({
  bash150: 2000,
  bash190: 200,
  doubleStrafeAfterCast: ctx.getRuntimeSkillTimingProfile(double,10).afterCastActDelayMs,
  fireBoltCast: ctx.getRuntimeSkillTimingProfile(firebolt,10).cast,
  magnumCooldown: ctx.getRuntimeSkillTimingProfile(magnum,10).cooldownMs,
  fingerWalkDelay: [ctx.getRuntimeSkillTimingProfile(finger,1).afterCastWalkDelayMs, ctx.getRuntimeSkillTimingProfile(finger,5).afterCastWalkDelayMs],
  helpAngelCooldown: ctx.getRuntimeSkillTimingProfile(helpAngel,1).cooldownMs,
  crisisAfterCast: ctx.getRuntimeSkillTimingProfile(crisis,5).afterCastActDelayMs
},null,2));
