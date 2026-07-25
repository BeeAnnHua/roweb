const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const core=JSON.parse(fs.readFileSync(path.join(root,'data/skills/skills_core_1.json'),'utf8')).skills;
const rows=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_core_1_v1.json'),'utf8')).skills;
const generated=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_generated_all.json'),'utf8')).skills;
const pending=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_pending_review.json'),'utf8')).skills;
const runtimeProfiles={};for(const [id,row] of Object.entries(rows))runtimeProfiles[id]=row.runtimeProfile||row;
const math=Object.create(Math);math.random=()=>0;let lastPhysical=null,lastHitMeta=null;
const monster={name:'米斯特測試魔物',currentHp:999999999,maxHp:999999999,level:250,size:'Large',race:'Formless',element:'Neutral',position:{x:2,y:0},runtimeState:{statuses:{}}};
const learned={5295:5,5296:10,5300:10,6004:10,6506:5,6507:5};
const ctx={console,Date,Math:math,setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},window:null,
 player:{hp:100000,maxHp:100000,sp:999999,maxSp:999999,baseLevel:200,jobLevel:50,stats:{str:100,agi:80,vit:80,int:30,dex:100,luk:30,pow:20},traitStats:{pow:20},position:{x:0,y:0},activeBuffs:{},runtimeState:{statuses:{}},learnedSkills:learned,equipment:{weapon:1},weaponType:'2hAxe'},
 currentMonster:monster,activeMonsters:[monster],skillsData:{runtimeProfiles},
 getSkillLevel:id=>Number(ctx.player.learnedSkills[id]||0),getSkillDataById:id=>core[String(id)]||null,getCurrentJobSkills:()=>Object.values(core),isSkillBasic:()=>false,
 calculateDerivedPlayerStats:()=>({atk:1000,matk:100,stats:{...ctx.player.stats,pow:20}}),getItemData:()=>({dbSubType:ctx.player.weaponType,weight:2000}),getEquippedWeaponTypeRuntime:()=>ctx.player.weaponType,isPlayerMounted:()=>false,
 updatePlayerUI:()=>{},updateMonsterUI:()=>{},saveGame:()=>{},recalculatePlayerStats:()=>{},renderPositionSprites:()=>{},addBattleLog:()=>{},defeatMonster:()=>{},paySkillCost:()=>{},movePlayerAdjacentToMonster:()=>true,
 playROStudioPlayerMotion:()=>{},playPlayerAttackAnimation:()=>{},playMonsterHitAnimation:()=>{},showDamageNumber:()=>{},showSlashEffect:()=>{},canAttackMonsterByRange:()=>true,
 TargetingResolver:{collect:(o,c)=>c.filter(Boolean)},MovementEffectResolver:{knockback:()=>true},
 StatusManager:{apply:(target,id,opt)=>{target.runtimeState=target.runtimeState||{};target.runtimeState.statuses=target.runtimeState.statuses||{};target.runtimeState.statuses[id]={id,effects:opt.effects||{},expiresAt:Date.now()+Number(opt.durationMs||0)};return{applied:true};}},
 CombatDamagePipeline:{resolvePhysicalSkill:(p,l,t,o)=>{lastPhysical={...o};return{damage:Number(o.ratio||1)};},resolveMagicSkill:()=>({damage:1})},
 MultiHitResolver:{normalize:(p)=>({damageHitCount:Number(p.damageHitCount||1),visualHitCount:Number(p.visualHitCount||1),statusProcMode:'once'}),split:d=>[d]},
 HitResolver:{resolve:()=>({hit:true})},CriticalResolver:{resolve:()=>({critical:false,multiplier:1})},PerfectDodgeResolver:{resolve:()=>({dodged:false})}
};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/skill_engine.js'),'utf8'),ctx);
function assert(c,m){if(!c)throw new Error(m);}function ratio(id,lv){ctx.calculateSkillAttackDamage(core[String(id)],lv,monster,{});return lastPhysical.ratio;}
assert(Object.values(generated).filter(x=>x.implementationMode==='official'&&x.executionEnabled).length>=462,'official coverage milestone');
assert(pending.length<=677,'pending count milestone');
for(const id of [5295,5296,5300,6004,6506,6507]){assert(runtimeProfiles[id]?.handler!=='pending','runtime '+id);assert(!pending.some(x=>Number(x.skillId)===id),'pending '+id);}
let res=ctx.getPassiveCombatModifierTotals();assert(res.sizeResist.small===10,'small resist');assert(res.sizeResist.medium===15,'medium resist');assert(res.sizeResist.large===18,'large resist');
assert(ratio(5295,5)===12600,'Axe Stomp '+ratio(5295,5));
ctx.player.activeBuffs={};assert(ratio(6004,10)===5160,'Mighty no stomp');assert(ratio(6507,5)===9300,'Powerful no stomp');
assert(ctx.castAttackSkill(core['5295'],5)===true,'Axe Stomp cast');assert(ctx.getActiveBuffBonusTotals().axeStomp===1,'Axe Stomp buff');
assert(ratio(6004,10)===5400,'Mighty stomp '+ratio(6004,10));assert(ratio(6507,5)===10500,'Powerful stomp '+ratio(6507,5));
assert(ratio(6506,5)===35200,'Rush Strike '+ratio(6506,5));
ctx.player.activeBuffs={};monster.runtimeState.statuses={};assert(ratio(5296,10)===75400,'Rush Quake '+ratio(5296,10));
assert(ctx.castAttackSkill(core['5296'],10)===true,'Rush Quake cast');
assert(monster.runtimeState.statuses.rush_quake_vulnerability.effects.physicalDamageTakenRate===50,'Rush Quake target vulnerability');
assert(ctx.getActiveBuffBonusTotals().physicalDamageRate===50,'Rush Quake self buff');
ctx.player.weaponType='1hAxe';assert(ctx.canCastSkill(core['6506'],5,['physical_charge']).ok===false,'Rush Strike weapon restriction');
console.log(JSON.stringify({result:'PASS',official:462,pending:677,twoHandAxeDefenseLv10:{small:10,medium:15,large:18},axeStompLv5:12600,mightySmashLv10:{normal:5160,axeStomp:5400},powerfulSwingLv5:{normal:9300,axeStomp:10500},rushStrikeLv5:35200,rushQuakeLv10Formless:75400,rushQuakeVulnerability:50,rushQuakeSelfPhysicalRate:50},null,2));
