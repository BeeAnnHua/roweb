// ============================================================
// 彼岸花仙境 / RO_WEB - RO-style Loading Screen V0.9.85I
// ============================================================
(function(){
  "use strict";
  const VERSION="0.9.85I";
  let current=0;
  let target=0;
  let raf=0;
  let hideTimer=0;
  const $=id=>document.getElementById(id);

  function clamp(value){return Math.max(0,Math.min(100,Math.round(Number(value)||0)));}
  function paint(){
    const bar=$("rowebLoadingFill"), text=$("rowebLoadingPercent");
    if(bar)bar.style.width=`${current}%`;
    if(text)text.textContent=`${current}%`;
  }
  function tick(){
    raf=0;
    if(current<target){
      const gap=target-current;
      current=Math.min(target,current+Math.max(1,Math.ceil(gap/12)));
      paint();
      raf=requestAnimationFrame(tick);
    }
  }
  function setLabel(label){const node=$("rowebLoadingLabel");if(node&&label)node.textContent=String(label);}
  function setProgress(value,label=""){
    target=Math.max(target,clamp(value));
    if(label)setLabel(label);
    if(!raf)raf=requestAnimationFrame(tick);
    return target;
  }
  function show(options={}){
    const overlay=$("rowebLoadingScreen");
    if(!overlay)return false;
    clearTimeout(hideTimer);
    if(options.reset===true){current=0;target=0;paint();}
    overlay.hidden=false;
    overlay.classList.add("is-visible");
    document.body?.classList.add("roweb-loading-open");
    setProgress(options.progress??Math.max(target,4), options.label||"正在連線至彼岸花仙境…");
    return true;
  }
  function hide(options={}){
    const overlay=$("rowebLoadingScreen");
    if(!overlay)return false;
    const done=()=>{
      overlay.classList.remove("is-visible");
      overlay.hidden=true;
      document.body?.classList.remove("roweb-loading-open");
    };
    clearTimeout(hideTimer);
    if(options.immediate===true)done();
    else hideTimer=setTimeout(done,Number(options.delay??220));
    return true;
  }
  function complete(label="載入完成"){
    show({progress:Math.max(target,96),label});
    target=100;
    const finish=()=>{
      if(current>=100){hide({delay:260});return;}
      setTimeout(finish,30);
    };
    finish();
  }
  function navigate(label="正在切換畫面…"){
    show({reset:true,progress:8,label});
    setTimeout(()=>setProgress(24,label),60);
    return true;
  }

  function init(){
    const overlay=$("rowebLoadingScreen");
    if(!overlay)return false;
    overlay.hidden=false;
    overlay.classList.add("is-visible");
    current=0;target=0;paint();
    setProgress(4,"正在連線至彼岸花仙境…");
    return true;
  }

  window.ROWebLoadingScreen=Object.freeze({version:VERSION,show,hide,setProgress,complete,navigate,getProgress:()=>current});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
