// RO_WEB V0.9.88B9 — frozen mercenary API adapter
// Bridge 內部需暫時遮蔽舊群體轉送；以可寫 facade 避免 frozen Proxy invariant。
(() => {
  "use strict";
  const bridge = window.ROWebMercenarySkillBridge;
  if (!bridge || bridge.runtimeGuard === true) return;
  const wrapped = {version:bridge.version,lexicalAdapter:true,runtimeGuard:true};
  for (const method of ["preview","begin","cast","heal","consume"]) {
    wrapped[method] = function(actor,target,...args) {
      const runtime = window.ROWebMercenaryRuntime;
      const facade = runtime ? Object.assign({},runtime) : runtime;
      try {
        window.ROWebMercenaryRuntime = facade;
        return bridge[method](actor,target,...args);
      } finally {
        window.ROWebMercenaryRuntime = runtime;
      }
    };
  }
  window.ROWebMercenarySkillBridge = Object.freeze(wrapped);
})();
