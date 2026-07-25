const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const ROOT=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(ROOT,rel),'utf8');
const j=rel=>JSON.parse(read(rel));
const core=j('data/skill_runtime/runtime_core_1_v1.json');
const generated=j('data/skill_runtime/runtime_generated_all.json');
const pending=j('data/skill_runtime/runtime_pending_review.json');
const catalog=j('data/skill_runtime/runtime_formula_catalog.json');
const skills=j('data/skills/skills_core_1.json').skills;
const copy=j('data/skill_runtime/runtime_copyable_skills.json');
const ids=[2209,2217,2222,2223,2224,2229,2230,2231,2232,5215,5218,5222,5225,5230,5232,5235,6516];
assert.strictEqual(core.version,'0.9.82BG');
assert.strictEqual(Object.keys(core.skills).length,610);
assert.strictEqual(generated.summary.officialRuntime,610);
assert.strictEqual(generated.summary.pending,529);
assert.strictEqual(pending.skills.length,529);
assert.strictEqual(catalog.summary.officialRuntime,610);
const pendingIds=new Set(pending.skills.map(x=>Number(x.skillId)));
for(const id of ids){
  assert(core.skills[String(id)]?.executionEnabled,`runtime ${id}`);
  assert(!pendingIds.has(id),`not pending ${id}`);
  assert.strictEqual(skills[String(id)]?.implementationStatus,'runtime_official');
}
assert.strictEqual(skills['2209'].name,'魔力凍結');
assert.strictEqual(skills['2217'].name,'屬性漩渦');
for(const id of [2222,2223,2224,2229,2230,2231,2232,6516]){
  assert.strictEqual(skills[String(id)].skillType,'passive');
  assert.strictEqual(core.skills[String(id)].runtimeProfile.handler,'passive');
}
assert.strictEqual(j('data/skill_trees/warlock.json').name,'咒術士');
assert.strictEqual(j('data/skill_trees/arch_mage.json').name,'禁咒魔導士');
assert.strictEqual(copy.summary.reproduceRuntimeReady,copy.reproduce.filter(x=>x.runtimeReady&&x.enabled).length);

function makeMonster(name,x=0,race='Formless'){
  return {name,position:{x,y:0},currentHp:999999,maxHp:999999,mdef:0,race,runtimeState:{statuses:{}}};
}
function context(){
  const all=[5,...ids,5233,5234,5237];
  const target=makeMonster('測試怪物',0);
  const player={hp:10000,maxHp:10000,sp:10000,maxSp:10000,baseLevel:100,jobLevel:60,traitStats:{spl:100},stats:{int:100,dex:100},activeBuffs:{},learnedSkills:{},equipment:{weapon:1601}};
  const logs=[];
  const c={console,Date,JSON,Number,String,Array,Object,Set,Map,Boolean,Infinity,NaN,Math:Object.create(Math),window:null,player,currentMonster:target,activeMonsters:[target],mapMonsters:[target],
    skillsData:{runtimeProfiles:Object.fromEntries(all.filter(id=>core.skills[String(id)]).map(id=>[String(id),core.skills[String(id)]])),skillIndex:Object.fromEntries(all.filter(id=>skills[String(id)]).map(id=>[String(id),skills[String(id)]]))},
    getSkillLevel:id=>Number(player.learnedSkills[String(id)]||0),getCurrentJobSkills:()=>all.filter(id=>skills[String(id)]).map(id=>skills[String(id)]),getExtraSkillSkillList:()=>[],getItemData:()=>({dbSubType:'Staff'}),
    calculateDerivedPlayerStats:()=>({atk:100,matk:1000,matkMin:1000,matkMax:1000,stats:{int:100,dex:100,luk:1,spl:100},sMatk:0}),
    addBattleLog:x=>logs.push(x),updatePlayerUI(){},updateMonsterUI(){},saveGame(){},recalculatePlayerStats(){},playMonsterHitAnimation(){},showDamageNumber(){},playPlayerAttackAnimation(){},playROStudioPlayerMotion(){},
    isPlayerMounted:()=>false,getSkillRangePx:()=>99999,canAttackMonsterByRange:()=>true,movePlayerTowardMonster(){},hasEquippedShieldRuntime:()=>false,
    document:{getElementById(){return null}},requestAnimationFrame:f=>f(),setTimeout:f=>{f();return 1},clearTimeout(){},setInterval:()=>1,clearInterval(){},RO_WEB_CELL_SIZE:32,logs};
  c.Math.random=()=>0;c.window=c;
  c.TargetingResolver={collect(origin,candidates,opt){return (candidates||[]).filter(x=>x&&x.currentHp>0);}};
  c.MultiHitResolver={normalize(profile,level){const v=x=>Array.isArray(x)?Number(x[level-1]):Number(x||1);return {damageHitCount:Math.max(1,v(profile.damageHitCount)),visualHitCount:Math.max(1,v(profile.visualHitCount)),statusProcMode:'once'};},split(total,hits){hits=Math.max(1,Number(hits));const q=Math.floor(total/hits),r=total-q*hits;return Array.from({length:hits},(_,i)=>q+(i<r?1:0));}};
  c.StatusManager={
    apply(t,name,opt={}){t.runtimeState=t.runtimeState||{};t.runtimeState.statuses=t.runtimeState.statuses||{};const key=String(name).toLowerCase().replace(/[ _-]/g,'');t.runtimeState.statuses[key]={name,effects:opt.effects||{},expiresAt:Date.now()+Number(opt.durationMs||0)};return {applied:true};},
    has(t,name){const key=String(name).toLowerCase().replace(/[ _-]/g,'');return !!t?.runtimeState?.statuses?.[key];},chance(){return 100;}
  };
  c.CombatDamagePipeline={resolveMagicSkill(profile,level,t,opt={}){return {damage:Number(opt.ratio||0)*Number(opt.hits||1),element:profile.element};},resolvePhysicalSkill(profile,level,t,opt={}){return {damage:Number(opt.ratio||0)};}};
  return c;
}
const c=context();vm.createContext(c);vm.runInContext(read('js/skill_engine.js'),c,{filename:'skill_engine.js'});
const learn=(id,lv)=>{c.player.learnedSkills[String(id)]=lv;};
const dmg=(id,lv=5,target=c.currentMonster,opt={})=>{learn(id,lv);return c.calculateSkillAttackDamage(skills[String(id)],lv,target,opt);};

// Redesigned passives stack through the normal passive stat aggregator.
for(const id of [2222,2223,2224,2229])learn(id,2);
learn(2230,2);learn(2231,1);learn(2232,10);learn(6516,5);
let passive=c.getPassiveSkillBonusTotals();
assert.strictEqual(passive.atkRate,24);
assert.strictEqual(passive.matkRate,39);
assert.strictEqual(passive.maxHpRate,10);
assert.strictEqual(passive.maxSpRate,10);
assert.strictEqual(passive.intFlat,80);

// Tetra Vortex is 4 hits of (800+400*Lv), not four times the total formula.
assert.strictEqual(dmg(2217,10),19200);
assert.strictEqual(core.skills['2217'].runtimeProfile.element,'Holy');
assert.strictEqual(core.skills['2217'].runtimeProfile.damageHitCount,4);
const hpBefore=c.currentMonster.currentHp;learn(2217,10);assert.strictEqual(c.castAttackSkill(skills['2217'],10),true);assert.strictEqual(hpBefore-c.currentMonster.currentHp,19200);assert(c.StatusManager.has(c.currentMonster,'burning'));

// Stasis affects self and enemies, and blocks magic skills while active.
learn(2209,5);assert.strictEqual(c.castTimedStatusSkill(skills['2209'],5),true);
assert.strictEqual(c.getActiveBuffBonusTotals().blocksMagicSkills,1);
assert.strictEqual(c.canCastSkill(skills['2217'],10,['magic_damage']).ok,false);
learn(5,10);assert.strictEqual(c.canCastSkill(skills['5'],10,['physical_attack']).ok,true);
delete c.player.activeBuffs['2209'];

// Arch Mage original Renewal formulas at BaseLv100/SPL100.
assert.strictEqual(dmg(5215,5),15350);
assert.strictEqual(dmg(5218,5),6700);
assert.strictEqual(dmg(5222,5),6700);
assert.strictEqual(dmg(5225,5),14500);
assert.strictEqual(dmg(5230,10,makeMonster('不死怪',0,'Undead'),{phase:'initial'}),22400);
assert.strictEqual(dmg(5230,10,c.currentMonster,{phase:'tick'}),7500);
assert.strictEqual(dmg(5235,5),6550);
assert.strictEqual(core.skills['5230'].runtimeProfile.duration,6000);
assert.strictEqual(core.skills['5230'].runtimeProfile.tickIntervalMs,300);
assert.strictEqual(core.skills['5235'].runtimeProfile.targeting.radius,1);

// Climax is one 300-second buff and applies +25% only to supported skills.
learn(5232,5);assert.strictEqual(c.castBuffSkill(skills['5232'],5),true);
const active=c.getActiveBuffBonusTotals();assert.strictEqual(active.climax,1);assert.strictEqual(active.climaxDamageRate,25);
assert.strictEqual(dmg(5215,5),19187);
assert.strictEqual(dmg(5218,5),8375);
assert.strictEqual(dmg(5222,5),8375);
assert.strictEqual(dmg(5225,5),18124);
assert.strictEqual(dmg(5235,5),8187);
assert.strictEqual(dmg(5233,5),10312);
assert.strictEqual(dmg(5234,5),10312);
assert.strictEqual(dmg(5237,5),7125);
// Astral Strike has no official Climax branch and remains unchanged.
assert.strictEqual(dmg(5230,10,c.currentMonster,{phase:'tick'}),7500);

console.log(JSON.stringify({result:'PASS',version:'0.9.82BG',official:610,pending:529,mageOfficial:86,magePending:67,tetraVortexLv10:19200,passive,climaxRate:active.climaxDamageRate},null,2));
