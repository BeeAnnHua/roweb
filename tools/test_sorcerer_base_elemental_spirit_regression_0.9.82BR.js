const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const ROOT=path.resolve(__dirname,'..'),read=r=>fs.readFileSync(path.join(ROOT,r),'utf8'),j=r=>JSON.parse(read(r));
const runtime=j('data/skill_runtime/runtime_core_1_v1.json'),generated=j('data/skill_runtime/runtime_generated_all.json'),pending=j('data/skill_runtime/runtime_pending_review.json'),skills=j('data/skills/skills_core_1.json').skills;
const ids=[2457,2458,2459,2460],names={2457:'召喚火精靈阿格尼',2458:'召喚水精靈阿庫亞',2459:'召喚風精靈梵圖斯',2460:'召喚地精靈泰拉'};
assert.strictEqual(runtime.version,'0.9.82BR');assert.strictEqual(Object.keys(runtime.skills).length,676);assert.strictEqual(generated.summary.officialRuntime,676);assert.strictEqual(generated.summary.pending,463);assert.strictEqual(pending.skills.length,463);
const pendingIds=new Set(pending.skills.map(x=>Number(x.skillId)));
for(const id of ids){assert(runtime.skills[String(id)]?.executionEnabled);assert(!pendingIds.has(id));assert.strictEqual(skills[String(id)].name,names[id]);assert.strictEqual(skills[String(id)].effectRuntime.runtimeVersion,'0.9.82BN');assert.strictEqual(skills[String(id)].implementationStatus,'runtime_official');assert.strictEqual(skills[String(id)].skillType,'buff');}

function makeContext(){
 const target={name:'測試怪物',position:{x:100,y:200},currentHp:1000,maxHp:1000,mdef:0,race:'Formless',element:'Neutral',runtimeState:{statuses:{}}};
 const player={hp:10000,maxHp:10000,sp:10000,maxSp:10000,baseLevel:100,jobLevel:60,position:{x:100,y:200},stats:{int:100},traitStats:{spl:100},activeBuffs:{},learnedSkills:Object.fromEntries(ids.map(id=>[id,3])),equipment:{weapon:1}};
 const c={console,Date,JSON,Number,String,Array,Object,Set,Map,Boolean,Infinity,NaN,Math:Object.create(Math),window:null,player,currentMonster:target,activeMonsters:[target],mapMonsters:[target],logs:[],
  skillsData:{runtimeProfiles:Object.fromEntries(ids.map(id=>[String(id),runtime.skills[String(id)]])),skillIndex:Object.fromEntries(ids.map(id=>[String(id),skills[String(id)]]))},
  getSkillLevel:id=>Number(player.learnedSkills[String(id)]||0),getCurrentJobSkills:()=>ids.map(id=>skills[String(id)]),getExtraSkillSkillList:()=>[],getItemData:()=>({}),
  calculateDerivedPlayerStats:()=>({matk:100,matkMin:100,matkMax:100,stats:{int:100,spl:100},sMatk:0}),addBattleLog(x){c.logs.push(x)},updatePlayerUI(){},updateMonsterUI(){},saveGame(){},recalculatePlayerStats(){},playROStudioPlayerMotion(){},document:{getElementById(){return null}},requestAnimationFrame:f=>f(),setTimeout:f=>{f();return 1},clearTimeout(){},setInterval:()=>1,clearInterval(){}};
 c.Math.random=()=>0;c.window=c;return c;
}
const c=makeContext();vm.createContext(c);vm.runInContext(read('js/skill_engine.js'),c,{filename:'skill_engine.js'});
assert.strictEqual(c.castBuffSkill(skills['2457'],1),true);assert.strictEqual(c.player.activeBuffs['2457'].effects.summonedElementalType,'Agni');assert.strictEqual(c.player.activeBuffs['2457'].effects.summonedElementalGrade,1);assert.strictEqual(c.player.activeBuffs['2457'].expiresAt-Date.now(),600000);
assert.strictEqual(c.castBuffSkill(skills['2458'],2),true);assert(!c.player.activeBuffs['2457']);assert.strictEqual(c.player.activeBuffs['2458'].effects.summonedElementalType,'Aqua');assert.strictEqual(c.player.activeBuffs['2458'].effects.summonedElementalGrade,2);assert.strictEqual(c.player.activeBuffs['2458'].expiresAt-Date.now(),900000);
assert.strictEqual(c.castBuffSkill(skills['2459'],3),true);assert(!c.player.activeBuffs['2458']);assert.strictEqual(c.player.activeBuffs['2459'].effects.summonedElementalElement,'Wind');assert.strictEqual(c.player.activeBuffs['2459'].effects.summonedElementalGrade,3);assert.strictEqual(c.player.activeBuffs['2459'].expiresAt-Date.now(),1200000);
assert.strictEqual(c.castBuffSkill(skills['2460'],1),true);assert(!c.player.activeBuffs['2459']);assert.strictEqual(c.player.activeBuffs['2460'].effects.summonedElementalType,'Tera');
console.log(JSON.stringify({result:'PASS',version:'0.9.82BN',official:654,pending:485,mageOfficial:130,magePending:23,baseElementals:ids},null,2));
