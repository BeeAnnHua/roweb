const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const core=JSON.parse(fs.readFileSync(path.join(root,'data/skills/skills_core_1.json'),'utf8')).skills;
const rows=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_core_1_v1.json'),'utf8')).skills;
const generated=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_generated_all.json'),'utf8')).skills;
const pending=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_pending_review.json'),'utf8')).skills;
const copyable=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_copyable_skills.json'),'utf8'));
const runtimeProfiles={};for(const [id,row] of Object.entries(rows))runtimeProfiles[id]=row.runtimeProfile||row;
const converted=[108, 228, 231, 232, 233, 234, 235, 236, 237, 238, 243, 244, 247, 446, 477, 479, 496, 497, 498, 2268, 2269, 2275, 2281, 2282, 2283, 2486, 2490, 2494, 2495, 2497, 5297, 5298, 5299, 5301, 5302, 5303, 5304, 5305, 5336, 5337, 5344, 5345, 5346, 5348];
function assert(c,m){if(!c)throw new Error(m);}
assert(Object.values(generated).filter(x=>x.implementationMode==='official'&&x.executionEnabled).length>=528,'official coverage must not regress');
assert(pending.length<=611,'pending count must not regress');
for(const id of converted){assert(runtimeProfiles[id]?.handler==='passive','runtime passive '+id);assert(core[id].skillType==='passive','core passive '+id);assert(!pending.some(x=>Number(x.skillId)===id),'still pending '+id);assert(!copyable.plagiarism.some(x=>Number(x.skillId)===id),'plagiarism '+id);assert(!copyable.reproduce.some(x=>Number(x.skillId)===id),'reproduce '+id);}
const learned={};for(const id of converted)learned[id]=Number(core[id].maxLevel||1);
const ctx={console,Date,Math,setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},window:null,player:{learnedSkills:learned,jobKey:'biolo',equipment:{}},skillsData:{runtimeProfiles,skillIndex:core},getSkillLevel:id=>Number(learned[id]||0),getCurrentJobSkills:()=>Object.values(core),getExtraSkillSkillList:()=>[],getSkillDataById:id=>core[String(id)]||null,isSkillBasic:()=>false,isPlayerMounted:()=>false,getEquippedWeaponTypeRuntime:()=> 'axe'};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/skill_engine.js'),'utf8'),ctx);
const totals=ctx.getPassiveSkillBonusTotals();
assert(totals.atkRate===286,'atkRate '+totals.atkRate);
assert(totals.matkRate===261,'matkRate '+totals.matkRate);
assert(totals.maxHpRate===179,'maxHpRate '+totals.maxHpRate);
assert(totals.maxSpRate===179,'maxSpRate '+totals.maxSpRate);
assert(runtimeProfiles['243'].futureSummonSystemHook?.family==='homunculus','homunculus hook');
assert(runtimeProfiles['5302'].futureSummonSystemHook?.family==='abr','abr hook');
assert(runtimeProfiles['5344'].futureSummonSystemHook?.family==='bionic','bionic hook');
console.log(JSON.stringify({result:'PASS',version:'0.9.82AP',official:528,pending:611,converted:converted.length,totals},null,2));
