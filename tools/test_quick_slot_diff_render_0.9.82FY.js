const fs = require('fs');
const vm = require('vm');
const path = require('path');
const source = fs.readFileSync(path.resolve(__dirname, '../js/quick_slots.js'), 'utf8');

let created = 0;
const bar = {
  _children: [],
  get childElementCount() { return this._children.length; },
  set innerHTML(value) { this._children = []; },
  get innerHTML() { return ''; },
  appendChild(node) { this._children.push(node); }
};
function element() {
  created += 1;
  return {
    type:'', className:'', title:'', dataset:{}, draggable:false, textContent:'', src:'', alt:'',
    style:{}, classList:{ add(){}, remove(){}, toggle(){} },
    appendChild(){}, addEventListener(){}, setAttribute(){}, querySelector(){ return null; }
  };
}
const context = {
  console,
  window:{ confirm:()=>true },
  document:{
    activeElement:null,
    addEventListener(){},
    getElementById:id => id === 'quick-slot-bar' ? bar : null,
    createElement:element
  },
  player:{ equipment:{}, quickSlots:Array.from({length:10},()=>({type:'empty'})) },
  saveGame(){}, addBattleLog(){}, getItemData(){return null;}, findInventoryItemById(){return null;}
};
context.window = Object.assign(context.window, context);
vm.createContext(context);
vm.runInContext(source, context, {filename:'quick_slots.js'});
vm.runInContext('updateQuickSlotUI();', context);
const firstCreated = created;
vm.runInContext('for(let i=0;i<100;i++) updateQuickSlotUI({skipIfUnchanged:true});', context);
if (created !== firstCreated) throw new Error(`unchanged quick slots rebuilt DOM: ${firstCreated} -> ${created}`);
vm.runInContext('player.quickSlots[0]={type:"basic"}; updateQuickSlotUI({skipIfUnchanged:true});', context);
if (created <= firstCreated) throw new Error('changed quick slot did not rebuild DOM');
console.log('PASS 0.9.82FY quick-slot diff rendering');
console.log(JSON.stringify({firstCreated, finalCreated:created, slots:bar.childElementCount}, null, 2));
