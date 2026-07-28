const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..'),j=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const g=j('data/skill_runtime/runtime_generated_all.json'),p=j('data/skill_runtime/runtime_pending_review.json'),core=j('data/skills/skills_core_1.json').skills;
const official=new Set(Object.entries(g.skills).filter(([,x])=>x.implementationMode==='official'&&x.executionEnabled).map(([id])=>Number(id)));
assert.strictEqual(official.size,654);assert.strictEqual(p.skills.length,485);
for(const id of [279,405,2446,5365,5369,280,1008,2201,5214,5232,276,288,2443,2444,2445,5375,5376,5377,5378,5379,5380,2457,2458,2459,2460])assert(official.has(id),`missing official ${id}`);
for(const id of [373,402,2465,2466,2467,2468])assert(p.skills.some(x=>Number(x.skillId)===id),`must remain pending ${id}`);
const merchantJobs=['merchant','merchant_high','blacksmith','alchemist','whitesmith','creator','mechanic','mechanic2','genetic','meister','meister2','biolo'];
const merchantFamily=new Set();for(const f of merchantJobs){for(const x of j(`data/skill_trees/${f}.json`).skills)merchantFamily.add(Number(x.skillId));}
assert.strictEqual(merchantFamily.size,147);assert.strictEqual([...merchantFamily].filter(id=>!official.has(id)).length,0);
const mageJobs=['mage','mage_high','wizard','high_wizard','warlock','arch_mage','sage','professor','sorcerer','elemental_master'];
const mageFamily=new Set();for(const f of mageJobs){for(const x of j(`data/skill_trees/${f}.json`).skills)mageFamily.add(Number(x.skillId));}
assert.strictEqual(mageFamily.size,153);assert.strictEqual([...mageFamily].filter(id=>official.has(id)).length,130);assert.strictEqual([...mageFamily].filter(id=>!official.has(id)).length,23);
for(const [id,name] of Object.entries({2457:'召喚火精靈阿格尼',2458:'召喚水精靈阿庫亞',2459:'召喚風精靈梵圖斯',2460:'召喚地精靈泰拉'}))assert.strictEqual(core[id].name,name);
console.log(JSON.stringify({result:'PASS',official:official.size,pending:p.skills.length,merchantFamily:merchantFamily.size,mageOfficial:130,magePending:23}));
