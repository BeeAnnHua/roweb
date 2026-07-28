from pathlib import Path
import re, json
root=Path('/mnt/data/ro_fz_work')

# item_instance_ui: preserve enchant grade
p=root/'js/item_instance_ui.js'; s=p.read_text(encoding='utf-8')
needle='      refine: Math.max(0, Math.min(20, Math.floor(Number(source.refine ?? source.refineLevel ?? 0) || 0))),\n      broken:'
repl='      refine: Math.max(0, Math.min(20, Math.floor(Number(source.refine ?? source.refineLevel ?? 0) || 0))),\n      enchantGrade: Math.max(0, Math.min(4, Math.floor(Number(source.enchantGrade ?? source.grade ?? source.enchantGradeLevel ?? 0) || 0))),\n      broken:'
if needle not in s: raise SystemExit('item_instance needle missing')
s=s.replace(needle,repl,1)
p.write_text(s,encoding='utf-8')

# card runtime grade + RES/MRES support
p=root/'js/card_runtime.js'; s=p.read_text(encoding='utf-8')
s=s.replace('rows.push({ slot, itemId: Number(itemId), item, instance, refine: n(instance?.refine) });',
            'rows.push({ slot, itemId: Number(itemId), item, instance, refine: n(instance?.refine), grade: n(instance?.enchantGrade ?? instance?.grade) });',1)
s=s.replace('const equipment = equipmentRows().map(row => [row.slot, row.itemId, row.refine, ...(row.instance?.cards || [])]);',
            'const equipment = equipmentRows().map(row => [row.slot, row.itemId, row.refine, row.grade, ...(row.instance?.cards || [])]);',1)
s=s.replace('      getrefine: () => n(context.hostRow?.refine ?? context.maxRefine),\n      getequiprefinerycnt:',
            '      getrefine: () => n(context.hostRow?.refine ?? context.maxRefine),\n      getenchantgrade: token => n((token === undefined || token === null) ? (context.hostRow?.grade ?? context.hostRow?.instance?.enchantGrade ?? context.maxGrade) : (getSlotRow(token,context)?.grade ?? getSlotRow(token,context)?.instance?.enchantGrade)),\n      getequiprefinerycnt:',1)
s=s.replace('      EAJL_THIRD:4, EAJL_FOURTH:8,\n      ...BATTLE_FLAGS,',
            '      EAJL_THIRD:4, EAJL_FOURTH:8,\n      ENCHANTGRADE_NONE:0, ENCHANTGRADE_D:1, ENCHANTGRADE_C:2, ENCHANTGRADE_B:3, ENCHANTGRADE_A:4,\n      ...BATTLE_FLAGS,',1)
# add supported bonus names
s=s.replace('"bRegenPercentHP","bResEff"', '"bRegenPercentHP","bRes","bMRes","bResEff"',1)
# add scalar mapping near PAtk
s=s.replace('      bPAtk:"pAtk", bSMatk:"sMatk",', '      bPAtk:"pAtk", bSMatk:"sMatk", bRes:"resFlat", bMRes:"mresFlat",',1)
p.write_text(s,encoding='utf-8')

# fixed configured spawn position
p=root/'js/world_monster_test_runtime.js'; s=p.read_text(encoding='utf-8')
needle='  const position = storedPos || chooseWorldMonsterSpawnPosition({ avoidViewport: options.avoidViewport !== false });'
repl='''  const configuredPos = spawnEntry?.spawnPosition && Number.isFinite(Number(spawnEntry.spawnPosition.x)) && Number.isFinite(Number(spawnEntry.spawnPosition.y))
    ? clampWorldMonsterPosition(spawnEntry.spawnPosition)
    : null;
  const position = storedPos || configuredPos || chooseWorldMonsterSpawnPosition({ avoidViewport: options.avoidViewport !== false });'''
if needle not in s: raise SystemExit('spawn needle missing')
s=s.replace(needle,repl,1)
p.write_text(s,encoding='utf-8')

# Loot hook
p=root/'js/loot.js'; s=p.read_text(encoding='utf-8')
needle='  rollMonsterDrops(monster);\n  rollPassiveSkillExtraDrops(monster);'
repl='  rollMonsterDrops(monster);\n  window.MvpGachaRuntime?.rollMapExclusiveDrop?.(monster);\n  rollPassiveSkillExtraDrops(monster);'
if needle not in s: raise SystemExit('loot needle missing')
s=s.replace(needle,repl,1)
p.write_text(s,encoding='utf-8')

# Gacha runtime
runtime=r'''//============================================================
// RO_WEB 0.9.82FZ — 葛坡尼亞 MVP 地圖限定轉蛋 Runtime
// - 同 ID MVP 只有在指定地圖死亡才額外判定固定 1% 轉蛋。
// - 稀有機率為單一 10000 基點母池的絕對機率，不受全域掉寶倍率影響。
// - 1% 紅色、0.1% 紫色、0.01% 金色上方橫幅。
//============================================================
(() => {
  "use strict";

  const VERSION = "0.9.82FZ";
  const BUNDLE_KEY = "data/mvp_gacha.json";
  const DEFAULT_GACHA_ITEM_ID = 14848;
  const CASH_FOOD_SOURCE = "mvp_gacha_cash_food";
  const BANNER_STYLE_ID = "ro-mvp-gacha-banner-style";
  const BANNER_HOST_ID = "ro-mvp-gacha-banner-host";

  function bundled(key, fallback = null) {
    return window.RO_WEB_DATA && Object.prototype.hasOwnProperty.call(window.RO_WEB_DATA, key)
      ? window.RO_WEB_DATA[key]
      : fallback;
  }

  function config() {
    return bundled(BUNDLE_KEY, null);
  }

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function integer(value, fallback = 0) {
    return Math.floor(number(value, fallback));
  }

  function randomBasisPoint() {
    return Math.floor(Math.random() * 10000) + 1;
  }

  function itemData(id) {
    return window.getItemData?.(id) || { id:Number(id), name:`Item ${id}` };
  }

  function findInventoryStack(id) {
    if (typeof window.findInventoryItemById === "function") return window.findInventoryItemById(id);
    return (window.player?.inventory || []).find(row => String(row?.id) === String(id) && !row?.instanceId) || null;
  }

  function removeOneStackItem(id) {
    const stack = findInventoryStack(id);
    if (!stack || number(stack.count) <= 0) return false;
    stack.count = number(stack.count) - 1;
    if (stack.count <= 0) {
      window.player.inventory = (window.player.inventory || []).filter(row => row !== stack);
    }
    return true;
  }

  function weightedPick(rows) {
    const list = (Array.isArray(rows) ? rows : []).filter(row => number(row?.weight) > 0);
    const total = list.reduce((sum, row) => sum + number(row.weight), 0);
    if (!list.length || total <= 0) return null;
    let cursor = Math.random() * total;
    for (const row of list) {
      cursor -= number(row.weight);
      if (cursor < 0) return row;
    }
    return list[list.length - 1];
  }

  function ensureBannerUi() {
    if (typeof document === "undefined") return null;
    if (!document.getElementById(BANNER_STYLE_ID)) {
      const style = document.createElement("style");
      style.id = BANNER_STYLE_ID;
      style.textContent = `
#${BANNER_HOST_ID}{position:fixed;top:max(48px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:30000;width:min(920px,calc(100vw - 24px));pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:8px}
.ro-mvp-gacha-banner{box-sizing:border-box;width:100%;padding:11px 18px;border:2px solid rgba(255,255,255,.72);border-radius:10px;color:#fff;text-align:center;font-weight:800;letter-spacing:.03em;text-shadow:0 2px 3px rgba(0,0,0,.9);box-shadow:0 5px 20px rgba(0,0,0,.45);opacity:0;transform:translateY(-18px) scale(.98);animation:roMvpGachaBanner 4.8s ease forwards}
.ro-mvp-gacha-banner.red{background:linear-gradient(90deg,rgba(132,0,0,.96),rgba(226,38,38,.96),rgba(132,0,0,.96))}
.ro-mvp-gacha-banner.purple{background:linear-gradient(90deg,rgba(65,15,105,.97),rgba(151,63,214,.97),rgba(65,15,105,.97))}
.ro-mvp-gacha-banner.gold{color:#2d1b00;background:linear-gradient(90deg,#b77700,#ffe47b,#d39500);text-shadow:0 1px 1px rgba(255,255,255,.65);border-color:#fff2a6}
@keyframes roMvpGachaBanner{0%{opacity:0;transform:translateY(-18px) scale(.98)}10%,82%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-12px) scale(.99)}}
@media(max-width:640px){.ro-mvp-gacha-banner{padding:9px 12px;font-size:14px;border-radius:8px}}
      `;
      document.head.appendChild(style);
    }
    let host = document.getElementById(BANNER_HOST_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = BANNER_HOST_ID;
      host.setAttribute("aria-live", "polite");
      document.body.appendChild(host);
    }
    return host;
  }

  function showRareBanner(tier, text) {
    const host = ensureBannerUi();
    if (!host) return;
    const banner = document.createElement("div");
    banner.className = `ro-mvp-gacha-banner ${["red","purple","gold"].includes(tier) ? tier : "red"}`;
    banner.textContent = text;
    host.appendChild(banner);
    window.setTimeout(() => banner.remove(), 5000);
  }

  function log(text, type = "item") {
    if (typeof window.addBattleLog === "function") window.addBattleLog(text, type);
  }

  function rewardItem(row) {
    if (!row) return null;
    const data = itemData(row.itemId);
    const qty = Math.max(1, integer(row.quantity, 1));
    if (typeof window.addItem !== "function") return null;
    window.addItem({ id:Number(row.itemId), name:data.name }, qty);
    return { item:data, quantity:qty };
  }

  function rollReward() {
    const cfg = config();
    if (!cfg) return null;
    const roll = randomBasisPoint();
    let cumulative = 0;
    for (const category of cfg.rareCategories || []) {
      cumulative += Math.max(0, integer(category.chanceBasisPoints));
      if (roll <= cumulative) {
        const row = weightedPick(category.rewards);
        return { category, row, roll, rare:true };
      }
    }
    return { category:null, row:weightedPick(cfg.ordinaryRewards), roll, rare:false };
  }

  function openGacha(item = itemData(config()?.gachaItemId || DEFAULT_GACHA_ITEM_ID)) {
    if (!window.player || !item) return false;
    const stack = findInventoryStack(item.id);
    if (!stack || number(stack.count) <= 0) {
      log(`背包裡沒有 ${item.name}。`);
      return false;
    }
    const usability = typeof window.canUseConsumableItem === "function"
      ? window.canUseConsumableItem(item)
      : { ok:true };
    if (!usability.ok) return false;

    const result = rollReward();
    const awarded = rewardItem(result?.row);
    if (!awarded) {
      log(`${item.name} 的獎池資料異常，轉蛋沒有被消耗。`);
      return false;
    }
    if (!removeOneStackItem(item.id)) return false;
    window.markConsumableItemUsed?.(item);

    const quantityText = awarded.quantity > 1 ? ` ×${awarded.quantity}` : "";
    if (result.rare) {
      const playerName = String(window.player?.name || "冒險者");
      const label = String(result.category?.bannerLabel || "稀有大獎");
      showRareBanner(result.category?.tier, `★ ${playerName} 從 MVP幸運轉蛋獲得 ${awarded.item.name}${quantityText}｜${label} ★`);
      log(`🎉 轉蛋大獎：${awarded.item.name}${quantityText}`, "rare-item");
    } else {
      log(`開啟 ${item.name}，獲得 ${awarded.item.name}${quantityText}。`, "item");
    }
    window.updateInventoryUI?.();
    window.updatePlayerUI?.();
    window.saveGame?.();
    return true;
  }

  function cashFoodEffectInstance(item) {
    const raw = item?.cashFoodEffect;
    if (!raw || typeof raw !== "object") return null;
    const effects = {};
    for (const [key, value] of Object.entries(raw)) {
      if (key === "durationMs" || key.endsWith("Random")) continue;
      if (typeof value === "number" && Number.isFinite(value)) effects[key] = value;
    }
    for (const [key, range] of Object.entries(raw)) {
      if (!key.endsWith("Random") || !Array.isArray(range) || range.length < 2) continue;
      const targetKey = key.slice(0, -6);
      const lo = integer(Math.min(number(range[0]), number(range[1])));
      const hi = integer(Math.max(number(range[0]), number(range[1])));
      effects[targetKey] = lo + Math.floor(Math.random() * Math.max(1, hi - lo + 1));
    }
    return { durationMs:Math.max(1000, integer(raw.durationMs, 1800000)), effects };
  }

  function overlappingCashFoodKeys(effects) {
    const allStats = number(effects?.allStatsFlat) !== 0;
    const statKeys = ["strFlat","agiFlat","vitFlat","intFlat","dexFlat","lukFlat"];
    const keys = new Set(Object.keys(effects || {}).filter(key => typeof effects[key] === "number"));
    if (allStats) statKeys.forEach(key => keys.add(key));
    return { allStats, statKeys, keys };
  }

  function applyCashFood(item) {
    if (!window.player) return false;
    const profile = cashFoodEffectInstance(item);
    if (!profile) return false;
    const usability = window.canUseConsumableItem?.(item) || { ok:true };
    if (!usability.ok) return false;
    const stack = findInventoryStack(item.id);
    if (!stack || number(stack.count) <= 0) { log(`背包裡沒有 ${item.name}。`); return false; }

    player.activeBuffs = player.activeBuffs && typeof player.activeBuffs === "object" ? player.activeBuffs : {};
    const incoming = overlappingCashFoodKeys(profile.effects);
    for (const [id, buff] of Object.entries(player.activeBuffs)) {
      if (buff?.sourceType !== CASH_FOOD_SOURCE) continue;
      const existing = overlappingCashFoodKeys(buff.effects || {});
      const overlap = incoming.allStats || existing.allStats || [...incoming.keys].some(key => existing.keys.has(key));
      if (overlap) delete player.activeBuffs[id];
    }

    const now = Date.now();
    const buffId = `${CASH_FOOD_SOURCE}:${item.id}:${now}`;
    player.activeBuffs[buffId] = {
      id:buffId,
      name:item.name,
      sourceType:CASH_FOOD_SOURCE,
      sourceItemId:Number(item.id),
      startedAt:now,
      expiresAt:now + profile.durationMs,
      effects:profile.effects
    };
    removeOneStackItem(item.id);
    window.markConsumableItemUsed?.(item);
    window.invalidateCardRuntime?.();
    window.recalculatePlayerStats?.();
    const minutes = Math.max(1, Math.round(profile.durationMs / 60000));
    log(`使用了 ${item.name}，效果持續 ${minutes} 分鐘。`);
    window.updatePlayerUI?.();
    window.updateInventoryUI?.();
    window.saveGame?.();
    return true;
  }

  function applyPercentHeal(item) {
    const profile = item?.percentHeal;
    if (!profile || typeof profile !== "object" || !window.player) return false;
    const usability = window.canUseConsumableItem?.(item) || { ok:true };
    if (!usability.ok) return false;
    const stack = findInventoryStack(item.id);
    if (!stack || number(stack.count) <= 0) { log(`背包裡沒有 ${item.name}。`); return false; }
    const hpBefore = number(player.hp);
    const spBefore = number(player.sp);
    const hpGain = Math.max(0, Math.floor(number(player.maxHp, hpBefore) * Math.max(0, number(profile.hp)) / 100));
    const spGain = Math.max(0, Math.floor(number(player.maxSp, spBefore) * Math.max(0, number(profile.sp)) / 100));
    player.hp = Math.min(number(player.maxHp, hpBefore), hpBefore + hpGain);
    player.sp = Math.min(number(player.maxSp, spBefore), spBefore + spGain);
    removeOneStackItem(item.id);
    window.markConsumableItemUsed?.(item);
    log(`使用了 ${item.name}，HP 恢復 ${Math.max(0, player.hp-hpBefore)}，SP 恢復 ${Math.max(0, player.sp-spBefore)}。`);
    window.updatePlayerUI?.();
    window.updateInventoryUI?.();
    window.saveGame?.();
    return true;
  }

  function rollMapExclusiveDrop(monster) {
    const cfg = config();
    if (!cfg || !monster || !window.player) return false;
    const state = monster.lootRuntime = monster.lootRuntime || {};
    if (state.mapExclusiveMvpGachaRolled) return false;
    state.mapExclusiveMvpGachaRolled = true;
    if (String(window.currentMap?.id || "") !== String(cfg.mapId || "")) return false;
    if (!(monster.isMvp === true || String(monster.category || monster._category || "").toLowerCase() === "mvp")) return false;
    if (randomBasisPoint() > Math.max(0, integer(cfg.mapExclusiveDropChanceBasisPoints))) return false;
    const gacha = itemData(cfg.gachaItemId || DEFAULT_GACHA_ITEM_ID);
    window.addItem?.({ id:Number(gacha.id), name:gacha.name }, 1);
    window.recordItemDrop?.(gacha.id, 1);
    log(`葛坡尼亞限定掉落：${gacha.name} ×1`, "rare-item");
    return true;
  }

  const previousUseItem = window.useItem;
  window.useItem = function mvpGachaUseItem(itemId, instance = null) {
    const item = itemData(itemId);
    const cfg = config();
    if (String(item?.id) === String(cfg?.gachaItemId || DEFAULT_GACHA_ITEM_ID)) return openGacha(item);
    if (item?.cashFoodEffect) return applyCashFood(item);
    if (item?.percentHeal) return applyPercentHeal(item);
    return previousUseItem?.(itemId, instance);
  };

  window.MvpGachaRuntime = Object.freeze({
    version:VERSION,
    config,
    rollReward,
    openGacha,
    rollMapExclusiveDrop,
    applyCashFood,
    applyPercentHeal,
    showRareBanner
  });
})();
'''
(root/'js/mvp_gacha_runtime.js').write_text(runtime,encoding='utf-8')

# index: version all cache refs + title and script insertion
p=root/'index.html'; s=p.read_text(encoding='utf-8')
s=re.sub(r'0\.9\.82FY', '0.9.82FZ', s)
s=s.replace('<script src="./js/effect_runtime.js?v=0.9.82FZ"></script>', '<script src="./js/effect_runtime.js?v=0.9.82FZ"></script>\n  <script src="./js/mvp_gacha_runtime.js?v=0.9.82FZ"></script>',1)
p.write_text(s,encoding='utf-8')

# game version
p=root/'js/game.js'; s=p.read_text(encoding='utf-8')
s=re.sub(r'RO_WEB_VERSION\s*=\s*["\'][^"\']+["\']', 'RO_WEB_VERSION = "0.9.82FZ"', s, count=1)
p.write_text(s,encoding='utf-8')

# README/CHANGELOG prepend
readme=root/'README.md'; rs=readme.read_text(encoding='utf-8')
section='''# RO_WEB 0.9.82FZ\n\n本版以 0.9.82FY 為基準，新增「葛坡尼亞 MVP 試煉場」3×3 大型世界地圖、60 種 MVP、地圖限定 1% MVP幸運轉蛋、單一 100% 母池與紅／紫／金稀有橫幅。轉蛋裝備、卡片、Combo 全部沿用 FX 統一 EffectRuntime；同時補齊 LT 裝備的精煉品級（D/C/B/A）保存、Script 判定及 RES／MRES 效果。\n\n請使用 HTTP 伺服器啟動，避免瀏覽器直接開啟檔案造成 CORS。GitHub Pages 更新時，將增量包內所有檔案依原路徑覆蓋至專案根目錄。\n\n'''
readme.write_text(section + re.sub(r'^# .*?\n+', '', rs, count=1),encoding='utf-8')
ch=root/'CHANGELOG.md'; cs=ch.read_text(encoding='utf-8')
entry='''# 0.9.82FZ — 葛坡尼亞 MVP 試煉場／地圖限定轉蛋\n\n- 新增 3×3 葛坡尼亞大型地圖與 60 種 MVP 固定分布。\n- MVP 保留原始掉落；只有在本地圖死亡時額外固定 1% 掉落 MVP幸運轉蛋，外部同 ID MVP 不受影響。\n- 轉蛋為單一 100% 母池：齊爾-D-01卡片 0.01%、20週年帽／氣球 0.1%、時光超越者系列 1%、LT 系列 0.1%，普通商城料理按權重填滿剩餘 98.79%。\n- 1%／0.1%／0.01% 分別使用紅／紫／金色上方橫幅。\n- 新增商城料理、棒棒條、天雪花實際使用效果。\n- 補齊裝備實例精煉品級、`getenchantgrade`、D/C/B/A 常數與 RES／MRES 效果，並將新增裝備／Combo 納入統一 EffectRuntime。\n\n'''
ch.write_text(entry+cs,encoding='utf-8')

# deployment notice
(root/'DEPLOY_COPY_NOTICE_0.9.82FZ.txt').write_text('''RO_WEB 0.9.82FZ GitHub Pages 增量更新說明\n\n1. 將本 ZIP 內所有檔案與資料夾複製到 GitHub roweb 專案根目錄。\n2. 選擇合併資料夾並覆蓋同名檔案。\n3. 本版不需要刪除舊檔。\n4. Commit 後等待 GitHub Pages 部署，再於電腦 Ctrl+F5；手機關閉分頁後重開。\n5. 請勿漏掉 data、images、js、index.html。\n''',encoding='utf-8')
print('patched FZ runtime')
