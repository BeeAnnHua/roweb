const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const ROOT=path.resolve(__dirname,'..'),read=r=>fs.readFileSync(path.join(ROOT,r),'utf8'),j=r=>JSON.parse(read(r));
const runtime=j('data/skill_runtime/runtime_core_1_v1.json'),generated=j('data/skill_runtime/runtime_generated_all.json'),pending=j('data/skill_runtime/runtime_pending_review.json'),catalog=j('data/skill_runtime/runtime_formula_catalog.json'),skills=j('data/skills/skills_core_1.json').skills;
const ids=[280,281,282,283,284,1008,1017,1018,1019];
const names={280:'火屬性附加',281:'水屬性附加',282:'風屬性附加',283:'地屬性附加',284:'龍知識',1008:'水屬性元素更換',1017:'地屬性元素更換',1018:'火屬性元素更換',1019:'風屬性元素更換'};
assert.strictEqual(runtime.version,'0.9.82BI');assert.strictEqual(Object.keys(runtime.skills).length,626);assert.strictEqual(generated.summary.officialRuntime,626);assert.strictEqual(generated.summary.pending,513);assert.strictEqual(pending.skills.length,513);assert.strictEqual(catalog.summary.officialRuntime,626);
const pendingIds=new Set(pending.skills.map(x=>Number(x.skillId)));
for(const id of ids){assert(runtime.skills[String(id)]?.executionEnabled,`runtime ${id}`);assert(!pendingIds.has(id));assert.strictEqual(skills[String(id)].name,names[id]);assert.strictEqual(skills[String(id)].effectRuntime.runtimeVersion,'0.9.82BI');}
function makeContext(){
 const target={name:'龍族測試怪物',race:'Dragon',element:'Neutral',elementLevel:1,position:{x:100,y:200},currentHp:999999,maxHp:999999,mdef:0,def:0,runtimeState:{statuses:{}}};
 const player={hp:10000,maxHp:10000,sp:10000,maxSp:10000,baseLevel:100,jobLevel:60,position:{x:10,y:20},stats:{int:100,dex:100},activeBuffs:{},learnedSkills:{280:5,281:5,282:5,283:5,284:5,1008:1,1017:1,1018:1,1019:1},equipment:{weapon:1}};
 const logs=[];
 const c={console,Date,JSON,Number,String,Array,Object,Set,Map,Boolean,Infinity,NaN,Math:Object.create(Math),window:null,player,currentMonster:target,activeMonsters:[target],mapMonsters:[target],logs,
  skillsData:{runtimeProfiles:Object.fromEntries(ids.map(id=>[String(id),runtime.skills[String(id)]])),skillIndex:Object.fromEntries(ids.map(id=>[String(id),skills[String(id)]]))},
  getSkillLevel:id=>Number(player.learnedSkills[String(id)]||0),getCurrentJobSkills:()=>ids.map(id=>skills[String(id)]),getExtraSkillSkillList:()=>[],getItemData:()=>({dbSubType:'Book'}),getEquippedWeaponTypeRuntime:()=> 'book',
  calculateDerivedPlayerStats:()=>({matk:100,matkMin:100,matkMax:100,stats:{int:100,dex:100},sMatk:0}),addBattleLog(x){logs.push(x)},updatePlayerUI(){},updateMonsterUI(){},saveGame(){},recalculatePlayerStats(){},playMonsterHitAnimation(){},showDamageNumber(){},playPlayerAttackAnimation(){},playROStudioPlayerMotion(){},isPlayerMounted:()=>false,getSkillRangePx:()=>99999,canAttackMonsterByRange:()=>true,movePlayerTowardMonster(){},document:{getElementById(){return null}},requestAnimationFrame:f=>f(),setTimeout:f=>{f();return 1},clearTimeout(){},setInterval:()=>1,clearInterval(){},RO_WEB_CELL_SIZE:32,
  DefenseResolver:{physical:d=>d,magic:d=>d},getEquipmentCombatBonusTotals:()=>({}),getEquipmentModifierList:()=>[],getWeaponRuntimeInfo:()=>({}),getTrainingBonusTotals:()=>({damageRate:0}),ResourceFormulaResolver:{inputs:()=>({})}};
 c.Math.random=()=>0.75;c.window=c;return c;
}
const c=makeContext();vm.createContext(c);vm.runInContext(read('js/combat_mechanics_runtime.js'),c,{filename:'combat_mechanics_runtime.js'});vm.runInContext(read('js/skill_engine.js'),c,{filename:'skill_engine.js'});vm.runInContext(read('js/combat_formula_runtime.js'),c,{filename:'combat_formula_runtime.js'});vm.runInContext(read('js/ra_renewal_damage_pipeline.js'),c,{filename:'ra_renewal_damage_pipeline.js'});
// Endow: Self Only, 30 minutes, exclusive group and matching magic bonus.
assert.strictEqual(c.castBuffSkill(skills['280'],5),true);assert.strictEqual(c.player.activeBuffs['280'].effects.attackElementOverride,'Fire');assert.strictEqual(c.player.activeBuffs['280'].effects.magicElementDamageRate,5);assert(Math.abs((c.player.activeBuffs['280'].expiresAt-Date.now())-1800000)<1000);
assert.strictEqual(c.castBuffSkill(skills['281'],5),true);assert(!c.player.activeBuffs['280']);assert(c.player.activeBuffs['281']);assert.strictEqual(c.getActiveBuffSpecialValue('attackElementOverride'),'Water');
const waterMagic=c.RARenewalDamagePipeline.resolveMagicSkill({element:'Water',elementSource:'fixed'},5,c.currentMonster,{ratio:100,hits:1});
const fireMagic=c.RARenewalDamagePipeline.resolveMagicSkill({element:'Fire',elementSource:'fixed'},5,c.currentMonster,{ratio:100,hits:1});
assert.strictEqual(waterMagic.raw,105);assert.strictEqual(fireMagic.raw,100);
// Dragonology exact split.
const passive=c.getPassiveSkillBonusTotals(),mods=c.getPassiveCombatModifierTotals();assert.strictEqual(passive.intFlat,3);assert.strictEqual(mods.raceResist.Dragon,20);assert.strictEqual(mods.physicalRaceDamage.Dragon,20);assert.strictEqual(mods.magicRaceDamage.Dragon,10);
assert.strictEqual(c.CombatFormulaRuntime.applyDamage(100,{target:c.currentMonster,damageType:'physical',attackElement:'Neutral',applyElement:false,applyDefense:false,applyWeaponSize:false}),120);
assert.strictEqual(c.CombatFormulaRuntime.applyDamage(100,{target:c.currentMonster,damageType:'magic',attackElement:'Neutral',applyElement:false,applyDefense:false}),110);
// Elemental change: 30 minutes, random element level 1-4 (Math.random=0.75 => Lv4), no boss.
assert.strictEqual(c.castTimedStatusSkill(skills['1008'],1),true);let bonus=c.getMonsterRuntimeBonuses(c.currentMonster);assert.strictEqual(bonus.defenseElementOverride,'Water');assert.strictEqual(bonus.defenseElementLevelOverride,4);let prof=c.CombatFormulaRuntime.getTargetProfile(c.currentMonster);assert.strictEqual(prof.element,'Water');assert.strictEqual(prof.elementLevel,4);
c.currentMonster.isBoss=true;delete c.currentMonster.runtimeState.statuses.elementalchangewater;assert.strictEqual(c.castTimedStatusSkill(skills['1008'],1),false);c.currentMonster.isBoss=false;
console.log(JSON.stringify({result:'PASS',version:'0.9.82BI',official:626,pending:513,mageOfficial:102,magePending:51,endowWaterMagic:waterMagic.raw,dragonPhysical:120,dragonMagic:110,elementChange:{element:prof.element,level:prof.elementLevel}},null,2));
