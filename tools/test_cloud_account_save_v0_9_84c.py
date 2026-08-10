from pathlib import Path
import json, re, subprocess, sys
ROOT = Path(__file__).resolve().parents[1]
errors=[]; checks={}
def check(name, cond, detail=''):
    checks[name]={'pass':bool(cond),'detail':str(detail)}
    if not cond: errors.append(f'{name}: {detail}')

index=(ROOT/'index.html').read_text(encoding='utf-8')
account_html=(ROOT/'cloud_account.html').read_text(encoding='utf-8')
account_js=(ROOT/'js/cloud_account.js').read_text(encoding='utf-8')
cloud_js=(ROOT/'js/cloud_save_runtime.js').read_text(encoding='utf-8')
slots_js=(ROOT/'js/character_slots_runtime.js').read_text(encoding='utf-8')
player_js=(ROOT/'js/player.js').read_text(encoding='utf-8')
legacy_html=(ROOT/'cloud_register_test.html').read_text(encoding='utf-8')
summary=json.loads((ROOT/'CURRENT_RELEASE_SUMMARY_V0.9.84C.json').read_text(encoding='utf-8'))

check('release_version_index', 'V0.9.84C' in index)
for f in ['cloud_save_runtime.js','character_slots_runtime.js','player.js','storage_runtime.js','game.js']:
    check('cache_'+f, f'{f}?v=0.9.84C' in index, f)
check('cache_cloud_account.js', 'cloud_account.js?v=0.9.84C' in account_html)
check('account_background_shared', 'images/ui/character_select_background.webp' in account_html)
check('player_ui_hides_supabase_uid', 'Supabase UID' not in account_html)
check('player_ui_hides_role', '>權限<' not in account_html and 'account_role' not in account_html)
check('legacy_register_redirect', 'cloud_account.html?mode=register' in legacy_html)
check('recovery_resend_ui', 'resendRecoveryBtn' in account_html and 'resendRecoveryBtn' in account_js)
check('password_change_current_password', 'current_password:current' in account_js)
check('password_change_ui', 'changePasswordBtn' in account_html and 'changePasswordBtn' in account_js)
check('five_account_limit_ui', '5' in account_js and 'createExtraAccount' in account_js)
check('12_slot_runtime', re.search(r'\b12\b', slots_js) is not None and 'slot_index' in slots_js)
check('slot_move_rpc', 'ro_move_character_to_slot' in cloud_js)
check('cloud_state_event', 'ro-web-cloud-sync-state' in cloud_js and 'ro-web-cloud-sync-state' in slots_js)
for state in ['syncing','synced','pending','conflict','error']:
    check('cloud_state_'+state, state in cloud_js and state in slots_js)
check('remote_verify_function', 'verifyEnvelope' in cloud_js and 'verifyEnvelope' in player_js)
check('manual_remote_verification_state', 'lastManualCloudVerified' in player_js)
check('remote_newer_conflict_guard', 'REMOTE_NEWER' in cloud_js or 'remote-newer' in cloud_js.lower() or '較新的角色進度' in player_js)
check('local_safety_copy_message', '本機' in player_js and 'IndexedDB' in player_js)
check('release_summary_version', summary.get('version') == 'V0.9.84C', summary.get('version'))

# Syntax of changed JS
for rel in ['js/cloud_account.js','js/cloud_save_runtime.js','js/character_slots_runtime.js','js/player.js','js/storage_runtime.js','js/game.js','js/cloud_register_test.js']:
    r=subprocess.run(['node','--check',str(ROOT/rel)],capture_output=True,text=True)
    check('syntax_'+Path(rel).name, r.returncode==0, r.stderr[-800:])

# Ensure literal DOM ids referenced through el("...") exist.
ids=set(re.findall(r'id=["\']([^"\']+)["\']', account_html))
refs=set(re.findall(r'\bel\(["\']([^"\']+)["\']\)', account_js))
# login/register/recovery/accounts are logical panel names used by showPanel(), not element ids.
missing=sorted(refs-ids-{'login','register','recovery','accounts'})
check('account_dom_ids_complete', not missing, missing)

result={
    'version':'0.9.84C',
    'pass':not errors,
    'summary':{'passed':sum(v['pass'] for v in checks.values()), 'total':len(checks)},
    'checks':checks,
    'errors':errors,
}
report=ROOT/'docs/TEST_REPORT_V0.9.84C.json'
report.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
sys.exit(0 if result['pass'] else 1)
