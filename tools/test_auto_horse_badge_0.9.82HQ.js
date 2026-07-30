#!/usr/bin/env node
const fs=require('fs'),vm=require('vm'),path=require('path');const ROOT=path.resolve(__dirname,'..');
const checks=[];const check=(ok,name,detail='')=>checks.push({ok:!!ok,name,detail:String(detail)});
global.window=global;global.document={getElementById:()=>null,querySelectorAll:()=>[],createElement:()=>({}),body:{}};global.CustomEvent=function(){};
window.player={autoCombat:{speedBadge:{enabled:true,itemId:662}},inventory:[{id:662,name:'馬牌',count:2}],activeBuffs:{},equipment:{},runtimeState:{statuses:{}}};
window.addBattleLog=t=>logs.push(t);window.getItemData=id=>id===662?{id:662,name:'馬牌'}:null;window.getWorldMonsterTestEntities=()=>[];window.collectLiveCombatEnemies=()=>[];window.saveGame=()=>{};
window.ConsumableRuntime={hasActiveItemEffect:(id,status)=>Object.values(player.activeBuffs).some(b=>b.sourceItemId===id&&b.status===status&&b.expiresAt>Date.now())};
window.useItem=id=>{const s=player.inventory.find(x=>x.id===id);if(!s||s.count<=0)return false;s.count--;player.activeBuffs.horse={sourceItemId:662,status:'SC_SPEEDUP0',expiresAt:Date.now()+180000,effects:{moveSpeedRate:25}};return true};
let logs=[];
vm.runInThisContext(fs.readFileSync(path.join(ROOT,'js/auto_battle.js'),'utf8'),{filename:'auto_battle.js'});
let used=tryAutoSpeedBadge();check(used,'自動掛機會使用馬牌',used);check(player.inventory[0].count===1,'自動馬牌只扣一個',player.inventory[0].count);
used=tryAutoSpeedBadge();check(!used,'效果存在時不重複使用',used);check(player.inventory[0].count===1,'效果存在時不浪費馬牌',player.inventory[0].count);
delete player.activeBuffs.horse;player.inventory[0].count=0;used=tryAutoSpeedBadge();check(!used,'沒有馬牌時不阻塞掛機',used);check(logs.some(x=>x.includes('背包沒有馬牌')),'沒有馬牌有明確提示',logs.join('|'));
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');check(html.includes('id="autoCombatSpeedBadgeEnabled"'),'自動戰鬥 UI 有馬牌選項');
const shop=JSON.parse(fs.readFileSync(path.join(ROOT,'data/shops.json'),'utf8')).tool_common;check(shop.items.some(x=>x.itemId===662&&x.price===1450),'共用商人販售馬牌 1450 Zeny');
const report={version:'0.9.82HQ',summary:{checks:checks.length,passed:checks.filter(x=>x.ok).length,failed:checks.filter(x=>!x.ok).length},checks};fs.writeFileSync(path.join(ROOT,'TEST_REPORT_0.9.82HQ_AUTO_HORSE_BADGE.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));process.exit(report.summary.failed?1:0);
