from pathlib import Path
import json,re
R=Path('/mnt/data/ro_fv_work')

def subfile(rel,old,new,count=1):
 p=R/rel;s=p.read_text(encoding='utf-8')
 if old not in s: raise SystemExit(f'missing marker {rel}: {old[:80]}')
 s=s.replace(old,new,count);p.write_text(s,encoding='utf-8')

# index: add runtime and bump cache.
p=R/'index.html';s=p.read_text(encoding='utf-8')
s=s.replace('<script src="./js/item_instance_ui.js?v=0.9.82FU"></script>', '<script src="./js/item_instance_ui.js?v=0.9.82FV"></script>\n  <script src="./js/card_runtime.js?v=0.9.82FV"></script>')
s=s.replace('0.9.82FU','0.9.82FV')
p.write_text(s,encoding='utf-8')

# Status source integration: item data + evaluated card/combo modifier sources.
subfile('js/status_system.js',
'''    const instanceCards = typeof getEquipmentInstance === 'function' ? getEquipmentInstance(slot)?.cards : null;
    const slotted = player?.equipmentCards?.[slot] || player?.socketedCards?.[slot];
    const cardIds = Array.isArray(instanceCards) ? instanceCards.filter(Boolean) : (Array.isArray(slotted) ? slotted : (Array.isArray(item.cards) ? item.cards : (Array.isArray(item.cardIds) ? item.cardIds : [])));
    cardIds.forEach(cardId => { const card = getItemData(cardId); if (card) result.push(card); });
  });
  return result;''',
'''  });
  if (window.CardRuntime?.getSources) result.push(...window.CardRuntime.getSources());
  return result;''')

subfile('js/combat_formula_runtime.js',
'''      const instanceCards=typeof window.getEquipmentInstance==='function'?window.getEquipmentInstance(slot)?.cards:null;
      const slotCards=unit?.equipmentCards?.[slot]||unit?.socketedCards?.[slot];
      const cards=Array.isArray(instanceCards)?instanceCards.filter(Boolean):(Array.isArray(slotCards)?slotCards:(Array.isArray(item.cards)?item.cards:(Array.isArray(item.cardIds)?item.cardIds:[])));
      for(const cid of cards){const card=getItem(cid);if(card)result.push(card);}
    }
    return result;''',
'''    }
    if(window.CardRuntime?.getSources)result.push(...window.CardRuntime.getSources());
    return result;''')

subfile('js/skill_engine.js',
'''    const instanceCards = typeof getEquipmentInstance === 'function' ? getEquipmentInstance(slot)?.cards : null;
    const slotCards = player?.equipmentCards?.[slot] || player?.socketedCards?.[slot];
    const cardIds = Array.isArray(instanceCards) ? instanceCards.filter(Boolean) : (Array.isArray(slotCards) ? slotCards : (Array.isArray(item.cards) ? item.cards : (Array.isArray(item.cardIds) ? item.cardIds : [])));
    for (const cardId of cardIds) {
      const card = getItemData(cardId);
      if (card) sources.push(card);
    }
  }
  return sources;''',
'''  }
  if (window.CardRuntime?.getSources) sources.push(...window.CardRuntime.getSources());
  return sources;''')

# Skill SP card reductions.
subfile('js/skill_engine.js',
'''function getRuntimeSkillSpCost(skill, level) {
  const raw = getRaLevelValue(skill?.spCost, level, 0, "Amount");
  const active = typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals() : {};
  let rate = 0;''',
'''function getRuntimeSkillSpCost(skill, level) {
  const raw = getRaLevelValue(skill?.spCost, level, 0, "Amount");
  const active = typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals() : {};
  const cardCost = window.CardRuntime?.getSkillSpCostModifier ? window.CardRuntime.getSkillSpCostModifier(skill) : { flat: 0, rate: 0 };
  let rate = Number(cardCost.rate || 0);''')
# Apply flat before final return. Inspect common line and replace first in function.
subfile('js/skill_engine.js',
'''  return Math.max(0, Math.floor(raw * Math.max(0, 100 - rate) / 100));
}''',
'''  return Math.max(0, Math.floor((raw + Number(cardCost.flat || 0)) * Math.max(0, 100 - rate) / 100));
}''')

# Skill card damage rate near calculate output: wrap damage returned by main formula at final common return.
# Insert helper and apply at the last stage of calculateSkillAttackDamage before return values through an existing final line.
marker='function calculateSkillAttackDamage(skill, requestedLevel = null, target = currentMonster, combatOptions = {}) {'
subfile('js/skill_engine.js',marker,
'''function applyCardSkillDamageRate(skill, damage) {
  const rate = window.CardRuntime?.getSkillDamageRate ? Number(window.CardRuntime.getSkillDamageRate(skill) || 0) : 0;
  return rate ? Math.max(0, Math.floor(Number(damage || 0) * (100 + rate) / 100)) : damage;
}

function calculateSkillAttackDamage(skill, requestedLevel = null, target = currentMonster, combatOptions = {}) {''')
# The function has multiple returns; easiest patch formula pipeline results at likely final return lines within function range.
p=R/'js/skill_engine.js';s=p.read_text(encoding='utf-8')
start=s.index('function calculateSkillAttackDamage(');end=s.index('\nfunction ',start+10)
chunk=s[start:end]
# Replace direct `return damage;` and result damage returns in this function only.
chunk=chunk.replace('return damage;','return applyCardSkillDamageRate(skill, damage);')
chunk=chunk.replace('return Math.max(1, Math.floor(damage));','return applyCardSkillDamageRate(skill, Math.max(1, Math.floor(damage)));')
s=s[:start]+chunk+s[end:];p.write_text(s,encoding='utf-8')

# Resource preview and auto-battle block metadata.
insert='''
function getRuntimeResourceDisplayName(type) {
  const labels = { spiritSphere: "氣功彈", servantWeapon: "劍體", rollingCutterCharge: "迴旋層數" };
  return labels[String(type || "")] || "戰鬥資源";
}
function previewRuntimeResourceCost(profile, level = 1) {
  const cfg = profile?.resourceCost;
  if (!cfg || !window.CombatResourceManager) return { ok:true, used:0 };
  const sid=Number(profile?.skillId||0), active=typeof getActiveBuffBonusTotals==="function"?getActiveBuffBonusTotals():{};
  if(cfg.type==="spiritSphere"){
    const waived=(sid===2329&&Number(active.waiveFallenEmpireSphereCost||0)>0)||(sid===2330&&Number(active.waiveTigerCannonSphereCost||0)>0)||(sid===5009&&Number(active.waiveFlashComboSphereCost||0)>0)||(sid===2332&&Number(active.massiveFlameBlaster||0)>0)||(sid===2518&&Number(active.massiveFlameBlaster||0)>0);
    if(waived)return {ok:true,used:0,waived:true};
  }
  const type=String(cfg.type||""), current=Number(window.CombatResourceManager.get(type)||0);
  let required=Math.max(0,Number(getLevelValue(cfg.amount,level,1)));
  if(cfg.mode==="asura") required=Math.max(Number(cfg.minimum||5),5);
  if(current>=required)return {ok:true,type,current,required};
  const label=getRuntimeResourceDisplayName(type);
  return {ok:false,type,current,required,reason:`${label}不足（需要 ${required}，目前 ${current}）`,resourceBlock:{type,current,required,label,retryMs:15000}};
}
'''
subfile('js/skill_engine.js','function canCastSkill(skill, requestedLevel = null, expectedHandlers = null, options = {}) {',insert+'\nfunction canCastSkill(skill, requestedLevel = null, expectedHandlers = null, options = {}) {')
subfile('js/skill_engine.js',
'''  if (Number(player.zeny || 0) < zenyCost) return { ok: false, reason: `Zeny 不足，需要 ${zenyCost} Zeny` };
  return { ok: true, level, spCost, hpCost, zenyCost, profile };''',
'''  if (Number(player.zeny || 0) < zenyCost) return { ok: false, reason: `Zeny 不足，需要 ${zenyCost} Zeny` };
  const resourceCheck = previewRuntimeResourceCost(profile, level);
  if (!resourceCheck.ok) return { ok:false, level, spCost, hpCost, zenyCost, profile, reason:resourceCheck.reason, resourceBlock:resourceCheck.resourceBlock };
  return { ok: true, level, spCost, hpCost, zenyCost, profile };''')
# Export preview helper at end via direct append to avoid internal test issues.
p=R/'js/skill_engine.js';s=p.read_text(encoding='utf-8')+'\nwindow.previewRuntimeResourceCost = previewRuntimeResourceCost;\nwindow.getRuntimeResourceDisplayName = getRuntimeResourceDisplayName;\n';p.write_text(s,encoding='utf-8')

# Auto-battle 15-second suppression helpers and attack/buff integration.
auto_helpers='''
const AUTO_RESOURCE_RETRY_MS = 15000;
function normalizeAutoResourceRetryState() {
  if (!player) return {};
  player.autoCombat = player.autoCombat || {};
  player.autoCombat.resourceRetryUntil = player.autoCombat.resourceRetryUntil && typeof player.autoCombat.resourceRetryUntil === "object" ? player.autoCombat.resourceRetryUntil : {};
  const now=Date.now();
  Object.keys(player.autoCombat.resourceRetryUntil).forEach(key=>{if(Number(player.autoCombat.resourceRetryUntil[key]||0)<=now)delete player.autoCombat.resourceRetryUntil[key];});
  return player.autoCombat.resourceRetryUntil;
}
function getAutoResourceRetryKey(skill) { return String(skill?.officialId ?? skill?.id ?? 0); }
function isAutoSkillResourceSuppressed(skill) { return Date.now() < Number(normalizeAutoResourceRetryState()[getAutoResourceRetryKey(skill)] || 0); }
function suppressAutoSkillForResource(skill, block, options = {}) {
  if(!player||!skill)return 0;
  const until=Date.now()+Math.max(1000,Number(block?.retryMs||AUTO_RESOURCE_RETRY_MS));
  const state=normalizeAutoResourceRetryState(),key=getAutoResourceRetryKey(skill),previous=Number(state[key]||0); state[key]=Math.max(previous,until);
  if(previous<=Date.now()&&options.silent!==true&&typeof addBattleLog==="function") addBattleLog(`${skill.name}：${block?.label||"戰鬥資源"}不足，暫停自動施放 15 秒，先繼續普通攻擊。`);
  return state[key];
}
function handleAutoSkillResourceBlock(skill, check, options={}) {
  if(!check?.resourceBlock)return false; suppressAutoSkillForResource(skill,check.resourceBlock,options); return true;
}
'''
subfile('js/auto_battle.js','function tryAutoBuffs() {',auto_helpers+'\nfunction tryAutoBuffs() {')
# Buff loop: skip suppression and precheck before starting cast.
subfile('js/auto_battle.js',
'''    if (!setting.enabled) continue;
    if (!shouldCastBySp(setting.spPercent || 0)) continue;''',
'''    if (!setting.enabled) continue;
    if (isAutoSkillResourceSuppressed(skill)) continue;
    if (!shouldCastBySp(setting.spPercent || 0)) continue;''')
subfile('js/auto_battle.js',
'''    const level = Number(getSkillLevel(skill.id) || 1);
    const timing = typeof getRuntimeAdjustedCastTime === "function" ? getRuntimeAdjustedCastTime(skill, level) : { totalMs: 0 };''',
'''    const level = Number(getSkillLevel(skill.id) || 1);
    const precheck = typeof canCastSkill === "function" ? canCastSkill(skill, level) : { ok:true };
    if (!precheck.ok) { if (handleAutoSkillResourceBlock(skill, precheck)) continue; else continue; }
    const timing = typeof getRuntimeAdjustedCastTime === "function" ? getRuntimeAdjustedCastTime(skill, level) : { totalMs: 0 };''')
# Attack loop skip and suppress.
subfile('js/auto_battle.js',
'''    if (!cfg?.enabled || !cfg.skillId) continue;
    if (!shouldCastBySp(cfg.spPercent || 0)) continue;''',
'''    if (!cfg?.enabled || !cfg.skillId) continue;
    if (!shouldCastBySp(cfg.spPercent || 0)) continue;''')
subfile('js/auto_battle.js',
'''    const skill = getSkillDataById(cfg.skillId);
    if (!skill || (typeof getRuntimeSkillUiType === "function" ? getRuntimeSkillUiType(skill) !== "attack" : skill.skillType !== "attack")) continue;''',
'''    const skill = getSkillDataById(cfg.skillId);
    if (!skill || (typeof getRuntimeSkillUiType === "function" ? getRuntimeSkillUiType(skill) !== "attack" : skill.skillType !== "attack")) continue;
    if (isAutoSkillResourceSuppressed(skill)) continue;''')
subfile('js/auto_battle.js',
'''    if (!check.delayBlock) continue;
    const blockedChoice = {''',
'''    if (handleAutoSkillResourceBlock(skill, check)) continue;
    if (!check.delayBlock) continue;
    const blockedChoice = {''')
# Export helpers.
p=R/'js/auto_battle.js';s=p.read_text(encoding='utf-8')+'\nObject.assign(window,{isAutoSkillResourceSuppressed,suppressAutoSkillForResource,handleAutoSkillResourceBlock});\n';p.write_text(s,encoding='utf-8')

# battle recheck and late race fallback should suppress and continue normal rather than dead return.
subfile('js/battle.js',
'''    const recheck = typeof canCastSkill === "function" ? canCastSkill(autoAction.skill, autoAction.level) : { ok: true, level: autoAction.level };
    if (!recheck.ok) return;''',
'''    const recheck = typeof canCastSkill === "function" ? canCastSkill(autoAction.skill, autoAction.level) : { ok: true, level: autoAction.level };
    if (!recheck.ok) {
      if (typeof handleAutoSkillResourceBlock === "function" && handleAutoSkillResourceBlock(autoAction.skill, recheck)) {
        autoAction = { action:"normal", fallbackFromResource:true };
      } else return;
    }''')
# Need avoid still entering attack skill after autoAction changed; wrap condition line re-evaluation.
subfile('js/battle.js','''    const autoCastTiming = typeof getRuntimeAdjustedCastTime === "function" ? getRuntimeAdjustedCastTime(autoAction.skill, autoAction.level) : { totalMs: 0 };''',
'''    if (autoAction.action !== "attackSkill") {
      // Resource-gated auto skill was suspended; fall through to the normal attack path below.
    } else {
    const autoCastTiming = typeof getRuntimeAdjustedCastTime === "function" ? getRuntimeAdjustedCastTime(autoAction.skill, autoAction.level) : { totalMs: 0 };''')
# close inserted else before original attack skill block return line, at the final `return; }` around used path.
subfile('js/battle.js',
'''    }
    return;
  }

  if (!canPlayerAttackNow()) return;''',
'''    }
    return;
    }
  }

  if (!canPlayerAttackNow()) return;''')
# Card normal attack hook.
subfile('js/battle.js','''  if (typeof tryGankOnNormalAttack === "function") tryGankOnNormalAttack(currentMonster);''',
'''  if (typeof tryGankOnNormalAttack === "function") tryGankOnNormalAttack(currentMonster);
  if (window.CardRuntime?.onNormalAttack) window.CardRuntime.onNormalAttack(currentMonster, playerDamage);''')

# Loot: card EXP and extra drops/kill recovery.
subfile('js/loot.js',
'''  const baseExp = applyTrainingRewardBonus(applyRate(rawBaseExp, "baseExp"), "baseExp");
  const jobExp = applyTrainingRewardBonus(applyRate(rawJobExp, "jobExp"), "jobExp");''',
'''  const cardExpRate = window.CardRuntime?.getExpRate ? Number(window.CardRuntime.getExpRate(monster) || 0) : 0;
  const baseExp = Math.floor(applyTrainingRewardBonus(applyRate(rawBaseExp, "baseExp"), "baseExp") * (100 + cardExpRate) / 100);
  const jobExp = Math.floor(applyTrainingRewardBonus(applyRate(rawJobExp, "jobExp"), "jobExp") * (100 + cardExpRate) / 100);''')
subfile('js/loot.js',
'''  rollMonsterDrops(monster);
  rollPassiveSkillExtraDrops(monster);''',
'''  rollMonsterDrops(monster);
  rollPassiveSkillExtraDrops(monster);
  if (window.CardRuntime?.rollExtraDrops) window.CardRuntime.rollExtraDrops(monster);
  if (window.CardRuntime?.onMonsterDefeated) window.CardRuntime.onMonsterDefeated(monster);''')

# Extra skill card/combo source support and object-map granted skills.
subfile('js/extra_skill_runtime.js',
'''  function collectGrantedSkills(item){
    const raw=item?.grantedSkills??item?.GrantedSkills??[]; const rows=Array.isArray(raw)?raw:[raw];
    return rows.map(x=>typeof x==="number"||typeof x==="string"?{skillId:Number(x),level:1}:{skillId:Number(x?.skillId??x?.SkillId??x?.id),level:Number(x?.level??x?.Level??1)}).filter(x=>x.skillId>0&&x.level>0);
  }''',
'''  function collectGrantedSkills(item){
    const raw=item?.grantedSkills??item?.GrantedSkills??[];
    if(raw&&typeof raw==="object"&&!Array.isArray(raw)) return Object.entries(raw).map(([skillId,level])=>({skillId:Number(skillId),level:Number(level||1)})).filter(x=>x.skillId>0&&x.level>0);
    const rows=Array.isArray(raw)?raw:[raw];
    return rows.map(x=>typeof x==="number"||typeof x==="string"?{skillId:Number(x),level:1}:{skillId:Number(x?.skillId??x?.SkillId??x?.id),level:Number(x?.level??x?.Level??1)}).filter(x=>x.skillId>0&&x.level>0);
  }''')
subfile('js/extra_skill_runtime.js',
'''      (Array.isArray(cards)?cards:[]).forEach(cardId=>{const card=typeof getItemData==="function"?getItemData(cardId):null;collectGrantedSkills(card).forEach(g=>setSlot(`card:${slot}:${cardId}:${g.skillId}`,g.skillId,g.level,{sourceType:"card",sourceId:cardId,sourceSlot:slot,removeOnSourceLost:true}));});
    }
  }''',
'''    }
    (window.CardRuntime?.getSources?.()||[]).forEach((source,index)=>collectGrantedSkills(source).forEach(g=>setSlot(`card:runtime:${index}:${g.skillId}`,g.skillId,g.level,{sourceType:"card",sourceId:source.sourceId,removeOnSourceLost:true})));
  }''')

# NPC data.
p=R/'data/npcs.json';d=json.loads(p.read_text(encoding='utf-8'))
if not any(x.get('id')=='prontera_card_removal_npc' for x in d):
 d.insert(2,{'id':'prontera_card_removal_npc','cityId':'prontera','name':'卡片拆卸專員','type':'card_removal','description':'每次 1,000,000 Zeny；一般／Boss 卡 50%，含 MVP 卡 10%；失敗不破壞裝備或卡片。'})
p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

# Town NPC type/action/interact and custom panel.
subfile('js/town.js','''    storage: "倉庫"
  };''','''    storage: "倉庫",
    card_removal: "拆卡 NPC"
  };''')
subfile('js/town.js','''  if (npc.type === "job_change") return "轉職相談";
  return "交談";''','''  if (npc.type === "job_change") return "轉職相談";
  if (npc.type === "card_removal") return "拆卸卡片";
  return "交談";''')
subfile('js/town.js','''  if (npc.type === "job_change") {
    openJobChangeNpc(npc);
    return;
  }

  addBattleLog''','''  if (npc.type === "job_change") {
    openJobChangeNpc(npc);
    return;
  }
  if (npc.type === "card_removal") {
    openCardRemovalNpc(npc);
    return;
  }

  addBattleLog''')
# Insert removal functions before openShop.
removal='''
function getEquippedCardRemovalRows() {
  const rows=[];
  for(const [slot,itemId] of Object.entries(player?.equipment||{})){
    if(!itemId)continue;
    const instance=typeof getEquipmentInstance==="function"?getEquipmentInstance(slot):player?.equipmentInstances?.[slot];
    const cards=(instance?.cards||[]).filter(Boolean); if(!cards.length)continue;
    const item=getItemData(itemId); if(item)rows.push({slot,item,instance,cards});
  }
  return rows;
}
function openCardRemovalNpc(npc) {
  currentShopId="__card_removal__"; currentShopSelectedItem=null; closePurchaseDialog();
  const win=document.getElementById("shop-window"); if(win){win.classList.remove("hidden-window");win.classList.remove("is-shop-list-only");if(typeof bringWindowToFront==="function")bringWindowToFront(win);}
  renderCardRemovalPanel(npc);
}
function renderCardRemovalPanel(npc=getNpcData("prontera_card_removal_npc")) {
  const panel=document.getElementById("shop-panel"),list=document.getElementById("shop-item-list"),detail=document.getElementById("shop-detail-panel"),title=document.getElementById("shop-window-title");
  if(!panel||!list||!detail)return; panel.classList.remove("hidden-town-section"); if(title)title.textContent=npc?.name||"卡片拆卸專員";
  const head=panel.querySelector(".shop-title");if(head)head.textContent="選擇目前穿戴且已插卡的裝備";
  list.innerHTML=""; detail.innerHTML='<div class="shop-detail-card"><b>拆卡規則</b><div class="shop-detail-desc">費用：1,000,000 Zeny。<br>一般／Boss 卡：成功率 50%。<br>只要含一張 MVP 卡：整次成功率 10%。<br>失敗只扣費，不破壞裝備、不吞卡；成功會卸下裝備並把裝備與全部卡片放回背包。</div></div>';
  const rows=getEquippedCardRemovalRows(); if(!rows.length){list.innerHTML='<div class="town-empty">目前穿戴裝備上沒有可拆卸的卡片。</div>';return;}
  rows.forEach(row=>{const b=document.createElement("button");b.type="button";b.className="shop-item-row shop-item-button";
    const name=typeof buildEquipmentInstanceName==="function"?buildEquipmentInstanceName(row.instance,row.item):row.item.name;
    b.innerHTML=`<span class="shop-item-icon"><img src="${row.item.icon||`images/items/${row.item.id}.webp`}" alt=""></span><span class="shop-item-name"><b>${name}</b><small>${row.cards.length} 張卡片｜點擊查看</small></span>`;
    b.onclick=()=>selectCardRemovalEquipment(row);list.appendChild(b);});
}
function selectCardRemovalEquipment(row){
  const detail=document.getElementById("shop-detail-panel");if(!detail)return;
  const cardRows=row.cards.map(id=>{const c=getItemData(id)||window.CardRuntime?.getCardRecord?.(id);return `<div>${c?.name||`卡片 ${id}`}${c?.isMvpCard?'（MVP）':''}</div>`;}).join('');
  const hasMvp=row.cards.some(id=>(getItemData(id)||window.CardRuntime?.getCardRecord?.(id))?.isMvpCard===true),chance=hasMvp?10:50;
  detail.innerHTML=`<div class="shop-detail-card"><b>${typeof buildEquipmentInstanceName==="function"?buildEquipmentInstanceName(row.instance,row.item):row.item.name}</b><div class="shop-detail-desc">${cardRows}<br>本次成功率：${chance}%<br>費用：1,000,000 Zeny</div><div class="shop-action-row"><button type="button" id="card-removal-confirm">支付費用並拆除全部卡片</button></div></div>`;
  detail.querySelector("#card-removal-confirm").onclick=()=>confirmCardRemoval(row.slot);
}
function confirmCardRemoval(slot){
  const result=window.CardRuntime?.removeAllCardsFromEquipped?.(slot);
  if(!result){addBattleLog("拆卡系統尚未載入。","error");return;}
  if(result.ok)addBattleLog(`拆卡成功！裝備與 ${result.cards.length} 張卡片已放回背包。`);
  else if(result.failed)addBattleLog(`拆卡失敗（成功率 ${result.chance}%）。裝備與卡片保持不變，已扣除 1,000,000 Zeny。`);
  else addBattleLog(`無法拆卡：${result.reason||"未知原因"}。`,`error`);
  renderCardRemovalPanel();
}
'''
subfile('js/town.js','function openShop(shopId) {',removal+'\nfunction openShop(shopId) {')
p=R/'js/town.js';s=p.read_text(encoding='utf-8')+'\nObject.assign(window,{openCardRemovalNpc,renderCardRemovalPanel,confirmCardRemoval});\n';p.write_text(s,encoding='utf-8')

# Item UI Chinese naming and socket insertion action.
subfile('js/item_instance_ui.js',
'''  function getCardTitle(cardId) {
    const tables = getDisplayTables();
    const id = String(baseItemId(cardId));
    const explicit = String(tables.cardPrefixNames?.[id] || tables.cardItemAliases?.[id] || '').trim();
    if (explicit) return explicit;
    const base = stripCardSuffix(getCardInfo(id).name);
    return base ? `${base}的` : `卡片${id}的`;
  }''',
'''  function getCardTitle(cardId) {
    const id = String(baseItemId(cardId));
    const base = stripCardSuffix(getCardInfo(id).name);
    return base ? `${base}的` : `卡片${id}的`;
  }''')
subfile('js/item_instance_ui.js','function renderCardDetail(cardId) {','function renderCardDetail(cardId, context = {}) {')
# Add action before modal open.
subfile('js/item_instance_ui.js',
'''    body.appendChild(desc);
    modal.classList.remove('hidden-window');
  }

  function showItemDetail''',
'''    body.appendChild(desc);
    if (context.source === 'inventory') {
      const actions = document.getElementById('item-detail-actions');
      const primary = document.getElementById('item-detail-primary-action');
      const picker = document.getElementById('item-detail-quick-picker');
      const inventoryCard = (player?.inventory || []).find(row => String(row.id) === String(card.id) && Number(row.count || 0) > 0);
      if (actions && primary && picker && inventoryCard) {
        actions.hidden = false; primary.hidden = false; primary.textContent = '插入卡片';
        primary.onclick = () => {
          const candidates = window.CardRuntime?.getSocketCandidates?.(card.id) || [];
          picker.hidden = false; picker.innerHTML = '';
          if (!candidates.length) { picker.textContent = '背包中沒有部位符合、未穿戴且有空插槽的裝備。'; return; }
          const heading = document.createElement('div'); heading.className='item-detail-section-title'; heading.textContent='選擇要插卡的背包裝備'; picker.appendChild(heading);
          candidates.forEach(({instance,item}) => {
            const button=document.createElement('button');button.type='button';button.className='item-detail-socket-candidate';
            button.textContent=buildEquipmentInstanceName(instance,item);
            button.onclick=()=>{const result=window.CardRuntime?.socketCard?.(card.id,instance.instanceId);if(result?.ok){addBattleLog(`${card.name} 已插入 ${buildEquipmentInstanceName(result.instance,item)}。`);closeItemDetailModal();}else addBattleLog(`插卡失敗：${result?.reason||'未知原因'}。`,'error');};
            picker.appendChild(button);
          });
        };
      }
    }
    modal.classList.remove('hidden-window');
  }

  function showItemDetail''')
subfile('js/item_instance_ui.js',"if (String(data.type) === 'card') { renderCardDetail(data.id); return; }","if (String(data.type) === 'card') { renderCardDetail(data.id, context); return; }")
# Invalidate card cache on equip/unequip/socket relevant flows.
subfile('js/item_instance_ui.js','''    if (data) {
      player.inventory.push({ ...instance, count: 1 });''','''    if (data) {
      player.inventory.push({ ...instance, count: 1 });
      window.CardRuntime?.invalidate?.();''')
subfile('js/item_instance_ui.js','''    player.equipmentInstances[slot] = instance;
    normalizeEquipmentHandConflicts();''','''    player.equipmentInstances[slot] = instance;
    window.CardRuntime?.invalidate?.();
    normalizeEquipmentHandConflicts();''')
# Export names/instances already likely exported; ensure card functions accessible.
p=R/'js/item_instance_ui.js';s=p.read_text(encoding='utf-8')
if 'window.buildEquipmentInstanceName' not in s:
 s += '\nObject.assign(window,{getEquipmentInstance,buildEquipmentInstanceName,getCardInfo,normalizeEquipmentInstance});\n'
p.write_text(s,encoding='utf-8')

# CSS socket candidate.
p=R/'css/style.css';s=p.read_text(encoding='utf-8')+'''\n/* 0.9.82FV 卡片插入候選 */\n.item-detail-socket-candidate{display:block;width:100%;margin:6px 0;padding:8px 10px;text-align:left;border:1px solid rgba(255,255,255,.25);border-radius:6px;background:rgba(0,0,0,.28);color:inherit;cursor:pointer}.item-detail-socket-candidate:hover{background:rgba(255,255,255,.12)}\n''';p.write_text(s,encoding='utf-8')

# Bump version strings in important docs/js comments and manifest.
for rel in ['README.md','CHANGELOG.md','AI_START_HERE.md']:
 p=R/rel
 if p.exists():
  s=p.read_text(encoding='utf-8',errors='ignore').replace('0.9.82FU','0.9.82FV')
  p.write_text(s,encoding='utf-8')

print('FV runtime patches applied')
