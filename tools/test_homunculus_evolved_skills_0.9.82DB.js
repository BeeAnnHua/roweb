const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const hom = readJson('data/homunculus/homunculi.json');
const skillCatalog = readJson('data/homunculus/homunculus_skills.json');
const generated = readJson('data/skill_runtime/runtime_generated_all.json');
const skillCore = readJson('data/skills/skills_core_1.json');

assert.strictEqual(hom.version, '0.9.82DB');
assert.strictEqual(skillCatalog.version, '0.9.82DB');
assert.strictEqual(skillCatalog.summary.evolvedSkillsImplemented, 12);
assert.strictEqual(skillCatalog.summary.evolvedSkillsExcluded, 4);
for (const id of [8001,8002,8003,8004,8006,8008,8009,8010,8012,8013,8014,8015]) {
  assert(String(skillCatalog.skills[String(id)].runtimeStatus).startsWith('enabled'), `skill ${id} should be enabled`);
}
for (const id of [8005,8007,8011,8016]) {
  assert(String(skillCatalog.skills[String(id)].runtimeStatus).startsWith('excluded'), `skill ${id} should be excluded`);
}

let fakeNow = 1_000_000;
class FakeDate extends Date {
  static now(){ return fakeNow; }
}
const logs = [];
const math = Object.create(Math);
math.random = () => 0;
const player = {
  baseLevel: 150, jobKey: 'genetic', job: '基因學者',
  sp: 9999, hp: 10000, maxHp: 10000, maxSp: 1000,
  learnedSkills: {'243':1,'244':1,'232':5}, homunculus: {}, activeBuffs: {}
};
const monster = { name:'測試木樁', currentHp:1_000_000, def:0, mdef:0, element:'Neutral', race:'Formless', size:'Medium' };
const profiles = {'243':generated.skills['243'].runtimeProfile,'244':generated.skills['244'].runtimeProfile};
const skillIndex = {'243':skillCore.skills['243'],'244':skillCore.skills['244']};
let recalcCount = 0;
const ctx = {
  console, Date:FakeDate, Math:math, setInterval:()=>1, clearInterval:()=>{},
  document:{getElementById:()=>null},
  player, currentMonster:monster,
  loadJson:async p=>p.includes('homunculus_skills')?skillCatalog:hom,
  getSkillDataById:id=>skillIndex[String(id)],
  getSkillLevel:id=>Number(player.learnedSkills[String(id)]||0),
  getSkillRuntimeProfile:skill=>profiles[String(skill.id)],
  canCastSkill:()=>({ok:true}),
  paySkillCost:(skill,lv)=>{ const value=Array.isArray(skill.spCost)?skill.spCost[Math.max(0,lv-1)]:skill.spCost||0;player.sp-=Number(value||0); },
  reportPendingRuntime:()=>false,
  RARenewalDamagePipeline:{ finalModifiers:raw=>Math.max(0,Math.floor(raw)) },
  applySummonDamageMastery:d=>Math.floor(Number(d||0)*1.1),
  playMonsterHitAnimation:()=>{}, showDamageNumber:()=>{}, updateMonsterUI:()=>{}, updatePlayerUI:()=>{}, saveGame:()=>{}, defeatMonster:()=>{},
  recalculatePlayerStats:()=>{recalcCount++;},
  addBattleLog:(text,type)=>logs.push({text,type}),
  window:null
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root,'js/homunculus.js'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(root,'js/homunculus_skill_runtime.js'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(root,'js/homunculus_s_skill_runtime.js'),'utf8'),ctx);

(async()=>{
  await ctx.loadHomunculusData();
  assert.strictEqual(ctx.HomunculusSkillRuntime.implementedSkillIds.length,12);
  assert.deepStrictEqual(Array.from(ctx.HomunculusSkillRuntime.excludedSkillIds),[8005,8007,8011,8016]);

  // Lif: low HP prioritizes Healing Touch; next action applies Avoid.
  player.hp = 2000;
  assert(ctx.summonHomunculus('lif_evolved'));
  let result = ctx.runHomunculusAiTick(monster,{manual:true});
  assert.strictEqual(result.skillId,8001);
  assert(player.hp > 2000);
  player.hp = player.maxHp;
  fakeNow += 3000;
  result = ctx.runHomunculusAiTick(monster,{manual:true});
  assert.strictEqual(result.skillId,8002);
  assert(player.activeBuffs.homunculus_skill_8002);
  assert.strictEqual(player.activeBuffs.homunculus_skill_8002.effects.walkSpeedRate,-50);

  // Rest removes player buffs and preserves selected type.
  assert(ctx.restHomunculus({skipCost:true}));
  assert(!player.activeBuffs.homunculus_skill_8002);
  assert.strictEqual(player.homunculus.selectedId,'lif_evolved');

  // Amistr: Defense then Bloodlust; physical attack receives the internal rate.
  assert(ctx.summonHomunculus('amistr_evolved',{skipCost:true}));
  fakeNow += 3000;
  result = ctx.runHomunculusAiTick(monster,{manual:true});
  assert.strictEqual(result.skillId,8006);
  assert.strictEqual(player.activeBuffs.homunculus_skill_8006.effects.vitFlat,30);
  fakeNow += 3000;
  result = ctx.runHomunculusAiTick(monster,{manual:true});
  assert.strictEqual(result.skillId,8008);
  assert.strictEqual(player.homunculus.internalBuffs['8008'].effects.attackRate,50);

  // Filir: Fleeting Move first, then alternate Moonlight and S.B.R.44.
  assert(ctx.summonHomunculus('filir_evolved',{skipCost:true}));
  fakeNow += 3000;
  result = ctx.runHomunculusAiTick(monster,{manual:true});
  assert.strictEqual(result.skillId,8010);
  fakeNow += 3000;
  const hpBeforeMoon = monster.currentHp;
  result = ctx.runHomunculusAiTick(monster,{manual:true});
  assert.strictEqual(result.skillId,8009);
  assert.strictEqual(result.hitCount,3);
  assert(monster.currentHp < hpBeforeMoon);
  fakeNow += 3000;
  result = ctx.runHomunculusAiTick(monster,{manual:true});
  assert.strictEqual(result.skillId,8012);

  // Vanilmirth: Instruct is included in runtime stats; Caprice chooses one of four elements.
  assert(ctx.summonHomunculus('vanilmirth_evolved',{skipCost:true}));
  const activeVanil = ctx.getActiveHomunculus();
  const runtimeStats = ctx.HomunculusSkillRuntime.calculateRuntimeCombatStats(activeVanil);
  assert.strictEqual(runtimeStats.str, activeVanil.stats.str + 4);
  assert.strictEqual(runtimeStats.int, activeVanil.stats.int + 5);
  fakeNow += 3000;
  result = ctx.runHomunculusAiTick(monster,{manual:true});
  assert.strictEqual(result.skillId,8013);
  assert.strictEqual(result.hitCount,5);

  // Benediction of Chaos is adapted to player-only healing.
  player.hp = 1000;
  player.homunculus.skillCooldowns['8013'] = fakeNow + 999999;
  fakeNow += 3000;
  result = ctx.runHomunculusAiTick(monster,{manual:true});
  assert.strictEqual(result.skillId,8014);
  assert(player.hp > 1000);

  // Excluded skills never enter the active AI pool.
  for (const id of [8005,8007,8011,8016]) assert.strictEqual(ctx.HomunculusSkillRuntime.isSkillAvailable(ctx.getActiveHomunculus(),id),false);

  console.log(JSON.stringify({
    result:'PASS', version:'0.9.82DB', implemented:12, excluded:4,
    lifHeal:true, playerBuffCleanup:true, filirAlternation:true, caprice:true,
    recalculateCalls:recalcCount, logLines:logs.length
  },null,2));
})().catch(error=>{console.error(error);process.exit(1);});
