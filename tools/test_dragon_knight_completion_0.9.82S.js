const fs=require('fs'),vm=require('vm'),path=require('path');
global.window=global;
global.document={addEventListener(){},getElementById(){return null},querySelector(){return null}};
const ROOT=path.resolve(__dirname,'..');
const runtime=JSON.parse(fs.readFileSync(ROOT+'/data/skill_runtime/runtime_core_1_v1.json','utf8')).skills;
global.player={baseLevel:200,jobLevel:60,hp:10000,maxHp:10000,sp:5000,maxSp:1000,stats:{str:100,agi:50,vit:80,int:30,dex:80,luk:20,pow:20},traitStats:{pow:20,sta:0,wis:0,spl:0,con:0,crt:0},learnedSkills:{56:10,397:10,2004:10,5206:10,5207:10,5208:10,6001:10,5210:10,5211:5,5212:10,5213:5,6502:5},equipment:{weapon:9999},activeBuffs:{},runtimeState:{},weaponType:'2hSpear'};
global.currentMonster={name:'Dummy',currentHp:999999999,maxHp:999999999,race:'Formless',element:'Neutral',size:'Medium',def:0,mdef:0,res:0,mres:0,position:{x:0,y:0}};
global.skillsData={runtimeProfiles:runtime,skillIndex:{}};
const maxLv={5206:10,5207:10,5208:10,6001:10,5210:10,5211:5,5212:10,5213:5,6502:5,56:10,397:5,2004:10};
for(const [id,lv] of Object.entries(maxLv)) skillsData.skillIndex[id]={id:Number(id),officialId:Number(id),maxLevel:lv,name:'S'+id,skillType:Number(id)===5207?'passive':([5206,5212].includes(Number(id))?'buff':'attack'),requires:{SpCost:0}};
global.getSkillDataById=id=>skillsData.skillIndex[String(id)];
global.getSkillLevel=id=>Number(player.learnedSkills[id]||0);
global.getCurrentJobSkills=()=>Object.values(skillsData.skillIndex).filter(s=>Number(s.id)===5207);
global.getItemData=id=>id===9999?{id:9999,atk:100,weaponType:'spear',dbSubType:'2hSpear',weaponLevel:4,weight:1200,range:3}:null;
global.calculateDerivedPlayerStats=()=>({atk:200,matk:100,maxHp:player.maxHp,maxSp:player.maxSp,pAtk:0,sMatk:0,stats:{...player.stats,pow:20}});
global.getTrainingBonusTotals=()=>({});global.applyROCombatDamageModifiers=d=>d;
global.recalculatePlayerStats=()=>{};global.updatePlayerUI=()=>{};global.updateMonsterUI=()=>{};global.saveGame=()=>{};global.addBattleLog=()=>{};global.showDamageNumber=()=>{};global.playMonsterHitAnimation=()=>{};global.playROStudioPlayerMotion=()=>{};global.playPlayerAttackAnimation=()=>{};global.showSlashEffect=()=>{};
global.getRuntimeSkillSpCost=()=>0;global.canAttackMonsterByRange=()=>true;global.getSkillRangePx=()=>9999;global.playerHitsMonster=()=>true;
function load(p){vm.runInThisContext(fs.readFileSync(p,'utf8'),{filename:p});}
load(ROOT+'/js/combat_mechanics_runtime.js');
load(ROOT+'/js/ra_renewal_damage_pipeline.js');global.CombatDamagePipeline=global.RARenewalDamagePipeline;
load(ROOT+'/js/combat_resource_manager.js');
load(ROOT+'/js/skill_engine.js');
function assert(ok,msg){if(!ok)throw new Error(msg);}
function calc(id,lv,target=currentMonster){delete window.lastRADamageTrace;const skill=skillsData.skillIndex[String(id)];const damage=calculateSkillAttackDamage(skill,lv,target,{skipHitCheck:true,criticalResult:{critical:false,multiplier:1}});return {damage,ratio:window.lastRADamageTrace?.ratio,range:window.lastRADamageTrace?.rangeType};}
const savedRandom=Math.random; Math.random=()=>0.5;
const out={};
// 5207
out.twoHandDefense=getPassiveCombatModifierTotals().sizeResist;
assert(JSON.stringify(out.twoHandDefense)===JSON.stringify({small:10,medium:15,large:18}),'5207 size defense mismatch '+JSON.stringify(out.twoHandDefense));
player.equipment.weapon=null; assert((getPassiveCombatModifierTotals().sizeResist.medium||0)===0,'5207 weapon restriction failed'); player.equipment.weapon=9999;
// 5208
out.hackAndSlasher=calc(5208,10); assert(out.hackAndSlasher.ratio===42560&&out.hackAndSlasher.range==='long','5208 mismatch '+JSON.stringify(out.hackAndSlasher));
// 5206 + Hundred Spear
player.activeBuffs['5206']={level:10,effects:{chargingPierce:1},expiresAt:Date.now()+100000}; CombatResourceManager.configure('chargingPierce',{max:10,start:10,durationMs:5000});
out.chargedHundredSpear=calc(2004,10); assert(out.chargedHundredSpear.ratio===6200,'5206 mismatch '+JSON.stringify(out.chargedHundredSpear));
advanceChargingPierceAfterHit(skillsData.skillIndex['2004']); out.chargingRemaining=CombatResourceManager.get('chargingPierce'); assert(out.chargingRemaining===0,'5206 clear failed');
// 6001
player.activeBuffs={}; out.dragonicBreathPlain=calc(6001,10); assert(out.dragonicBreathPlain.ratio===12280,'6001 plain mismatch '+JSON.stringify(out.dragonicBreathPlain));
player.activeBuffs['5210']={level:10,effects:{dragonicAuraLevel:10},expiresAt:Date.now()+100000}; out.dragonicBreathAura=calc(6001,10); assert(out.dragonicBreathAura.ratio===13800,'6001 aura mismatch '+JSON.stringify(out.dragonicBreathAura));
// 5210
const angel={...currentMonster,race:'Angel'}; out.dragonicAuraAttack=calc(5210,10,angel); assert(out.dragonicAuraAttack.ratio===76600,'5210 mismatch '+JSON.stringify(out.dragonicAuraAttack));
// 5211
player.activeBuffs['5206']={level:10,effects:{chargingPierce:1},expiresAt:Date.now()+100000}; CombatResourceManager.configure('chargingPierce',{max:10,start:10,durationMs:5000}); out.madnessCrusher=calc(5211,5); assert(out.madnessCrusher.ratio===96720,'5211 mismatch '+JSON.stringify(out.madnessCrusher));
// 5213
player.activeBuffs={}; out.stormSlash=calc(5213,5); assert(out.stormSlash.ratio===41500,'5213 mismatch '+JSON.stringify(out.stormSlash));
// 6502
player.activeBuffs['5210']={level:10,effects:{dragonicAuraLevel:10},expiresAt:Date.now()+100000}; out.dragonicPierce=calc(6502,5); assert(out.dragonicPierce.ratio===51400,'6502 mismatch '+JSON.stringify(out.dragonicPierce));
// 5212
player.activeBuffs={}; currentMonster.race='Formless'; out.normalPlain=RARenewalDamagePipeline.resolveNormalAttack(currentMonster,{ratioOverride:100,allowNormalProc:false,criticalResult:{critical:false,multiplier:1}}).damage;
player.activeBuffs['5212']={level:10,effects:{vigorLevel:10,vigorHpCost:10},expiresAt:Date.now()+100000}; out.normalVigor=RARenewalDamagePipeline.resolveNormalAttack(currentMonster,{ratioOverride:100,allowNormalProc:false,criticalResult:{critical:false,multiplier:1}}).damage; assert(out.normalVigor===Math.floor(out.normalPlain*3.5),'5212 normal mismatch '+JSON.stringify(out));
currentMonster.race='Angel'; out.normalVigorAngel=RARenewalDamagePipeline.resolveNormalAttack(currentMonster,{ratioOverride:100,allowNormalProc:false,criticalResult:{critical:false,multiplier:1}}).damage; assert(out.normalVigorAngel===Math.floor(out.normalPlain*4.5),'5212 angel mismatch '+JSON.stringify(out));
const hp0=player.hp;out.vigorHpCost=consumeVigorHpOnAttack();assert(out.vigorHpCost===10&&player.hp===hp0-10,'5212 HP cost mismatch');
Math.random=savedRandom;
out.officialRuntime=Object.keys(runtime).length;
out.result='PASS';
console.log(JSON.stringify(out));
process.exit(0);
