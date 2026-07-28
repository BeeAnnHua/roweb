//=======================================
// RO_WEB Enchant Material Exchange Preview v0.9.82GX
// Browse-only: always lists all materials, never filters by inventory, never consumes items.
//=======================================
(function(){
  "use strict";

  const VERSION = "0.9.82GX";
  const DATA_KEY = "data/enchant_material_exchange_preview.json";
  const state = { groupId: "all", search: "", selectedId: null };

  function byId(id){ return document.getElementById(id); }
  function iconPath(id){ return `images/items/${Number(id)}.webp?v=${VERSION}`; }
  function escapeHtml(value){
    return String(value ?? "").replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[ch]);
  }
  function data(){ return window.RO_WEB_DATA?.[DATA_KEY] || null; }
  function itemMap(){ return new Map((data()?.catalog || []).map(row => [Number(row.id), row])); }
  function selectedItem(){ return itemMap().get(Number(state.selectedId)) || null; }
  function isOpen(){
    const host = byId("enchantMaterialExchangeWindow");
    return !!host && !host.hidden && !host.classList.contains("hidden-window");
  }

  function openEnchantMaterialExchangePreview(npc){
    const host = byId("enchantMaterialExchangeWindow");
    if (!host || !data()) return false;
    state.groupId = "all";
    state.search = "";
    state.selectedId = Number(data()?.groups?.[0]?.outputIds?.[0] || data()?.catalog?.[0]?.id || 0) || null;
    const npcName = byId("enchantExchangeNpcName");
    const search = byId("enchantExchangeSearch");
    if (npcName) npcName.textContent = npc?.name || "綜合材料兌換研究員";
    if (search) search.value = "";
    host.hidden = false;
    host.classList.remove("hidden-window");
    renderAll();
    if (typeof bringWindowToFront === "function") bringWindowToFront(host);
    if (typeof addBattleLog === "function") addBattleLog(`${npc?.name || "綜合材料兌換研究員"}：已開啟全部附魔材料瀏覽目錄。本版不執行兌換。`);
    return true;
  }

  function closeEnchantMaterialExchangePreview(){
    const host = byId("enchantMaterialExchangeWindow");
    if (!host) return;
    host.classList.add("hidden-window");
    host.hidden = true;
  }

  function setEnchantExchangeGroup(groupId){
    const valid = groupId === "all" || (data()?.groups || []).some(row => row.id === groupId);
    if (!valid) return;
    state.groupId = groupId;
    renderAll();
  }

  function setEnchantExchangeSearch(value){
    state.search = String(value || "").trim().toLowerCase();
    renderCatalog();
  }

  function selectEnchantExchangeItem(itemId){
    if (!itemMap().has(Number(itemId))) return;
    state.selectedId = Number(itemId);
    renderCatalog();
    renderDetail();
  }

  function groupRows(){
    const map = itemMap();
    const groups = data()?.groups || [];
    const allowedIds = state.groupId === "all"
      ? new Set((data()?.catalog || []).map(row => Number(row.id)))
      : new Set((groups.find(row => row.id === state.groupId)?.outputIds || []).map(Number));
    const search = state.search;
    return (data()?.catalog || []).filter(row => {
      if (!allowedIds.has(Number(row.id))) return false;
      if (!search) return true;
      return `${row.name || ""} ${row.description || ""} ${row.id || ""} ${row.aegisName || ""}`.toLowerCase().includes(search);
    });
  }

  function renderAll(){ renderGroups(); renderCatalog(); renderDetail(); }

  function renderGroups(){
    const host = byId("enchantExchangeGroups");
    if (!host) return;
    const groups = [{ id: "all", name: "全部材料", outputIds: data()?.catalog?.map(row => row.id) || [] }, ...(data()?.groups || [])];
    host.innerHTML = groups.map(group => `
      <button type="button" class="${state.groupId === group.id ? "is-active" : ""}" onclick="setEnchantExchangeGroup('${escapeHtml(group.id)}')">
        <b>${escapeHtml(group.name)}</b><small>${group.outputIds?.length || 0} 項</small>
      </button>`).join("");
  }

  function renderCatalog(){
    const host = byId("enchantExchangeCatalog");
    const count = byId("enchantExchangeCount");
    if (!host) return;
    const rows = groupRows();
    if (count) count.textContent = `${rows.length} / ${data()?.catalog?.length || 0}`;
    host.innerHTML = rows.length ? rows.map(row => `
      <button type="button" class="enchant-exchange-item${Number(state.selectedId) === Number(row.id) ? " is-selected" : ""}" onclick="selectEnchantExchangeItem(${row.id})">
        <img src="${iconPath(row.id)}" alt="${escapeHtml(row.name)}">
        <span><b>${escapeHtml(row.name)}</b><small>Item ID ${row.id}</small></span>
      </button>`).join("") : `<div class="enchant-preview-empty"><b>找不到材料</b><span>請更換分類或搜尋文字。</span></div>`;
  }

  function findGroupForItem(id){
    return (data()?.groups || []).find(group => (group.outputIds || []).map(Number).includes(Number(id))) || null;
  }

  function renderDetail(){
    const host = byId("enchantExchangeDetail");
    const footer = byId("enchantExchangeRequirement");
    const execute = byId("enchantExchangeExecute");
    if (!host || !footer || !execute) return;
    const item = selectedItem();
    if (!item) {
      host.innerHTML = `<div class="enchant-preview-empty"><b>請選擇材料</b></div>`;
      footer.innerHTML = "";
      execute.disabled = true;
      return;
    }
    const group = findGroupForItem(item.id);
    const source = data()?.sourceItem;
    host.innerHTML = `
      <div class="enchant-exchange-detail-main">
        <img src="${iconPath(item.id)}" alt="${escapeHtml(item.name)}">
        <div><small>${escapeHtml(group?.name || "附魔材料")}</small><h3>${escapeHtml(item.name)}</h3><code>Item ID ${item.id}</code></div>
      </div>
      <p>${escapeHtml(item.description || "尚無物品說明。")}</p>
      <section><h4>兌換／合成用途預覽</h4><p>${escapeHtml(group?.description || "此項目已保留於綜合材料兌換平台。")}</p></section>
      <div class="enchant-exchange-policy"><b>固定顯示全部項目</b><span>不會因目前背包沒有材料而隱藏，玩家可先查看目標再蒐集。</span></div>`;
    footer.innerHTML = `
      <div class="enchant-exchange-source"><img src="${iconPath(source?.id || 1000811)}" alt="${escapeHtml(source?.name || "雪花魔力原石")}"><span><small>主要來源材料</small><b>${escapeHtml(source?.name || "雪花魔力原石")}</b></span></div>
      <div class="enchant-exchange-ratio"><small>正式兌換比例</small><b>待原始配方確認</b><span>預覽版不猜測數量</span></div>`;
    execute.disabled = true;
    execute.textContent = "預覽版｜尚未啟用兌換";
  }

  window.openEnchantMaterialExchangePreview = openEnchantMaterialExchangePreview;
  window.closeEnchantMaterialExchangePreview = closeEnchantMaterialExchangePreview;
  window.setEnchantExchangeGroup = setEnchantExchangeGroup;
  window.setEnchantExchangeSearch = setEnchantExchangeSearch;
  window.selectEnchantExchangeItem = selectEnchantExchangeItem;
  window.EnchantMaterialExchangePreview = {
    version: VERSION,
    open: openEnchantMaterialExchangePreview,
    close: closeEnchantMaterialExchangePreview,
    getData: data,
    getState: () => ({ ...state }),
    previewOnly: true,
    inventoryFiltered: false
  };

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && isOpen()) closeEnchantMaterialExchangePreview();
  });
})();
