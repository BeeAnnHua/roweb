//=======================================
// TownManager v0.9.82GN
// 城鎮 / NPC / 商店 / 轉職 NPC 架構
//=======================================

let currentCity = null;
let currentShopId = null;
let currentShopSelectedItem = null;
let currentShopBuyQty = 1;
let currentPurchaseItem = null;

function normalizeTownData() {
  if (!player) return;
  player.currentCity = player.currentCity || null;
  player.lastFieldMap = player.lastFieldMap || player.map || window.RO_WEB_DEFAULT_FIELD_MAP_ID || "prontera_3x3_region_camera";
  if (typeof migrateRemovedFieldMapReferences === "function") migrateRemovedFieldMapReferences();
}

function getCityData(cityId) {
  return (cities || []).find(city => city.id === cityId) || null;
}

function getNpcData(npcId) {
  return (npcs || []).find(npc => npc.id === npcId) || null;
}

function getCityNpcs(cityId) {
  return (npcs || []).filter(npc => npc.cityId === cityId);
}

function updateTownUI() {
  if (!player) return;
  normalizeTownData();

  currentCity = player.currentCity ? getCityData(player.currentCity) : null;

  const currentCityNameEl = document.getElementById("current-city-name");
  const cityListEl = document.getElementById("city-list");
  const npcPanelEl = document.getElementById("npc-panel");

  if (currentCityNameEl) {
    currentCityNameEl.textContent = currentCity
      ? `目前城鎮：${currentCity.name}｜${currentCity.role || "城鎮"}`
      : "目前城鎮：野外";
  }

  if (cityListEl) {
    cityListEl.innerHTML = "";
    (cities || []).forEach(city => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "city-card" + (currentCity?.id === city.id ? " is-current" : "");
      card.onclick = function () { enterCity(city.id); };

      const title = document.createElement("div");
      title.className = "city-card-name";
      title.textContent = city.displayName || city.name;

      const role = document.createElement("div");
      role.className = "city-card-role";
      role.textContent = city.role || "城鎮";

      card.appendChild(title);
      card.appendChild(role);
      cityListEl.appendChild(card);
    });
  }

  if (npcPanelEl) {
    renderNpcPanel(npcPanelEl);
  }

  renderShopPanel(null);
}

function enterCity(cityId) {
  const city = getCityData(cityId);
  if (!city) {
    addBattleLog("找不到城鎮資料：" + cityId);
    return;
  }

  if (typeof clearFieldCombatRuntimeForTravel === "function") clearFieldCombatRuntimeForTravel();
  else {
    stopAutoBattle({ silent: true });
    if (typeof clearBattleTimersAndMonster === "function") clearBattleTimersAndMonster({ clearMonster: true });
    if (typeof clearWorldMonsterFieldTest === "function") clearWorldMonsterFieldTest();
    currentMonster = null;
  }
  currentMap = null;
  currentShopId = null;

  player.currentCity = city.id;
  player.state = "Town";
  if (player.map) player.lastFieldMap = player.map;
  player.map = null;
  if (typeof applyTownFixedPlayerPosition === "function") applyTownFixedPlayerPosition();

  updateTownUI();
  updateMapUI();
  updateMonsterUI();
  updateTownBackground(city);
  saveGame();

  addBattleLog("進入城鎮：「" + city.name + "」。");
}

function leaveTownToLastField() {
  const targetMapId = player?.lastFieldMap || window.RO_WEB_DEFAULT_FIELD_MAP_ID || "prontera_3x3_region_camera";
  changeMap(targetMapId);
}

function renderNpcPanel(panel) {
  panel.innerHTML = "";

  if (!currentCity) {
    panel.innerHTML = '<div class="town-empty">目前在野外。請選擇城鎮進入。</div>';
    return;
  }

  const title = document.createElement("div");
  title.className = "npc-title";
  title.textContent = "NPC";
  panel.appendChild(title);

  const cityNpcList = getCityNpcs(currentCity.id);
  if (!cityNpcList.length) {
    panel.innerHTML += '<div class="town-empty">這座城鎮暫無 NPC。</div>';
    return;
  }

  cityNpcList.forEach(npc => {
    const row = document.createElement("div");
    row.className = "npc-row";

    const info = document.createElement("div");
    info.className = "npc-info";
    info.innerHTML = `<b>${npc.name}</b><small>${npc.description || getNpcTypeText(npc.type)}</small>`;

    const actions = document.createElement("div");
    actions.className = "npc-actions";
    const action = document.createElement("button");
    action.type = "button";
    action.textContent = getNpcActionText(npc);
    action.onclick = function (event) { event?.preventDefault?.(); event?.stopPropagation?.(); interactNpc(npc.id); };
    actions.appendChild(action);
    if(npc.type === "enchant_grade"){
      const exchangeAction=document.createElement("button");
      exchangeAction.type="button";exchangeAction.className="npc-secondary-action";exchangeAction.textContent="材料合成";
      exchangeAction.onclick=function(event){event?.preventDefault?.();event?.stopPropagation?.();openEnchantGradeNpcWindow(npc,"exchange");};
      actions.appendChild(exchangeAction);
    }

    row.appendChild(info);
    row.appendChild(actions);
    panel.appendChild(row);
  });

  const leaveButton = document.createElement("button");
  leaveButton.className = "town-leave-button";
  leaveButton.textContent = "返回上一張練功地圖";
  leaveButton.onclick = leaveTownToLastField;
  panel.appendChild(leaveButton);
}

function getNpcTypeText(type) {
  const map = {
    shop: "商店",
    job_change: "轉職 NPC",
    card_removal: "卡片拆卸",
    gender_change: "角色性別切換",
    refine: "裝備精煉",
    storage: "倉庫",
    enchant_grade: "裝備升階"
  };
  return map[type] || type || "NPC";
}

function getNpcActionText(npc) {
  if (npc.type === "shop") return "開啟商店";
  if (npc.type === "job_change") return "轉職相談";
  if (npc.type === "card_removal") return "拆卸卡片";
  if (npc.type === "gender_change") return "切換角色性別";
  if (npc.type === "refine") return "開始精煉";
  if (npc.type === "storage") return "開啟倉庫";
  if (npc.type === "enchant_grade") return "裝備升階";
  return "交談";
}

function openEnchantGradeNpcWindow(npc, tab="grade") {
  const opener = tab === "exchange"
    ? (window.EnchantGradeRuntime?.openExchange || window.openEnchantGradeExchangeWindow)
    : (window.EnchantGradeRuntime?.open || window.openEnchantGradeWindow);
  if (typeof opener !== "function") {
    addBattleLog((npc?.name || "裝備升階匠人") + "：裝備升階系統尚未載入。");
    return false;
  }
  Promise.resolve(opener(npc, tab === "exchange" ? { tab: "exchange" } : {})).catch(error => {
    console.error("裝備升階 NPC 開窗失敗", error);
    addBattleLog((npc?.name || "裝備升階匠人") + "：視窗開啟失敗，請查看主控台。");
  });
  return true;
}
window.openEnchantGradeNpcWindow = openEnchantGradeNpcWindow;

function interactNpc(npcId) {
  const npc = getNpcData(npcId);
  if (!npc) return;

  if (npc.type === "shop") {
    openShop(npc.shopId);
    return;
  }

  if (npc.type === "job_change") {
    openJobChangeNpc(npc);
    return;
  }
  if (npc.type === "card_removal") {
    openCardRemovalNpc(npc);
    return;
  }
  if (npc.type === "refine") {
    if (typeof openRefineWindow === "function") {
      openRefineWindow(npc);
    } else {
      addBattleLog(npc.name + "：精煉系統尚未載入。");
    }
    return;
  }
  if (npc.type === "storage") {
    if (typeof openStorageWindow === "function") {
      openStorageWindow(npc);
    } else {
      addBattleLog(npc.name + "：帳號倉庫尚未載入。");
    }
    return;
  }
  if (npc.type === "enchant_grade") {
    openEnchantGradeNpcWindow(npc, "grade");
    return;
  }
  if (npc.type === "gender_change") {
    if (typeof openCharacterGenderSelection === "function") {
      openCharacterGenderSelection({ required: false, source: npc.name });
    } else {
      addBattleLog(npc.name + "：角色性別切換功能尚未載入。");
    }
    return;
  }

  addBattleLog(npc.name + "：目前功能尚未開放。");
}

function openShop(shopId) {
  currentShopId = shopId;
  currentShopSelectedItem = null;
  currentShopBuyQty = 1;
  closePurchaseDialog();
  const shopWindow = document.getElementById("shop-window");
  if (shopWindow) {
    shopWindow.classList.remove("hidden-window");
    if (typeof bringWindowToFront === "function") bringWindowToFront(shopWindow);
  }
  renderShopPanel(shopId);
}

function renderShopPanel(shopId) {
  const shopPanel = document.getElementById("shop-panel");
  const list = document.getElementById("shop-item-list");
  const detail = document.getElementById("shop-detail-panel");
  const shopWindow = document.getElementById("shop-window");
  if (!shopPanel || !list) return;

  if (!shopId) {
    if (shopWindow) shopWindow.classList.remove("is-shop-list-only");
    shopPanel.classList.add("hidden-town-section");
    list.innerHTML = "";
    if (detail) detail.innerHTML = '<div class="town-empty">左鍵點選商品可查看介紹與購買數量。</div>';
    if (shopWindow) shopWindow.classList.add("hidden-window");
    return;
  }

  const shop = shops?.[shopId];
  if (!shop) {
    shopPanel.classList.remove("hidden-town-section");
    list.innerHTML = '<div class="town-empty">找不到商店資料。</div>';
    if (detail) detail.innerHTML = "";
    return;
  }

  shopPanel.classList.remove("hidden-town-section");
  if (shopWindow) shopWindow.classList.add("is-shop-list-only");
  const title = shopPanel.querySelector(".shop-title");
  if (title) title.textContent = shop.name || "商店";
  const windowTitle = document.getElementById("shop-window-title");
  if (windowTitle) windowTitle.textContent = shop.name || "商店";

  list.innerHTML = "";
  (shop.items || []).forEach(entry => {
    const itemId = normalizeItemId(entry.itemId);
    const item = getItemData(itemId);
    const price = getShopItemPrice(entry, item);

    const row = document.createElement("button");
    row.type = "button";
    row.className = "shop-item-row shop-item-button" + (String(currentShopSelectedItem?.itemId) === String(itemId) ? " is-selected" : "");
    row.onclick = function () { selectShopItem(itemId, price); };

    const iconBox = document.createElement("span");
    iconBox.className = "shop-item-icon";
    const icon = document.createElement("img");
    icon.src = item?.icon || `images/items/${item?.officialId || itemId}.webp`;
    icon.alt = item?.name || ("Item " + itemId);
    icon.onerror = function () { icon.style.display = "none"; };
    iconBox.appendChild(icon);

    const name = document.createElement("span");
    name.className = "shop-item-name";
    name.innerHTML = `<b>${item?.name || ("Item " + itemId)}</b><small>${getItemTypeText(item)}｜${price} Zeny</small>`;

    row.appendChild(iconBox);
    row.appendChild(name);
    list.appendChild(row);
  });

  if (detail) {
    detail.innerHTML = '<div class="town-empty">點選商品後會開啟獨立購買視窗。</div>';
  }
}

function getShopItemPrice(entry, item) {
  const basePrice = Number(entry?.price || item?.buyPrice || Math.max(1, (item?.sellPrice || 1) * 10));
  const passiveTotals = typeof getPassiveSkillBonusTotals === "function" ? getPassiveSkillBonusTotals() : {};
  const discountRate = Math.max(0, Math.min(100, Number(passiveTotals.shopBuyDiscountRate || 0)));
  return Math.max(1, Math.floor(basePrice * (100 - discountRate) / 100));
}

function selectShopItem(itemId, price) {
  currentShopSelectedItem = { itemId, price };
  currentShopBuyQty = 1;
  renderShopPanel(currentShopId);
  openPurchaseDialog(itemId, price);
}

function openPurchaseDialog(itemId, price) {
  currentPurchaseItem = { itemId, price };
  renderPurchaseDialog(itemId, price);
  const win = document.getElementById("purchase-window");
  if (win) {
    win.classList.remove("hidden-window");
    if (typeof centerWindowForMobile === "function") centerWindowForMobile(win);
    if (typeof bringWindowToFront === "function") bringWindowToFront(win);
  }
}

function closePurchaseDialog() {
  const win = document.getElementById("purchase-window");
  if (win) win.classList.add("hidden-window");
  currentPurchaseItem = null;
}

function renderPurchaseDialog(itemId, price) {
  const content = document.getElementById("purchase-content");
  const title = document.getElementById("purchase-window-title");
  if (!content) return;

  const item = getItemData(itemId);
  if (!item) {
    content.innerHTML = '<div class="town-empty">找不到物品資料。</div>';
    return;
  }

  const qty = Math.max(1, Number(currentShopBuyQty || 1));
  const total = Number(price || 0) * qty;
  const descriptionLines = typeof cleanItemDescriptionLines === "function" ? cleanItemDescriptionLines(item) : (Array.isArray(item.description) ? item.description : []);
  const description = descriptionLines.length ? descriptionLines.join("\n") : "沒有更多說明。";
  const renderedDescription = typeof renderROColoredTooltipText === "function"
    ? renderROColoredTooltipText(description)
    : escapeShopHtml(description).replace(/\n/g, "<br>");
  if (title) title.textContent = item.name || "確認購買";

  content.innerHTML = `
    <div class="purchase-card">
      <div class="purchase-head">
        <div class="purchase-icon"><img src="${escapeShopAttr(item.icon || `images/items/${item.officialId || item.id}.webp`)}" alt=""></div>
        <div>
          <div class="purchase-name">${escapeShopHtml(item.name || getItemName(itemId))}</div>
          <div class="purchase-meta">${escapeShopHtml(getItemTypeText(item))}｜單價 ${price} Zeny</div>
        </div>
      </div>
      <div class="purchase-desc">${renderedDescription}</div>
      <div class="purchase-controls">
        <div class="shop-qty-row purchase-qty-row">
          <button type="button" data-purchase-qty="-10">-10</button>
          <button type="button" data-purchase-qty="-1">-</button>
          <input id="purchase-buy-qty" type="number" min="1" max="999" value="${qty}" data-no-drag>
          <button type="button" data-purchase-qty="1">+</button>
          <button type="button" data-purchase-qty="10">+10</button>
        </div>
        <div class="shop-total-row purchase-total-row">總價：<b>${total}</b> Zeny</div>
        <div class="shop-action-row purchase-action-row">
          <button type="button" id="purchase-buy-confirm">確認購買</button>
          <button type="button" id="purchase-buy-cancel">取消</button>
        </div>
      </div>
    </div>
  `;

  content.querySelectorAll("[data-purchase-qty]").forEach(button => {
    button.onclick = function () { changePurchaseBuyQty(Number(button.dataset.purchaseQty || 0)); };
  });
  const qtyInput = content.querySelector("#purchase-buy-qty");
  if (qtyInput) qtyInput.onchange = function () { setPurchaseBuyQty(qtyInput.value); };
  const confirm = content.querySelector("#purchase-buy-confirm");
  if (confirm) confirm.onclick = function () { buyShopItem(itemId, price, currentShopBuyQty); };
  const cancel = content.querySelector("#purchase-buy-cancel");
  if (cancel) cancel.onclick = function () { closePurchaseDialog(); };
}

function changePurchaseBuyQty(delta) {
  setPurchaseBuyQty(Number(currentShopBuyQty || 1) + Number(delta || 0));
}

function setPurchaseBuyQty(value) {
  currentShopBuyQty = Math.max(1, Math.min(999, Math.floor(Number(value || 1))));
  if (currentPurchaseItem) {
    renderPurchaseDialog(currentPurchaseItem.itemId, currentPurchaseItem.price);
  } else if (currentShopSelectedItem) {
    renderPurchaseDialog(currentShopSelectedItem.itemId, currentShopSelectedItem.price);
  }
}

function renderShopItemDetail(itemId, price) {
  const detail = document.getElementById("shop-detail-panel");
  if (!detail) return;

  const item = getItemData(itemId);
  if (!item) {
    detail.innerHTML = '<div class="town-empty">找不到物品資料。</div>';
    return;
  }

  const qty = Math.max(1, Number(currentShopBuyQty || 1));
  const total = price * qty;
  const descriptionLines = typeof cleanItemDescriptionLines === "function" ? cleanItemDescriptionLines(item) : (Array.isArray(item.description) ? item.description : []);
  const description = descriptionLines.length ? descriptionLines.join("\n") : "沒有更多說明。";
  const renderedDescription = typeof renderROColoredTooltipText === "function"
    ? renderROColoredTooltipText(description)
    : escapeShopHtml(description).replace(/\n/g, "<br>");

  detail.innerHTML = `
    <div class="shop-detail-card">
      <div class="shop-detail-head">
        <div class="shop-detail-icon"><img src="${escapeShopAttr(item.icon || `images/items/${item.officialId || item.id}.webp`)}" alt=""></div>
        <div>
          <div class="shop-detail-name">${escapeShopHtml(item.name || getItemName(itemId))}</div>
          <div class="shop-detail-meta">${escapeShopHtml(getItemTypeText(item))}｜單價 ${price} Zeny</div>
        </div>
      </div>
      <div class="shop-detail-desc">${renderedDescription}</div>
      <div class="shop-qty-row">
        <button type="button" data-shop-qty="-10">-10</button>
        <button type="button" data-shop-qty="-1">-</button>
        <input id="shop-buy-qty" type="number" min="1" max="999" value="${qty}" data-no-drag>
        <button type="button" data-shop-qty="1">+</button>
        <button type="button" data-shop-qty="10">+10</button>
      </div>
      <div class="shop-total-row">總價：<b>${total}</b> Zeny</div>
      <div class="shop-action-row">
        <button type="button" id="shop-buy-confirm">確認購買</button>
        <button type="button" id="shop-buy-cancel">取消</button>
      </div>
    </div>
  `;

  detail.querySelectorAll("[data-shop-qty]").forEach(button => {
    button.onclick = function () {
      changeShopBuyQty(Number(button.dataset.shopQty || 0));
    };
  });

  const qtyInput = detail.querySelector("#shop-buy-qty");
  if (qtyInput) {
    qtyInput.onchange = function () {
      setShopBuyQty(qtyInput.value);
    };
  }

  const confirm = detail.querySelector("#shop-buy-confirm");
  if (confirm) confirm.onclick = function () { buyShopItem(itemId, price, currentShopBuyQty); };

  const cancel = detail.querySelector("#shop-buy-cancel");
  if (cancel) cancel.onclick = function () {
    currentShopSelectedItem = null;
    currentShopBuyQty = 1;
    renderShopPanel(currentShopId);
  };
}

function changeShopBuyQty(delta) {
  setShopBuyQty(Number(currentShopBuyQty || 1) + Number(delta || 0));
}

function setShopBuyQty(value) {
  currentShopBuyQty = Math.max(1, Math.min(999, Math.floor(Number(value || 1))));
  if (currentShopSelectedItem) {
    renderShopItemDetail(currentShopSelectedItem.itemId, currentShopSelectedItem.price);
  }
}

function escapeShopHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeShopAttr(text) {
  return escapeShopHtml(text).replace(/`/g, "&#096;");
}

function buyShopItem(itemId, price, qty = 1) {
  const item = getItemData(itemId);
  if (!item) {
    addBattleLog("找不到物品資料：" + itemId);
    return;
  }

  const amount = Math.max(1, Math.floor(Number(qty || 1)));
  const total = Number(price || 0) * amount;
  if (!spendZeny(total)) return;

  addItem({ id: item.id, name: item.name }, amount);
  addBattleLog("購買：「" + item.name + "」x" + amount + "。");

  updatePlayerUI();
  updateInventoryUI();
  renderShopPanel(currentShopId);
  closePurchaseDialog();
  saveGame();
}

function getEquippedCardRemovalRows(){
  const rows=[];
  for(const [slot,itemId] of Object.entries(player?.equipment||{})){
    if(!itemId)continue;
    const instance=typeof getEquipmentInstance==="function"?getEquipmentInstance(slot):player?.equipmentInstances?.[slot];
    const cards=(instance?.cards||[]).filter(Boolean);
    if(!instance||!cards.length)continue;
    if(rows.some(row=>row.instance===instance || (instance.instanceId&&String(row.instance?.instanceId||"")===String(instance.instanceId))))continue;
    rows.push({slot,itemId:Number(itemId),item:getItemData(itemId),instance,cards});
  }
  return rows;
}
function openCardRemovalNpc(npc){
  currentShopId=null;currentShopSelectedItem=null;closePurchaseDialog();
  const panel=document.getElementById("shop-panel"),list=document.getElementById("shop-item-list"),detail=document.getElementById("shop-detail-panel"),win=document.getElementById("shop-window");
  if(!panel||!list)return false;
  panel.classList.remove("hidden-town-section");win?.classList.remove("hidden-window");win?.classList.remove("is-shop-list-only");
  if(typeof bringWindowToFront==="function"&&win)bringWindowToFront(win);
  const title=panel.querySelector(".shop-title"),windowTitle=document.getElementById("shop-window-title");
  if(title)title.textContent=`${npc.name}｜選擇穿戴裝備`;if(windowTitle)windowTitle.textContent=`${npc.name}｜拆卡`;
  list.innerHTML="";if(detail)detail.innerHTML='<div class="town-empty">選擇一件已穿戴且裝有卡片的裝備。每次費用 1,000,000 Zeny。</div>';
  const rows=getEquippedCardRemovalRows();
  if(!rows.length){list.innerHTML='<div class="town-empty">目前穿戴中的裝備沒有卡片。</div>';return true;}
  rows.forEach(row=>{
    const button=document.createElement("button");button.type="button";button.className="shop-item-row shop-item-button";
    const iconBox=document.createElement("span");iconBox.className="shop-item-icon";const icon=document.createElement("img");icon.src=row.item?.icon||`images/items/${row.itemId}.webp`;icon.alt=row.item?.name||"裝備";iconBox.appendChild(icon);
    const info=document.createElement("span");info.className="shop-item-name";const strong=document.createElement("b");strong.textContent=typeof buildEquipmentInstanceName==="function"?buildEquipmentInstanceName(row.instance,row.item):(row.item?.name||String(row.itemId));
    const small=document.createElement("small");small.textContent=`${typeof getEquipmentSlotName==="function"?getEquipmentSlotName(row.slot):row.slot}｜${row.cards.length} 張卡片`;
    info.append(strong,small);button.append(iconBox,info);button.onclick=()=>renderCardRemovalDetail(npc,row);list.appendChild(button);
  });
  return true;
}
function renderCardRemovalDetail(npc,row){
  const detail=document.getElementById("shop-detail-panel");if(!detail)return;
  detail.innerHTML="";
  const cardRecords=row.cards.map(id=>window.CardRuntime?.getCardRecord?.(id)||getItemData(id)).filter(Boolean);
  const hasMvp=cardRecords.some(card=>card.isMvpCard===true),chance=hasMvp?10:50;
  const card=document.createElement("div");card.className="shop-detail-card card-removal-detail";
  const name=document.createElement("div");name.className="shop-detail-name";name.textContent=typeof buildEquipmentInstanceName==="function"?buildEquipmentInstanceName(row.instance,row.item):(row.item?.name||"裝備");
  const meta=document.createElement("div");meta.className="shop-detail-meta";meta.textContent=`費用 1,000,000 Zeny｜成功率 ${chance}%${hasMvp?'（含 MVP 卡）':''}`;
  const desc=document.createElement("div");desc.className="shop-detail-desc";desc.textContent=`將一次拆除全部卡片：${cardRecords.map(x=>x.name).join('、')}。失敗仍扣費，但裝備與卡片都不會損壞或消失。`;
  const actions=document.createElement("div");actions.className="shop-action-row";const confirm=document.createElement("button");confirm.type="button";confirm.textContent="支付 1,000,000 Zeny 並嘗試拆卡";
  confirm.onclick=()=>{
    const result=window.CardRuntime?.removeAllCardsFromEquipped?.(row.slot);
    if(!result){addBattleLog(`${npc.name}：拆卡系統尚未載入。`);return;}
    if(result.ok)addBattleLog(`${npc.name}：拆卡成功！裝備與 ${result.cards.length} 張卡片已放回背包。`);
    else if(result.failed)addBattleLog(`${npc.name}：拆卡失敗，裝備與卡片均未受損；已扣除 1,000,000 Zeny。`);
    else addBattleLog(`${npc.name}：${result.reason||'無法拆卡'}`);
    openCardRemovalNpc(npc);
  };
  actions.appendChild(confirm);card.append(name,meta,desc,actions);detail.appendChild(card);
}

function openJobChangeNpc(npc) {
  const rules = (jobChangeRules || []).filter(rule => rule.npcId === npc.id && (typeof isJobChangeRuleVisibleForPlayer === "function" ? isJobChangeRuleVisibleForPlayer(rule) : rule.fromJob === player.jobKey));

  if (!rules.length) {
    addBattleLog(npc.name + "：目前沒有適合你的轉職項目。");
    return;
  }

  const panel = document.getElementById("shop-panel");
  const list = document.getElementById("shop-item-list");
  const detail = document.getElementById("shop-detail-panel");
  const shopWindow = document.getElementById("shop-window");
  if (!panel || !list) return;

  currentShopId = null;
  currentShopSelectedItem = null;
  closePurchaseDialog();
  if (shopWindow) {
    shopWindow.classList.remove("is-shop-list-only");
    shopWindow.classList.remove("hidden-window");
    if (typeof bringWindowToFront === "function") bringWindowToFront(shopWindow);
  }
  panel.classList.remove("hidden-town-section");
  const title = panel.querySelector(".shop-title");
  if (title) title.textContent = npc.name + "｜轉職";
  const windowTitle = document.getElementById("shop-window-title");
  if (windowTitle) windowTitle.textContent = npc.name + "｜轉職";
  if (detail) detail.innerHTML = '<div class="town-empty">選擇轉職項目後按下轉職。</div>';

  list.innerHTML = "";
  rules.forEach(rule => {
    const targetJob = getJobData(rule.toJob);
    const row = document.createElement("div");
    row.className = "shop-item-row job-change-row";

    const requirement = typeof describeJobConstitutionRequirement === "function"
      ? describeJobConstitutionRequirement(rule)
      : { requiredBaseLevel: rule.requiredBaseLevel || 1, requiredJobLevel: rule.requiredJobLevel || 1, skillText: "" };
    const constitutionCheck = typeof validateJobConstitution === "function"
      ? validateJobConstitution(rule, rule.toJob)
      : { ok: true, message: "" };
    const enabled = Boolean(rule.enabled) && constitutionCheck.ok && targetJob && !targetJob.locked;

    const info = document.createElement("div");
    info.className = "shop-item-name";
    const blockText = constitutionCheck.ok ? "" : `｜${constitutionCheck.message}`;
    const skillText = requirement.skillText ? `｜技能：${requirement.skillText}` : "";
    info.innerHTML = `<b>${targetJob?.name || rule.toJob}</b><small>需要 Base ${requirement.requiredBaseLevel || 1} / Job ${requirement.requiredJobLevel || 1}${skillText}${rule.enabled ? "" : "｜未開放"}${blockText}</small>`;

    const btn = document.createElement("button");
    btn.textContent = enabled ? "確認轉職" : "不可轉職";
    btn.disabled = !enabled;
    btn.onclick = function () { attemptTownJobChange(rule.id); };

    row.appendChild(info);
    row.appendChild(btn);
    list.appendChild(row);
  });
}

let pendingTownJobChangeRuleId = null;

function getTownJobChangeDialogue(rule, npc, targetJob) {
  const gender = typeof getROStudioCurrentGender === "function" ? getROStudioCurrentGender() : (String(player?.gender || "male").toLowerCase() === "female" ? "female" : "male");
  const special = rule?.specialDialogueByGender?.[gender] || null;
  const currentJob = typeof getCurrentJobData === "function" ? getCurrentJobData() : null;
  const originJob = typeof getJobData === "function" ? getJobData(player?.rebirthOriginJobKey) : null;
  let lead = `${npc?.name || "轉職導師"}確認你已符合轉職條件。`;
  let quote = `你即將由「${currentJob?.name || player?.job || rule.fromJob}」轉職為「${targetJob?.name || rule.toJob}」。`;
  let warning = "完成後職業會立即變更，請確認沒有選錯職業。";

  if (rule?.selectionMode === "rebirth" || rule?.type === "rebirth") {
    lead = "轉生引導者靜靜確認了你一路走來的經歷。";
    quote = `你將放下目前的「${currentJob?.name || player?.job}」力量，以轉生初心者的身分重新出發。`;
    warning = "轉生會重置 Base／Job 等級、六圍、技能與技能快捷欄，並固定取得 125 點素質點。";
  } else if (rule?.selectionMode === "automatic_previous_path" || rule?.requiredRebirthOrigin) {
    lead = `「歡迎回來。我記得你曾經走過${originJob?.name || "過去職業"}的道路。」`;
    quote = `你已再次完成修練，系統將依轉生前的二轉職業，自動承接唯一的進階道路：「${targetJob?.name || rule.toJob}」。`;
    warning = "轉生後不提供重新選擇二轉分支，這是你過去職業的唯一對應結果。";
  } else if (rule?.selectionMode === "automatic_family" || rule?.requiredRebirthFamily) {
    lead = "導師從你的靈魂印記中認出了你過去所屬的職業家族。";
    quote = `你將回到熟悉的道路，轉職為「${targetJob?.name || rule.toJob}」。`;
    warning = "轉生初心者只能回到轉生前的職業家族。";
  } else if (targetJob?.routeGroup === "second") {
    lead = `${npc?.name || "轉職導師"}再次確認了你的選擇。`;
    quote = `你確定要轉職為「${targetJob?.name || rule.toJob}」嗎？`;
    warning = "這項二轉選擇也會決定角色轉生後唯一對應的進階二轉道路。";
  } else if (targetJob?.routeGroup === "first") {
    lead = `${npc?.name || "轉職導師"}準備為你完成第一次正式轉職。`;
    quote = `你確定要轉職為「${targetJob?.name || rule.toJob}」嗎？`;
    warning = "請看清楚職業名稱後再確認，避免因連續點擊而轉錯職業。";
  } else if (targetJob?.routeGroup === "third" || targetJob?.routeGroup === "fourth") {
    lead = `${npc?.name || "轉職導師"}確認你已完成目前階段的全部修練。`;
    quote = `是否正式晉升為「${targetJob?.name || rule.toJob}」？`;
    warning = "此階段為固定延伸道路，不會出現其他職業分支。";
  }

  if (special) {
    lead = special.lead || lead;
    quote = special.quote || quote;
    warning = `${special.note || ""}${special.note ? "　" : ""}${warning}`;
  }
  return { lead, quote, warning };
}

function closeTownJobChangeConfirmation() {
  document.getElementById("job-change-confirm-modal")?.classList.add("hidden-window");
  pendingTownJobChangeRuleId = null;
}
window.closeTownJobChangeConfirmation = closeTownJobChangeConfirmation;

function openTownJobChangeConfirmation(rule) {
  const targetJob = typeof getJobData === "function" ? getJobData(rule?.toJob) : null;
  const npc = typeof getNpcData === "function" ? getNpcData(rule?.npcId) : null;
  if (!rule || !targetJob) return;
  const modal = document.getElementById("job-change-confirm-modal");
  const title = document.getElementById("job-change-confirm-title");
  const body = document.getElementById("job-change-confirm-body");
  const accept = document.getElementById("job-change-confirm-accept");
  const cancel = document.getElementById("job-change-confirm-cancel");
  if (!modal || !body || !accept) return;
  const dialogue = getTownJobChangeDialogue(rule, npc, targetJob);
  pendingTownJobChangeRuleId = rule.id;
  if (title) title.textContent = `${npc?.name || "轉職導師"}｜轉職確認`;
  body.innerHTML = `
    <div class="job-dialogue-lead">${escapeShopHtml(dialogue.lead)}</div>
    <div class="job-dialogue-quote">${escapeShopHtml(dialogue.quote)}</div>
    <div class="job-dialogue-target">目標職業：${escapeShopHtml(targetJob.name || rule.toJob)}</div>
    <div class="job-dialogue-warning">${escapeShopHtml(dialogue.warning)}</div>
  `;
  accept.textContent = rule.type === "rebirth" ? "確認轉生" : `轉職為${targetJob.name}`;
  accept.onclick = confirmPendingTownJobChange;
  if (cancel) cancel.onclick = closeTownJobChangeConfirmation;
  const closeButton = document.getElementById("job-change-confirm-close");
  if (closeButton) closeButton.onclick = closeTownJobChangeConfirmation;
  modal.classList.remove("hidden-window");
}
window.openTownJobChangeConfirmation = openTownJobChangeConfirmation;

function confirmPendingTownJobChange() {
  const rule = (jobChangeRules || []).find(item => item.id === pendingTownJobChangeRuleId);
  if (!rule) return closeTownJobChangeConfirmation();
  const constitutionCheck = typeof validateJobConstitution === "function"
    ? validateJobConstitution(rule, rule.toJob)
    : { ok:true, message:"" };
  if (!constitutionCheck.ok) {
    addBattleLog(constitutionCheck.message);
    return closeTownJobChangeConfirmation();
  }
  closeTownJobChangeConfirmation();
  changeJob(rule.toJob, rule);
  document.getElementById("shop-window")?.classList.add("hidden-window");
  updateTownUI();
}
window.confirmPendingTownJobChange = confirmPendingTownJobChange;

function attemptTownJobChange(ruleId) {
  const rule = (jobChangeRules || []).find(item => item.id === ruleId);
  if (!rule) return;
  if (!rule.enabled) {
    addBattleLog("這個轉職項目尚未開放。 ");
    return;
  }
  if (player.jobKey !== rule.fromJob) {
    addBattleLog("目前職業不符合轉職條件。 ");
    return;
  }
  if (typeof isJobChangeRuleVisibleForPlayer === "function" && !isJobChangeRuleVisibleForPlayer(rule)) {
    addBattleLog("這不是你轉生前所選擇的職業道路。");
    return;
  }
  const constitutionCheck = typeof validateJobConstitution === "function"
    ? validateJobConstitution(rule, rule.toJob)
    : { ok:true, message:"" };
  if (!constitutionCheck.ok) {
    addBattleLog(constitutionCheck.message);
    return;
  }
  openTownJobChangeConfirmation(rule);
}

function resetWorldCameraForTown(battleField) {
  if (!battleField) return;

  // V0.9.78j：回城時完整退出 World Camera / Large Map 狀態。
  // 避免野外 4608×4608 background-size、camera offset、world sprite CSS 殘留，
  // 造成城鎮背景被放大成模糊巨圖。
  battleField.classList.remove("world-camera-mode", "large-map-mode");
  battleField.classList.add("city-mode");
  battleField.dataset.worldCamera = "false";
  battleField.dataset.atlasActive = "false";
  document.getElementById("player-sprite")?.setAttribute("data-atlas-active", "false");
  delete battleField.dataset.mapId;

  [
    "--world-camera-width",
    "--world-camera-height",
    "--world-width",
    "--world-height",
    "--world-player-width",
    "--world-player-height"
  ].forEach(name => battleField.style.removeProperty(name));

  battleField.style.backgroundSize = "cover";
  battleField.style.backgroundPosition = "center center";
  battleField.style.backgroundRepeat = "no-repeat";
}

function updateTownBackground(city) {
  const battleField = document.getElementById("battle-field") || document.getElementById("battle-area");
  if (!battleField) return;

  // 0.9.82FG：包含 BFCache／重新載入的防禦性清場。
  if (typeof clearWorldMonsterFieldTest === "function") clearWorldMonsterFieldTest({ persist: true, save: false });
  if (typeof currentMonster !== "undefined") currentMonster = null;

  resetWorldCameraForTown(battleField);

  const playerImage = document.getElementById("playerImage");
  if (playerImage) {
    // V0.9.80I：城鎮展示與角色資訊共用使用者提供的 256x256 idle 單圖。
    playerImage.src = (typeof getROStudioCharacterIdleImage === "function" ? getROStudioCharacterIdleImage() + "?v=0.9.82EM" : "assets/characters/novice/male/idle.png?v=0.9.82EM");
  }

  if (typeof applyTownFixedPlayerPosition === "function") applyTownFixedPlayerPosition();

  if (typeof renderCityPlayerSprite === "function") {
    renderCityPlayerSprite();
  }

  if (city && city.background) {
    const cityId=String(city.id||"");
    const separator=String(city.background).includes("?")?"&":"?";
    const backgroundUrl=`${city.background}${separator}v=0.9.82GN&city=${encodeURIComponent(cityId)}`;
    // 城鎮切換必須先清除上一張背景；斐揚與吉芬不可共用快取狀態。
    battleField.dataset.townCityId=cityId;
    battleField.dataset.townBackground=backgroundUrl;
    battleField.style.removeProperty("background");
    battleField.style.backgroundImage="none";
    battleField.style.backgroundColor="#0b0d09";
    // 同步套用，避免等待圖片解碼時出現上一座城市殘影。
    battleField.style.backgroundImage=`linear-gradient(rgba(20, 20, 20, 0.25), rgba(20, 20, 20, 0.25)), url("${backgroundUrl}")`;
    // 預先解碼後再確認目前城市，防止快速切換時舊圖片回寫。
    const probe=new Image();
    probe.onload=()=>{if(window.player?.currentCity===cityId&&battleField.dataset.townCityId===cityId){battleField.style.backgroundImage=`linear-gradient(rgba(20, 20, 20, 0.25), rgba(20, 20, 20, 0.25)), url("${backgroundUrl}")`;}};
    probe.src=backgroundUrl;
  } else {
    battleField.dataset.townCityId="";
    battleField.dataset.townBackground="";
    battleField.style.backgroundImage="none";
  }
}

Object.assign(window,{openCardRemovalNpc,renderCardRemovalDetail,getEquippedCardRemovalRows});
