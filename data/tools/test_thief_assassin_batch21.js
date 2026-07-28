const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.resolve(__dirname, '..');
function load(rel){ vm.runInThisContext(fs.readFileSync(path.join(root, rel), 'utf8'), {filename: rel}); }
function assert(cond,msg){ if(!cond) throw new Error(msg); }

global.window = global;
global.setInterval = () => 1;
global.clearInterval = () => {};
global.RO_WEB_CELL_SIZE = 32;
global.player = {
  baseLevel: 100,
  stats: {str:50,dex:40,int:40,luk:10},
  equipment: {weapon:1,leftWeapon:2},
  position: {x:100,y:100,targetX:null,targetY:null},
  activeBuffs: {}
};
const items = {
  1:{id:1,weaponType:'dagger',atk:100,weaponLevel:4,refine:0,element:'Neutral'},
  2:{id:2,weaponType:'dagger',atk:80,weaponLevel:4,refine:0,element:'Neutral'}
};
global.getItemData = id => items[id] || null;
global.calculateDerivedPlayerStats = () => ({atk:420,matk:200,matkMin:180,matkMax:220,hit:200,flee:100,crit:0,stats:player.stats});
global.applyROCombatDamageModifiers = n => Math.floor(n);
global.getActiveBuffBonusTotals = () => ({});
global.getPassiveTargetDamageBonus = () => 0;
global.getTrainingBonusTotals = () => ({});
global.getPassiveSkillBonusTotals = () => ({});
global.getDualWieldHandRateTotals = () => ({active:true,right:100,left:100});
let special = {};
global.getActiveBuffSpecialValue = (key,fallback) => special[key] ?? fallback;

load('js/combat_mechanics_runtime.js');
load('js/ra_renewal_damage_pipeline.js');

// Hit multiplier and target.position area compatibility.
const chanceBase = HitResolver.chance({hit:100},{flee:100},{baseRate:80,minimumRate:0,maximumRate:100});
const chanceBoost = HitResolver.chance({hit:100},{flee:100},{baseRate:80,minimumRate:0,maximumRate:100,hitRateMultiplier:1.9});
assert(chanceBase === 80, 'base hit chance mismatch');
assert(chanceBoost === 100, 'Sonic Acceleration hit multiplier/clamp mismatch');
assert(AreaShapeResolver.inRange({x:100,y:100},{position:{x:120,y:100}},'circle',1), 'position-backed target not found by area resolver');

// Back Slide: move away from target by 5 cells, no wall collision.
MovementEffectResolver.backslide(player,5,{position:{x:132,y:100}});
assert(Math.round(player.position.x) === -60 && Math.round(player.position.y) === 100, 'Back Slide distance/direction mismatch');
player.position.x=100; player.position.y=100;

const target = {currentHp:10000,maxHp:10000,race:'DemiHuman',size:'Medium',element:'Neutral',def:0,mdef:0};
const originalRandom = Math.random;
Math.random = () => 0.5;

// Dual-wield parts must exist.
special = {};
let normal = RARenewalDamagePipeline.resolvePhysicalSkill({elementSource:'weapon'},1,target,{ratio:100,criticalResult:{critical:false,multiplier:1}});
assert(normal.parts.right && normal.parts.left, 'dual-wield hand parts missing');
const noEdp = normal.damage;

// EDP multiplies Weapon/Equipment ATK and adds Poison sub-element damage.
special = {edpWeaponAtkMultiplierPercent:400,subElement:'Poison',subElementDamageRate:25};
let edp = RARenewalDamagePipeline.resolvePhysicalSkill({elementSource:'weapon'},1,target,{ratio:100,criticalResult:{critical:false,multiplier:1}});
assert(edp.damage > noEdp, 'EDP did not increase physical damage');
assert(edp.subElementDamage > 0, 'EDP Poison sub-element damage missing');
let formerlyExcluded = RARenewalDamagePipeline.resolvePhysicalSkill({elementSource:'weapon',ignoreEdp:true},1,target,{ratio:100,criticalResult:{critical:false,multiplier:1}});
assert(formerlyExcluded.subElementDamage > 0, 'RO_WEB rule requires EDP on every physical skill');
assert(formerlyExcluded.parts.right.edpMultiplier === 400, 'RO_WEB rule must ignore legacy EDP exclusion flags');

Math.random = originalRandom;

// Load SkillEngine to test named formula branches against RA-derived ratios.
global.currentMonster = target;
global.getSkillLevel = () => 10;
global.getCurrentJobSkills = () => [];
global.getCurrentWeaponType = () => 'katar';
global.isPlayerMounted = () => false;
global.CombatDamagePipeline = {
  resolvePhysicalSkill(profile,level,t,opt){ return {damage:opt.ratio}; },
  resolveMagicSkill(profile,level,t,opt){ return {damage:opt.ratio * (opt.hits||1)}; },
  resolveMiscSkill(profile,level,t,opt){ return {damage:opt.rawDamage||profile.fixedDamage||0}; }
};
global.skillsData = {runtimeProfiles:{}};
load('js/skill_engine.js');

global.getPassiveSkillBonusTotals = () => ({sonicBlowDamageRate:90,sonicBlowHitRateMultiplier:1.9});
const sonicSkill={id:136,maxLevel:10}; skillsData.runtimeProfiles['136']={handler:'physical_attack_formula',formula:'renewal_sonic_blow',damageHitCount:1};
target.currentHp=4000; target.maxHp=10000;
const sonic=calculateSkillAttackDamage(sonicSkill,10,target,{});
assert(sonic===3420, `Sonic Blow ratio expected 3420, got ${sonic}`);
const soulSkill={id:379,maxLevel:10}; skillsData.runtimeProfiles['379']={handler:'physical_attack_formula',formula:'renewal_soul_destroyer',damageHitCount:1};
const soul=calculateSkillAttackDamage(soulSkill,10,target,{});
assert(soul===1590, `Soul Destroyer ratio expected 1590, got ${soul}`);
const meteorSkill={id:406,maxLevel:10}; skillsData.runtimeProfiles['406']={handler:'physical_attack_formula',formula:'renewal_meteor_assault',damageHitCount:1};
const meteor=calculateSkillAttackDamage(meteorSkill,10,target,{});
assert(meteor===1400, `Meteor Assault ratio expected 1400, got ${meteor}`);

console.log(JSON.stringify({result:'PASS',chanceBase,chanceBoost,noEdp,edp:edp.damage,edpSub:edp.subElementDamage,sonic,soul,meteor},null,2));
