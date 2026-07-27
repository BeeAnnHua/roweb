#!/usr/bin/env python3
from pathlib import Path
from PIL import Image,ImageChops,ImageStat
import json,re,hashlib
R=Path(__file__).resolve().parents[1]; passed=0
def ok(v,msg):
 global passed
 if not v: raise AssertionError(msg)
 passed+=1; print('PASS:',msg)
html=(R/'index.html').read_text('utf-8');css=(R/'css/style.css').read_text('utf-8');town=(R/'js/town.js').read_text('utf-8');grade=(R/'js/enchant_grade_runtime.js').read_text('utf-8');status=(R/'js/status_system.js').read_text('utf-8');player=(R/'js/player.js').read_text('utf-8')
ok('const INVENTORY_VISIBLE_SLOT_COUNT = 30;' in player,'inventory generates 30 visible slots')
ok('height:253px!important' in css and 'grid-template-columns:repeat(5,44px)!important' in css and 'button.inventory-slot:nth-child(n)' in css,'inventory list is authoritative 5x6 geometry')
ok('height:414px!important' in css,'inventory outer window grows with six rows')
ok(html.count("data-storage-category=\"item\"")==1,'storage has one item category tab')
ok('openEnchantGradeNpcWindow' in town,'town uses explicit grade runtime opener')
ok('openExchange' in grade and 'showGradeOverlay' in grade,'grade runtime exposes robust grade and exchange openers')
ok('目前沒有可升階的五級武器或二級防具' in grade,'no-equipment grade window renders empty state')
ok('},100);' in status,'status allocation save debounce is 100ms')
cities=json.loads((R/'data/cities.json').read_text('utf-8'));payon=next(x for x in cities if x['id']=='payon');geffen=next(x for x in cities if x['id']=='geffen')
ok(payon['background']!=geffen['background'],'Payon and Geffen use different background paths')
p=R/payon['background'];g=R/geffen['background'];ok(p.is_file() and g.is_file(),'both city backgrounds exist')
ok(hashlib.sha256(p.read_bytes()).digest()!=hashlib.sha256(g.read_bytes()).digest(),'Payon and Geffen background bytes differ')
pi=Image.open(p).convert('RGB').resize((64,36));gi=Image.open(g).convert('RGB').resize((64,36));diff=ImageStat.Stat(ImageChops.difference(pi,gi)).mean
ok(sum(diff)>30,'Payon and Geffen backgrounds are visually distinct')
ok('townBackground=backgroundUrl' in town and 'city=${encodeURIComponent(cityId)}' in town,'town background cache is isolated by city id')
ok('0.9.82GN' in html and '0.9.82GM' not in html,'HTML cache version updated')
print(json.dumps({'version':'0.9.82GN','passed':passed},ensure_ascii=False))
