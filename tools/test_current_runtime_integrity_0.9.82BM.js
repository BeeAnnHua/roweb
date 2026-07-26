const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..'),j=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const g=j('data/skill_runtime/runtime_generated_all.json'),p=j('data/skill_runtime/runtime_pending_review.json'),core=j('data/skills/skills_core_1.json').skills;
const official=new Set(Object.entries(g.skills).filter(([,x])=>x.implementationMode==='official'&&x.executionEnabled).map(([id])=>Number(id)));
assert.strictEqual(official.size,650);assert.strictEqual(p.skills.length,489);
for(const id of [279,405,2446,5365,5369,280,1008,2201,5214,5232,276,288,2443,2444,2445,5375,5376,5377,5378,5379,5380])assert(official.has(id),`missing official ${id}`);
for(const id of [373,402])assert(p.skills.some(x=>Number(x.skillId)===id),`must remain pending ${id}`);
const jobs=['merchant','merchant_high','blacksmith','alchemist','whitesmith','creator','mechanic','mechanic2','genetic','meister','meister2','biolo'];
const family=new Set();for(const f of jobs){for(const x of j(`data/skill_trees/${f}.json`).skills)family.add(Number(x.skillId));}
assert.strictEqual(family.size,147);assert.strictEqual([...family].filter(id=>!official.has(id)).length,0);
for(const [id,name] of Object.entries({276:'魔法懲罰',288:'地元素領域',2443:'火焰步',2444:'電流步',2445:'魔力拳',5375:'召喚元素:阿爾多雷',5376:'召喚元素:迪盧比奧',5377:'召喚元素:普羅賽拉',5378:'召喚元素:泰雷莫圖斯',5379:'召喚元素:塞爾彭斯',5380:'元素破壞'}))assert.strictEqual(core[id].name,name);
console.log(JSON.stringify({result:'PASS',official:official.size,pending:p.skills.length,merchantFamily:family.size}));
