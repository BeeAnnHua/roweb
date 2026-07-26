const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const core=JSON.parse(fs.readFileSync(path.join(root,'data/skills/skills_core_1.json'),'utf8')).skills;
const rows=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_core_1_v1.json'),'utf8')).skills;
const generated=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_generated_all.json'),'utf8')).skills;
const pending=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_pending_review.json'),'utf8')).skills;
const runtimeProfiles={};for(const [id,row] of Object.entries(rows))runtimeProfiles[id]=row.runtimeProfile||row;
const math=Object.create(Math);math.random=()=>0;let lastPhysical=null,lastHitOptions=null;
const monster={name:'基因學者測試魔物',currentHp:999999,maxHp:999999,level:100,size:'Medium',race:'Formless',element:'Neutral',position:{x:1,y:0},runtimeState:{statuses:{}}};
const learned={2474:5,2475:5,2476:10,2478:5};
const ctx={console,Date,Math:math,setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},window:null,
 player:{hp:10000,maxHp:10000,sp:9999,maxSp:9999,baseLevel:100,jobLevel:70,stats:{str:100,agi:80,vit:70,int:40,dex:80,luk:30},position:{x:0,y:0},activeBuffs:{},runtimeState:{statuses:{}},learnedSkills:learned,equipment:{weapon:1},weaponType:'dagger'},
 currentMonster:monster,activeMonsters:[monster],skillsData:{runtimeProfiles},
 getSkillLevel:id=>Number(ctx.player.learnedSkills[id]||0),getSkillDataById:id=>core[String(id)]||null,getCurrentJobSkills:()=>Object.values(core),isSkillBasic:()=>false,
 calculateDerivedPlayerStats:()=>({atk:500,matk:100,stats:{...ctx.player.stats}}),getItemData:()=>({dbSubType:ctx.player.weaponType,weight:1000}),getEquippedWeaponTypeRuntime:()=>ctx.player.weaponType,isPlayerMounted:()=>false,
 updatePlayerUI:()=>{},updateMonsterUI:()=>{},saveGame:()=>{},recalculatePlayerStats:()=>{},renderPositionSprites:()=>{},addBattleLog:()=>{},defeatMonster:()=>{},paySkillCost:()=>{},
 playROStudioPlayerMotion:()=>{},playPlayerAttackAnimation:()=>{},playMonsterHitAnimation:()=>{},showDamageNumber:()=>{},showSlashEffect:()=>{},canAttackMonsterByRange:()=>true,
 TargetingResolver:{collect:(o,c)=>c.filter(Boolean)},MovementEffectResolver:{knockback:()=>true},StatusManager:{apply:()=>({applied:true})},
 CombatDamagePipeline:{resolvePhysicalSkill:(p,l,t,o)=>{lastPhysical={...o};return{damage:Number(o.ratio||1)};},resolveMagicSkill:()=>({damage:1})},
 MultiHitResolver:{normalize:(p)=>({damageHitCount:Number(p.damageHitCount||1),visualHitCount:Number(p.visualHitCount||1),statusProcMode:'once'}),split:d=>[d]},
 HitResolver:{resolve:(a,t,o)=>{lastHitOptions={...o};return{hit:true};}},CriticalResolver:{resolve:()=>({critical:false,multiplier:1})},PerfectDodgeResolver:{resolve:()=>({dodged:false})}
};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/skill_engine.js'),'utf8'),ctx);
function assert(c,m){if(!c)throw new Error(m);}
assert(Object.values(generated).filter(x=>x.implementationMode==='official'&&x.executionEnabled).length>=456,'official coverage must not regress below 456');
assert(pending.length<=683,'pending count must not regress above 683');
for(const id of [2474,2475,2476,2478]){assert(runtimeProfiles[id]?.handler!=='pending','runtime '+id);assert(!pending.some(x=>Number(x.skillId)===id),'pending '+id);}
let totals=ctx.getPassiveSkillBonusTotals();assert(totals.atkFlat===50,'Sword Training ATK '+totals.atkFlat);assert(totals.hitFlat===15,'Sword Training HIT '+totals.hitFlat);
ctx.calculateSkillAttackDamage(core['2476'],10,monster,{});assert(lastPhysical.ratio===2460,'Cart Tornado ratio '+lastPhysical.ratio);
monster.currentHp=999999;assert(ctx.castAttackSkill(core['2476'],10)===true,'Cart Tornado cast');assert(lastHitOptions.hitRateBonus===20,'Cart Remodeling HIT '+lastHitOptions.hitRateBonus);
assert(ctx.castBuffSkill(core['2478'],5)===true,'Cart Boost cast');const buff=ctx.player.activeBuffs[2478];assert(buff&&buff.effects.atkFlat===50,'Cart Boost ATK');assert(buff.effects.walkSpeedRate===-100,'Cart Boost speed');
assert(runtimeProfiles[2477]?.formula==='renewal_cart_cannon','Cart Cannon promoted in AQ');assert(!pending.some(x=>Number(x.skillId)===2477),'Cart Cannon no longer pending');
console.log(JSON.stringify({result:'PASS',official:456,pending:683,swordTraining:{atk:50,hit:15},cartTornadoLv10Str100Remodel5:2460,cartRemodelHitBonus:20,cartBoost:{atk:50,walkSpeedRate:-100}},null,2));
