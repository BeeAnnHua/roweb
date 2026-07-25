const fs=require('fs'),vm=require('vm'),path=require('path');
(async()=>{
const root=path.resolve(__dirname,'..');
const core=JSON.parse(fs.readFileSync(path.join(root,'data/skills/skills_core_1.json'),'utf8')).skills;
const runtime=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_core_1_v1.json'),'utf8')).skills;
const generated=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_generated_all.json'),'utf8')).skills;
const pending=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_pending_review.json'),'utf8')).skills;
const copyable=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_copyable_skills.json'),'utf8'));
function assert(c,m){if(!c)throw new Error(m);}
for(const id of [229,230,490]){assert(generated[id]?.implementationMode==='official'&&generated[id]?.executionEnabled,'official '+id);assert(!pending.some(x=>Number(x.skillId)===id),'pending '+id);}
assert(Object.values(generated).filter(x=>x.implementationMode==='official'&&x.executionEnabled).length>=535,'official coverage regression floor');
assert(pending.length<=604,'pending count regression ceiling');
assert(copyable.plagiarism.find(x=>x.skillId===229)?.enabled===true,'bomb plagiarism');
assert(copyable.reproduce.find(x=>x.skillId===230)?.enabled===true,'acid reproduce');
const math=Object.create(Math);math.random=()=>0;
const learned={227:10,229:5,230:5,490:10};
let now=1000000;const DateMock={now:()=>now};
const monster={name:'Test Monster',currentHp:1000000,maxHp:1000000,atk:1000,def:100,hardDef:100,softDef:0,res:0,flee:999,race:'Formless',size:'Medium',element:'Neutral',stats:{vit:50,luk:1,int:1},position:{x:0,y:0}};
const ctx={console,Date:DateMock,Math:math,setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},window:null,RO_WEB_CELL_SIZE:32,
 player:{learnedSkills:learned,jobKey:'creator',baseLevel:100,jobLevel:70,hp:10000,maxHp:10000,sp:1000,maxSp:1000,zeny:999999,stats:{str:1,agi:1,vit:1,int:100,dex:100,luk:1},activeBuffs:{},equipment:{},position:{x:0,y:0}},
 skillsData:{runtimeProfiles:runtime,skillIndex:core},currentMonster:monster,getCombatGroundCandidates:()=>[monster],
 getSkillLevel:id=>Number(learned[id]||0),getCurrentJobSkills:()=>Object.values(core),getExtraSkillSkillList:()=>[],getSkillDataById:id=>core[String(id)]||null,isSkillBasic:()=>false,isPlayerMounted:()=>false,getEquippedWeaponTypeRuntime:()=> 'dagger',getItemData:()=>null,getEquippedItems:()=>[],
 calculateDerivedPlayerStats:()=>({stats:{str:1,agi:1,vit:1,int:100,dex:100,luk:1},atk:500,matk:100,hit:999,cri:0}),getPassiveSkillBonusTotals:()=>({}),getTrainingBonusTotals:()=>({}),getPassiveTargetDamageBonus:()=>0,getPassiveCombatModifierTotals:()=>({}),getActiveBuffSpecialValue:()=>null,
 loadJson:async()=>JSON.parse(fs.readFileSync(path.join(root,'data/combat_runtime/renewal_combat_tables.json'),'utf8')),
 updatePlayerUI:()=>{},saveGame:()=>{},recalculatePlayerStats:()=>{},addBattleLog:()=>{},playPlayerAttackAnimation:()=>{},playROStudioPlayerMotion:()=>{},showSlashEffect:()=>{},updateMonsterUI:()=>{},showDamageNumber:()=>{},playMonsterHitAnimation:()=>{},defeatMonster:()=>{}};ctx.window=ctx;
vm.createContext(ctx);for(const file of ['combat_mechanics_runtime.js','combat_formula_runtime.js','ra_renewal_damage_pipeline.js','combat_damage_pipeline.js','skill_engine.js'])vm.runInContext(fs.readFileSync(path.join(root,'js',file),'utf8'),ctx,{filename:file});await ctx.CombatFormulaRuntime.load();
ctx.calculateSkillAttackDamage(core['229'],5,monster,{skipHitCheck:true});assert(ctx.lastRADamageTrace?.ratio===200,'bomb ratio '+ctx.lastRADamageTrace?.ratio);
ctx.calculateSkillAttackDamage(core['230'],5,monster,{skipHitCheck:true});assert(ctx.lastRADamageTrace?.ratio===1100,'acid ratio '+ctx.lastRADamageTrace?.ratio);
ctx.calculateSkillAttackDamage(core['490'],10,monster,{skipHitCheck:true});assert(ctx.lastRADamageTrace?.ratio===21500,'acid demo total ratio '+ctx.lastRADamageTrace?.ratio);
assert(ctx.castAttackSkill(core['230'],5)===true,'cast acid terror');assert(ctx.StatusManager.has(monster,'bleeding'),'bleeding');assert(ctx.getMonsterRuntimeBonuses(monster).defRate===-25,'armor break');
const hpBeforeBleed=monster.currentHp;now+=10000;ctx.GroundEffectManager.update(now,[monster]);assert(monster.currentHp===hpBeforeBleed-200,'bleeding tick '+(hpBeforeBleed-monster.currentHp));
monster.runtimeState={statuses:{}};assert(ctx.castAttackSkill(core['490'],10)===true,'cast acid demo');const bonuses=ctx.getMonsterRuntimeBonuses(monster);assert(bonuses.atkRate===-25&&bonuses.defRate===-25,'acid demo breaks '+JSON.stringify(bonuses));
monster.runtimeState={statuses:{}};const hpBeforeBomb=monster.currentHp;assert(ctx.castGroundDamageSkill(core['229'],5)===true,'cast bomb');ctx.GroundEffectManager.update(now,[monster]);assert(monster.currentHp<hpBeforeBomb,'bomb tick damage');assert(ctx.getMonsterRuntimeBonuses(monster).atkRate===-25,'bomb weapon break');
console.log(JSON.stringify({result:'PASS',version:'0.9.82AR',official:535,pending:604,bombRatio:200,acidTerrorRatio:1100,acidDemonstrationTotalRatio:21500,bleedingTickDamage:200},null,2));
})().catch(err=>{console.error(err);process.exit(1);});
