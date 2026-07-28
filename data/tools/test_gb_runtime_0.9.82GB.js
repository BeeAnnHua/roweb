#!/usr/bin/env node
const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const read=rel=>JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'));
const checks=[];
const check=(ok,name,detail='')=>checks.push({ok:!!ok,name,detail:String(detail)});
const code=rel=>fs.readFileSync(path.join(ROOT,rel),'utf8');

function baseSandbox(){
  const s={
    console:{log:()=>{},warn:()=>{},error:()=>{}},
    Date,Math,JSON,Object,Array,Number,String,Boolean,RegExp,Set,Map,Promise,
    setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},
    performance:{now:()=>Date.now()},
    CustomEvent:function(type,options={}){this.type=type;this.detail=options.detail;},
    dispatchEvent:()=>true
  };
  s.window=s; s.global=s;
  s.document={readyState:'complete',getElementById:()=>null,addEventListener:()=>{},createElement:()=>({classList:{add:()=>{},remove:()=>{},toggle:()=>{}},appendChild:()=>{},setAttribute:()=>{},style:{}})};
  return vm.createContext(s);
}

async function testHit(){
  const s=baseSandbox(); s.player={};
  vm.runInContext(code('js/combat_mechanics_runtime.js'),s,{filename:'combat_mechanics_runtime.js'});
  check(s.HitResolver.chance({}, {}, {hit:300,flee:300})===80,'Renewal equal HIT/FLEE gives 80% hit',s.HitResolver.chance({}, {}, {hit:300,flee:300}));
  check(s.HitResolver.chance({}, {}, {hit:280,flee:300})===60,'Renewal 20 HIT deficit gives 60% hit',s.HitResolver.chance({}, {}, {hit:280,flee:300}));
  check(s.HitResolver.chance({}, {}, {hit:500,flee:300})===100,'Renewal hit chance respects 100% cap',s.HitResolver.chance({}, {}, {hit:500,flee:300}));
  check(s.HitResolver.chance({}, {}, {hit:100,flee:300})===5,'Renewal hit chance respects 5% floor',s.HitResolver.chance({}, {}, {hit:100,flee:300}));
  check(s.HitResolver.chance({}, {}, {hit:300,flee:300,baseRate:0,minimumRate:0})===0,'Explicit special-skill baseRate=0 remains supported',s.HitResolver.chance({}, {}, {hit:300,flee:300,baseRate:0,minimumRate:0}));
}

async function testTimeSetsAndStatusReset(){
  const s=baseSandbox();
  const cards=read('data/card_runtime/card_effects.json');
  const equipment=read('data/card_runtime/equipment_effects.json');
  const combos=read('data/card_runtime/card_combos.json');
  const groups=read('data/card_runtime/item_groups.json');
  const drops=read('data/card_runtime/card_drop_sources.json');
  const jobs=read('data/jobs.json');
  const itemMap={...read('data/items/item_index.json')};
  s.RO_WEB_DATA={
    'data/card_runtime/card_effects.json':cards,
    'data/card_runtime/equipment_effects.json':equipment,
    'data/card_runtime/card_combos.json':combos,
    'data/card_runtime/item_groups.json':groups,
    'data/card_runtime/card_drop_sources.json':drops
  };
  s.loadJson=async(url,fallback)=>{const rel=String(url).replace(/^\.\//,'');try{return read(rel)}catch{return fallback}};
  s.getItemData=id=>itemMap[String(id)]||null;
  s.getEquipmentInstance=slot=>s.player?.equipmentInstances?.[slot]||null;
  s.getCurrentJobData=()=>jobs[s.player?.jobKey]||{};
  s.getTrainingBonusTotals=()=>({}); s.getPassiveSkillBonusTotals=()=>({}); s.getPassiveCombatModifierTotals=()=>({}); s.getActiveBuffBonusTotals=()=>({});
  s.getSkillLevel=()=>0; s.isPlayerMounted=()=>false; s.clampRaWalkSpeed=n=>n;
  s.addBattleLog=()=>{}; s.saveGame=()=>{}; s.updatePlayerUI=()=>{}; s.updateAutoCombatUI=()=>{}; s.recalculatePlayerStats=()=>{};
  const mutations=[]; s.withPlayerBuildMutation=(reason,fn)=>{mutations.push(reason);s.RO_WEB_PLAYER_BUILD_MUTATION=true;try{return fn();}finally{s.RO_WEB_PLAYER_BUILD_MUTATION=false;}};
  const reset=()=>{s.player={baseLevel:275,jobLevel:60,job:'盧恩龍爵',jobKey:'dragon_knight',gender:'male',stats:{str:120,agi:120,vit:120,int:120,dex:120,luk:120},traits:{pow:60,sta:60,wis:60,spl:60,con:60,crt:60},traitStats:{pow:60,sta:60,wis:60,spl:60,con:60,crt:60},equipment:{},equipmentInstances:{},activeBuffs:{},learnedSkills:{},usedStatusPoints:714,usedTraitPoints:360,statusPointBaseOffset:23};};
  const equip=(slot,id,refine=0,grade=0)=>{s.player.equipment[slot]=id;s.player.equipmentInstances[slot]={id,instanceId:`gb-${slot}-${id}`,refine,enchantGrade:grade,grade,cards:[]};s.CardRuntime.invalidate();};
  reset();
  vm.runInContext(code('js/card_runtime.js'),s,{filename:'card_runtime.js'});
  vm.runInContext(code('js/effect_runtime.js'),s,{filename:'effect_runtime.js'});
  vm.runInContext(code('js/status_system.js'),s,{filename:'status_system.js'});
  await s.loadStatusData(); s.CardRuntime.init();

  const baseline=s.calculateDerivedPlayerStats();
  equip('armor',450175,0); equip('shoes',22202,0);
  const temporalArmorBoots=s.calculateDerivedPlayerStats();
  const combo7=s.CardRuntime.getSources().find(x=>x.id==='equipment_combo_fz_007');
  check(combo7?.atkFlat===80&&combo7?.matkFlat===80,'Time Transcendent armor+boots Combo is active',JSON.stringify(combo7&&{id:combo7.id,atkFlat:combo7.atkFlat,matkFlat:combo7.matkFlat,mode:combo7.comboMatchMode}));
  check(temporalArmorBoots.atk>=baseline.atk+110&&temporalArmorBoots.matk>=baseline.matk+110,'Time Transcendent armor+boots changes final ATK/MATK panel values',`${baseline.atk}/${temporalArmorBoots.atk};${baseline.matk}/${temporalArmorBoots.matk}`);

  reset(); s.CardRuntime.invalidate(); const baseline2=s.calculateDerivedPlayerStats(); equip('accessory1',490030); equip('shoes',22202);
  const ringBoots=s.calculateDerivedPlayerStats();
  const combo1=s.CardRuntime.getSources().find(x=>x.id==='equipment_combo_fz_001');
  check(combo1?.maxHpRate===15&&combo1?.maxSpRate===5,'Time Transcendent ring+boots HP/SP Combo is active',JSON.stringify(combo1&&{hp:combo1.maxHpRate,sp:combo1.maxSpRate,mode:combo1.comboMatchMode}));
  check(ringBoots.maxHp>baseline2.maxHp&&ringBoots.maxSp>baseline2.maxSp,'Time Transcendent ring+boots changes final MaxHP/MaxSP panel values',`${baseline2.maxHp}/${ringBoots.maxHp};${baseline2.maxSp}/${ringBoots.maxSp}`);

  reset(); s.CardRuntime.invalidate(); const baseline3=s.calculateDerivedPlayerStats();
  equip('armor',450299,13,4); equip('garment',480312,13,4); equip('shoes',470183,13,4); equip('accessory1',490404,0,0);
  const lt=s.calculateDerivedPlayerStats();
  const ltCombos=s.CardRuntime.getSources().filter(x=>String(x.id).startsWith('equipment_combo_fz_')).map(x=>x.id).sort();
  check(['equipment_combo_fz_009','equipment_combo_fz_010','equipment_combo_fz_011','equipment_combo_fz_012','equipment_combo_fz_013'].every(id=>ltCombos.includes(id)),'LT four-piece equipment activates all applicable Combos',JSON.stringify(ltCombos));
  check(lt.atk>baseline3.atk&&lt.matk>baseline3.matk&&lt.maxHp>baseline3.maxHp&&lt.res>baseline3.res&&lt.mres>baseline3.mres,'LT set changes final combat/status panel values',JSON.stringify({base:{atk:baseline3.atk,matk:baseline3.matk,hp:baseline3.maxHp,res:baseline3.res,mres:baseline3.mres},lt:{atk:lt.atk,matk:lt.matk,hp:lt.maxHp,res:lt.res,mres:lt.mres}}));

  // AegisName fallback: aliases with different IDs must still form the official Combo.
  reset(); s.CardRuntime.invalidate();
  itemMap['990030']={id:990030,name:'Alias Ring',type:'equipment',slot:'accessory1',AegisName:'Temporal_Ring_TW',aegisName:'Temporal_Ring_TW'};
  itemMap['992202']={id:992202,name:'Alias Boots',type:'equipment',slot:'shoes',AegisName:'Temporal_Boots_TW',aegisName:'Temporal_Boots_TW'};
  equip('accessory1',990030); equip('shoes',992202);
  const aegisCombo=s.CardRuntime.getSources().find(x=>x.id==='equipment_combo_fz_001');
  check(aegisCombo?.comboMatchMode==='aegis_name','Time set Combo falls back to AegisName when item IDs differ',aegisCombo?.comboMatchMode);

  // Free status reset must preserve external equipment/card sources while returning allocated points.
  reset(); s.CardRuntime.invalidate(); equip('accessory1',490030); equip('shoes',22202);
  const beforeReset=s.calculateDerivedPlayerStats();
  const ok=s.resetAllPlayerStats({confirm:false});
  const afterReset=s.calculateDerivedPlayerStats();
  check(ok===true&&Object.values(s.player.stats).every(v=>v===1)&&Object.values(s.player.traits).every(v=>v===0)&&s.player.usedStatusPoints===0&&s.player.usedTraitPoints===0,'Free status reset returns normal and trait allocation',JSON.stringify({stats:s.player.stats,traits:s.player.traits}));
  check(s.CardRuntime.getSources().some(x=>x.id==='equipment_combo_fz_001')&&afterReset.maxHp>0,'Status reset preserves equipped Time set and Combo Runtime',`${beforeReset.maxHp}/${afterReset.maxHp}`);
  check(mutations.includes('status_reset'),'Status reset executes inside player-build mutation guard',JSON.stringify(mutations));
}

async function testSkillReset(){
  const s=baseSandbox();
  s.loadJson=async(url,fallback)=>{const rel=String(url).replace(/^\.\//,'');try{return read(rel)}catch{return fallback}};
  s.addBattleLog=()=>{}; s.confirm=()=>true; s.recalculatePlayerStats=()=>{}; s.updatePlayerUI=()=>{}; s.updateStatusUI=()=>{}; s.updateJobUI=()=>{}; s.updateSkillUI=()=>{}; s.updateAutoCombatUI=()=>{}; s.updateQuickSlotUI=()=>{}; s.saveGame=()=>{}; s.syncEquipmentGrantedSkills=()=>{}; s.invalidateCardRuntime=()=>{};
  const mutations=[]; s.withPlayerBuildMutation=(reason,fn)=>{mutations.push(reason);s.RO_WEB_PLAYER_BUILD_MUTATION=true;try{return fn();}finally{s.RO_WEB_PLAYER_BUILD_MUTATION=false;}};
  let controllerReset=0; s.isAutoBattleRunning=()=>true; s.resetAutoBattleController=()=>{controllerReset++;};
  s.player={jobKey:'dragon_knight',job:'盧恩龍爵',jobLevel:60,skillPoints:3,learnedSkills:{'5':10,'55':10,'2005':5},pendingSkillAdds:{},quickSlots:[{type:'skill',id:5},{type:'item',id:501},...Array.from({length:8},()=>({type:'empty'}))],autoCombat:{heal:{enabled:true,skillId:4},normalAttack:{enabled:true},attacks:Array.from({length:4},(_,i)=>({enabled:true,skillId:[5,55,2005,2006][i]})),attack:{enabled:true,skillId:5},buffs:{'357':{enabled:true,skillId:357}}}};
  vm.runInContext(code('js/job.js'),s,{filename:'job.js'});
  await s.loadJobData(); await s.loadSkillData();
  // Replace UI functions declared by job.js after loading.
  s.updatePlayerUI=()=>{};s.updateJobUI=()=>{};s.updateSkillUI=()=>{};s.updateAutoCombatUI=()=>{};s.updateQuickSlotUI=()=>{};s.recalculatePlayerStats=()=>{};s.saveGame=()=>{};s.syncEquipmentGrantedSkills=()=>{};
  const spent=s.getSpentNativeSkillPoints();
  const ok=s.resetAllSkillsFree({confirm:false});
  check(spent===25,'Free skill reset counts learned native skill levels',spent);
  check(ok===true&&Object.keys(s.player.learnedSkills).length===0&&s.player.skillPoints===28,'Free skill reset returns spent skill points',JSON.stringify({ok,skillPoints:s.player.skillPoints,learned:s.player.learnedSkills}));
  check(s.player.quickSlots[0]?.type==='empty'&&s.player.quickSlots[1]?.type==='item','Skill reset clears only skill quick slots',JSON.stringify(s.player.quickSlots.slice(0,2)));
  check(s.player.autoCombat.attacks.every(slot=>slot.enabled===false&&slot.skillId===null)&&Object.keys(s.player.autoCombat.buffs).length===0&&s.player.autoCombat.heal.enabled===false,'Skill reset clears auto-battle skill references',JSON.stringify(s.player.autoCombat));
  check(mutations.includes('skill_reset')&&controllerReset>0,'Skill reset is mutation-safe and resets auto-battle controller',JSON.stringify({mutations,controllerReset}));
}

(async()=>{
  await testHit();
  await testTimeSetsAndStatusReset();
  await testSkillReset();
  const report={version:'0.9.82GB',summary:{checks:checks.length,passed:checks.filter(x=>x.ok).length,failed:checks.filter(x=>!x.ok).length},checks};
  fs.writeFileSync(path.join(ROOT,'tools/test_gb_runtime_report_0.9.82GB.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
  process.exit(report.summary.failed?1:0);
})().catch(error=>{console.error(error);process.exit(2);});
