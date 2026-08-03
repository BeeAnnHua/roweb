//==============================================================
// RO_WEB V0.9.83A — 新人銜接裝備支援
// 新角色自動取得 Base Lv.100 蹦級箱；既有角色由普隆德拉中央 NPC 單角色補領一次。
// 完成 100 階段後發放 130 箱；完成 130 階段後發放 160 箱。
//==============================================================
(function () {
  'use strict';

  const VERSION = '0.9.83A';
  const CONFIG_PATH = 'data/newcomer_support.json';
  const PACKAGE_ID = 101538;
  const STAGE_BOX_IDS = Object.freeze({ 100: 101538, 130: 1000994, 160: 1000985 });
  const BOX_STAGE_BY_ID = Object.freeze({ 101538: 100, 1000994: 130, 1000985: 160 });
  const NEXT_BOX_BY_STAGE = Object.freeze({ 100: 1000994, 130: 1000985, 160: null });
  const originalUseItem = window.useItem;
  let activeStage = 100;
  let selectedStage100 = { weaponId: null, armorSet: 'attack', slot3: 4844, slot2: 311388 };
  let selectedStage130 = 'physical';
  let selectedStage160 = 'physical';

  function cfg() {
    return window.RO_WEB_DATA?.[CONFIG_PATH] || null;
  }

  function item(id) {
    return typeof window.getItemData === 'function' ? window.getItemData(id) : null;
  }

  function normalizeProgress() {
    if (!window.player) return null;
    const raw = player.newcomerSupportProgressV1;
    const p = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    player.newcomerSupportProgressV1 = {
      stage100: Boolean(p.stage100),
      stage130: Boolean(p.stage130),
      stage160: Boolean(p.stage160),
      weaponId: Number(p.weaponId || 0) || null,
      armorSet: p.armorSet || null,
      illusionSet: p.illusionSet || null,
      automaticSet: p.automaticSet || null,
      boosterEnchantSlot3: Number(p.boosterEnchantSlot3 || 0) || null,
      boosterEnchantSlot2: Number(p.boosterEnchantSlot2 || 0) || null,
      stage100ClaimedAt: Number(p.stage100ClaimedAt || 0) || null,
      stage130ClaimedAt: Number(p.stage130ClaimedAt || 0) || null,
      stage160ClaimedAt: Number(p.stage160ClaimedAt || 0) || null
    };
    return player.newcomerSupportProgressV1;
  }

  function inventoryRow(id) {
    return Array.isArray(player?.inventory)
      ? player.inventory.find(row => Number(row?.id) === Number(id) && Number(row?.count || 0) > 0)
      : null;
  }

  function hasBox(id) {
    return Boolean(inventoryRow(id));
  }

  function addBoxSilently(id) {
    if (hasBox(id)) return true;
    const data = item(id);
    if (!data || typeof window.addItem !== 'function') return false;
    const previousBatch = window.RO_WEB_REWARD_BATCH_ACTIVE;
    const previousSuppress = window.RO_WEB_SUPPRESS_REWARD_ADD_ITEM_LOG;
    try {
      window.RO_WEB_REWARD_BATCH_ACTIVE = true;
      window.RO_WEB_SUPPRESS_REWARD_ADD_ITEM_LOG = true;
      window.addItem(data, 1);
    } finally {
      window.RO_WEB_REWARD_BATCH_ACTIVE = previousBatch;
      window.RO_WEB_SUPPRESS_REWARD_ADD_ITEM_LOG = previousSuppress;
    }
    return hasBox(id);
  }

  function removeBox(id) {
    const row = inventoryRow(id);
    if (!row) return false;
    row.count = Number(row.count || 0) - 1;
    if (row.count <= 0) {
      const index = player.inventory.indexOf(row);
      if (index >= 0) player.inventory.splice(index, 1);
    }
    return true;
  }

  function pendingStage() {
    const p = normalizeProgress();
    if (!p.stage100) return 100;
    if (!p.stage130) return 130;
    if (!p.stage160) return 160;
    return null;
  }

  function grantForNewCharacter() {
    if (!window.player || window.RO_WEB_PLAYER_SAVE_FOUND !== false) return false;
    normalizeProgress();
    if (player.newcomerSupportClaimedV1) return false;
    const granted = addBoxSilently(PACKAGE_ID);
    if (!granted) return false;
    player.newcomerSupportClaimedV1 = true;
    player.newcomerSupportClaimSourceV1 = 'new-character';
    player.newcomerSupportClaimedAtV1 = Date.now();
    if (typeof window.addBattleLog === 'function') {
      addBattleLog('新人裝備支援：已發放「蹦級箱」。Base Lv.100 並完成三轉後可開啟；完成後會接續取得 Lv.130 與 Lv.160 箱。');
    }
    if (typeof window.updateInventoryUI === 'function') updateInventoryUI();
    if (typeof window.saveGame === 'function') saveGame();
    return true;
  }

  function repairPendingBox(npcName) {
    const stage = pendingStage();
    if (!stage) return false;
    const boxId = STAGE_BOX_IDS[stage];
    if (hasBox(boxId)) return false;
    if (!addBoxSilently(boxId)) return false;
    addBattleLog(`${npcName}：已修復遺失的 Base Lv.${stage} 銜接箱；原有領取進度完全保留。`);
    if (typeof updateInventoryUI === 'function') updateInventoryUI();
    if (typeof saveGame === 'function') saveGame();
    return true;
  }

  function claimFromNpc(npc) {
    if (!window.player) return false;
    normalizeProgress();
    const npcName = npc?.name || '新人裝備支援員';
    if (!player.newcomerSupportClaimedV1) {
      if (!addBoxSilently(PACKAGE_ID)) {
        addBattleLog(`${npcName}：蹦級箱資料尚未載入，請重新整理後再試。`);
        return false;
      }
      player.newcomerSupportClaimedV1 = true;
      player.newcomerSupportClaimSourceV1 = 'prontera-npc';
      player.newcomerSupportClaimedAtV1 = Date.now();
      addBattleLog(`${npcName}：已補發「蹦級箱」。每個人物只能領取一次；後續箱會由前一階段自動發放。`);
      if (typeof updateInventoryUI === 'function') updateInventoryUI();
      if (typeof saveGame === 'function') saveGame();
      openForBox(PACKAGE_ID);
      return true;
    }

    if (!repairPendingBox(npcName)) {
      const stage = pendingStage();
      if (stage && hasBox(STAGE_BOX_IDS[stage])) {
        addBattleLog(`${npcName}：這個人物已領取過支援；目前請使用背包中的 Base Lv.${stage} 銜接箱。`);
      } else {
        addBattleLog(`${npcName}：這個人物已完成新人裝備支援，無法重複領取。`);
      }
    }
    const stage = pendingStage();
    if (stage && hasBox(STAGE_BOX_IDS[stage])) openForBox(STAGE_BOX_IDS[stage]);
    return false;
  }

  function getRoute() {
    const c = cfg();
    return c?.jobRoutes?.[String(player?.jobKey || '')] || null;
  }

  function getCurrentJob() {
    const key = String(player?.jobKey || 'novice');
    const data = typeof window.getJobData === 'function' ? window.getJobData(key) : null;
    return { key, name: data?.name || player?.job || key, tier: Number(data?.tier || 0) };
  }

  function requirement(stage) {
    const current = getCurrentJob();
    const route = getRoute();
    const baseLevel = Number(player?.baseLevel || 1);
    const boxId = STAGE_BOX_IDS[stage];
    if (!hasBox(boxId)) return { ok:false, reason:`背包中沒有 Base Lv.${stage} 銜接箱。` };
    if (stage === 100) {
      if (baseLevel < 100) return { ok:false, reason:`Base Lv.${baseLevel}／需要 Base Lv.100` };
      if (!route) return { ok:false, reason:'目前只支援六大職業系列的三轉與四轉；擴充職業將於後續版本加入。' };
      if (current.tier < 3) return { ok:false, reason:'請先完成三轉，再領取職業蹦級武器與防具。' };
      return { ok:true, reason:`目前職業：${current.name}` };
    }
    if (stage === 130) {
      if (baseLevel < 130) return { ok:false, reason:`Base Lv.${baseLevel}／需要 Base Lv.130` };
      if (!normalizeProgress().stage100) return { ok:false, reason:'請先完成 Base Lv.100 蹦級裝備階段。' };
      return { ok:true, reason:'可選擇物理 A 型或魔法 B 型；完成後會獲得 Base Lv.160 箱。' };
    }
    if (stage === 160) {
      if (baseLevel < 160) return { ok:false, reason:`Base Lv.${baseLevel}／需要 Base Lv.160` };
      if (!normalizeProgress().stage130) return { ok:false, reason:'請先完成 Base Lv.130 幻象裝備階段。' };
      return { ok:true, reason:'可選擇物理 A 型或魔法 B 型；這是最終銜接階段。' };
    }
    return { ok:false, reason:'未知階段。' };
  }

  function cleanText(value) {
    return String(value || '').replace(/\^[0-9A-Fa-f]{6}/g, '').replace(/\s+/g, ' ').trim();
  }

  function shortDescription(data, max = 3) {
    const lines = Array.isArray(data?.description) ? data.description : [];
    return lines.map(cleanText).filter(Boolean).slice(0, max).join('｜') || '完整能力會依官方 rAthena Renewal 裝備腳本生效。';
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }

  function ensureUi() {
    if (document.getElementById('newcomer-support-overlay')) return;
    const style = document.createElement('style');
    style.id = 'newcomer-support-style';
    style.textContent = `
      #newcomer-support-overlay{position:fixed;inset:0;z-index:24000;background:rgba(4,6,12,.82);display:flex;align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(3px)}
      #newcomer-support-overlay[hidden]{display:none!important}
      .newcomer-support-window{width:min(1080px,96vw);max-height:92vh;overflow:auto;border:1px solid #a98435;border-radius:16px;background:linear-gradient(145deg,#121722,#090c13);box-shadow:0 24px 70px rgba(0,0,0,.72);color:#f3ead2}
      .newcomer-support-head{position:sticky;top:0;z-index:3;display:flex;gap:14px;align-items:center;padding:16px 18px;border-bottom:1px solid rgba(218,177,78,.3);background:rgba(10,13,20,.96)}
      .newcomer-support-head img{width:62px;height:62px;object-fit:contain;image-rendering:auto}.newcomer-support-head-copy{flex:1}.newcomer-support-head h2{margin:0;color:#ffd979;font-size:22px}.newcomer-support-head p{margin:5px 0 0;color:#c9bea5;font-size:13px;line-height:1.55}
      .newcomer-support-close{border:1px solid #806226;background:#211b10;color:#ffe4a0;border-radius:10px;padding:9px 13px;font-weight:700;cursor:pointer}
      .newcomer-support-body{padding:16px;display:grid;gap:14px}.newcomer-stage{border:1px solid rgba(188,151,65,.28);border-radius:14px;background:rgba(22,27,39,.78);overflow:hidden}.newcomer-stage-head{display:flex;gap:12px;align-items:center;padding:13px 15px;background:rgba(36,41,54,.86)}
      .newcomer-stage-head img{width:44px;height:44px;object-fit:contain}.newcomer-stage-title{flex:1}.newcomer-stage-title strong{display:block;color:#ffe08a;font-size:17px}.newcomer-stage-title small{color:#bdb39b;line-height:1.5}.newcomer-stage-status{padding:5px 9px;border-radius:999px;background:#302718;color:#ffd66f;font-size:12px;font-weight:800}.newcomer-stage-status.done{background:#163523;color:#82e6a4}
      .newcomer-stage-content{padding:14px}.newcomer-note{margin:0 0 12px;color:#d6ccb6;font-size:13px;line-height:1.65}.newcomer-error{color:#ffadad}.newcomer-chain-note{border:1px solid rgba(117,174,225,.35);border-radius:10px;background:rgba(19,44,67,.55);padding:10px 12px;color:#bfe2ff;line-height:1.55;font-size:13px;margin:0 0 12px}.newcomer-option-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin:10px 0 14px}.newcomer-option{position:relative;display:flex;gap:10px;align-items:flex-start;padding:11px;border:1px solid #494536;border-radius:12px;background:#141927;cursor:pointer;text-align:left;color:inherit}.newcomer-option.selected{border-color:#d7aa45;box-shadow:inset 0 0 0 1px #d7aa45;background:#211d16}.newcomer-option.recommended:after{content:'推薦';position:absolute;right:8px;top:8px;padding:2px 6px;border-radius:999px;background:#6e5220;color:#ffe5a1;font-size:10px;font-weight:800}.newcomer-option img{width:48px;height:48px;object-fit:contain;flex:none}.newcomer-option b{display:block;color:#fff1c1;padding-right:38px}.newcomer-option small{display:block;margin-top:4px;color:#bdb59f;line-height:1.45}.newcomer-enchants{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}.newcomer-field{display:grid;gap:5px;color:#d8cfbb;font-size:12px}.newcomer-field select{width:100%;padding:9px;border:1px solid #5c5034;border-radius:9px;background:#0f1420;color:#ffe6a2}.newcomer-claim{width:100%;border:1px solid #bb8f34;border-radius:10px;background:linear-gradient(#5d4318,#2c210f);color:#ffe4a0;padding:11px 14px;font-weight:800;cursor:pointer}.newcomer-claim:disabled{opacity:.45;cursor:not-allowed}.newcomer-complete{padding:10px 12px;border-radius:9px;background:#132d20;color:#87e5a7;line-height:1.55}
      @media(max-width:640px){#newcomer-support-overlay{padding:7px}.newcomer-support-window{max-height:96vh}.newcomer-support-head{padding:12px}.newcomer-support-head img{width:48px;height:48px}.newcomer-support-head h2{font-size:18px}.newcomer-enchants{grid-template-columns:1fr}.newcomer-option-grid{grid-template-columns:1fr}.newcomer-stage-content{padding:11px}}
    `;
    document.head.appendChild(style);
    const overlay = document.createElement('section');
    overlay.id = 'newcomer-support-overlay';
    overlay.hidden = true;
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.innerHTML = `
      <div class="newcomer-support-window">
        <header class="newcomer-support-head">
          <img id="newcomer-support-box-icon" src="images/items/${PACKAGE_ID}.webp?v=${VERSION}" alt="新人銜接箱">
          <div class="newcomer-support-head-copy"><h2 id="newcomer-support-title">新人銜接裝備支援</h2><p id="newcomer-support-subtitle"></p></div>
          <button class="newcomer-support-close" type="button">關閉</button>
        </header>
        <div id="newcomer-support-body" class="newcomer-support-body"></div>
      </div>`;
    overlay.querySelector('.newcomer-support-close').addEventListener('click', close);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    document.body.appendChild(overlay);
  }

  function recommendArmor(route) {
    if (['warlock','sorcerer'].includes(route)) return 'elemental';
    if (route === 'arch_bishop') return 'resistance';
    if (['ranger','minstrel','wanderer'].includes(route)) return 'range';
    return 'attack';
  }

  function magicWeapon(id) {
    return [500015,640009,640010,540009,550010,550011].includes(Number(id));
  }

  function rangedWeapon(id) {
    return [630008,530005,590008,590009,700014,700015,700016,570024,570010,580024,580010].includes(Number(id));
  }

  function defaultEnchantForWeapon(id) {
    if (magicWeapon(id)) return {slot3:311404,slot2:311393};
    if (rangedWeapon(id)) return {slot3:311394,slot2:4836};
    return {slot3:4844,slot2:311388};
  }

  function renderOption(id, selected, recommended, group, extra='') {
    const data = item(id) || { id, name:`物品 ${id}`, icon:`images/items/${id}.webp`, description:[] };
    return `<button type="button" class="newcomer-option${selected ? ' selected':''}${recommended ? ' recommended':''}" data-group="${escapeHtml(group)}" data-value="${escapeHtml(id)}"><img src="${escapeHtml(data.icon || `images/items/${id}.webp`)}" alt=""><span><b>${escapeHtml(data.name)}</b><small>${escapeHtml(extra || shortDescription(data))}</small></span></button>`;
  }

  function renderSetOption(key, setData, selected, recommended, group, iconId) {
    return `<button type="button" class="newcomer-option${selected ? ' selected':''}${recommended ? ' recommended':''}" data-group="${escapeHtml(group)}" data-value="${escapeHtml(key)}"><img src="images/items/${iconId}.webp" alt=""><span><b>${escapeHtml(setData.name)}</b><small>${escapeHtml(setData.style)}｜${setData.items.length} 件角色綁定裝備</small></span></button>`;
  }

  function stageHeader(stage, icon, title, subtitle, done) {
    return `<div class="newcomer-stage-head"><img src="${icon}" alt=""><div class="newcomer-stage-title"><strong>${title}</strong><small>${subtitle}</small></div><span class="newcomer-stage-status${done?' done':''}">${done?'已領取':'未領取'}</span></div>`;
  }

  function renderStage100() {
    const c = cfg();
    const p = normalizeProgress();
    const req = requirement(100);
    const route = getRoute();
    if (route && (!selectedStage100.weaponId || !route.weapons.map(Number).includes(Number(selectedStage100.weaponId)))) {
      selectedStage100.weaponId = Number(route.weapons[0]);
      selectedStage100.armorSet = recommendArmor(route.route);
      Object.assign(selectedStage100, defaultEnchantForWeapon(selectedStage100.weaponId));
    }
    let html = `<section class="newcomer-stage" data-stage="100">${stageHeader(100,'images/items/101538.webp','Base Lv.100｜蹦級職業裝備','職業武器 1 把＋蹦級防具 1 套；防具三件固定 +10。',p.stage100)}<div class="newcomer-stage-content">`;
    if (p.stage100) {
      const w = item(p.weaponId);
      html += `<div class="newcomer-complete">已選擇：${escapeHtml(w?.name || p.weaponId)}／${escapeHtml(c.stages['100'].armorSets[p.armorSet]?.name || p.armorSet)}。這個人物無法重複領取本階段。</div></div></section>`;
      return html;
    }
    html += `<p class="newcomer-chain-note">完成本階段後，會自動取得「幻象裝備兌換券」。該箱需 Base Lv.130 才能開啟，不必再回 NPC 領取。</p>`;
    html += `<p class="newcomer-note${req.ok?'':' newcomer-error'}">${escapeHtml(req.reason)}</p>`;
    if (route) {
      html += `<p class="newcomer-note"><strong>目前職業路線：</strong>${escapeHtml(route.jobName)}。只顯示本職系可用的兩把武器。</p><div class="newcomer-option-grid">`;
      html += route.weapons.map(id => renderOption(id,Number(selectedStage100.weaponId)===Number(id),false,'weapon')).join('');
      html += `</div><p class="newcomer-note"><strong>防具流派：</strong>推薦僅供參考，仍可自由選擇其他套裝。</p><div class="newcomer-option-grid">`;
      const recommended = recommendArmor(route.route);
      html += Object.entries(c.stages['100'].armorSets).map(([key,set]) => renderSetOption(key,set,selectedStage100.armorSet===key,recommended===key,'armor',set.items[0])).join('');
      html += `</div>`;
      const slot3 = c.weaponEnchantOptions.slot3;
      const slot2 = c.weaponEnchantOptions.slot2;
      html += `<div class="newcomer-enchants"><label class="newcomer-field">武器第 3 洞附魔<select id="newcomer-enchant-slot3">${slot3.map(o=>`<option value="${o.id}" ${Number(selectedStage100.slot3)===Number(o.id)?'selected':''}>${escapeHtml(o.name)}｜${escapeHtml(o.role)}</option>`).join('')}</select></label><label class="newcomer-field">武器第 2 洞附魔<select id="newcomer-enchant-slot2">${slot2.map(o=>`<option value="${o.id}" ${Number(selectedStage100.slot2)===Number(o.id)?'selected':''}>${escapeHtml(o.name)}｜${escapeHtml(o.role)}</option>`).join('')}</select></label></div>`;
    }
    html += `<button type="button" class="newcomer-claim" data-claim-stage="100" ${req.ok&&route?'':'disabled'}>確認開啟 Base Lv.100 蹦級箱</button></div></section>`;
    return html;
  }

  function renderSimpleStage(stage, selectedKey, voucherIcon, title, subtitle) {
    const c = cfg();
    const p = normalizeProgress();
    const done = p[`stage${stage}`];
    const req = requirement(stage);
    const sets = c.stages[String(stage)].sets;
    let html = `<section class="newcomer-stage" data-stage="${stage}">${stageHeader(stage,voucherIcon,title,subtitle,done)}<div class="newcomer-stage-content">`;
    if (done) {
      const stored = stage === 130 ? p.illusionSet : p.automaticSet;
      html += `<div class="newcomer-complete">已選擇：${escapeHtml(sets[stored]?.name || stored)}。這個人物無法重複領取本階段。</div></div></section>`;
      return html;
    }
    if (stage === 130) {
      html += `<p class="newcomer-chain-note">完成本階段後，會自動取得「全自動裝備兌換券」。該箱需 Base Lv.160 才能開啟，不必再回 NPC 領取。</p>`;
    } else {
      html += `<p class="newcomer-chain-note">這是新人裝備支援的最終銜接階段。完成後即可開始挑戰更高階裝備、附魔與升階內容。</p>`;
    }
    html += `<p class="newcomer-note${req.ok?'':' newcomer-error'}">${escapeHtml(req.reason)}</p><div class="newcomer-option-grid">`;
    html += Object.entries(sets).map(([key,set]) => renderSetOption(key,set,selectedKey===key,key==='physical',`stage${stage}`,set.items[0])).join('');
    html += `</div><button type="button" class="newcomer-claim" data-claim-stage="${stage}" ${req.ok?'':'disabled'}>確認開啟 Base Lv.${stage} 裝備箱</button></div></section>`;
    return html;
  }

  function bindUi() {
    const overlay = document.getElementById('newcomer-support-overlay');
    overlay.querySelectorAll('.newcomer-option').forEach(button => {
      button.addEventListener('click', () => {
        const group = button.dataset.group;
        const value = button.dataset.value;
        if (group === 'weapon') {
          selectedStage100.weaponId = Number(value);
          Object.assign(selectedStage100, defaultEnchantForWeapon(selectedStage100.weaponId));
        } else if (group === 'armor') selectedStage100.armorSet = value;
        else if (group === 'stage130') selectedStage130 = value;
        else if (group === 'stage160') selectedStage160 = value;
        render();
      });
    });
    const s3 = document.getElementById('newcomer-enchant-slot3');
    if (s3) s3.addEventListener('change', () => selectedStage100.slot3 = Number(s3.value));
    const s2 = document.getElementById('newcomer-enchant-slot2');
    if (s2) s2.addEventListener('change', () => selectedStage100.slot2 = Number(s2.value));
    overlay.querySelectorAll('[data-claim-stage]').forEach(button => button.addEventListener('click', () => claimStage(Number(button.dataset.claimStage), button)));
  }

  function render() {
    ensureUi();
    const c = cfg();
    if (!c) return;
    const current = getCurrentJob();
    const boxId = STAGE_BOX_IDS[activeStage];
    const boxData = item(boxId);
    const icon = document.getElementById('newcomer-support-box-icon');
    if (icon) icon.src = `${boxData?.icon || `images/items/${boxId}.webp`}?v=${VERSION}`;
    const title = document.getElementById('newcomer-support-title');
    if (title) title.textContent = `新人銜接裝備支援｜Lv.${activeStage}`;
    const subtitle = document.getElementById('newcomer-support-subtitle');
    subtitle.textContent = `${current.name}｜Base Lv.${Number(player?.baseLevel||1)}｜目前箱子：${boxData?.name || boxId}｜每個人物各階段限領一次。`;
    const body = document.getElementById('newcomer-support-body');
    if (activeStage === 100) body.innerHTML = renderStage100();
    else if (activeStage === 130) body.innerHTML = renderSimpleStage(130,selectedStage130,'images/items/1000994.webp','Base Lv.130｜幻象（歸屬）裝備','物理 A 型或魔法 B 型；鎧甲、披肩與鞋子固定 +10。');
    else body.innerHTML = renderSimpleStage(160,selectedStage160,'images/items/1000985.webp','Base Lv.160｜全自動（歸屬）裝備','物理 A 型或魔法 B 型；鎧甲、披肩與鞋子固定 +11。');
    bindUi();
  }

  function openForBox(boxId) {
    const stage = BOX_STAGE_BY_ID[Number(boxId)];
    if (!stage) return false;
    if (!window.player) return false;
    normalizeProgress();
    if (!hasBox(boxId)) {
      if (typeof addBattleLog === 'function') addBattleLog(`新人裝備支援：背包中沒有 ${item(boxId)?.name || boxId}。`);
      return false;
    }
    activeStage = stage;
    ensureUi();
    render();
    const overlay = document.getElementById('newcomer-support-overlay');
    overlay.hidden = false;
    return true;
  }

  function open() {
    const stage = pendingStage() || 160;
    const boxId = STAGE_BOX_IDS[stage];
    if (hasBox(boxId)) return openForBox(boxId);
    ensureUi();
    activeStage = stage;
    render();
    document.getElementById('newcomer-support-overlay').hidden = false;
    return true;
  }

  function close() {
    const overlay = document.getElementById('newcomer-support-overlay');
    if (overlay) overlay.hidden = true;
  }

  function makeEnchant(id, slot) {
    const options = [...(cfg()?.weaponEnchantOptions?.slot3||[]),...(cfg()?.weaponEnchantOptions?.slot2||[])];
    const row = options.find(x => Number(x.id) === Number(id));
    return {id:Number(id),slot:Number(slot),playerSlot:Number(slot),name:row?.name || item(id)?.name || `附魔 ${id}`,icon:row?.icon || `images/items/${id}.webp`};
  }

  function grantEquipment(id, refine=0, enchants=[]) {
    const data = item(id);
    if (!data) throw new Error(`找不到支援裝備 ${id}`);
    window.addItem({id:Number(id),name:data.name,refine:Number(refine||0),enchants,characterBound:true,supportEquipment:true,noStorage:true,noDecompose:false,noSell:false},1);
  }

  function confirmClaim(message) {
    return window.confirm(`${message}\n\n本箱會被消耗，每個人物只能領取一次，確認後不可更換。`);
  }

  function claimStage(stage, button) {
    const c = cfg();
    const req = requirement(stage);
    const p = normalizeProgress();
    const boxId = STAGE_BOX_IDS[stage];
    const nextBoxId = NEXT_BOX_BY_STAGE[stage];
    if (!req.ok) {
      addBattleLog(`新人裝備支援：${req.reason}`);
      render();
      return false;
    }
    if (p[`stage${stage}`]) {
      addBattleLog(`新人裝備支援：Base Lv.${stage} 階段已領取。`);
      render();
      return false;
    }
    if (!hasBox(boxId)) {
      addBattleLog(`新人裝備支援：背包中沒有 ${item(boxId)?.name || boxId}。`);
      render();
      return false;
    }

    let message = '';
    if (stage === 100) {
      const route = getRoute();
      const weapon = item(selectedStage100.weaponId);
      const armor = c.stages['100'].armorSets[selectedStage100.armorSet];
      if (!route || !route.weapons.map(Number).includes(Number(selectedStage100.weaponId)) || !armor) {
        addBattleLog('新人裝備支援：職業武器或防具選擇無效。');
        render();
        return false;
      }
      message = `確定開啟蹦級箱並領取「${weapon?.name}」與「${armor.name}」嗎？\n完成後會獲得 Base Lv.130 幻象裝備兌換券。`;
    } else {
      const key = stage === 130 ? selectedStage130 : selectedStage160;
      const set = c.stages[String(stage)].sets[key];
      if (!set) {
        addBattleLog('新人裝備支援：套裝選擇無效。');
        return false;
      }
      message = `確定開啟本箱並領取「${set.name}」嗎？`;
      if (stage === 130) message += '\n完成後會獲得 Base Lv.160 全自動裝備兌換券。';
    }
    if (!confirmClaim(message)) return false;
    if (button) button.disabled = true;

    const inventorySnapshot = JSON.parse(JSON.stringify(player.inventory || []));
    const progressSnapshot = JSON.parse(JSON.stringify(p));
    const previousBatch = window.RO_WEB_REWARD_BATCH_ACTIVE;
    const previousSuppress = window.RO_WEB_SUPPRESS_REWARD_ADD_ITEM_LOG;
    try {
      window.RO_WEB_REWARD_BATCH_ACTIVE = true;
      window.RO_WEB_SUPPRESS_REWARD_ADD_ITEM_LOG = true;
      if (!removeBox(boxId)) throw new Error(`無法扣除箱子 ${boxId}`);

      if (stage === 100) {
        const armor = c.stages['100'].armorSets[selectedStage100.armorSet];
        grantEquipment(selectedStage100.weaponId,0,[makeEnchant(selectedStage100.slot3,3),makeEnchant(selectedStage100.slot2,2)]);
        armor.items.forEach((id,index) => grantEquipment(id,index<3?Number(c.stages['100'].armorRefine||10):0));
        p.stage100 = true;
        p.weaponId = Number(selectedStage100.weaponId);
        p.armorSet = selectedStage100.armorSet;
        p.boosterEnchantSlot3 = Number(selectedStage100.slot3);
        p.boosterEnchantSlot2 = Number(selectedStage100.slot2);
        p.stage100ClaimedAt = Date.now();
        addBattleLog(`新人裝備支援：已領取 ${item(p.weaponId)?.name} 與 ${armor.name}。`);
      } else {
        const key = stage === 130 ? selectedStage130 : selectedStage160;
        const set = c.stages[String(stage)].sets[key];
        set.items.forEach((id,index) => grantEquipment(id,Number(set.refines[index]||0)));
        p[`stage${stage}`] = true;
        p[stage===130?'illusionSet':'automaticSet'] = key;
        p[`stage${stage}ClaimedAt`] = Date.now();
        addBattleLog(`新人裝備支援：已領取 ${set.name}。`);
      }

      if (nextBoxId) {
        if (!addBoxSilently(nextBoxId)) throw new Error(`無法發放下一階段箱子 ${nextBoxId}`);
        addBattleLog(`新人裝備支援：已獲得「${item(nextBoxId)?.name || nextBoxId}」，達到 Base Lv.${BOX_STAGE_BY_ID[nextBoxId]} 後可開啟。`);
      } else {
        addBattleLog('新人裝備支援：Base Lv.160 最終銜接階段完成。');
      }
    } catch (error) {
      console.error('新人裝備支援領取失敗', error);
      player.inventory = inventorySnapshot;
      player.newcomerSupportProgressV1 = progressSnapshot;
      addBattleLog(`新人裝備支援：領取失敗（${error.message||error}），箱子與進度已還原。`);
      if (button) button.disabled = false;
      return false;
    } finally {
      window.RO_WEB_REWARD_BATCH_ACTIVE = previousBatch;
      window.RO_WEB_SUPPRESS_REWARD_ADD_ITEM_LOG = previousSuppress;
    }

    window.invalidateCardRuntime?.();
    window.invalidatePlayerUiRenderCaches?.('status');
    if (typeof updateInventoryUI === 'function') updateInventoryUI();
    if (typeof updatePlayerUI === 'function') updatePlayerUI();
    if (typeof saveGame === 'function') saveGame();
    close();
    return true;
  }

  window.useItem = function (itemId, instance=null) {
    const id = Number(itemId?.id ?? itemId);
    if (BOX_STAGE_BY_ID[id]) return openForBox(id);
    return originalUseItem?.(itemId, instance);
  };

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !document.getElementById('newcomer-support-overlay')?.hidden) close();
  });

  window.NewcomerSupportRuntime = {
    VERSION,
    PACKAGE_ID,
    STAGE_BOX_IDS,
    BOX_STAGE_BY_ID,
    NEXT_BOX_BY_STAGE,
    cfg,
    normalizeProgress,
    grantForNewCharacter,
    claimFromNpc,
    open,
    openForBox,
    close,
    claimStage,
    requirement,
    getRoute,
    hasBox,
    pendingStage
  };
})();
