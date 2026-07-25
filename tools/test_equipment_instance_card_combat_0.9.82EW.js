const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const ROOT=path.resolve(__dirname,'..'),read=r=>fs.readFileSync(path.join(ROOT,r),'utf8');
const db={100:{id:100,name:'測試武器',type:'equipment'},4001:{id:4001,name:'測試卡片',type:'card',damageRate:20}};
const ctx={window:null,console,Math,Date,JSON,Number,String,Object,Array,Set,Map,
 player:{equipment:{weapon:100},equipmentInstances:{weapon:{id:100,cards:[4001,null,null,null]}}},
 getItemData:id=>db[Number(id)]||null,getEquipmentInstance:slot=>ctx.player.equipmentInstances[slot]||null,
 DefenseResolver:{physical:d=>d,magic:d=>d},calculateDerivedPlayerStats:()=>({crate:0})};ctx.window=ctx;
vm.createContext(ctx);vm.runInContext(read('js/combat_formula_runtime.js'),ctx,{filename:'combat_formula_runtime.js'});
const damage=ctx.CombatFormulaRuntime.applyDamage(100,{source:ctx.player,target:{},damageType:'physical',applyElement:false,applyWeaponSize:false,applyDefense:false});
assert.strictEqual(damage,120,'socketed card on equipment instance must contribute to combat formula');
const sources=ctx.CombatFormulaRuntime.equipmentModifierSources(ctx.player);
assert(sources.some(x=>x.id===4001),'equipment modifier source list must contain instance card');
console.log(JSON.stringify({version:'0.9.82EW',status:'PASS',baseDamage:100,cardDamageRate:20,finalDamage:damage},null,2));
