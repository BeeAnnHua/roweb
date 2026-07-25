const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');const read=r=>JSON.parse(fs.readFileSync(path.join(ROOT,r),'utf8'));
const skills={...read('data/skills/skills_core_1.json').skills,...read('data/skills/skills_core_2.json').skills};
const runtime={};for(const rel of ['data/skill_runtime/runtime_generated_all.json','data/skill_runtime/runtime_core_1_v1.json'])for(const [id,row] of Object.entries(read(rel).skills))runtime[id]=row;
const ctx={console,Math,Date,JSON,Number,String,Object,Array,Set,Map,Promise,performance:{now:()=>Date.now()},window:{},document:undefined,player:{activeBuffs:{},runtimeState:{},skillTimingState:{}},skillsData:{runtimeProfiles:runtime,skillIndex:skills},getSkillLevel:()=>10,getActiveBuffBonusTotals:()=>({}),getPassiveSkillBonusTotals:()=>({}),setInterval:()=>1,clearInterval:()=>{},setTimeout:()=>1,clearTimeout:()=>{}};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(ROOT,'js/skill_engine.js'),'utf8'),ctx);
const assert=(c,m)=>{if(!c)throw new Error(m)};
let counts={pending:0,passive:0,attack:0,buff:0,heal:0,support:0},legacyDrift=0,activeEligible=0;
for(const [id,skill] of Object.entries(skills)){
 const type=ctx.getRuntimeSkillUiType(skill);counts[type]=(counts[type]||0)+1;
 const rp=runtime[id]?.runtimeProfile||runtime[id]||{};
 if(rp.handler && rp.handler!=='pending'){
  if(type!=='passive'){assert(ctx.isRuntimeSkillQuickSlotEligible(skill)===true,`${id} active skill not quick-slot eligible`);activeEligible++;}
  else assert(ctx.isRuntimeSkillQuickSlotEligible(skill)===false,`${id} passive skill quick-slot eligible`);
 }
 const legacy=String(skill.skillType||'').toLowerCase();if(type!=='pending'&&legacy!==type)legacyDrift++;
}
assert(counts.pending===311,`pending count ${counts.pending}`);
assert(counts.passive===216,`passive count ${counts.passive}`);
assert(activeEligible===612,`active eligible ${activeEligible}`);
assert(ctx.getRuntimeSkillUiType(skills['225'])==='support','Plagiarism selector must follow active Runtime handler');
assert(ctx.getRuntimeSkillUiType(skills['2285'])==='support','Reproduce selector must be active support UI');
assert(ctx.getRuntimeSkillUiType(skills['44'])==='passive','Vulture Eye must be runtime passive despite legacy support');
assert(ctx.getRuntimeSkillUiType(skills['11'])==='attack','Napalm Beat must be runtime attack despite legacy support');
console.log(JSON.stringify({version:'0.9.82DY',status:'PASS',counts,activeQuickSlotEligible:activeEligible,legacyTypeDrift:legacyDrift},null,2));
