//=======================================
// 帳號共用倉庫 Runtime v0.9.82GN
// 獨立於角色 SAVE_KEY；只刪除角色時完整保留。
//=======================================
(function () {
  "use strict";

  const STORAGE_KEY = window.RO_WEB_ACCOUNT_STORAGE_KEY || "ro_web_account_storage_v1";
  const STORAGE_CAPACITY = 200;
  let accountStorage = null;
  let activeNpc = null;
  let activeCategory = "consume";

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function itemIdOf(row) {
    return typeof normalizeItemId === "function" ? normalizeItemId(row?.id ?? row?.itemId ?? row) : (row?.id ?? row?.itemId ?? row);
  }

  function itemDataOf(row) {
    return typeof getItemData === "function" ? getItemData(itemIdOf(row)) : null;
  }

  function isEquipment(row) {
    const data = itemDataOf(row);
    return Boolean(row?.instanceId) || String(data?.type || "").toLowerCase() === "equipment";
  }

  function normalizeStorageItem(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id = itemIdOf(raw);
    const data = itemDataOf(raw);
    if (id === null || id === undefined || id === "" || !data) return null;
    if (isEquipment(raw)) {
      const instance = typeof normalizeEquipmentInstance === "function"
        ? normalizeEquipmentInstance({ ...raw, id, itemId:id, count:1 }, data)
        : { ...raw, id, itemId:id, count:1, instanceId:String(raw.instanceId || `storage_${id}_${Date.now()}`) };
      instance.count = 1;
      return instance;
    }
    return { id, name:raw.name || data.name, count:Math.max(1, Math.floor(Number(raw.count || 1))), locked:false };
  }

  function normalizeAccountStorage(raw) {
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const normalized = { version:1, capacity:STORAGE_CAPACITY, items:[], updatedAt:Number(source.updatedAt || Date.now()) };
    const stacks = new Map();
    for (const row of Array.isArray(source.items) ? source.items : []) {
      const item = normalizeStorageItem(row);
      if (!item) continue;
      if (isEquipment(item)) normalized.items.push(item);
      else {
        const key=String(item.id);
        if (stacks.has(key)) stacks.get(key).count += item.count;
        else { stacks.set(key,item); normalized.items.push(item); }
      }
      if (normalized.items.length >= STORAGE_CAPACITY) break;
    }
    return normalized;
  }

  function loadAccountStorage() {
    if (accountStorage) return accountStorage;
    let raw = null;
    try {
      const text = localStorage.getItem(STORAGE_KEY);
      raw = text ? JSON.parse(text) : null;
    } catch (error) {
      console.warn("讀取帳號倉庫失敗：", error);
    }
    accountStorage = normalizeAccountStorage(raw);
    return accountStorage;
  }

  function saveAccountStorage() {
    const storage = loadAccountStorage();
    storage.updatedAt = Date.now();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
      return true;
    } catch (error) {
      console.error("儲存帳號倉庫失敗：", error);
      setStorageMessage("倉庫儲存失敗：瀏覽器空間不可用或已滿。", true);
      return false;
    }
  }

  function storageSlotsUsed() {
    return loadAccountStorage().items.length;
  }

  function getInventoryRows() {
    const stacks = new Map();
    const equipment = [];
    for (const raw of Array.isArray(window.player?.inventory) ? window.player.inventory : []) {
      const data = itemDataOf(raw);
      if (!data) continue;
      if (isEquipment(raw)) {
        equipment.push({ key:`instance:${String(raw.instanceId || "")}`, row:raw, data, equipment:true, count:1 });
      } else {
        const id=String(itemIdOf(raw));
        const count=Math.max(0,Math.floor(Number(raw.count || 0)));
        if (!count) continue;
        if (!stacks.has(id)) stacks.set(id,{ key:`stack:${id}`, row:raw, data, equipment:false, count:0, locked:false });
        const entry=stacks.get(id); entry.count += count; entry.locked = entry.locked || Boolean(raw.locked);
      }
    }
    return [...equipment,...stacks.values()].sort((a,b)=>String(a.data?.name||"").localeCompare(String(b.data?.name||""),'zh-Hant'));
  }

  function getStorageRows() {
    return loadAccountStorage().items.map((row,index)=>({
      key:isEquipment(row)?`instance:${String(row.instanceId || "")}`:`stack:${String(itemIdOf(row))}`,
      row,index,data:itemDataOf(row),equipment:isEquipment(row),count:Math.max(1,Math.floor(Number(row.count || 1)))
    })).filter(x=>x.data).sort((a,b)=>String(a.data?.name||"").localeCompare(String(b.data?.name||""),'zh-Hant'));
  }

  function categoryOf(entry){
    if(entry?.equipment||isEquipment(entry?.row))return "equipment";
    const type=String(entry?.data?.type||"").toLowerCase();
    return ["consume","cash"].includes(type)?"consume":"item";
  }
  function filterRows(rows){return rows.filter(entry=>categoryOf(entry)===activeCategory);}
  function setStorageCategory(category){
    activeCategory=["consume","equipment","item"].includes(String(category))?String(category):"consume";
    document.querySelectorAll("[data-storage-category]").forEach(button=>{const active=button.dataset.storageCategory===activeCategory;button.classList.toggle("is-active",active);button.setAttribute("aria-pressed",String(active));});
    renderStorageWindow();return true;
  }

  function compactName(row,data) {
    if (isEquipment(row) && typeof buildCompactItemName === "function") return buildCompactItemName(row,data);
    return data?.name || row?.name || `Item ${itemIdOf(row)}`;
  }

  function itemMeta(row,data,count) {
    if (isEquipment(row)) {
      const cards=Array.isArray(row.cards)?row.cards.filter(Boolean).length:0;
      const enchants=Array.isArray(row.enchants)?row.enchants.length:0;
      const details=[];
      if (Number(row.refine||0)>0) details.push(`精煉 +${Number(row.refine)}`);
      if (cards) details.push(`卡片 ${cards}`);
      if (enchants) details.push(`附魔 ${enchants}`);
      if (row.broken) details.push("損壞");
      return details.join("｜") || "裝備實例";
    }
    return `${String(data?.type || "物品")}｜持有 ${count}`;
  }

  function iconFor(data,row) {
    return data?.icon || `images/items/${data?.officialId || itemIdOf(row)}.webp`;
  }

  function createItemRow(entry, side) {
    const wrap=document.createElement("div"); wrap.className="storage-item-row";
    const icon=document.createElement("button"); icon.type="button"; icon.className="storage-item-icon"; icon.title="查看物品資料";
    const img=document.createElement("img"); img.src=iconFor(entry.data,entry.row); img.alt=entry.data?.name||"物品"; img.onerror=()=>{img.style.display="none"}; icon.appendChild(img);
    icon.onclick=()=>{ if(typeof showItemInfo==="function") showItemInfo(entry.row,{source:side==='inventory'?'inventory':'storage'}); };
    const copy=document.createElement("div"); copy.className="storage-item-copy";
    const name=document.createElement("b"); name.textContent=compactName(entry.row,entry.data);
    const meta=document.createElement("small"); meta.textContent=itemMeta(entry.row,entry.data,entry.count);
    copy.append(name,meta);
    const controls=document.createElement("div"); controls.className="storage-item-controls";
    let qty=null;
    if (!entry.equipment) {
      qty=document.createElement("input"); qty.type="number"; qty.min="1"; qty.max=String(entry.count); qty.value=String(entry.count); qty.inputMode="numeric"; qty.setAttribute("aria-label","數量"); qty.setAttribute("data-ro-gold-stepper","");
      controls.appendChild(qty);
      // GQ：建立時初始化一次，不使用全域 DOM 監看。
      window.ROGoldUI?.enhanceNumberInput?.(qty,{force:true});
    }
    const action=document.createElement("button"); action.type="button"; action.className=side==='inventory'?"storage-deposit-button":"storage-withdraw-button";
    action.textContent=side==='inventory'?"存入":"取出";
    if (side==='inventory' && entry.locked) { action.disabled=true; action.textContent="已鎖定"; }
    action.onclick=()=>{
      const amount=entry.equipment?1:Math.max(1,Math.floor(Number(qty?.value||1)));
      if(side==='inventory') depositStorageItem(entry.key,amount); else withdrawStorageItem(entry.key,amount);
    };
    controls.appendChild(action);
    wrap.append(icon,copy,controls);
    return wrap;
  }

  function setStorageMessage(text,isError=false) {
    const el=document.getElementById("storageMessage");
    if (!el) return;
    el.textContent=String(text||"");
    el.classList.toggle("is-error",Boolean(isError));
  }

  function renderStorageWindow() {
    const inventoryList=document.getElementById("storageInventoryList");
    const storageList=document.getElementById("storageAccountList");
    const cap=document.getElementById("storageCapacityText");
    const invCount=document.getElementById("storageInventoryCountText");
    if (!inventoryList || !storageList) return false;
    const allInventoryRows=getInventoryRows();
    const allStorageRows=getStorageRows();
    const inventoryRows=filterRows(allInventoryRows);
    const storageRows=filterRows(allStorageRows);
    if (cap) cap.textContent=`${storageSlotsUsed()} / ${STORAGE_CAPACITY}`;
    if (invCount) invCount.textContent=String(allInventoryRows.length);
    inventoryList.innerHTML=""; storageList.innerHTML="";
    if (!inventoryRows.length) inventoryList.innerHTML='<div class="storage-empty">此分類沒有可存入的物品。</div>';
    else inventoryRows.forEach(entry=>inventoryList.appendChild(createItemRow(entry,"inventory")));
    if (!storageRows.length) storageList.innerHTML='<div class="storage-empty">此分類目前沒有物品。</div>';
    else storageRows.forEach(entry=>storageList.appendChild(createItemRow(entry,"storage")));
    return true;
  }

  function findInventoryEquipment(instanceId) {
    const list=Array.isArray(window.player?.inventory)?window.player.inventory:[];
    const index=list.findIndex(row=>String(row?.instanceId||"")===String(instanceId||""));
    return index>=0?{index,row:list[index]}:null;
  }

  function removeInventoryStack(id,amount) {
    let remain=amount;
    const list=Array.isArray(window.player?.inventory)?window.player.inventory:[];
    for(let i=list.length-1;i>=0&&remain>0;i--){
      const row=list[i];
      if(row?.instanceId || String(itemIdOf(row))!==String(id)) continue;
      const take=Math.min(remain,Math.max(0,Math.floor(Number(row.count||0))));
      row.count-=take; remain-=take;
      if(row.count<=0) list.splice(i,1);
    }
    return amount-remain;
  }

  function addInventoryStack(item,amount) {
    window.player.inventory=Array.isArray(window.player.inventory)?window.player.inventory:[];
    const id=itemIdOf(item);
    const existing=window.player.inventory.find(row=>!row?.instanceId&&String(itemIdOf(row))===String(id));
    if(existing) existing.count=Math.max(0,Number(existing.count||0))+amount;
    else window.player.inventory.push({id,name:item.name||itemDataOf(item)?.name,count:amount,locked:false});
  }

  function depositStorageItem(key,amount=1) {
    if (!window.player) return false;
    const storage=loadAccountStorage();
    const equipmentKey=String(key).startsWith("instance:");
    if(equipmentKey){
      const instanceId=String(key).slice(9);
      const found=findInventoryEquipment(instanceId);
      if(!found){setStorageMessage("找不到這件背包裝備。",true);return false;}
      const foundData=itemDataOf(found.row);
      if(found.row.characterBound||found.row.noStorage||foundData?.characterBound||foundData?.noStorage){setStorageMessage("新人支援裝備不可存入帳號共用倉庫。",true);return false;}
      if(found.row.locked){setStorageMessage("鎖定中的裝備不能存入倉庫。",true);return false;}
      if(storage.items.length>=STORAGE_CAPACITY){setStorageMessage("帳號倉庫已滿。",true);return false;}
      const item=normalizeStorageItem(found.row);
      if(!item){setStorageMessage("這件裝備資料無效。",true);return false;}
      window.player.inventory.splice(found.index,1); storage.items.push(clone(item));
      setStorageMessage(`已存入 ${compactName(item,itemDataOf(item))}。`);
    }else{
      const id=String(key).replace(/^stack:/,"");
      const stackData=typeof getItemData==="function"?getItemData(id):null;
      if(stackData?.characterBound||stackData?.noStorage){setStorageMessage("新人支援道具不可存入帳號共用倉庫。",true);return false;}
      const total=getInventoryRows().find(x=>x.key===`stack:${id}`)?.count||0;
      const qty=Math.min(total,Math.max(1,Math.floor(Number(amount||1))));
      if(!qty){setStorageMessage("背包中沒有這項物品。",true);return false;}
      let target=storage.items.find(row=>!isEquipment(row)&&String(itemIdOf(row))===id);
      if(!target && storage.items.length>=STORAGE_CAPACITY){setStorageMessage("帳號倉庫已滿。",true);return false;}
      const moved=removeInventoryStack(id,qty);
      if(!moved){setStorageMessage("背包中沒有足夠數量。",true);return false;}
      if(target) target.count+=moved;
      else { const data=typeof getItemData==="function"?getItemData(id):null; storage.items.push({id:typeof normalizeItemId==="function"?normalizeItemId(id):id,name:data?.name,count:moved,locked:false}); }
      setStorageMessage(`已存入 ${itemDataOf(target||storage.items[storage.items.length-1])?.name||"物品"} × ${moved}。`);
    }
    saveAccountStorage();
    if(typeof updateInventoryUI==="function") updateInventoryUI();
    if(typeof saveGame==="function") saveGame();
    renderStorageWindow();
    return true;
  }

  function withdrawStorageItem(key,amount=1) {
    if (!window.player) return false;
    const storage=loadAccountStorage();
    const equipmentKey=String(key).startsWith("instance:");
    if(equipmentKey){
      const instanceId=String(key).slice(9);
      const index=storage.items.findIndex(row=>String(row?.instanceId||"")===instanceId);
      if(index<0){setStorageMessage("倉庫中找不到這件裝備。",true);return false;}
      const item=storage.items[index];
      window.player.inventory=Array.isArray(window.player.inventory)?window.player.inventory:[];
      window.player.inventory.push(clone(item)); storage.items.splice(index,1);
      setStorageMessage(`已取出 ${compactName(item,itemDataOf(item))}。`);
    }else{
      const id=String(key).replace(/^stack:/,"");
      const target=storage.items.find(row=>!isEquipment(row)&&String(itemIdOf(row))===id);
      if(!target){setStorageMessage("倉庫中沒有這項物品。",true);return false;}
      const qty=Math.min(Math.max(1,Math.floor(Number(amount||1))),Math.max(0,Math.floor(Number(target.count||0))));
      if(!qty){setStorageMessage("倉庫數量不足。",true);return false;}
      addInventoryStack(target,qty); target.count-=qty;
      if(target.count<=0) storage.items=storage.items.filter(row=>row!==target);
      setStorageMessage(`已取出 ${itemDataOf(target)?.name||target.name||"物品"} × ${qty}。`);
    }
    saveAccountStorage();
    if(typeof updateInventoryUI==="function") updateInventoryUI();
    if(typeof saveGame==="function") saveGame();
    renderStorageWindow();
    return true;
  }

  function openStorageWindow(npc=null) {
    activeNpc=npc||activeNpc;
    loadAccountStorage();
    const modal=document.getElementById("storageWindow");
    if(!modal) return false;
    const npcName=document.getElementById("storageNpcName");
    if(npcName) npcName.textContent=activeNpc?.name||"卡普拉倉庫管理員";
    setStorageMessage(""); setStorageCategory(activeCategory);
    modal.hidden=false; modal.removeAttribute("hidden"); modal.classList.remove("hidden-window"); modal.setAttribute("aria-hidden","false");
    document.body?.classList.add("storage-window-open");
    if(typeof bringWindowToFront==="function") bringWindowToFront(modal);
    return true;
  }

  function closeStorageWindow() {
    const modal=document.getElementById("storageWindow");
    if(modal){modal.hidden=true;modal.setAttribute("hidden","");modal.classList.add("hidden-window");modal.setAttribute("aria-hidden","true");}
    document.body?.classList.remove("storage-window-open");
    return true;
  }

  Object.assign(window,{
    RO_WEB_ACCOUNT_STORAGE_KEY:STORAGE_KEY,
    loadAccountStorage,saveAccountStorage,normalizeAccountStorage,storageSlotsUsed,
    openStorageWindow,closeStorageWindow,renderStorageWindow,depositStorageItem,withdrawStorageItem,
    setStorageCategory,getStorageCategory:()=>activeCategory,getAccountStorageSnapshot:()=>clone(loadAccountStorage())
  });
})();
