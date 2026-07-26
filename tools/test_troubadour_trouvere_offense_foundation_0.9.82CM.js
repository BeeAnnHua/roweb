const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');const load=r=>JSON.parse(fs.readFileSync(path.join(root,r),'utf8'));
function assert(v,m){if(!v)throw new Error(m)}
const core=load('data/skills/skills_core_1.json'),rt=load('data/skill_runtime/runtime_core_1_v1.json'),gen=load('data/skill_runtime/runtime_generated_all.json'),pend=load('data/skill_runtime/runtime_pending_review.json');
const ids=[5349,5350,5351,5352,5353,5355,5356,5357];
assert(rt.version==='0.9.82CM','runtime version');assert(gen.summary.officialRuntime===790,'official count');assert(gen.summary.pending===349,'pending count');assert(pend.skills.length===349,'pending length');
ids.forEach(id=>{assert(rt.skills[String(id)]?.executionEnabled===true,`runtime ${id}`);assert(!pend.skills.some(x=>Number(x.skillId)===id),`pending ${id}`)});
let now=100000;class FakeDate extends Date{static now(){return now}}const math=Object.create(Math);math.random=()=>0;
const primary={name:'人型主要目標',currentHp:999999999,maxHp:999999999,level:100,flee:0,race:'DemiHuman',position:{x:32,y:0},runtimeState:{statuses:{}},stats:{agi:1,luk:1}};
const nearby={name:'魚貝周圍目標',currentHp:999999999,maxHp:999999999,level:100,flee:0,race:'Fish',position:{x:48,y:0},runtimeState:{statuses:{}},stats:{agi:1,luk:1}};
const sandbox={console,window:{},document:{getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[]},setInterval:()=>0,clearInterval:()=>{},setTimeout:f=>{f();return 0},clearTimeout:()=>{},Date:FakeDate,Math:math};sandbox.window=sandbox;
sandbox.player={jobLevel:60,baseLevel:250,maxHp:10000,hp:10000,maxSp:10000,sp:10000,maxAp:200,ap:0,stats:{str:1,agi:1,vit:1,int:1,dex:120,luk:1,con:100,spl:80},traitStats:{con:100,spl:80},learnedSkills:{'5349':5,'5350':1,'5351':1,'5352':1,'5353':5,'5355':5,'5356':5,'5357':5},activeBuffs:{},equipment:{weapon:1},position:{x:0,y:0},jobKey:'troubadour'};
sandbox.currentMonster=primary;sandbox.activeMonsters=[primary,nearby];sandbox.skillsData={skillIndex:{},runtimeProfiles:rt.skills};
ids.forEach(id=>sandbox.skillsData.skillIndex[String(id)]={...core.skills[String(id)],runtimeProfile:rt.skills[String(id)].runtimeProfile});
const dummy={id:9999,officialId:9999,name:'測試四轉歌曲',maxLevel:1,skillType:'buff',runtimeProfile:{handler:'buff',fourthPerformanceSong:true,duration:60000,spCost:100,apGainMetadata:2,effects:{testFourthSong:1}}};
sandbox.skillsData.skillIndex['9999']=dummy;sandbox.skillsData.runtimeProfiles['9999']={skillId:9999,handler:'buff',executionEnabled:true,runtimeProfile:dummy.runtimeProfile};sandbox.player.learnedSkills['9999']=1;
sandbox.getSkillLevel=id=>Number(sandbox.player.learnedSkills[String(id)]||0);sandbox.getSkillDataById=id=>sandbox.skillsData.skillIndex[String(id)]||null;
sandbox.getItemData=()=>({dbSubType:'instrument',weaponType:'instrument'});sandbox.getEquippedWeaponTypeRuntime=()=> 'instrument';
sandbox.calculateDerivedPlayerStats=()=>({stats:sandbox.player.stats,atk:100,matk:100,matkMin:100,matkMax:100,hit:999,cri:0,pAtk:15,sMatk:15});sandbox.getTrainingBonusTotals=()=>({});sandbox.getPassiveCombatModifierTotals=()=>({});
sandbox.addBattleLog=()=>{};sandbox.updateMonsterUI=()=>{};sandbox.updatePlayerUI=()=>{};sandbox.saveGame=()=>{};sandbox.recalculatePlayerStats=()=>{};sandbox.canAttackMonsterByRange=()=>true;sandbox.getSkillRangePx=()=>999;sandbox.RO_WEB_CELL_SIZE=32;sandbox.showDamageNumber=()=>{};sandbox.playMonsterHitAnimation=()=>{};sandbox.playROStudioPlayerMotion=()=>{};sandbox.stopAutoBattle=()=>{};sandbox.defeatMonster=()=>{};
let captured=[];sandbox.CombatDamagePipeline={resolvePhysicalSkill:(p,l,t,o)=>{captured.push({kind:'p',target:t.name,ratio:o.ratio});return {damage:o.ratio}},resolveMagicSkill:(p,l,t,o)=>{captured.push({kind:'m',target:t.name,ratio:o.ratio});return {damage:o.ratio}}};
sandbox.HitResolver={resolve:()=>({hit:true})};sandbox.CriticalResolver={resolve:()=>({critical:false,multiplier:1})};sandbox.PerfectDodgeResolver={resolve:()=>({dodged:false})};sandbox.MultiHitResolver={normalize:(p,l)=>({damageHitCount:Number(p.damageHitCount||1),visualHitCount:Number(p.visualHitCount||1),statusProcMode:'once'}),split:d=>[d]};
sandbox.TargetingResolver={collect:(origin,cands,o)=>o.shape==='single'?[primary]:[primary,nearby]};sandbox.AreaShapeResolver={inRange:()=>true};
vm.createContext(sandbox);for(const f of ['js/combat_mechanics_runtime.js','js/skill_engine.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),sandbox);
// Stage Manner passive.
const passive=sandbox.getPassiveSkillBonusTotals();assert(passive.pAtk===15,'Stage Manner P.ATK');assert(passive.sMatk===15,'Stage Manner S.MATK');
// Kvasir and Mystic buffs.
assert(sandbox.castBuffSkill(sandbox.skillsData.skillIndex['5352'],1),'Kvasir cast');assert(sandbox.player.activeBuffs['5352'].effects.kvasirSonata===1,'Kvasir flag');
assert(sandbox.castBuffSkill(sandbox.skillsData.skillIndex['5351'],1),'Mystic cast');assert(sandbox.player.activeBuffs['5351'].effects.mysticSymphony===1,'Mystic flag');
// Sound Blend: 7500 ratio with Mystic + DemiHuman, AP base2 + Stage Manner50%=3.
sandbox.player.ap=0;captured=[];primary.currentHp=999999999;assert(sandbox.castAttackSkill(sandbox.skillsData.skillIndex['5357'],5,{skipHitCheck:true}),'Sound Blend cast');assert(captured.at(-1).ratio===7500,'Sound Blend ratio');assert(sandbox.StatusManager.has(primary,'soundblend'),'Sound Blend status');assert(sandbox.player.ap===3,'Sound Blend AP');
// Rhythm: 51000 with Sound Blend + Mystic + race, AP +3.
captured=[];primary.currentHp=999999999;assert(sandbox.castAttackSkill(sandbox.skillsData.skillIndex['5355'],5,{skipHitCheck:true}),'Rhythm cast');assert(captured.at(-1).ratio===51000,'Rhythm ratio');assert(sandbox.player.ap===6,'Rhythm AP');
// Metallic Fury: 60125 per target from local RA formula; Mystic does not alter it, AP +3 once.
captured=[];primary.currentHp=nearby.currentHp=999999999;assert(sandbox.castAttackSkill(sandbox.skillsData.skillIndex['5356'],5,{skipHitCheck:true}),'Metallic cast');assert(captured.length===2&&captured.find(x=>x.target===primary.name)?.ratio===60125&&captured.find(x=>x.target===nearby.name)?.ratio===48125,'Metallic ratios');assert(sandbox.StatusManager.has(primary,'soundblend'),'Metallic preserves Sound Blend');assert(sandbox.player.ap===9,'Metallic AP');
// Rose Blossom: primary initial + bloom 202875; nearby bloom 116625. Consumes primary Sound Blend. AP +4.
captured=[];primary.currentHp=nearby.currentHp=999999999;assert(sandbox.castAttackSkill(sandbox.skillsData.skillIndex['5353'],5,{skipHitCheck:true}),'Rose cast');
const pr=captured.filter(x=>x.target===primary.name).reduce((a,x)=>a+x.ratio,0), nr=captured.filter(x=>x.target===nearby.name).reduce((a,x)=>a+x.ratio,0);assert(pr===202875,`Rose primary ${pr}`);assert(nr===109125,`Rose nearby ${nr}`);assert(!sandbox.StatusManager.has(primary,'soundblend'),'Rose consumes primary blend');assert(sandbox.player.ap===13,'Rose AP');
// Retrospection future-ready replay: skill cost1 + 70% of 100, AP 2 +50%=3.
sandbox.player.lastFourthPerformanceSkillId=9999;sandbox.player.lastFourthPerformanceSkillLevel=1;const spBefore=sandbox.player.sp,apBefore=sandbox.player.ap;
assert(sandbox.castBuffSkill(sandbox.skillsData.skillIndex['5350'],1),'Retrospection replay');assert(sandbox.player.sp===spBefore-71,'Retrospection SP');assert(sandbox.player.activeBuffs['9999'].effects.testFourthSong===1,'Retrospection song');assert(sandbox.player.ap===apBefore+3,'Retrospection AP');
console.log(JSON.stringify({result:'PASS',version:'0.9.82CM',official:790,pending:349,stageManner:passive,soundBlend:7500,rhythm:51000,metallicPrimary:60125,metallicSplash:48125,rosePrimary:pr,roseSplash:nr,ap:sandbox.player.ap},null,2));
