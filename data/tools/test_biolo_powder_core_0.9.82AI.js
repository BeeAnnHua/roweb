const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const core=JSON.parse(fs.readFileSync(path.join(root,'data/skills/skills_core_1.json'),'utf8')).skills;
const rows=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_core_1_v1.json'),'utf8')).skills;
const generated=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_generated_all.json'),'utf8')).skills;
const pending=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_pending_review.json'),'utf8')).skills;
const runtimeProfiles={};for(const [id,row] of Object.entries(rows))runtimeProfiles[id]=row.runtimeProfile||row;
const math=Object.create(Math);math.random=()=>0;let lastPhysical=null,lastCriticalOptions=null;
const monster={name:'生命締造者測試魔物',currentHp:999999999,maxHp:999999999,level:250,size:'Large',race:'Plant',element:'Earth',position:{x:2,y:0},runtimeState:{statuses:{}}};
const learned={5347:1,6005:5,6006:10,6509:5,6510:5};
const ctx={console,Date,Math:math,setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},window:null,
 player:{hp:100000,maxHp:100000,sp:999999,maxSp:999999,baseLevel:200,jobLevel:50,stats:{str:100,agi:80,vit:80,int:80,dex:100,luk:30,pow:20},traitStats:{pow:20},position:{x:0,y:0},activeBuffs:{},runtimeState:{statuses:{}},learnedSkills:learned,equipment:{weapon:1},weaponType:'mace'},
 currentMonster:monster,activeMonsters:[monster],skillsData:{runtimeProfiles},
 getSkillLevel:id=>Number(ctx.player.learnedSkills[id]||0),getSkillDataById:id=>core[String(id)]||null,getCurrentJobSkills:()=>Object.values(core),isSkillBasic:()=>false,
 calculateDerivedPlayerStats:()=>({atk:1000,matk:100,cri:100,stats:{...ctx.player.stats,pow:20}}),getItemData:()=>({dbSubType:ctx.player.weaponType,weight:1000}),getEquippedWeaponTypeRuntime:()=>ctx.player.weaponType,isPlayerMounted:()=>false,
 updatePlayerUI:()=>{},updateMonsterUI:()=>{},saveGame:()=>{},recalculatePlayerStats:()=>{},renderPositionSprites:()=>{},addBattleLog:()=>{},defeatMonster:()=>{},movePlayerAdjacentToMonster:()=>true,
 playROStudioPlayerMotion:()=>{},playPlayerAttackAnimation:()=>{},playMonsterHitAnimation:()=>{},showDamageNumber:()=>{},showSlashEffect:()=>{},canAttackMonsterByRange:()=>true,
 TargetingResolver:{collect:(o,c)=>c.filter(Boolean)},MovementEffectResolver:{knockback:()=>true},
 StatusManager:{apply:()=>({applied:true})},
 CombatDamagePipeline:{resolvePhysicalSkill:(p,l,t,o)=>{lastPhysical={...o};return{damage:Number(o.ratio||1)};},resolveMagicSkill:()=>({damage:1})},
 MultiHitResolver:{normalize:(p)=>({damageHitCount:Number(p.damageHitCount||1),visualHitCount:Number(p.visualHitCount||1),statusProcMode:'once'}),split:(d,h)=>Array.from({length:h},(_,i)=>Math.floor(d/h)+(i===0?d-Math.floor(d/h)*h:0))},
 HitResolver:{resolve:()=>({hit:true})},CriticalResolver:{resolve:(a,d,o)=>{lastCriticalOptions={...o};return{critical:false,multiplier:o.criticalMultiplier||1};}},PerfectDodgeResolver:{resolve:()=>({dodged:false})}
};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/skill_engine.js'),'utf8'),ctx);
function assert(c,m){if(!c)throw new Error(m);}function ratio(id,lv){ctx.calculateSkillAttackDamage(core[String(id)],lv,monster,{});return lastPhysical.ratio;}
assert(Object.values(generated).filter(x=>x.implementationMode==='official'&&x.executionEnabled).length>=467,'official coverage milestone');
assert(pending.length<=672,'pending count milestone');
for(const id of [5347,6005,6006,6509,6510]){assert(runtimeProfiles[id]?.handler!=='pending','runtime '+id);assert(!pending.some(x=>Number(x.skillId)===id),'pending '+id);}
ctx.player.activeBuffs={};
assert(ratio(6005,5)===23100,'Explosive Powder normal '+ratio(6005,5));
assert(ratio(6006,10)===22200,'Mayhemic Thorns normal '+ratio(6006,10));
assert(ratio(6509,5)===43200,'Mystery Powder '+ratio(6509,5));
assert(ctx.canCastSkill(core['6510'],5,['physical_attack_formula']).ok===false,'Dust Explosion must require Mystery Powder');
assert(ctx.castBuffSkill(core['5347'],1)===true,'Research Report cast');
assert(ctx.getActiveBuffBonusTotals().researchReport===1,'Research Report marker');
assert(ratio(6005,5)===43500,'Explosive Powder report '+ratio(6005,5));
assert(ratio(6006,10)===31200,'Mayhemic Thorns report '+ratio(6006,10));
assert(ctx.castAttackSkill(core['6006'],10)===true,'Mayhemic cast');
assert(lastCriticalOptions.criticalDamageBonusRateMultiplier===undefined,'resolver receives computed multiplier only');
ctx.player.activeBuffs={};assert(ctx.castAttackSkill(core['6509'],5)===true,'Mystery Powder cast');
assert(ctx.getActiveBuffBonusTotals().mysteryPowder===1,'Mystery Powder marker');
assert(ctx.canCastSkill(core['6510'],5,['physical_attack_formula']).ok===true,'Dust Explosion unlocked');
assert(ratio(6510,5)===37000,'Dust Explosion normal '+ratio(6510,5));
ctx.player.activeBuffs['5347']={id:5347,name:'研究報告',level:1,effects:{researchReport:1},expiresAt:Date.now()+150000};
assert(ratio(6510,5)===48000,'Dust Explosion report '+ratio(6510,5));
console.log(JSON.stringify({result:'PASS',official:467,pending:672,explosivePowderLv5:{normal:23100,researchReport:43500},mayhemicThornsLv10:{normal:22200,researchReport:31200},mysteryPowderLv5:43200,dustExplosionLv5:{normal:37000,researchReport:48000},researchReportDurationMs:150000,mysteryPowderDurationMs:60000},null,2));
