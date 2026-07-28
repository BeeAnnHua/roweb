const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');const j=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const core=j('data/skills/skills_core_1.json').skills;
const runtime=j('data/skill_runtime/runtime_core_1_v1.json').skills;
const generated=j('data/skill_runtime/runtime_generated_all.json');
const pending=j('data/skill_runtime/runtime_pending_review.json');
const ids=[127,128,129,130,131,381], pendingIds=new Set(pending.skills.map(x=>Number(x.skillId)));
for(const id of ids){
  if(core[id].implementationStatus!=='runtime_ready') throw Error(`core ${id} not ready`);
  if(!runtime[id]?.executionEnabled) throw Error(`runtime ${id} disabled`);
  if(generated.skills[id]?.implementationMode!=='official') throw Error(`generated ${id} not official`);
  if(pendingIds.has(id)) throw Error(`pending ${id}`);
}
if(generated.summary.officialRuntime!==691||generated.summary.pending!==448) throw Error(`summary ${generated.summary.officialRuntime}/${generated.summary.pending}`);

const levels={127:1,128:10,129:5,130:4,131:5,381:5};
const context={window:{},console,Date,setTimeout,clearTimeout,setInterval:()=>0,clearInterval:()=>{},Math:Object.create(Math)};context.window=context;context.Math.random=()=>0;
context.skillsData={runtimeProfiles:runtime,skillIndex:core};
context.player={jobKey:'hunter',baseLevel:100,jobLevel:50,hp:10000,maxHp:10000,sp:10000,maxSp:10000,zeny:100000,stats:{agi:100,dex:100,luk:90,int:1},equipment:{weapon:1},learnedSkills:{127:1,128:10,129:5,130:4,131:5,381:5},activeBuffs:{},position:{x:0,y:0}};
context.currentMonster={name:'隱匿測試怪',currentHp:50000,maxHp:50000,element:'Neutral',race:'Formless',size:'Medium',position:{x:64,y:0},stats:{def:0,mdef:0},runtimeState:{statuses:{hiding:{name:'Hiding',effects:{}}}},hidden:true,visible:false};
context.activeMonsters=[context.currentMonster];
context.getSkillLevel=id=>levels[Number(id)]||0;
context.getCurrentJobSkills=()=>Object.values(core).filter(x=>ids.includes(Number(x.id)));
context.getExtraSkillSkillList=()=>[];
context.getSkillDataById=id=>core[String(id)]||null;
context.calculateDerivedPlayerStats=()=>({stats:{agi:100,dex:100,luk:90,int:1},atk:300,matk:100});
context.getActiveBuffBonusTotals=()=>({});context.getTrainingBonusTotals=()=>({});context.getPassiveTargetDamageBonus=()=>0;context.applyROCombatDamageModifiers=d=>d;
context.getItemData=()=>({weaponType:'bow'});context.getEquippedWeaponTypeRuntime=()=> 'bow';context.RO_WEB_CELL_SIZE=32;
context.getCombatGroundCandidates=()=>context.activeMonsters;context.canAttackMonsterByRange=()=>true;context.getSkillRangePx=()=>9999;
context.addBattleLog=()=>{};context.showDamageNumber=()=>{};context.playMonsterHitAnimation=()=>{};context.updateMonsterUI=()=>{};context.updatePlayerUI=()=>{};context.saveGame=()=>{};context.recalculatePlayerStats=()=>{};context.defeatMonster=()=>{};
for(const file of ['js/combat_mechanics_runtime.js','js/ra_renewal_damage_pipeline.js','js/combat_damage_pipeline.js','js/skill_engine.js']) vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});

if(!context.castFalconToggleSkill(core['127'],1)||!context.isFalconActiveRuntime()) throw Error('falcon toggle on failed');
const passive=context.getPassiveSkillBonusTotals();if(passive.falconDamageFlat!==60) throw Error(`steel crow ${passive.falconDamageFlat}`);
const blitz=context.calculateSkillAttackDamage(core['129'],5,context.currentMonster,{skipHitCheck:true});
const expectedBase=5*20+60+Math.floor(100/2)*2+Math.floor(100/10)*2;
if(blitz!==expectedBase*5) throw Error(`blitz ${blitz} != ${expectedBase*5}`);
const assault=context.calculateSkillAttackDamage(core['381'],5,context.currentMonster,{skipHitCheck:true});
const expectedAssault=Math.floor(expectedBase*5*(150+70*5)/100);
if(assault!==expectedAssault) throw Error(`assault ${assault} != ${expectedAssault}`);
const beforeAuto=context.currentMonster.currentHp;
if(!context.tryFalconAutoAttackOnNormal(context.currentMonster)) throw Error('auto blitz did not trigger');
if(beforeAuto-context.currentMonster.currentHp!==blitz) throw Error(`auto blitz damage ${beforeAuto-context.currentMonster.currentHp}`);

const trapId=context.GroundEffectManager.create({id:'hunter_trap_test',x:64,y:0,shape:'circle',rangeCells:0,sourceSkillId:116,durationMs:10000,maxTicks:1});
if(!trapId) throw Error('trap create');
if(!context.castFalconDetectSkill(core['130'],4)) throw Error('detect cast');
if(context.currentMonster.hidden||context.currentMonster.visible===false) throw Error('monster not revealed');
if(context.GroundEffectManager.effects.get(trapId)?.revealed!==true) throw Error('trap not revealed');
if(!context.castFalconSpringTrapSkill(core['131'],5)) throw Error('spring trap cast');
if(context.GroundEffectManager.effects.has(trapId)) throw Error('trap not removed');
if(!context.castFalconToggleSkill(core['127'],1)||context.isFalconActiveRuntime()) throw Error('falcon toggle off failed');
console.log('Hunter falcon core PASS',{official:691,pending:448,blitz,assault,autoDamage:blitz,steelCrow:passive.falconDamageFlat});
