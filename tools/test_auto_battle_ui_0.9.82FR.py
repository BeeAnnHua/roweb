from pathlib import Path
from collections import Counter
from bs4 import BeautifulSoup

root = Path(__file__).resolve().parents[1]
html = (root / 'index.html').read_text(encoding='utf-8')
css = (root / 'css/style.css').read_text(encoding='utf-8')
soup = BeautifulSoup(html, 'html.parser')
checks = []

def check(label, ok):
    checks.append((label, bool(ok)))
    print(('PASS' if ok else 'FAIL') + ' - ' + label)

check('version/cache is FR', '0.9.82FR' in html and '0.9.82FQ' not in html)
quick = soup.select_one('#quick-buttons')
buttons = quick.find_all('button', recursive=False) if quick else []
check('right-top has exactly 10 direct buttons', len(buttons) == 10)
quick_toggle = soup.select_one('#autoBattleQuickToggle.auto-battle-quick-toggle')
check('quick auto battle toggle exists once', quick_toggle is not None and len(soup.select('#autoBattleQuickToggle')) == 1)
check('quick toggle initial label is compact', quick_toggle and quick_toggle.get_text(strip=True) == '掛機')

panel = soup.select_one('#auto-combat-panel')
body = panel.select_one(':scope > .auto-combat-body') if panel else None
scroll = body.select_one(':scope > .auto-combat-scroll') if body else None
footer = body.select_one(':scope > .auto-combat-footer') if body else None
check('panel has fixed body shell', body is not None)
check('body has one direct scroll area', scroll is not None and len(body.select(':scope > .auto-combat-scroll')) == 1)
check('body has one direct fixed footer', footer is not None and len(body.select(':scope > .auto-combat-footer')) == 1)
save = soup.select_one('#autoCombatSaveSettings')
check('save button lives in footer only', save is not None and save.find_parent(class_='auto-combat-footer') is footer and save.find_parent(class_='auto-combat-scroll') is None)
check('all battle controls live in scroll area', scroll is not None and scroll.select_one('#autoBattleStart') and scroll.select_one('#autoCombatBuffList'))

filter_box = scroll.select_one('details.auto-monster-filter-box') if scroll else None
check('monster filter is collapsible details', filter_box is not None)
check('monster filter starts collapsed', filter_box is not None and not filter_box.has_attr('open'))
check('monster filter summary and content exist', filter_box is not None and filter_box.select_one(':scope > summary.auto-monster-filter-toggle') and filter_box.select_one(':scope > .auto-monster-filter-content'))

ids = [tag.get('id') for tag in soup.find_all(attrs={'id': True})]
dupes = [key for key, count in Counter(ids).items() if count > 1]
check('HTML ids remain unique', not dupes)

fr_pos = css.rfind('RO_WEB 0.9.82FR')
fq_pos = css.rfind('RO_WEB 0.9.82FQ')
check('FR final overrides come after FQ', fr_pos > fq_pos >= 0)
fr = css[fr_pos:]
check('central area restores vertical scroll', '#auto-combat-panel .auto-combat-scroll' in fr and 'overflow-y: scroll !important' in fr)
check('footer is non-scrolling', '#auto-combat-panel .auto-combat-footer' in fr and 'flex: 0 0 auto !important' in fr)
check('quick rows are fixed height', 'grid-auto-rows: 34px !important' in fr and 'white-space: nowrap !important' in fr)
check('active glow stays inside button', 'inset: 0 !important' in fr and 'overflow: hidden !important' in fr and 'ro-web-auto-battle-fr-ring' in fr)

failed = [label for label, ok in checks if not ok]
print(f'Auto Battle UI 0.9.82FR: {len(checks)-len(failed)}/{len(checks)} PASS')
if failed:
    raise SystemExit('Failed: ' + ', '.join(failed))
