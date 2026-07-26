#!/usr/bin/env python3
from pathlib import Path
import subprocess,json,sys
ROOT=Path(__file__).resolve().parents[1]
COMMANDS=[
 ['node','tools/check_all_js_syntax.js'],
 ['node','tools/test_formula_authority_map_cleanup_0.9.82EH.js'],
 ['python','tools/audit_legacy_formula_cleanup_0.9.82EH.py'],
 ['node','tools/test_ra_renewal_timing_combat_0.9.82EA.js'],
 ['node','tools/test_ra_renewal_status_formulas_0.9.82EA.js'],
 ['node','tools/test_trait_stats_0.9.82EE.js'],
 ['node','tools/test_status_advanced_ui_0.9.82EH.js'],
 ['node','tools/test_status_responsive_ui_0.9.82EH.js'],
 ['node','tools/test_roitemsearch_modifier_bridge_0.9.82EH.js'],
 ['python','tools/test_world_regions_0.9.82EH.py'],
 ['node','tools/test_trait_combat_scope_0.9.82EE.js'],
 ['python','tools/audit_ra_trait_skill_formulas_0.9.82EE.py'],
 ['node','tools/test_ra_renewal_damage_order_0.9.82EA.js'],
 ['node','tools/test_ra_renewal_combat_modifier_matrix_0.9.82EA.js'],
 ['node','tools/test_ra_renewal_magic_formula_0.9.82EA.js'],
 ['node','tools/test_ra_renewal_skill_critical_flags_0.9.82EE.js'],
 ['node','tools/test_ra_renewal_special_skill_pipeline_0.9.82EA.js'],
 ['node','tools/test_sec7_performance_floor_0.9.82EA.js'],
 ['node','tools/test_high_speed_skill_scheduler_0.9.82EA.js'],
 ['node','tools/test_all_skill_timing_actions_0.9.82EA.js'],
 ['node','tools/test_skill_distance_scheduler_0.9.82EA.js'],
 ['node','tools/test_all_skill_distance_profiles_0.9.82EA.js'],
 ['node','tools/test_ground_magic_runtime_0.9.82EA.js'],
 ['node','tools/test_storm_gust_live_runtime_0.9.82EA.js'],
 ['node','tools/test_live_ground_skill_matrix_0.9.82EA.js'],
 ['node','tools/test_trick_dead_runtime_0.9.82EA.js'],
 ['python','tools/audit_ra_skill_timing_0.9.82EA.py'],
 ['python','tools/audit_ra_skill_range_0.9.82EA.py'],
 ['python','tools/audit_pending_skill_scope_0.9.82EA.py'],
 ['python','tools/audit_ra_renewal_combat_0.9.82EA.py'],
 ['python','tools/audit_full_combat_ground_runtime_0.9.82EA.py'],
 ['node','tools/test_player_skill_motion_0.9.82DW.js'],
 ['node','tools/test_runtime_cast_animation_0.9.82DW.js'],
 ['node','tools/test_skill_ui_runtime_classification_0.9.82EA.js'],
 ['node','tools/test_passive_mastery_barrier_death_0.9.82DW.js'],
 ['node','tools/test_active_special_effects_0.9.82DW.js'],
 ['node','tools/test_full_throttle_wind_delay_0.9.82DW.js'],
 ['node','tools/test_dead_motion_hold_0.9.82DW.js'],
 ['python','tools/full_skill_audit.py','tools/full_skill_audit_0.9.82EA.json'],
 ['python','tools/test_all_character_weapons_0.9.82DV.py'],
 ['node','tools/test_packed_character_runtime_0.9.82DV.js'],
 ['node','tools/test_passive_range_and_image_loader_0.9.82EA.js'],
 ['python','tools/build_full_runtime_audit_0.9.82EA.py'],
 ['python','tools/build_data_bundle_0.9.82EH.py'],
 ['python','tools/deep_health_check.py','.','--json-output','tools/deep_health_report_0.9.82EH.json'],
]
rows=[]
for cmd in COMMANDS:
 cp=subprocess.run(cmd,cwd=ROOT,capture_output=True,text=True)
 rows.append({'command':' '.join(cmd),'status':'PASS' if cp.returncode==0 else 'FAIL','returnCode':cp.returncode,'tail':(cp.stdout+cp.stderr).strip()[-1200:]})
 if cp.returncode:
  result={'version':'0.9.82EH','status':'FAIL','testCount':len(rows),'tests':rows}
  (ROOT/'tools/current_runtime_integrity_0.9.82EH.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
  print(json.dumps(result,ensure_ascii=False,indent=2));sys.exit(cp.returncode)
result={'version':'0.9.82EH','status':'PASS','testCount':len(rows),'tests':rows}
(ROOT/'tools/current_runtime_integrity_0.9.82EH.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'version':result['version'],'status':result['status'],'testCount':result['testCount']},ensure_ascii=False,indent=2))
