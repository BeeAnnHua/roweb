const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const load=r=>JSON.parse(fs.readFileSync(path.join(root,r),'utf8'));
const coreRaw=load('data/skills/skills_core_1.json');
const core=coreRaw.skills||coreRaw;
const items=load('data/items/item_index.json');
const skill={...core['2418']};
function assert(v,m){if(!v)throw new Error(m)}
assert(skill.runtimeProfile.weaponTypes.join(',')==='bow,instrument,whip','profile must list bow/instrument/whip');
assert(skill.requires.Weapon.Bow&&skill.requires.Weapon.Musical&&skill.requires.Weapon.Whip,'rAthena requirement triple missing');
const sandbox={console,window:{},document:{getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[]},setInterval:()=>0,clearInterval:()=>{},setTimeout:()=>0,clearTimeout:()=>{},Date,Math:Object.create(Math)};
sandbox.window=sandbox;
sandbox.items=items;
sandbox.player={baseLevel:200,jobLevel:70,hp:1000,maxHp:1000,sp:1000,maxSp:1000,zeny:0,stats:{str:1,agi:200,vit:1,int:1,dex:300,luk:1},learnedSkills:{'2418':5},activeBuffs:{},equipment:{weapon:null},equipmentInstances:{},jobKey:'wanderer'};
sandbox.skillsData={skillIndex:{'2418':skill},runtimeProfiles:{'2418':skill}};
sandbox.getSkillLevel=id=>Number(id)===2418?5:0;
sandbox.getItemData=id=>items[String(id)]||Object.values(items).find(x=>String(x.id)===String(id))||null;
sandbox.getSkillDataById=id=>sandbox.skillsData.skillIndex[String(id)];
sandbox.getPassiveSkillBonusTotals=()=>({});sandbox.getActiveBuffBonusTotals=()=>({});sandbox.getTrainingBonusTotals=()=>({});sandbox.getPassiveCombatModifierTotals=()=>({});
sandbox.isRuntimeSkillCasting=()=>false;sandbox.getRuntimeSkillDelayBlock=()=>null;sandbox.getActiveSkillLockState=()=>null;sandbox.getMagicSkillLockState=()=>null;
sandbox.isRuntimeMagicSkill=()=>false;sandbox.isPlayerMounted=()=>false;sandbox.hasEquippedShieldRuntime=()=>false;sandbox.isFalconActiveRuntime=()=>false;sandbox.isWargActiveRuntime=()=>false;
sandbox.previewRuntimeResourceCost=undefined;sandbox.CombatResourceManager=null;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root,'js/skill_engine.js'),'utf8'),sandbox,{timeout:20000});
const cases=[
  {label:'弓',id:700001,type:'Bow'},
  {label:'樂器',id:570024,type:'Musical'},
  {label:'鞭子',id:580024,type:'Whip'},
  {label:'rAthena W_WHIP alias',id:999001,type:'W_WHIP'},
  {label:'rAthena W_MUSICAL alias',id:999002,type:'W_MUSICAL'}
];
for(const row of cases){
  sandbox.items[String(row.id)]={id:row.id,name:row.label,dbSubType:row.type,weaponType:row.type};
  sandbox.player.equipment.weapon=row.id;
  sandbox.player.equipmentInstances.weapon={id:row.id,itemId:row.id,instanceId:'test_'+row.id};
  const actual=sandbox.getEquippedWeaponTypeRuntime();
  const result=sandbox.canCastSkill(skill,5,null,{ignoreTimingCheck:true,ignoreSpCostCheck:true,ignoreResourceCostCheck:true,ignoreCastStateCheck:true});
  assert(result.ok,`${row.label} must cast; actual=${actual}, reason=${result.reason}`);
}
sandbox.items['999003']={id:999003,name:'短劍',dbSubType:'Dagger',weaponType:'dagger'};
sandbox.player.equipment.weapon=999003;sandbox.player.equipmentInstances.weapon={id:999003,itemId:999003};
const blocked=sandbox.canCastSkill(skill,5,null,{ignoreTimingCheck:true,ignoreSpCostCheck:true,ignoreResourceCostCheck:true,ignoreCastStateCheck:true});
assert(!blocked.ok&&/武器類型/.test(blocked.reason),'dagger must remain blocked');
assert(sandbox.getRuntimeRequiredWeaponTypes(skill,skill.runtimeProfile).join(',')==='bow,instrument,whip','authoritative 2418 lock missing');
console.log('PASS V0.9.83C2 Severe Rainstorm Bow/Musical/Whip compatibility');
