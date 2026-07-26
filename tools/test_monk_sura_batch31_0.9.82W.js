const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const skills=JSON.parse(fs.readFileSync(path.join(root,'data/skills/skills_core_1.json'),'utf8')).skills;
const rtRows=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_core_1_v1.json'),'utf8')).skills;
const runtimeProfiles={};for(const [id,row] of Object.entries(rtRows))runtimeProfiles[id]=row.runtimeProfile||row;
const logs=[];
const ctx={console,Date,Math,setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},window:null,
 player:{hp:10000,maxHp:10000,sp:5000,maxSp:5000,baseLevel:200,jobLevel:70,stats:{str:100,agi:90,dex:80,int:50,vit:80,luk:30},position:{x:0,y:0},activeBuffs:{},runtimeState:{},combatResources:{},learnedSkills:{}},
 currentMonster:{name:'測試怪',level:100,baseLevel:100,currentHp:1000000,maxHp:1000000,def:500,mdef:200,race:'DemiHuman',element:'Neutral',size:'Medium',position:{x:10,y:0},runtimeState:{statuses:{}}},
 activeMonsters:null,mapMonsters:null,skillsData:{runtimeProfiles},
 getSkillLevel:(id)=>Number(ctx.player.learnedSkills[id]||0),
 getSkillDataById:(id)=>skills[String(id)]||null,
 getCurrentJobSkills:()=>Object.values(skills),getExtraSkillSkillList:()=>[],isSkillBasic:()=>false,
 calculateDerivedPlayerStats:()=>({atk:500,matk:300,stats:{...ctx.player.stats}}),
 getItemData:()=>null,getSkillRangePx:()=>9999,canAttackMonsterByRange:()=>true,movePlayerTowardMonster:()=>{},movePlayerAdjacentToMonster:()=>true,
 updatePlayerUI:()=>{},updateMonsterUI:()=>{},saveGame:()=>{},recalculatePlayerStats:()=>{},renderPositionSprites:()=>{},addBattleLog:s=>logs.push(s),
 playROStudioPlayerMotion:()=>{},playPlayerAttackAnimation:()=>{},playMonsterHitAnimation:()=>{},showDamageNumber:()=>{},showSlashEffect:()=>{},defeatMonster:()=>{},
 MultiHitResolver:{normalize:(p,l)=>{const gv=(v)=>Array.isArray(v)?(v[l-1]??v[v.length-1]):v;let h=gv(p.damageHitCount??p.hitCount??1);if(typeof h!=='number')h=1;return {damageHitCount:Math.max(1,h),visualHitCount:Math.max(1,gv(p.visualHitCount??h)||h),statusProcMode:p.statusProcMode||'once'};},split:(d,h)=>{h=Math.max(1,h||1);const q=Math.floor(d/h),r=d-q*h;return Array.from({length:h},(_,i)=>q+(i<r?1:0));}},
 CombatDamagePipeline:{resolvePhysicalSkill:(p,l,t,o)=>({damage:Math.floor(o.ratio)}),resolveMagicSkill:(p,l,t,o)=>({damage:Math.floor(o.ratio)})},
 TargetingResolver:{collect:(origin,cands,opt)=>cands.filter(Boolean)},
 HitResolver:{resolve:()=>({hit:true})},CriticalResolver:{resolve:()=>({critical:false,multiplier:1})},PerfectDodgeResolver:{resolve:()=>({dodged:false})},
 MovementEffectResolver:{knockback:()=>true,backslide:()=>true,moveAdjacent:()=>true},
 StatusManager:{apply:(target,status,opt)=>{target.runtimeState=target.runtimeState||{};target.runtimeState.statuses=target.runtimeState.statuses||{};const key=String(status).toLowerCase().replace(/[ _-]/g,'');target.runtimeState.statuses[key]={status,effects:opt.effects||{},expiresAt:Date.now()+Number(opt.durationMs||0)};return {applied:true};}},
 RO_WEB_CELL_SIZE:32
};ctx.window=ctx;ctx.activeMonsters=[ctx.currentMonster];
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/combat_resource_manager.js'),'utf8'),ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/skill_engine.js'),'utf8'),ctx);
function learn(id,lv){ctx.player.learnedSkills[id]=lv;return skills[String(id)];}
function assert(c,m){if(!c)throw new Error(m);}
// Raising Dragon Lv10: 15 sphere max and immediate fill.
learn(2338,10);ctx.player.sp=5000;assert(ctx.castBuffSkill(skills['2338'],10),'raising cast');assert(ctx.CombatResourceManager.get('spiritSphere')===15,'raising should fill 15');assert(ctx.player.activeBuffs['2338'].effects.spiritSphereMaxBonus===10,'raising max bonus');
// Asura formula before paying cost, doubled above five spheres, then SP zero and spheres all consumed.
learn(271,5);ctx.player.sp=1000;ctx.currentMonster.currentHp=1000000;const asura=ctx.calculateSkillAttackDamage(skills['271'],5,ctx.currentMonster,{preCastSp:1000,preCastResource:15});assert(asura===21600,'asura ratio/double '+asura);assert(ctx.castAttackSkill(skills['271'],5,{skipHitCheck:true}),'asura cast');assert(ctx.player.sp===0,'asura SP zero');assert(ctx.CombatResourceManager.get('spiritSphere')===0,'asura consumes all under raising');
// Refill via Raising, assimilate all for 15% MaxSP.
ctx.player.sp=10;ctx.CombatResourceManager.configure('spiritSphere',{max:15,start:15,durationMs:600000});learn(2340,1);assert(ctx.castSpiritAssimilateSkill(skills['2340'],1),'assimilate cast');assert(ctx.player.sp===750,'assimilate 15 percent '+ctx.player.sp);assert(ctx.CombatResourceManager.get('spiritSphere')===0,'assimilate clear');
// Fallen Empire level-dependent cost (Lv6 costs one) and combo marker.
ctx.player.sp=5000;ctx.CombatResourceManager.configure('spiritSphere',{max:15,start:5,durationMs:600000});learn(2329,10);assert(ctx.castAttackSkill(skills['2329'],6,{skipHitCheck:true}),'fallen cast');assert(ctx.CombatResourceManager.get('spiritSphere')===4,'fallen Lv6 cost one');assert(ctx.getActiveBuffBonusTotals().fallenEmpireCombo===1,'fallen combo marker');
// Tiger Cannon normal/combo formula and percent costs.
learn(2330,10);ctx.player.maxHp=10000;ctx.player.hp=10000;ctx.player.maxSp=1000;ctx.player.sp=1000;ctx.currentMonster.level=100;ctx.currentMonster.baseLevel=100;
const tigerCombo=ctx.calculateSkillAttackDamage(skills['2330'],10,ctx.currentMonster,{});const tigerFlash=ctx.calculateSkillAttackDamage(skills['2330'],10,ctx.currentMonster,{fromFlashCombo:true});assert(tigerCombo>tigerFlash,'tiger combo should be stronger');
ctx.CombatResourceManager.configure('spiritSphere',{max:15,start:5,durationMs:600000});assert(ctx.castAttackSkill(skills['2330'],10,{skipHitCheck:true}),'tiger cast');assert(ctx.player.hp===7000,'tiger HP rate cost '+ctx.player.hp);assert(ctx.player.sp===775,'tiger fixed+rate SP cost '+ctx.player.sp);assert(!ctx.getActiveBuffBonusTotals().fallenEmpireCombo,'tiger consumes combo marker');
// Earth Shaker mark boosts Rampage.
learn(2328,5);ctx.currentMonster.runtimeState={statuses:{earthshaker:{expiresAt:Date.now()+5000,effects:{}}}};learn(2332,5);const marked=ctx.calculateSkillAttackDamage(skills['2332'],5,ctx.currentMonster,{});ctx.currentMonster.runtimeState={statuses:{}};const plain=ctx.calculateSkillAttackDamage(skills['2332'],5,ctx.currentMonster,{});assert(marked>plain,'rampage marked boost');
// Flash Combo consumes only its own sphere cost and resolves three stages.
learn(5009,5);learn(2326,10);ctx.player.sp=5000;ctx.player.maxSp=5000;ctx.player.maxHp=10000;ctx.player.hp=10000;ctx.currentMonster.currentHp=1000000;ctx.CombatResourceManager.configure('spiritSphere',{max:15,start:10,durationMs:600000});assert(ctx.castComboSequenceSkill(skills['5009'],5),'flash combo');assert(ctx.CombatResourceManager.get('spiritSphere')===7,'flash combo own cost only');assert(ctx.currentMonster.currentHp<1000000,'flash combo damage');
console.log(JSON.stringify({result:'PASS',coverage:Object.keys(rtRows).length,asura,tigerCombo,tigerFlash,rampageMarked:marked,rampagePlain:plain,copyPassiveRule:'validated in data audit',logs:logs.slice(-6)},null,2));
