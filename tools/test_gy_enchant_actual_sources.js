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
const instance={id:600030,itemId:600030,instanceId:'gy-source-test',refine:12,enchantGrade:4,cards:[null,null,null,null],enchants:[
 {id:311192,name:'雪花魔力（龍之氣息）',slot:4,playerSlot:4},
 {id:311449,name:'雪花魔力（物理等級） Lv.1',slot:2,playerSlot:2}
]};
global.player={baseLevel:275,jobLevel:60,job:'Job_Dragon_Knight',jobKey:'dragon_knight',gender:'male',stats:{str:130,agi:130,vit:130,int:130,dex:130,luk:130},traitStats:{pow:110,sta:0,wis:0,spl:110,con:110,crt:0},learnedSkills:{},equipment:{weapon:600030},equipmentInstances:{weapon:instance},inventory:[]};
global.getEquipmentInstance=slot=>global.player.equipmentInstances[slot]||null;
vm.runInThisContext(fs.readFileSync(path.join(ROOT,'js/card_runtime.js'),'utf8'),{filename:'card_runtime.js'});
CardRuntime.init();
const sources=CardRuntime.getSources();
const enchantSources=sources.filter(x=>x.sourceType==='enchant');
const merged=CardRuntime.getMergedSource();
const dragonKeys=Object.entries(merged.skillDamageRate||{}).filter(([k])=>/DRAGONBREATH|WATER/i.test(k));
const checks=[];
function check(name,pass,detail){checks.push({name,pass:Boolean(pass),detail});}
check('two actual enchant sources',enchantSources.length===2,enchantSources.map(x=>({id:x.sourceId,name:x.name,slot:x.slot})));
check('slot 4 actual source',enchantSources.some(x=>Number(x.sourceId)===311192&&Number(x.enchantSlot)===4),enchantSources.map(x=>({id:x.sourceId,slot:x.enchantSlot})));
check('slot 2 actual source',enchantSources.some(x=>Number(x.sourceId)===311449&&Number(x.enchantSlot)===2),enchantSources.map(x=>({id:x.sourceId,slot:x.enchantSlot})));
check('physical grade atkFlat applies',Number(merged.atkFlat||0)>=30,merged.atkFlat);
check('physical grade short damage applies',Number(merged.shortDamageRate||0)>=3,merged.shortDamageRate);
check('physical grade long damage applies',Number(merged.longDamageRate||0)>=3,merged.longDamageRate);
check('dragon breath skill rate applies',dragonKeys.some(([,v])=>Number(v)>=100),dragonKeys);
check('no runtime errors',!(CardRuntime.getDiagnostics().runtimeErrors||[]).length,CardRuntime.getDiagnostics());
const failed=checks.filter(x=>!x.pass);
const report={version:CardRuntime.version,checks,passed:checks.length-failed.length,failed:failed.length,enchantSources:enchantSources.map(x=>({id:x.sourceId,name:x.name,slot:x.enchantSlot})),mergedSamples:{atkFlat:merged.atkFlat,shortDamageRate:merged.shortDamageRate,longDamageRate:merged.longDamageRate,skillDamageRate:dragonKeys}};
fs.writeFileSync(path.join(ROOT,'GY_ENCHANT_ACTUAL_SOURCE_TEST.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
process.exit(failed.length?1:0);
