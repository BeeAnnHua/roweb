const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const core=JSON.parse(fs.readFileSync(path.join(root,'data/skills/skills_core_1.json'),'utf8')).skills;
const rows=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_core_1_v1.json'),'utf8')).skills;
const runtimeProfiles={};for(const [id,row] of Object.entries(rows))runtimeProfiles[id]=row.runtimeProfile||row;
const logs=[];const DMath=Object.create(Math);DMath.random=()=>0;
const m1={name:'M1',currentHp:10000,maxHp:10000,position:{x:1,y:0},runtimeState:{statuses:{}}};
const m2={name:'M2',currentHp:10000,maxHp:10000,position:{x:2,y:0},runtimeState:{statuses:{}}};
const ctx={console,Date,Math:DMath,setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},window:null,
 player:{hp:5000,maxHp:10000,sp:5000,maxSp:5000,baseLevel:200,jobLevel:60,stats:{str:10,agi:10,vit:10,int:100,dex:10,luk:10},position:{x:0,y:0},activeBuffs:{},runtimeState:{statuses:{}},learnedSkills:{28:10,29:10,34:10,2038:10,2040:10,2041:3,2042:3,2043:3,2045:10,2046:10,2047:4,2048:4,2050:4,2051:5,2053:5,2054:10,2515:5},equipment:{}},
 currentMonster:m1,activeMonsters:[m1,m2],mapMonsters:null,skillsData:{runtimeProfiles},
 getSkillLevel:id=>Number(ctx.player.learnedSkills[id]||0),getSkillDataById:id=>core[String(id)]||null,getCurrentJobSkills:()=>Object.values(core),
 calculateDerivedPlayerStats:()=>({atk:500,matk:300,stats:{...ctx.player.stats}}),getItemData:()=>null,isPlayerMounted:()=>false,
 updatePlayerUI:()=>{},updateMonsterUI:()=>{},saveGame:()=>{},recalculatePlayerStats:()=>{},renderPositionSprites:()=>{},addBattleLog:s=>logs.push(s),
 playROStudioPlayerMotion:()=>{},playPlayerAttackAnimation:()=>{},playMonsterHitAnimation:()=>{},showDamageNumber:()=>{},showSlashEffect:()=>{},
 TargetingResolver:{collect:(origin,candidates,opt)=>candidates.filter(Boolean)},
 StatusManager:{apply:(target,status,opt)=>{target.runtimeState=target.runtimeState||{};target.runtimeState.statuses=target.runtimeState.statuses||{};target.runtimeState.statuses[status]={id:status,effects:opt.effects||{},expiresAt:Date.now()+Number(opt.durationMs||0)};return {applied:true};},has:()=>false},
 CombatDamagePipeline:{resolvePhysicalSkill:()=>({damage:1650}),resolveMagicSkill:()=>({damage:4400})},
 MultiHitResolver:{normalize:p=>({damageHitCount:Number(p.damageHitCount||1),visualHitCount:Number(p.visualHitCount||1),statusProcMode:'once'})},
 HitResolver:{resolve:()=>({hit:true})},CriticalResolver:{resolve:()=>({critical:false,multiplier:1})},PerfectDodgeResolver:{resolve:()=>({dodged:false})}
};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/skill_engine.js'),'utf8'),ctx);
function assert(c,m){if(!c)throw new Error(m);}
assert(ctx.castBuffSkill(core['2041'],3),'clementia cast');assert(ctx.player.activeBuffs['2041'].effects.strFlat===16,'clementia '+JSON.stringify(ctx.player.activeBuffs['2041']));
assert(ctx.castBuffSkill(core['2042'],3),'canto cast');assert(ctx.player.activeBuffs['2042'].effects.agiFlat===18,'canto');
assert(ctx.castBuffSkill(core['2045'],10),'praefatio cast');assert(ctx.player.activeBuffs['2045'].effects.kyrieBarrierHp===3002,'praefatio hp');assert(ctx.player.activeBuffs['2045'].effects.kyrieBarrierHits===16,'praefatio hits');
ctx.player.hp=5000;assert(ctx.castBuffSkill(core['2050'],4),'renovatio cast');ctx.player.activeBuffs['2050'].lastPeriodicHpTick=Date.now()-5001;ctx.normalizeActiveBuffs();assert(ctx.player.hp>=5800,'renovatio heal '+ctx.player.hp);
ctx.player.hp=1000;assert(ctx.castHealSkill(core['2051'],5),'highness');assert(ctx.player.hp>1000,'highness heal');
assert(ctx.castDebuffSkill(core['2046'],10),'oratio');assert(m1.runtimeState.statuses.oratio&&m2.runtimeState.statuses.oratio,'oratio aoe');assert(m1.runtimeState.statuses.oratio.effects.holyDamageTakenRate===20,'oratio effect');
assert(ctx.castBuffSkill(core['2054'],10),'duple cast');const before=m1.currentHp;assert(ctx.tryDupleLightOnNormalAttack(m1),'duple proc');assert(before-m1.currentHp===6050,'duple total '+(before-m1.currentHp));
assert(ctx.castBuffSkill(core['2515'],5),'secrament cast');const cast=ctx.getRuntimeAdjustedCastTime(core['2515'],5);assert(cast.fixedReductionRate===50,'secrament active not found');
console.log(JSON.stringify({result:'PASS',clementia:16,canto:18,praefatioHp:3002,praefatioHits:16,renovatioHp:ctx.player.hp,oratioTargets:2,dupleDamage:6050,logs:logs.slice(-5)},null,2));
