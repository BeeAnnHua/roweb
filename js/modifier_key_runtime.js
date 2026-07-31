//=======================================
// RO_WEB ModifierKeyRuntime v0.9.82HZ
// Canonical keyed combat modifier resolver for race / size / element / class.
// Prevents RA/client spelling and casing differences from disabling effects.
//=======================================
(function () {
  "use strict";

  const VERSION = "0.9.82HZ";
  const compact = value => String(value ?? "").trim().toLowerCase().replace(/[\s_\-\/\\]+/g, "");

  const GROUPS = {
    race: new Set([
      "raceDamage","physicalRaceDamage","magicRaceDamage",
      "raceResist","physicalRaceResist","magicRaceResist",
      "criticalChanceByRace","criticalRateByRace","raceFlatReduction",
      "ignoreDefByRace","ignoreMdefByRace","ignoreResByRace","ignoreMresByRace",
      "expRaceRate","spGainRace","comaRaceRate"
    ]),
    size: new Set([
      "sizeDamage","magicSizeDamage","sizeResist","physicalSizeResist","magicSizeResist"
    ]),
    element: new Set([
      "elementDamage","physicalElementDamage","magicElementDamage",
      "attackElementDamage","physicalAttackElementDamage","magicAttackElementDamage",
      "elementResist","physicalEnemyElementResist","magicEnemyElementResist","enemyArmorElementResist",
      "ignoreDefByElement","ignoreMdefByElement"
    ]),
    classType: new Set([
      "classDamage","physicalClassDamage","magicClassDamage",
      "classResist","physicalClassResist","magicClassResist",
      "defRatioAttackClass","ignoreDefByClass","ignoreMdefByClass","comaClassRate"
    ])
  };

  const ALIASES = {
    race: {
      all:"All", rcall:"All", 全部:"All", 全種族:"All",
      formless:"Formless", rcformless:"Formless", 無形:"Formless", 無形種族:"Formless",
      undead:"Undead", rcundead:"Undead", 不死:"Undead", 不死種族:"Undead",
      brute:"Brute", rcbrute:"Brute", animal:"Brute", beast:"Brute", 動物:"Brute", 動物種族:"Brute",
      plant:"Plant", rcplant:"Plant", 植物:"Plant", 植物種族:"Plant",
      insect:"Insect", rcinsect:"Insect", 昆蟲:"Insect", 昆蟲種族:"Insect",
      fish:"Fish", rcfish:"Fish", fishshell:"Fish", 魚貝:"Fish", 魚貝種族:"Fish",
      demon:"Demon", rcdemon:"Demon", 惡魔:"Demon", 惡魔種族:"Demon",
      demihuman:"DemiHuman", rcdemihuman:"DemiHuman", human:"DemiHuman", humanoid:"DemiHuman",
      人形:"DemiHuman", 人型:"DemiHuman", 人形種族:"DemiHuman", 人型種族:"DemiHuman",
      angel:"Angel", rcangel:"Angel", 天使:"Angel", 天使種族:"Angel",
      dragon:"Dragon", rcdragon:"Dragon", 龍:"Dragon", 龍族:"Dragon",
      player:"Player", rcplayer:"Player", playerhuman:"Player", rcplayerhuman:"Player",
      playerdoram:"Player", rcplayerdoram:"Player", 玩家:"Player",
      boss:"Boss", classboss:"Boss", 首領:"Boss", mvp:"Boss",
      normal:"NonBoss", nonboss:"NonBoss", classnormal:"NonBoss", 一般:"NonBoss"
    },
    size: {
      all:"All", sizeall:"All", 全部:"All",
      small:"Small", sizesmall:"Small", 小型:"Small",
      medium:"Medium", sizemedium:"Medium", middle:"Medium", 中型:"Medium",
      large:"Large", sizelarge:"Large", big:"Large", 大型:"Large"
    },
    element: {
      all:"All", eleall:"All", 全部:"All", 全屬性:"All",
      neutral:"Neutral", eleneutral:"Neutral", 無:"Neutral", 無屬性:"Neutral",
      water:"Water", elewater:"Water", 水:"Water", 水屬性:"Water",
      earth:"Earth", eleearth:"Earth", 地:"Earth", 地屬性:"Earth",
      fire:"Fire", elefire:"Fire", 火:"Fire", 火屬性:"Fire",
      wind:"Wind", elewind:"Wind", 風:"Wind", 風屬性:"Wind",
      poison:"Poison", elepoison:"Poison", 毒:"Poison", 毒屬性:"Poison",
      holy:"Holy", eleholy:"Holy", 聖:"Holy", 聖屬性:"Holy",
      dark:"Dark", eledark:"Dark", shadow:"Dark", 暗:"Dark", 暗屬性:"Dark",
      ghost:"Ghost", eleghost:"Ghost", 念:"Ghost", 念屬性:"Ghost",
      undead:"Undead", eleundead:"Undead", 不死:"Undead", 不死屬性:"Undead"
    },
    classType: {
      all:"All", classall:"All", 全部:"All",
      boss:"Boss", classboss:"Boss", mvp:"Boss", 首領:"Boss",
      normal:"NonBoss", classnormal:"NonBoss", nonboss:"NonBoss", 一般:"NonBoss"
    }
  };

  function categoryFor(group, value) {
    const name = String(group || "");
    for (const [category, groups] of Object.entries(GROUPS)) if (groups.has(name)) return category;
    if (name === "race" || name === "size" || name === "element" || name === "classType") return name;
    if (name === "auto") {
      const token = compact(value);
      for (const category of ["race","size","element","classType"]) {
        if (Object.prototype.hasOwnProperty.call(ALIASES[category], token)) return category;
      }
    }
    return "generic";
  }

  function canonical(group, value) {
    const raw = String(value ?? "All").trim();
    const category = categoryFor(group, raw);
    if (category === "generic") return raw;
    const token = compact(raw);
    return ALIASES[category][token] || raw.replace(/^(RC2?|Ele|Size|Class)_/i, "").trim();
  }

  function token(group, value) {
    return compact(canonical(group, value));
  }

  function valueFromMap(map, group, key, options = {}) {
    if (!map || typeof map !== "object" || Array.isArray(map)) return 0;
    const includeAll = options.includeAll !== false;
    const wanted = token(group, key);
    const allToken = token(group, "All");
    let total = 0;
    for (const [entryKey, entryValue] of Object.entries(map)) {
      const entryToken = token(group, entryKey);
      if (entryToken === wanted || (includeAll && wanted !== allToken && entryToken === allToken)) {
        const numeric = Number(entryValue);
        if (Number.isFinite(numeric)) total += numeric;
      }
    }
    return total;
  }

  function normalizeMap(group, map) {
    if (!map || typeof map !== "object" || Array.isArray(map)) return map;
    const out = {};
    for (const [key, value] of Object.entries(map)) {
      const normalized = canonical(group, key);
      const numeric = Number(value);
      if (Number.isFinite(numeric)) out[normalized] = Number(out[normalized] || 0) + numeric;
      else out[normalized] = value;
    }
    return out;
  }

  window.ModifierKeyRuntime = {
    version: VERSION,
    categoryFor,
    canonical,
    token,
    valueFromMap,
    normalizeMap,
    normalizeRace: value => canonical("race", value),
    normalizeSize: value => canonical("size", value),
    normalizeElement: value => canonical("element", value),
    normalizeClass: value => canonical("classType", value)
  };
})();
