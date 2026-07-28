const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');const load=r=>JSON.parse(fs.readFileSync(path.join(root,r),'utf8'));
const core=load('data/skills/skills_core_1.json'),rt=load('data/skill_runtime/runtime_core_1_v1.json'),gen=load('data/skill_runtime/runtime_generated_all.json'),pend=load('data/skill_runtime/runtime_pending_review.json');
const ids=[2423,2425,2427,2428,2431,2432,2433,2434];function assert(v,m){if(!v)throw new Error(m)}
assert(gen.summary.version==='0.9.82CJ','version');assert(gen.summary.officialRuntime===773,'official');assert(gen.summary.pending===366,'pending');
ids.forEach(id=>{assert(rt.skills[String(id)]?.executionEnabled===true,`runtime ${id}`);assert(!pend.skills.some(x=>Number(x.skillId)===id),`pending ${id}`)});
let now=100000;class FakeDate extends Date{static now(){return now}}
const sandbox={console,window:{},document:{getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[]},setInterval:()=>0,clearInterval:()=>{},setTimeout:f=>{f();return 0},clearTimeout:()=>{},Date:FakeDate,Math:Object.create(Math)};sandbox.window=sandbox;sandbox.Math.random=()=>0;
sandbox.player={jobLevel:70,baseLevel:200,maxHp:1000,hp:500,maxSp:2000,sp:1000,stats:{str:1,agi:100,vit:1,int:120,dex:120,luk:90},learnedSkills:{'2412':10},activeBuffs:{},equipment:{weapon:1},position:{x:0,y:0},jobKey:'minstrel'};
sandbox.currentMonster={name:'測試怪物',currentHp:10000,maxHp:10000,level:55,flee:150,atk:100,attackType:'physical',position:{x:32,y:0},runtimeState:{},stats:{str:80,int:80,luk:10}};sandbox.activeMonsters=[sandbox.currentMonster];
sandbox.skillsData={skillIndex:{},runtimeProfiles:rt.skills};ids.forEach(id=>sandbox.skillsData.skillIndex[String(id)]={...core.skills[String(id)],runtimeProfile:rt.skills[String(id)].runtimeProfile});
sandbox.getSkillLevel=id=>Number(id)===2412?10:5;sandbox.getItemData=()=>({dbSubType:'instrument',weaponType:'instrument'});sandbox.getEquippedWeaponTypeRuntime=()=> 'instrument';sandbox.getSkillDataById=id=>sandbox.skillsData.skillIndex[String(id)];
sandbox.calculateDerivedPlayerStats=()=>({stats:sandbox.player.stats,matkMin:100,matkMax:100,atk:100});sandbox.getPassiveSkillBonusTotals=()=>({});sandbox.getTrainingBonusTotals=()=>({});sandbox.getPassiveCombatModifierTotals=()=>({});
sandbox.addBattleLog=()=>{};sandbox.updateMonsterUI=()=>{};sandbox.updatePlayerUI=()=>{};sandbox.saveGame=()=>{};sandbox.recalculatePlayerStats=()=>{};sandbox.paySkillCost=()=>{};sandbox.canAttackMonsterByRange=()=>true;sandbox.getSkillRangePx=()=>999;sandbox.RO_WEB_CELL_SIZE=32;
vm.createContext(sandbox);for(const f of ['js/combat_mechanics_runtime.js','js/skill_engine.js','js/battle.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),sandbox);
sandbox.currentMonster=sandbox.activeMonsters[0];
assert(sandbox.castBuffSkill(sandbox.skillsData.skillIndex['2423'],5,{skipCost:true}),'nature');assert(sandbox.player.activeBuffs['2423'].effects.hpRecoveryRate===250,'nature recovery');assert(sandbox.player.activeBuffs['2423'].expiresAt-now===300000,'nature duration');
assert(sandbox.castBuffSkill(sandbox.skillsData.skillIndex['2427'],5,{skipCost:true}),'mana');assert(sandbox.player.sp===1400,'mana initial heal');assert(sandbox.player.activeBuffs['2427'].effects.spRecoveryRate===250,'mana recovery');
assert(sandbox.castBuffSkill(sandbox.skillsData.skillIndex['2428'],5,{skipCost:true}),'warg song');let e=sandbox.player.activeBuffs['2428'].effects;assert(e.aspdRate===25&&e.fixedCastReductionRate===70&&e.longPhysicalDamageRate===10,'warg effects');
assert(sandbox.castBuffSkill(sandbox.skillsData.skillIndex['2431'],5,{skipCost:true}),'dew');assert(sandbox.player.activeBuffs['2431'].effects.maxHpRate===42,'dew maxhp');
assert(sandbox.castBuffSkill(sandbox.skillsData.skillIndex['2434'],5,{skipCost:true}),'humming');assert(sandbox.player.activeBuffs['2434'].effects.magicDamageRate===35,'humming magic');assert(sandbox.player.activeBuffs['2434'].effects.castCannotBeInterrupted===1,'humming cast flag');
assert(sandbox.castTimedStatusSkill(sandbox.skillsData.skillIndex['2425'],5,{skipCost:true}),'gloomy');let b=sandbox.getMonsterRuntimeBonuses(sandbox.currentMonster);assert(b.fleeRate===-45&&b.outgoingPhysicalDamageRate===-40&&b.walkSpeedRate===100,'gloomy effects');assert(sandbox.getMonsterFlee(sandbox.currentMonster)===82,'gloomy flee runtime');
sandbox.currentMonster.runtimeState={};assert(sandbox.castTimedStatusSkill(sandbox.skillsData.skillIndex['2432'],5,{skipCost:true}),'sink');b=sandbox.getMonsterRuntimeBonuses(sandbox.currentMonster);assert(b.intFlat===-50&&b.outgoingMagicDamageRate===-12,'sink effects');
sandbox.currentMonster.runtimeState={};assert(sandbox.castTimedStatusSkill(sandbox.skillsData.skillIndex['2433'],5,{skipCost:true}),'warcry');b=sandbox.getMonsterRuntimeBonuses(sandbox.currentMonster);assert(b.strFlat===-60&&b.outgoingPhysicalDamageRate===-20&&b.criFlat===20,'warcry effects');
const pipelineText=fs.readFileSync(path.join(root,'js/ra_renewal_damage_pipeline.js'),'utf8');assert(pipelineText.includes('active.magicDamageRate'),'magic pipeline active buff');
console.log('PASS 0.9.82CJ Minstrel/Wanderer chorus support core');
