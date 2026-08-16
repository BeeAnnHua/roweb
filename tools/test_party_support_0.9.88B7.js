#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname,"..");
const skillSource = fs.readFileSync(path.join(root,"js/skill_engine.js"),"utf8");
const mercenarySource = fs.readFileSync(path.join(root,"js/mercenary_runtime.js"),"utf8");
const combatFormulaSource = fs.readFileSync(path.join(root,"js/combat_formula_runtime.js"),"utf8");
const playerSource = fs.readFileSync(path.join(root,"js/player.js"),"utf8");

function readSet(name) {
  const match = skillSource.match(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\);`));
  assert(match,`${name} missing`);
  return vm.runInNewContext(`new Set([${match[1]}])`);
}

const groupBuffs = readSet("RO_WEB_GROUP_PARTY_BUFF_SKILL_IDS");
const groupHeals = readSet("RO_WEB_GROUP_PARTY_HEAL_SKILL_IDS");
assert.strictEqual(groupBuffs.size,65,"B7 must expose exactly 65 group buffs after excluding Pneuma");
assert.strictEqual(groupBuffs.has(25),false,"AL_PNEUMA must stay excluded");
assert.deepStrictEqual([...groupHeals].sort((a,b)=>a-b),[70,478,2043,5280]);
const runtimeDb = JSON.parse(fs.readFileSync(path.join(root,"data/skill_runtime/runtime_core_1_v1.json"),"utf8")).skills;
for (const id of groupBuffs) {
  const row = runtimeDb[String(id)];
  assert(row,`group buff ${id} missing from current runtime DB`);
  assert.strictEqual(String((row.runtimeProfile || row).handler),"buff",`group buff ${id} is not routed through castBuffSkill`);
}
for (const id of groupHeals) assert(runtimeDb[String(id)],`group heal ${id} missing from current runtime DB`);
assert(skillSource.includes("applyRuntimePartyBuffToMercenaries(skill,level,profile,player.activeBuffs[skill.id])"));
assert(skillSource.includes("ROWebMercenaryRuntime?.healParty"));
assert(combatFormulaSource.includes("Number(context.hitCount??context.hits??1)"),"B6 plant multi-hit normalization regressed");
assert(playerSource.includes("if (item.locked)"));
assert(playerSource.includes("已鎖定，無法變更自動分解標記"),"B6 locked-item auto-decompose guard regressed");

const memory = new Map();
const snapshot = {
  schema:"ro_web_mercenary_snapshot_v1",version:"0.9.88B7",characterId:"merc-1",slotIndex:1,
  name:"測試傭兵",jobKey:"knight",jobName:"騎士",baseLevel:100,
  stats:{str:100,agi:80,vit:70,int:20,dex:60,luk:10},
  maxHp:1000,maxSp:200,atk:100,matk:30,def:50,mdef:20,aspd:160,weaponType:"sword"
};
memory.set("ro_web_mercenary_snapshots_v1_test-account",JSON.stringify({
  schema:"ro_web_mercenary_snapshot_v1",snapshots:{"merc-1":snapshot}
}));

const document = {
  readyState:"loading",
  addEventListener(){},
  getElementById(){ return null; },
  querySelectorAll(){ return []; }
};
const context = {
  console,
  document,
  localStorage:{
    getItem:key=>memory.has(key)?memory.get(key):null,
    setItem:(key,value)=>memory.set(key,String(value))
  },
  structuredClone:global.structuredClone,
  setTimeout,clearTimeout,setInterval,clearInterval,
  Date,Math,WeakSet,Map,Set,Object,Array,Number,String,Boolean,JSON,Promise,performance:global.performance,
  player:{
    characterId:"owner-1",name:"隊長",currentCity:"prontera",position:{x:100,y:100,moveSpeed:115},
    activeBuffs:{"33":{id:33,expiresAt:Date.now()+60000}},stats:{int:100},baseLevel:100,matk:200
  },
  ROWebCloudRuntime:{getAccount:()=>({account_id:"test-account"}),getCharacters:()=>[]},
  CharacterSlotsRuntime:{getActiveContext:()=>({accountId:"test-account",characterId:"owner-1"})}
};
context.window = context;
vm.runInNewContext(mercenarySource,context,{filename:"mercenary_runtime.js"});

const runtime = context.ROWebMercenaryRuntime;
runtime.setPartyByCharacterIds(["merc-1"]);
let member = runtime.getRuntimeMembers()[0];
assert(member,"test mercenary was not created");
assert.strictEqual(member.maxHp,1000);

const applied = runtime.applyPartyBuff({
  skillId:33,name:"天使之障壁",level:10,durationMs:60000,
  effects:{atkRate:20,maxHpRate:10,aspdRate:10,healingReceivedRate:25},followOwnerBuff:true
});
assert.strictEqual(applied.applied,1);
member = runtime.getRuntimeMembers()[0];
assert.strictEqual(member.maxHp,1100,"Max HP party buff not applied");
assert.strictEqual(member.atk,120,"ATK party buff not applied");
assert.strictEqual(member.aspd,163,"ASPD gap formula not applied");

member.hp = 500;
const healed = runtime.healParty(100,{applyReceivedRate:true});
assert.strictEqual(healed.affected,1);
assert.strictEqual(member.hp,625,"group heal must include the mercenary's received-heal buff");

assert.strictEqual(runtime.removePartyBuff(33),1);
assert.strictEqual(member.maxHp,1000,"removing party buff must restore base Max HP");
assert.strictEqual(member.atk,100,"removing party buff must restore base ATK");
assert.strictEqual(Object.keys(member.activeBuffs).length,0);

member.runtimeState.statuses.freeze = { expiresAt:Date.now()+10000 };
runtime.applyPartyBuff({
  skillId:2047,name:"羔羊歌頌",level:4,durationMs:60000,effects:{maxHpRate:10},
  clearStatusesOnlyWhenPresent:["freeze"],clearStatusesChancePercent:100,skipBuffWhenStatusPresent:true,
  followOwnerBuff:false
});
assert.strictEqual(Boolean(member.runtimeState.statuses.freeze),false,"Lauda must clear a matching mercenary status");
assert.strictEqual(Boolean(member.activeBuffs["2047"]),false,"Lauda must not add its fallback buff to a member whose status branch ran");

runtime.applyPartyBuff({
  skillId:2047,name:"羔羊歌頌",level:4,durationMs:60000,effects:{maxHpRate:10},
  clearStatusesOnlyWhenPresent:["freeze"],clearStatusesChancePercent:100,skipBuffWhenStatusPresent:true,
  followOwnerBuff:false
});
assert.strictEqual(Boolean(member.activeBuffs["2047"]),true,"Lauda must buff a member who has no matching status");
runtime.removePartyBuff(2047);

runtime.applyPartyBuff({
  skillId:2273,name:"中性防護罩",level:3,durationMs:60000,
  effects:{longRangePhysicalImmunity:1},followOwnerBuff:false
});
member.hp = member.maxHp;
const blocked = runtime.applyDamage("merc-1",100,{damageType:"physical",attackRangeType:"long"});
assert.strictEqual(blocked.damage,0,"Neutral Barrier must block long-range physical damage on mercenaries");
const melee = runtime.applyDamage("merc-1",100,{damageType:"physical",attackRangeType:"short"});
assert.strictEqual(melee.damage,100,"Neutral Barrier must not block short-range physical damage");
runtime.removePartyBuff(2273);

console.log("PASS V0.9.88B7 party support: 65 group buffs, 4 group heals, Pneuma excluded, mercenary apply/heal/remove verified.");
