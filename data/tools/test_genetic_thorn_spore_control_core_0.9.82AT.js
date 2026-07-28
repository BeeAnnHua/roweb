const fs=require('fs'),vm=require('vm'),path=require('path');
(async()=>{
const root=path.resolve(__dirname,'..');
const coreDoc=JSON.parse(fs.readFileSync(path.join(root,'data/skills/skills_core_1.json'),'utf8'));
const core=coreDoc.skills;
const runtime=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_core_1_v1.json'),'utf8')).skills;
const generatedDoc=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_generated_all.json'),'utf8'));
const generated=generatedDoc.skills;
const pendingDoc=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_pending_review.json'),'utf8'));
const pending=pendingDoc.skills;
const copyable=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_copyable_skills.json'),'utf8'));
function assert(c,m){if(!c)throw new Error(m);}
for(const id of [2479,2481,2482,2483]){
 assert(generated[id]?.implementationMode==='official'&&generated[id]?.executionEnabled,'official '+id);
 assert(!pending.some(x=>Number(x.skillId)===id),'still pending '+id);
 assert(core[id]?.effectRuntime?.runtimeVersion==='0.9.82AT','skill core version '+id);
}
assert(Object.values(generated).filter(x=>x.implementationMode==='official'&&x.executionEnabled).length>=542,'official coverage regression');
assert(pending.length<=597,'pending count regression');
assert(generatedDoc.summary.officialRuntime>=542&&pendingDoc.summary.pending<=597,'summary count regression');
assert(runtime['2479'].runtimeProfile.targeting.radius===0,'thorn direct single target');
assert(runtime['2479'].runtimeProfile.duration[4]===18000&&runtime['2479'].runtimeProfile.followTarget===true,'thorn duration/follow');
assert(runtime['2479'].runtimeProfile.statusSequence[0].durationMs===1100,'thorn root refresh window');
assert(runtime['2481'].runtimeProfile.initialDelayMs===5000&&runtime['2481'].runtimeProfile.followTarget===true,'spore delay/follow');
assert(runtime['2481'].runtimeProfile.targeting.radius[9]===5,'spore lv10 radius');
assert(runtime['2482'].runtimeProfile.knockbackCells===0&&runtime['2482'].runtimeProfile.tickIntervalMs===300,'wall no knockback');
assert(runtime['2483'].runtimeProfile.clearGroundEffectsAtTarget===true&&runtime['2483'].runtimeProfile.clearGroundEffectsRadius===4,'crazy weed clear ground');
for(const id of [2479,2481,2482,2483]){
 const row=copyable.reproduce.find(x=>Number(x.skillId)===id);
 assert(row?.runtimeReady===true&&row?.enabled===true,'reproduce runtime '+id);
}
let now=1000000;const DateMock={now:()=>now};
const learned={2479:5,2481:10,2482:5,2483:10};
const monster={name:'Target',currentHp:9999999,maxHp:9999999,atk:1000,def:0,hardDef:0,softDef:0,mdef:0,res:0,flee:0,race:'Plant',size:'Medium',element:'Neutral',stats:{vit:1,luk:1,int:1},position:{x:0,y:0}};
const other={name:'Other',currentHp:9999999,maxHp:9999999,def:0,hardDef:0,softDef:0,mdef:0,res:0,flee:0,stats:{vit:1,luk:1,int:1},position:{x:64,y:0}};
const ctx={console,Date:DateMock,Math,setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},window:null,RO_WEB_CELL_SIZE:32,
 player:{learnedSkills:learned,jobKey:'genetic',baseLevel:100,jobLevel:60,hp:10000,maxHp:10000,sp:1000,maxSp:1000,zeny:999999,stats:{str:1,agi:1,vit:1,int:80,dex:100,luk:1},activeBuffs:{},equipment:{},position:{x:0,y:0}},
 skillsData:{runtimeProfiles:runtime,skillIndex:core},currentMonster:monster,activeMonsters:[monster,other],getCombatGroundCandidates:()=>[monster,other],
 getSkillLevel:id=>Number(learned[id]||0),getCurrentJobSkills:()=>Object.values(core),getExtraSkillSkillList:()=>[],getSkillDataById:id=>core[String(id)]||null,isSkillBasic:()=>false,isPlayerMounted:()=>false,getEquippedWeaponTypeRuntime:()=> 'sword',getItemData:()=>null,getEquippedItems:()=>[],
 calculateDerivedPlayerStats:()=>({stats:{str:1,agi:1,vit:1,int:80,dex:100,luk:1},atk:500,matk:100,hit:999,cri:0}),getPassiveSkillBonusTotals:()=>({}),getTrainingBonusTotals:()=>({}),getPassiveTargetDamageBonus:()=>0,getPassiveCombatModifierTotals:()=>({}),getActiveBuffSpecialValue:()=>null,getActiveBuffBonusTotals:()=>({}),
 loadJson:async()=>JSON.parse(fs.readFileSync(path.join(root,'data/combat_runtime/renewal_combat_tables.json'),'utf8')),
 updatePlayerUI:()=>{},saveGame:()=>{},recalculatePlayerStats:()=>{},addBattleLog:()=>{},playPlayerAttackAnimation:()=>{},playROStudioPlayerMotion:()=>{},showSlashEffect:()=>{},updateMonsterUI:()=>{},showDamageNumber:()=>{},playMonsterHitAnimation:()=>{},defeatMonster:()=>{},canAttackMonsterByRange:()=>true};ctx.window=ctx;
vm.createContext(ctx);for(const file of ['combat_mechanics_runtime.js','combat_formula_runtime.js','ra_renewal_damage_pipeline.js','combat_damage_pipeline.js','skill_engine.js'])vm.runInContext(fs.readFileSync(path.join(root,'js',file),'utf8'),ctx,{filename:file});await ctx.CombatFormulaRuntime.load();
const thorn=ctx.calculateSkillAttackDamage(core['2479'],5,monster,{skipHitCheck:true});assert(thorn===1180,'thorn damage '+thorn);
ctx.calculateSkillAttackDamage(core['2481'],10,monster,{skipHitCheck:true});assert(ctx.lastRADamageTrace?.ratio===4800,'spore total ratio '+ctx.lastRADamageTrace?.ratio);
ctx.calculateSkillAttackDamage(core['2482'],5,monster,{skipHitCheck:true});assert(ctx.lastRADamageTrace?.ratio===150,'wall ratio '+ctx.lastRADamageTrace?.ratio);
ctx.calculateSkillAttackDamage(core['2483'],10,monster,{skipHitCheck:true});assert(ctx.lastRADamageTrace?.ratio===3400,'crazy weed total ratio '+ctx.lastRADamageTrace?.ratio);
// Delayed explosion must wait five seconds and still tick once before expiry.
ctx.GroundEffectManager.effects.clear();let delayedTicks=0;
ctx.GroundEffectManager.create({id:'delayed',x:0,y:0,shape:'circle',rangeCells:5,tickMs:5000,durationMs:100,initialDelayMs:5000,maxTicks:1,onTick:()=>{delayedTicks++;}});
ctx.GroundEffectManager.update(now,[monster]);assert(delayedTicks===0,'delayed tick at cast');
now+=4999;ctx.GroundEffectManager.update(now,[monster]);assert(delayedTicks===0,'delayed tick early');
now+=1;ctx.GroundEffectManager.update(now,[monster]);assert(delayedTicks===1,'delayed tick missing');
// Radius zero must not hit a nearby target.
ctx.GroundEffectManager.effects.clear();let zeroTargets=-1;
ctx.GroundEffectManager.create({id:'zero',x:0,y:0,shape:'circle',rangeCells:0,tickMs:1000,durationMs:1000,maxTicks:1,onTick:ts=>{zeroTargets=ts.length;}});
ctx.GroundEffectManager.update(now,[monster,other]);assert(zeroTargets===1,'radius zero target count '+zeroTargets);
// Crazy Weed ground cleanup removes only effects inside 9x9 radius.
ctx.GroundEffectManager.effects.clear();
ctx.GroundEffectManager.create({id:'inside',x:64,y:0,rangeCells:1,durationMs:10000,maxTicks:99,onTick:()=>{}});
ctx.GroundEffectManager.create({id:'outside',x:320,y:0,rangeCells:1,durationMs:10000,maxTicks:99,onTick:()=>{}});
const removed=ctx.GroundEffectManager.removeInArea(monster,{shape:'circle',rangeCells:4});assert(removed===1,'removed count '+removed);assert(ctx.GroundEffectManager.effects.has('outside'),'outside removed');
console.log(JSON.stringify({result:'PASS',version:'0.9.82AT',official:542,pending:597,thornLv5:1180,sporeLv10TotalRatio:4800,wallLv5Ratio:150,crazyWeedLv10TotalRatio:3400,delayedExplosion:true,radiusZero:true,groundCleanup:true},null,2));
})().catch(err=>{console.error(err);process.exit(1);});
