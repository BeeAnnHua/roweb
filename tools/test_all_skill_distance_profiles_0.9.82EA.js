const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const read=r=>JSON.parse(fs.readFileSync(path.join(ROOT,r),'utf8'));
const skills={...read('data/skills/skills_core_1.json').skills,...read('data/skills/skills_core_2.json').skills};
const rangeConfig=read('data/skill_range_config.json');
const ctx={console,Math,Date,JSON,Number,String,Object,Array,Set,Map,Promise,performance:{now:()=>Date.now()},window:{},document:{getElementById:()=>null},
 player:{position:{x:0,y:0},equipment:{},stats:{},activeBuffs:{}},currentMonster:null,currentMap:null,
 getItemData:()=>null,getSkillLevel:()=>1,getPassiveSkillBonusTotals:()=>({}),recalculatePlayerStats:()=>{},addBattleLog:()=>{},saveGame:()=>{},updatePlayerUI:()=>{},requestAnimationFrame:fn=>fn(),matchMedia:()=>({matches:false})};
ctx.window=ctx;ctx.window.innerWidth=1280;ctx.window.innerHeight=720;
ctx.window.RO_WEB_DATA={'data/skill_range_config.json':rangeConfig,'data/weapon_types.json':{cellSizePx:36,types:{fist:{attackRangeCells:1}}}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(ROOT,'js/position_engine.js'),'utf8'),ctx,{filename:'js/position_engine.js'});
const errors=[];let levels=0,ground=0,aoe=0,negative=0,arrays=0,maxCast=0,maxRadius=0;
for(const [id,skill] of Object.entries(skills)){
  const max=Math.max(1,Number(skill.maxLevel||1));
  if(Number(skill.range)<0)negative++;
  if(Array.isArray(skill.range)||(skill.range&&typeof skill.range==='object'))arrays++;
  if(String(skill.targetType||'').toLowerCase().includes('ground'))ground++;
  for(let lv=1;lv<=max;lv++){
    levels++;
    const profile=ctx.getSkillDistanceProfile(skill,lv);
    const nums={castRangeCells:profile.castRangeCells,castRangePx:profile.castRangePx,effectRadiusCells:profile.effectRadiusCells,effectRadiusPx:profile.effectRadiusPx,effectDiameterCells:profile.effectDiameterCells};
    for(const [key,value] of Object.entries(nums))if(!Number.isFinite(value)||value<0)errors.push(`${id} Lv${lv}: ${key}=${value}`);
    if(profile.castRangePx!==profile.castRangeCells*36)errors.push(`${id} Lv${lv}: px mismatch`);
    if(profile.effectRadiusPx!==profile.effectRadiusCells*36)errors.push(`${id} Lv${lv}: radius px mismatch`);
    if(profile.effectDiameterCells!==profile.effectRadiusCells*2+1)errors.push(`${id} Lv${lv}: diameter mismatch`);
    maxCast=Math.max(maxCast,profile.castRangeCells);maxRadius=Math.max(maxRadius,profile.effectRadiusCells);
    if(profile.effectRadiusCells>0)aoe++;
  }
}
const quick=fs.readFileSync(path.join(ROOT,'js/quick_slots.js'),'utf8');
if(!quick.includes('quickSlotEnsureSkillTargetRange'))errors.push('central quick-slot range precheck missing');
if(!quick.includes('getSkillRangePx(skill, level)'))errors.push('quick-slot range does not pass skill level');
const battle=fs.readFileSync(path.join(ROOT,'js/battle.js'),'utf8');
if(!battle.includes('getSkillRangePx(autoAction.skill, autoAction.level)'))errors.push('auto battle does not use level-aware skill range');
const result={version:'0.9.82EA',cellSizePx:ctx.RO_WEB_CELL_SIZE,skills:Object.keys(skills).length,levels,groundTargetSkills:ground,aoeLevelProfiles:aoe,negativeRangeSkills:negative,levelArrayRangeSkills:arrays,maxResolvedCastRangeCells:maxCast,maxResolvedEffectRadiusCells:maxRadius,errors,summary:{status:errors.length?'FAIL':'PASS',errors:errors.length}};
fs.writeFileSync(path.join(ROOT,'tools/all_skill_distance_profile_audit_0.9.82EA.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));process.exit(errors.length?1:0);
