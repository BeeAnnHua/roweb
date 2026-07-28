const fs=require('fs'),vm=require('vm'),path=require('path');
(async()=>{
const root=path.resolve(__dirname,'..');
const core=JSON.parse(fs.readFileSync(path.join(root,'data/skills/skills_core_1.json'),'utf8')).skills;
const runtime=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_core_1_v1.json'),'utf8')).skills;
const generated=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_generated_all.json'),'utf8')).skills;
const pending=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_pending_review.json'),'utf8')).skills;
function assert(c,m){if(!c)throw new Error(m);}
for(const id of [478,2477,5338,5339]){assert(generated[id]?.implementationMode==='official'&&generated[id]?.executionEnabled,'official '+id);assert(!pending.some(x=>Number(x.skillId)===id),'pending '+id);}
assert(Object.values(generated).filter(x=>x.implementationMode==='official'&&x.executionEnabled).length>=532,'official coverage regression floor');
assert(pending.length<=607,'pending count regression ceiling');
assert(runtime['478'].formula==='renewal_slim_pitcher_self','slim formula');
assert(runtime['2477'].formula==='renewal_cart_cannon'&&runtime['2477'].defenseMode==='simple','cart cannon formula');
assert(runtime['5338'].effects.equipmentProtectionAll===1,'whole protection profile');
assert(runtime['5339'].effects.shadowEquipmentProtection===1,'shadow protection profile');
const math=Object.create(Math);math.random=()=>0.5;
const learned={478:10,231:5,227:10,4:10,2475:5,2477:5,5338:5,5339:4};
const ctx={console,Date,Math:math,setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},window:null,
 player:{learnedSkills:learned,jobKey:'biolo',baseLevel:100,jobLevel:60,hp:1000,maxHp:10000,sp:1000,maxSp:1000,zeny:999999,stats:{str:1,agi:1,vit:50,int:100,dex:1,luk:1},activeBuffs:{},equipment:{},position:{x:0,y:0}},
 skillsData:{runtimeProfiles:runtime,skillIndex:core},getSkillLevel:id=>Number(learned[id]||0),getCurrentJobSkills:()=>Object.values(core),getExtraSkillSkillList:()=>[],getSkillDataById:id=>core[String(id)]||null,isSkillBasic:()=>false,isPlayerMounted:()=>false,getEquippedWeaponTypeRuntime:()=> 'axe',getItemData:()=>null,getEquippedItems:()=>[],
 calculateDerivedPlayerStats:()=>({stats:{str:1,agi:1,vit:50,int:100,dex:1,luk:1},atk:500,matk:100}),getPassiveSkillBonusTotals:()=>({}),getTrainingBonusTotals:()=>({}),getPassiveTargetDamageBonus:()=>0,getPassiveCombatModifierTotals:()=>({}),getActiveBuffSpecialValue:()=>null,
 loadJson:async()=>JSON.parse(fs.readFileSync(path.join(root,'data/combat_runtime/renewal_combat_tables.json'),'utf8')),
 updatePlayerUI:()=>{},saveGame:()=>{},recalculatePlayerStats:()=>{},addBattleLog:()=>{},playPlayerAttackAnimation:()=>{},playROStudioPlayerMotion:()=>{},showSlashEffect:()=>{},updateMonsterUI:()=>{},currentMonster:{currentHp:100000,maxHp:100000,def:100,hardDef:100,softDef:20,res:0,flee:999,race:'Formless',size:'Medium',element:'Neutral',position:{x:0,y:0}},getCombatGroundCandidates:()=>[]};ctx.window=ctx;
vm.createContext(ctx);
for(const file of ['combat_mechanics_runtime.js','combat_formula_runtime.js','ra_renewal_damage_pipeline.js','combat_damage_pipeline.js','skill_engine.js'])vm.runInContext(fs.readFileSync(path.join(root,'js',file),'utf8'),ctx,{filename:file});
await ctx.CombatFormulaRuntime.load();
const before=ctx.player.hp;assert(ctx.castHealSkill(core['478'],10)===true,'cast slim');const healed=ctx.player.hp-before;assert(healed===3285,'slim heal '+healed);
assert(ctx.castBuffSkill(core['5338'],5)===true,'cast whole protection');assert(ctx.getActiveBuffBonusTotals().equipmentProtectionAll===1,'whole active');assert(ctx.StatusManager.apply(ctx.player,'strip_weapon',{chancePercent:100}).blocked===true,'weapon strip blocked');
assert(ctx.castBuffSkill(core['5339'],4)===true,'cast shadow protection');assert(ctx.StatusManager.apply(ctx.player,'shadow_break',{chancePercent:100}).blocked===true,'shadow break blocked');
const damage=ctx.calculateSkillAttackDamage(core['2477'],5,ctx.currentMonster,{});
assert(ctx.lastRADamageTrace?.ratio===1950,'cart cannon ratio '+ctx.lastRADamageTrace?.ratio);
assert(ctx.lastRADamageTrace?.defenseMode==='simple','cart cannon defense mode');
assert(damage===9630,'cart cannon damage '+damage);
assert(ctx.DefenseResolver.physical(2000,{hardDef:100,softDef:20,res:0},{simpleDefense:true})===1880,'simple defense');
console.log(JSON.stringify({result:'PASS',version:'0.9.82AQ',official:532,pending:607,slimHeal:healed,cartCannonLv5Ratio:ctx.lastRADamageTrace.ratio,cartCannonDamage:damage,simpleDefenseDamage:1880},null,2));
})().catch(err=>{console.error(err);process.exit(1);});
