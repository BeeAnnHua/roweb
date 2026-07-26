const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..'),j=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const core=j('data/skills/skills_core_1.json').skills,runtime=j('data/skill_runtime/runtime_core_1_v1.json');
const generated=j('data/skill_runtime/runtime_generated_all.json'),pending=j('data/skill_runtime/runtime_pending_review.json');
assert.strictEqual(runtime.version,'0.9.82BX');assert.strictEqual(Object.keys(runtime.skills).length,707);
assert.strictEqual(generated.summary.officialRuntime,707);assert.strictEqual(generated.summary.pending,432);assert.strictEqual(pending.skills.length,432);
assert.strictEqual(generated.skills['2464'].handler,'heal');assert.strictEqual(generated.skills['2464'].executionEnabled,true);
assert(!pending.skills.some(x=>Number(x.skillId)===2464));assert.strictEqual(core['2464'].name,'精靈治癒');assert.strictEqual(core['2464'].skillType,'heal');
const runtimeProfiles={};for(const [id,row] of Object.entries(runtime.skills))runtimeProfiles[id]=row.runtimeProfile||row;
const logs=[];const ctx={console,Date,Math,setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},window:null,
 player:{hp:2000,maxHp:10000,sp:500,maxSp:5000,baseLevel:200,stats:{int:100},position:{x:0,y:0},activeBuffs:{},runtimeState:{statuses:{}},learnedSkills:{2464:1}},
 currentMonster:null,skillsData:{runtimeProfiles},virtualSummonData:{uiText:{noSummon:'目前沒有可控制的召喚物。'}},
 getSkillLevel:id=>Number(ctx.player.learnedSkills[id]||0),calculateDerivedPlayerStats:()=>({maxHp:10000,maxSp:5000,matk:500,stats:{int:100}}),
 updatePlayerUI:()=>{},saveGame:()=>{},playROStudioPlayerMotion:()=>{},addBattleLog:s=>logs.push(s),getPassiveSkillBonusTotals:()=>({}),getActiveBuffBonusTotals:()=>({}),
 isPlayerMounted:()=>false,hasEquippedShieldRuntime:()=>false,getActiveVirtualSummon:()=>ctx.activeSummon};ctx.window=ctx;
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/skill_engine.js'),'utf8'),ctx);
ctx.activeSummon=null;assert.strictEqual(ctx.castHealSkill(core['2464'],1),false);assert.strictEqual(ctx.player.hp,2000);assert.strictEqual(ctx.player.sp,500);
ctx.activeSummon={type:'Agni'};assert.strictEqual(ctx.castHealSkill(core['2464'],1),true);assert.strictEqual(ctx.player.hp,3000);assert.strictEqual(ctx.player.sp,1000);
assert(logs.some(x=>x.includes('HP 恢復 1000，SP 恢復 500')));
const mageJobs=['mage','mage_high','wizard','high_wizard','warlock','arch_mage','sage','professor','sorcerer','elemental_master'];
const family=new Set();for(const job of mageJobs)for(const row of j(`data/skill_trees/${job}.json`).skills)family.add(Number(row.skillId));
assert.strictEqual(family.size,153);assert.strictEqual([...family].filter(id=>runtime.skills[String(id)]).length,153);
console.log(JSON.stringify({result:'PASS',official:707,pending:432,mageFamily:'153/153',hp:ctx.player.hp,sp:ctx.player.sp},null,2));
