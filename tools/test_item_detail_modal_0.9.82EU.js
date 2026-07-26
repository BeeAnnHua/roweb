const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const ROOT=path.resolve(__dirname,'..'),read=r=>fs.readFileSync(path.join(ROOT,r),'utf8');

class FakeClassList{
  constructor(owner){this.owner=owner;this.set=new Set(String(owner.className||'').split(/\s+/).filter(Boolean));}
  add(...x){x.forEach(v=>this.set.add(v));this.sync();}
  remove(...x){x.forEach(v=>this.set.delete(v));this.sync();}
  contains(x){return this.set.has(x);}
  sync(){this.owner._className=[...this.set].join(' ');}
}
class FakeElement{
  constructor(tag='div',id=''){this.tagName=tag.toUpperCase();this.id=id;this.children=[];this.parentElement=null;this.dataset={};this.style={};this.attributes={};this.listeners={};this._className='';this._text='';this._html='';this.classList=new FakeClassList(this);}
  set className(v){this._className=String(v||'');this.classList=new FakeClassList(this);} get className(){return this._className;}
  set textContent(v){this._text=String(v??'');this.children=[];} get textContent(){return this._text+this.children.map(c=>c.textContent||'').join('');}
  set innerHTML(v){this._html=String(v??'');this.children=[];} get innerHTML(){return this._html;}
  appendChild(c){c.parentElement=this;this.children.push(c);return c;}
  removeChild(c){const i=this.children.indexOf(c);if(i>=0)this.children.splice(i,1);c.parentElement=null;return c;}
  get firstChild(){return this.children[0]||null;}
  addEventListener(type,fn){(this.listeners[type] ||= []).push(fn);}
  click(){for(const fn of this.listeners.click||[])fn({target:this,stopPropagation(){},preventDefault(){}});}
  setAttribute(k,v){this.attributes[k]=String(v);}
}
const nodes={
  'item-detail-modal':new FakeElement('section','item-detail-modal'),
  'item-detail-title':new FakeElement('b','item-detail-title'),
  'item-detail-body':new FakeElement('div','item-detail-body'),
  'item-detail-close':new FakeElement('button','item-detail-close')
};
nodes['item-detail-modal'].className='item-detail-modal hidden-window';
const domReady=[];
const document={
  getElementById:id=>nodes[id]||null,
  createElement:tag=>new FakeElement(tag),
  addEventListener:(type,fn)=>{if(type==='DOMContentLoaded')domReady.push(fn);}
};
const itemDb={
  100:{id:100,officialId:100,name:'巨大雙手劍',type:'equipment',slotCount:2,equipSlot:'weapon',atk:200,weaponLevel:4,description:['測試裝備能力。'],icon:'100.webp'},
  4001:{id:4001,officialId:4001,name:'海葵卡片',type:'card',description:['人形種族物理傷害增加。'],icon:'4001.webp'}
};
const noop=()=>{};
const ctx={window:null,console,Math,Date,JSON,Number,String,Object,Array,Set,Map,setTimeout,clearTimeout,document,
 DEFAULT_EQUIPMENT:{weapon:null,shield:null},player:{inventory:[],equipment:{weapon:null,shield:null}},normalizeItemId:v=>v==null?null:Number(v),
 normalizePlayerData:noop,getItemData:id=>itemDb[Number(typeof id==='object'?(id.id??id.itemId):id)]||null,addItem:noop,showItemInfo:noop,closeItemInfo:noop,buildItemTooltip:noop,buildEquipmentTooltip:noop,handleInventorySlotClick:noop,setEquipmentSlot:noop,equipItem:noop,moveEquipmentSlotToInventory:noop,fixEquippedItemsInInventoryOnce:noop,addItemBackToInventory:noop,useItem:noop,
 inventoryLockMode:false,hideGameTooltip:noop,addBattleLog:noop,updateInventoryUI:noop,updateEquipmentUI:noop,updatePlayerUI:noop,saveGame:noop,recalculatePlayerStats:noop,canEquipItem:()=>({ok:true}),resolveEquipmentTargetSlot:()=> 'weapon',isTwoHandedWeaponItem:()=>false,isWeaponEquipmentItem:()=>false,isAssassinOffhandWeaponItem:()=>false,normalizeEquipmentHandConflicts:noop,getEquipmentSlotName:s=>s,findInventoryItemById:()=>null,getItemName:id=>itemDb[id]?.name,getItemTypeText:d=>d.type,cleanItemDescriptionLines:d=>d.description||[],stripROColorCodesForCheck:s=>String(s),
 RO_CLIENT_ITEM_DISPLAY:{duplicateCardPrefixes:{2:'兩倍',3:'三倍',4:'四倍'},cardPrefixNames:{4001:'海葵的'},cardPostfixIds:[],cardItemAliases:{},cardInfo:{}}
};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(read('js/item_instance_ui.js'),ctx,{filename:'item_instance_ui.js'});domReady.forEach(fn=>fn());

const instance={id:100,instanceId:'test',refine:9,cards:[4001,null,null,null],enchants:[]};
ctx.showItemDetail(instance,{source:'inventory'});
assert.strictEqual(nodes['item-detail-title']._text,'+9 海葵的 巨大雙手劍 [2]');
assert(!nodes['item-detail-modal'].classList.contains('hidden-window'),'modal must open');
function flatten(node){return [node,...node.children.flatMap(flatten)];}
let all=flatten(nodes['item-detail-body']);
const sockets=all.filter(x=>String(x.className).includes('item-detail-socket '));
assert.strictEqual(sockets.length,2,'detail modal must render native slotCount only');
assert.strictEqual(sockets[0].dataset.tooltip,'海葵卡片','card hover must show card name only');
assert.strictEqual(sockets[1].dataset.tooltip,'空插槽 2');
sockets[0].click();
assert.strictEqual(nodes['item-detail-title']._text,'海葵卡片','left click card must open card detail');
assert(nodes['item-detail-body'].textContent.includes('人形種族物理傷害增加。'),'card ability description must render');
nodes['item-detail-close'].click();
assert(nodes['item-detail-modal'].classList.contains('hidden-window'),'top-right X must close modal');
console.log(JSON.stringify({version:'0.9.82EV',status:'PASS',modalTitle:'+9 海葵的 巨大雙手劍 [2]',socketCount:2,cardDetail:true,closeButton:true},null,2));
