const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..'),j=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const core=j('data/skills/skills_core_1.json').skills,runtime=j('data/skill_runtime/runtime_core_1_v1.json').skills;
const generated=j('data/skill_runtime/runtime_generated_all.json'),pending=j('data/skill_runtime/runtime_pending_review.json'),catalog=j('data/skill_runtime/runtime_formula_catalog.json');
const enabled=[318,319,320,326,327,328],localized=[315,316,323,324];
for(const id of enabled){assert.strictEqual(core[id].implementationStatus,'runtime_ready',`core ${id}`);assert(runtime[id]?.executionEnabled,`runtime ${id}`);assert(generated.skills[id]?.executionEnabled,`generated ${id}`);assert(!pending.skills.some(x=>Number(x.skillId)===id),`pending ${id}`);assert(catalog.skills.some(x=>Number(x.skillId)===id&&x.executionEnabled),`catalog ${id}`);}
assert.strictEqual(generated.summary.officialRuntime,727);assert.strictEqual(generated.summary.pending,412);
assert.deepStrictEqual([...localized,...enabled].map(id=>core[id].name),['操控樂器','樂器攻擊','練習舞蹈','纏箭投擲','冷笑話','吹口哨','刺客的黃昏','驚聲尖叫','哼唱之音','勿忘我']);
const ctx={window:null,console,setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},Math:Object.create(Math),Date};ctx.window=ctx;ctx.Math.random=()=>0;
ctx.skillsData={runtimeProfiles:runtime,skillIndex:core};
ctx.player={jobKey:'clown',baseLevel:99,jobLevel:70,hp:10000,maxHp:10000,sp:10000,maxSp:10000,stats:{str:60,agi:100,vit:60,int:80,dex:120,luk:90},equipment:{weapon:1},learnedSkills:{315:10,316:5,318:5,319:10,320:10,323:10,324:5,326:5,327:10,328:10},activeBuffs:{},position:{x:0,y:0},walkSpeed:150};
const makeMonster=(name,x,extra={})=>({name,currentHp:999999,maxHp:999999,element:'Neutral',elementLevel:1,race:'Formless',size:'Medium',position:{x,y:0},stats:{agi:80,luk:0,mdef:0,vit:0},hardDef:0,softDef:0,hardMdef:0,softMdef:0,runtimeState:{statuses:{}},...extra});
const m1=makeMonster('TargetA',64),m2=makeMonster('TargetB',128),boss=makeMonster('Boss',96,{isBoss:true});ctx.currentMonster=m1;ctx.activeMonsters=[m1,m2,boss];
ctx.getSkillLevel=id=>Number(ctx.player.learnedSkills[id]||0);ctx.getSkillDataById=id=>core[String(id)]||null;ctx.getCurrentJobSkills=()=>Object.keys(ctx.player.learnedSkills).map(id=>core[id]).filter(Boolean);ctx.getExtraSkillSkillList=()=>[];
ctx.calculateDerivedPlayerStats=()=>({stats:{str:60,agi:100,vit:60,int:80,dex:120,luk:90},atk:500,def:200,hit:300,flee:200,cri:31,aspd:170,walkSpeed:150});ctx.getTrainingBonusTotals=()=>({});ctx.getPassiveSkillBonusTotals=()=>({});ctx.getPassiveTargetDamageBonus=()=>0;ctx.getItemData=()=>({weaponType:'instrument',dbSubType:'instrument',atk:200,range:5,element:'Neutral'});ctx.getEquippedWeaponTypeRuntime=()=> 'instrument';
ctx.RO_WEB_CELL_SIZE=32;ctx.getCombatGroundCandidates=()=>ctx.activeMonsters;ctx.canAttackMonsterByRange=()=>true;ctx.getSkillRangePx=()=>9999;ctx.movePlayerTowardMonster=()=>{};
ctx.addBattleLog=()=>{};ctx.showDamageNumber=()=>{};ctx.playMonsterHitAnimation=()=>{};ctx.updateMonsterUI=()=>{};ctx.updatePlayerUI=()=>{};ctx.saveGame=()=>{};ctx.recalculatePlayerStats=()=>{};ctx.defeatMonster=()=>{};ctx.renderPositionSprites=()=>{};ctx.document={getElementById:()=>null,querySelectorAll:()=>[],body:{classList:{add(){},remove(){}}}};
for(const file of ['js/combat_mechanics_runtime.js','js/combat_formula_runtime.js','js/ra_renewal_damage_pipeline.js','js/combat_damage_pipeline.js','js/position_engine.js','js/skill_engine.js'])vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
// Self-only performance formulas.
assert(ctx.castBuffSkill(core['319'],10));let b=ctx.player.activeBuffs['319'].effects;assert.strictEqual(b.fleeFlat,25);assert.strictEqual(b.perfectDodgeFlat,10);
assert(ctx.castBuffSkill(core['320'],10));b=ctx.player.activeBuffs['320'].effects;assert.strictEqual(b.aspdRate,25);
assert(ctx.castBuffSkill(core['327'],10));b=ctx.player.activeBuffs['327'].effects;assert.strictEqual(b.hitFlat,43);
// Whole battle-area statuses, boss immunity.
assert(ctx.castTimedStatusSkill(core['318'],5));assert(ctx.StatusManager.has(m1,'freeze'));assert(ctx.StatusManager.has(m2,'freeze'));assert(!ctx.StatusManager.has(boss,'freeze'));
assert(ctx.castTimedStatusSkill(core['326'],5));assert(ctx.StatusManager.has(m1,'stun'));assert(ctx.StatusManager.has(m2,'stun'));assert(!ctx.StatusManager.has(boss,'stun'));
// Slow Grace / Don't Forget Me renewal formula.
assert(ctx.castTimedStatusSkill(core['328'],10));const mb=ctx.getMonsterRuntimeBonuses(m1);assert.strictEqual(mb.aspdRate,-48);assert.strictEqual(mb.walkSpeedRate,30);assert(ctx.StatusManager.has(m1,'dont_forget_me'));
console.log(JSON.stringify({result:'PASS',official:727,pending:412,whistle:{flee:25,perfectDodge:10},assassinCrossAspd:25,hummingHit:43,dontForgetMe:{aspdRate:mb.aspdRate,walkSpeedRate:mb.walkSpeedRate},archerFamily:'60/129'},null,2));
