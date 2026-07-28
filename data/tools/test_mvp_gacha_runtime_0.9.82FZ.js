#!/usr/bin/env node
const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const read=rel=>JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'));
const cfg=read('data/mvp_gacha.json');
const itemIndex=read('data/items/item_index.json');
const checks=[];
const check=(ok,name,detail='')=>checks.push({ok:!!ok,name,detail:String(detail)});

global.window=global;
global.document=undefined;
global.RO_WEB_DATA={'data/mvp_gacha.json':cfg};
global.player={name:'測試者',inventory:[],activeBuffs:{},hp:100,maxHp:1000,sp:20,maxSp:200,equipment:{},equipmentInstances:{}};
global.getItemData=id=>itemIndex[String(id)]||{id:Number(id),name:`Item ${id}`,type:'consume'};
global.findInventoryItemById=id=>player.inventory.find(x=>String(x.id)===String(id)&&!x.instanceId)||null;
global.canUseConsumableItem=()=>({ok:true});
global.markConsumableItemUsed=()=>true;
global.recalculatePlayerStats=()=>{};
global.updatePlayerUI=()=>{};
global.updateInventoryUI=()=>{};
global.saveGame=()=>{};
global.invalidateCardRuntime=()=>{};
global.addBattleLog=()=>{};
const awarded=[];
global.addItem=(item,count=1)=>{
  const data=getItemData(item.id)||item;
  if(String(data.type||'').toLowerCase()==='equipment'){
    for(let i=0;i<count;i++){const row={id:Number(item.id),itemId:Number(item.id),name:data.name,count:1,instanceId:`fz-${item.id}-${awarded.length}-${i}`,refine:0,enchantGrade:0,cards:[],enchants:[]};player.inventory.push(row);awarded.push({id:Number(item.id),count:1,equipment:true});}
  }else{
    let row=findInventoryItemById(item.id);if(!row){row={id:Number(item.id),name:data.name,count:0};player.inventory.push(row);}row.count+=count;awarded.push({id:Number(item.id),count,equipment:false});
  }
};
const recorded=[];global.recordItemDrop=(id,qty)=>recorded.push({id:Number(id),qty:Number(qty)});
global.useItem=()=>false;
vm.runInThisContext(fs.readFileSync(path.join(ROOT,'js/mvp_gacha_runtime.js'),'utf8'),{filename:'mvp_gacha_runtime.js'});

check(MvpGachaRuntime.version==='0.9.82FZ','Runtime version',MvpGachaRuntime.version);
const rareSum=cfg.rareCategories.reduce((s,x)=>s+Number(x.chanceBasisPoints||0),0);
check(rareSum===121&&cfg.ordinaryFillBasisPoints===9879&&rareSum+cfg.ordinaryFillBasisPoints===10000,'Single mother pool totals exactly 100%',`${rareSum}+${cfg.ordinaryFillBasisPoints}`);
check(JSON.stringify(cfg.rareCategories.map(x=>[x.id,x.chanceBasisPoints,x.tier]))===JSON.stringify([
 ['kiel_card',1,'gold'],['anniversary_20th',10,'purple'],['temporal_transcendent',100,'red'],['temporal_lt',10,'purple']
]),'Rare tier probabilities and colors','PASS');
check(cfg.ordinaryRewards.length===16&&cfg.ordinaryRewards.reduce((s,x)=>s+Number(x.weight||0),0)===200,'Ordinary reward source weights preserved',cfg.ordinaryRewards.length);

// deterministic reward tiers
const oldRandom=Math.random;
function withRandom(values,fn){let i=0;Math.random=()=>values[Math.min(i++,values.length-1)];try{return fn();}finally{Math.random=oldRandom;}}
let result=withRandom([0,0],()=>MvpGachaRuntime.rollReward());
check(result.rare&&result.category.id==='kiel_card'&&result.row.itemId===4403,'0.01% gold reward branch',JSON.stringify(result));
result=withRandom([1/10000,0.75],()=>MvpGachaRuntime.rollReward());
check(result.rare&&result.category.id==='anniversary_20th'&&[400368,420186].includes(result.row.itemId),'0.1% anniversary branch awards hat or balloon separately',JSON.stringify(result.row));
result=withRandom([11/10000,0],()=>MvpGachaRuntime.rollReward());
check(result.rare&&result.category.id==='temporal_transcendent','1% red Temporal branch',result.category.id);
result=withRandom([111/10000,0],()=>MvpGachaRuntime.rollReward());
check(result.rare&&result.category.id==='temporal_lt','0.1% purple LT branch',result.category.id);
result=withRandom([121/10000,0],()=>MvpGachaRuntime.rollReward());
check(!result.rare&&result.row.itemId===14849,'Ordinary branch starts after absolute rare range',JSON.stringify(result.row));

// map-exclusive drop: identical MVP outside map must never get gacha
player.inventory=[];awarded.length=0;recorded.length=0;
global.currentMap={id:'prontera_3x3_region_camera'};
let monster={id:1038,isMvp:true,lootRuntime:{}};
let dropped=withRandom([0],()=>MvpGachaRuntime.rollMapExclusiveDrop(monster));
check(dropped===false&&!findInventoryItemById(cfg.gachaItemId),'Same MVP outside arena never receives added gacha drop',dropped);

global.currentMap={id:cfg.mapId};monster={id:1038,isMvp:true,lootRuntime:{}};
dropped=withRandom([0],()=>MvpGachaRuntime.rollMapExclusiveDrop(monster));
check(dropped===true&&findInventoryItemById(cfg.gachaItemId)?.count===1&&recorded.some(x=>x.id===cfg.gachaItemId),'Arena MVP exact 1% hook grants and records gacha','PASS');
check(withRandom([0],()=>MvpGachaRuntime.rollMapExclusiveDrop(monster))===false&&findInventoryItemById(cfg.gachaItemId)?.count===1,'Per-death map drop guard prevents double roll','PASS');
const normal={id:1002,isMvp:false,lootRuntime:{}};
check(withRandom([0],()=>MvpGachaRuntime.rollMapExclusiveDrop(normal))===false,'Non-MVP never receives arena gacha drop','PASS');

// opening consumes exactly one and equipment is independent instance
player.inventory=[{id:cfg.gachaItemId,name:'MVP幸運轉蛋',count:2}];awarded.length=0;
const opened=withRandom([0,0],()=>MvpGachaRuntime.openGacha(getItemData(cfg.gachaItemId)));
check(opened===true&&findInventoryItemById(cfg.gachaItemId)?.count===1,'Opening consumes exactly one gacha',findInventoryItemById(cfg.gachaItemId)?.count);
check(player.inventory.some(x=>x.id===4403),'Gold card reward enters inventory',JSON.stringify(player.inventory));
player.inventory=[{id:cfg.gachaItemId,name:'MVP幸運轉蛋',count:1}];awarded.length=0;
withRandom([11/10000,0],()=>MvpGachaRuntime.openGacha(getItemData(cfg.gachaItemId)));
check(player.inventory.some(x=>x.instanceId&&[450175,480076,22202,490030,490097].includes(x.id)),'Gacha equipment creates independent equipment instance','PASS');

// consumables actually apply
player.activeBuffs={};player.inventory=[{id:14849,name:'體力料理',count:1}];
check(MvpGachaRuntime.applyCashFood(getItemData(14849))===true&&Object.values(player.activeBuffs).some(x=>x.effects?.vitFlat===10),'Cash food applies a live 30-minute stat buff',JSON.stringify(player.activeBuffs));
player.inventory=[{id:23221,name:'靈巧棒棒條',count:1}];
withRandom([0],()=>MvpGachaRuntime.applyCashFood(getItemData(23221)));
const dexBuff=Object.values(player.activeBuffs).find(x=>x.effects?.dexFlat===15);
const hitBuff=Object.values(player.activeBuffs).find(x=>x.effects?.hitFlat>=11);
check(dexBuff&&hitBuff&&hitBuff.effects.hitFlat>=11&&hitBuff.effects.hitFlat<=33,'Biscuit stick rolls and applies additional HIT',JSON.stringify({dexBuff,hitBuff}));
player.hp=100;player.maxHp=1000;player.sp=20;player.maxSp=200;player.inventory=[{id:12739,name:'天雪花',count:1}];
check(MvpGachaRuntime.applyPercentHeal(getItemData(12739))===true&&player.hp===200&&player.sp===40,'Snow Flower restores 10% MaxHP and MaxSP',`${player.hp}/${player.sp}`);

const report={version:'0.9.82FZ',summary:{checks:checks.length,passed:checks.filter(x=>x.ok).length,failed:checks.filter(x=>!x.ok).length},checks};
fs.writeFileSync(path.join(ROOT,'tools/test_mvp_gacha_runtime_report_0.9.82FZ.json'),JSON.stringify(report,null,2)+'\n');
process.stdout.write(JSON.stringify(report,null,2)+'\n');
process.exit(report.summary.failed?1:0);
