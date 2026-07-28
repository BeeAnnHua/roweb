const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const ROOT=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(ROOT,'js','auto_battle.js'),'utf8');
const battle=fs.readFileSync(path.join(ROOT,'js','battle.js'),'utf8');
const skillEngine=fs.readFileSync(path.join(ROOT,'js','skill_engine.js'),'utf8');
const quickSlots=fs.readFileSync(path.join(ROOT,'js','quick_slots.js'),'utf8');
const profiles={
  5203:{handler:'debuff',status:'servant_sign',statusAffectsBoss:true,resourceCost:{type:'servantWeapon',amount:1,mode:'fixed'}},
  5204:{handler:'physical_attack',requiresTargetStatus:'servant_sign',autoPrerequisiteSkillId:5203,autoPrerequisiteMinimumRemainingResource:1,damageHitCount:'consumed_resource',visualHitCount:'consumed_resource',resourceCost:{type:'servantWeapon',amount:5,mode:'up_to',minimum:0}},
  5205:{handler:'physical_attack',requiresTargetStatus:'servant_sign',autoPrerequisiteSkillId:5203,autoPrerequisiteMinimumRemainingResource:1,damageHitCount:'consumed_resource',visualHitCount:'consumed_resource',resourceCost:{type:'servantWeapon',amount:5,mode:'up_to',minimum:1}}
};
const skills={
  5203:{id:5203,officialId:5203,name:'死侍武器-標記',skillType:'debuff'},
  5204:{id:5204,officialId:5204,name:'死侍武器-瞬幻',skillType:'attack'},
  5205:{id:5205,officialId:5205,name:'死侍武器-破滅',skillType:'attack'}
};
const targetA={id:1001,name:'A',currentHp:100,position:{x:0,y:0},runtimeState:{statuses:{}}};
const targetB={id:1002,name:'B',currentHp:100,position:{x:0,y:0},runtimeState:{statuses:{}}};
const ctx={console,Date,Math,Number,String,Boolean,Object,Array,Set,Map,JSON,setTimeout:()=>1,clearTimeout:()=>{},document:{getElementById:()=>null,querySelectorAll:()=>[],createElement:()=>({appendChild(){},classList:{add(){},remove(){},toggle(){}}})}};
ctx.window=ctx;
vm.createContext(ctx);
vm.runInContext(`
let currentMonster=null;
let currentMap={id:'test'};
let resource=5;
let signLearned=5;
let logs=[];
let player={hp:100,maxHp:100,sp:100,maxSp:100,currentCity:null,position:{x:0,y:0},inventory:[],activeBuffs:{},autoCombat:{hpPotion:{enabled:false},spPotion:{enabled:false},detox:{enabled:false},elementEndow:{enabled:false},cashFood:{enabled:false,itemIds:[]},monsterFilter:{version:'x',byMap:{}},heal:{enabled:false},normalAttack:{enabled:true},attacks:[{enabled:true,skillId:5204,spPercent:0,level:5,minMonsters:1,fallbackNormal:true},{enabled:false},{enabled:false},{enabled:false}],buffs:{},teleport:{enabled:false,noTargetSeconds:1,returnHome:{enabled:false}}}};
const profiles=${JSON.stringify(profiles)};
const skills=${JSON.stringify(skills)};
function getSkillDataById(id){return skills[Number(id)]||null;}
function getRuntimeSkillUiType(skill){return Number(skill.id)===5203?'debuff':'attack';}
function getSkillRuntimeProfile(skill){return profiles[Number(skill.id)]||{};}
function getSkillLevel(id){return Number(id)===5203?signLearned:5;}
function getLevelValue(value,level,fallback){if(Array.isArray(value))return Number(value[level-1]??value.at(-1)??fallback);return Number(value??fallback);}
function canCastSkill(skill,level){if(Number(skill.id)===5203&&resource<1)return {ok:false,reason:'劍體不足',resourceBlock:{label:'劍體',retryMs:1000}};return {ok:true,level:Number(level||1),profile:getSkillRuntimeProfile(skill)};}
function shouldCastBySp(){return true;}
function resolveRuntimeSkillTargets(profile,target){return target?[target]:[];}
function collectLiveCombatEnemies(){return currentMonster?[currentMonster]:[];}
function addBattleLog(text){logs.push(text);}
function normalizeActiveBuffs(){}
function saveGame(){}
function normalizeItemId(value){return value;}
function castDebuffSkill(skill,level){if(Number(skill.id)!==5203||!currentMonster||resource<1)return false;resource-=1;currentMonster.runtimeState.statuses.servantsign={expiresAt:Date.now()+10000};return true;}
function getActiveBuffBonusTotals(){return {};}
function isRuntimeSkillCasting(){return false;}
function isPlayerActiveSkillLocked(){return false;}
window.StatusManager={has(target,status){const key=String(status).toLowerCase().replace(/[ _-]/g,'');return !!target?.runtimeState?.statuses?.[key];}};
window.CombatResourceManager={get(){return resource;}};
window.__setTarget=t=>{currentMonster=t};
window.__setResource=v=>{resource=v};
window.__getResource=()=>resource;
window.__setSignLearned=v=>{signLearned=v};
window.__logs=()=>logs;
window.__clearLogs=()=>{logs=[]};
`,ctx);
vm.runInContext(source,ctx,{filename:'auto_battle.js'});
function extractFunction(text,name){
  const start=text.indexOf(`function ${name}(`);
  if(start<0)throw new Error(`missing function ${name}`);
  const openParen=text.indexOf('(',start);
  let parenDepth=0,signatureQuote='',signatureEscape=false,closeParen=-1;
  for(let i=openParen;i<text.length;i++){
    const c=text[i];
    if(signatureQuote){if(signatureEscape){signatureEscape=false;continue;}if(c==='\\'){signatureEscape=true;continue;}if(c===signatureQuote)signatureQuote='';continue;}
    if(c==='\"'||c==="'"||c==='`'){signatureQuote=c;continue;}
    if(c==='(')parenDepth++;
    if(c===')'&&--parenDepth===0){closeParen=i;break;}
  }
  if(closeParen<0)throw new Error(`unterminated signature ${name}`);
  const brace=text.indexOf('{',closeParen);
  let depth=0,quote='',escape=false,lineComment=false,blockComment=false;
  for(let i=brace;i<text.length;i++){
    const c=text[i],n=text[i+1];
    if(lineComment){if(c==='\n')lineComment=false;continue;}
    if(blockComment){if(c==='*'&&n==='/'){blockComment=false;i++;}continue;}
    if(quote){if(escape){escape=false;continue;}if(c==='\\'){escape=true;continue;}if(c===quote)quote='';continue;}
    if(c==='/'&&n==='/'){lineComment=true;i++;continue;}
    if(c==='/'&&n==='*'){blockComment=true;i++;continue;}
    if(c==='\"'||c==="'"||c==='`'){quote=c;continue;}
    if(c==='{')depth++;
    if(c==='}'&&--depth===0)return text.slice(start,i+1);
  }
  throw new Error(`unterminated function ${name}`);
}
vm.runInContext(`
let __monsterCounterattacks=0;
function monsterAttackPlayer(){__monsterCounterattacks++;}
function stopPlayerCombatMovementForAttack(){}
function updateMonsterUI(){}
function updatePlayerUI(){}
function canAttackMonsterByRange(){return true;}
function getSkillRangePx(){return 324;}
function getRuntimeAdjustedCastTime(){return {totalMs:0};}
window.__getMonsterCounterattacks=()=>__monsterCounterattacks;
`,ctx);
vm.runInContext(extractFunction(battle,'autoAttackMonster'),ctx,{filename:'battle.autoAttackMonster.js'});
const checks=[]; const check=(name,fn)=>{fn();checks.push(name)};
check('missing sign selects prerequisite skill',()=>{ctx.__setTarget(targetA);ctx.__setResource(5);targetA.runtimeState.statuses={};const a=ctx.getAutoCombatAttackAction(targetA);assert.equal(a.action,'prerequisiteSkill');assert.equal(a.skill.id,5203);assert.equal(a.prerequisiteForSkill.id,5204);});
check('prerequisite cast applies sign and spends exactly one servant',()=>{const a=ctx.getAutoCombatAttackAction(targetA);assert.equal(ctx.castAutoSkillPrerequisite(a),true);assert.equal(ctx.__getResource(),4);assert.equal(ctx.StatusManager.has(targetA,'servant_sign'),true);});
check('signed target immediately returns original attack skill',()=>{const a=ctx.getAutoCombatAttackAction(targetA);assert.equal(a.action,'attackSkill');assert.equal(a.skill.id,5204);});
check('signed Phantom with zero servants falls back instead of spending SP on a useless cast',()=>{ctx.__setResource(0);const a=ctx.getAutoCombatAttackAction(targetA);assert.equal(a.action,'normal');ctx.__setResource(4);});
check('new target never reuses old target sign',()=>{ctx.__setTarget(targetB);targetB.runtimeState.statuses={};const a=ctx.getAutoCombatAttackAction(targetB);assert.equal(a.action,'prerequisiteSkill');assert.equal(a.skill.id,5203);});
check('unlearned Sign skips combo and uses normal attack',()=>{ctx.__setSignLearned(0);const a=ctx.getAutoCombatAttackAction(targetB);assert.equal(a.action,'normal');ctx.__setSignLearned(5);});
check('one remaining servant is reserved instead of wasted on Sign',()=>{ctx.__setResource(1);const a=ctx.getAutoCombatAttackAction(targetB);assert.equal(a.action,'normal');});
check('Demolition uses the same prerequisite resolver',()=>{ctx.__setResource(5);vm.runInContext('player.autoCombat.attacks[0].skillId=5205',ctx);const a=ctx.getAutoCombatAttackAction(targetB);assert.equal(a.action,'prerequisiteSkill');assert.equal(a.prerequisiteForSkill.id,5205);});
check('automatic selection does not emit missing-mark spam',()=>{ctx.__clearLogs();for(let i=0;i<20;i++)ctx.getAutoCombatAttackAction(targetB);assert.deepEqual(ctx.__logs(),[]);});
check('battle tick executes Sign before the configured attack and preserves rotation',()=>{
  ctx.__setTarget(targetB);ctx.__setResource(5);targetB.runtimeState.statuses={};
  vm.runInContext('AUTO_BATTLE_CONTROLLER.attackRotationCursor=0',ctx);
  ctx.autoAttackMonster({utilityHandled:true});
  assert.equal(ctx.StatusManager.has(targetB,'servant_sign'),true);
  assert.equal(ctx.__getResource(),4);
  assert.equal(ctx.__getMonsterCounterattacks(),1);
  assert.equal(ctx.AUTO_BATTLE_CONTROLLER.attackRotationCursor,0);
  const next=ctx.getAutoCombatAttackAction(targetB);
  assert.equal(next.action,'attackSkill');assert.equal(next.skill.id,5205);
});
check('battle integration has explicit prerequisite action without rotation commit',()=>{assert.match(battle,/autoAction\.action === "prerequisiteSkill"/);const branch=battle.slice(battle.indexOf('autoAction.action === "prerequisiteSkill"'),battle.indexOf('autoAction.action === "attackSkill"'));assert.doesNotMatch(branch,/commitAutoAttackSkillRotation/);});
check('auto missing-status message is suppressed while manual message remains',()=>{assert.match(skillEngine,/String\(options\?\.source\|\|""\)!=="auto_battle"/);});
check('up_to resource preview uses minimum instead of full amount',()=>{assert.match(skillEngine,/cfg\.mode==="up_to"\)required=Math\.max\(0,Number\(cfg\.minimum\|\|0\)\)/);});
check('quick-slot callback preserves auto-battle source',()=>{assert.match(quickSlots,/castAttackSkill\(skill, getSkillLevel\(skill\.id\), \{ source: options\.source \|\| "quick_slot" \}\)/);});
const core=JSON.parse(fs.readFileSync(path.join(ROOT,'data','skill_runtime','runtime_core_1_v1.json'),'utf8')).skills;
check('runtime metadata enables Boss/MVP sign and both auto chains',()=>{assert.equal(core['5203'].runtimeProfile.statusAffectsBoss,true);for(const id of ['5204','5205']){assert.equal(core[id].runtimeProfile.autoPrerequisiteSkillId,5203);assert.equal(core[id].runtimeProfile.autoPrerequisiteMinimumRemainingResource,1);}});
console.log(`Servant Weapon Auto Prerequisite 0.9.82GE: ${checks.length}/${checks.length} PASS`);checks.forEach(x=>console.log('PASS - '+x));
