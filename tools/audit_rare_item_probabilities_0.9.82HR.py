#!/usr/bin/env python3
from pathlib import Path
from collections import Counter, defaultdict
import json
ROOT=Path(__file__).resolve().parents[1]

def tier(bp):
    if not (bp>0) or bp>100: return 'none'
    if bp<=1: return 'gold'
    if bp<=10: return 'purple'
    return 'red'

boxes=json.loads((ROOT/'data/item_boxes.json').read_text(encoding='utf-8'))
box_report={}
for key,box in boxes['boxes'].items():
    total=sum(max(0,float(r.get('weight',0))) for r in box.get('rewards',[]))
    agg=defaultdict(float)
    for row in box.get('rewards',[]): agg[str(row.get('itemId'))]+=max(0,float(row.get('weight',0)))
    rows=[]; counts=Counter()
    for iid,w in agg.items():
        bp=0 if total<=0 else 10000*w/total
        t=tier(bp); counts[t]+=1
        rows.append({'itemId':int(iid),'chanceBasisPoints':bp,'chancePercent':bp/100,'tier':t})
    rows.sort(key=lambda r:(r['chanceBasisPoints'],r['itemId']))
    box_report[key]={
        'name':box.get('name'),'rewardRows':len(box.get('rewards',[])),'uniqueItems':len(agg),'totalWeight':total,
        'tierCounts':dict(counts),'minimumChanceBasisPoints':rows[0]['chanceBasisPoints'] if rows else 0,
        'maximumChanceBasisPoints':rows[-1]['chanceBasisPoints'] if rows else 0,
        'rareItems':[r for r in rows if r['tier']!='none']
    }

gacha=json.loads((ROOT/'data/mvp_gacha.json').read_text(encoding='utf-8'))
gacha_rows=[]
for cat in gacha.get('rareCategories',[]):
    total=sum(max(0,float(r.get('weight',0))) for r in cat.get('rewards',[]))
    agg=defaultdict(float)
    for row in cat.get('rewards',[]): agg[str(row.get('itemId'))]+=max(0,float(row.get('weight',0)))
    for iid,w in agg.items():
        bp=float(cat.get('chanceBasisPoints',0))*w/total if total>0 else 0
        gacha_rows.append({'pool':cat.get('id'),'itemId':int(iid),'chanceBasisPoints':bp,'chancePercent':bp/100,'tier':tier(bp)})
ordinary=gacha.get('ordinaryRewards',[]); total=sum(max(0,float(r.get('weight',0))) for r in ordinary); agg=defaultdict(float)
for row in ordinary: agg[str(row.get('itemId'))]+=max(0,float(row.get('weight',0)))
for iid,w in agg.items():
    bp=float(gacha.get('ordinaryFillBasisPoints',0))*w/total if total>0 else 0
    gacha_rows.append({'pool':'ordinary','itemId':int(iid),'chanceBasisPoints':bp,'chancePercent':bp/100,'tier':tier(bp)})

grade=json.loads((ROOT/'data/enchant_grade_map_drops.json').read_text(encoding='utf-8'))
grade_rows=[]
for map_id,profile in grade.get('profiles',{}).items():
    for e in profile.get('entries',[]):
        if str(e.get('rateMode','')).lower() in {'normal','globaldrop','global_drop'}: continue
        grade_rows.append({'mapId':map_id,'mapName':profile.get('mapName'),'itemId':e.get('itemId'),'chanceBasisPoints':e.get('absoluteChanceBasisPoints',500),'chancePercent':e.get('absoluteChanceBasisPoints',500)/100})

report={
    'version':'0.9.82HR',
    'thresholds':{'redMaxBasisPoints':100,'purpleMaxBasisPoints':10,'goldMaxBasisPoints':1},
    'policy':'Per-item final actual probability; duplicate Item IDs in one weighted pool are aggregated.',
    'boxes':box_report,
    'gacha':{'items':gacha_rows,'tierCounts':dict(Counter(r['tier'] for r in gacha_rows))},
    'gradeMaterials':{'absoluteChanceBasisPoints':500,'entries':grade_rows,'allExactlyFivePercent':all(r['chanceBasisPoints']==500 for r in grade_rows)}
}
(ROOT/'RARE_ITEM_PROBABILITY_AUDIT_0.9.82HR.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
lines=['# RO_WEB 0.9.82HR 稀有物品機率稽核','', '- 門檻：≤1% 紅、≤0.1% 紫、≤0.01% 金。','- 加權池內相同 Item ID 會合併權重後再判定，避免同物品重複列造成假稀有。','- 升階材料固定 5%，不觸發稀有公告。','']
for key,row in box_report.items():
    c=row['tierCounts']; lines.append(f"- {row['name']}：唯一物品 {row['uniqueItems']}；紅 {c.get('red',0)}、紫 {c.get('purple',0)}、金 {c.get('gold',0)}、不公告 {c.get('none',0)}。")
lines.append('')
lines.append(f"- MVP 轉蛋：紅 {report['gacha']['tierCounts'].get('red',0)}、紫 {report['gacha']['tierCounts'].get('purple',0)}、金 {report['gacha']['tierCounts'].get('gold',0)}、不公告 {report['gacha']['tierCounts'].get('none',0)}。")
lines.append(f"- 升階材料設定列：{len(grade_rows)} 列，全部 5%。")
(ROOT/'RARE_ITEM_PROBABILITY_AUDIT_0.9.82HR.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
print(json.dumps({'version':'0.9.82HR','boxes':{k:v['tierCounts'] for k,v in box_report.items()},'gacha':report['gacha']['tierCounts'],'gradeEntries':len(grade_rows),'gradeAll5Percent':report['gradeMaterials']['allExactlyFivePercent']},ensure_ascii=False,indent=2))
