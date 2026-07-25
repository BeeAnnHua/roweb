from pathlib import Path
import json, subprocess, sys, tempfile
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
errors=[]
def check(cond,msg):
    if not cond: errors.append(msg)

maps=json.loads((ROOT/'data/maps.json').read_text(encoding='utf-8'))
world=next(x for x in maps if x.get('id')=='mjolnir_3x3_region_camera')
check(world.get('monsters')==[1002,1001], f"Mjolnir monsters unexpected: {world.get('monsters')}")
check(world.get('monsterTestSequence')==[1002,1001], 'monsterTestSequence mismatch')

monsters=json.loads((ROOT/'data/monsters.json').read_text(encoding='utf-8'))
by_id={int(x['id']):x for x in monsters}
check(by_id[1002].get('behavior',{}).get('aggressive') is False, 'Poring is not passive')
check(by_id[1002].get('behavior',{}).get('randomWalk') is True, 'Poring randomWalk disabled')
check(by_id[1001].get('behavior',{}).get('aggressive') is True, 'Scorpion is not active')

for mid in [1001,1002]:
    base=ROOT/f'assets/monsters/animations/{mid}'
    data=json.loads((base/f'{mid}.json').read_text(encoding='utf-8'))
    image=Image.open(base/f'{mid}.png').convert('RGBA')
    check(any(frame.get('flipX') is True for frame in data.get('frames',[])), f'{mid}: no flipX frames')
    for frame in data.get('frames',[]):
        x,y,w,h=[int(frame.get(k,0)) for k in ('x','y','width','height')]
        check(w>0 and h>0 and x>=0 and y>=0 and x+w<=image.width and y+h<=image.height, f'{mid}: frame out of atlas {frame.get("id")}')

world_js=(ROOT/'js/world_monster_test_runtime.js').read_text(encoding='utf-8')
check('target remains valid until the monster actually reaches it' in world_js, 'wander target persistence fix missing')
check('now < Number(entity._nextWanderAt || 0) - 450' not in world_js, 'old wander timeout lock remains')
check('entity._wanderTarget = null;' in world_js, 'wander target clear missing')
check('frame.flipX === true' in world_js and 'ctx.scale(-1, 1)' in world_js, 'flipX runtime missing')

start=world_js.index('function updateWorldMonsterWander')
end=world_js.index('\nfunction worldMonsterAttackPlayer', start)
fn=world_js[start:end]
node_script = """
let fakeNow=1000;
Date.now=()=>fakeNow;
Math.random=()=>0;
function clampPositionToBounds(p){return p;}
function moveWorldMonsterToward(entity,target,dt,stopDistance){
  const dx=target.x-entity.position.x,dy=target.y-entity.position.y;
  const dist=Math.hypot(dx,dy);
  if(dist<=stopDistance)return;
  const step=Math.min(dist-stopDistance,40*dt);
  entity.position.x += dx/dist*step; entity.position.y += dy/dist*step;
}
""" + fn + """
const e={position:{x:0,y:0},spawnPosition:{x:0,y:0},_wanderTarget:{x:100,y:0},_nextWanderAt:500,aiState:'IDLE'};
const b={canMove:true,randomWalk:true};
for(let i=0;i<20;i++){ updateWorldMonsterWander(e,0.05,b); fakeNow+=1000; }
if(e.position.x<=0) throw new Error('passive monster did not move');
if(e.aiState!=='WANDER' && e._wanderTarget) throw new Error('unfinished target became idle');
console.log(JSON.stringify(e));
"""
with tempfile.NamedTemporaryFile('w',suffix='.js',encoding='utf-8',delete=False) as f:
    f.write(node_script); temp=Path(f.name)
try:
    r=subprocess.run(['node',str(temp)],capture_output=True,text=True)
    check(r.returncode==0, 'wander simulation failed: '+(r.stderr or r.stdout))
finally:
    temp.unlink(missing_ok=True)

bundle_text=(ROOT/'js/data_bundle.js').read_text(encoding='utf-8')
prefix='window.RO_WEB_DATA = '
bundle=json.loads(bundle_text[len(prefix):].rstrip().rstrip(';'))
check(bundle.get('data/maps.json')==maps, 'bundled maps differ from source JSON')
check(bundle.get('data/monsters.json')==monsters, 'bundled monsters differ from source JSON')

index=(ROOT/'index.html').read_text(encoding='utf-8')
check('?v=0.9.82DI' not in index, 'old cache version remains')
check('?v=0.9.82DJ' in index, 'new cache version missing')

if errors:
    print('FAIL')
    for e in errors: print('-',e)
    sys.exit(1)
print('PASS: Poring passive wander reaches target before pausing; Scorpion/V76 flipX retained')
