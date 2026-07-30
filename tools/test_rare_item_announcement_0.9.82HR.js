#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const ROOT=path.resolve(__dirname,'..');
const readJson=rel=>JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'));
const run=rel=>vm.runInThisContext(fs.readFileSync(path.join(ROOT,rel),'utf8'),{filename:rel});
let pass=0,fail=0; const results=[];
function check(ok,label,detail=''){
  results.push({ok:Boolean(ok),name:label,detail:String(detail||'')});
  if(ok){pass++;console.log(`PASS ${label}${detail?` :: ${detail}`:''}`);}else{fail++;console.error(`FAIL ${label}${detail?` :: ${detail}`:''}`);}
}

global.window=global;
global.document=undefined;
global.player={name:'測試玩家',inventory:[],map:'ice_scale_hill_3x3_region_camera'};
global.getPlayerAnnouncementName=()=>player.name;
global.setTimeout=()=>0;
global.setInterval=()=>0;
global.clearInterval=()=>{};
global.RO_WEB_DATA={
  'data/server_config.json':readJson('data/server_config.json'),
  'data/enchant_grade_map_drops.json':readJson('data/enchant_grade_map_drops.json'),
  'data/enchant_grade_rules.json':readJson('data/enchant_grade_rules.json'),
  'data/enchant_grade_exchange.json':readJson('data/enchant_grade_exchange.json'),
  'data/item_boxes.json':readJson('data/item_boxes.json'),
  'data/mvp_gacha.json':readJson('data/mvp_gacha.json')
};
run('js/rare_item_announcement_runtime.js');
const R=global.RareItemAnnouncementRuntime;
check(R.version==='0.9.82HR','global rare runtime version');
check(R.tierForChanceBasisPoints(100)==='red','1% is red');
check(R.tierForChanceBasisPoints(10)==='purple','0.1% is purple');
check(R.tierForChanceBasisPoints(1)==='gold','0.01% is gold');
check(R.tierForChanceBasisPoints(100.0001)===null,'above 1% has no banner');
check(R.tierForChanceBasisPoints(0)===null,'zero chance has no banner');
check(R.formatChancePercent(20)==='0.2%','chance percent formatting',R.formatChancePercent(20));
const dupRows=[{itemId:1,weight:1},{itemId:1,weight:2},{itemId:2,weight:97}];
check(Math.abs(R.weightedItemChanceBasisPoints(dupRows,dupRows[0],10000)-300)<1e-9,'duplicate Item IDs sum in weighted probability');

// ItemBox: official weighted chance, not row labels.
global.useItem=()=>false;
global.getItemData=id=>({id:Number(id),name:`Item ${id}`});
run('js/item_box_runtime.js');
const boxes=RO_WEB_DATA['data/item_boxes.json'].boxes;
const blue=boxes.ra_old_blue_box;
const blueLow=blue.rewards.reduce((a,b)=>Number(a.weight)<Number(b.weight)?a:b);
const blueChance=ItemBoxRuntime.rewardChanceBasisPoints(blue,blueLow);
check(blueChance>0&&blueChance<=100,'Old Blue Box low-weight reward qualifies for rare banner',String(blueChance));
const dim=boxes.ep19_dim_glacier_weapon_box;
const dimChance=ItemBoxRuntime.rewardChanceBasisPoints(dim,dim.rewards[0]);
check(dimChance>100,'26-way Dim Glacier box reward is not rare-banner eligible',String(dimChance));

// Gacha uses per-item actual probability: category chance x item weight share.
global.findInventoryItemById=()=>null;
global.isAutoBattleRunning=()=>false;
global.addBattleLog=()=>{};
global.requestGameSave=()=>{};
run('js/mvp_gacha_runtime.js');
const cfg=RO_WEB_DATA['data/mvp_gacha.json'];
const categories=cfg.rareCategories;
const kiel=R.weightedItemChanceBasisPoints(categories[0].rewards,categories[0].rewards[0],categories[0].chanceBasisPoints);
const anniversary=R.weightedItemChanceBasisPoints(categories[1].rewards,categories[1].rewards[0],categories[1].chanceBasisPoints);
const temporal=R.weightedItemChanceBasisPoints(categories[2].rewards,categories[2].rewards[0],categories[2].chanceBasisPoints);
const ordinary79=cfg.ordinaryRewards.find(row=>Number(row.weight)===79);
const ordinaryChance=R.weightedItemChanceBasisPoints(cfg.ordinaryRewards,ordinary79,cfg.ordinaryFillBasisPoints);
check(kiel===1&&R.tierForChanceBasisPoints(kiel)==='gold','Kiel card remains 0.01% gold',String(kiel));
check(anniversary===5&&R.tierForChanceBasisPoints(anniversary)==='purple','two-item 0.1% category becomes 0.05% purple per item',String(anniversary));
check(temporal===20&&R.tierForChanceBasisPoints(temporal)==='red','five-item 1% category becomes 0.2% red per item',String(temporal));
check(Math.abs(ordinaryChance-158)<1e-9 || ordinaryChance===79,'ordinary weighted probability computed from real pool',String(ordinaryChance));
// Duplicate item 14886 has two rows, so its item probability is 158 bp (1.58%) and must not announce.
check(Math.abs(ordinaryChance-158)<1e-9&&R.tierForChanceBasisPoints(ordinaryChance)===null,'duplicate ordinary reward is aggregated to 1.58%, no false rare banner',String(ordinaryChance));

// Absolute grade-material drop rate is always 5%; legacy multiplier is ignored.
global.currentMap={id:'ice_scale_hill_3x3_region_camera'};
global.serverConfig=RO_WEB_DATA['data/server_config.json'];
global.getItemData=id=>({id:Number(id),name:`Item ${id}`,category:'material'});
global.addItem=()=>{};
global.recordItemDrop=()=>{};
global.emitLootRewardLog=()=>{};
run('js/enchant_grade_runtime.js');
const G=global.EnchantGradeRuntime;
check(G.getGradeMaterialDropChanceBasisPoints()===500,'grade material absolute config is 500/10000');
check(G.getScaledGradeDropChance(3)===500&&G.getScaledGradeDropChance(10000)===500,'grade base chance and 10000x multiplier are ignored');
const gradeEntry=RO_WEB_DATA['data/enchant_grade_map_drops.json'].profiles.ice_scale_hill_3x3_region_camera.entries.find(e=>e.rateMode==='grade_absolute');
check(G.getScaledMapDropChance(gradeEntry)===500,'grade map entry final chance is exactly 5%');

// Monster drop bridge sends final chance to the common announcer.
const announced=[];
global.RareItemAnnouncementRuntime={announceAcquisition:o=>{announced.push(o);return {announced:true};}};
global.applyRate=(v,key)=>v;
global.getRate=()=>1;
global.applyTrainingRewardBonus=v=>v;
global.normalizeItemId=v=>Number(v);
global.randomInt=(a)=>a;
global.getItemData=id=>({id:Number(id),name:`Item ${id}`,type:'etc'});
global.addItem=()=>{};
global.recordItemDrop=()=>{};
run('js/loot.js');
Math.random=()=>0;
rollMonsterDrops({id:1,name:'波利',drops:[{itemId:501,chance:100,qty:1}]});
check(announced.length===1&&announced[0].chanceBasisPoints===100&&announced[0].sourceLabel.includes('波利'),'monster drop uses common announcement with final chance',JSON.stringify(announced[0]||{}));

const report={version:'0.9.82HR',summary:{checks:results.length,passed:pass,failed:fail,status:fail?'FAIL':'PASS'},results};
fs.writeFileSync(path.join(ROOT,'TEST_REPORT_0.9.82HR_RARE_ITEM_ANNOUNCEMENT.json'),JSON.stringify(report,null,2)+'\n');
console.log(`\nRare announcement HR: ${pass} passed, ${fail} failed`);
process.exitCode=fail?1:0;
