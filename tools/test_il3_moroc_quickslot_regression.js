const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const readJson=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const checks=[]; const check=(name,ok,detail='')=>checks.push({name,passed:!!ok,detail:String(detail??'')});
const cfg=readJson('data/taiwan_gacha.json');
const idx=readJson('data/items/item_index.json');
const low=readJson('data/equipment/headgear/low.json');
const ee=readJson('data/card_runtime/equipment_effects.json');
const ce=readJson('data/card_runtime/card_effects.json');
const combos=readJson('data/card_runtime/card_combos.json');
const item=idx['420236'];

check('version IL3',cfg.version==='0.9.82IL3',cfg.version);
check('420236 exists',!!item);
check('420236 icon exists',fs.existsSync(path.join(ROOT,'images/items/420236.webp')));
check('420236 is lower head',item?.slot==='headLow'&&item?.locations?.Head_Low===true,JSON.stringify(item?.locations));
check('420236 has no slot and no refine',Number(item?.slots)===0&&item?.refineable===false);
check('420236 level 100',Number(item?.requiredLevel)===100&&Number(item?.equipLevelMin)===100);
check('420236 MDEF 1',Number(item?.mdef)===1&&Number(item?.MagicDefense)===1);
check('420236 low library',!!low['420236']);
check('420236 runtime script',!!ee['420236']?.compiledScript);
check('mistaken 400379 absent',!idx['400379']);

const equipCat=cfg.rareCategories.find(x=>x.id==='taiwan_featured_equipment');
const reward=equipCat.rewards.find(x=>Number(x.itemId)===420236);
check('420236 gacha 0.1%',Number(reward?.chanceBasisPoints)===10,JSON.stringify(reward));
const special=cfg.rareCategories.reduce((a,c)=>a+Number(c.chanceBasisPoints||0),0);
check('gacha total 100%',special+Number(cfg.ordinaryFillBasisPoints)===10000,`${special}+${cfg.ordinaryFillBasisPoints}`);
check('ordinary total 82.26%',Number(cfg.ordinaryFillBasisPoints)===8226,cfg.ordinaryFillBasisPoints);
check('ordinary each 8.226%',Math.abs(Number(cfg.probabilityAudit.ordinaryPerItemBasisPoints)-822.6)<1e-9,cfg.probabilityAudit.ordinaryPerItemBasisPoints);

const comboMap=new Map(combos.map(x=>[(x.requiredItemIds||[]).map(Number).sort((a,b)=>a-b).join('+'),x]));
const requiredPartners=[4910,4913,4916,4919,4922,4925,27322,27323,27321];
for(const partner of requiredPartners) check(`combo ${partner}+420236`,comboMap.has([partner,420236].sort((a,b)=>a-b).join('+')));

function makeContext(data={}){
 const window={RO_WEB_DATA:data,player:{inventory:[],equipment:{},equipmentInstances:{},stats:{str:1,agi:1,vit:1,int:1,dex:1,luk:1},traitStats:{},activeBuffs:{}},setInterval(){return 0;},setTimeout(){return 0;},clearTimeout(){},addEventListener(){},dispatchEvent(){},document:undefined};
 window.window=window; const context={window,player:window.player,console,Date,Math,JSON,Set,Map}; context.globalThis=context; vm.createContext(context); return {window,context};
}
{
 const data={
  'data/card_runtime/card_effects.json':ce,
  'data/card_runtime/card_combos.json':combos,
  'data/card_runtime/equipment_effects.json':ee,
  'data/card_runtime/item_groups.json':{},
  'data/card_runtime/card_drop_sources.json':{},
  'data/enchant_runtime/enchant_effects.json':{},
  'data/jobs.json':readJson('data/jobs.json')
 };
 const {window,context}=makeContext(data); window.getItemData=id=>idx[String(id)]||null;
 vm.runInContext(fs.readFileSync(path.join(ROOT,'js/card_runtime.js'),'utf8'),context);
 const evalRec=(row,c={})=>window.CardRuntime._debugEvaluateRecord(row,c);
 let out=evalRec(ee['420236'],{sourceType:'equipment',hostRow:{slot:'headLow',refine:0}});
 check('base P.ATK/S.MATK',out.pAtk===5&&out.sMatk===5,JSON.stringify(out));
 check('base race physical damage',out.physicalRaceDamage?.DemiHuman===5&&out.physicalRaceDamage?.Angel===5,JSON.stringify(out.physicalRaceDamage));
 check('base race magic damage',out.magicRaceDamage?.DemiHuman===5&&out.magicRaceDamage?.Angel===5,JSON.stringify(out.magicRaceDamage));
 check('base race resistance',out.raceResist?.DemiHuman===3&&out.raceResist?.Angel===3&&out.raceResist?.Player===3,JSON.stringify(out.raceResist));
 const get=partner=>comboMap.get([partner,420236].sort((a,b)=>a-b).join('+'));
 out=evalRec(get(4910),{sourceType:'combo'}); check('Force3 combo',out.shortDamageRate===20&&out.raceResist?.All===-15,JSON.stringify(out));
 out=evalRec(get(4913),{sourceType:'combo'}); check('Intellect3 combo',out.magicAttackElementDamage?.All===20&&out.raceResist?.All===-15,JSON.stringify(out));
 out=evalRec(get(4916),{sourceType:'combo'}); check('Swiftness3 combo',out.afterCastDelayReductionRate===10&&out.maxHpRate===-20,JSON.stringify(out));
 out=evalRec(get(4922),{sourceType:'combo'}); check('Artful3 combo',out.longDamageRate===20&&out.raceResist?.All===-15,JSON.stringify(out));
 out=evalRec(get(4919),{sourceType:'combo'}); check('Tough3 combo',out.maxHpRate===30&&out.aspdRate===-50,JSON.stringify(out));
 out=evalRec(get(4925),{sourceType:'combo'}); check('Fortune3 combo',out.critAtkRate===20&&out.healPowerRate===20&&out.afterCastDelayReductionRate===-10,JSON.stringify(out));
 out=evalRec(get(27323),{sourceType:'combo'}); check('Shnaim all-race combo',out.physicalRaceDamage?.All===15&&out.magicRaceDamage?.All===15,JSON.stringify(out));
 out=evalRec(get(27322),{sourceType:'combo'}); check('Ahat all-size combo',out.sizeDamage?.All===15&&out.magicSizeDamage?.All===15,JSON.stringify(out));
 out=evalRec(get(27321),{sourceType:'combo'}); check('Despair Morroc combo',out.maxHpRate===50&&out.physicalRaceDamage?.All===40,JSON.stringify(out));
}

// Quick-slot assign + keyboard use contract.
{
 const listeners={}; const logs=[]; const uses=[];
 const player={inventory:[{id:9512,count:3}],equipment:{},quickSlots:[]};
 const document={
  activeElement:{tagName:'BODY'},
  getElementById(){return null;},
  addEventListener(type,fn){listeners[type]=fn;}
 };
 const window={player,document,matchMedia(){return {matches:false}},addEventListener(){},getItemData:id=>idx[String(id)]||null,findInventoryItemById:id=>player.inventory.find(x=>String(x.id)===String(id))||null};
 window.window=window;
 const context={window,document,player,console,JSON,Math,Date,
  getItemData:window.getItemData,findInventoryItemById:window.findInventoryItemById,
  saveGame(){},addBattleLog:x=>logs.push(x),useItem:(id,inst,opt)=>uses.push({id,opt}),
  isMobileViewport(){return false}
 };
 context.globalThis=context; vm.createContext(context);
 vm.runInContext(fs.readFileSync(path.join(ROOT,'js/quick_slots.js'),'utf8'),context);
 const assigned=window.assignQuickSlot(0,{type:'item',id:9512},{confirmReplace:false});
 check('9512 assignQuickSlot succeeds',assigned===true,JSON.stringify(player.quickSlots[0]));
 check('9512 persists as item slot',player.quickSlots[0]?.type==='item'&&Number(player.quickSlots[0]?.id)===9512,JSON.stringify(player.quickSlots[0]));
 listeners.keydown?.({repeat:false,key:'1',isTrusted:true,preventDefault(){}});
 check('9512 keyboard shortcut invokes useItem',uses.length===1&&Number(uses[0].id)===9512,JSON.stringify(uses));
 check('9512 shortcut source is authorized',uses[0]?.opt?.source==='quick-slot-key'&&uses[0]?.opt?.userInitiated===true,JSON.stringify(uses[0]));
}

const quickJs=fs.readFileSync(path.join(ROOT,'js/quick_slots.js'),'utf8');
const detailJs=fs.readFileSync(path.join(ROOT,'js/item_instance_ui.js'),'utf8');
const gachaJs=fs.readFileSync(path.join(ROOT,'js/taiwan_gacha_runtime.js'),'utf8');
check('9512 data explicitly quick-slot eligible',idx['9512']?.quickSlotEligible===true);
check('batch detail renders quick picker',detailJs.includes("renderQuickSlotPicker(quickHost, { type: 'item', id: data.id }"));
check('quick-slot manual source accepted',gachaJs.includes('"quick-slot"')&&gachaJs.includes('"quick-slot-key"'));
check('index cache version IL3',fs.readFileSync(path.join(ROOT,'index.html'),'utf8').includes('taiwan_gacha_runtime.js?v=0.9.82IL3'));

const failed=checks.filter(x=>!x.passed);
const report={version:'0.9.82IL3',suite:'420236-and-taiwan-gacha-quickslot',passed:checks.length-failed.length,failed:failed.length,checks};
fs.writeFileSync(path.join(ROOT,'TEST_REPORT_0.9.82IL3_MOROC_QUICKSLOT.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,failed:report.failed,failedChecks:failed},null,2));
if(failed.length) process.exit(1);
