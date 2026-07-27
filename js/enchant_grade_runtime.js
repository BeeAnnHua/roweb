//============================================================
// RO_WEB 0.9.82GK — rAthena Renewal Enchant Grade Runtime
//============================================================
(() => {
  "use strict";
  const VERSION="0.9.82GK", RULE_KEY="data/enchant_grade_rules.json", EXCHANGE_KEY="data/enchant_grade_exchange.json", DROP_KEY="data/enchant_grade_map_drops.json";
  const state={open:false,npcName:"裝備升階匠人",tab:"grade",selected:null,optionIndex:0,catalystSteps:0,exchangeIndex:0,exchangeQty:1,lastResult:null};
  const n=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f, i=(v,f=0)=>Math.floor(n(v,f));
  const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  const itemId=v=>Number(v?.id??v?.itemId??v?.officialId??v??0)||0;
  const rules=()=>window.RO_WEB_DATA?.[RULE_KEY]||null, exchanges=()=>window.RO_WEB_DATA?.[EXCHANGE_KEY]||null, dropProfiles=()=>window.RO_WEB_DATA?.[DROP_KEY]||null;
  const dataOf=v=>window.getItemData?.(itemId(v))||null;
  const gradeNames=["無階","D","C","B","A"];
  function groupOf(d){const c=String(d?.category||d?.dbType||d?.Type||"").toLowerCase(),s=String(d?.slot||"").toLowerCase();if(c==="weapon"||String(d?.dbType||d?.Type)==="Weapon"||s==="weapon")return "Weapon";if(c==="armor"||String(d?.dbType||d?.Type)==="Armor"||s)return "Armor";return null;}
  function levelOf(d,g=groupOf(d)){return g==="Weapon"?Math.max(1,Math.min(5,i(d?.weaponLevel??d?.WeaponLevel??1,1))):g==="Armor"?Math.max(1,Math.min(2,i(d?.armorLevel??d?.ArmorLevel??1,1))):0;}
  function eligible(d){const g=groupOf(d),l=levelOf(d,g);return (g==="Weapon"&&l===5)||(g==="Armor"&&l===2);}
  function gradeIndex(inst){const raw=inst?.enchantGrade??inst?.grade??0;if(typeof raw==="string")return Math.max(0,gradeNames.indexOf(raw));return Math.max(0,Math.min(4,i(raw)));}
  function currentGradeKey(inst){return ["None","D","C","B","A"][gradeIndex(inst)]||"None";}
  function gradeRule(d,inst){const g=groupOf(d),l=levelOf(d,g),key=currentGradeKey(inst);return rules()?.groups?.[g]?.levels?.[String(l)]?.grades?.[key]||null;}
  function normalize(raw,d){if(!raw)return null;raw.id=itemId(raw);raw.itemId=raw.id;raw.count=1;raw.refine=Math.max(0,Math.min(20,i(raw.refine)));raw.enchantGrade=gradeIndex(raw);if(!raw.instanceId)raw.instanceId=`grade_${raw.id}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;raw.name=raw.name||d?.name;return raw;}
  function candidates(){const out=[],seen=new Set();for(const [slot,baseId] of Object.entries(window.player?.equipment||{})){const d=dataOf(baseId);if(!eligible(d))continue;window.player.equipmentInstances=window.player.equipmentInstances||{};let inst=window.player.equipmentInstances[slot]||{id:itemId(baseId),itemId:itemId(baseId),count:1,refine:0,instanceId:`eq_${slot}_${baseId}`};window.player.equipmentInstances[slot]=inst;normalize(inst,d);if(gradeIndex(inst)>=4||seen.has(inst.instanceId))continue;seen.add(inst.instanceId);out.push({key:`equipment:${slot}:${inst.instanceId}`,location:"equipment",slot,instance:inst,data:d});}for(const raw of window.player?.inventory||[]){const d=dataOf(raw);if(!eligible(d)||!raw?.instanceId)continue;const inst=normalize(raw,d);if(gradeIndex(inst)>=4)continue;out.push({key:`inventory:${inst.instanceId}`,location:"inventory",slot:null,instance:inst,data:d});}return out;}
  function resolve(){return candidates().find(x=>x.key===state.selected?.key||String(x.instance.instanceId)===String(state.selected?.instanceId))||null;}
  function invCount(id){return (window.player?.inventory||[]).reduce((s,x)=>s+(itemId(x)===Number(id)&&!x.instanceId?Math.max(0,i(x.count)):0),0);}
  function consume(id,qty){let need=Math.max(0,i(qty)),list=window.player?.inventory||[];if(invCount(id)<need)return false;for(let p=list.length-1;p>=0&&need;p--){const x=list[p];if(itemId(x)!==Number(id)||x.instanceId)continue;const take=Math.min(need,i(x.count));x.count-=take;need-=take;if(x.count<=0)list.splice(p,1);}return !need;}
  function context(){const sel=resolve();if(!sel)return {sel:null,rule:null,option:null,baseChance:0,finalChance:0};const rule=gradeRule(sel.data,sel.instance),option=rule?.options?.find(o=>i(o.option)===i(state.optionIndex))||rule?.options?.[0]||null,baseChance=i(rule?.chances?.[String(i(sel.instance.refine))]),steps=Math.max(0,Math.min(i(rule?.catalyst?.maximumSteps),i(state.catalystSteps))),finalChance=Math.min(10000,baseChance+steps*i(rule?.catalyst?.chanceIncrease));return {sel,rule,option,baseChance,steps,finalChance};}
  function itemName(id){return dataOf(id)?.name||`Item ${id}`;}
  function refresh(){window.recalculatePlayerStats?.();window.updatePlayerUI?.();window.updateInventoryUI?.();window.updateEquipmentUI?.();window.updateStatusUI?.({force:true});window.updateQuickSlotUI?.();window.saveGame?.();}
  function destroy(sel){if(sel.location==="inventory"){const list=window.player?.inventory||[],idx=list.findIndex(x=>String(x?.instanceId)===String(sel.instance.instanceId));if(idx>=0)list.splice(idx,1);}else{if(window.player?.equipment)window.player.equipment[sel.slot]=null;if(window.player?.equipmentInstances)delete window.player.equipmentInstances[sel.slot];}}
  function announce(text){window.MvpGachaRuntime?.showRareBanner?.("red",`★ ${text} ★`);}
  function playerName(){return window.getPlayerAnnouncementName?.()||window.player?.name||"冒險者";}
  function attempt(opts={}){const c=context();if(!c.sel||!c.rule||!c.option)return {ok:false,reason:"請先選擇可升階裝備。"};if(c.baseChance<=0)return {ok:false,reason:`目前 +${c.sel.instance.refine} 不符合 ${c.rule.targetGrade} 階升階條件。`};const cat=c.rule.catalyst,catNeed=c.steps*i(cat?.amountPerStep);if(invCount(c.option.materialItemId)<i(c.option.amount))return {ok:false,reason:`${itemName(c.option.materialItemId)}不足。`};if(catNeed&&invCount(cat.itemId)<catNeed)return {ok:false,reason:`${itemName(cat.itemId)}不足，需要 ${catNeed}。`};if(n(window.player?.zeny)<i(c.option.zeny))return {ok:false,reason:`Zeny 不足，需要 ${i(c.option.zeny).toLocaleString()}。`};consume(c.option.materialItemId,c.option.amount);if(catNeed)consume(cat.itemId,catNeed);window.player.zeny=Math.max(0,n(window.player.zeny)-i(c.option.zeny));const roll=opts.forceSuccess?0:opts.forceFail?9999:Math.floor(Math.random()*10000),success=roll<c.finalChance,before=gradeIndex(c.sel.instance),target=gradeNames[before+1];let text,kind;if(success){c.sel.instance.enchantGrade=before+1;c.sel.instance.grade=before+1;c.sel.instance.refine=0;text=`升階成功：${c.sel.data.name} 提升為 ${target} 階，精煉值重置為 +0。`;kind="success";if(c.rule.announceSuccess)announce(`玩家 ${playerName()} 將 ${c.sel.data.name} 升階為 ${target} 階`);}else if(i(c.option.breakingRate)>=10000){const name=c.sel.data.name;destroy(c.sel);text=`升階失敗：${name} 已損壞消失。`;kind="failure";if(c.rule.announceFail)announce(`玩家 ${playerName()} 升階 ${name} 至 ${target} 階失敗`);}else{const down=i(c.option.downgradeAmount);c.sel.instance.refine=Math.max(0,i(c.sel.instance.refine)-down);text=down?`升階失敗：精煉值下降 ${down}。`:`升階失敗：裝備完整保留。`;kind="protected";if(c.rule.announceFail)announce(`玩家 ${playerName()} 升階 ${c.sel.data.name} 至 ${target} 階失敗`);}state.lastResult={kind,text};window.addBattleLog?.(text,success?"item":"system");refresh();render();return {ok:true,success,kind,text};}
  function exchange(recipeIndex=state.exchangeIndex,qty=state.exchangeQty){const r=exchanges()?.recipes?.find(x=>i(x.index)===i(recipeIndex));qty=Math.max(1,Math.min(999,i(qty,1)));if(!r)return {ok:false,reason:"找不到合成配方。"};for(const req of r.requiredItems||[])if(invCount(req.itemId)<i(req.amount)*qty)return {ok:false,reason:`${req.name}不足。`};const price=i(r.zeny)*qty;if(n(window.player?.zeny)<price)return {ok:false,reason:`Zeny 不足，需要 ${price.toLocaleString()}。`};for(const req of r.requiredItems||[])consume(req.itemId,i(req.amount)*qty);window.player.zeny-=price;window.addItem?.({id:r.outputItemId,name:r.outputName},i(r.outputAmount)*qty);const text=`合成 ${r.outputName} ×${qty}，消耗 ${price.toLocaleString()} Zeny。`;state.lastResult={kind:"success",text};window.addBattleLog?.(text,"item");refresh();render();return {ok:true,text};}
  function rollMapBonusDrops(monster){const mapId=window.currentMap?.id||window.player?.map||"",profile=dropProfiles()?.profiles?.[mapId];if(!profile||!monster)return [];const awarded=[];for(const e of profile.entries||[]){if(Array.isArray(e.monsterIds)&&!e.monsterIds.includes(Number(monster.id)))continue;if(e.skipIfOriginalDrop&&[...(monster.drops||[]),...(monster.mvpDrops||[])].some(d=>itemId(d.itemId)===itemId(e.itemId)))continue;if(Math.floor(Math.random()*10000)+1>i(e.chance))continue;const qty=Math.max(1,Math.floor(n(e.qtyMin,1)+Math.random()*(n(e.qtyMax,e.qtyMin)-n(e.qtyMin,1)+1)));window.addItem?.({id:e.itemId,name:itemName(e.itemId)},qty);window.recordItemDrop?.(e.itemId,qty);window.emitLootRewardLog?.(`升階材料：額外取得 ${itemName(e.itemId)} ×${qty}。`,"item");awarded.push({itemId:e.itemId,qty});}return awarded;}
  function decorateStatusSource(slot,base){if(!base)return base;const inst=window.player?.equipmentInstances?.[slot];const gi=gradeIndex(inst);if(!gi||groupOf(base)!=="Weapon")return base;const currentKey=["None","D","C","B"][gi-1],r=rules()?.groups?.Weapon?.levels?.["5"]?.grades?.[currentKey],pct=i(r?.bonusPercent);if(!pct)return {...base,enchantGrade:gi};const refineBonus=window.RefineRuntime?.refineBonusFor?.(base,i(inst?.refine))?.bonus||0,extra=Math.floor(refineBonus*pct/100),out={...base,enchantGrade:gi,gradeBonusPercent:pct,gradeRefineBonus:extra};out.atk=n(base.atk??base.Attack)+extra;out.Attack=out.atk;const sub=String(base.subCategory||base.dbSubType||"").toLowerCase();if(sub!=="bow"){out.matk=n(base.matk??base.Matk)+extra;out.Matk=out.matk;}return out;}
  function decorateCombatItem(slot,base){if(!base)return base;const actual=slot==="leftWeapon"&&!window.player?.equipmentInstances?.leftWeapon?"shield":slot,inst=window.player?.equipmentInstances?.[actual],gi=gradeIndex(inst);if(!gi)return base;const key=["None","D","C","B"][gi-1],r=rules()?.groups?.[groupOf(base)]?.levels?.[String(levelOf(base))]?.grades?.[key];return {...base,enchantGrade:gi,EnchantGrade:gi,gradeBonusPercent:i(r?.bonusPercent)};}
  function open(npc){state.open=true;state.npcName=npc?.name||"裝備升階匠人";const rows=candidates();if(!resolve()&&rows.length)state.selected={key:rows[0].key,instanceId:rows[0].instance.instanceId};const el=document.getElementById("enchantGradeWindow");if(el){el.hidden=false;el.classList.remove("hidden-window");window.bringWindowToFront?.(el);}render();}
  function close(){state.open=false;const el=document.getElementById("enchantGradeWindow");if(el){el.hidden=true;el.classList.add("hidden-window");}}
  function render(){
    if(typeof document==="undefined") return;
    const list=document.getElementById("enchantGradeEquipmentList");
    const detail=document.getElementById("enchantGradeDetail");
    const exchangeHost=document.getElementById("enchantGradeExchangeList");
    const msg=document.getElementById("enchantGradeMessage");
    const npcNameEl=document.getElementById("enchantGradeNpcName");
    if(npcNameEl) npcNameEl.textContent=state.npcName;
    document.querySelectorAll("[data-grade-tab]").forEach(b=>b.classList.toggle("is-active",b.dataset.gradeTab===state.tab));
    const gradePanel=document.getElementById("enchantGradeGradePanel");
    const exchangePanel=document.getElementById("enchantGradeExchangePanel");
    if(gradePanel) gradePanel.hidden=state.tab!=="grade";
    if(exchangePanel) exchangePanel.hidden=state.tab!=="exchange";
    if(msg) msg.textContent=state.lastResult?.text||"";

    if(list){
      const rows=candidates(), selected=resolve();
      list.innerHTML=rows.length ? rows.map(x=>`<button type="button" class="grade-equipment-row ${selected?.key===x.key?'is-active':''}" data-grade-select="${esc(x.key)}"><img src="${esc(x.data.icon||'')}" alt=""><span><b>${esc(x.data.name)}</b><small>+${i(x.instance.refine)}｜${gradeNames[gradeIndex(x.instance)]}階｜${x.location==='equipment'?'穿戴中':'背包'}</small></span></button>`).join("") : '<div class="grade-empty">沒有可升階的五級武器或二級防具。</div>';
      list.querySelectorAll('[data-grade-select]').forEach(button=>button.addEventListener('click',()=>{
        const row=rows.find(r=>r.key===button.dataset.gradeSelect);
        state.selected=row?{key:row.key,instanceId:row.instance.instanceId}:null;
        state.catalystSteps=0;
        render();
      }));
    }

    if(detail){
      const c=context();
      if(!c.sel){
        detail.innerHTML='<div class="grade-empty">請選擇裝備。</div>';
      }else{
        const cat=c.rule?.catalyst;
        const catNeed=c.steps*i(cat?.amountPerStep);
        const opts=c.rule?.options||[];
        detail.innerHTML=`<div class="grade-selected"><img src="${esc(c.sel.data.icon||'')}" alt=""><div><h3>${esc(c.sel.data.name)}</h3><p>+${i(c.sel.instance.refine)}｜${gradeNames[gradeIndex(c.sel.instance)]} → ${esc(c.rule?.targetGrade||'MAX')}</p></div></div><div class="grade-rate"><span>成功率</span><b>${(c.finalChance/100).toFixed(2)}%</b><small>基礎 ${(c.baseChance/100).toFixed(2)}%</small></div><div class="grade-options">${opts.map(o=>`<button type="button" data-grade-option="${o.option}" class="${i(o.option)===i(state.optionIndex)?'is-active':''}"><b>${i(o.option)===0?'高風險升階':'安全升階'}</b><span>${esc(itemName(o.materialItemId))} ×${o.amount}｜${i(o.zeny).toLocaleString()} Zeny</span><small>${i(o.breakingRate)>=10000?'失敗裝備消失':'失敗裝備保留'}</small></button>`).join('')}</div><label class="grade-catalyst">庇佑材料加成：<input id="gradeCatalystSteps" type="range" min="0" max="${i(cat?.maximumSteps)}" value="${c.steps}"><span>${c.steps} 段｜${catNeed?`${esc(itemName(cat.itemId))} ×${catNeed}`:'不使用'}</span></label><button id="enchantGradeExecute" class="grade-execute" type="button">執行升階</button>`;
        detail.querySelectorAll('[data-grade-option]').forEach(button=>button.addEventListener('click',()=>{state.optionIndex=i(button.dataset.gradeOption);render();}));
        detail.querySelector('#gradeCatalystSteps')?.addEventListener('input',event=>{state.catalystSteps=i(event.target.value);render();});
        detail.querySelector('#enchantGradeExecute')?.addEventListener('click',()=>{const result=attempt();if(!result.ok){state.lastResult={kind:'failure',text:result.reason};render();}});
      }
    }

    if(exchangeHost){
      const recipes=exchanges()?.recipes||[];
      exchangeHost.innerHTML=recipes.map(r=>`<div class="grade-recipe"><img src="${esc(dataOf(r.outputItemId)?.icon||'')}" alt=""><div><b>${esc(r.outputName)}</b><small>${r.requiredItems.map(x=>`${esc(x.name)} ×${x.amount}`).join('＋')}｜${i(r.zeny).toLocaleString()} Zeny</small></div><button type="button" data-grade-exchange="${r.index}">合成</button></div>`).join('');
      exchangeHost.querySelectorAll('[data-grade-exchange]').forEach(button=>button.addEventListener('click',()=>{
        const qty=Math.max(1,i(document.getElementById('enchantGradeExchangeQty')?.value,1));
        const result=exchange(i(button.dataset.gradeExchange),qty);
        if(!result.ok){state.lastResult={kind:'failure',text:result.reason};render();}
      }));
    }
  }
  function setTab(tab){state.tab=tab==='exchange'?'exchange':'grade';render();}
  window.EnchantGradeRuntime={version:VERSION,state,rules,exchanges,dropProfiles,eligible,groupOf,levelOf,gradeIndex,gradeRule,candidates,inventoryCount:invCount,attemptSelectedGrade:attempt,exchange,rollMapBonusDrops,decorateStatusSource,decorateCombatItem,render};
  window.openEnchantGradeWindow=open;window.closeEnchantGradeWindow=close;window.setEnchantGradeTab=setTab;window.attemptSelectedGrade=attempt;
})();
