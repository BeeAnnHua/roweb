const fs = require('fs');
const vm = require('vm');
const path = require('path');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadTree(name) {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'skill_trees', name), 'utf8'));
  return data.skills.filter(node => node.exclude !== true).map(node => ({
    id: node.skillId,
    officialId: node.skillId,
    maxLevel: node.maxLevel || 1,
    name: `Skill ${node.skillId}`
  }));
}

// Super Novice tree alias regression.
{
  const context = {
    console,
    window: null,
    document: { querySelectorAll: () => [], getElementById: () => null },
    CSS: { escape: value => String(value) },
    player: { jobKey: 'super_novice' }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'job.js'), 'utf8'), context, { filename: 'job.js' });
  context.__TEST_SKILLS__ = {
    jobs: {
      novice: [{ id: 1, officialId: 1, name: 'Basic' }],
      supernovice: loadTree('supernovice.json'),
      super_novice_e: loadTree('super_novice_e.json'),
      hyper_novice: loadTree('hyper_novice.json')
    }
  };
  vm.runInContext('skillsData = __TEST_SKILLS__', context);

  context.player.jobKey = 'super_novice';
  assert(context.getSkillTierList('first').length === 51, 'Super Novice first tab must contain 51 skills');

  context.player.jobKey = 'expanded_super_novice';
  assert(context.getSkillTierList('first').length === 51, 'Expanded Super Novice must inherit the 51 Super Novice skills');
  assert(context.getSkillTierList('second').length === 49, 'Limit Break tab must contain 49 additional skills');

  context.player.jobKey = 'hyper_novice';
  assert(context.getSkillTierList('first').length === 51, 'Hyper Novice must retain Super Novice skills');
  assert(context.getSkillTierList('second').length === 49, 'Hyper Novice must retain Limit Break skills');
  assert(context.getSkillTierList('fourth').length === 15, 'Hyper Novice tab must contain 15 skills');
}

// Automatic elemental converter regression.
{
  const itemMap = {
    12114: { id: 12114, name: '火 肯貝特', useEffect: { element: 'Fire' } },
    12115: { id: 12115, name: '水 肯貝特', useEffect: { element: 'Water' } },
    12116: { id: 12116, name: '地 肯貝特', useEffect: { element: 'Earth' } },
    12117: { id: 12117, name: '風 肯貝特', useEffect: { element: 'Wind' } }
  };
  const player = {
    inventory: [{ id: 12114, count: 2 }],
    activeBuffs: {},
    autoCombat: { elementEndow: { enabled: true, element: 'Fire' } }
  };
  const logs = [];
  const context = {
    console,
    window: null,
    document: { getElementById: () => null, querySelectorAll: () => [] },
    player,
    currentMonster: null,
    normalizeItemId: value => value,
    getItemData: id => itemMap[id] || null,
    addBattleLog: text => logs.push(text),
    consumeItem: item => {
      const inv = player.inventory.find(entry => String(entry.id) === String(item.id));
      if (!inv || inv.count <= 0) return;
      inv.count -= 1;
      player.activeBuffs.item_physical_element_endow = {
        expiresAt: Date.now() + 1200000,
        effects: { attackElementOverride: item.useEffect.element }
      };
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'auto_battle.js'), 'utf8'), context, { filename: 'auto_battle.js' });

  assert(context.window.tryAutoElementEndow() === true, 'First auto converter use must consume one item');
  assert(player.inventory[0].count === 1, 'Converter count must decrease from 2 to 1');
  assert(context.window.tryAutoElementEndow() === false, 'Active matching converter must not be consumed again');
  assert(player.inventory[0].count === 1, 'Active matching converter must preserve item count');

  player.activeBuffs.item_physical_element_endow.expiresAt = Date.now() - 1;
  assert(context.window.tryAutoElementEndow() === true, 'Expired converter must be renewed');
  assert(player.inventory[0].count === 0, 'Renewal must consume the second converter');
}

const shops = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'shops.json'), 'utf8'));
const toolIds = new Set(shops.tool_common.items.map(row => Number(row.itemId)));
for (const id of [12114, 12115, 12116, 12117]) {
  assert(toolIds.has(id), `Shared town tool shop must sell converter ${id}`);
}

console.log('0.9.82FK Super Novice / elemental converter regression: PASS');
