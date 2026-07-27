const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');let passed=0;
function ok(v,msg){if(!v)throw new Error(msg);passed++;console.log('PASS:',msg);}
// Grade material rate and duplicate-original guard.
global.window=global;global.document=undefined;window.RO_WEB_DATA={};
for(const f of ['enchant_grade_rules.json','enchant_grade_exchange.json','enchant_grade_map_drops.json','server_config.json'])window.RO_WEB_DATA['data/'+f]=JSON.parse(fs.readFileSync(path.join(ROOT,'data',f),'utf8'));
const itemIndex=JSON.parse(fs.readFileSync(path.join(ROOT,'data/items/item_index.json'),'utf8'));
window.getItemData=id=>itemIndex[String(Number(id))]||{id:Number(id),name:`Item ${id}`};
window.player={zeny:0,inventory:[],equipment:{},equipmentInstances:{},map:'ice_scale_hill_3x3_region_camera'};window.currentMap={id:player.map};
window.addItem=(x,q=1)=>player.inventory.push({id:Number(x.id),count:q});
for(const fn of ['saveGame','recalculatePlayerStats','updatePlayerUI','updateInventoryUI','updateEquipmentUI','updateStatusUI','updateQuickSlotUI','addBattleLog','recordItemDrop','emitLootRewardLog'])window[fn]=()=>{};
vm.runInThisContext(fs.readFileSync(path.join(ROOT,'js/enchant_grade_runtime.js'),'utf8'));
const G=window.EnchantGradeRuntime;
ok(G.getGradeMaterialDropRate()===100,'grade rate 100 reads as 1x');
ok(G.getScaledGradeDropChance(75)===75,'75 basis points stays 75 at 100% valve');
window.RO_WEB_DATA['data/server_config.json'].server.rates.gradeMaterialDropRate=200;
ok(G.getScaledGradeDropChance(75)===150,'200 setting doubles independent grade drop');
window.RO_WEB_DATA['data/server_config.json'].server.rates.gradeMaterialDropRate=0;
ok(G.getScaledGradeDropChance(75)===0,'0 setting disables independent grade drop');
window.RO_WEB_DATA['data/server_config.json'].server.rates.gradeMaterialDropRate=100;
Math.random=()=>0;let awards=G.rollMapBonusDrops({id:21525,drops:[{itemId:1000322}],mvpDrops:[]});
ok(!awards.some(x=>x.itemId===1000322),'original drop prevents duplicated bonus material roll');
// Extract copied-resource helper and verify native skill remains charged.
const skillSource=fs.readFileSync(path.join(ROOT,'js/skill_engine.js'),'utf8');
function extract(name){const start=skillSource.indexOf(`function ${name}`);if(start<0)throw new Error('missing '+name);let open=skillSource.indexOf('{',start),depth=0;for(let i=open;i<skillSource.length;i++){if(skillSource[i]==='{')depth++;else if(skillSource[i]==='}'&&--depth===0)return skillSource.slice(start,i+1);}throw new Error('unterminated '+name);}
const context={window:null,Number,String,Array,Object,Math};context.window=context;vm.createContext(context);vm.runInContext(extract('isCopiedSkillResourceWaived'),context);
ok(context.isCopiedSkillResourceWaived({id:2329,extraSkill:true,extraSourceType:'reproduce'})===true,'reproduced skill waives original profession resource');
ok(context.isCopiedSkillResourceWaived({id:2329,extraSkill:true,extraSourceType:'plagiarism'})===true,'plagiarized skill waives original profession resource');
ok(context.isCopiedSkillResourceWaived({id:2329,extraSkill:false})===false,'native profession skill still requires resource');
console.log(JSON.stringify({version:'0.9.82GL',passed}));
