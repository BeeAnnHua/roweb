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
assert.strictEqual(skillCatalog.summary.homunculusSSkillsTotal, 42);
assert.strictEqual(skillCatalog.summary.homunculusSSkillsImplemented, 41);
assert.strictEqual(skillCatalog.summary.homunculusSSkillsExcluded, 1);
assert.strictEqual(skillCatalog.skills['8022'].runtimeStatus, 'excluded_no_death_state');
for (const id of [8018,8019,8020,8021,8023,8024,8025,8026,8027,8028,8029,8030,8031,8032,8033,8034,8035,8036,8037,8038,8039,8040,8041,8042,8043,8044,8045,8046,8047,8048,8049,8050,8051,8052,8053,8054,8055,8056,8057,8058,8059]) {
  assert(String(skillCatalog.skills[String(id)].runtimeStatus).startsWith('enabled'), `skill ${id} should be enabled`);
}

let fakeNow = 2_000_000;
class FakeDate extends Date { static now(){ return fakeNow; } }
const logs=[];
const math=Object.create(Math); math.random=()=>0;
const player={baseLevel:275,jobKey:'biolo',job:'生命締造者',sp:9999,hp:50000,maxHp:50000,maxSp:5000,learnedSkills:{'243':1,'244':1,'232':5,'5337':10},homunculus:{},activeBuffs:{},runtimeState:{statuses:{}}};
const monster={name:'測試木樁',currentHp:50_000_000,maxHp:50_000_000,def:0,mdef:0,res:0,mres:0,element:'Neutral',race:'Formless',size:'Medium',runtimeState:{statuses:{}}};
const profiles={'243':generated.skills['243'].runtimeProfile,'244':generated.skills['244'].runtimeProfile};
const skillIndex={'243':skillCore.skills['243'],'244':skillCore.skills['244']};
const statusManager={
  apply(target,status,opt={}){
    target.runtimeState=target.runtimeState||{};target.runtimeState.statuses=target.runtimeState.statuses||{};
    const id=String(status).toLowerCase().replace(/[ _-]/g,'');
    target.runtimeState.statuses[id]={id,name:status,level:Number(opt.level||1),effects:{...(opt.effects||{})},expiresAt:fakeNow+Number(opt.durationMs||0)};
    return {applied:true,id,duration:Number(opt.durationMs||0),chance:Number(opt.chancePercent||100)};
  }
};
const ctx={
  console,Date:FakeDate,Math:math,setInterval:()=>1,clearInterval:()=>{},setTimeout:(fn)=>fn(),
  document:{getElementById:()=>null},player,currentMonster:monster,StatusManager:statusManager,
  loadJson:async p=>p.includes('homunculus_skills')?skillCatalog:hom,
  getSkillDataById:id=>skillIndex[String(id)],getSkillLevel:id=>Number(player.learnedSkills[String(id)]||0),
  getSkillRuntimeProfile:skill=>profiles[String(skill.id)],canCastSkill:()=>({ok:true}),
  paySkillCost:()=>{},reportPendingRuntime:()=>false,
  RARenewalDamagePipeline:{finalModifiers:raw=>Math.max(0,Math.floor(raw))},
  applySummonDamageMastery:d=>Math.floor(Number(d||0)*1.1),
  playMonsterHitAnimation:()=>{},showDamageNumber:()=>{},updateMonsterUI:()=>{},updatePlayerUI:()=>{},saveGame:()=>{},defeatMonster:()=>{},recalculatePlayerStats:()=>{},
  addBattleLog:(text,type)=>logs.push({text,type}),window:null
};
ctx.window=ctx;
vm.createContext(ctx);
for (const rel of ['js/homunculus.js','js/homunculus_skill_runtime.js','js/homunculus_s_skill_runtime.js']) {
  vm.runInContext(fs.readFileSync(path.join(root,rel),'utf8'),ctx);
}

(async()=>{
  await ctx.loadHomunculusData();
  const runtime=ctx.HomunculusSkillRuntime;
  assert.strictEqual(runtime.version,'0.9.82DB');
  assert.strictEqual(runtime.implementedHomunculusSSkillIds.length,41);
  assert.deepStrictEqual(Array.from(runtime.excludedHomunculusSSkillIds),[8022]);

  // Sera: passives, legion buff, poison attack and paralysis.
  assert(ctx.summonHomunculus('sera',{skipCost:true}));
  let active=ctx.getActiveHomunculus();
  let stats=runtime.calculateRuntimeCombatStats(active);
  assert(stats.batk >= active.stats.batk + 500); // Polishing Needle Lv10 BATK +500.
  assert(stats.matkMin >= active.stats.matkMin + 250); // MATK +250.
  let result=runtime.castHomunculusSSkill(active,monster,8018,fakeNow);
  assert.strictEqual(result.skillId,8018);
  assert.strictEqual(active.state.internalBuffs['8018'].effects.legionCount,5);
  fakeNow+=3000;
  const hpBeforeSera=monster.currentHp;
  result=runtime.castHomunculusSSkill(active,monster,8019,fakeNow);
  assert.strictEqual(result.skillId,8019);
  assert(monster.currentHp<hpBeforeSera);
  assert(monster.runtimeState.statuses.paralysis);

  // Light of Regene is intentionally excluded.
  assert.strictEqual(runtime.isHomunculusSSkillAvailable(active,8022),false);

  // Eira: passive MATK, heal + cleanse, and high-level wind magic.
  assert(ctx.summonHomunculus('eira',{skipCost:true}));
  active=ctx.getActiveHomunculus();
  stats=runtime.calculateRuntimeCombatStats(active);
  assert(stats.matkMin >= active.stats.matkMin + 700);
  player.hp=1000; player.runtimeState.statuses.poison={id:'poison'};
  fakeNow+=3000;
  result=runtime.castHomunculusSSkill(active,monster,8026,fakeNow);
  assert.strictEqual(result.skillId,8026);
  assert(player.hp>1000);
  assert(!player.runtimeState.statuses.poison);
  fakeNow+=3000;
  result=runtime.castHomunculusSSkill(active,monster,8048,fakeNow);
  assert.strictEqual(result.hitCount,6);

  // Eleanor: AI establishes style and executes the fighting combo in order.
  assert(ctx.summonHomunculus('eleanor',{skipCost:true}));
  fakeNow+=3000; result=ctx.runHomunculusAiTick(monster,{manual:true}); assert.strictEqual(result.skillId,8027);
  fakeNow+=3000; result=ctx.runHomunculusAiTick(monster,{manual:true}); assert.strictEqual(result.skillId,8028);
  fakeNow+=3000; result=ctx.runHomunculusAiTick(monster,{manual:true}); assert.strictEqual(result.skillId,8029);
  fakeNow+=3000; result=ctx.runHomunculusAiTick(monster,{manual:true}); assert.strictEqual(result.skillId,8030);

  // Bayeri: defensive player buff, passive dual stats and Holy attack status.
  assert(ctx.summonHomunculus('bayeri',{skipCost:true}));
  active=ctx.getActiveHomunculus(); stats=runtime.calculateRuntimeCombatStats(active);
  assert(stats.batk >= active.stats.batk + 400);
  assert(stats.matkMin >= active.stats.matkMin + 400);
  fakeNow+=3000; result=runtime.castHomunculusSSkill(active,monster,8058,fakeNow);
  assert.strictEqual(player.activeBuffs.homunculus_skill_8058.effects.resFlat,30);
  fakeNow+=3000; result=runtime.castHomunculusSSkill(active,monster,8031,fakeNow);
  assert(monster.runtimeState.statuses.stun);

  // Dieter: passive BATK, ground periodic fire and player P.ATK buff.
  assert(ctx.summonHomunculus('dieter',{skipCost:true}));
  active=ctx.getActiveHomunculus(); stats=runtime.calculateRuntimeCombatStats(active);
  assert(stats.batk >= active.stats.batk + 700);
  fakeNow+=3000; result=runtime.castHomunculusSSkill(active,monster,8041,fakeNow);
  assert.strictEqual(result.skillId,8041);
  assert(monster.runtimeState.statuses.lavaslide);
  fakeNow+=3000; result=runtime.castHomunculusSSkill(active,monster,8045,fakeNow);
  assert.strictEqual(player.activeBuffs.homunculus_skill_8045.effects.patkFlat,15);

  // Evolved runtime remains available after the S wrapper.
  assert(ctx.summonHomunculus('filir_evolved',{skipCost:true}));
  fakeNow+=3000; result=ctx.runHomunculusAiTick(monster,{manual:true});
  assert.strictEqual(result.skillId,8010);

  console.log(JSON.stringify({result:'PASS',version:'0.9.82DB',homunculusSImplemented:41,homunculusSExcluded:1,sera:true,eira:true,eleanorCombo:true,bayeri:true,dieter:true,evolvedRegression:true,logLines:logs.length},null,2));
})().catch(error=>{console.error(error);process.exit(1);});
