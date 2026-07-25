const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
function assert(cond, msg){ if(!cond) throw new Error(msg); }

// ---- Renewal damage pipeline: physical endow + dual wield + no ammo ----
{
  const items = {
    1101:{id:1101,type:'equipment',category:'weapon',slot:'weapon',weaponType:'dagger',atk:50,element:'Neutral',weaponLevel:1},
    1102:{id:1102,type:'equipment',category:'weapon',slot:'weapon',weaponType:'dagger',atk:40,element:'Neutral',weaponLevel:1},
    9999:{id:9999,type:'ammo',category:'ammo',atk:999,element:'Holy'}
  };
  const context = {
    console, Date, Math,
    window:null,
    player:{
      baseLevel:100,
      equipment:{weapon:1101,shield:1102,ammo:9999},
      stats:{str:100,dex:100,luk:1,int:1},
      activeBuffs:{item_physical_element_endow:{expiresAt:Date.now()+60000,effects:{attackElementOverride:'Fire'}}}
    },
    getItemData:id=>items[id]||null,
    calculateDerivedPlayerStats:()=>({atk:200,matk:150,matkMin:150,matkMax:150,stats:{str:100,dex:100,luk:1,int:100},pAtk:0,sMatk:0}),
    getActiveBuffSpecialValue:(key,fallback)=>fallback,
    getActiveBuffBonusTotals:()=>({}),
    getPassiveSkillBonusTotals:()=>({}),
    getTrainingBonusTotals:()=>({}),
    getPassiveTargetDamageBonus:()=>0,
    applyROCombatDamageModifiers:d=>d,
    CriticalResolver:{resolve:()=>({critical:false,multiplier:1})},
    ResourceFormulaResolver:{inputs:()=>({})}
  };
  context.window=context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js/ra_renewal_damage_pipeline.js'),'utf8'),context);
  const api=context.RARenewalDamagePipeline;
  assert(api.resolvePhysicalAttackElement(items[1101])==='Fire','converter must override physical element');
  assert(api.resolveAttackElement({elementSource:'skill',element:'Holy'},items[1101])==='Holy','magic/skill element must remain own element');
  const parts=api.buildPhysicalParts({profile:{}});
  assert(parts.dualWield===true && parts.left?.weapon?.id===1102,'shield-slot weapon must enter left-hand pipeline');
  assert(parts.right.ammoAtk===0,'ammo ATK must be disabled');
  const target={def:0,mdef:0,element:'Neutral',race:'Formless',size:'Medium'};
  const physical=api.resolvePhysicalSkill({ratio:100,elementSource:'skill',element:'Holy'},1,target,{});
  assert(physical.element==='Fire','even fixed-element physical skills must use converter');
  const magic=api.resolveMagicSkill({ratio:100,elementSource:'skill',element:'Holy'},1,target,{});
  assert(magic.element==='Holy','magic must not use converter');
}

// ---- Player runtime: old-save hand conflict + converter buff ----
{
  const context={console,Date,Math,window:null,document:{querySelectorAll:()=>[],getElementById:()=>null},localStorage:{},setTimeout,clearTimeout};
  context.window=context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js/player.js'),'utf8'),context);
  vm.runInContext(`
    items={
      2001:{id:2001,name:'測試雙手弓',type:'equipment',category:'weapon',slot:'weapon',handed:2,Locations:{Both_Hand:true}},
      2101:{id:2101,name:'測試盾牌',type:'equipment',category:'armor',slot:'shield'},
      12114:${JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT,'data/items/consumables.json'),'utf8'))['12114'])}
    };
    player={jobKey:'archer',equipment:{weapon:2001,shield:2101},inventory:[],activeBuffs:{}};
    addBattleLog=function(){};
    updatePlayerUI=function(){};updateInventoryUI=function(){};saveGame=function(){};closeItemInfo=function(){};
  `,context);
  const removed=vm.runInContext('normalizeEquipmentHandConflicts({silent:true})',context);
  assert(removed.length===1,'old save should remove conflicting shield');
  assert(vm.runInContext('player.equipment.weapon',context)===2001,'two-hand weapon must remain equipped');
  assert(vm.runInContext('player.equipment.shield',context)===null,'shield data slot must be empty for two-hand weapon');
  assert(vm.runInContext('player.inventory.some(x=>x.id===2101&&x.count===1)',context),'removed shield must return to inventory');

  // Actual equip flow: shield removes two-hand weapon; two-hand weapon removes shield.
  vm.runInContext(`
    canEquipItem=function(){return {ok:true};};
    resolveEquipmentTargetSlot=function(item){return item.slot;};
    recalculatePlayerStats=function(){};syncEquipmentGrantedSkills=function(){};syncROStudioWeaponTypeFromEquipment=function(){};
    updateEquipmentUI=function(){};hideGameTooltip=function(){};
    player.inventory=[];player.equipment={weapon:2001,shield:null};
    player.inventory.push({id:2101,count:1,locked:false});
    equipItem(items[2101]);
  `,context);
  assert(vm.runInContext('player.equipment.weapon',context)===null,'equipping shield must remove two-hand weapon');
  assert(vm.runInContext('player.equipment.shield',context)===2101,'shield must equip normally');
  assert(vm.runInContext('player.inventory.some(x=>x.id===2001&&x.count===1)',context),'two-hand weapon must return to inventory');
  vm.runInContext('equipItem(items[2001]);',context);
  assert(vm.runInContext('player.equipment.weapon',context)===2001,'two-hand weapon must equip in weapon slot');
  assert(vm.runInContext('player.equipment.shield',context)===null,'equipping two-hand weapon must remove shield/offhand');
  assert(vm.runInContext('player.inventory.some(x=>x.id===2101&&x.count===1)',context),'shield must return to inventory');

  vm.runInContext('player.inventory.push({id:12114,count:1,locked:false}); consumeItem(items[12114]);',context);
  assert(vm.runInContext('player.activeBuffs.item_physical_element_endow.effects.attackElementOverride',context)==='Fire','converter must create Fire buff');
  assert(vm.runInContext('player.activeBuffs.item_physical_element_endow.effects.affectsDualWieldBothHands',context)===1,'converter must cover both hands');
  assert(vm.runInContext('player.inventory.some(x=>x.id===12114)',context)===false,'converter must consume exactly one item');
}

console.log('PASS 0.9.82DN two-hand / converter / dual-wield / no-ammo tests');
