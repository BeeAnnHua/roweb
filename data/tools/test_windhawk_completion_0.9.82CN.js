const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');const load=r=>JSON.parse(fs.readFileSync(path.join(root,r),'utf8'));
const core=load('data/skills/skills_core_1.json'),rt=load('data/skill_runtime/runtime_core_1_v1.json'),gen=load('data/skill_runtime/runtime_generated_all.json'),pend=load('data/skill_runtime/runtime_pending_review.json');
function assert(v,m){if(!v)throw new Error(m)}
const ids=[5324,5328,6520];
assert(gen.summary.version==='0.9.82CN','version');assert(gen.summary.officialRuntime===798,'official');assert(gen.summary.pending===341,'pending');assert(pend.skills.length===341,'pending length');
ids.forEach(id=>{assert(rt.skills[String(id)]?.executionEnabled===true,`runtime ${id}`);assert(!pend.skills.some(x=>Number(x.skillId)===id),`pending ${id}`)});
let now=100000;class FakeDate extends Date{static now(){return now}}const math=Object.create(Math);math.random=()=>0;
const sandbox={console,window:{},document:{getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[]},setInterval:()=>0,clearInterval:()=>{},setTimeout:f=>{f();return 0},clearTimeout:()=>{},Date:FakeDate,Math:math};sandbox.window=sandbox;
sandbox.player={jobLevel:70,baseLevel:250,maxHp:1000,hp:1000,maxSp:10000,sp:10000,maxAp:200,ap:0,stats:{str:1,agi:100,vit:1,int:1,dex:120,luk:50,con:100},learnedSkills:{'128':10,'5002':5,'5324':5,'5325':5,'5328':1,'5330':10,'5334':10,'6520':5},activeBuffs:{},equipment:{weapon:1},position:{x:0,y:0},jobKey:'windhawk',hasFalcon:true,falconActive:true};
sandbox.currentMonster={name:'動物測試怪物',currentHp:9999999,maxHp:9999999,level:100,flee:0,race:'Brute',position:{x:32,y:0},runtimeState:{},stats:{agi:1,luk:1}};sandbox.activeMonsters=[sandbox.currentMonster];
sandbox.skillsData={skillIndex:{},runtimeProfiles:rt.skills};[128,5002,5324,5325,5328,5330,5334,6520].forEach(id=>sandbox.skillsData.skillIndex[String(id)]={...core.skills[String(id)],runtimeProfile:rt.skills[String(id)]?.runtimeProfile});
sandbox.getSkillLevel=id=>Number(sandbox.player.learnedSkills[String(id)]||0);sandbox.getItemData=()=>({dbSubType:'Bow',weaponType:'bow'});sandbox.getEquippedWeaponTypeRuntime=()=> 'bow';sandbox.getSkillDataById=id=>sandbox.skillsData.skillIndex[String(id)];
sandbox.calculateDerivedPlayerStats=()=>({stats:sandbox.player.stats,atk:100,hit:999,cri:100});sandbox.getTrainingBonusTotals=()=>({});sandbox.getPassiveCombatModifierTotals=()=>({});
sandbox.addBattleLog=()=>{};sandbox.updateMonsterUI=()=>{};sandbox.updatePlayerUI=()=>{};sandbox.saveGame=()=>{};sandbox.recalculatePlayerStats=()=>{};sandbox.canAttackMonsterByRange=()=>true;sandbox.getSkillRangePx=()=>999;sandbox.RO_WEB_CELL_SIZE=32;sandbox.showDamageNumber=()=>{};sandbox.playMonsterHitAnimation=()=>{};sandbox.playROStudioPlayerMotion=()=>{};sandbox.stopAutoBattle=()=>{};sandbox.defeatMonster=()=>{};
sandbox.CombatDamagePipeline={resolvePhysicalSkill:(p,l,t,o)=>({damage:o.ratio,ratio:o.ratio})};sandbox.HitResolver={resolve:()=>({hit:true})};let lastCritMode=null;sandbox.CriticalResolver={resolve:(a,b,o)=>{lastCritMode=o.criticalMode;return {critical:false,multiplier:o.criticalMultiplier||1}}};sandbox.PerfectDodgeResolver={resolve:()=>({dodged:false})};sandbox.MultiHitResolver={normalize:(p,l)=>({damageHitCount:Number(p.damageHitCount||1),visualHitCount:Number(p.visualHitCount||1),statusProcMode:'once'}),split:d=>[d]};sandbox.TargetingResolver={collect:(origin,cands)=>cands.filter(x=>x===sandbox.currentMonster)};sandbox.AreaShapeResolver={inRange:()=>true};
vm.createContext(sandbox);for(const f of ['js/combat_mechanics_runtime.js','js/skill_engine.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),sandbox);
sandbox.CriticalResolver={resolve:(a,b,o)=>{lastCritMode=o.criticalMode;return {critical:false,multiplier:o.criticalMultiplier||1}}};
let captured=[];sandbox.CombatDamagePipeline.resolvePhysicalSkill=(p,l,t,o)=>{captured.push(o.ratio);return {damage:o.ratio}};
// Wind Sign target mark + normal bow AP hook.
assert(sandbox.castTimedStatusSkill(sandbox.skillsData.skillIndex['5324'],5),'wind sign cast');assert(sandbox.StatusManager.has(sandbox.currentMonster,'wind_sign'),'wind sign status');assert(sandbox.tryWindSignApGainOnNormalAttack(sandbox.currentMonster),'wind sign proc');assert(sandbox.player.ap===1,'AP +1');
// Gale Storm cannot crit before Calamity.
sandbox.currentMonster.currentHp=9999999;assert(sandbox.castAttackSkill(sandbox.skillsData.skillIndex['5330'],10,{skipHitCheck:true}),'gale before');assert(lastCritMode==='never','gale normal no crit');assert(captured.pop()===36250,'gale base');
// Calamity removes Unlimit and grants its own effect.
sandbox.player.activeBuffs['5002']={id:5002,level:5,effects:{longPhysicalDamageRate:250},expiresAt:now+100000};assert(sandbox.castTimedStatusSkill(sandbox.skillsData.skillIndex['5328'],1),'calamity cast');assert(!sandbox.player.activeBuffs['5002'],'unlimit removed');assert(sandbox.player.activeBuffs['5328'].effects.calamityGale===1,'calamity active');assert(sandbox.getActiveBuffBonusTotals().longPhysicalDamageRate===250,'unlimit lv5 effect');
// Gale can crit and gets race bonus; Crescive gets +20% and race bonus.
sandbox.currentMonster.currentHp=9999999;assert(sandbox.castAttackSkill(sandbox.skillsData.skillIndex['5330'],10,{skipHitCheck:true}),'gale calamity');assert(lastCritMode==='normal','gale calamity crit');assert(captured.pop()===54375,'gale race bonus');
sandbox.currentMonster.currentHp=9999999;delete sandbox.player.activeBuffs['5334'];assert(sandbox.castAttackSkill(sandbox.skillsData.skillIndex['5334'],10,{skipHitCheck:true}),'crescive calamity');assert(captured.pop()===63000,'crescive calamity bonus');
// Unlimit cannot be cast while Calamity is active.
assert(sandbox.castBuffSkill(sandbox.skillsData.skillIndex['5002'],5)===false,'unlimit blocked');
// Wild Walk formula and short self buff.
sandbox.currentMonster.currentHp=9999999;assert(sandbox.castAttackSkill(sandbox.skillsData.skillIndex['6520'],5,{skipHitCheck:true}),'wild walk');assert(captured.pop()===184050,'wild walk ratio');assert(sandbox.player.activeBuffs['6520'].effects.fleeFlat===300,'wild flee');assert(sandbox.player.activeBuffs['6520'].effects.moveSpeedRate===75,'wild speed');assert(sandbox.player.activeBuffs['6520'].expiresAt===now+18000,'wild duration');
// Riding Warg is an accepted alternative to Falcon for this skill.
delete sandbox.player.activeBuffs['6520'];sandbox.player.hasFalcon=false;sandbox.player.falconActive=false;sandbox.player.wargActive=true;sandbox.player.wargRiding=true;sandbox.currentMonster.currentHp=9999999;assert(sandbox.castAttackSkill(sandbox.skillsData.skillIndex['6520'],5,{skipHitCheck:true}),'wild walk on warg');
console.log('PASS 0.9.82CN Windhawk completion 14/14');
