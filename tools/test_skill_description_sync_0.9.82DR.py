#!/usr/bin/env python3
from __future__ import annotations
import json, pathlib, re, sys

VERSION='0.9.82DR'
ROOT=pathlib.Path(__file__).resolve().parents[1]
MADO_IDS={2255,2256,2257,2258,2259,2260,2261,2262,2263,2264,2265,2266,2267,2268,2269,2270,2271,2272,2273,2274,2275,6002,6003,6508}
FORBIDDEN=[
    r'Runtime',r'metadata',r'Self Buff',r'consumed_resource',r'nonDispellable',r'blocksMagicSkills',r'climaxSupported',
    r'ignoreWeaponSizePenalty',r'maximizeWeaponDamage',r'reflectPhysicalRate',r'longRangeDamageReductionRate',r'moveSpeedPenaltyRate',
    r'masteryAtkFlat',r'parryChance',r'hitRate',r'autoGuardKnockback',r'sonicBlowDamageRate',r'sonicBlowHitRateMultiplier',
    r'enchantBladeLevel',r'nextPhysicalAttackRate',r'magicEvasionRate',r'armorElement',r'statusResistanceRate',r'cartBoost',
    r'finalDamageReductionRate',r'statusImmune',r'shieldBarrierRate',r'holyDamageRate',r'researchReport',r'oneHandMace',r'twoHandMace',
    r'1hsword',r'1hAxe',r'2hAxe',r'weapon物理',r'無物理傷害',r'可解除的\s+可解除',r'AP\s*與\s*目前',
    r'待後續',r'尚未完成',r'成本延後',r'TODO',r'GroundEffectManager',r'SkillInfoz',r'\bTrue\b',r'\bDuration2\b',r'\bHitCount\b',
    r'需求元資料',r'等待精靈系統',r'供後續',r'尚未統一',r'統一成本系統',r'統一扣費系統',r'統一冷卻系統',
    r'職業技能補完後',r'現階段',r'尚未提供',r'戰鬥效果將',r'此版本先完成',r'初版',r'暫不',r'目前不',
    r'依使用者決議',r'製作系統完成後',r'若未來',r'共用攔截入口',r'供怪物主動技能 AI 使用',r'依官方技能樹加入'
]
GATE_KEYS={'requiresMounted','requiresMado','requiredMountType','requiredState','madoRequired','requiresMadoGear'}

def load(rel): return json.loads((ROOT/rel).read_text(encoding='utf-8-sig'))

def has_gate(x):
    if isinstance(x,dict):
        for k,v in x.items():
            if k in GATE_KEYS and v not in (None,False,'',[],{}): return True,k,v
            found=has_gate(v)
            if found:return found
    elif isinstance(x,list):
        for v in x:
            found=has_gate(v)
            if found:return found
    return None

manifest=load('data/skill_manifest.json')
skills={}
for rel in manifest['cores']:
    pack=load(rel)
    for sid,row in pack['skills'].items(): skills[int(sid)]=row
runtime={int(k):v for k,v in load('data/skill_runtime/runtime_core_1_v1.json')['skills'].items()}
pending={int(x['skillId']) for x in load('data/skill_runtime/runtime_pending_review.json')['skills']}
errors=[]
if len(skills)!=1139: errors.append(f'技能總數應為 1139，實際 {len(skills)}')
if len(runtime)!=827: errors.append(f'正式實裝技能應為 827，實際 {len(runtime)}')
if len(pending)!=312: errors.append(f'Pending 技能應為 312，實際 {len(pending)}')
if set(runtime)&pending: errors.append('正式實裝與 Pending 技能集合重疊')
if set(runtime)|pending!=set(skills): errors.append('正式實裝＋Pending 未完整覆蓋技能核心')

for sid in sorted(runtime):
    row=skills.get(sid,{})
    desc=str(row.get('description') or '').strip()
    official=str(row.get('officialDescription') or '').strip()
    if not desc: errors.append(f'{sid} {row.get("name")}: description 空白')
    if desc!=official: errors.append(f'{sid} {row.get("name")}: description 與 officialDescription 不一致')
    for pat in FORBIDDEN:
        if re.search(pat,desc,re.I): errors.append(f'{sid} {row.get("name")}: 玩家敘述包含開發／內部文字 {pat}')

# Warg Rider: passive move speed only, no attack/mount/job-change behavior.
warg=runtime[2241].get('runtimeProfile') or runtime[2241]
if warg.get('handler')!='passive': errors.append('2241 騎狼術不是 passive handler')
if warg.get('passiveBonuses',{}).get('moveSpeedRate')!=[10,20,30]: errors.append('2241 騎狼術移速不是 [10,20,30]')
warg_text=json.dumps(warg,ensure_ascii=False)
for token in ('atkRate','matkRate','attack','mountState','requiresMounted','jobChange'):
    if token in warg_text: errors.append(f'2241 騎狼術包含不應存在欄位／語意：{token}')

# Mado family remains directly usable and uses normal character animation.
for sid in sorted(MADO_IDS):
    if sid not in runtime: errors.append(f'機甲技能 {sid} 不在正式 Runtime'); continue
    row=runtime[sid]; gate=has_gate(row)
    if gate: errors.append(f'機甲技能 {sid} 出現狀態限制 {gate}')
    desc=str(skills[sid].get('description') or '')
    if re.search(r'需要.*魔導機甲|必須.*機甲|未.*機甲.*不能',desc): errors.append(f'機甲技能 {sid} 敘述誤寫為需要機甲狀態')

result={
    'version':VERSION,
    'summary':{'status':'PASS' if not errors else 'FAIL','errors':len(errors)},
    'implementedSkills':len(runtime),'pendingSkillsExcluded':len(pending),
    'blankDescriptions':sum(1 for sid in runtime if not str(skills[sid].get('description') or '').strip()),
    'descriptionMismatches':sum(1 for sid in runtime if str(skills[sid].get('description') or '').strip()!=str(skills[sid].get('officialDescription') or '').strip()),
    'wargRiderMoveSpeedRate':warg.get('passiveBonuses',{}).get('moveSpeedRate'),
    'madoSkillsChecked':len(MADO_IDS),'errors':errors
}
print(json.dumps(result,ensure_ascii=False,indent=2))
raise SystemExit(0 if not errors else 1)
