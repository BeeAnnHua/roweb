//============================================================
// RO_WEB 0.9.82GG — rAthena Renewal 裝備精煉 Runtime
// Source: rAthena 2026-06-08 db/re/refine.yml
// UI: original HTML/CSS implementation inspired by the official workflow.
//============================================================
(() => {
  "use strict";

  const VERSION = "0.9.82GG";
  const RULE_KEY = "data/refine_rules.json";
  const BLESSING_ID = 6635;
  const state = {
    open: false,
    npcName: "精煉匠人",
    selected: null,
    chanceIndex: 0,
    useBlessing: false,
    lastResult: null,
    skipBlessingPromptOnce: false
  };

  const number = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const integer = (value, fallback = 0) => Math.floor(number(value, fallback));
  const esc = value => String(value ?? "").replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
  const itemIdOf = value => Number(value?.id ?? value?.itemId ?? value?.officialId ?? value ?? 0) || 0;

  function rules() {
    return window.RO_WEB_DATA?.[RULE_KEY] || null;
  }

  function itemData(value) {
    return window.getItemData?.(itemIdOf(value)) || null;
  }

  function isEquipment(data) {
    return String(data?.type || "").toLowerCase() === "equipment";
  }

  function equipmentGroup(data) {
    const category = String(data?.category || data?.dbType || data?.Type || "").toLowerCase();
    const slot = String(data?.slot || "").toLowerCase();
    if (category === "weapon" || String(data?.dbType || data?.Type) === "Weapon" || slot === "weapon") return "Weapon";
    if (category === "armor" || String(data?.dbType || data?.Type) === "Armor" || slot) return "Armor";
    return null;
  }

  function equipmentLevel(data, group = equipmentGroup(data)) {
    if (group === "Weapon") return Math.max(1, Math.min(5, integer(data?.weaponLevel ?? data?.WeaponLevel ?? 1, 1)));
    if (group === "Armor") return Math.max(1, Math.min(2, integer(data?.armorLevel ?? data?.ArmorLevel ?? 1, 1)));
    return 0;
  }

  function isRefineable(data) {
    if (!isEquipment(data) || !equipmentGroup(data)) return false;
    if (data?.refineable === false || data?.Refineable === false) return false;
    return true;
  }

  function profileFor(data) {
    const group = equipmentGroup(data);
    const level = equipmentLevel(data, group);
    return rules()?.groups?.[group]?.levels?.[String(level)] || null;
  }

  function targetRule(data, currentRefine) {
    const profile = profileFor(data);
    return profile?.refineLevels?.[String(Math.max(0, integer(currentRefine)) + 1)] || null;
  }

  function materialName(chance) {
    return rules()?.materials?.[chance?.materialAegis]?.name || itemData(chance?.materialItemId)?.name || chance?.materialAegis || "精煉礦石";
  }

  function equipmentInstanceName(instance, data) {
    if (typeof window.buildEquipmentInstanceName === "function") return window.buildEquipmentInstanceName(instance, data);
    const refine = Math.max(0, integer(instance?.refine));
    return `${refine > 0 ? `+${refine} ` : ""}${data?.name || instance?.name || "裝備"}`;
  }

  function normalizeRawInstance(raw, data) {
    if (!raw) return null;
    raw.id = itemIdOf(raw);
    raw.itemId = raw.id;
    raw.name = raw.name || data?.name || String(raw.id);
    raw.count = 1;
    raw.refine = Math.max(0, Math.min(20, integer(raw.refine ?? raw.refineLevel)));
    raw.broken = Boolean(raw.broken || raw.isBroken);
    if (!raw.instanceId) raw.instanceId = `ref_${raw.id}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
    return raw;
  }

  function inventoryRows() {
    const out = [];
    for (const raw of Array.isArray(window.player?.inventory) ? window.player.inventory : []) {
      const data = itemData(raw);
      if (!isRefineable(data)) continue;
      const instance = normalizeRawInstance(raw, data);
      if (!instance || instance.broken || instance.refine >= 20) continue;
      out.push({
        key: `inventory:${instance.instanceId}`,
        location: "inventory",
        instanceId: String(instance.instanceId),
        slot: null,
        instance,
        data
      });
    }
    return out;
  }

  function equippedRows() {
    const out = [];
    const seen = new Set();
    const slots = Object.keys(window.player?.equipment || {});
    for (const slot of slots) {
      let raw = window.player?.equipmentInstances?.[slot] || null;
      const id = itemIdOf(raw || window.player?.equipment?.[slot]);
      const data = itemData(id);
      if (!id || !isRefineable(data)) continue;
      if (!raw) {
        raw = { id, itemId:id, name:data?.name, count:1, refine:0, instanceId:`eq_${slot}_${id}_${Date.now().toString(36)}` };
        window.player.equipmentInstances = window.player.equipmentInstances || {};
        window.player.equipmentInstances[slot] = raw;
      }
      const instance = normalizeRawInstance(raw, data);
      if (!instance || instance.broken || instance.refine >= 20 || seen.has(instance.instanceId)) continue;
      seen.add(instance.instanceId);
      out.push({
        key: `equipment:${slot}:${instance.instanceId}`,
        location: "equipment",
        instanceId: String(instance.instanceId),
        slot,
        instance,
        data
      });
    }
    return out;
  }

  function allCandidates() {
    return [...equippedRows(), ...inventoryRows()].sort((a,b) => {
      if (a.location !== b.location) return a.location === "equipment" ? -1 : 1;
      return equipmentInstanceName(a.instance,a.data).localeCompare(equipmentInstanceName(b.instance,b.data), "zh-Hant");
    });
  }

  function resolveSelection() {
    if (!state.selected) return null;
    return allCandidates().find(row => row.key === state.selected.key ||
      (row.location === state.selected.location && String(row.instanceId) === String(state.selected.instanceId))) || null;
  }

  function inventoryCount(id) {
    return (window.player?.inventory || []).reduce((sum,row) => {
      if (String(itemIdOf(row)) !== String(id) || row?.instanceId) return sum;
      return sum + Math.max(0, integer(row?.count));
    }, 0);
  }

  function consumeStack(id, quantity) {
    let need = Math.max(0, integer(quantity));
    if (!need) return true;
    const list = window.player?.inventory || [];
    if (inventoryCount(id) < need) return false;
    for (let i = list.length - 1; i >= 0 && need > 0; i -= 1) {
      const row = list[i];
      if (String(itemIdOf(row)) !== String(id) || row?.instanceId) continue;
      const take = Math.min(Math.max(0, integer(row.count)), need);
      row.count = Math.max(0, integer(row.count) - take);
      need -= take;
      if (row.count <= 0) list.splice(i,1);
    }
    return need === 0;
  }

  function selectedContext() {
    const selected = resolveSelection();
    if (!selected) return { selected:null, rule:null, chance:null };
    const rule = targetRule(selected.data, selected.instance.refine);
    const chances = Array.isArray(rule?.chances) ? rule.chances : [];
    if (state.chanceIndex >= chances.length) state.chanceIndex = 0;
    const chance = chances[state.chanceIndex] || null;
    return { selected, rule, chance, chances };
  }

  function failureDescription(chance, protectedByBlessing = false) {
    if (protectedByBlessing) return "失敗時由鐵匠的祝福保護，裝備不損壞且精煉值不下降。";
    const breaking = Math.max(0, integer(chance?.breakingRate));
    const downgrade = Math.max(0, integer(chance?.downgradeAmount));
    if (breaking >= 10000) return "失敗：裝備損壞消失。";
    if (breaking > 0 && downgrade > 0) return `失敗：${(breaking/100).toFixed(2).replace(/\.00$/,"")}% 損壞；未損壞時精煉值下降 ${downgrade}。`;
    if (breaking > 0) return `失敗：${(breaking/100).toFixed(2).replace(/\.00$/,"")}% 機率損壞。`;
    if (downgrade > 0) return `失敗：精煉值下降 ${downgrade}。`;
    return "失敗：精煉值維持不變。";
  }

  function bonusDescription(data, rule) {
    if (!rule) return "";
    const bonus = number(rule.bonus) / 100;
    const random = number(rule.randomBonus) / 100;
    const group = equipmentGroup(data);
    const level = equipmentLevel(data, group);
    const parts = [];
    if (group === "Weapon") {
      parts.push(`累積精煉 ATK${String(data?.subCategory||"").toLowerCase()==="bow"?"":"／MATK"} +${bonus}`);
      if (random > 0) parts.push(`超精煉隨機 ATK 0～${random}`);
      if (level === 5) parts.push(`P.ATK／S.MATK +${rule.targetLevel * 2}`);
    } else {
      parts.push(`累積精煉 DEF +${bonus}`);
      if (level === 2) parts.push(`RES／MRES +${rule.targetLevel * 2}`);
    }
    return parts.join("；");
  }

  function selectedHtml(ctx) {
    if (!ctx.selected) return `
      <div class="refine-empty-state">
        <div class="refine-empty-gem">◇</div>
        <b>請選擇要精煉的裝備</b>
        <span>背包與目前穿戴中的可精煉裝備都會列在右側。</span>
      </div>`;
    const {selected,rule,chance} = ctx;
    const refine = integer(selected.instance.refine);
    const group = equipmentGroup(selected.data);
    const level = equipmentLevel(selected.data,group);
    return `
      <div class="refine-selected-card">
        <div class="refine-equipment-emblem"><img src="${esc(selected.data.icon || `images/items/${selected.data.id}.webp`)}" alt=""></div>
        <div class="refine-selected-copy">
          <small>${group === "Weapon" ? `武器 Lv.${level}` : `防具 Lv.${level}`} · ${selected.location === "equipment" ? "穿戴中" : "背包"}</small>
          <strong>${esc(equipmentInstanceName(selected.instance, selected.data))}</strong>
          <span>目前 +${refine} → 目標 +${refine + 1}</span>
        </div>
      </div>
      ${rule ? `<div class="refine-next-bonus">${esc(bonusDescription(selected.data,rule))}</div>` : `<div class="refine-next-bonus danger">已達精煉上限</div>`}
      ${chance ? `<div class="refine-risk-line">${esc(failureDescription(chance,state.useBlessing))}</div>` : ""}`;
  }

  function materialsHtml(ctx) {
    if (!ctx.selected || !ctx.rule) return `<div class="refine-material-placeholder">選擇裝備後顯示可用礦石</div>`;
    return ctx.chances.map((chance,index) => {
      const count = inventoryCount(chance.materialItemId);
      const selected = index === state.chanceIndex;
      return `<button type="button" class="refine-material-choice${selected?" selected":""}" onclick="selectRefineMaterial(${index})">
        <span class="refine-material-icon"><img src="${esc(itemData(chance.materialItemId)?.icon || `images/items/${chance.materialItemId}.webp`)}" alt=""></span>
        <span><b>${esc(materialName(chance))}</b><small>${chance.type} · 成功率 ${(number(chance.rate)/100).toFixed(2).replace(/\.00$/,"")}%</small></span>
        <em class="${count>0?"enough":"short"}">${count}/1</em>
      </button>`;
    }).join("");
  }

  function blessingHtml(ctx) {
    const need = Math.max(0, integer(ctx.rule?.blacksmithBlessingAmount));
    const count = inventoryCount(BLESSING_ID);
    const enabled = Boolean(ctx.selected && ctx.rule && need > 0);
    return `<button type="button" class="refine-blessing-slot${state.useBlessing&&enabled?" active":""}${enabled?"":" disabled"}" onclick="toggleRefineBlessing()" ${enabled?"":"disabled"}>
      <span class="refine-blessing-title">保護材料</span>
      <span class="refine-blessing-inner">
        ${state.useBlessing&&enabled ? `<img src="${esc(itemData(BLESSING_ID)?.icon || `images/items/${BLESSING_ID}.webp`)}" alt=""><b>鐵匠的祝福</b>` : `<span class="refine-blessing-plus">＋</span><b>${enabled?"點擊放入祝福":"目前階段不可使用"}</b>`}
      </span>
      <small>${enabled ? `持有 ${count}／需要 ${need}` : "可使用時紅框會亮起"}</small>
    </button>`;
  }

  function summaryHtml(ctx) {
    if (!ctx.selected || !ctx.rule || !ctx.chance) return `<div class="refine-summary-empty">尚未選擇精煉方案</div>`;
    const chance = ctx.chance;
    const price = Math.max(0, integer(chance.price));
    const oreCount = inventoryCount(chance.materialItemId);
    const blessingNeed = state.useBlessing ? Math.max(0, integer(ctx.rule.blacksmithBlessingAmount)) : 0;
    const blessingCount = inventoryCount(BLESSING_ID);
    const zeny = Math.max(0, integer(window.player?.zeny));
    const ok = oreCount >= 1 && blessingCount >= blessingNeed && zeny >= price;
    return `<div class="refine-summary-grid">
      <span>成功率</span><b>${(number(chance.rate)/100).toFixed(2).replace(/\.00$/,"")}%</b>
      <span>礦石</span><b class="${oreCount>=1?"ok":"bad"}">${esc(materialName(chance))} ${oreCount}/1</b>
      <span>祝福</span><b class="${blessingCount>=blessingNeed?"ok":"bad"}">${blessingNeed ? `${blessingCount}/${blessingNeed}` : "未使用"}</b>
      <span>費用</span><b class="${zeny>=price?"ok":"bad"}">${price.toLocaleString()} Zeny</b>
    </div>
    <button type="button" class="refine-submit" onclick="attemptSelectedRefine()" ${ok?"":"disabled"}>精煉</button>`;
  }

  function equipmentListHtml() {
    const rows = allCandidates();
    if (!rows.length) return `<div class="refine-equipment-empty">目前沒有可精煉的裝備。</div>`;
    return rows.map(row => {
      const active = state.selected && (state.selected.key === row.key || String(state.selected.instanceId) === String(row.instanceId));
      const group = equipmentGroup(row.data);
      const lv = equipmentLevel(row.data,group);
      return `<button type="button" class="refine-equipment-row${active?" selected":""}" onclick="selectRefineEquipment('${esc(row.key)}')">
        <img src="${esc(row.data.icon || `images/items/${row.data.id}.webp`)}" alt="">
        <span><b>${esc(equipmentInstanceName(row.instance,row.data))}</b><small>${row.location === "equipment" ? `穿戴中 · ${esc(row.slot)}` : "背包"} · ${group === "Weapon" ? "武器" : "防具"} Lv.${lv}</small></span>
        <em>+${integer(row.instance.refine)}</em>
      </button>`;
    }).join("");
  }

  function render() {
    if (typeof document === "undefined") return;
    const ctx = selectedContext();
    const selectedEl = document.getElementById("refineSelectedEquipment");
    const materialsEl = document.getElementById("refineMaterialChoices");
    const blessingEl = document.getElementById("refineBlessingHost");
    const summaryEl = document.getElementById("refineSummary");
    const listEl = document.getElementById("refineEquipmentList");
    const resultEl = document.getElementById("refineResultMessage");
    if (selectedEl) selectedEl.innerHTML = selectedHtml(ctx);
    if (materialsEl) materialsEl.innerHTML = materialsHtml(ctx);
    if (blessingEl) blessingEl.innerHTML = blessingHtml(ctx);
    if (summaryEl) summaryEl.innerHTML = summaryHtml(ctx);
    if (listEl) listEl.innerHTML = equipmentListHtml();
    if (resultEl) {
      resultEl.textContent = state.lastResult?.text || "";
      resultEl.className = `refine-result-message ${state.lastResult?.kind || ""}`;
    }
    const npcEl = document.getElementById("refineNpcName");
    if (npcEl) npcEl.textContent = state.npcName;
  }

  function openRefineWindow(npc = null) {
    const modal = typeof document !== "undefined" ? document.getElementById("refineWindow") : null;
    state.open = true;
    state.npcName = npc?.name || "斐揚精煉匠人";
    state.lastResult = null;
    state.skipBlessingPromptOnce = false;
    const rows = allCandidates();
    if (!resolveSelection() && rows.length) state.selected = { key:rows[0].key, location:rows[0].location, instanceId:rows[0].instanceId };
    if (modal) {
      modal.hidden = false;
      modal.classList.remove("hidden-window");
      document.body?.classList.add("refine-window-open");
    }
    render();
  }

  function closeRefineWindow() {
    const modal = typeof document !== "undefined" ? document.getElementById("refineWindow") : null;
    state.open = false;
    if (modal) {
      modal.hidden = true;
      modal.classList.add("hidden-window");
      document.body?.classList.remove("refine-window-open");
    }
  }

  function selectRefineEquipment(key) {
    const row = allCandidates().find(candidate => candidate.key === key);
    if (!row) return;
    state.selected = { key:row.key, location:row.location, instanceId:row.instanceId };
    state.chanceIndex = 0;
    state.useBlessing = false;
    state.lastResult = null;
    render();
  }

  function selectRefineMaterial(index) {
    const ctx = selectedContext();
    const next = Math.max(0, Math.min(ctx.chances?.length - 1 || 0, integer(index)));
    state.chanceIndex = next;
    state.lastResult = null;
    render();
  }

  function toggleRefineBlessing() {
    const ctx = selectedContext();
    const need = Math.max(0, integer(ctx.rule?.blacksmithBlessingAmount));
    if (!need) return;
    state.useBlessing = !state.useBlessing;
    state.lastResult = null;
    render();
  }

  function invalidateAndRefresh() {
    window.CardRuntime?.invalidate?.();
    window.syncEquipmentGrantedSkills?.();
    window.recalculatePlayerStats?.();
    window.updatePlayerUI?.();
    window.updateEquipmentUI?.();
    window.updateInventoryUI?.();
    window.saveGame?.();
  }

  function announce(text) {
    if (window.MvpGachaRuntime?.showRareBanner) window.MvpGachaRuntime.showRareBanner("red", text);
    else if (typeof window.showRareBanner === "function") window.showRareBanner("red", text);
  }

  function playerName() {
    return String(window.player?.playerId || window.player?.name || "冒險者").trim() || "冒險者";
  }

  function destroySelected(selected) {
    const id = String(selected.instanceId);
    if (selected.location === "inventory") {
      const list = window.player?.inventory || [];
      const index = list.findIndex(row => String(row?.instanceId || "") === id);
      if (index >= 0) list.splice(index,1);
    } else {
      window.player.equipment = window.player.equipment || {};
      window.player.equipmentInstances = window.player.equipmentInstances || {};
      for (const [slot,instance] of Object.entries(window.player.equipmentInstances)) {
        if (String(instance?.instanceId || "") === id) {
          window.player.equipment[slot] = null;
          delete window.player.equipmentInstances[slot];
        }
      }
    }
    state.selected = null;
  }

  function attemptSelectedRefine(options = {}) {
    const ctx = selectedContext();
    if (!ctx.selected || !ctx.rule || !ctx.chance) return false;
    const { selected, rule, chance } = ctx;
    const blessingNeed = state.useBlessing ? Math.max(0, integer(rule.blacksmithBlessingAmount)) : 0;
    const oreId = integer(chance.materialItemId);
    const price = Math.max(0, integer(chance.price));

    if (!state.useBlessing && integer(rule.blacksmithBlessingAmount) > 0 && !options.skipConfirm && typeof window.confirm === "function") {
      const proceed = window.confirm(`本階段可使用 ${rule.blacksmithBlessingAmount} 個鐵匠的祝福保護。\n未放入祝福，失敗將依材料規則損壞或退階。仍要繼續嗎？`);
      if (!proceed) return false;
    }
    if (inventoryCount(oreId) < 1) { state.lastResult={kind:"failure",text:`${materialName(chance)}不足。`}; render(); return false; }
    if (blessingNeed && inventoryCount(BLESSING_ID) < blessingNeed) { state.lastResult={kind:"failure",text:"鐵匠的祝福數量不足。"}; render(); return false; }
    if (integer(window.player?.zeny) < price) { state.lastResult={kind:"failure",text:"Zeny 不足。"}; render(); return false; }

    // Validate first, then consume as one transaction.
    if (!consumeStack(oreId,1)) return false;
    if (blessingNeed && !consumeStack(BLESSING_ID,blessingNeed)) return false;
    window.player.zeny = Math.max(0, integer(window.player.zeny) - price);

    const before = integer(selected.instance.refine);
    const successRoll = options.forceSuccess === true ? 0 : options.forceFailure === true ? 9999 : Math.floor(Math.random()*10000);
    const success = successRoll < integer(chance.rate);
    let text = "";
    let kind = "";

    if (success) {
      selected.instance.refine = Math.min(20, before + 1);
      text = `精煉成功！${equipmentInstanceName(selected.instance,selected.data)} 已提升至 +${selected.instance.refine}。`;
      kind = "success";
      if (rule.broadcastSuccess) announce(`玩家 ${playerName()} 將 ${selected.data.name} 精煉成功至 +${selected.instance.refine}`);
    } else if (blessingNeed > 0) {
      text = `精煉失敗，但鐵匠的祝福保護了 ${equipmentInstanceName(selected.instance,selected.data)}。`;
      kind = "protected";
    } else {
      const breakRoll = options.forceBreak === true ? 0 : options.forceNoBreak === true ? 9999 : Math.floor(Math.random()*10000);
      const broke = breakRoll < integer(chance.breakingRate);
      if (broke) {
        const oldName = equipmentInstanceName(selected.instance,selected.data);
        destroySelected(selected);
        text = `精煉失敗，${oldName} 已損壞消失。`;
        kind = "failure";
      } else {
        const downgrade = Math.max(0, integer(chance.downgradeAmount));
        selected.instance.refine = Math.max(0, before - downgrade);
        text = downgrade ? `精煉失敗，${selected.data.name} 降至 +${selected.instance.refine}。` : `精煉失敗，${selected.data.name} 的精煉值維持 +${before}。`;
        kind = "failure";
      }
      if (rule.broadcastFailure) announce(`玩家 ${playerName()} 精煉 ${selected.data.name} 至 +${rule.targetLevel} 失敗`);
    }

    state.lastResult = {kind,text};
    window.addBattleLog?.(text, success ? "item" : "system");
    invalidateAndRefresh();
    render();

    const forge = typeof document !== "undefined" ? document.querySelector(".refine-forge-panel") : null;
    if (forge) {
      forge.classList.remove("is-refine-success","is-refine-failure","is-refine-protected");
      void forge.offsetWidth;
      forge.classList.add(kind === "success" ? "is-refine-success" : kind === "protected" ? "is-refine-protected" : "is-refine-failure");
      window.setTimeout?.(() => forge.classList.remove("is-refine-success","is-refine-failure","is-refine-protected"),850);
    }
    return { success, kind, text, refine: selected.instance?.refine ?? null };
  }

  function refineBonusFor(data, refine) {
    const current = Math.max(0, Math.min(20, integer(refine)));
    if (!current) return {bonus:0,randomBonus:0,rule:null};
    const rule = profileFor(data)?.refineLevels?.[String(current)] || null;
    return {bonus:number(rule?.bonus)/100, randomBonus:number(rule?.randomBonus)/100, rule};
  }

  // Status-system decoration: applies exact cumulative RA bonuses and level-5/level-2 traits.
  function decorateStatusSource(slot, baseItem) {
    if (!baseItem) return baseItem;
    const instance = window.player?.equipmentInstances?.[slot] || null;
    const refine = Math.max(0, integer(instance?.refine));
    if (!refine || !isRefineable(baseItem)) return baseItem;
    const group = equipmentGroup(baseItem);
    const level = equipmentLevel(baseItem,group);
    const {bonus} = refineBonusFor(baseItem,refine);
    const out = {...baseItem, refine};
    if (group === "Weapon") {
      out.atk = number(baseItem.atk ?? baseItem.Attack) + bonus;
      out.Attack = out.atk;
      const sub = String(baseItem.subCategory || baseItem.dbSubType || "").toLowerCase();
      if (sub !== "bow") {
        out.matk = number(baseItem.matk ?? baseItem.Matk) + bonus;
        out.Matk = out.matk;
      }
      if (level === 5) {
        out.pAtk = number(baseItem.pAtk) + refine * 2;
        out.sMatk = number(baseItem.sMatk) + refine * 2;
      }
    } else if (group === "Armor") {
      out.def = number(baseItem.def ?? baseItem.Defense) + bonus;
      out.Defense = out.def;
      if (level === 2) {
        out.res = number(baseItem.res) + refine * 2;
        out.mres = number(baseItem.mres) + refine * 2;
        out.resFlat = number(baseItem.resFlat) + refine * 2;
        out.mresFlat = number(baseItem.mresFlat) + refine * 2;
      }
    }
    return out;
  }

  // Damage-pipeline decoration: makes the equipped instance refine level and exact RA weapon bonus visible.
  function decorateCombatItem(slot, baseItem) {
    if (!baseItem) return baseItem;
    const actualSlot = slot === "leftWeapon" && !window.player?.equipmentInstances?.leftWeapon ? "shield" : slot;
    const instance = window.player?.equipmentInstances?.[actualSlot] || null;
    const refine = Math.max(0, integer(instance?.refine));
    if (!refine) return baseItem;
    const result = refineBonusFor(baseItem,refine);
    return {...baseItem, refine, Refine:refine, refineAtkBonus:result.bonus, refineRandomBonusMax:result.randomBonus};
  }

  function getEquippedRefine(slot) {
    return Math.max(0, integer(window.player?.equipmentInstances?.[slot]?.refine));
  }

  window.RefineRuntime = {
    version: VERSION,
    state,
    rules,
    equipmentGroup,
    equipmentLevel,
    isRefineable,
    profileFor,
    targetRule,
    refineBonusFor,
    decorateStatusSource,
    decorateCombatItem,
    getEquippedRefine,
    getCandidates: allCandidates,
    inventoryCount,
    render,
    attemptSelectedRefine
  };
  window.openRefineWindow = openRefineWindow;
  window.closeRefineWindow = closeRefineWindow;
  window.selectRefineEquipment = selectRefineEquipment;
  window.selectRefineMaterial = selectRefineMaterial;
  window.toggleRefineBlessing = toggleRefineBlessing;
  window.attemptSelectedRefine = attemptSelectedRefine;
})();
