#!/usr/bin/env node
const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const read=rel=>JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'));
const effects=read('data/card_runtime/card_effects.json');
const combos=read('data/card_runtime/card_combos.json');
const groups=read('data/card_runtime/item_groups.json');
const drops=read('data/card_runtime/card_drop_sources.json');

global.window=global;
global.document={addEventListener(){}};
global.RO_WEB_DATA={
  'data/card_runtime/card_effects.json':effects,
  'data/card_runtime/card_combos.json':combos,
  'data/card_runtime/item_groups.json':groups,
  'data/card_runtime/card_drop_sources.json':drops,
  'data/jobs.json':{}
};
global.setInterval=()=>0;
const itemMap={};
for(const row of Object.values(effects))itemMap[String(row.id)]=row;
const weapon={id:990001,type:'equipment',name:'測試四洞武器',slotCount:4,slots:4,equipSlot:'weapon',locations:{Right_Hand:true},weaponType:'sword'};
const shoes={id:990002,type:'equipment',name:'測試四洞鞋子',slotCount:4,slots:4,equipSlot:'shoes',locations:{Shoes:true}};
const accessory={id:990003,type:'equipment',name:'測試雙側飾品',slotCount:1,slots:1,slot:'accessory1',locations:{Both_Accessory:true}};
itemMap[String(weapon.id)]=weapon; itemMap[String(shoes.id)]=shoes; itemMap[String(accessory.id)]=accessory;
global.getItemData=id=>itemMap[String(id)]||null;
global.getSkillLevel=()=>10;
global.getEquipmentInstance=slot=>global.player?.equipmentInstances?.[slot]||null;
const noop=()=>{};
Object.assign(global,{recalculatePlayerStats:noop,updateInventoryUI:noop,updateEquipmentUI:noop,updatePlayerUI:noop,saveGame:noop,syncEquipmentGrantedSkills:noop});
function resetPlayer(){
 global.player={baseLevel:275,jobLevel:60,job:'dragon_knight',jobKey:'dragon_knight',gender:'male',stats:{str:120,agi:120,vit:120,int:120,dex:120,luk:120},traitStats:{pow:110,sta:110,wis:110,spl:110,con:110,crt:110},learnedSkills:{},equipment:{},equipmentInstances:{},inventory:[],hp:10000,maxHp:10000,sp:1000,maxSp:1000,zeny:5000000};
 global.addItem=(item,count=1)=>{
   const id=Number(item?.id??item); let row=player.inventory.find(x=>Number(x.id)===id&&!x.instanceId);
   if(!row){row={id,count:0,name:item?.name||getItemData(id)?.name};player.inventory.push(row);} row.count+=Number(count)||1; return row;
 };
}
resetPlayer();
vm.runInThisContext(fs.readFileSync(path.join(ROOT,'js/card_runtime.js'),'utf8'),{filename:'card_runtime.js'});
CardRuntime.init();
const failures=[]; const assert=(cond,msg)=>{if(!cond)failures.push(msg)};

// Every generated script must execute without runtime errors or unknown raw bonus types.
let runtimeErrors=[]; const raw={};
for(const record of [...Object.values(effects),...combos]){
  const out=CardRuntime._debugEvaluateRecord(record,{hostRow:{refine:20,itemId:weapon.id,item:weapon},maxRefine:20,equippedIds:[...(record.requiredItemIds||[]),record.id]});
  if(out.runtimeError)runtimeErrors.push([record.id,out.runtimeError]);
  for(const [k,v] of Object.entries(out.rawBonuses||{}))raw[k]=(raw[k]||0)+(Array.isArray(v)?v.length:1);
}
assert(runtimeErrors.length===0,`script runtime errors=${runtimeErrors.length}`);
assert(Object.keys(raw).length===0,`unknown raw bonuses=${JSON.stringify(raw)}`);
const counts=CardRuntime.getBuildCounts();
assert(counts.cards===910,`cards=${counts.cards}`);
assert(counts.combos===784,`combos=${counts.combos}`);
assert(counts.dropSources===1422,`dropSources=${counts.dropSources}`);

// Insert a compatible weapon card into an inventory equipment instance.
const weaponCard=Object.values(effects).find(x=>Array.isArray(x.cardTarget)&&x.cardTarget.includes('weapon')&&!x.isMvpCard);
assert(!!weaponCard,'no regular weapon card found');
const instance={id:weapon.id,instanceId:'test-weapon-1',cards:[null,null,null,null],refine:10};
player.inventory.push({id:weaponCard.id,count:1,name:weaponCard.name},instance);
let result=CardRuntime.socketCard(weaponCard.id,instance.instanceId);
assert(result.ok,'socketCard should succeed');
assert(instance.cards[0]===weaponCard.id,'socketed card ID not written');
assert(!player.inventory.some(x=>x.id===weaponCard.id&&!x.instanceId),'card stack should be consumed');

// Both-side accessory equipment must accept generic, left-only and right-only card locations.
const genericAccessoryCard=Object.values(effects).find(x=>Array.isArray(x.cardTarget)&&x.cardTarget.includes('accessory'));
const leftAccessoryCard=Object.values(effects).find(x=>Array.isArray(x.cardTarget)&&x.cardTarget.includes('accessory1'));
const rightAccessoryCard=Object.values(effects).find(x=>Array.isArray(x.cardTarget)&&x.cardTarget.includes('accessory2'));
assert(CardRuntime.isCardCompatible(genericAccessoryCard,accessory,accessory.slot),'generic accessory compatibility');
assert(CardRuntime.isCardCompatible(leftAccessoryCard,accessory,accessory.slot),'left accessory compatibility');
assert(CardRuntime.isCardCompatible(rightAccessoryCard,accessory,accessory.slot),'right accessory compatibility');

// Successful regular removal: fee, unequip, gear + card returned.
player.inventory=player.inventory.filter(x=>x!==instance);
player.equipment.weapon=weapon.id; player.equipmentInstances.weapon=instance;
const beforeSuccessZeny=player.zeny;
result=CardRuntime.removeAllCardsFromEquipped('weapon',()=>0.0);
assert(result.ok&&result.chance===50&&!result.hasMvp,'regular removal chance/result incorrect');
assert(player.zeny===beforeSuccessZeny-1000000,'success fee incorrect');
assert(!player.equipment.weapon&&!player.equipmentInstances.weapon,'successful removal must unequip');
assert(player.inventory.includes(instance),'successful removal must return gear instance');
assert(instance.cards.every(x=>!x),'successful removal must clear slots');
assert(player.inventory.some(x=>Number(x.id)===weaponCard.id&&Number(x.count)>=1),'successful removal must return card');

// Failed removal: fee still charged, equipment and cards preserved.
resetPlayer();
const failInstance={id:weapon.id,instanceId:'test-weapon-fail',cards:[weaponCard.id,null,null,null],refine:10};
player.equipment.weapon=weapon.id; player.equipmentInstances.weapon=failInstance;
const beforeFailZeny=player.zeny;
result=CardRuntime.removeAllCardsFromEquipped('weapon',()=>0.99);
assert(!result.ok&&result.failed&&result.chance===50,'regular failure result incorrect');
assert(player.zeny===beforeFailZeny-1000000,'failure fee incorrect');
assert(player.equipmentInstances.weapon===failInstance&&failInstance.cards[0]===weaponCard.id,'failure must preserve equipment/card');

// Any MVP card makes the whole attempt 10%.
const mvpShoeCard=Object.values(effects).find(x=>x.isMvpCard&&Array.isArray(x.cardTarget)&&x.cardTarget.includes('shoes'));
assert(!!mvpShoeCard,'no MVP shoe card found');
resetPlayer();
const mvpInstance={id:shoes.id,instanceId:'test-shoes-mvp',cards:[mvpShoeCard?.id,null,null,null],refine:0};
player.equipment.shoes=shoes.id; player.equipmentInstances.shoes=mvpInstance;
result=CardRuntime.removeAllCardsFromEquipped('shoes',()=>0.05);
assert(result.ok&&result.hasMvp&&result.chance===10,'MVP removal chance/result incorrect');

assert(groups.IG_FOOD.entries.length===22,'IG_FOOD missing');
assert(groups.IG_RECOVERY.entries.length===14,'IG_RECOVERY missing');

const report={version:'0.9.82FV',cards:Object.keys(effects).length,combos:combos.length,dropSources:Object.values(drops).reduce((n,x)=>n+x.length,0),runtimeErrors:runtimeErrors.length,unknownBonuses:raw,socketRemovalTests:failures.length? 'FAIL':'PASS',failures};
fs.writeFileSync(path.join(ROOT,'tools/test_card_runtime_report_0.9.82FV.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
process.exit(failures.length?1:0);
