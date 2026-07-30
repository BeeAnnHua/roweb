#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

class StorageMock {
  constructor() { this.map = new Map(); }
  get length() { return this.map.size; }
  key(index) { return [...this.map.keys()][index] ?? null; }
  getItem(key) { return this.map.has(String(key)) ? this.map.get(String(key)) : null; }
  setItem(key, value) { this.map.set(String(key), String(value)); }
  removeItem(key) { this.map.delete(String(key)); }
  clear() { this.map.clear(); }
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
                get(id) {
                  const row = {};
                  setTimeout(() => { row.result = values.get(id); row.onsuccess?.(); }, 0);
                  return row;
                },
                getAll() {
                  const row = {};
                  setTimeout(() => { row.result = [...values.values()]; row.onsuccess?.(); }, 0);
                  return row;
                },
                put(value) { values.set(value.id, JSON.parse(JSON.stringify(value))); },
                clear() { values.clear(); }
              };
            }
          };
          setTimeout(() => transaction.oncomplete?.(), 20);
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
const indexedDB = new FakeIndexedDB();
const logs = [];
const dummyElement = {
  style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {},
  setAttribute() {}, removeAttribute() {}, addEventListener() {}
};
const context = {
  console, Math, Date, JSON, Promise, Uint32Array,
  CustomEvent: function CustomEvent(type, options) { this.type = type; this.detail = options?.detail; },
  localStorage, sessionStorage, indexedDB,
  navigator: { storage: {} },
  document: {
    visibilityState: "visible", addEventListener() {}, getElementById() { return null; },
    querySelectorAll() { return []; }, querySelector() { return null; },
    createElement() { return { ...dummyElement }; }, body: { classList: { add() {}, remove() {} } }
  },
  setTimeout, clearTimeout, setInterval: () => 1, clearInterval() {},
  crypto: { getRandomValues(values) { values.fill(123); return values; } },
  addBattleLog(text) { logs.push(String(text)); }
};
context.window = context;
context.addEventListener = () => {};
context.dispatchEvent = () => true;
vm.createContext(context);
const root = path.resolve(__dirname, "..");
vm.runInContext(fs.readFileSync(path.join(root, "js/player.js"), "utf8"), context, { filename: "js/player.js" });

const MAIN = "ro_web_save_v0_9_19_ui_scroll_quickbar";
const BACKUP = `${MAIN}_minute_backup_v1`;
const LEASE = `${MAIN}_writer_lease_v2`;

(async () => {
  vm.runInContext(`
    player={name:'SaveTest',gender:'male',genderChosen:true,baseLevel:10,jobLevel:5,baseExp:123,jobExp:45,zeny:100,
      inventory:[{id:909,name:'Jellopy',count:77}],equipment:{},stats:{str:1,agi:1,vit:1,int:1,dex:1,luk:1},currentCity:null,state:'Idle'};
    window.player=player; currentMap={id:'save_test_map'};
  `, context);

  assert.strictEqual(context.ROWebSaveManager.claimWriter(true), true);
  assert.strictEqual(context.saveGame("test-v1"), true);
  const v1 = localStorage.getItem(MAIN);
  const main1 = JSON.parse(v1);
  const backup1 = JSON.parse(localStorage.getItem(BACKUP));
  assert.strictEqual(main1.schema, "ro_web_player_save_v2");
  assert.strictEqual(main1.checksum, backup1.checksum);
  assert.strictEqual(main1.saveVersion, backup1.saveVersion);
  assert.strictEqual(main1.player.inventory[0].count, 77);

  vm.runInContext("player.zeny=200; player.inventory[0].count=88;", context);
  assert.strictEqual(context.saveGame("test-v2"), true);
  const v2 = localStorage.getItem(MAIN);
  await new Promise(resolve => setTimeout(resolve, 850));
  await context.ROWebSaveManager.flushDurable();
  await new Promise(resolve => setTimeout(resolve, 40));
  let durable = await context.ROWebSaveManager.readDurableCandidates();
  assert(durable.some(row => row.source === "indexeddb-primary" && row.player.zeny === 200));

  // Valid but older main must lose to the newer verified backup.
  localStorage.setItem(MAIN, v1);
  localStorage.setItem(BACKUP, v2);
  let selected = context.ROWebSaveManager.chooseNewest(context.ROWebSaveManager.readLocalCandidates());
  assert.strictEqual(selected.source, "backup");
  assert.strictEqual(selected.player.zeny, 200);

  // Corrupted main must recover from backup.
  localStorage.setItem(MAIN, "{corrupt");
  selected = context.ROWebSaveManager.chooseNewest(context.ROWebSaveManager.readLocalCandidates());
  assert.strictEqual(selected.source, "backup");

  // Active newer tab blocks stale-tab overwrite.
  localStorage.setItem(LEASE, JSON.stringify({ sessionId: "other-tab", heartbeatAt: Date.now(), startedAt: Date.now() }));
  const beforeBlocked = localStorage.getItem(BACKUP);
  assert.strictEqual(context.saveGame("blocked-old-tab"), false);
  assert.strictEqual(localStorage.getItem(BACKUP), beforeBlocked);

  // Expired writer lease can be safely reclaimed.
  localStorage.setItem(LEASE, JSON.stringify({ sessionId: "dead-tab", heartbeatAt: Date.now() - 60000, startedAt: Date.now() - 60000 }));
  vm.runInContext("player.zeny=300;", context);
  assert.strictEqual(context.saveGame("reclaimed"), true);

  // Durable mirror keeps previous and current generations.
  await new Promise(resolve => setTimeout(resolve, 850));
  await context.ROWebSaveManager.flushDurable();
  await new Promise(resolve => setTimeout(resolve, 40));
  durable = await context.ROWebSaveManager.readDurableCandidates();
  assert(durable.some(row => row.source === "indexeddb-primary" && row.player.zeny === 300));
  assert(durable.some(row => row.source === "indexeddb-backup"));

  // Future backend adapter receives the same validated envelope.
  let remoteVersion = 0;
  context.ROWebSaveManager.registerRemoteAdapter({ async saveEnvelope(envelope) { remoteVersion = envelope.saveVersion; } });
  vm.runInContext("player.zeny=400;", context);
  assert.strictEqual(context.saveGame("remote-adapter"), true);
  await new Promise(resolve => setTimeout(resolve, 850));
  await context.ROWebSaveManager.flushDurable();
  await new Promise(resolve => setTimeout(resolve, 40));
  assert(remoteVersion > 0);

  assert.strictEqual(await context.ROWebSaveManager.clearDurable(), true);
  await new Promise(resolve => setTimeout(resolve, 40));
  durable = await context.ROWebSaveManager.readDurableCandidates();
  assert.strictEqual(durable.length, 0);

  console.log(JSON.stringify({ version: "0.9.82HN", passed: 15, failed: 0, remoteVersion }, null, 2));
})().catch(error => { console.error(error); process.exit(1); });
