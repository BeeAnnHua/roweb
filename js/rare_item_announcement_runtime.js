//============================================================
// RO_WEB 0.9.82HR — 全域稀有物品取得公告 Runtime
// - 所有取得來源共用：怪物掉落、地圖額外掉落、卡片額外掉落、
//   MVP 轉蛋、RA Item Group / BOX 與未來伺服器獎勵。
// - 依「該件物品的最終實際取得機率」判定：
//   <= 1% 紅色、<= 0.1% 紫色、<= 0.01% 金色。
//============================================================
(() => {
  "use strict";

  const VERSION = "0.9.82HR";
  const BANNER_STYLE_ID = "ro-rare-item-banner-style";
  const BANNER_HOST_ID = "ro-rare-item-banner-host";
  const LEGACY_HOST_ID = "ro-mvp-gacha-banner-host";
  const MAX_VISIBLE_BANNERS = 3;
  const THRESHOLDS = Object.freeze({
    red: 100,      // 1.00%
    purple: 10,    // 0.10%
    gold: 1        // 0.01%
  });
  const TIER_LABELS = Object.freeze({
    red: "紅色稀有",
    purple: "紫色稀有",
    gold: "金色稀有"
  });

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizeChanceBasisPoints(value) {
    return Math.max(0, Math.min(10000, number(value, 0)));
  }

  function tierForChanceBasisPoints(value) {
    const chance = normalizeChanceBasisPoints(value);
    if (!(chance > 0) || chance > THRESHOLDS.red) return null;
    if (chance <= THRESHOLDS.gold) return "gold";
    if (chance <= THRESHOLDS.purple) return "purple";
    return "red";
  }

  function trimDecimal(value, digits) {
    return Number(value).toFixed(digits).replace(/\.0+$|(?<=\.[0-9]*?)0+$/g, "");
  }

  function formatChancePercent(value) {
    const bp = normalizeChanceBasisPoints(value);
    const percent = bp / 100;
    if (percent >= 1) return `${trimDecimal(percent, 2)}%`;
    if (percent >= 0.1) return `${trimDecimal(percent, 3)}%`;
    if (percent >= 0.01) return `${trimDecimal(percent, 4)}%`;
    return `${trimDecimal(percent, 6)}%`;
  }

  function ensureBannerUi() {
    if (typeof document === "undefined") return null;
    if (!document.getElementById(BANNER_STYLE_ID)) {
      const style = document.createElement("style");
      style.id = BANNER_STYLE_ID;
      style.textContent = `
#${BANNER_HOST_ID},#${LEGACY_HOST_ID}{position:fixed;top:max(48px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:30000;width:min(920px,calc(100vw - 24px));pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:8px}
.ro-rare-item-banner,.ro-mvp-gacha-banner{box-sizing:border-box;width:100%;padding:11px 18px;border:2px solid rgba(255,255,255,.72);border-radius:10px;color:#fff;text-align:center;font-weight:800;letter-spacing:.03em;text-shadow:0 2px 3px rgba(0,0,0,.9);box-shadow:0 5px 20px rgba(0,0,0,.45);opacity:0;transform:translateY(-18px) scale(.98);animation:roRareItemBanner 4.8s ease forwards}
.ro-rare-item-banner.red,.ro-mvp-gacha-banner.red{background:linear-gradient(90deg,rgba(132,0,0,.96),rgba(226,38,38,.96),rgba(132,0,0,.96))}
.ro-rare-item-banner.purple,.ro-mvp-gacha-banner.purple{background:linear-gradient(90deg,rgba(65,15,105,.97),rgba(151,63,214,.97),rgba(65,15,105,.97))}
.ro-rare-item-banner.gold,.ro-mvp-gacha-banner.gold{color:#2d1b00;background:linear-gradient(90deg,#b77700,#ffe47b,#d39500);text-shadow:0 1px 1px rgba(255,255,255,.65);border-color:#fff2a6}
@keyframes roRareItemBanner{0%{opacity:0;transform:translateY(-18px) scale(.98)}10%,82%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-12px) scale(.99)}}
@media(max-width:640px){.ro-rare-item-banner,.ro-mvp-gacha-banner{padding:9px 12px;font-size:14px;border-radius:8px}}
      `;
      document.head.appendChild(style);
    }
    let host = document.getElementById(BANNER_HOST_ID) || document.getElementById(LEGACY_HOST_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = BANNER_HOST_ID;
      host.setAttribute("aria-live", "polite");
      document.body.appendChild(host);
    }
    return host;
  }

  function showRareBanner(tier, text) {
    const safeTier = ["red", "purple", "gold"].includes(String(tier)) ? String(tier) : "red";
    const host = ensureBannerUi();
    if (!host) return false;
    const banner = document.createElement("div");
    // Legacy class is retained so old CSS/tests and external callers remain compatible.
    banner.className = `ro-rare-item-banner ro-mvp-gacha-banner ${safeTier}`;
    banner.textContent = String(text || "");
    while (host.children.length >= MAX_VISIBLE_BANNERS) host.firstElementChild?.remove();
    host.appendChild(banner);
    window.setTimeout?.(() => banner.remove(), 5000);
    return true;
  }

  function getPlayerName() {
    return typeof window.getPlayerAnnouncementName === "function"
      ? String(window.getPlayerAnnouncementName() || "冒險者")
      : String(window.player?.name || "冒險者");
  }

  function buildAnnouncementText(options = {}, tier, chance) {
    const quantity = Math.max(1, Math.floor(number(options.quantity, 1)));
    const quantityText = quantity > 1 ? ` ×${quantity}` : "";
    const source = String(options.sourceLabel || options.source || "稀有物品").trim();
    const sourceText = source ? `｜${source}` : "";
    const chanceText = options.hideChance === true ? "" : `｜實際機率 ${formatChancePercent(chance)}`;
    const label = String(options.label || TIER_LABELS[tier] || "稀有物品");
    return `★ 玩家 ${String(options.playerName || getPlayerName())} 取得 ${String(options.itemName || `Item ${options.itemId || "?"}`)}${quantityText}${sourceText}${chanceText}｜${label} ★`;
  }

  function announceAcquisition(options = {}) {
    const chance = normalizeChanceBasisPoints(options.chanceBasisPoints ?? options.finalChanceBasisPoints ?? options.chance);
    const tier = options.tier || tierForChanceBasisPoints(chance);
    if (!["red", "purple", "gold"].includes(String(tier))) {
      return { announced:false, tier:null, chanceBasisPoints:chance, text:"" };
    }
    const text = String(options.text || buildAnnouncementText(options, tier, chance));
    const displayed = showRareBanner(tier, text);
    if (options.log === true && typeof window.addBattleLog === "function") {
      window.addBattleLog(String(options.logText || `🎉 稀有取得：${options.itemName || `Item ${options.itemId || "?"}`}${number(options.quantity, 1) > 1 ? ` ×${Math.floor(number(options.quantity, 1))}` : ""}`), "rare-item");
    }
    return { announced:true, displayed, tier:String(tier), chanceBasisPoints:chance, text };
  }

  function weightedTotal(rows) {
    return (Array.isArray(rows) ? rows : []).reduce((sum, row) => sum + Math.max(0, number(row?.weight ?? row?.rate, 0)), 0);
  }

  // Probability of obtaining the selected item from the local weighted pool.
  // Duplicate rows with the same Item ID are summed because the announcement is
  // about obtaining the item, not the internal row that happened to win.
  function weightedItemChanceBasisPoints(rows, selected, parentChanceBasisPoints = 10000) {
    const list = Array.isArray(rows) ? rows : [];
    const total = weightedTotal(list);
    if (!(total > 0) || !selected) return 0;
    const selectedId = String(selected.itemId ?? selected.id ?? "");
    const matchingWeight = list.reduce((sum, row) => {
      const rowId = String(row?.itemId ?? row?.id ?? "");
      return rowId === selectedId ? sum + Math.max(0, number(row?.weight ?? row?.rate, 0)) : sum;
    }, 0);
    return normalizeChanceBasisPoints(normalizeChanceBasisPoints(parentChanceBasisPoints) * matchingWeight / total);
  }

  function nestedWeightedChanceBasisPoints(parentChanceBasisPoints, selectedWeight, totalWeight) {
    const total = Math.max(0, number(totalWeight, 0));
    if (!(total > 0)) return 0;
    return normalizeChanceBasisPoints(normalizeChanceBasisPoints(parentChanceBasisPoints) * Math.max(0, number(selectedWeight, 0)) / total);
  }

  function announceBatch(rows = []) {
    const groups = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      const chance = normalizeChanceBasisPoints(row?.chanceBasisPoints ?? row?.finalChanceBasisPoints ?? row?.chance);
      const tier = row?.tier || tierForChanceBasisPoints(chance);
      if (!tier) continue;
      const key = [row?.itemId ?? row?.itemName, chance.toFixed(8), row?.sourceLabel || row?.source || ""].join("|");
      const current = groups.get(key) || { ...row, chanceBasisPoints:chance, quantity:0 };
      current.quantity += Math.max(1, Math.floor(number(row?.quantity, 1)));
      groups.set(key, current);
    }
    return [...groups.values()].map(announceAcquisition);
  }

  window.RareItemAnnouncementRuntime = Object.freeze({
    version:VERSION,
    thresholds:THRESHOLDS,
    tierForChanceBasisPoints,
    formatChancePercent,
    showRareBanner,
    announceAcquisition,
    announceBatch,
    weightedItemChanceBasisPoints,
    nestedWeightedChanceBasisPoints
  });
})();
