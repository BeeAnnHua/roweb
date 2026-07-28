const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..'),j=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const core=j('data/skills/skills_core_1.json').skills,runtime=j('data/skill_runtime/runtime_core_1_v1.json').skills;
const generated=j('data/skill_runtime/runtime_generated_all.json'),pending=j('data/skill_runtime/runtime_pending_review.json'),copy=j('data/skill_runtime/runtime_copyable_skills.json');
const ids=[2249,2250,2251,2252,2253,2254];
for(const id of ids){assert.strictEqual(core[id].implementationStatus,'runtime_ready',`core ${id}`);assert(runtime[id]?.executionEnabled,`runtime ${id}`);assert(generated.skills[id]?.executionEnabled,`generated ${id}`);assert(!pending.skills.some(x=>Number(x.skillId)===id),`pending ${id}`);assert(!core[id].requires?.ItemCost,`item cost ${id}`);}
assert.strictEqual(generated.summary.officialRuntime, 768);assert.strictEqual(generated.summary.pending,371);
assert.deepStrictEqual(ids.map(id=>core[id].name),['紫紅陷阱','深藍陷阱','淺黃陷阱','青翠陷阱','燃燒陷阱','冰封陷阱']);
assert(copy.reproduce.some(x=>Number(x.skillId)===2253&&x.runtimeReady&&x.enabled));assert(copy.reproduce.some(x=>Number(x.skillId)===2254&&x.runtimeReady&&x.enabled));
const ctx={window:null,console,setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},Math:Object.create(Math),Date};ctx.window=ctx;ctx.Math.random=()=>0;
ctx.skillsData={runtimeProfiles:runtime,skillIndex:core};
ctx.player={jobKey:'ranger',baseLevel:200,jobLevel:70,hp:10000,maxHp:10000,sp:10000,maxSp:10000,stats:{str:80,agi:120,vit:60,int:80,dex:120,luk:90},equipment:{weapon:1},learnedSkills:{2247:5,2248:10,2249:1,2250:1,2251:1,2252:1,2253:5,2254:5},activeBuffs:{},position:{x:0,y:0},walkSpeed:150};
const makeMonster=(extra={})=>({name:'Target',currentHp:999999,maxHp:999999,element:'Neutral',elementLevel:1,race:'Formless',size:'Medium',position:{x:64,y:0},stats:{agi:80,luk:0,mdef:0},hardDef:0,softDef:0,hardMdef:0,softMdef:0,runtimeState:{statuses:{}},...extra});
let m=makeMonster();ctx.currentMonster=m;ctx.activeMonsters=[m];
ctx.getSkillLevel=id=>Number(ctx.player.learnedSkills[id]||0);ctx.getSkillDataById=id=>core[String(id)]||null;ctx.getCurrentJobSkills=()=>[2247,2248,...ids].map(id=>core[String(id)]).filter(Boolean);ctx.getExtraSkillSkillList=()=>[];
ctx.calculateDerivedPlayerStats=()=>({stats:{str:80,agi:120,vit:60,int:80,dex:120,luk:90},atk:500,def:200,hit:300,cri:10,walkSpeed:150,pAtk:0});ctx.getTrainingBonusTotals=()=>({});ctx.getPassiveSkillBonusTotals=()=>({});ctx.getPassiveTargetDamageBonus=()=>0;ctx.getItemData=()=>({weaponType:'bow',dbSubType:'bow',atk:200,range:5,element:'Neutral'});ctx.getEquippedWeaponTypeRuntime=()=> 'bow';
ctx.RO_WEB_CELL_SIZE=32;ctx.getCombatGroundCandidates=()=>ctx.activeMonsters;ctx.canAttackMonsterByRange=()=>true;ctx.getSkillRangePx=()=>9999;ctx.movePlayerTowardMonster=()=>{};
ctx.addBattleLog=()=>{};ctx.showDamageNumber=()=>{};ctx.playMonsterHitAnimation=()=>{};ctx.updateMonsterUI=()=>{};ctx.updatePlayerUI=()=>{};ctx.saveGame=()=>{};ctx.recalculatePlayerStats=()=>{};ctx.defeatMonster=()=>{};ctx.renderPositionSprites=()=>{};ctx.document={getElementById:()=>null,querySelectorAll:()=>[],body:{classList:{add(){},remove(){}}}};
for(const file of ['js/combat_mechanics_runtime.js','js/combat_formula_runtime.js','js/ra_renewal_damage_pipeline.js','js/combat_damage_pipeline.js','js/position_engine.js','js/skill_engine.js'])vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
// Camouflage redesign: +10% long damage at Lv5, no old stack stats.
const rangedProfile={handler:'physical_attack_formula',damageHandler:'physical_attack_formula',elementSource:'weapon',attackRangeType:'long',ratio:100};
const baseRanged=ctx.CombatDamagePipeline.resolvePhysicalSkill(rangedProfile,1,m,{ratio:100,skipHitCheck:true}).damage;
assert(ctx.castBuffSkill(core['2247'],5));const cb=ctx.getActiveBuffBonusTotals();assert.strictEqual(cb.longPhysicalDamageRate,10);assert.strictEqual(cb.stealthField,1);assert.strictEqual(cb.atkFlat||0,0);assert.strictEqual(cb.criFlat||0,0);assert.strictEqual(cb.defRate||0,0);assert.strictEqual(cb.camouflageStack||0,0);
const buffRanged=ctx.CombatDamagePipeline.resolvePhysicalSkill(rangedProfile,1,m,{ratio:100,skipHitCheck:true}).damage;assert(buffRanged>=Math.floor(baseRanged*1.09),`${baseRanged}->${buffRanged}`);assert(ctx.breakCamouflageRuntime({silent:true}));
// Elemental trap changes ordinary monster defense element permanently.
assert(ctx.castGroundDebuffSkill(core['2249'],1));let e=[...ctx.GroundEffectManager.effects.values()].find(x=>x.sourceSkillId===2249);assert(e);e.nextTick=0;ctx.GroundEffectManager.update(Date.now(),[m]);let bonus=ctx.getMonsterRuntimeBonuses(m);assert.strictEqual(bonus.defenseElementOverride,'Fire');assert.strictEqual(bonus.defenseElementLevelOverride,1);assert(ctx.StatusManager.has(m,'elemental_change_fire'));
// Boss is immune.
let boss=makeMonster({name:'Boss',isBoss:true,position:{x:64,y:0}});ctx.currentMonster=boss;ctx.activeMonsters=[boss];assert(ctx.castGroundDebuffSkill(core['2250'],1));e=[...ctx.GroundEffectManager.effects.values()].find(x=>x.sourceSkillId===2250);e.nextTick=0;ctx.GroundEffectManager.update(Date.now(),[boss]);assert.strictEqual(ctx.getMonsterRuntimeBonuses(boss).defenseElementOverride,undefined);
// Damage traps and status application.
ctx.currentMonster=m=makeMonster();ctx.activeMonsters=[m];const fireDamage=ctx.calculateSkillAttackDamage(core['2253'],5,m,{skipHitCheck:true});const iceDamage=ctx.calculateSkillAttackDamage(core['2254'],5,m,{skipHitCheck:true});assert(fireDamage>0&&iceDamage>0,`${fireDamage}/${iceDamage}`);
assert(ctx.castGroundDamageSkill(core['2253'],5));e=[...ctx.GroundEffectManager.effects.values()].find(x=>x.sourceSkillId===2253);e.nextTick=0;ctx.GroundEffectManager.update(Date.now(),[m]);assert(ctx.StatusManager.has(m,'burning'));bonus=ctx.getMonsterRuntimeBonuses(m);assert.strictEqual(bonus.mdefRate,-25);
ctx.StatusManager.tickPeriodic(m,Date.now()+4000);assert(m.currentHp<999999-fireDamage,'burning periodic damage');
ctx.currentMonster=m=makeMonster();ctx.activeMonsters=[m];assert(ctx.castGroundDamageSkill(core['2254'],5));e=[...ctx.GroundEffectManager.effects.values()].find(x=>x.sourceSkillId===2254);e.nextTick=0;ctx.GroundEffectManager.update(Date.now(),[m]);assert(ctx.StatusManager.has(m,'freezing'));bonus=ctx.getMonsterRuntimeBonuses(m);assert.strictEqual(bonus.defRate,-10);assert.strictEqual(bonus.walkSpeedRate,30);assert.strictEqual(bonus.aspdRate,-30);
console.log(JSON.stringify({result:'PASS',official:768,pending:371,fireDamage,iceDamage,camouflageLongRate:cb.longPhysicalDamageRate,baseRanged,buffRanged,ranger:'24/24'},null,2));
