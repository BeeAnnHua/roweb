#!/usr/bin/env python3
from __future__ import annotations
import io,json,math,zipfile
from pathlib import Path
import yaml

ROOT=Path(__file__).resolve().parents[1]
RA_ZIP=Path('/mnt/data/RA開機檔案英文版20260608.zip')
JOBS_PATH=ROOT/'data/jobs.json'
OUT=ROOT/'data/job_basepoints.json'

with zipfile.ZipFile(RA_ZIP) as zf:
    stats=yaml.safe_load(zf.read('rathena-master/db/re/job_stats.yml').decode('utf-8-sig')).get('Body',[])
    base=yaml.safe_load(zf.read('rathena-master/db/re/job_basepoints.yml').decode('utf-8-sig')).get('Body',[])

stat_by_job={}
for row in stats:
    for job,enabled in (row.get('Jobs') or {}).items():
        if enabled: stat_by_job[str(job)]=row
explicit_by_job={}
for row in base:
    hp={str(int(x['Level'])):int(x['Hp']) for x in (row.get('BaseHp') or []) if x.get('Level') is not None and x.get('Hp') is not None}
    sp={str(int(x['Level'])):int(x['Sp']) for x in (row.get('BaseSp') or []) if x.get('Level') is not None and x.get('Sp') is not None}
    for job,enabled in (row.get('Jobs') or {}).items():
        if enabled:
            target=explicit_by_job.setdefault(str(job),{'baseHp':{},'baseSp':{}})
            target['baseHp'].update(hp); target['baseSp'].update(sp)

def calc(level:int,factor:int,increase:int,kind:str,ra_job:str)->int:
    value=35.0 if kind=='hp' else 10.0
    value += math.floor(level * (increase/100.0))
    for i in range(2,level+1):
        value += math.floor((factor/100.0)*i + 0.5)
    if ra_job=='Hyper_Novice':
        if kind=='hp' and level>=99: value += 2000
        if kind=='hp' and level>=150: value += 2000
    return int(value)

jobs=json.loads(JOBS_PATH.read_text(encoding='utf-8'))
rows=jobs if isinstance(jobs,list) else list(jobs.values())
out=json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {}
patched=[]
for job in rows:
    key=str(job.get('id') or '')
    is_target=Number if False else None
    if not (int(job.get('tier') or 0)==4 or key=='hyper_novice'):
        continue
    ra_job=str(job.get('raJob') or ('Hyper_Novice' if key=='hyper_novice' else ''))
    row=stat_by_job.get(ra_job)
    if not row:
        raise RuntimeError(f'Missing RA job_stats row for {key}/{ra_job}')
    max_lv=int(job.get('baseMaxLevel') or 275)
    hp_factor=int(row.get('HpFactor') or 0); hp_inc=int(row.get('HpIncrease') or 500)
    sp_factor=int(row.get('SpFactor') or 0); sp_inc=int(row.get('SpIncrease') or 0)
    explicit=explicit_by_job.get(ra_job,{'baseHp':{},'baseSp':{}})
    hp={};sp={}
    for lv in range(1,max_lv+1):
        k=str(lv)
        hp[k]=int(explicit['baseHp'].get(k,calc(lv,hp_factor,hp_inc,'hp',ra_job)))
        sp[k]=int(explicit['baseSp'].get(k,calc(lv,sp_factor,sp_inc,'sp',ra_job)))
    out[key]={
        'source':'rAthena db/re/job_basepoints.yml + job_stats.yml calculated fallback',
        'raJob':ra_job,'hpFactor':hp_factor,'hpIncrease':hp_inc,'spFactor':sp_factor,'spIncrease':sp_inc,
        'baseHp':hp,'baseSp':sp
    }
    patched.append({'jobKey':key,'raJob':ra_job,'hp200':hp.get('200'),'hp275':hp.get('275'),'sp200':sp.get('200'),'sp275':sp.get('275')})
OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'version':'0.9.82FW','patched':patched},ensure_ascii=False,indent=2))
