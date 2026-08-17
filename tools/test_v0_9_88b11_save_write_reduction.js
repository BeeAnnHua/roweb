#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

class StorageMock {
  constructor() { this.map = new Map(); this.writes = new Map(); }
  get length() { return this.map.size; }
  key(index) { return [...this.map.keys()][index] ?? null; }
  getItem(key) { return this.map.has(String(key)) ? this.map.get(String(key)) : null; }
  setItem(key, value) {
    const normalized = String(key);
    this.map.set(normalized, String(value));
    this.writes.set(normalized, Number(this.writes.get(normalized) || 0) + 1);
  }
  removeItem(key) { this.map.delete(String(key)); }
  clear() { this.map.clear(); }
  writeCount(key) { return Number(this.writes.get(String(key)) || 0); }
}

class FakeIndexedDB {
  constructor() { this.stores = new Map(); }
  open() {
    const request = {};
    setTimeout(() => {
      const owner = this;
      const db = {
        objectStoreNames: { contains: name => owner.stores.has(name) },
        createObjectStore(name) { if (!owner.stores.has(name)) owner.stores.set(name, new Map()); },
        transaction(name) {
          if (!owner.stores.has(name)) owner.stores.set(name, new Map());
          const values = owner.stores.get(name);
          const transaction = {
            objectStore() {
              return {
                get(id) { const row = {}; setTimeout(() => { row.result = values.get(id); row.onsuccess?.(); }, 0); return row; },
                getAll() { const row = {}; setTimeout(() => { row.result = [...values.values()]; row.onsuccess?.(); }, 0); return row; },
                put(value) { values.set(value.id, JSON.parse(JSON.stringify(value))); },
                clear() { values.clear(); }
              };
            }
          };
          setTimeout(() => transaction.oncomplete?.(), 0);
          return transaction;
        }
      };
      request.result = db;
      request.onupgradeneeded?.();
      request.onsuccess?.();
    }, 0);
    return request;
  }
}

const localStorage = new StorageMock();
const sessionStorage = new StorageMock();
let now = 1_800_000_000_000;
class MockDate extends Date { static now() { return now; } }
const context = {
  console, Math, JSON, Promise, Uint32Array, Date:MockDate,
  localStorage, sessionStorage, indexedDB:new FakeIndexedDB(),
  navigator:{ storage:{} },
  document:{ visibilityState:"visible", addEventListener() {}, getElementById() { return null; }, querySelectorAll() { return []; }, querySelector() { return null; } },
  setTimeout, clearTimeout, setInterval:() => 1, clearInterval() {},
  crypto:{ getRandomValues(values) { values.fill(7); return values; } },
  CustomEvent:function CustomEvent(type, options) { this.type = type; this.detail = options?.detail; },
  addBattleLog() {}, addEventListener() {}, dispatchEvent() { return true; }
};
context.window = context;
vm.createContext(context);
const root = path.resolve(__dirname, "..");
vm.runInContext(fs.readFileSync(path.join(root, "js", "player.js"), "utf8"), context, { filename:"js/player.js" });

const mainKey = "ro_web_save_v0_9_19_ui_scroll_quickbar";
const backupKey = `${mainKey}_minute_backup_v1`;
vm.runInContext(`
  player={name:'B11SaveTest',gender:'male',genderChosen:true,baseLevel:10,jobLevel:5,baseExp:1,jobExp:1,zeny:1,
    inventory:[],equipment:{},stats:{str:1,agi:1,vit:1,int:1,dex:1,luk:1},currentCity:null,state:'Idle'};
  window.player=player; currentMap={id:'b11_save_test'};
`, context);

assert.strictEqual(context.ROWebSaveManager.claimWriter(true), true);
assert.strictEqual(context.saveGame("b11-first"), true);
assert.strictEqual(localStorage.writeCount(mainKey), 1);
assert.strictEqual(localStorage.writeCount(backupKey), 1);

now += 3000;
vm.runInContext("player.zeny=2", context);
assert.strictEqual(context.saveGame("b11-routine"), true);
assert.strictEqual(localStorage.writeCount(mainKey), 2, "routine main save remains immediate after the 2s guard");
assert.strictEqual(localStorage.writeCount(backupKey), 1, "duplicate backup is skipped inside 60s");

now += 61000;
vm.runInContext("player.zeny=3", context);
assert.strictEqual(context.saveGame("b11-backup-due"), true);
assert.strictEqual(localStorage.writeCount(backupKey), 2, "backup refreshes after 60s");

now += 3000;
const mainBeforeFinal = localStorage.writeCount(mainKey);
assert.strictEqual(context.flushPendingGameSave("pagehide"), true);
assert.strictEqual(context.flushPendingGameSave("beforeunload"), true);
assert.strictEqual(localStorage.writeCount(mainKey), mainBeforeFinal + 1, "final lifecycle events are deduplicated");

now += 3000;
const backupBeforeForced = localStorage.writeCount(backupKey);
assert.strictEqual(context.writeMinutePlayerBackup("test"), true);
assert.strictEqual(localStorage.writeCount(backupKey), backupBeforeForced + 1, "explicit minute backup bypasses the 60s guard");

console.log("PASS V0.9.88B11 save write reduction: immediate main save, 60s backup cadence, final-event dedupe, forced backup verified.");
process.exit(0);
