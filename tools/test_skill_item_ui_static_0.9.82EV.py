#!/usr/bin/env python3
from pathlib import Path
import json,re
ROOT=Path(__file__).resolve().parents[1]
index=(ROOT/'index.html').read_text(encoding='utf-8')
css=(ROOT/'css/style.css').read_text(encoding='utf-8')
job=(ROOT/'js/job.js').read_text(encoding='utf-8')
item=(ROOT/'js/item_instance_ui.js').read_text(encoding='utf-8')
player=(ROOT/'js/player.js').read_text(encoding='utf-8')
versions=re.findall(r'\?v=([^"\']+)',index)
assert versions and set(versions)=={'0.9.82EV'}, sorted(set(versions))
assert index.index('js/player.js?v=0.9.82EV') < index.index('js/item_instance_ui.js?v=0.9.82EV') < index.index('js/game.js?v=0.9.82EV')
for dom_id in ('item-detail-modal','item-detail-title','item-detail-close','item-detail-body'):
    assert f'id="{dom_id}"' in index, dom_id
for selector in ('.item-detail-modal','.item-detail-socket-grid','.item-detail-socket','#item-detail-close'):
    assert selector in css, selector
assert '142,144,145' in job and 'isAutoGrantedJobQuestSkill' in job
assert 'buildSkillPrerequisiteAutoPlan' in job and '確認配點後才會正式消耗點數' in job
assert 'player.equipmentCards?.[slot]' in item and 'player.socketedCards?.[slot]' in item
assert 'duplicateCardPrefixes' in item and 'cardPostfixIds' in item
assert "return `${refine}${before}${data.name}${after} [${slotCount}]`" in item
assert "setTimeout(() =>" in item and "equipItem(itemData, item)" in item and "unequipItem(displaySlot)" in item
assert 'buildCompactItemName(item, itemData)' in player
client=json.loads((ROOT/'data/client_item_display_data.json').read_text(encoding='utf-8'))
assert client['version']=='0.9.82EV'
assert client['duplicateCardPrefixes']=={'2':'兩倍','3':'三倍','4':'四倍'}
assert len(client['cardPrefixNames'])>=1700
assert len(client['cardInfo'])>=1800
print(json.dumps({'version':'0.9.82EV','status':'PASS','cacheRefs':len(versions),'cardPrefixes':len(client['cardPrefixNames']),'cardDetails':len(client['cardInfo'])},ensure_ascii=False,indent=2))
