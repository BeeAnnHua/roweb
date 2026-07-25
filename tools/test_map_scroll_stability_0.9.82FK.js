const fs = require('fs');
const vm = require('vm');
const path = require('path');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

class FakeElement {
  constructor(tag = 'div') {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.className = '';
    this.scrollTop = 0;
    this.style = {};
    this.hidden = false;
    this._innerHTML = '';
  }
  set innerHTML(value) {
    this._innerHTML = String(value || '');
    this.children.forEach(child => { child.parentElement = null; });
    this.children = [];
  }
  get innerHTML() { return this._innerHTML; }
  get childElementCount() { return this.children.length; }
  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  setAttribute(name, value) { this[name] = String(value); }
  addEventListener() {}
  closest(selector) {
    if (selector === '.map-template-body') {
      let node = this;
      while (node) {
        if (String(node.className).split(/\s+/).includes('map-template-body')) return node;
        node = node.parentElement;
      }
    }
    return null;
  }
  querySelector(selector) {
    const className = selector.startsWith('.') ? selector.slice(1) : null;
    const visit = node => {
      for (const child of node.children || []) {
        if (className && String(child.className).split(/\s+/).includes(className)) return child;
        const nested = visit(child);
        if (nested) return nested;
      }
      return null;
    };
    return visit(this);
  }
}

const currentLabel = new FakeElement('div');
const mapBody = new FakeElement('div');
mapBody.className = 'window-body map-template-body';
const mapList = new FakeElement('div');
mapList.id = 'map-list';
mapBody.appendChild(mapList);

const document = {
  body: new FakeElement('body'),
  getElementById(id) {
    if (id === 'current-map-name') return currentLabel;
    if (id === 'map-list') return mapList;
    return null;
  },
  createElement(tag) { return new FakeElement(tag); },
  querySelector(selector) {
    if (selector === '#map-window .map-template-body') return mapBody;
    return null;
  },
  querySelectorAll() { return []; },
  documentElement: { clientWidth: 1280, clientHeight: 720 }
};

const context = {
  console,
  document,
  window: null,
  maps: [
    { id: 'field_a', name: '地圖 A', thumb: 'a.webp' },
    { id: 'field_b', name: '地圖 B', thumb: 'b.webp' }
  ],
  cities: [
    { id: 'town_a', name: '城鎮 A', description: 'A town' },
    { id: 'town_b', name: '城鎮 B', description: 'B town' }
  ],
  currentMap: { id: 'field_a', name: '地圖 A', thumb: 'a.webp' },
  player: { currentCity: null },
  monsters: [],
  getCityData: () => null,
  addBattleLog() {},
  setInterval,
  clearInterval,
  setTimeout,
  clearTimeout
};
context.window = context;
context.window.addEventListener = () => {};
context.window.visualViewport = null;
context.window.matchMedia = () => ({ matches: false });
context.window.requestAnimationFrame = callback => { callback(); return 1; };
context.window.cancelAnimationFrame = () => {};
context.window.innerWidth = 1280;
context.window.innerHeight = 720;

vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'map.js'), 'utf8'), context, { filename: 'map.js' });

context.updateMapUI();
const firstWarp = mapList.querySelector('.map-warp-panel');
assert(firstWarp, 'First render must create the destination scroll panel');
firstWarp.scrollTop = 173;
mapList.scrollTop = 11;
mapBody.scrollTop = 7;

// Auto-battle monster discovery calls updateMapUI repeatedly without changing location.
context.updateMapUI();
const stableWarp = mapList.querySelector('.map-warp-panel');
assert(stableWarp === firstWarp, 'Same-location refresh must not replace the live scroll panel');
assert(stableWarp.scrollTop === 173, 'Same-location refresh must preserve the current destination position');

// A real map change may rebuild, but the user's view position must still remain stable.
context.currentMap = context.maps[1];
context.updateMapUI();
const rebuiltWarp = mapList.querySelector('.map-warp-panel');
assert(rebuiltWarp !== firstWarp, 'Location change must rebuild current-state controls');
assert(rebuiltWarp.scrollTop === 173, 'Location-change rebuild must restore destination scrollTop');
assert(mapList.scrollTop === 11, 'Map list scrollTop must be restored');
assert(mapBody.scrollTop === 7, 'Map body scrollTop must be restored');

console.log('0.9.82FK map / teleport auto-battle scroll stability: PASS');
