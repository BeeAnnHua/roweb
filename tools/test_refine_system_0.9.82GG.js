const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.resolve(__dirname, '..');
const rules = JSON.parse(fs.readFileSync(path.join(root,'data/refine_rules.json'),'utf8'));
const items = {
  984:{id:984,name:'神之金屬',type:'etc',icon:'images/items/984.webp'},
  985:{id:985,name:'鋁',type:'etc',icon:'images/items/985.webp'},
  6240:{id:6240,name:'高濃縮神之金屬',type:'etc',icon:'images/items/6240.webp'},
  6241:{id:6241,name:'高濃縮鋁',type:'etc',icon:'images/items/6241.webp'},
  6635:{id:6635,name:'鐵匠的祝福',type:'etc',icon:'images/items/6635.webp'},
  7620:{id:7620,name:'濃縮神之金屬',type:'etc',icon:'images/items/7620.webp'},
  7619:{id:7619,name:'濃縮鋁',type:'etc',icon:'images/items/7619.webp'},
  900001:{id:900001,name:'測試四級武器',type:'equipment',category:'weapon',slot:'weapon',weaponLevel:4,refineable:true,atk:100,matk:50,icon:'x.webp'},
  900002:{id:900002,name:'測試五級武器',type:'equipment',category:'weapon',slot:'weapon',weaponLevel:5,refineable:true,atk:200,matk:100,icon:'x.webp'},
  900003:{id:900003,name:'測試二級防具',type:'equipment',category:'armor',slot:'armor',armorLevel:2,refineable:true,def:20,icon:'x.webp'}
};
let logs=[];
const sandbox = {
  console,
  Math,
  Date,
  setTimeout:(fn)=>fn(),
  clearTimeout:()=>{},
  window:null,
  player:null
};
sandbox.window=sandbox;
sandbox.RO_WEB_DATA={'data/refine_rules.json':rules};
sandbox.getItemData=id=>items[Number(id)]||null;
sandbox.buildEquipmentInstanceName=(inst,data)=>`${inst.refine?`+${inst.refine} `:''}${data.name}`;
sandbox.addBattleLog=t=>logs.push(t);
sandbox.saveGame=()=>{}; sandbox.updatePlayerUI=()=>{}; sandbox.updateEquipmentUI=()=>{}; sandbox.updateInventoryUI=()=>{}; sandbox.recalculatePlayerStats=()=>{};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root,'js/refine_runtime.js'),'utf8'),sandbox,{filename:'refine_runtime.js'});
const assert=(cond,msg)=>{if(!cond)throw new Error(msg)};
let pass=0;
function test(name,fn){fn();pass++;console.log('PASS',name)}
function stack(id,count){return {id,count}}
function inst(id,refine=0,uid='i'+Math.random()){return {id,itemId:id,count:1,instanceId:uid,refine,cards:[],enchants:[]}}
function setPlayer(inventory,equipment={},equipmentInstances={}){
  sandbox.player=sandbox.window.player={playerId:'Tester',zeny:10000000,inventory,equipment,equipmentInstances};
  sandbox.RefineRuntime.state.selected=null;sandbox.RefineRuntime.state.chanceIndex=0;sandbox.RefineRuntime.state.useBlessing=false;sandbox.RefineRuntime.state.lastResult=null;
}

test('rules expose 7 equipment profiles and +20',()=>{
  assert(Object.keys(rules.groups.Weapon.levels).length===5,'weapon levels');
  assert(Object.keys(rules.groups.Armor.levels).length===2,'armor levels');
  assert(rules.groups.Weapon.levels['5'].refineLevels['20'],'weapon +20');
});

test('successful refine consumes ore and zeny',()=>{
  const eq=inst(900001,4,'success');
  setPlayer([eq,stack(984,2)]);
  sandbox.openRefineWindow({name:'精煉匠人'});
  const before=sandbox.player.zeny;
  const result=sandbox.attemptSelectedRefine({forceSuccess:true,skipConfirm:true});
  assert(result.success===true,'must succeed');
  assert(eq.refine===5,'refine +5');
  assert(sandbox.RefineRuntime.inventoryCount(984)===1,'ore consumed');
  const price=rules.groups.Weapon.levels['4'].refineLevels['5'].chances[0].price;
  assert(sandbox.player.zeny===before-price,'zeny consumed');
});

test('blessing protects a failed +7 to +8 attempt',()=>{
  const eq=inst(900001,7,'protect');
  setPlayer([eq,stack(984,1),stack(6635,10)]);
  sandbox.openRefineWindow({name:'精煉匠人'});
  const need=rules.groups.Weapon.levels['4'].refineLevels['8'].blacksmithBlessingAmount;
  sandbox.toggleRefineBlessing();
  const result=sandbox.attemptSelectedRefine({forceFailure:true,forceBreak:true,skipConfirm:true});
  assert(result.kind==='protected','protected kind');
  assert(eq.refine===7,'refine unchanged');
  assert(sandbox.RefineRuntime.inventoryCount(6635)===10-need,'blessing consumed');
});

test('unprotected breaking failure destroys inventory equipment',()=>{
  const eq=inst(900001,4,'break');
  setPlayer([eq,stack(984,1)]);
  sandbox.openRefineWindow({name:'精煉匠人'});
  const result=sandbox.attemptSelectedRefine({forceFailure:true,forceBreak:true,skipConfirm:true});
  assert(result.kind==='failure','failure kind');
  assert(!sandbox.player.inventory.some(x=>x.instanceId==='break'),'equipment destroyed');
});

test('HD failure downgrades instead of destroying where RA says so',()=>{
  const eq=inst(900001,4,'down');
  setPlayer([eq,stack(6240,1)]);
  sandbox.openRefineWindow({name:'精煉匠人'});
  sandbox.selectRefineMaterial(1);
  const chance=rules.groups.Weapon.levels['4'].refineLevels['5'].chances[1];
  assert(chance.downgradeAmount===1 && chance.breakingRate===0,'source chance');
  sandbox.attemptSelectedRefine({forceFailure:true,forceNoBreak:true,skipConfirm:true});
  assert(eq.refine===3,'downgraded by one');
  assert(sandbox.player.inventory.some(x=>x.instanceId==='down'),'not destroyed');
});

test('level 5 weapon refine applies exact RA bonus and traits',()=>{
  const eq=inst(900002,10,'w5');
  setPlayer([], {weapon:900002},{weapon:eq});
  const base=items[900002];
  const out=sandbox.RefineRuntime.decorateStatusSource('weapon',base);
  const rule=rules.groups.Weapon.levels['5'].refineLevels['10'];
  assert(out.atk===base.atk+rule.bonus/100,'exact atk bonus');
  assert(out.matk===base.matk+rule.bonus/100,'exact matk bonus');
  assert(out.pAtk===20 && out.sMatk===20,'traits +2 per refine');
});

test('level 2 armor refine applies exact RA DEF and RES/MRES',()=>{
  const eq=inst(900003,10,'a2');
  setPlayer([], {armor:900003},{armor:eq});
  const base=items[900003];
  const out=sandbox.RefineRuntime.decorateStatusSource('armor',base);
  const rule=rules.groups.Armor.levels['2'].refineLevels['10'];
  assert(out.def===base.def+rule.bonus/100,'exact def bonus');
  assert(out.resFlat===20 && out.mresFlat===20,'RES/MRES +2 per refine');
});

test('combat decoration exposes exact deterministic and random refine bonus',()=>{
  const eq=inst(900001,7,'combat');
  setPlayer([], {weapon:900001},{weapon:eq});
  const out=sandbox.RefineRuntime.decorateCombatItem('weapon',items[900001]);
  const rule=rules.groups.Weapon.levels['4'].refineLevels['7'];
  assert(out.refineAtkBonus===rule.bonus/100,'deterministic bonus');
  assert(out.refineRandomBonusMax===rule.randomBonus/100,'random max');
});

console.log(JSON.stringify({ok:true,passed:pass,logs:logs.length}));
