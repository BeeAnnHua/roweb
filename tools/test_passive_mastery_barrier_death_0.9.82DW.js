const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const read=r=>JSON.parse(fs.readFileSync(path.join(ROOT,r),'utf8'));
const skills={...read('data/skills/skills_core_1.json').skills,...read('data/skills/skills_core_2.json').skills};
const runtime={};
for(const rel of ['data/skill_runtime/runtime_generated_all.json','data/skill_runtime/runtime_core_1_v1.json']){
 const rows=read(rel).skills||{}; for(const [id,row] of Object.entries(rows))runtime[id]=row;
}
const levels={248:10,5258:10,5259:10};
const items={
  sword:{id:'sword',slot:'weapon',category:'weapon',dbType:'Weapon',dbSubType:'sword',atk:100,weaponLevel:0},
  shield:{id:'shield',slot:'shield',category:'armor',def:50}
};
const logs=[];let timeoutCb=null,deadMotion=null,cleared=false;
const ctx={console,Math,Date,JSON,Number,String,Object,Array,Set,Map,Promise,
 performance:{now:()=>Date.now()},window:{},document:undefined,
 player:{baseLevel:100,jobLevel:50,jobKey:'imperial_guard',hp:1000,maxHp:1000,sp:1000,maxSp:1000,aspd:180,
  stats:{str:100,agi:1,vit:1,int:1,dex:1,luk:1},traitStats:{},learnedSkills:{248:10,5258:10,5259:10},activeBuffs:{},runtimeState:{},equipment:{weapon:'sword',shield:'shield'}},
 currentMonster:{name:'測試怪物'},skillsData:{runtimeProfiles:runtime,skillIndex:skills},
 getCurrentJobSkills:()=>[skills['248'],skills['5258'],skills['5259']],getExtraSkillSkillList:()=>[],
 getSkillLevel:id=>levels[Number(id)]||0,getItemData:id=>items[id]||null,
 getTrainingBonusTotals:()=>({}),getActiveBuffBonusTotals:()=>({}),
 jobStatBonuses:{imperial_guard:{bonusStats:[]},novice:{bonusStats:[]}},jobBasePoints:{imperial_guard:{baseHp:{100:1000},baseSp:{100:100}},novice:{baseHp:{100:1000},baseSp:{100:100}}},
 RA_WALK_SPEED:{DEFAULT:150},clampRaWalkSpeed:n=>n,
 recalculatePlayerStats:()=>{},addBattleLog:m=>logs.push(String(m)),saveGame:()=>{},updatePlayerUI:()=>{},updateMonsterUI:()=>{},stopAutoBattle:()=>{},
 playROStudioPlayerMotion:(m,o)=>{deadMotion={m,o};return true;},clearROStudioPlayerMotionOverride:()=>{cleared=true;},getROStudioMotionDuration:()=>480,
 setInterval:()=>1,clearInterval:()=>{},setTimeout:cb=>{timeoutCb=cb;return 1;},clearTimeout:()=>{},
};ctx.window=ctx;
vm.createContext(ctx);
for(const f of ['js/battle.js','js/skill_engine.js','js/status_system.js','js/combat_formula_runtime.js','js/ra_renewal_damage_pipeline.js']){
 vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),ctx,{filename:f});
}
// Browser UI helpers defined by battle.js are replaced with deterministic test doubles.
ctx.addBattleLog=m=>logs.push(String(m));ctx.updatePlayerUI=()=>{};ctx.updateMonsterUI=()=>{};ctx.saveGame=()=>{};ctx.stopAutoBattle=()=>{};
function assert(c,m){if(!c)throw new Error(m);}
// Passive requirement and stat aggregation.
let passive=ctx.getPassiveSkillBonusTotals();
assert(passive.maxHpFlat===2000,'Trust MaxHP passive missing');
assert(passive.holyResistRate===50,'Trust Holy resistance missing');
assert(passive.shieldAtkRate===30 && passive.shieldDefRate===20,'Shield Mastery missing with shield');
assert(passive.weaponAtkRate===20,'Spear/Sword Mastery missing with sword');
let derived=ctx.calculateDerivedPlayerStats();
const defWithShield=derived.def;
ctx.player.equipment.shield=null;
passive=ctx.getPassiveSkillBonusTotals();
assert(!passive.shieldAtkRate && !passive.shieldDefRate,'Shield Mastery must turn off without shield');
derived=ctx.calculateDerivedPlayerStats();
assert(defWithShield>derived.def,'Shield DEF bonus did not affect derived DEF');
ctx.player.equipment.shield='shield';
// Holy resistance goes through the shared incoming elemental modifier.
const holy=ctx.applyROCombatDamageModifiers(1000,{damageType:'magic',target:ctx.player,source:{},attackElement:'Holy',applyDefense:false,applyWeaponSize:false});
assert(holy===500,`Trust Holy resistance expected 500, got ${holy}`);
// Mastery damage rates are consumed by the RA physical pipeline.
let passiveDamage={};ctx.getPassiveSkillBonusTotals=()=>passiveDamage;
ctx.calculateDerivedPlayerStats=()=>({atk:226,pAtk:0,stats:{str:100,dex:1,luk:1}});
ctx.applyROCombatDamageModifiers=n=>n;ctx.getPassiveTargetDamageBonus=()=>0;ctx.getDualWieldHandRateTotals=()=>({active:false});
const normalBase=ctx.RARenewalDamagePipeline.resolveNormalAttack({}, {allowNormalProc:false,criticalResult:{critical:false,multiplier:1}}).raw;
passiveDamage={weaponAtkRate:20,shieldAtkRate:30};
let normal=ctx.RARenewalDamagePipeline.resolveNormalAttack({}, {allowNormalProc:false,criticalResult:{critical:false,multiplier:1}});
assert(normal.raw===Math.floor(normalBase*1.2),`Weapon mastery normal rate mismatch: base ${normalBase}, got ${normal.raw}`);
passiveDamage={weaponAtkRate:20};
const physicalBase=ctx.RARenewalDamagePipeline.resolvePhysicalSkill({ratio:100,requiresShield:true},1,{}, {criticalResult:{critical:false,multiplier:1}}).raw;
passiveDamage={weaponAtkRate:20,shieldAtkRate:30};
let shieldSkill=ctx.RARenewalDamagePipeline.resolvePhysicalSkill({ratio:100,requiresShield:true},1,{}, {criticalResult:{critical:false,multiplier:1}});
assert(shieldSkill.raw>physicalBase && shieldSkill.raw/physicalBase>1.24 && shieldSkill.raw/physicalBase<1.26,`Shield skill mastery rate mismatch: base ${physicalBase}, got ${shieldSkill.raw}`);
// Guardian Shield capacity and consumption.
ctx.player.activeBuffs={'5256':{name:'守護盾',effects:{shieldBarrierHp:500,shieldBarrierMaxHp:500}}};
let barrier=ctx.applyGuardianShieldBarrier(300);
assert(barrier.damage===0 && barrier.absorbed===300 && barrier.remaining===200,'Guardian Shield first hit incorrect');
barrier=ctx.applyGuardianShieldBarrier(350);
assert(barrier.damage===150 && barrier.absorbed===200 && !ctx.player.activeBuffs['5256'],'Guardian Shield depletion incorrect');
// Dead motion keeps HP at zero until the delayed recovery callback.
ctx.player.activeBuffs={};ctx.player.hp=0;ctx.currentMonster={name:'測試怪物'};
ctx.playerDead();
assert(ctx.player.hp===0,'Death recovered HP before animation completed');
assert(deadMotion?.m==='dead' && deadMotion?.o?.holdLast===true,'Dead motion/holdLast not requested');
assert(typeof timeoutCb==='function','Death recovery timer missing');
timeoutCb();
assert(ctx.player.hp===ctx.player.maxHp && cleared,'Death recovery did not clear held animation');
console.log(JSON.stringify({version:'0.9.82DW',status:'PASS',defWithShield,holyDamage:holy,normalBase,normalRaw:normal.raw,physicalBase,shieldSkillRaw:shieldSkill.raw,guardianBarrier:'PASS',deathHold:'PASS'},null,2));
