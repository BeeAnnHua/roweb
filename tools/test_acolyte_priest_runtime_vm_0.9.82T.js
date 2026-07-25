const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const skills=JSON.parse(fs.readFileSync(path.join(root,'data/skills/skills_core_1.json'),'utf8')).skills;
const core=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_core_1_v1.json'),'utf8')).skills;
const runtimeProfiles={};for(const [id,row] of Object.entries(core))runtimeProfiles[id]=row.runtimeProfile||row;
const logs=[];
const ctx={console,Date,Math,setTimeout:()=>0,clearTimeout:()=>{},window:null,
 player:{hp:500,maxHp:1000,sp:1000,maxSp:1000,baseLevel:200,position:{x:0,y:0},activeBuffs:{},learnedSkills:{}},
 currentMonster:{name:'不死測試怪',level:180,race:'Demon',element:'Undead',currentHp:1000,position:{x:0,y:0}},
 skillsData:{runtimeProfiles},
 getSkillLevel:(id)=>Number(skills[String(id)]?.maxLevel||1),
 recalculatePlayerStats:()=>{},updatePlayerUI:()=>{},updateMonsterUI:()=>{},saveGame:()=>{},addBattleLog:s=>logs.push(s),
 playROStudioPlayerMotion:()=>{},calculateDerivedPlayerStats:()=>({stats:{int:100},matk:200}),
 getCurrentJobSkills:()=>Object.values(skills),getExtraSkillSkillList:()=>[],isSkillBasic:()=>false,
 getEquippedWeaponTypeRuntime:()=> 'fist',isPlayerMounted:()=>false,
 defeatMonster:()=>{ctx.currentMonster=null;},
 StatusManager:{apply:(target,status,opt)=>{ctx.lastStatus={target,status,opt};target.runtimeState={statuses:{[status]:{effects:opt.effects,expiresAt:0}}};return {applied:true};}},
 GroundEffectManager:{create:o=>{ctx.lastGround=o;return o.id;}},AreaShapeResolver:{inRange:()=>true},
 RO_WEB_CELL_SIZE:32
};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/skill_engine.js'),'utf8'),ctx);
function skill(id){return skills[String(id)];}
if(!ctx.castBuffSkill(skill(73),10))throw Error('Kyrie cast failed');
const k=ctx.player.activeBuffs['73'];if(k.effects.kyrieBarrierHp!==300||k.effects.kyrieBarrierHits!==10)throw Error('Kyrie values bad '+JSON.stringify(k));
ctx.castDebuffSkill(skill(32),10);if(ctx.lastStatus.opt.chancePercent!==85||ctx.lastStatus.opt.effects.defRate!==-50)throw Error("Signum bad "+JSON.stringify(ctx.lastStatus));
if(ctx.getMonsterRuntimeBonuses(ctx.currentMonster).defRate!==-50)throw Error("Signum runtime DEF bridge failed");
ctx.player.hp=500;ctx.currentMonster={name:'惡魔',race:'Demon',element:'Dark',currentHp:1000,position:{x:0,y:0}};ctx.castSanctuarySkill(skill(70),7);ctx.lastGround.onTick([ctx.currentMonster],ctx.lastGround);
if(ctx.player.hp!==1000)throw Error('Sanctuary heal bad '+ctx.player.hp); // 777 capped
if(ctx.currentMonster.currentHp!==612)throw Error('Sanctuary damage bad '+ctx.currentMonster.currentHp); // floor(777/2)=388
console.log(JSON.stringify({result:'PASS',kyrieHp:k.effects.kyrieBarrierHp,kyrieHits:k.effects.kyrieBarrierHits,signumChance:ctx.lastStatus.opt.chancePercent,signumDefRate:ctx.lastStatus.opt.effects.defRate,sanctuaryPlayerHp:ctx.player.hp,sanctuaryMonsterHp:ctx.currentMonster.currentHp,logs:logs.slice(-3)},null,2));
