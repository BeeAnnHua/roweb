const fs = require('fs');
const vm = require('vm');
const path = require('path');

function makeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    get length(){ return data.size; },
    key(i){ return Array.from(data.keys())[i] ?? null; },
    getItem(k){ return data.has(String(k)) ? data.get(String(k)) : null; },
    setItem(k,v){ data.set(String(k), String(v)); },
    removeItem(k){ data.delete(String(k)); },
    clear(){ data.clear(); },
    dump(){ return Object.fromEntries(data); }
  };
}

function loadRuntime(initialLocal = {}, options = {}) {
  const localStorage = makeStorage(initialLocal);
  const sessionStorage = makeStorage();
  const window = {
    crypto: { getRandomValues(arr){ for(let i=0;i<arr.length;i++) arr[i]=100+i; return arr; } },
    RO_WEB_CHARACTER_CLOUD_ADAPTER: null,
    confirm(){ return true; },
    setTimeout,
    clearTimeout
  };
  const context = {
    window,
    localStorage,
    sessionStorage,
    location: { reload(){ context.reloaded = true; } },
    document: {
      getElementById(id){
        if (id === 'playerPortrait' && options.portraitSrc) return { getAttribute(){ return options.portraitSrc; } };
        return null;
      },
      querySelectorAll(){ return []; },
      querySelector(){ return null; },
      body: { classList: { add(){}, remove(){} } }
    },
    indexedDB: undefined,
    console,
    Intl,
    Date,
    Math,
    JSON,
    Uint32Array,
    Promise,
    setTimeout,
    clearTimeout
  };
  context.globalThis = context;
  vm.createContext(context);
  const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'character_slots_runtime.js'), 'utf8');
  vm.runInContext(code, context, { filename:'character_slots_runtime.js' });
  return { context, api:window.CharacterSlotsRuntime, localStorage, sessionStorage };
}

function assert(cond, message){ if(!cond) throw new Error(message); }

(function testEmptyAccount(){
  const { api } = loadRuntime();
  const account = api.getAccount();
  assert(account.slotLimit === 4, 'default slotLimit should be 4');
  assert(Array.isArray(account.characters) && account.characters.length === 0, 'empty account should have no characters');
  assert(typeof account.accountId === 'string' && account.accountId.startsWith('acct_'), 'accountId missing');
  assert(api.getActiveSaveKey().includes('pending'), 'pending save key expected before character creation');
})();

(function testLegacyMigration(){
  const legacyKey = 'ro_web_save_v0_9_19_ui_scroll_quickbar';
  const legacy = JSON.stringify({
    schema:'ro_web_player_save_v2', saveVersion:7, savedAt:123456,
    player:{ name:'舊冒險者', gender:'female', job:'盧恩騎士', jobKey:'rune_knight', baseLevel:155, jobLevel:60, currentCity:'prontera' }
  });
  const { api, localStorage } = loadRuntime({ [legacyKey]:legacy });
  const account = api.getAccount();
  assert(account.characters.length === 1, 'legacy character should migrate into slot 1');
  assert(account.characters[0].slotIndex === 0, 'legacy character slot index should be 0');
  assert(account.characters[0].summary.name === '舊冒險者', 'legacy summary name mismatch');
  assert(account.characters[0].summary.baseLevel === 155, 'legacy base level mismatch');
  assert(account.activeCharacterId === account.characters[0].characterId, 'legacy migrated character should be active');
  assert(localStorage.getItem(api.getActiveSaveKey()) === legacy, 'legacy save should be copied to character save key');
  assert(localStorage.getItem(legacyKey) === legacy, 'legacy rollback copy must be retained');
})();

(function testIdentityAndSummary(){
  const legacyKey = 'ro_web_save_v0_9_19_ui_scroll_quickbar';
  const legacy = JSON.stringify({ player:{ name:'測試', gender:'male', job:'初學者', jobKey:'novice', baseLevel:1, jobLevel:1 } });
  const { api } = loadRuntime({ [legacyKey]:legacy }, { portraitSrc:'assets/characters/knight/male/idle.png?v=0.9.83B' });
  const player = { name:'更新名稱', gender:'male', job:'騎士', jobKey:'knight', baseLevel:88, jobLevel:50, characterAtlas:'knight_male' };
  api.normalizePlayerIdentity(player);
  assert(player.accountId && player.characterId, 'player identity fields missing');
  assert(player.slotIndex === 0, 'player slot index mismatch');
  api.updateActiveCharacterSummary(player, { saveVersion:12, savedAt:999999 });
  const slot = api.getActiveCharacter();
  assert(slot.summary.name === '更新名稱', 'summary update failed');
  assert(slot.revision === 12, 'revision update failed');
  assert(slot.summary.baseLevel === 88, 'summary level update failed');
  assert(slot.summary.portraitSrc === 'assets/characters/knight/male/idle.png', 'current top-left idle portrait snapshot path not captured');
})();

console.log('V0.9.83B character slot runtime tests: PASS');
