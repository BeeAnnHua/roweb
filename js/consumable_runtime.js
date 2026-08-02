//=======================================
// RO_WEB ConsumableRuntime v0.9.82HQ
// Safe rAthena consumable bridge. Supported effects are applied exactly once;
// unsupported mechanics are reported and never silently consume the item.
//=======================================
(function(){
  "use strict";
  const VERSION="0.9.82IL1";
  const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
  const text=v=>String(v??"").trim();
  const scriptOf=item=>text(item?.scriptRaw||item?.Script||item?.script);
  const inventoryStack=id=>(window.player?.inventory||[]).find(x=>String(x.id)===String(id)&&num(x.count)>0)||null;
  const splitArgs=source=>{const out=[];let current="",depth=0,quote="";for(const ch of text(source)){if(quote){current+=ch;if(ch===quote)quote="";continue;}if(ch==='"'||ch==="'"){quote=ch;current+=ch;continue;}if(ch==='(')depth++;else if(ch===')')depth=Math.max(0,depth-1);if(ch===','&&depth===0){out.push(current.trim());current="";}else current+=ch;}if(current.trim()||out.length)out.push(current.trim());return out;};
  const splitStatements=source=>{const out=[];let current="",quote="",escape=false;for(const ch of text(source)){if(escape){current+=ch;escape=false;continue;}if(ch==="\\"&&quote){current+=ch;escape=true;continue;}if(quote){current+=ch;if(ch===quote)quote="";continue;}if(ch==='"'||ch==="'"){quote=ch;current+=ch;continue;}if(ch===';'){if(current.trim())out.push(current.trim());current="";}else current+=ch;}if(current.trim())out.push(current.trim());return out;};
  function evalValue(raw,roll=true){const s=text(raw);const m=s.match(/^rand\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)$/i);if(m){const a=num(m[1]),b=num(m[2]);return roll?Math.round(Math.min(a,b)+Math.random()*Math.abs(b-a)):Math.round((a+b)/2);}return num(s);}
  const STATUS_EFFECTS=Object.freeze({
    SC_ASPDPOTION0:{key:"aspdFlat",group:"aspd_potion"},SC_ASPDPOTION1:{key:"aspdFlat",group:"aspd_potion"},SC_ASPDPOTION2:{key:"aspdFlat",group:"aspd_potion"},SC_ASPDPOTION3:{key:"aspdFlat",group:"aspd_potion"},
    SC_SPEEDUP0:{key:"moveSpeedRate",group:"movement_speed"},SC_STRFOOD:{key:"strFlat",group:"food_str"},SC_FOOD_STR_CASH:{key:"strFlat",group:"food_str"},
    SC_AGIFOOD:{key:"agiFlat",group:"food_agi"},SC_FOOD_AGI_CASH:{key:"agiFlat",group:"food_agi"},SC_VITFOOD:{key:"vitFlat",group:"food_vit"},SC_FOOD_VIT_CASH:{key:"vitFlat",group:"food_vit"},
    SC_INTFOOD:{key:"intFlat",group:"food_int"},SC_FOOD_INT_CASH:{key:"intFlat",group:"food_int"},SC_DEXFOOD:{key:"dexFlat",group:"food_dex"},SC_FOOD_DEX_CASH:{key:"dexFlat",group:"food_dex"},
    SC_LUKFOOD:{key:"lukFlat",group:"food_luk"},SC_FOOD_LUK_CASH:{key:"lukFlat",group:"food_luk"},SC_ULTIMATECOOK:{key:"allStatsFlat",group:"ultimate_food"},
    SC_ATKPOTION:{key:"atkFlat",group:"atk_potion"},SC_MATKPOTION:{key:"matkFlat",group:"matk_potion"},SC_HITFOOD:{key:"hitFlat",group:"hit_food"},SC_FLEEFOOD:{key:"fleeFlat",group:"flee_food"},SC_CRIFOOD:{key:"criFlat",group:"cri_food"}
  });
  const HARMFUL_STATUS=Object.freeze({SC_FREEZE:"freeze",SC_STUN:"stun",SC_BLIND:"blind",SC_DPOISON:"deadlypoison",SC_POISON:"poison"});
  const SAFE_IGNORED=new Set(["specialeffect2","showscript"]);
  const CURRENTLY_UNSUPPORTED=new Set(["pet","bpet","getgroupitem","itemskill","produce","cooking","makerune","homevolution","guildgetexp","monster","bonus_script_UNUSED"]);
  function commandsOf(script){const set=new Set();for(const m of text(script).matchAll(/(?:^|[;{}\n])\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?=\(|\s|;|$)/g))set.add(m[1].toLowerCase());return [...set];}
  function analyze(item){
    const script=scriptOf(item);const commands=commandsOf(script);const controlFlow=/\b(if|else|switch|while|for)\b/i.test(script);
    const unsupported=commands.filter(c=>CURRENTLY_UNSUPPORTED.has(c));
    if(controlFlow)unsupported.push("conditional_script");
    const hasSupported=/\b(sc_start|sc_end|percentheal|getitem|itemheal|bonus_script)\b/i.test(script)||/\bZeny\s*\+=/i.test(script);
    return {script,commands,controlFlow,unsupported:[...new Set(unsupported)],hasSupported};
  }
  function removeGroup(group){if(!group||!window.player)return;const buffs=player.activeBuffs||{};for(const [key,buff] of Object.entries(buffs)){if(String(buff?.consumableGroup||"")===String(group))delete buffs[key];}}
  function addBuff(item,status,durationMs,value){const spec=STATUS_EFFECTS[status];if(!spec||!window.player)return null;removeGroup(spec.group);player.activeBuffs=player.activeBuffs&&typeof player.activeBuffs==="object"?player.activeBuffs:{};const now=Date.now();const id=`item_buff_${item.id}_${status}`;player.activeBuffs[id]={id,name:item.name,sourceType:"consumable",sourceItemId:Number(item.id),status,consumableGroup:spec.group,startedAt:now,activatedAt:now,expiresAt:now+Math.max(1000,num(durationMs,1000)),effects:{[spec.key]:num(value)}};return {status,key:spec.key,value:num(value),durationMs:Math.max(1000,num(durationMs,1000))};}
  function applyHarmful(status,durationMs,chanceRaw){const key=HARMFUL_STATUS[status];if(!key||!window.player)return null;const basis=chanceRaw===undefined||chanceRaw===""?10000:Math.max(0,num(chanceRaw,10000));const chancePercent=Math.min(100,basis/100);const ok=window.StatusManager?.apply?.(player,key,{chancePercent,durationMs:Math.max(1000,num(durationMs,1000)),level:1,allowBoss:true,source:"consumable"});return {status:key,chancePercent,applied:ok!==false};}
  function removeOne(item,stack){const target=stack||inventoryStack(item.id);if(!target||num(target.count)<=0)return false;target.count=num(target.count)-1;if(target.count<=0)player.inventory=player.inventory.filter(x=>x!==target&&String(x.id)!==String(item.id));return true;}
  function finalize(item,stack,summary){if(!removeOne(item,stack))return false;window.markConsumableItemUsed?.(item);window.invalidateCardRuntime?.();window.recalculatePlayerStats?.();window.updatePlayerUI?.();window.updateInventoryUI?.();window.saveGame?.({reason:"consumable-runtime",itemId:item.id});if(summary)window.addBattleLog?.(`使用了 ${item.name}，${summary}。`);return true;}
  function applyHornScarabaScroll(item,stack=null){
    if(String(item?.id)!=="22750"||!window.player)return null;
    const target=stack||inventoryStack(item.id);if(!target||num(target.count)<=0){window.addBattleLog?.(`背包裡沒有 ${item.name}。`);return {handled:true,applied:false};}
    if(!removeOne(item,target))return {handled:true,applied:false};
    const now=Date.now(),transformDuration=1200000;
    player.cardRuntimeTransform={monsterId:2161,status:"MTF_ASPD2",values:[2,10],sourceId:22750,expiresAt:now+transformDuration};
    try{window.dispatchEvent?.(new CustomEvent("ro:web-player-transform",{detail:{...player.cardRuntimeTransform}}));}catch(_){}
    player.activeBuffs=player.activeBuffs&&typeof player.activeBuffs==="object"?player.activeBuffs:{};
    player.activeBuffs.horn_scaraba_scroll={id:"horn_scaraba_scroll",name:item.name,sourceType:"consumable",sourceItemId:22750,startedAt:now,activatedAt:now,expiresAt:now+transformDuration,effects:{aspdRate:10,hitFlat:10}};
    const equippedIds=Object.values(player.equipment||{}).map(String);
    if(equippedIds.includes("400511"))player.activeBuffs.queen_scaraba_scroll_combo={id:"queen_scaraba_scroll_combo",name:"女王甲蟲頭盔－雙角甲蟲變身",sourceType:"consumable",sourceItemId:22750,startedAt:now,activatedAt:now,expiresAt:now+300000,effects:{sizeDamage:{All:5},magicSizeDamage:{All:5}}};
    window.markConsumableItemUsed?.(item);window.invalidateCardRuntime?.();window.recalculatePlayerStats?.();window.updatePlayerUI?.();window.updateInventoryUI?.();window.saveGame?.({reason:"horn-scaraba-scroll",itemId:22750});
    window.addBattleLog?.(`使用了 ${item.name}，完成雙角甲蟲變身${equippedIds.includes("400511")?"；女王甲蟲頭盔套裝效果持續5分鐘":""}。`);
    return {handled:true,applied:true,consumed:true};
  }

  function applyScarabaSummonBook(item,stack=null){
    if(String(item?.id)!=="12806"||!window.player)return null;
    const target=stack||inventoryStack(item.id);
    if(!target||num(target.count)<=0){window.addBattleLog?.(`背包裡沒有 ${item.name}。`);return {handled:true,applied:false};}
    if(!removeOne(item,target))return {handled:true,applied:false};
    player.activeBuffs=player.activeBuffs&&typeof player.activeBuffs==="object"?player.activeBuffs:{};
    for(const [key,buff] of Object.entries(player.activeBuffs)){
      if(buff?.effects?.virtualSummonType)delete player.activeBuffs[key];
    }
    const now=Date.now();
    player.activeBuffs.scaraba_mercenary_12806={
      id:"scaraba_mercenary_12806",name:"甲蟲傭兵",level:1,sourceType:"consumable",sourceItemId:12806,
      effects:{virtualSummonType:"ScarabaMercenary",virtualSummonFamily:"mercenary",virtualSummonLevel:1},
      exclusiveBuffGroup:"virtual_summon_partner",startedAt:now,activatedAt:now,expiresAt:now+1800000
    };
    window.markConsumableItemUsed?.(item);window.invalidateCardRuntime?.();window.recalculatePlayerStats?.();window.updatePlayerUI?.();window.updateInventoryUI?.();window.updateVirtualSummonUI?.(true);window.saveGame?.({reason:"scaraba-summon-book",itemId:12806});
    window.addBattleLog?.("使用了甲蟲召喚書；甲蟲傭兵將以協助模式戰鬥30分鐘。","summon");
    return {handled:true,applied:true,consumed:true,summonType:"ScarabaMercenary",durationMs:1800000};
  }
  function apply(item,stack=null){
    const summonBook=applyScarabaSummonBook(item,stack);if(summonBook)return summonBook;
    const special=applyHornScarabaScroll(item,stack);if(special)return special;
    const audit=analyze(item);if(!audit.script)return {handled:false,audit};
    if(audit.unsupported.length){window.addBattleLog?.(`${item.name} 的官方效果包含目前尚未接入的機制（${audit.unsupported.join("、")}），本次不會消耗道具。`);return {handled:true,applied:false,blocked:true,audit};}
    if(!audit.hasSupported)return {handled:false,audit};
    const statusRows=[],harmRows=[],cureStatuses=[],bonusRows=[],grants=[];let hpFlat=0,spFlat=0,hpPct=0,spPct=0,zeny=0;
    for(const rawStatement of splitStatements(audit.script)){const statement=text(rawStatement);if(!statement)continue;let m;
      if((m=statement.match(/^sc_start\s+([A-Za-z0-9_]+)\s*,\s*(.*)$/i))){const args=splitArgs(m[2]);const status=text(m[1]).toUpperCase();const duration=evalValue(args[0]);const value=evalValue(args[1]);if(STATUS_EFFECTS[status])statusRows.push({status,duration,value});else if(HARMFUL_STATUS[status])harmRows.push({status,duration,chance:args[2]});else {window.addBattleLog?.(`${item.name} 的狀態效果 ${status} 尚未接入，本次不會消耗道具。`);return {handled:true,applied:false,blocked:true,audit};}continue;}
      if((m=statement.match(/^bonus_script\s+"([\s\S]*)"\s*,\s*(.*)$/i))){const args=splitArgs(m[2]);bonusRows.push({raw:m[1],durationMs:Math.max(1000,evalValue(args[0])*1000)});continue;}
      if((m=statement.match(/^sc_end\s+([A-Za-z0-9_]+)/i))){cureStatuses.push(text(m[1]).replace(/^SC_/i,""));continue;}
      if((m=statement.match(/^itemheal\s+(.*)$/i))){const args=splitArgs(m[1]);hpFlat+=Math.max(0,evalValue(args[0]));spFlat+=Math.max(0,evalValue(args[1]));continue;}
      if((m=statement.match(/^percentheal\s+(.*)$/i))){const args=splitArgs(m[1]);const h=evalValue(args[0]),s=evalValue(args[1]);if(h<0||s<0){window.addBattleLog?.(`${item.name} 包含致死／負值恢復效果，目前為避免誤判不會消耗道具。`);return {handled:true,applied:false,blocked:true,audit};}hpPct+=h;spPct+=s;continue;}
      if((m=statement.match(/^getitem\s+(.*)$/i))){const args=splitArgs(m[1]);const id=Math.trunc(evalValue(args[0])),qty=Math.max(1,Math.trunc(evalValue(args[1])));if(id>0)grants.push({id,qty});continue;}
      if((m=statement.match(/^Zeny\s*\+=\s*(.*)$/i))){zeny+=Math.max(0,Math.trunc(evalValue(m[1])));continue;}
      const cmd=(statement.match(/^([A-Za-z_][A-Za-z0-9_]*)/)||[])[1]?.toLowerCase();if(cmd&&SAFE_IGNORED.has(cmd))continue;
    }
    const compiledBonuses=[];
    for(const row of bonusRows){
      if(!window.CardRuntime?.compileRawScript||!window.CardRuntime?._debugEvaluateRecord){window.addBattleLog?.(`${item.name} 的 bonus_script Runtime 尚未載入，本次不會消耗道具。`);return {handled:true,applied:false,blocked:true,audit};}
      const record={id:`consumable_${item.id}`,name:item.name,compiledScript:window.CardRuntime.compileRawScript(row.raw),sourceType:"consumableTemp"};
      const source=window.CardRuntime._debugEvaluateRecord(record,{sourceType:"consumableTemp",equippedIds:[]});
      if(source?.runtimeError||Object.keys(source?.rawBonuses||{}).length){window.addBattleLog?.(`${item.name} 的 bonus_script 尚有未支援效果，本次不會消耗道具。`);return {handled:true,applied:false,blocked:true,audit};}
      const effects={};for(const [key,value] of Object.entries(source||{})){if(["id","name","sourceId","sourceType","runtimeError","rawBonuses"].includes(key))continue;if(typeof value==="number"&&value!==0)effects[key]=value;else if(value&&typeof value==="object"&&(Array.isArray(value)?value.length:Object.keys(value).length))effects[key]=value;}
      compiledBonuses.push({...row,effects});
    }
    const target=stack||inventoryStack(item.id);if(!target||num(target.count)<=0){window.addBattleLog?.(`背包裡沒有 ${item.name}。`);return {handled:true,applied:false};}
    for(const grant of grants){const row=window.getItemData?.(grant.id);if(!row){window.addBattleLog?.(`${item.name} 的獎勵物品 ${grant.id} 尚未載入，本次不會消耗道具。`);return {handled:true,applied:false,blocked:true,audit};}}
    const beforeHp=num(player.hp),beforeSp=num(player.sp);const maxHp=num(player.maxHp,beforeHp),maxSp=num(player.maxSp,beforeSp);
    const fixedHp=hpFlat>0&&typeof window.calculateItemRecoveryAmount==="function"?window.calculateItemRecoveryAmount(hpFlat,"hp",item):hpFlat;
    const fixedSp=spFlat>0&&typeof window.calculateItemRecoveryAmount==="function"?window.calculateItemRecoveryAmount(spFlat,"sp",item):spFlat;
    if(fixedHp||hpPct)player.hp=Math.min(maxHp,beforeHp+Math.max(0,num(fixedHp))+Math.floor(maxHp*hpPct/100));if(fixedSp||spPct)player.sp=Math.min(maxSp,beforeSp+Math.max(0,num(fixedSp))+Math.floor(maxSp*spPct/100));
    const buffs=statusRows.map(r=>addBuff(item,r.status,r.duration,r.value)).filter(Boolean);
    for(const [index,row] of compiledBonuses.entries()){player.activeBuffs=player.activeBuffs&&typeof player.activeBuffs==="object"?player.activeBuffs:{};const now=Date.now(),id=`item_bonus_${item.id}_${index}`;player.activeBuffs[id]={id,name:item.name,sourceType:"consumable",sourceItemId:Number(item.id),consumableGroup:`bonus_script_${item.id}_${index}`,startedAt:now,activatedAt:now,expiresAt:now+row.durationMs,effects:row.effects};buffs.push({status:"BONUS_SCRIPT",durationMs:row.durationMs,value:Object.keys(row.effects).length,key:Object.keys(row.effects).join("+")});}
    const harmful=harmRows.map(r=>applyHarmful(r.status,r.duration,r.chance)).filter(Boolean);
    const cureProfile={statuses:cureStatuses.map(x=>window.normalizeAutoStatusKey?.(x)||String(x).toLowerCase()),clearAll:false};
    const activeKeys=window.getPlayerActiveStatusKeys?.()||[];const matched=window.getMatchedStatusCureKeys?.(cureProfile,activeKeys)||cureProfile.statuses;
    const cured=cureStatuses.length?(window.clearPlayerStatuses?.(matched)||[]):[];
    if(!removeOne(item,target))return {handled:true,applied:false};
    for(const grant of grants){const row=window.getItemData(grant.id);window.addItem?.({id:Number(row.id),name:row.name},grant.qty);}
    if(zeny>0)window.addZeny?.(zeny);
    window.markConsumableItemUsed?.(item);window.invalidateCardRuntime?.();window.recalculatePlayerStats?.();window.updatePlayerUI?.();window.updateInventoryUI?.();window.saveGame?.({reason:"consumable-runtime",itemId:item.id});
    const parts=[];const actualHp=Math.max(0,num(player.hp)-beforeHp),actualSp=Math.max(0,num(player.sp)-beforeSp);if(actualHp)parts.push(`HP 恢復 ${actualHp}`);if(actualSp)parts.push(`SP 恢復 ${actualSp}`);for(const b of buffs)parts.push(`${b.key} +${b.value}（${Math.max(1,Math.round(b.durationMs/60000))} 分鐘）`);if(harmful.some(x=>x.applied))parts.push("觸發附帶狀態");if(cured.length)parts.push(`解除 ${cured.length} 種異常狀態`);if(grants.length)parts.push(`獲得 ${grants.length} 種物品`);if(zeny)parts.push(`獲得 ${zeny} Zeny`);
    window.addBattleLog?.(`使用了 ${item.name}${parts.length?'，'+parts.join('；'):''}。`);
    return {handled:true,applied:true,consumed:true,buffs,harmful,grants,zeny,audit};
  }
  function hasActiveItemEffect(itemId,status=""){const now=Date.now();return Object.values(window.player?.activeBuffs||{}).some(b=>String(b?.sourceItemId)===String(itemId)&&(!status||String(b?.status)===String(status))&&num(b?.expiresAt)>now);}
  window.ConsumableRuntime=Object.freeze({version:VERSION,analyze,apply,hasActiveItemEffect,getStatusEffectMap:()=>STATUS_EFFECTS});
})();
