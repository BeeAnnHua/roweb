//=======================================
// ItemInstanceUI v0.9.82HM
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
      enchantGrade: Math.max(0, Math.min(4, Math.floor(Number(source.enchantGrade ?? source.grade ?? source.enchantGradeLevel ?? 0) || 0))),
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
    const id=String(baseItemId(cardId));
    const base=stripCardSuffix(getCardInfo(id).name);
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

  const EQUIPMENT_GRADE_LABELS = ['無階', 'D', 'C', 'B', 'A'];
  function getEquipmentGradeLabel(instance) {
    const index = Math.max(0, Math.min(4, Math.floor(Number(instance?.enchantGrade ?? instance?.grade ?? 0) || 0)));
    return EQUIPMENT_GRADE_LABELS[index] || '無階';
  }

  function buildEquipmentInstanceName(instanceOrId, itemData = null) {
    const data = itemData || getBaseItemData(instanceOrId);
    if (!data) return String(baseItemId(instanceOrId) || '未知道具');
    const instance = normalizeEquipmentInstance(instanceOrId, data);
    const slotCount = getEquipmentSlotCount(data);
    if (isDimGlacierEnchantWeapon(data)) {
      return `+${Number(instance.refine || 0)} [${getEquipmentGradeLabel(instance)}] ${data.name} [${slotCount}]`.replace(/\s+/g, ' ').trim();
    }
    const tables = getDisplayTables();
    const nativeCards = instance.cards.slice(0, slotCount).filter(Boolean).map(id => String(baseItemId(id)));
    const groups = [];
    for (const id of nativeCards) {
      let group = groups.find(row => row.id === id);
      if (!group) { group = { id, count: 0 }; groups.push(group); }
      group.count += 1;
    }
    const prefixTitles = [];
    for (const group of groups) {
      const multiplier = group.count > 1 ? String(tables.duplicateCardPrefixes?.[String(Math.min(4, group.count))] || '') : '';
      prefixTitles.push(`${multiplier}${getCardTitle(group.id)}`);
    }
    for (const enchant of instance.enchants) {
      const title = getEnchantTitle(enchant);
      if (title) prefixTitles.push(title);
    }
    const refine = instance.refine > 0 ? `+${instance.refine} ` : '';
    const before = prefixTitles.length ? `${prefixTitles.join(' ')} ` : '';
    return `${refine}${before}${data.name} [${slotCount}]`.replace(/\s+/g, ' ').trim();
  }

  function buildEquipmentHoverTooltip(instanceOrId, itemData = null) {
    const data = itemData || getBaseItemData(instanceOrId);
    if (!data) return String(baseItemId(instanceOrId) || '未知道具');
    const instance = normalizeEquipmentInstance(instanceOrId, data);
    const header = buildEquipmentInstanceName(instance, data);
    if (!isDimGlacierEnchantWeapon(data)) return header;

    const attachmentLabels = [];
    const details = [];
    const cardId = (instance.cards || []).find(Boolean);
    if (cardId) {
      const cardName = getCardInfo(cardId)?.name || `卡片 ${cardId}`;
      attachmentLabels.push(`[卡片：${cardName}]`);
      details.push(`卡片：${cardName}`);
    }
    for (const slot of [4, 3, 2]) {
      const info = getEnchantDisplayInfo((instance.enchants || []).find(row => Number(row?.slot ?? row?.playerSlot) === slot));
      if (!info?.name) continue;
      attachmentLabels.push(`[附魔${slot}：${info.name}]`);
      details.push(`第${slot}洞附魔：${info.name}`);
    }

    const prefix = `+${Number(instance.refine || 0)} [${getEquipmentGradeLabel(instance)}]`;
    const richTitle = `${prefix}${attachmentLabels.length ? ` ${attachmentLabels.join(' ')}` : ''} ${data.name} [${getEquipmentSlotCount(data)}]`
      .replace(/\s+/g, ' ')
      .trim();
    return [richTitle, ...details].join('\n');
  }

  function buildCompactItemName(instanceOrItem, itemData = null) {
    const data = itemData || getBaseItemData(instanceOrItem);
    if (!data) return '找不到物品資料';
    if (isEquipmentData(data)) return buildEquipmentInstanceName(instanceOrItem, data);
    return data.name || String(baseItemId(instanceOrItem));
  }

  buildItemTooltip = function (item, itemData) {
    if (!itemData) return '找不到物品資料。';
    if (isEquipmentData(itemData)) return buildEquipmentHoverTooltip(item, itemData);
    return itemData.name || getItemName(item?.id);
  };

  buildEquipmentTooltip = function (slot, itemData) {
    if (!itemData) return `${getEquipmentSlotName(slot)}\n無`;
    return buildEquipmentHoverTooltip(getEquipmentInstance(slot) || itemData, itemData);
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

  function resetItemDetailActions() {
    const actions = document.getElementById('item-detail-actions');
    const primary = document.getElementById('item-detail-primary-action');
    const decompose = document.getElementById('item-detail-decompose-action');
    const picker = document.getElementById('item-detail-quick-picker');
    if (actions) actions.hidden = true;
    if (primary) { primary.hidden = true; primary.disabled = false; primary.onclick = null; primary.title = ''; }
    if (decompose) { decompose.hidden = true; decompose.disabled = false; decompose.onclick = null; decompose.title = ''; }
    if (picker) { picker.hidden = true; picker.innerHTML = ''; }
  }

  function configureItemDecomposeAction(data, instance, context = {}) {
    const actions = document.getElementById('item-detail-actions');
    const decompose = document.getElementById('item-detail-decompose-action');
    if (!actions || !decompose || !data || context.source === 'storage') return;

    // 穿戴中的裝備必須先卸下；背包內的裝備、卡片、消耗品與雜物皆可由資料窗分解。
    if (context.source === 'equipment') {
      actions.hidden = false;
      decompose.hidden = false;
      decompose.disabled = true;
      decompose.textContent = '分解';
      decompose.title = '請先卸下裝備，再從背包中分解。';
      return;
    }
    if (context.source !== 'inventory') return;

    let inventoryItem = context.inventoryItem && typeof context.inventoryItem === 'object' ? context.inventoryItem : null;
    if (!inventoryItem || !player?.inventory?.includes(inventoryItem)) inventoryItem = findInventoryInstance(instance) || findInventoryInstance(data.id);
    const eligible = Boolean(inventoryItem && window.isInventoryItemDecomposeEligible?.(inventoryItem));
    actions.hidden = false;
    decompose.hidden = false;
    decompose.disabled = !eligible;
    decompose.textContent = '分解';
    decompose.title = eligible ? '選擇數量並確認分解' : '此物品已鎖定、正在穿戴或屬於受保護道具。';
    decompose.onclick = () => {
      if (!eligible || typeof window.openInventoryDecomposeDialog !== 'function') return;
      window.openInventoryDecomposeDialog({
        mode:'item',
        target:{
          itemRef:inventoryItem,
          instanceId:inventoryItem.instanceId || '',
          itemId:inventoryItem.id
        },
        itemName:buildCompactItemName(inventoryItem, data),
        defaultAmount:isEquipmentData(data) ? 1 : Math.min(100, Math.max(1, Number(inventoryItem.count || 1))),
        source:'item-detail'
      });
    };
  }

  function renderItemDetailActions(data, instance, context = {}) {
    resetItemDetailActions();
    const actions = document.getElementById('item-detail-actions');
    const primary = document.getElementById('item-detail-primary-action');
    const picker = document.getElementById('item-detail-quick-picker');
    if (!actions || !primary || !picker || !data) return;
    configureItemDecomposeAction(data, instance, context);
    // 0.9.82GH：倉庫中的物品只能查看資料；不可直接穿戴、使用或加入快捷欄。
    if (context.source === 'storage') return;

    if (isEquipmentData(data)) {
      actions.hidden = false;
      primary.hidden = false;
      if (context.source === 'equipment' && context.slot) {
        primary.textContent = '卸下';
        primary.onclick = () => {
          unequipItem(context.slot);
          closeItemDetailModal();
        };
      } else {
        const check = canEquipItem(data);
        primary.textContent = '穿戴';
        primary.disabled = !check.ok;
        primary.title = check.ok ? '穿戴此裝備' : String(check.reason || '目前無法穿戴');
        primary.onclick = () => {
          if (primary.disabled) return;
          equipItem(data, instance);
          closeItemDetailModal();
        };
      }
      return;
    }

    if (String(data.type) === 'consume') {
      actions.hidden = false;
      primary.hidden = false;
      primary.textContent = '使用';
      primary.onclick = () => {
        original.useItem?.(data.id);
        closeItemDetailModal();
      };
      picker.hidden = false;
      if (typeof window.renderQuickSlotPicker === 'function') {
        window.renderQuickSlotPicker(picker, { type: 'item', id: data.id }, { onAssigned: () => closeItemDetailModal() });
      } else {
        picker.textContent = '快捷欄系統載入中。';
      }
    }
  }

  function renderCardDetail(cardId, context = {}) {
    resetItemDetailActions();
    const card = getCardInfo(cardId);
    const modal = document.getElementById('item-detail-modal');
    const title = document.getElementById('item-detail-title');
    const body = document.getElementById('item-detail-body');
    if (!modal || !title || !body) return;
    modal.classList.remove('is-dim-glacier-detail');
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
    if(context.source==='inventory'&&window.CardRuntime){
      const actions=document.getElementById('item-detail-actions');
      const primary=document.getElementById('item-detail-primary-action');
      const picker=document.getElementById('item-detail-quick-picker');
      const candidates=window.CardRuntime.getSocketCandidates(card.id)||[];
      if(actions)actions.hidden=false;
      if(primary){primary.hidden=false;primary.textContent=candidates.length?'請選擇要插卡的裝備':'沒有可插入的裝備';primary.disabled=true;}
      if(picker){
        picker.hidden=false;picker.innerHTML='';picker.classList.add('card-socket-picker');
        for(const {instance,item} of candidates){
          const button=document.createElement('button');button.type='button';button.className='item-detail-socket-candidate';
          button.textContent=buildEquipmentInstanceName(instance,item);
          button.onclick=()=>{
            const result=window.CardRuntime.socketCard(card.id,instance.instanceId);
            if(typeof addBattleLog==='function')addBattleLog(result.ok?`${card.name} 已插入 ${buildEquipmentInstanceName(instance,item)}。`:`${card.name}：${result.reason||'插卡失敗'}`);
            if(result.ok)closeItemDetailModal();
          };
          picker.appendChild(button);
        }
      }
    }
    configureItemDecomposeAction(card, context.inventoryItem || cardId, context);
    modal.classList.remove('hidden-window');
  }


  function isDimGlacierEnchantWeapon(data) {
    const catalog=window.RO_WEB_DATA?.["data/dim_glacier_enchant.json"];
    return Array.isArray(catalog?.targetWeaponIds) && catalog.targetWeaponIds.map(Number).includes(Number(data?.id));
  }

  function getEnchantDisplayInfo(enchant) {
    if(!enchant)return null;
    const id=Number(enchant.id ?? enchant.optionId ?? 0);
    const runtime=window.DimGlacierEnchantRuntime?.getEnchantById?.(id) || window.CardRuntime?.getEnchantRecord?.(id) || null;
    return {
      ...runtime,
      ...enchant,
      id,
      name:enchant.name || runtime?.name || `附魔 ${id}`,
      effect:enchant.effect || enchant.effectText || runtime?.effectText || runtime?.effect || "附魔效果資料尚未載入。"
    };
  }

  function openEquipmentEnchantInfo(info, label) {
    if (!info) return false;
    if (typeof window.openEnchantStoneInfo === 'function') {
      window.openEnchantStoneInfo(info, label);
      return true;
    }
    const modal = document.getElementById('enchantStoneInfoWindow');
    if (!modal) return false;
    const title = document.getElementById('enchantStoneInfoTitle');
    const icon = document.getElementById('enchantStoneInfoIcon');
    const group = document.getElementById('enchantStoneInfoGroup');
    const description = document.getElementById('enchantStoneInfoDescription');
    if (title) title.textContent = info.name || '附魔資訊';
    if (icon) {
      icon.src = info.icon || `images/items/${info.id}.webp`;
      icon.alt = info.name || '附魔圖示';
    }
    if (group) group.textContent = label || '附魔資訊';
    if (description) description.textContent = info.effect || info.effectText || (Array.isArray(info.description) ? info.description.join('\n') : info.description) || '尚無說明。';
    modal.hidden = false;
    modal.classList.remove('hidden-window');
    return true;
  }

  function renderDimGlacierSlotGrid(body, instance) {
    const section=document.createElement('section');
    section.className='item-detail-dim-glacier-section';
    appendTextLine(section,'卡片／附魔洞位','item-detail-section-title');
    const grid=document.createElement('div');
    grid.className='item-detail-dim-glacier-grid';
    const cardId=(instance.cards||[]).find(Boolean);
    const card=cardId?getCardInfo(cardId):null;
    const rows=[
      {slot:1,label:'第1洞｜卡片',content:card?{id:cardId,name:card.name,effect:(card.description||[]).join('\n'),icon:card.icon}:null},
      {slot:4,label:'第4洞｜附魔',content:getEnchantDisplayInfo((instance.enchants||[]).find(x=>Number(x.slot??x.playerSlot)===4))},
      {slot:2,label:'第2洞｜附魔',content:getEnchantDisplayInfo((instance.enchants||[]).find(x=>Number(x.slot??x.playerSlot)===2))},
      {slot:3,label:'第3洞｜附魔',content:getEnchantDisplayInfo((instance.enchants||[]).find(x=>Number(x.slot??x.playerSlot)===3))}
    ];
    rows.forEach(row=>{
      const button=document.createElement('button');button.type='button';button.className=`item-detail-dim-slot slot-${row.slot} ${row.content?'filled':'empty'}`;
      const number=document.createElement('b');number.textContent=String(row.slot);button.appendChild(number);
      const kind=document.createElement('small');kind.className='item-detail-dim-slot-kind';kind.textContent=row.label;button.appendChild(kind);
      if(row.content){
        const img=document.createElement('img');img.src=row.content.icon||`images/items/${row.content.id}.webp`;img.alt=row.content.name;button.appendChild(img);
        const text=document.createElement('span');text.textContent=row.content.name;button.appendChild(text);button.dataset.tooltip=`${row.label}：${row.content.name}`;button.title=button.dataset.tooltip;
        button.addEventListener('click',event=>{
          event.stopPropagation();
          if(row.slot===1){renderCardDetail(row.content.id);return;}
          openEquipmentEnchantInfo(row.content,row.label);
        });
      }else{
        const mark=document.createElement('span');mark.className='socket-hole-mark';mark.textContent='◇';button.appendChild(mark);
        const text=document.createElement('span');text.textContent=row.slot===1?'尚未插卡':'尚未附魔';button.appendChild(text);button.disabled=true;
      }
      grid.appendChild(button);
    });
    section.appendChild(grid);body.appendChild(section);
  }

  function showItemDetail(instanceOrId, context = {}) {
    const data = getBaseItemData(instanceOrId);
    if (!data) return;
    if (String(data.type) === 'card') { renderCardDetail(data.id, { ...context, inventoryItem:context.inventoryItem || (context.source === 'inventory' ? instanceOrId : null) }); return; }
    const modal = document.getElementById('item-detail-modal');
    const title = document.getElementById('item-detail-title');
    const body = document.getElementById('item-detail-body');
    if (!modal || !title || !body) return;
    const instance = isEquipmentData(data) ? normalizeEquipmentInstance(instanceOrId, data) : instanceOrId;
    const displayName = buildCompactItemName(instance, data);
    modal.classList.toggle('is-dim-glacier-detail', Boolean(isEquipmentData(data) && isDimGlacierEnchantWeapon(data)));
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
    if (isEquipmentData(data) && isDimGlacierEnchantWeapon(data)) appendTextLine(summary, `裝備階級：[${getEquipmentGradeLabel(instance)}]｜卡片插槽：[${getEquipmentSlotCount(data)}]`, 'item-detail-meta');
    top.appendChild(summary);
    body.appendChild(top);

    const desc = document.createElement('div');
    desc.className = 'item-detail-description';
    const lines = typeof cleanItemDescriptionLines === 'function' ? cleanItemDescriptionLines(data) : (data.description || []);
    (lines.length ? lines : ['目前沒有物品說明。']).forEach(line => appendTextLine(desc, typeof stripROColorCodesForCheck === 'function' ? stripROColorCodesForCheck(line) : line));
    body.appendChild(desc);

    if (isEquipmentData(data)) {
      if (isDimGlacierEnchantWeapon(data)) {
        renderDimGlacierSlotGrid(body, instance);
      } else {
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
            cell.title = cell.dataset.tooltip;
            const cardIcon = document.createElement('img');
            cardIcon.src = card.icon || `images/items/${cardId}.webp`;
            cardIcon.alt = card.name;
            cardIcon.onerror = () => { cardIcon.style.display = 'none'; };
            cell.appendChild(cardIcon);
            const label = document.createElement('span'); label.textContent = card.name; cell.appendChild(label);
            cell.addEventListener('click', event => { event.stopPropagation(); renderCardDetail(cardId); });
          } else {
            cell.dataset.tooltip = `空插槽 ${i + 1}`;
            cell.title = cell.dataset.tooltip;
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
            const info=getEnchantDisplayInfo(enchant);
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'item-detail-enchant';
            button.textContent = info.name;
            button.dataset.tooltip = info.name;
            button.title = button.dataset.tooltip;
            button.addEventListener('click', event => { event.stopPropagation(); openEquipmentEnchantInfo(info,`第${info.slot??info.playerSlot??'?'}洞｜附魔`); });
            enchantSection.appendChild(button);
          });
          body.appendChild(enchantSection);
        }
      }
    }
    renderItemDetailActions(data, instance, { ...context, inventoryItem:context.inventoryItem || (context.source === 'inventory' ? instanceOrId : null) });
    modal.classList.remove('hidden-window');
    if (typeof window.ensureWindowSizeControl === 'function') window.ensureWindowSizeControl(modal.querySelector('.ui-size-target'));
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
    if (String(itemData.type) === 'consume') { showItemDetail(item, { source: 'inventory' }); return; }
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
    const removedSlotItemIsWeapon = data && isWeaponEquipmentItem(data);
    if ((slot === "weapon" || (slot === "shield" && removedSlotItemIsWeapon)) && typeof clearPhysicalElementEndow === "function") {
      clearPhysicalElementEndow(options.silent ? "weapon_change" : "weapon_unequip", { silent: options.silent === true });
    }
    player.equipment[slot] = null;
    if (player.equipmentInstances) delete player.equipmentInstances[slot];
    window.invalidateCardRuntime?.();
    window.invalidatePlayerUiRenderCaches?.("status");
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

    // 肯貝特附著於當下武器組合；裝備新的主手／刺客副手武器即解除。
    if ((slot === 'weapon' || (slot === 'shield' && isWeaponEquipmentItem(itemData))) && typeof clearPhysicalElementEndow === 'function') {
      clearPhysicalElementEndow('weapon_change');
    }

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
    window.invalidateCardRuntime?.();
    window.invalidatePlayerUiRenderCaches?.("status");
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
      if (!window.RO_WEB_SUPPRESS_REWARD_ADD_ITEM_LOG && typeof emitRewardAwareLog === 'function') emitRewardAwareLog(`獲得道具：${data.name || normalized.name} x ${amount}`, 'item');
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
    element.dataset.tooltip = data ? buildEquipmentHoverTooltip(instance || data, data) : `${getEquipmentSlotName(slot)}\n無`;
    element.title = element.dataset.tooltip;
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
    buildEquipmentHoverTooltip,
    buildCompactItemName,
    getCardInfo,
    showItemDetail,
    renderCardDetail,
    closeItemDetailModal,
    findInventoryInstance
  });
})();
