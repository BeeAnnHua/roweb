const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const weaponFiles=['sword','dagger','bow','katar'];
let items={};
for(const f of weaponFiles) Object.assign(items,JSON.parse(fs.readFileSync(path.join(root,'data/equipment/weapon',f+'.json'),'utf8')));
Object.assign(items,JSON.parse(fs.readFileSync(path.join(root,'data/equipment/armor/shield.json'),'utf8')));
const ctx={console,items,window:{RO_EQUIPMENT_JOB_MAP:{jobs:{thief:{jobKey:'Thief',classKey:'Normal'},assassin:{jobKey:'Assassin',classKey:'Normal'}}}},document:{getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[]},localStorage:{getItem:()=>null,setItem:()=>{}},setTimeout,clearTimeout};
vm.createContext(ctx);
let src=fs.readFileSync(path.join(root,'js/player.js'),'utf8');
src+=`\n;globalThis.__test={setPlayer(v){player=v},getPlayer(){return player},equipItem,unequipInvalidEquipmentAfterJobChange,isTwoHandedWeaponItem,isAssassinOffhandWeaponItem,resolveEquipmentTargetSlot};`;
vm.runInContext(src,ctx,{filename:'player.js'});
ctx.addBattleLog=()=>{}; ctx.hideGameTooltip=()=>{}; ctx.syncEquipmentGrantedSkills=()=>{}; ctx.recalculatePlayerStats=()=>{}; ctx.syncROStudioWeaponTypeFromEquipment=()=>{}; ctx.updatePlayerUI=()=>{}; ctx.updateEquipmentUI=()=>{}; ctx.updateInventoryUI=()=>{}; ctx.saveGame=()=>{};
const T=ctx.__test;
function p(job,inventory,equipment={}){return {jobKey:job,baseLevel:99,inventory:inventory.map(([id,count])=>({id,count,locked:false})),equipment:{weapon:null,shield:null,headTop:null,headMid:null,headLow:null,armor:null,garment:null,shoes:null,accessory1:null,accessory2:null,...equipment}}}
function ok(v,m){if(!v)throw new Error(m)}
// Assassin dual wield: first sword main, then dagger offhand.
T.setPlayer(p('assassin',[[1101,1],[1201,1]])); T.equipItem(items['1101']); T.equipItem(items['1201']);
ok(T.getPlayer().equipment.weapon===1101,'sword not main'); ok(T.getPlayer().equipment.shield===1201,'dagger not offhand');
// Two-hand bow removes shield; shield then removes bow.
T.setPlayer(p('thief',[[1701,1],[2103,1]],{shield:2103})); T.equipItem(items['1701']);
ok(T.getPlayer().equipment.weapon===1701,'bow not equipped'); ok(T.getPlayer().equipment.shield===null,'shield not removed by two-hand');
T.equipItem(items['2103']); ok(T.getPlayer().equipment.weapon===null,'two-hand not removed by shield'); ok(T.getPlayer().equipment.shield===2103,'shield not equipped');
// Thief bow becomes invalid after changing to assassin.
T.setPlayer(p('assassin',[],{weapon:1701})); const removed=T.unequipInvalidEquipmentAfterJobChange();
ok(T.getPlayer().equipment.weapon===null,'invalid bow remained after job change'); ok(removed.length===1,'invalid bow removal count');
console.log('PASS: equipment behavior');
