const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const ROOT=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(ROOT,rel),'utf8');
const j=rel=>JSON.parse(read(rel));
const core=j('data/skill_runtime/runtime_core_1_v1.json');
const pending=j('data/skill_runtime/runtime_pending_review.json');
const sc1=j('data/skills/skills_core_1.json');
const ids=[5214,5220,5228,5233,5234,5237];
assert.strictEqual(core.version,'0.9.82BG');
assert.strictEqual(Object.keys(core.skills).length,610);
assert.strictEqual(pending.summary.officialRuntime,610);
assert.strictEqual(pending.summary.pending,529);
const pendingIds=new Set(pending.skills.map(x=>Number(x.skillId)));
for(const id of ids){assert(core.skills[String(id)]?.executionEnabled,`runtime ${id}`);assert(!pendingIds.has(id),`pending ${id}`);assert.strictEqual(sc1.skills[String(id)]?.implementationStatus,'runtime_official');}
const s5228=core.skills['5228'].runtimeProfile;
assert.strictEqual(s5228.passiveBonuses.sMatk[9],20);
assert.strictEqual(s5228.passiveBonuses.magicDamageRate[9],10);
assert.strictEqual(core.skills['5220'].runtimeProfile.damageHitCount[4],7);
assert.strictEqual(core.skills['5234'].runtimeProfile.targeting.shape,'directed_line');
assert.strictEqual(core.skills['5237'].runtimeProfile.targeting.radius[4],6);

function makeContext(){
 const skills=sc1.skills, player={hp:10000,maxHp:10000,sp:10000,maxSp:10000,zeny:0,baseLevel:100,jobLevel:60,traitStats:{spl:100},stats:{int:100},activeBuffs:{},learnedSkills:{},equipment:{weapon:1601}};
 const target={name:'測試怪物',position:{x:100,y:100},currentHp:999999,maxHp:999999,mdef:0,runtimeState:{statuses:{}}};
 const c={console,Date,JSON,Number,String,Array,Object,Set,Map,Boolean,Infinity,NaN,Math:Object.create(Math),setTimeout,clearTimeout,setInterval,clearInterval,window:null,player,currentMonster:target,activeMonsters:[target],mapMonsters:[target],
  skillsData:{runtimeProfiles:Object.fromEntries(ids.map(id=>[String(id),core.skills[String(id)]])),skillIndex:Object.fromEntries(ids.map(id=>[String(id),skills[String(id)]]))},
  getSkillLevel:id=>Number(player.learnedSkills[String(id)]||0),getCurrentJobSkills:()=>ids.map(id=>skills[String(id)]),getExtraSkillSkillList:()=>[],getItemData:()=>({dbSubType:'Staff'}),
  calculateDerivedPlayerStats:()=>({atk:100,matk:1000,matkMin:1000,matkMax:1000,stats:{int:100,dex:50,luk:1,spl:100},sMatk:0}),
  addBattleLog(){},updatePlayerUI(){},updateMonsterUI(){},saveGame(){},recalculatePlayerStats(){},playMonsterHitAnimation(){},showDamageNumber(){},playPlayerAttackAnimation(){},
  isPlayerMounted:()=>false,getSkillRangePx:()=>99999,canAttackMonsterByRange:()=>true,getActiveBuffBonusTotals:()=>({}),normalizeActiveBuffs(){},document:{getElementById(){return null}},requestAnimationFrame:f=>f(),RO_WEB_CELL_SIZE:36};
 c.Math.random=()=>0;c.window=c;
 c.TargetingResolver={collect(origin,candidates,opt){return candidates.filter(x=>x&&x.currentHp>0);}};
 c.MultiHitResolver={normalize(profile,level){const v=x=>Array.isArray(x)?Number(x[level-1]):Number(x||1);return {damageHitCount:Math.max(1,v(profile.damageHitCount)),visualHitCount:Math.max(1,v(profile.visualHitCount)),statusProcMode:'once'};},split(total,hits){hits=Math.max(1,Number(hits));const q=Math.floor(total/hits),r=total-q*hits;return Array.from({length:hits},(_,i)=>q+(i<r?1:0));}};
 c.CombatDamagePipeline={resolveMagicSkill(profile,level,t,opt){return {damage:Number(opt.ratio)*Number(opt.hits||1)};}};
 c.StatusManager={apply(t,name,opt){const key=String(name).toLowerCase().replace(/[ _-]/g,'');t.runtimeState.statuses[key]={effects:opt.effects||{},expiresAt:Date.now()+Number(opt.durationMs||0)};return {applied:true};},has(){return false;}};
 return c;
}
const c=makeContext();vm.createContext(c);vm.runInContext(read('js/skill_engine.js'),c,{filename:'skill_engine.js'});
function dmg(id,lv=5){c.player.learnedSkills[String(id)]=lv;return c.calculateSkillAttackDamage(sc1.skills[String(id)],lv,c.currentMonster,{})}
assert.strictEqual(dmg(5214),14500);                       // (2800*5 + 5*100) * 100/100
assert.strictEqual(dmg(5220),12600);                       // ((300*5 + 3*100) * 100/100) * 7 hits
assert.strictEqual(dmg(5233),8250);                        // no Climax
assert.strictEqual(dmg(5234),8250);
assert.strictEqual(dmg(5237),5700);
c.getActiveBuffBonusTotals=()=>({climax:1,climaxDamageRate:25});
assert.strictEqual(dmg(5233),10312);
assert.strictEqual(dmg(5234),10312);
assert.strictEqual(dmg(5237),7125);
// Passive activates on current unified Staff subtype.
c.player.learnedSkills={'5228':10};c.getSkillLevel=id=>Number(c.player.learnedSkills[String(id)]||0);
const passive=c.getPassiveSkillBonusTotals();
assert.strictEqual(passive.sMatk,20);assert.strictEqual(passive.magicDamageRate,10);

// Pipeline hooks: normal magic immunity blocks damage; Deadly Projection bypasses it; status disables future immunity and reflection.
const pctx={console,Math:Object.create(Math),window:null,player:{},calculateDerivedPlayerStats:()=>({matkMin:1000,matkMax:1000,sMatk:0}),getPassiveSkillBonusTotals:()=>({}),getTrainingBonusTotals:()=>({}),getActiveBuffBonusTotals:()=>({}),getMonsterRuntimeBonuses:t=>t.runtime||{},applyROCombatDamageModifiers:d=>d};pctx.Math.random=()=>0;pctx.window=pctx;
vm.createContext(pctx);vm.runInContext(read('js/ra_renewal_damage_pipeline.js'),pctx,{filename:'ra_renewal_damage_pipeline.js'});
const immune={magicImmune:true,runtime:{}};
assert.strictEqual(pctx.RARenewalDamagePipeline.resolveMagicSkill({element:'Undead'},1,immune,{ratio:100,hits:1}).damage,0);
assert.strictEqual(pctx.RARenewalDamagePipeline.resolveMagicSkill({element:'Undead',ignoreMagicImmunity:true},1,immune,{ratio:100,hits:1}).damage,1000);
immune.runtime.magicImmunityDisabled=1;assert.strictEqual(pctx.RARenewalDamagePipeline.resolveMagicSkill({element:'Fire'},1,immune,{ratio:100,hits:1}).damage,1000);
const reflecting={magicReflectRate:50,runtime:{magicReflectionDisabled:1}};assert.strictEqual(pctx.RARenewalDamagePipeline.resolveReflection({damage:1000,damageType:'magic'},reflecting,{}).reflected,0);
console.log('PASS Arch Mage Projection/Vulcan/Staff Batch61');
