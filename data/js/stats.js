//=======================================
// HuntingStatsManager v0.3
// 狩獵統計：擊殺數、EXP、Zeny、掉寶數
//=======================================

function createDefaultHuntingStats() {
  return {
    totalKills: 0,
    totalBaseExp: 0,
    totalJobExp: 0,
    totalZeny: 0,
    totalItems: 0,
    monsters: {},
    items: {}
  };
}

function normalizeHuntingStats() {
  if (!player) return;

  const defaults = createDefaultHuntingStats();
  player.huntingStats = {
    ...defaults,
    ...(player.huntingStats || {})
  };

  player.huntingStats.totalKills = Number(player.huntingStats.totalKills || 0);
  player.huntingStats.totalBaseExp = Number(player.huntingStats.totalBaseExp || 0);
  player.huntingStats.totalJobExp = Number(player.huntingStats.totalJobExp || 0);
  player.huntingStats.totalZeny = Number(player.huntingStats.totalZeny || 0);
  player.huntingStats.totalItems = Number(player.huntingStats.totalItems || 0);
  player.huntingStats.monsters = player.huntingStats.monsters || {};
  player.huntingStats.items = player.huntingStats.items || {};
}

function recordMonsterKill(monster) {
  if (!player || !monster) return;
  normalizeHuntingStats();

  const monsterId = String(monster.id);
  const record = player.huntingStats.monsters[monsterId] || {
    id: monster.id,
    name: monster.name,
    kills: 0
  };

  record.name = monster.name;
  record.kills += 1;
  record.lastKilledAt = new Date().toISOString();

  player.huntingStats.monsters[monsterId] = record;
  player.huntingStats.totalKills += 1;

  updateHuntingStatsUI();
}

function recordBattleRewards({ baseExp = 0, jobExp = 0, zeny = 0 } = {}) {
  if (!player) return;
  normalizeHuntingStats();

  player.huntingStats.totalBaseExp += Number(baseExp || 0);
  player.huntingStats.totalJobExp += Number(jobExp || 0);
  player.huntingStats.totalZeny += Number(zeny || 0);

  updateHuntingStatsUI();
}

function recordItemDrop(itemId, qty = 1) {
  if (!player) return;
  normalizeHuntingStats();

  const normalizedId = normalizeItemId(itemId);
  const key = String(normalizedId);
  const count = Number(qty || 1);
  const record = player.huntingStats.items[key] || {
    id: normalizedId,
    name: getItemName(normalizedId),
    count: 0
  };

  record.name = getItemName(normalizedId);
  record.count += count;

  player.huntingStats.items[key] = record;
  player.huntingStats.totalItems += count;

  updateHuntingStatsUI();
}

function updateHuntingStatsUI() {
  const totalKillsEl = document.getElementById("huntTotalKills");
  const totalBaseExpEl = document.getElementById("huntTotalBaseExp");
  const totalJobExpEl = document.getElementById("huntTotalJobExp");
  const totalZenyEl = document.getElementById("huntTotalZeny");
  const totalItemsEl = document.getElementById("huntTotalItems");
  const monsterListEl = document.getElementById("huntMonsterList");

  if (!totalKillsEl || !player) return;

  normalizeHuntingStats();
  const stats = player.huntingStats;

  totalKillsEl.textContent = stats.totalKills;
  if (totalBaseExpEl) totalBaseExpEl.textContent = stats.totalBaseExp;
  if (totalJobExpEl) totalJobExpEl.textContent = stats.totalJobExp;
  if (totalZenyEl) totalZenyEl.textContent = stats.totalZeny;
  if (totalItemsEl) totalItemsEl.textContent = stats.totalItems;

  if (!monsterListEl) return;

  const monsterRecords = Object.values(stats.monsters || {})
    .sort((a, b) => Number(b.kills || 0) - Number(a.kills || 0));

  if (monsterRecords.length === 0) {
    monsterListEl.innerHTML = '<div class="hunt-empty">尚未擊殺怪物</div>';
    return;
  }

  monsterListEl.innerHTML = "";
  monsterRecords.slice(0, 8).forEach(record => {
    const row = document.createElement("div");
    row.className = "hunt-row";

    const name = document.createElement("span");
    name.textContent = record.name || `Monster ${record.id}`;

    const count = document.createElement("b");
    count.textContent = String(Number(record.kills || 0));

    row.appendChild(name);
    row.appendChild(count);
    monsterListEl.appendChild(row);
  });
}

function resetHuntingStats() {
  if (!player) return;

  player.huntingStats = createDefaultHuntingStats();
  updateHuntingStatsUI();
  saveGame();
  addBattleLog("狩獵統計已重置。");
}
