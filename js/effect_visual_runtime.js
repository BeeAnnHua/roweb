//=======================================
// RO_WEB Effect Visual Runtime v0.9.82FX
// Consumes CardRuntime active_transform events. Exact monster atlases are used
// when the project contains that transform ID; otherwise a visible fallback
// tint/badge is shown instead of silently discarding the transformation.
//=======================================
(function(){
  "use strict";
  const state={token:0,active:false,detail:null,canvas:null,ctx:null,badge:null,data:null,images:[],frames:new Map(),bounds:null,motion:"idle",direction:"south_west",frameIndex:0,frameElapsed:0,lastTime:0,raf:0,endTimer:0,exact:false};
  const n=(v,f=0)=>{const x=Number(v);return Number.isFinite(x)?x:f;};

  function playerHost(){return typeof document!=="undefined"?document.getElementById("player-sprite"):null;}
  function ensureNodes(){
    const host=playerHost();if(!host)return false;
    if(getComputedStyle(host).position==="static")host.style.position="relative";
    let canvas=document.getElementById("cardTransformCanvas");
    if(!canvas){canvas=document.createElement("canvas");canvas.id="cardTransformCanvas";canvas.setAttribute("aria-label","equipment card transformation");Object.assign(canvas.style,{position:"absolute",left:"50%",bottom:"0",transform:"translateX(-50%)",pointerEvents:"none",zIndex:"6",imageRendering:"pixelated",display:"none"});host.appendChild(canvas);}
    let badge=document.getElementById("cardTransformFallback");
    if(!badge){badge=document.createElement("div");badge.id="cardTransformFallback";Object.assign(badge.style,{position:"absolute",left:"50%",bottom:"100%",transform:"translate(-50%,-4px)",padding:"2px 6px",borderRadius:"8px",fontSize:"10px",fontWeight:"700",lineHeight:"1.2",whiteSpace:"nowrap",pointerEvents:"none",zIndex:"7",background:"rgba(18,18,24,.82)",color:"#ffe082",border:"1px solid rgba(255,224,130,.65)",display:"none"});host.appendChild(badge);}
    state.canvas=canvas;state.ctx=canvas.getContext("2d");state.badge=badge;return true;
  }
  function baseVisualNodes(){return [document.getElementById("playerAtlasCanvas"),document.getElementById("playerImage")].filter(Boolean);}
  function showExactVisual(exact){
    for(const node of baseVisualNodes()){
      if(exact){if(node.dataset.cardTransformOldVisibility===undefined)node.dataset.cardTransformOldVisibility=node.style.getPropertyValue("visibility")||"";node.style.setProperty("visibility","hidden","important");}
      else{const old=node.dataset.cardTransformOldVisibility;if(old)node.style.setProperty("visibility",old);else node.style.removeProperty("visibility");delete node.dataset.cardTransformOldVisibility;}
    }
    if(state.canvas)state.canvas.style.display=exact?"block":"none";
  }
  function showFallback(id){
    state.exact=false;showExactVisual(false);
    const canvas=document.getElementById("playerAtlasCanvas");if(canvas){if(canvas.dataset.cardTransformOldFilter===undefined)canvas.dataset.cardTransformOldFilter=canvas.style.filter||"";canvas.style.filter="hue-rotate(115deg) saturate(1.75) drop-shadow(0 0 5px rgba(255,224,130,.9))";}
    if(state.badge){state.badge.textContent=`變身效果 #${id}`;state.badge.style.display="block";}
  }
  function clearFallback(){
    const canvas=typeof document!=="undefined"?document.getElementById("playerAtlasCanvas"):null;
    if(canvas&&canvas.dataset.cardTransformOldFilter!==undefined){canvas.style.filter=canvas.dataset.cardTransformOldFilter;delete canvas.dataset.cardTransformOldFilter;}
    if(state.badge)state.badge.style.display="none";
  }
  function calculateBounds(data){
    let left=0,top=0,right=1,bottom=1;
    for(const frame of data?.frames||[]){left=Math.min(left,-n(frame.pivotX));top=Math.min(top,-n(frame.pivotY));right=Math.max(right,n(frame.width,1)-n(frame.pivotX));bottom=Math.max(bottom,n(frame.height,1)-n(frame.pivotY));}
    return{left,top,right,bottom,width:Math.max(1,right-left),height:Math.max(1,bottom-top),anchorX:-left,anchorY:-top};
  }
  function loadImage(url){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error(`transform atlas missing: ${url}`));image.src=url;});}
  async function loadAsset(id,token){
    const base=`./assets/monsters/animations/${id}`;
    const data=typeof window.loadJson==="function"?await window.loadJson(`${base}/${id}.json`,null):null;
    if(!data||token!==state.token)throw new Error(`transform json missing: ${id}`);
    const atlases=Array.isArray(data.atlases)&&data.atlases.length?data.atlases:(data.atlas?[data.atlas]:[]);
    if(!atlases.length)throw new Error(`transform atlas manifest missing: ${id}`);
    const images=[];for(const atlas of atlases)images[n(atlas.index,images.length)]=await loadImage(`${base}/${atlas.file}`);
    if(token!==state.token)throw new Error("transform superseded");
    return{data,images,frames:new Map((data.frames||[]).map(frame=>[n(frame.id),frame])),bounds:calculateBounds(data)};
  }
  function directionName(){
    const id=n(window.RO_STUDIO_PLAYER_ATLAS?.directionId);
    return ["south_west","south_west","north_west","north_west","north_east","north_east","south_east","south_east"][Math.max(0,Math.min(7,id))]||"south_west";
  }
  function moving(){
    if(typeof window.isROStudioPlayerActuallyMoving==="function")return !!window.isROStudioPlayerActuallyMoving();
    const p=window.player?.position;return !!p&&p.targetX!==null&&p.targetX!==undefined&&Math.hypot(n(p.targetX)-n(p.x),n(p.targetY)-n(p.y))>.5;
  }
  function animationFrames(motion,direction){
    const entry=state.data?.animations?.[motion]||state.data?.animations?.idle;
    const aliases=state.data?.directionAliases||{};const dir=entry?.directions?.[direction]?direction:(aliases[direction]||"south_west");
    const raw=entry?.directions?.[dir]?.frames??entry?.[dir]??[];return Array.isArray(raw)?raw:[];
  }
  function layout(){
    if(!state.canvas||!state.bounds)return 1;
    const scale=Math.max(.25,Math.min(1.5,240/state.bounds.width,320/state.bounds.height));
    const width=Math.max(1,Math.ceil(state.bounds.width*scale)),height=Math.max(1,Math.ceil(state.bounds.height*scale));
    if(state.canvas.width!==width)state.canvas.width=width;if(state.canvas.height!==height)state.canvas.height=height;
    state.canvas.style.width=`${width}px`;state.canvas.style.height=`${height}px`;return scale;
  }
  function draw(frame){
    if(!frame||!state.ctx||!state.canvas||!state.bounds)return;
    const image=state.images[n(frame.atlas)];if(!image)return;
    const scale=layout(),ctx=state.ctx;ctx.clearRect(0,0,state.canvas.width,state.canvas.height);ctx.imageSmoothingEnabled=false;
    const dx=(state.bounds.anchorX-n(frame.pivotX))*scale,dy=(state.bounds.anchorY-n(frame.pivotY))*scale;
    const sx=n(frame.x),sy=n(frame.y),sw=Math.max(1,n(frame.width,1)),sh=Math.max(1,n(frame.height,1)),dw=Math.max(1,Math.round(sw*scale)),dh=Math.max(1,Math.round(sh*scale));
    if(frame.flipX===true){ctx.save();ctx.translate(Math.round(dx)+dw,Math.round(dy));ctx.scale(-1,1);ctx.drawImage(image,sx,sy,sw,sh,0,0,dw,dh);ctx.restore();}
    else ctx.drawImage(image,sx,sy,sw,sh,Math.round(dx),Math.round(dy),dw,dh);
  }
  function tick(time){
    if(!state.active||!state.exact)return;
    const motion=moving()?"walk":"idle",direction=directionName(),ids=animationFrames(motion,direction);
    if(motion!==state.motion||direction!==state.direction){state.motion=motion;state.direction=direction;state.frameIndex=0;state.frameElapsed=0;}
    const dt=Math.min(100,Math.max(0,n(time)-n(state.lastTime,time)));state.lastTime=n(time);
    if(ids.length){let frame=state.frames.get(n(ids[Math.min(state.frameIndex,ids.length-1)]));state.frameElapsed+=dt;let duration=Math.max(24,n(frame?.durationMs,96));while(state.frameElapsed>=duration){state.frameElapsed-=duration;state.frameIndex=(state.frameIndex+1)%ids.length;frame=state.frames.get(n(ids[state.frameIndex]));duration=Math.max(24,n(frame?.durationMs,96));}draw(frame);}
    state.raf=requestAnimationFrame(tick);
  }
  async function start(detail={}){
    stop(false);if(!ensureNodes())return false;
    state.active=true;state.detail=detail;const token=++state.token,id=n(detail.monsterId??detail.id);clearFallback();
    const remaining=Math.max(100,n(detail.expiresAt)-Date.now()||n(detail.durationMs,1000));state.endTimer=setTimeout(()=>stop(true),remaining+50);
    try{const asset=await loadAsset(id,token);if(!state.active||token!==state.token)return false;Object.assign(state,asset);state.exact=true;state.frameIndex=0;state.frameElapsed=0;state.lastTime=0;showExactVisual(true);state.raf=requestAnimationFrame(tick);return true;}
    catch(error){if(state.active&&token===state.token){showFallback(id);console.warn("[EffectVisualRuntime] exact transform asset unavailable; visible fallback used",id,error?.message||error);}return false;}
  }
  function stop(restore=true){
    state.active=false;state.token++;if(state.raf)cancelAnimationFrame(state.raf);if(state.endTimer)clearTimeout(state.endTimer);state.raf=0;state.endTimer=0;
    if(state.ctx&&state.canvas)state.ctx.clearRect(0,0,state.canvas.width,state.canvas.height);showExactVisual(false);clearFallback();
    state.data=null;state.images=[];state.frames=new Map();state.bounds=null;state.exact=false;state.detail=null;
    if(restore&&typeof window.activateROStudioPlayerCanvas==="function")window.activateROStudioPlayerCanvas();
  }
  if(typeof window.addEventListener==="function"){
    window.addEventListener("ro:web-player-transform",event=>start(event.detail||{}));
    window.addEventListener("ro:web-player-transform-end",()=>stop(true));
  }
  window.EffectVisualRuntime={version:"0.9.82FX",startTransform:start,stopTransform:()=>stop(true),getState:()=>({active:state.active,exact:state.exact,monsterId:state.detail?.monsterId||null})};
})();
