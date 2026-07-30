#!/usr/bin/env node
const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const read=rel=>JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'));
const manifest=read('data/items/database_manifest.json');
const itemMap={};
for(const rel of manifest.allDataPaths){const full=path.join(ROOT,rel);if(!fs.existsSync(full))continue;const data=read(rel);for(const row of (Array.isArray(data)?data:Object.values(data))){if(row&&typeof row==='object'&&(row.id!==undefined||row.Id!==undefined))itemMap[String(Number(row.id??row.Id))]=row;}}
const sources={};const add=(id,label)=>{id=String(Number(id));if(!Number.isFinite(Number(id)))return;(sources[id]??=new Set()).add(label)};
const shops=read('data/shops.json');for(const shop of Object.values(shops))for(const row of shop.items||[])add(row.itemId,`商店：${shop.name}`);
const boxes=read('data/item_boxes.json');const boxItemIds=new Set();for(const box of Object.values(boxes.boxes||{})){add(box.itemId,`箱子本體：${box.name}`);boxItemIds.add(String(Number(box.itemId)));for(const row of box.rewards||[])add(row.itemId,`箱子獎池：${box.name}`);}
const gacha=read('data/mvp_gacha.json');add(gacha.gachaItemId,'MVP 轉蛋本體');
function scanRewards(value,label){if(Array.isArray(value)){for(const x of value)scanRewards(x,label);return;}if(!value||typeof value!=='object')return;if(value.itemId!==undefined)add(value.itemId,label);for(const v of Object.values(value))scanRewards(v,label)}
scanRewards(gacha.rareCategories,'MVP 轉蛋稀有獎池');scanRewards(gacha.ordinaryRewards,'MVP 轉蛋普通獎池');
// Active runtime data. Skip split item definitions themselves so a definition is not mistaken for an acquisition source.
const runtimeFiles=[];
for(const rel of fs.readdirSync(path.join(ROOT,'data'),{recursive:true}).filter(x=>x.endsWith('.json'))){
 const normalized=String(rel).replaceAll('\\','/');
 if(normalized.startsWith('items/')||normalized.startsWith('card_runtime/'))continue;
 runtimeFiles.push(path.join(ROOT,'data',rel));
}
for(const file of runtimeFiles){let data;try{data=JSON.parse(fs.readFileSync(file,'utf8'))}catch{continue}const rel=path.relative(ROOT,file).replaceAll('\\','/');
 (function walk(v){if(Array.isArray(v))return v.forEach(walk);if(!v||typeof v!=='object')return;if(v.itemId!==undefined)add(v.itemId,`掉落／配方：${rel}`);for(const x of Object.values(v))walk(x)})(data);
}
global.window=global;global.document=undefined;window.player={};vm.runInThisContext(fs.readFileSync(path.join(ROOT,'js/consumable_runtime.js'),'utf8'),{filename:'consumable_runtime.js'});
const commandCounts={};const rows=[];
for(const [id,set] of Object.entries(sources)){
 const item=itemMap[id];if(!item||String(item.type)!=='consume')continue;
 const script=String(item.scriptRaw||item.Script||item.script||'').trim();const audit=ConsumableRuntime.analyze(item);let status='blocked-no-effect',handler='safe-block';let reason='沒有可辨識效果';
 if(boxItemIds.has(id)){status='active';handler='ItemBoxRuntime';reason='加權獎池開箱';}
 else if(item.manualUseOnly===true||String(item.subCategory)==='mvp_gacha'){status='active';handler='MvpGachaRuntime';reason='手動批次轉蛋';}
 else if(item.cashFoodEffect){status='active';handler='MvpGachaRuntime';reason='商城料理 Buff';}
 else if(item.percentHeal){status='active';handler='MvpGachaRuntime';reason='百分比恢復';}
 else if(['601','602'].includes(id)){status='active';handler='PositionEngine';reason=id==='601'?'蒼蠅翅膀':'蝴蝶翅膀';}
 else if(['physical_element_endow','armor_element_endow','armor_element_override'].includes(String(item.useEffect?.type||''))){status='active';handler='Player Item Endow';reason='屬性附加';}
 else if(audit.unsupported.length){status='blocked-unsupported';handler='ConsumableRuntime';reason=audit.unsupported.join(', ');}
 else if(audit.hasSupported){status='active';handler='ConsumableRuntime';reason=audit.commands.join(', ')||'官方 Script';}
 else if(Number(item.hp||0)>0||Number(item.sp||0)>0){status='active';handler='Player Recovery';reason='資料欄恢復';}
 else if(['506','511','525','526'].includes(id)){status='active';handler='Player Status Cure';reason='異常解除白名單';}
 else if(script&&/\bsc_end\b/i.test(script)){status='active';handler='ConsumableRuntime';reason='異常解除';}
 else if(item.useEffect){status='active';handler='Player useEffect';reason=String(item.useEffect.type||'useEffect');}
 for(const c of audit.commands)commandCounts[c]=(commandCounts[c]||0)+1;
 rows.push({id:Number(id),name:item.name,status,handler,reason,sources:[...set].sort(),scriptPreview:script.slice(0,300)});
}
rows.sort((a,b)=>a.id-b.id);
const byStatus={};for(const r of rows)byStatus[r.status]=(byStatus[r.status]||0)+1;
const blocked=rows.filter(r=>r.status.startsWith('blocked'));
const report={version:'0.9.82HQ',summary:{obtainableConsumables:rows.length,...byStatus,blockedTotal:blocked.length},policy:{supported:'Effects are applied through existing specialized runtimes or ConsumableRuntime.',unsupported:'Unsupported official mechanics are explicitly blocked without consuming the item; no generic fake success remains.'},commandCounts,blocked,rows};
fs.writeFileSync(path.join(ROOT,'CONSUMABLE_EFFECT_AUDIT_0.9.82HQ.json'),JSON.stringify(report,null,2)+'\n');
const md=['# 0.9.82HQ 可取得消耗品效果稽核','',`- 可取得消耗品：${rows.length}`,`- 已有實際效果：${byStatus.active||0}`,`- 尚未實作、已安全封鎖：${blocked.length}`,'','## 尚未實作（使用時不扣道具）','',...blocked.map(r=>`- ${r.id} ${r.name}：${r.reason}`),''];
fs.writeFileSync(path.join(ROOT,'CONSUMABLE_EFFECT_AUDIT_0.9.82HQ.md'),md.join('\n'));
console.log(JSON.stringify(report.summary,null,2));
console.log('blocked by reason',JSON.stringify(blocked.reduce((o,r)=>(o[r.reason]=(o[r.reason]||0)+1,o),{}),null,2));
