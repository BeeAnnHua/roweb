#!/usr/bin/env python3
from pathlib import Path
import json, subprocess, sys
ROOT=Path(__file__).resolve().parents[1]
commands=[
  'node tools/check_all_js_syntax.js',
  'node tools/test_fm_features_0.9.82FM.js',
  'node tools/test_auto_battle_monster_filter_0.9.82FM.js',
  'node tools/test_aspd_attack_visual_ui_size_0.9.82FM.js',
  'node tools/test_auto_battle_attack_heading_0.9.82FM.js',
  'node tools/test_auto_battle_controller_0.9.82EZ.js',
  'node tools/test_auto_battle_features_0.9.82FA.js',
  'node tools/test_auto_battle_survival_0.9.82FB.js',
  'node tools/test_map_scroll_stability_0.9.82FL.js',
  'node tools/test_super_novice_element_converter_0.9.82FL.js',
  'node tools/test_skill_action_motion_contract_0.9.82EY.js',
  'python tools/test_atlas_geometry_integrity_0.9.82FM.py',
  'python tools/test_binary_asset_integrity_0.9.82FM.py',
]
results=[]
for i,cmd in enumerate(commands,1):
    print(f'[{i}/{len(commands)}] {cmd}')
    proc=subprocess.run(cmd,shell=True,cwd=ROOT,text=True,capture_output=True)
    combined=(proc.stdout+'\n'+proc.stderr).strip()
    results.append({'command':cmd,'status':'PASS' if proc.returncode==0 else 'FAIL','returnCode':proc.returncode,'tail':combined[-5000:]})
    if proc.returncode:
        break
report={'version':'0.9.82FM','status':'PASS' if len(results)==len(commands) and all(r['returnCode']==0 for r in results) else 'FAIL','testCount':len(results),'tests':results}
out=ROOT/'tools/current_runtime_integrity_0.9.82FM.json'
out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'version':report['version'],'status':report['status'],'testCount':report['testCount'],'report':str(out.relative_to(ROOT))},ensure_ascii=False,indent=2))
sys.exit(0 if report['status']=='PASS' else 1)
