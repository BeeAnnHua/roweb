// ============================================================
// 彼岸花仙境 / RO_WEB V0.9.86C
// Supabase Auth Storage Runtime
// - Auth session is stored in IndexedDB instead of localStorage.
// - Automatically migrates legacy sb-*-auth-token values on first read.
// - Keeps large character saves from blocking login / OTP session writes.
// ============================================================
(function () {
  "use strict";

  const VERSION = "0.9.86C";
  const DB_NAME = "ro_web_auth_session_v1";
  const DB_VERSION = 1;
  const STORE_NAME = "kv";
  const memoryFallback = new Map();
  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    if (!window.indexedDB?.open) return Promise.resolve(null);
    dbPromise = new Promise(resolve => {
      let req;
      try { req = window.indexedDB.open(DB_NAME, DB_VERSION); }
      catch (error) { console.warn("Auth IndexedDB open failed:", error); resolve(null); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { console.warn("Auth IndexedDB unavailable:", req.error); resolve(null); };
      req.onblocked = () => console.warn("Auth IndexedDB upgrade is blocked by another tab.");
    });
    return dbPromise;
  }

  async function idbGet(key) {
    const db = await openDb();
    if (!db) return null;
    return new Promise(resolve => {
      let tx;
      try { tx = db.transaction(STORE_NAME, "readonly"); }
      catch (_) { resolve(null); return; }
      const req = tx.objectStore(STORE_NAME).get(String(key));
      req.onsuccess = () => resolve(typeof req.result === "string" ? req.result : null);
      req.onerror = () => resolve(null);
    });
  }

  async function idbSet(key, value) {
    const db = await openDb();
    if (!db) return false;
    return new Promise(resolve => {
      let tx;
      try { tx = db.transaction(STORE_NAME, "readwrite"); }
      catch (_) { resolve(false); return; }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
      try { tx.objectStore(STORE_NAME).put(String(value), String(key)); }
      catch (_) { resolve(false); }
    });
  }

  async function idbRemove(key) {
    const db = await openDb();
    if (!db) return false;
    return new Promise(resolve => {
      let tx;
      try { tx = db.transaction(STORE_NAME, "readwrite"); }
      catch (_) { resolve(false); return; }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
      try { tx.objectStore(STORE_NAME).delete(String(key)); }
      catch (_) { resolve(false); }
    });
  }

  function legacyGet(key) {
    try { return window.localStorage?.getItem?.(String(key)) ?? null; }
    catch (_) { return null; }
  }

  function legacyRemove(key) {
    try { window.localStorage?.removeItem?.(String(key)); return true; }
    catch (_) { return false; }
  }

  async function getItem(key) {
    const k = String(key);
    const idbValue = await idbGet(k);
    if (typeof idbValue === "string") {
      memoryFallback.set(k, idbValue);
      return idbValue;
    }

    // Upgrade path from old RO_WEB builds where Supabase persisted auth in localStorage.
    const legacy = legacyGet(k);
    if (typeof legacy === "string") {
      memoryFallback.set(k, legacy);
      if (await idbSet(k, legacy)) legacyRemove(k);
      return legacy;
    }
    return memoryFallback.has(k) ? memoryFallback.get(k) : null;
  }

  async function setItem(key, value) {
    const k = String(key);
    const v = String(value);
    memoryFallback.set(k, v);
    if (await idbSet(k, v)) {
      // Remove an old duplicate token if the browser still has one in Web Storage.
      if (/^sb-.*-auth-token$/i.test(k)) legacyRemove(k);
      return;
    }

    // Very old / restricted browsers: retain the old fallback if Web Storage still has room.
    try {
      window.localStorage?.setItem?.(k, v);
      return;
    } catch (error) {
      const e = new Error("RO_AUTH_STORAGE_UNAVAILABLE: 瀏覽器登入儲存空間不可用。請關閉無痕限制或釋放網站空間後再試。");
      e.cause = error;
      throw e;
    }
  }

  async function removeItem(key) {
    const k = String(key);
    memoryFallback.delete(k);
    await idbRemove(k);
    legacyRemove(k);
  }

  async function estimate() {
    try {
      const result = await navigator.storage?.estimate?.();
      return { usage:Number(result?.usage || 0), quota:Number(result?.quota || 0) };
    } catch (_) { return { usage:0, quota:0 }; }
  }

  window.ROWebAuthStorage = { getItem, setItem, removeItem };
  window.ROWebAuthStorageRuntime = { VERSION, getItem, setItem, removeItem, estimate, openDb };
})();
