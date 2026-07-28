#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path
import sys
import yaml

ROOT = Path(__file__).resolve().parents[1]
RA = Path('/mnt/data/ra_grade_full/rathena-master')
GEN_RULES = ROOT / 'data/enchant_grade_rules.json'
GEN_EXCHANGE = ROOT / 'data/enchant_grade_exchange.json'
SRC_RULES = RA / 'db/re/enchantgrade.yml'
SRC_EXCHANGE = RA / 'npc/re/merchants/barters/enchantgrade.yml'

checks = 0
fails: list[str] = []

def check(cond: bool, label: str):
    global checks
    checks += 1
    if not cond:
        fails.append(label)

with SRC_RULES.open(encoding='utf-8') as f:
    src = yaml.safe_load(f)
with GEN_RULES.open(encoding='utf-8') as f:
    gen = json.load(f)

check(gen.get('version') == '0.9.82GL', 'rules version')
body = src.get('Body') or []
expected_groups = {str(x['Type']): x for x in body}
check(set(gen['groups']) == set(expected_groups), 'group names')

for group_name, group_src in expected_groups.items():
    ggen = gen['groups'][group_name]
    src_levels = {str(x['Level']): x for x in group_src.get('Levels', [])}
    check(set(ggen['levels']) == set(src_levels), f'{group_name} levels')
    for level_key, level_src in src_levels.items():
        lgen = ggen['levels'][level_key]
        check(int(lgen['level']) == int(level_src['Level']), f'{group_name}/{level_key} level')
        src_grades = {str(x['Grade']): x for x in level_src.get('Grades', [])}
        check(set(lgen['grades']) == set(src_grades), f'{group_name}/{level_key} grades')
        for grade_name, grade_src in src_grades.items():
            gg = lgen['grades'][grade_name]
            check(gg['currentGrade'] == grade_name, f'{group_name}/{grade_name} current grade')
            target = {'None':'D','D':'C','C':'B','B':'A'}[grade_name]
            check(gg['targetGrade'] == target, f'{group_name}/{grade_name} target grade')
            expected_chances = {str(int(x['Refine'])): int(x['Chance']) for x in grade_src.get('Chances', [])}
            actual_chances = {str(k): int(v) for k,v in gg.get('chances', {}).items()}
            check(actual_chances == expected_chances, f'{group_name}/{grade_name} chances')
            check(int(gg.get('bonusPercent', 0)) == int(grade_src.get('Bonus', 0)), f'{group_name}/{grade_name} bonus')
            # rAthena Announce is shorthand for both, otherwise success defaults true and fail defaults false.
            if 'Announce' in grade_src:
                exp_success = exp_fail = bool(grade_src['Announce'])
            else:
                exp_success = bool(grade_src.get('AnnounceSuccess', True))
                exp_fail = bool(grade_src.get('AnnounceFail', False))
            check(bool(gg.get('announceSuccess')) == exp_success, f'{group_name}/{grade_name} announce success')
            check(bool(gg.get('announceFail')) == exp_fail, f'{group_name}/{grade_name} announce fail')
            csrc = grade_src.get('Catalyst') or {}
            cg = gg.get('catalyst') or {}
            check(cg.get('itemAegis') == csrc.get('Item'), f'{group_name}/{grade_name} catalyst item')
            check(int(cg.get('amountPerStep',0)) == int(csrc.get('AmountPerStep',0)), f'{group_name}/{grade_name} catalyst amount')
            check(int(cg.get('maximumSteps',0)) == int(csrc.get('MaximumSteps',0)), f'{group_name}/{grade_name} catalyst max')
            check(int(cg.get('chanceIncrease',0)) == int(csrc.get('ChanceIncrease',0)), f'{group_name}/{grade_name} catalyst chance')
            src_opts = {int(x['Option']): x for x in grade_src.get('Options', []) if int(x.get('Amount',1)) != 0}
            gen_opts = {int(x['option']): x for x in gg.get('options', [])}
            check(set(gen_opts) == set(src_opts), f'{group_name}/{grade_name} option indexes')
            for idx, osrc in src_opts.items():
                og = gen_opts[idx]
                check(og.get('materialAegis') == osrc.get('Item'), f'{group_name}/{grade_name}/opt{idx} item')
                check(int(og.get('amount',1)) == int(osrc.get('Amount',1)), f'{group_name}/{grade_name}/opt{idx} amount')
                price = osrc.get('Zeny', osrc.get('Price', 0))
                check(int(og.get('zeny',0)) == int(price), f'{group_name}/{grade_name}/opt{idx} zeny')
                check(int(og.get('breakingRate',0)) == int(osrc.get('BreakingRate',0)), f'{group_name}/{grade_name}/opt{idx} break')
                check(int(og.get('downgradeAmount',0)) == int(osrc.get('DowngradeAmount',0)), f'{group_name}/{grade_name}/opt{idx} downgrade')

with SRC_EXCHANGE.open(encoding='utf-8') as f:
    src_ex = yaml.safe_load(f)
with GEN_EXCHANGE.open(encoding='utf-8') as f:
    gen_ex = json.load(f)
check(gen_ex.get('version') == '0.9.82GL', 'exchange version')
shops = src_ex.get('Body') or []
shop = next(x for x in shops if x.get('Name') == 'EnchantGradeExchange')
sitems = {int(x['Index']): x for x in shop.get('Items', [])}
gitems = {int(x['index']): x for x in gen_ex.get('recipes', [])}
check(set(sitems) == set(gitems), 'exchange recipe indexes')
for idx, s in sitems.items():
    g = gitems[idx]
    check(g.get('outputAegis') == s.get('Item'), f'exchange {idx} output')
    check(int(g.get('outputAmount',1)) == int(s.get('Amount',1)), f'exchange {idx} output amount')
    check(int(g.get('zeny',0)) == int(s.get('Zeny',0)), f'exchange {idx} zeny')
    sr = {int(x['Index']): x for x in s.get('RequiredItems', [])}
    gr_list = g.get('requiredItems', [])
    check(len(gr_list) == len(sr), f'exchange {idx} requirement count')
    for pos, req in enumerate(gr_list):
        sreq = sr[pos]
        check(req.get('itemAegis') == sreq.get('Item'), f'exchange {idx}/req{pos} item')
        check(int(req.get('amount',1)) == int(sreq.get('Amount',1)), f'exchange {idx}/req{pos} amount')

print(f'Enchant Grade RA data audit: {checks-len(fails)}/{checks} PASS')
if fails:
    for f in fails:
        print('FAIL:', f)
    sys.exit(1)
