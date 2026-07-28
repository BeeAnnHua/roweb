const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const ROOT=path.resolve(__dirname,'..'),read=r=>fs.readFileSync(path.join(ROOT,r),'utf8'),j=r=>JSON.parse(read(r));
const runtime=j('data/skill_runtime/runtime_core_1_v1.json'),generated=j('data/skill_runtime/runtime_generated_all.json'),pending=j('data/skill_runtime/runtime_pending_review.json'),catalog=j('data/skill_runtime/runtime_formula_catalog.json'),skills=j('data/skills/skills_core_1.json').skills;
const ids=[405,482,2451,2452,2453,6517], names={405:'易燃之網',482:'雙倍投擲',2451:'打擊強化',2452:'加熱術',2453:'極限空虛',6517:'心靈波流'};
assert.strictEqual(runtime.version,'0.9.82BJ');assert.strictEqual(Object.keys(runtime.skills).length,632);assert.strictEqual(generated.summary.officialRuntime,632);assert.strictEqual(generated.summary.pending,507);assert.strictEqual(pending.skills.length,507);assert.strictEqual(catalog.summary.officialRuntime,632);
const pendingIds=new Set(pending.skills.map(x=>Number(x.skillId)));for(const id of ids){assert(runtime.skills[String(id)]?.executionEnabled,`runtime ${id}`);assert(!pendingIds.has(id));assert.strictEqual(skills[String(id)].name,names[id]);assert.strictEqual(skills[String(id)].effectRuntime.runtimeVersion,'0.9.82BJ');}
assert(pendingIds.has(373));assert(pendingIds.has(402));
function makeContext(){
 const target={name:'測試怪物',race:'Formless',element:'Neutral',elementLevel:1,position:{x:100,y:200},currentHp:9999999,maxHp:9999999,mdef:0,def:0,stats:{int:0,luk:0,vit:0},runtimeState:{statuses:{}}};
 const player={hp:5000,maxHp:10000,sp:99999,maxSp:99999,baseLevel:100,jobLevel:60,position:{x:10,y:20},stats:{int:100,dex:100},traitStats:{spl:100},activeBuffs:{},runtimeState:{statuses:{}},learnedSkills:{405:1,482:5,2451:5,2452:5,2453:5,6517:5,19:10},equipment:{weapon:1}};
 const profiles={};for(const id of [...ids,19]) profiles[String(id)]=runtime.skills[String(id)];
 const index={};for(const id of [...ids,19]) index[String(id)]=skills[String(id)];
 const logs=[];let moved=0;
 const c={console,Date,JSON,Number,String,Array,Object,Set,Map,Boolean,Infinity,NaN,Math:Object.create(Math),window:null,player,currentMonster:target,activeMonsters:[target],mapMonsters:[target],logs,
  skillsData:{runtimeProfiles:profiles,skillIndex:index},getSkillLevel:id=>Number(player.learnedSkills[String(id)]||0),getCurrentJobSkills:()=>Object.values(index),getExtraSkillSkillList:()=>[],getItemData:()=>({dbSubType:'Book',weaponLevel:4}),getEquippedWeaponTypeRuntime:()=> 'book',
  calculateDerivedPlayerStats:()=>({matk:100,matkMin:100,matkMax:100,atk:100,hit:0,stats:{int:100,dex:100,spl:100},sMatk:0}),addBattleLog(x){logs.push(x)},updatePlayerUI(){},updateMonsterUI(){},saveGame(){},recalculatePlayerStats(){},playMonsterHitAnimation(){},showDamageNumber(){},playPlayerAttackAnimation(){},playROStudioPlayerMotion(){},isPlayerMounted:()=>false,getSkillRangePx:()=>99999,canAttackMonsterByRange:()=>true,movePlayerTowardMonster(){},movePlayerAdjacentToMonster(){moved++;player.position={x:96,y:196};return true;},document:{getElementById(){return null}},requestAnimationFrame:f=>f(),setTimeout:f=>{f();return 1},clearTimeout(){},setInterval:()=>1,clearInterval(){},RO_WEB_CELL_SIZE:32,
  DefenseResolver:{physical:d=>d,magic:d=>d},getEquipmentCombatBonusTotals:()=>({}),getEquipmentModifierList:()=>[],getWeaponRuntimeInfo:()=>({}),getTrainingBonusTotals:()=>({damageRate:0}),ResourceFormulaResolver:{inputs:()=>({})}};
 c.Math.random=()=>0;c.window=c;c.__moved=()=>moved;return c;
}
const c=makeContext();vm.createContext(c);for(const file of ['js/combat_mechanics_runtime.js','js/skill_engine.js','js/combat_formula_runtime.js','js/ra_renewal_damage_pipeline.js','js/combat_damage_pipeline.js'])vm.runInContext(read(file),c,{filename:file});
// Fiber lock: root, double fire damage, then clear.
assert.strictEqual(c.castTimedStatusSkill(skills['405'],1),true);assert.strictEqual(c.getMonsterRuntimeBonuses(c.currentMonster).rooted,1);const fire=c.RARenewalDamagePipeline.resolveMagicSkill({element:'Fire',elementSource:'fixed'},1,c.currentMonster,{ratio:100,hits:1});assert.strictEqual(fire.raw,100);assert.strictEqual(fire.damage,200);assert(!c.StatusManager.has(c.currentMonster,'fiber_lock'));
// Double Casting: Fire Bolt repeats once at Lv5 with random 0.
c.currentMonster.currentHp=9999999;c.player.activeBuffs={};const beforeSingle=c.currentMonster.currentHp;assert.strictEqual(c.castAttackSkill(skills['19'],10,{skipHitCheck:true}),true);const single=beforeSingle-c.currentMonster.currentHp;assert(single>0);
c.currentMonster.currentHp=9999999;assert.strictEqual(c.castBuffSkill(skills['482'],5),true);const beforeDouble=c.currentMonster.currentHp;assert.strictEqual(c.castAttackSkill(skills['19'],10,{skipHitCheck:true}),true);const doubled=beforeDouble-c.currentMonster.currentHp;assert.strictEqual(doubled,single*2);assert(c.logs.some(x=>String(x).includes('觸發雙倍投擲')));
// Striking: weapon level 4 => 20*5*4 = 400 ATK and 70% perfect hit.
assert.strictEqual(c.castBuffSkill(skills['2451'],5),true);assert.strictEqual(c.player.activeBuffs['2451'].effects.atkFlat,400);assert.strictEqual(c.player.activeBuffs['2451'].effects.perfectHitRate,70);const hit=c.HitResolver.resolve(c.player,c.currentMonster,{baseRate:5});assert.strictEqual(hit.hit,true);assert.strictEqual(hit.perfect,true);
// Warmer: clear cold statuses and heal 5% MaxHP every 3 seconds.
c.player.runtimeState.statuses={frozen:{id:'frozen'},freezing:{id:'freezing'},crystalize:{id:'crystalize'}};c.player.hp=5000;assert.strictEqual(c.castBuffSkill(skills['2452'],5),true);assert.deepStrictEqual(Object.keys(c.player.runtimeState.statuses),[]);c.player.runtimeState.statuses.frozen={id:'frozen'};c.player.activeBuffs['2452'].lastPeriodicHpTick=Date.now()-3001;c.normalizeActiveBuffs();assert.strictEqual(c.player.hp,5500);assert(!c.player.runtimeState.statuses.frozen);
// Vacuum: Lv5 7x7 root, 12 sec.
c.currentMonster.runtimeState.statuses={};assert.strictEqual(c.castTimedStatusSkill(skills['2453'],5),true);const vacuum=c.currentMonster.runtimeState.statuses.vacuumextreme;assert(vacuum);assert.strictEqual(vacuum.effects.rooted,1);assert(vacuum.expiresAt-Date.now()>11000);
// Psychic Stream: movement + formula + 5 hits. 100 MATK * 19000% * 5 = 95000.
c.currentMonster.currentHp=9999999;c.player.activeBuffs={};const streamDamage=c.calculateSkillAttackDamage(skills['6517'],5,c.currentMonster,{});assert.strictEqual(streamDamage,95000);assert.strictEqual(c.castAttackSkill(skills['6517'],5,{skipHitCheck:true}),true);assert.strictEqual(c.__moved(),1);
console.log(JSON.stringify({result:'PASS',version:'0.9.82BJ',official:632,pending:507,mageOfficial:108,magePending:45,singleBolt:single,doubleBolt:doubled,strikingAtk:400,warmerHp:c.player.hp,psychicStreamDamage:streamDamage},null,2));
