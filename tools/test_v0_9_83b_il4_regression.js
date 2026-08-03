const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const text=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const checks=[]; const check=(name,ok,detail='')=>checks.push({name,passed:!!ok,detail:String(detail??'')});
const cfg=read('data/taiwan_gacha.json'),idx=read('data/items/item_index.json');
const ee=read('data/card_runtime/equipment_effects.json'),ce=read('data/card_runtime/card_effects.json');
const combos=read('data/card_runtime/card_combos.json'),jobs=read('data/jobs.json');
const mainEquipment=[410254,420199,400511,490088,400401,28902,420236];
const mainCards=[27323,27322,4509,4507,4148,27321];
const combo=(...ids)=>combos.find(r=>{const a=(r.requiredItemIds||[]).map(Number).sort((x,y)=>x-y);const b=ids.map(Number).sort((x,y)=>x-y);return JSON.stringify(a)===JSON.stringify(b);});

check('version IL4',cfg.version==='0.9.82IL4',cfg.version);
check('gacha total 100%',cfg.rareCategories.reduce((s,c)=>s+Number(c.chanceBasisPoints||0),0)+Number(cfg.ordinaryFillBasisPoints)===10000);
check('9512 quick-slot eligible',idx['9512']?.quickSlotEligible===true);
check('9512 manual use only',idx['9512']?.manualUseOnly===true&&idx['9512']?.autoUse===false);
check('400379 remains absent',!idx['400379']);
check('300084 not in gacha',!cfg.rareCategories.some(c=>(c.rewards||[]).some(r=>Number(r.itemId)===300084)));
check('300084 original identity restored',idx['300084']?.name==='夢魘干扁草精卡片'&&idx['300084']?.cardTarget?.includes('garment')&&ce['300084']?.aegisName==='Dry_Rafflesia_H_Card'&&ce['300084']?.compiledScript?.includes('Ele_Holy')&&ce['300084']?.compiledScript?.includes('bFlee'));
const rewardChance=new Map();for(const category of cfg.rareCategories||[])for(const row of category.rewards||[])rewardChance.set(Number(row.itemId),Number(row.chanceBasisPoints||0));
check('apostle card odds exact',rewardChance.get(27323)===100&&rewardChance.get(27322)===100);
check('featured equipment odds exact',mainEquipment.every(id=>rewardChance.get(id)===10));
check('MVP card odds exact',mainCards.filter(id=>![27323,27322].includes(id)).every(id=>rewardChance.get(id)===1));
check('support reward odds exact',rewardChance.get(6635)===500&&rewardChance.get(12806)===1000);
check('ordinary material pool exact',cfg.ordinaryFillBasisPoints===8226&&cfg.ordinaryRewards?.length===10&&cfg.ordinaryRewards.every(r=>Number(r.weight)===1));
for(const id of [...mainEquipment,...mainCards,9512,12806]){
  check(`item ${id} exists`,!!idx[String(id)]);
  check(`icon ${id} exists`,fs.existsSync(path.join(ROOT,`images/items/${id}.webp`)));
}
for(const id of mainEquipment)check(`equipment runtime ${id}`,!!ee[String(id)]?.compiledScript);
for(const id of mainCards)check(`card runtime ${id}`,!!ce[String(id)]?.compiledScript);

const randomQueue=[]; const customMath=Object.create(Math); customMath.random=()=>randomQueue.length?randomQueue.shift():0.5;
const logs=[],awards=[],uses=[];
const player={inventory:[{id:9512,count:3}],equipment:{},equipmentInstances:{},stats:{str:1,agi:1,vit:1,int:1,dex:1,luk:1},traitStats:{pow:0,sta:0,wis:0,spl:0,con:0,crt:0},activeBuffs:{},quickSlots:[],learnedSkills:{},cardRuntimeTempBonuses:{}};
const window={RO_WEB_DATA:{
  'data/card_runtime/card_effects.json':ce,'data/card_runtime/card_combos.json':combos,
  'data/card_runtime/equipment_effects.json':ee,'data/card_runtime/item_groups.json':{},
  'data/card_runtime/card_drop_sources.json':read('data/card_runtime/card_drop_sources.json'),
  'data/enchant_runtime/enchant_effects.json':{},'data/jobs.json':jobs,'data/taiwan_gacha.json':cfg
},player,jobsData:jobs,currentMap:{id:cfg.mapId},setInterval(){return 0;},setTimeout(){return 0;},clearTimeout(){},addEventListener(){},dispatchEvent(){},document:undefined};
window.window=window; window.getItemData=id=>idx[String(id)]||null; window.getEquipmentInstance=slot=>player.equipmentInstances?.[slot]||null;
window.addBattleLog=(msg)=>logs.push(String(msg)); window.addItem=(item,qty)=>awards.push({id:Number(item.id),qty:Number(qty)}); window.recordItemDrop=()=>{}; window.applyRate=x=>x;
const context={window,player,console,Date,Math:customMath,JSON,Set,Map,CustomEvent:function(type,o){this.type=type;this.detail=o?.detail;}};context.globalThis=context;vm.createContext(context);
vm.runInContext(text('js/modifier_key_runtime.js'),context);
vm.runInContext(text('js/card_runtime.js'),context);
vm.runInContext(text('js/effect_runtime.js'),context);
const CR=window.CardRuntime;
const evalRec=(r,c={})=>CR._debugEvaluateRecord(r,c);
const reset=(equipment={},instances={},extra={})=>{player.equipment=equipment;player.equipmentInstances=instances;player.stats=extra.stats||{str:1,agi:1,vit:1,int:1,dex:1,luk:1};player.traitStats=extra.traits||{pow:0,sta:0,wis:0,spl:0,con:0,crt:0};player.job=extra.job||'novice';player.jobKey=extra.job||'novice';player.cardRuntimeTempBonuses={};CR.invalidate();return CR.getMergedSource();};

// Base equipment exact values.
player.stats={str:17,agi:17,vit:17,int:17,dex:17,luk:17};
let out=evalRec(ee['410254'],{sourceType:'equipment',hostRow:{slot:'headMid',refine:0}});
check('410254 base-stat tiers',out.atkFlat===24&&out.matkFlat===24,JSON.stringify(out));
out=evalRec(ee['420199'],{sourceType:'equipment',hostRow:{slot:'headLow',refine:0}});
check('420199 base cast effects',out.variableCastReductionRate===8&&out.afterCastDelayReductionRate===5&&out.fixedCastReductionMs===100,JSON.stringify(out));
out=evalRec(ee['400511'],{sourceType:'equipment',hostRow:{slot:'headTop',refine:13}});
check('400511 +13 thresholds',out.powFlat===3&&out.conFlat===3&&out.crtFlat===3&&out.atkFlat===120&&out.criFlat===24&&out.critAtkRate===40&&out.atkRate===10&&out.afterCastDelayReductionRate===10&&out.shortDamageRate===15&&out.longDamageRate===15&&out.physicalRaceDamage?.All===15&&out.fixedCastReductionMs===500,JSON.stringify(out));
out=evalRec(ee['490088'],{sourceType:'equipment',hostRow:{slot:'accessory1',refine:0}});
check('490088 base effects',out.atkRate===5&&out.matkRate===5,JSON.stringify(out));
out=evalRec(ee['400401'],{sourceType:'equipment',hostRow:{slot:'headTop',refine:13}});
check('400401 +13 thresholds',out.matkFlat===120&&out.magicAttackElementDamage?.All===28&&out.matkRate===10&&out.afterCastDelayReductionRate===10&&out.magicRaceDamage?.All===15&&out.magicElementDamage?.All===15&&out.fixedCastReductionMs===500,JSON.stringify(out));
out=evalRec(ee['28902'],{sourceType:'equipment',hostRow:{slot:'shield',refine:12}});
check('28902 +12 values',out.atkRate===5&&out.matkRate===5&&out.shortPhysicalReflectRate===10&&out.atkFlat===20&&out.matkFlat===20&&out.criFlat===10&&out.noCastCancel===1&&out.autoSpellProcs?.[0]?.rate===1000,JSON.stringify(out));
out=evalRec(ee['420236'],{sourceType:'equipment',hostRow:{slot:'headLow',refine:0}});
check('420236 base P.ATK/S.MATK',out.pAtk===5&&out.sMatk===5,JSON.stringify(out));
check('420236 base race modifiers',out.physicalRaceDamage?.DemiHuman===5&&out.physicalRaceDamage?.Player===5&&out.physicalRaceDamage?.Angel===5&&out.magicRaceDamage?.Player===5&&out.raceResist?.Player===3,JSON.stringify(out));

// Cards exact values.
out=evalRec(ce['27323'],{sourceType:'card',hostRow:{slot:'accessory1',refine:0}}); check('27323 MHP+5%',out.maxHpRate===5,JSON.stringify(out));
out=evalRec(ce['27322'],{sourceType:'card',hostRow:{slot:'accessory1',refine:0}}); check('27322 MSP+5%',out.maxSpRate===5,JSON.stringify(out));
out=evalRec(ce['4509'],{sourceType:'card',hostRow:{slot:'headTop',refine:9}}); check('4509 refine +9',out.intFlat===3&&out.raceResist?.Insect===15,JSON.stringify(out));
out=evalRec(ce['4507'],{sourceType:'card',hostRow:{slot:'weapon',refine:0}}); check('4507 race2/drop wiring',out.physicalRace2Damage?.RC2_SCARABA===30&&out.extraDrops?.[0]?.itemId===12806&&out.extraDrops?.[0]?.rate===50,JSON.stringify(out));
out=evalRec(ce['4148'],{sourceType:'card',hostRow:{slot:'headMid',refine:0}}); check('4148 SP cost -30%',out.spCostRate===-30,JSON.stringify(out));
out=evalRec(ce['27321'],{sourceType:'card',hostRow:{slot:'shoes',refine:0}}); check('27321 numeric effects',out.atkRate===10&&out.maxHpRate===-50&&out.physicalRaceDamage?.DemiHuman===30&&out.physicalRaceDamage?.Player===30&&out.physicalRaceDamage?.Angel===30,JSON.stringify(out));
check('27321 system-only trigger compiled',out.autoBonuses?.[0]?.trigger==='skill'&&out.autoBonuses?.[0]?.skill==='NV_FIRSTAID'&&!String(ce['27321'].compiledScript).includes('active_transform'),JSON.stringify(out.autoBonuses));

// Actual loadout/combination activation.
out=reset({headMid:410254},{headMid:{refine:0,cards:[4148]}},{stats:{str:17,agi:17,vit:17,int:17,dex:17,luk:17}});
check('410254 + Pharaoh actual combo',out.atkFlat===24&&out.matkFlat===24&&out.spCostRate===-30&&out.intravision===1&&out.afterCastDelayReductionRate===15&&out.physicalElementDamage?.All===25&&out.magicElementDamage?.All===25,JSON.stringify(out));
out=reset({headMid:410254},{headMid:{refine:0,cards:[4112]}},{stats:{str:17,agi:17,vit:17,int:17,dex:17,luk:17}});
check('410254 + Marduk actual combo',out.atkFlat===24&&out.matkFlat===24&&out.afterCastDelayReductionRate===8&&out.physicalElementDamage?.All===12&&out.magicElementDamage?.All===12&&out.statusResist?.Eff_Silence===10000,JSON.stringify(out));
out=reset({headMid:18813,headLow:420199},{headMid:{refine:0,cards:[]},headLow:{refine:0,cards:[]}},{traits:{pow:36,sta:36,wis:36,spl:36,con:36,crt:36}});
check('420199 + New Wave actual combo',out.variableCastReductionRate===8&&out.afterCastDelayReductionRate===15&&out.physicalRaceDamage?.All===14&&out.magicRaceDamage?.All===14&&out.atkFlat===120&&out.matkFlat===120&&out.atkRate===8&&out.matkRate===8&&out.critAtkRate===14&&out.fixedCastReductionMs===200,JSON.stringify(out));
out=reset({headMid:19181,headLow:420199},{headMid:{refine:0,cards:[]},headLow:{refine:0,cards:[]}},{traits:{pow:18,sta:18,wis:18,spl:18,con:18,crt:18}});
check('420199 + slotted New Wave actual combo',out.variableCastReductionRate===8&&out.physicalRaceDamage?.All===7&&out.magicRaceDamage?.All===7&&out.atkFlat===60&&out.matkFlat===60&&out.atkRate===4&&out.matkRate===4&&out.critAtkRate===7&&out.fixedCastReductionMs>=150,JSON.stringify(out));
out=reset({headTop:400511},{headTop:{refine:13,cards:[4509]}});
check('400511 + Gold Queen actual combo',out.pAtk===20&&out.intFlat===3&&out.raceResist?.Insect===15&&out.critAtkRate===170,JSON.stringify(out));
out=reset({headTop:400511,weapon:1101},{headTop:{refine:13,cards:[]},weapon:{refine:0,cards:[4507]}});
check('400511 + Queen card actual combo',out.physicalClassDamage?.Boss===35&&out.physicalRace2Damage?.RC2_SCARABA===30&&out.extraDrops?.some(x=>x.itemId===12806),JSON.stringify(out));
out=reset({headTop:400511,weapon:1101},{headTop:{refine:13,cards:[]},weapon:{refine:0,cards:[27209]}});
check('400511 + sealed Queen card actual combo',out.physicalClassDamage?.Boss===30,JSON.stringify(out));
out=reset({accessory1:490088,accessory2:2601},{accessory1:{refine:0,cards:[27323]},accessory2:{refine:0,cards:[27322]}});
check('490088 + both apostles actual combos',out.atkRate===5&&out.matkRate===5&&out.maxHpRate===25&&out.maxSpRate===25,JSON.stringify(out));
const essenceExpect490088={4910:o=>o.strFlat===4&&o.atkRate===10,4913:o=>o.intFlat===4&&o.matkRate===10,4916:o=>o.agiFlat===4&&o.aspdRate===5,4922:o=>o.dexFlat===4&&o.variableCastReductionRate===5,4919:o=>o.vitFlat===4&&o.maxHpRate===5,4925:o=>o.lukFlat===4&&o.critAtkRate===5};
for(const [essenceId,predicate] of Object.entries(essenceExpect490088)){
  out=reset({accessory1:490088},{accessory1:{refine:0,cards:[],enchants:[{id:Number(essenceId)}]}});
  check(`490088 essence ${essenceId} actual combo`,predicate(out),JSON.stringify(out));
}
out=reset({headLow:420236,accessory1:2601},{headLow:{refine:0,cards:[],enchants:[{id:4910}]},accessory1:{refine:0,cards:[27323]}});
check('420236 Force3 + Shnaim combos',out.shortDamageRate===20&&out.raceResist?.All===-15&&out.physicalRaceDamage?.All===15&&out.magicRaceDamage?.All===15,JSON.stringify(out));
const essenceExpect420236={4910:o=>o.shortDamageRate===20&&o.raceResist?.All===-15,4913:o=>o.magicAttackElementDamage?.All===20&&o.raceResist?.All===-15,4916:o=>o.afterCastDelayReductionRate===10&&o.maxHpRate===-20,4922:o=>o.longDamageRate===20&&o.raceResist?.All===-15,4919:o=>o.maxHpRate===30&&o.aspdRate===-50,4925:o=>o.critAtkRate===20&&o.healPowerRate===20&&o.afterCastDelayReductionRate===-10};
for(const [essenceId,predicate] of Object.entries(essenceExpect420236)){
  out=reset({headLow:420236},{headLow:{refine:0,cards:[],enchants:[{id:Number(essenceId)}]}});
  check(`420236 essence ${essenceId} actual combo`,predicate(out),JSON.stringify(out));
}
out=reset({headLow:420236,accessory1:2601},{headLow:{refine:0,cards:[]},accessory1:{refine:0,cards:[27322]}});
check('420236 Ahat all-size combo',out.sizeDamage?.All===15&&out.magicSizeDamage?.All===15,JSON.stringify(out));
out=reset({headLow:420236,shoes:2401},{headLow:{refine:0,cards:[]},shoes:{refine:0,cards:[27321]}});
check('420236 + 27321 actual combo',out.maxHpRate===0&&out.atkRate===10&&out.physicalRaceDamage?.All===40&&out.physicalRaceDamage?.Angel===35,JSON.stringify(out));

// Third/fourth inheritance for Yggdrasil Faith + Fenrir.
for(const job of ['sorcerer','elemental_master']){
  out=reset({headTop:400401},{headTop:{refine:13,cards:[4556]}},{job});
  check(`400401 ${job} grants Comet`,out.grantedSkills&&Object.values(out.grantedSkills).includes(3)&&out.spCostRate===30&&Object.values(out.skillDamageRate||{}).includes(42),JSON.stringify(out));
}
for(const job of ['warlock','arch_mage']){
  out=reset({headTop:400401},{headTop:{refine:13,cards:[4556]}},{job});
  check(`400401 ${job} Comet cooldown`,Object.values(out.skillCooldownReductionMs||{}).includes(20000)&&Object.values(out.skillDamageRate||{}).includes(42),JSON.stringify(out));
}

// Mad Bunny trigger and 27321 system-only transform notification.
logs.length=0; reset({shield:28902},{shield:{refine:12,cards:[]}}); randomQueue.push(0.05); CR.onPlayerDamaged({name:'測試魔物'},100,{magic:true,rangeCells:3});
check('28902 10% trigger creates 2-sec 60% mirror',Object.values(player.cardRuntimeTempBonuses).some(x=>x.source?.magicReflectChancePercent===60&&x.expiresAt>Date.now()),JSON.stringify(player.cardRuntimeTempBonuses));
check('28902 system log',logs.some(x=>x.includes('瘋狂兔寶寶發動魔法鏡')),logs.join('|'));
logs.length=0; reset({shoes:2401},{shoes:{refine:0,cards:[27321]}}); randomQueue.push(0); CR.onSkillUsed({aegisName:'NV_FIRSTAID',key:'NV_FIRSTAID',dealsDamage:false},null);
check('27321 First Aid system log',logs.some(x=>x.includes('絕望之神夢羅克卡片發動')&&x.includes('不切換外觀')),logs.join('|'));
check('27321 never creates visual transform',!player.cardRuntimeTransform,JSON.stringify(player.cardRuntimeTransform));

// Queen Scaraba transformation scroll combo.
window.markConsumableItemUsed=()=>{};window.invalidateCardRuntime=()=>CR.invalidate();window.recalculatePlayerStats=()=>{};window.updatePlayerUI=()=>{};window.updateInventoryUI=()=>{};window.saveGame=()=>{};
vm.runInContext(text('js/consumable_runtime.js'),context);
player.inventory=[{id:22750,count:1}];player.activeBuffs={};player.equipment={headTop:400511};logs.length=0;
const scrollResult=window.ConsumableRuntime.apply(idx['22750'],player.inventory[0]);
check('400511 + Horn Scaraba scroll 5-minute combo',scrollResult?.applied===true&&player.activeBuffs?.queen_scaraba_scroll_combo?.effects?.sizeDamage?.All===5&&player.activeBuffs?.queen_scaraba_scroll_combo?.effects?.magicSizeDamage?.All===5&&player.activeBuffs?.queen_scaraba_scroll_combo?.expiresAt-player.activeBuffs?.queen_scaraba_scroll_combo?.startedAt===300000,JSON.stringify(player.activeBuffs?.queen_scaraba_scroll_combo));

// Queen Scaraba card extra drop path.
awards.length=0; reset({weapon:1101},{weapon:{refine:0,cards:[4507]}}); randomQueue.push(0); CR.rollExtraDrops({race:'Insect',name:'測試敵人'});
check('4507 extra-drop path awards 12806',awards.some(x=>x.id===12806&&x.qty===1),JSON.stringify(awards));

// Effect consumer coverage for every featured record and related combo.
const sourceRows=[];
for(const id of mainEquipment)sourceRows.push(evalRec(ee[String(id)],{sourceType:'equipment',hostRow:{slot:idx[String(id)]?.slot||'headTop',refine:13}}));
for(const id of mainCards)sourceRows.push(evalRec(ce[String(id)],{sourceType:'card',hostRow:{slot:(idx[String(id)]?.cardTarget||[])[0]||'headTop',refine:13}}));
for(const c of combos.filter(c=>(c.requiredItemIds||[]).some(id=>[...mainEquipment,...mainCards].includes(Number(id)))))sourceRows.push(evalRec(c,{sourceType:'combo',maxRefine:13}));
const coverage=window.EffectRuntime.auditSources(sourceRows);
check('all featured emitted effects have consumers',coverage.ok,JSON.stringify(coverage));

// Gacha/quick-slot runtime contracts.
check('map-exclusive drop is MVP-only and 1%',cfg.mapExclusiveDropChanceBasisPoints===100&&text('js/taiwan_gacha_runtime.js').includes('monster.isMvp === true'));
check('independent old/new drop hooks',text('js/loot.js').includes('MvpGachaRuntime?.rollMapExclusiveDrop')&&text('js/loot.js').includes('TaiwanGachaRuntime?.rollMapExclusiveDrop'));
check('quick-slot manual sources accepted',text('js/taiwan_gacha_runtime.js').includes('"quick-slot"')&&text('js/taiwan_gacha_runtime.js').includes('"quick-slot-key"'));
check('quick-slot picker exposed',text('js/item_instance_ui.js').includes("renderQuickSlotPicker(quickHost, { type: 'item', id: data.id }"));
// Actual quick-slot assignment and number-key activation.
{
  const qListeners={},qUses=[];
  const qPlayer={inventory:[{id:9512,count:3}],equipment:{},quickSlots:[]};
  const qDocument={activeElement:{tagName:'BODY'},getElementById(){return null;},addEventListener(type,fn){qListeners[type]=fn;}};
  const qWindow={player:qPlayer,document:qDocument,matchMedia(){return {matches:false}},addEventListener(){},getItemData:id=>idx[String(id)]||null,findInventoryItemById:id=>qPlayer.inventory.find(x=>String(x.id)===String(id))||null};
  qWindow.window=qWindow;
  const qContext={window:qWindow,document:qDocument,player:qPlayer,console,JSON,Math,Date,getItemData:qWindow.getItemData,findInventoryItemById:qWindow.findInventoryItemById,saveGame(){},addBattleLog(){},useItem:(id,inst,opt)=>qUses.push({id,opt}),isMobileViewport(){return false}};
  qContext.globalThis=qContext;vm.createContext(qContext);vm.runInContext(text('js/quick_slots.js'),qContext);
  const assigned=qWindow.assignQuickSlot(0,{type:'item',id:9512},{confirmReplace:false});
  check('9512 actual quick-slot assignment',assigned===true&&qPlayer.quickSlots[0]?.type==='item'&&Number(qPlayer.quickSlots[0]?.id)===9512,JSON.stringify(qPlayer.quickSlots[0]));
  qListeners.keydown?.({repeat:false,key:'1',isTrusted:true,preventDefault(){}});
  check('9512 actual number-key activation',qUses.length===1&&Number(qUses[0].id)===9512&&qUses[0]?.opt?.source==='quick-slot-key'&&qUses[0]?.opt?.userInitiated===true,JSON.stringify(qUses));
}
check('index cache V0.9.83B',text('index.html').includes('card_runtime.js?v=0.9.83B')&&text('index.html').includes('quick_slots.js?v=0.9.83B'));

const failed=checks.filter(x=>!x.passed);
const report={version:'0.9.83B',suite:'v0.9.83B-il4-regression',passed:checks.length-failed.length,failed:failed.length,checks,coverage};
console.log(JSON.stringify({passed:report.passed,failed:report.failed,failedChecks:failed},null,2));
if(failed.length)process.exit(1);
