#!/usr/bin/env python3
from pathlib import Path
import json, re, sys
ROOT=Path(__file__).resolve().parents[1]
html=(ROOT/'index.html').read_text(encoding='utf-8')
player=(ROOT/'js/player.js').read_text(encoding='utf-8')
itemui=(ROOT/'js/item_instance_ui.js').read_text(encoding='utf-8')
css=(ROOT/'css/style.css').read_text(encoding='utf-8')
checks=[]
def check(name, ok, detail=''):
    checks.append({'name':name,'ok':bool(ok),'detail':detail})
check('bulk button opens confirm dialog', 'openInventoryDecomposeDialog({ mode:"bulk"' in player)
check('quantity input exists', 'id="inventory-decompose-amount"' in html)
check('confirm and cancel buttons exist', all(x in html for x in ['id="inventory-decompose-confirm"','id="inventory-decompose-cancel"']))
check('item detail decompose button exists', 'id="item-detail-decompose-action"' in html)
check('equipment keeps primary wear action', "primary.textContent = '穿戴'" in itemui)
check('item detail configures decompose action', 'configureItemDecomposeAction(data, instance, context)' in itemui)
check('equipped gear requires unequip first', "context.source === 'equipment'" in itemui and '請先卸下裝備' in itemui)
check('locked and protected items disabled', 'isInventoryItemDecomposeEligible' in itemui and 'decompose.disabled = !eligible' in itemui)
check('MVP gacha excluded', 'itemData.manualUseOnly === true' in player and 'mvp_gacha' in player)
check('single rebuild and single save design', 'const nextInventory = []' in player and player.count('const saved = saveGame();')>=1)
check('3000 to 2900 safety note', '3,000 個並輸入 100' in player and '2,900 個' in player)
check('item and confirm modal CSS exists', '.item-detail-decompose-action' in css and '.inventory-decompose-modal' in css)
check('cache version is GU only', set(re.findall(r'[?&]v=([^&"\']+)',html))=={'0.9.82GU'}, str(sorted(set(re.findall(r'[?&]v=([^&"\']+)',html)))))
failed=[x for x in checks if not x['ok']]
report={'version':'0.9.82GU','checks':checks,'passed':len(checks)-len(failed),'failed':len(failed)}
(ROOT/'tools/test_inventory_decompose_ui_report_0.9.82GU.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
sys.exit(1 if failed else 0)
