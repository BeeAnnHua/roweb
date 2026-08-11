//=======================================
// 帳號共用倉庫 Runtime v0.9.87C
// 獨立於角色 SAVE_KEY；只刪除角色時完整保留。
//=======================================
(function () {
  "use strict";

  const LEGACY_STORAGE_KEY = window.RO_WEB_ACCOUNT_STORAGE_KEY || "ro_web_account_storage_v1";
  const STORAGE_CAPACITY = 200;
  let accountStorage = null;
  let loadedStorageKey = "";

  function getStorageKey() {
    const account = window.CharacterSlotsRuntime?.getAccount?.();
    if (account?.cloud?.enabled && account?.accountId) {
      return `ro_web_account_storage_v2_${String(account.accountId)}`;
    }
    return LEGACY_STORAGE_KEY;
  }
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
    const normalized = {
      version:1,
      capacity:STORAGE_CAPACITY,
      items:[],
      updatedAt:Number(source.updatedAt || Date.now()),
      legacyRescueReceipts:Array.isArray(source.legacyRescueReceipts) ? source.legacyRescueReceipts.slice(-20) : []
    };
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
    const key = getStorageKey();
    if (accountStorage && loadedStorageKey === key) return accountStorage;
    let raw = null;
    try {
      const text = localStorage.getItem(key);
      raw = text ? JSON.parse(text) : null;
    } catch (error) {
      console.warn("讀取帳號倉庫失敗：", error);
    }
    loadedStorageKey = key;
    accountStorage = normalizeAccountStorage(raw);
    return accountStorage;
  }

  function replaceAccountStorage(raw, options = {}) {
    accountStorage = normalizeAccountStorage(raw);
    loadedStorageKey = getStorageKey();
    if (options.persist !== false) {
      try { localStorage.setItem(loadedStorageKey, JSON.stringify(accountStorage)); } catch (_) {}
    }
    return clone(accountStorage);
  }

  function saveAccountStorage() {
    const storage = loadAccountStorage();
    storage.updatedAt = Date.now();
    const key = getStorageKey();
    try {
      localStorage.setItem(key, JSON.stringify(storage));
      loadedStorageKey = key;
      window.ROWebCloudRuntime?.saveSharedStorage?.(clone(storage)).catch?.(error => {
        console.warn("雲端帳號倉庫同步失敗：", error);
      });
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


  //=======================================
  // V0.9.87C Legacy Warehouse Rescue
  // 掃描舊 localStorage / sessionStorage / IndexedDB 倉庫候選。
  // 僅在玩家主動開啟救援視窗時執行；不自動覆蓋、不刪除來源資料。
  //=======================================
  let legacyWarehouseCandidates = [];
  let selectedLegacyWarehouseCandidateId = "";

  function rescueHash(text) {
    let h = 2166136261;
    const input = String(text || "");
    for (let i = 0; i < input.length; i += 1) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  function isUuidText(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
  }

  function storageObjectHasContent(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value) && Array.isArray(value.items) && value.items.length);
  }

  function storageObjectLooksLegacy(value, path = "") {
    if (!storageObjectHasContent(value)) return false;
    const p = String(path || "").toLowerCase();
    const capacity = Number(value.capacity || 0);
    const storageHint = /storage|warehouse|倉庫|account_storage/.test(p);
    const shapeHint = capacity === 200 || Number(value.version || 0) === 1;
    const itemHint = value.items.slice(0, 8).some(row => row && typeof row === "object" && ("id" in row || "itemId" in row || "instanceId" in row || "count" in row));
    return itemHint && (storageHint || shapeHint);
  }

  function stableLegacyStorage(raw, sourceTag) {
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? clone(raw) : {};
    const rows = Array.isArray(source.items) ? source.items : [];
    source.items = rows.map((row, index) => {
      if (!row || typeof row !== "object") return row;
      if (!isEquipment(row) || row.instanceId || row.uid) return row;
      const signature = JSON.stringify({
        id:row.id ?? row.itemId ?? null,
        refine:row.refine ?? row.refineLevel ?? 0,
        grade:row.enchantGrade ?? row.grade ?? 0,
        cards:row.cards ?? row.cardIds ?? row.socketedCards ?? [],
        enchants:row.enchants ?? row.randomOptions ?? row.options ?? [],
        createdAt:row.createdAt ?? null,
        index
      });
      return { ...row, instanceId:`legacywh_${rescueHash(`${sourceTag}|${signature}`)}` };
    });
    return normalizeAccountStorage(source);
  }

  function rescueCandidateFingerprint(storage) {
    const rows = Array.isArray(storage?.items) ? storage.items : [];
    const compact = rows.map(row => {
      if (isEquipment(row)) return {
        kind:"e", id:itemIdOf(row), instanceId:/^legacywh_/.test(String(row.instanceId || "")) ? "" : String(row.instanceId || ""), refine:Number(row.refine || 0), grade:Number(row.enchantGrade || 0),
        cards:Array.isArray(row.cards) ? row.cards : [], enchants:Array.isArray(row.enchants) ? row.enchants : []
      };
      return { kind:"s", id:itemIdOf(row), count:Math.max(1, Math.floor(Number(row.count || 1))) };
    });
    return rescueHash(JSON.stringify(compact));
  }

  function candidateAccountIdFrom(sourceKey, value) {
    const key = String(sourceKey || "");
    const match = key.match(/ro_web_account_storage_v2_([0-9a-f-]{20,})/i);
    if (match) return match[1];
    const raw = value && typeof value === "object" ? (value.accountId ?? value.account_id ?? value.cloudAccountId ?? "") : "";
    return String(raw || "").trim();
  }

  function candidateAllowedForCurrentAccount(sourceKey, value) {
    const sourceAccountId = candidateAccountIdFrom(sourceKey, value);
    if (!sourceAccountId || !isUuidText(sourceAccountId)) return { allowed:true, sourceAccountId };
    const currentId = String(window.ROWebCloudRuntime?.getAccount?.()?.account_id || window.CharacterSlotsRuntime?.getAccount?.()?.accountId || "");
    return { allowed:sourceAccountId === currentId, sourceAccountId };
  }

  function collectWarehouseCandidate(output, raw, sourceLabel, sourceKey, path = "") {
    if (!storageObjectLooksLegacy(raw, `${sourceKey}:${path}`)) return;
    const accountRule = candidateAllowedForCurrentAccount(sourceKey, raw);
    const storage = stableLegacyStorage(raw, `${sourceKey}:${path}`);
    if (!storage.items.length) return;
    const fingerprint = rescueCandidateFingerprint(storage);
    const same = output.find(row => row.fingerprint === fingerprint);
    if (same) {
      if (!same.sources.includes(sourceLabel)) same.sources.push(sourceLabel);
      return;
    }
    const equipmentCount = storage.items.filter(row => isEquipment(row)).length;
    const stackRows = storage.items.filter(row => !isEquipment(row));
    const stackQuantity = stackRows.reduce((sum,row)=>sum + Math.max(1,Math.floor(Number(row.count || 1))),0);
    const preview = storage.items.slice(0, 12).map(row => {
      const data = itemDataOf(row);
      return isEquipment(row) ? compactName(row, data) : `${data?.name || row?.name || `Item ${itemIdOf(row)}`} × ${Math.max(1,Math.floor(Number(row.count || 1)))}`;
    });
    output.push({
      id:`wh_${fingerprint}_${output.length}`,
      fingerprint,
      storage,
      sources:[sourceLabel],
      sourceKey,
      sourceAccountId:accountRule.sourceAccountId,
      allowed:accountRule.allowed,
      updatedAt:Number(raw.updatedAt || storage.updatedAt || 0),
      equipmentCount,
      stackTypeCount:stackRows.length,
      stackQuantity,
      preview
    });
  }

  function walkWarehouseObjects(root, visitor, options = {}) {
    const maxDepth = Math.max(1, Number(options.maxDepth || 6));
    const maxNodes = Math.max(100, Number(options.maxNodes || 5000));
    const maxArray = Math.max(20, Number(options.maxArray || 300));
    const seen = new WeakSet();
    let nodes = 0;
    const walk = (value, path, depth) => {
      if (++nodes > maxNodes || depth > maxDepth || value == null) return;
      if (typeof value === "string") {
        const text = value.trim();
        if (text.length >= 2 && text.length <= 10_000_000 && (text[0] === "{" || text[0] === "[")) {
          try { walk(JSON.parse(text), `${path}:json`, depth + 1); } catch (_) {}
        }
        return;
      }
      if (typeof value !== "object") return;
      if (seen.has(value)) return;
      seen.add(value);
      try { visitor(value, path); } catch (_) {}
      if (Array.isArray(value)) {
        for (let i = 0; i < Math.min(value.length, maxArray); i += 1) walk(value[i], `${path}[${i}]`, depth + 1);
      } else {
        for (const [key, child] of Object.entries(value).slice(0, maxArray)) walk(child, `${path}.${key}`, depth + 1);
      }
    };
    walk(root, "$", 0);
  }

  function readWebStorageForWarehouseRescue(storageArea, areaName, output) {
    if (!storageArea) return;
    const activeKey = getStorageKey();
    for (let i = 0; i < storageArea.length; i += 1) {
      const key = storageArea.key(i);
      if (!key || key === activeKey) continue;
      let parsed = null;
      try {
        const text = storageArea.getItem(key);
        if (!text || text.length > 20_000_000) continue;
        parsed = JSON.parse(text);
      } catch (_) { continue; }
      const directHint = /ro_web_account_storage_v1|ro_web_account_storage_v2_|warehouse|account_storage|migration|backup/i.test(key);
      if (directHint) collectWarehouseCandidate(output, parsed, `${areaName}｜${key}`, key, "$direct");
      if (/storage|warehouse|migration|backup|account|save/i.test(key)) {
        walkWarehouseObjects(parsed, (value,path) => {
          if (value?.account_storage && typeof value.account_storage === "object") {
            collectWarehouseCandidate(output, value.account_storage, `${areaName}｜${key}`, key, `${path}.account_storage`);
          } else if (storageObjectLooksLegacy(value, `${key}:${path}`)) {
            collectWarehouseCandidate(output, value, `${areaName}｜${key}`, key, path);
          }
        }, { maxDepth:6, maxNodes:5000, maxArray:250 });
      }
    }
  }

  async function readIndexedDbWarehouseCandidates(output) {
    if (!window.indexedDB?.open) return;
    const names = new Set(["ro_web_offline_save_v1"]);
    if (typeof indexedDB.databases === "function") {
      try {
        const dbs = await indexedDB.databases();
        for (const info of Array.isArray(dbs) ? dbs : []) {
          const name = String(info?.name || "");
          if (name && /(ro[_-]?web|roweb|save|offline|storage|warehouse)/i.test(name)) names.add(name);
        }
      } catch (_) {}
    }
    for (const dbName of names) {
      await new Promise(resolve => {
        let request;
        try { request = indexedDB.open(dbName); } catch (_) { resolve(); return; }
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
        request.onsuccess = () => {
          const db = request.result;
          const stores = Array.from(db.objectStoreNames || []);
          if (!stores.length) { try { db.close(); } catch (_) {} resolve(); return; }
          let pending = stores.length;
          const done = () => { pending -= 1; if (pending <= 0) { try { db.close(); } catch (_) {} resolve(); } };
          for (const storeName of stores) {
            let tx, req;
            try { tx = db.transaction(storeName, "readonly"); req = tx.objectStore(storeName).getAll(); }
            catch (_) { done(); continue; }
            req.onsuccess = () => {
              const rows = Array.isArray(req.result) ? req.result.slice(0, 500) : [];
              rows.forEach((row, index) => {
                walkWarehouseObjects(row, (value,path) => {
                  if (value?.account_storage && typeof value.account_storage === "object") {
                    collectWarehouseCandidate(output, value.account_storage, `IndexedDB｜${dbName}/${storeName} #${index + 1}`, `${dbName}/${storeName}`, `${path}.account_storage`);
                  } else if (/storage|warehouse|account_storage/i.test(path) && storageObjectLooksLegacy(value, path)) {
                    collectWarehouseCandidate(output, value, `IndexedDB｜${dbName}/${storeName} #${index + 1}`, `${dbName}/${storeName}`, path);
                  }
                }, { maxDepth:7, maxNodes:6000, maxArray:300 });
              });
              done();
            };
            req.onerror = done;
            tx.onabort = done;
          }
        };
      });
    }
  }

  function formatRescueTime(ms) {
    if (!Number.isFinite(Number(ms)) || Number(ms) <= 0) return "時間未知";
    try { return new Date(Number(ms)).toLocaleString("zh-TW", { hour12:false }); } catch (_) { return "時間未知"; }
  }

  function updateLegacyWarehouseRestoreButton() {
    const checkbox = document.getElementById("legacyWarehouseOwnershipConfirm");
    const button = document.getElementById("legacyWarehouseRestoreButton");
    const candidate = legacyWarehouseCandidates.find(row => row.id === selectedLegacyWarehouseCandidateId);
    if (button) button.disabled = !(checkbox?.checked && candidate?.allowed);
  }

  function selectLegacyWarehouseCandidate(id) {
    selectedLegacyWarehouseCandidateId = String(id || "");
    document.querySelectorAll("[data-legacy-warehouse-candidate]").forEach(card => card.classList.toggle("is-selected", card.dataset.legacyWarehouseCandidate === selectedLegacyWarehouseCandidateId));
    document.querySelectorAll("input[name='legacyWarehouseCandidate']").forEach(input => { input.checked = input.value === selectedLegacyWarehouseCandidateId; });
    updateLegacyWarehouseRestoreButton();
    return true;
  }

  function renderLegacyWarehouseCandidates() {
    const list = document.getElementById("legacyWarehouseCandidateList");
    const status = document.getElementById("legacyWarehouseRescueStatus");
    if (!list) return false;
    list.innerHTML = "";
    if (!legacyWarehouseCandidates.length) {
      list.innerHTML = '<div class="legacy-warehouse-empty">沒有找到有物品的舊倉庫。<br><small>請確認使用的是改雲端前同一台電腦、同一個瀏覽器，且尚未清除網站資料。</small></div>';
      if (status) status.textContent = "掃描完成：0 個候選。舊資料沒有被修改。";
      return true;
    }
    const current = loadAccountStorage();
    if (status) status.textContent = `找到 ${legacyWarehouseCandidates.length} 個不同的舊倉庫候選；目前雲端倉庫 ${current.items.length} / ${STORAGE_CAPACITY} 格。請確認內容後再復原。`;
    legacyWarehouseCandidates.forEach(candidate => {
      const card = document.createElement("label");
      card.className = `legacy-warehouse-candidate${candidate.allowed ? "" : " is-blocked"}`;
      card.dataset.legacyWarehouseCandidate = candidate.id;
      const radio = document.createElement("input"); radio.type="radio"; radio.name="legacyWarehouseCandidate"; radio.value=candidate.id; radio.disabled=!candidate.allowed;
      radio.onchange=()=>selectLegacyWarehouseCandidate(candidate.id);
      const body=document.createElement("div"); body.className="legacy-warehouse-candidate-body";
      const title=document.createElement("b"); title.textContent=`舊倉庫｜${candidate.equipmentCount} 件裝備＋${candidate.stackTypeCount} 種堆疊道具`;
      const meta=document.createElement("small");
      meta.textContent=`${formatRescueTime(candidate.updatedAt)}｜來源 ${candidate.sources.length} 處${candidate.allowed ? "" : "｜其他 Cloud Account，已阻擋"}`;
      const preview=document.createElement("p"); preview.textContent=candidate.preview.join("、") + (candidate.storage.items.length > candidate.preview.length ? "……" : "");
      body.append(title,meta,preview);
      card.append(radio,body);
      if (candidate.allowed) card.onclick=()=>selectLegacyWarehouseCandidate(candidate.id);
      list.appendChild(card);
    });
    return true;
  }

  async function scanLegacyWarehouseRescue() {
    const status = document.getElementById("legacyWarehouseRescueStatus");
    const scanButton = document.getElementById("legacyWarehouseScanButton");
    if (scanButton) scanButton.disabled = true;
    if (status) status.textContent = "正在掃描舊 localStorage / sessionStorage / IndexedDB，請稍候……";
    selectedLegacyWarehouseCandidateId = "";
    const output = [];
    try { readWebStorageForWarehouseRescue(window.localStorage, "localStorage", output); } catch (_) {}
    try { readWebStorageForWarehouseRescue(window.sessionStorage, "sessionStorage", output); } catch (_) {}
    try { await readIndexedDbWarehouseCandidates(output); } catch (error) { console.warn("Legacy Warehouse IndexedDB scan failed:", error); }
    legacyWarehouseCandidates = output.sort((a,b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
    renderLegacyWarehouseCandidates();
    const checkbox=document.getElementById("legacyWarehouseOwnershipConfirm"); if (checkbox) checkbox.checked=false;
    updateLegacyWarehouseRestoreButton();
    if (scanButton) scanButton.disabled = false;
    return clone(legacyWarehouseCandidates.map(row => ({ id:row.id, fingerprint:row.fingerprint, equipmentCount:row.equipmentCount, stackTypeCount:row.stackTypeCount, updatedAt:row.updatedAt, sources:row.sources, allowed:row.allowed })));
  }

  function buildMergedWarehouse(currentRaw, candidate) {
    const current = normalizeAccountStorage(currentRaw);
    const incoming = stableLegacyStorage(candidate.storage, `restore:${candidate.fingerprint}`);
    const receipts = Array.isArray(current.legacyRescueReceipts) ? current.legacyRescueReceipts : [];
    if (receipts.some(row => String(row?.fingerprint || row) === String(candidate.fingerprint))) {
      throw new Error("RO_WAREHOUSE_RESCUE_ALREADY_APPLIED");
    }
    const merged = clone(current);
    const equipmentIds = new Set(merged.items.filter(row=>isEquipment(row)).map(row=>String(row.instanceId || "")).filter(Boolean));
    const stacks = new Map(merged.items.filter(row=>!isEquipment(row)).map(row=>[String(itemIdOf(row)),row]));
    let addedEquipment = 0;
    let addedStackTypes = 0;
    let addedStackQuantity = 0;
    let skippedEquipment = 0;
    for (const row of incoming.items) {
      if (isEquipment(row)) {
        const instanceId=String(row.instanceId || "");
        if (instanceId && equipmentIds.has(instanceId)) { skippedEquipment += 1; continue; }
        merged.items.push(clone(row)); if (instanceId) equipmentIds.add(instanceId); addedEquipment += 1;
      } else {
        const id=String(itemIdOf(row));
        const qty=Math.max(1,Math.floor(Number(row.count || 1)));
        const target=stacks.get(id);
        if (target) target.count=Math.max(0,Number(target.count || 0))+qty;
        else { const copy=clone(row); copy.count=qty; merged.items.push(copy); stacks.set(id,copy); addedStackTypes += 1; }
        addedStackQuantity += qty;
      }
    }
    if (merged.items.length > STORAGE_CAPACITY) {
      const error = new Error("RO_WAREHOUSE_RESCUE_CAPACITY");
      error.requiredSlots = merged.items.length;
      throw error;
    }
    merged.updatedAt = Date.now();
    merged.legacyRescueReceipts = [...receipts, {
      fingerprint:candidate.fingerprint,
      restoredAt:Date.now(),
      source:candidate.sources[0] || candidate.sourceKey || "legacy",
      equipment:addedEquipment,
      stackTypes:addedStackTypes,
      stackQuantity:addedStackQuantity
    }].slice(-20);
    return { merged, addedEquipment, addedStackTypes, addedStackQuantity, skippedEquipment };
  }

  async function restoreSelectedLegacyWarehouse() {
    const candidate = legacyWarehouseCandidates.find(row => row.id === selectedLegacyWarehouseCandidateId);
    const checkbox=document.getElementById("legacyWarehouseOwnershipConfirm");
    const status=document.getElementById("legacyWarehouseRescueStatus");
    const button=document.getElementById("legacyWarehouseRestoreButton");
    if (!candidate || !candidate.allowed || !checkbox?.checked) return false;
    const cloudAccount = window.ROWebCloudRuntime?.getAccount?.();
    const playerId = cloudAccount?.player_id || window.CharacterSlotsRuntime?.getAccount?.()?.playerId || "目前帳號";
    if (!window.confirm(`確認把這份舊倉庫合併到 Player ID ${playerId}？\n\n不會刪除舊瀏覽器資料；如果目前倉庫已有物品會合併，不會整包覆蓋。`)) return false;
    if (button) button.disabled=true;
    try {
      const current=clone(loadAccountStorage());
      const result=buildMergedWarehouse(current,candidate);
      if (status) status.textContent="正在寫入目前雲端倉庫並等待 Supabase 確認……";
      if (cloudAccount?.account_id && window.ROWebCloudRuntime?.saveSharedStorage) {
        await window.ROWebCloudRuntime.saveSharedStorage(clone(result.merged));
      }
      replaceAccountStorage(result.merged,{persist:true});
      renderStorageWindow();
      const message=`救援完成：加入 ${result.addedEquipment} 件裝備、${result.addedStackTypes} 種道具（共 ${result.addedStackQuantity} 個）${result.skippedEquipment ? `；略過 ${result.skippedEquipment} 件已存在裝備` : ""}。舊資料仍保留。`;
      if (status) status.textContent=message;
      setStorageMessage(message,false);
      renderLegacyWarehouseCandidates();
      return true;
    } catch (error) {
      console.error("Legacy Warehouse restore failed:", error);
      let message="舊倉庫復原失敗，原始資料與目前倉庫都沒有被刪除。";
      if (String(error?.message || error).includes("ALREADY_APPLIED")) message="這份舊倉庫已經成功救援過，系統已阻止再次重複匯入。";
      else if (String(error?.message || error).includes("CAPACITY")) message=`合併後需要 ${Number(error?.requiredSlots || 0)} 格，但倉庫上限是 ${STORAGE_CAPACITY} 格。請先取出一些物品後再重試。`;
      else if (error?.message) message += `\n${String(error.message).slice(0,180)}`;
      if (status) status.textContent=message;
      if (button) button.disabled=false;
      return false;
    } finally {
      updateLegacyWarehouseRestoreButton();
    }
  }

  function openLegacyWarehouseRescue() {
    const modal=document.getElementById("legacyWarehouseRescueModal");
    if (!modal) return false;
    modal.hidden=false; modal.removeAttribute("hidden");
    document.body?.classList.add("legacy-warehouse-rescue-open");
    const current=window.ROWebCloudRuntime?.getAccount?.();
    const accountText=document.getElementById("legacyWarehouseTargetAccount");
    if (accountText) accountText.textContent=`目標：${current?.account_name || "目前遊戲帳號"}｜Player ID ${current?.player_id || "-"}`;
    scanLegacyWarehouseRescue();
    return true;
  }

  function closeLegacyWarehouseRescue() {
    const modal=document.getElementById("legacyWarehouseRescueModal");
    if (modal) { modal.hidden=true; modal.setAttribute("hidden",""); }
    document.body?.classList.remove("legacy-warehouse-rescue-open");
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
    RO_WEB_ACCOUNT_STORAGE_KEY:LEGACY_STORAGE_KEY,
    getAccountStorageKey:getStorageKey,
    loadAccountStorage,saveAccountStorage,replaceAccountStorage,normalizeAccountStorage,storageSlotsUsed,
    openStorageWindow,closeStorageWindow,renderStorageWindow,depositStorageItem,withdrawStorageItem,
    setStorageCategory,getStorageCategory:()=>activeCategory,getAccountStorageSnapshot:()=>clone(loadAccountStorage()),
    openLegacyWarehouseRescue,closeLegacyWarehouseRescue,scanLegacyWarehouseRescue,
    selectLegacyWarehouseCandidate,restoreSelectedLegacyWarehouse,updateLegacyWarehouseRestoreButton
  });
})();
