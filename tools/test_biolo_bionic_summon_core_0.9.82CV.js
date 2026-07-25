const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..'),j=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const gen=j('data/skill_runtime/runtime_generated_all.json'),cfg=j('data/combat_runtime/virtual_summons.json');
for(const id of [5344,5345,5346,5348]) assert.strictEqual(gen.skills[String(id)].handler,'virtual_summon');
assert.strictEqual(gen.skills['5337'].handler,'passive');assert(!gen.skills['5337'].runtimeProfile.passiveBonuses);
assert(Object.keys(cfg.summons).length>=13);assert.strictEqual(cfg.summons.HellTree.radius,2);
const logs=[],numbers=[];const math=Object.create(Math);math.random=()=>0.5;
const player={atk:1000,sp:1000,activeBuffs:{},virtualSummonSettings:{assistEnabled:true}};
const monster={name:'測試波利',currentHp:50000};
const profile=gen.skills['5344'].runtimeProfile;
const ctx={console,Date,Math:math,setInterval:()=>1,clearInterval:()=>{},document:{getElementById:()=>null},player,currentMonster:monster,skillsData:{skillIndex:{}},
 loadJson:async()=>cfg,normalizeActiveBuffs:()=>{},getSkillLevel:id=>Number(id)===232?0:(Number(id)===5337?10:5),getSkillRuntimeProfile:()=>profile,
 canCastSkill:()=>({ok:true,level:5,profile}),paySkillCost:()=>{player.sp-=180;},grantRuntimeApFromProfile:()=>20,
 calculateDerivedPlayerStats:()=>({atk:1000}),resolveRuntimeSkillTargets:(p,t)=>[t],RARenewalDamagePipeline:{finalModifiers:r=>r},
 playMonsterHitAnimation:()=>{},showDamageNumber:(d,o)=>numbers.push([d,o]),addBattleLog:(t,type)=>logs.push([t,type]),updateMonsterUI:()=>{},updatePlayerUI:()=>{},saveGame:()=>{},recalculatePlayerStats:()=>{},defeatMonster:()=>{},window:null};
ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/virtual_summon.js'),'utf8'),ctx);
(async()=>{await ctx.loadVirtualSummonData();assert(ctx.castVirtualSummonSkill({id:5344,name:'召喚神木戰士'},5));assert.strictEqual(player.sp,820);assert.strictEqual(ctx.getActiveVirtualSummon().type,'WoodenWarrior');
const result=ctx.runVirtualSummonAssistTick(monster,{manual:true});assert(result.attacked);assert.strictEqual(result.totalDamage,6800);assert.strictEqual(monster.currentHp,43200);assert.strictEqual(numbers[0][1].source,'summon');
player.activeBuffs={'5348':{id:5348,level:5,expiresAt:Date.now()+180000,effects:{virtualSummonType:'HellTree',virtualSummonFamily:'bionic',virtualSummonLevel:5}}};
const second={name:'第二隻',currentHp:50000};ctx.resolveRuntimeSkillTargets=(p,t)=>[t,second];const aoe=ctx.runVirtualSummonAssistTick(monster,{manual:true});assert.strictEqual(aoe.hitTargets,2);assert(aoe.totalDamage>result.totalDamage);
player.activeBuffs={'2457':{id:2457,level:3,expiresAt:Date.now()+60000,effects:{summonedElementalSpirit:1,summonedElementalType:'Agni',summonedElementalGrade:3}}};ctx.getSkillDataById=()=>({id:2461,name:'精靈激發'});ctx.getSkillRuntimeProfile=()=>({formula:'renewal_elemental_action'});ctx.getElementalActionRuntimeSpec=()=>({actionName:'火箭',element:'Fire',radius:0});ctx.resolveElementalActionRuntimeDamage=()=>1234;ctx.applyElementalActionRuntimeStatus=()=>true;ctx.resolveRuntimeSkillTargets=(p,t)=>[t];const before=monster.currentHp;const elemental=ctx.runVirtualSummonAssistTick(monster,{manual:true});assert(elemental.attacked);assert.strictEqual(elemental.totalDamage,1234);assert.strictEqual(monster.currentHp,before-1234);
console.log(JSON.stringify({result:'PASS',official:gen.summary.officialRuntime,pending:gen.summary.pending,summons:Object.keys(cfg.summons).length,warriorDamage:result.totalDamage,hellTreeTargets:aoe.hitTargets,elementalDamage:elemental.totalDamage},null,2));})().catch(e=>{console.error(e);process.exit(1)});
