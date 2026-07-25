const fs=require('fs'),vm=require('vm'),path=require('path');
(async()=>{
const root=path.resolve(__dirname,'..');
const core=JSON.parse(fs.readFileSync(path.join(root,'data/skills/skills_core_1.json'),'utf8')).skills;
const runtime=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_core_1_v1.json'),'utf8')).skills;
const generatedDoc=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_generated_all.json'),'utf8'));
const generated=generatedDoc.skills;
const pendingDoc=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_pending_review.json'),'utf8'));
const pending=pendingDoc.skills;
const copyable=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_copyable_skills.json'),'utf8'));
function assert(c,m){if(!c)throw new Error(m);}
for(const id of [2480,2485,2492,5003]){assert(generated[id]?.implementationMode==='official'&&generated[id]?.executionEnabled,'official '+id);assert(!pending.some(x=>Number(x.skillId)===id),'pending '+id);assert(core[id]?.effectRuntime?.runtimeVersion==='0.9.82AU','version '+id);}
assert(Object.values(generated).filter(x=>x.implementationMode==='official'&&x.executionEnabled).length>=546,'coverage regression');assert(pending.length<=593,'pending regression');
assert(runtime['2480'].runtimeProfile.effects.bloodSuckerChancePercent[4]===9,'blood chance');
assert(runtime['2485'].runtimeProfile.tickIntervalMs===2000&&runtime['2485'].runtimeProfile.dotStatusChancePercent[4]===24,'demonic');
assert(runtime['2492'].runtimeProfile.targetSpDrainRate[4]===50,'mandragora');
assert(runtime['5003'].runtimeProfile.targeting.radius[4]===8&&runtime['5003'].runtimeProfile.statusEffects.hitFlat===-50,'illusion');
for(const id of [2480,5003]){const row=copyable.reproduce.find(x=>Number(x.skillId)===id);assert(row?.runtimeReady===true&&row?.enabled===true,'copyable '+id);}
let rand=0;const math=Object.create(Math);math.random=()=>rand;
const learned={2480:5,2485:5,2492:5,5003:5};
const monster={name:'Target',currentHp:999999,maxHp:999999,sp:1000,maxSp:1000,atk:1000,def:0,hardDef:0,softDef:0,mdef:0,res:0,flee:0,race:'Plant',size:'Medium',element:'Neutral',stats:{vit:10,luk:10,int:10},position:{x:0,y:0}};
const ctx={console,Math:math,setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},window:null,RO_WEB_CELL_SIZE:32,player:{learnedSkills:learned,jobKey:'genetic',baseLevel:100,jobLevel:60,hp:500,maxHp:1000,sp:1000,maxSp:1000,zeny:999999,stats:{str:10,agi:10,vit:10,int:80,dex:100,luk:10},activeBuffs:{},equipment:{},position:{x:0,y:0}},skillsData:{runtimeProfiles:runtime,skillIndex:core},currentMonster:monster,activeMonsters:[monster],getCombatGroundCandidates:()=>[monster],getSkillLevel:id=>Number(learned[id]||0),getCurrentJobSkills:()=>Object.values(core),getExtraSkillSkillList:()=>[],getSkillDataById:id=>core[String(id)]||null,isSkillBasic:()=>false,isPlayerMounted:()=>false,getEquippedWeaponTypeRuntime:()=> 'sword',getItemData:()=>null,getEquippedItems:()=>[],calculateDerivedPlayerStats:()=>({stats:{str:10,agi:10,vit:10,int:80,dex:100,luk:10},atk:500,matk:500,matkMin:500,matkMax:500,hit:999,cri:0}),getPassiveSkillBonusTotals:()=>({}),getTrainingBonusTotals:()=>({}),getPassiveTargetDamageBonus:()=>0,getPassiveCombatModifierTotals:()=>({}),getActiveBuffSpecialValue:()=>null,loadJson:async()=>JSON.parse(fs.readFileSync(path.join(root,'data/combat_runtime/renewal_combat_tables.json'),'utf8')),updatePlayerUI:()=>{},saveGame:()=>{},recalculatePlayerStats:()=>{},addBattleLog:()=>{},playPlayerAttackAnimation:()=>{},playROStudioPlayerMotion:()=>{},showSlashEffect:()=>{},updateMonsterUI:()=>{},showDamageNumber:()=>{},playMonsterHitAnimation:()=>{},defeatMonster:()=>{},canAttackMonsterByRange:()=>true};ctx.window=ctx;
vm.createContext(ctx);for(const file of ['combat_mechanics_runtime.js','combat_formula_runtime.js','ra_renewal_damage_pipeline.js','combat_damage_pipeline.js','skill_engine.js'])vm.runInContext(fs.readFileSync(path.join(root,'js',file),'utf8'),ctx,{filename:file});await ctx.CombatFormulaRuntime.load();
// Demonic Fire ratio at Lv5 = 210%.
ctx.calculateSkillAttackDamage(core['2485'],5,monster,{skipHitCheck:true});assert(ctx.lastRADamageTrace?.ratio===210,'demonic ratio '+ctx.lastRADamageTrace?.ratio);
// Blood sucker Lv5 guaranteed by random=0 against 9% and heals 5% damage.
ctx.castBuffSkill(core['2480'],5);const healed=ctx.tryBloodSuckerHealFromDamage(1000);assert(healed===50&&ctx.player.hp===550,'blood heal '+healed+' hp '+ctx.player.hp);
// Mandragora chance: 25+50-(10+10)/5 = 71; drain 50% SP.
rand=0;ctx.castDebuffSkill(core['2492'],5);assert(ctx.StatusManager.has(monster,'mandragora'),'mandragora missing');assert(monster.sp===500,'mandragora sp '+monster.sp);
// Illusion doping is 100% weapon ratio and applies HIT -50 status at random=0.
ctx.calculateSkillAttackDamage(core['5003'],5,monster,{skipHitCheck:true});assert(ctx.lastRADamageTrace?.ratio===100,'illusion ratio');ctx.applyAttackRuntimeStatus(runtime['5003'].runtimeProfile,5,monster);assert(ctx.StatusManager.has(monster,'illusion_doping'),'illusion status');assert(ctx.getMonsterRuntimeBonuses(monster).hitFlat===-50,'illusion hit');
console.log(JSON.stringify({result:'PASS',version:'0.9.82AU',official:546,pending:593,bloodHeal:healed,demonicRatio:210,mandragoraSp:monster.sp,illusionHit:-50},null,2));
})().catch(err=>{console.error(err);process.exit(1);});
