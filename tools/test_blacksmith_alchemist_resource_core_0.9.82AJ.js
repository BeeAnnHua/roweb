const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const core=JSON.parse(fs.readFileSync(path.join(root,'data/skills/skills_core_1.json'),'utf8')).skills;
const runtime=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_core_1_v1.json'),'utf8')).skills;
const generated=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_generated_all.json'),'utf8')).skills;
const pending=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_pending_review.json'),'utf8')).skills;
const materials=JSON.parse(fs.readFileSync(path.join(root,'data/items/materials_1.json'),'utf8'));
const itemIndex=JSON.parse(fs.readFileSync(path.join(root,'data/items/item_index.json'),'utf8'));
function assert(c,m){if(!c)throw new Error(m);}
assert(Object.values(generated).filter(x=>x.implementationMode==='official'&&x.executionEnabled).length>=469,'official coverage regression');
assert(pending.length<=670,'pending count regression');
for(const id of [106,227]){assert(runtime[id]?.handler==='passive','passive runtime '+id);assert(!pending.some(x=>Number(x.skillId)===id),'still pending '+id);assert(core[id].skillType==='passive','core passive '+id);}
const oreIds=[1002,998,993,1003,992,1010,991,990,999,1011,757,756,997,996,995,994,985,984,969,714];
assert(runtime[106].extraDropTable.entries.length===20,'ORE entry count');
assert(runtime[106].extraDropTable.selection==='uniform_then_rate_check','RA group algorithm');
for(const id of oreIds){assert(materials[id]&&itemIndex[id],'item db '+id);assert(materials[id].name&&!String(materials[id].description).includes('重量'),'identified item fields '+id);}
const math=Object.create(Math);let sequence=[];math.random=()=>sequence.length?sequence.shift():0;
const ctx={console,Date,Math:math,setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},window:null,
 player:{learnedSkills:{106:1,227:10},activeBuffs:{},stats:{},equipment:{}},
 skillsData:{runtimeProfiles:runtime,skillIndex:{106:core[106],227:core[227]}},
 getCurrentJobSkills:()=>[core[106],core[227]],getExtraSkillSkillList:()=>[],isSkillBasic:()=>false,isPlayerMounted:()=>false,
 getSkillLevel:id=>Number(ctx.player.learnedSkills[String(id)]||0),getSkillDataById:id=>ctx.skillsData.skillIndex[String(id)]||null,
 getEquippedWeaponTypeRuntime:()=> 'fist',normalizeItemId:id=>Number(id),applyRate:v=>Number(v),applyTrainingRewardBonus:v=>Number(v),
 getItemData:id=>materials[String(id)]||itemIndex[String(id)]||null,added:[],recorded:[],logs:[],addItem:(item,qty)=>ctx.added.push({item,qty}),recordItemDrop:(id,qty)=>ctx.recorded.push({id,qty}),addBattleLog:s=>ctx.logs.push(s)
};ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root,'js/skill_engine.js'),'utf8'),ctx);
assert(ctx.getItemRecoveryRateBonus('hp')===50,'HP item recovery rate');
assert(ctx.getItemRecoveryRateBonus('sp')===50,'SP item recovery rate');
assert(ctx.calculateItemRecoveryAmount(100,'hp')===150,'HP recovery amount');
assert(ctx.calculateItemRecoveryAmount(80,'sp')===120,'SP recovery amount');
// Verify the passive still works after changing to a later job whose current tree does not directly list the learned second-job skill.
ctx.getCurrentJobSkills=()=>[];
assert(ctx.getItemRecoveryRateBonus('hp')===50,'inherited passive scan');
vm.runInContext(fs.readFileSync(path.join(root,'js/loot.js'),'utf8'),ctx);
sequence=[0,0];
let result=ctx.rollPassiveSkillExtraDrops({name:'測試魔物',lootRuntime:{}});
assert(result.length===1,'ore drop success');assert(result[0].itemId===1002,'uniform first ORE item');assert(ctx.added.length===1&&ctx.recorded.length===1,'ore awarded once');assert(ctx.logs[0].includes('尋找礦石')&&ctx.logs[0].includes(materials['1002'].name),'dynamic ore log');
ctx.added=[];ctx.recorded=[];ctx.logs=[];sequence=[0,0.99];
result=ctx.rollPassiveSkillExtraDrops({name:'測試魔物2',lootRuntime:{}});
assert(result.length===0&&ctx.added.length===0,'ore drop failure');
console.log(JSON.stringify({result:'PASS',official:Object.values(generated).filter(x=>x.implementationMode==='official'&&x.executionEnabled).length,pending:pending.length,skills:[106,227],oreEntries:20,potionRecoveryLv10:50,inheritedPassiveScan:true},null,2));
