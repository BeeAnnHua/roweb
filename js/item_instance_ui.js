//=======================================
// ItemInstanceUI v0.9.82EW
// RO client-style equipment names, item/card detail modal, and instance-safe equip flow.
//=======================================
(function () {
  'use strict';

  const original = {
    normalizePlayerData: window.normalizePlayerData,
    getItemData: window.getItemData,
    addItem: window.addItem,
    showItemInfo: window.showItemInfo,
    closeItemInfo: window.closeItemInfo,
    buildItemTooltip: window.buildItemTooltip,
    buildEquipmentTooltip: window.buildEquipmentTooltip,
    handleInventorySlotClick: window.handleInventorySlotClick,
    setEquipmentSlot: window.setEquipmentSlot,
    equipItem: window.equipItem,
    moveEquipmentSlotToInventory: window.moveEquipmentSlotToInventory,
    fixEquippedItemsInInventoryOnce: window.fixEquippedItemsInInventoryOnce,
    addItemBackToInventory: window.addItemBackToInventory,
    useItem: window.useItem
  };

  const DOUBLE_CLICK_WINDOW_MS = 420;
  const SINGLE_CLICK_DELAY_MS = 440;
  let instanceSequence = 0;
  let inventoryTap = { key: '', at: 0, timer: null };
  const equipmentTap = new Map();

  function baseItemId(value) {
    if (value && typeof value === 'object') return normalizeItemId(value.id ?? value.itemId ?? value.officialId);
    return normalizeItemId(value);
  }

  function getBaseItemData(value) {
    return original.getItemData ? original.getItemData(baseItemId(value)) : null;
  }

  function makeInstanceId(itemId) {
    instanceSequence += 1;
    return `itm_${String(itemId)}_${Date.now().toString(36)}_${instanceSequence.toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function normalizeCardIds(value) {
    const source = Array.isArray(value) ? value : [];
    const out = source.slice(0, 4).map(id => {
      const normalized = baseItemId(id);
      return normalized === null || normalized === undefined || normalized === '' || Number(normalized) === 0 ? null : normalized;
    });
    while (out.length < 4) out.push(null);
    return out;
  }

  function normalizeEnchantRows(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(Boolean).map((row, index) => {
      if (typeof row === 'string' || typeof row === 'number') return { id: row, name: String(row), order: index };
      return { ...row, id: row.id ?? row.optionId ?? row.key ?? index, name: row.name ?? row.displayName ?? row.title ?? String(row.id ?? index), order: Number(row.order ?? index) };
    });
  }

  function normalizeEquipmentInstance(raw, itemData = null) {
    const source = raw && typeof raw === 'object' ? raw : { id: raw };
    const id = baseItemId(source);
    const data = itemData || getBaseItemData(id);
    return {
      id,
      itemId: id,
      name: source.name || data?.name || String(id),
      count: 1,
      locked: Boolean(source.locked),
      instanceId: String(source.instanceId || source.uid || makeInstanceId(id)),
      identified: source.identified !== false,
      refine: Math.max(0, Math.min(20, Math.floor(Number(source.refine ?? source.refineLevel ?? 0) || 0))),
      broken: Boolean(source.broken || source.isBroken),
      cards: normalizeCardIds(source.cards ?? source.cardIds ?? source.socketedCards),
      enchants: normalizeEnchantRows(source.enchants ?? source.randomOptions ?? source.options),
      createdAt: Number(source.createdAt || Date.now())
    };
  }

  function isEquipmentData(itemData) {
    return String(itemData?.type || '').toLowerCase() === 'equipment';
  }

  function getEquipmentInstance(slot) {
    if (!window.player) return null;
    player.equipmentInstances = player.equipmentInstances && typeof player.equipmentInstances === 'object' ? player.equipmentInstances : {};
    const current = player.equipmentInstances[slot];
    if (current) return normalizeEquipmentInstance(current, getBaseItemData(current));
    const id = player.equipment?.[slot];
    if (!id) return null;
    const instance = normalizeEquipmentInstance(id, getBaseItemData(id));
    player.equipmentInstances[slot] = instance;
    return instance;
  }

  function findInventoryInstance(instanceOrId) {
    if (!Array.isArray(player?.inventory)) return null;
    if (instanceOrId && typeof instanceOrId === 'object' && instanceOrId.instanceId) {
      return player.inventory.find(row => String(row.instanceId || '') === String(instanceOrId.instanceId)) || null;
    }
    const raw = String(instanceOrId ?? '');
    return player.inventory.find(row => String(row.instanceId || '') === raw) || player.inventory.find(row => String(row.id) === raw) || null;
  }

  function removeInventoryInstance(instance) {
    if (!Array.isArray(player?.inventory) || !instance) return false;
    const index = player.inventory.findIndex(row => String(row.instanceId || '') === String(instance.instanceId || ''));
    if (index < 0) return false;
    player.inventory.splice(index, 1);
    return true;
  }

  function normalizeAllItemInstances() {
    if (!window.player) return;
    const nextInventory = [];
    for (const raw of Array.isArray(player.inventory) ? player.inventory : []) {
      const id = baseItemId(raw);
      const data = getBaseItemData(id);
      const count = Math.max(1, Math.floor(Number(raw?.count || 1)));
      if (isEquipmentData(data)) {
        if (raw?.instanceId || count === 1) {
          nextInventory.push(normalizeEquipmentInstance(raw, data));
        } else {
          for (let i = 0; i < count; i += 1) nextInventory.push(normalizeEquipmentInstance({ ...raw, count: 1, instanceId: null }, data));
        }
      } else {
        nextInventory.push({ ...raw, id, count, locked: Boolean(raw?.locked) });
      }
    }
    player.inventory = nextInventory;

    player.equipment = { ...DEFAULT_EQUIPMENT, ...(player.equipment || {}) };
    player.equipmentInstances = player.equipmentInstances && typeof player.equipmentInstances === 'object' ? player.equipmentInstances : {};
    for (const slot of Object.keys(DEFAULT_EQUIPMENT)) {
      const rawSlot = player.equipment[slot];
      const existing = player.equipmentInstances[slot];
      const source = existing || (rawSlot && typeof rawSlot === 'object' ? rawSlot : rawSlot);
      if (!source) {
        player.equipment[slot] = null;
        delete player.equipmentInstances[slot];
        continue;
      }
      const instance = normalizeEquipmentInstance(source, getBaseItemData(source));
      // Legacy saves stored socketed card IDs outside the equipment item itself.
      // Migrate them only when the new instance has no cards, then keep the instance
      // as the single source of truth from this version onward.
      if (!instance.cards.some(Boolean)) {
        const legacyCards = player.equipmentCards?.[slot]
          ?? player.socketedCards?.[slot]
          ?? player.equippedCards?.[slot]
          ?? null;
        if (Array.isArray(legacyCards) && legacyCards.some(Boolean)) {
          instance.cards = normalizeCardIds(legacyCards);
        }
      }
      player.equipment[slot] = instance.id;
      player.equipmentInstances[slot] = instance;
    }
    player.itemInstanceSchemaVersion = 1;
  }

  if (typeof original.normalizePlayerData === 'function') {
    normalizePlayerData = function () {
      original.normalizePlayerData();
      normalizeAllItemInstances();
    };
  }

  getItemData = function (value) {
    return getBaseItemData(value);
  };

  function getDisplayTables() {
    return window.RO_CLIENT_ITEM_DISPLAY || window.clientItemDisplayData || {
      duplicateCardPrefixes: { '2': '兩倍', '3': '三倍', '4': '四倍' },
      cardPrefixNames: {}, cardPostfixIds: [], cardItemAliases: {}, cardInfo: {}
    };
  }

  function getCardInfo(cardId) {
    const id = String(baseItemId(cardId));
    const item = getBaseItemData(id);
    const client = getDisplayTables().cardInfo?.[id] || {};
    return {
      ...client,
      ...item,
      id: Number(id),
      officialId: Number(id),
      name: item?.name || client?.name || `卡片 ${id}`,
      type: 'card',
      icon: item?.icon || `images/items/${id}.webp`,
      description: Array.isArray(item?.description) ? item.description : (client?.description || [])
    };
  }

  function stripCardSuffix(name) {
    return String(name || '').replace(/卡片$/u, '').trim();
  }

  function getCardTitle(cardId) {
    const tables = getDisplayTables();
    const id = String(baseItemId(cardId));
    const explicit = String(tables.cardPrefixNames?.[id] || tables.cardItemAliases?.[id] || '').trim();
    if (explicit) return explicit;
    const base = stripCardSuffix(getCardInfo(id).name);
    return base ? `${base}的` : `卡片${id}的`;
  }

  function getEnchantTitle(enchant) {
    const raw = String(enchant?.displayName ?? enchant?.name ?? enchant?.title ?? '').trim();
    if (!raw) return '';
    return /的$/u.test(raw) ? raw : `${raw}的`;
  }

  function getEquipmentSlotCount(itemData) {
    return Math.max(0, Math.min(4, Math.floor(Number(itemData?.slotCount ?? itemData?.slots ?? itemData?.Slots ?? 0) || 0)));
  }

  function buildEquipmentInstanceName(instanceOrId, itemData = null) {
    const data = itemData || getBaseItemData(instanceOrId);
    if (!data) return String(baseItemId(instanceOrId) || '未知道具');
    const instance = normalizeEquipmentInstance(instanceOrId, data);
    const tables = getDisplayTables();
    const postfix = new Set((tables.cardPostfixIds || []).map(String));
    const slotCount = getEquipmentSlotCount(data);
    const nativeCards = instance.cards.slice(0, slotCount).filter(Boolean).map(id => String(baseItemId(id)));
    const groups = [];
    for (const id of nativeCards) {
      let group = groups.find(row => row.id === id);
      if (!group) { group = { id, count: 0 }; groups.push(group); }
      group.count += 1;
    }
    const prefixTitles = [];
    const postfixTitles = [];
    for (const group of groups) {
      const multiplier = group.count > 1 ? String(tables.duplicateCardPrefixes?.[String(Math.min(4, group.count))] || '') : '';
      const title = `${multiplier}${getCardTitle(group.id)}`;
      (postfix.has(group.id) ? postfixTitles : prefixTitles).push(title);
    }
    for (const enchant of instance.enchants) {
      const title = getEnchantTitle(enchant);
      if (title) prefixTitles.push(title);
    }
    const refine = instance.refine > 0 ? `+${instance.refine} ` : '';
    const before = prefixTitles.length ? `${prefixTitles.join(' ')} ` : '';
    const after = postfixTitles.length ? ` ${postfixTitles.join(' ')}` : '';
    return `${refine}${before}${data.name}${after} [${slotCount}]`.replace(/\s+/g, ' ').trim();
  }

  function buildCompactItemName(instanceOrItem, itemData = null) {
    const data = itemData || getBaseItemData(instanceOrItem);
    if (!data) return '找不到物品資料';
    if (isEquipmentData(data)) return buildEquipmentInstanceName(instanceOrItem, data);
    return data.name || String(baseItemId(instanceOrItem));
  }

  buildItemTooltip = function (item, itemData) {
    if (!itemData) return '找不到物品資料。';
    if (isEquipmentData(itemData)) return buildEquipmentInstanceName(item, itemData);
    return itemData.name || getItemName(item?.id);
  };

  buildEquipmentTooltip = function (slot, itemData) {
    if (!itemData) return `${getEquipmentSlotName(slot)}\n無`;
    return buildEquipmentInstanceName(getEquipmentInstance(slot) || itemData, itemData);
  };

  function clearElement(element) {
    while (element?.firstChild) element.removeChild(element.firstChild);
  }

  function appendTextLine(parent, text, className = '') {
    const row = document.createElement('div');
    row.className = className;
    row.textContent = text;
    parent.appendChild(row);
    return row;
  }

  function closeItemDetailModal() {
    document.getElementById('item-detail-modal')?.classList.add('hidden-window');
  }

  function renderCardDetail(cardId) {
    const card = getCardInfo(cardId);
    const modal = document.getElementById('item-detail-modal');
    const title = document.getElementById('item-detail-title');
    const body = document.getElementById('item-detail-body');
    if (!modal || !title || !body) return;
    title.textContent = card.name;
    clearElement(body);
    const top = document.createElement('div');
    top.className = 'item-detail-top';
    const icon = document.createElement('img');
    icon.className = 'item-detail-main-icon card-detail-icon';
    icon.src = card.icon || `images/items/${card.id}.webp`;
    icon.alt = card.name;
    icon.onerror = () => { icon.style.display = 'none'; };
    top.appendChild(icon);
    const summary = document.createElement('div');
    summary.className = 'item-detail-summary';
    appendTextLine(summary, card.name, 'item-detail-name');
    appendTextLine(summary, '類型：卡片', 'item-detail-meta');
    appendTextLine(summary, `卡片 ID：${card.id}`, 'item-detail-meta');
    top.appendChild(summary);
    body.appendChild(top);
    const desc = document.createElement('div');
    desc.className = 'item-detail-description';
    const lines = typeof cleanItemDescriptionLines === 'function' ? cleanItemDescriptionLines(card) : (card.description || []);
    (lines.length ? lines : ['目前沒有卡片能力說明。']).forEach(line => appendTextLine(desc, typeof stripROColorCodesForCheck === 'function' ? stripROColorCodesForCheck(line) : line));
    body.appendChild(desc);
    modal.classList.remove('hidden-window');
  }

  function showItemDetail(instanceOrId, context = {}) {
    const data = getBaseItemData(instanceOrId);
    if (!data) return;
    if (String(data.type) === 'card') { renderCardDetail(data.id); return; }
    const modal = document.getElementById('item-detail-modal');
    const title = document.getElementById('item-detail-title');
    const body = document.getElementById('item-detail-body');
    if (!modal || !title || !body) return;
    const instance = isEquipmentData(data) ? normalizeEquipmentInstance(instanceOrId, data) : instanceOrId;
    const displayName = buildCompactItemName(instance, data);
    title.textContent = displayName;
    clearElement(body);

    const top = document.createElement('div');
    top.className = 'item-detail-top';
    const icon = document.createElement('img');
    icon.className = 'item-detail-main-icon';
    icon.src = data.icon || `images/items/${data.officialId || data.id}.webp`;
    icon.alt = displayName;
    icon.onerror = () => { icon.style.display = 'none'; };
    top.appendChild(icon);
    const summary = document.createElement('div');
    summary.className = 'item-detail-summary';
    appendTextLine(summary, displayName, 'item-detail-name');
    appendTextLine(summary, `類型：${getItemTypeText(data)}`, 'item-detail-meta');
    if (Number(data.atk || data.Attack || 0)) appendTextLine(summary, `ATK：${Number(data.atk || data.Attack)}`, 'item-detail-meta');
    if (Number(data.def || data.Defense || 0)) appendTextLine(summary, `DEF：${Number(data.def || data.Defense)}`, 'item-detail-meta');
    if (Number(data.matk || 0)) appendTextLine(summary, `MATK：${Number(data.matk)}`, 'item-detail-meta');
    if (Number(data.mdef || data.MagicDefense || 0)) appendTextLine(summary, `MDEF：${Number(data.mdef || data.MagicDefense)}`, 'item-detail-meta');
    if (Number(data.weaponLevel || data.WeaponLevel || 0)) appendTextLine(summary, `武器等級：${Number(data.weaponLevel || data.WeaponLevel)}`, 'item-detail-meta');
    if (isEquipmentData(data)) appendTextLine(summary, `精煉：+${Number(instance.refine || 0)}${instance.broken ? '（已損壞）' : ''}`, 'item-detail-meta');
    top.appendChild(summary);
    body.appendChild(top);

    const desc = document.createElement('div');
    desc.className = 'item-detail-description';
    const lines = typeof cleanItemDescriptionLines === 'function' ? cleanItemDescriptionLines(data) : (data.description || []);
    (lines.length ? lines : ['目前沒有物品說明。']).forEach(line => appendTextLine(desc, typeof stripROColorCodesForCheck === 'function' ? stripROColorCodesForCheck(line) : line));
    body.appendChild(desc);

    if (isEquipmentData(data)) {
      const slotCount = getEquipmentSlotCount(data);
      const socketSection = document.createElement('section');
      socketSection.className = 'item-detail-socket-section';
      appendTextLine(socketSection, `卡片插槽 [${slotCount}]`, 'item-detail-section-title');
      const grid = document.createElement('div');
      grid.className = 'item-detail-socket-grid';
      if (slotCount === 0) appendTextLine(grid, '此裝備沒有卡片插槽。', 'item-detail-empty');
      for (let i = 0; i < slotCount; i += 1) {
        const cardId = instance.cards[i];
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = `item-detail-socket ${cardId ? 'filled' : 'empty'}`;
        if (cardId) {
          const card = getCardInfo(cardId);
          cell.dataset.tooltip = card.name;
          const cardIcon = document.createElement('img');
          cardIcon.src = card.icon || `images/items/${cardId}.webp`;
          cardIcon.alt = card.name;
          cardIcon.onerror = () => { cardIcon.style.display = 'none'; };
          cell.appendChild(cardIcon);
          const label = document.createElement('span'); label.textContent = card.name; cell.appendChild(label);
          cell.addEventListener('click', event => { event.stopPropagation(); renderCardDetail(cardId); });
        } else {
          cell.dataset.tooltip = `空插槽 ${i + 1}`;
          cell.innerHTML = `<span class="socket-hole-mark">◇</span><small>空插槽 ${i + 1}</small>`;
        }
        grid.appendChild(cell);
      }
      socketSection.appendChild(grid);
      body.appendChild(socketSection);

      if (instance.enchants.length) {
        const enchantSection = document.createElement('section');
        enchantSection.className = 'item-detail-enchant-section';
        appendTextLine(enchantSection, '附魔', 'item-detail-section-title');
        instance.enchants.forEach(enchant => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'item-detail-enchant';
          button.textContent = enchant.name;
          button.dataset.tooltip = enchant.name;
          button.addEventListener('click', () => {
            title.textContent = enchant.name;
            clearElement(body);
            appendTextLine(body, enchant.name, 'item-detail-name');
            appendTextLine(body, enchant.description || enchant.effectText || '附魔能力資料尚未匯入。', 'item-detail-description');
          });
          enchantSection.appendChild(button);
        });
        body.appendChild(enchantSection);
      }
    }
    modal.classList.remove('hidden-window');
  }

  showItemInfo = function (itemOrId, context = {}) {
    showItemDetail(itemOrId, context);
  };
  closeItemInfo = closeItemDetailModal;

  function scheduleInventoryEquipmentAction(item, itemData) {
    const key = String(item.instanceId || item.id);
    const now = Date.now();
    const isDouble = inventoryTap.key === key && now - inventoryTap.at <= DOUBLE_CLICK_WINDOW_MS;
    if (isDouble) {
      if (inventoryTap.timer) clearTimeout(inventoryTap.timer);
      inventoryTap = { key: '', at: 0, timer: null };
      equipItem(itemData, item);
      return;
    }
    if (inventoryTap.timer) clearTimeout(inventoryTap.timer);
    inventoryTap.key = key;
    inventoryTap.at = now;
    inventoryTap.timer = setTimeout(() => {
      if (inventoryTap.key === key) showItemDetail(item, { source: 'inventory' });
      inventoryTap = { key: '', at: 0, timer: null };
    }, SINGLE_CLICK_DELAY_MS);
  }

  handleInventorySlotClick = function (item, itemData) {
    if (!item || !itemData) return;
    if (typeof hideGameTooltip === 'function') hideGameTooltip();
    if (inventoryLockMode) {
      item.locked = !item.locked;
      addBattleLog(`${itemData.name} 已${item.locked ? '鎖定' : '解除鎖定'}。`);
      updateInventoryUI(); saveGame(); return;
    }
    if (isEquipmentData(itemData)) { scheduleInventoryEquipmentAction(item, itemData); return; }
    if (String(itemData.type) === 'card') { showItemDetail(item, { source: 'inventory' }); return; }
    if (String(itemData.type) === 'consume') { original.useItem?.(item.id); return; }
    showItemDetail(item, { source: 'inventory' });
  };

  function removeInventoryByIdForLegacy(itemId) {
    const index = player.inventory.findIndex(row => String(row.id) === String(itemId));
    if (index < 0) return false;
    const row = player.inventory[index];
    if (row.instanceId || isEquipmentData(getBaseItemData(row.id))) player.inventory.splice(index, 1);
    else {
      row.count = Number(row.count || 0) - 1;
      if (row.count <= 0) player.inventory.splice(index, 1);
    }
    return true;
  }

  fixEquippedItemsInInventoryOnce = function () {
    if (!player?.inventory || !player?.equipment || player.fixedEquippedInventoryV1) return;
    for (const value of Object.values(player.equipment)) {
      if (!value) continue;
      removeInventoryByIdForLegacy(baseItemId(value));
    }
    player.fixedEquippedInventoryV1 = true;
  };

  moveEquipmentSlotToInventory = function (slot, options = {}) {
    if (!player?.equipment) return null;
    const id = player.equipment[slot];
    if (!id) return null;
    const data = getBaseItemData(id);
    const instance = getEquipmentInstance(slot) || normalizeEquipmentInstance(id, data);
    player.equipment[slot] = null;
    if (player.equipmentInstances) delete player.equipmentInstances[slot];
    if (data) {
      player.inventory.push({ ...instance, count: 1 });
      if (!options.silent) addBattleLog(`卸下了 ${buildEquipmentInstanceName(instance, data)}`);
    }
    return data;
  };

  addItemBackToInventory = function (itemOrInstance) {
    const data = getBaseItemData(itemOrInstance);
    if (!data) return;
    if (isEquipmentData(data)) player.inventory.push(normalizeEquipmentInstance(itemOrInstance, data));
    else {
      const existing = findInventoryItemById(data.id);
      if (existing) existing.count += 1;
      else player.inventory.push({ id: data.id, name: data.name, count: 1, locked: false });
    }
    addBattleLog(`卸下了 ${buildCompactItemName(itemOrInstance, data)}`);
  };

  equipItem = function (itemData, requestedInstance = null) {
    if (typeof hideGameTooltip === 'function') hideGameTooltip();
    const equipCheck = canEquipItem(itemData);
    if (!equipCheck.ok) { addBattleLog(`${itemData.name}：${equipCheck.reason}`); return; }
    const slot = resolveEquipmentTargetSlot(itemData);
    if (!slot) { addBattleLog(`${itemData.name} 沒有可用的裝備位置。`); return; }
    const inventoryInstance = findInventoryInstance(requestedInstance?.instanceId || requestedInstance || itemData.id);
    if (!inventoryInstance) { addBattleLog(`背包裡沒有 ${itemData.name}。`); return; }

    const conflictSlots = [];
    if (slot === 'weapon') {
      if (isTwoHandedWeaponItem(itemData) && player.equipment.shield) conflictSlots.push('shield');
      const offhand = player.equipment.shield ? getBaseItemData(player.equipment.shield) : null;
      if (offhand && isWeaponEquipmentItem(offhand) && !isAssassinOffhandWeaponItem(itemData)) conflictSlots.push('shield');
    } else if (slot === 'shield' && player.equipment.weapon) {
      const main = getBaseItemData(player.equipment.weapon);
      if (isTwoHandedWeaponItem(main)) conflictSlots.push('weapon');
    }
    if (player.equipment[slot]) conflictSlots.push(slot);
    [...new Set(conflictSlots)].forEach(conflict => moveEquipmentSlotToInventory(conflict));

    const instance = normalizeEquipmentInstance(inventoryInstance, itemData);
    if (!removeInventoryInstance(inventoryInstance)) { addBattleLog(`找不到 ${itemData.name} 的裝備實例。`); return; }
    player.equipment[slot] = itemData.id;
    player.equipmentInstances = player.equipmentInstances || {};
    player.equipmentInstances[slot] = instance;
    normalizeEquipmentHandConflicts();
    if (typeof syncEquipmentGrantedSkills === 'function') syncEquipmentGrantedSkills();
    recalculatePlayerStats();
    if (['weapon', 'shield'].includes(slot) && typeof syncROStudioWeaponTypeFromEquipment === 'function') syncROStudioWeaponTypeFromEquipment();
    addBattleLog(`裝備了 ${buildEquipmentInstanceName(instance, itemData)}${slot === 'shield' && isWeaponEquipmentItem(itemData) ? '（副手）' : ''}`);
    updatePlayerUI(); updateEquipmentUI(); updateInventoryUI(); saveGame();
  };

  useItem = function (itemId, instance = null) {
    const data = getBaseItemData(itemId);
    if (!data) { addBattleLog(`找不到物品資料：${baseItemId(itemId)}`); return; }
    if (isEquipmentData(data)) { equipItem(data, instance || itemId); return; }
    return original.useItem?.(baseItemId(itemId));
  };

  addItem = function (item, count = 1) {
    const normalized = { ...item, id: baseItemId(item) };
    const data = getBaseItemData(normalized.id) || normalized;
    const amount = Math.max(1, Math.floor(Number(count || 1)));
    if (!player.inventory) player.inventory = [];
    if (isEquipmentData(data)) {
      for (let i = 0; i < amount; i += 1) player.inventory.push(normalizeEquipmentInstance({ ...normalized, count: 1, instanceId: null }, data));
    } else {
      const existing = findInventoryItemById(normalized.id);
      if (existing) existing.count += amount;
      else player.inventory.push({ id: normalized.id, name: normalized.name || data.name, count: amount, locked: false });
    }
    if (window.RO_WEB_REWARD_BATCH_ACTIVE) {
      if (typeof emitRewardAwareLog === 'function') emitRewardAwareLog(`獲得道具：${data.name || normalized.name} x ${amount}`, 'item');
      if (typeof markRewardBatchDirty === 'function') markRewardBatchDirty('inventory');
      return;
    }
    addBattleLog(`獲得道具：${data.name || normalized.name} x ${amount}`);
    updateInventoryUI(); saveGame();
  };

  setEquipmentSlot = function (slot, elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;
    element.innerHTML = '';
    element.classList.remove('has-item', 'is-two-hand-mirror', 'is-offhand-weapon');
    element.style.backgroundImage = '';
    element.dataset.slotName = getEquipmentSlotName(slot);
    let itemId = player.equipment[slot];
    let displaySlot = slot;
    let isTwoHandMirror = false;
    if (slot === 'shield' && !itemId) {
      const main = player.equipment.weapon ? getBaseItemData(player.equipment.weapon) : null;
      if (isTwoHandedWeaponItem(main)) { itemId = player.equipment.weapon; displaySlot = 'weapon'; isTwoHandMirror = true; }
    }
    const data = itemId ? getBaseItemData(itemId) : null;
    const instance = data ? getEquipmentInstance(displaySlot) : null;
    element.dataset.tooltip = data ? buildEquipmentInstanceName(instance || data, data) : `${getEquipmentSlotName(slot)}\n無`;
    element.onclick = null;
    if (!data) { element.setAttribute('aria-label', `${getEquipmentSlotName(slot)}：無`); return; }
    element.classList.add('has-item');
    if (isTwoHandMirror) element.classList.add('is-two-hand-mirror');
    if (slot === 'shield' && isWeaponEquipmentItem(data) && !isTwoHandMirror) element.classList.add('is-offhand-weapon');
    element.setAttribute('aria-label', `${getEquipmentSlotName(slot)}：${buildEquipmentInstanceName(instance || data, data)}`);
    const img = document.createElement('img');
    img.src = data.icon || `images/items/${data.officialId || data.id}.webp`; img.alt = data.name;
    img.onerror = () => { img.style.display = 'none'; };
    element.appendChild(img);
    element.onclick = function () {
      if (typeof hideGameTooltip === 'function') hideGameTooltip();
      const key = displaySlot;
      const now = Date.now();
      const previous = equipmentTap.get(key) || { at: 0, timer: null };
      if (now - previous.at <= DOUBLE_CLICK_WINDOW_MS) {
        if (previous.timer) clearTimeout(previous.timer);
        equipmentTap.delete(key);
        unequipItem(displaySlot);
        return;
      }
      if (previous.timer) clearTimeout(previous.timer);
      const timer = setTimeout(() => {
        showItemDetail(getEquipmentInstance(displaySlot) || data, { source: 'equipment', slot: displaySlot });
        equipmentTap.delete(key);
      }, SINGLE_CLICK_DELAY_MS);
      equipmentTap.set(key, { at: now, timer });
    };
    element.ondblclick = event => event?.preventDefault();
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('item-detail-close')?.addEventListener('click', closeItemDetailModal);
    document.getElementById('item-detail-modal')?.addEventListener('click', event => {
      if (event.target?.id === 'item-detail-modal') closeItemDetailModal();
    });
  });

  Object.assign(window, {
    normalizeEquipmentInstance,
    normalizeAllItemInstances,
    getEquipmentInstance,
    buildEquipmentInstanceName,
    buildCompactItemName,
    getCardInfo,
    showItemDetail,
    renderCardDetail,
    closeItemDetailModal,
    findInventoryInstance
  });
})();
