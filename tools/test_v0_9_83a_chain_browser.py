#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
CFG = json.loads((ROOT / 'data/newcomer_support.json').read_text(encoding='utf-8'))
RUNTIME = ROOT / 'js/newcomer_support_runtime.js'


def make_items():
    ids = {101538, 1000994, 1000985}
    ids.update(int(x) for r in CFG['jobRoutes'].values() for x in r['weapons'])
    ids.update(int(x) for r in CFG['stages']['100']['armorSets'].values() for x in r['items'])
    ids.update(int(x) for r in CFG['stages']['130']['sets'].values() for x in r['items'])
    ids.update(int(x) for r in CFG['stages']['160']['sets'].values() for x in r['items'])
    ids.update(int(x['id']) for x in CFG['weaponEnchantOptions']['slot3'] + CFG['weaponEnchantOptions']['slot2'])
    names = {101538:'蹦級箱', 1000994:'幻象裝備兌換券', 1000985:'全自動裝備兌換券'}
    return {str(i): {'id':i, 'name':names.get(i, f'物品{i}'), 'icon':f'images/items/{i}.webp', 'description':['test']} for i in ids}


def bootstrap(page, base_level=100, inventory=None, claimed=True):
    page.set_content('<!doctype html><html><head></head><body></body></html>')
    page.evaluate(
        '''({cfg, items, baseLevel, inventory, claimed}) => {
          window.RO_WEB_DATA = {'data/newcomer_support.json': cfg};
          window.__items = items;
          window.__logs = [];
          window.player = {
            baseLevel,
            jobKey: 'rune_knight',
            job: '盧恩騎士',
            inventory: inventory || [],
            newcomerSupportClaimedV1: claimed,
            newcomerSupportProgressV1: {},
            equipment: {}
          };
          window.RO_WEB_PLAYER_SAVE_FOUND = true;
          window.getItemData = id => window.__items[String(Number(id))] || null;
          window.getJobData = key => ({name:key === 'rune_knight' ? '盧恩騎士' : key, tier:key === 'rune_knight' ? 3 : 0});
          window.addItem = (it, count=1) => {
            const id = Number(it.id);
            if (it.supportEquipment || it.enchants || it.refine) {
              window.player.inventory.push({...it, id, count:Number(count || 1)});
              return;
            }
            const row = window.player.inventory.find(r => Number(r.id) === id && !r.supportEquipment);
            if (row) row.count = Number(row.count || 0) + Number(count || 1);
            else window.player.inventory.push({id, name:it.name, count:Number(count || 1)});
          };
          window.addBattleLog = msg => window.__logs.push(String(msg));
          window.updateInventoryUI = () => {};
          window.updatePlayerUI = () => {};
          window.saveGame = () => {};
          window.invalidateCardRuntime = () => {};
          window.invalidatePlayerUiRenderCaches = () => {};
          window.confirm = () => true;
          window.useItem = () => false;
        }''',
        {'cfg': CFG, 'items': make_items(), 'baseLevel': base_level, 'inventory': inventory or [], 'claimed': claimed}
    )
    page.add_script_tag(path=str(RUNTIME))


def box_count(page, item_id):
    return page.evaluate('(id) => player.inventory.filter(r => Number(r.id) === id).reduce((a,r)=>a+Number(r.count||0),0)', item_id)


def run():
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        page = browser.new_page(viewport={'width':1280,'height':720})

        # Level gate: Lv99 may inspect but cannot consume or claim.
        bootstrap(page, base_level=99, inventory=[{'id':101538,'name':'蹦級箱','count':1}])
        assert page.evaluate('NewcomerSupportRuntime.openForBox(101538)') is True
        assert page.evaluate('NewcomerSupportRuntime.claimStage(100)') is False
        assert box_count(page, 101538) == 1
        results.append('Lv100 gate retains box')

        # Full 100 -> 130 -> 160 chain.
        page = browser.new_page(viewport={'width':1280,'height':720})
        bootstrap(page, base_level=100, inventory=[{'id':101538,'name':'蹦級箱','count':1}])
        assert page.evaluate('window.useItem(101538)') is True
        assert page.evaluate('NewcomerSupportRuntime.claimStage(100)') is True
        assert box_count(page, 101538) == 0
        assert box_count(page, 1000994) == 1
        assert page.evaluate('player.newcomerSupportProgressV1.stage100') is True
        results.append('Lv100 consumes 101538 and grants 1000994')

        page.evaluate('player.baseLevel = 130')
        assert page.evaluate('window.useItem(1000994)') is True
        assert page.evaluate('NewcomerSupportRuntime.claimStage(130)') is True
        assert box_count(page, 1000994) == 0
        assert box_count(page, 1000985) == 1
        assert page.evaluate('player.newcomerSupportProgressV1.stage130') is True
        results.append('Lv130 consumes 1000994 and grants 1000985')

        page.evaluate('player.baseLevel = 160')
        assert page.evaluate('window.useItem(1000985)') is True
        assert page.evaluate('NewcomerSupportRuntime.claimStage(160)') is True
        assert box_count(page, 1000985) == 0
        assert page.evaluate('player.newcomerSupportProgressV1.stage160') is True
        assert page.evaluate('NewcomerSupportRuntime.pendingStage()') is None
        results.append('Lv160 consumes final box and completes chain')

        # Existing-character NPC grants only the first box once.
        page = browser.new_page(viewport={'width':390,'height':844})
        bootstrap(page, base_level=100, inventory=[], claimed=False)
        assert page.evaluate("NewcomerSupportRuntime.claimFromNpc({name:'新人裝備支援員'})") is True
        assert box_count(page, 101538) == 1
        assert page.evaluate("NewcomerSupportRuntime.claimFromNpc({name:'新人裝備支援員'})") is False
        assert box_count(page, 101538) == 1
        results.append('NPC initial claim is per-character once')

        browser.close()

    print(json.dumps({'version':'0.9.83A','checks':len(results),'passed':len(results),'failed':0,'results':results},ensure_ascii=False))


if __name__ == '__main__':
    run()
