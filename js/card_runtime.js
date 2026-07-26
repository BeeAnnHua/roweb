//=======================================
// RO_WEB CardRuntime v0.9.82FW
// rAthena Renewal 2026-06-08 card scripts, card/equipment combos,
// proc/drop/kill hooks and instance-safe socket/removal services.
//=======================================
(function () {
  "use strict";

  const PATHS = {
    effects: "data/card_runtime/card_effects.json",
    combos: "data/card_runtime/card_combos.json",
    groups: "data/card_runtime/item_groups.json",
    drops: "data/card_runtime/card_drop_sources.json",
    equipment: "data/card_runtime/equipment_effects.json"
  };
  const CACHE = { signature: "", sources: [], all: null, tempSignature: "", loaded: false };
  const DATA = { effects: {}, combos: [], groups: {}, drops: {}, equipment: {} };
  const COMPILED = new Map();
  const NESTED_COMPILED = new Map();
  const SLOT_BY_EQI = {
    EQI_HAND_R: "weapon", EQI_HAND_L: "shield", EQI_ARMOR: "body", EQI_GARMENT: "garment",
    EQI_SHOES: "shoes", EQI_HEAD_TOP: "headTop", EQI_HEAD_MID: "headMid", EQI_HEAD_LOW: "headLow",
    EQI_ACC_L: "accessory1", EQI_ACC_R: "accessory2", EQI_COMPOUND_ON: null
  };

  function bundled(path, fallback) {
    const value = window.RO_WEB_DATA?.[path];
    return value === undefined ? fallback : value;
  }
  function init() {
    if (CACHE.loaded) return true;
    DATA.effects = bundled(PATHS.effects, {}) || {};
    DATA.combos = bundled(PATHS.combos, []) || [];
    DATA.groups = bundled(PATHS.groups, {}) || {};
    DATA.drops = bundled(PATHS.drops, {}) || {};
    DATA.equipment = bundled(PATHS.equipment, {}) || {};
    CACHE.loaded = Object.keys(DATA.effects).length > 0;
    return CACHE.loaded;
  }
  function n(value, fallback = 0) { const x = Number(value); return Number.isFinite(x) ? x : fallback; }
  function addScalar(out, key, value) { const x = n(value); if (x) out[key] = n(out[key]) + x; }
  function addKeyed(out, group, key, value) {
    const x = n(value); if (!x) return;
    out[group] = out[group] && typeof out[group] === "object" ? out[group] : {};
    const normalized = normalizeConstant(key);
    out[group][normalized] = n(out[group][normalized]) + x;
  }
  function push(out, key, row) { out[key] = Array.isArray(out[key]) ? out[key] : []; out[key].push(row); }
  function normalizeConstant(value) {
    const raw = String(value ?? "All");
    const stripped = raw.replace(/^(RC2?|Ele|Size|Class|Eff|SC)_/i, "");
    const aliases = {
      All: "All", DemiHuman: "DemiHuman", Player_Human: "Player", Player_Doram: "Player", Player: "Player",
      Boss: "Boss", Normal: "NonBoss", NonBoss: "NonBoss", Formless: "Formless", Undead: "Undead",
      Brute: "Brute", Plant: "Plant", Insect: "Insect", Fish: "Fish", Demon: "Demon", Angel: "Angel", Dragon: "Dragon",
      Neutral: "Neutral", Water: "Water", Earth: "Earth", Fire: "Fire", Wind: "Wind", Poison: "Poison", Holy: "Holy",
      Dark: "Dark", Ghost: "Ghost", Small: "Small", Medium: "Medium", Large: "Large"
    };
    return aliases[stripped] || stripped;
  }
  function normalizeSkillKey(value) { return String(value ?? "0").replace(/^SKID_/, ""); }
  function skillPools() {
    const data=window.skillsData || bundled("data/skills.json", null) || {};
    const index=data?.skillIndex || {};
    return [...Object.values(index), ...(window.skills||[]), ...(window.allSkills||[])].filter(Boolean);
  }
  function resolveSkill(skillKey) {
    const raw=normalizeSkillKey(skillKey), numeric=Number(raw);
    if(Number.isFinite(numeric)&&numeric>0){
      const direct=window.getSkillDataById?.(numeric) || window.skillsData?.skillIndex?.[String(numeric)];
      if(direct)return direct;
    }
    return skillPools().find(x=>[x?.key,x?.skillKey,x?.aegisName,x?.AegisName,x?.internalName].some(v=>String(v||"")===raw))||null;
  }
  function resolveSkillStorageKey(skillKey) {
    const skill=resolveSkill(skillKey);
    return String(skill?.officialId ?? skill?.id ?? normalizeSkillKey(skillKey));
  }
  function currentJobTier() {
    const jobs=window.jobsData || bundled("data/jobs.json", {}) || {};
    const token=String(window.player?.jobKey || window.player?.job || window.player?.jobAegisName || window.player?.jobId || "");
    const rows=Array.isArray(jobs)?jobs:Object.values(jobs);
    const row=rows.find(x=>[x?.id,x?.officialId,x?.raJob,x?.aegisName].some(v=>String(v??"")===token));
    return n(row?.tier,0);
  }
  function eaclassMask() {
    const tier=currentJobTier();
    if(tier>=4)return 8;
    if(tier>=3)return 4;
    return 0;
  }
  function equipmentRows() {
    if (!window.player?.equipment) return [];
    const rows = [];
    const main = player.equipment.weapon;
    for (const [slot, itemId] of Object.entries(player.equipment)) {
      if (!itemId) continue;
      if ((slot === "shield" || slot === "leftWeapon") && String(itemId) === String(main)) {
        const item = window.getItemData?.(itemId);
        if (item?.twoHanded || Number(item?.hands || item?.weaponHands) === 2) continue;
      }
      const item = window.getItemData?.(itemId);
      const instance = window.getEquipmentInstance?.(slot) || player.equipmentInstances?.[slot] || null;
      rows.push({ slot, itemId: Number(itemId), item, instance, refine: n(instance?.refine) });
    }
    return rows;
  }
  function signature() {
    const equipment = equipmentRows().map(row => [row.slot, row.itemId, row.refine, ...(row.instance?.cards || [])]);
    const p = window.player || {};
    const temp = Object.entries(p.cardRuntimeTempBonuses || {}).filter(([,x]) => n(x?.expiresAt) > Date.now()).map(([k,x]) => [k,x.expiresAt]);
    return JSON.stringify([equipment, p.baseLevel, p.jobLevel, p.job, p.jobId, p.gender, p.stats, p.traitStats, p.learnedSkills, temp]);
  }
  function currentJobToken() {
    return String(window.player?.jobAegisName || window.player?.job || window.player?.jobId || "Job_Novice");
  }
  function statValue(token) {
    const key = String(token).replace(/^b/, "").toLowerCase();
    const basic = window.player?.stats || {};
    const traits = window.player?.traitStats || {};
    return n(basic[key] ?? traits[key]);
  }
  function slotFromConstant(token, context) {
    const raw = String(token || "");
    if (raw === "EQI_COMPOUND_ON") return context.slot || null;
    return SLOT_BY_EQI[raw] ?? null;
  }
  function getSlotRow(token, context) {
    const slot = slotFromConstant(token, context);
    if (!slot) return context.hostRow || equipmentRows().find(Boolean) || null;
    return equipmentRows().find(row => row.slot === slot) || null;
  }
  function getItemView(item) {
    const sub = String(item?.weaponType || item?.subType || item?.SubType || "").toLowerCase();
    const map = { dagger:"W_DAGGER", book:"W_BOOK", staff:"W_STAFF", twohandstaff:"W_2HSTAFF", "2hstaff":"W_2HSTAFF", bow:"W_BOW", katar:"W_KATAR", knuckle:"W_KNUCKLE", mace:"W_MACE", sword:"W_1HSWORD", spear:"W_1HSPEAR", axe:"W_1HAXE" };
    return map[sub] || String(item?.weaponType || item?.SubType || item?.type || "0");
  }

  function applyBonus(out, type, args) {
    type = String(type || "");
    const a = args || [], value = a.length ? a[a.length - 1] : 1;
    const scalars = {
      bStr:"strFlat", bAgi:"agiFlat", bVit:"vitFlat", bInt:"intFlat", bDex:"dexFlat", bLuk:"lukFlat", bAllStats:"allStatsFlat",
      bPow:"powFlat", bSta:"staFlat", bWis:"wisFlat", bSpl:"splFlat", bCon:"conFlat", bCrt:"crtFlat",
      bBaseAtk:"atkFlat", bAtkRate:"atkRate", bWeaponAtkRate:"weaponAtkRate", bWeaponDamageRate:"physicalDamageRate",
      bMatk:"matkFlat", bMatkRate:"matkRate", bDef:"defFlat", bDefRate:"defRate", bMdef:"mdefFlat", bMdefRate:"mdefRate",
      bHit:"hitFlat", bFlee:"fleeFlat", bCritical:"criFlat", bFlee2:"perfectDodgeFlat", bPerfectHitAddRate:"perfectHitRate",
      bAspd:"aspdFlat", bAspdRate:"aspdRate", bMaxHP:"maxHpFlat", bMaxHPrate:"maxHpRate", bMaxSP:"maxSpFlat", bMaxSPrate:"maxSpRate",
      bHPrecovRate:"hpRecoveryRate", bSPrecovRate:"spRecoveryRate", bHPRegenRate:"hpRecoveryRate", bSPRegenRate:"spRecoveryRate",
      bLongAtkRate:"longDamageRate", bShortAtkRate:"shortDamageRate", bCritAtkRate:"critAtkRate", bCriticalLong:"criticalLongRate",
      bVariableCastrate:"variableCastReductionRate", bFixedCastrate:"fixedCastReductionRate", bDelayrate:"afterCastDelayReductionRate",
      bHealPower:"healPowerRate", bHealPower2:"healingReceivedRate", bPAtk:"pAtk", bSMatk:"sMatk", bCRate:"crateFlat",
      bSpeedRate:"moveSpeedRate", bNearAtkDef:"shortDamageReductionRate", bLongAtkDef:"longDamageReductionRate",
      bReduceDamageReturn:"reflectDamageReductionRate", bMagicDamageReturn:"magicReflectRate", bShortWeaponDamageReturn:"shortReflectRate",
      bHPGainValue:"killHpFlat", bSPGainValue:"killSpFlat", bMagicHPGainValue:"magicKillHpFlat",
      bSPDrainValue:"spDrainFlat", bNoWalkDelay:"noWalkDelay", bNoCastCancel:"noCastCancel", bNoSizeFix:"ignoreSizePenalty",
      bUnbreakableWeapon:"unbreakableWeapon", bUnbreakableArmor:"unbreakableArmor", bUnbreakableShield:"unbreakableShield", bNoKnockback:"noKnockback", bIntravision:"intravision",
      bNoGemStone:"noGemstone", bNoMadoFuel:"noMadoFuel", bNoMagicDamage:"magicImmune", bRestartFullRecover:"restartFullRecover",
      bSplashRange:"splashRange", bGetZenyNum:"zenyBonusRate", bAbsorbDmgMaxHP2:"absorbDamageMaxHpRate"
    };
    if (scalars[type]) {
      let v = n(value, 1);
      if (["bVariableCastrate","bFixedCastrate","bDelayrate"].includes(type)) v = -v;
      addScalar(out, scalars[type], v); return;
    }
    const keyed = {
      bAddRace:"physicalRaceDamage", bMagicAddRace:"magicRaceDamage", bSubRace:"raceResist",
      bAddEle:"physicalElementDamage", bMagicAddEle:"magicElementDamage", bSubEle:"elementResist",
      bMagicAtkEle:"magicAttackElementDamage", bAddSize:"sizeDamage", bMagicAddSize:"magicSizeDamage", bSubSize:"sizeResist", bMagicSubSize:"magicSizeResist", bWeaponSubSize:"physicalSizeResist",
      bAddClass:"physicalClassDamage", bMagicAddClass:"magicClassDamage", bSubClass:"classResist",
      bExpAddRace:"expRaceRate", bCriticalAddRace:"criticalRaceRate", bSPGainRace:"spGainRace", bIgnoreDefRaceRate:"ignoreDefRaceRate",
      bIgnoreDefRace:"ignoreDefRaceRate", bIgnoreMdefRaceRate:"ignoreMdefRaceRate", bIgnoreMResRaceRate:"ignoreMresRaceRate",
      bIgnoreDefClassRate:"ignoreDefClassRate", bIgnoreDefClass:"ignoreDefClassRate", bIgnoreMdefClassRate:"ignoreMdefClassRate",
      bAddRace2:"physicalRace2Damage", bSubDefEle:"enemyArmorElementResist",
      bResEff:"statusResist", bAddEff:"statusOnAttack", bAddEffWhenHit:"statusWhenHit", bAddEff2:"statusOnAttack"
    };
    if (keyed[type]) { addKeyed(out, keyed[type], a[0], a[1] ?? value); return; }
    if (type === "bSkillAtk") { addKeyed(out, "skillDamageRate", normalizeSkillKey(a[0]), a[1]); return; }
    if (type === "bSubSkill") { addKeyed(out, "skillDamageReductionRate", normalizeSkillKey(a[0]), a[1]); return; }
    if (type === "bSkillCooldown") { addKeyed(out, "skillCooldownReductionMs", resolveSkillStorageKey(a[0]), -n(a[1])); return; }
    if (type === "bSkillFixedCast") { addKeyed(out, "skillFixedCastReductionMs", resolveSkillStorageKey(a[0]), -n(a[1])); return; }
    if (type === "bSkillVariableCast") { addKeyed(out, "skillVariableCastReductionMs", resolveSkillStorageKey(a[0]), -n(a[1])); return; }
    if (type === "bSkillUseSP") { addKeyed(out, "skillSpCostFlat", normalizeSkillKey(a[0]), n(a[1])); return; }
    if (type === "bSkillUseSPrate") { addKeyed(out, "skillSpCostRate", normalizeSkillKey(a[0]), n(a[1])); return; }
    if (type === "bUseSPrate") { addScalar(out, "spCostRate", n(value)); return; }
    if (type === "bFixedCast") { addScalar(out, "fixedCastReductionMs", -n(value)); return; }
    if (type === "bDefEle") { out.armorElement = normalizeConstant(a[0] ?? value); return; }
    if (type === "bAtkEle") { out.weaponElement = normalizeConstant(a[0] ?? value); return; }
    if (type === "bAddEffOnSkill") {
      push(out, "skillStatusOnHit", { skill:resolveSkillStorageKey(a[0]), status:normalizeConstant(a[1]), rate:n(a[2]), extra:a.slice(3) }); return;
    }
    if (type === "bAutoSpell" || type === "bAutoSpellWhenHit" || type === "bAutoSpellOnSkill") {
      const trigger = type === "bAutoSpell" ? "attack" : type === "bAutoSpellWhenHit" ? "hit" : "skill";
      push(out, "autoSpellProcs", { trigger, skill:normalizeSkillKey(a[0]), level:n(a[1],1), rate:n(a[2]), extra:a.slice(3) }); return;
    }
    if (type === "bAddMonsterDropItem") {
      push(out, "extraDrops", { kind:"item", itemId:n(a[0]), rate:n(a[1]), extra:a.slice(2) }); return;
    }
    if (type === "bAddMonsterDropItemGroup") {
      push(out, "extraDrops", { kind:"group", group:String(a[0]).toUpperCase(), rate:n(a[1]) }); return;
    }
    if (type === "bHPDrainRate" || type === "bSPDrainRate") {
      push(out, type === "bHPDrainRate" ? "hpDrainProcs" : "spDrainProcs", { rate:n(a[0]), percent:n(a[1]), extra:a.slice(2) }); return;
    }
    if (type === "bAddItemHealRate" || type === "bAddItemSPHealRate") {
      const isHp = type === "bAddItemHealRate";
      if (a.length <= 1) addScalar(out, isHp ? "itemHpRecoveryRate" : "itemSpRecoveryRate", a[0] ?? value);
      else addKeyed(out, isHp ? "itemHpHealRate" : "itemSpHealRate", a[0], a[1]);
      return;
    }
    if (type === "bAddItemGroupHealRate") { addKeyed(out, "itemGroupHealRate", a[0], a[1]); return; }
    if (type === "bAddDamageClass" || type === "bAddDefMonster") { addKeyed(out, type === "bAddDamageClass" ? "monsterDamageFlat" : "monsterDefenseFlat", a[0], a[1]); return; }
    if (type === "bBreakArmorRate" || type === "bBreakWeaponRate") { addScalar(out, type === "bBreakArmorRate" ? "breakArmorRate" : "breakWeaponRate", value); return; }
    if (type === "bComaRace" || type === "bComaClass") { addKeyed(out, type === "bComaRace" ? "comaRaceRate" : "comaClassRate", a[0], a[1]); return; }
    if (type === "bRegenPercentHP") { push(out,"percentHpRegen",{percent:n(a[0]),intervalMs:n(a[1])}); return; }
    if (type === "bNoRegen") { const flag=n(a[0] ?? value,1); if(flag===1||flag===3)addScalar(out,"noHpRegen",1); if(flag===2||flag===3)addScalar(out,"noSpRegen",1); return; }
    if (type === "bHPLossRate") { push(out,"periodicHpLoss",{amount:n(a[0]),intervalMs:Math.max(100,n(a[1],1000))}); return; }
    if (type === "bSPLossRate") { push(out,"periodicSpLoss",{amount:n(a[0]),intervalMs:Math.max(100,n(a[1],1000))}); return; }
    if (type === "bSPVanishRate") { push(out,"spVanishOnHit",{rate:n(a[0]),percent:n(a[1]),flags:a.slice(2)}); return; }
    if (type === "bAddSkillBlow") { addKeyed(out,"skillKnockbackBonus",normalizeSkillKey(a[0]),a[1]); return; }
    if (type === "bDefRatioAtkClass") { addKeyed(out,"defRatioAttackClass",a[0],a[1] ?? 100); return; }
    if (type === "bClassChange") { addScalar(out,"classChangeRate",a[0] ?? value); return; }
    out.rawBonuses = out.rawBonuses || {};
    push(out.rawBonuses, type || "unknown", a);
  }

  function nestedTransform(source) {
    // Nested autobonus strings are the only scripts left in raw command form after build-time compilation.
    return String(source || "")
      .replace(/\.\@([A-Za-z_]\w*)/g, "v.$1")
      .replace(/\b(bonus5|bonus4|bonus3|bonus2|bonus|skill|sc_start|heal|showscript|specialeffect2|active_transform)\s+([^;]+);/g, (all,cmd,args) => {
        const list = args.split(/,(?![^"']*["'])/).map(x=>x.trim());
        if (/^bonus/.test(cmd) && /^[A-Za-z_]\w*$/.test(list[0]||"")) list[0]=JSON.stringify(list[0]);
        if ((cmd==="skill"||cmd==="sc_start") && /^[A-Za-z_]\w*$/.test(list[0]||"")) list[0]=JSON.stringify(list[0]);
        return `${cmd}(${list.join(",")});`;
      });
  }

  function executeScript(record, context = {}) {
    const out = { id:record.id, name:record.name || record.id, sourceType:context.sourceType || "card", sourceId:record.id };
    const vars = {};
    const equippedIds = context.equippedIds || equipmentRows().flatMap(row => [row.itemId, ...(row.instance?.cards || []).filter(Boolean).map(Number)]);
    const helpers = {
      v: vars,
      bonus: (type,...args) => applyBonus(out,type,args), bonus2:(type,...args)=>applyBonus(out,type,args), bonus3:(type,...args)=>applyBonus(out,type,args),
      bonus4:(type,...args)=>applyBonus(out,type,args), bonus5:(type,...args)=>applyBonus(out,type,args),
      skill: (skill,level) => { const key=resolveSkillStorageKey(skill); out.grantedSkills=out.grantedSkills||{}; out.grantedSkills[key]=Math.max(n(out.grantedSkills[key]),n(level,1)); },
      autobonus: (script,rate,duration,...extra) => push(out,"autoBonuses",{trigger:"attack",script:String(script),rate:n(rate),durationMs:n(duration),extra}),
      autobonus2: (script,rate,duration,...extra) => push(out,"autoBonuses",{trigger:"hit",script:String(script),rate:n(rate),durationMs:n(duration),extra}),
      autobonus3: (script,rate,duration,skill,...extra) => push(out,"autoBonuses",{trigger:"skill",script:String(script),rate:n(rate),durationMs:n(duration),skill:normalizeSkillKey(skill),extra}),
      sc_start: (status,duration,value,...extra) => push(out,"statusStarts",{status:normalizeConstant(status),durationMs:n(duration),value:n(value),extra}),
      heal: (hp,sp) => { addScalar(out,"instantHealHp",hp); addScalar(out,"instantHealSp",sp); },
      showscript: ()=>{}, specialeffect2:()=>{}, active_transform:(id,duration)=>push(out,"transforms",{id,durationMs:n(duration)}),
      getrefine: () => n(context.hostRow?.refine ?? context.maxRefine),
      getequiprefinerycnt: token => n(getSlotRow(token,context)?.refine),
      getequipid: token => n(getSlotRow(token,context)?.itemId),
      getequipweaponlv: token => n(getSlotRow(token,context)?.item?.weaponLevel || getSlotRow(token,context)?.item?.WeaponLevel),
      getiteminfo: (id,info) => { const item=window.getItemData?.(id); return String(info)==="ITEMINFO_VIEW" ? getItemView(item) : n(item?.[String(info)]); },
      readparam: token => statValue(token), getskilllv: skill => { const resolved=resolveSkill(skill); return n(window.getSkillLevel?.(resolved?.officialId ?? resolved?.id ?? skill)); },
      isequipped: (...ids) => ids.every(id => equippedIds.map(String).includes(String(id))), eaclass:eaclassMask,
      min:Math.min, max:Math.max, pow:Math.pow,
      BaseLevel:n(window.player?.baseLevel,1), JobLevel:n(window.player?.jobLevel,1), BaseJob:currentJobToken(), BaseClass:currentJobToken(), Class:currentJobToken(), Sex:String(window.player?.gender||""),
      EAJL_THIRD:4, EAJL_FOURTH:8
    };
    const scope = new Proxy(helpers, {
      has: () => true,
      get(target,key) {
        if (key === Symbol.unscopables) return undefined;
        if (Object.prototype.hasOwnProperty.call(target,key)) return target[key];
        const raw=String(key);
        if (raw.startsWith("EQI_")) return raw;
        if (raw.startsWith("Job_") || raw.startsWith("RC_") || raw.startsWith("RC2_") || raw.startsWith("Ele_") || raw.startsWith("Size_") || raw.startsWith("Class_") || raw.startsWith("Eff_") || raw.startsWith("SC_") || raw.startsWith("W_") || raw.startsWith("ITEMINFO_")) return raw;
        return raw;
      },
      set(target,key,value){ target[key]=value; return true; }
    });
    try {
      let fn=COMPILED.get(record.id);
      if (!fn) { fn=new Function("scope",`with(scope){${record.compiledScript || ""}}`); COMPILED.set(record.id,fn); }
      fn(scope);
    } catch (error) {
      out.runtimeError=String(error?.message||error); console.warn("[CardRuntime] script error",record.id,error);
    }
    return out;
  }

  function mergeSource(target, source) {
    for (const [key,value] of Object.entries(source||{})) {
      if (["id","name","sourceId","sourceType","runtimeError"].includes(key)) continue;
      if (typeof value === "number") addScalar(target,key,value);
      else if (Array.isArray(value)) { target[key]=Array.isArray(target[key])?target[key]:[]; target[key].push(...value); }
      else if (value && typeof value === "object") {
        target[key]=target[key]&&typeof target[key]==="object"&&!Array.isArray(target[key])?target[key]:{};
        for (const [sub,v] of Object.entries(value)) {
          if (typeof v === "number") target[key][sub]=n(target[key][sub])+v;
          else if (Array.isArray(v)) { target[key][sub]=Array.isArray(target[key][sub])?target[key][sub]:[]; target[key][sub].push(...v); }
          else target[key][sub]=v;
        }
      } else if (value !== undefined) target[key]=value;
    }
    return target;
  }

  function tempSources() {
    const now=Date.now(), store=window.player?.cardRuntimeTempBonuses || {}, out=[];
    for (const [key,row] of Object.entries(store)) {
      if (!row || n(row.expiresAt)<=now) { delete store[key]; continue; }
      if (row.source) out.push(row.source);
    }
    return out;
  }
  function getSources() {
    init();
    const sig=signature();
    if (CACHE.signature===sig) return CACHE.sources;
    const rows=equipmentRows(), equippedIds=rows.flatMap(row=>[row.itemId,...(row.instance?.cards||[]).filter(Boolean).map(Number)]);
    const sources=[];
    for (const row of rows) {
      const equipmentRecord = DATA.equipment[String(row.itemId)];
      if (equipmentRecord) {
        sources.push(executeScript(equipmentRecord,{sourceType:"equipment",slot:row.slot,hostRow:row,equippedIds,maxRefine:Math.max(0,...rows.map(x=>x.refine))}));
      }
      for (const cardId of (row.instance?.cards || []).filter(Boolean)) {
        const rec=DATA.effects[String(cardId)]; if (!rec) continue;
        sources.push(executeScript(rec,{sourceType:"card",slot:row.slot,hostRow:row,equippedIds,maxRefine:Math.max(0,...rows.map(x=>x.refine))}));
      }
    }
    const counts={}; equippedIds.forEach(id=>counts[String(id)]=n(counts[String(id)])+1);
    for (const combo of DATA.combos) {
      const need={}; combo.requiredItemIds.forEach(id=>need[String(id)]=n(need[String(id)])+1);
      if (!Object.entries(need).every(([id,count])=>n(counts[id])>=count)) continue;
      sources.push(executeScript(combo,{sourceType:"combo",equippedIds,maxRefine:Math.max(0,...rows.map(x=>x.refine))}));
    }
    sources.push(...tempSources());
    CACHE.signature=sig; CACHE.sources=sources; CACHE.all=null;
    return sources;
  }
  function getMergedSource() {
    if (CACHE.all && CACHE.signature===signature()) return CACHE.all;
    const merged={id:"card_runtime_total",name:"卡片與套裝總和",sourceType:"cardTotal"};
    getSources().forEach(source=>mergeSource(merged,source)); CACHE.all=merged; return merged;
  }
  function invalidate() { CACHE.signature=""; CACHE.all=null; }
  function isCardCompatible(card, item, slot) {
    const targets=card?.cardTarget || DATA.effects?.[String(card?.id)]?.cardTarget || [];
    if (!Array.isArray(targets) || !targets.length) return false;
    const itemLoc=item?.locations || item?.Locations || {};
    const normalizedSlot=String(slot||item?.equipSlot||item?.slot||"");
    const candidates=new Set([normalizedSlot]);
    if (normalizedSlot.startsWith("head")) candidates.add("head");
    if (normalizedSlot.startsWith("accessory")) candidates.add("accessory");
    if (itemLoc.Right_Hand||itemLoc.Both_Hand) candidates.add("weapon");
    if (itemLoc.Armor) candidates.add("body"); if(itemLoc.Shield) candidates.add("shield"); if(itemLoc.Garment)candidates.add("garment"); if(itemLoc.Shoes)candidates.add("shoes");
    if (itemLoc.Accessory||itemLoc.Accessory_Left||itemLoc.Accessory_Right||itemLoc.Both_Accessory||itemLoc.Left_Accessory||itemLoc.Right_Accessory) candidates.add("accessory");
    if (itemLoc.Both_Accessory) { candidates.add("accessory1"); candidates.add("accessory2"); }
    if (itemLoc.Accessory_Left||itemLoc.Left_Accessory) candidates.add("accessory1");
    if (itemLoc.Accessory_Right||itemLoc.Right_Accessory) candidates.add("accessory2");
    if (itemLoc.Head_Top||itemLoc.Head_Mid||itemLoc.Head_Low) candidates.add("head");
    return targets.some(target=>candidates.has(String(target)));
  }
  function socketCard(cardId, instanceId) {
    init();
    const card=window.getItemData?.(cardId) || DATA.effects[String(cardId)];
    const cardRow=(window.player?.inventory||[]).find(row=>String(row.id)===String(cardId)&&n(row.count)>0);
    const instance=(window.player?.inventory||[]).find(row=>String(row.instanceId||"")===String(instanceId||""));
    const item=window.getItemData?.(instance?.id);
    if (!cardRow || !instance || !item || String(item.type)!=="equipment") return {ok:false,reason:"找不到卡片或裝備實例"};
    const slotCount=Math.max(0,Math.min(4,Math.floor(n(item.slotCount ?? item.slots ?? item.Slots))));
    instance.cards=Array.isArray(instance.cards)?instance.cards.slice(0,4):[null,null,null,null]; while(instance.cards.length<4)instance.cards.push(null);
    const empty=instance.cards.slice(0,slotCount).findIndex(x=>!x); if(empty<0)return {ok:false,reason:"這件裝備沒有空插槽"};
    if (!isCardCompatible(card,item,item.equipSlot||item.slot)) return {ok:false,reason:"卡片部位與裝備不相容"};
    instance.cards[empty]=Number(cardId); cardRow.count=n(cardRow.count)-1;
    if(cardRow.count<=0)player.inventory.splice(player.inventory.indexOf(cardRow),1);
    invalidate(); window.recalculatePlayerStats?.(); window.updateInventoryUI?.(); window.updateEquipmentUI?.(); window.updatePlayerUI?.(); window.saveGame?.();
    return {ok:true,instance,card,slotIndex:empty};
  }
  function getSocketCandidates(cardId) {
    init(); const card=window.getItemData?.(cardId)||DATA.effects[String(cardId)];
    return (window.player?.inventory||[]).filter(row=>row?.instanceId).map(instance=>({instance,item:window.getItemData?.(instance.id)})).filter(({instance,item})=>{
      if(!item||String(item.type)!=="equipment")return false;
      const slots=Math.max(0,Math.min(4,Math.floor(n(item.slotCount??item.slots??item.Slots))));
      return slots>0&&(instance.cards||[]).slice(0,slots).some(x=>!x)&&isCardCompatible(card,item,item.equipSlot||item.slot);
    });
  }
  function removeAllCardsFromEquipped(slot, randomFn=Math.random) {
    const instance=window.getEquipmentInstance?.(slot)||window.player?.equipmentInstances?.[slot];
    const item=window.getItemData?.(instance?.id); const cards=(instance?.cards||[]).filter(Boolean);
    if(!instance||!item||!cards.length)return {ok:false,reason:"該穿戴裝備沒有卡片"};
    const fee=1000000; if(n(player.zeny)<fee)return {ok:false,reason:"Zeny 不足，需要 1,000,000 Zeny"};
    player.zeny=Math.max(0,n(player.zeny)-fee);
    const hasMvp=cards.some(id=>(DATA.effects[String(id)]||window.getItemData?.(id))?.isMvpCard===true);
    const chance=hasMvp?10:50; const success=n(randomFn(),1)*100<chance;
    if(!success){window.updatePlayerUI?.();window.saveGame?.();return {ok:false,failed:true,fee,chance,hasMvp,cards:[...cards],item,instance};}
    const sameInstanceSlots=[];
    for(const [equipSlot,equipInstance] of Object.entries(player.equipmentInstances||{})){
      if(equipInstance===instance || (instance.instanceId&&String(equipInstance?.instanceId||"")===String(instance.instanceId)))sameInstanceSlots.push(equipSlot);
    }
    if(!sameInstanceSlots.length)sameInstanceSlots.push(slot);
    sameInstanceSlots.forEach(equipSlot=>{ if(player.equipment)player.equipment[equipSlot]=null; if(player.equipmentInstances)delete player.equipmentInstances[equipSlot]; });
    instance.cards=[null,null,null,null];
    if(!(player.inventory||[]).some(row=>row===instance || (instance.instanceId&&String(row?.instanceId||"")===String(instance.instanceId))))player.inventory.push(instance);
    cards.forEach(id=>window.addItem?.({id:Number(id),name:(window.getItemData?.(id)||DATA.effects[String(id)])?.name},1));
    invalidate(); window.syncEquipmentGrantedSkills?.(); window.recalculatePlayerStats?.(); window.updateEquipmentUI?.(); window.updateInventoryUI?.(); window.updatePlayerUI?.(); window.saveGame?.();
    return {ok:true,fee,chance,hasMvp,cards,item,instance};
  }
  function applyTempBonus(auto, origin) {
    if(!window.player)return false;
    const chance=Math.max(0,n(auto.rate)); if(Math.random()*10000>=chance)return false;
    const nested={id:`temp_${origin.sourceId}_${Date.now()}_${Math.random()}`,name:`${origin.name} 自動效果`,compiledScript:nestedTransform(auto.script),sourceType:"cardTemp"};
    let source;
    try { source=executeScript(nested,{sourceType:"cardTemp",equippedIds:equipmentRows().flatMap(r=>[r.itemId,...(r.instance?.cards||[]).filter(Boolean)])}); }
    catch(_){return false;}
    player.cardRuntimeTempBonuses=player.cardRuntimeTempBonuses||{};
    player.cardRuntimeTempBonuses[nested.id]={expiresAt:Date.now()+Math.max(100,n(auto.durationMs)),source}; invalidate(); window.recalculatePlayerStats?.();
    return true;
  }
  function triggerAutoSpell(proc,target) {
    if(Math.random()*10000>=Math.max(0,n(proc.rate)))return false;
    const skill=resolveSkill(proc.skill); if(!skill)return false;
    const level=Math.max(1,n(proc.level,1));
    try { return !!window.castAttackSkill?.(skill,level,{source:"card_autospell",ignoreSpCostCheck:true,triggerSource:"normal_attack_proc",skipAnimation:true}); }
    catch(_){return false;}
  }
  function onNormalAttack(target,damage) {
    const sources=getSources(); let triggered=0;
    for(const source of sources){
      for(const proc of source.autoSpellProcs||[])if(proc.trigger==="attack"&&triggerAutoSpell(proc,target))triggered++;
      for(const auto of source.autoBonuses||[])if(auto.trigger==="attack"&&applyTempBonus(auto,source))triggered++;
      for(const drain of source.hpDrainProcs||[])if(Math.random()*10000<n(drain.rate)){const heal=Math.max(1,Math.floor(n(damage)*n(drain.percent)/100));player.hp=Math.min(n(player.maxHp),n(player.hp)+heal);}
      for(const drain of source.spDrainProcs||[])if(Math.random()*10000<n(drain.rate)){const heal=Math.max(1,Math.floor(n(damage)*n(drain.percent)/100));player.sp=Math.min(n(player.maxSp),n(player.sp)+heal);}
      for(const [status,rate] of Object.entries(source.statusOnAttack||{}))if(target&&Math.random()*10000<n(rate))window.StatusManager?.apply?.(target,status,{chancePercent:100,durationMs:5000,level:1,allowBoss:false});
      for(const row of source.spVanishOnHit||[])if(target&&Math.random()*10000<n(row.rate)){const current=n(target.sp??target.currentSp);const loss=Math.max(0,Math.floor(current*n(row.percent)/100));if(target.sp!==undefined)target.sp=Math.max(0,current-loss);if(target.currentSp!==undefined)target.currentSp=Math.max(0,current-loss);}
    }
    if(triggered)window.updatePlayerUI?.(); return triggered;
  }
  function onPlayerDamaged(attacker,damage) {
    let triggered=0; for(const source of getSources()){
      for(const proc of source.autoSpellProcs||[])if(proc.trigger==="hit"&&triggerAutoSpell(proc,attacker))triggered++;
      for(const auto of source.autoBonuses||[])if(auto.trigger==="hit"&&applyTempBonus(auto,source))triggered++;
      for(const [status,rate] of Object.entries(source.statusWhenHit||{}))if(attacker&&Math.random()*10000<n(rate))window.StatusManager?.apply?.(attacker,status,{chancePercent:100,durationMs:5000,level:1,allowBoss:false});
    } return triggered;
  }
  function onSkillUsed(skill,target) {
    const keys=new Set([
      resolveSkillStorageKey(skill?.officialId ?? skill?.id ?? skill?.key ?? skill?.skillKey ?? skill?.aegisName),
      normalizeSkillKey(skill?.key||""), normalizeSkillKey(skill?.skillKey||""), normalizeSkillKey(skill?.aegisName||""),
      String(skill?.officialId ?? ""), String(skill?.id ?? "")
    ].filter(Boolean));
    let triggered=0;
    for(const source of getSources()){
      for(const auto of source.autoBonuses||[])if(auto.trigger==="skill"&&(!auto.skill||keys.has(resolveSkillStorageKey(auto.skill))||keys.has(normalizeSkillKey(auto.skill)))&&applyTempBonus(auto,source))triggered++;
      for(const proc of source.autoSpellProcs||[])if(proc.trigger==="skill"&&triggerAutoSpell(proc,target))triggered++;
      for(const row of source.skillStatusOnHit||[])if(target&&(keys.has(String(row.skill))||keys.has(resolveSkillStorageKey(row.skill)))&&Math.random()*10000<n(row.rate)){
        window.StatusManager?.apply?.(target,row.status,{chancePercent:100,durationMs:5000,level:1,allowBoss:false}); triggered++;
      }
    } return triggered;
  }
  function rollExtraDrops(monster) {
    if(!monster)return [];
    const awarded=[]; const extras=getSources().flatMap(source=>(source.extraDrops||[]).map(drop=>({...drop,sourceName:source.name})));
    for(const drop of extras){
      const raw=Math.max(0,n(drop.rate)); const rated=typeof window.applyRate==="function"?window.applyRate(raw,"drop"):raw;
      if(Math.random()*10000>=Math.min(10000,rated))continue;
      let itemId=drop.itemId,amount=1;
      if(drop.kind==="group"){
        const group=DATA.groups[String(drop.group).toUpperCase()]; const entries=group?.entries||[]; if(!entries.length)continue;
        const total=entries.reduce((s,x)=>s+Math.max(0,n(x.rate)),0); let roll=Math.random()*Math.max(1,total),selected=entries[entries.length-1];
        for(const entry of entries){roll-=Math.max(0,n(entry.rate));if(roll<=0){selected=entry;break;}}
        itemId=selected.itemId; amount=Math.max(1,n(selected.amount,1));
      }
      const item=window.getItemData?.(itemId); if(!item)continue;
      window.addItem?.({id:Number(itemId),name:item.name},amount); window.recordItemDrop?.(itemId,amount);
      window.emitLootRewardLog?.(`${drop.sourceName||"卡片"}：額外取得 ${item.name} ×${amount}。`,"item"); awarded.push({itemId,amount,source:drop.sourceName});
    } return awarded;
  }
  function onMonsterDefeated(monster) {
    const total=getMergedSource(); let changed=false;
    if(n(total.killHpFlat)){player.hp=Math.min(n(player.maxHp),n(player.hp)+n(total.killHpFlat));changed=true;}
    if(n(total.killSpFlat)){player.sp=Math.min(n(player.maxSp),n(player.sp)+n(total.killSpFlat));changed=true;}
    if(changed)window.updatePlayerUI?.(); return changed;
  }
  function getExpRate(monster) {
    const total=getMergedSource(),race=normalizeConstant(monster?.race||monster?.Race||"All");
    return n(total.expRaceRate?.[race])+n(total.expRaceRate?.All);
  }
  function getSkillDamageRate(skill) {
    const map=getMergedSource().skillDamageRate||{}, keys=[String(skill?.officialId??skill?.id??0),normalizeSkillKey(skill?.key||""),normalizeSkillKey(skill?.skillKey||""),normalizeSkillKey(skill?.aegisName||"")];
    return keys.reduce((sum,key)=>sum+n(map[key]),n(map.All));
  }
  function getSkillSpCostModifier(skill) {
    const total=getMergedSource(), mapFlat=total.skillSpCostFlat||{}, mapRate=total.skillSpCostRate||{}, keys=[String(skill?.officialId??skill?.id??0),normalizeSkillKey(skill?.key||""),normalizeSkillKey(skill?.skillKey||""),normalizeSkillKey(skill?.aegisName||"")];
    return {flat:keys.reduce((s,k)=>s+n(mapFlat[k]),n(mapFlat.All)),rate:n(total.spCostRate)+keys.reduce((s,k)=>s+n(mapRate[k]),n(mapRate.All))};
  }

  function getItemRecoveryRate(item, kind = "hp") {
    const total=getMergedSource();
    const isSp=String(kind||"hp").toLowerCase()==="sp";
    const id=String(item?.id ?? item?.officialId ?? item?.itemId ?? item ?? "");
    let rate=n(total[isSp ? "itemSpRecoveryRate" : "itemHpRecoveryRate"]);
    const keyed=total[isSp ? "itemSpHealRate" : "itemHpHealRate"] || {};
    rate += n(keyed[id]);
    for (const [group,groupRate] of Object.entries(total.itemGroupHealRate || {})) {
      const entries=DATA.groups[String(group).toUpperCase()]?.entries || [];
      if(entries.some(row=>String(row.itemId)===id)) rate += n(groupRate);
    }
    return rate;
  }
  function tickPeriodicEffects(now=Date.now()) {
    if(!window.player)return false;
    const sources=getSources(), state=player.cardRuntimePeriodicState=player.cardRuntimePeriodicState||{};
    let changed=false;
    for(const source of sources){
      for(const [kind,field,minimum] of [["hp","periodicHpLoss",1],["sp","periodicSpLoss",0]]){
        for(let i=0;i<(source[field]||[]).length;i++){
          const row=source[field][i],key=`${source.sourceType}:${source.sourceId}:${field}:${i}`,due=n(state[key]);
          if(due>now)continue;
          state[key]=now+Math.max(100,n(row.intervalMs,1000));
          const before=n(player[kind]); player[kind]=Math.max(minimum,before-Math.max(0,n(row.amount))); changed=changed||player[kind]!==before;
        }
      }
    }
    if(changed){window.updatePlayerUI?.();window.saveGame?.();}
    return changed;
  }

  window.CardRuntime = {
    version:"0.9.82FW", init, invalidate, getSources, getMergedSource, getCardRecord:id=>(init(),DATA.effects[String(id)]||null),
    getComboRecords:()=> (init(),DATA.combos), getSocketCandidates, socketCard, isCardCompatible, removeAllCardsFromEquipped,
    onNormalAttack,onPlayerDamaged,onSkillUsed,onMonsterDefeated,rollExtraDrops,getExpRate,getSkillDamageRate,getSkillSpCostModifier,getItemRecoveryRate,tickPeriodicEffects,
    getBuildCounts:()=>({cards:Object.keys(DATA.effects).length,equipmentScripts:Object.keys(DATA.equipment).length,combos:DATA.combos.length,dropSources:Object.values(DATA.drops).reduce((n,x)=>n+(x?.length||0),0)}),
    _debugEvaluateRecord:(record,context={})=>executeScript(record,context), _debugData:()=>DATA, _debugResolveSkill:resolveSkill
  };
  window.invalidateCardRuntime = invalidate;
  if(typeof document!=="undefined")document.addEventListener("DOMContentLoaded",init,{once:true});
  if(typeof window.setInterval==="function")window.setInterval(()=>tickPeriodicEffects(Date.now()),500);
})();
