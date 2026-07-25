const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const read=r=>JSON.parse(fs.readFileSync(path.join(ROOT,r),'utf8'));
const skills={...read('data/skills/skills_core_1.json').skills,...read('data/skills/skills_core_2.json').skills};
const runtime={};for(const rel of ['data/skill_runtime/runtime_generated_all.json','data/skill_runtime/runtime_core_1_v1.json']){for(const [id,row] of Object.entries(read(rel).skills||{}))runtime[id]=row;}
const items={sword:{id:'sword',slot:'weapon',category:'weapon',dbType:'Weapon',dbSubType:'sword',atk:100,weaponLevel:0},shield:{id:'shield',slot:'shield',category:'armor',def:10}};
const ctx={console,Math,Date,JSON,Number,String,Object,Array,Set,Map,Promise,performance:{now:()=>Date.now()},window:{},document:undefined,
 player:{baseLevel:100,jobLevel:50,jobKey:'novice',hp:1000,maxHp:1000,sp:1000,maxSp:1000,aspd:180,stats:{str:100,agi:100,vit:100,int:100,dex:100,luk:100},traitStats:{},learnedSkills:{},activeBuffs:{},runtimeState:{statuses:{}},equipment:{weapon:'sword',shield:'shield'}},
 currentMonster:{name:'反射測試',currentHp:1000},skillsData:{runtimeProfiles:runtime,skillIndex:skills},getCurrentJobSkills:()=>[],getExtraSkillSkillList:()=>[],getSkillLevel:()=>0,getItemData:id=>items[id]||null,
 getTrainingBonusTotals:()=>({}),jobStatBonuses:{novice:{bonusStats:[]}},jobBasePoints:{novice:{baseHp:{100:1000},baseSp:{100:100}}},RA_WALK_SPEED:{DEFAULT:150},clampRaWalkSpeed:n=>n,
 addBattleLog:()=>{},updateMonsterUI:()=>{},showDamageNumber:()=>{},recalculatePlayerStats:()=>{},saveGame:()=>{},updatePlayerUI:()=>{},setInterval:()=>1,clearInterval:()=>{},setTimeout:()=>1,clearTimeout:()=>{}};ctx.window=ctx;
vm.createContext(ctx);
for(const f of ['js/battle.js','js/skill_engine.js','js/status_system.js','js/combat_mechanics_runtime.js','js/combat_formula_runtime.js','js/ra_renewal_damage_pipeline.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),ctx,{filename:f});
ctx.addBattleLog=()=>{};ctx.updateMonsterUI=()=>{};ctx.showDamageNumber=()=>{};
const future=Date.now()+60000;function buff(effects,name='測試'){return {name,effects,expiresAt:future};}function assert(c,m){if(!c)throw new Error(m);}
ctx.player.activeBuffs={a:buff({blockChance:36,parryChance:50,reflectPhysicalRate:40,finalDamageReductionRate:25,longRangeDamageReductionRate:80,moveSpeedPenaltyRate:20,autoGuardKnockback:true,statusImmune:true})};
let active=ctx.getActiveBuffBonusTotals();
assert(active.autoGuardBlockRate===36,'Auto Guard alias failed');assert(active.parryBlockRate===50,'Parry alias failed');assert(active.physicalReflectRate===40,'Reflect alias failed');assert(active.finalDamageReduction===25,'Final reduction alias failed');assert(active.longPhysicalDamageReductionRate===80,'Long reduction alias failed');assert(active.moveSpeedRate===-20,'Move penalty alias failed');assert(active.autoGuardKnockback===1 && active.statusImmune===1,'Boolean effects were not collected');
// Full Throttle allStatsRate must change all six stats.
ctx.player.activeBuffs={full:buff({allStatsRate:20})};
const total=ctx.getPlayerTotalBasicStats();for(const key of ['str','agi','vit','int','dex','luk'])assert(total[key]===120,`allStatsRate failed for ${key}: ${total[key]}`);
// Piety armor element override.
ctx.player.activeBuffs={piety:buff({armorElement:'Holy'})};
assert(ctx.CombatFormulaRuntime.getTargetProfile(ctx.player).element==='Holy','Armor element override failed');
// King's Grace status immunity.
ctx.player.activeBuffs={grace:buff({statusImmune:true})};
const status=ctx.StatusManager.apply(ctx.player,'stun',{chancePercent:100,durationMs:1000});assert(status.blocked===true && status.applied===false,'Status immunity failed');
// Holy Shield outgoing Holy damage bonus.
ctx.player.activeBuffs={holy:buff({holyDamageRate:25})};ctx.calculateDerivedPlayerStats=()=>({matk:100,matkMin:100,matkMax:100,stats:{int:100,dex:1,luk:1},sMatk:0});ctx.applyROCombatDamageModifiers=n=>n;
const holyDamage=ctx.RARenewalDamagePipeline.resolveMagicSkill({element:'Holy',elementSource:'skill',ratio:100},1,{}).raw;assert(holyDamage===125,`Holy damage rate expected 125, got ${holyDamage}`);
// Aura Blade mastery and Exceed Break next-hit consumption.
ctx.player.activeBuffs={aura:buff({masteryAtkFlat:100})};ctx.calculateDerivedPlayerStats=()=>({atk:226,pAtk:0,stats:{str:100,dex:1,luk:1}});ctx.getPassiveSkillBonusTotals=()=>({});ctx.getPassiveTargetDamageBonus=()=>0;ctx.getDualWieldHandRateTotals=()=>({active:false});
const auraRaw=ctx.RARenewalDamagePipeline.resolveNormalAttack({}, {allowNormalProc:false,criticalResult:{critical:false,multiplier:1}}).raw;
ctx.player.activeBuffs={};const baseRaw=ctx.RARenewalDamagePipeline.resolveNormalAttack({}, {allowNormalProc:false,criticalResult:{critical:false,multiplier:1}}).raw;assert(auraRaw-baseRaw===100,`Aura Blade expected +100, base ${baseRaw}, aura ${auraRaw}`);
ctx.player.activeBuffs={exceed:buff({nextPhysicalAttackRate:300},'突破極限')};const rate=ctx.consumeNextPhysicalAttackMultiplier();assert(rate===300 && !ctx.player.activeBuffs.exceed,'Next physical multiplier did not consume');
// Persistent physical reflect.
ctx.player.activeBuffs={reflect:buff({reflectPhysicalRate:40})};ctx.currentMonster={name:'反射測試',currentHp:1000};const reflected=ctx.applyActivePhysicalReflect(ctx.currentMonster,250);assert(reflected===100 && ctx.currentMonster.currentHp===900,'Physical reflect failed');
console.log(JSON.stringify({version:'0.9.82DW',status:'PASS',aliases:'PASS',allStats:total,armorElement:'Holy',statusImmune:'PASS',holyDamage,auraBonus:auraRaw-baseRaw,nextPhysicalRate:rate,reflected},null,2));
