const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..'),j=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const gen=j('data/skill_runtime/runtime_generated_all.json'),cfg=j('data/combat_runtime/virtual_summons.json');
assert.strictEqual(gen.skills['5301'].handler,'passive');
assert(!gen.skills['5301'].runtimeProfile.passiveBonuses);
for(const id of ['5302','5303','5304','5305'])assert.strictEqual(gen.skills[id].handler,'virtual_summon');
assert.strictEqual(cfg.summons.AbrMotherNet.supportAction,true);assert.strictEqual(cfg.summons.AbrInfinity.atkMaxFlat,2200);
const logs=[];const math=Object.create(Math);math.random=()=>0.5;
const player={atk:1000,sp:1000,hp:5000,maxHp:10000,maxSp:1000,activeBuffs:{},virtualSummonSettings:{assistEnabled:true}};
const monster={name:'測試波利',currentHp:100000};let activeProfile=gen.skills['5302'].runtimeProfile;
const ctx={console,Date,Math:math,setInterval:()=>1,clearInterval:()=>{},document:{getElementById:()=>null},player,currentMonster:monster,skillsData:{skillIndex:{}},
 loadJson:async()=>cfg,normalizeActiveBuffs:()=>{},getSkillLevel:id=>Number(id)===232?0:(Number(id)===5301?10:4),getSkillRuntimeProfile:()=>activeProfile,
 canCastSkill:(skill,lv)=>({ok:true,level:Number(lv||1),profile:activeProfile}),paySkillCost:(skill,lv)=>{const c=activeProfile.spCost||[0];player.sp-=Number(c[Math.max(0,Number(lv)-1)]??c[c.length-1]??0);},grantRuntimeApFromProfile:()=>0,
 calculateDerivedPlayerStats:()=>({atk:1000,maxHp:10000,maxSp:1000}),resolveRuntimeSkillTargets:(p,t)=>[t],
 RARenewalDamagePipeline:{finalModifiers:raw=>raw},playMonsterHitAnimation:()=>{},showDamageNumber:()=>{},addBattleLog:(t,type)=>logs.push([t,type]),updateMonsterUI:()=>{},updatePlayerUI:()=>{},saveGame:()=>{},recalculatePlayerStats:()=>{},window:null};
ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/virtual_summon.js'),'utf8'),ctx);
(async()=>{await ctx.loadVirtualSummonData();
 assert(ctx.castVirtualSummonSkill({id:5302,name:'ABR－決戰勇士'},4));assert.strictEqual(player.sp,940);let r=ctx.runVirtualSummonAssistTick(monster,{manual:true});assert.strictEqual(r.totalDamage,6970);
 activeProfile=gen.skills['5303'].runtimeProfile;assert(ctx.castVirtualSummonSkill({id:5303,name:'ABR－雙子加農砲'},4));r=ctx.runVirtualSummonAssistTick(monster,{manual:true});assert.strictEqual(r.totalDamage,6970);
 activeProfile=gen.skills['5304'].runtimeProfile;assert(ctx.castVirtualSummonSkill({id:5304,name:'ABR－天網聖母'},4));const beforeHp=player.hp,beforeSp=player.sp;r=ctx.runVirtualSummonAssistTick(null,{manual:true});assert(r.supported);assert.strictEqual(player.hp,beforeHp+600);assert.strictEqual(player.sp,beforeSp+20);const b=player.activeBuffs.virtual_summon_support_AbrMotherNet;assert.strictEqual(b.effects.defFlat,200);assert.strictEqual(b.effects.mdefFlat,40);
 activeProfile=gen.skills['5305'].runtimeProfile;assert(ctx.castVirtualSummonSkill({id:5305,name:'ABR－無限戰火'},4));r=ctx.runVirtualSummonAssistTick(monster,{manual:true});assert.strictEqual(r.totalDamage,8670);
 console.log(JSON.stringify({result:'PASS',battleDamage:6970,motherNetHpHeal:600,motherNetSpHeal:20,infinityDamage:8670,summons:Object.keys(cfg.summons).length},null,2));
})().catch(e=>{console.error(e);process.exit(1)});
