const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..'),j=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const gen=j('data/skill_runtime/runtime_generated_all.json'),core=j('data/skills/skills_core_1.json'),cfg=j('data/combat_runtime/virtual_summons.json'),reg=j('data/skill_runtime/runtime_handler_registry.json');
assert.strictEqual(gen.version,'0.9.82CZ');
assert.strictEqual(gen.skills['232'].handler,'passive');
assert.deepStrictEqual(gen.skills['232'].runtimeProfile.summonDamageRate,[2,4,6,8,10]);
for(const id of ['233','2490'])assert.strictEqual(gen.skills[id].handler,'independent_summon');
for(const id of ['5298','5299'])assert.strictEqual(gen.skills[id].handler,'buff');
assert.deepStrictEqual(gen.skills['5298'].runtimeProfile.effects,{atkRate:5,matkRate:5});
assert.deepStrictEqual(gen.skills['5299'].runtimeProfile.effects,{defRate:5,mdefRate:5});
assert.strictEqual(gen.skills['5298'].runtimeProfile.exclusiveBuffGroup,'meister_device_mode');
assert.strictEqual(gen.skills['5299'].runtimeProfile.exclusiveBuffGroup,'meister_device_mode');
assert.strictEqual(reg.handlers.independent_summon.executor,'castIndependentSummonSkill');
assert(cfg.independentSummons.HellPlant&&cfg.independentSummons.MarineSphere);
const quick=fs.readFileSync(path.join(root,'js/quick_slots.js'),'utf8');assert(quick.includes('runtimeHandler === "independent_summon"'));

const logs=[];const math=Object.create(Math);math.random=()=>0.5;
const player={atk:1000,sp:1000,hp:5000,maxHp:10000,maxSp:1000,activeBuffs:{},virtualSummonSettings:{assistEnabled:true}};
const monster={name:'測試波利',currentHp:100000};let activeProfile=gen.skills['2490'].runtimeProfile;
const ctx={console,Date,Math:math,setInterval:()=>1,clearInterval:()=>{},document:{getElementById:()=>null},player,currentMonster:monster,skillsData:{skillIndex:{}},
 loadJson:async()=>cfg,normalizeActiveBuffs:()=>{},getLevelValue:(v,lv,f=0)=>Array.isArray(v)?(v[lv-1]??v[v.length-1]??f):(v??f),
 getSkillLevel:id=>Number(id)===232?5:(Number(id)===5301?10:5),getSkillRuntimeProfile:()=>activeProfile,
 canCastSkill:(skill,lv)=>({ok:true,level:Number(lv||1),profile:activeProfile}),paySkillCost:(skill,lv)=>{const c=skill.spCost||[0];player.sp-=Number(c[Math.max(0,Number(lv)-1)]??c[c.length-1]??0);},grantRuntimeApFromProfile:()=>0,
 calculateDerivedPlayerStats:()=>({atk:1000,maxHp:10000,maxSp:1000}),resolveRuntimeSkillTargets:(p,t)=>[t],
 RARenewalDamagePipeline:{finalModifiers:raw=>raw,resolveAttackElement:()=> 'Fire'},playMonsterHitAnimation:()=>{},showDamageNumber:()=>{},addBattleLog:(t,type)=>logs.push([t,type]),updateMonsterUI:()=>{},updatePlayerUI:()=>{},saveGame:()=>{},recalculatePlayerStats:()=>{},window:null};
ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/virtual_summon.js'),'utf8'),ctx);
(async()=>{await ctx.loadVirtualSummonData();
 const plantSkill=core.skills['2490'];activeProfile=gen.skills['2490'].runtimeProfile;assert(ctx.castIndependentSummonSkill(plantSkill,5));assert.strictEqual(player.sp,940);assert.strictEqual(ctx.getActiveIndependentSummons().length,1);
 let r=ctx.runIndependentSummonTick(monster,{manual:true});assert.strictEqual(r.totalDamage,6600);assert.strictEqual(monster.currentHp,93400);
 // Main ABR can coexist and also receives +10% summon mastery.
 activeProfile=gen.skills['5302'].runtimeProfile;assert(ctx.castVirtualSummonSkill({id:5302,name:'ABR－決戰勇士'},4,{skipCost:true}));assert(ctx.getActiveVirtualSummon());assert.strictEqual(ctx.getActiveIndependentSummons().length,1);
 r=ctx.runVirtualSummonAssistTick(monster,{manual:true});assert(r.totalDamage>=7667);assert.strictEqual(ctx.getSummonDamageMasteryRate(),10);
 // Marine Sphere coexists with both slots and detonates after its timer.
 activeProfile=gen.skills['233'].runtimeProfile;const sphereSkill=core.skills['233'];assert(ctx.castIndependentSummonSkill(sphereSkill,5));assert.strictEqual(player.sp,930);assert.strictEqual(ctx.getActiveIndependentSummons().length,2);
 const sphere=ctx.getActiveIndependentSummons().find(x=>x.type==='MarineSphere');sphere.buff.effects.detonateAt=Date.now()-1;const hpBefore=monster.currentHp;r=ctx.runIndependentSummonTick(monster);assert.strictEqual(hpBefore-monster.currentHp,4400);assert(!ctx.getActiveIndependentSummons().some(x=>x.type==='MarineSphere'));
 console.log(JSON.stringify({result:'PASS',plantDamageWithMastery:6600,marineSphereDamageWithMastery:4400,mainSummonCoexists:true,independentSummonTypes:Object.keys(cfg.independentSummons).length,homunculusFoundationCoexists:true},null,2));
})().catch(e=>{console.error(e);process.exit(1)});
