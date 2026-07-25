const fs=require('fs'),vm=require('vm'),path=require('path');
(async()=>{
const root=path.resolve(__dirname,'..');
const core=JSON.parse(fs.readFileSync(path.join(root,'data/skills/skills_core_1.json'),'utf8')).skills;
const runtime=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_core_1_v1.json'),'utf8')).skills;
const generated=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_generated_all.json'),'utf8')).skills;
const pending=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_pending_review.json'),'utf8')).skills;
function assert(c,m){if(!c)throw new Error(m);}
for(const id of [2258,2260,2261]){assert(generated[id]?.implementationMode==='official'&&generated[id]?.executionEnabled,'official '+id);assert(!pending.some(x=>Number(x.skillId)===id),'pending '+id);}
assert(Object.values(generated).filter(x=>x.implementationMode==='official'&&x.executionEnabled).length>=538,'official coverage regression floor');
assert(pending.length<=601,'pending count regression ceiling');
assert(runtime['2258'].runtimeProfile.targeting.radius===2,'vulcan area');
assert(JSON.stringify(runtime['2260'].runtimeProfile.targeting.radius)===JSON.stringify([2,3,4]),'cold area');
assert(runtime['2261'].runtimeProfile.ignoreFlee===true&&runtime['2261'].runtimeProfile.defenseMode==='simple','arm cannon flags');
const math=Object.create(Math);let sequence=[];math.random=()=>sequence.length?sequence.shift():0;
let now=1000000;const DateMock={now:()=>now};
const learned={2258:3,2260:3,2261:5};
const monster={name:'Test Monster',currentHp:1000000,maxHp:1000000,atk:1000,def:100,hardDef:100,softDef:20,mdef:0,res:0,flee:999,race:'Formless',size:'Medium',element:'Neutral',stats:{vit:1,luk:1,int:1},position:{x:0,y:0}};
const ctx={console,Date:DateMock,Math:math,setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},window:null,RO_WEB_CELL_SIZE:32,
 player:{learnedSkills:learned,jobKey:'mechanic',baseLevel:100,jobLevel:60,hp:10000,maxHp:10000,sp:1000,maxSp:1000,zeny:999999,stats:{str:1,agi:1,vit:1,int:1,dex:100,luk:1},activeBuffs:{},equipment:{},position:{x:0,y:0}},
 skillsData:{runtimeProfiles:runtime,skillIndex:core},currentMonster:monster,getCombatGroundCandidates:()=>[monster],
 getSkillLevel:id=>Number(learned[id]||0),getCurrentJobSkills:()=>Object.values(core),getExtraSkillSkillList:()=>[],getSkillDataById:id=>core[String(id)]||null,isSkillBasic:()=>false,isPlayerMounted:()=>false,getEquippedWeaponTypeRuntime:()=> 'axe',getItemData:()=>null,getEquippedItems:()=>[],
 calculateDerivedPlayerStats:()=>({stats:{str:1,agi:1,vit:1,int:1,dex:100,luk:1},atk:500,matk:100,hit:999,cri:0}),getPassiveSkillBonusTotals:()=>({}),getTrainingBonusTotals:()=>({}),getPassiveTargetDamageBonus:()=>0,getPassiveCombatModifierTotals:()=>({}),getActiveBuffSpecialValue:()=>null,
 loadJson:async()=>JSON.parse(fs.readFileSync(path.join(root,'data/combat_runtime/renewal_combat_tables.json'),'utf8')),
 updatePlayerUI:()=>{},saveGame:()=>{},recalculatePlayerStats:()=>{},addBattleLog:()=>{},playPlayerAttackAnimation:()=>{},playROStudioPlayerMotion:()=>{},showSlashEffect:()=>{},updateMonsterUI:()=>{},showDamageNumber:()=>{},playMonsterHitAnimation:()=>{},defeatMonster:()=>{}};ctx.window=ctx;
vm.createContext(ctx);for(const file of ['combat_mechanics_runtime.js','combat_formula_runtime.js','ra_renewal_damage_pipeline.js','combat_damage_pipeline.js','skill_engine.js'])vm.runInContext(fs.readFileSync(path.join(root,'js',file),'utf8'),ctx,{filename:file});await ctx.CombatFormulaRuntime.load();
ctx.calculateSkillAttackDamage(core['2258'],3,monster,{skipHitCheck:true});assert(ctx.lastRADamageTrace?.ratio===790,'vulcan ratio '+ctx.lastRADamageTrace?.ratio);
ctx.player.baseLevel=150;ctx.calculateSkillAttackDamage(core['2260'],3,monster,{skipHitCheck:true});assert(ctx.lastRADamageTrace?.ratio===1200,'cold ratio '+ctx.lastRADamageTrace?.ratio);
ctx.player.baseLevel=100;ctx.calculateSkillAttackDamage(core['2261'],5,monster,{skipHitCheck:true});assert(ctx.lastRADamageTrace?.ratio===2150,'arm ratio '+ctx.lastRADamageTrace?.ratio);
monster.runtimeState={statuses:{}};sequence=[0.99,0];ctx.applyAttackRuntimeStatus(runtime['2260'].runtimeProfile,3,monster);assert(!ctx.StatusManager.has(monster,'freeze'),'freeze should fail');assert(ctx.StatusManager.has(monster,'freezing'),'freezing fallback');assert(ctx.getMonsterRuntimeBonuses(monster).defRate===-10,'freezing def penalty');
monster.runtimeState={statuses:{}};sequence=[0];ctx.applyAttackRuntimeStatus(runtime['2260'].runtimeProfile,3,monster);assert(ctx.StatusManager.has(monster,'freeze'),'freeze applies');assert(!ctx.StatusManager.has(monster,'freezing'),'stop after freeze');
console.log(JSON.stringify({result:'PASS',version:'0.9.82AS',official:538,pending:601,vulcanRatio:790,coldRatio:1200,armCannonRatio:2150,freezeFallback:true},null,2));
})().catch(err=>{console.error(err);process.exit(1);});
