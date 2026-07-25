const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const core=JSON.parse(fs.readFileSync(path.join(root,'data/skills/skills_core_1.json'),'utf8')).skills;
const rows=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_core_1_v1.json'),'utf8')).skills;
const generated=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_generated_all.json'),'utf8')).skills;
const pending=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_pending_review.json'),'utf8')).skills;
const runtimeProfiles={};for(const [id,row] of Object.entries(rows))runtimeProfiles[id]=row.runtimeProfile||row;
const resource={spiritSphere:15};
const CRM={get:k=>Number(resource[k]||0),consume:(k,n)=>{if((resource[k]||0)<n)return{ok:false,used:0,remaining:resource[k]||0};resource[k]-=n;return{ok:true,used:n,remaining:resource[k]};},configure:(k,o)=>{resource[k]=Number(o.start||0);return resource[k];},add:(k,n,max)=>resource[k]=Math.min(max,Number(resource[k]||0)+n),clear:k=>resource[k]=0};
const logs=[];let lastPhysical=null,lastMagic=null;
const monster={name:'測試魔物',currentHp:999999999,maxHp:999999999,race:'Demon',element:'Dark',size:'Large',position:{x:1,y:0},runtimeState:{statuses:{}}};
const learned={};Object.keys(core).forEach(id=>learned[id]=Number(core[id].maxLevel||1));
const ctx={console,Date,Math,setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},window:null,
 player:{hp:1000,maxHp:10000,sp:1000,maxSp:5000,baseLevel:200,jobLevel:60,stats:{str:20,agi:20,vit:20,int:100,dex:20,luk:20},traitStats:{pow:20,sta:0,wis:0,spl:30,con:0,crt:0},position:{x:0,y:0},activeBuffs:{},runtimeState:{statuses:{}},learnedSkills:learned,equipment:{weapon:1}},
 currentMonster:monster,activeMonsters:[monster],skillsData:{runtimeProfiles},CombatResourceManager:CRM,
 getSkillLevel:id=>Number(ctx.player.learnedSkills[id]||0),getSkillDataById:id=>core[String(id)]||null,getCurrentJobSkills:()=>Object.values(core),
 calculateDerivedPlayerStats:()=>({atk:500,matk:400,maxHp:ctx.player.maxHp,maxSp:ctx.player.maxSp,stats:{...ctx.player.stats,...ctx.player.traitStats}}),getItemData:()=>({dbSubType:'Knuckle'}),isPlayerMounted:()=>false,
 updatePlayerUI:()=>{},updateMonsterUI:()=>{},saveGame:()=>{},recalculatePlayerStats:()=>{},renderPositionSprites:()=>{},addBattleLog:s=>logs.push(s),
 playROStudioPlayerMotion:()=>{},playPlayerAttackAnimation:()=>{},playMonsterHitAnimation:()=>{},showDamageNumber:()=>{},showSlashEffect:()=>{},
 TargetingResolver:{collect:(origin,candidates,opt)=>candidates.filter(Boolean)},MovementEffectResolver:{knockback:()=>{},backslide:()=>{}},
 StatusManager:{apply:(target,status,opt)=>{const key=String(status).toLowerCase().replace(/[ _-]/g,'');target.runtimeState=target.runtimeState||{};target.runtimeState.statuses=target.runtimeState.statuses||{};target.runtimeState.statuses[key]={id:key,effects:opt.effects||{},expiresAt:Date.now()+Number(opt.durationMs||0)};return {applied:true};}},
 CombatDamagePipeline:{resolvePhysicalSkill:(p,l,t,o)=>{lastPhysical={...o};return{damage:Number(o.ratio||1)};},resolveMagicSkill:(p,l,t,o)=>{lastMagic={...o};return{damage:Number(o.ratio||1)};}},
 MultiHitResolver:{normalize:(p,l)=>({damageHitCount:Array.isArray(p.hitCount)?Number(p.hitCount[l-1]):Number(p.hitCount||1),visualHitCount:Number(p.hitCount||1),statusProcMode:'once'})},
 HitResolver:{resolve:()=>({hit:true})},CriticalResolver:{resolve:()=>({critical:false,multiplier:1})},PerfectDodgeResolver:{resolve:()=>({dodged:false})}
};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/skill_engine.js'),'utf8'),ctx);
function assert(c,m){if(!c)throw new Error(m);}
// Coverage and family completion.
assert(Object.values(generated).filter(x=>x.implementationMode==='official'&&x.executionEnabled).length>=418,'official coverage milestone');
const ids=[5238,5239,5240,5241,5242,5243,5244,5245,5246,5247,5248,5249,5250,5251,5252,5253,5254,5268,5269,5270,5271,5272,5273,5275,5276,5277,5278,5279,5280,5281,5282,5283,5284,6518,6519];
assert(ids.every(id=>runtimeProfiles[id]&&runtimeProfiles[id].handler!=='pending'),'all profiles');assert(ids.every(id=>!pending.some(x=>Number(x.skillId)===id)),'not pending');
// Explosion Blaster Holy Oil bonus.
monster.runtimeState.statuses={};ctx.calculateSkillAttackDamage(core['5244'],5,monster,{});const noOil=lastPhysical.ratio;
monster.runtimeState.statuses.holyoil={};ctx.calculateSkillAttackDamage(core['5244'],5,monster,{});const oil=lastPhysical.ratio;assert(oil>noOil,'holy oil bonus');
// Third Flame Bomb gets 3 hits at 15 spheres; pipeline receives total ratio x3.
resource.spiritSphere=15;ctx.calculateSkillAttackDamage(core['5252'],5,monster,{});const bomb15=lastPhysical.ratio;resource.spiritSphere=4;ctx.calculateSkillAttackDamage(core['5252'],5,monster,{});const bomb4=lastPhysical.ratio;assert(bomb15===bomb4*3,'sphere hit scaling '+bomb15+'/'+bomb4);
// Cardinal formulas.
ctx.calculateSkillAttackDamage(core['5273'],10,monster,{});assert(lastMagic.ratio===26600,'arbitrium ratio '+lastMagic.ratio);
ctx.calculateSkillAttackDamage(core['6518'],5,monster,{});assert(lastMagic.ratio===42000,'divinus flos ratio '+lastMagic.ratio);
// Competentia full recovery at Lv5 and buffs.
ctx.player.hp=1;ctx.player.sp=100;assert(ctx.castBuffSkill(core['5278'],5),'competentia');assert(ctx.player.hp===ctx.player.maxHp&&ctx.player.sp===ctx.player.maxSp,'competentia restore');assert(ctx.player.activeBuffs['5278'].effects.pAtk===50,'competentia patk');
// Reparatio full heal.
ctx.player.hp=123;assert(ctx.castHealSkill(core['5268'],5),'reparatio');assert(ctx.player.hp===ctx.player.maxHp,'reparatio full');
// Mediale periodic formula.
ctx.player.hp=1000;assert(ctx.castBuffSkill(core['5269'],5),'mediale');ctx.player.activeBuffs['5269'].lastPeriodicFormulaTick=Date.now()-2001;ctx.normalizeActiveBuffs();assert(ctx.player.hp>1000,'mediale periodic');
// Faith resource waiver.
resource.spiritSphere=0;ctx.player.activeBuffs['5246']={id:5246,level:1,effects:{waiveFallenEmpireSphereCost:1},expiresAt:Date.now()+10000};const fallen=runtimeProfiles['2329'];assert(ctx.applyRuntimeResourceCost(fallen,10).ok,'faith sphere waiver');
console.log(JSON.stringify({result:'PASS',official:418,pending:721,noOil,oil,bomb4,bomb15,arbitrium:lastMagic.ratio,medialeHp:ctx.player.hp,logs:logs.slice(-4)},null,2));
