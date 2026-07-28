const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const ROOT=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(ROOT,rel),'utf8');
const j=rel=>JSON.parse(read(rel));
const runtime=j('data/skill_runtime/runtime_core_1_v1.json');
const generated=j('data/skill_runtime/runtime_generated_all.json');
const pending=j('data/skill_runtime/runtime_pending_review.json');
const catalog=j('data/skill_runtime/runtime_formula_catalog.json');
const skills=j('data/skills/skills_core_1.json').skills;
const ids=[484,5216,5217,5221,5227,5229];
assert.strictEqual(runtime.version,'0.9.82BG');
assert.strictEqual(Object.keys(runtime.skills).length,610);
assert.strictEqual(generated.summary.officialRuntime,610);
assert.strictEqual(generated.summary.pending,529);
assert.strictEqual(catalog.summary.officialRuntime,610);
assert.strictEqual(pending.skills.length,529);
const pendingIds=new Set(pending.skills.map(x=>Number(x.skillId)));
for(const id of ids){
  assert(runtime.skills[String(id)]?.executionEnabled,`runtime ${id}`);
  assert(!pendingIds.has(id),`not pending ${id}`);
  assert.strictEqual(skills[String(id)].implementationStatus,'runtime_official');
  assert.strictEqual(skills[String(id)].effectRuntime.runtimeVersion,'0.9.82BG');
}
assert.strictEqual(skills['484'].name,'重力原野');
assert.strictEqual(skills['5216'].name,'冰晶飛瀑');
assert.strictEqual(skills['5217'].name,'神秘幻滅');
assert.strictEqual(skills['5221'].name,'地層震動');
assert.strictEqual(skills['5227'].name,'龍捲風暴');
assert.strictEqual(skills['5229'].name,'焰火之徑');
assert(runtime.skills['87']?.executionEnabled,'Ice Wall promoted');
assert(runtime.skills['483']?.executionEnabled,'Ganbantein promoted');

function context(){
  const target={name:'測試怪物',position:{x:100,y:200},currentHp:999999,maxHp:999999,mdef:0,runtimeState:{statuses:{}}};
  const player={hp:10000,maxHp:10000,sp:10000,maxSp:10000,baseLevel:100,jobLevel:60,position:{x:12,y:34},traitStats:{spl:100},stats:{int:100,dex:100},activeBuffs:{},learnedSkills:{},equipment:{}};
  const created=[];
  const c={console,Date,JSON,Number,String,Array,Object,Set,Map,Boolean,Infinity,NaN,Math:Object.create(Math),window:null,player,currentMonster:target,activeMonsters:[target],mapMonsters:[target],
    skillsData:{runtimeProfiles:Object.fromEntries(ids.map(id=>[String(id),runtime.skills[String(id)]])),skillIndex:Object.fromEntries(ids.map(id=>[String(id),skills[String(id)]]))},
    getSkillLevel:id=>Number(player.learnedSkills[String(id)]||0),getCurrentJobSkills:()=>ids.map(id=>skills[String(id)]),getExtraSkillSkillList:()=>[],
    calculateDerivedPlayerStats:()=>({atk:100,matk:1000,matkMin:1000,matkMax:1000,stats:{int:100,dex:100,luk:1,spl:100},sMatk:0}),
    addBattleLog(){},updatePlayerUI(){},updateMonsterUI(){},saveGame(){},recalculatePlayerStats(){},playMonsterHitAnimation(){},showDamageNumber(){},playPlayerAttackAnimation(){},playROStudioPlayerMotion(){},
    isPlayerMounted:()=>false,getSkillRangePx:()=>99999,canAttackMonsterByRange:()=>true,movePlayerTowardMonster(){},hasEquippedShieldRuntime:()=>false,
    document:{getElementById(){return null}},requestAnimationFrame:f=>f(),setTimeout:f=>{f();return 1},clearTimeout(){},setInterval:()=>1,clearInterval(){},RO_WEB_CELL_SIZE:32,created};
  c.Math.random=()=>0;c.window=c;
  c.TargetingResolver={collect(origin,candidates,opt){return (candidates||[]).filter(x=>x&&x.currentHp>0);}};
  c.MultiHitResolver={normalize(profile,level){const v=x=>Array.isArray(x)?Number(x[level-1]):Number(x||1);return {damageHitCount:Math.max(1,v(profile.damageHitCount)),visualHitCount:Math.max(1,v(profile.visualHitCount)),statusProcMode:'once'};},split(total,hits){hits=Math.max(1,Number(hits));const q=Math.floor(total/hits),r=total-q*hits;return Array.from({length:hits},(_,i)=>q+(i<r?1:0));}};
  c.StatusManager={apply(){return {applied:true}},has(){return false},chance(){return 100}};
  c.CombatDamagePipeline={resolveMagicSkill(profile,level,t,opt={}){return {damage:Number(opt.ratio||0)*Number(opt.hits||1),element:profile.element};},resolvePhysicalSkill(profile,level,t,opt={}){return {damage:Number(opt.ratio||0)}}};
  c.GroundEffectManager={create(opt){created.push(opt);return opt;},remove(){}};
  return c;
}
const c=context();vm.createContext(c);vm.runInContext(read('js/skill_engine.js'),c,{filename:'skill_engine.js'});
const dmg=(id,lv=5)=>{c.player.learnedSkills[String(id)]=lv;return c.calculateSkillAttackDamage(skills[String(id)],lv,c.currentMonster,{})};
assert.strictEqual(dmg(484),5000); // 500% per hit x10
assert.strictEqual(dmg(5216),4480);
assert.strictEqual(dmg(5217),5250);
assert.strictEqual(dmg(5221),4250);
assert.strictEqual(dmg(5227),4400);
assert.strictEqual(dmg(5229),4250);

c.player.learnedSkills['5216']=5;
assert.strictEqual(c.castGroundDamageSkill(skills['5216'],5),true);
let opt=c.created.at(-1);
assert.strictEqual(opt.x,12);assert.strictEqual(opt.y,34);assert.strictEqual(opt.rangeCells,6);assert.strictEqual(opt.tickMs,500);assert.strictEqual(opt.durationMs,4000);assert.strictEqual(opt.followTarget,null);

c.player.learnedSkills['5217']=5;
assert.strictEqual(c.castGroundDamageSkill(skills['5217'],5),true);
opt=c.created.at(-1);
assert.strictEqual(opt.x,100);assert.strictEqual(opt.y,200);assert.strictEqual(opt.rangeCells,6);assert.strictEqual(opt.tickMs,300);assert.strictEqual(opt.durationMs,4000);

console.log(JSON.stringify({result:'PASS',version:'0.9.82BG',official:610,pending:529,formulas:{gravitationLv5Total:5000,rainOfCrystalLv5PerTick:4480,mysteryIllusionLv5PerTick:5250,strantumTremorLv5PerTick:4250,tornadoStormLv5PerTick:4400,floralFlareRoadLv5PerTick:4250},origins:{rainOfCrystal:[12,34],mysteryIllusion:[100,200]}},null,2));
