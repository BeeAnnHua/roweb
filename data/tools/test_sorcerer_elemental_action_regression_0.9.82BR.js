const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const ROOT=path.resolve(__dirname,'..'),read=r=>fs.readFileSync(path.join(ROOT,r),'utf8'),j=r=>JSON.parse(read(r));
const runtime=j('data/skill_runtime/runtime_core_1_v1.json'),generated=j('data/skill_runtime/runtime_generated_all.json'),pending=j('data/skill_runtime/runtime_pending_review.json'),skills=j('data/skills/skills_core_1.json').skills;
const ids=[374,2461,2463,5374],names={374:'心神互換',2461:'精靈激發',2463:'精靈交流',5374:'元素鬥志精熟'};
assert.strictEqual(runtime.version,'0.9.82BR');assert.strictEqual(Object.keys(runtime.skills).length,676);assert.strictEqual(generated.summary.officialRuntime,676);assert.strictEqual(generated.summary.pending,463);assert.strictEqual(pending.skills.length,463);
const pendingIds=new Set(pending.skills.map(x=>Number(x.skillId)));
for(const id of ids){assert(runtime.skills[String(id)]?.executionEnabled);assert(!pendingIds.has(id));assert.strictEqual(skills[String(id)].name,names[id]);assert.strictEqual(skills[String(id)].effectRuntime.runtimeVersion,'0.9.82BP');assert.strictEqual(skills[String(id)].implementationStatus,'runtime_official');}

assert.strictEqual(skills['2463'].skillType,'passive');assert.strictEqual(skills['5374'].skillType,'passive');
function makeContext(){
 const all=[374,2461,2463,5374,2457,5376];
 const player={hp:10000,maxHp:10000,sp:5000,maxSp:10000,baseLevel:100,jobLevel:60,position:{x:100,y:200},stats:{int:100,dex:80},traitStats:{spl:100},activeBuffs:{},learnedSkills:{374:1,2461:1,2463:5,5374:10,2457:3,5376:1},equipment:{weapon:1},runtimeState:{statuses:{}}};
 const target={name:'測試怪物',position:{x:100,y:200},currentHp:100000,maxHp:100000,mdef:0,def:0,race:'Formless',element:'Neutral',runtimeState:{statuses:{}}};
 const target2={name:'周圍怪物',position:{x:110,y:200},currentHp:100000,maxHp:100000,mdef:0,def:0,race:'Formless',element:'Neutral',runtimeState:{statuses:{}}};
 const profiles=Object.fromEntries(all.map(id=>[String(id),runtime.skills[String(id)]]));
 const c={console,Date,JSON,Number,String,Array,Object,Set,Map,Boolean,Infinity,NaN,Math:Object.create(Math),window:null,player,currentMonster:target,activeMonsters:[target,target2],mapMonsters:[target,target2],logs:[],
  skillsData:{runtimeProfiles:profiles,skillIndex:Object.fromEntries(all.map(id=>[String(id),skills[String(id)]]))},
  getSkillLevel:id=>Number(player.learnedSkills[String(id)]||0),getCurrentJobSkills:()=>all.map(id=>skills[String(id)]),getExtraSkillSkillList:()=>[],getItemData:()=>({}),getEquippedWeaponTypeRuntime:()=> 'Staff',
  calculateDerivedPlayerStats:()=>({matk:100,matkMin:100,matkMax:100,maxSp:player.maxSp,stats:{int:100,dex:80,spl:100},sMatk:0}),
  RARenewalDamagePipeline:{finalModifiers(raw){return Math.max(0,Math.floor(raw));}},
  TargetingResolver:{collect(origin,candidates,opt){return Number(opt.rangeCells||0)>0?candidates.slice():[target];}},
  StatusManager:{apply(t,name,opt){t.runtimeState.statuses[name]={effects:opt.effects||{},expiresAt:Date.now()+Number(opt.durationMs||0)};return {applied:true};},has(){return false;}},
  addBattleLog(x){c.logs.push(x)},updatePlayerUI(){},updateMonsterUI(){},saveGame(){},recalculatePlayerStats(){},playROStudioPlayerMotion(){},playPlayerAttackAnimation(){},showDamageNumber(){},playMonsterHitAnimation(){},showSlashEffect(){},
  canAttackMonsterByRange:()=>true,getSkillRangePx:()=>999,document:{getElementById(){return null}},requestAnimationFrame:f=>f(),setTimeout:f=>{f();return 1},clearTimeout(){},setInterval:()=>1,clearInterval(){}};
 c.Math.random=()=>0;c.window=c;return c;
}
const c=makeContext();vm.createContext(c);vm.runInContext(read('js/skill_engine.js'),c,{filename:'skill_engine.js'});
const passive=c.getPassiveSkillBonusTotals();assert.strictEqual(passive.elementalSpiritMatkFlat,125);assert.strictEqual(passive.elementalSpiritAtkFlat,125);assert.strictEqual(passive.highElementalMatkFlat,200);assert.strictEqual(passive.highElementalAtkFlat,300);
// Soul Exhale monster branch: 3% MaxSP, once per monster.
c.player.sp=5000;assert.strictEqual(c.castSoulExchangeSkill(skills['374'],1),true);assert.strictEqual(c.player.sp,5300);assert.strictEqual(c.currentMonster.runtimeState.soulExhaleUsed,true);assert.strictEqual(c.castSoulExchangeSkill(skills['374'],1),false);assert.strictEqual(c.player.sp,5300);
// Base Agni grade 3: MATK = 3*(INT/2+DEX/4)+Spirit Sympathy 125 = 335. RNG 0 selects 30% AoE Fire Wave branch at 600%.
c.player.activeBuffs={'2457':{effects:{summonedElementalSpirit:1,summonedElementalAgni:1,summonedElementalType:'Agni',summonedElementalElement:'Fire',summonedElementalGrade:3},expiresAt:Date.now()+60000}};
let spec=c.getElementalActionRuntimeSpec(runtime.skills['2461'].runtimeProfile,0);assert.strictEqual(spec.type,'Agni');assert.strictEqual(spec.grade,3);assert.strictEqual(spec.elementalMatk,335);assert.strictEqual(spec.ratio,600);assert.strictEqual(spec.radius,1);assert.strictEqual(c.resolveElementalActionRuntimeDamage(spec,c.currentMonster),2010);
c.currentMonster.currentHp=100000;c.activeMonsters[1].currentHp=100000;assert.strictEqual(c.castAttackSkill(skills['2461'],1,{skipHitCheck:true}),true);assert.strictEqual(c.currentMonster.currentHp,97990);assert.strictEqual(c.activeMonsters[1].currentHp,97990);
// High Diluvio: grade 3 base MATK 210 + type 60 + Sympathy 125 + Mastery 200 = 595; 3700% × (100+BaseLv)/100 = 7400%.
c.player.activeBuffs={'5376':{effects:{summonedHighElemental:1,summonedElementalDiluvio:1,summonedHighElementalType:'Diluvio',summonedHighElementalElement:'Water'},expiresAt:Date.now()+60000}};
spec=c.getElementalActionRuntimeSpec(runtime.skills['2461'].runtimeProfile,99);assert.strictEqual(spec.type,'Diluvio');assert.strictEqual(spec.elementalMatk,595);assert.strictEqual(spec.ratio,7400);assert.strictEqual(spec.radius,5);assert.strictEqual(spec.visualHits,4);assert.strictEqual(c.resolveElementalActionRuntimeDamage(spec,c.currentMonster),44030);
// No elemental = no cast.
c.player.activeBuffs={};assert.strictEqual(c.castAttackSkill(skills['2461'],1,{skipHitCheck:true}),false);assert(c.logs.some(x=>String(x).includes('需要先召喚基礎或高階元素')));
console.log(JSON.stringify({result:'PASS',version:'0.9.82BP',official:663,pending:476,mageOfficial:139,magePending:14,skills:ids},null,2));
