#!/usr/bin/env python3
from __future__ import annotations
import json, pathlib
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
css=(ROOT/'css/style.css').read_text(encoding='utf-8')
html='''<!doctype html><meta charset="utf-8"><style>'''+css+'''</style>
<div id="auto-combat-panel"><label class="auto-inline-setting auto-fixed-fly-setting"><input type="checkbox" id="autoCombatFixedFlyEnabled"> 固定每 <input type="number" id="autoCombatFixedFlySeconds" value="10"> 秒使用蒼蠅翅膀</label><div class="auto-setting-note">固定飛行啟用後，即使正在追怪、攻擊或詠唱，也會到秒直接瞬移。</div></div>
<section id="playerDeathOverlay" class="player-death-overlay"><div class="player-death-dialog"><div class="player-death-emblem">☠</div><h2>角色已死亡</h2><p class="player-death-cause">測試</p><p class="player-death-help">玩家仍可看見倒地角色。</p><div class="player-death-actions"><button class="player-death-action"><span><strong>原地復活</strong><small>測試</small></span><b>持有 1</b></button></div></div></section>'''
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-gpu'])
    page=browser.new_page(viewport={'width':1280,'height':720})
    page.set_content(html,wait_until='load')
    result=page.evaluate('''() => {
      const overlay=getComputedStyle(document.getElementById('playerDeathOverlay'));
      const dialog=getComputedStyle(document.querySelector('.player-death-dialog'));
      const fixed=getComputedStyle(document.querySelector('.auto-fixed-fly-setting'));
      const seconds=getComputedStyle(document.getElementById('autoCombatFixedFlySeconds'));
      return {backdrop:overlay.backdropFilter||overlay.webkitBackdropFilter||'',placeItems:overlay.placeItems,background:overlay.backgroundImage,dialogWidth:dialog.width,dialogBottom:dialog.marginBottom,fixedDisplay:fixed.display,secondsWidth:seconds.width};
    }''')
    browser.close()
checks={
  'death_no_blur':result['backdrop'] in ('none',''),
  'death_bottom_aligned':'end' in result['placeItems'],
  'death_dialog_compact':float(result['dialogWidth'].replace('px',''))<=390.5,
  'death_overlay_translucent':'linear-gradient' in result['background'],
  'fixed_fly_layout':result['fixedDisplay']=='flex',
  'fixed_seconds_width':float(result['secondsWidth'].replace('px',''))<=73,
}
# Production source contracts checked alongside Chromium CSS computation.
auto=(ROOT/'js/auto_battle.js').read_text(encoding='utf-8')
battle=(ROOT/'js/battle.js').read_text(encoding='utf-8')
position=(ROOT/'js/position_engine.js').read_text(encoding='utf-8')
player=(ROOT/'js/player.js').read_text(encoding='utf-8')
checks.update({
  'fixed_fly_runtime_present':'function tryAutoFixedIntervalTeleport()' in auto,
  'global_boss_scan_present':'function findAutoAvoidThreat()' in auto,
  'utility_wake_during_long_cast':'function getAutoBattleUtilityWakeDelayMs' in battle and 'intervalMs - Math.max(0, now - last)' in battle,
  'position_preserves_fixed_settings':'fixedIntervalEnabled: player.autoCombat.teleport?.fixedIntervalEnabled === true' in position,
  'converter_bypasses_generic_runtime':'if (!isPhysicalEndowItem && !isArmorEndowItem)' in player,
})
report={'title':'RO_WEB 0.9.82IC Chromium UI / Runtime Contract','pass':all(checks.values()),'checks':checks,'computedStyles':result}
(ROOT/'TEST_REPORT_0.9.82IC_BROWSER_UI_CONTRACT.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(ROOT/'TEST_REPORT_0.9.82IC_BROWSER_UI_CONTRACT.txt').write_text('\n'.join([report['title'],'='*60,f"Result: {'PASS' if report['pass'] else 'FAIL'}",*[f"{'PASS' if v else 'FAIL'} - {k}" for k,v in checks.items()]])+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
raise SystemExit(0 if report['pass'] else 1)
