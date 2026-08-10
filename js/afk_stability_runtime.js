// ============================================================
// 彼岸花仙境 / RO_WEB V0.9.86R
// AFK Stability Diagnostic Runtime
// - Small local heartbeat for abnormal tab/process termination diagnosis.
// - Records runtime/DOM/heap hints without touching character save data.
// - Cloud runtime can append reconnect/fatal events.
// ============================================================
(function(){
  "use strict";
  const VERSION="0.9.86R";
  const STATE_KEY="roweb_afk_stability_state_v1";
  const EVENTS_KEY="roweb_afk_stability_events_v1";
  const HEARTBEAT_MS=15000;
  const MAX_EVENTS=30;
  let timer=0;
  let sessionId=`afk_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  let current=null;

  function parseJson(raw,fallback=null){try{return JSON.parse(raw||"null")??fallback}catch(_){return fallback}}
  function read(key,fallback=null){try{return parseJson(localStorage.getItem(key),fallback)}catch(_){return fallback}}
  async function readDurable(key,fallback=null){
    const local=read(key,null);
    if(local!=null)return local;
    try{return parseJson(await window.ROWebAuthStorage?.getItem?.(key),fallback)}catch(_){return fallback}
  }
  function write(key,value){
    const raw=JSON.stringify(value);
    let ok=false;
    try{localStorage.setItem(key,raw);ok=true}catch(_){}
    try{Promise.resolve(window.ROWebAuthStorage?.setItem?.(key,raw)).catch(()=>{})}catch(_){}
    return ok;
  }
  function safe(fn,fallback=null){try{const v=fn();return v==null?fallback:v}catch(_){return fallback}}
  function activeCharacter(){return safe(()=>window.CharacterSlotsRuntime?.getActiveCharacter?.(),null)}
  function cloudAccount(){return safe(()=>window.ROWebCloudRuntime?.getAccount?.(),null)}
  function heap(){
    const m=performance?.memory;
    if(!m)return null;
    return {used:Math.round(Number(m.usedJSHeapSize||0)),total:Math.round(Number(m.totalJSHeapSize||0)),limit:Math.round(Number(m.jsHeapSizeLimit||0))};
  }
  function worldEntityCount(){
    return safe(()=>window.getWorldMonsterTestEntities?.({activeOnly:false})?.length,0) || 0;
  }
  function snapshot(reason="heartbeat"){
    const ch=activeCharacter();
    const acct=cloudAccount();
    const effect=safe(()=>window.SkillEffectRuntimeV92?.diagnostics,null);
    const state={
      version:VERSION,sessionId,reason,at:Date.now(),url:String(location.pathname||"")+String(location.search||""),
      visibility:document.visibilityState,online:navigator.onLine!==false,
      accountId:String(acct?.account_id||""),playerId:Number(acct?.player_id||0),
      characterId:String(ch?.characterId||ch?.character_id||window.player?.characterId||""),
      slotIndex:Number(ch?.slotIndex??window.player?.slotIndex??-1),
      playerName:String(window.player?.name||ch?.name||""),
      mapId:String(window.currentMap?.id||window.player?.currentMap||window.player?.currentCity||""),
      autoBattle:Boolean(safe(()=>window.isAutoBattleRunning?.(),false)),
      domNodes:Number(document.getElementsByTagName("*").length||0),
      battleLogLines:Number(document.getElementById("battle-log-list")?.children?.length||0),
      worldEntities:Number(worldEntityCount()),
      skillEffectInstances:Number(effect?.activeInstances||0),
      skillEffectLifecycles:Number(effect?.activeLifecycles||0),
      heap:heap(),
      cloudStatus:safe(()=>window.ROWebCloudRuntime?.getSyncState?.()?.status,"")||"",
      bootStatus:String(window.RO_WEB_BOOT_STATE?.status||"")
    };
    current=state;write(STATE_KEY,state);return state;
  }
  function events(){const rows=read(EVENTS_KEY,[]);return Array.isArray(rows)?rows:[]}
  function pushEvent(type,detail={}){
    const row={version:VERSION,sessionId,at:Date.now(),type:String(type||"event"),detail};
    write(EVENTS_KEY,events().concat(row).slice(-MAX_EVENTS));
    return row;
  }
  function noteCloudEvent(type,detail={}){return pushEvent(`cloud:${type}`,detail)}
  function markClean(reason){
    const state=snapshot(`clean:${reason}`);state.cleanExitAt=Date.now();state.cleanExitReason=String(reason||"");write(STATE_KEY,state);
  }
  async function detectPreviousAbnormal(){
    const prev=await readDurable(STATE_KEY,null);
    if(!prev||!prev.at||prev.sessionId===sessionId)return null;
    const age=Date.now()-Number(prev.at||0);
    const clean=Number(prev.cleanExitAt||0)>=Number(prev.at||0);
    if(!clean&&age>=0&&age<10*60*1000){
      window.RO_WEB_AFK_LAST_ABNORMAL={...prev,detectedAt:Date.now(),ageMs:age};
      pushEvent("previous_abnormal_detected",{ageMs:age,previousSessionId:prev.sessionId,autoBattle:Boolean(prev.autoBattle),domNodes:Number(prev.domNodes||0),worldEntities:Number(prev.worldEntities||0),heap:prev.heap||null});
      try{console.warn("[RO_WEB AFK] 偵測到上一次頁面異常終止",window.RO_WEB_AFK_LAST_ABNORMAL)}catch(_){}
      return window.RO_WEB_AFK_LAST_ABNORMAL;
    }
    return null;
  }
  function installErrorCapture(){
    window.addEventListener("error",event=>pushEvent("window_error",{message:String(event?.message||""),file:String(event?.filename||""),line:Number(event?.lineno||0),column:Number(event?.colno||0)}));
    window.addEventListener("unhandledrejection",event=>pushEvent("unhandled_rejection",{reason:String(event?.reason?.stack||event?.reason?.message||event?.reason||"").slice(0,1600)}));
  }
  function start(){
    Promise.resolve(detectPreviousAbnormal()).catch(()=>{});
    installErrorCapture();
    snapshot("start");
    timer=setInterval(()=>snapshot("heartbeat"),HEARTBEAT_MS);
    document.addEventListener("visibilitychange",()=>snapshot(`visibility:${document.visibilityState}`),{passive:true});
    window.addEventListener("online",()=>{pushEvent("browser_online");snapshot("online")},{passive:true});
    window.addEventListener("offline",()=>{pushEvent("browser_offline");snapshot("offline")},{passive:true});
    window.addEventListener("pagehide",()=>markClean("pagehide"),{capture:true});
    window.addEventListener("beforeunload",()=>markClean("beforeunload"),{capture:true});
  }
  window.ROWebAfkStabilityRuntime=Object.freeze({
    version:VERSION,
    snapshot,
    noteCloudEvent,
    getState:()=>read(STATE_KEY,current),
    getStateAsync:()=>readDurable(STATE_KEY,current),
    getEvents:events,
    getEventsAsync:()=>readDurable(EVENTS_KEY,[]),
    getPreviousAbnormal:()=>window.RO_WEB_AFK_LAST_ABNORMAL||null
  });
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();
