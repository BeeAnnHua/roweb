const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');const load=r=>JSON.parse(fs.readFileSync(path.join(root,r),'utf8'));
function assert(v,m){if(!v)throw new Error(m)}
const core=load('data/skills/skills_core_1.json'),rt=load('data/skill_runtime/runtime_core_1_v1.json'),gen=load('data/skill_runtime/runtime_generated_all.json'),pend=load('data/skill_runtime/runtime_pending_review.json');
const ids=[5358,5359,5360,5361,5362,5363,5364,6521];
assert(rt.version==='0.9.82CQ','runtime version');assert(gen.summary.officialRuntime===812,'official count');assert(gen.summary.pending===327,'pending count');assert(pend.skills.length===327,'pending length');
ids.forEach(id=>{assert(rt.skills[String(id)]?.executionEnabled===true,`runtime ${id}`);assert(!pend.skills.some(x=>Number(x.skillId)===id),`pending ${id}`)});
let now=100000;class FakeDate extends Date{static now(){return now}}const math=Object.create(Math);math.random=()=>0;
const primary={name:'一般目標',currentHp:999999999,maxHp:999999999,level:1,flee:0,res:200,mres:200,race:'DemiHuman',position:{x:32,y:0},runtimeState:{statuses:{}},stats:{agi:1,luk:1,int:1,vit:1}};
const nearby={name:'周圍目標',currentHp:999999999,maxHp:999999999,level:1,flee:0,res:200,mres:200,race:'Fish',position:{x:48,y:0},runtimeState:{statuses:{}},stats:{agi:1,luk:1,int:1,vit:1}};
const sandbox={console,window:{},document:{getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[]},setInterval:()=>0,clearInterval:()=>{},setTimeout:f=>{f();return 0},clearTimeout:()=>{},Date:FakeDate,Math:math};sandbox.window=sandbox;
sandbox.player={jobLevel:60,baseLevel:250,maxHp:10000,hp:10000,maxSp:100000,sp:100000,maxAp:200,ap:0,stats:{str:1,agi:1,vit:1,int:1,dex:120,luk:1,con:100,spl:80},traitStats:{con:100,spl:80},learnedSkills:{'5349':5,'5351':1},activeBuffs:{},equipment:{weapon:1},position:{x:0,y:0},jobKey:'troubadour'};
ids.forEach(id=>sandbox.player.learnedSkills[String(id)]=5);sandbox.player.learnedSkills['5351']=1;
sandbox.currentMonster=primary;sandbox.activeMonsters=[primary,nearby];sandbox.mapMonsters=[primary,nearby];sandbox.skillsData={skillIndex:{},runtimeProfiles:rt.skills};
[5349,5351,...ids].forEach(id=>sandbox.skillsData.skillIndex[String(id)]={...core.skills[String(id)],runtimeProfile:rt.skills[String(id)].runtimeProfile});
sandbox.getSkillLevel=id=>Number(sandbox.player.learnedSkills[String(id)]||0);sandbox.getSkillDataById=id=>sandbox.skillsData.skillIndex[String(id)]||null;
sandbox.getItemData=()=>({dbSubType:'instrument',weaponType:'instrument'});sandbox.getEquippedWeaponTypeRuntime=()=> 'instrument';
sandbox.calculateDerivedPlayerStats=()=>({stats:sandbox.player.stats,atk:100,matk:100,matkMin:100,matkMax:100,hit:999,cri:0,pAtk:15,sMatk:15});sandbox.getTrainingBonusTotals=()=>({});sandbox.getPassiveCombatModifierTotals=()=>({});
sandbox.addBattleLog=()=>{};sandbox.updateMonsterUI=()=>{};sandbox.updatePlayerUI=()=>{};sandbox.saveGame=()=>{};sandbox.recalculatePlayerStats=()=>{};sandbox.canAttackMonsterByRange=()=>true;sandbox.getSkillRangePx=()=>999;sandbox.RO_WEB_CELL_SIZE=32;sandbox.showDamageNumber=()=>{};sandbox.playMonsterHitAnimation=()=>{};sandbox.playROStudioPlayerMotion=()=>{};sandbox.stopAutoBattle=()=>{};sandbox.defeatMonster=()=>{};
let captured=[];sandbox.CombatDamagePipeline={resolvePhysicalSkill:(p,l,t,o)=>({damage:o.ratio}),resolveMagicSkill:(p,l,t,o)=>{captured.push({target:t.name,ratio:o.ratio});return {damage:o.ratio}}};
sandbox.HitResolver={resolve:()=>({hit:true})};sandbox.CriticalResolver={resolve:()=>({critical:false,multiplier:1})};sandbox.PerfectDodgeResolver={resolve:()=>({dodged:false})};sandbox.MultiHitResolver={normalize:(p,l)=>({damageHitCount:Number(p.damageHitCount||1),visualHitCount:Number(p.visualHitCount||1),statusProcMode:'once'}),split:d=>[d]};
sandbox.TargetingResolver={collect:(origin,cands,o)=>o.shape==='single'?[primary]:[primary,nearby]};sandbox.AreaShapeResolver={inRange:()=>true};
vm.createContext(sandbox);for(const f of ['js/combat_mechanics_runtime.js','js/skill_engine.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),sandbox);
// Self songs.
for(const id of [5361,5362,5364])assert(sandbox.castBuffSkill(sandbox.skillsData.skillIndex[String(id)],5,{silent:true}),`cast ${id}`);
let active=sandbox.getActiveBuffBonusTotals();assert(active.resFlat===30,`interlude RES ${active.resFlat}`);assert(active.sMatk===15,`serenade S.MATK ${active.sMatk}`);assert(active.walkSpeedRate===-25,`serenade speed ${active.walkSpeedRate}`);assert(active.pAtk===15,`march P.ATK ${active.pAtk}`);
// Enemy songs; immediate pulse is processed by normalization.
for(const id of [5358,5359,5360,5363])assert(sandbox.castBuffSkill(sandbox.skillsData.skillIndex[String(id)],5,{silent:true}),`cast ${id}`);
sandbox.normalizeActiveBuffs();
let deb=sandbox.getMonsterRuntimeBonuses(primary);assert(deb.mresFlat===-50,`nocturn MRES ${deb.mresFlat}`);assert(deb.resFlat===-50,`rhapsody RES ${deb.resFlat}`);assert(deb.hitFlat===-50,`misfortune HIT ${deb.hitFlat}`);assert(deb.outgoingPhysicalDamageRate===-25&&deb.outgoingMagicDamageRate===-25,'depression output');
assert(sandbox.StatusManager.has(primary,'confusion'),'confusion');assert(sandbox.StatusManager.has(primary,'curse'),'curse');
// Seven songs coexist and have independent upkeep.
const songs=[5358,5359,5360,5361,5362,5363,5364].map(id=>sandbox.player.activeBuffs[String(id)]);assert(songs.every(Boolean),'seven songs coexist');assert(songs.reduce((a,b)=>a+Number(b.sustainedSpCostPer5s||0),0)===78,'upkeep total');
// Rhythmical Wave with Stage Manner Lv5, SPL80, Base250 and Mystic Symphony.
assert(sandbox.castBuffSkill(sandbox.skillsData.skillIndex['5351'],1,{silent:true}),'Mystic cast');sandbox.player.ap=0;captured=[];primary.currentHp=nearby.currentHp=999999999;
assert(sandbox.castAttackSkill(sandbox.skillsData.skillIndex['6521'],5,{skipHitCheck:true,silent:true}),'Rhythmical Wave cast');assert(captured.length===2,'wave targets');assert(captured.every(x=>x.ratio===60562),`wave ratio ${JSON.stringify(captured)}`);assert(sandbox.player.ap===3,`wave AP ${sandbox.player.ap}`);
// Expiry removes enemy auras.
now+=301000;sandbox.normalizeActiveBuffs();deb=sandbox.getMonsterRuntimeBonuses(primary);assert(!sandbox.StatusManager.has(primary,'geffenia_nocturn')&&!sandbox.StatusManager.has(primary,'ain_rhapsody'),'auras cleared');assert(Number(deb.mresFlat||0)===0&&Number(deb.resFlat||0)===0,'flat debuffs cleared');
console.log(JSON.stringify({result:'PASS',version:'0.9.82CQ',official:812,pending:327,selfSongs:{res:active.resFlat,sMatk:active.sMatk,pAtk:active.pAtk,speed:active.walkSpeedRate},enemySongs:{mres:-50,res:-50,hit:-50,output:-25},upkeep:78,rhythmicalWave:60562,ap:3},null,2));
