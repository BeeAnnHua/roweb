const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const read=r=>JSON.parse(fs.readFileSync(path.join(ROOT,r),'utf8'));
const skills={...read('data/skills/skills_core_1.json').skills,...read('data/skills/skills_core_2.json').skills};
const runtime={};
for(const rel of ['data/skill_runtime/runtime_generated_all.json','data/skill_runtime/runtime_core_1_v1.json']){
  for(const [id,row] of Object.entries(read(rel).skills||{}))runtime[id]=row;
}
const ctx={console,Math,Date,JSON,Number,String,Object,Array,Set,Map,Promise,performance:{now:()=>Date.now()},window:{},document:undefined,
  player:{baseLevel:100,stats:{str:50,agi:90,vit:50,int:80,dex:100,luk:30},traitStats:{},aspd:193,sp:999999,hp:999999,maxHp:999999,zeny:999999,activeBuffs:{},runtimeState:{},skillTimingState:{},equipment:{}},
  skillsData:{runtimeProfiles:runtime,skillIndex:skills},getSkillLevel:()=>10,getActiveBuffBonusTotals:()=>({}),getPassiveSkillBonusTotals:()=>({}),getPassiveCombatModifierTotals:()=>({}),getTrainingBonusTotals:()=>({}),getItemData:()=>null,
  calculateDerivedPlayerStats:()=>({stats:{str:50,agi:90,vit:50,int:80,dex:100,luk:30},aspd:193}),recalculatePlayerStats:()=>{},addBattleLog:()=>{},saveGame:()=>{},updatePlayerUI:()=>{},setInterval:()=>1,clearInterval:()=>{},setTimeout:()=>1,clearTimeout:()=>{}};
ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT,'js/combat_mechanics_runtime.js'),'utf8'),ctx,{filename:'js/combat_mechanics_runtime.js'});
vm.runInContext(fs.readFileSync(path.join(ROOT,'js/battle.js'),'utf8'),ctx,{filename:'js/battle.js'});
vm.runInContext(fs.readFileSync(path.join(ROOT,'js/skill_engine.js'),'utf8'),ctx,{filename:'js/skill_engine.js'});
const attackHandlers=new Set(['physical_attack','physical_attack_size_hits','physical_attack_formula','physical_charge','warg_sensitive_keen']);
const errors=[],rows=[];
let flagged=0,implementedFlagged=0,implementedAttackFlagged=0,pendingFlagged=0,passiveFlagged=0,genericFallback=0,explicit=0;
for(const [id,skill] of Object.entries(skills)){
  if(skill?.damageFlags?.Critical!==true)continue;
  flagged++;
  const raw=runtime[id]||{},profile=raw.runtimeProfile||raw;
  const handler=String(profile.damageHandler||profile.handler||'');
  const pending=!handler||handler==='pending';
  const passive=handler==='passive';
  if(pending)pendingFlagged++;
  if(passive)passiveFlagged++;
  if(!pending)implementedFlagged++;
  const mode=ctx.getRuntimeSkillCriticalMode(skill,profile,{});
  const explicitMode=String(profile.criticalMode||'').toLowerCase();
  if(explicitMode)explicit++; else if(attackHandlers.has(handler))genericFallback++;
  if(attackHandlers.has(handler)&&!pending){
    implementedAttackFlagged++;
    if(Number(id)===5330){ if(mode!=='never')errors.push(`${id} Gale Storm must be never without Calamity Gale, got ${mode}`); }
    else if(!['normal','always'].includes(mode))errors.push(`${id} ${skill.name}: critical flag did not resolve to a usable mode (${mode})`);
  } else if((pending||passive)&&mode!=='never'&&Number(id)!==5330){
    errors.push(`${id} ${skill.name}: pending/passive skill resolved critical mode ${mode}`);
  }
  rows.push({id:Number(id),name:skill.name,handler,criticalMode:mode,explicitMode:explicitMode||null,pending,passive});
}
function expect(id,expected,buffs={}){
  const skill=skills[String(id)],raw=runtime[String(id)]||{},profile=raw.runtimeProfile||raw;
  const actual=ctx.getRuntimeSkillCriticalMode(skill,profile,buffs);
  if(actual!==expected)errors.push(`${id}: expected ${expected}, got ${actual}`);
}
expect(2002,'normal'); // Sonic Wave: imported RA DamageFlags.Critical fallback
expect(2307,'normal'); // Cannon Spear
expect(6503,'normal'); // Radiant Spear
expect(2312,'always'); // Pinpoint Attack
expect(5330,'never');
expect(5330,'normal',{calamityGale:1});
const nonCritical=ctx.getRuntimeSkillCriticalMode(skills['5'],runtime['5']?.runtimeProfile||runtime['5']||{},{});
if(nonCritical!=='never')errors.push(`non-critical Bash expected never, got ${nonCritical}`);

const critChanceNoCrate=ctx.CriticalResolver.describe(ctx.player,{stats:{luk:0}},{cri:25,crate:0});
const critChanceWithCrate=ctx.CriticalResolver.describe(ctx.player,{stats:{luk:0}},{cri:25,crate:36});
if(critChanceNoCrate.criticalChance!==critChanceWithCrate.criticalChance)errors.push('C.RATE must not change critical chance');
if(Math.abs(critChanceWithCrate.criticalDamageMultiplier-1.76)>1e-9)errors.push(`C.RATE 36 expected multiplier 1.76, got ${critChanceWithCrate.criticalDamageMultiplier}`);
if(ctx.RO_WEB_CRITICAL_AUTHORITY?.chanceStat!=='CRI'||ctx.RO_WEB_CRITICAL_AUTHORITY?.damageStat!=='C.RATE')errors.push('Critical authority metadata missing CRI/C.RATE split');

const result={version:'0.9.82ED',renewalOnly:true,counts:{flagged,implementedFlagged,implementedAttackFlagged,pendingFlagged,passiveFlagged,genericFallback,explicit},errors,rows,summary:{status:errors.length?'FAIL':'PASS',errors:errors.length}};
fs.writeFileSync(path.join(ROOT,'tools/ra_renewal_skill_critical_flags_audit_0.9.82ED.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({version:result.version,counts:result.counts,summary:result.summary},null,2));
process.exit(errors.length?1:0);
