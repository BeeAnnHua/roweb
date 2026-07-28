const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const ROOT=path.resolve(__dirname,'..'),read=r=>fs.readFileSync(path.join(ROOT,r),'utf8'),j=r=>JSON.parse(read(r));
const runtime=j('data/skill_runtime/runtime_core_1_v1.json'),generated=j('data/skill_runtime/runtime_generated_all.json'),pending=j('data/skill_runtime/runtime_pending_review.json'),skills=j('data/skills/skills_core_1.json').skills;
const ids=[2465,2466,2467,2468,5008],names={2465:'火之紋章',2466:'水之紋章',2467:'風之紋章',2468:'地之紋章',5008:'精靈結界'};
assert.strictEqual(runtime.version,'0.9.82BO');assert.strictEqual(Object.keys(runtime.skills).length,659);assert.strictEqual(generated.summary.officialRuntime,659);assert.strictEqual(generated.summary.pending,480);assert.strictEqual(pending.skills.length,480);
const pendingIds=new Set(pending.skills.map(x=>Number(x.skillId)));
for(const id of ids){assert(runtime.skills[String(id)]?.executionEnabled);assert(!pendingIds.has(id));assert.strictEqual(skills[String(id)].name,names[id]);assert.strictEqual(skills[String(id)].effectRuntime.runtimeVersion,'0.9.82BO');assert.strictEqual(skills[String(id)].implementationStatus,'runtime_official');assert.strictEqual(skills[String(id)].skillType,'buff');}
for(const id of [373,402])assert(pendingIds.has(id),`must remain pending ${id}`);
function makeContext(){
 const all=[2457,...ids];
 const player={hp:5000,maxHp:10000,sp:5000,maxSp:10000,baseLevel:100,jobLevel:60,position:{x:100,y:200},stats:{int:100},traitStats:{spl:100},activeBuffs:{},learnedSkills:Object.fromEntries(all.map(id=>[id,id===5008?5:3])),equipment:{weapon:1},runtimeState:{statuses:{}}};
 const target={name:'測試怪物',position:{x:100,y:200},currentHp:1000,maxHp:1000,mdef:0,race:'Formless',element:'Neutral',runtimeState:{statuses:{}}};
 const profiles=Object.fromEntries(all.map(id=>[String(id),runtime.skills[String(id)]]));
 const c={console,Date,JSON,Number,String,Array,Object,Set,Map,Boolean,Infinity,NaN,Math:Object.create(Math),window:null,player,currentMonster:target,activeMonsters:[target],mapMonsters:[target],logs:[],
  skillsData:{runtimeProfiles:profiles,skillIndex:Object.fromEntries(all.map(id=>[String(id),skills[String(id)]]))},
  getSkillLevel:id=>Number(player.learnedSkills[String(id)]||0),getCurrentJobSkills:()=>all.map(id=>skills[String(id)]),getExtraSkillSkillList:()=>[],getItemData:()=>({}),
  calculateDerivedPlayerStats:()=>({matk:100,matkMin:100,matkMax:100,stats:{int:100,spl:100},sMatk:0}),addBattleLog(x){c.logs.push(x)},updatePlayerUI(){},updateMonsterUI(){},saveGame(){},recalculatePlayerStats(){},playROStudioPlayerMotion(){},document:{getElementById(){return null}},requestAnimationFrame:f=>f(),setTimeout:f=>{f();return 1},clearTimeout(){},setInterval:()=>1,clearInterval(){}};
 c.Math.random=()=>0;c.window=c;return c;
}
const c=makeContext();vm.createContext(c);vm.runInContext(read('js/skill_engine.js'),c,{filename:'skill_engine.js'});
assert.strictEqual(c.castBuffSkill(skills['2465'],2),true);assert.strictEqual(c.player.activeBuffs['2465'].effects.atkFlat,50);assert.strictEqual(c.player.activeBuffs['2465'].effects.attackElementOverride,'Fire');assert.strictEqual(c.player.activeBuffs['2465'].expiresAt-Date.now(),60000);
assert.strictEqual(c.castBuffSkill(skills['2466'],2),true);assert(!c.player.activeBuffs['2465']);assert.strictEqual(c.player.activeBuffs['2466'].effects.healingReceivedRate,10);assert.strictEqual(c.calculateItemRecoveryAmount(100,'hp'),110);
assert.strictEqual(c.castBuffSkill(skills['2468'],2),true);assert(!c.player.activeBuffs['2466']);assert.strictEqual(c.player.activeBuffs['2468'].effects.maxHpFlat,500);assert.strictEqual(c.player.activeBuffs['2468'].effects.defFlat,50);
assert.strictEqual(c.castBuffSkill(skills['5008'],5),false);assert(c.logs.some(x=>String(x).includes('需要先召喚')));
assert.strictEqual(c.castBuffSkill(skills['2457'],3),true);assert(c.player.activeBuffs['2457']);assert.strictEqual(c.castBuffSkill(skills['5008'],5),true);assert(!c.player.activeBuffs['2457']);assert.strictEqual(c.player.activeBuffs['5008'].effects.physicalDamageImmunity,1);assert.strictEqual(c.player.activeBuffs['5008'].expiresAt-Date.now(),40000);
assert(read('js/status_system.js').includes('Number(bonuses.maxHpFlat || 0)'));assert(read('js/battle.js').includes('preDamageBuffs.physicalDamageImmunity'));

const battleLogs=[];
const b={console,Date,JSON,Number,String,Array,Object,Set,Map,Boolean,Infinity,NaN,Math:Object.create(Math),window:null,player:{hp:1000,maxHp:1000,flee:0,activeBuffs:{shield:{name:'精靈結界',effects:{physicalDamageImmunity:1}}}},addBattleLog:x=>battleLogs.push(x),getActiveBuffBonusTotals:()=>({physicalDamageImmunity:1}),getMonsterRuntimeBonuses:()=>({}),recalculatePlayerStats(){},updatePlayerUI(){},updateMonsterUI(){},saveGame(){},setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){}};
b.Math.random=()=>0;b.window=b;vm.createContext(b);vm.runInContext(read('js/battle.js'),b,{filename:'battle.js'});b.addBattleLog=x=>battleLogs.push(x);b.currentMonster={name:'物理測試怪物',hit:999,attackType:'physical',attackRange:1,currentHp:1000};b.monsterAttackPlayer();assert.strictEqual(b.player.hp,1000);assert(battleLogs.some(x=>String(x).includes('精靈結界完全擋下')));
console.log(JSON.stringify({result:'PASS',version:'0.9.82BO',official:659,pending:480,mageOfficial:135,magePending:18,skills:ids},null,2));
