const fs=require('fs'),path=require('path'),assert=require('assert');
const ROOT=path.resolve(__dirname,'..'),j=r=>JSON.parse(fs.readFileSync(path.join(ROOT,r),'utf8'));
const generated=j('data/skill_runtime/runtime_generated_all.json').skills,pending=j('data/skill_runtime/runtime_pending_review.json').skills;
assert.strictEqual(Object.values(generated).filter(x=>x.implementationMode==='official'&&x.executionEnabled).length,659);
assert.strictEqual(pending.length,480);
const previousMage=[2201,2207,2214,5012,5214,5220,5228,5233,5234,5237,2209,2217,5232,484,5216,5217,5221,5227,5229,87,483,2446,2447,2448,2449,2450,2454,2455,5365,5366,5369,5370,5371,5372,5373,280,281,282,283,284,1008,1017,1018,1019,405,482,2451,2452,2453,6517,279,285,286,287,289,403,404,276,288,2443,2444,2445,5375,5376,5377,5378,5379,5380,2457,2458,2459,2460];
for(const id of previousMage)assert(generated[String(id)]?.executionEnabled,`previous mage runtime missing ${id}`);
const pendingIds=new Set(pending.map(x=>Number(x.skillId)));assert(pendingIds.has(373));assert(pendingIds.has(402));
const jobFiles=['merchant','merchant_high','blacksmith','alchemist','whitesmith','creator','mechanic','mechanic2','genetic','meister','meister2','biolo'];
const family=new Set();for(const f of jobFiles){for(const x of j(`data/skill_trees/${f}.json`).skills)family.add(Number(x.skillId));}
const familyPending=[...family].filter(id=>!generated[String(id)]?.executionEnabled);assert.strictEqual(family.size,147);assert.deepStrictEqual(familyPending,[]);
console.log(JSON.stringify({result:'PASS',version:'0.9.82BO',official:659,pending:480,previousMageChecked:previousMage.length,merchantUnique:family.size,merchantPending:0},null,2));
