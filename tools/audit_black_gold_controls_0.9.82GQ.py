#!/usr/bin/env python3
from pathlib import Path
import json,re
ROOT=Path(__file__).resolve().parents[1]
index=(ROOT/'index.html').read_text(encoding='utf-8')
js_files=list((ROOT/'js').glob('*.js'))
texts={p.name:p.read_text(encoding='utf-8') for p in js_files}
all_js='\n'.join(texts.values())
button_markup=len(re.findall(r'<button\b',index,re.I))+sum(len(re.findall(r'<button\b',t,re.I)) for t in texts.values())
button_factories=sum(len(re.findall(r'createElement\(["\']button["\']\)',t)) for t in texts.values())
number_markup=len(re.findall(r'type=["\']number["\']',index,re.I))+sum(len(re.findall(r'type=["\']number["\']',t,re.I)) for t in texts.values())
number_factories=sum(len(re.findall(r'\.type\s*=\s*["\']number["\']',t)) for t in texts.values())
native_dialogs=[]
for name,t in texts.items():
    if name=='ui_theme_runtime.js': continue
    for m in re.finditer(r'(?<![\w.])(confirm|alert|prompt)\s*\(',t): native_dialogs.append({'file':name,'kind':m.group(1),'offset':m.start()})
    for m in re.finditer(r'window\.(confirm|alert|prompt)\s*\(',t): native_dialogs.append({'file':name,'kind':'window.'+m.group(1),'offset':m.start()})
theme=texts['ui_theme_runtime.js']
result={
  'version':'0.9.82GQ',
  'buttonMarkupFactories':button_markup,
  'buttonCreateElementFactories':button_factories,
  'numberMarkupSources':number_markup,
  'numberCreateElementSources':number_factories,
  'nativeDialogCalls':native_dialogs,
  'blackGoldMutationObserver':('new MutationObserver' in theme or '.observe(' in theme),
  'blackGoldBackgroundPolling':('backgroundPolling: true' in theme),
  'staticCssTheme': 'body.ro-black-gold-theme button:not(:is(' in (ROOT/'css/style.css').read_text(encoding='utf-8'),
  'explicitGradeStepper':'data-ro-gold-stepper' in index,
  'explicitStorageStepper':'enhanceNumberInput?.(qty,{force:true})' in texts['storage_runtime.js'],
  'autoCombatOwnStepper':'input.dataset.roNumberOwner = "auto-combat"' in texts['auto_battle.js'],
  'status':'PASS'
}
if native_dialogs or result['blackGoldMutationObserver'] or result['blackGoldBackgroundPolling'] or not result['staticCssTheme']:
  result['status']='FAIL'
(ROOT/'BLACK_GOLD_AUDIT_0.9.82GQ.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
raise SystemExit(0 if result['status']=='PASS' else 1)
