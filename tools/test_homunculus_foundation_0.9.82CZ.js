const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..'),j=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const gen=j('data/skill_runtime/runtime_generated_all.json');
const core=j('data/skills/skills_core_1.json');
const hom=j('data/homunculus/homunculi.json');
const homSkills=j('data/homunculus/homunculus_skills.json');
const pending=j('data/skill_runtime/runtime_pending_review.json');
const reg=j('data/skill_runtime/runtime_handler_registry.json');
assert.strictEqual(gen.version,'0.9.82CZ');
assert.strictEqual(Object.keys(hom.definitions).length,9);
assert.strictEqual(Object.keys(homSkills.skills).length,58);
assert.strictEqual(gen.skills['243'].handler,'homunculus_manager');
assert.strictEqual(gen.skills['244'].handler,'homunculus_rest');
assert.strictEqual(gen.skills['247'].executionEnabled,false);
assert(pending.skills.some(row=>Number(row.skillId)===247));
assert.strictEqual(reg.handlers.homunculus_manager.executor,'castHomunculusManagerSkill');
assert.strictEqual(reg.handlers.homunculus_rest.executor,'castHomunculusRestSkill');
assert.strictEqual(core.skills['243'].spCost[0],10);
assert.strictEqual(core.skills['244'].spCost[0],50);

const logs=[];const math=Object.create(Math);math.random=()=>0;
const player={baseLevel:80,jobKey:'genetic',job:'基因學者',sp:1000,hp:10000,maxHp:10000,learnedSkills:{'243':1,'244':1,'232':5},homunculus:{},activeBuffs:{}};
const monster={name:'測試波利',currentHp:100000};
const profiles={'243':gen.skills['243'].runtimeProfile,'244':gen.skills['244'].runtimeProfile};
const skillIndex={'243':core.skills['243'],'244':core.skills['244']};
const ctx={console,Date,Math:math,setInterval:()=>1,clearInterval:()=>{},document:{getElementById:()=>null},player,currentMonster:monster,
 loadJson:async p=>p.includes('homunculus_skills')?homSkills:hom,getSkillDataById:id=>skillIndex[String(id)],getSkillLevel:id=>Number(player.learnedSkills[String(id)]||0),
 getSkillRuntimeProfile:skill=>profiles[String(skill.id)],canCastSkill:(skill,lv,handlers)=>({ok:true,level:Number(lv||1),profile:profiles[String(skill.id)]}),
 paySkillCost:(skill,lv)=>{player.sp-=Number((skill.spCost||[0])[Math.max(0,Number(lv)-1)]||0);},reportPendingRuntime:()=>false,
 RARenewalDamagePipeline:{finalModifiers:raw=>raw},applySummonDamageMastery:d=>Math.floor(d*1.1),playMonsterHitAnimation:()=>{},showDamageNumber:()=>{},
 addBattleLog:(t,type)=>logs.push([t,type]),updateMonsterUI:()=>{},updatePlayerUI:()=>{},saveGame:()=>{},defeatMonster:()=>{},window:null};
ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/homunculus.js'),'utf8'),ctx);
(async()=>{
 await ctx.loadHomunculusData();
 const filir=hom.definitions.filir_evolved;
 const lv80=ctx.calculateHomunculusStats(filir,80);
 const expectedAgi=35+Math.round(79*1.4)+20;
 assert.strictEqual(lv80.agi,expectedAgi);
 assert(ctx.summonHomunculus('filir_evolved'));
 assert.strictEqual(player.homunculus.levelSnapshot,80);
 assert.strictEqual(player.sp,990);
 player.baseLevel=99;
 assert.strictEqual(ctx.getActiveHomunculus().level,80,'active summon must keep summon-time BaseLv snapshot');
 assert(ctx.summonHomunculus('filir_evolved'));
 assert.strictEqual(player.homunculus.levelSnapshot,99);
 assert.strictEqual(player.sp,980);
 const before=monster.currentHp;const result=ctx.runHomunculusAiTick(monster,{manual:true});
 assert(result.attacked);assert(before>monster.currentHp);
 assert(ctx.restHomunculus());assert.strictEqual(player.homunculus.active,false);assert.strictEqual(player.homunculus.selectedId,'filir_evolved');assert.strictEqual(player.sp,930);
 assert.strictEqual(ctx.isHomunculusSUnlocked(),false);
 player.learnedSkills['5337']=1;assert.strictEqual(ctx.isHomunculusSUnlocked(),true);
 console.log(JSON.stringify({result:'PASS',definitions:9,skillCatalog:58,lv80Agi:lv80.agi,levelSnapshotResummon:99,basicAttackDamage:before-monster.currentHp,resurrectionPending:true},null,2));
})().catch(e=>{console.error(e);process.exit(1)});
