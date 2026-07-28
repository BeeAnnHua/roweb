#!/usr/bin/env python3
from pathlib import Path
from PIL import Image
import json,re
R=Path(__file__).resolve().parents[1]
passed=0
def ok(v,msg):
 global passed
 if not v: raise AssertionError(msg)
 passed+=1; print('PASS:',msg)
css=(R/'css/style.css').read_text('utf-8')
grade=(R/'js/enchant_grade_runtime.js').read_text('utf-8')
town=(R/'js/town.js').read_text('utf-8')
html=(R/'index.html').read_text('utf-8')
player=(R/'js/player.js').read_text('utf-8')
cities=json.loads((R/'data/cities.json').read_text('utf-8'))
payon=next(x for x in cities if x['id']=='payon')
ok(payon['background']=='images/maps/backgrounds/payon_bg.webp','Payon uses canonical WebP background')
ok(payon['thumb']=='images/maps/thumbs/payon_small.webp','Payon uses canonical WebP thumbnail')
bg=Image.open(R/payon['background']); th=Image.open(R/payon['thumb'])
ok(bg.size==(1280,720) and bg.format=='WEBP','Payon background is 1280x720 WebP')
ok(th.size==(320,180) and th.format=='WEBP','Payon thumbnail is 320x180 WebP')
ok(not (R/'images/maps/backgrounds/payon_bg_0_9_82GM.webp').exists(),'wrong GM Payon background removed')
ok(not (R/'images/maps/thumbs/payon_small_0_9_82GM.webp').exists(),'wrong GM Payon thumbnail removed')
ok(not (R/'images/maps/backgrounds/mjolnir_chunk_005_bg.webp').exists(),'retired Mjolnir single-chunk background removed')
ok(not (R/'images/maps/thumbs/mjolnir_chunk_005_small.webp').exists(),'retired Mjolnir single-chunk thumbnail removed')
ok('\\n' not in css,'CSS contains no literal backslash-n control text')
ok('.grade-overlay{' in css and 'z-index:1000002!important' in css,'grade overlay has valid fixed high-z CSS')
ok('Essential geometry is applied inline' in grade and 'position:"fixed"' in grade,'grade runtime has inline visibility fallback')
ok('openEnchantGradeNpcWindow' in town,'town grade buttons use direct common opener')
ok('.grade-layout[hidden]' in css and '.grade-exchange-panel[hidden]' in css,'grade and exchange tabs honor hidden state')
ok('border:1px solid #a96f12!important' in css,'inventory slot borders restored')
ok('inventory-grid-wrapper::after' in css and 'scrollbar-color:#c99a42' in css,'inventory scroll rail is always visible')
ok('const INVENTORY_VISIBLE_SLOT_COUNT = 30;' in player,'inventory remains 5x6 / 30 visible slots')
ok('0.9.82GO' in html and '0.9.82GM' not in html,'HTML cache keys updated to GN')
print(json.dumps({'version':'0.9.82GO','passed':passed},ensure_ascii=False))
