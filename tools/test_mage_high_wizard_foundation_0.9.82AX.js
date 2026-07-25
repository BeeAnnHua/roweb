const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const j=p=>JSON.parse(read(p));
const ids=[10,93,157,364,365,366,1006];
const core=j('data/skill_runtime/runtime_core_1_v1.json');
const generated=j('data/skill_runtime/runtime_generated_all.json');
const catalog=j('data/skill_runtime/runtime_formula_catalog.json');
const pending=j('data/skill_runtime/runtime_pending_review.json');
const skills=j('data/skills/skills_core_1.json').skills;
assert.strictEqual(core.version,'0.9.82AX');
assert.strictEqual(Object.keys(core.skills).length,557);
assert.strictEqual(generated.summary.officialRuntime,557);
assert.strictEqual(generated.summary.pending,582);
assert.strictEqual(pending.skills.length,582);
for(const id of ids){
  assert(core.skills[String(id)],`missing runtime ${id}`);
  assert.strictEqual(generated.skills[String(id)].implementationMode,'official');
  assert.strictEqual(generated.skills[String(id)].executionEnabled,true);
  assert(!pending.skills.some(x=>Number(x.skillId)===id),`still pending ${id}`);
  assert.strictEqual(skills[String(id)].implementationStatus,'runtime_official');
  assert(skills[String(id)].spCost.every(v=>v===0));
}
assert.strictEqual(core.skills['364'].passiveBonuses.maxSpRate[9],20);
assert.strictEqual(core.skills['366'].effects.matkRate[9],50);
assert.strictEqual(core.skills['365'].formula,'renewal_magic_crasher');
assert.strictEqual(core.skills['1006'].effects.sightBlasterMatkRatio,600);
assert.strictEqual(core.skills['1006'].effects.sightBlasterKnockbackCells,3);
const copy=j('data/skill_runtime/runtime_copyable_skills.json');
for(const group of ['plagiarism','reproduce']){
 const row=copy[group].find(x=>Number(x.skillId)===1006);
 assert(row&&row.runtimeReady&&row.enabled,`Sight Blaster ${group} not ready`);
}
assert.strictEqual(new Set(Object.keys(core.skills)).size,Object.keys(core.skills).length);
assert.strictEqual(new Set(catalog.skills.map(x=>Number(x.skillId))).size,1139);

function baseContext(){
 const logs=[];
 const context={console,Math,Date,JSON,Number,String,Array,Object,Set,Map,Boolean,Infinity,NaN,
  setTimeout,clearTimeout,setInterval,clearInterval,
  player:{hp:1000,maxHp:1000,sp:0,maxSp:1000,zeny:0,activeBuffs:{},learnedSkills:{}},
  currentMonster:null,activeMonsters:[],mapMonsters:[],skillsData:{runtimeProfiles:{}},logs,
  addBattleLog:t=>logs.push(String(t)),updatePlayerUI(){},updateMonsterUI(){},saveGame(){},recalculatePlayerStats(){},
  getSkillLevel(){return 1},getCurrentJobSkills(){return []},getExtraSkillSkillList(){return []},
  calculateDerivedPlayerStats(){return {atk:100,matk:200,stats:{int:100,dex:50,luk:1}}},
  distanceBetween(a,b){const ax=Number(a?.x||0),ay=Number(a?.y||0),bx=Number(b?.x||0),by=Number(b?.y||0);return Math.hypot(ax-bx,ay-by)},
  RO_WEB_CELL_SIZE:36,document:{getElementById(){return null},createElement(){return {appendChild(){},classList:{add(){},remove(){}},dataset:{}}}},
  requestAnimationFrame:f=>f(),window:null
 };
 context.window=context;
 return context;
}

// Skill-engine helper behavior.
{
 const c=baseContext();
 c.skillsData.runtimeProfiles=Object.fromEntries(ids.map(id=>[String(id),core.skills[String(id)]]));
 vm.createContext(c);vm.runInContext(read('js/skill_engine.js'),c,{filename:'skill_engine.js'});
 c.activeMonsters=[{name:'Hidden',position:{x:10,y:0},hidden:true,runtimeState:{statuses:{hiding:{tag:'hidden'}}}}];
 c.player.position={x:0,y:0};
 assert.strictEqual(c.revealHiddenMonstersAroundPlayer(3),1);
 assert.strictEqual(c.activeMonsters[0].hidden,false);
 assert.strictEqual(Object.keys(c.activeMonsters[0].runtimeState.statuses).length,0);
 c.getPassiveSkillBonusTotals=()=>({soulDrainLevel:10});
 c.player.sp=0;c.player.maxSp=1000;
 assert.strictEqual(c.trySoulDrainRestore({level:100},true,{handler:'magic_damage'}),245);
 assert.strictEqual(c.player.sp,245);
 c.currentMonster={name:'波利',level:5,currentHp:40,maxHp:50,race:'Plant',element:'Water',size:'Small',atk:8,def:2,mdef:1};
 const infoSkill=skills['93'];
 assert.strictEqual(c.castInspectMonsterSkill(infoSkill,1),true);
 assert(c.logs.some(x=>x.includes('波利')&&x.includes('HP 40/50')));
 assert(c.logs.some(x=>x.includes('Plant')&&x.includes('Water')));
 let captured=null;
 c.CombatDamagePipeline={resolvePhysicalSkill(profile,level,target,opt){captured=opt;return {damage:Number(opt.ratio)+Number(opt.flatAddition)}}};
 c.window.CombatDamagePipeline=c.CombatDamagePipeline;
 c.player.learnedSkills={'365':1};
 c.getSkillLevel=id=>Number(id)===365?1:0;
 c.currentMonster={currentHp:999,def:0,size:'Medium'};
 const magicCrasherDamage=c.calculateSkillAttackDamage(skills['365'],1,c.currentMonster,{});
 assert(captured,'Magic Crasher did not call physical pipeline');
 assert.strictEqual(captured.ratio,100);
 assert.strictEqual(captured.flatAddition,200);
 assert.strictEqual(magicCrasherDamage,300);
}

// Battle helper behavior.
{
 const c=baseContext();
 c.player.activeBuffs={'157':{name:'能量外套',level:1,effects:{energyCoat:1}}};
 c.player.sp=1000;c.player.maxSp=1000;
 c.CombatDamagePipeline={resolveMagicSkill(){return {damage:600}}};
 c.MovementEffectResolver={calls:0,knockback(){this.calls++}};
 vm.createContext(c);vm.runInContext(read('js/battle.js'),c,{filename:'battle.js'});
 c.updateMonsterUI=()=>{};c.updatePlayerUI=()=>{};c.saveGame=()=>{};c.playMonsterHitAnimation=()=>{};c.showDamageNumber=()=>{};
 assert.strictEqual(c.applyEnergyCoatToIncomingDamage(100),70);
 assert.strictEqual(c.player.sp,970);
 c.player.activeBuffs={'1006':{name:'火狩芽',level:1,effects:{sightBlaster:1,sightBlasterMatkRatio:600,sightBlasterKnockbackCells:3}}};
 c.player.position={x:0,y:0};
 c.getCurrentDistanceToMonster=()=>0;
 c.window.getCurrentDistanceToMonster=c.getCurrentDistanceToMonster;
 const monster={name:'測試怪物',position:{x:0,y:0},currentHp:1000};
 assert.strictEqual(c.tryTriggerSightBlaster(monster),true);
 assert.strictEqual(monster.currentHp,400);
 assert.strictEqual(c.MovementEffectResolver.calls,1);
 assert.strictEqual(c.player.activeBuffs['1006'],undefined);
}
console.log('Mage / High Wizard foundation 0.9.82AX: PASS');
