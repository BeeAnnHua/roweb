#!/usr/bin/env python3
from pathlib import Path
import json, mimetypes
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
html=(ROOT/'index.html').read_text(encoding='utf-8')
css=(ROOT/'css/style.css').read_text(encoding='utf-8')
item_js=(ROOT/'js/item_instance_ui.js').read_text(encoding='utf-8')
grade_js=(ROOT/'js/enchant_grade_runtime.js').read_text(encoding='utf-8')
item_start=html.index('<section id="item-detail-modal"')
item_end=html.index('<section id="inventory-decompose-modal"',item_start)
item_fragment=html[item_start:item_end]
grade_start=html.index('<section id="enchantGradeWindow"')
grade_end=html.index('<section id="enchantPlatformWindow"',grade_start)
grade_fragment=html[grade_start:grade_end]

catalog=json.loads((ROOT/'data/dim_glacier_enchant.json').read_text(encoding='utf-8'))
rules=json.loads((ROOT/'data/enchant_grade_rules.json').read_text(encoding='utf-8'))
items=json.loads((ROOT/'data/items/item_index.json').read_text(encoding='utf-8'))
npcs=json.loads((ROOT/'data/npcs.json').read_text(encoding='utf-8'))
weapon_id=int(catalog['targetWeaponIds'][0])
card_id=4001
stones={int(slot):catalog['slots'][slot]['items'][0] for slot in ('4','3','2')}
needed={str(weapon_id):items[str(weapon_id)],str(card_id):items[str(card_id)]}

boot=f'''
var window=globalThis;
var DEFAULT_EQUIPMENT={{weapon:null,shield:null,headTop:null,headMid:null,headLow:null,armor:null,garment:null,shoes:null,accessory1:null,accessory2:null}};
window.RO_WEB_DATA={{
 "data/dim_glacier_enchant.json":{json.dumps(catalog,ensure_ascii=False)},
 "data/enchant_grade_rules.json":{json.dumps(rules,ensure_ascii=False)},
 "data/items/item_index.json":{json.dumps(needed,ensure_ascii=False)}
}};
var player=window.player={{inventory:[],equipment:{{...DEFAULT_EQUIPMENT}},equipmentInstances:{{}},zeny:1000000000}};
function normalizeItemId(v){{if(v&&typeof v==='object')v=v.id??v.itemId??v.officialId;const n=Number(v);return Number.isFinite(n)?n:v;}}
function getItemData(id){{return window.RO_WEB_DATA['data/items/item_index.json'][String(normalizeItemId(id))]||null;}}
function normalizePlayerData(){{}}
function addItem(){{}} function showItemInfo(){{}} function closeItemInfo(){{}} function buildItemTooltip(){{}} function buildEquipmentTooltip(){{}}
function handleInventorySlotClick(){{}} function setEquipmentSlot(){{}} function equipItem(){{}} function moveEquipmentSlotToInventory(){{}}
function fixEquippedItemsInInventoryOnce(){{}} function addItemBackToInventory(){{}} function useItem(){{}}
function getItemTypeText(d){{return d?.category==='weapon'?'武器':(d?.type||'物品');}}
function cleanItemDescriptionLines(d){{return Array.isArray(d?.description)?d.description:[];}}
function stripROColorCodesForCheck(x){{return String(x||'').replace(/\\^[0-9A-Fa-f]{{6}}/g,'');}}
function getItemName(id){{return getItemData(id)?.name||String(id);}}
function canEquipItem(){{return {{ok:true}};}} function unequipItem(){{}}
window.confirm=()=>true;window.alert=()=>true;
window.invalidateCardRuntime=()=>true;window.invalidatePlayerUiRenderCaches=()=>true;window.syncEquipmentGrantedSkills=()=>true;
window.recalculatePlayerStats=()=>true;window.updateInventoryUI=()=>true;window.updateEquipmentUI=()=>true;window.updatePlayerUI=()=>true;window.updateStatusUI=()=>true;window.updateQuickSlotUI=()=>true;window.saveGame=()=>true;
window.addBattleLog=()=>true;window.bringWindowToFront=()=>true;window.ensureWindowSizeControl=()=>true;
window.__dialog=null;window.ROGoldUI={{alert:(text,options)=>{{window.__dialog={{text,options}};return Promise.resolve(true);}}}};
window.__stoneInfo=null;window.openEnchantStoneInfo=(info,label)=>{{window.__stoneInfo={{info,label}};}};
'''
page_html=f'''<!doctype html><html><head><meta charset="utf-8"><base href="http://assets.local/"><style>html,body{{margin:0;width:100%;height:100%;background:#101820}}{css}</style></head><body>{item_fragment}{grade_fragment}<script>{boot}</script><script>{item_js}</script><script>{grade_js}</script></body></html>'''

checks=[]; errors=[]
def check(name,ok,detail=None): checks.append({'name':name,'pass':bool(ok),'detail':detail})

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1280,'height':720})
    def route_handler(route):
        rel=route.request.url.split('http://assets.local/',1)[-1].split('?',1)[0]
        f=ROOT/rel
        if f.is_file(): route.fulfill(status=200,body=f.read_bytes(),content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream')
        else: route.fulfill(status=404,body=b'')
    page.route('http://assets.local/**',route_handler)
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.on('console',lambda m: errors.append(m.text) if m.type=='error' else None)
    page.set_content(page_html,wait_until='load')

    grade=page.evaluate('''() => {
      const overlay=document.getElementById('enchantGradeWindow');overlay.hidden=false;overlay.classList.remove('hidden-window');
      document.getElementById('enchantGradeHelpButton').click();
      const b=document.getElementById('enchantGradeHelpButton').getBoundingClientRect();
      return {dialog:window.__dialog,buttonText:document.getElementById('enchantGradeHelpButton').textContent,buttonWidth:b.width,help:EnchantGradeRuntime.buildGradeHelpText()};
    }''')
    help_text=grade['help']
    check('grade header has visible 詳細 button',grade['buttonText'].strip()=='詳細' and grade['buttonWidth']>=50,grade)
    check('詳細 button opens player help dialog',grade['dialog'] and grade['dialog']['options']['title']=='裝備升階詳細',grade['dialog'])
    expected=[
      '無階 → D：+9 10%、+10 20%、+11～+15 70%、+16～+20 80%',
      'D → C：+10 20%、+11～+15 60%、+16～+20 70%',
      'C → B：+11～+15 50%、+16～+20 60%',
      'B → A：+11～+15 40%、+16～+20 50%',
      '成功後：階級提升一級，精煉值重置為 +0',
      '安全升階：消耗較多材料；失敗時裝備完整保留'
    ]
    for text in expected: check(f'grade help includes {text}',text in help_text,help_text)

    setup=page.evaluate(f'''() => {{
      const base=getItemData({weapon_id});
      const s4=RO_WEB_DATA['data/dim_glacier_enchant.json'].slots['4'].items[0];
      const s3=RO_WEB_DATA['data/dim_glacier_enchant.json'].slots['3'].items[0];
      const s2=RO_WEB_DATA['data/dim_glacier_enchant.json'].slots['2'].items[0];
      const w={{id:{weapon_id},itemId:{weapon_id},name:base.name,count:1,instanceId:'hj-display',refine:13,enchantGrade:4,cards:[{card_id},null,null,null],enchants:[
        {{id:s4.id,optionId:s4.id,name:s4.name,effect:s4.effect,slot:4,playerSlot:4}},
        {{id:s3.id,optionId:s3.id,name:s3.name,effect:s3.effect,slot:3,playerSlot:3}},
        {{id:s2.id,optionId:s2.id,name:s2.name,effect:s2.effect,slot:2,playerSlot:2}}
      ]}};
      player.inventory=[w];
      const tooltip=buildEquipmentHoverTooltip(w,base);
      showItemDetail(w,{{source:'inventory',inventoryItem:w}});
      return {{tooltip,title:document.getElementById('item-detail-title').textContent,body:document.getElementById('item-detail-body').innerText,flowCount:document.querySelectorAll('.item-detail-dim-glacier-flow').length,descHeight:getComputedStyle(document.querySelector('.item-detail-description')).maxHeight,slots:[...document.querySelectorAll('.item-detail-dim-slot')].map(x=>x.innerText)}};
    }}''')
    lines=setup['tooltip'].split('\n')
    check('hover first line is concise +refine [grade] weapon [slot]',lines[0].startswith('+13 [A] ') and lines[0].endswith('[1]'),lines)
    check('hover lists card name',any(line.startswith('卡片：') and items[str(card_id)]['name'] in line for line in lines),lines)
    for slot,stone in stones.items():
        check(f'hover lists slot {slot} enchant name',any(line=='附魔：'+stone['name'] for line in lines),lines)
    check('item detail removes cave-use/order prose',setup['flowCount']==0 and '洞位用途' not in setup['body'] and '第4洞 → 第3洞 → 第2洞進行' not in setup['body'],setup)
    check('item detail keeps four explicit socket cards',all(any(label in row for row in setup['slots']) for label in ['第1洞｜卡片','第4洞｜附魔','第2洞｜附魔','第3洞｜附魔']),setup['slots'])
    check('Dim Glacier description receives enlarged space',setup['descHeight'] not in ('none','0px'),setup['descHeight'])

    npc_by={x['id']:x for x in npcs}
    for nid in ('payon_refine_npc','payon_enchant_grade_npc','payon_enchant_platform_npc','payon_enchant_material_exchange_npc'):
        text=npc_by[nid]['description']
        check(f'{nid} description is player-facing',not any(term in text for term in ('rAthena','Runtime','本版','預覽','開發','測試')),text)
    static_player_text=[
      '選取裝備後會顯示成功率、費用、失敗結果與可使用的保護材料。',
      '選擇武器後，可進行附魔、升級第二洞效果或重置附魔。',
      '可查看全部兌換配方，備妥材料後即可製作所需道具。'
    ]
    for text in static_player_text: check(f'player UI contains {text}',text in html,text)

    out=ROOT/'docs/previews'; out.mkdir(parents=True,exist_ok=True)
    page.screenshot(path=str(out/'PLAYER_GRADE_ITEM_INFO_0.9.82HJ_desktop.png'),full_page=False)
    mobile=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    mobile.route('http://assets.local/**',route_handler)
    mobile.set_content(page_html,wait_until='load')
    mobile_result=mobile.evaluate(f'''() => {{
      const base=getItemData({weapon_id}),s4=RO_WEB_DATA['data/dim_glacier_enchant.json'].slots['4'].items[0];
      const w={{id:{weapon_id},itemId:{weapon_id},instanceId:'hj-mobile',refine:13,enchantGrade:4,cards:[{card_id}],enchants:[{{id:s4.id,name:s4.name,effect:s4.effect,slot:4}}]}};
      showItemDetail(w,{{source:'inventory',inventoryItem:w}});
      return {{overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,flowCount:document.querySelectorAll('.item-detail-dim-glacier-flow').length,title:document.getElementById('item-detail-title').textContent}};
    }}''')
    check('mobile detail has no horizontal overflow',mobile_result['overflow']<=1,mobile_result)
    check('mobile detail also omits flow prose',mobile_result['flowCount']==0,mobile_result)
    mobile.screenshot(path=str(out/'PLAYER_GRADE_ITEM_INFO_0.9.82HJ_mobile.png'),full_page=False)
    browser.close()

check('no browser runtime errors',not errors,errors)
failed=[x for x in checks if not x['pass']]
report={'version':'0.9.82HJ','checks':checks,'passed':len(checks)-len(failed),'failed':len(failed),'errors':errors}
(ROOT/'tools/test_hj_player_formal_ui_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'passed':report['passed'],'failed':report['failed'],'failedChecks':failed,'errors':errors},ensure_ascii=False,indent=2))
raise SystemExit(1 if failed else 0)
