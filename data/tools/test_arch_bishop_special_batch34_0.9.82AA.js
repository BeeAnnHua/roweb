const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const core=JSON.parse(fs.readFileSync(path.join(root,'data/skills/skills_core_1.json'),'utf8')).skills;
const rows=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_core_1_v1.json'),'utf8')).skills;
const runtimeProfiles={...rows};
const logs=[]; const DMath=Object.create(Math); DMath.random=()=>0;
const m1={name:'M1',currentHp:10000,maxHp:10000,position:{x:1,y:0},runtimeState:{statuses:{}}};
const m2={name:'M2',currentHp:10000,maxHp:10000,position:{x:2,y:0},runtimeState:{statuses:{}}};
const ctx={console,Date,Math:DMath,setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},window:null,
 player:{hp:5000,maxHp:10000,sp:5000,maxSp:5000,baseLevel:200,jobLevel:60,jobKey:'arch_bishop',stats:{str:10,agi:10,vit:10,int:100,dex:10,luk:10},traitStats:{},position:{x:0,y:0},activeBuffs:{},runtimeState:{statuses:{poison:{}}},learnedSkills:{12:10,28:10,54:4,2039:1,2044:5,2052:5,2057:5,5011:5,5072:5,5073:1},equipment:{}},
 currentMonster:m1,activeMonsters:[m1,m2],mapMonsters:null,skillsData:{runtimeProfiles},
 getSkillLevel:id=>Number(ctx.player.learnedSkills[id]||0),getSkillDataById:id=>core[String(id)]||null,getCurrentJobSkills:()=>Object.values(core).filter(s=>ctx.player.learnedSkills[s.id]),
 getTrainingBonusTotals:()=>({}),getJobDisplayName:()=>'',getCurrentJobData:()=>null,getItemData:()=>null,isPlayerMounted:()=>false,
 updatePlayerUI:()=>{},updateMonsterUI:()=>{},saveGame:()=>{},recalculatePlayerStats:()=>{},renderPositionSprites:()=>{},addBattleLog:s=>logs.push(s),
 playROStudioPlayerMotion:()=>{},playPlayerAttackAnimation:()=>{},playMonsterHitAnimation:()=>{},showDamageNumber:()=>{},showSlashEffect:()=>{},
 TargetingResolver:{collect:(origin,candidates,opt)=>candidates.filter(Boolean)},
 StatusManager:{apply:(target,status,opt)=>{target.runtimeState=target.runtimeState||{};target.runtimeState.statuses=target.runtimeState.statuses||{};target.runtimeState.statuses[status]={id:status,effects:opt.effects||{},expiresAt:Date.now()+Number(opt.durationMs||0)};return {applied:true};},has:()=>false},
 CombatDamagePipeline:{resolvePhysicalSkill:()=>({damage:100}),resolveMagicSkill:()=>({damage:100})},
 MultiHitResolver:{normalize:p=>({damageHitCount:Number(p.damageHitCount||1),visualHitCount:Number(p.visualHitCount||1),statusProcMode:'once'})},
 HitResolver:{resolve:()=>({hit:true})},CriticalResolver:{resolve:()=>({critical:false,multiplier:1})},PerfectDodgeResolver:{resolve:()=>({dodged:false})}
};
ctx.window=ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root,'js/skill_engine.js'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(root,'js/status_system.js'),'utf8'),ctx);
function assert(c,m){if(!c)throw new Error(m);}
assert(ctx.getSkillRuntimeProfile(core['2045']).handler==='buff','runtime wrapper unwrap failed');
const passive=ctx.getPassiveSkillBonusTotals();
assert(passive.perfectDodgeFlat===10,'safety wall perfect dodge '+JSON.stringify(passive));
assert(passive.maxHpRate===18 && passive.maxSpRate===18,'passive hp/sp total '+JSON.stringify(passive));
assert(passive.atkRate===20 && passive.matkRate===20,'clearance/silentium total '+JSON.stringify(passive));
const derived=ctx.calculateDerivedPlayerStats();
assert(derived.perfectDodge===10,'derived perfect dodge '+derived.perfectDodge);
ctx.player.hp=5000;ctx.player.sp=2500;
assert(ctx.castBuffSkill(core['2044'],5),'epiclesis cast');
assert(ctx.player.activeBuffs['2044'].effects.maxHpRate===25,'epiclesis max hp');
ctx.player.activeBuffs['2044'].lastPeriodicHpTick=Date.now()-3001;
ctx.player.activeBuffs['2044'].lastPeriodicSpHealTick=Date.now()-3001;
ctx.normalizeActiveBuffs();
assert(ctx.player.hp===5500,'epiclesis hp tick '+ctx.player.hp);
assert(ctx.player.sp===2400,'epiclesis sp tick '+ctx.player.sp);
ctx.player.sp=5000;
assert(ctx.castBuffSkill(core['5011'],5),'offertorium cast');
assert(!ctx.player.runtimeState.statuses.poison,'offertorium did not clear poison');
const healCost=ctx.getRuntimeSkillSpCost(core['28'],10);
assert(healCost===120,'offertorium SP cost expected 120 got '+healCost);
ctx.player.hp=1000;const beforeSp=ctx.player.sp;
assert(ctx.castHealSkill(core['28'],10),'heal under offertorium');
assert(ctx.player.hp>1000,'offertorium heal failed');
assert(beforeSp-ctx.player.sp===120,'heal SP deduction '+(beforeSp-ctx.player.sp));
assert(ctx.castDebuffSkill(core['5072'],5),'vituperatum cast');
assert(m1.runtimeState.statuses.aeterna&&m2.runtimeState.statuses.aeterna,'vituperatum aoe');
console.log(JSON.stringify({result:'PASS',passive,derivedPerfectDodge:derived.perfectDodge,epiclesisHp:5500,epiclesisSp:2400,healCost,vituperatumTargets:2,logs:logs.slice(-6)},null,2));
