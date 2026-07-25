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
  hideTimer: 0
};

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

function formatMapMonsterCount(entry) {
  const category = String(entry?.category || "normal").toLowerCase();
  if (["rare", "boss", "mvp"].includes(category)) {
    return Math.max(1, Number(entry?.maxAlive ?? 1));
  }
  if (category === "plant") {
    return Math.max(1, Number(entry?.maxAlive ?? entry?.raSpawnCount ?? 1));
  }
  return Math.max(1, Number(entry?.raSpawnCount || entry?.weight || 1));
}

function createMapMonsterDistributionSection(title, icon, entries, options = {}) {
  if (!entries.length) return "";
  const rows = entries.map(entry => {
    const monster = getMapMonsterById(entry.monsterId);
    const name = monster?.name || `怪物 ${entry.monsterId}`;
    const count = formatMapMonsterCount(entry);
    let stateHtml = "";
    if (options.liveState) {
      const state = getMapUniqueMonsterAvailability(RO_MAP_MONSTER_TOOLTIP_STATE.mapId, entry.monsterId);
      stateHtml = state.respawning
        ? `<em class="map-monster-state is-respawning">重生倒數 ${formatMapMonsterRespawnDuration(state.remainingSeconds)}</em>`
        : `<em class="map-monster-state is-alive">存在中</em>`;
    }
    const category = String(entry?.category || "normal").toLowerCase();
    const categoryBadge = options.showCategory && category !== "normal"
      ? `<small class="map-monster-category-badge category-${category}">${category === "plant" ? "植物" : "稀有"}</small>`
      : "";
    return `<div class="map-monster-distribution-row"><span>${name}${categoryBadge}</span><b>× ${count}</b>${stateHtml}</div>`;
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
    createMapMonsterDistributionSection("一般怪物", "🐾", ordinary, { showCategory: true }),
    createMapMonsterDistributionSection("Boss 怪物", "👑", bosses, { liveState: true }),
    createMapMonsterDistributionSection("MVP", "🏆", mvps, { liveState: true })
  ].filter(Boolean).join("");
  return `<div class="map-monster-distribution-header"><b>${mapData?.displayName || mapData?.name || "怪物地區"}</b>${recommended}</div>${sections || '<div class="map-monster-distribution-empty">此地區尚無怪物資料</div>'}`;
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
  tooltip.addEventListener("pointerleave", hideMapMonsterDistributionTooltip);
  document.body.appendChild(tooltip);
  return tooltip;
}

function positionMapMonsterDistributionTooltip() {
  const tooltip = document.getElementById("map-monster-distribution-tooltip");
  const anchor = RO_MAP_MONSTER_TOOLTIP_STATE.anchor;
  if (!tooltip || tooltip.hidden || !anchor?.isConnected) return;
  const rect = anchor.getBoundingClientRect();
  const viewportWidth = Math.max(1, window.visualViewport?.width || window.innerWidth || document.documentElement.clientWidth || 1280);
  const viewportHeight = Math.max(1, window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 720);
  const gap = 10;
  const width = Math.min(390, Math.max(270, tooltip.offsetWidth || 350));
  const height = Math.min(viewportHeight - 16, tooltip.offsetHeight || 420);
  let left = rect.left - width - gap;
  if (left < 8) left = rect.right + gap;
  if (left + width > viewportWidth - 8) left = Math.max(8, viewportWidth - width - 8);
  const top = Math.max(8, Math.min(rect.top, viewportHeight - height - 8));
  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
}

function refreshMapMonsterDistributionTooltip() {
  const tooltip = document.getElementById("map-monster-distribution-tooltip");
  if (!tooltip || tooltip.hidden || !RO_MAP_MONSTER_TOOLTIP_STATE.mapId) return;
  const mapData = (maps || []).find(map => map.id === RO_MAP_MONSTER_TOOLTIP_STATE.mapId);
  if (!mapData) return hideMapMonsterDistributionTooltip();
  tooltip.innerHTML = buildMapMonsterDistributionHtml(mapData);
  positionMapMonsterDistributionTooltip();
}

function showMapMonsterDistributionTooltip(mapData, anchor) {
  if (!mapData || !anchor) return;
  window.clearTimeout(RO_MAP_MONSTER_TOOLTIP_STATE.hideTimer);
  window.clearInterval(RO_MAP_MONSTER_TOOLTIP_STATE.timer);
  RO_MAP_MONSTER_TOOLTIP_STATE.mapId = mapData.id;
  RO_MAP_MONSTER_TOOLTIP_STATE.anchor = anchor;
  const tooltip = getMapMonsterDistributionTooltip();
  tooltip.hidden = false;
  tooltip.innerHTML = buildMapMonsterDistributionHtml(mapData);
  positionMapMonsterDistributionTooltip();
  RO_MAP_MONSTER_TOOLTIP_STATE.timer = window.setInterval(refreshMapMonsterDistributionTooltip, 1000);
}

function scheduleHideMapMonsterDistributionTooltip() {
  window.clearTimeout(RO_MAP_MONSTER_TOOLTIP_STATE.hideTimer);
  RO_MAP_MONSTER_TOOLTIP_STATE.hideTimer = window.setTimeout(hideMapMonsterDistributionTooltip, 140);
}

function hideMapMonsterDistributionTooltip() {
  window.clearTimeout(RO_MAP_MONSTER_TOOLTIP_STATE.hideTimer);
  window.clearInterval(RO_MAP_MONSTER_TOOLTIP_STATE.timer);
  RO_MAP_MONSTER_TOOLTIP_STATE.hideTimer = 0;
  RO_MAP_MONSTER_TOOLTIP_STATE.timer = 0;
  RO_MAP_MONSTER_TOOLTIP_STATE.mapId = null;
  RO_MAP_MONSTER_TOOLTIP_STATE.anchor = null;
  const tooltip = document.getElementById("map-monster-distribution-tooltip");
  if (tooltip) tooltip.hidden = true;
}

window.addEventListener("resize", positionMapMonsterDistributionTooltip, { passive: true });
window.visualViewport?.addEventListener?.("resize", positionMapMonsterDistributionTooltip, { passive: true });
window.visualViewport?.addEventListener?.("scroll", positionMapMonsterDistributionTooltip, { passive: true });
window.showMapMonsterDistributionTooltip = showMapMonsterDistributionTooltip;
window.hideMapMonsterDistributionTooltip = hideMapMonsterDistributionTooltip;

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

  const destinations = [];
  (maps || []).forEach(map => destinations.push({ kind: "field", id: map.id, name: map.displayName || map.name, note: "", data: map }));
  (cities || []).forEach(city => destinations.push({
    kind: "city",
    id: city.id,
    name: city.displayName || city.name,
    note: city.hoverDescription || city.description || city.role || "城鎮據點",
    data: city
  }));

  destinations.forEach(dest => {
    const btn = document.createElement("button");
    btn.type = "button";
    const isCurrent = dest.kind === "field"
      ? Boolean(!currentCityData && currentMap && currentMap.id === dest.id)
      : Boolean(currentCityData && currentCityData.id === dest.id);
    btn.className = "map-warp-button" + (dest.kind === "city" ? " map-city-warp-button" : " map-region-warp-button") + (isCurrent ? " is-current" : "");
    btn.disabled = Boolean(isCurrent && dest.kind === "city");
    if (isCurrent) btn.setAttribute("aria-disabled", "true");
    btn.innerHTML = dest.kind === "city"
      ? `<b>${dest.name}</b><small class="map-city-hover-tip">${dest.note}</small>`
      : `<b>${dest.name}</b>`;
    if (dest.kind === "city") {
      btn.title = dest.note;
      btn.setAttribute("aria-label", `${dest.name}：${dest.note}`);
    } else {
      btn.setAttribute("aria-label", `${dest.name}：查看怪物分布`);
      btn.addEventListener("pointerenter", () => showMapMonsterDistributionTooltip(dest.data, btn));
      btn.addEventListener("pointerleave", scheduleHideMapMonsterDistributionTooltip);
      btn.addEventListener("focus", () => showMapMonsterDistributionTooltip(dest.data, btn));
      btn.addEventListener("blur", scheduleHideMapMonsterDistributionTooltip);
    }
    btn.onclick = function () {
      hideMapMonsterDistributionTooltip();
      if (isCurrent) return;
      if (dest.kind === "field") changeMap(dest.id);
      else if (typeof enterCity === "function") enterCity(dest.id);
    };
    warpPanel.appendChild(btn);
  });

  mapListEl.appendChild(info);
  mapListEl.appendChild(warpPanel);
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
