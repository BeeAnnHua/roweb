const fs = require('fs');
const vm = require('vm');
function assert(v, m) { if (!v) throw new Error(m); }
function eq(a, b, m) { if (a !== b) throw new Error(`${m}: expected ${b}, got ${a}`); }
const jobs = JSON.parse(fs.readFileSync('data/jobs.json', 'utf8'));
const traitData = JSON.parse(fs.readFileSync('data/trait_statpoints.json', 'utf8'));
const items = {
  100: { id:100, name:'測試武器', dbSubType:'Dagger', combatModifiers:{ raceDamage:{Demon:10}, sizeDamage:{Large:15}, critAtkRate:20, fixedCastReductionRate:15 } },
  200: { id:200, name:'測試鎧甲', effects:{ elementResist:{Fire:20} } },
  300: { id:300, name:'測試卡片', bonuses:{ raceDamage:{Demon:5}, variableCastReductionRate:20 } }
};
const ctx = {
  console, Math, Date, setTimeout, clearTimeout, requestAnimationFrame: fn => fn(),
  window:null,
  document:{ getElementById:()=>null, createElement:()=>({}), querySelectorAll:()=>[] },
  player:{
    baseLevel:200, jobLevel:1, jobKey:'dragon_knight',
    stats:{str:1,agi:1,vit:1,int:1,dex:1,luk:1},
    traits:{pow:0,sta:0,wis:0,spl:0,con:0,crt:0},
    equipment:{weapon:100,armor:200}, equipmentCards:{weapon:[300]}, activeBuffs:{},
    combatModifiers:{raceDamage:{Demon:3}}
  },
  getJobData:key=>jobs[key]||{tier:4,routeGroup:'fourth',raJob:'Novice'},
  getCurrentJobData:()=>({raJob:'Novice'}),
  getItemData:id=>items[id]||null,
  getTrainingBonusTotals:()=>({}),
  getPassiveSkillBonusTotals:()=>({}),
  getPassiveCombatModifierTotals:()=>({sizeDamage:{Small:5}}),
  getActiveBuffBonusTotals:()=>({physicalDamageRate:7}),
  isPlayerMounted:()=>false,
  RA_WALK_SPEED:{DEFAULT:150}, clampRaWalkSpeed:n=>n,
  recalculatePlayerStats:()=>{}, updatePlayerUI:()=>{}, saveGame:()=>{}, addBattleLog:()=>{}
};
ctx.window=ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('js/status_system.js','utf8'),ctx,{filename:'status_system.js'});
vm.runInContext(`
  statPointData = ${JSON.stringify(JSON.parse(fs.readFileSync('data/statpoints.json','utf8')))};
  traitPointData = ${JSON.stringify(traitData)};
  jobStatBonuses = {};
  jobBasePoints = {};
  renewalJobAspd = {jobs:{Novice:{Fist:40,Shield:10}}};
`,ctx);
ctx.normalizeStatusData();

// One global mode controls normal and Trait allocation.
eq(ctx.getStatusAllocationStep(),1,'Initial allocation step');
ctx.toggleStatusAllocationStep();
eq(ctx.getStatusAllocationStep(),10,'Global +10 mode');
eq(ctx.allocateStatusPoints('str',ctx.getStatusAllocationStep()),10,'Normal status uses global +10');
eq(ctx.player.stats.str,11,'Normal STR after +10');
eq(ctx.allocateTraitPoints('pow',ctx.getStatusAllocationStep()),7,'Trait +10 clamps to Lv200 seven-point budget');
eq(ctx.player.traits.pow,7,'Trait POW after clamp');

// Advanced totals must read character + equipment + socketed card + passive + Buff wrappers.
const demon = ctx.getAdvancedKeyedBreakdown('raceDamage','Demon');
eq(ctx.sumAdvancedBreakdown(demon),18,'Demon race damage total');
assert(demon.some(r=>r.label==='角色本體'&&r.value===3),'Character source detail');
assert(demon.some(r=>r.label==='測試武器'&&r.value===10),'Equipment source detail');
assert(demon.some(r=>r.label==='測試卡片'&&r.value===5),'Card source detail');
eq(ctx.sumAdvancedBreakdown(ctx.getAdvancedKeyedBreakdown('sizeDamage','Large')),15,'Large size damage');
eq(ctx.sumAdvancedBreakdown(ctx.getAdvancedKeyedBreakdown('sizeDamage','Small')),5,'Passive small size damage');
eq(ctx.sumAdvancedBreakdown(ctx.getAdvancedScalarBreakdown('critAtkRate',['criticalDamageRate'])),20,'Critical damage total');
eq(ctx.sumAdvancedBreakdown(ctx.getAdvancedScalarBreakdown('fixedCastReductionRate',['fixcastrate'])),15,'Fixed cast reduction source');
eq(ctx.sumAdvancedBreakdown(ctx.getAdvancedScalarBreakdown('variableCastReductionRate',['varcastrate'])),20,'Variable cast reduction source');
eq(ctx.sumAdvancedBreakdown(ctx.getAdvancedKeyedBreakdown('elementResist','Fire')),20,'Element resistance source');
eq(ctx.sumAdvancedBreakdown(ctx.getAdvancedScalarBreakdown('physicalDamageRate')),7,'Active Buff physical damage source');

const statusSource=fs.readFileSync('js/status_system.js','utf8');
const uiSource=statusSource.slice(statusSource.indexOf('function updateStatusUI()'),statusSource.indexOf('window.getTraitLevelPointsForLevel'));
for(const token of ['status-allocation-step-button','status-advanced-toggle','status-advanced-panel','傷害','詠唱／延遲','生存／耐性','體型傷害','種族傷害','固定詠唱減免','變動詠唱－綜合估算']) assert(statusSource.includes(token),`Missing UI token ${token}`);
assert(!statusSource.includes('className = "status-trait-plus-ten"'),'Old per-row +10 must not be constructed');
assert(!uiSource.includes('免費重置特性'),'Free reset must not be visible in updateStatusUI');
assert(statusSource.includes('sourceLabel.textContent = String(row.label)'),'Source names use textContent');
const css=fs.readFileSync('css/style.css','utf8');
for(const token of ['.status-allocation-step-button.active','.status-advanced-panel','.status-advanced-tabs','.status-advanced-source-list','.status-advanced-tab-note']) assert(css.includes(token),`Missing CSS ${token}`);
const policy=JSON.parse(fs.readFileSync('data/trait_combat_policy.json','utf8'));
eq(policy.version,'0.9.82EE','Policy version');
eq(policy.display.resetControlVisible,false,'Reset UI hidden policy');
assert(policy.display.damageCategories.includes('small/medium/large size'),'Size category policy');

console.log('PASS 0.9.82EE global +10 mode and advanced combat summary/source breakdown');
console.log(JSON.stringify({allocation:{normalAdded:10,traitAdded:7},totals:{demonRace:18,largeSize:15,smallSize:5,criticalDamage:20,fixedCast:15,variableCast:20,fireResist:20,buffPhysical:7},ui:{tabs:3,resetVisible:false,sourceBreakdown:true}},null,2));
