const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const core=JSON.parse(fs.readFileSync(path.join(root,'data/skills/skills_core_1.json'),'utf8')).skills;
const rows=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_core_1_v1.json'),'utf8')).skills;
const generated=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_generated_all.json'),'utf8')).skills;
const pending=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_pending_review.json'),'utf8')).skills;
const runtimeProfiles={};for(const [id,row] of Object.entries(rows))runtimeProfiles[id]=row.runtimeProfile||row;
let lastPhysical=null;
const monster={name:'測試魔物',currentHp:999999,maxHp:999999,size:'Medium',race:'Formless',element:'Neutral',position:{x:1,y:0},runtimeState:{statuses:{}}};
const learned={39:10,40:1,41:10,94:5,95:5,96:5,97:5,98:3,99:3,100:3,101:3,102:3,103:3,104:3,154:1,1013:1,2535:1,2544:1,153:1,485:10};
const ctx={console,Date,Math,setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},window:null,
 player:{hp:10000,maxHp:10000,sp:9999,maxSp:9999,baseLevel:200,jobLevel:70,stats:{str:100,agi:80,vit:80,int:40,dex:80,luk:30},position:{x:0,y:0},activeBuffs:{},runtimeState:{statuses:{}},learnedSkills:learned,equipment:{weapon:1}},
 currentMonster:monster,activeMonsters:[monster],skillsData:{runtimeProfiles},
 getSkillLevel:id=>Number(ctx.player.learnedSkills[id]||0),getSkillDataById:id=>core[String(id)]||null,getCurrentJobSkills:()=>Object.values(core),isSkillBasic:()=>false,
 calculateDerivedPlayerStats:()=>({atk:500,matk:100,stats:{...ctx.player.stats}}),getItemData:()=>({dbSubType:'1hAxe'}),isPlayerMounted:()=>false,
 updatePlayerUI:()=>{},updateMonsterUI:()=>{},saveGame:()=>{},recalculatePlayerStats:()=>{},renderPositionSprites:()=>{},addBattleLog:()=>{},
 playROStudioPlayerMotion:()=>{},playPlayerAttackAnimation:()=>{},playMonsterHitAnimation:()=>{},showDamageNumber:()=>{},showSlashEffect:()=>{},
 TargetingResolver:{collect:(o,c)=>c.filter(Boolean)},MovementEffectResolver:{knockback:()=>true},
 StatusManager:{apply:()=>({applied:true})},
 CombatDamagePipeline:{resolvePhysicalSkill:(p,l,t,o)=>{lastPhysical={...o};return{damage:Number(o.ratio||1)};},resolveMagicSkill:()=>({damage:1})},
 MultiHitResolver:{normalize:()=>({damageHitCount:1,visualHitCount:1,statusProcMode:'once'}),split:d=>[d]},HitResolver:{resolve:()=>({hit:true})},CriticalResolver:{resolve:()=>({critical:false,multiplier:1})},PerfectDodgeResolver:{resolve:()=>({dodged:false,multiplier:1})}
};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/skill_engine.js'),'utf8'),ctx);
function assert(c,m){if(!c)throw new Error(m);}
const converted=[40,41,94,95,96,97,98,99,100,101,102,103,104,154,1013,2535,2544];
assert(Object.values(generated).filter(x=>x.implementationMode==='official'&&x.executionEnabled).length>=452,'official coverage must not regress below 452');
assert(pending.length<=687,'pending count must not regress above 687');
for(const id of converted){assert(runtimeProfiles[id]?.handler==='passive','passive profile '+id);assert(core[id].skillType==='passive','core passive '+id);assert(!pending.some(x=>Number(x.skillId)===id),'pending '+id);}
const totals=ctx.getPassiveSkillBonusTotals();
assert(totals.atkRate===80,'ATK total '+totals.atkRate);
assert(totals.maxHpRate===50,'MHP total '+totals.maxHpRate);
assert(totals.maxSpRate===50,'MSP total '+totals.maxSpRate);
ctx.calculateSkillAttackDamage(core['153'],1,monster,{});assert(lastPhysical.ratio===250,'cart revolution full '+lastPhysical.ratio);
ctx.player.learnedSkills[39]=0;ctx.calculateSkillAttackDamage(core['153'],1,monster,{});assert(lastPhysical.ratio===250,'cart revolution independent '+lastPhysical.ratio);
ctx.calculateSkillAttackDamage(core['485'],10,monster,{});assert(lastPhysical.ratio===1333,'cart termination full '+lastPhysical.ratio);
assert(runtimeProfiles['39'].futureCartRentalHook?.enabled===true,'cart rental hook');
assert(runtimeProfiles['154'].futureCartVisualHook?.enabled===true&&runtimeProfiles['2544'].futureCartVisualHook?.enabled===true,'cart visual hooks');
console.log(JSON.stringify({result:'PASS',official:452,pending:687,passiveTotals:totals,cartRevolution:250,cartTerminationLv10:1333},null,2));
