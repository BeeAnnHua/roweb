const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const readJson=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
global.window=global;
global.document={addEventListener(){},getElementById(){return null;},querySelectorAll(){return[];}};
global.setInterval=()=>0;
global.CustomEvent=function(name,init){this.type=name;this.detail=init?.detail};
global.dispatchEvent=()=>true;
global.RO_WEB_DATA={
  'data/card_runtime/card_effects.json':readJson('data/card_runtime/card_effects.json'),
  'data/card_runtime/card_combos.json':readJson('data/card_runtime/card_combos.json'),
  'data/card_runtime/item_groups.json':readJson('data/card_runtime/item_groups.json'),
  'data/card_runtime/card_drop_sources.json':readJson('data/card_runtime/card_drop_sources.json'),
  'data/card_runtime/equipment_effects.json':readJson('data/card_runtime/equipment_effects.json'),
  'data/enchant_runtime/enchant_effects.json':readJson('data/enchant_runtime/enchant_effects.json'),
  'data/items/item_index.json':readJson('data/items/item_index.json'),
  'data/jobs.json':readJson('data/jobs.json')
};
global.skillsData={skillIndex:{}};
global.jobsData=global.RO_WEB_DATA['data/jobs.json'];
global.getItemData=id=>global.RO_WEB_DATA['data/items/item_index.json'][String(id)]||null;
global.getSkillDataById=id=>global.skillsData?.skillIndex?.[String(id)]||null;
global.getSkillLevel=()=>10;
global.player={baseLevel:275,jobLevel:60,job:'Job_Dragon_Knight',jobKey:'dragon_knight',gender:'male',stats:{str:130,agi:130,vit:130,int:130,dex:130,luk:130},traitStats:{pow:110,sta:0,wis:0,spl:110,con:110,crt:0},learnedSkills:{},equipment:{weapon:600030},equipmentInstances:{weapon:{id:600030,instanceId:'test_weapon',refine:12,enchantGrade:4,cards:[null,null,null,null],enchants:[]}}};
global.getEquipmentInstance=slot=>global.player.equipmentInstances[slot]||null;
vm.runInThisContext(fs.readFileSync(path.join(ROOT,'js/card_runtime.js'),'utf8'),{filename:'card_runtime.js'});
CardRuntime.init();
const data=global.RO_WEB_DATA['data/enchant_runtime/enchant_effects.json'];
const rows=[];
for(const id of Object.keys(data)){
  const rec=CardRuntime.getRuntimeRecord(id,'enchant');
  const out=CardRuntime._debugEvaluateRecord(rec,{sourceType:'enchant',slot:'weapon',hostRow:{slot:'weapon',itemId:600030,item:getItemData(600030),instance:player.equipmentInstances.weapon,refine:12,grade:4},equippedIds:[600030,Number(id)],maxRefine:12,maxGrade:4});
  rows.push({id:Number(id),name:data[id].name,runtimeError:out.runtimeError||null,rawBonuses:Object.keys(out.rawBonuses||{}),keys:Object.keys(out).filter(k=>!['id','name','sourceType','sourceId'].includes(k))});
}
const failures=rows.filter(x=>x.runtimeError||x.rawBonuses.length);
const samples=[311192,311449,311453,311443].map(id=>{
 const rec=CardRuntime.getRuntimeRecord(id,'enchant');
 return {id,name:data[id]?.name,out:CardRuntime._debugEvaluateRecord(rec,{sourceType:'enchant',slot:'weapon',hostRow:{slot:'weapon',itemId:600030,item:getItemData(600030),instance:player.equipmentInstances.weapon,refine:12,grade:4},equippedIds:[600030,id],maxRefine:12,maxGrade:4})};
});
const report={version:CardRuntime.version,count:rows.length,failures,samples,buildCounts:CardRuntime.getBuildCounts()};
fs.writeFileSync(path.join(ROOT,'GY_ENCHANT_EFFECT_RUNTIME_TEST.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({count:rows.length,failureCount:failures.length,firstFailures:failures.slice(0,10),buildCounts:report.buildCounts},null,2));
process.exit(failures.length?1:0);
