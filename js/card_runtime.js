//=======================================
// RO_WEB CardRuntime v0.9.82FX
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
  // Internal battle-filter flags. They only need to be stable inside RO_WEB;
  // raw rAthena expressions such as BF_WEAPON|BF_MAGIC are converted to these
  // numeric masks before proc matching, so future scripts do not silently lose
  // their trigger conditions through JavaScript string bitwise coercion.
  const BATTLE_FLAGS = Object.freeze({
    BF_WEAPON:1 << 0, BF_MAGIC:1 << 1, BF_MISC:1 << 2,
    BF_SHORT:1 << 3, BF_LONG:1 << 4, BF_SKILL:1 << 5, BF_NORMAL:1 << 6
  });
  // rAthena attack-status filters. Keep these separate from BF_* because ATF_*
  // also controls who receives the status (wearer / attack target).
  const ATTACK_STATUS_FLAGS = Object.freeze({
    ATF_SELF:1 << 0, ATF_TARGET:1 << 1,
    ATF_SHORT:1 << 2, ATF_LONG:1 << 3,
    ATF_WEAPON:1 << 4, ATF_MAGIC:1 << 5, ATF_MISC:1 << 6
  });
  const DIAGNOSTICS = { runtimeErrors:[], unhandledBonuses:{}, warnings:[] };
  const DIAGNOSTIC_KEYS = new Set();

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
      rows.push({ slot, itemId: Number(itemId), item, instance, refine: n(instance?.refine), grade: n(instance?.enchantGrade ?? instance?.grade) });
    }
    return rows;
  }
  function signature() {
    const equipment = equipmentRows().map(row => [row.slot, row.itemId, row.refine, row.grade, ...(row.instance?.cards || [])]);
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

  const SUPPORTED_BONUS_TYPES = new Set([
    "bAbsorbDmgMaxHP2","bAddClass","bAddDamageClass","bAddDefMonster","bAddEff","bAddEff2","bAddEffOnSkill","bAddEffWhenHit",
    "bAddEle","bAddItemGroupHealRate","bAddItemHealRate","bAddItemSPHealRate","bAddMonsterDropItem","bAddMonsterDropItemGroup",
    "bAddRace","bAddRace2","bAddSize","bAddSkillBlow","bAgi","bAllStats","bAspd","bAspdRate","bAtkEle","bAtkRate",
    "bAutoSpell","bAutoSpellOnSkill","bAutoSpellWhenHit","bBaseAtk","bBreakArmorRate","bBreakWeaponRate","bCRate","bClassChange",
    "bComaClass","bComaRace","bCon","bCritAtkRate","bCritical","bCriticalAddRace","bCriticalLong","bCriticalRate","bCrt","bDef","bDefEle",
    "bDefRate","bDefRatioAtkClass","bDelayrate","bDex","bExpAddRace","bFixedCast","bFixedCastrate","bFlee","bFlee2","bGetZenyNum",
    "bHPDrainRate","bHPGainValue","bHPLossRate","bHPRegenRate","bHPrecovRate","bHealPower","bHealPower2","bHit",
    "bIgnoreDefClass","bIgnoreDefClassRate","bIgnoreDefRace","bIgnoreDefRaceRate","bIgnoreMResRaceRate","bIgnoreMdefClassRate",
    "bIgnoreMdefRaceRate","bInt","bIntravision","bLongAtkDef","bLongAtkRate","bLuk","bMagicAddClass","bMagicAddEle","bMagicAddRace",
    "bMagicAddSize","bMagicAtkEle","bMagicDamageReturn","bMagicHPGainValue","bMagicSubSize","bMatk","bMatkRate","bMaxHP","bMaxHPrate",
    "bMaxSP","bMaxSPrate","bMdef","bMdefRate","bNearAtkDef","bNoCastCancel","bNoGemStone","bNoKnockback","bNoMadoFuel",
    "bNoMagicDamage","bNoRegen","bNoSizeFix","bNoWalkDelay","bPAtk","bPerfectHitAddRate","bPow","bReduceDamageReturn",
    "bRegenPercentHP","bRes","bMRes","bResEff","bRestartFullRecover","bSMatk","bSPDrainRate","bSPDrainValue","bSPGainRace","bSPGainValue",
    "bSPLossRate","bSPRegenRate","bSPVanishRate","bSPrecovRate","bShortAtkRate","bShortWeaponDamageReturn","bSkillAtk",
    "bSkillCooldown","bSkillFixedCast","bSkillUseSP","bSkillUseSPrate","bSkillVariableCast","bSpeedRate","bSpl","bSplashRange",
    "bSta","bStr","bSubClass","bSubDefEle","bSubEle","bSubRace","bSubSize","bSubSkill","bUnbreakableArmor","bUnbreakableShield",
    "bUnbreakableWeapon","bUseSPrate","bVariableCastrate","bVit","bWeaponAtkRate","bWeaponDamageRate","bWeaponSubSize","bWis"
  ]);

  function looksLikeSkill(value) {
    const raw=String(value??"");
    return /^\d+$/.test(raw) || /^[A-Z][A-Z0-9_]+$/.test(raw) || raw.includes("_");
  }
  function applyBonus(out, type, args) {
    type = String(type || "");
    const a = args || [], value = a.length ? a[a.length - 1] : 1;
    const scalars = {
      bStr:"strFlat", bAgi:"agiFlat", bVit:"vitFlat", bInt:"intFlat", bDex:"dexFlat", bLuk:"lukFlat", bAllStats:"allStatsFlat",
      bPow:"powFlat", bSta:"staFlat", bWis:"wisFlat", bSpl:"splFlat", bCon:"conFlat", bCrt:"crtFlat",
      bBaseAtk:"atkFlat", bAtkRate:"atkRate", bWeaponAtkRate:"weaponAtkRate",
      bMatk:"matkFlat", bMatkRate:"matkRate", bDef:"defFlat", bDefRate:"defRate", bMdef:"mdefFlat", bMdefRate:"mdefRate",
      bHit:"hitFlat", bFlee:"fleeFlat", bCritical:"criFlat", bCriticalRate:"criRate", bFlee2:"perfectDodgeFlat", bPerfectHitAddRate:"perfectHitRate",
      bAspd:"aspdFlat", bAspdRate:"aspdRate", bMaxHP:"maxHpFlat", bMaxHPrate:"maxHpRate", bMaxSP:"maxSpFlat", bMaxSPrate:"maxSpRate",
      bHPrecovRate:"hpRecoveryRate", bSPrecovRate:"spRecoveryRate",
      bLongAtkRate:"longDamageRate", bShortAtkRate:"shortDamageRate", bCritAtkRate:"critAtkRate", bCriticalLong:"longRangeCriticalChanceFlat",
      bHealPower:"healPowerRate", bHealPower2:"healingReceivedRate", bPAtk:"pAtk", bSMatk:"sMatk", bRes:"resFlat", bMRes:"mresFlat", bCRate:"crateFlat",
      bSpeedRate:"moveSpeedRate", bNearAtkDef:"shortDamageReduction", bLongAtkDef:"longDamageReduction",
      bReduceDamageReturn:"reflectDamageReductionRate", bMagicDamageReturn:"magicReflectRate", bShortWeaponDamageReturn:"shortPhysicalReflectRate",
      bHPGainValue:"killHpFlat", bSPGainValue:"killSpFlat", bMagicHPGainValue:"magicKillHpFlat", bSPDrainValue:"spOnAttackFlat",
      bNoWalkDelay:"noWalkDelay", bNoCastCancel:"noCastCancel", bNoSizeFix:"ignoreWeaponSizePenalty",
      bUnbreakableWeapon:"unbreakableWeapon", bUnbreakableArmor:"unbreakableArmor", bUnbreakableShield:"unbreakableShield",
      bNoKnockback:"noKnockback", bIntravision:"intravision", bNoGemStone:"noGemstone", bNoMadoFuel:"noMadoFuel",
      bNoMagicDamage:"magicImmune", bRestartFullRecover:"restartFullRecover", bSplashRange:"splashRange",
      bAbsorbDmgMaxHP2:"incomingDamageMaxHpCapRate"
    };
    if (scalars[type]) { addScalar(out, scalars[type], n(value, 1)); return; }
    if (type === "bVariableCastrate") { addScalar(out,"variableCastReductionRate",-n(value)); return; }
    if (type === "bDelayrate") { addScalar(out,"afterCastDelayReductionRate",-n(value)); return; }
    if (type === "bFixedCastrate") {
      if (a.length >= 2 && looksLikeSkill(a[0])) addKeyed(out,"skillFixedCastReductionRate",resolveSkillStorageKey(a[0]),-n(a[1]));
      else addScalar(out,"fixedCastReductionRate",-n(value));
      return;
    }
    if (type === "bFixedCast") { addScalar(out,"fixedCastReductionMs",-n(value)); return; }
    if (type === "bWeaponDamageRate") { addKeyed(out,"weaponTypeDamageRate",a[0],a[1] ?? value); return; }

    const keyed = {
      bAddRace:"physicalRaceDamage", bMagicAddRace:"magicRaceDamage", bSubRace:"raceResist",
      bAddEle:"physicalElementDamage", bMagicAddEle:"magicElementDamage", bSubEle:"elementResist",
      bMagicAtkEle:"magicAttackElementDamage", bAddSize:"sizeDamage", bMagicAddSize:"magicSizeDamage",
      bSubSize:"sizeResist", bMagicSubSize:"magicSizeResist", bWeaponSubSize:"physicalSizeResist",
      bAddClass:"physicalClassDamage", bMagicAddClass:"magicClassDamage", bSubClass:"classResist",
      bExpAddRace:"expRaceRate", bCriticalAddRace:"criticalChanceByRace", bSPGainRace:"spGainRace",
      bIgnoreDefRaceRate:"ignoreDefByRace", bIgnoreDefRace:"ignoreDefByRace", bIgnoreMdefRaceRate:"ignoreMdefByRace",
      bIgnoreMResRaceRate:"ignoreMresByRace", bIgnoreDefClassRate:"ignoreDefByClass", bIgnoreDefClass:"ignoreDefByClass",
      bIgnoreMdefClassRate:"ignoreMdefByClass", bAddRace2:"physicalRace2Damage", bSubDefEle:"enemyArmorElementResist",
      bResEff:"statusResist"
    };
    if (keyed[type]) { addKeyed(out, keyed[type], a[0], a[1] ?? value); return; }
    if (type === "bAddEff" || type === "bAddEffWhenHit") {
      const status=normalizeConstant(a[0]), rate=n(a[1] ?? value), flags=n(a[2]), durationMs=Math.max(100,n(a[3],5000));
      if(a.length<=2){addKeyed(out,type === "bAddEff" ? "statusOnAttack" : "statusWhenHit",status,rate);return;}
      push(out,type === "bAddEff" ? "statusOnAttackRules" : "statusWhenHitRules",{status,rate,flags,durationMs,extra:a.slice(4)});return;
    }
    if (type === "bAddEff2") { addKeyed(out,"statusOnSelfAttack",a[0],a[1] ?? value); return; }
    if (type === "bSkillAtk") { addKeyed(out, "skillDamageRate", resolveSkillStorageKey(a[0]), a[1]); return; }
    if (type === "bSubSkill") { addKeyed(out, "skillDamageReductionRate", resolveSkillStorageKey(a[0]), a[1]); return; }
    if (type === "bSkillCooldown") { addKeyed(out, "skillCooldownReductionMs", resolveSkillStorageKey(a[0]), -n(a[1])); return; }
    if (type === "bSkillFixedCast") { addKeyed(out, "skillFixedCastReductionMs", resolveSkillStorageKey(a[0]), -n(a[1])); return; }
    if (type === "bSkillVariableCast") { addKeyed(out, "skillVariableCastReductionMs", resolveSkillStorageKey(a[0]), -n(a[1])); return; }
    if (type === "bSkillUseSP") { addKeyed(out, "skillSpCostFlat", resolveSkillStorageKey(a[0]), n(a[1])); return; }
    if (type === "bSkillUseSPrate") { addKeyed(out, "skillSpCostRate", resolveSkillStorageKey(a[0]), n(a[1])); return; }
    if (type === "bUseSPrate") { addScalar(out, "spCostRate", n(value)); return; }
    if (type === "bDefEle") { out.armorElement = normalizeConstant(a[0] ?? value); return; }
    if (type === "bAtkEle") { out.weaponElement = normalizeConstant(a[0] ?? value); return; }
    if (type === "bAddEffOnSkill") {
      push(out, "skillStatusOnHit", { skill:resolveSkillStorageKey(a[0]), status:normalizeConstant(a[1]), rate:n(a[2]), extra:a.slice(3) }); return;
    }
    if (type === "bAutoSpell" || type === "bAutoSpellWhenHit") {
      const trigger = type === "bAutoSpell" ? "attack" : "hit";
      push(out,"autoSpellProcs",{trigger,skill:normalizeSkillKey(a[0]),level:n(a[1],1),rate:n(a[2]),attackFlags:n(a[3]),targetFlags:n(a[4]),extra:a.slice(5)}); return;
    }
    if (type === "bAutoSpellOnSkill") {
      push(out,"autoSpellProcs",{trigger:"skill",triggerSkill:resolveSkillStorageKey(a[0]),skill:normalizeSkillKey(a[1]),level:n(a[2],1),rate:n(a[3]),targetFlags:n(a[4]),extra:a.slice(5)}); return;
    }
    if (type === "bAddMonsterDropItem") {
      const conditioned=a.length>=3 && /^(RC2?|Class|Ele|Size)_/i.test(String(a[1]));
      push(out,"extraDrops",{kind:"item",itemId:n(a[0]),conditionRace:conditioned?normalizeConstant(a[1]):null,rate:n(conditioned?a[2]:a[1]),extra:a.slice(conditioned?3:2)}); return;
    }
    if (type === "bAddMonsterDropItemGroup") { push(out,"extraDrops",{kind:"group",group:String(a[0]).toUpperCase(),rate:n(a[1])}); return; }
    if (type === "bHPDrainRate" || type === "bSPDrainRate") {
      push(out,type === "bHPDrainRate" ? "hpDrainProcs" : "spDrainProcs",{rate:n(a[0]),percent:n(a[1]),extra:a.slice(2)}); return;
    }
    if (type === "bAddItemHealRate" || type === "bAddItemSPHealRate") {
      const isHp=type === "bAddItemHealRate";
      if (a.length <= 1) addScalar(out,isHp?"itemHpRecoveryRate":"itemSpRecoveryRate",a[0] ?? value);
      else addKeyed(out,isHp?"itemHpHealRate":"itemSpHealRate",a[0],a[1]);
      return;
    }
    if (type === "bAddItemGroupHealRate") { addKeyed(out,"itemGroupHealRate",a[0],a[1]); return; }
    if (type === "bAddDamageClass") { addKeyed(out,"monsterDamageRate",a[0],a[1]); return; }
    if (type === "bAddDefMonster") { addKeyed(out,"monsterDamageReductionRate",a[0],a[1]); return; }
    if (type === "bBreakArmorRate" || type === "bBreakWeaponRate") { addScalar(out,type === "bBreakArmorRate" ? "breakArmorRate" : "breakWeaponRate",value); return; }
    if (type === "bComaRace" || type === "bComaClass") { addKeyed(out,type === "bComaRace" ? "comaRaceRate" : "comaClassRate",a[0],a[1]); return; }
    if (type === "bHPRegenRate") { push(out,"periodicHpRegen",{amount:n(a[0]),intervalMs:Math.max(100,n(a[1],1000))}); return; }
    if (type === "bSPRegenRate") { push(out,"periodicSpRegen",{amount:n(a[0]),intervalMs:Math.max(100,n(a[1],1000))}); return; }
    if (type === "bRegenPercentHP") { push(out,"percentHpRegen",{percent:n(a[0]),intervalMs:Math.max(100,n(a[1],1000))}); return; }
    if (type === "bNoRegen") { const flag=n(a[0] ?? value,1); if(flag===1||flag===3)addScalar(out,"noHpRegen",1); if(flag===2||flag===3)addScalar(out,"noSpRegen",1); return; }
    if (type === "bHPLossRate") { push(out,"periodicHpLoss",{amount:n(a[0]),intervalMs:Math.max(100,n(a[1],1000))}); return; }
    if (type === "bSPLossRate") { push(out,"periodicSpLoss",{amount:n(a[0]),intervalMs:Math.max(100,n(a[1],1000))}); return; }
    if (type === "bSPVanishRate") { push(out,"spVanishOnHit",{rate:n(a[0]),percent:n(a[1]),flags:a.slice(2)}); return; }
    if (type === "bAddSkillBlow") { addKeyed(out,"skillKnockbackBonus",resolveSkillStorageKey(a[0]),a[1]); return; }
    if (type === "bDefRatioAtkClass") { addKeyed(out,"defRatioAttackClass",a[0],a[1] ?? 1); return; }
    if (type === "bClassChange") { addScalar(out,"classChangeRate",a[0] ?? value); return; }
    if (type === "bGetZenyNum") { push(out,"zenyOnKillProcs",{maxAmount:Math.max(1,n(a[0],1)),chancePercent:Math.max(0,n(a[1]))}); return; }
    out.rawBonuses = out.rawBonuses || {};
    push(out.rawBonuses, type || "unknown", a);
  }

  function splitScriptArguments(source) {
    const parts=[]; let start=0, quote=null, escaped=false, depth=0;
    for(let index=0; index<source.length; index+=1){
      const char=source[index];
      if(quote){
        if(escaped)escaped=false;
        else if(char==="\\")escaped=true;
        else if(char===quote)quote=null;
        continue;
      }
      if(char==='"'||char==="'"){quote=char;continue;}
      if("([{ ".includes(char)&&char!==" ")depth+=1;
      else if(")]}".includes(char))depth=Math.max(0,depth-1);
      else if(char===","&&depth===0){parts.push(source.slice(start,index).trim());start=index+1;}
    }
    parts.push(source.slice(start).trim());
    return parts;
  }
  function compileRawScript(source) {
    const input=String(source||"").replace(/\.\@([A-Za-z_]\w*)/g,"v.$1");
    const commands=new Set(["bonus","bonus2","bonus3","bonus4","bonus5","skill","autobonus","autobonus2","autobonus3","sc_start","heal","showscript","specialeffect2","active_transform"]);
    let output="", index=0;
    while(index<input.length){
      const char=input[index];
      if(char==='"'||char==="'"){
        const quote=char; let cursor=index+1, escaped=false;
        while(cursor<input.length){
          const current=input[cursor];
          if(escaped)escaped=false;
          else if(current==="\\")escaped=true;
          else if(current===quote){cursor+=1;break;}
          cursor+=1;
        }
        output+=input.slice(index,cursor); index=cursor; continue;
      }
      if(/[A-Za-z_]/.test(char)){
        const match=input.slice(index).match(/^[A-Za-z_]\w*/); const word=match?.[0]||char;
        let after=index+word.length;
        if(commands.has(word)){
          let probe=after; while(/\s/.test(input[probe]||""))probe+=1;
          if(input[probe]!=="("){
            let cursor=after, quote=null, escaped=false, depth=0;
            while(cursor<input.length){
              const current=input[cursor];
              if(quote){
                if(escaped)escaped=false;
                else if(current==="\\")escaped=true;
                else if(current===quote)quote=null;
              }else{
                if(current==='"'||current==="'")quote=current;
                else if("([{".includes(current))depth+=1;
                else if(")]}".includes(current))depth=Math.max(0,depth-1);
                else if(current===";"&&depth===0)break;
              }
              cursor+=1;
            }
            const args=splitScriptArguments(input.slice(after,cursor).trim());
            if(/^bonus\d*$/.test(word)&&/^[A-Za-z_]\w*$/.test(args[0]||""))args[0]=JSON.stringify(args[0]);
            if(["skill","sc_start","active_transform"].includes(word)&&/^[A-Za-z_]\w*$/.test(args[0]||""))args[0]=JSON.stringify(args[0]);
            output+=`${word}(${args.join(", ")})`;
            if(input[cursor]===";"){output+=";";cursor+=1;}
            index=cursor; continue;
          }
        }
        output+=word; index=after; continue;
      }
      output+=char; index+=1;
    }
    return output;
  }
  function nestedTransform(source) { return compileRawScript(source); }


  function rawScriptOf(item) {
    return String(item?.scriptRaw ?? item?.Script ?? item?.script ?? item?.equipScript ?? "").trim();
  }
  function dynamicRecord(item, sourceType = "equipment") {
    if (!item) return null;
    const raw=rawScriptOf(item), precompiled=String(item.compiledScript || "").trim();
    if (!raw && !precompiled) return null;
    const id=Number(item.id ?? item.officialId ?? item.itemId) || String(item.aegisName || item.name || sourceType);
    const cacheKey=`${sourceType}:${id}:${precompiled||raw}`;
    if (NESTED_COMPILED.has(cacheKey)) return NESTED_COMPILED.get(cacheKey);
    const record={id,name:item.name||item.displayName||item.aegisName||String(id),aegisName:item.aegisName||item.AegisName,
      scriptRaw:raw,compiledScript:precompiled||nestedTransform(raw),sourceType,dynamic:true};
    NESTED_COMPILED.set(cacheKey,record); return record;
  }
  function runtimeRecord(id, sourceType, item) {
    init();
    const generated=sourceType==="card"?DATA.effects[String(id)]:DATA.equipment[String(id)];
    return generated || dynamicRecord(item || window.getItemData?.(id),sourceType);
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
      autobonus: (script,rate,duration,attackFlags=0,otherScript="") => push(out,"autoBonuses",{trigger:"attack",script:String(script),rate:n(rate),durationMs:n(duration),attackFlags:n(attackFlags),otherScript:String(otherScript||"")}),
      autobonus2: (script,rate,duration,attackFlags=0,otherScript="") => push(out,"autoBonuses",{trigger:"hit",script:String(script),rate:n(rate),durationMs:n(duration),attackFlags:n(attackFlags),otherScript:String(otherScript||"")}),
      autobonus3: (script,rate,duration,skill,otherScript="") => push(out,"autoBonuses",{trigger:"skill",script:String(script),rate:n(rate),durationMs:n(duration),skill:normalizeSkillKey(skill),otherScript:String(otherScript||"")}),
      sc_start: (status,duration,value,...extra) => push(out,"statusStarts",{status:normalizeConstant(status),durationMs:n(duration),value:n(value),extra}),
      heal: (hp,sp) => { addScalar(out,"instantHealHp",hp); addScalar(out,"instantHealSp",sp); },
      showscript: text => push(out,"scriptMessages",String(text||"")),
      specialeffect2: effect => push(out,"visualEffects",normalizeConstant(effect)),
      active_transform:(id,duration,status,...values)=>push(out,"transforms",{id,durationMs:n(duration),status:status?normalizeConstant(status):null,values}),
      getrefine: () => n(context.hostRow?.refine ?? context.maxRefine),
      getenchantgrade: token => n((token === undefined || token === null) ? (context.hostRow?.grade ?? context.hostRow?.instance?.enchantGrade ?? context.maxGrade) : (getSlotRow(token,context)?.grade ?? getSlotRow(token,context)?.instance?.enchantGrade)),
      getequiprefinerycnt: token => n(getSlotRow(token,context)?.refine),
      getequipid: token => n(getSlotRow(token,context)?.itemId),
      getequipweaponlv: token => n(getSlotRow(token,context)?.item?.weaponLevel || getSlotRow(token,context)?.item?.WeaponLevel),
      getiteminfo: (id,info) => { const item=window.getItemData?.(id); return String(info)==="ITEMINFO_VIEW" ? getItemView(item) : n(item?.[String(info)]); },
      readparam: token => statValue(token), getskilllv: skill => { const resolved=resolveSkill(skill); return n(window.getSkillLevel?.(resolved?.officialId ?? resolved?.id ?? skill)); },
      isequipped: (...ids) => ids.every(id => equippedIds.map(String).includes(String(id))), eaclass:eaclassMask,
      min:Math.min, max:Math.max, pow:Math.pow,
      BaseLevel:n(window.player?.baseLevel,1), JobLevel:n(window.player?.jobLevel,1), BaseJob:currentJobToken(), BaseClass:currentJobToken(), Class:currentJobToken(), Sex:String(window.player?.gender||""),
      EAJL_THIRD:4, EAJL_FOURTH:8,
      ENCHANTGRADE_NONE:0, ENCHANTGRADE_D:1, ENCHANTGRADE_C:2, ENCHANTGRADE_B:3, ENCHANTGRADE_A:4,
      ...BATTLE_FLAGS,
      ...ATTACK_STATUS_FLAGS
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
      const compiledKey=`${context.sourceType||record.sourceType||"source"}:${record.id}:${record.compiledScript||""}`;
      let fn=COMPILED.get(compiledKey);
      if (!fn) { fn=new Function("scope",`with(scope){${record.compiledScript || ""}}`); COMPILED.set(compiledKey,fn); }
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
      const equipmentRecord = runtimeRecord(row.itemId,"equipment",row.item);
      if (equipmentRecord) {
        const source=executeScript(equipmentRecord,{sourceType:"equipment",slot:row.slot,hostRow:row,equippedIds,maxRefine:Math.max(0,...rows.map(x=>x.refine))});
        recordDiagnostic(source); sources.push(source);
      }
      for (const cardId of (row.instance?.cards || []).filter(Boolean)) {
        const cardItem=window.getItemData?.(cardId);
        const rec=runtimeRecord(cardId,"card",cardItem); if (!rec) continue;
        const source=executeScript(rec,{sourceType:"card",slot:row.slot,hostRow:row,equippedIds,maxRefine:Math.max(0,...rows.map(x=>x.refine))});
        recordDiagnostic(source); sources.push(source);
      }
    }
    const counts={}; equippedIds.forEach(id=>counts[String(id)]=n(counts[String(id)])+1);
    for (const combo of DATA.combos) {
      const need={}; combo.requiredItemIds.forEach(id=>need[String(id)]=n(need[String(id)])+1);
      if (!Object.entries(need).every(([id,count])=>n(counts[id])>=count)) continue;
      const source=executeScript(combo,{sourceType:"combo",equippedIds,maxRefine:Math.max(0,...rows.map(x=>x.refine))});
      recordDiagnostic(source); sources.push(source);
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
  function recordDiagnostic(source) {
    if(!source)return;
    if(source.runtimeError){
      const key=`runtime:${source.sourceType}:${source.sourceId}:${source.runtimeError}`;
      if(!DIAGNOSTIC_KEYS.has(key)){DIAGNOSTIC_KEYS.add(key);DIAGNOSTICS.runtimeErrors.push({sourceType:source.sourceType,sourceId:source.sourceId,name:source.name,error:source.runtimeError});console.error("[EffectRuntime] script runtime error",source);}
    }
    for(const [bonus,rows] of Object.entries(source.rawBonuses||{})){
      const count=Array.isArray(rows)?rows.length:1;DIAGNOSTICS.unhandledBonuses[bonus]=n(DIAGNOSTICS.unhandledBonuses[bonus])+count;
      const key=`bonus:${bonus}`;
      if(!DIAGNOSTIC_KEYS.has(key)){DIAGNOSTIC_KEYS.add(key);console.error(`[EffectRuntime] unhandled rAthena bonus ${bonus}; effect was blocked instead of silently ignored.`);}
    }
  }
  function removeImmediateFields(source) {
    const persistent={...source};
    ["instantHealHp","instantHealSp","statusStarts","transforms","scriptMessages","visualEffects"].forEach(key=>delete persistent[key]);
    return persistent;
  }
  function applyImmediateEffects(source, origin=null) {
    if(!source||!window.player)return 0;
    let applied=0;
    if(n(source.instantHealHp)){adjustPlayerResource("hp",n(source.instantHealHp));applied+=1;}
    if(n(source.instantHealSp)){adjustPlayerResource("sp",n(source.instantHealSp));applied+=1;}
    for(const row of source.statusStarts||[]){
      const result=window.StatusManager?.apply?.(player,row.status,{chancePercent:100,durationMs:Math.max(100,n(row.durationMs,1000)),level:Math.max(1,n(row.value,1)),value:n(row.value),extra:row.extra||[],allowBoss:true,source:"item_script"});
      if(result?.applied!==false)applied+=1;
    }
    for(const row of source.transforms||[]){
      player.cardRuntimeTransform={monsterId:row.id,status:row.status||null,values:row.values||[],sourceId:origin?.sourceId||source.sourceId,expiresAt:Date.now()+Math.max(100,n(row.durationMs,1000))};
      try{window.dispatchEvent?.(new CustomEvent("ro:web-player-transform",{detail:{...player.cardRuntimeTransform}}));}catch(_){}
      applied+=1;
    }
    for(const text of source.scriptMessages||[]){if(text)window.addBattleLog?.(String(text));}
    for(const effect of source.visualEffects||[]){
      try{window.dispatchEvent?.(new CustomEvent("ro:web-item-visual-effect",{detail:{effect,sourceId:origin?.sourceId||source.sourceId}}));}catch(_){}
    }
    if(applied)window.updatePlayerUI?.();
    return applied;
  }
  function buildAttackContext(kind, payload={}) {
    const raw=String(payload.damageType||payload.handler||payload.type||"").toLowerCase();
    const magic=payload.magic===true||raw.includes("magic");
    const misc=payload.misc===true||raw.includes("misc")||raw.includes("special");
    const skill=kind==="skill";
    const normal=kind==="normal";
    const targetType=String(payload.targetType||payload.runtimeProfile?.targetType||"").toLowerCase();
    const handler=String(payload.runtimeHandler||payload.runtimeProfile?.handler||payload.handler||"").toLowerCase();
    const damaging=normal||payload.dealsDamage===true||["attack","ground"].includes(targetType)||["physical","magic","misc","projectile","ground","combo","chain"].includes(handler);
    const longRange=payload.longRange===true||Number(payload.rangeCells||payload.range||0)>1||String(payload.rangeType||payload.attackRangeType||"").toLowerCase()==="long";
    let flags=(magic?BATTLE_FLAGS.BF_MAGIC:(misc?BATTLE_FLAGS.BF_MISC:BATTLE_FLAGS.BF_WEAPON));
    flags|=skill?BATTLE_FLAGS.BF_SKILL:BATTLE_FLAGS.BF_NORMAL;
    flags|=longRange?BATTLE_FLAGS.BF_LONG:BATTLE_FLAGS.BF_SHORT;
    return {kind,magic,misc,skill,normal,damaging,longRange,flags};
  }
  function matchesBattleFlags(required, context) {
    const mask=Math.max(0,n(required)); if(!mask)return true;
    const groups=[BATTLE_FLAGS.BF_WEAPON|BATTLE_FLAGS.BF_MAGIC|BATTLE_FLAGS.BF_MISC,BATTLE_FLAGS.BF_SHORT|BATTLE_FLAGS.BF_LONG,BATTLE_FLAGS.BF_SKILL|BATTLE_FLAGS.BF_NORMAL];
    return groups.every(group=>!(mask&group)||!!(mask&context.flags));
  }
  function matchesAttackStatusFlags(required, context) {
    const mask=Math.max(0,n(required)); if(!mask)return true;
    const typeMask=ATTACK_STATUS_FLAGS.ATF_WEAPON|ATTACK_STATUS_FLAGS.ATF_MAGIC|ATTACK_STATUS_FLAGS.ATF_MISC;
    const rangeMask=ATTACK_STATUS_FLAGS.ATF_SHORT|ATTACK_STATUS_FLAGS.ATF_LONG;
    const actualType=context.magic?ATTACK_STATUS_FLAGS.ATF_MAGIC:(context.misc?ATTACK_STATUS_FLAGS.ATF_MISC:ATTACK_STATUS_FLAGS.ATF_WEAPON);
    const actualRange=context.longRange?ATTACK_STATUS_FLAGS.ATF_LONG:ATTACK_STATUS_FLAGS.ATF_SHORT;
    return (!(mask&typeMask)||!!(mask&actualType)) && (!(mask&rangeMask)||!!(mask&actualRange));
  }
  function applyStatusRule(rule, other, context, defaultRecipient="target") {
    if(!rule||!matchesAttackStatusFlags(rule.flags,context)||Math.random()*10000>=Math.max(0,n(rule.rate)))return 0;
    const flags=Math.max(0,n(rule.flags));
    const explicitSelf=!!(flags&ATTACK_STATUS_FLAGS.ATF_SELF), explicitTarget=!!(flags&ATTACK_STATUS_FLAGS.ATF_TARGET);
    const recipients=[];
    if(explicitSelf)recipients.push(window.player);
    if(explicitTarget)recipients.push(other);
    if(!explicitSelf&&!explicitTarget)recipients.push(defaultRecipient==="self"?window.player:other);
    let applied=0;
    for(const unit of [...new Set(recipients.filter(Boolean))]){
      const result=window.StatusManager?.apply?.(unit,rule.status,{chancePercent:100,durationMs:Math.max(100,n(rule.durationMs,5000)),level:1,allowBoss:unit===window.player,source:"equipment_card_status"});
      if(result?.applied!==false)applied+=1;
    }
    return applied;
  }
  function applyTempBonus(auto, origin, attackContext=buildAttackContext("normal")) {
    if(!window.player||!matchesBattleFlags(auto.attackFlags,attackContext))return false;
    const chance=Math.max(0,n(auto.rate)); if(Math.random()*10000>=chance)return false;
    const nested={id:`temp_${origin.sourceId}_${Date.now()}_${Math.random()}`,name:`${origin.name} 自動效果`,compiledScript:compileRawScript(auto.script),sourceType:"cardTemp"};
    let source;
    try { source=executeScript(nested,{sourceType:"cardTemp",equippedIds:equipmentRows().flatMap(r=>[r.itemId,...(r.instance?.cards||[]).filter(Boolean)])}); }
    catch(_){return false;}
    recordDiagnostic(source); applyImmediateEffects(source,origin);
    if(auto.otherScript){
      const secondary=executeScript({id:`${nested.id}_other`,name:`${origin.name} 發動效果`,compiledScript:compileRawScript(auto.otherScript),sourceType:"cardProc"},{sourceType:"cardProc",equippedIds:equipmentRows().flatMap(r=>[r.itemId,...(r.instance?.cards||[]).filter(Boolean)])});
      recordDiagnostic(secondary);applyImmediateEffects(secondary,origin);
    }
    const persistent=removeImmediateFields(source);
    const persistentKeys=Object.keys(persistent).filter(key=>!["id","name","sourceType","sourceId","runtimeError"].includes(key));
    if(persistentKeys.length){
      player.cardRuntimeTempBonuses=player.cardRuntimeTempBonuses||{};
      player.cardRuntimeTempBonuses[nested.id]={expiresAt:Date.now()+Math.max(100,n(auto.durationMs)),source:persistent};
      invalidate();window.recalculatePlayerStats?.();
    }
    return true;
  }

  function sourceRace(unit) { return normalizeConstant(unit?.race || unit?.Race || "Formless"); }
  function sourceClass(unit) { return (unit?.isBoss||unit?.isMvp||unit?.boss) ? "Boss" : "NonBoss"; }
  function sourceId(unit) { return String(unit?.id ?? unit?.monsterId ?? unit?.officialId ?? unit?.classId ?? "0"); }
  function positionOf(unit) { return unit?.position || {x:n(unit?.worldX ?? unit?.x),y:n(unit?.worldY ?? unit?.y)}; }
  function distanceBetween(a,b) { const x=positionOf(a),y=positionOf(b); return Math.hypot(n(x.x)-n(y.x),n(x.y)-n(y.y)); }
  function adjustPlayerResource(kind, amount) {
    if(!window.player)return 0; const maxKey=kind==="hp"?"maxHp":"maxSp",before=n(player[kind]),max=Math.max(0,n(player[maxKey]));
    player[kind]=Math.max(kind==="hp"?1:0,Math.min(max,before+n(amount))); return player[kind]-before;
  }
  function triggerAutoSpell(proc,target,triggerSkill=null,attackContext=null) {
    if(proc.trigger==="skill" && proc.triggerSkill){
      const actual=resolveSkillStorageKey(triggerSkill?.officialId ?? triggerSkill?.id ?? triggerSkill?.key ?? triggerSkill?.skillKey ?? triggerSkill?.aegisName ?? triggerSkill);
      if(String(actual)!==String(proc.triggerSkill))return false;
    }
    if(attackContext&&!matchesBattleFlags(proc.attackFlags,attackContext))return false;
    if(Math.random()*10000>=Math.max(0,n(proc.rate)))return false;
    const skill=resolveSkill(proc.skill); if(!skill)return false;
    const level=Math.max(1,n(proc.level,1));
    try { return !!window.castAttackSkill?.(skill,level,{source:"card_autospell",ignoreSpCostCheck:true,triggerSource:proc.trigger||"card_proc",skipAnimation:true,target}); }
    catch(_){return false;}
  }
  function applyEquipmentBreakStatus(target,kind,rate) {
    if(!target||Math.random()*10000>=Math.max(0,n(rate)))return false;
    const id=kind==="armor"?"card_armor_break":"card_weapon_break";
    const effects=kind==="armor"?{defRate:-25,mdefRate:-25}:{outgoingPhysicalDamageRate:-25,outgoingMagicDamageRate:-10};
    return !!window.StatusManager?.apply?.(target,id,{chancePercent:100,durationMs:10000,level:1,allowBoss:false,effects})?.applied;
  }
  function tryComa(target,total) {
    if(!target || target.isBoss || target.isMvp || target.boss)return false;
    const race=sourceRace(target), cls=sourceClass(target);
    const rate=n(total.comaRaceRate?.[race])+n(total.comaRaceRate?.All)+n(total.comaClassRate?.[cls])+n(total.comaClassRate?.All);
    if(rate<=0||Math.random()*10000>=rate)return false;
    if(target.currentHp!==undefined)target.currentHp=Math.min(1,Math.max(0,n(target.currentHp)));
    else if(target.hp!==undefined)target.hp=Math.min(1,Math.max(0,n(target.hp)));
    return true;
  }
  function tryClassChange(target,rate) {
    if(!target||target.isBoss||target.isMvp||target.boss||rate<=0||Math.random()*10000>=rate)return false;
    let pool=[];
    try { if(Array.isArray(window.monsters))pool=window.monsters; else if(typeof monsters!=="undefined"&&Array.isArray(monsters))pool=monsters; } catch(_){}
    pool=pool.filter(row=>row&&String(row.id??row.monsterId)!==sourceId(target)&&!row.isBoss&&!row.isMvp&&!row.boss);
    if(!pool.length)return false;
    const level=n(target.level??target.Level,1),near=pool.filter(row=>Math.abs(n(row.level??row.Level,level)-level)<=20),template=(near.length?near:pool)[Math.floor(Math.random()*(near.length?near:pool).length)];
    if(!template)return false;
    const preserve={position:target.position,worldX:target.worldX,worldY:target.worldY,x:target.x,y:target.y,_worldTestEntity:target._worldTestEntity,_element:target._element,_spawnKey:target._spawnKey,_category:target._category,_deathHandled:false};
    Object.assign(target,JSON.parse(JSON.stringify(template)),preserve);
    target.maxHp=Math.max(1,n(target.maxHp??target.hp??template.maxHp??template.hp,1)); target.currentHp=target.maxHp;
    window.refreshWorldMonsterSpatialEntity?.(target); window.renderPositionSprites?.(); window.updateMonsterUI?.();
    return true;
  }
  function applySplash(target,damage,rangeCells) {
    const range=Math.max(0,n(rangeCells)); if(!target||range<=0||damage<=0)return 0;
    const candidates=typeof window.getCombatGroundCandidates==="function"?window.getCombatGroundCandidates({activeOnly:false}):[];
    const radius=range*Math.max(1,n(window.RO_WEB_CELL_SIZE,36)); let hits=0;
    for(const enemy of candidates){
      if(!enemy||enemy===target||enemy._deathHandled||n(enemy.currentHp??enemy.hp)<=0||distanceBetween(target,enemy)>radius)continue;
      const dealt=Math.min(n(enemy.currentHp??enemy.hp),Math.max(1,Math.floor(n(damage))));
      if(enemy.currentHp!==undefined)enemy.currentHp=Math.max(0,n(enemy.currentHp)-dealt); else enemy.hp=Math.max(0,n(enemy.hp)-dealt);
      enemy._lastDamageType="physical"; hits++; window.showDamageNumber?.(dealt,{target:enemy,combo:true}); window.playMonsterHitAnimation?.(enemy);
      if(n(enemy.currentHp??enemy.hp)<=0)window.queueMonsterDefeatResolution?.(enemy,{primary:false});
    }
    return hits;
  }
  function onNormalAttack(target,damage,context={}) {
    const sources=getSources(),total=getMergedSource(),attackContext=buildAttackContext("normal",context); let triggered=0;
    if(target)target._lastDamageType="physical";
    for(const source of sources){
      for(const proc of source.autoSpellProcs||[])if(proc.trigger==="attack"&&triggerAutoSpell(proc,target,null,attackContext))triggered++;
      for(const auto of source.autoBonuses||[])if(auto.trigger==="attack"&&applyTempBonus(auto,source,attackContext))triggered++;
      for(const drain of source.hpDrainProcs||[])if(Math.random()*10000<n(drain.rate)){const heal=Math.max(1,Math.floor(n(damage)*n(drain.percent)/100));adjustPlayerResource("hp",heal);}
      for(const drain of source.spDrainProcs||[])if(Math.random()*10000<n(drain.rate)){const heal=Math.max(1,Math.floor(n(damage)*n(drain.percent)/100));adjustPlayerResource("sp",heal);}
      for(const [status,rate] of Object.entries(source.statusOnAttack||{}))if(target&&Math.random()*10000<n(rate)){window.StatusManager?.apply?.(target,status,{chancePercent:100,durationMs:5000,level:1,allowBoss:false});triggered++;}
      for(const rule of source.statusOnAttackRules||[])triggered+=applyStatusRule(rule,target,attackContext,"target");
      for(const [status,rate] of Object.entries(source.statusOnSelfAttack||{}))if(Math.random()*10000<n(rate)){window.StatusManager?.apply?.(player,status,{chancePercent:100,durationMs:5000,level:1,allowBoss:true});triggered++;}
      for(const row of source.spVanishOnHit||[])if(target&&Math.random()*10000<n(row.rate)){const current=n(target.sp??target.currentSp);const loss=Math.max(0,Math.floor(current*n(row.percent)/100));if(target.sp!==undefined)target.sp=Math.max(0,current-loss);if(target.currentSp!==undefined)target.currentSp=Math.max(0,current-loss);}
      if(source.breakArmorRate)triggered+=applyEquipmentBreakStatus(target,"armor",source.breakArmorRate)?1:0;
      if(source.breakWeaponRate)triggered+=applyEquipmentBreakStatus(target,"weapon",source.breakWeaponRate)?1:0;
    }
    if(n(total.spOnAttackFlat))adjustPlayerResource("sp",n(total.spOnAttackFlat));
    if(tryComa(target,total))triggered++;
    if(tryClassChange(target,n(total.classChangeRate)))triggered++;
    triggered+=applySplash(target,damage,n(total.splashRange));
    if(triggered)window.updatePlayerUI?.(); return triggered;
  }
  function onPlayerDamaged(attacker,damage,context={}) {
    const attackContext=buildAttackContext("hit",context); let triggered=0; for(const source of getSources()){
      for(const proc of source.autoSpellProcs||[])if(proc.trigger==="hit"&&triggerAutoSpell(proc,attacker,null,attackContext))triggered++;
      for(const auto of source.autoBonuses||[])if(auto.trigger==="hit"&&applyTempBonus(auto,source,attackContext))triggered++;
      for(const [status,rate] of Object.entries(source.statusWhenHit||{}))if(attacker&&Math.random()*10000<n(rate)){window.StatusManager?.apply?.(attacker,status,{chancePercent:100,durationMs:5000,level:1,allowBoss:false});triggered++;}
      for(const rule of source.statusWhenHitRules||[])triggered+=applyStatusRule(rule,attacker,attackContext,"target");
    } return triggered;
  }
  function onSkillUsed(skill,target) {
    const attackContext=buildAttackContext("skill",skill||{});
    const keys=new Set([
      resolveSkillStorageKey(skill?.officialId ?? skill?.id ?? skill?.key ?? skill?.skillKey ?? skill?.aegisName),
      normalizeSkillKey(skill?.key||""), normalizeSkillKey(skill?.skillKey||""), normalizeSkillKey(skill?.aegisName||""),
      String(skill?.officialId ?? ""), String(skill?.id ?? "")
    ].filter(Boolean));
    if(target)target._lastDamageType=String(skill?.damageType||skill?.handler||"").toLowerCase().includes("magic")?"magic":"skill";
    let triggered=0;
    for(const source of getSources()){
      for(const auto of source.autoBonuses||[]){
        if(auto.trigger==="attack"&&attackContext.damaging&&applyTempBonus(auto,source,attackContext))triggered++;
        else if(auto.trigger==="skill"&&(!auto.skill||keys.has(resolveSkillStorageKey(auto.skill))||keys.has(normalizeSkillKey(auto.skill)))&&applyTempBonus(auto,source,attackContext))triggered++;
      }
      for(const proc of source.autoSpellProcs||[]){
        if(proc.trigger==="attack"&&attackContext.damaging&&triggerAutoSpell(proc,target,null,attackContext))triggered++;
        else if(proc.trigger==="skill"&&triggerAutoSpell(proc,target,skill,attackContext))triggered++;
      }
      if(attackContext.damaging)for(const rule of source.statusOnAttackRules||[])triggered+=applyStatusRule(rule,target,attackContext,"target");
      for(const row of source.skillStatusOnHit||[])if(target&&(keys.has(String(row.skill))||keys.has(resolveSkillStorageKey(row.skill)))&&Math.random()*10000<n(row.rate)){
        window.StatusManager?.apply?.(target,row.status,{chancePercent:100,durationMs:5000,level:1,allowBoss:false}); triggered++;
      }
    } return triggered;
  }
  function rollExtraDrops(monster) {
    if(!monster)return [];
    const race=sourceRace(monster),awarded=[]; const extras=getSources().flatMap(source=>(source.extraDrops||[]).map(drop=>({...drop,sourceName:source.name})));
    for(const drop of extras){
      if(drop.conditionRace && drop.conditionRace!=="All" && drop.conditionRace!==race)continue;
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
    const total=getMergedSource(),race=sourceRace(monster); let changed=false;
    if(n(total.killHpFlat)){adjustPlayerResource("hp",n(total.killHpFlat));changed=true;}
    if(n(total.killSpFlat)){adjustPlayerResource("sp",n(total.killSpFlat));changed=true;}
    const raceSp=n(total.spGainRace?.[race])+n(total.spGainRace?.All); if(raceSp){adjustPlayerResource("sp",raceSp);changed=true;}
    const lastType=String(monster?._lastDamageType||window.lastRADamageTrace?.type||"").toLowerCase();
    if(lastType.includes("magic")&&n(total.magicKillHpFlat)){adjustPlayerResource("hp",n(total.magicKillHpFlat));changed=true;}
    for(const proc of total.zenyOnKillProcs||[]){if(Math.random()*100<n(proc.chancePercent)){const amount=1+Math.floor(Math.random()*Math.max(1,n(proc.maxAmount,1)));player.zeny=Math.max(0,n(player.zeny)+amount);changed=true;window.emitLootRewardLog?.(`卡片效果：額外獲得 ${amount.toLocaleString()} Zeny。`,"zeny");}}
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
    if(player.cardRuntimeTransform&&n(player.cardRuntimeTransform.expiresAt)<=now){
      const previous=player.cardRuntimeTransform;delete player.cardRuntimeTransform;
      try{window.dispatchEvent?.(new CustomEvent("ro:web-player-transform-end",{detail:previous}));}catch(_){}
    }
    const sources=getSources(), state=player.cardRuntimePeriodicState=player.cardRuntimePeriodicState||{};
    let changed=false;
    const total=getMergedSource();
    if(n(total.intravision)>0&&typeof window.revealHiddenMonstersAroundPlayer==="function"){
      const revealed=n(window.revealHiddenMonstersAroundPlayer(24));
      if(revealed>0){changed=true;window.renderPositionSprites?.();window.updateMonsterUI?.();}
    }
    for(const source of sources){
      const groups=[
        ["hp","periodicHpLoss",-1,1],["sp","periodicSpLoss",-1,0],
        ["hp","periodicHpRegen",1,1],["sp","periodicSpRegen",1,0]
      ];
      for(const [kind,field,direction,minimum] of groups){
        if((kind==="hp"&&direction>0&&n(total.noHpRegen)>0)||(kind==="sp"&&direction>0&&n(total.noSpRegen)>0))continue;
        for(let i=0;i<(source[field]||[]).length;i++){
          const row=source[field][i],key=`${source.sourceType}:${source.sourceId}:${field}:${i}`,due=n(state[key]);
          if(due>now)continue; state[key]=now+Math.max(100,n(row.intervalMs,1000));
          const before=n(player[kind]),max=n(player[kind==="hp"?"maxHp":"maxSp"]),delta=Math.max(0,n(row.amount))*direction;
          player[kind]=Math.max(minimum,Math.min(max,before+delta)); changed=changed||player[kind]!==before;
        }
      }
      if(n(total.noHpRegen)<=0)for(let i=0;i<(source.percentHpRegen||[]).length;i++){
        const row=source.percentHpRegen[i],key=`${source.sourceType}:${source.sourceId}:percentHpRegen:${i}`,due=n(state[key]);
        if(due>now)continue;state[key]=now+Math.max(100,n(row.intervalMs,1000));
        const before=n(player.hp),heal=Math.max(1,Math.floor(n(player.maxHp)*n(row.percent)/100));player.hp=Math.min(n(player.maxHp),before+heal);changed=changed||player.hp!==before;
      }
    }
    if(changed){window.updatePlayerUI?.();window.saveGame?.();}
    return changed;
  }


  window.CardRuntime = {
    version:"0.9.82FX", init, invalidate, getSources, getMergedSource, getCardRecord:id=>(init(),DATA.effects[String(id)]||null),
    getComboRecords:()=> (init(),DATA.combos), getSocketCandidates, socketCard, isCardCompatible, removeAllCardsFromEquipped,
    onNormalAttack,onPlayerDamaged,onSkillUsed,onMonsterDefeated,rollExtraDrops,getExpRate,getSkillDamageRate,getSkillSpCostModifier,getItemRecoveryRate,tickPeriodicEffects,
    getBuildCounts:()=>({cards:Object.keys(DATA.effects).length,equipmentScripts:Object.keys(DATA.equipment).length,combos:DATA.combos.length,dropSources:Object.values(DATA.drops).reduce((n,x)=>n+(x?.length||0),0)}),
    getSupportedBonusTypes:()=>[...SUPPORTED_BONUS_TYPES].sort(),
    getRuntimeRecord:(id,sourceType="equipment")=>runtimeRecord(id,sourceType,window.getItemData?.(id)),
    getDiagnostics:()=>JSON.parse(JSON.stringify(DIAGNOSTICS)), clearDiagnostics:()=>{DIAGNOSTICS.runtimeErrors.length=0;DIAGNOSTICS.warnings.length=0;DIAGNOSTICS.unhandledBonuses={};DIAGNOSTIC_KEYS.clear();},
    compileRawScript, buildAttackContext, matchesBattleFlags, matchesAttackStatusFlags,
    getBattleFlags:()=>({...BATTLE_FLAGS}), getAttackStatusFlags:()=>({...ATTACK_STATUS_FLAGS}),
    _debugEvaluateRecord:(record,context={})=>executeScript(record,context), _debugData:()=>DATA, _debugResolveSkill:resolveSkill,
    _debugDynamicRecord:dynamicRecord, _debugApplyImmediateEffects:applyImmediateEffects
  };
  window.invalidateCardRuntime = invalidate;
  if(typeof document!=="undefined")document.addEventListener("DOMContentLoaded",init,{once:true});
  if(typeof window.setInterval==="function")window.setInterval(()=>tickPeriodicEffects(Date.now()),500);
})();
