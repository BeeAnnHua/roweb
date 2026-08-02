const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');
const root = path.resolve(__dirname, '..');

let passed = 0;
const tests = [];
function test(name, fn) {
  try { fn(); passed += 1; tests.push({name, pass:true}); }
  catch (error) { tests.push({name, pass:false, error:String(error && error.stack || error)}); }
}

function makeTownContext(autoRunning) {
  const logs = [];
  const player = { currentCity:null, state:'Idle', map:'field_a', lastFieldMap:null };
  const context = {
    console, window:null, player,
    cities:[{id:'prontera', name:'普隆德拉'}], npcs:[],
    currentMap:{id:'field_a'}, currentMonster:{name:'怪物'},
    document:{ getElementById:()=>null, createElement:()=>({appendChild(){}, classList:{}}) },
    isAutoBattleRunning:()=>autoRunning,
    clearFieldCombatRuntimeForTravel:()=>{ context.currentMonster=null; },
    updateTownUI:()=>{}, updateMapUI:()=>{}, updateMonsterUI:()=>{}, updateTownBackground:()=>{},
    saveGame:()=>{}, addBattleLog:text=>logs.push(text),
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root,'js/town.js'),'utf8'), context, {filename:'town.js'});
  return {context, logs, player};
}

test('entering town while not auto battling does not emit stopped-auto-battle log', () => {
  const {context, logs} = makeTownContext(false);
  context.enterCity('prontera');
  assert(!logs.some(x=>x.includes('已停止自動掛機')));
  assert.notStrictEqual(context.RO_WEB_SUPPRESS_PASSIVE_RETALIATION, true);
});

test('entering town while auto battling emits conditional log and suppresses passive retaliation', () => {
  const {context, logs} = makeTownContext(true);
  context.enterCity('prontera');
  assert(logs.some(x=>x === '回到村莊~~ 已停止自動掛機。'));
  assert.strictEqual(context.RO_WEB_SUPPRESS_PASSIVE_RETALIATION, true);
});

test('manual combat source contains passive retaliation suppression and explicit release paths', () => {
  const src = fs.readFileSync(path.join(root,'js/battle.js'),'utf8');
  assert(src.includes('if (window.RO_WEB_SUPPRESS_PASSIVE_RETALIATION === true) return false;'));
  assert(src.includes('window.RO_WEB_SUPPRESS_PASSIVE_RETALIATION = false;'));
  assert(src.includes('function startManualMonsterAttack'));
  assert(src.includes('function startAutoBattle'));
});

test('fixed Fly Wing controls and fixed interval runtime are present', () => {
  const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
  const src = fs.readFileSync(path.join(root,'js/auto_battle.js'),'utf8');
  assert(html.includes('id="autoCombatFixedFlyEnabled"'));
  assert(html.includes('id="autoCombatFixedFlySeconds"'));
  assert(src.includes('function tryAutoFixedIntervalTeleport()'));
  assert(src.includes('clearRuntimeSkillCast("teleport")'));
});

test('global Boss/MVP threat scan runs before current-target combat and fixed flight', () => {
  const src = fs.readFileSync(path.join(root,'js/auto_battle.js'),'utf8');
  const utility = src.slice(src.indexOf('function runAutoCombatUtilityTick()'), src.indexOf('function resolveAutoBattleLevelValue'));
  assert(utility.indexOf('findAutoAvoidThreat()') >= 0);
  assert(utility.indexOf('tryAutoFixedIntervalTeleport()') > utility.indexOf('findAutoAvoidThreat()'));
  assert(utility.indexOf('isRuntimeSkillCasting') > utility.indexOf('tryAutoFixedIntervalTeleport()'));
});

test('death overlay removes blur and uses compact bottom dialog', () => {
  const css = fs.readFileSync(path.join(root,'css/style.css'),'utf8');
  const hotfix = css.slice(css.lastIndexOf('/* 0.9.82IC'));
  assert(hotfix.includes('backdrop-filter:none!important'));
  assert(hotfix.includes('place-items:end center!important'));
  assert(hotfix.includes('width:min(390px'));
});

const failed = tests.filter(x=>!x.pass);
console.log(JSON.stringify({title:'RO_WEB 0.9.82IC Auto Battle / Town / Death Hotfix Test', passed, failed:failed.length, tests}, null, 2));
if (failed.length) process.exit(1);
