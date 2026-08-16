// RO_WEB V0.9.88B9 — global let player/currentMonster adapter
// Classic scripts declare these as global lexical bindings, not writable window properties.
(() => {
  "use strict";
  const bridge = window.ROWebMercenarySkillBridge;
  if (!bridge || bridge.lexicalAdapter === true) return;
  const wrapped = { version:bridge.version, lexicalAdapter:true };
  for (const method of ["preview","begin","cast","heal","consume"]) {
    wrapped[method] = function(actor,target,...args) {
      const previousPlayer = player;
      const previousMonster = currentMonster;
      try {
        player = actor;
        currentMonster = target || null;
        return bridge[method](actor,target,...args);
      } finally {
        currentMonster = previousMonster;
        player = previousPlayer;
      }
    };
  }
  window.ROWebMercenarySkillBridge = Object.freeze(wrapped);
})();
