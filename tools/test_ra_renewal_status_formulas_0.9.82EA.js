const fs=require('fs'),vm=require('vm');
function assertEq(actual,expected,label){if(actual!==expected)throw new Error(`${label}: expected ${expected}, got ${actual}`)}
function assertNear(actual,expected,eps,label){if(Math.abs(actual-expected)>eps)throw new Error(`${label}: expected ${expected}, got ${actual}`)}
const items={};
const context={console,Math,Date,setTimeout,clearTimeout,window:null,document:{getElementById:()=>null},
  player:{baseLevel:100,jobLevel:1,jobKey:'novice',stats:{str:10,agi:80,vit:10,int:30,dex:100,luk:30},traitStats:{pow:30,sta:30,wis:30,spl:30,con:30,crt:30},equipment:{weapon:null,shield:null,leftWeapon:null},activeBuffs:{}},
  getItemData:id=>items[id]||null,getCurrentJobData:()=>({raJob:'Novice'}),getTrainingBonusTotals:()=>({}),getPassiveSkillBonusTotals:()=>({}),getActiveBuffBonusTotals:()=>({}),
  isPlayerMounted:()=>false,RA_WALK_SPEED:{DEFAULT:150},clampRaWalkSpeed:n=>n,saveGame:()=>{},updatePlayerUI:()=>{},addBattleLog:()=>{}
};context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync('js/status_system.js','utf8'),context,{filename:'status_system.js'});
vm.runInContext(`statPointData={points:{'1':48,'100':1000}};traitPointData={startLevel:1,maxLevel:275,playerAllocationCap:110,points:{'100':180}};jobStatBonuses={novice:{bonusStats:[]}};jobBasePoints={novice:{baseHp:{'100':1000},baseSp:{'100':100}}};renewalJobAspd={jobs:{Novice:{Fist:40,Shield:10}}};`,context);
let d=context.calculateDerivedPlayerStats();
assertEq(d.stats.str,10,'STR');assertEq(d.stats.dex,100,'DEX');
assertEq(d.atk,215,'Renewal status ATK');assertEq(d.matk,250,'Renewal MATK');
assertEq(d.hit,445,'Renewal HIT with CON');assertEq(d.flee,346,'Renewal FLEE with CON');
assertNear(d.cri,11,1e-9,'Renewal CRI percent');assertNear(d.perfectDodge,4,1e-9,'Perfect dodge percent');
assertEq(d.res,80,'RES');assertEq(d.mres,80,'MRES');assertEq(d.pAtk,16,'P.ATK');assertEq(d.sMatk,16,'S.MATK');
assertEq(d.hPlus,30,'H.Plus');assertNear(d.crate,10,1e-9,'C.RATE');assertEq(d.aspd,174,'Renewal base ASPD');
assertEq(d.hardDef,0,'Hard DEF without equipment');assertEq(d.softDef,71,'Renewal Soft DEF');assertEq(d.hardMdef,0,'Hard MDEF without equipment');assertEq(d.softMdef,77,'Renewal Soft MDEF');
// Equipment/card modifier layer: flat stats, all-stat rate, traits and trait-derived rates.
items[2]={id:2,def:50,mdef:20,effects:{strFlat:5,allStatsRate:10,powFlat:3,pAtk:2,crateFlat:6,hPlus:4,resRate:10},cards:[3]};
items[3]={id:3,effects:{dex:5,crtFlat:3}};
context.player.equipment.armor=2;
d=context.calculateDerivedPlayerStats();
assertEq(d.stats.str,16,'Equipment STR + all-stat rate');
assertEq(d.stats.dex,115,'Card DEX + all-stat rate');
assertEq(d.stats.pow,33,'Equipment POW');assertEq(d.stats.crt,33,'Card CRT');
assertEq(d.pAtk,19,'Equipment P.ATK');assertNear(d.crate,17,1e-9,'Equipment C.RATE');assertEq(d.hPlus,37,'Equipment H.Plus');assertEq(d.res,88,'Equipment RES rate');
assertEq(d.hardDef,50,'Equipment Hard DEF');assertEq(d.softDef,72,'Stats remain Soft DEF');assertEq(d.hardMdef,20,'Equipment Hard MDEF');assertEq(d.softMdef,83,'Stats remain Soft MDEF');
// aspdRate uses Renewal rate2 (percentage of the gap to 195), not a direct multiplication.
context.player.equipment.armor=null;
context.getActiveBuffBonusTotals=()=>({aspdRate:10});
d=context.calculateDerivedPlayerStats();
assertEq(d.aspd,176,'Renewal ASPD rate2 gap formula');
context.getActiveBuffBonusTotals=()=>({aspdFlat:100});
d=context.calculateDerivedPlayerStats();assertEq(d.aspd,193,'ASPD cap 193');
console.log('PASS 0.9.82EA Renewal status formulas');
console.log(JSON.stringify({base:{atk:215,matk:250,hit:445,flee:346,cri:11,res:80,mres:80,pAtk:16,sMatk:16,hPlus:30,crate:10,aspd:174,hardDef:0,softDef:71,hardMdef:0,softMdef:77},equipment:{str:16,dex:115,pAtk:19,crate:17,hPlus:37,res:88},aspdRate2:176,cap:193},null,2));
