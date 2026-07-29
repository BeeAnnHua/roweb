const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
global.window=global;global.document=undefined;
const loadJson=f=>JSON.parse(fs.readFileSync(path.join(ROOT,'data',f),'utf8'));
window.RO_WEB_DATA={
  'data/enchant_grade_map_drops.json':loadJson('enchant_grade_map_drops.json'),
  'data/enchant_grade_rules.json':loadJson('enchant_grade_rules.json'),
  'data/enchant_grade_exchange.json':loadJson('enchant_grade_exchange.json'),
  'data/server_config.json':loadJson('server_config.json')
};
window.serverConfig=window.RO_WEB_DATA['data/server_config.json'];
window.currentMap={id:'ice_scale_hill_3x3_region_camera'};
window.player={inventory:[]};
const got=[];
window.getItemData=id=>({id,name:`Item ${id}`});
window.addItem=(item,qty)=>got.push({id:item.id,qty});
window.recordItemDrop=()=>{};window.emitLootRewardLog=()=>{};
let rate=100;
window.applyRate=(raw,key)=>key==='drop'?Math.floor(Number(raw)*rate/100):Number(raw);
window.getFinalDropChanceBasisPoints=(raw,cat)=>Math.max(0,Math.min(10000,Math.floor(window.applyRate(raw,'drop'))));
vm.runInThisContext(fs.readFileSync(path.join(ROOT,'js/enchant_grade_runtime.js'),'utf8'),{filename:'enchant_grade_runtime.js'});
function assert(cond,msg){if(!cond)throw new Error(msg);console.log('PASS',msg)}
const prof=window.EnchantGradeRuntime.dropProfiles().profiles.ice_scale_hill_3x3_region_camera;
const dense=prof.entries.find(e=>e.itemId===6225),etel=prof.entries.find(e=>e.itemId===1000368);
rate=100; assert(window.EnchantGradeRuntime.getScaledMapDropChance(dense)===100,'1% remains 1% at drop=100');
assert(window.EnchantGradeRuntime.getScaledMapDropChance(etel)===500,'5% remains 5% at drop=100');
rate=200; assert(window.EnchantGradeRuntime.getScaledMapDropChance(dense)===200,'1% becomes 2% at drop=200');
assert(window.EnchantGradeRuntime.getScaledMapDropChance(etel)===1000,'5% becomes 10% at drop=200');
rate=10000; assert(window.EnchantGradeRuntime.getScaledMapDropChance(dense)===10000,'1% caps at 100% at current drop=10000');
window.currentMap={id:'serpent_nest_3x3_region_camera'};
const serpentItems=window.EnchantGradeRuntime.dropProfiles().profiles.serpent_nest_3x3_region_camera.entries.map(e=>e.itemId);
for(const id of [6225,6226,1000368,1000369,1000370,1000371])assert(!serpentItems.includes(id),`serpent excludes ${id}`);
console.log(JSON.stringify({version:window.EnchantGradeRuntime.version,passed:true}));
