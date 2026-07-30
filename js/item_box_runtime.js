//=======================================
// RO_WEB ItemBoxRuntime v0.9.82HR
// Generic weighted loot-box runtime. Supports the EP19 Dim Glacier box and
// exact rAthena weighted Item Groups for Gift/Old Blue/Old Purple boxes.
//=======================================
(function () {
  "use strict";
  const VERSION = "0.9.82HR";
  const DATA_KEY = "data/item_boxes.json";
  const number = (v, f = 0) => Number.isFinite(Number(v)) ? Number(v) : f;
  const config = () => window.RO_WEB_DATA?.[DATA_KEY] || { boxes:{} };
  const allBoxes = () => Object.values(config().boxes || {});
  const itemData = id => window.getItemData?.(id) || null;
  function boxForItem(item) {
    if (!item) return null;
    const byKey = item.lootBoxId && config().boxes?.[String(item.lootBoxId)];
    return byKey || allBoxes().find(box => String(box.itemId) === String(item.id)) || null;
  }
  function inventoryStack(itemId) {
    return (window.player?.inventory || []).find(row => String(row.id) === String(itemId) && number(row.count) > 0) || null;
  }
  function removeStack(itemId, amount = 1) {
    const stack = inventoryStack(itemId); const count = Math.max(1, Math.floor(number(amount,1)));
    if (!stack || number(stack.count) < count) return false;
    stack.count = number(stack.count) - count;
    if (stack.count <= 0) {
      const index = window.player.inventory.indexOf(stack);
      if (index >= 0) window.player.inventory.splice(index,1);
    }
    return true;
  }
  function restoreStack(item, amount = 1) {
    const count = Math.max(1, Math.floor(number(amount,1))); const stack = inventoryStack(item.id);
    if (stack) stack.count = number(stack.count) + count;
    else window.player.inventory.push({ id:item.id, name:item.name, count, locked:false });
  }
  function weightedReward(box) {
    // Never filter missing item data out of the weighted denominator. Doing so
    // silently changes official RA probabilities. openBox() validates the chosen
    // reward before consuming the container and aborts safely if data is missing.
    const rewards=(box?.rewards || []).filter(row => number(row.weight,0) > 0);
    if (!rewards.length) return null;
    const total=rewards.reduce((sum,row)=>sum+number(row.weight,0),0);
    if (!(total > 0)) return null;
    let roll=Math.random()*total;
    for (const row of rewards) { roll-=number(row.weight,0); if (roll < 0) return row; }
    return rewards[rewards.length-1];
  }
  function rewardChanceBasisPoints(box,reward) {
    if (!box || !reward) return 0;
    if (window.RareItemAnnouncementRuntime?.weightedItemChanceBasisPoints) {
      return window.RareItemAnnouncementRuntime.weightedItemChanceBasisPoints(box.rewards, reward, 10000);
    }
    const rewards=(box.rewards || []).filter(row => number(row.weight,0) > 0);
    const total=rewards.reduce((sum,row)=>sum+number(row.weight,0),0);
    if (!(total > 0)) return 0;
    const selectedId=String(reward.itemId);
    const matching=rewards.reduce((sum,row)=>String(row.itemId)===selectedId?sum+number(row.weight,0):sum,0);
    return Math.max(0,Math.min(10000,matching/total*10000));
  }
  function openBox(item) {
    const box=boxForItem(item); if (!box) return false;
    const consumeCount=Math.max(1,Math.floor(number(box.consumeCount,1)));
    const stack=inventoryStack(item.id);
    if (!stack || number(stack.count) < consumeCount) { window.addBattleLog?.(`背包裡沒有 ${item.name}。`); return false; }
    const reward=weightedReward(box);
    if (!reward) { window.addBattleLog?.(`${item.name} 的獎池資料異常，未消耗箱子。`); return false; }
    const rewardItem=itemData(reward.itemId);
    if (!rewardItem) { window.addBattleLog?.(`${item.name} 的獎勵物品 ${reward.itemId} 資料尚未載入，未消耗箱子。`); return false; }
    if (!removeStack(item.id,consumeCount)) return false;
    const oldBatch=window.RO_WEB_REWARD_BATCH_ACTIVE, oldSuppress=window.RO_WEB_SUPPRESS_REWARD_ADD_ITEM_LOG;
    try {
      window.RO_WEB_REWARD_BATCH_ACTIVE=true; window.RO_WEB_SUPPRESS_REWARD_ADD_ITEM_LOG=true;
      window.addItem?.({id:Number(rewardItem.id),name:rewardItem.name},Math.max(1,Math.floor(number(reward.quantity,1))));
    } catch (error) {
      restoreStack(item,consumeCount); console.error('[ItemBoxRuntime] rollback',error);
      window.addBattleLog?.(`${item.name} 開啟失敗，箱子已自動歸還。`); return false;
    } finally {
      window.RO_WEB_REWARD_BATCH_ACTIVE=oldBatch; window.RO_WEB_SUPPRESS_REWARD_ADD_ITEM_LOG=oldSuppress;
    }
    const rewardQuantity=Math.max(1,Math.floor(number(reward.quantity,1)));
    const actualChance=rewardChanceBasisPoints(box,reward);
    window.RareItemAnnouncementRuntime?.announceAcquisition?.({
      itemId:rewardItem.id, itemName:rewardItem.name, quantity:rewardQuantity, chanceBasisPoints:actualChance,
      source:"item_box", sourceLabel:item.name
    });
    window.addBattleLog?.(`開啟 ${item.name}，獲得 ${rewardItem.name} ×${rewardQuantity}。`,'rare-item');
    window.updateInventoryUI?.(); window.saveGame?.({reason:'item-box-reward'});
    return true;
  }
  const previousUseItem=window.useItem;
  window.useItem=function itemBoxUseItem(itemId,instance=null,options={}) {
    const item=itemData(itemId); if (boxForItem(item)) return openBox(item);
    return previousUseItem?.(itemId,instance,options);
  };
  window.ItemBoxRuntime=Object.freeze({version:VERSION,config,boxForItem,weightedReward,rewardChanceBasisPoints,openBox});
})();
