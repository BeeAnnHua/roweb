const fs=require('fs'),path=require('path'),assert=require('assert'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const j=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const ids=[10,93,1006];
const core=j('data/skill_runtime/runtime_core_1_v1.json');
const generated=j('data/skill_runtime/runtime_generated_all.json');
const catalog=j('data/skill_runtime/runtime_formula_catalog.json');
const pending=j('data/skill_runtime/runtime_pending_review.json');
const skills=j('data/skills/skills_core_1.json').skills;
const copy=j('data/skill_runtime/runtime_copyable_skills.json');
assert.strictEqual(core.version,'0.9.82AZ');
assert.strictEqual(Object.keys(core.skills).length,563);
assert.strictEqual(generated.summary.officialRuntime,563);
assert.strictEqual(pending.skills.length,576);
for(const id of ids){
 const p=core.skills[String(id)];
 assert(p&&p.handler==='passive',`passive runtime ${id}`);
 assert.deepStrictEqual(p.passiveBonuses,{atkRate:5,matkRate:5});
 assert.strictEqual(skills[String(id)].skillType,'passive');
 assert.strictEqual(skills[String(id)].runtimeHandler,'passive');
 assert(skills[String(id)].spCost.every(v=>v===0));
 assert.strictEqual(generated.skills[String(id)].suggestedHandler,'passive');
 assert(!pending.skills.some(x=>Number(x.skillId)===id));
 for(const mode of ['plagiarism','reproduce']) assert(!copy[mode].some(x=>Number(x.skillId)===id),`${id} leaked into ${mode}`);
}
assert.strictEqual(copy.summary.plagiarismTotal,75);
assert.strictEqual(copy.summary.plagiarismRuntimeReady,48);
assert.strictEqual(copy.summary.reproduceTotal,160);
assert.strictEqual(copy.summary.reproduceRuntimeReady,90);
assert.strictEqual(new Set(catalog.skills.map(x=>Number(x.skillId))).size,1139);
// Runtime passive aggregation: all three learned => ATK/MATK +15%.
const context={console,Math,Date,JSON,Number,String,Array,Object,Set,Map,Boolean,Infinity,NaN,
 player:{learnedSkills:{'10':1,'93':1,'1006':1},jobKey:'wizard'},
 skillsData:{skillIndex:Object.fromEntries(ids.map(id=>[String(id),skills[String(id)]])),runtimeProfiles:Object.fromEntries(ids.map(id=>[String(id),core.skills[String(id)]]))},
 getCurrentJobSkills(){return ids.map(id=>skills[String(id)])},getExtraSkillSkillList(){return []},getSkillLevel(){return 1},
 getSkillRuntimeProfile(skill){return core.skills[String(skill.id)]},isSkillBasic(){return false},isPlayerMounted(){return false},
 window:null,document:{getElementById(){return null}},setTimeout,clearTimeout,setInterval,clearInterval
};context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'js/skill_engine.js'),'utf8'),context);
const totals=context.getPassiveSkillBonusTotals();
assert.strictEqual(totals.atkRate,15);assert.strictEqual(totals.matkRate,15);
context.player.activeBuffs={'10':{expiresAt:Date.now()+999999,effects:{revealHidden:1}},'93':{expiresAt:Date.now()+999999},'1006':{expiresAt:Date.now()+999999,effects:{sightBlaster:1}},'157':{expiresAt:Date.now()+999999,effects:{energyCoat:1}}};
context.normalizeActiveBuffs();
assert(!context.player.activeBuffs['10']&&!context.player.activeBuffs['93']&&!context.player.activeBuffs['1006']);
assert(context.player.activeBuffs['157']);
console.log('Mage passive conversion 0.9.82AZ: PASS');
