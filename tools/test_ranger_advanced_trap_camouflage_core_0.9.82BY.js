const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..'),j=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const core=j('data/skills/skills_core_1.json').skills,runtime=j('data/skill_runtime/runtime_core_1_v1.json').skills;
const generated=j('data/skill_runtime/runtime_generated_all.json'),pending=j('data/skill_runtime/runtime_pending_review.json');
const ids=[2237,2238,2239,2247];
for(const id of ids){assert.strictEqual(core[id].implementationStatus,'runtime_ready',`core ${id}`);assert(runtime[id]?.executionEnabled,`runtime ${id}`);assert(generated.skills[id]?.executionEnabled,`generated ${id}`);assert(!pending.skills.some(x=>Number(x.skillId)===id),`pending ${id}`);}
assert.strictEqual(generated.summary.officialRuntime,711);assert.strictEqual(generated.summary.pending,428);
assert.deepStrictEqual(ids.map(id=>core[id].name),['引爆','電擊陷阱','集束炸彈','偽裝戰術']);
const ctx={window:null,console,document:{getElementById:()=>null,querySelector:()=>null,addEventListener:()=>{}},navigator:{maxTouchPoints:0},innerWidth:1280,innerHeight:720,setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},Math:Object.create(Math),Date};ctx.window=ctx;ctx.Math.random=()=>0;
ctx.skillsData={runtimeProfiles:runtime,skillIndex:core};
ctx.currentMap={};ctx.player={jobKey:'ranger',baseLevel:200,jobLevel:70,hp:10000,maxHp:10000,sp:10000,maxSp:10000,stats:{str:80,agi:120,vit:60,int:80,dex:120,luk:90},equipment:{weapon:1},learnedSkills:{2237:1,2238:5,2239:5,2247:5,2248:10},activeBuffs:{},position:{x:0,y:0},walkSpeed:150};
const m={name:'Target',currentHp:999999,maxHp:999999,element:'Neutral',race:'Formless',size:'Medium',position:{x:64,y:0},stats:{agi:80,luk:0},hardDef:0,softDef:0,runtimeState:{statuses:{}}};ctx.currentMonster=m;ctx.activeMonsters=[m];
ctx.getSkillLevel=id=>Number(ctx.player.learnedSkills[id]||0);ctx.getSkillDataById=id=>core[String(id)]||null;ctx.getCurrentJobSkills=()=>ids.concat([2248]).map(id=>core[String(id)]).filter(Boolean);ctx.getExtraSkillSkillList=()=>[];
ctx.calculateDerivedPlayerStats=()=>({stats:{str:80,agi:120,vit:60,int:80,dex:120,luk:90},atk:500,def:200,hit:300,cri:10,walkSpeed:150,pAtk:0});ctx.getTrainingBonusTotals=()=>({});ctx.getItemData=()=>({weaponType:'bow',dbSubType:'bow',atk:200,range:5});ctx.getEquippedWeaponTypeRuntime=()=> 'bow';
ctx.RO_WEB_CELL_SIZE=32;ctx.getCombatGroundCandidates=()=>ctx.activeMonsters;ctx.canAttackMonsterByRange=()=>true;ctx.getSkillRangePx=()=>9999;ctx.movePlayerTowardMonster=()=>{};
ctx.addBattleLog=()=>{};ctx.showDamageNumber=()=>{};ctx.playMonsterHitAnimation=()=>{};ctx.updateMonsterUI=()=>{};ctx.updatePlayerUI=()=>{};ctx.saveGame=()=>{};ctx.recalculatePlayerStats=()=>{};ctx.defeatMonster=()=>{};ctx.renderPositionSprites=()=>{};
for(const file of ['js/combat_mechanics_runtime.js','js/combat_formula_runtime.js','js/ra_renewal_damage_pipeline.js','js/combat_damage_pipeline.js','js/position_engine.js','js/skill_engine.js','js/battle.js'])vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
ctx.currentMonster=m;ctx.activeMonsters=[m];ctx.canAttackMonsterByRange=()=>true;ctx.getSkillRangePx=()=>9999;
// Electric Shocker: place then force tick; rooted status must be active.
assert(ctx.castGroundDebuffSkill(core['2238'],5));let shock=[...ctx.GroundEffectManager.effects.values()].find(e=>e.sourceSkillId===2238);assert(shock);shock.nextTick=0;ctx.GroundEffectManager.update(Date.now(),[m]);assert(ctx.StatusManager.has(m,'electric_shocker'));assert.strictEqual(ctx.getMonsterRuntimeBonuses(m).rooted,1);
// Cluster Bomb formula includes weapon and Renewal DEX/INT/Research component.
const cluster=ctx.calculateSkillAttackDamage(core['2239'],5,m,{skipHitCheck:true});assert(cluster>1000,`cluster ${cluster}`);
// Detonator triggers a trap immediately and removes it.
let detonated=0;const tid=ctx.GroundEffectManager.create({id:'manual_trap',x:64,y:0,shape:'circle',rangeCells:0,sourceSkillId:2239,durationMs:15000,maxTicks:1,onTick(){detonated++;}});assert(tid);const spBefore=ctx.player.sp;assert(ctx.castTrapDetonatorSkill(core['2237'],1));assert.strictEqual(detonated,1);assert(!ctx.GroundEffectManager.effects.has(tid));assert.strictEqual(ctx.player.sp,spBefore-15);
// No trap: no cost.
const spNoTrap=ctx.player.sp;assert.strictEqual(ctx.castTrapDetonatorSkill(core['2237'],1),false);assert.strictEqual(ctx.player.sp,spNoTrap);
// Camouflage toggle, ten-stack values, movement rules and attack break helper.
assert(ctx.castBuffSkill(core['2247'],5));const cb=ctx.player.activeBuffs['2247'];assert(cb);cb.startedAt=Date.now()-10000;const bonus=ctx.getActiveBuffBonusTotals();assert.strictEqual(bonus.camouflageStack,10);assert.strictEqual(bonus.atkFlat,300);assert.strictEqual(bonus.criFlat,100);assert.strictEqual(bonus.defRate,-50);assert.strictEqual(bonus.stealthField,1);const spDrainBefore=ctx.player.sp;cb.lastPeriodicTick=Date.now()-2100;ctx.normalizeActiveBuffs();assert.strictEqual(spDrainBefore-ctx.player.sp,4);const hpHiddenBefore=ctx.player.hp;let camouflageBlocked=false;ctx.addBattleLog=s=>{if(String(s).includes('不會成為'))camouflageBlocked=true;};ctx.getCurrentDistanceToMonster=()=>0;ctx.getMonsterAttackRangePx=()=>100;ctx.monsterAttackPlayer();assert.strictEqual(ctx.player.hp,hpHiddenBefore);assert(camouflageBlocked);assert(ctx.breakCamouflageRuntime({silent:true}));assert(!ctx.player.activeBuffs['2247']);
ctx.player.learnedSkills[2247]=2;assert(ctx.castBuffSkill(core['2247'],2));assert.strictEqual(ctx.getActiveBuffBonusTotals().movementLocked,1);assert.strictEqual(ctx.setPlayerMoveTarget(100,0),false);assert(ctx.castBuffSkill(core['2247'],2));assert(!ctx.player.activeBuffs['2247']);
console.log(JSON.stringify({result:'PASS',official:711,pending:428,cluster,detonated,camouflageStack:bonus.camouflageStack},null,2));
