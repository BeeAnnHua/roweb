const fs=require('fs'),path=require('path'),assert=require('assert'),crypto=require('crypto');
const root=path.resolve(__dirname,'..');
const read=rel=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
const manifest=read('data/skill_manifest.json');
const skills={};
for(const rel of manifest.cores){const pack=read(rel);for(const [id,row] of Object.entries(pack.skills)){assert(!skills[id],`duplicate skill ${id}`);skills[id]=row;}}
const official=read('data/skill_runtime/runtime_core_1_v1.json').skills;
const pending=read('data/skill_runtime/runtime_pending_review.json').skills;
assert.strictEqual(manifest.version,'0.9.82DD');
assert.strictEqual(Object.keys(skills).length,1139);
assert.strictEqual(Object.keys(official).length,827);
assert.strictEqual(pending.length,312);
const pendingIds=new Set(pending.map(x=>String(x.skillId)));
for(const id of Object.keys(official)) assert(!pendingIds.has(id),`runtime overlap ${id}`);
assert.strictEqual(new Set([...Object.keys(official),...pendingIds]).size,1139);

// Every official skill has a usable handler and every skill icon is a valid 24x24 RGBA PNG.
const handlerCounts={};
for(const [id,row] of Object.entries(official)){
  const p=row.runtimeProfile||row; assert(p.handler,`handler missing ${id}`);handlerCounts[p.handler]=(handlerCounts[p.handler]||0)+1;
}
for(const id of Object.keys(skills)){
  const file=path.join(root,'images','skills',`${id}.png`);assert(fs.existsSync(file),`icon missing ${id}`);
  const b=fs.readFileSync(file);assert.strictEqual(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a',`bad PNG ${id}`);
  assert.strictEqual(b.readUInt32BE(16),24,`bad width ${id}`);assert.strictEqual(b.readUInt32BE(20),24,`bad height ${id}`);
  assert.strictEqual(b[24],8,`bad bit depth ${id}`);assert.strictEqual(b[25],6,`not RGBA ${id}`);
}

// Corrected audit invariants.
const profile=id=>official[String(id)].runtimeProfile||official[String(id)];
assert.strictEqual(profile(358).effects.hpRecoveryRate,200);
assert.deepStrictEqual(profile(2003).counterRatio,[600,700,800,900,1000,1100,1200,1300,1400,1500]);
assert.deepStrictEqual(profile(2309).passiveBonuses.atkRate,[2,4,6]);
for(const id of [319,320,327,328]){
  const p=profile(id);assert.strictEqual(p.sustainedPerformance,true);assert.strictEqual(p.sustainedSpCostPer5s.length,10);
  const duration=id===328?p.statusDuration:p.duration;
  assert.deepStrictEqual(duration,[30000,60000,90000,120000,150000,180000,210000,240000,270000,300000]);
  assert.deepStrictEqual(skills[String(id)].runtimeProfile,p,`Skill Core drift ${id}`);
}
assert(String(skills['2309'].description).includes('Lv3 共增加 6%'));
assert(String(skills['5210'].effectRuntime.formulaSource[0]).includes('100 + 3650'));

// Homunculus catalog coverage.
const hom=read('data/homunculus/homunculi.json'),hs=read('data/homunculus/homunculus_skills.json');
assert.strictEqual(Object.keys(hom.definitions).length,9);assert.strictEqual(Object.keys(hs.skills).length,58);
let enabled=0,excluded=0;
for(const row of Object.values(hs.skills)){const st=String(row.runtimeProfile?.runtimeStatus||row.runtimeStatus||'');if(st.includes('excluded'))excluded++;else if(st.includes('enabled'))enabled++;}
assert.strictEqual(enabled,53);assert.strictEqual(excluded,5);

console.log(JSON.stringify({result:'PASS',version:'0.9.82DD',skills:1139,officialRuntime:827,pending:312,handlers:Object.keys(handlerCounts).length,icons:1139,homunculusSkills:{enabled,excluded}},null,2));
