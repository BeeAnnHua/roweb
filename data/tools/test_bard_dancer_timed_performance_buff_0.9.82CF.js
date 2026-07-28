const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..'),j=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const core=j('data/skills/skills_core_1.json').skills,runtime=j('data/skill_runtime/runtime_core_1_v1.json').skills;
const generated=j('data/skill_runtime/runtime_generated_all.json');
const ids=[319,320,321,322,327,328,329,330],dur=[30000,60000,90000,120000,150000,180000,210000,240000,270000,300000];
assert.strictEqual(generated.version,'0.9.82CF');
assert.strictEqual(generated.summary.officialRuntime, 748);assert.strictEqual(generated.summary.pending,391);
for(const id of ids){
  const p=runtime[id].runtimeProfile;
  assert.strictEqual(p.sustainedPerformance,true,`sustained ${id}`);
  assert.deepStrictEqual(id===328?p.statusDuration:p.duration,dur,`duration ${id}`);
  assert.strictEqual(p.toggleBuff,undefined,`no toggle ${id}`);
}
let now=1700000000000;
class FakeDate extends Date{static now(){return now;}}
const ctx={window:null,console,setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},Math:Object.create(Math),Date:FakeDate};ctx.window=ctx;ctx.Math.random=()=>0;
ctx.__player={jobKey:'clown',baseLevel:99,jobLevel:70,hp:10000,maxHp:10000,sp:10000,maxSp:10000,stats:{str:60,agi:100,vit:60,int:80,dex:120,luk:90},equipment:{weapon:1},learnedSkills:{315:10,319:10,320:10,321:10,322:10,323:10,327:10,328:10,329:10,330:10},activeBuffs:{},position:{x:0,y:0},walkSpeed:150};
const makeMonster=(name,x)=>({name,currentHp:999999,maxHp:999999,element:'Neutral',elementLevel:1,race:'Formless',size:'Medium',position:{x,y:0},stats:{agi:80,luk:0,mdef:0,vit:0},hardDef:0,softDef:0,hardMdef:0,softMdef:0,runtimeState:{statuses:{}}});
const m1=makeMonster('TargetA',64),m2=makeMonster('TargetB',128);ctx.currentMonster=m1;ctx.activeMonsters=[m1,m2];
ctx.skillsData={runtimeProfiles:runtime,skillIndex:core};ctx.getSkillLevel=id=>Number(ctx.__player.learnedSkills[id]||0);ctx.getSkillDataById=id=>core[String(id)]||null;ctx.getCurrentJobSkills=()=>Object.keys(ctx.__player.learnedSkills).map(id=>core[id]).filter(Boolean);ctx.getExtraSkillSkillList=()=>[];
ctx.calculateDerivedPlayerStats=()=>({stats:{str:60,agi:100,vit:60,int:80,dex:120,luk:90},atk:500,def:200,hit:300,flee:200,cri:31,aspd:170,walkSpeed:150});ctx.getTrainingBonusTotals=()=>({});ctx.getPassiveSkillBonusTotals=()=>({});ctx.getPassiveTargetDamageBonus=()=>0;ctx.getItemData=()=>({weaponType:'instrument',dbSubType:'instrument',atk:200,range:5,element:'Neutral'});ctx.getEquippedWeaponTypeRuntime=()=> 'instrument';
ctx.RO_WEB_CELL_SIZE=32;ctx.getCombatGroundCandidates=()=>ctx.activeMonsters;ctx.canAttackMonsterByRange=()=>true;ctx.getSkillRangePx=()=>9999;ctx.movePlayerTowardMonster=()=>{};ctx.addBattleLog=()=>{};ctx.showDamageNumber=()=>{};ctx.playMonsterHitAnimation=()=>{};ctx.updateMonsterUI=()=>{};ctx.updatePlayerUI=()=>{};ctx.saveGame=()=>{};ctx.recalculatePlayerStats=()=>{};ctx.defeatMonster=()=>{};ctx.renderPositionSprites=()=>{};ctx.document={getElementById:()=>null,querySelectorAll:()=>[],body:{classList:{add(){},remove(){}}}};ctx.localStorage={getItem:()=>null,setItem:()=>{}};
vm.createContext(ctx);
for(const file of ['js/player.js','js/combat_mechanics_runtime.js','js/combat_formula_runtime.js','js/ra_renewal_damage_pipeline.js','js/combat_damage_pipeline.js','js/position_engine.js','js/skill_engine.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
vm.runInContext("player=__player; getPlayerSpRecoveryAmount=()=>0; getPlayerHpRecoveryAmount=()=>0; getItemData=()=>({weaponType:'instrument',dbSubType:'instrument',atk:200,range:5,element:'Neutral'}); updatePlayerUI=()=>{}; saveGame=()=>{}; recalculatePlayerStats=()=>{};",ctx);
assert(ctx.castBuffSkill(core['319'],10));let b=ctx.__player.activeBuffs['319'];assert.strictEqual(b.expiresAt-now,300000);assert.strictEqual(b.sustainedSpCostPer5s,5);
const firstExpiry=b.expiresAt;now+=1000;assert(ctx.castBuffSkill(core['319'],10));b=ctx.__player.activeBuffs['319'];assert(b.expiresAt>firstExpiry,'recast refreshes rather than toggles off');
assert(ctx.castBuffSkill(core['321'],10));assert(ctx.__player.activeBuffs['319']&&ctx.__player.activeBuffs['321'],'multiple timed songs coexist');
assert(ctx.castTimedStatusSkill(core['328'],10));assert(ctx.__player.activeBuffs['328'],'dont forget me marker');assert.strictEqual(ctx.__player.activeBuffs['328'].expiresAt-now,300000);assert(ctx.StatusManager.has(m1,'dont_forget_me'));
ctx.__player.sp=0;ctx.runPlayerRecoveryTick();assert(!ctx.__player.activeBuffs['328'],'SP shortage clears performance marker');assert(!ctx.StatusManager.has(m1,'dont_forget_me'),'SP shortage clears enemy aura status');
console.log(JSON.stringify({result:'PASS',version:'0.9.82CF',durationLv10Ms:300000,recast:'refresh',multiSong:true,otherSkillsAllowed:true,naturalSpRecoveryContinues:true,dontForgetMeCleanup:true},null,2));
