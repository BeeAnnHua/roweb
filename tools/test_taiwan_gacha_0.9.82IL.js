const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const readJson=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const checks=[];const check=(name,ok,detail='')=>checks.push({name,ok:!!ok,detail});
const cfg=readJson('data/taiwan_gacha.json');
const idx=readJson('data/items/item_index.json');
const ee=readJson('data/card_runtime/equipment_effects.json');
const ce=readJson('data/card_runtime/card_effects.json');
const combos=readJson('data/card_runtime/card_combos.json');
const special=cfg.rareCategories.reduce((s,c)=>s+Number(c.chanceBasisPoints||0),0);
check('Version is IL',cfg.version==='0.9.82IL',cfg.version);
check('Special pool is 7.63%',special===763,special);
check('Ordinary pool is 92.37%',cfg.ordinaryFillBasisPoints===9237,cfg.ordinaryFillBasisPoints);
check('Mother pool totals 100%',special+cfg.ordinaryFillBasisPoints===10000,special+cfg.ordinaryFillBasisPoints);
const expectedChances=new Map([[27323,100],[27322,100],[410254,10],[420199,10],[400511,10],[490088,10],[400401,10],[28902,10],[4509,1],[4507,1],[4148,1],[6635,500]]);
for(const cat of cfg.rareCategories)for(const row of cat.rewards||[])check(`Chance ${row.itemId}`,Number(row.chanceBasisPoints)===expectedChances.get(Number(row.itemId)),row.chanceBasisPoints);
check('Ten ordinary refinement materials',cfg.ordinaryRewards.length===10,cfg.ordinaryRewards.map(x=>x.itemId).join(','));
for(const row of cfg.ordinaryRewards)check(`Ordinary equal weight ${row.itemId}`,Number(row.weight)===1,row.weight);
const mainItems=[9512,410254,420199,400511,490088,400401,28902,27323,27322,4509,4507,4148];
for(const id of mainItems){check(`Item ${id} exists`,!!idx[String(id)]);check(`Icon ${id} exists`,fs.existsSync(path.join(ROOT,`images/items/${id}.webp`)));}
for(const id of [410254,420199,400511,490088,400401,28902])check(`Equipment effect ${id}`,!!ee[String(id)]&&!!ee[String(id)].compiledScript);
for(const id of [4910,4913,4916,4919,4922,4925,27209])check(`Supporting effect ${id}`,!!ce[String(id)]&&!!ce[String(id)].compiledScript);
const comboSet=new Set(combos.map(r=>(r.requiredItemIds||[]).slice().sort((a,b)=>a-b).join('+')));
for(const ids of [[18813,420199],[19181,420199],[4910,490088],[4913,490088],[4916,490088],[4919,490088],[4922,490088],[4925,490088],[27209,400511],[4556,400401]])check(`Combo ${ids.join('+')}`,comboSet.has(ids.slice().sort((a,b)=>a-b).join('+')));
check('Independent loot hook',fs.readFileSync(path.join(ROOT,'js/loot.js'),'utf8').includes('TaiwanGachaRuntime?.rollMapExclusiveDrop'));
check('Batch adapter hook',fs.readFileSync(path.join(ROOT,'js/item_batch_open_runtime.js'),'utf8').includes('id:"taiwan_gacha"'));
check('Index loads Taiwan runtime',fs.readFileSync(path.join(ROOT,'index.html'),'utf8').includes('taiwan_gacha_runtime.js?v=0.9.82IL'));

function makeContext(data={}){
 const randomQueue=[];const customMath=Object.create(Math);customMath.random=()=>randomQueue.length?randomQueue.shift():0.5;
 const window={RO_WEB_DATA:data,player:{inventory:[],equipment:{},equipmentInstances:{},stats:{},traitStats:{},activeBuffs:{}},currentMap:{id:'geffenia_mvp_arena_3x3_region_camera'},useItem(){return 'base';},setInterval(){return 0;},setTimeout(fn){return 0;},clearTimeout(){},addEventListener(){},dispatchEvent(){},CustomEvent:function(type,o){this.type=type;this.detail=o?.detail;},document:undefined};
 window.window=window; const context={window,player:window.player,currentMap:window.currentMap,console,Date,Math:customMath,JSON,Set,Map,CustomEvent:window.CustomEvent};context.globalThis=context;vm.createContext(context);return {window,context,randomQueue};
}
// Gacha runtime boundaries and independent map drop.
{
 const data={'data/taiwan_gacha.json':cfg,'data/mvp_gacha.json':readJson('data/mvp_gacha.json')};
 const {window,context,randomQueue}=makeContext(data);window.getItemData=id=>idx[String(id)]||{id:Number(id),name:`Item ${id}`};const awarded=[];window.addItem=(item,qty)=>awarded.push([item.id,qty]);window.recordItemDrop=()=>{};window.addBattleLog=()=>{};window.getFinalDropChanceBasisPoints=()=>10000;
 vm.runInContext(fs.readFileSync(path.join(ROOT,'js/mvp_gacha_runtime.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(ROOT,'js/taiwan_gacha_runtime.js'),'utf8'),context);
 const rollAt=bp=>{randomQueue.push((bp-0.5)/10000);return window.TaiwanGachaRuntime.rollReward();};
 check('Roll 1 -> Shnaim',rollAt(1).row.itemId===27323);
 check('Roll 100 -> Shnaim',rollAt(100).row.itemId===27323);
 check('Roll 101 -> Ahat',rollAt(101).row.itemId===27322);
 check('Roll 200 -> Ahat',rollAt(200).row.itemId===27322);
 check('Roll 201 -> first equipment',rollAt(201).row.itemId===410254);
 check('Roll 260 -> last equipment',rollAt(260).row.itemId===28902);
 check('Roll 261 -> Gold Queen card',rollAt(261).row.itemId===4509);
 check('Roll 263 -> Pharaoh card',rollAt(263).row.itemId===4148);
 check('Roll 264 -> Blacksmith Blessing',rollAt(264).row.itemId===6635);
 check('Roll 763 -> Blacksmith Blessing',rollAt(763).row.itemId===6635);
 randomQueue.push((764-0.5)/10000,0);const ordinary=window.TaiwanGachaRuntime.rollReward();
 check('Roll 764 -> ordinary pool',ordinary.rare===false&&ordinary.row.itemId===7620,JSON.stringify(ordinary));
 check('Ordinary per item is 9.237%',Math.abs(Number(ordinary.chanceBasisPoints)-923.7)<1e-9,ordinary.chanceBasisPoints);
 const monster={name:'測試MVP',isMvp:true,lootRuntime:{}};randomQueue.push(0,0);
 const oldDrop=window.MvpGachaRuntime.rollMapExclusiveDrop(monster);const newDrop=window.TaiwanGachaRuntime.rollMapExclusiveDrop(monster);
 check('Old and Taiwan drops both resolve independently',oldDrop&&newDrop,JSON.stringify(monster.lootRuntime));
 check('Both gacha items were granted',awarded.some(x=>x[0]===14848)&&awarded.some(x=>x[0]===9512),JSON.stringify(awarded));
}
// CardRuntime exact equipment and combo effects.
{
 const jobs=readJson('data/jobs.json');const {window,context}=makeContext({'data/card_runtime/card_effects.json':ce,'data/card_runtime/card_combos.json':combos,'data/card_runtime/equipment_effects.json':ee,'data/card_runtime/item_groups.json':{},'data/card_runtime/card_drop_sources.json':{},'data/enchant_runtime/enchant_effects.json':{},'data/jobs.json':jobs});
 window.getItemData=id=>idx[String(id)]||null;window.setInterval=()=>0;
 vm.runInContext(fs.readFileSync(path.join(ROOT,'js/card_runtime.js'),'utf8'),context);
 const evalRec=(r,c={})=>window.CardRuntime._debugEvaluateRecord(r,c);
 window.player.stats={str:17,agi:17,vit:17,int:17,dex:17,luk:17};
 let out=evalRec(ee['410254'],{sourceType:'equipment',hostRow:{refine:0}});
 check('Ancient Morroc floors each 8-stat tier',out.atkFlat===24&&out.matkFlat===24,JSON.stringify(out));
 out=evalRec(ee['400511'],{sourceType:'equipment',hostRow:{refine:13}});
 check('Queen helmet +13 exact thresholds',out.powFlat===3&&out.conFlat===3&&out.crtFlat===3&&out.atkFlat===120&&out.criFlat===24&&out.critAtkRate===40&&out.fixedCastReductionMs===500,JSON.stringify(out));
 out=evalRec(ee['400401'],{sourceType:'equipment',hostRow:{refine:13}});
 check('Yggdrasil Faith +13 exact thresholds',out.matkFlat===120&&out.magicAttackElementDamage?.All===28&&out.magicRaceDamage?.All===15&&out.magicElementDamage?.All===15,JSON.stringify(out));
 out=evalRec(ee['28902'],{sourceType:'equipment',hostRow:{refine:12}});
 check('Mad Bunny has 10% magic mirror proc',out.autoSpellProcs?.[0]?.rate===1000&&out.magicReflectRate===undefined&&out.noCastCancel===1,JSON.stringify(out));
 const qCombo=combos.find(r=>(r.requiredItemIds||[]).includes(4507)&&(r.requiredItemIds||[]).includes(400511));out=evalRec(qCombo,{sourceType:'combo'});check('Queen card helmet combo is fixed boss +35%',out.physicalClassDamage?.Boss===35,JSON.stringify(out));
 const sqCombo=combos.find(r=>(r.requiredItemIds||[]).includes(27209)&&(r.requiredItemIds||[]).includes(400511));out=evalRec(sqCombo,{sourceType:'combo'});check('Sealed Queen card helmet combo is fixed boss +30%',out.physicalClassDamage?.Boss===30,JSON.stringify(out));
 check('Mad Bunny temporary mirror uses 60% chance semantics',fs.readFileSync(path.join(ROOT,'js/card_runtime.js'),'utf8').includes('magicReflectChancePercent:60')&&fs.readFileSync(path.join(ROOT,'js/battle.js'),'utf8').includes('magicReflectChancePercent'));
 const ghost=combos.find(r=>(r.requiredItemIds||[]).includes(18813)&&(r.requiredItemIds||[]).includes(420199));window.player.traitStats={pow:36,sta:36,wis:36,spl:36,con:36,crt:36};
 out=evalRec(ghost,{sourceType:'combo'});
 check('Ghost Fire trait tiers',out.physicalRaceDamage?.All===14&&out.magicRaceDamage?.All===14&&out.atkFlat===120&&out.matkFlat===120&&out.atkRate===8&&out.matkRate===8&&out.critAtkRate===14&&out.fixedCastReductionMs===100,JSON.stringify(out));
 const fenrir=combos.find(r=>(r.requiredItemIds||[]).includes(4556)&&(r.requiredItemIds||[]).includes(400401));window.player.equipment={headTop:400401};window.player.equipmentInstances={headTop:{refine:13,cards:[4556]}};window.player.job='sorcerer';window.player.jobKey='sorcerer';window.jobsData=jobs;
 out=evalRec(fenrir,{sourceType:'combo',hostRow:{slot:'headTop',refine:13},equippedIds:[4556,400401],maxRefine:13});
 check('Fenrir Sorcerer grants Comet',out.grantedSkills&&Object.values(out.grantedSkills).includes(3)&&out.spCostRate===30&&out.skillDamageRate&&Object.values(out.skillDamageRate).includes(42),JSON.stringify(out));
 window.player.job='warlock';window.player.jobKey='warlock';out=evalRec(fenrir,{sourceType:'combo',hostRow:{slot:'headTop',refine:13},equippedIds:[4556,400401],maxRefine:13});
 check('Fenrir Warlock reduces Comet cooldown',out.skillCooldownReductionMs&&Object.values(out.skillCooldownReductionMs).includes(20000),JSON.stringify(out));
}
// Transformation scroll combo.
{
 const {window,context}=makeContext();window.player.inventory=[{id:22750,count:1}];window.player.equipment={headTop:400511};window.markConsumableItemUsed=()=>{};window.invalidateCardRuntime=()=>{};window.recalculatePlayerStats=()=>{};window.updatePlayerUI=()=>{};window.updateInventoryUI=()=>{};window.saveGame=()=>{};window.addBattleLog=()=>{};
 vm.runInContext(fs.readFileSync(path.join(ROOT,'js/consumable_runtime.js'),'utf8'),context);
 const result=window.ConsumableRuntime.apply(idx['22750'],window.player.inventory[0]);
 check('Horn Scaraba scroll consumes once',result?.applied===true&&window.player.inventory.length===0,JSON.stringify(result));
 check('Queen helmet scroll combo lasts 5 minutes',window.player.activeBuffs.queen_scaraba_scroll_combo?.expiresAt-window.player.activeBuffs.queen_scaraba_scroll_combo?.startedAt===300000,JSON.stringify(window.player.activeBuffs));
 check('Scroll combo gives all-size physical and magic +5%',window.player.activeBuffs.queen_scaraba_scroll_combo?.effects?.sizeDamage?.All===5&&window.player.activeBuffs.queen_scaraba_scroll_combo?.effects?.magicSizeDamage?.All===5);
}
const failed=checks.filter(x=>!x.ok);const report={version:'0.9.82IL',suite:'taiwan-gacha-and-equipment-effects',passed:checks.length-failed.length,failed:failed.length,checks};
fs.writeFileSync(path.join(ROOT,'TEST_REPORT_0.9.82IL_TAIWAN_GACHA.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({version:report.version,passed:report.passed,failed:report.failed,failedChecks:failed},null,2));
if(failed.length)process.exit(1);
