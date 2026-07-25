//=======================================
// LootManager v0.2
// 掉寶 / Zeny / 背包獎勵統一由這裡處理
//=======================================

function emitLootRewardLog(text, type = null) {
  if (window.RO_WEB_REWARD_BATCH_ACTIVE && typeof window.queueRewardBatchLog === "function") window.queueRewardBatchLog(text, type);
  else if (typeof addBattleLog === "function") addBattleLog(text, type);
}

function grantMonsterRewards(monster) {
  if (!monster) return;

  const rawBaseExp = Number(monster.baseExp || 0);
  const rawJobExp = Number(monster.jobExp || 0);
  const rawZeny = getMonsterRawZenyReward(monster);

  const baseExp = applyTrainingRewardBonus(applyRate(rawBaseExp, "baseExp"), "baseExp");
  const jobExp = applyTrainingRewardBonus(applyRate(rawJobExp, "jobExp"), "jobExp");
  const zeny = getMonsterFinalZenyReward(monster, rawZeny);

  if (typeof recordMonsterKill === "function") {
    recordMonsterKill(monster);
  }

  addBaseExp(baseExp);
  addJobExp(jobExp);
  addZeny(zeny);

  if (typeof recordBattleRewards === "function") {
    recordBattleRewards({ baseExp, jobExp, zeny });
  }

  emitLootRewardLog(`獲得 Base EXP ${baseExp}`, "base-exp");
  emitLootRewardLog(`獲得 Job EXP ${jobExp}`, "job-exp");
  emitLootRewardLog(`獲得 Zeny ${zeny}`, "zeny");

  rollMonsterDrops(monster);
  rollPassiveSkillExtraDrops(monster);
}

function getMonsterLootRuntime(monster) {
  if (!monster) return {};
  monster.lootRuntime = monster.lootRuntime || {};
  return monster.lootRuntime;
}

function getMonsterRawZenyReward(monster) {
  const state = getMonsterLootRuntime(monster);
  if (Number.isFinite(Number(state.rawZeny))) return Number(state.rawZeny);
  state.rawZeny = rollZeny(monster);
  return Number(state.rawZeny || 0);
}

function getMonsterFinalZenyReward(monster, knownRaw = null) {
  const state = getMonsterLootRuntime(monster);
  if (Number.isFinite(Number(state.finalZeny))) return Number(state.finalZeny);
  const raw = knownRaw === null ? getMonsterRawZenyReward(monster) : Number(knownRaw || 0);
  state.finalZeny = applyTrainingRewardBonus(applyRate(raw, "zeny"), "zeny");
  return Number(state.finalZeny || 0);
}

function attemptStealItem(monster, stealLevel, options = {}) {
  if (!monster) return { ok:false, reason:"沒有目標" };
  const state=getMonsterLootRuntime(monster);if(state.itemStolen)return {ok:false,reason:"這隻怪物已被成功偷取過"};
  const playerDex=Number((typeof getPlayerTotalBasicStats==="function"?getPlayerTotalBasicStats().dex:player?.stats?.dex)||1), monsterDex=Number(monster.dex??monster.stats?.dex??monster.level??1);
  const chance=Math.max(0,Math.min(100,(playerDex-monsterDex)/2+Number(stealLevel||1)*6+4));if(Math.random()*100>=chance)return {ok:false,reason:"機率判定失敗",chance};
  const drops=Array.isArray(monster.drops)?monster.drops:[];
  for(const drop of drops){const raw=Number(drop.chance||0);if(raw<=0)continue;const rated=Math.min(10000,applyTrainingRewardBonus(applyRate(raw,"drop"),"drop"));if(Math.floor(Math.random()*10000)+1>rated)continue;
    const itemId=normalizeItemId(drop.itemId), itemData=getItemData(itemId), itemName=itemData?.name||drop.name||`Item ${itemId}`;addItem({id:itemId,name:itemName},1);state.itemStolen=true;if(typeof recordItemDrop==="function")recordItemDrop(itemId,1);return {ok:true,itemId,itemName,chance};}
  return {ok:false,reason:"怪物身上沒有成功抽中的物品",chance};
}

function tryGankOnNormalAttack(monster) {
  const gankLv=typeof getNativeSkillLevel==="function"?Number(getNativeSkillLevel(210)||0):0;if(gankLv<=0||!monster)return false;
  const wt=String(typeof getEquippedWeaponTypeRuntime==="function"?getEquippedWeaponTypeRuntime():player?.weaponType||"").toLowerCase();if(wt.includes("bow")||wt.includes("弓"))return false;
  const stealLv=typeof getNativeSkillLevel==="function"?Number(getNativeSkillLevel(50)||0):0, chance=(gankLv*15+55+stealLv*10)/10;if(Math.random()*100>=chance)return false;
  const result=attemptStealItem(monster,Math.max(1,stealLv),{source:"gank"});if(result.ok&&typeof addBattleLog==="function")addBattleLog(`強奪成功：取得 ${result.itemName} ×1。`);return result.ok;
}

function attemptStealZeny(monster, level) {
  if(!monster)return {ok:false,reason:"沒有目標"};const state=getMonsterLootRuntime(monster);if(state.zenyStolen)return {ok:false,reason:"這隻怪物已被成功偷錢過"};
  const stats=typeof getPlayerTotalBasicStats==="function"?getPlayerTotalBasicStats():(player?.stats||{}),dex=Number(stats.dex||1),luk=Number(stats.luk||1),baseLv=Number(player?.baseLevel||1),targetLv=Number(monster.level||monster.baseLevel||1);
  const chance=Math.max(0,Math.min(100,(10*Number(level||1)+dex/2+luk/2+2*(baseLv-targetLv))/10));if(Math.random()*100>=chance)return {ok:false,reason:"機率判定失敗",chance};
  const finalZeny=getMonsterFinalZenyReward(monster);if(finalZeny<=0)return {ok:false,reason:"這隻怪物沒有 Zeny"};const amount=Math.max(1,Math.floor(finalZeny*Math.min(50,Number(level||1)*5)/100));addZeny(amount);state.zenyStolen=true;return {ok:true,amount,chance};
}

function rollZeny(monster) {
  if (Number.isFinite(Number(monster.zeny))) {
    return Number(monster.zeny);
  }

  const min = Number(monster.zenyMin ?? 0);
  const max = Number(monster.zenyMax ?? min);

  return randomInt(Math.min(min, max), Math.max(min, max));
}

function getLearnedPassiveExtraDropSkills() {
  const passives = typeof getLearnedPassiveRuntimeSkills === "function"
    ? getLearnedPassiveRuntimeSkills()
    : (typeof getCurrentJobSkills === "function" ? getCurrentJobSkills() : []);
  return (passives || []).filter(skill => {
    const level = typeof getSkillLevel === "function" ? Number(getSkillLevel(skill.id) || 0) : 0;
    const profile = typeof getSkillRuntimeProfile === "function" ? getSkillRuntimeProfile(skill) : null;
    return level > 0 && profile?.handler === "passive" && profile?.extraDropTable;
  });
}

function rollPassiveSkillExtraDrops(monster) {
  if (!monster) return [];
  const state = getMonsterLootRuntime(monster);
  if (state.passiveExtraDropsRolled) return [];
  state.passiveExtraDropsRolled = true;

  const awarded = [];
  getLearnedPassiveExtraDropSkills().forEach(skill => {
    const profile = getSkillRuntimeProfile(skill);
    const table = profile?.extraDropTable || {};
    const entries = Array.isArray(table.entries) ? table.entries.filter(entry => Number(entry?.itemId || 0) > 0 && Number(entry?.rate || 0) > 0) : [];
    if (!entries.length) return;

    // RA GROUP_ALGORITHM_DROP：先等機率挑選群組中的一個項目，再以該項目的 rate 判定是否掉落。
    const selected = entries[Math.min(entries.length - 1, Math.floor(Math.random() * entries.length))];
    const rateKey = table.rateScale || "drop";
    const rawChance = Number(selected.rate || 0);
    const ratedChance = typeof applyRate === "function" ? applyRate(rawChance, rateKey) : rawChance;
    const finalChance = typeof applyTrainingRewardBonus === "function" ? applyTrainingRewardBonus(ratedChance, rateKey) : ratedChance;
    const chance = Math.max(0, Math.min(10000, Number(finalChance || 0)));
    const roll = Math.floor(Math.random() * 10000) + 1;
    if (roll > chance) return;

    const itemId = typeof normalizeItemId === "function" ? normalizeItemId(selected.itemId) : selected.itemId;
    const itemData = typeof getItemData === "function" ? getItemData(itemId) : null;
    const itemName = itemData?.name || selected.name || selected.aegisName || `Item ${itemId}`;
    const qty = Math.max(1, Number(table.quantity || selected.quantity || 1));
    if (typeof addItem === "function") addItem({ id: itemId, name: itemName }, qty);
    if (typeof recordItemDrop === "function") recordItemDrop(itemId, qty);
    emitLootRewardLog(`${skill.name || "被動技能"}：額外取得 ${itemName} ×${qty}。`, "item");
    awarded.push({ skillId: Number(skill.officialId ?? skill.id), itemId, itemName, qty, rawChance, finalChance: chance });
  });
  return awarded;
}

// chance 採用萬分比：10000 = 100%，1000 = 10%，1 = 0.01%
function rollMonsterDrops(monster) {
  if (!monster.drops || monster.drops.length === 0) return;

  monster.drops.forEach(drop => {
    const rawChance = Number(drop.chance || 0);
    if (rawChance <= 0) return;

    const ratedChance = applyTrainingRewardBonus(applyRate(rawChance, "drop"), "drop");
    const chance = Math.min(10000, ratedChance);
    const roll = Math.floor(Math.random() * 10000) + 1;

    if (roll <= chance) {
      const itemId = normalizeItemId(drop.itemId);
      const itemData = getItemData(itemId);
      const qty = rollDropQuantity(drop);
      const itemName = itemData?.name || drop.name || `Item ${itemId}`;

      addItem({
        id: itemId,
        name: itemName
      }, qty);

      if (typeof recordItemDrop === "function") {
        recordItemDrop(itemId, qty);
      }
    }
  });
}

function rollDropQuantity(drop) {
  if (Number.isFinite(Number(drop.qty))) {
    return Math.max(1, Number(drop.qty));
  }

  const min = Number(drop.qtyMin ?? 1);
  const max = Number(drop.qtyMax ?? min);

  return Math.max(1, randomInt(Math.min(min, max), Math.max(min, max)));
}
