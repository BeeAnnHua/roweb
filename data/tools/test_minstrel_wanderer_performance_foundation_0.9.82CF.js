const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const loadJson=r=>JSON.parse(fs.readFileSync(path.join(root,r),'utf8'));
const core=loadJson('data/skills/skills_core_1.json'), rt=loadJson('data/skill_runtime/runtime_core_1_v1.json'), gen=loadJson('data/skill_runtime/runtime_generated_all.json'), pend=loadJson('data/skill_runtime/runtime_pending_review.json');
const ids=[2350,2351,2352,2381,2382,2383,2412];
function assert(v,m){if(!v)throw new Error(m)}
assert(gen.summary.version==='0.9.82CF','version'); assert(gen.summary.officialRuntime===748,'official'); assert(gen.summary.pending===391,'pending');
ids.forEach(id=>{assert(rt.skills[String(id)]?.executionEnabled===true,`runtime ${id}`);assert(gen.skills[String(id)]?.implementationMode==='official',`generated ${id}`);assert(!pend.skills.some(x=>Number(x.skillId)===id),`pending ${id}`)});
const sandbox={console,window:{},document:{getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[]},setInterval:()=>0,clearInterval:()=>{},setTimeout:(f)=>{f();return 0},clearTimeout:()=>{},Date,Math};sandbox.window=sandbox;
sandbox.player={jobLevel:70,baseLevel:200,maxHp:1000,hp:1000,maxSp:1000,sp:1000,stats:{str:1,agi:1,vit:1,int:120,dex:120,luk:1},learnedSkills:{'2412':10},activeBuffs:{},equipment:{weapon:1},jobKey:'minstrel'};
sandbox.skillsData={skillIndex:{},runtimeProfiles:rt.skills}; ids.forEach(id=>sandbox.skillsData.skillIndex[String(id)]={...core.skills[String(id)],runtimeProfile:rt.skills[String(id)].runtimeProfile});
sandbox.getSkillLevel=id=>Number(id)===2412?10:5; sandbox.getItemData=()=>({dbSubType:'instrument',weaponType:'instrument'}); sandbox.getEquippedWeaponTypeRuntime=()=> 'instrument'; sandbox.getSkillDataById=id=>sandbox.skillsData.skillIndex[String(id)];sandbox.getCurrentJobSkills=()=>Object.values(sandbox.skillsData.skillIndex); sandbox.getExtraSkillSkillList=()=>[]; sandbox.calculateDerivedPlayerStats=()=>({stats:sandbox.player.stats}); sandbox.addBattleLog=()=>{}; sandbox.paySkillCost=()=>{};sandbox.refreshPlayerStatus=()=>{};sandbox.renderPlayerStatus=()=>{};sandbox.saveGame=()=>{};sandbox.recalculatePlayerStats=()=>{};sandbox.updatePlayerUI=()=>{};
vm.createContext(sandbox); vm.runInContext(fs.readFileSync(path.join(root,'js/skill_engine.js'),'utf8'),sandbox);
function cast(id){const sk=sandbox.skillsData.skillIndex[String(id)]; sandbox.player.activeBuffs={}; const ok=sandbox.castBuffSkill(sk,5,{skipCost:true,silent:true}); assert(ok,`cast ${id}`); return sandbox.player.activeBuffs[String(id)]?.effects||sandbox.player.activeBuffs[id]?.effects||Object.values(sandbox.player.activeBuffs)[0]?.effects||{};}
let e=cast(2350); assert(e.aspdRate===25&&e.walkSpeedRate===-25,'swing');
e=cast(2351); assert(e.mdefRate===37&&e.elementResistHoly===15&&e.elementResistGhost===15,'symphony');
e=cast(2352); assert(e.matkFlat===43,'serenade');
e=cast(2381); assert(e.atkFlat===43&&e.walkSpeedRate===-25,'windmill');
e=cast(2382); assert(e.defFlat===57,'echo');
e=cast(2383); ['strFlat','agiFlat','vitFlat','intFlat','dexFlat','lukFlat'].forEach(k=>assert(e[k]===30,`harmonize ${k}`));
const passive=sandbox.getPassiveSkillBonusTotals(); assert(passive.maxSpFlat===300&&passive.spRecoveryFlat===33,'lesson passive');
console.log('PASS 0.9.82CF Minstrel/Wanderer performance foundation');
