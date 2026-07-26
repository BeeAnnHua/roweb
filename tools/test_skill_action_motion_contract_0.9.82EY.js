const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const read=r=>JSON.parse(fs.readFileSync(path.join(ROOT,r),'utf8'));
const skills={...read('data/skills/skills_core_1.json').skills,...read('data/skills/skills_core_2.json').skills};
const runtime={};
for(const rel of ['data/skill_runtime/runtime_generated_all.json','data/skill_runtime/runtime_core_1_v1.json']){
  for(const [id,row] of Object.entries(read(rel).skills)){
    if(!row||typeof row!=='object')continue;
    runtime[id]=(row.runtimeProfile&&typeof row.runtimeProfile==='object')?row.runtimeProfile:row;
  }
}
const motions=[];
const ctx={console,Math,Date,JSON,Number,String,Object,Array,Set,Map,Promise,performance:{now:()=>1000},window:{},document:undefined,
  player:{baseLevel:100,jobLevel:50,stats:{str:50,agi:50,vit:50,int:50,dex:50,luk:50},traitStats:{},aspd:180,sp:99999,hp:99999,maxHp:99999,zeny:99999,activeBuffs:{},runtimeState:{},skillTimingState:{},equipment:{}},
  skillsData:{runtimeProfiles:runtime,skillIndex:skills},getSkillLevel:()=>10,getActiveBuffBonusTotals:()=>({}),getPassiveSkillBonusTotals:()=>({}),getPassiveCombatModifierTotals:()=>({}),getTrainingBonusTotals:()=>({}),getItemData:()=>null,
  calculateDerivedPlayerStats:()=>({stats:{str:50,agi:50,vit:50,int:50,dex:50,luk:50},aspd:180}),recalculatePlayerStats:()=>{},addBattleLog:()=>{},saveGame:()=>{},updatePlayerUI:()=>{},
  playROStudioPlayerMotion:(motion,options={})=>{motions.push({motion,options});return true;},setInterval:()=>1,clearInterval:()=>{},setTimeout:()=>1,clearTimeout:()=>{}};
ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT,'js/skill_engine.js'),'utf8'),ctx,{filename:'skill_engine.js'});
const assert=(c,m)=>{if(!c)throw new Error(m)};
const skill=id=>skills[String(id)];
assert(ctx.getRuntimeSkillActionMotion(skill(45))==='cast','Attention Concentrate is a Buff with legacy type Weapon and must use weaponless Cast');
assert(ctx.getRuntimeSkillActionMotion(skill(8))==='cast','Endure is a Buff and must use weaponless Cast');
assert(ctx.getRuntimeSkillActionMotion(skill(28))==='cast','Heal must use weaponless Cast');
assert(ctx.getRuntimeSkillActionMotion(skill(19))==='attack','Fire Bolt is a damage skill and must use equipped-weapon Attack');
assert(ctx.getRuntimeSkillActionMotion(skill(5))==='attack','Bash is a damage skill and must use equipped-weapon Attack');
const passive=Object.keys(runtime).find(id=>runtime[id]?.handler==='passive'&&skills[id]);
assert(passive&&ctx.getRuntimeSkillActionMotion(skills[passive])===null,'Passive must not play an action');
assert(ctx.getRuntimeSkillActionMotion(skill(45),{toggleOff:true})===null,'Toggle off must not play an action');

// Whole implemented player runtime: damage => Attack, all other active => Cast.
let checked=0,attacks=0,casts=0,passives=0;
for(const [id,rp] of Object.entries(runtime)){
  const s=skills[id]; if(!s)continue;
  const handler=String(rp?.handler||'');
  if(!handler||handler==='pending')continue;
  const ui=ctx.getRuntimeSkillUiType(s),motion=ctx.getRuntimeSkillActionMotion(s);
  checked++;
  if(ui==='passive'){passives++;assert(motion===null,`${id} passive motion=${motion}`);}
  else if(ui==='attack'){attacks++;assert(motion==='attack',`${id} damage motion=${motion}`);}
  else {casts++;assert(motion==='cast',`${id} support motion=${motion}`);}
}

// The atlas contract itself: every Cast entry must be body/hair-only, never weapon composite.
let castAtlases=0,attackAtlases=0;
const walk=(dir)=>{
  for(const name of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,name.name);
    if(name.isDirectory())walk(p);
    else if(name.name==='motions.json'){
      const d=JSON.parse(fs.readFileSync(p,'utf8'));
      for(const variant of Object.values(d.variants||{})){
        if(variant.cast){castAtlases++;assert(!/weapon/i.test(String(variant.cast)),`${path.relative(ROOT,p)} Cast unexpectedly includes weapon: ${variant.cast}`);}
        for(const attackPath of Object.values(variant.attack||{})){attackAtlases++;assert(/attack\//.test(String(attackPath)),`${path.relative(ROOT,p)} invalid Attack path: ${attackPath}`);}
      }
    }
  }
};
walk(path.join(ROOT,'assets/characters'));

const source=fs.readFileSync(path.join(ROOT,'js/skill_engine.js'),'utf8');
assert(!source.includes('playROStudioPlayerMotion(skill?.actionMotion || "cast")'),'Heal must not replay a second hard-coded Cast after paySkillCost');
assert(!source.includes('playROStudioPlayerMotion("cast");else if(typeof playPlayerAttackAnimation'),'Chain damage must not overwrite Attack with Cast');
assert(source.includes('castPhase: "prepare"'),'Long casts must start a preparation segment');
assert(source.includes('castPhase: "release"'),'Long casts must play a release segment at completion');
console.log(JSON.stringify({version:'0.9.82EY',status:'PASS',checked,attacks,casts,passives,castAtlases,attackAtlases,examples:{buffWeapon:'cast',magicDamage:'attack',physicalDamage:'attack'}},null,2));
