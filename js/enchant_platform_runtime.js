//=======================================
// RO_WEB Shared Enchant Platform Runtime v0.9.82HL
// Formal Dim Glacier weapon enchant: slot 4 -> 3 -> 2, upgrade and reset.
//=======================================
(function(){
  "use strict";

  const VERSION="0.9.82HL";
  const DATA_KEY="data/dim_glacier_enchant.json";
  const SLOT_ORDER=[4,3,2];
  const GRADE_LABELS=["無階","D","C","B","A"];
  const SHORT_MATERIAL_NAMES={
    1000811:"原石",1001034:"雪花",1001035:"閃亮",1001036:"光輝",1001037:"冰晶",
    1001031:"侵蝕",1001032:"中和",1001033:"毒氣"
  };
  const state={selectedKey:null,activeTab:"enchant",currentSlot:4,selectedStoneId:null,selectedUpgradeIndex:null,search:""};

  function byId(id){return document.getElementById(id);}
  function n(value,fallback=0){const x=Number(value);return Number.isFinite(x)?x:fallback;}
  function iconPath(id){return `images/items/${Number(id)}.webp?v=${VERSION}`;}
  function escapeHtml(value){return String(value??"").replace(/[&<>'"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[ch]);}
  function cleanText(value){return String(value??"").replace(/\^[0-9A-Fa-f]{6}/g,"").replace(/\^000000/g,"").replace(/^_+$/gm,"").replace(/\n{3,}/g,"\n\n").trim();}
  function clone(value){return JSON.parse(JSON.stringify(value));}
  function catalog(){const data=window.RO_WEB_DATA?.[DATA_KEY];return data&&typeof data==="object"?data:null;}
  function targetIds(){return new Set((catalog()?.targetWeaponIds||[]).map(Number));}
  function slotData(slot){return catalog()?.slots?.[String(Number(slot))]||{items:[],count:0};}
  function allUpgrades(){return Array.isArray(catalog()?.upgrades)?catalog().upgrades:[];}
  function itemData(id){return window.getItemData?.(id)||window.RO_WEB_DATA?.["data/items/item_index.json"]?.[String(id)]||null;}
  function gradeLabel(instance){return GRADE_LABELS[Math.max(0,Math.min(4,n(instance?.enchantGrade??instance?.grade)))]||"無階";}
  function isOpen(){const host=byId("enchantPlatformWindow");return !!host&&!host.hidden&&!host.classList.contains("hidden-window");}

  function normalizeInstanceInPlace(raw){
    if(!raw)return null;
    const normalized=window.normalizeEquipmentInstance?window.normalizeEquipmentInstance(raw,itemData(raw.id)):raw;
    // Preserve the live equipment-instance object identity. The platform calls
    // eligibility checks while resolving a selected stone; replacing the object
    // at that point would leave the transaction holding a stale reference and
    // make an apparently successful enchant disappear before save.
    const target=(raw&&typeof raw==="object")?raw:normalized;
    if(normalized!==target&&normalized&&typeof normalized==="object")Object.assign(target,normalized);
    if(!Array.isArray(target.cards))target.cards=[null,null,null,null];
    while(target.cards.length<4)target.cards.push(null);
    if(!Array.isArray(target.enchants))target.enchants=[];
    return target;
  }

  function prepareEquipmentInstances(){
    // Legacy saves may still contain stacked/plain equipment rows. Normalize only
    // when the platform opens. Re-running the global normalizer during every
    // render replaces all equipment objects and can invalidate a live transaction.
    if(typeof window.normalizeAllItemInstances==="function")window.normalizeAllItemInstances();
  }

  function eligibleEquipment(){
    const ids=targetIds(),rows=[];
    (window.player?.inventory||[]).forEach((raw,index)=>{
      if(!ids.has(Number(raw?.id)))return;
      const instance=normalizeInstanceInPlace(raw);
      if(instance!==raw)window.player.inventory[index]=instance;
      rows.push({key:`inventory:${instance.instanceId}`,source:"inventory",sourceLabel:"背包",index,instance,item:itemData(instance.id)});
    });
    for(const [slot,id] of Object.entries(window.player?.equipment||{})){
      if(!ids.has(Number(id)))continue;
      window.player.equipmentInstances=window.player.equipmentInstances||{};
      let instance=window.player.equipmentInstances[slot];
      if(!instance){instance=normalizeInstanceInPlace({id});window.player.equipmentInstances[slot]=instance;}
      else instance=normalizeInstanceInPlace(instance);
      rows.push({key:`equipment:${slot}`,source:"equipment",sourceLabel:"穿戴中",slot,instance,item:itemData(instance.id)});
    }
    return rows;
  }

  function resolveLiveEntry(key=state.selectedKey){
    if(!key)return null;
    const raw=String(key);
    if(raw.startsWith("inventory:")){
      const instanceId=raw.slice("inventory:".length);
      const index=(window.player?.inventory||[]).findIndex(row=>String(row?.instanceId||"")===instanceId);
      if(index<0)return null;
      const instance=normalizeInstanceInPlace(window.player.inventory[index]);
      return {key:raw,source:"inventory",sourceLabel:"背包",index,instance,item:itemData(instance.id)};
    }
    if(raw.startsWith("equipment:")){
      const slot=raw.slice("equipment:".length);
      const id=window.player?.equipment?.[slot];
      if(!id||!targetIds().has(Number(id)))return null;
      window.player.equipmentInstances=window.player.equipmentInstances||{};
      let instance=window.player.equipmentInstances[slot];
      if(!instance){instance=normalizeInstanceInPlace({id});window.player.equipmentInstances[slot]=instance;}
      else instance=normalizeInstanceInPlace(instance);
      return {key:raw,source:"equipment",sourceLabel:"穿戴中",slot,instance,item:itemData(instance.id)};
    }
    return null;
  }

  function selectedEntry(){
    const rows=eligibleEquipment();
    let row=rows.find(x=>x.key===state.selectedKey)||rows[0]||null;
    if(row&&state.selectedKey!==row.key)state.selectedKey=row.key;
    return row;
  }
  function enchantAt(instance,slot){return (instance?.enchants||[]).find(row=>Number(row?.slot??row?.playerSlot)===Number(slot))||null;}
  function currentEnchantSlot(instance){return SLOT_ORDER.find(slot=>!enchantAt(instance,slot))||null;}
  function syncCurrentSlot(){state.currentSlot=currentEnchantSlot(selectedEntry()?.instance);if(!state.currentSlot)state.selectedStoneId=null;}
  function pool(){syncCurrentSlot();return state.currentSlot?(slotData(state.currentSlot).items||[]):[];}
  function selectedStone(){return pool().find(row=>Number(row.id)===Number(state.selectedStoneId))||null;}
  function nextUpgrade(instance){const current=enchantAt(instance,2);if(!current)return null;return allUpgrades().find(step=>Number(step.from?.id)===Number(current.id))||null;}
  function selectedUpgrade(){const entry=selectedEntry(),next=nextUpgrade(entry?.instance);if(!next)return null;if(state.selectedUpgradeIndex===null)return next;return allUpgrades()[state.selectedUpgradeIndex]===next?next:next;}

  function inventoryCount(id){return (window.player?.inventory||[]).reduce((sum,row)=>String(row?.id)===String(id)&&!row?.instanceId?sum+Math.max(0,n(row.count)):sum,0);}
  function materialEnough(materials,multiplier=1){return (materials||[]).every(row=>inventoryCount(row.id)>=n(row.amount)*multiplier);}
  function zenyEnough(amount){return n(window.player?.zeny)>=n(amount);}
  function consumeMaterials(materials,multiplier=1){
    for(const material of materials||[]){
      let need=n(material.amount)*multiplier;
      for(let i=(window.player?.inventory||[]).length-1;i>=0&&need>0;i--){
        const row=window.player.inventory[i];
        if(row?.instanceId||String(row?.id)!==String(material.id))continue;
        const take=Math.min(need,Math.max(0,n(row.count)));row.count=n(row.count)-take;need-=take;
        if(row.count<=0)window.player.inventory.splice(i,1);
      }
      if(need>0)throw new Error(`材料不足：${material.name||material.id}`);
    }
  }
  function snapshot(){return clone({inventory:window.player?.inventory||[],equipment:window.player?.equipment||{},equipmentInstances:window.player?.equipmentInstances||{},zeny:n(window.player?.zeny)});}
  function restore(snap){window.player.inventory=snap.inventory;window.player.equipment=snap.equipment;window.player.equipmentInstances=snap.equipmentInstances;window.player.zeny=snap.zeny;}
  function commitUpdates(message){
    window.invalidateCardRuntime?.();window.invalidatePlayerUiRenderCaches?.("status");window.syncEquipmentGrantedSkills?.();
    window.recalculatePlayerStats?.();window.updateInventoryUI?.();window.updateEquipmentUI?.();window.updatePlayerUI?.();window.saveGame?.();
    if(message)window.addBattleLog?.(message);
  }
  function applyEnchantRow(instance,slot,row){
    const next=(instance.enchants||[]).filter(x=>Number(x?.slot??x?.playerSlot)!==Number(slot));
    next.push({id:Number(row.id),optionId:Number(row.id),name:row.name,displayName:row.name,effect:cleanText(row.effect||""),effectText:cleanText(row.effect||""),aegisName:row.aegisName||"",resource:row.resource||"",slot:Number(slot),playerSlot:Number(slot),createdAt:Date.now()});
    next.sort((a,b)=>Number(b.slot??b.playerSlot)-Number(a.slot??a.playerSlot));instance.enchants=next;
  }

  function openEnchantPlatform(npc){
    const host=byId("enchantPlatformWindow");if(!host||!catalog())return false;
    state.activeTab="enchant";state.selectedStoneId=null;state.selectedUpgradeIndex=null;state.search="";
    prepareEquipmentInstances();
    const rows=eligibleEquipment();state.selectedKey=rows[0]?.key||null;syncCurrentSlot();
    const npcName=byId("enchantPlatformNpcName"),search=byId("enchantPlatformStoneSearch");
    if(npcName)npcName.textContent=npc?.name||"斐揚附魔研究員";if(search)search.value="";
    host.hidden=false;host.classList.remove("hidden-window");renderAll();
    setMessage(rows.length?"請選擇黯淡冰晶武器與附魔效果；材料足夠時即可執行。":"目前沒有可附魔的黯淡冰晶武器。可先從蛇巢穴取得黯淡冰晶武器箱。" );
    window.bringWindowToFront?.(host);window.addBattleLog?.(`${npc?.name||"附魔研究員"}：黯淡冰晶武器附魔服務已開啟。`);return true;
  }
  function closeEnchantPlatform(){const host=byId("enchantPlatformWindow");if(!host)return;closeEnchantStoneInfo();host.classList.add("hidden-window");host.hidden=true;}
  function setMessage(text){const el=byId("enchantPlatformMessage");if(el)el.textContent=String(text||"");}
  function setEnchantPlatformTab(tab){if(!["enchant","upgrade","reset"].includes(tab))return;state.activeTab=tab;state.selectedStoneId=null;state.search="";const search=byId("enchantPlatformStoneSearch");if(search)search.value="";document.querySelectorAll("[data-enchant-platform-tab]").forEach(button=>{const active=button.dataset.enchantPlatformTab===tab;button.classList.toggle("is-active",active);button.setAttribute("aria-selected",active?"true":"false");});renderAll();}
  function setEnchantSearch(value){state.search=String(value||"").trim().toLowerCase();renderStonePanel();}
  function selectEnchantEquipment(key){if(!eligibleEquipment().some(row=>row.key===key))return;state.selectedKey=key;state.selectedStoneId=null;state.selectedUpgradeIndex=null;state.search="";const search=byId("enchantPlatformStoneSearch");if(search)search.value="";syncCurrentSlot();renderAll();}
  function selectEnchantStone(slot,id){syncCurrentSlot();if(state.activeTab!=="enchant"||Number(slot)!==Number(state.currentSlot))return;const stone=pool().find(row=>Number(row.id)===Number(id));if(!stone)return;state.selectedStoneId=Number(id);renderStonePanel();renderCostPanel();openEnchantStoneInfo(stone,`第${slot}洞候選附魔｜Item ID ${stone.id}`);}
  function inspectSelectedUpgrade(){const step=selectedUpgrade();if(step)openEnchantStoneInfo(step.to,"升階後效果");}
  function inspectEnchantSlot(slot){const entry=selectedEntry();if(!entry)return;const numeric=Number(slot);let content=null;if(numeric===1){const cardId=(entry.instance.cards||[]).find(Boolean);if(cardId){const card=window.getCardInfo?.(cardId)||itemData(cardId);content={id:cardId,name:card?.name||`卡片 ${cardId}`,effect:(card?.description||[]).join("\n")};}}else content=enchantAt(entry.instance,numeric);if(content)openEnchantStoneInfo(content,numeric===1?"第1洞｜卡片":`第${numeric}洞｜已附魔`);}
  function openEnchantStoneInfo(item,context){const modal=byId("enchantStoneInfoWindow");if(!modal||!item)return;byId("enchantStoneInfoTitle").textContent=item.name||"附魔資訊";const icon=byId("enchantStoneInfoIcon");icon.src=iconPath(item.id);icon.alt=item.name||"附魔圖示";byId("enchantStoneInfoGroup").textContent=context||item.group||"附魔資訊";byId("enchantStoneInfoDescription").textContent=cleanText(item.effect||item.effectText||(Array.isArray(item.description)?item.description.join("\n"):item.description)||"尚無說明。");modal.hidden=false;modal.classList.remove("hidden-window");}
  function closeEnchantStoneInfo(){const modal=byId("enchantStoneInfoWindow");if(!modal)return;modal.classList.add("hidden-window");modal.hidden=true;}

  function executeEnchantPlatformAction(){
    const entry=selectedEntry();if(!entry){setMessage("沒有可操作的黯淡冰晶武器。");return;}
    const selectedKey=entry.key;
    const snap=snapshot();
    try{
      if(state.activeTab==="enchant"){
        syncCurrentSlot();const stone=selectedStone();if(!state.currentSlot||!stone)throw new Error("請先選擇目前洞位的附魔石。");
        if(!materialEnough(stone.materials)||!zenyEnough(stone.zeny))throw new Error("材料或 Zeny 不足。");
        if(!window.confirm?.(`確定要在第${state.currentSlot}洞附魔「${stone.name}」嗎？`))return;
        const doneSlot=state.currentSlot;
        consumeMaterials(stone.materials);window.player.zeny=n(window.player.zeny)-n(stone.zeny);
        const live=resolveLiveEntry(selectedKey);if(!live)throw new Error("附魔武器已移動或不存在，材料未消耗。");
        applyEnchantRow(live.instance,doneSlot,stone);
        const written=enchantAt(live.instance,doneSlot);if(!written||Number(written.id)!==Number(stone.id))throw new Error("附魔資料寫入失敗，材料未消耗。");
        state.selectedStoneId=null;state.selectedKey=live.key;syncCurrentSlot();commitUpdates(`${live.item?.name||live.instance.name} 第${doneSlot}洞已附魔：${stone.name}`);renderAll();setMessage(state.currentSlot?`第${doneSlot}洞完成，已解鎖第${state.currentSlot}洞。`:`第4、3、2洞全部完成，可進行升階或重置。`);return;
      }
      if(state.activeTab==="upgrade"){
        const step=selectedUpgrade();if(!step)throw new Error("目前第2洞沒有可升階的物理／魔法等級附魔。");
        if(!materialEnough(step.materials)||!zenyEnough(step.zeny))throw new Error("升階材料或 Zeny 不足。");
        if(!window.confirm?.(`確定升階「${step.from.name}」→「${step.to.name}」嗎？`))return;
        consumeMaterials(step.materials);window.player.zeny=n(window.player.zeny)-n(step.zeny);
        const live=resolveLiveEntry(selectedKey);if(!live)throw new Error("升階武器已移動或不存在，材料未消耗。");
        applyEnchantRow(live.instance,2,step.to);
        const written=enchantAt(live.instance,2);if(!written||Number(written.id)!==Number(step.to.id))throw new Error("升階資料寫入失敗，材料未消耗。");
        state.selectedKey=live.key;commitUpdates(`${live.item?.name||live.instance.name} 第2洞升階完成：${step.to.name}`);renderAll();setMessage(`升階成功：${step.to.name}`);return;
      }
      const reset=catalog()?.reset||{};const current=(entry.instance.enchants||[]).filter(x=>SLOT_ORDER.includes(Number(x?.slot??x?.playerSlot)));
      if(!current.length)throw new Error("這件武器沒有可重置的附魔。");
      if(!materialEnough(reset.materials)||!zenyEnough(reset.zeny))throw new Error("重置材料或 Zeny 不足。");
      if(!window.confirm?.("確定消耗雪花魔力原石 ×5，重置第4、3、2洞全部附魔嗎？第1洞卡片會保留。"))return;
      consumeMaterials(reset.materials);window.player.zeny=n(window.player.zeny)-n(reset.zeny);
      const live=resolveLiveEntry(selectedKey);if(!live)throw new Error("重置武器已移動或不存在，材料未消耗。");
      live.instance.enchants=(live.instance.enchants||[]).filter(x=>!SLOT_ORDER.includes(Number(x?.slot??x?.playerSlot)));
      if((live.instance.enchants||[]).some(x=>SLOT_ORDER.includes(Number(x?.slot??x?.playerSlot))))throw new Error("附魔重置失敗，材料未消耗。");
      state.selectedStoneId=null;state.selectedKey=live.key;syncCurrentSlot();commitUpdates(`${live.item?.name||live.instance.name} 的第4、3、2洞附魔已全部重置。`);renderAll();setMessage("重置完成：第1洞卡片保留，第4、3、2洞恢復空白。");
    }catch(error){restore(snap);renderAll();setMessage(`執行失敗：${error?.message||error}`);window.addBattleLog?.(`附魔平台：${error?.message||error}`);}
  }

  function renderAll(){syncCurrentSlot();renderEquipmentList();renderCenterPanel();renderStonePanel();renderCostPanel();}
  function weaponDisplayName(instance,item){const refine=`+${n(instance?.refine)}`;const grade=`[${gradeLabel(instance)}]`;const name=item?.name||instance?.name||`武器 ${instance?.id||""}`;const slots=Math.max(0,n(item?.slotCount??item?.slots??item?.Slots));return `${refine} ${grade} ${name} [${slots}]`;}
  function renderEquipmentList(){const host=byId("enchantPlatformEquipmentList");if(!host)return;const rows=eligibleEquipment();host.innerHTML=rows.length?rows.map(row=>{const inst=row.instance;return `<button type="button" class="enchant-preview-equipment${row.key===state.selectedKey?" is-active":""}" onclick="selectEnchantEquipment('${escapeHtml(row.key)}')"><img src="${iconPath(inst.id)}" alt="${escapeHtml(row.item?.name||inst.name)}"><span><b>${escapeHtml(weaponDisplayName(inst,row.item))}</b><small>${row.sourceLabel}｜${escapeHtml(row.item?.weaponType||row.item?.subCategory||"武器")}</small></span></button>`;}).join(""):`<div class="enchant-preview-empty"><b>沒有可附魔武器</b><span>只會列出背包或穿戴中的 26 種黯淡冰晶武器。</span></div>`;}
  function slotState(instance,slot){if(slot===1)return "card";if(enchantAt(instance,slot))return "filled";if(state.activeTab!=="enchant")return "view-only";if(state.currentSlot===slot)return "active";if(state.currentSlot===null)return "complete";const ci=SLOT_ORDER.indexOf(state.currentSlot),si=SLOT_ORDER.indexOf(slot);return si>ci?"locked":"empty";}
  function renderSlot(instance,slot){let content=null;if(slot===1){const cardId=(instance.cards||[]).find(Boolean);if(cardId){const card=window.getCardInfo?.(cardId)||itemData(cardId);content={id:cardId,name:card?.name||`卡片 ${cardId}`};}}else content=enchantAt(instance,slot);const status=slotState(instance,slot),label=slot===1?"第1洞｜卡片":`第${slot}洞｜附魔`;const image=content?`<img src="${iconPath(content.id)}" alt="${escapeHtml(content.name)}">`:`<span class="enchant-slot-empty-mark">${status==="locked"?"🔒":"◇"}</span>`;const name=content?.name||(status==="active"?"目前可附魔":status==="locked"?"尚未解鎖":"尚未附魔");return `<button type="button" class="enchant-visual-slot slot-${slot} is-${status}" ${content?`onclick="inspectEnchantSlot(${slot})"`:"disabled"}><span class="enchant-slot-number">${slot}</span>${image}<small>${escapeHtml(name)}</small></button>`;}
  function renderCenterPanel(){const host=byId("enchantPlatformCenter"),entry=selectedEntry();if(!host)return;if(!entry){host.innerHTML=`<div class="enchant-preview-empty"><b>請先取得黯淡冰晶武器</b></div>`;return;}const inst=entry.instance,name=entry.item?.name||inst.name,title=`<div class="enchant-preview-weapon-title"><b>${escapeHtml(weaponDisplayName(inst,entry.item))}</b></div>`;
    if(state.activeTab==="enchant"){host.innerHTML=`${title}<div class="enchant-weapon-stage"><div class="enchant-stage-glow"></div><img class="enchant-stage-weapon" src="${iconPath(inst.id)}" alt="${escapeHtml(name)}">${renderSlot(inst,1)}${renderSlot(inst,4)}${renderSlot(inst,2)}${renderSlot(inst,3)}</div><div class="enchant-progress-line"><b>${state.currentSlot?`目前順序：第${state.currentSlot}洞`:"第4、3、2洞皆完成"}</b><span>固定流程：第4洞 → 第3洞 → 第2洞；第1洞為卡片</span></div>`;return;}
    if(state.activeTab==="upgrade"){const step=selectedUpgrade();if(!step){const current=enchantAt(inst,2);host.innerHTML=`${title}<div class="enchant-preview-empty"><b>${current?"第2洞已達最高等級或無升階路線":"請先完成第2洞物理／魔法等級附魔"}</b><span>${current?.name||"完成第4、3、2洞後即可升階。"}</span></div>`;return;}host.innerHTML=`${title}<div class="enchant-upgrade-stage"><article><img src="${iconPath(step.from.id)}"><small>目前</small><b>${escapeHtml(step.from.name)}</b></article><div class="enchant-upgrade-arrow">→</div><article class="is-target"><img src="${iconPath(step.to.id)}"><small>升階後</small><b>${escapeHtml(step.to.name)}</b></article></div><div class="enchant-upgrade-effect"><h3>升階後效果</h3><p>${escapeHtml(cleanText(step.to.effect))}</p></div>`;return;}
    const reset=catalog()?.reset;host.innerHTML=`${title}<div class="enchant-tab-placeholder reset-preview"><img src="${iconPath(reset?.materials?.[0]?.id||1000811)}"><h3>重置第4、3、2洞</h3><p>消耗雪花魔力原石 ×5。第1洞卡片永久保留。</p></div>`;}
  function matchesSearch(row){if(!state.search)return true;return `${row.name||""} ${row.group||""} ${row.effect||""} ${row.id||""}`.toLowerCase().includes(state.search);}
  function renderStonePanel(){const host=byId("enchantPlatformStoneList"),heading=byId("enchantPlatformStoneHeading"),searchWrap=byId("enchantPlatformSearchWrap"),entry=selectedEntry();if(!host||!heading)return;if(state.activeTab==="reset"){if(searchWrap)searchWrap.hidden=true;heading.textContent="重置規則";host.innerHTML=`<div class="enchant-preview-empty"><b>雪花魔力原石 ×5</b><span>重置第4、3、2洞；第1洞卡片保留。</span></div>`;return;}if(searchWrap)searchWrap.hidden=false;if(state.activeTab==="upgrade"){const step=selectedUpgrade();heading.textContent=step?"第2洞下一階升階":"第2洞升階";host.innerHTML=step&&matchesSearch({name:`${step.from.name} ${step.to.name}`,effect:step.to.effect,id:step.to.id})?`<button type="button" class="enchant-stone-row is-selected" onclick="inspectSelectedUpgrade()"><img src="${iconPath(step.to.id)}"><span><b>${escapeHtml(step.from.name)} → ${escapeHtml(step.to.name)}</b><small>${step.materials.length} 種材料｜可升級效果</small></span></button>`:`<div class="enchant-preview-empty"><b>目前沒有可升階項目</b><span>第2洞必須是物理／魔法等級 Lv.1～Lv.4。</span></div>`;return;}syncCurrentSlot();if(!entry||!state.currentSlot){heading.textContent="附魔流程完成";host.innerHTML=`<div class="enchant-preview-empty"><b>第4、3、2洞皆已完成</b><span>請切換至升階或重置。</span></div>`;return;}const entire=pool(),rows=entire.filter(matchesSearch);heading.textContent=`第${state.currentSlot}洞可用附魔｜${rows.length} / ${entire.length}`;const groups=[];rows.forEach(stone=>{let group=groups.find(x=>x.name===stone.group);if(!group){group={name:stone.group,rows:[]};groups.push(group);}group.rows.push(stone);});host.innerHTML=groups.length?groups.map(group=>`<section class="enchant-stone-group"><h4>${escapeHtml(group.name)} <small>${group.rows.length}</small></h4>${group.rows.map(stone=>`<button type="button" class="enchant-stone-row${Number(state.selectedStoneId)===Number(stone.id)?" is-selected":""}" onclick="selectEnchantStone(${state.currentSlot},${stone.id})" title="左鍵鎖定並查看完整介紹"><img src="${iconPath(stone.id)}"><span><b>${escapeHtml(stone.name)}</b><small>Item ID ${stone.id}｜左鍵鎖定</small></span></button>`).join("")}</section>`).join(""):`<div class="enchant-preview-empty"><b>找不到符合項目</b></div>`;}
  function materialById(id){const numeric=Number(id),all=[...Object.values(catalog()?.slots||{}).flatMap(x=>(x.items||[]).flatMap(y=>y.materials||[])),...allUpgrades().flatMap(x=>x.materials||[]),...(catalog()?.reset?.materials||[])];return all.find(x=>Number(x.id)===numeric)||itemData(numeric)||{id:numeric,name:`材料 ${numeric}`};}
  function inspectEnchantMaterial(id){const row=materialById(id);openEnchantStoneInfo(row,`材料需求｜持有 ${inventoryCount(row.id)}`);}
  function renderMaterials(materials){return (materials||[]).length?(materials||[]).map(row=>{const owned=inventoryCount(row.id),need=n(row.amount),enough=owned>=need,short=SHORT_MATERIAL_NAMES[Number(row.id)]||String(row.name||"").slice(0,4);return `<button type="button" class="enchant-cost-item${enough?" is-enough":""}" onclick="inspectEnchantMaterial(${Number(row.id)})" title="${escapeHtml(row.name)}｜持有 ${owned}／需要 ${need}"><img src="${iconPath(row.id)}"><span><b>×${need}</b><small>${escapeHtml(short)}</small></span></button>`;}).join(""):`<div class="enchant-cost-note">此流程沒有材料需求。</div>`;}
  function renderCostPanel(){const mat=byId("enchantPlatformMaterialList"),zeny=byId("enchantPlatformZeny"),button=byId("enchantPlatformExecute"),entry=selectedEntry();if(!mat||!zeny||!button)return;let materials=[],cost=0,label="確認執行",enabled=false;if(state.activeTab==="enchant"){const row=selectedStone();materials=row?.materials||[];cost=n(row?.zeny);enabled=!!entry&&!!state.currentSlot&&!!row&&materialEnough(materials)&&zenyEnough(cost);label=state.currentSlot?`確認附魔｜第${state.currentSlot}洞`:"附魔流程完成";}else if(state.activeTab==="upgrade"){const step=selectedUpgrade();materials=step?.materials||[];cost=n(step?.zeny);enabled=!!entry&&!!step&&materialEnough(materials)&&zenyEnough(cost);label="確認升階";}else{const reset=catalog()?.reset||{};materials=reset.materials||[];cost=n(reset.zeny);const has=(entry?.instance?.enchants||[]).some(x=>SLOT_ORDER.includes(Number(x?.slot??x?.playerSlot)));enabled=!!entry&&has&&materialEnough(materials)&&zenyEnough(cost);label="確認重置";}mat.innerHTML=renderMaterials(materials);zeny.innerHTML=`<span>所需 Zeny</span><b>${cost.toLocaleString("zh-TW")}</b><small>${zenyEnough(cost)?"Zeny 足夠":"Zeny 不足"}</small>`;button.disabled=!enabled;button.classList.toggle("is-ready",enabled);button.textContent=label;}

  window.openEnchantPlatform=openEnchantPlatform;window.closeEnchantPlatform=closeEnchantPlatform;window.setEnchantPlatformTab=setEnchantPlatformTab;window.setEnchantSearch=setEnchantSearch;window.selectEnchantEquipment=selectEnchantEquipment;window.selectEnchantStone=selectEnchantStone;window.inspectSelectedUpgrade=inspectSelectedUpgrade;window.inspectEnchantSlot=inspectEnchantSlot;window.openEnchantStoneInfo=openEnchantStoneInfo;window.closeEnchantStoneInfo=closeEnchantStoneInfo;window.inspectEnchantMaterial=inspectEnchantMaterial;window.executeEnchantPlatformAction=executeEnchantPlatformAction;
  window.DimGlacierEnchantRuntime={version:VERSION,open:openEnchantPlatform,close:closeEnchantPlatform,getCatalog:catalog,getEligibleEquipment:eligibleEquipment,getState:()=>clone(state),getEnchantById:id=>window.CardRuntime?.getEnchantRecord?.(id)||Object.values(catalog()?.slots||{}).flatMap(x=>x.items||[]).find(x=>Number(x.id)===Number(id))||allUpgrades().flatMap(x=>[x.from,x.to]).find(x=>Number(x.id)===Number(id))||null,slotOrder:SLOT_ORDER.slice(),previewOnly:false,_debug:{resolveLiveEntry,weaponDisplayName,enchantAt,currentEnchantSlot}};
  document.addEventListener("keydown",event=>{if(event.key!=="Escape")return;const info=byId("enchantStoneInfoWindow");if(info&&!info.hidden){closeEnchantStoneInfo();return;}if(isOpen())closeEnchantPlatform();});
})();
