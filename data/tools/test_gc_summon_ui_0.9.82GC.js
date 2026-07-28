#!/usr/bin/env node
const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const code=rel=>fs.readFileSync(path.join(ROOT,rel),'utf8');
const read=rel=>JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'));
const checks=[];
const check=(ok,name,detail='')=>checks.push({ok:!!ok,name,detail:String(detail)});

function sandbox(){
  const panel={innerHTML:''};
  const winNode={classList:{contains:()=>false,remove:()=>{}}};
  const s={console:{log:()=>{},warn:()=>{},error:()=>{}},Date,Math,JSON,Object,Array,Number,String,Boolean,RegExp,Set,Map,Promise,
    setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},currentMonster:null,
    loadJson:async()=>null,addBattleLog:()=>{},saveGame:()=>{},recalculatePlayerStats:()=>{},updatePlayerUI:()=>{},defeatMonster:()=>{},
    document:{getElementById:id=>id==='virtual-summon-panel'?panel:(id==='virtual-summon-window'?winNode:null)},
    player:{jobKey:'dragon_knight',baseLevel:275,mountState:{mounted:true,type:'dragon',assetKey:'dragon'},hasFalcon:true,falconEquipped:true,falconActive:true,hasWarg:true,wargActive:true,activeBuffs:{},virtualSummonSettings:{assistEnabled:true}},
    resolvePlayerMountType:()=> 'dragon',
    getMountRuntimeDefinition:type=>({mountType:type,displayName:type==='dragon'?'龍坐騎':type}),
    canPlayerUseMount:()=>true,
    setPlayerMounted:null,
    isFalconActiveRuntime:null,
    setFalconActiveRuntime:null,
    isWargActiveRuntime:null,
    setWargActiveRuntime:null,
    HomunculusManager:{getActive:()=>({definition:{name:'艾蘿拉'},level:275,state:{assistEnabled:true}}),open:()=>true},
    setHomunculusAssistEnabled:()=>true,commandHomunculusAction:()=>true,restHomunculus:()=>true
  };
  s.setPlayerMounted=(on,type)=>{s.player.mountState={mounted:on,type:on?type:null,assetKey:on?type:null};return true;};
  s.isFalconActiveRuntime=()=>!!s.player.hasFalcon;
  s.setFalconActiveRuntime=on=>{s.player.hasFalcon=s.player.falconEquipped=s.player.falconActive=!!on;return !!on;};
  s.isWargActiveRuntime=()=>!!s.player.hasWarg;
  s.setWargActiveRuntime=on=>{s.player.hasWarg=s.player.wargActive=!!on;return !!on;};
  s.window=s;s.global=s;return {ctx:vm.createContext(s),panel};
}

(function(){
  const {ctx,panel}=sandbox();
  vm.runInContext(code('js/virtual_summon.js'),ctx,{filename:'virtual_summon.js'});
  vm.runInContext('virtualSummonData={summons:{},independentSummons:{},uiText:{}};',ctx);
  const rows=ctx.VirtualSummonManager.getUiModel();
  const kinds=rows.map(x=>x.kind);
  check(['mount','falcon','warg','homunculus'].every(x=>kinds.includes(x)),'Unified summon model includes mount/falcon/warg/homunculus',JSON.stringify(kinds));
  ctx.updateVirtualSummonUI(true);
  check(panel.innerHTML.includes('龍坐騎')&&panel.innerHTML.includes('獵鷹')&&panel.innerHTML.includes('狼')&&panel.innerHTML.includes('艾蘿拉'),'Unified summon panel renders all active systems',panel.innerHTML.slice(0,400));
  check(panel.innerHTML.includes('可與狼同時存在')&&panel.innerHTML.includes('可與獵鷹同時存在'),'Falcon and Warg coexistence is visible in UI');
  ctx.dismissFalconFromSummonUI();
  check(ctx.player.hasFalcon===false&&ctx.player.hasWarg===true,'Dismissing Falcon does not remove Warg');
  ctx.dismissWargFromSummonUI();
  check(ctx.player.hasWarg===false,'Warg can be dismissed independently');
})();

(function(){
  const skill=code('js/skill_engine.js');
  check(!skill.includes('if (enabling && typeof setWargActiveRuntime === "function") setWargActiveRuntime(false);'),'Falcon toggle no longer clears Warg');
  check(!skill.includes('if (enabling && typeof setFalconActiveRuntime === "function") setFalconActiveRuntime(false);'),'Warg toggle no longer clears Falcon');
  const quick=code('js/quick_slots.js');
  check(quick.includes('togglePlayerMount')&&quick.includes('resolvePlayerMountType'),'Riding actively toggles the resolved Swordman-family mount');
  const manifest=read('data/mounts/mount_manifest.json');
  check(manifest.mounts.dragon.control==='riding_skill_and_virtual_summon_window'&&manifest.mounts.dragon.toggleSkillId===63&&JSON.stringify(manifest.mounts.dragon.requiredSkillIds)==='[63,2007]','Dragon uses Riding as primary toggle and summon UI as secondary entry',JSON.stringify(manifest.mounts.dragon));
  const core=fs.readFileSync(path.join(ROOT,'data/skills/skills_core_1.json'),'utf8');
  check(!core.includes('召狼時自動收回獵鷹')&&!core.includes('與狼互斥'),'Player-visible skill data removes Falcon/Warg exclusivity text');
  const css=code('css/style.css');
  check(css.includes('0.9.82GB unified summon control panel')&&css.includes('.virtual-summon-card'),'Unified summon panel CSS is installed');
})();

const report={version:'0.9.82GC',summary:{checks:checks.length,passed:checks.filter(x=>x.ok).length,failed:checks.filter(x=>!x.ok).length},checks};
fs.writeFileSync(path.join(ROOT,'tools/test_gc_summon_ui_report_0.9.82GC.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
process.exit(report.summary.failed?1:0);
