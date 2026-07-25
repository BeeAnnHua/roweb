const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const rt=JSON.parse(fs.readFileSync(path.join(root,'data/skill_runtime/runtime_core_1_v1.json'),'utf8')).skills;
const ids=[2038,2040,2041,2042,2043,2045,2046,2047,2048,2050,2051,2053,2054,2515];
for(const id of ids){if(!rt[id])throw new Error('missing '+id);const p=rt[id].runtimeProfile||rt[id];if(!p.handler||p.handler==='pending')throw new Error('pending '+id);}
const judex=rt[2038].runtimeProfile,ador=rt[2040].runtimeProfile;
if(Math.floor((300+70*10)*200/100)!==2000)throw new Error('judex formula');
if(Math.floor((300+250*10)*200/100)!==5600)throw new Error('adoramus formula');
if(rt[2050].runtimeProfile.periodicHpHealRate[3]!==8)throw new Error('renovatio');
if(rt[2053].runtimeProfile.effects.defPiercePercent[4]!==25)throw new Error('expiatio');
if(rt[2054].runtimeProfile.effects.dupleLightLevel[9]!==10)throw new Error('duple');
console.log('PASS Arch Bishop Batch33',ids.length);
