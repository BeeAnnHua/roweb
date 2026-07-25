const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const skills=JSON.parse(fs.readFileSync(path.join(root,'data/skills/skills_core_1.json'),'utf8')).skills;
const rtRows=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_core_1_v1.json'),'utf8')).skills;
const pending=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_pending_review.json'),'utf8')).skills;
const copy=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_copyable_skills.json'),'utf8'));
const runtimeProfiles={};for(const [id,row] of Object.entries(rtRows))runtimeProfiles[id]=row.runtimeProfile||row;
const logs=[];const DMath=Object.create(Math);DMath.random=()=>0;
const ctx={console,Date,Math:DMath,setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},window:null,
 player:{hp:10000,maxHp:10000,sp:5000,maxSp:5000,baseLevel:200,jobLevel:70,stats:{str:100,agi:90,dex:80,int:50,vit:80,luk:30},position:{x:0,y:0},activeBuffs:{},runtimeState:{statuses:{}},combatResources:{},learnedSkills:{},equipment:{}},
 currentMonster:{name:'遠距離測試怪',level:100,baseLevel:100,currentHp:1000000,maxHp:1000000,def:500,mdef:200,race:'DemiHuman',element:'Neutral',size:'Medium',attackRange:5,position:{x:10,y:0},runtimeState:{statuses:{}}},
 activeMonsters:null,mapMonsters:null,skillsData:{runtimeProfiles},
 getSkillLevel:(id)=>Number(ctx.player.learnedSkills[id]||0),getSkillDataById:(id)=>skills[String(id)]||null,
 getCurrentJobSkills:()=>Object.values(skills),getExtraSkillSkillList:()=>[],isSkillBasic:()=>false,
 calculateDerivedPlayerStats:()=>({atk:500,matk:300,stats:{...ctx.player.stats}}),
 getItemData:()=>null,getSkillRangePx:()=>9999,canAttackMonsterByRange:()=>true,movePlayerTowardMonster:()=>{},movePlayerAdjacentToMonster:()=>true,
 updatePlayerUI:()=>{},updateMonsterUI:()=>{},saveGame:()=>{},recalculatePlayerStats:()=>{},renderPositionSprites:()=>{},addBattleLog:s=>logs.push(s),
 playROStudioPlayerMotion:()=>{},playPlayerAttackAnimation:()=>{},playMonsterHitAnimation:()=>{},showDamageNumber:()=>{},showSlashEffect:()=>{},defeatMonster:()=>{},
 MultiHitResolver:{normalize:(p,l)=>{const gv=(v)=>Array.isArray(v)?(v[l-1]??v[v.length-1]):v;let h=gv(p.damageHitCount??p.hitCount??1);if(typeof h!=='number')h=1;return {damageHitCount:Math.max(1,h),visualHitCount:Math.max(1,gv(p.visualHitCount??h)||h),statusProcMode:p.statusProcMode||'once'};},split:(d,h)=>{h=Math.max(1,h||1);const q=Math.floor(d/h),r=d-q*h;return Array.from({length:h},(_,i)=>q+(i<r?1:0));}},
 CombatDamagePipeline:{resolvePhysicalSkill:(p,l,t,o)=>({damage:Math.floor(o.ratio)}),resolveMagicSkill:(p,l,t,o)=>({damage:Math.floor(o.ratio)})},
 TargetingResolver:{collect:(origin,cands,opt)=>cands.filter(Boolean)},HitResolver:{resolve:()=>({hit:true})},CriticalResolver:{resolve:()=>({critical:false,multiplier:1})},PerfectDodgeResolver:{resolve:()=>({dodged:false})},
 MovementEffectResolver:{knockback:()=>true,backslide:()=>true,moveAdjacent:()=>true},
 StatusManager:{apply:(target,status,opt)=>{target.runtimeState=target.runtimeState||{};target.runtimeState.statuses=target.runtimeState.statuses||{};const key=String(status).toLowerCase().replace(/[ _-]/g,'');target.runtimeState.statuses[key]={status,effects:opt.effects||{},expiresAt:Date.now()+Number(opt.durationMs||0)};return {applied:true};}},RO_WEB_CELL_SIZE:32
};ctx.window=ctx;ctx.activeMonsters=[ctx.currentMonster];vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root,'js/combat_resource_manager.js'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(root,'js/skill_engine.js'),'utf8'),ctx);
function learn(id,lv){ctx.player.learnedSkills[id]=lv;return skills[String(id)];}function assert(c,m){if(!c)throw new Error(m);}
// Redesigned passives.
learn(269,5);learn(1015,1);learn(2334,5);learn(2341,1);let passive=ctx.getPassiveSkillBonusTotals();
assert(passive.maxHpRate===20,'passive MaxHP '+passive.maxHpRate);assert(passive.maxSpRate===20,'passive MaxSP '+passive.maxSpRate);assert(passive.atkRate===10,'cursed circle ATK '+passive.atkRate);
for(const group of ['plagiarism','reproduce'])for(const row of copy[group]||[])if([269,1015,2334,2341].includes(Number(row.skillId)))assert(!row.runtimeReady&&!row.enabled,'passive copy exclusion '+row.skillId);
// Lightning Walk: Lv5 at Job70 reaches 100%, blocks one ranged physical attack, no movement code involved.
learn(2335,5);ctx.player.hp=10000;ctx.player.sp=5000;assert(ctx.castBuffSkill(skills['2335'],5),'lightning cast');
assert(ctx.player.activeBuffs['2335'].effects.lightningWalkBlockChance===100,'lightning chance');assert(ctx.player.hp===9900,'lightning HP cost '+ctx.player.hp);assert(ctx.tryLightningWalkBlock(ctx.currentMonster),'lightning block');assert(!ctx.player.activeBuffs['2335'],'lightning consumed');
// Gate of Hell normal, Revitalize, and Fallen Empire combo formulas.
learn(2343,10);ctx.player.hp=6000;ctx.player.maxHp=10000;ctx.player.sp=1000;ctx.player.maxSp=2000;
let normal=ctx.calculateSkillAttackDamage(skills['2343'],10,ctx.currentMonster,{preCastHp:6000,preCastMaxHp:10000,preCastSp:1000,preCastMaxSp:2000});assert(normal===19000,'gate normal '+normal);
ctx.player.activeBuffs['2348']={id:2348,name:'點穴－活',level:5,effects:{gentleTouchRevitalize:1},expiresAt:Date.now()+10000};
let revitalized=ctx.calculateSkillAttackDamage(skills['2343'],10,ctx.currentMonster,{preCastHp:6000,preCastMaxHp:10000,preCastSp:1000,preCastMaxSp:2000});assert(revitalized===22000,'gate revitalize '+revitalized);
ctx.player.activeBuffs['2329']={id:2329,name:'大纏崩墜',level:10,effects:{fallenEmpireCombo:1},expiresAt:Date.now()+10000};
let combo=ctx.calculateSkillAttackDamage(skills['2343'],10,ctx.currentMonster,{preCastHp:6000,preCastMaxHp:10000,preCastSp:1000,preCastMaxSp:2000});assert(combo===38800,'gate combo '+combo);
// Quiet damage and silence.
learn(2344,5);let quiet=ctx.calculateSkillAttackDamage(skills['2344'],5,ctx.currentMonster,{});assert(quiet===1160,'quiet ratio '+quiet);ctx.applyAttackRuntimeStatus(runtimeProfiles['2344'],5,ctx.currentMonster);assert(ctx.currentMonster.runtimeState.statuses.silence,'quiet silence');
// Cure self heal, sphere cost, and cleanse.
learn(2345,5);ctx.player.hp=5000;ctx.player.maxHp=10000;ctx.player.sp=5000;ctx.player.runtimeState.statuses={poison:{},stun:{},blind:{}};ctx.CombatResourceManager.configure('spiritSphere',{max:5,start:2,durationMs:600000});
assert(ctx.castHealSkill(skills['2345'],5),'cure cast');assert(ctx.player.hp===6100,'cure heal '+ctx.player.hp);assert(ctx.CombatResourceManager.get('spiritSphere')===1,'cure sphere');assert(!ctx.player.runtimeState.statuses.poison&&!ctx.player.runtimeState.statuses.stun&&!ctx.player.runtimeState.statuses.blind,'cure cleanse');
// Energy Gain, Change, Revitalize.
learn(2346,5);ctx.player.hp=10000;ctx.player.sp=5000;assert(ctx.castBuffSkill(skills['2346'],5),'energy cast');ctx.CombatResourceManager.configure('spiritSphere',{max:5,start:0,durationMs:600000});assert(ctx.tryGentleTouchEnergyGain('attack'),'energy proc');assert(ctx.CombatResourceManager.get('spiritSphere')===1,'energy sphere');
learn(2347,5);ctx.player.hp=10000;ctx.player.sp=5000;ctx.CombatResourceManager.configure('spiritSphere',{max:5,start:2,durationMs:600000});assert(ctx.castBuffSkill(skills['2347'],5),'change cast');let active=ctx.getActiveBuffBonusTotals();assert(active.physicalDamageRate===5&&active.atkFlat===40&&active.aspdRate===7,'change effects '+JSON.stringify(active));
learn(2348,5);ctx.player.sp=5000;assert(ctx.castBuffSkill(skills['2348'],5),'revitalize cast');active=ctx.getActiveBuffBonusTotals();assert(active.maxHpRate>=10&&active.hpRecoveryRate>=200&&active.defRate>=100&&active.gentleTouchRevitalize===1,'revitalize effects');
const remaining= pending.filter(x=>[269,1015,2333,2334,2335,2341,2343,2344,2345,2346,2347,2348].includes(Number(x.skillId))).map(x=>Number(x.skillId));assert(JSON.stringify(remaining)==='[]','remaining pending '+JSON.stringify(remaining));
console.log(JSON.stringify({result:'PASS',coverage:Object.keys(rtRows).length,pending:pending.length,passive,lightningChance:100,gate:{normal,revitalized,combo},quiet,cureHp:ctx.player.hp,energySpheres:ctx.CombatResourceManager.get('spiritSphere'),copyReady:copy.summary,remainingMonkSuraPending:remaining,logs:logs.slice(-10)},null,2));
