// ============================================================
// 彼岸花仙境 / RO_WEB V0.9.87J
// Offline Continuity V1
// - Manual local-play toggle from gear menu
// - Automatic fallback after repeated network failures
// - Local-first play with cloud revision conflict protection
// ============================================================
(function(){
  "use strict";

  const VERSION = "0.9.87J";
  const STATE_PREFIX = "ro_web_offline_continuity_state_v1_";
  const LEASE_PREFIX = "ro_web_offline_verified_lease_v1_";
  const AUTO_FAILURE_THRESHOLD = 2;
  const AUTO_RETRY_MS = 15000;

  const runtime = {
    offline:false,
    mode:"cloud", // cloud | manual | auto
    reason:"",
    accountId:"",
    characterId:"",
    baseRevision:0,
    startedAt:0,
    cloudFailures:0,
    syncing:false,
    conflict:false,
    sharedStoragePending:false,
    retryTimer:null
  };

  function clone(value){
    try{return value==null?value:JSON.parse(JSON.stringify(value));}catch(_){return value;}
  }
  function context(){
    const active=window.CharacterSlotsRuntime?.getActiveContext?.()||{};
    return {
      accountId:String(active.accountId||""),
      characterId:String(active.characterId||""),
      revision:Math.max(0,Number(active.revision||0))
    };
  }
  function scopedKey(prefix,accountId,characterId){
    const a=String(accountId||"").trim(), c=String(characterId||"").trim();
    return a&&c?`${prefix}${a}_${c}`:"";
  }
  function stateKey(ctx=context()){return scopedKey(STATE_PREFIX,ctx.accountId,ctx.characterId);}
  function leaseKey(ctx=context()){return scopedKey(LEASE_PREFIX,ctx.accountId,ctx.characterId);}
  function readJson(key){
    if(!key)return null;
    try{return JSON.parse(localStorage.getItem(key)||"null");}catch(_){return null;}
  }
  async function readJsonDurable(key){
    if(!key)return null;
    const local=readJson(key);
    if(local)return local;
    try{
      const raw=await window.ROWebAuthStorage?.getItem?.(key);
      if(!raw)return null;
      const value=JSON.parse(raw);
      // Hydrate the tiny lease/state back to localStorage when space is available.
      try{localStorage.setItem(key,JSON.stringify(value));}catch(_){}
      return value;
    }catch(_){return null;}
  }
  function writeJson(key,value){
    if(!key)return false;
    const raw=JSON.stringify(value);
    let localOk=false;
    try{localStorage.setItem(key,raw);localOk=true;}catch(_){}
    // IndexedDB-backed mirror: keeps OFFLINE preference/lease usable even when localStorage is full.
    try{Promise.resolve(window.ROWebAuthStorage?.setItem?.(key,raw)).catch(()=>{});}catch(_){}
    return localOk||Boolean(window.ROWebAuthStorage);
  }
  function removeKey(key){
    try{if(key)localStorage.removeItem(key);}catch(_){}
    try{if(key)Promise.resolve(window.ROWebAuthStorage?.removeItem?.(key)).catch(()=>{});}catch(_){}
  }
  async function alertUi(message,title="離線模式"){
    if(window.ROGoldUI?.alert)return window.ROGoldUI.alert(String(message||""),{title});
    window.alert(String(message||""));
    return true;
  }
  async function confirmUi(message,title="離線模式",confirmText="確定"){
    if(window.ROGoldUI?.confirm)return Boolean(await window.ROGoldUI.confirm(String(message||""),{title,confirmText,cancelText:"取消"}));
    return window.confirm(String(message||""));
  }
  function isReadyGame(){return /^ready/.test(String(window.RO_WEB_BOOT_STATE?.status||""));}
  function isTransient(error){
    const raw=String(error?.message||error||"");
    const name=String(error?.name||"");
    const status=Number(error?.status??error?.statusCode);
    return /Failed to fetch|NetworkError|Load failed|fetch failed|ERR_NETWORK|ERR_INTERNET_DISCONNECTED|timeout|timed out|network request failed/i.test(raw)
      || /AuthRetryableFetchError/i.test(name)
      || (Number.isFinite(status)&&(status===0||status===408||status===425||status===429||status>=500));
  }
  function validateLease(lease,ctx=context()){
    if(!lease||String(lease.accountId||"")!==ctx.accountId||String(lease.characterId||"")!==ctx.characterId)return null;
    if(!Number.isFinite(Number(lease.revision)))return null;
    return lease;
  }
  function validatePersistedState(saved,ctx=context()){
    if(!saved||String(saved.accountId||"")!==ctx.accountId||String(saved.characterId||"")!==ctx.characterId)return null;
    if(!["manual","auto"].includes(String(saved.mode||"")))return null;
    return saved;
  }
  function getLease(ctx=context()){return validateLease(readJson(leaseKey(ctx)),ctx);}
  async function getLeaseDurable(ctx=context()){return validateLease(await readJsonDurable(leaseKey(ctx)),ctx);}
  function getPersistedState(ctx=context()){return validatePersistedState(readJson(stateKey(ctx)),ctx);}
  async function getPersistedStateDurable(ctx=context()){return validatePersistedState(await readJsonDurable(stateKey(ctx)),ctx);}
  function persistState(){
    const key=stateKey(runtime);
    if(!key)return false;
    return writeJson(key,{
      schema:"ro_web_offline_continuity_state_v1",
      version:1,
      accountId:runtime.accountId,
      characterId:runtime.characterId,
      mode:runtime.mode,
      reason:runtime.reason,
      baseRevision:Math.max(0,Number(runtime.baseRevision||0)),
      startedAt:Number(runtime.startedAt||Date.now()),
      updatedAt:Date.now(),
      conflict:runtime.conflict===true,
      sharedStoragePending:runtime.sharedStoragePending===true
    });
  }
  function clearPersistedState(ctx={accountId:runtime.accountId,characterId:runtime.characterId}){removeKey(stateKey(ctx));}

  function dispatch(){
    const detail=getState();
    window.RO_WEB_OFFLINE_STATE=detail;
    try{window.dispatchEvent(new CustomEvent("ro-web-offline-state",{detail}));}catch(_){}
    updateUi();
  }
  function getState(){return {...runtime,retryTimer:undefined};}
  function updateUi(){
    const badge=document.getElementById("offlineContinuityBadge");
    if(badge){
      badge.hidden=false;
      badge.classList.toggle("is-offline",runtime.offline);
      badge.classList.toggle("is-cloud",!runtime.offline&&!runtime.syncing);
      badge.classList.toggle("is-syncing",runtime.syncing);
      badge.textContent=runtime.syncing?"SYNC":(runtime.offline?"OFFLINE":"CLOUD");
      badge.disabled=runtime.syncing===true;
      badge.setAttribute("aria-label",runtime.syncing?"正在同步雲端":(runtime.offline?"目前為本地遊玩，點擊切換線上模式":"目前為雲端模式，點擊切換本地遊玩"));
      badge.title=runtime.syncing
        ? "正在保存、驗證並同步雲端版本…"
        : (runtime.offline
            ? `本地遊玩中｜${runtime.mode==="manual"?"手動切換":"網路中斷自動切換"}｜點擊可切換線上模式`
            : "雲端模式｜點擊可切換本地遊玩");
    }
    const button=document.getElementById("accountMenuOfflineButton");
    if(button){
      const label=button.querySelector("b"),small=button.querySelector("small");
      button.disabled=runtime.syncing===true;
      button.classList.toggle("is-offline-active",runtime.offline);
      if(label)label.textContent=runtime.syncing?"正在同步…":(runtime.offline?"切換線上模式":"切換本地遊玩");
      if(small)small.textContent=runtime.offline
        ? "先保存本機，再驗證雲端版本後安全同步"
        : "網路不穩時可在本機繼續掛機與練功";
    }
    document.body?.classList.toggle("ro-offline-mode",runtime.offline);
  }

  async function newestLocalCandidate(){
    const mgr=window.ROWebSaveManager;
    if(!mgr)return null;
    try{
      const local=typeof mgr.readLocalCandidates==="function"?mgr.readLocalCandidates():[];
      const durable=typeof mgr.readDurableCandidates==="function"?await mgr.readDurableCandidates():[];
      const rows=[...(local||[]),...(durable||[])].filter(row=>{
        try{return typeof mgr.candidateMatchesActiveCharacter==="function"?mgr.candidateMatchesActiveCharacter(row):true;}catch(_){return false;}
      });
      return typeof mgr.chooseNewest==="function"?mgr.chooseNewest(rows):rows[0]||null;
    }catch(error){console.warn("Offline Continuity: read local candidate failed",error);return null;}
  }
  function candidateLooksUsable(candidate){
    const p=candidate?.player;
    if(!p||typeof p!=="object")return false;
    const ctx=context();
    const a=String(candidate.accountId||p.accountId||"");
    const c=String(candidate.characterId||p.characterId||"");
    if(a&&ctx.accountId&&a!==ctx.accountId)return false;
    if(c&&ctx.characterId&&c!==ctx.characterId)return false;
    return Boolean(String(p.name||"").trim() || Number(p.baseLevel||1)>1 || Number(candidate.saveVersion||0)>0);
  }
  async function canBootOffline(){
    const ctx=context();
    if(!ctx.accountId||!ctx.characterId)return false;
    const lease=getLease(ctx)||await getLeaseDurable(ctx);
    if(!lease)return false;
    const candidate=await newestLocalCandidate();
    return candidateLooksUsable(candidate) && Number(candidate?.saveVersion||0) >= Number(lease.revision||0);
  }
  function wantsManualOfflineBoot(){
    const saved=getPersistedState(context());
    return Boolean(saved&&(saved.mode==="manual"||saved.conflict===true));
  }
  async function shouldBootManualOffline(){
    const ctx=context();
    const saved=getPersistedState(ctx)||await getPersistedStateDurable(ctx);
    if(!saved||!(saved.mode==="manual"||saved.conflict===true))return false;
    return await canBootOffline();
  }
  async function offerStartupFallback(attempt=0){
    if(!await canBootOffline())return false;
    const ok=await confirmUi(
      `雲端已連續 ${Number(attempt||0)} 次無法連線。\n\n這台裝置有上次已驗證的角色存檔，是否改用「本地遊玩」進入？\n\n離線期間可掛機、練功與取得一般掉落；精煉、附魔、拍賣、倉庫、信箱領取等功能會暫時鎖定。`,
      "雲端連線不穩",
      "本地進入"
    );
    return ok;
  }
  function restoreRuntimeFromSaved(saved,reason="startup"){
    const ctx=context();
    const lease=getLease(ctx);
    runtime.offline=true;
    runtime.mode=String(saved?.mode||"auto")==="manual"?"manual":"auto";
    runtime.reason=String(saved?.reason||reason||"offline-startup");
    runtime.accountId=ctx.accountId;
    runtime.characterId=ctx.characterId;
    runtime.baseRevision=Math.max(0,Number(saved?.baseRevision??lease?.revision??0));
    runtime.startedAt=Number(saved?.startedAt||Date.now());
    runtime.cloudFailures=0;
    runtime.syncing=false;
    runtime.conflict=saved?.conflict===true;
    runtime.sharedStoragePending=saved?.sharedStoragePending===true;
    persistState();
    dispatch();
    return true;
  }
  function activateOfflineBoot(mode="auto",reason="startup-fallback"){
    const ctx=context();
    const lease=getLease(ctx);
    const saved=getPersistedState(ctx);
    return restoreRuntimeFromSaved({
      ...(saved||{}),
      mode:mode==="manual"?"manual":"auto",
      reason,
      baseRevision:Number(saved?.baseRevision??lease?.revision??0),
      startedAt:Number(saved?.startedAt||Date.now()),
      conflict:saved?.conflict===true,
      sharedStoragePending:saved?.sharedStoragePending===true
    },reason);
  }

  function rememberCloudVerified(detail={}){
    const ctx=context();
    const accountId=String(detail.accountId||ctx.accountId||"");
    const characterId=String(detail.characterId||ctx.characterId||"");
    const revision=Math.max(0,Number(detail.revision??detail.saveVersion??0));
    if(!accountId||!characterId||!Number.isFinite(revision))return false;
    const account=window.ROWebCloudRuntime?.getAccount?.()||{};
    const active=window.CharacterSlotsRuntime?.getActiveCharacter?.()||{};
    writeJson(leaseKey({accountId,characterId}),{
      schema:"ro_web_offline_verified_lease_v1",
      version:1,
      accountId,characterId,revision,
      verifiedAt:Date.now(),
      playerId:Number(account.player_id||account?.cloud?.playerId||0),
      accountName:String(account.account_name||account?.cloud?.accountName||""),
      accountRole:String(account.account_role||"player"),
      isVip:account.is_vip===true,
      vipLevel:Number(account.vip_level||0),
      vipUntil:account.vip_until||null,
      characterName:String(active?.summary?.name||window.player?.name||""),
      slotIndex:Number(active?.slotIndex??-1)
    });
    if(!runtime.offline){runtime.cloudFailures=0;runtime.conflict=false;dispatch();}
    return true;
  }

  function closeCloudEconomyWindows(){
    try{window.ROAuctionRuntime?.close?.();}catch(_){}
    try{window.closeStorageWindow?.();}catch(_){}
    try{window.closeRefineWindow?.();}catch(_){}
    try{window.closeEnchantPlatform?.();}catch(_){}
    try{window.closeEnchantGradeWindow?.();}catch(_){}
    try{window.closeEnchantMaterialExchange?.();}catch(_){}
    try{window.closeLegacyWarehouseRescue?.();}catch(_){}
    try{const mail=document.getElementById("mail-window");if(mail){mail.classList.add("hidden-window");mail.hidden=true;}}catch(_){}
  }

  async function enterOffline(mode="auto",reason="network"){
    if(runtime.offline)return true;
    const ctx=context();
    if(!ctx.accountId||!ctx.characterId)return false;
    let lease=getLease(ctx);
    if(!lease){
      try{
        const revision=await window.ROWebCloudRuntime?.getRemoteRevision?.(ctx.characterId);
        if(Number.isFinite(Number(revision))){rememberCloudVerified({accountId:ctx.accountId,characterId:ctx.characterId,revision});lease=getLease(ctx);}
      }catch(_){}
    }
    if(!lease){
      if(mode==="manual")await alertUi("這隻角色尚未建立可驗證的雲端基準，請先在線上模式成功存檔一次，再切換本地遊玩。","無法切換本地模式");
      return false;
    }
    runtime.offline=true;
    runtime.mode=mode==="manual"?"manual":"auto";
    runtime.reason=String(reason||"network");
    runtime.accountId=ctx.accountId;
    runtime.characterId=ctx.characterId;
    runtime.baseRevision=Math.max(0,Number(lease.revision||0));
    runtime.startedAt=Date.now();
    runtime.cloudFailures=0;
    runtime.syncing=false;
    runtime.conflict=false;
    runtime.sharedStoragePending=window.RO_WEB_STORAGE_SYNC_STATE?.pending===true;
    persistState();
    closeCloudEconomyWindows();
    try{window.saveGame?.({reason:"offline-mode-enter",forceWriter:true,durableDelayMs:0});}catch(_){}
    dispatch();
    window.addBattleLog?.(runtime.mode==="manual"
      ? "已切換為本地遊玩：進度將保存在此裝置；雲端經濟功能暫停。"
      : "網路連線中斷，已自動切換 OFFLINE：掛機與一般練功可繼續。", "system");
    if(runtime.mode==="auto")scheduleAutoResume();
    return true;
  }

  async function requestManualOffline(){
    if(runtime.syncing)return false;
    if(runtime.offline)return requestCloudResume({manual:true});
    const ok=await confirmUi(
      "切換本地遊玩前會先完整保存目前角色進度。\n\n本地模式可繼續掛機、Base/Job EXP、Zeny、普通掉落與補品使用；精煉、附魔、拍賣場、共用倉庫、信箱領取與其他雲端交易會暫時停用。\n\n要切換嗎？",
      "切換本地遊玩",
      "保存並切換"
    );
    if(!ok)return false;
    runtime.syncing=true;dispatch();
    try{
      // First create the newest local snapshot. If cloud is reachable this also refreshes the verified lease.
      const localOk=await window.ROWebSaveManager?.saveAndWait?.({reason:"offline-manual-preflight",forceWriter:true,durableDelayMs:0});
      if(!localOk){await alertUi("本機存檔沒有通過驗證，已取消切換。請先確認瀏覽器儲存空間。","切換失敗");return false;}
      // If a warehouse operation is still waiting for cloud confirmation, do not enter OFFLINE yet.
      // Otherwise an item could exist in local character state while the cloud warehouse still owns the old copy.
      const storageState=window.RO_WEB_STORAGE_SYNC_STATE||{};
      if(storageState.pending===true&&window.ROWebCloudRuntime?.saveSharedStorage&&typeof window.getAccountStorageSnapshot==="function"){
        try{
          await window.ROWebCloudRuntime.saveSharedStorage(window.getAccountStorageSnapshot());
          storageState.pending=false;storageState.lastSyncedAt=Date.now();storageState.lastError="";
        }catch(error){
          await alertUi(`帳號共用倉庫還有尚未完成的雲端同步。為避免裝備重複，這次先不切換本地模式。

請等網路稍微恢復，確認倉庫同步完成後再試。`,"倉庫同步尚未完成");
          return false;
        }
      }
      let lease=getLease(context());
      if(!lease){
        try{
          const revision=await window.ROWebCloudRuntime?.getRemoteRevision?.();
          if(Number.isFinite(Number(revision))){rememberCloudVerified({revision});lease=getLease(context());}
        }catch(_){}
      }
      if(!lease){await alertUi("目前無法取得這隻角色最後一次已驗證的雲端版本，因此不安全切換本地模式。請網路恢復後先存檔一次。","切換失敗");return false;}
      return await enterOffline("manual","user-toggle");
    }finally{runtime.syncing=false;dispatch();}
  }

  function scheduleAutoResume(delay=AUTO_RETRY_MS){
    if(runtime.retryTimer){clearTimeout(runtime.retryTimer);runtime.retryTimer=null;}
    if(!runtime.offline||runtime.mode!=="auto"||runtime.conflict)return false;
    runtime.retryTimer=setTimeout(()=>{runtime.retryTimer=null;requestCloudResume({manual:false,silent:true}).catch(()=>false);},Math.max(1000,Number(delay||AUTO_RETRY_MS)));
    return true;
  }

  async function requestCloudResume(options={}){
    if(!runtime.offline||runtime.syncing)return !runtime.offline;
    runtime.syncing=true;dispatch();
    try{
      // Critical rule: always commit the very latest local state BEFORE any cloud compare/upload.
      const localOk=await window.ROWebSaveManager?.saveAndWait?.({reason:"offline-resume-local-final",forceWriter:true,durableDelayMs:0});
      if(!localOk)throw new Error("RO_OFFLINE_LOCAL_SAVE_FAILED");
      await window.ROWebSaveManager?.flushDurable?.();
      if(runtime.sharedStoragePending&&window.ROWebCloudRuntime?.saveSharedStorage&&typeof window.getAccountStorageSnapshot==="function"){
        await window.ROWebCloudRuntime.saveSharedStorage(window.getAccountStorageSnapshot());
        runtime.sharedStoragePending=false;
        if(window.RO_WEB_STORAGE_SYNC_STATE){window.RO_WEB_STORAGE_SYNC_STATE.pending=false;window.RO_WEB_STORAGE_SYNC_STATE.lastSyncedAt=Date.now();window.RO_WEB_STORAGE_SYNC_STATE.lastError="";}
        persistState();
      }
      const envelope=window.ROWebSaveManager?.getLatestEnvelope?.();
      if(!envelope)throw new Error("RO_OFFLINE_LOCAL_ENVELOPE_MISSING");
      const result=await window.ROWebCloudRuntime?.resumeOfflineEnvelope?.(envelope,Math.max(0,Number(runtime.baseRevision||0)));
      if(!result||result.ok!==true)throw new Error("RO_OFFLINE_RESUME_FAILED");
      window.ROWebSaveManager?.clearPendingRemoteUpTo?.(Number(envelope.saveVersion||0));
      rememberCloudVerified({revision:Number(result.revision ?? envelope.saveVersion ?? 0)});
      clearPersistedState();
      runtime.offline=false;runtime.mode="cloud";runtime.reason="";runtime.baseRevision=Math.max(0,Number(result.revision||0));runtime.startedAt=0;runtime.cloudFailures=0;runtime.conflict=false;runtime.sharedStoragePending=false;
      if(runtime.retryTimer){clearTimeout(runtime.retryTimer);runtime.retryTimer=null;}
      dispatch();
      window.addBattleLog?.("網路已恢復：本機進度已通過版本驗證並安全同步至雲端。","system");
      if(!options.silent)await alertUi("本機最新進度已保存並安全同步至雲端，現在已切回 CLOUD 模式。","已恢復線上模式");
      return true;
    }catch(error){
      const raw=String(error?.message||error||"");
      if(/RO_OFFLINE_REVISION_CONFLICT|RO_CLOUD_CONFLICT/i.test(raw)){
        runtime.conflict=true;persistState();dispatch();
        if(!options.silent)await alertUi("雲端角色在你本地遊玩期間已被其他裝置／分頁修改。\n\n為避免複製裝備或覆蓋角色，系統已停止自動合併。此分頁仍保留本機進度，請不要清除網站資料。","雲端版本衝突");
        else if(!window.RO_WEB_OFFLINE_CONFLICT_REPORTED){window.RO_WEB_OFFLINE_CONFLICT_REPORTED=true;await alertUi("偵測到雲端版本衝突，已停止自動同步以保護裝備與角色。","雲端版本衝突");}
        return false;
      }
      if(!options.silent)await alertUi(isTransient(error)?"目前仍無法連上雲端；本機進度已保存，會繼續保持 OFFLINE。":`切回線上模式失敗：${raw}`,"尚未恢復線上");
      if(runtime.mode==="auto"&&!runtime.conflict)scheduleAutoResume();
      return false;
    }finally{runtime.syncing=false;dispatch();}
  }

  function noteCloudFailure(error){
    if(runtime.offline||!isTransient(error))return false;
    runtime.cloudFailures+=1;
    if(isReadyGame()&&runtime.cloudFailures>=AUTO_FAILURE_THRESHOLD){enterOffline("auto",String(error?.message||"network-error")).catch(()=>false);}
    return true;
  }
  function noteCloudSuccess(detail={}){
    runtime.cloudFailures=0;
    if(detail&&Number.isFinite(Number(detail.revision??detail.saveVersion))){rememberCloudVerified(detail);}
    return true;
  }

  function guard(feature,label="這個功能"){
    if(!runtime.offline)return true;
    const names={
      refine:"精煉",enchant:"附魔",auction:"拍賣場",storage:"帳號共用倉庫",mail:"信箱領取",redgem:"紅寶石交易",character:"切換人物／帳號"
    };
    alertUi(`${label||names[feature]||"此功能"}需要雲端連線。\n\n目前為 OFFLINE 本地遊玩模式；請先從右上齒輪選擇「切換線上模式」，完成安全同步後再使用。`,"OFFLINE 功能暫停");
    return false;
  }

  function shouldPauseRemoteSync(){return runtime.offline===true;}
  function isOffline(){return runtime.offline===true;}
  function isManualOffline(){return runtime.offline&&runtime.mode==="manual";}
  function isOfflineBoot(){return runtime.offline&&/startup|boot|fallback|manual-preference/.test(runtime.reason);}

  window.addEventListener("offline",()=>{
    if(isReadyGame()&&!runtime.offline)enterOffline("auto","browser-offline-event").catch(()=>false);
  });
  window.addEventListener("online",()=>{
    if(runtime.offline&&runtime.mode==="auto"&&!runtime.conflict)scheduleAutoResume(1200);
  });
  window.addEventListener("ro-web-ready",()=>{
    updateUi();
    if(runtime.offline&&runtime.mode==="auto"&&!runtime.conflict)scheduleAutoResume(2500);
  });
  document.addEventListener("DOMContentLoaded",updateUi,{once:true});

  window.ROWebOfflineContinuity=Object.freeze({
    version:VERSION,
    getState,
    isOffline,
    isManualOffline,
    isOfflineBoot,
    shouldPauseRemoteSync,
    getLease:()=>clone(getLease(context())),
    rememberCloudVerified,
    canBootOffline,
    wantsManualOfflineBoot,
    shouldBootManualOffline,
    offerStartupFallback,
    activateOfflineBoot,
    requestManualOffline,
    requestCloudResume,
    enterOffline,
    noteCloudFailure,
    noteCloudSuccess,
    guard,
    updateUi
  });
  window.RO_WEB_OFFLINE_STATE=getState();
})();
