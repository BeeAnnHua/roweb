#!/usr/bin/env python3
from pathlib import Path
import subprocess,json,sys
ROOT=Path(__file__).resolve().parents[1]
COMMANDS=[
 ['node','tools/check_all_js_syntax.js'],
 ['node','tools/test_release_cleanup_town_restore_map_tooltip_0.9.82FH.js'],
 ['node','tools/test_ui_window_quickslot_layout_0.9.82FH.js'],
 ['node','tools/test_default_prontera_start_0.9.82FH.js'],
 ['node','tools/test_auto_battle_controller_0.9.82EZ.js'],
 ['node','tools/test_auto_battle_features_0.9.82FA.js'],
 ['node','tools/test_auto_battle_survival_0.9.82FB.js'],
 ['node','tools/test_auto_battle_attack_heading_0.9.82FH.js'],
 ['node','tools/test_map_spawn_smoothing_0.9.82FH.js'],
 ['node','tools/test_skill_action_motion_contract_0.9.82EY.js'],
 ['node','tools/test_all_skill_timing_actions_0.9.82EA.js'],
 ['node','tools/test_runtime_cast_animation_0.9.82EY.js'],
 ['node','tools/test_skill_ui_runtime_classification_0.9.82EA.js'],
 ['node','tools/test_storm_gust_live_runtime_0.9.82EA.js'],
 ['node','tools/test_map_quest_cast_buff_0.9.82FH.js'],
 ['node','tools/test_packed_character_runtime_0.9.82EY.js'],
 ['python','tools/test_atlas_geometry_integrity_0.9.82EW.py'],
 ['python','tools/test_binary_asset_integrity_0.9.82EW.py'],
]
rows=[]
for idx,cmd in enumerate(COMMANDS,1):
 print(f'[{idx}/{len(COMMANDS)}] {" ".join(cmd)}', flush=True)
 try:
  cp=subprocess.run(cmd,cwd=ROOT,capture_output=True,text=True,timeout=180)
 except subprocess.TimeoutExpired as exc:
  cp=subprocess.CompletedProcess(cmd,124,stdout=exc.stdout or '',stderr=(exc.stderr or '')+'\nTIMEOUT')
 rows.append({'command':' '.join(cmd),'status':'PASS' if cp.returncode==0 else 'FAIL','returnCode':cp.returncode,'tail':(cp.stdout+cp.stderr).strip()[-1800:]})
 if cp.returncode:
  result={'version':'0.9.82FH','status':'FAIL','testCount':len(rows),'tests':rows}
  (ROOT/'tools/current_runtime_integrity_0.9.82FH.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
  print(json.dumps(result,ensure_ascii=False,indent=2));sys.exit(cp.returncode)
result={'version':'0.9.82FH','status':'PASS','testCount':len(rows),'tests':rows}
(ROOT/'tools/current_runtime_integrity_0.9.82FH.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'version':result['version'],'status':result['status'],'testCount':result['testCount']},ensure_ascii=False,indent=2))
