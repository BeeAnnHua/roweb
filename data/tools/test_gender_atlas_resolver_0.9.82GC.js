const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const jobs=JSON.parse(fs.readFileSync(path.join(ROOT,'data/jobs.json'),'utf8'));
const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'data/character_atlas_manifest.json'),'utf8'));
const ctx={
  console, Date, Math, JSON, Object, Array, Number, String, Boolean, RegExp, Set, Map, Promise,
  player:{jobKey:'novice',gender:'male',mountState:{}}, jobs,
  getJobData:key=>jobs[key]||null,
  document:{getElementById:()=>null,createElement:()=>({})},
  requestAnimationFrame:()=>0, cancelAnimationFrame:()=>{}, performance:{now:()=>0},
  window:null
};
ctx.window=ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT,'js/player_atlas_runtime.js'),'utf8'),ctx,{filename:'player_atlas_runtime.js'});
ctx.RO_STUDIO_PLAYER_ATLAS.manifest=manifest;
const cases={
 'bard:female':'dancer_female','dancer:male':'bard_male','clown:female':'dancer_female','gypsy:male':'bard_male',
 'minstrel:female':'wanderer_female','wanderer:male':'minstrel_male','troubadour:female':'trouvere_female','trouvere:male':'troubadour_male',
 'novice:female':'novice_female','novice:male':'novice_male'
};
const failures=[]; const results={};
for(const [key,expected] of Object.entries(cases)){
  const [jobKey,gender]=key.split(':'); ctx.player.jobKey=jobKey; ctx.player.gender=gender;
  const actual=ctx.resolveROStudioCharacterKey(); results[key]=actual;
  if(actual!==expected) failures.push({key,expected,actual});
}
console.log(JSON.stringify({version:'0.9.82GC',results,failures,status:failures.length?'FAIL':'PASS'},null,2));
process.exit(failures.length?1:0);
