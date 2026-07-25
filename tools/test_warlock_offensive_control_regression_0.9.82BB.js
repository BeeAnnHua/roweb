const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const j=p=>JSON.parse(read(p));
const ids=[2202,2203,2204,2205,2210,2211];
const core=j('data/skill_runtime/runtime_core_1_v1.json');
const generated=j('data/skill_runtime/runtime_generated_all.json');
const catalog=j('data/skill_runtime/runtime_formula_catalog.json');
const pending=j('data/skill_runtime/runtime_pending_review.json');
const skills=j('data/skills/skills_core_1.json').skills;
const copy=j('data/skill_runtime/runtime_copyable_skills.json');
assert.strictEqual(core.version,'0.9.82BG');
assert.strictEqual(Object.keys(core.skills).length,610);
assert.strictEqual(generated.summary.officialRuntime,610);
assert.strictEqual(generated.summary.pending,529);
assert.strictEqual(pending.skills.length,529);
for(const id of ids){
 const profile=core.skills[String(id)]?.runtimeProfile;
 assert(profile&&profile.handler!=='pending',`runtime ${id}`);
 assert.strictEqual(generated.skills[String(id)].implementationMode,'official');
 assert.strictEqual(generated.skills[String(id)].executionEnabled,true);
 assert(!pending.skills.some(x=>Number(x.skillId)===id),`pending ${id}`);
 assert.strictEqual(skills[String(id)].implementationStatus,'runtime_official');
 assert(skills[String(id)].spCost.every(v=>v===0));
}
for(const id of [2202,2203,2204,2210,2211]){
 const row=copy.reproduce.find(x=>Number(x.skillId)===id);
 assert(row&&row.runtimeReady&&row.enabled,`reproduce ${id}`);
}
assert.strictEqual(copy.summary.reproduceRuntimeReady,100);
assert.strictEqual(new Set(catalog.skills.map(x=>Number(x.skillId))).size,1139);

function contextBase(){
 const logs=[];
 const player={hp:500,maxHp:1000,sp:1000,maxSp:1000,zeny:0,baseLevel:100,jobLevel:60,activeBuffs:{},learnedSkills:Object.fromEntries(ids.map(id=>[String(id),5])),stats:{int:100}};
 const target={name:'測試怪物',position:{x:100,y:100},currentHp:10000,maxHp:10000,def:0,mdef:0,isBoss:false,runtimeState:{statuses:{}}};
 const c={console,Date,JSON,Number,String,Array,Object,Set,Map,Boolean,Infinity,NaN,
  Math:Object.create(Math),setTimeout,clearTimeout,setInterval,clearInterval,window:null,player,currentMonster:target,activeMonsters:[target],mapMonsters:[target],logs,
  skillsData:{runtimeProfiles:Object.fromEntries(ids.map(id=>[String(id),core.skills[String(id)]])),skillIndex:Object.fromEntries(ids.map(id=>[String(id),skills[String(id)]]))},
  getSkillLevel:id=>Number(player.learnedSkills[String(id)]||0),getCurrentJobSkills:()=>ids.map(id=>skills[String(id)]),getExtraSkillSkillList:()=>[],
  calculateDerivedPlayerStats:()=>({atk:100,matk:1000,matkMax:1000,stats:{int:100,dex:50,luk:1}}),
  addBattleLog:t=>logs.push(String(t)),updatePlayerUI(){},updateMonsterUI(){},saveGame(){},recalculatePlayerStats(){},playMonsterHitAnimation(){},showDamageNumber(){},playPlayerAttackAnimation(){},
  isPlayerMounted:()=>false,hasEquippedShieldRuntime:()=>false,getSkillRangePx:()=>99999,canAttackMonsterByRange:()=>true,
  getPassiveSkillBonusTotals:()=>({}),getActiveBuffBonusTotals:()=>({}),normalizeActiveBuffs(){},
  document:{getElementById(){return null}},requestAnimationFrame:f=>f(),RO_WEB_CELL_SIZE:36
 };
 c.Math.random=()=>0;
 c.window=c;
 c.TargetingResolver={collect(origin,candidates,opt){return candidates.filter(x=>x&&x.currentHp>0);}};
 c.MultiHitResolver={normalize(profile,level){const v=x=>Array.isArray(x)?x[level-1]:Number(x||1);return {damageHitCount:Math.max(1,v(profile.damageHitCount)),visualHitCount:Math.max(1,v(profile.visualHitCount)),statusProcMode:'once'};},split(total,hits){hits=Math.max(1,Number(hits||1));const q=Math.floor(total/hits),r=total-q*hits;return Array.from({length:hits},(_,i)=>q+(i<r?1:0));}};
 c.CombatDamagePipeline={resolveMagicSkill(profile,level,t,opt){return {damage:Number(opt.ratio)}}};
 c.MovementEffectResolver={knockbackCalls:0,knockback(){this.knockbackCalls++;return true;}};
 c.StatusManager={applied:[],chance(){return 100},apply(t,name,opt){t.runtimeState=t.runtimeState||{};t.runtimeState.statuses=t.runtimeState.statuses||{};const key=String(name).toLowerCase().replace(/[ _-]/g,'');t.runtimeState.statuses[key]={tag:key,effects:opt.effects||{},expiresAt:Date.now()+Number(opt.durationMs||0)};this.applied.push({name,key,opt});return {applied:true};}};
 return c;
}
const c=contextBase();vm.createContext(c);vm.runInContext(read('js/skill_engine.js'),c,{filename:'skill_engine.js'});
function dmg(id,level=5){return c.calculateSkillAttackDamage(skills[String(id)],level,c.currentMonster,{})}
assert.strictEqual(dmg(2202),2100);
c.currentMonster.runtimeState.statuses.whiteimprison={tag:'white_imprison'};
assert.strictEqual(dmg(2202),4200);
delete c.currentMonster.runtimeState.statuses.whiteimprison;
assert.strictEqual(dmg(2203),700);
assert.strictEqual(dmg(2204),2500);
c.currentMonster.runtimeState.statuses.mistyfrost={tag:'misty_frost'};
assert.strictEqual(dmg(2204),4200);
delete c.currentMonster.runtimeState.statuses.mistyfrost;
assert.strictEqual(dmg(2210),1100);
assert.strictEqual(dmg(2211),3700);
// Timed status percentage reductions.
c.currentMonster.runtimeState.statuses={};
assert.strictEqual(c.castTimedStatusSkill(skills['2205'],5),true);
const marsh=c.StatusManager.applied.find(x=>x.key==='marshofabyss');
assert(marsh);assert.strictEqual(marsh.opt.effects.agiRate,-30);assert.strictEqual(marsh.opt.effects.dexRate,-30);assert.strictEqual(marsh.opt.effects.walkSpeedRate,50);
// Frosty Misty applies both statuses.
c.StatusManager.applied=[];c.currentMonster.currentHp=10000;c.currentMonster.runtimeState.statuses={};
assert.strictEqual(c.castAttackSkill(skills['2203'],5),true);
assert(c.StatusManager.applied.some(x=>x.key==='freezing'));
assert(c.StatusManager.applied.some(x=>x.key==='mistyfrost'));
// Drain Life heals 30% of actual dealt damage at Lv5 when proc succeeds.
c.player.hp=500;c.currentMonster.currentHp=10000;c.currentMonster.runtimeState.statuses={};
assert.strictEqual(c.castAttackSkill(skills['2210'],5),true);
assert.strictEqual(c.player.hp,830);
// Crimson Rock uses one total damage packet, 7 visual hits, knockback and stun.
c.StatusManager.applied=[];c.currentMonster.currentHp=10000;c.currentMonster.runtimeState.statuses={};
assert.strictEqual(c.castAttackSkill(skills['2211'],5),true);
assert.strictEqual(c.currentMonster.currentHp,6300);
assert.strictEqual(c.MovementEffectResolver.knockbackCalls,1);
assert(c.StatusManager.applied.some(x=>x.key==='stun'));
console.log('Warlock offensive/control regression 0.9.82BG: PASS');
