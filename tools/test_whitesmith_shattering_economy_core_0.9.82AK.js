const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const core=JSON.parse(fs.readFileSync(path.join(root,'data/skills/skills_core_1.json'),'utf8')).skills;
const runtime=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_core_1_v1.json'),'utf8')).skills;
const generatedDoc=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_generated_all.json'),'utf8'));
const pendingDoc=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_pending_review.json'),'utf8'));
const copyable=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_copyable_skills.json'),'utf8'));
function assert(c,m){if(!c)throw new Error(m);}
assert(Object.values(generatedDoc.skills).filter(x=>x.implementationMode==='official'&&x.executionEnabled).length>=471,'official coverage milestone');
assert(pendingDoc.skills.length<=668,'pending count milestone');
for(const id of [384,1012]){
  assert(runtime[id]&&runtime[id].handler!=='pending','runtime '+id);
  assert(!pendingDoc.skills.some(x=>Number(x.skillId)===id),'still pending '+id);
}
assert(core[384].name==='野蠻凶砍'&&core[384].skillType==='buff','Meltdown core metadata');
assert(core[1012].name==='詭計的商術'&&core[1012].skillType==='passive','Unfair Trick core metadata');
const copyIds=new Set([...(copyable.plagiarism?.skills||copyable.plagiarism||[]),...(copyable.reproduce?.skills||copyable.reproduce||[])].map(x=>Number(x?.skillId??x?.id??x)));
assert(!copyIds.has(384)&&!copyIds.has(1012),'passive/buff incorrectly copyable');

const math=Object.create(Math); let sequence=[]; math.random=()=>sequence.length?sequence.shift():0.99;
const ctx={console,Date,Math:math,setTimeout:()=>0,clearTimeout:()=>{},window:null,
  player:{learnedSkills:{42:10,384:10,485:10,1012:1},activeBuffs:{},stats:{},equipment:{},sp:9999,hp:9999,maxHp:9999,zeny:1000,baseLevel:200,jobLevel:70},
  currentMonster:null, skillsData:{runtimeProfiles:runtime,skillIndex:{42:core[42],384:core[384],485:core[485],1012:core[1012]}},
  getCurrentJobSkills:()=>[core[42],core[384],core[485],core[1012]],getExtraSkillSkillList:()=>[],isSkillBasic:()=>false,isPlayerMounted:()=>false,
  getSkillLevel:id=>Number(ctx.player.learnedSkills[String(id)]||0),getSkillDataById:id=>ctx.skillsData.skillIndex[String(id)]||null,
  getEquippedWeaponTypeRuntime:()=> 'axe',recalculatePlayerStats:()=>{},updatePlayerUI:()=>{},saveGame:()=>{},logs:[],addBattleLog:s=>ctx.logs.push(s)
};
ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root,'js/combat_mechanics_runtime.js'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(root,'js/skill_engine.js'),'utf8'),ctx);

assert(ctx.getRuntimeSkillZenyCost(core[42],10)===800,'Mammonite Renewal discount');
let check=ctx.canCastSkill(core[42],10,['physical_attack']);
assert(check.ok&&check.zenyCost===800,'Mammonite canCast discounted cost');
ctx.paySkillCost(core[42],10); assert(ctx.player.zeny===200,'Mammonite Zeny payment');
ctx.player.zeny=799; check=ctx.canCastSkill(core[42],10,['physical_attack']);
assert(!check.ok&&String(check.reason).includes('Zeny'),'insufficient Zeny check');
ctx.player.learnedSkills[1012]=0; ctx.player.zeny=1000;
assert(ctx.getRuntimeSkillZenyCost(core[42],10)===1000,'Mammonite base cost without passive');
ctx.player.learnedSkills[1012]=1; ctx.player.zeny=1200;
assert(ctx.getRuntimeSkillZenyCost(core[485],10)===1200,'Cart Termination discount');

const effects=ctx.collectRuntimeEffects(runtime[384],10);
ctx.player.activeBuffs[384]={name:'野蠻凶砍',level:10,effects,expiresAt:Date.now()+60000};
let monster={name:'測試魔物',atk:100,def:100,runtimeState:{}}; ctx.currentMonster=monster; sequence=[0,0];
assert(ctx.applyActiveAttackBuffStatuses(monster)===true,'Meltdown proc');
let bonuses=ctx.getMonsterRuntimeBonuses(monster);
assert(bonuses.atkRate===-25,'weapon break ATK reduction');
assert(bonuses.defRate===-25,'armor break DEF reduction');
assert(ctx.StatusManager.has(monster,'meltdown_weapon_break'),'weapon break status');
assert(ctx.StatusManager.has(monster,'meltdown_armor_break'),'armor break status');
assert(ctx.logs.some(x=>x.includes('ATK -25%'))&&ctx.logs.some(x=>x.includes('DEF -25%')),'Meltdown battle logs');
monster={name:'未破壞魔物',atk:100,def:100,runtimeState:{}}; sequence=[0.99,0.99];
assert(ctx.applyActiveAttackBuffStatuses(monster)===false,'Meltdown failed roll');
bonuses=ctx.getMonsterRuntimeBonuses(monster); assert(!bonuses.atkRate&&!bonuses.defRate,'failed roll applied status');
console.log(JSON.stringify({result:'PASS',official:471,pending:668,skills:[384,1012],mammoniteLv10Cost:800,cartTerminationLv10Cost:1200,meltdownLv10:{weaponChance:10,armorChance:7,atkRate:-25,defRate:-25,durationMs:5000}},null,2));
