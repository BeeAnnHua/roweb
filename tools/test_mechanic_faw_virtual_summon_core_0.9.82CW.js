const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..'),j=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const gen=j('data/skill_runtime/runtime_generated_all.json'),cfg=j('data/combat_runtime/virtual_summons.json');
assert.strictEqual(gen.skills['2281'].handler,'virtual_summon');
assert.strictEqual(gen.skills['2282'].handler,'virtual_summon');
assert.strictEqual(gen.skills['2283'].handler,'virtual_summon_dismiss');
assert.strictEqual(cfg.summons.SilverSniper.family,'faw');
assert.strictEqual(cfg.summons.MagicDecoy.selectBestElement,true);
assert.deepStrictEqual(cfg.summons.MagicDecoy.elementOptions,['Fire','Water','Wind','Earth']);
const logs=[]; const math=Object.create(Math); math.random=()=>0.5;
const player={atk:1000,matk:900,sp:1000,activeBuffs:{},virtualSummonSettings:{assistEnabled:true}};
const monster={name:'測試波利',currentHp:50000};
let activeProfile=gen.skills['2281'].runtimeProfile;
const ctx={console,Date,Math:math,setInterval:()=>1,clearInterval:()=>{},document:{getElementById:()=>null},player,currentMonster:monster,skillsData:{skillIndex:{}},
 loadJson:async()=>cfg,normalizeActiveBuffs:()=>{},getSkillLevel:id=>Number(id)===232?0:(Number(id)===5337?10:5),getSkillRuntimeProfile:()=>activeProfile,
 canCastSkill:(skill,lv)=>({ok:true,level:Number(lv||1),profile:activeProfile}),paySkillCost:(skill,lv)=>{const costs=activeProfile.spCost||[0];player.sp-=Number(costs[Math.max(0,Number(lv)-1)]??costs[costs.length-1]??0);},grantRuntimeApFromProfile:()=>0,
 calculateDerivedPlayerStats:()=>({atk:1000,matk:900}),resolveRuntimeSkillTargets:(p,t)=>[t],
 RARenewalDamagePipeline:{finalModifiers:(raw,target,opt)=>raw*({Fire:1,Water:2,Wind:1.5,Earth:.5,Neutral:1}[opt.element]||1)},
 playMonsterHitAnimation:()=>{},showDamageNumber:()=>{},addBattleLog:(t,type)=>logs.push([t,type]),updateMonsterUI:()=>{},updatePlayerUI:()=>{},saveGame:()=>{},recalculatePlayerStats:()=>{},window:null};
ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/virtual_summon.js'),'utf8'),ctx);
(async()=>{
 await ctx.loadVirtualSummonData();
 assert(ctx.castVirtualSummonSkill({id:2281,name:'FAW銀光狙擊手'},5));
 assert.strictEqual(player.sp,955);assert.strictEqual(ctx.getActiveVirtualSummon().type,'SilverSniper');
 const sniper=ctx.runVirtualSummonAssistTick(monster,{manual:true});assert.strictEqual(sniper.totalDamage,1286);assert.strictEqual(sniper.actionName,'銀光射擊');
 activeProfile=gen.skills['2282'].runtimeProfile;
 assert(ctx.castVirtualSummonSkill({id:2282,name:'FAW魔法傀儡'},5));
 assert.strictEqual(player.sp,895);assert.strictEqual(ctx.getActiveVirtualSummon().type,'MagicDecoy');
 const decoy=ctx.runVirtualSummonAssistTick(monster,{manual:true});assert.strictEqual(decoy.totalDamage,1000);assert(decoy.actionName.includes('水屬性'));
 activeProfile=gen.skills['2283'].runtimeProfile;
 assert(ctx.castVirtualSummonDismissSkill({id:2283,name:'FAW解體'},1));assert.strictEqual(player.sp,880);assert.strictEqual(ctx.getActiveVirtualSummon(),null);
 player.activeBuffs={'5344':{id:5344,level:5,expiresAt:Date.now()+60000,effects:{virtualSummonType:'WoodenWarrior',virtualSummonFamily:'bionic',virtualSummonLevel:5}}};
 const before=player.sp;assert.strictEqual(ctx.castVirtualSummonDismissSkill({id:2283,name:'FAW解體'},1),false);assert.strictEqual(player.sp,before);assert(ctx.getActiveVirtualSummon());
 console.log(JSON.stringify({result:'PASS',sniperDamage:sniper.totalDamage,decoyDamage:decoy.totalDamage,decoyAction:decoy.actionName,dismissFamilySafe:true,summons:Object.keys(cfg.summons).length},null,2));
})().catch(e=>{console.error(e);process.exit(1)});
