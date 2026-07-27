#!/usr/bin/env node
const fs=require('fs'), vm=require('vm'), path=require('path');
const ROOT=path.resolve(__dirname,'..');
const read=rel=>JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'));
const checks=[];
const check=(ok,name,detail='')=>checks.push({ok:!!ok,name,detail:typeof detail==='string'?detail:JSON.stringify(detail)});

class FakeClassList {
  constructor(initial=[]){this.values=new Set(initial);}
  add(...xs){xs.forEach(x=>this.values.add(x));}
  remove(...xs){xs.forEach(x=>this.values.delete(x));}
  contains(x){return this.values.has(x);}
  toggle(x,force){if(force===undefined){if(this.values.has(x)){this.values.delete(x);return false;}this.values.add(x);return true;} if(force)this.values.add(x);else this.values.delete(x);return !!force;}
}
class FakeElement {
  constructor(tag='div',id=''){
    this.tagName=tag.toUpperCase(); this.id=id; this.hidden=false; this.disabled=false; this.textContent=''; this.title='';
    this.dataset={}; this.className=''; this.classList=new FakeClassList(); this.children=[]; this.parentNode=null;
    this.value=''; this.checked=false; this.type=''; this.min=''; this.max=''; this.count=0; this.listeners={}; this.attributes={};
    this._innerHTML='';
  }
  appendChild(child){if(!child)return child; child.parentNode=this; this.children.push(child); if(child.id) elements.set(child.id,child); return child;}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this); if(this.id)elements.delete(this.id);}
  setAttribute(k,v){this.attributes[k]=String(v); if(k==='class')this.className=String(v);}
  getAttribute(k){return this.attributes[k];}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  dispatchEvent(evt){(this.listeners[evt.type]||[]).forEach(fn=>fn(evt)); return true;}
  focus(){} select(){}
  querySelector(){return null;}
  querySelectorAll(){return [];}
  closest(){return null;}
  get options(){return this.children.filter(x=>x.tagName==='OPTION');}
  set innerHTML(value){this._innerHTML=String(value); this.children=[]; if(String(value).includes('<option')){const o=new FakeElement('option'); const m=String(value).match(/value="([^"]*)"/);o.value=m?m[1]:'';o.textContent=String(value).replace(/<[^>]+>/g,'');this.appendChild(o);} }
  get innerHTML(){return this._innerHTML;}
}
const elements=new Map();
const ensure=(id,tag='div')=>{if(!elements.has(id))elements.set(id,new FakeElement(tag,id));return elements.get(id);};
const head=new FakeElement('head','head'), body=new FakeElement('body','body'); body.classList=new FakeClassList();
const document={
  head,body,
  getElementById:id=>elements.get(id)||null,
  createElement:tag=>new FakeElement(tag),
  createTextNode:text=>{const e=new FakeElement('#text');e.textContent=String(text);return e;},
  querySelectorAll:()=>[],
  addEventListener:()=>{}
};
['playerIdModal','playerIdInput','playerIdMessage','playerName','playerJob','baseLevel','jobLevel','hp','sp','baseExp','jobExp','atk','def','matk','hit','flee','cri','aspd','zeny','blueGem','redGem','battlePlayerName','battlePlayerLevel','autoCombatCashFoodSelect','autoCombatCashFoodList','autoCombatCashFoodEnabled'].forEach(id=>ensure(id,id.includes('Input')?'input':id.includes('Select')?'select':'div'));
ensure('playerIdModal').hidden=true;

const store=new Map(), logs=[], recorded=[];
const cfg=read('data/mvp_gacha.json');
const manifest=read('data/items/database_manifest.json');
const itemMap={};
for(const rel of manifest.allDataPaths){const data=read(rel);const rows=Array.isArray(data)?data:Object.values(data);for(const row of rows){if(row&&row.id!=null)itemMap[String(row.id)]=row;}}
for(const row of Object.values(read('data/items/cash.json'))) itemMap[String(row.id)]=row;
const context={
  console,setTimeout,clearTimeout,requestAnimationFrame:fn=>fn(),document,
  localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),clear:()=>store.clear(),length:0,key:()=>null,removeItem:k=>store.delete(k)},
  sessionStorage:{clear(){}}, location:{origin:'http://test',pathname:'/index.html',replace(){}}, caches:{keys:()=>Promise.resolve([])},
  confirm:()=>true, alert:()=>{}, Event:class{constructor(type){this.type=type;}},
  addEventListener(){},
  getJobData:key=>key==='novice'?{name:'初心者'}:{name:'初心者'}, getJobKeyFromName:()=> 'novice',
  expTables:{jobs:{novice:{maxBaseLevel:99,maxJobLevel:10,base:[0,10,20],job:[0,10,20]}}},
  updateStatusBarFill(){}, syncStatusPointCache(){}, syncTraitPointCache(){}, formatExpText:()=> '0 / 0', formatResourceNumber:x=>String(x||0),
  updateQuickSlotUI(){}, recalculatePlayerStats(){}, invalidateCardRuntime(){}, updateInventoryUI(){},
  addBattleLog:text=>logs.push(String(text)),
  getItemData:id=>itemMap[String(id)]||null,
  canUseConsumableItem:()=>({ok:true}), markConsumableItemUsed:()=>true,
  RO_WEB_DATA:{'data/mvp_gacha.json':cfg},
  useItem:()=>false,
  applyRate:x=>Number(x), applyTrainingRewardBonus:x=>Number(x), getRate:()=>1, randomInt:(a,b)=>a,
  recordItemDrop:(id,qty)=>recorded.push({id:Number(id),qty:Number(qty)}),
  window:null, globalThis:null
};
context.window=context; context.globalThis=context;
vm.createContext(context);
const run=rel=>vm.runInContext(fs.readFileSync(path.join(ROOT,rel),'utf8'),context,{filename:rel});
run('js/player.js');
context.getItemData=id=>itemMap[String(id)]||null;
context.canUseConsumableItem=()=>({ok:true});
context.markConsumableItemUsed=()=>true;
vm.runInContext(`player={
 name:'',playerIdVersion:1,jobKey:'novice',job:'初心者',gender:'male',genderChosen:true,
 baseLevel:1,jobLevel:1,hp:40,maxHp:40,sp:11,maxSp:11,baseExp:0,jobExp:0,baseExpToNext:10,jobExpToNext:10,
 atk:5,def:1,matk:1,hit:1,flee:1,cri:1,aspd:150,zeny:0,blueGem:0,redGem:0,
 inventory:[],equipment:{},equipmentInstances:{},activeBuffs:{},skills:{},learnedSkills:{},stats:{str:1,agi:1,vit:1,int:1,dex:1,luk:1},traits:{},
 currentCity:'prontera',lastFieldMap:'prontera_3x3_region_camera',map:null
}; window.player=player;`,context);

// Player ID runtime
ensure('playerIdInput').value='測試勇者';
const idOk=vm.runInContext('confirmPlayerIdChange()',context);
check(idOk===true,'player ID confirmation succeeds');
check(vm.runInContext('player.name',context)==='測試勇者','player ID persisted in player data');
check(ensure('playerName').textContent==='初心者 測試勇者','character card displays job + ID',ensure('playerName').textContent);
check(ensure('battlePlayerName').textContent==='測試勇者','battle label uses player ID',ensure('battlePlayerName').textContent);
check(vm.runInContext('getPlayerAnnouncementName()',context)==='測試勇者','announcement helper returns player ID');
check(vm.runInContext('validatePlayerId("1234567890123").ok',context)===false,'player ID enforces 12-character limit');
check(store.size>0,'player ID confirmation writes save data');

// Inventory helpers and actual gacha runtime
context.findInventoryItemById=id=>context.player.inventory.find(x=>String(x.id)===String(id)&&!x.instanceId)||null;
context.addItem=(item,count=1)=>{
  let row=context.player.inventory.find(x=>String(x.id)===String(item.id)&&!x.instanceId);
  if(!row){row={id:Number(item.id),name:(itemMap[String(item.id)]||item).name,count:0};context.player.inventory.push(row);}
  row.count+=Number(count); return row;
};
context.normalizeActiveBuffs=()=>{
  const now=Date.now(); for(const [key,buff] of Object.entries(context.player.activeBuffs||{}))if(Number(buff?.expiresAt||0)<=now)delete context.player.activeBuffs[key];
};
run('js/mvp_gacha_runtime.js');
check(context.MvpGachaRuntime.version==='0.9.82GD','gacha runtime version',context.MvpGachaRuntime.version);

// deterministic random source inside VM
context.randomValues=[];
vm.runInContext('Math.random=()=>randomValues.length?randomValues.shift():0.5',context);
context.player.inventory=[{id:14848,name:'MVP幸運轉蛋',count:1}]; context.randomValues=[0,0];
const opened=vm.runInContext('MvpGachaRuntime.openGacha(getItemData(14848))',context);
const bannerHost=elements.get('ro-mvp-gacha-banner-host');
const bannerText=bannerHost?.children.at(-1)?.textContent||'';
check(opened===true,'gacha opens successfully');
check(bannerText.includes('玩家 測試勇者 取得')&&bannerText.includes('卡片'),'rare gacha banner includes player ID and prize',bannerText);
check(!context.player.inventory.some(x=>x.id===14848&&x.count>0),'gacha consumes exactly one item');
check(context.player.inventory.some(x=>x.id===4403),'gold card reward added to inventory');

// Cash food and recovery effects
context.player.activeBuffs={}; context.player.inventory=[{id:23221,name:'靈巧棒棒條[轉蛋專用]',count:1}]; context.randomValues=[0];
const foodOk=vm.runInContext('MvpGachaRuntime.applyCashFood(getItemData(23221))',context);
const foodBuffs=Object.values(context.player.activeBuffs); const now=Date.now();
const main=foodBuffs.find(x=>x.effects?.dexFlat===15), extra=foodBuffs.find(x=>x.effects?.hitFlat>=11);
check(foodOk&&main&&extra,'biscuit applies main and random extra effects');
check(!!main&&Math.abs((main.expiresAt-now)-1800000)<5000,'main food effect lasts 30 minutes',main&&main.expiresAt-now);
check(!!extra&&Math.abs((extra.expiresAt-now)-600000)<5000,'extra biscuit effect lasts 10 minutes',extra&&extra.expiresAt-now);
context.player.hp=100;context.player.maxHp=1000;context.player.sp=20;context.player.maxSp=200;context.player.inventory=[{id:12739,name:'天雪花',count:1}];
const healOk=vm.runInContext('MvpGachaRuntime.applyPercentHeal(getItemData(12739))',context);
check(healOk&&context.player.hp===200&&context.player.sp===40,'percentage recovery item restores 10% MaxHP/MaxSP',`${context.player.hp}/${context.player.sp}`);

// Auto cash-food runtime
run('js/auto_battle.js');
context.player.activeBuffs={}; context.player.inventory=[{id:14849,count:2},{id:14850,count:2}];
vm.runInContext('player.autoCombat=createDefaultAutoCombat(); player.autoCombat.cashFood={enabled:true,itemIds:[14849]};',context);
const detected=vm.runInContext('getAutoCashFoodInventoryRows().map(x=>x.id)',context);
check(detected.includes(14849)&&detected.includes(14850),'auto setting detects stat foods in inventory',detected);
const before=context.player.inventory.find(x=>x.id===14849).count;
const auto1=vm.runInContext('tryAutoCashFood()',context); const after=context.player.inventory.find(x=>x.id===14849).count;
const auto2=vm.runInContext('tryAutoCashFood()',context); const after2=context.player.inventory.find(x=>x.id===14849).count;
check(auto1===true&&after===before-1,'auto food consumes one item when buff missing',`${before}->${after}`);
check(auto2===false&&after2===after,'auto food does not repeatedly consume while active',`${after}->${after2}`);
// Render inventory selector/list with fake DOM and add another item
ensure('autoCombatCashFoodSelect').value=''; ensure('autoCombatCashFoodList').innerHTML='';
vm.runInContext('renderAutoCashFoodUI()',context);
check(ensure('autoCombatCashFoodSelect').options.length>=3,'auto food selector renders detected inventory options',ensure('autoCombatCashFoodSelect').options.length);
ensure('autoCombatCashFoodSelect').value='14850';
const addSelection=vm.runInContext('addAutoCashFoodSelection()',context);
check(addSelection===true&&vm.runInContext('player.autoCombat.cashFood.itemIds.includes(14850)',context),'highlighted food can be confirmed into maintain list');
check(ensure('autoCombatCashFoodList').children.length>=2,'selected food list renders removable rows',ensure('autoCombatCashFoodList').children.length);

// MVP card red banner hook
run('js/loot.js');
context.player.inventory=[]; recorded.length=0; bannerHost.children=[]; context.randomValues=[0];
vm.runInContext('rollMonsterDrops({id:9999,isMvp:true,drops:[{itemId:4403,chance:10000,qty:1}]})',context);
const mvpBanner=bannerHost.children.at(-1)?.textContent||'';
check(mvpBanner.includes('玩家 測試勇者 取得')&&mvpBanner.includes('卡片'),'MVP card drop creates red player announcement',mvpBanner);
const bannerCount=bannerHost.children.length; context.randomValues=[0];
vm.runInContext('rollMonsterDrops({id:1002,isMvp:false,drops:[{itemId:4001,chance:10000,qty:1}]})',context);
check(bannerHost.children.length===bannerCount,'ordinary monster card does not trigger MVP announcement');

const report={version:'0.9.82GD',summary:{checks:checks.length,passed:checks.filter(x=>x.ok).length,failed:checks.filter(x=>!x.ok).length},checks,logs:logs.slice(-10)};
fs.writeFileSync(path.join(ROOT,'tools/test_gd_runtime_report_0.9.82GD.json'),JSON.stringify(report,null,2)+'\n');
process.stdout.write(JSON.stringify(report,null,2)+'\n');
process.exit(report.summary.failed?1:0);
