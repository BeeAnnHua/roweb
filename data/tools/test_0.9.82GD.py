#!/usr/bin/env python3
from pathlib import Path
from html.parser import HTMLParser
from collections import Counter
import json,re,sys
ROOT=Path(__file__).resolve().parents[1]
checks=[]
def check(ok,name,detail=''):
    checks.append({'ok':bool(ok),'name':name,'detail':str(detail)})
def load(rel): return json.loads((ROOT/rel).read_text(encoding='utf-8-sig'))

index=(ROOT/'index.html').read_text(encoding='utf-8')
css=(ROOT/'css/style.css').read_text(encoding='utf-8')
player=(ROOT/'js/player.js').read_text(encoding='utf-8')
auto=(ROOT/'js/auto_battle.js').read_text(encoding='utf-8')
gacha_js=(ROOT/'js/mvp_gacha_runtime.js').read_text(encoding='utf-8')
loot=(ROOT/'js/loot.js').read_text(encoding='utf-8')
game=(ROOT/'js/game.js').read_text(encoding='utf-8')

check('<title>RO_WEB 0.9.82GD</title>' in index,'index version')
check('const RO_WEB_VERSION = "0.9.82GD"' in game,'game version')
check(set(re.findall(r'\?v=([^"\']+)',index))=={'0.9.82GD'},'cache version consistency')
check('playerGenderLabel' not in index and 'characterGenderToggle' not in index,'HUD gender display and button removed')
check('id="characterGenderModal"' in index,'first-entry/NPC gender modal remains')
check('id="playerIdEditButton"' in index and 'id="playerIdModal"' in index,'black-gold player ID editor exists')
check('sanitizePlayerId' in player and 'getPlayerAnnouncementName' in player and 'confirmPlayerIdChange' in player,'player ID runtime exists')
check('`${currentJobName} ${playerId}`' in player,'character card combines job and player ID')
check('玩家 ${playerName} 取得' in gacha_js,'gacha rare announcement includes player name')
check('announceMvpCardDrop' in loot and 'showRareBanner?.("red"' in loot,'MVP card red announcement hook exists')

class H(HTMLParser):
    def __init__(self): super().__init__(); self.ids=[]
    def handle_starttag(self,tag,attrs):
        d=dict(attrs)
        if 'id' in d:self.ids.append(d['id'])
h=H();h.feed(index)
check(not [x for x,n in Counter(h.ids).items() if n>1],'no duplicate HTML ids')
for id in ['autoCombatCashFoodEnabled','autoCombatCashFoodSelect','autoCombatCashFoodList']:
    check(id in h.ids,f'auto cash-food DOM {id}')
check('cashFood: { enabled: false, itemIds: [] }' in auto,'auto cash-food save schema')
check('function getAutoCashFoodInventoryRows' in auto and 'function tryAutoCashFood' in auto,'auto cash-food detection and maintenance runtime')
check('if (tryAutoCashFood())' in auto,'auto utility loop invokes cash food')
check('#auto-combat-panel .auto-combat-scroll' in css and re.search(r'#auto-combat-panel \.auto-combat-scroll\s*\{[^}]*overflow-y:\s*scroll',css,re.S),'auto panel keeps internal vertical scroll')
check('#auto-combat-panel .auto-cash-food-list' in css and 'max-height:190px' in css,'cash food list has nested height limit')

cfg=load('data/mvp_gacha.json')
rare=sum(int(x.get('chanceBasisPoints',0)) for x in cfg['rareCategories'])
ordinary=sum(int(x.get('weight',0)) for x in cfg['ordinaryRewards'])
check(cfg['version']=='0.9.82GD','gacha config version')
check((rare,ordinary,rare+ordinary)==(121,9879,10000),'gacha mother pool is exactly 100%',f'{rare}+{ordinary}')
expected={6635:500,6240:1500,6241:1500,1000331:500,1000332:500,1000333:500,1000334:500,1000335:500,1000336:500}
actual={int(x['itemId']):int(x['weight']) for x in cfg['ordinaryRewards'] if int(x['itemId']) in expected}
check(actual==expected,'nine refinement rewards have requested exact chances',actual)
check(sum(actual.values())==6500,'refinement items total 65%',sum(actual.values()))
old_ids={14849,14850,14851,14852,14853,14854,14841,14886,12739,23221,23222,23223,23224,23225,23226}
check(sum(int(x['weight']) for x in cfg['ordinaryRewards'] if int(x['itemId']) in old_ids)==3379,'existing foods/recovery items reduced to 33.79%')

manifest=load('data/items/database_manifest.json')
all_items={}
for rel in manifest['allDataPaths']:
    data=load(rel); rows=data.values() if isinstance(data,dict) else data
    for row in rows:
        if isinstance(row,dict) and row.get('id') is not None: all_items[int(row['id'])]=row
for iid,name in [(6635,'鐵匠的祝福'),(6240,'高濃縮神之金屬'),(6241,'高濃縮鋁'),(1000331,'乙太鋁'),(1000332,'乙太神之金屬'),(1000333,'濃縮乙太鋁'),(1000334,'濃縮乙太神之金屬'),(1000335,'高濃縮乙太鋁'),(1000336,'高濃縮乙太神之金屬')]:
    row=all_items.get(iid)
    check(row is not None and row.get('name')==name,f'item {iid} name/data exists',row and row.get('name'))
    check(bool(row and row.get('description')),f'item {iid} has RA/itemInfo description')
    check((ROOT/f'images/items/{iid}.webp').is_file(),f'item {iid} icon exists')
check(len(list((ROOT/'images/items').glob('*.webp')))==805,'pruned item icon folder remains compact (805)',len(list((ROOT/'images/items').glob('*.webp'))))
check((ROOT/'images/items/4001.webp').is_file(),'Poring card uses card icon file 4001')
check(load('data/player_default.json').get('name')=='' and load('data/player_default.json').get('playerIdVersion')==1,'new character default player ID is blank')

cash=load('data/items/cash.json')
food_ids=[14849,14850,14851,14852,14853,14854,14886,23221,23222,23223,23224,23225,23226]
check(all(isinstance(cash[str(i)].get('cashFoodEffect'),dict) for i in food_ids),'all stat foods have cashFoodEffect runtime data')
check(cash['14841'].get('percentHeal')=={'hp':10,'sp':0} and cash['12739'].get('percentHeal')=={'hp':10,'sp':10},'percentage recovery foods have implemented effects')
check(all(cash[str(i)]['cashFoodEffect'].get('extraDurationMs')==600000 for i in [23221,23222,23223,23225,23226]),'five extra biscuit effects are exactly 10 minutes')

bundle=(ROOT/'js/data_bundle.js').read_text(encoding='utf-8')
check('"version":"0.9.82GD"' in bundle and '"1000336"' in bundle,'runtime data bundle rebuilt with GD data')

report={'version':'0.9.82GD','summary':{'checks':len(checks),'passed':sum(x['ok'] for x in checks),'failed':sum(not x['ok'] for x in checks)},'checks':checks}
out=ROOT/'tools/test_report_0.9.82GD.json';out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
sys.exit(1 if report['summary']['failed'] else 0)
