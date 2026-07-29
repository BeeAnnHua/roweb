//=======================================
// MapManager v0.8
// 地圖 / 傳送 / 探索紀錄
//=======================================

function initMap() {
  if (!maps || maps.length === 0) {
    addBattleLog("沒有地圖資料。");
    return;
  }

  if (!currentMap) {
    currentMap = maps[0];
  }

  discoverCurrentMap({ silent: true });
  updateMapUI();
  addBattleLog("目前地圖：" + currentMap.name);
}

function normalizeMapExplorationData() {
  if (!player) return;

  player.discoveredMaps = player.discoveredMaps || {};
  player.monsterBook = player.monsterBook || {};
  player.mapExploration = player.mapExploration || {};

  maps.forEach(map => {
    if (!player.mapExploration[map.id]) {
      player.mapExploration[map.id] = {
        discovered: false,
        discoveredAt: null,
        monsters: {},
        visits: 0
      };
    }
  });
}

function discoverCurrentMap(options = {}) {
  if (!player || !currentMap) return;
  normalizeMapExplorationData();

  const mapRecord = player.mapExploration[currentMap.id];
  const isFirstDiscovery = !mapRecord.discovered;

  mapRecord.discovered = true;
  mapRecord.discoveredAt = mapRecord.discoveredAt || new Date().toISOString();
  mapRecord.visits = Number(mapRecord.visits || 0) + 1;
  player.discoveredMaps[currentMap.id] = true;

  if (isFirstDiscovery && !options.silent) {
    addBattleLog("🗺️ 已發現新地圖：「" + currentMap.name + "」。");
  }
}

function recordMapMonsterDiscovery(monster) {
  if (!player || !currentMap || !monster) return;
  normalizeMapExplorationData();

  const mapRecord = player.mapExploration[currentMap.id];
  const monsterId = String(monster.id);
  const monsterRecord = mapRecord.monsters[monsterId] || {
    id: monster.id,
    name: monster.name,
    discovered: false,
    kills: 0,
    firstSeenAt: null
  };

  const firstSeen = !monsterRecord.discovered;
  monsterRecord.name = monster.name;
  monsterRecord.discovered = true;
  monsterRecord.kills = Number(monsterRecord.kills || 0) + 1;
  monsterRecord.firstSeenAt = monsterRecord.firstSeenAt || new Date().toISOString();
  monsterRecord.lastKilledAt = new Date().toISOString();
  mapRecord.monsters[monsterId] = monsterRecord;

  const bookRecord = player.monsterBook[monsterId] || {
    id: monster.id,
    name: monster.name,
    discovered: false,
    totalKills: 0,
    firstSeenAt: null
  };
  bookRecord.name = monster.name;
  bookRecord.discovered = true;
  bookRecord.totalKills = Number(bookRecord.totalKills || 0) + 1;
  bookRecord.firstSeenAt = bookRecord.firstSeenAt || monsterRecord.firstSeenAt;
  bookRecord.lastKilledAt = monsterRecord.lastKilledAt;
  player.monsterBook[monsterId] = bookRecord;

  if (firstSeen) {
    addBattleLog("🔎 在「" + currentMap.name + "」發現新的魔物。");
  }

  updateMapUI();
}

function getMapExplorationProgress(map) {
  if (!player || !map) {
    return { discovered: 0, total: map?.monsters?.length || 0, percent: 0 };
  }

  normalizeMapExplorationData();
  const mapRecord = player.mapExploration[map.id] || { monsters: {} };
  const total = Array.isArray(map.monsters) ? map.monsters.length : 0;
  const discovered = Object.keys(mapRecord.monsters || {}).filter(monsterId => {
    return mapRecord.monsters[monsterId]?.discovered;
  }).length;

  return {
    discovered,
    total,
    percent: total > 0 ? Math.round((discovered / total) * 100) : 0
  };
}


const RO_MAP_MONSTER_TOOLTIP_STATE = {
  mapId: null,
  anchor: null,
  timer: 0,
  hideTimer: 0,
  selectedMonsterId: null,
  pinned: false,
  view: "list",
  suppressWarpClickUntil: 0,
  mapWindowOpenGuardUntil: 0,
  activationSerial: 0
};

function isCoarseMapMonsterInput() {
  return Boolean(window.matchMedia?.("(max-width: 700px), (pointer: coarse)")?.matches);
}

function armMapMonsterInteractionGuard(durationMs = 850) {
  const until = Date.now() + Math.max(250, Number(durationMs || 0));
  RO_MAP_MONSTER_TOOLTIP_STATE.suppressWarpClickUntil = Math.max(
    Number(RO_MAP_MONSTER_TOOLTIP_STATE.suppressWarpClickUntil || 0),
    until
  );
  return until;
}

function isMapMonsterInteractionGuardActive() {
  return Date.now() < Number(RO_MAP_MONSTER_TOOLTIP_STATE.suppressWarpClickUntil || 0);
}
function armMapWindowOpenGuard(durationMs = 650) {
  RO_MAP_MONSTER_TOOLTIP_STATE.mapWindowOpenGuardUntil = Date.now() + Math.max(250, Number(durationMs || 0));
}
function isMapWindowOpenGuardActive() {
  return Date.now() < Number(RO_MAP_MONSTER_TOOLTIP_STATE.mapWindowOpenGuardUntil || 0);
}

function bindStableMapMonsterTap(element, handler) {
  if (!element || typeof handler !== "function" || element.dataset.stableMapTapBound === "1") return;
  element.dataset.stableMapTapBound = "1";
  let handledPointerId = null;
  let handledAt = 0;
  const stop = event => {
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
    window.clearTimeout(RO_MAP_MONSTER_TOOLTIP_STATE.hideTimer);
    armMapMonsterInteractionGuard();
  };
  element.addEventListener("pointerdown", event => {
    if (event.button !== undefined && event.button !== 0) return;
    stop(event);
    handledPointerId = event.pointerId;
    handledAt = Date.now();
    try { element.setPointerCapture?.(event.pointerId); } catch (_error) {}
  }, { passive: false });
  element.addEventListener("pointerup", event => {
    if (event.button !== undefined && event.button !== 0) return;
    if (handledPointerId !== null && event.pointerId !== handledPointerId) return;
    stop(event);
    handledPointerId = null;
    handledAt = Date.now();
    handler(event);
  }, { passive: false });
  element.addEventListener("pointercancel", event => {
    stop(event);
    handledPointerId = null;
  }, { passive: false });
  element.addEventListener("click", event => {
    // A touch pointerup may replace the current button before Safari emits its
    // synthetic click.  Do not let that ghost click activate the new button
    // now occupying the same screen coordinates.
    const guardedGhostClick = handledAt === 0 && isMapMonsterInteractionGuardActive();
    stop(event);
    if (guardedGhostClick || Date.now() - handledAt < 700) return;
    handledAt = Date.now();
    handler(event);
  });
}

function getMapMonsterById(monsterId) {
  const id = Number(monsterId || 0);
  return (monsters || []).find(monster => Number(monster?.id || monster?.officialId || 0) === id) || null;
}

function getMapMonsterSpawnProfile(mapData) {
  if (!mapData) return null;
  if (typeof getWorldMonsterProfile === "function") {
    const profile = getWorldMonsterProfile(mapData);
    if (profile) return profile;
  }
  const config = window.RO_WEB_DATA?.["data/monster_spawn_config.json"] || window.RO_WEB_DATA?.monster_spawn_config;
  const key = mapData.monsterSpawnProfile || mapData.id;
  return key ? config?.regions?.[key] || null : null;
}

function getMapUniqueMonsterAvailability(mapId, monsterId, now = Date.now()) {
  if (typeof getWorldMonsterRegionUniqueAvailability === "function") {
    return getWorldMonsterRegionUniqueAvailability(mapId, monsterId, now);
  }
  const state = player?.worldMonsterState?.regions?.[mapId]?.unique?.[String(Number(monsterId || 0))];
  const nextSpawnAt = Math.max(0, Number(state?.nextSpawnAt || 0));
  const respawning = state?.alive === false && nextSpawnAt > now;
  return {
    alive: !respawning,
    respawning,
    nextSpawnAt,
    remainingSeconds: respawning ? Math.max(1, Math.ceil((nextSpawnAt - now) / 1000)) : 0
  };
}

function formatMapMonsterRespawnDuration(totalSeconds) {
  const total = Math.max(0, Math.ceil(Number(totalSeconds || 0)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${hours}小時 ${minutes}分鐘 ${seconds}秒`;
}

function getMapMonsterDisplayValves() {
  if (typeof getWorldMonsterRuntimeValves === "function") {
    const valves = getWorldMonsterRuntimeValves();
    if (valves) return valves;
  }
  const config = window.RO_WEB_DATA?.["data/monster_spawn_config.json"] || window.RO_WEB_DATA?.monster_spawn_config || {};
  return config.global || {};
}

function allocateMapMonsterWeightedCounts(entries, total, options = {}) {
  const valid = (entries || []).filter(Boolean);
  const target = Math.max(0, Math.round(Number(total || 0)));
  const result = new Map(valid.map(entry => [entry, 0]));
  if (!valid.length || target <= 0) return result;

  const weightOf = entry => Math.max(1, Number(entry?.weight || entry?.raSpawnCount || 1));
  const capOf = entry => options.useCaps
    ? Math.max(0, Math.floor(Number(entry?.maxAlive ?? 1)))
    : Number.POSITIVE_INFINITY;
  let remaining = target;

  // Runtime 會優先滿足 minAlive；資訊卡使用相同原則，總和仍受目前倍率限制。
  if (options.useMinimums) {
    const minimumQueue = valid
      .flatMap(entry => Array.from({ length: Math.max(0, Math.floor(Number(entry?.minAlive || 0))) }, () => entry))
      .sort((a, b) => weightOf(b) - weightOf(a));
    for (const entry of minimumQueue) {
      if (remaining <= 0) break;
      const current = result.get(entry) || 0;
      if (current >= capOf(entry)) continue;
      result.set(entry, current + 1);
      remaining -= 1;
    }
  }

  while (remaining > 0) {
    const eligible = valid.filter(entry => (result.get(entry) || 0) < capOf(entry));
    if (!eligible.length) break;
    const totalWeight = eligible.reduce((sum, entry) => sum + weightOf(entry), 0);
    const shares = eligible.map(entry => {
      const exact = remaining * weightOf(entry) / Math.max(1, totalWeight);
      const capacity = capOf(entry) - (result.get(entry) || 0);
      return { entry, exact, whole: Math.min(capacity, Math.floor(exact)), fraction: exact - Math.floor(exact) };
    });
    let assigned = 0;
    for (const share of shares) {
      if (share.whole <= 0) continue;
      result.set(share.entry, (result.get(share.entry) || 0) + share.whole);
      assigned += share.whole;
    }
    remaining -= assigned;
    if (remaining <= 0) break;

    shares.sort((a, b) => b.fraction - a.fraction || weightOf(b.entry) - weightOf(a.entry));
    let progressed = false;
    for (const share of shares) {
      if (remaining <= 0) break;
      const current = result.get(share.entry) || 0;
      if (current >= capOf(share.entry)) continue;
      result.set(share.entry, current + 1);
      remaining -= 1;
      progressed = true;
    }
    if (!progressed) break;
  }
  return result;
}

function getMapMonsterDisplayCountPlan(mapData, profile) {
  const pool = Array.isArray(profile?.pool) ? profile.pool : [];
  const normalEntries = pool.filter(entry => String(entry?.category || "normal").toLowerCase() === "normal");
  const plantEntries = pool.filter(entry => String(entry?.category || "normal").toLowerCase() === "plant");
  const valves = getMapMonsterDisplayValves();
  const countRate = Math.max(0, Number(valves.monsterCountRate ?? valves.mob_count_rate ?? 100));
  const hardCap = Math.max(1, Number(valves.normalHardCap || 40));
  const baseTarget = Math.max(0, Number(profile?.targetNormalCountAt100 || 0));
  const targetTotal = typeof getWorldMonsterWindowTargetCount === "function"
    ? getWorldMonsterWindowTargetCount(profile)
    : Math.max(0, Math.min(hardCap, Math.round(baseTarget * countRate / 100)));
  const plantCap = plantEntries.reduce((sum, entry) => sum + Math.max(0, Number(entry?.maxAlive ?? 1)), 0);
  const plantTotal = plantEntries.length && targetTotal > 0
    ? Math.min(plantCap, Math.max(1, Math.round(targetTotal * 0.08)))
    : 0;
  const normalTotal = Math.max(0, targetTotal - plantTotal);
  const counts = new Map();
  allocateMapMonsterWeightedCounts(normalEntries, normalTotal, { useMinimums: true }).forEach((value, entry) => counts.set(entry, value));
  allocateMapMonsterWeightedCounts(plantEntries, plantTotal, { useCaps: true }).forEach((value, entry) => counts.set(entry, value));
  return { counts, targetTotal, countRate };
}

function formatMapMonsterCount(entry, countPlan) {
  const category = String(entry?.category || "normal").toLowerCase();
  if (["normal", "plant"].includes(category) && countPlan?.counts?.has(entry)) {
    return Math.max(0, Number(countPlan.counts.get(entry) || 0));
  }
  if (["rare", "boss", "mvp"].includes(category)) {
    return Math.max(1, Number(entry?.maxAlive ?? 1));
  }
  return Math.max(1, Number(entry?.raSpawnCount || entry?.weight || 1));
}

const RO_MAP_MONSTER_DROP_CACHE = new Map();
function formatMonsterDropChance(chance){const value=Math.max(0,Number(chance||0));if(value>=10000)return "100%";if(value>=100)return `${(value/100).toFixed(value%100?2:0)}%`;return `${(value/100).toFixed(2)}%`;}
function getMapGradeBonusEntries(mapId,monsterId){const profile=window.RO_WEB_DATA?.["data/enchant_grade_map_drops.json"]?.profiles?.[mapId];return (profile?.entries||[]).filter(entry=>!Array.isArray(entry.monsterIds)||entry.monsterIds.includes(Number(monsterId)));}
function buildMonsterDropCacheEntry(mapId,monster){
  const key=`${mapId}:${Number(monster?.id||0)}`;if(RO_MAP_MONSTER_DROP_CACHE.has(key))return RO_MAP_MONSTER_DROP_CACHE.get(key);
  const normalize=(drop,source)=>{const id=Number(drop?.itemId??drop?.id??0),data=typeof getItemData==="function"?getItemData(id):null;return {id,name:data?.name||drop?.displayName||drop?.name||`Item ${id}`,icon:data?.icon||`images/items/${data?.officialId||id}.webp`,chance:Number(drop?.chance||0),qtyMin:Math.max(1,Number(drop?.qtyMin||drop?.amount||1)),qtyMax:Math.max(1,Number(drop?.qtyMax||drop?.qtyMin||drop?.amount||1)),source,type:String(data?.type||"")};};
  const original=(monster?.drops||[]).map(drop=>normalize(drop,"original"));
  const mvp=(monster?.mvpDrops||[]).map(drop=>normalize(drop,"mvp"));
  const mapEntries=getMapGradeBonusEntries(mapId,monster?.id).filter(entry=>!(entry.skipIfOriginalDrop&&[...original,...mvp].some(drop=>drop.id===Number(entry.itemId))));
  const scaled=drop=>window.EnchantGradeRuntime?.getScaledMapDropChance?.(drop)??window.EnchantGradeRuntime?.getScaledGradeDropChance?.(drop.chance)??drop.chance;
  const mapNormal=mapEntries.filter(drop=>["normal","globaldrop","global_drop"].includes(String(drop.rateMode||"").toLowerCase())).map(drop=>normalize({...drop,chance:scaled(drop)},"original"));
  const bonus=mapEntries.filter(drop=>!["normal","globaldrop","global_drop"].includes(String(drop.rateMode||"").toLowerCase())).map(drop=>normalize({...drop,chance:scaled(drop)},"grade"));
  const result={original:[...original,...mapNormal],mvp,bonus};RO_MAP_MONSTER_DROP_CACHE.set(key,result);return result;
}
function renderMonsterDropGroup(title,rows,kind){if(!rows.length)return "";return `<section class="map-monster-drop-group is-${kind}"><h5>${title}</h5>${rows.map(row=>`<div class="map-monster-drop-row"><img src="${row.icon}" alt="" onerror="this.style.display='none'"><span><b>${row.name}</b><small>${row.qtyMin===row.qtyMax?`×${row.qtyMin}`:`×${row.qtyMin}～${row.qtyMax}`}｜${formatMonsterDropChance(row.chance)}</small></span></div>`).join("")}</section>`;}
function syncPinnedMonsterDropRow(tooltip){
  if(!tooltip)return;
  tooltip.classList.toggle("is-drop-pinned",Boolean(RO_MAP_MONSTER_TOOLTIP_STATE.pinned));
  tooltip.querySelectorAll("[data-monster-drop-id]").forEach(row=>{
    const active=Number(row.dataset.monsterDropId)===Number(RO_MAP_MONSTER_TOOLTIP_STATE.selectedMonsterId);
    row.classList.toggle("is-selected",active);
    row.setAttribute("aria-pressed",active&&RO_MAP_MONSTER_TOOLTIP_STATE.pinned?"true":"false");
  });
}
function getMapMonsterDistributionData(mapId){
  return (maps||[]).find(map=>String(map?.id||"")===String(mapId||""))||null;
}
function getMapMonsterViewerMapData(){
  return getMapMonsterDistributionData(RO_MAP_MONSTER_TOOLTIP_STATE.mapId);
}
function closeMapWindowFromMonsterViewer(){
  hideMapMonsterDistributionTooltip();
  const mapWindow=document.getElementById("map-window");
  if(mapWindow)mapWindow.classList.add("hidden-window");
  if(typeof updateToggleButtonStates==="function")updateToggleButtonStates();
}
function enterMapFromMonsterViewer(){
  const mapId=String(RO_MAP_MONSTER_TOOLTIP_STATE.mapId||"");
  if(!mapId)return;
  const alreadyHere=Boolean(!player?.currentCity&&String(currentMap?.id||"")===mapId);
  hideMapMonsterDistributionTooltip();
  if(!alreadyHere)changeMap(mapId);
  const mapWindow=document.getElementById("map-window");
  if(mapWindow)mapWindow.classList.add("hidden-window");
  if(typeof updateToggleButtonStates==="function")updateToggleButtonStates();
}
function buildMapMonsterListHeaderActions(mapData){
  // Touch users need explicit navigation because the monster viewer covers the
  // map browser.  Desktop users keep the compact hover/click viewer and do not
  // need map-travel buttons inside the tooltip.
  if(!isCoarseMapMonsterInput())return "";
  const current=Boolean(!player?.currentCity&&String(currentMap?.id||"")===String(mapData?.id||""));
  return `<button type="button" class="map-monster-view-action map-monster-enter-map${current?' is-current':''}" aria-label="進入此地圖">進入地圖</button><button type="button" class="map-monster-view-action map-monster-return-map" aria-label="返回地圖傳送清單">返回</button>`;
}
function bindMapMonsterViewerNavigation(tooltip){
  if(!tooltip)return;
  tooltip.querySelectorAll(".map-monster-enter-map").forEach(button=>bindStableMapMonsterTap(button,enterMapFromMonsterViewer));
  tooltip.querySelectorAll(".map-monster-return-map").forEach(button=>bindStableMapMonsterTap(button,()=>{
    armMapMonsterInteractionGuard(500);
    hideMapMonsterDistributionTooltip();
  }));
  tooltip.querySelectorAll(".map-monster-return-list").forEach(button=>bindStableMapMonsterTap(button,()=>{
    window.clearTimeout(RO_MAP_MONSTER_TOOLTIP_STATE.hideTimer);
    armMapMonsterInteractionGuard(500);
    restoreMapMonsterListView(tooltip);
  }));
}
function restoreMapMonsterListView(tooltip,options={}){
  if(!tooltip)return;
  // Touch viewers behave like an explicit page, not a hover tooltip.
  // Keep the list pinned until the player presses Back / Enter Map / Close.
  RO_MAP_MONSTER_TOOLTIP_STATE.pinned=isCoarseMapMonsterInput();
  RO_MAP_MONSTER_TOOLTIP_STATE.view="list";
  if(options.keepSelection!==true)RO_MAP_MONSTER_TOOLTIP_STATE.selectedMonsterId=null;
  tooltip.classList.remove("is-drop-pinned","is-drop-detail-view");
  const list=tooltip.querySelector(".map-monster-distribution-list");
  const host=tooltip.querySelector(".map-monster-drop-detail");
  const action=tooltip.querySelector(".map-monster-header-action");
  const mapData=getMapMonsterViewerMapData();
  if(list)list.hidden=false;
  if(host){host.hidden=true;host.innerHTML="";}
  if(action)action.innerHTML=buildMapMonsterListHeaderActions(mapData);
  bindMapMonsterViewerNavigation(tooltip);
  syncPinnedMonsterDropRow(tooltip);
  tooltip.scrollTop=0;
}
function unpinMapMonsterDropDetail(options={}){
  const tooltip=document.getElementById("map-monster-distribution-tooltip");
  restoreMapMonsterListView(tooltip);
  if(options.hide===true)hideMapMonsterDistributionTooltip();
}
function renderMapMonsterDropDetail(tooltip,mapId,monsterId,options={}){
  const host=tooltip?.querySelector?.(".map-monster-drop-detail");
  const list=tooltip?.querySelector?.(".map-monster-distribution-list");
  const action=tooltip?.querySelector?.(".map-monster-header-action");
  const monster=getMapMonsterById(monsterId);
  if(!host||!monster)return;
  const drops=buildMonsterDropCacheEntry(mapId,monster);
  RO_MAP_MONSTER_TOOLTIP_STATE.pinned=true;
  RO_MAP_MONSTER_TOOLTIP_STATE.view="detail";
  RO_MAP_MONSTER_TOOLTIP_STATE.selectedMonsterId=Number(monsterId);
  const renderedGroups = [
    renderMonsterDropGroup("原始掉落",drops.original,"original"),
    renderMonsterDropGroup("MVP 額外掉落",drops.mvp,"mvp"),
    renderMonsterDropGroup("升階材料額外掉落",drops.bonus,"grade")
  ].filter(Boolean).join("");
  const coarseViewer=isCoarseMapMonsterInput();
  // HE: navigation stays in the sticky header on every device.  Keeping the
  // footer free of duplicate buttons leaves more room for long drop tables.
  host.innerHTML=`<div class="map-monster-drop-title"><b>${monster.name||`怪物 ${monsterId}`}掉落物</b><small>點擊物品可查看詳細資料；掉落資料快取不參與掛機運算</small></div>${renderedGroups||'<div class="map-monster-drop-empty">目前沒有可顯示的掉落資料</div>'}`;
  if(list)list.hidden=true;
  host.hidden=false;
  if(action){
    const mapData=getMapMonsterViewerMapData();
    const current=Boolean(!player?.currentCity&&String(currentMap?.id||"")===String(mapData?.id||""));
    action.innerHTML=coarseViewer
      ? `<button type="button" class="map-monster-view-action map-monster-enter-map${current?' is-current':''}" aria-label="進入此地圖">進入地圖</button><button type="button" class="map-monster-view-action map-monster-return-list" aria-label="返回怪物清單">返回</button>`
      : `<button type="button" class="map-monster-view-action map-monster-return-list is-desktop-only" aria-label="返回怪物清單">返回怪物清單</button>`;
  }
  bindMapMonsterViewerNavigation(tooltip);
  tooltip.classList.add("is-drop-pinned","is-drop-detail-view");
  syncPinnedMonsterDropRow(tooltip);
  tooltip.scrollTop=0;
}
function bindMapMonsterDropInteractions(tooltip,mapId){
  if(!tooltip)return;
  tooltip.querySelectorAll("[data-monster-drop-id]").forEach(row=>{
    const monsterId=Number(row.dataset.monsterDropId);
    row.title="點擊查看掉落物";
    bindStableMapMonsterTap(row,()=>{
      RO_MAP_MONSTER_TOOLTIP_STATE.activationSerial += 1;
      renderMapMonsterDropDetail(tooltip,mapId,monsterId,{pin:true});
    });
  });
  if(RO_MAP_MONSTER_TOOLTIP_STATE.view==="detail"&&RO_MAP_MONSTER_TOOLTIP_STATE.selectedMonsterId){
    renderMapMonsterDropDetail(tooltip,mapId,RO_MAP_MONSTER_TOOLTIP_STATE.selectedMonsterId,{pin:true});
  }else{
    restoreMapMonsterListView(tooltip,{keepSelection:true});
  }
  syncPinnedMonsterDropRow(tooltip);
}
function createMapMonsterDistributionSection(title, icon, entries, options = {}) {
  if (!entries.length) return "";
  const rows = entries.map(entry => {
    const monster = getMapMonsterById(entry.monsterId);
    const name = monster?.name || `怪物 ${entry.monsterId}`;
    let stateHtml = "";
    if (options.liveState) {
      const state = getMapUniqueMonsterAvailability(RO_MAP_MONSTER_TOOLTIP_STATE.mapId, entry.monsterId);
      stateHtml = state.respawning
        ? `<em class="map-monster-state is-respawning">重生倒數 ${formatMapMonsterRespawnDuration(state.remainingSeconds)}</em>`
        : `<em class="map-monster-state is-alive">存在中</em>`;
    }
    return `<button type="button" class="map-monster-distribution-row" data-monster-drop-id="${Number(entry.monsterId)}"><span>${name}</span>${stateHtml}</button>`;
  }).join("");
  return `<section class="map-monster-distribution-section"><h4><span aria-hidden="true">${icon}</span>${title}</h4>${rows}</section>`;
}

function buildMapMonsterDistributionHtml(mapData) {
  const profile = getMapMonsterSpawnProfile(mapData);
  const pool = Array.isArray(profile?.pool) ? profile.pool : [];
  const ordinary = pool.filter(entry => ["normal", "plant", "rare"].includes(String(entry?.category || "normal").toLowerCase()));
  const bosses = pool.filter(entry => String(entry?.category || "").toLowerCase() === "boss");
  const mvps = pool.filter(entry => String(entry?.category || "").toLowerCase() === "mvp");
  const recommended = mapData?.recommendedLevel ? `<small class="map-monster-level">建議等級 ${mapData.recommendedLevel}</small>` : "";
  const sections = [
    createMapMonsterDistributionSection("一般怪物", "🐾", ordinary),
    createMapMonsterDistributionSection("Boss 怪物", "👑", bosses, { liveState: true }),
    createMapMonsterDistributionSection("MVP", "🏆", mvps, { liveState: true })
  ].filter(Boolean).join("");
  return `<div class="map-monster-distribution-header"><span class="map-monster-distribution-heading"><b>${mapData?.displayName || mapData?.name || "怪物地區"}</b>${recommended}</span><span class="map-monster-header-action">${buildMapMonsterListHeaderActions(mapData)}</span></div><div class="map-monster-distribution-list">${sections || '<div class="map-monster-distribution-empty">此地區尚無怪物資料</div>'}</div><section class="map-monster-drop-detail" hidden></section>`;
}

function getMapMonsterDistributionTooltip() {
  let tooltip = document.getElementById("map-monster-distribution-tooltip");
  if (tooltip) return tooltip;
  tooltip = document.createElement("aside");
  tooltip.id = "map-monster-distribution-tooltip";
  tooltip.className = "map-monster-distribution-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  tooltip.addEventListener("pointerenter", () => {
    window.clearTimeout(RO_MAP_MONSTER_TOOLTIP_STATE.hideTimer);
    RO_MAP_MONSTER_TOOLTIP_STATE.hideTimer = 0;
  });
  tooltip.addEventListener("pointerleave", scheduleHideMapMonsterDistributionTooltip);
  tooltip.addEventListener("pointerdown", event => {
    event.stopPropagation();
    window.clearTimeout(RO_MAP_MONSTER_TOOLTIP_STATE.hideTimer);
  }, { passive: true });
  tooltip.addEventListener("click", event => event.stopPropagation());
  document.body.appendChild(tooltip);
  return tooltip;
}

function positionMapMonsterDistributionTooltip() {
  const tooltip = document.getElementById("map-monster-distribution-tooltip");
  const anchor = RO_MAP_MONSTER_TOOLTIP_STATE.anchor;
  if (!tooltip || tooltip.hidden || !anchor?.isConnected) return;
  if (tooltip.classList.contains("is-embedded")) return;
  const rect = anchor.getBoundingClientRect();
  const viewportWidth = Math.max(1, window.visualViewport?.width || window.innerWidth || document.documentElement.clientWidth || 1280);
  const viewportHeight = Math.max(1, window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 720);
  const gap = 10;
  const compactViewport = viewportWidth <= 700 || Boolean(window.matchMedia?.("(pointer: coarse)")?.matches);
  const width = Math.min(compactViewport ? 292 : 326, Math.max(compactViewport ? 238 : 260, tooltip.offsetWidth || 300));
  const height = Math.min(viewportHeight - 16, tooltip.offsetHeight || (compactViewport ? 300 : 390));
  let left;
  let top;
  if (compactViewport) {
    left = Math.max(8, Math.min((viewportWidth - width) / 2, viewportWidth - width - 8));
    top = 8;
  } else {
    left = rect.left - width - gap;
    if (left < 8) left = rect.right + gap;
    if (left + width > viewportWidth - 8) left = Math.max(8, viewportWidth - width - 8);
    top = Math.max(8, Math.min(rect.top, viewportHeight - height - 8));
  }
  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
}

function refreshMapMonsterDistributionTooltip() {
  const tooltip = document.getElementById("map-monster-distribution-tooltip");
  if (!tooltip || tooltip.hidden || !RO_MAP_MONSTER_TOOLTIP_STATE.mapId) return;
  const mapData = (maps || []).find(map => map.id === RO_MAP_MONSTER_TOOLTIP_STATE.mapId);
  if (!mapData) return hideMapMonsterDistributionTooltip();
  const previousScrollTop = tooltip.scrollTop;
  const wasDetail = RO_MAP_MONSTER_TOOLTIP_STATE.view === "detail";
  tooltip.innerHTML = buildMapMonsterDistributionHtml(mapData);
  bindMapMonsterDropInteractions(tooltip,mapData.id);
  tooltip.scrollTop = wasDetail ? 0 : previousScrollTop;
  positionMapMonsterDistributionTooltip();
}

function showMapMonsterDistributionTooltip(mapData, anchor) {
  if (!mapData || !anchor) return;
  const activeTooltip = document.getElementById("map-monster-distribution-tooltip");
  if (
    isCoarseMapMonsterInput() &&
    isMapMonsterInteractionGuardActive() &&
    activeTooltip &&
    !activeTooltip.hidden &&
    RO_MAP_MONSTER_TOOLTIP_STATE.mapId &&
    RO_MAP_MONSTER_TOOLTIP_STATE.mapId !== mapData.id
  ) return;
  window.clearTimeout(RO_MAP_MONSTER_TOOLTIP_STATE.hideTimer);
  window.clearInterval(RO_MAP_MONSTER_TOOLTIP_STATE.timer);
  const mapChanged=RO_MAP_MONSTER_TOOLTIP_STATE.mapId&&RO_MAP_MONSTER_TOOLTIP_STATE.mapId!==mapData.id;
  if(mapChanged){RO_MAP_MONSTER_TOOLTIP_STATE.pinned=false;RO_MAP_MONSTER_TOOLTIP_STATE.selectedMonsterId=null;RO_MAP_MONSTER_TOOLTIP_STATE.view="list";}
  RO_MAP_MONSTER_TOOLTIP_STATE.mapId = mapData.id;
  RO_MAP_MONSTER_TOOLTIP_STATE.anchor = anchor;
  const tooltip = getMapMonsterDistributionTooltip();
  const embedded = Boolean(window.matchMedia?.("(max-width: 700px), (pointer: coarse)")?.matches);
  if (embedded) {
    const mapBody = document.querySelector("#map-window .map-template-body");
    if (mapBody && tooltip.parentElement !== mapBody) mapBody.appendChild(tooltip);
    mapBody?.classList.add("has-monster-overlay");
    tooltip.classList.add("is-embedded");
    tooltip.style.left = "";
    tooltip.style.top = "";
  } else {
    tooltip.closest?.(".map-template-body")?.classList.remove("has-monster-overlay");
    if (tooltip.parentElement !== document.body) document.body.appendChild(tooltip);
    tooltip.classList.remove("is-embedded");
  }
  tooltip.hidden = false;
  tooltip.innerHTML = buildMapMonsterDistributionHtml(mapData);
  bindMapMonsterDropInteractions(tooltip,mapData.id);
  positionMapMonsterDistributionTooltip();
}

function scheduleHideMapMonsterDistributionTooltip() {
  if(RO_MAP_MONSTER_TOOLTIP_STATE.pinned)return;
  window.clearTimeout(RO_MAP_MONSTER_TOOLTIP_STATE.hideTimer);
  RO_MAP_MONSTER_TOOLTIP_STATE.hideTimer = window.setTimeout(()=>{if(!RO_MAP_MONSTER_TOOLTIP_STATE.pinned)hideMapMonsterDistributionTooltip();}, 180);
}

function hideMapMonsterDistributionTooltip() {
  window.clearTimeout(RO_MAP_MONSTER_TOOLTIP_STATE.hideTimer);
  window.clearInterval(RO_MAP_MONSTER_TOOLTIP_STATE.timer);
  RO_MAP_MONSTER_TOOLTIP_STATE.hideTimer = 0;
  RO_MAP_MONSTER_TOOLTIP_STATE.timer = 0;
  RO_MAP_MONSTER_TOOLTIP_STATE.mapId = null;
  RO_MAP_MONSTER_TOOLTIP_STATE.selectedMonsterId = null;
  RO_MAP_MONSTER_TOOLTIP_STATE.pinned = false;
  RO_MAP_MONSTER_TOOLTIP_STATE.view = "list";
  RO_MAP_MONSTER_TOOLTIP_STATE.anchor = null;
  const tooltip = document.getElementById("map-monster-distribution-tooltip");
  tooltip?.closest?.(".map-current-card")?.classList.remove("has-monster-info");
  tooltip?.closest?.(".map-template-body")?.classList.remove("has-monster-overlay");
  if (tooltip) tooltip.hidden = true;
}

function isMapWindowChromeInteractionTarget(target){
  return Boolean(target?.closest?.("#map-window > .window-title, #map-window > .window-title .window-close, #map-window > .window-title .window-size-cycle"));
}
window.addEventListener("resize", positionMapMonsterDistributionTooltip, { passive: true });
window.visualViewport?.addEventListener?.("resize", positionMapMonsterDistributionTooltip, { passive: true });
window.visualViewport?.addEventListener?.("scroll", positionMapMonsterDistributionTooltip, { passive: true });
document.addEventListener("pointerdown",event=>{
  const tooltip=document.getElementById("map-monster-distribution-tooltip");
  if (
    isCoarseMapMonsterInput() &&
    tooltip &&
    !tooltip.hidden &&
    tooltip.classList.contains("is-embedded") &&
    !tooltip.contains(event.target) &&
    !isMapWindowChromeInteractionTarget(event.target)
  ) {
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
    armMapMonsterInteractionGuard();
    return;
  }
  if(!RO_MAP_MONSTER_TOOLTIP_STATE.pinned)return;
  if(tooltip?.contains(event.target)||RO_MAP_MONSTER_TOOLTIP_STATE.anchor?.contains?.(event.target))return;
  hideMapMonsterDistributionTooltip();
},{passive:false,capture:true});

document.addEventListener("click",event=>{
  const tooltip=document.getElementById("map-monster-distribution-tooltip");
  if (
    isCoarseMapMonsterInput() &&
    tooltip &&
    !tooltip.hidden &&
    tooltip.classList.contains("is-embedded") &&
    !tooltip.contains(event.target) &&
    !isMapWindowChromeInteractionTarget(event.target) &&
    (RO_MAP_MONSTER_TOOLTIP_STATE.pinned || isMapMonsterInteractionGuardActive())
  ) {
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
  }
},true);
window.showMapMonsterDistributionTooltip = showMapMonsterDistributionTooltip;
window.hideMapMonsterDistributionTooltip = hideMapMonsterDistributionTooltip;
window.unpinMapMonsterDropDetail = unpinMapMonsterDropDetail;
window.enterMapFromMonsterViewer = enterMapFromMonsterViewer;
window.closeMapWindowFromMonsterViewer = closeMapWindowFromMonsterViewer;
window.armMapWindowOpenGuard = armMapWindowOpenGuard;

// 0.9.82FK: auto battle records monster discoveries after every kill.  The old
// updateMapUI() rebuilt the entire destination list each time, replacing the
// actively-scrolled panel and snapping it back to the first destination.
// Keep a stable render signature and preserve all relevant scroll containers
// whenever a real location/data change requires a rebuild.
const RO_MAP_UI_VIEW_STATE = {
  restoreFrame: 0
};


// 0.9.82FQ：地圖收藏使用玩家存檔保存。收藏地圖置頂；其餘依 regionOrder 排序。
function getFavoriteMapIds() {
  if (!player) return [];
  const validIds = new Set((maps || []).map(map => String(map.id)));
  const source = Array.isArray(player.favoriteMaps) ? player.favoriteMaps : [];
  const normalized = Array.from(new Set(source.map(String).filter(id => validIds.has(id))));
  player.favoriteMaps = normalized;
  return normalized;
}

function isFavoriteMap(mapId) {
  return getFavoriteMapIds().includes(String(mapId));
}

function getMapNormalOrder(map) {
  const order = Number(map?.regionOrder ?? map?.order ?? 9999);
  return Number.isFinite(order) ? order : 9999;
}

function getSortedFieldMapDestinations() {
  const favoriteIds = new Set(getFavoriteMapIds());
  return (maps || [])
    .map(map => ({
      kind: "field",
      id: String(map.id),
      name: map.displayName || map.name,
      note: map.description || map.note || "",
      data: map,
      favorite: favoriteIds.has(String(map.id))
    }))
    .sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      const orderDiff = getMapNormalOrder(a.data) - getMapNormalOrder(b.data);
      if (orderDiff) return orderDiff;
      return String(a.name).localeCompare(String(b.name), "zh-Hant");
    });
}

function toggleFavoriteMap(mapId) {
  if (!player) return false;
  const id = String(mapId || "");
  if (!(maps || []).some(map => String(map.id) === id)) return false;
  const favorites = new Set(getFavoriteMapIds());
  if (favorites.has(id)) favorites.delete(id);
  else favorites.add(id);
  player.favoriteMaps = Array.from(favorites);
  const list = document.getElementById("map-list");
  if (list) delete list.dataset.renderSignature;
  if (typeof saveGame === "function") saveGame();
  updateMapUI();
  return favorites.has(id);
}
window.getFavoriteMapIds = getFavoriteMapIds;
window.isFavoriteMap = isFavoriteMap;
window.toggleFavoriteMap = toggleFavoriteMap;

function buildMapUIRenderSignature(currentCityData) {
  const location = currentCityData
    ? ["city", currentCityData.id, currentCityData.name, currentCityData.thumb, currentCityData.hoverDescription || currentCityData.description || currentCityData.role || ""]
    : ["field", currentMap?.id, currentMap?.name, currentMap?.thumb];
  const fieldDestinations = (maps || []).map(map => [map.id, map.displayName || map.name, getMapNormalOrder(map)]);
  return JSON.stringify([location, fieldDestinations, getFavoriteMapIds()]);
}

function captureMapUIScrollState(mapListEl) {
  const body = mapListEl?.closest?.(".map-template-body") || document.querySelector?.("#map-window .map-template-body");
  const warp = mapListEl?.querySelector?.(".map-warp-panel");
  return {
    bodyScrollTop: Math.max(0, Number(body?.scrollTop || 0)),
    listScrollTop: Math.max(0, Number(mapListEl?.scrollTop || 0)),
    warpScrollTop: Math.max(0, Number(warp?.scrollTop || 0))
  };
}

function restoreMapUIScrollState(mapListEl, snapshot) {
  if (!mapListEl || !snapshot) return;
  const apply = () => {
    const body = mapListEl.closest?.(".map-template-body") || document.querySelector?.("#map-window .map-template-body");
    const warp = mapListEl.querySelector?.(".map-warp-panel");
    if (body) body.scrollTop = snapshot.bodyScrollTop;
    mapListEl.scrollTop = snapshot.listScrollTop;
    if (warp) warp.scrollTop = snapshot.warpScrollTop;
  };
  apply();
  if (typeof window.requestAnimationFrame === "function") {
    if (RO_MAP_UI_VIEW_STATE.restoreFrame) window.cancelAnimationFrame?.(RO_MAP_UI_VIEW_STATE.restoreFrame);
    RO_MAP_UI_VIEW_STATE.restoreFrame = window.requestAnimationFrame(() => {
      RO_MAP_UI_VIEW_STATE.restoreFrame = 0;
      apply();
    });
  }
}

function updateMapUI() {
  const currentMapNameEl = document.getElementById("current-map-name");
  const mapListEl = document.getElementById("map-list");

  const currentCityData = player?.currentCity && typeof getCityData === "function" ? getCityData(player.currentCity) : null;
  const locationData = currentCityData || currentMap || null;
  const locationName = currentCityData ? currentCityData.name : (currentMap?.name || "尚未選擇");

  if (currentMapNameEl) {
    currentMapNameEl.textContent = currentCityData
      ? `目前城鎮：${locationName}`
      : `野外地圖：${locationName}`;
  }

  if (!mapListEl) return;

  const scrollSnapshot = captureMapUIScrollState(mapListEl);
  const renderSignature = buildMapUIRenderSignature(currentCityData);
  // Monster kills and auto-battle status refreshes do not change this layout.
  // Avoid replacing live buttons/scrollbars while the player is reading it.
  if (mapListEl.dataset.renderSignature === renderSignature && mapListEl.childElementCount > 0) {
    return;
  }

  mapListEl.innerHTML = "";

  const info = document.createElement("div");
  info.className = "map-current-card";

  const thumb = document.createElement("img");
  thumb.className = "map-current-thumb";
  thumb.src = locationData?.thumb || currentMap?.thumb || "images/maps/world/mjolnir_3x3/mjolnir_3x3_region_small_0_9_82EH.webp";
  thumb.alt = locationName;
  thumb.onerror = function () { thumb.style.display = "none"; };

  const title = document.createElement("div");
  title.className = "map-current-title";
  title.textContent = locationName;

  const desc = document.createElement("div");
  desc.className = "map-current-desc";
  desc.textContent = currentCityData
    ? (currentCityData.hoverDescription || currentCityData.description || currentCityData.role || "城鎮據點")
    : "";

  info.appendChild(thumb);
  info.appendChild(title);
  if (currentCityData) info.appendChild(desc);

  const warpPanel = document.createElement("div");
  warpPanel.className = "map-warp-panel";

  const warpTitle = document.createElement("div");
  warpTitle.className = "map-warp-title";
  warpTitle.textContent = "傳送點";
  warpPanel.appendChild(warpTitle);

  const destinations = getSortedFieldMapDestinations();
  let renderedGroup = null;

  destinations.forEach(dest => {
    const group = dest.favorite ? "favorite" : "normal";
    if (group !== renderedGroup) {
      renderedGroup = group;
      const groupTitle = document.createElement("div");
      groupTitle.className = "map-warp-group-title " + (dest.favorite ? "is-favorite-group" : "is-normal-group");
      groupTitle.textContent = dest.favorite ? "🌟 我的最愛" : "全部地圖";
      warpPanel.appendChild(groupTitle);
    }

    const row = document.createElement("div");
    row.className = "map-warp-entry" + (dest.favorite ? " is-favorite" : "");

    const btn = document.createElement("button");
    btn.type = "button";
    const isCurrent = Boolean(!currentCityData && currentMap && currentMap.id === dest.id);
    btn.className = "map-warp-button map-region-warp-button" + (isCurrent ? " is-current" : "");
    if (isCurrent) btn.setAttribute("aria-disabled", "true");
    btn.innerHTML = `<b>${dest.name}</b>`;
    btn.setAttribute("aria-label", `${dest.name}：查看怪物分布`);
    btn.addEventListener("pointerenter", event => {
      if (event.pointerType === "touch" || event.pointerType === "pen" || isCoarseMapMonsterInput()) return;
      showMapMonsterDistributionTooltip(dest.data, btn);
    });
    btn.addEventListener("pointerleave", event => {
      if (event.pointerType === "touch" || event.pointerType === "pen" || isCoarseMapMonsterInput()) return;
      scheduleHideMapMonsterDistributionTooltip();
    });
    btn.addEventListener("focus", () => {
      if (isCoarseMapMonsterInput()) return;
      showMapMonsterDistributionTooltip(dest.data, btn);
    });
    btn.addEventListener("blur", () => {
      if (isCoarseMapMonsterInput()) return;
      scheduleHideMapMonsterDistributionTooltip();
    });
    btn.onclick = function (event) {
      const coarsePointer = Boolean(window.matchMedia?.("(max-width: 700px), (pointer: coarse)")?.matches);
      const activeTooltip = document.getElementById("map-monster-distribution-tooltip");
      if (
        coarsePointer &&
        activeTooltip &&
        !activeTooltip.hidden &&
        activeTooltip.classList.contains("is-embedded") &&
        (RO_MAP_MONSTER_TOOLTIP_STATE.pinned || isMapMonsterInteractionGuardActive())
      ) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        event?.stopImmediatePropagation?.();
        armMapMonsterInteractionGuard();
        return;
      }
      if (coarsePointer) {
        // Opening the Map window itself can emit a delayed synthetic click on
        // the first destination under the finger.  Ignore that one click so
        // the player always sees the map browser first.
        if (isMapWindowOpenGuardActive()) {
          event?.preventDefault?.();
          event?.stopPropagation?.();
          event?.stopImmediatePropagation?.();
          return;
        }
        showMapMonsterDistributionTooltip(dest.data, btn);
        return;
      }
      hideMapMonsterDistributionTooltip();
      if (isCurrent) return;
      changeMap(dest.id);
    };

    const favoriteButton = document.createElement("button");
    favoriteButton.type = "button";
    favoriteButton.className = "map-favorite-toggle" + (dest.favorite ? " is-active" : "");
    favoriteButton.textContent = dest.favorite ? "🌟" : "⭐";
    favoriteButton.title = dest.favorite ? `從我的最愛移除 ${dest.name}` : `將 ${dest.name} 加入我的最愛`;
    favoriteButton.setAttribute("aria-label", favoriteButton.title);
    favoriteButton.setAttribute("aria-pressed", dest.favorite ? "true" : "false");
    favoriteButton.onclick = function (event) {
      event.preventDefault();
      event.stopPropagation();
      hideMapMonsterDistributionTooltip();
      toggleFavoriteMap(dest.id);
    };

    row.appendChild(btn);
    row.appendChild(favoriteButton);
    warpPanel.appendChild(row);
  });

  mapListEl.appendChild(info);
  mapListEl.appendChild(warpPanel);
  mapListEl.dataset.renderSignature = renderSignature;
  restoreMapUIScrollState(mapListEl, scrollSnapshot);
}

function clearFieldCombatRuntimeForTravel() {
  if (typeof stopAutoBattle === "function") stopAutoBattle({ silent: true });
  if (typeof clearBattleTimersAndMonster === "function") clearBattleTimersAndMonster({ clearMonster: true });
  if (typeof clearWorldMonsterFieldTest === "function") clearWorldMonsterFieldTest();
  currentMonster = null;
  if (typeof updateMonsterUI === "function") updateMonsterUI();
  return true;
}
window.clearFieldCombatRuntimeForTravel = clearFieldCombatRuntimeForTravel;

function changeMap(mapId) {
  const selectedMap = maps.find(map => map.id === mapId);

  if (!selectedMap) {
    addBattleLog("找不到地圖：" + mapId);
    return;
  }

  clearFieldCombatRuntimeForTravel();

  currentMap = selectedMap;
  if (player) {
    player.map = currentMap.id;
    player.lastFieldMap = currentMap.id;
    player.currentCity = null;
    // 0.9.82EB：從城鎮切回世界地圖時，清掉 Town Mode 殘留。
    if (typeof window.recoverROStudioAtlasAfterTownExit === "function") {
      window.recoverROStudioAtlasAfterTownExit();
    }
    if (currentMap.spawnPoint) {
      player.position = player.position || {};
      player.position.x = Number(currentMap.spawnPoint.x || 0);
      player.position.y = Number(currentMap.spawnPoint.y || 0);
      player.position.targetX = null;
      player.position.targetY = null;
    }
  }

  discoverCurrentMap({ silent: false });
  updateMapUI();
  if (typeof updateTownUI === "function") updateTownUI();
  updateBattleBackground(currentMap);
  if (typeof clearWorldMonsterFieldTest === "function") clearWorldMonsterFieldTest();
  if (typeof ensureWorldMonsterFieldTest === "function") ensureWorldMonsterFieldTest();
  updateMonsterUI();
  if (typeof updateAutoCombatMonsterFilterUI === "function") updateAutoCombatMonsterFilterUI({ force: true });

  saveGame();
  addBattleLog("移動到：" + currentMap.name);
}

function updateBattleBackground(mapData) {
  const battleField = document.getElementById("battle-field") || document.getElementById("battle-area");
  if (!battleField) return;

  // V0.9.77b：讓 CSS 可以依照目前地圖套用世界地圖比例規則。
  // 0.9.77a 只有設定 background，沒有同步 data-map-id，導致 24px 測試角色規則沒有吃到。
  if (mapData && mapData.id) {
    battleField.dataset.mapId = mapData.id;
  } else {
    delete battleField.dataset.mapId;
  }

  // V0.9.78c：世界 Camera 模式不再綁死舊測試 map id；
  // 地圖資料只要標記 worldCamera，就套用 512×3 / 64px 世界角色規則。
  const isWorldCameraMap = Boolean(mapData?.worldCamera || mapData?.id === "mjolnir_3x3_region_camera");
  battleField.classList.remove("city-mode");
  battleField.dataset.worldCamera = isWorldCameraMap ? "true" : "false";
  battleField.classList.toggle("world-camera-mode", isWorldCameraMap);
  if (isWorldCameraMap && window.RO_STUDIO_PLAYER_ATLAS?.ready) {
    battleField.dataset.atlasActive = "true";
    document.getElementById("player-sprite")?.setAttribute("data-atlas-active", "true");
  }

  // V0.9.78e：World Camera 尺寸與世界尺寸集中由 map 資料提供。
  // CSS 使用這些變數，避免之後測 Scale 2 / Scale 3 時到處改 hardcode。
  if (isWorldCameraMap) {
    const cameraWidth = Number(mapData?.cameraWidth || 1280);
    const cameraHeight = Number(mapData?.cameraHeight || 720);
    const worldWidth = Number(mapData?.worldWidth || cameraWidth);
    const worldHeight = Number(mapData?.worldHeight || cameraHeight);
    const playerHeight = Number(mapData?.playerWorldHeight || 64);
    const basePlayerWidth = Number(mapData?.playerWorldWidth || Math.round(playerHeight * 0.47));
    const isMobileWorldPlayer = window.matchMedia?.("(max-width: 900px), (pointer: coarse)")?.matches;
    // V0.9.80I：回退 0.9.80F 的 PC 寬度 x1.5，避免舊展示圖被誤拉成巨大殘影。
    // 世界地圖一律先使用 mapData 的正式寬度；之後要調整時只改 atlas/canvas，不再拉舊 img。
    const playerWidth = basePlayerWidth;
    battleField.style.setProperty("--world-camera-width", `${cameraWidth}px`);
    battleField.style.setProperty("--world-camera-height", `${cameraHeight}px`);
    battleField.style.setProperty("--world-width", `${worldWidth}px`);
    battleField.style.setProperty("--world-height", `${worldHeight}px`);
    battleField.style.setProperty("--world-player-height", `${playerHeight}px`);
    battleField.style.setProperty("--world-player-width", `${playerWidth}px`);
  }

  if (mapData && mapData.background) {
    const bgImage = `linear-gradient(rgba(20, 20, 20, 0.18), rgba(20, 20, 20, 0.18)), url("${mapData.background}")`;
    // V0.9.78W：世界地圖背景交給專用 world-camera-layer，避免手機版 background-position 沒有套到真正顯示層。
    battleField.dataset.worldBackgroundImage = bgImage;
    battleField.style.backgroundImage = isWorldCameraMap ? "none" : bgImage;
  } else {
    battleField.dataset.worldBackgroundImage = "none";
    battleField.style.backgroundImage = "none";
  }

  // Character System V2：非城鎮使用 atlas canvas；playerImage 僅作為城鎮 idle fallback，不再切舊圖。
  if (typeof syncROStudioCharacterFromPlayer === "function") syncROStudioCharacterFromPlayer();

  if (typeof applyLargeMapCamera === "function") {
    applyLargeMapCamera();
  }
}
