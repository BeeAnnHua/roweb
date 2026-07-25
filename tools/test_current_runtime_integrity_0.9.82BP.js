const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..'),j=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const g=j('data/skill_runtime/runtime_generated_all.json'),p=j('data/skill_runtime/runtime_pending_review.json'),core=j('data/skills/skills_core_1.json').skills;
const official=new Set(Object.entries(g.skills).filter(([,x])=>x.implementationMode==='official'&&x.executionEnabled).map(([id])=>Number(id)));
assert.strictEqual(official.size,663);assert.strictEqual(p.skills.length,476);
for(const id of [374,2461,2463,5374,2465,2466,2467,2468,5008,2457,2458,2459,2460,5375,5376,5377,5378,5379,5380])assert(official.has(id),`missing official ${id}`);
for(const id of [373,402])assert(p.skills.some(x=>Number(x.skillId)===id),`must remain pending ${id}`);
const merchantJobs=['merchant','merchant_high','blacksmith','alchemist','whitesmith','creator','mechanic','mechanic2','genetic','meister','meister2','biolo'];
const merchantFamily=new Set();for(const f of merchantJobs){for(const x of j(`data/skill_trees/${f}.json`).skills)merchantFamily.add(Number(x.skillId));}
assert.strictEqual(merchantFamily.size,147);assert.strictEqual([...merchantFamily].filter(id=>!official.has(id)).length,0);
const mageJobs=['mage','mage_high','wizard','high_wizard','warlock','arch_mage','sage','professor','sorcerer','elemental_master'];
const mageFamily=new Set();for(const f of mageJobs){for(const x of j(`data/skill_trees/${f}.json`).skills)mageFamily.add(Number(x.skillId));}
assert.strictEqual(mageFamily.size,153);assert.strictEqual([...mageFamily].filter(id=>official.has(id)).length,139);assert.strictEqual([...mageFamily].filter(id=>!official.has(id)).length,14);
for(const [id,name] of Object.entries({374:'心神互換',2461:'精靈激發',2463:'精靈交流',5374:'元素鬥志精熟'}))assert.strictEqual(core[id].name,name);
console.log(JSON.stringify({result:'PASS',official:official.size,pending:p.skills.length,merchantFamily:merchantFamily.size,mageOfficial:139,magePending:14}));
