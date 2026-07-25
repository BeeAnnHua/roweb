const fs=require('fs'), vm=require('vm'), path=require('path');
const ROOT=path.resolve(__dirname,'..');
const ctx={console,Math,Number,String,Object,Array,Set,Map,Promise,performance:{now:()=>1000},window:{},document:{},requestAnimationFrame:()=>{},fetch:async()=>({ok:false}),player:{}};
ctx.window=ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT,'js/player_atlas_runtime.js'),'utf8'),ctx,{filename:'player_atlas_runtime.js'});
const state=ctx.RO_STUDIO_PLAYER_ATLAS;
state.ready=true;
state.assets.attack={frame_sets:{attack:{frameCount:5,directions:{front:[{}]}}},motions:[{id:'attack',frame_count:5}]};
function assert(c,m){if(!c)throw new Error(m);}
assert(ctx.playROStudioPlayerMotion('attack',{duration:200,compressFrames:true})===true,'attack play failed');
assert(Math.abs(state.overrideFrameMs-40)<0.001,'190 ASPD frame compression should be 40ms x 5 frames');
assert(state.overrideUntil===1200,'200ms motion duration mismatch');
assert(ctx.playROStudioPlayerMotion('attack',{duration:2000,compressFrames:true})===true,'slow attack play failed');
assert(Math.abs(state.overrideFrameMs-400)<0.001,'150 ASPD frame compression should be 400ms x 5 frames');
console.log('PASS 0.9.82DW player skill motion compression');
