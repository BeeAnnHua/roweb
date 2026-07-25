#!/usr/bin/env python3
from pathlib import Path
import subprocess, json, sys
ROOT=Path(__file__).resolve().parents[1]
COMMANDS=[
 ['node','tools/check_all_js_syntax.js'],
 ['node','tools/test_skill_timing_action_0.9.82DW.js'],
 ['node','tools/test_player_skill_motion_0.9.82DW.js'],
 ['node','tools/test_runtime_cast_animation_0.9.82DW.js'],
 ['node','tools/test_all_skill_timing_actions_0.9.82DW.js'],
 ['node','tools/test_skill_ui_runtime_classification_0.9.82DW.js'],
 ['node','tools/test_passive_mastery_barrier_death_0.9.82DW.js'],
 ['node','tools/test_active_special_effects_0.9.82DW.js'],
 ['node','tools/test_full_throttle_wind_delay_0.9.82DW.js'],
 ['node','tools/test_dead_motion_hold_0.9.82DW.js'],
 ['python','tools/full_skill_audit.py'],
 ['python','tools/test_all_character_weapons_0.9.82DV.py'],
 ['node','tools/test_packed_character_runtime_0.9.82DV.js'],
 ['node','tools/test_passive_range_and_image_loader_0.9.82DV.js'],
 ['python','tools/build_full_runtime_audit_0.9.82DW.py'],
]
rows=[]
for cmd in COMMANDS:
 cp=subprocess.run(cmd,cwd=ROOT,capture_output=True,text=True)
 rows.append({'command':' '.join(cmd),'status':'PASS' if cp.returncode==0 else 'FAIL','returnCode':cp.returncode,'tail':(cp.stdout+cp.stderr).strip()[-500:]})
 if cp.returncode:
  print(json.dumps({'version':'0.9.82DW','status':'FAIL','tests':rows},ensure_ascii=False,indent=2)); sys.exit(cp.returncode)
print(json.dumps({'version':'0.9.82DW','status':'PASS','testCount':len(rows),'tests':rows},ensure_ascii=False,indent=2))
