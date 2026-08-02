const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const checks=[]; const check=(name,ok,detail='')=>checks.push({name,passed:!!ok,detail:String(detail??'')});
const cfg=read('data/taiwan_gacha.json');
const idx=read('data/items/item_index.json');
const cards1=read('data/items/cards_1.json');
const cards2=read('data/items/cards_2.json');
const ce=read('data/card_runtime/card_effects.json');
const drops=read('data/card_runtime/card_drop_sources.json');
const client=read('data/client_item_display_data.json');
const mvp=cfg.rareCategories.find(x=>x.id==='mvp_cards');
check('version IL3',cfg.version==='0.9.82IL3',cfg.version);
check('27321 gacha exactly once',(mvp.rewards||[]).filter(x=>Number(x.itemId)===27321).length===1,JSON.stringify(mvp.rewards));
check('27321 chance 0.01%',Number((mvp.rewards||[]).find(x=>Number(x.itemId)===27321)?.chanceBasisPoints)===1);
check('300084 absent from gacha',!(mvp.rewards||[]).some(x=>Number(x.itemId)===300084),JSON.stringify(mvp.rewards));
check('gacha total 100%',cfg.rareCategories.reduce((a,c)=>a+Number(c.chanceBasisPoints||0),0)+Number(cfg.ordinaryFillBasisPoints)===10000);
check('300084 identity restored',idx['300084']?.name==='夢魘干扁草精卡片'&&cards2['300084']?.aegisName==='Dry_Rafflesia_H_Card',JSON.stringify(idx['300084']));
check('300084 garment card',cards2['300084']?.locations?.Garment===true&&cards2['300084']?.cardTarget?.includes('garment'));
check('300084 original effect',String(ce['300084']?.scriptRaw||'').includes('Ele_Holy,30')&&String(ce['300084']?.scriptRaw||'').includes('bFlee,5'));
check('300084 drop restored',Array.isArray(drops['300084'])&&drops['300084'].some(x=>Number(x.monsterId)===20625));
check('300084 client identity restored',client.cardIllustrationResources['300084']==='Dry_Rafflesia_H_Card'&&client.cardInfo['300084']?.name==='夢魘乾扁草精卡片');
check('27321 identity',idx['27321']?.name==='絕望之神夢羅克卡片'&&ce['27321']?.aegisName==='DespairGodMorocc_Card');
check('27321 shoe card',ce['27321']?.locations?.Shoes===true&&ce['27321']?.cardTarget?.includes('shoes'));
check('27321 numerical effects',String(ce['27321']?.scriptRaw||'').includes('bAtkRate,10')&&String(ce['27321']?.scriptRaw||'').includes('bMaxHPrate,-50')&&String(ce['27321']?.scriptRaw||'').includes('RC_Angel,30'));
check('27321 no appearance transform',!String(ce['27321']?.scriptRaw||'').includes('active_transform')&&!String(cards1['27321']?.compiledScript||'').includes('autobonus3'));
check('27321 no-transform marker',idx['27321']?.visualTransformDisabled===true&&ce['27321']?.visualTransformDisabled===true);
check('9512 quick slot remains enabled',idx['9512']?.quickSlotEligible===true);
check('index IL3 cache',fs.readFileSync(path.join(ROOT,'index.html'),'utf8').includes('quick_slots.js?v=0.9.82IL3'));

// Evaluate the corrected card through the actual CardRuntime compiler.
const window={RO_WEB_DATA:{
 'data/card_runtime/card_effects.json':ce,
 'data/card_runtime/card_combos.json':read('data/card_runtime/card_combos.json'),
 'data/card_runtime/item_groups.json':{},
 'data/card_runtime/card_drop_sources.json':drops,
 'data/card_runtime/equipment_effects.json':read('data/card_runtime/equipment_effects.json'),
 'data/enchant_runtime/enchant_effects.json':{},
 'data/jobs.json':read('data/jobs.json')
},player:{equipment:{},equipmentInstances:{},stats:{},traitStats:{},learnedSkills:{},cardRuntimeTempBonuses:{}},setInterval(){return 0;},setTimeout(){return 0;},clearTimeout(){},addEventListener(){}};
window.window=window;
const context={window,player:window.player,console,Date,Math,JSON,Set,Map}; context.globalThis=context; vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(ROOT,'js/card_runtime.js'),'utf8'),context);
const out=window.CardRuntime._debugEvaluateRecord(ce['27321'],{sourceType:'card',slot:'shoes'});
check('27321 runtime ATK/MHP',out.atkRate===10&&out.maxHpRate===-50,JSON.stringify(out));
check('27321 runtime race damage',out.physicalRaceDamage?.Angel===30&&out.physicalRaceDamage?.DemiHuman===30&&out.physicalRaceDamage?.Player===30,JSON.stringify(out.physicalRaceDamage));
check('27321 runtime has no transform proc',!(out.autoBonuses||[]).length,JSON.stringify(out.autoBonuses));

const failed=checks.filter(x=>!x.passed);
const report={version:'0.9.82IL3',suite:'despair-morroc-card-identity-correction',passed:checks.length-failed.length,failed:failed.length,checks};
fs.writeFileSync(path.join(ROOT,'TEST_REPORT_0.9.82IL3_CARD_IDENTITY.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,failed:report.failed,failedChecks:failed},null,2));
if(failed.length)process.exit(1);
