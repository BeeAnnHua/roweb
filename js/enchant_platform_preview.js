//=======================================
// RO_WEB Enchant Platform Catalog Preview v0.9.82GX
// Preview only: no inventory detection, consumption, save writes, or real enchant effects.
//=======================================
(function(){
  "use strict";

  const VERSION = "0.9.82GX";
  const DATA_KEY = "data/dim_glacier_enchant_preview.json";
  const SLOT_ORDER = [4, 3, 2];

  const PREVIEW_WEAPONS = [
    { id: 600030, name: "黯淡冰晶雙手巨劍", refine: 10, grade: "D", kind: "雙手劍" },
    { id: 550089, name: "黯淡冰晶法杖", refine: 8, grade: "C", kind: "單手杖" },
    { id: 700059, name: "黯淡冰晶長弓", refine: 7, grade: "B", kind: "弓" }
  ];

  const DEMO_CARD = {
    id: 4001,
    group: "卡片",
    name: "波利卡片（顯示示意）",
    effect: "第1洞固定為卡片欄位，不參與第4洞 → 第3洞 → 第2洞的附魔流程。"
  };

  const state = {
    weaponIndex: 0,
    activeTab: "enchant",
    currentSlot: 4,
    selectedStoneId: null,
    selectedUpgradeIndex: 0,
    search: "",
    slotContents: { 1: DEMO_CARD, 2: null, 3: null, 4: null }
  };

  function byId(id){ return document.getElementById(id); }
  function iconPath(id){ return `images/items/${Number(id)}.webp?v=${VERSION}`; }
  function escapeHtml(value){
    return String(value ?? "").replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[ch]);
  }
  function cleanText(value){
    return String(value ?? "")
      .replace(/\^[0-9A-Fa-f]{6}/g, "")
      .replace(/\^000000/g, "")
      .replace(/^_+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  function catalog(){
    const data = window.RO_WEB_DATA?.[DATA_KEY];
    return data && typeof data === "object" ? data : null;
  }
  function slotData(slot){
    return catalog()?.slots?.[String(Number(slot))] || { items: [], count: 0 };
  }
  function allUpgrades(){ return Array.isArray(catalog()?.upgrades) ? catalog().upgrades : []; }
  function currentPool(){ return slotData(state.currentSlot).items || []; }
  function selectedStone(){
    return currentPool().find(row => Number(row.id) === Number(state.selectedStoneId)) || null;
  }
  function selectedUpgrade(){ return allUpgrades()[state.selectedUpgradeIndex] || null; }
  function isOpen(){
    const host = byId("enchantPlatformWindow");
    return !!host && !host.hidden && !host.classList.contains("hidden-window");
  }

  function resetDemoState(){
    state.weaponIndex = 0;
    state.activeTab = "enchant";
    state.currentSlot = 4;
    state.selectedStoneId = null;
    state.selectedUpgradeIndex = 0;
    state.search = "";
    state.slotContents = { 1: DEMO_CARD, 2: null, 3: null, 4: null };
  }

  function openEnchantPlatformPreview(npc){
    const host = byId("enchantPlatformWindow");
    if (!host) return false;
    if (!catalog()) {
      if (typeof addBattleLog === "function") addBattleLog("附魔研究員：完整附魔預覽資料尚未載入。");
      return false;
    }
    resetDemoState();
    const npcName = byId("enchantPlatformNpcName");
    if (npcName) npcName.textContent = npc?.name || "斐揚附魔研究員";
    const search = byId("enchantPlatformStoneSearch");
    if (search) search.value = "";
    host.hidden = false;
    host.classList.remove("hidden-window");
    renderAll();
    setMessage("完整資料預覽：第4洞 179 顆、第3洞 99 顆、第2洞 2 顆；不偵測背包、不扣材料、不保存附魔。");
    if (typeof bringWindowToFront === "function") bringWindowToFront(host);
    if (typeof addBattleLog === "function") addBattleLog(`${npc?.name || "附魔研究員"}：已開啟黯淡冰晶完整附魔目錄預覽。`);
    return true;
  }

  function closeEnchantPlatformPreview(){
    const host = byId("enchantPlatformWindow");
    if (!host) return;
    closeEnchantStoneInfo();
    host.classList.add("hidden-window");
    host.hidden = true;
  }

  function setMessage(text){
    const message = byId("enchantPlatformMessage");
    if (message) message.textContent = String(text || "");
  }

  function setEnchantPlatformTab(tab){
    if (!["enchant", "upgrade", "reset"].includes(tab)) return;
    state.activeTab = tab;
    state.selectedStoneId = null;
    state.search = "";
    const search = byId("enchantPlatformStoneSearch");
    if (search) search.value = "";
    document.querySelectorAll("[data-enchant-platform-tab]").forEach(button => {
      const active = button.dataset.enchantPlatformTab === tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    renderAll();
  }

  function setEnchantPreviewSearch(value){
    state.search = String(value || "").trim().toLowerCase();
    renderStonePanel();
  }

  function selectPreviewWeapon(index){
    const next = Number(index);
    if (!Number.isInteger(next) || !PREVIEW_WEAPONS[next]) return;
    state.weaponIndex = next;
    state.currentSlot = 4;
    state.selectedStoneId = null;
    state.slotContents = { 1: DEMO_CARD, 2: null, 3: null, 4: null };
    renderAll();
  }

  function selectPreviewStone(slot, stoneId){
    const numericSlot = Number(slot);
    const stone = (slotData(numericSlot).items || []).find(row => Number(row.id) === Number(stoneId));
    if (!stone || numericSlot !== state.currentSlot || state.activeTab !== "enchant") return;
    state.selectedStoneId = Number(stoneId);
    renderStonePanel();
    renderCostPanel();
    openEnchantStoneInfo(stone, `第${numericSlot}洞候選附魔｜Item ID ${stone.id}`);
  }

  function selectPreviewUpgrade(index){
    const next = Number(index);
    if (!Number.isInteger(next) || !allUpgrades()[next]) return;
    state.selectedUpgradeIndex = next;
    renderCenterPanel();
    renderStonePanel();
    renderCostPanel();
    const step = selectedUpgrade();
    openEnchantStoneInfo(step.to, `${step.from.name} → ${step.to.name}`);
  }

  function openEnchantStoneInfo(item, contextLabel){
    const modal = byId("enchantStoneInfoWindow");
    if (!modal || !item) return;
    const title = byId("enchantStoneInfoTitle");
    const icon = byId("enchantStoneInfoIcon");
    const group = byId("enchantStoneInfoGroup");
    const description = byId("enchantStoneInfoDescription");
    if (title) title.textContent = item.name || "附魔資訊";
    if (icon) { icon.src = iconPath(item.id); icon.alt = item.name || "附魔圖示"; }
    if (group) group.textContent = contextLabel || item.group || "附魔資訊";
    if (description) description.textContent = cleanText(item.effect || item.description || "尚無說明。");
    modal.hidden = false;
    modal.classList.remove("hidden-window");
  }

  function inspectEnchantSlot(slot){
    const numericSlot = Number(slot);
    const content = state.slotContents[numericSlot];
    if (!content) return;
    openEnchantStoneInfo(content, numericSlot === 1 ? "第1洞｜卡片" : `第${numericSlot}洞｜已套用預覽`);
  }

  function closeEnchantStoneInfo(){
    const modal = byId("enchantStoneInfoWindow");
    if (!modal) return;
    modal.classList.add("hidden-window");
    modal.hidden = true;
  }

  function previewExecuteEnchant(){
    if (state.activeTab === "enchant") {
      const stone = selectedStone();
      if (!stone || !state.currentSlot) return;
      const slot = state.currentSlot;
      state.slotContents[slot] = { ...stone };
      state.selectedStoneId = null;
      const nextSlot = SLOT_ORDER[SLOT_ORDER.indexOf(slot) + 1] || null;
      state.currentSlot = nextSlot;
      state.search = "";
      const search = byId("enchantPlatformStoneSearch");
      if (search) search.value = "";
      renderAll();
      setMessage(nextSlot
        ? `預覽套用完成：第${slot}洞已放入「${stone.name}」，現在解鎖第${nextSlot}洞。沒有扣除材料或寫入裝備。`
        : `預覽流程完成：第4、3、2洞皆已填入。可切換「升階」查看物理／魔法 Lv.1～Lv.5 的完整材料。`);
      return;
    }
    if (state.activeTab === "upgrade") {
      const step = selectedUpgrade();
      if (!step) return;
      setMessage(`升階預覽：${step.from.name} → ${step.to.name}。畫面所列為 RA 材料需求，本版沒有扣除或保存。`);
      openEnchantStoneInfo(step.to, "升階結果預覽");
      return;
    }
    if (state.activeTab === "reset") resetPreviewFlow();
  }

  function resetPreviewFlow(){
    state.currentSlot = 4;
    state.selectedStoneId = null;
    state.slotContents = { 1: DEMO_CARD, 2: null, 3: null, 4: null };
    renderAll();
    setMessage("重置預覽完成：第4、3、2洞恢復空白。正式規則使用雪花魔力原石 ×5，本版未扣除物品。");
  }

  function renderAll(){
    renderEquipmentList();
    renderCenterPanel();
    renderStonePanel();
    renderCostPanel();
  }

  function renderEquipmentList(){
    const host = byId("enchantPlatformEquipmentList");
    if (!host) return;
    host.innerHTML = PREVIEW_WEAPONS.map((weapon, index) => `
      <button type="button" class="enchant-preview-equipment${index === state.weaponIndex ? " is-active" : ""}" onclick="selectPreviewWeapon(${index})">
        <img src="${iconPath(weapon.id)}" alt="${escapeHtml(weapon.name)}">
        <span><b>+${weapon.refine} ${escapeHtml(weapon.name)} [${weapon.grade}]</b><small>${escapeHtml(weapon.kind)}｜固定預覽裝備</small></span>
      </button>`).join("");
  }

  function slotState(slot){
    if (slot === 1) return "card";
    if (state.slotContents[slot]) return "filled";
    if (state.activeTab !== "enchant") return "view-only";
    if (state.currentSlot === slot) return "active";
    if (state.currentSlot === null) return "complete";
    const currentIndex = SLOT_ORDER.indexOf(state.currentSlot);
    const slotIndex = SLOT_ORDER.indexOf(slot);
    return slotIndex > currentIndex ? "locked" : "empty";
  }

  function renderSlot(slot){
    const content = state.slotContents[slot];
    const status = slotState(slot);
    const label = slot === 1 ? "第1洞｜卡片" : `第${slot}洞｜附魔`;
    const image = content
      ? `<img src="${iconPath(content.id)}" alt="${escapeHtml(content.name)}">`
      : `<span class="enchant-slot-empty-mark">${status === "locked" ? "🔒" : "◇"}</span>`;
    const contentName = content?.name || (status === "active" ? "目前可附魔" : status === "locked" ? "尚未解鎖" : "尚未附魔");
    const action = content ? `onclick="inspectEnchantSlot(${slot})"` : "disabled";
    return `<button type="button" class="enchant-visual-slot slot-${slot} is-${status}" data-slot="${slot}" ${action} aria-label="${escapeHtml(label + " " + contentName)}">
      <span class="enchant-slot-number">${slot}</span>${image}<small>${escapeHtml(contentName)}</small>
    </button>`;
  }

  function renderCenterPanel(){
    const host = byId("enchantPlatformCenter");
    if (!host) return;
    const weapon = PREVIEW_WEAPONS[state.weaponIndex];
    if (state.activeTab === "enchant") {
      const progress = state.currentSlot ? `目前順序：第${state.currentSlot}洞` : "第4、3、2洞皆完成";
      host.innerHTML = `
        <div class="enchant-preview-weapon-title"><span>+${weapon.refine}</span><b>${escapeHtml(weapon.name)}</b><em>[${weapon.grade}]</em></div>
        <div class="enchant-weapon-stage">
          <div class="enchant-stage-glow" aria-hidden="true"></div>
          <img class="enchant-stage-weapon" src="${iconPath(weapon.id)}" alt="${escapeHtml(weapon.name)}">
          ${renderSlot(1)}${renderSlot(4)}${renderSlot(2)}${renderSlot(3)}
        </div>
        <div class="enchant-progress-line"><b>${progress}</b><span>固定流程：第4洞 → 第3洞 → 第2洞；第1洞為卡片</span></div>`;
      return;
    }
    if (state.activeTab === "upgrade") {
      const step = selectedUpgrade();
      if (!step) {
        host.innerHTML = `<div class="enchant-preview-empty"><b>沒有升階資料</b></div>`;
        return;
      }
      host.innerHTML = `
        <div class="enchant-preview-weapon-title"><span>+${weapon.refine}</span><b>${escapeHtml(weapon.name)}</b><em>[${weapon.grade}]</em></div>
        <div class="enchant-upgrade-stage">
          <article><img src="${iconPath(step.from.id)}" alt="${escapeHtml(step.from.name)}"><small>目前</small><b>${escapeHtml(step.from.name)}</b></article>
          <div class="enchant-upgrade-arrow">→</div>
          <article class="is-target"><img src="${iconPath(step.to.id)}" alt="${escapeHtml(step.to.name)}"><small>升階後</small><b>${escapeHtml(step.to.name)}</b></article>
        </div>
        <div class="enchant-upgrade-effect"><h3>升階後效果</h3><p>${escapeHtml(cleanText(step.to.effect))}</p></div>`;
      return;
    }
    const reset = catalog()?.reset;
    host.innerHTML = `
      <div class="enchant-preview-weapon-title"><span>+${weapon.refine}</span><b>${escapeHtml(weapon.name)}</b><em>[${weapon.grade}]</em></div>
      <div class="enchant-tab-placeholder reset-preview">
        <img src="${iconPath(reset?.materials?.[0]?.id || 1000811)}" alt="雪花魔力原石">
        <h3>全部附魔重置預覽</h3>
        <p>依 RO_WEB 定案，重置第4、3、2洞需要雪花魔力原石 ×5。第1洞卡片不受影響。</p>
        <button type="button" onclick="resetPreviewFlow()">預覽重置流程</button>
      </div>`;
  }

  function matchesSearch(row){
    if (!state.search) return true;
    const hay = `${row.name || ""} ${row.group || ""} ${row.effect || ""} ${row.id || ""}`.toLowerCase();
    return hay.includes(state.search);
  }

  function renderStonePanel(){
    const host = byId("enchantPlatformStoneList");
    const heading = byId("enchantPlatformStoneHeading");
    const searchWrap = byId("enchantPlatformSearchWrap");
    if (!host || !heading) return;

    if (state.activeTab === "reset") {
      if (searchWrap) searchWrap.hidden = true;
      heading.textContent = "重置規則｜專案定案";
      host.innerHTML = `<div class="enchant-preview-empty"><b>雪花魔力原石 ×5</b><span>重置第4、3、2洞；第1洞卡片保留。本版只預覽，不扣材料。</span></div>`;
      return;
    }

    if (searchWrap) searchWrap.hidden = false;
    if (state.activeTab === "upgrade") {
      const rows = allUpgrades().map((step, index) => ({ step, index })).filter(({ step }) => matchesSearch({
        name: `${step.from.name} ${step.to.name}`,
        group: "物理 魔法 升階",
        effect: step.to.effect,
        id: step.to.id
      }));
      heading.textContent = `第2洞升階路線｜${rows.length} / ${allUpgrades().length}`;
      host.innerHTML = rows.length ? rows.map(({ step, index }) => `
        <button type="button" class="enchant-stone-row enchant-upgrade-row${index === state.selectedUpgradeIndex ? " is-selected" : ""}" onclick="selectPreviewUpgrade(${index})">
          <img src="${iconPath(step.to.id)}" alt="${escapeHtml(step.to.name)}">
          <span><b>${escapeHtml(step.from.name)} → ${escapeHtml(step.to.name)}</b><small>${step.materials.length} 種材料｜左鍵查看效果</small></span>
        </button>`).join("") : `<div class="enchant-preview-empty"><b>找不到符合項目</b><span>請更換搜尋文字。</span></div>`;
      return;
    }

    if (!state.currentSlot) {
      heading.textContent = "附魔流程完成";
      host.innerHTML = `<div class="enchant-preview-empty"><b>第4、3、2洞皆已完成</b><span>請切換至「升階」或「重置」。</span></div>`;
      return;
    }

    const entire = currentPool();
    const pool = entire.filter(matchesSearch);
    heading.textContent = `第${state.currentSlot}洞可用附魔｜${pool.length} / ${entire.length}`;
    const groups = [];
    pool.forEach(stone => {
      let group = groups.find(row => row.name === stone.group);
      if (!group) { group = { name: stone.group, rows: [] }; groups.push(group); }
      group.rows.push(stone);
    });
    host.innerHTML = groups.length ? groups.map(group => `
      <section class="enchant-stone-group">
        <h4>${escapeHtml(group.name)} <small>${group.rows.length}</small></h4>
        ${group.rows.map(stone => `
          <button type="button" class="enchant-stone-row${Number(state.selectedStoneId) === Number(stone.id) ? " is-selected" : ""}" onclick="selectPreviewStone(${state.currentSlot},${stone.id})" title="左鍵鎖定並查看完整介紹">
            <img src="${iconPath(stone.id)}" alt="${escapeHtml(stone.name)}">
            <span><b>${escapeHtml(stone.name)}</b><small>Item ID ${stone.id}｜左鍵鎖定</small></span>
          </button>`).join("")}
      </section>`).join("") : `<div class="enchant-preview-empty"><b>找不到符合項目</b><span>請更換技能名稱、附魔名稱或 Item ID。</span></div>`;
  }

  function materialById(itemId){
    const id = Number(itemId);
    const pools = Object.values(catalog()?.slots || {}).flatMap(row => row.items || []);
    const materials = [
      ...pools.flatMap(row => row.materials || []),
      ...allUpgrades().flatMap(row => row.materials || []),
      ...(catalog()?.reset?.materials || [])
    ];
    return materials.find(row => Number(row.id) === id) || { id, name: `材料 ${id}`, effect: "附魔材料" };
  }

  function inspectEnchantMaterial(itemId){
    const row = materialById(itemId);
    openEnchantStoneInfo(row, `材料需求｜Item ID ${row.id}`);
  }

  function renderMaterials(materials, previewEnough){
    const rows = Array.isArray(materials) ? materials : [];
    if (!rows.length) return `<div class="enchant-cost-note">此流程沒有材料需求。</div>`;
    return rows.map(row => `
      <button type="button" class="enchant-cost-item${previewEnough ? " is-enough" : ""}" onclick="inspectEnchantMaterial(${Number(row.id)})" title="${escapeHtml(row.name)} ×${Number(row.amount) || 0}">
        <img src="${iconPath(row.id)}" alt="${escapeHtml(row.name)}"><span><b>×${Number(row.amount) || 0}</b><small>${escapeHtml(row.name)}</small></span>
      </button>`).join("");
  }

  function renderCostPanel(){
    const materialHost = byId("enchantPlatformMaterialList");
    const zeny = byId("enchantPlatformZeny");
    const execute = byId("enchantPlatformExecute");
    if (!materialHost || !zeny || !execute) return;

    let materials = [];
    let zenyAmount = 0;
    let enabled = false;
    let label = "確認執行";

    if (state.activeTab === "enchant") {
      const row = selectedStone() || currentPool()[0] || null;
      materials = row?.materials || [];
      zenyAmount = Number(row?.zeny) || 0;
      enabled = !!selectedStone() && !!state.currentSlot;
      label = state.currentSlot ? `預覽套用｜第${state.currentSlot}洞` : "附魔流程完成";
    } else if (state.activeTab === "upgrade") {
      const step = selectedUpgrade();
      materials = step?.materials || [];
      zenyAmount = Number(step?.zeny) || 0;
      enabled = !!step;
      label = "預覽升階";
    } else {
      materials = catalog()?.reset?.materials || [];
      zenyAmount = Number(catalog()?.reset?.zeny) || 0;
      enabled = true;
      label = "預覽重置";
    }

    materialHost.innerHTML = renderMaterials(materials, true);
    zeny.innerHTML = `<span>所需 Zeny</span><b>${zenyAmount.toLocaleString("zh-TW")}</b><small>預覽模式視為條件足夠</small>`;
    execute.disabled = !enabled;
    execute.classList.toggle("is-ready", enabled);
    execute.textContent = label;
  }

  window.openEnchantPlatformPreview = openEnchantPlatformPreview;
  window.closeEnchantPlatformPreview = closeEnchantPlatformPreview;
  window.setEnchantPlatformTab = setEnchantPlatformTab;
  window.setEnchantPreviewSearch = setEnchantPreviewSearch;
  window.selectPreviewWeapon = selectPreviewWeapon;
  window.selectPreviewStone = selectPreviewStone;
  window.selectPreviewUpgrade = selectPreviewUpgrade;
  window.openEnchantStoneInfo = openEnchantStoneInfo;
  window.closeEnchantStoneInfo = closeEnchantStoneInfo;
  window.inspectEnchantSlot = inspectEnchantSlot;
  window.inspectEnchantMaterial = inspectEnchantMaterial;
  window.previewExecuteEnchant = previewExecuteEnchant;
  window.resetPreviewFlow = resetPreviewFlow;
  window.EnchantPlatformPreview = {
    version: VERSION,
    open: openEnchantPlatformPreview,
    close: closeEnchantPlatformPreview,
    getCatalog: catalog,
    getState: () => JSON.parse(JSON.stringify(state)),
    slotOrder: SLOT_ORDER.slice(),
    previewOnly: true
  };

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    const info = byId("enchantStoneInfoWindow");
    if (info && !info.hidden) { closeEnchantStoneInfo(); return; }
    if (isOpen()) closeEnchantPlatformPreview();
  });
})();
