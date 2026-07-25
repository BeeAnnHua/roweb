const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const ROOT=path.resolve(__dirname,'..'),read=r=>fs.readFileSync(path.join(ROOT,r),'utf8'),j=r=>JSON.parse(read(r));
const runtime=j('data/skill_runtime/runtime_core_1_v1.json'),generated=j('data/skill_runtime/runtime_generated_all.json'),pending=j('data/skill_runtime/runtime_pending_review.json'),skills=j('data/skills/skills_core_1.json').skills;
const ids=[5375,5376,5377,5378,5379,5380],names={5375:'召喚元素:阿爾多雷',5376:'召喚元素:迪盧比奧',5377:'召喚元素:普羅賽拉',5378:'召喚元素:泰雷莫圖斯',5379:'召喚元素:塞爾彭斯',5380:'元素破壞'};
assert.strictEqual(runtime.version,'0.9.82BR');assert.strictEqual(Object.keys(runtime.skills).length,676);assert.strictEqual(generated.summary.officialRuntime,676);assert.strictEqual(generated.summary.pending,463);assert.strictEqual(pending.skills.length,463);
const pendingIds=new Set(pending.skills.map(x=>Number(x.skillId)));for(const id of ids){assert(runtime.skills[String(id)]?.executionEnabled);assert(!pendingIds.has(id));assert.strictEqual(skills[String(id)].name,names[id]);assert.strictEqual(skills[String(id)].effectRuntime.runtimeVersion,'0.9.82BM');}

function makeContext(){
 const target={name:'龍族測試怪物',position:{x:100,y:200},currentHp:999999,maxHp:999999,mdef:0,race:'Dragon',element:'Neutral',runtimeState:{statuses:{}}};
 const player={hp:10000,maxHp:10000,sp:10000,maxSp:10000,baseLevel:100,jobLevel:60,position:{x:100,y:200},stats:{int:100},traitStats:{spl:100},activeBuffs:{},learnedSkills:{...Object.fromEntries(ids.map(id=>[id,id===5380?10:1])),5369:5,5370:5,5371:5,5372:5,5373:5},equipment:{weapon:1}};
 const c={console,Date,JSON,Number,String,Array,Object,Set,Map,Boolean,Infinity,NaN,Math:Object.create(Math),window:null,player,currentMonster:target,activeMonsters:[target],mapMonsters:[target],logs:[],
  skillsData:{runtimeProfiles:Object.fromEntries([...ids,5369,5370,5371,5372,5373].map(id=>[String(id),runtime.skills[String(id)]])),skillIndex:Object.fromEntries([...ids,5369,5370,5371,5372,5373].map(id=>[String(id),skills[String(id)]]))},
  getSkillLevel:id=>Number(player.learnedSkills[String(id)]||0),getCurrentJobSkills:()=>ids.map(id=>skills[String(id)]),getExtraSkillSkillList:()=>[],getItemData:()=>({dbSubType:'Book'}),
  calculateDerivedPlayerStats:()=>({matk:100,matkMin:100,matkMax:100,stats:{int:100,spl:100},sMatk:0}),addBattleLog(x){c.logs.push(x)},updatePlayerUI(){},updateMonsterUI(){},saveGame(){},recalculatePlayerStats(){},playMonsterHitAnimation(){},showDamageNumber(){},playPlayerAttackAnimation(){},playROStudioPlayerMotion(){},isPlayerMounted:()=>false,getSkillRangePx:()=>99999,canAttackMonsterByRange:()=>true,movePlayerTowardMonster(){},document:{getElementById(){return null}},requestAnimationFrame:f=>f(),setTimeout:f=>{f();return 1},clearTimeout(){},setInterval:()=>1,clearInterval(){},RO_WEB_CELL_SIZE:32};
 c.Math.random=()=>0;c.window=c;c.TargetingResolver={collect(origin,candidates){return (candidates||[]).filter(Boolean)}};c.MultiHitResolver={normalize(profile,level){const v=x=>Array.isArray(x)?Number(x[level-1]):Number(x||1);return {damageHitCount:Math.max(1,v(profile.damageHitCount)),visualHitCount:Math.max(1,v(profile.visualHitCount)),statusProcMode:'once'};},split(total,hits){hits=Math.max(1,Number(hits));const q=Math.floor(total/hits),r=total-q*hits;return Array.from({length:hits},(_,i)=>q+(i<r?1:0));}};
 c.StatusManager={apply(){return {applied:true}},has(){return false;}};c.CombatDamagePipeline={resolveMagicSkill(profile,level,t,opt={}){c.lastElement=profile.element;return {damage:Number(opt.ratio||0)*Number(opt.hits||1),element:profile.element};}};return c;
}
const c=makeContext();vm.createContext(c);vm.runInContext(read('js/skill_engine.js'),c,{filename:'skill_engine.js'});
assert.strictEqual(c.castAttackSkill(skills['5380'],10),false,'buster must fail without high elemental');
assert.strictEqual(c.castBuffSkill(skills['5375'],1),true);assert.strictEqual(c.player.activeBuffs['5375'].effects.summonedHighElementalType,'Ardor');
assert.strictEqual(c.calculateSkillAttackDamage(skills['5380'],10,c.currentMonster,{}),29550);assert.strictEqual(c.lastElement,'Fire');
assert.strictEqual(c.castBuffSkill(skills['5376'],1),true);assert(!c.player.activeBuffs['5375']);assert.strictEqual(c.player.activeBuffs['5376'].effects.summonedHighElementalType,'Diluvio');
assert.strictEqual(c.calculateSkillAttackDamage(skills['5369'],5,c.currentMonster,{}),21800);
assert.strictEqual(c.castBuffSkill(skills['5377'],1),true);assert.strictEqual(c.calculateSkillAttackDamage(skills['5370'],5,c.currentMonster,{}),7900);
assert.strictEqual(c.castBuffSkill(skills['5379'],1),true);assert.strictEqual(c.calculateSkillAttackDamage(skills['5371'],5,c.currentMonster,{}),7900);
assert.strictEqual(c.castBuffSkill(skills['5375'],1),true);assert.strictEqual(c.calculateSkillAttackDamage(skills['5372'],5,c.currentMonster,{}),7900);
assert.strictEqual(c.castBuffSkill(skills['5378'],1),true);assert.strictEqual(c.calculateSkillAttackDamage(skills['5373'],5,c.currentMonster,{}),21800);
console.log(JSON.stringify({result:'PASS',version:'0.9.82BM',official:650,pending:489,mageOfficial:126,magePending:27,elementalBusterDragon:29550,diamondStormDiluvio:21800,elementalFieldMatched:7900},null,2));
