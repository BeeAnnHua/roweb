const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
function assert(v,m){if(!v)throw new Error(m)}
function eq(a,b,m){if(a!==b)throw new Error(`${m}: ${a} !== ${b}`)}
const core1=JSON.parse(fs.readFileSync(path.join(ROOT,'data/skills/skills_core_1.json'),'utf8')).skills;
const rangeConfig=JSON.parse(fs.readFileSync(path.join(ROOT,'data/skill_range_config.json'),'utf8'));
let passive={};
const player={position:{x:0,y:0,targetX:null,targetY:null},equipment:{weapon:100},stats:{},activeBuffs:{},skillTimingState:{},aspd:193,state:'Idle'};
const monster={position:{x:324,y:0},currentHp:1000};
const ctx={console,Math,Date,JSON,Number,String,Object,Array,Set,Map,Promise,performance:{now:()=>Date.now()},window:{},document:{getElementById:()=>null},
 player,currentMonster:monster,currentMap:null,
 getItemData:id=>id===100?{id:100,weaponType:'bow',range:5}:null,
 getSkillLevel:id=>Number(id)===44?10:1,
 getPassiveSkillBonusTotals:()=>passive,
 recalculatePlayerStats:()=>{},
 addBattleLog:()=>{},saveGame:()=>{},updatePlayerUI:()=>{},
 requestAnimationFrame:fn=>fn(),setTimeout:()=>1,clearTimeout:()=>{},setInterval:()=>1,clearInterval:()=>{},
 matchMedia:()=>({matches:false})};
ctx.window=ctx;
ctx.window.innerWidth=1280;ctx.window.innerHeight=720;
ctx.window.RO_WEB_DATA={'data/skill_range_config.json':rangeConfig,'data/weapon_types.json':{cellSizePx:36,types:{bow:{attackRangeCells:5},fist:{attackRangeCells:1}}}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT,'js/position_engine.js'),'utf8'),ctx,{filename:'js/position_engine.js'});

eq(ctx.cellsToPixels(1),36,'one RO cell is exactly 36px');
eq(ctx.pixelsToCells(324),9,'324px is 9 cells');
eq(ctx.getPlayerNormalAttackRangeCells(),5,'bow base attack range');
passive={attackRangeCells:10};
eq(ctx.getPlayerNormalAttackRangeCells(),15,'Vulture Eye extends bow normal range');
const doubleStrafe=core1['46'];
eq(ctx.getSkillBaseRangeCells(doubleStrafe,10),9,'negative RA range uses absolute value when skillrange_from_weapon=0');
eq(ctx.getSkillRangeCells(doubleStrafe,10),19,'Double Strafe + Vulture Eye Lv10');
eq(ctx.getSkillRangePx(doubleStrafe,10),684,'Double Strafe 19 cells in pixels');
passive={};
const spearBoomerang=core1['59'];
for(const [level,range] of [[1,3],[2,5],[3,7],[4,9],[5,11]])eq(ctx.getSkillRangeCells(spearBoomerang,level),range,`Spear Boomerang Lv${level}`);
const cartCannon=core1['2477'];
eq(ctx.getSkillRangeCells(cartCannon,1),7,'Cart Cannon Lv1 range');
eq(ctx.getSkillRangeCells(cartCannon,5),11,'Cart Cannon Lv5 range');
eq(ctx.getSkillEffectRadiusCells(cartCannon,5),3,'Cart Cannon Lv5 splash radius');
eq(ctx.getSkillEffectDiameterCells(cartCannon,5),7,'Cart Cannon Lv5 splash diameter');
const stormGust=core1['89'];
eq(ctx.getSkillRangeCells(stormGust,10),9,'Storm Gust ground cast range');
eq(ctx.getSkillRangePx(stormGust,10),324,'Storm Gust cast range in pixels');
eq(ctx.getSkillEffectRadiusCells(stormGust,10),4,'Storm Gust AoE radius from runtime targeting');
eq(ctx.getSkillEffectDiameterCells(stormGust,10),9,'Storm Gust 9x9 AoE');
// Base range is capped at 14 before passive range flags, matching skill_get_range2.
const capped={id:999001,targetType:'Attack',range:30,flags:{AlterRangeVulture:true}};
passive={attackRangeCells:10};
eq(ctx.getSkillBaseRangeCells(capped,1),14,'RA server base-range cap');
eq(ctx.getSkillRangeCells(capped,1),24,'range bonus is added after base cap');
// Boundary is inclusive and based on exact 36px cells.
passive={};monster.position={x:324,y:0};
assert(ctx.canUseSkillOnTarget(stormGust,10,monster,player),'target at exactly 9 cells is legal');
monster.position={x:324.01,y:0};
assert(!ctx.canUseSkillOnTarget(stormGust,10,monster,player),'target beyond 9 cells is illegal');

const battleSource=fs.readFileSync(path.join(ROOT,'js/battle.js'),'utf8');
assert(!/AUTO_ATTACK_INTERVAL\s*=\s*250/.test(battleSource),'old fixed 250ms auto battle ceiling removed');
assert(/AUTO_BATTLE_MIN_SCHEDULE_MS\s*=\s*8/.test(battleSource),'browser-safe event scheduler floor present');
assert(/setTimeout\s*\(/.test(battleSource)&&!/autoBattleTimer\s*=\s*setInterval/.test(battleSource),'auto battle uses adaptive setTimeout scheduling');
console.log('PASS 0.9.82DY skill distance and scheduler tests');
console.log(JSON.stringify({cellSizePx:36,bowWithVulture:15,doubleStrafe:19,cartCannonLv5:{castRange:11,radius:3,diameter:7},stormGust:{castRange:9,castRangePx:324,radius:4,diameter:9}},null,2));
