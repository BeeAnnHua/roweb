const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..'),j=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const generated=j('data/skill_runtime/runtime_generated_all.json'),pending=j('data/skill_runtime/runtime_pending_review.json');
assert.strictEqual(generated.summary.officialRuntime, 779);assert.strictEqual(pending.skills.length,360);
assert.strictEqual(generated.skills['2456'].handler,'summon_control');assert.strictEqual(generated.skills['2456'].executionEnabled,true);
const config=j('data/combat_runtime/virtual_summons.json');assert.strictEqual(config.rules.hasMapEntity,false);assert.strictEqual(config.rules.hasHpSpExp,false);assert.strictEqual(Object.keys(config.summons).length,9);
const logs=[],numbers=[];
const context={console,Date,Math,setInterval:()=>1,clearInterval:()=>{},document:{getElementById:()=>null},
 player:{activeBuffs:{'2457':{level:3,expiresAt:Date.now()+60000,effects:{summonedElementalSpirit:1,summonedElementalType:'Agni',summonedElementalGrade:3}}},virtualSummonSettings:{assistEnabled:true}},
 currentMonster:{name:'測試怪物',currentHp:10000},skillsData:{skillIndex:{'2461':{id:2461,name:'精靈激發'}}},
 loadJson:async()=>config,normalizeActiveBuffs:()=>{},getSkillDataById:()=>({id:2461,name:'精靈激發'}),getSkillRuntimeProfile:()=>({formula:'renewal_elemental_action'}),
 getElementalActionRuntimeSpec:()=>({actionName:'火箭',element:'Fire',radius:0,visualHits:1}),resolveRuntimeSkillTargets:(p,t)=>[t],resolveElementalActionRuntimeDamage:()=>1234,
 applyElementalActionRuntimeStatus:()=>true,playMonsterHitAnimation:()=>{},showDamageNumber:(d,o)=>numbers.push([d,o]),addBattleLog:(t,type)=>logs.push([t,type]),updateMonsterUI:()=>{},saveGame:()=>{},
 recalculatePlayerStats:()=>{},updatePlayerUI:()=>{},defeatMonster:()=>{}};
context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'js/virtual_summon.js'),'utf8'),context);
(async()=>{await context.loadVirtualSummonData();const result=context.runVirtualSummonAssistTick(context.currentMonster,{manual:true});assert(result.attacked);assert.strictEqual(result.totalDamage,1234);assert.strictEqual(context.currentMonster.currentHp,8766);assert.strictEqual(numbers[0][1].source,'summon');assert(logs.some(x=>x[0].includes('阿格尼：使用 火箭')&&x[1]==='summon-damage'));context.setVirtualSummonAssistEnabled(false);const stopped=context.runVirtualSummonAssistTick(context.currentMonster);assert.strictEqual(stopped.attacked,false);console.log(JSON.stringify({result:'PASS',official:779,pending:360,summons:9,damage:1234},null,2));})().catch(e=>{console.error(e);process.exit(1)});
