// ============================================================
// 彼岸花仙境 / RO_WEB V0.9.88B3
// Starter Asset Initializer
// - Blocks only the novice training field until its required static assets are cached.
// - Downloads bytes into HTTP/Cache Storage; it intentionally does NOT decode every atlas.
// - A tiny service worker serves cached starter assets on later visits.
// ============================================================
(function(){
  "use strict";

  const VERSION = "0.9.88B3";
  const MANIFEST_URL = "./data/starter_asset_manifest.json";
  const CACHE_PREFIX = "roweb-starter-assets-";
  const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;
  const CONCURRENCY = 4;
  const MAX_RETRIES = 2;
  const NOVICE_MAP_ID = "novice_training_3x3_region_camera";
  let manifestPromise = null;
  let ensurePromise = null;

  function normalizeGender(value){
    const raw = String(value || "").trim().toLowerCase();
    if (["female","f","woman","girl","女","女性"].includes(raw)) return "female";
    return "male";
  }
  function mapIdOf(map){ return String(map?.id || window.currentMap?.id || window.player?.map || ""); }
  function shouldPrepare(map){ return mapIdOf(map) === NOVICE_MAP_ID; }
  function absolute(path){ return new URL(String(path || "").replace(/^\.\//,""), document.baseURI).href; }
  function progress(value,label="正在初始化遊戲資源……"){
    window.ROWebLoadingScreen?.show?.({ progress:value, label });
    window.ROWebLoadingScreen?.setProgress?.(value,label);
  }

  async function loadManifest(){
    if (manifestPromise) return manifestPromise;
    manifestPromise = (async()=>{
      const bundled = window.RO_WEB_DATA?.["data/starter_asset_manifest.json"];
      if (bundled) return bundled;
      const response = await fetch(MANIFEST_URL,{cache:"no-cache",credentials:"same-origin"});
      if (!response.ok) throw new Error(`starter manifest HTTP ${response.status}`);
      return response.json();
    })();
    return manifestPromise;
  }

  async function registerStarterWorker(){
    if (!("serviceWorker" in navigator) || !["http:","https:"].includes(location.protocol)) return false;
    try {
      await navigator.serviceWorker.register(`./roweb-starter-sw.js?v=${VERSION}`,{scope:"./"});
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise(resolve=>setTimeout(resolve,1800))
      ]);
      return true;
    } catch (error) {
      console.warn("[StarterAssets] service worker unavailable; HTTP cache fallback remains active.",error);
      return false;
    }
  }

  async function getCache(){
    if (!("caches" in window) || !["http:","https:"].includes(location.protocol)) return null;
    try { return await caches.open(CACHE_NAME); } catch (_) { return null; }
  }

  async function fetchOne(row,cache){
    const url = absolute(row.path);
    if (cache) {
      try { if (await cache.match(url,{ignoreSearch:true})) return {ok:true,cached:true,path:row.path}; } catch (_) {}
    }
    let lastError = null;
    for (let attempt=0; attempt<=MAX_RETRIES; attempt++) {
      try {
        // force-cache seeds/reuses the normal browser HTTP cache too. Cache Storage is
        // a second durable layer used by roweb-starter-sw.js.
        const response = await fetch(url,{cache:"force-cache",credentials:"same-origin"});
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (cache) {
          try { await cache.put(url,response.clone()); } catch (_) {}
        }
        // Consume the body so the browser finishes the download before progress advances.
        await response.arrayBuffer();
        return {ok:true,cached:false,path:row.path};
      } catch (error) {
        lastError = error;
        if (attempt < MAX_RETRIES) await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));
      }
    }
    return {ok:false,path:row.path,required:row.required!==false,error:String(lastError?.message || lastError || "load failed")};
  }

  async function runPool(rows,cache,onDone){
    const results = new Array(rows.length);
    let cursor = 0;
    async function worker(){
      while (true) {
        const index = cursor++;
        if (index >= rows.length) return;
        results[index] = await fetchOne(rows[index],cache);
        onDone?.(results[index],index);
      }
    }
    await Promise.all(Array.from({length:Math.min(CONCURRENCY,Math.max(1,rows.length))},worker));
    return results;
  }

  async function predecodeImmediateVisual(path){
    if (!path || typeof Image === "undefined") return false;
    return new Promise(resolve=>{
      const image = new Image();
      image.decoding = "async";
      let done = false;
      const finish = ok => { if (done) return; done=true; image.onload=null; image.onerror=null; resolve(ok); };
      image.onload = () => finish(true);
      image.onerror = () => finish(false);
      image.src = absolute(path);
      if (image.complete && image.naturalWidth > 0) finish(true);
      setTimeout(()=>finish(false),3000);
    });
  }

  async function cleanupOldCaches(){
    if (!("caches" in window)) return;
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX) && key!==CACHE_NAME).map(key=>caches.delete(key)));
    } catch (_) {}
  }

  async function ensureForMap(map=window.currentMap,options={}){
    if (!shouldPrepare(map)) return {ok:true,skipped:true,reason:"not_novice_map"};
    if (ensurePromise) return ensurePromise;
    ensurePromise = (async()=>{
      if (location.protocol === "file:") {
        console.info("[StarterAssets] file:// mode: pre-cache gate skipped; use START_RO_WEB.bat/http for browser cache support.");
        return {ok:true,skipped:true,reason:"file_protocol"};
      }
      progress(82,"正在初始化遊戲資源……");
      await registerStarterWorker();
      const manifest = await loadManifest();
      const gender = normalizeGender(window.player?.gender || window.player?.sex || window.player?.appearanceGender);
      const rows = [...(manifest?.common || []), ...(manifest?.gender?.[gender] || [])];
      const unique = [...new Map(rows.map(row=>[String(row.path),row])).values()];
      const cache = await getCache();
      let done = 0;
      const results = await runPool(unique,cache,()=>{
        done += 1;
        const pct = 82 + Math.floor((done/Math.max(1,unique.length))*8);
        progress(Math.min(90,pct),"正在初始化遊戲資源……");
      });
      const failedRequired = results.filter(row=>row && !row.ok && row.required!==false);
      if (failedRequired.length) {
        console.error("[StarterAssets] required assets failed",failedRequired);
        progress(90,"遊戲資料更新失敗，請檢查網路後重新整理");
        const error = new Error(`新手必要資源有 ${failedRequired.length} 個下載失敗`);
        error.code = "RO_STARTER_ASSET_FAILED";
        error.failed = failedRequired;
        throw error;
      }
      // Only the immediately visible map and novice idle portrait are decoded now.
      // Monster atlases stay as cached bytes and decode on demand to avoid a ~90MB RAM spike.
      const mapPath = (manifest?.common || []).find(row=>row.kind==="map")?.path;
      const idlePath = (manifest?.gender?.[gender] || []).find(row=>row.kind==="character-idle")?.path;
      await Promise.all([predecodeImmediateVisual(mapPath),predecodeImmediateVisual(idlePath)]);
      progress(91,"正在確認最新資料版本，請稍候。");
      try {
        localStorage.setItem("roweb_starter_assets_ready_v1",JSON.stringify({version:VERSION,gender,at:Date.now(),files:unique.length}));
      } catch (_) {}
      cleanupOldCaches();
      return {ok:true,skipped:false,version:VERSION,gender,files:unique.length,failedOptional:results.filter(row=>row && !row.ok).length};
    })().finally(()=>{ ensurePromise=null; });
    return ensurePromise;
  }

  window.ROWebStarterAssetRuntime = Object.freeze({
    version:VERSION,
    mapId:NOVICE_MAP_ID,
    cacheName:CACHE_NAME,
    shouldPrepare,
    ensureForMap,
    loadManifest
  });
})();
