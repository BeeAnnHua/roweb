from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path('/mnt/data/ro_hf_work')
css = (root / 'css/style.css').read_text(encoding='utf-8')
rows = ''.join(
    f'<button type="button" class="map-monster-distribution-row"><span>MVP 怪物 {i:02d}</span><em class="map-monster-state is-alive">存在中</em></button>'
    for i in range(1, 52)
)
html = f'''<!doctype html><html><head><meta charset="utf-8"><style>{css}</style></head>
<body class="ro-black-gold-theme" style="margin:0;background:#1b2412;min-height:100vh">
<div id="map-monster-distribution-tooltip" class="map-monster-distribution-tooltip" style="left:56px;top:48px">
  <div class="map-monster-distribution-header"><span class="map-monster-distribution-heading"><b>葛坡尼亞 MVP 試煉場</b><small class="map-monster-level">建議等級 MVP／轉蛋測試</small></span><span class="map-monster-header-action"></span></div>
  <div class="map-monster-distribution-list"><section class="map-monster-distribution-section"><h4><span>🏆</span>MVP</h4>{rows}</section></div>
  <section class="map-monster-drop-detail" hidden></section>
</div></body></html>'''

out = root / 'docs/previews'
out.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    desktop = browser.new_page(viewport={"width":1280,"height":720})
    desktop.set_content(html, wait_until='load')
    desktop.wait_for_timeout(100)
    result = desktop.evaluate('''() => {
      const tip=document.querySelector('.map-monster-distribution-tooltip');
      const header=document.querySelector('.map-monster-distribution-header');
      const h4=document.querySelector('.map-monster-distribution-section h4');
      const tr=tip.getBoundingClientRect(), hr=header.getBoundingClientRect(), h4r=h4.getBoundingClientRect();
      return {
        tooltipHeight: tr.height,
        clientHeight: tip.clientHeight,
        scrollHeight: tip.scrollHeight,
        overflowY: getComputedStyle(tip).overflowY,
        headerBottom: hr.bottom,
        firstHeadingTop: h4r.top,
        headingGap: h4r.top-hr.bottom,
        maxHeight: getComputedStyle(tip).maxHeight
      };
    }''')
    assert result['tooltipHeight'] <= 405, result
    assert result['scrollHeight'] > result['clientHeight'], result
    assert result['overflowY'] == 'auto', result
    assert result['headingGap'] >= 8, result
    desktop.screenshot(path=str(out/'MAP_MVP_ROSTER_0.9.82HF_desktop.png'), full_page=True)

    mobile = browser.new_page(viewport={"width":390,"height":844}, has_touch=True, is_mobile=True)
    mobile.set_content(html, wait_until='load')
    mobile.wait_for_timeout(100)
    mobile_result = mobile.evaluate('''() => {
      const tip=document.querySelector('.map-monster-distribution-tooltip');
      return {maxHeight:getComputedStyle(tip).maxHeight,width:tip.getBoundingClientRect().width};
    }''')
    # HF desktop-only override must not force the 56dvh/470px rule onto touch.
    assert mobile_result['maxHeight'] != '470px', mobile_result
    browser.close()

print('desktop', result)
print('mobile', mobile_result)
print('PASS')
