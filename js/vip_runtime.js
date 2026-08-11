// ============================================================
// 彼岸花仙境 / RO_WEB V0.9.87E
// VIP V1 Runtime
// - Base EXP +50%
// - Job EXP +50%
// - Normal drop rate +50%
// - Server-verified offline settlement, max 8 hours
// ============================================================
(function(){
  "use strict";

  const VERSION = "0.9.87E";
  const CONFIG = Object.freeze({
    liveBonusPercent: Object.freeze({ baseExp:50, jobExp:50, drop:50, zeny:0 }),
    offline: Object.freeze({
      enabled:true,
      maxHours:8,
      minSecondsToReward:300,
      secondsPerVirtualKill:15,
      maxVirtualKills:1920,
      maxItemUnitsPerClaim:500,
      maxUnitsPerItem:99,
      excludeBoss:true,
      excludeMvp:true,
      excludeCards:true,
      includeZeny:true,
      includeNormalDrops:true
    })
  });

  let pendingSummary = null;
  let lastClaim = null;
  let lastArmState = null;
  let armRequestChain = Promise.resolve(false);

  function n(value, fallback=0){
    const out = Number(value);
    return Number.isFinite(out) ? out : fallback;
  }

  function account(){
    return window.ROWebCloudRuntime?.getAccount?.() || null;
  }

  function parseExpiry(value){
    if (!value) return 0;
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }

  function isActiveAccount(row = account()){
    if (!row || row.is_vip !== true) return false;
    const until = parseExpiry(row.vip_until);
    return !until || until > Date.now();
  }

  function getLevel(row = account()){
    if (!isActiveAccount(row)) return 0;
    return Math.max(1, Math.floor(n(row?.vip_level, 1)));
  }

  function getLiveBonusPercent(rateKey){
    if (!isActiveAccount()) return 0;
    return Math.max(0, n(CONFIG.liveBonusPercent[String(rateKey || "")], 0));
  }

  function applyLiveBonus(value, rateKey){
    const base = Math.max(0, n(value, 0));
    const percent = getLiveBonusPercent(rateKey);
    if (!percent) return Math.floor(base);
    return Math.max(0, Math.floor(base * (100 + percent) / 100));
  }

  function formatExpiry(row = account()){
    if (!row?.is_vip) return "非 VIP";
    if (!row.vip_until) return "永久 VIP";
    const ms = parseExpiry(row.vip_until);
    if (!ms) return "VIP";
    if (ms <= Date.now()) return "VIP 已到期";
    return `VIP 至 ${new Date(ms).toLocaleString("zh-TW", {hour12:false})}`;
  }

  function getBundled(path, fallback){
    const data = window.RO_WEB_DATA?.[path];
    return data == null ? fallback : data;
  }

  function getOfflineMapId(overrideMapId=""){
    const override = String(overrideMapId || "").trim();
    if (override) return override;
    const current = String(window.player?.map || "").trim();
    const lastField = String(window.player?.lastFieldMap || "").trim();
    return String(window.player?.currentCity ? (lastField || current) : (current || lastField));
  }

  function isBossMonster(monster){
    return monster?.isBoss === true || monster?.isMvp === true || monster?.isMVP === true || monster?.mvp === true || String(monster?.monsterClass || "").toLowerCase() === "boss";
  }

  function buildEligibleMonsterPool(overrideMapId=""){
    const maps = getBundled("data/maps.json", []);
    const monsterRows = getBundled("data/monsters.json", []);
    if (!Array.isArray(maps) || !Array.isArray(monsterRows)) return { map:null, monsters:[] };

    const mapId = getOfflineMapId(overrideMapId);
    const map = maps.find(row => String(row?.id || "") === mapId) || null;
    if (!map || map.noMonster === true || !Array.isArray(map.monsters) || !map.monsters.length) return { map, monsters:[] };

    const index = new Map(monsterRows.map(row => [Number(row?.id || row?.officialId || 0), row]));
    let pool = map.monsters.map(id => index.get(Number(id))).filter(Boolean);
    pool = pool.filter(monster => {
      if (CONFIG.offline.excludeMvp && monster?.isMvp === true) return false;
      if (CONFIG.offline.excludeBoss && isBossMonster(monster)) return false;
      return n(monster?.baseExp,0) > 0 || n(monster?.jobExp,0) > 0;
    });

    if (!pool.length) return { map, monsters:[] };
    const level = Math.max(1, Math.floor(n(window.player?.baseLevel, 1)));
    const lower = Math.max(1, level - 25);
    const upper = level + 10;
    const near = pool.filter(monster => {
      const mlv = Math.max(1, n(monster?.level, 1));
      return mlv >= lower && mlv <= upper;
    });
    if (near.length) pool = near;
    else pool = [...pool].sort((a,b) => Math.abs(n(a?.level,1)-level) - Math.abs(n(b?.level,1)-level)).slice(0, Math.min(8,pool.length));
    return { map, monsters:pool };
  }

  function randomInt(min, max){
    const a = Math.floor(Math.min(n(min,0), n(max,min)));
    const b = Math.floor(Math.max(n(min,0), n(max,min)));
    return a + Math.floor(Math.random() * (b - a + 1));
  }

  function rewardExp(monster, key){
    const raw = n(monster?.[key === "baseExp" ? "baseExp" : "jobExp"], 0);
    let value = typeof window.applyRate === "function" ? window.applyRate(raw, key) : raw;
    if (typeof window.applyTrainingRewardBonus === "function") value = window.applyTrainingRewardBonus(value, key);
    const cardRate = window.CardRuntime?.getExpRate ? n(window.CardRuntime.getExpRate(monster),0) : 0;
    value = Math.floor(n(value,0) * (100 + cardRate) / 100);
    return Math.max(0, value);
  }

  function rewardZeny(monster){
    if (!CONFIG.offline.includeZeny) return 0;
    let raw = 0;
    if (Number.isFinite(Number(monster?.zeny))) raw = Number(monster.zeny);
    else {
      const min = n(monster?.zenyMin, 0);
      const max = n(monster?.zenyMax, min);
      raw = randomInt(min,max);
    }
    let value = typeof window.applyRate === "function" ? window.applyRate(raw, "zeny") : raw;
    if (typeof window.applyTrainingRewardBonus === "function") value = window.applyTrainingRewardBonus(value, "zeny");
    return Math.max(0, Math.floor(n(value,0)));
  }

  function rollOfflineDrops(monster, itemTotals, state){
    if (!CONFIG.offline.includeNormalDrops || state.units >= CONFIG.offline.maxItemUnitsPerClaim) return;
    const drops = Array.isArray(monster?.drops) ? monster.drops : [];
    for (const drop of drops) {
      if (state.units >= CONFIG.offline.maxItemUnitsPerClaim) break;
      if (drop?.mvpDrop === true) continue;
      const itemId = Number(drop?.itemId ?? drop?.id ?? 0);
      if (!itemId) continue;
      const itemData = typeof window.getItemData === "function" ? window.getItemData(itemId) : null;
      if (CONFIG.offline.excludeCards && typeof window.isCardDropItem === "function" && window.isCardDropItem(itemData, drop)) continue;
      const rawChance = Math.max(0, n(drop?.chance,0));
      if (!rawChance) continue;
      const chance = typeof window.getFinalDropChanceBasisPoints === "function"
        ? window.getFinalDropChanceBasisPoints(rawChance, "normal")
        : Math.min(10000, rawChance);
      if (Math.floor(Math.random()*10000)+1 > chance) continue;
      const qty = Math.max(1, Number.isFinite(Number(drop?.qty)) ? Math.floor(Number(drop.qty)) : randomInt(drop?.qtyMin ?? 1, drop?.qtyMax ?? drop?.qtyMin ?? 1));
      const current = itemTotals.get(itemId) || { id:itemId, name:itemData?.name || drop?.name || `Item ${itemId}`, qty:0 };
      const roomByItem = Math.max(0, CONFIG.offline.maxUnitsPerItem - current.qty);
      const roomTotal = Math.max(0, CONFIG.offline.maxItemUnitsPerClaim - state.units);
      const accepted = Math.max(0, Math.min(qty, roomByItem, roomTotal));
      if (!accepted) continue;
      current.qty += accepted;
      itemTotals.set(itemId,current);
      state.units += accepted;
    }
  }

  function calculateOfflineRewards(seconds, options={}){
    const overrideMapId = String(options?.mapId || "").trim();
    const eligibleSeconds = Math.max(0, Math.min(n(seconds,0), CONFIG.offline.maxHours*3600));
    if (eligibleSeconds < CONFIG.offline.minSecondsToReward) return { seconds:eligibleSeconds, kills:0, baseExp:0, jobExp:0, zeny:0, items:[], mapName:"", mapId:getOfflineMapId(overrideMapId) };
    const source = buildEligibleMonsterPool(overrideMapId);
    if (!source.monsters.length) return { seconds:eligibleSeconds, kills:0, baseExp:0, jobExp:0, zeny:0, items:[], mapName:source.map?.name || "", mapId:source.map?.id || getOfflineMapId(overrideMapId), reason:"NO_ELIGIBLE_MONSTERS" };

    const kills = Math.min(CONFIG.offline.maxVirtualKills, Math.floor(eligibleSeconds / CONFIG.offline.secondsPerVirtualKill));
    let baseExp = 0, jobExp = 0, zeny = 0;
    const items = new Map();
    const itemState = { units:0 };
    for (let i=0; i<kills; i+=1) {
      const monster = source.monsters[Math.floor(Math.random()*source.monsters.length)];
      baseExp += rewardExp(monster,"baseExp");
      jobExp += rewardExp(monster,"jobExp");
      zeny += rewardZeny(monster);
      rollOfflineDrops(monster, items, itemState);
    }
    return {
      seconds:eligibleSeconds,
      kills,
      baseExp:Math.max(0,Math.floor(baseExp)),
      jobExp:Math.max(0,Math.floor(jobExp)),
      zeny:Math.max(0,Math.floor(zeny)),
      items:[...items.values()].filter(row => row.qty>0).sort((a,b)=>b.qty-a.qty || a.id-b.id),
      itemUnits:itemState.units,
      mapName:String(source.map?.name || source.map?.displayName || source.map?.id || "未知地圖"),
      mapId:String(source.map?.id || getOfflineMapId(overrideMapId))
    };
  }

  function grantOfflineRewards(summary){
    if (!window.player || !summary || summary.kills <= 0) return false;
    const previousBatch = Boolean(window.RO_WEB_REWARD_BATCH_ACTIVE);
    const previousSuppress = window.RO_WEB_SUPPRESS_REWARD_ADD_ITEM_LOG;
    window.RO_WEB_REWARD_BATCH_ACTIVE = true;
    window.RO_WEB_SUPPRESS_REWARD_ADD_ITEM_LOG = true;
    try {
      if (summary.baseExp > 0 && typeof window.addBaseExp === "function") window.addBaseExp(summary.baseExp);
      if (summary.jobExp > 0 && typeof window.addJobExp === "function") window.addJobExp(summary.jobExp);
      if (summary.zeny > 0 && typeof window.addZeny === "function") window.addZeny(summary.zeny);
      for (const item of summary.items || []) {
        if (typeof window.addItem === "function") window.addItem({id:item.id,name:item.name},item.qty);
        if (typeof window.recordItemDrop === "function") window.recordItemDrop(item.id,item.qty);
      }
      if (typeof window.recordBattleRewards === "function") window.recordBattleRewards({baseExp:summary.baseExp,jobExp:summary.jobExp,zeny:summary.zeny});
      if (typeof window.normalizeHuntingStats === "function") {
        window.normalizeHuntingStats();
        window.player.huntingStats.totalKills = n(window.player.huntingStats.totalKills,0) + summary.kills;
      }
      window.RO_WEB_REWARD_SAVE_DIRTY = true;
      window.RO_WEB_REWARD_PLAYER_UI_DIRTY = true;
      window.RO_WEB_REWARD_JOB_UI_DIRTY = true;
      if ((summary.items || []).length) window.RO_WEB_REWARD_INVENTORY_UI_DIRTY = true;
    } finally {
      window.RO_WEB_SUPPRESS_REWARD_ADD_ITEM_LOG = previousSuppress;
      window.RO_WEB_REWARD_BATCH_ACTIVE = previousBatch;
      if (!previousBatch && typeof window.flushRewardBatchUi === "function") window.flushRewardBatchUi();
    }
    return true;
  }

  function formatDuration(seconds){
    const total = Math.max(0,Math.floor(n(seconds,0)));
    const h = Math.floor(total/3600);
    const m = Math.floor((total%3600)/60);
    return h ? `${h} 小時 ${m} 分` : `${m} 分鐘`;
  }

  function esc(value){
    return String(value ?? "").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  }

  function ensureSummaryUi(){
    if (document.getElementById("vipOfflineRewardOverlay")) return;
    const overlay = document.createElement("section");
    overlay.id = "vipOfflineRewardOverlay";
    overlay.className = "vip-offline-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="vip-offline-card" role="dialog" aria-modal="true" aria-labelledby="vipOfflineRewardTitle">
        <div class="vip-offline-crown">◆ VIP</div>
        <h2 id="vipOfflineRewardTitle">離線掛機收益</h2>
        <p id="vipOfflineRewardMeta" class="vip-offline-meta"></p>
        <div class="vip-offline-grid">
          <div><span>Base EXP</span><b id="vipOfflineBaseExp">0</b></div>
          <div><span>Job EXP</span><b id="vipOfflineJobExp">0</b></div>
          <div><span>Zeny</span><b id="vipOfflineZeny">0</b></div>
          <div><span>虛擬擊殺</span><b id="vipOfflineKills">0</b></div>
        </div>
        <div id="vipOfflineItems" class="vip-offline-items"></div>
        <small class="vip-offline-note">VIP V1：需在野外開啟掛機後離線；每 15 秒 1 次虛擬擊殺、最多 8 小時；一般掉落不含 MVP、卡片、轉蛋與地圖限定特殊掉落。</small>
        <button id="vipOfflineClose" type="button">收下收益</button>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("#vipOfflineClose")?.addEventListener("click",()=>{ overlay.hidden=true; document.body.classList.remove("vip-offline-open"); });
  }

  function showSummary(summary){
    if (!summary || summary.kills <= 0) return false;
    ensureSummaryUi();
    const overlay = document.getElementById("vipOfflineRewardOverlay");
    if (!overlay) return false;
    const set = (id,text)=>{const node=document.getElementById(id); if(node) node.textContent=text;};
    set("vipOfflineRewardMeta",`${summary.mapName || "野外地圖"}｜離線 ${formatDuration(summary.seconds)}｜15 秒 / 隻｜VIP 最多結算 8 小時`);
    set("vipOfflineBaseExp",Number(summary.baseExp||0).toLocaleString());
    set("vipOfflineJobExp",Number(summary.jobExp||0).toLocaleString());
    set("vipOfflineZeny",Number(summary.zeny||0).toLocaleString());
    set("vipOfflineKills",Number(summary.kills||0).toLocaleString());
    const host = document.getElementById("vipOfflineItems");
    if (host) {
      const rows = (summary.items || []).slice(0,12);
      host.innerHTML = rows.length
        ? `<strong>一般掉落</strong>${rows.map(item=>`<div><span>${esc(item.name)}</span><b>×${Number(item.qty||0).toLocaleString()}</b></div>`).join("")}${(summary.items||[]).length>12?`<small>另有 ${(summary.items||[]).length-12} 種道具已加入背包。</small>`:""}`
        : `<strong>一般掉落</strong><small>本次沒有取得一般掉落物。</small>`;
    }
    overlay.hidden = false;
    document.body.classList.add("vip-offline-open");
    return true;
  }

  async function performOfflineArm(enabled, options={}){
    const row = account();
    if (!row?.account_id) return false;
    const wantEnabled = enabled === true;
    if (wantEnabled && !isActiveAccount(row)) return false;
    const context = window.CharacterSlotsRuntime?.getActiveContext?.() || {};
    if (!context.characterId) return false;
    const client = window.ROWebCloudRuntime?.getClient?.();
    if (!client?.rpc) return false;
    const mapId = getOfflineMapId(options?.mapId || "");
    try {
      const {data,error} = await client.rpc("ro_vip_set_offline_arm", {
        p_account_id:String(row.account_id),
        p_character_id:String(context.characterId),
        p_enabled:wantEnabled,
        p_map_id:wantEnabled ? mapId : null
      });
      if (error) throw error;
      lastArmState = data && typeof data === "object" ? data : { armed:wantEnabled, map_id:mapId };
      if (options?.notify === true && typeof window.addBattleLog === "function" && wantEnabled && lastArmState?.armed === true) {
        window.addBattleLog("VIP 離線掛機已登記：保持掛機狀態離線後，將以每 15 秒 1 隻計算收益。");
      }
      return lastArmState?.armed === wantEnabled || (!wantEnabled && lastArmState?.armed !== true);
    } catch (error) {
      console.warn(`VIP 離線掛機${wantEnabled ? "登記" : "解除"}失敗。`, error);
      if (wantEnabled && options?.notify === true && typeof window.addBattleLog === "function") {
        window.addBattleLog("VIP 離線掛機登記失敗；本次若直接離線將不計算離線收益，請確認網路後重新開啟掛機。");
      }
      return false;
    }
  }

  function setOfflineArm(enabled, options={}){
    armRequestChain = armRequestChain
      .catch(()=>false)
      .then(()=>performOfflineArm(enabled, options));
    return armRequestChain;
  }

  async function claimOfflineWindow(){
    const row = account();
    if (!row?.account_id || row.is_vip !== true || !CONFIG.offline.enabled) return null;
    const context = window.CharacterSlotsRuntime?.getActiveContext?.() || {};
    if (!context.characterId) return null;
    const client = window.ROWebCloudRuntime?.getClient?.();
    if (!client?.rpc) return null;
    const {data,error} = await client.rpc("ro_vip_claim_offline_window", {
      p_account_id:String(row.account_id),
      p_character_id:String(context.characterId)
    });
    if (error) throw error;
    return data && typeof data === "object" ? data : null;
  }

  async function claimAndGrantOfflineRewards(){
    try {
      const claim = await claimOfflineWindow();
      lastClaim = claim;
      if (!claim || claim.vip_active !== true || claim.offline_armed !== true || claim.claim_allowed !== true) return null;
      const seconds = Math.max(0,n(claim.offline_seconds,0));
      const summary = calculateOfflineRewards(seconds, {mapId:claim.map_id});
      if (!summary || summary.kills <= 0) return summary;
      grantOfflineRewards(summary);
      pendingSummary = summary;
      if (typeof window.saveGameAndWait === "function") {
        try { await window.saveGameAndWait({reason:"vip-offline-reward",forceWriter:true,durableDelayMs:0}); }
        catch (error) { console.warn("VIP 離線收益已加入角色，但立即雲端同步未完成；本機安全備份仍會保留。",error); }
      } else if (typeof window.saveGame === "function") window.saveGame({reason:"vip-offline-reward",forceWriter:true});
      return summary;
    } catch (error) {
      console.warn("VIP 離線收益結算失敗，本次不影響正常登入。", error);
      return null;
    }
  }

  function refreshAccountUi(){
    window.ROWebAccountMenu?.refresh?.();
  }

  window.addEventListener("ro-web-ready",()=>{
    refreshAccountUi();
    if (pendingSummary) {
      const summary = pendingSummary;
      pendingSummary = null;
      window.setTimeout(()=>showSummary(summary),220);
    }
  });

  window.VIPRuntime = Object.freeze({
    version:VERSION,
    config:CONFIG,
    isActive:isActiveAccount,
    getLevel,
    getLiveBonusPercent,
    applyLiveBonus,
    formatExpiry,
    calculateOfflineRewards,
    claimAndGrantOfflineRewards,
    showSummary,
    setOfflineArm,
    getLastClaim:()=>lastClaim ? {...lastClaim} : null,
    getLastArmState:()=>lastArmState ? {...lastArmState} : null
  });
})();
