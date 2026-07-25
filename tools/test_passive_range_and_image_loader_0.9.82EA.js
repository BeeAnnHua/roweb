const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const read=r=>JSON.parse(fs.readFileSync(path.join(root,r),'utf8'));
const skill=read('data/skills/skills_core_1.json').skills['44'];
const runtime=read('data/skill_runtime/runtime_generated_all.json').skills['44'];
const rangeConfig=read('data/skill_range_config.json');
const bowItem={id:1001,range:5,dbSubType:'Bow',weaponType:'bow',name:'Test Bow'};
const ctx={console,Math,Date,JSON,Number,String,Object,Array,Set,Map,Promise,performance:{now:()=>Date.now()},window:{},document:{getElementById:()=>null},
 player:{learnedSkills:{'44':10},equipment:{weapon:1001},position:{x:0,y:0},activeBuffs:{},runtimeState:{},skillTimingState:{}},skillsData:{skillIndex:{'44':skill},runtimeProfiles:{'44':runtime}},
 getCurrentJobSkills:()=>[skill],getExtraSkillSkillList:()=>[],getSkillLevel:id=>Number(id?.officialId??id?.id??id)===44?10:0,getSkillDataById:id=>Number(id?.officialId??id?.id??id)===44?skill:null,
 getItemData:id=>Number(id)===1001?bowItem:null,getExtraSkillLevel:()=>0,getSkillPrimaryId:v=>v,getActiveBuffBonusTotals:()=>({}),recalculatePlayerStats:()=>{},addBattleLog:()=>{},saveGame:()=>{},updatePlayerUI:()=>{},requestAnimationFrame:fn=>fn(),matchMedia:()=>({matches:false}),setTimeout,clearTimeout,setInterval:()=>1,clearInterval:()=>{}};
ctx.window=ctx;ctx.window.innerWidth=1280;ctx.window.innerHeight=720;
ctx.window.RO_WEB_DATA={'data/skill_range_config.json':rangeConfig,'data/weapon_types.json':{cellSizePx:36,types:{fist:{attackRangeCells:1},bow:{attackRangeCells:5}}}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/skill_engine.js'),'utf8'),ctx,{filename:'skill_engine.js'});
if(!ctx.isRuntimePassiveSkill(skill))throw new Error('AC_VULTURE not recognized as passive');
const totals=ctx.getPassiveSkillBonusTotals();if(Number(totals.attackRangeCells)!==10)throw new Error(`expected +10 cells, got ${totals.attackRangeCells}`);
vm.runInContext(fs.readFileSync(path.join(root,'js/position_engine.js'),'utf8'),ctx,{filename:'position_engine.js'});
const cells=ctx.getPlayerNormalAttackRangeCells(),pixels=ctx.getPlayerNormalAttackRange();
if(cells!==15||pixels!==540)throw new Error(`range expected 15/540, got ${cells}/${pixels}`);
for(const rel of ['js/player_atlas_runtime.js','js/monster_atlas_runtime.js','js/world_monster_test_runtime.js']){
 const text=fs.readFileSync(path.join(root,rel),'utf8');
 if(/\bnew\s+Image\s*\(/.test(text)||/(^|[^\w])Image\s*\(/m.test(text))throw new Error(`${rel} uses global Image`);
 if(!text.includes('document.createElement("img")'))throw new Error(`${rel} missing DOM img loader`);
}
const atlas=fs.readFileSync(path.join(root,'js/player_atlas_runtime.js'),'utf8');
const declarations=(atlas.match(/^function activateROStudioPlayerCanvas\s*\(/gm)||[]).length;if(declarations!==1)throw new Error(`activate declaration count=${declarations}`);
console.log(JSON.stringify({version:'0.9.82EA',skillId:44,passiveRangeCells:10,totalCells:cells,totalPixels:pixels,imageLoaders:'DOM img element',activateFunctionDeclarations:declarations,status:'PASS'},null,2));
