const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');const j=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const core=j('data/skills/skills_core_1.json').skills,runtime=j('data/skill_runtime/runtime_core_1_v1.json').skills,gen=j('data/skill_runtime/runtime_generated_all.json'),pending=j('data/skill_runtime/runtime_pending_review.json'),copy=j('data/skill_runtime/runtime_copyable_skills.json');
const ids=[115,116,117,119,120,121,122,123], pendingIds=new Set(pending.skills.map(x=>Number(x.skillId)));
for(const id of ids){if(core[id].implementationStatus!=='runtime_ready')throw Error(`core ${id}`);if(!runtime[id]?.executionEnabled)throw Error(`runtime ${id}`);if(gen.skills[id]?.implementationMode!=='official')throw Error(`generated ${id}`);if(pendingIds.has(id))throw Error(`pending ${id}`);}
for(const id of [116,121,122,123])for(const mode of ['plagiarism','reproduce']){const row=copy[mode].find(x=>Number(x.skillId)===id);if(!row?.enabled||!row?.runtimeReady)throw Error(`copy ${mode} ${id}`);}
if(gen.summary.officialRuntime!==691||gen.summary.pending!==448)throw Error('summary counts');
const context={window:{},console,Math:Object.create(Math),Date,setInterval:()=>0,clearInterval:()=>{},setTimeout,clearTimeout,skillsData:{runtimeProfiles:runtime}};context.window=context;context.Math.random=()=>0.5;
context.player={baseLevel:100,jobLevel:50,hp:10000,maxHp:10000,sp:10000,maxSp:10000,zeny:100000,stats:{dex:100,int:70},equipment:{},activeBuffs:{},position:{x:0,y:100}};context.currentMonster={name:'測試怪',currentHp:999999,maxHp:999999,element:'Neutral',race:'Formless',size:'Medium',position:{x:100,y:100},stats:{vit:0,int:0,mdef:0}};
context.calculateDerivedPlayerStats=()=>({stats:{dex:100,int:70},atk:300});context.getSkillLevel=id=>id===2248?5:0;context.getActiveBuffBonusTotals=()=>({});context.getPassiveSkillBonusTotals=()=>({});context.getTrainingBonusTotals=()=>({});context.getPassiveTargetDamageBonus=()=>0;context.getPassiveCombatModifierTotals=()=>({});context.getActiveBuffSpecialValue=()=>null;context.applyROCombatDamageModifiers=(d)=>d;context.getItemData=()=>null;context.RO_WEB_CELL_SIZE=32;context.getCombatGroundCandidates=()=>[context.currentMonster];context.addBattleLog=()=>{};context.showDamageNumber=()=>{};context.playMonsterHitAnimation=()=>{};context.updateMonsterUI=()=>{};context.updatePlayerUI=()=>{};context.saveGame=()=>{};context.recalculatePlayerStats=()=>{};context.defeatMonster=()=>{};context.getEquippedWeaponTypeRuntime=()=> 'bow';
for(const file of ['js/combat_mechanics_runtime.js','js/ra_renewal_damage_pipeline.js','js/skill_engine.js'])vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
const skill116=core['116'];context.getSkillRuntimeProfile=s=>runtime[String(s.officialId??s.id)]?.runtimeProfile;context.getSkillLevel=id=>id===2248?5:5;
const dmg=context.calculateSkillAttackDamage(skill116,5,context.currentMonster,{skipHitCheck:true,targetCount:1});if(!(dmg>0))throw Error('land mine damage');
const expectedRaw=Math.floor(5*100*(3+100/100)*(1+70/35))+5*40;if(dmg!==expectedRaw)throw Error(`land mine formula ${dmg} != ${expectedRaw}`);

// Real trigger regression: the trap must enter GroundEffectManager, trigger once, apply status and damage.
context.currentMonster.position={x:100,y:100};
context.currentMonster.runtimeState={};
const skidStartX=context.currentMonster.position.x;
if(!context.castGroundDebuffSkill(core['115'],5))throw Error('skid cast failed');
if(context.GroundEffectManager.effects.size!==1)throw Error('skid ground effect missing');
context.GroundEffectManager.update(Date.now()+150,[context.currentMonster]);
if(context.currentMonster.position.x<=skidStartX)throw Error('skid knockback missing');
if(!context.StatusManager.has(context.currentMonster,'skid_stop'))throw Error('skid stop status missing');
if(Number(context.getMonsterRuntimeBonuses(context.currentMonster).rooted||0)<=0)throw Error('skid rooted bonus missing');
if(context.GroundEffectManager.effects.size!==0)throw Error('skid effect did not expire after one trigger');
const skidDistanceCells=Math.round((context.currentMonster.position.x-skidStartX)/(context.RO_WEB_CELL_SIZE||32));

context.currentMonster={name:'地雷測試怪',currentHp:999999,maxHp:999999,element:'Neutral',race:'Formless',size:'Medium',position:{x:100,y:100},stats:{vit:0,int:0,mdef:0},runtimeState:{}};
const hpBefore=context.currentMonster.currentHp;
if(!context.castGroundDamageSkill(core['116'],5))throw Error('land mine cast failed');
if(context.GroundEffectManager.effects.size!==1)throw Error('land mine ground effect missing');
context.GroundEffectManager.update(Date.now()+150,[context.currentMonster]);
if(!(context.currentMonster.currentHp<hpBefore))throw Error('land mine did not damage target');
if(!context.StatusManager.has(context.currentMonster,'stun'))throw Error('land mine stun missing');
if(Number(context.getMonsterRuntimeBonuses(context.currentMonster).blocksActions||0)<=0)throw Error('land mine action block missing');
if(context.GroundEffectManager.effects.size!==0)throw Error('land mine effect did not expire after one trigger');
console.log('Hunter trap trigger PASS',{skidCells:skidDistanceCells,landMineDamage:hpBefore-context.currentMonster.currentHp});

console.log('Hunter trap core PASS', {official:gen.summary.officialRuntime,pending:gen.summary.pending,damage:dmg});
