#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ACCOUNT_KEY = 'ro_web_account_profile_v1'
CSS = (ROOT / 'css/style.css').read_text(encoding='utf-8')
RUNTIME = (ROOT / 'js/character_slots_runtime.js').read_text(encoding='utf-8')
HTML = '''<!doctype html><html><head><meta charset="utf-8"><base href="https://roweb.test/"></head>
<body class="ro-black-gold-theme character-select-open">
<section id="characterSelectOverlay" class="character-select-overlay" aria-label="角色選擇">
  <div class="character-select-backdrop"></div><div class="character-select-shell">
  <header class="character-select-header"><div class="character-select-brand"><span class="character-select-emblem">R</span><div><h1>RO_WEB</h1><p>選擇冒險者</p></div></div><div class="character-select-account-state"><span id="characterCloudStatus"></span><b id="characterSlotCount"></b></div></header>
  <main><div id="characterSlotGrid" class="character-slot-grid"></div><p id="characterSelectMessage" class="character-select-message"></p></main>
  <footer class="character-select-footer"><span>雲端架構預留</span><small>V0.9.83B</small></footer></div>
</section>
<section id="characterCreateModal" class="character-create-overlay" hidden><div class="character-create-dialog"><input id="characterCreateName"><button data-create-gender="male" class="is-selected"></button><button data-create-gender="female"></button><p id="characterCreateMessage"></p></div></section>
<div id="game-root"></div></body></html>'''


def seed_account():
    return {
        'schema':'ro_web_account_profile_v1','version':1,'appVersion':'0.9.83B','accountId':'acct_test',
        'slotLimit':4,'activeCharacterId':'char_dk','createdAt':1,'updatedAt':2,
        'cloud':{'enabled':False,'provider':'local','status':'local-only','lastSyncAt':0},
        'characters':[
            {'schema':'ro_web_character_slot_v1','characterId':'char_dk','slotIndex':0,'createdAt':1,'updatedAt':2,'revision':3,'initialized':True,'summary':{'name':'龍爵測試','gender':'male','jobKey':'dragon_knight','jobName':'盧恩龍爵','baseLevel':275,'jobLevel':60,'currentCity':'prontera','characterAtlas':'dragon_knight_male','portraitSrc':'assets/characters/dragon_knight/male/idle.png','lastPlayedAt':2,'updatedAt':2}},
            {'schema':'ro_web_character_slot_v1','characterId':'char_arch','slotIndex':1,'createdAt':1,'updatedAt':2,'revision':3,'initialized':True,'summary':{'name':'法師測試','gender':'female','jobKey':'arch_mage','jobName':'禁咒魔導士','baseLevel':250,'jobLevel':50,'currentCity':'geffen','characterAtlas':'arch_mage_female','lastPlayedAt':2,'updatedAt':2}}
        ],
        'legacyMigration':None
    }


def bootstrap(page):
    page.set_content(HTML)
    page.add_style_tag(content=CSS)
    page.evaluate('''({key, account}) => {
      const data = new Map([[key, JSON.stringify(account)]]);
      const storage = {
        get length(){ return data.size; }, key(i){ return Array.from(data.keys())[i] ?? null; },
        getItem(k){ return data.has(String(k)) ? data.get(String(k)) : null; },
        setItem(k,v){ data.set(String(k), String(v)); }, removeItem(k){ data.delete(String(k)); }, clear(){ data.clear(); }
      };
      Object.defineProperty(window, 'localStorage', {value:storage, configurable:true});
      Object.defineProperty(window, 'sessionStorage', {value:{getItem(){return null},setItem(){},removeItem(){}}, configurable:true});
      window.confirm = () => true;
    }''', {'key':ACCOUNT_KEY, 'account':seed_account()})
    page.add_script_tag(content=RUNTIME)
    page.evaluate('CharacterSlotsRuntime.renderCharacterSlots()')


def run():
    checks=[]
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        context=browser.new_context()
        transparent_png = bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000000020001e221bc330000000049454e44ae426082')
        context.route('https://roweb.test/**', lambda route: route.fulfill(status=200, body=transparent_png, content_type='image/png'))
        page=context.new_page()
        page.set_viewport_size({'width':1440,'height':900})
        bootstrap(page)
        page.wait_for_selector('.character-slot-card')
        assert page.locator('.character-slot-card').count()==4
        assert page.locator('.character-slot-card.is-occupied').count()==2
        assert page.locator('.character-slot-card.is-empty').count()==2
        checks.append('4 slots render with occupied and empty cards')
        srcs=page.locator('.character-slot-portrait img').evaluate_all('(nodes)=>nodes.map(n=>n.getAttribute("src"))')
        assert 'assets/characters/dragon_knight/male/idle.png?v=0.9.83B' in srcs
        assert 'assets/characters/arch_mage/female/idle.png?v=0.9.83B' in srcs
        checks.append('saved/current job idle portrait paths render')
        bg=page.locator('.character-select-backdrop').evaluate('(n)=>getComputedStyle(n).backgroundImage')
        assert 'character_select_background.webp' in bg
        checks.append('cropped WebP login background style is active')
        assert '普隆德拉' in page.locator('.character-slot-location').nth(0).inner_text()
        assert '吉芬' in page.locator('.character-slot-location').nth(1).inner_text()
        checks.append('location summary renders')
        page.locator('.character-slot-card.is-empty').first.locator('button').click()
        assert page.locator('#characterCreateModal').is_visible()
        checks.append('empty slot opens creation dialog')

        mobile=context.new_page()
        mobile.set_viewport_size({'width':390,'height':844})
        bootstrap(mobile)
        mobile.wait_for_selector('.character-slot-card')
        cols=mobile.locator('.character-slot-grid').evaluate('(n)=>getComputedStyle(n).gridTemplateColumns.split(" ").length')
        assert cols==2
        checks.append('mobile layout uses 2x2 grid')
        browser.close()
    print(json.dumps({'version':'0.9.83B','checks':len(checks),'passed':len(checks),'failed':0,'results':checks},ensure_ascii=False))

if __name__=='__main__':
    run()
