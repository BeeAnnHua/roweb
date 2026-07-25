//=======================================
// Job Constitution v2.1
// 所有冒險者轉職前必須通過的共同檢查站
// 一般職業與擴充職業共用同一入口，但路線條件由 JSON 定義。
//=======================================
let jobConstitution = null;

async function loadJobConstitutionData() {
  jobConstitution = await loadJson("./data/job_constitution.json", getDefaultJobConstitution());
  console.log("Job Constitution 載入完成：", jobConstitution);
}

function getDefaultJobConstitution() {
  return {
    version: "2.1-fallback",
    commonRequirements: {
      requireAllSkillPointsSpent: true,
      requiredUnequippedSystems: [
        { id: "cart", label: "手推車", playerFields: ["cartEquipped", "hasCart", "cartActive"], message: "請先卸除手推車，才能轉職。" },
        { id: "falcon", label: "獵鷹", playerFields: ["falconEquipped", "hasFalcon", "falconActive"], message: "請先解除獵鷹，才能轉職。" },
        { id: "warg", label: "狼", playerFields: ["hasWarg", "wargActive", "wargRiding"], message: "請先解除狼協助與騎乘狀態，才能轉職。" },
        { id: "mount", label: "坐騎", playerFields: ["mountState.mounted"], message: "請先解除坐騎狀態，才能轉職。" }
      ]
    },
    normalJobRoutes: {
      enforceRebirthBeforeThird: true,
      transitions: [
        { id: "novice_to_first", fromGroup: "novice", toGroup: "first", baseLevel: 1, jobLevel: 10, requiredSkills: [{ id: 1, level: 9, name: "基本技能" }] },
        { id: "first_to_second", fromGroup: "first", toGroup: "second", baseLevel: 1, jobLevel: 50 },
        { id: "second_to_rebirth", type: "rebirth", fromGroup: "second", toGroup: "high_novice", baseLevel: 99, jobLevel: 50 },
        { id: "high_novice_to_high_first", fromGroup: "high_novice", toGroup: "high_first", baseLevel: 1, jobLevel: 10, requiredSkills: [{ id: 1, level: 9, name: "基本技能" }] },
        { id: "high_first_to_trans_second", fromGroup: "high_first", toGroup: "trans_second", baseLevel: 1, jobLevel: 50 },
        { id: "trans_second_to_third", fromGroup: "trans_second", toGroup: "third", baseLevel: 99, jobLevel: 70, baseCapAfter: 200, jobCapAfter: 70 },
        { id: "third_to_fourth", fromGroup: "third", toGroup: "fourth", baseLevel: 200, jobLevel: 70, baseCapAfter: 275, jobCapAfter: 60 }
      ]
    },
    extendedJobRoutes: { transitions: [] },
    rebirth: {
      baseLevel: 99,
      jobLevel: 50,
      toJob: "high_novice",
      resetStatsTo: 1,
      keepRemainingStatusPoints: false,
      fixedStartingStatusPoints: 125,
      status: "reserved"
    }
  };
}

function getJobConstitution() {
  return jobConstitution || getDefaultJobConstitution();
}

function getPendingSkillPointCostSafe() {
  if (typeof getPendingSkillPointCost === "function") return Number(getPendingSkillPointCost() || 0);
  return 0;
}

function getRemainingSkillPointsForConstitution() {
  return Math.max(0, Number(player?.skillPoints || 0) - getPendingSkillPointCostSafe());
}

function readPlayerPath(path) {
  return String(path || "").split(".").filter(Boolean).reduce((value, key) => value == null ? undefined : value[key], player);
}

function isConstitutionStatusActive(entry) {
  if (!player || !entry) return false;
  const fields = Array.isArray(entry.playerFields) ? entry.playerFields : [];
  return fields.some(field => Boolean(readPlayerPath(field)));
}

function getJobRouteGroup(job) {
  if (!job) return "";
  if (job.routeGroup) return String(job.routeGroup);
  const tier = Number(job.tier ?? -1);
  if (job.id === "novice") return "novice";
  if (job.id === "high_novice") return "high_novice";
  if (tier === 1) return "first";
  if (tier === 2) return job.isTranscendent ? "trans_second" : "second";
  if (tier === 3) return "third";
  if (tier >= 4) return "fourth";
  return "";
}

function getAllConstitutionTransitions() {
  const constitution = getJobConstitution();
  return [
    ...(constitution.normalJobRoutes?.transitions || []).map(item => ({ ...item, routeType: "normal" })),
    ...(constitution.extendedJobRoutes?.transitions || []).map(item => ({ ...item, routeType: "extended" }))
  ];
}

function matchTransition(rule = {}, currentJob = null, targetJob = null) {
  const fromJob = rule.fromJob || currentJob?.id || player?.jobKey;
  const toJob = rule.toJob || targetJob?.id;
  const fromGroup = rule.fromGroup || getJobRouteGroup(currentJob);
  const toGroup = rule.toGroup || getJobRouteGroup(targetJob);
  const transitions = getAllConstitutionTransitions();

  return transitions.find(item => item.id && rule.constitutionTransition === item.id) ||
    transitions.find(item => item.fromJob === fromJob && item.toJob === toJob) ||
    transitions.find(item => item.fromGroup === fromGroup && item.toGroup === toGroup && (item.family || item.routeType) !== "extended") ||
    null;
}

function normalizeRequiredJobLevel(value, currentMaxJob = 50) {
  if (String(value).toLowerCase() === "max") return Number(currentMaxJob || 50);
  return Number(value || 1);
}

function mergeRequiredSkills(...lists) {
  const result = [];
  const seen = new Set();
  lists.flat().forEach(req => {
    if (!req) return;
    const id = req.id ?? req.skillId;
    const level = Number(req.level || req.requiredLevel || 0);
    const key = `${id}:${level}`;
    if (!id || level <= 0 || seen.has(key)) return;
    seen.add(key);
    result.push(req);
  });
  return result;
}

function getEffectiveJobChangeRequirement(rule = {}, targetJob = null) {
  const currentJob = typeof getCurrentJobData === "function" ? getCurrentJobData() : null;
  const target = targetJob || (typeof getJobData === "function" ? getJobData(rule.toJob) : null);
  const route = matchTransition(rule, currentJob, target) || {};
  const currentMaxJob = Number(currentJob?.jobMaxLevel || 50);

  const requiredBaseLevel = Math.max(
    Number(route.baseLevel || 1),
    Number(rule.requiredBaseLevel || 1)
  );
  const requiredJobLevel = Math.max(
    normalizeRequiredJobLevel(route.jobLevel || 1, currentMaxJob),
    normalizeRequiredJobLevel(rule.requiredJobLevel || 1, currentMaxJob)
  );
  const requiredSkills = mergeRequiredSkills(route.requiredSkills || [], rule.requiredSkills || []);

  let lockedMessage = "";
  if (route.status === "pending_confirm") lockedMessage = `${route.id || "此轉職"} 規則尚未確認，暫不開放。`;
  if (route.status === "disabled") lockedMessage = route.message || "此轉職路線目前停用。";

  return {
    requiredBaseLevel,
    requiredJobLevel,
    requiredSkills,
    route,
    routeType: route.routeType || rule.routeType || target?.classFamily || "normal",
    lockedMessage
  };
}

function validateRequiredSkills(requiredSkills = []) {
  const seen = new Set();
  for (const req of requiredSkills) {
    const id = req.id ?? req.skillId;
    const requiredLevel = Number(req.level || req.requiredLevel || 0);
    const key = `${id}:${requiredLevel}`;
    if (!id || requiredLevel <= 0 || seen.has(key)) continue;
    seen.add(key);
    const currentLevel = typeof getSkillLevel === "function"
      ? Number(getSkillLevel(id) || 0)
      : Number(player?.learnedSkills?.[id] || player?.learnedSkills?.[String(id)] || 0);
    if (currentLevel < requiredLevel) {
      const skill = typeof getSkillDataById === "function" ? getSkillDataById(id) : null;
      return { ok: false, message: `${skill?.name || req.name || id} 需要 Lv ${requiredLevel}。` };
    }
  }
  return { ok: true, message: "" };
}

function isRebirthJobChange(rule = {}, targetJob = null) {
  const rebirth = getJobConstitution().rebirth || {};
  const transition = matchTransition(rule, typeof getCurrentJobData === "function" ? getCurrentJobData() : null, targetJob);
  return Boolean(
    rule.type === "rebirth" ||
    rule.isRebirth === true ||
    transition?.type === "rebirth" ||
    targetJob?.id === rebirth.toJob ||
    rule.toJob === rebirth.toJob
  );
}

function getRebirthRequirement() {
  const rebirth = getJobConstitution().rebirth || {};
  return {
    requiredBaseLevel: Number(rebirth.baseLevel || 99),
    requiredJobLevel: Number(rebirth.jobLevel || 50),
    fixedStartingStatusPoints: Number(rebirth.fixedStartingStatusPoints || 125),
    keepRemainingStatusPoints: rebirth.keepRemainingStatusPoints === true,
    resetStatsTo: Number(rebirth.resetStatsTo || 1),
    status: rebirth.status || "reserved"
  };
}

function applyRebirthConstitutionReset() {
  if (!player) return;
  const rebirth = getRebirthRequirement();
  const resetValue = Math.max(1, rebirth.resetStatsTo || 1);
  player.stats = { str: resetValue, agi: resetValue, vit: resetValue, int: resetValue, dex: resetValue, luk: resetValue };
  player.usedStatusPoints = 0;
  player.rebirthStatusPointPolicy = "fixed_reset_not_carry";
  player.rebirthFixedStatusPoints = rebirth.fixedStartingStatusPoints;
  if (typeof getTotalStatusPointsForLevel === "function") {
    player.statusPointBaseOffset = getTotalStatusPointsForLevel(1) - rebirth.fixedStartingStatusPoints;
  } else {
    player.statusPointBaseOffset = -77;
  }
  player.statusPoints = rebirth.fixedStartingStatusPoints;
}

function validateNoForbiddenDirectNormalRoute(currentJob, targetJob, requirement) {
  const constitution = getJobConstitution();
  if (!constitution.normalJobRoutes?.enforceRebirthBeforeThird) return { ok: true, message: "" };
  if (!currentJob || !targetJob) return { ok: true, message: "" };
  if (targetJob.classFamily === "extended" || requirement.routeType === "extended") return { ok: true, message: "" };

  const fromGroup = getJobRouteGroup(currentJob);
  const toGroup = getJobRouteGroup(targetJob);
  if (fromGroup === "second" && (toGroup === "third" || Number(targetJob.tier || 0) >= 3)) {
    return { ok: false, message: "RO_WEB 一般職業必須先完成轉生與進階二轉，不能未轉生直接三轉。" };
  }
  return { ok: true, message: "" };
}

function validateJobConstitution(rule = {}, targetJobKey = null) {
  if (!player) return { ok: false, message: "找不到玩家資料。" };

  const targetKey = targetJobKey || rule.toJob;
  const currentJob = typeof getCurrentJobData === "function" ? getCurrentJobData() : null;
  const targetJob = typeof getJobData === "function" ? getJobData(targetKey) : null;
  if (!currentJob || !targetJob) return { ok: false, message: "找不到轉職資料。" };

  if (rule.enabled === false) return { ok: false, message: "這個轉職項目尚未開放。" };
  if (targetJob.locked) return { ok: false, message: `${targetJob.name} 目前只預留架構，尚未開放。` };
  if (rule.fromJob && player.jobKey !== rule.fromJob) return { ok: false, message: "目前職業不符合轉職條件。" };
  if (rule.requiredRebirthFamily && String(player.rebirthFamily || "") !== String(rule.requiredRebirthFamily)) {
    return { ok: false, message: "轉生初心者只能回到轉生前的職業家族。" };
  }
  if (rule.requiredRebirthOrigin && String(player.rebirthOriginJobKey || "") !== String(rule.requiredRebirthOrigin)) {
    return { ok: false, message: "進階二轉必須與轉生前的二轉職業相同。" };
  }
  const rawGender = String(player?.gender || player?.sex || player?.bodyGender || "male").trim().toLowerCase();
  const playerGender = ["female", "f", "女", "woman", "girl"].includes(rawGender) ? "female" : "male";
  const allowedGenders = Array.isArray(rule.allowedGenders) && rule.allowedGenders.length
    ? rule.allowedGenders.map(String)
    : (Array.isArray(targetJob.allowedGenders) ? targetJob.allowedGenders.map(String) : []);
  if (allowedGenders.length && !allowedGenders.includes(playerGender)) {
    return { ok: false, message: `${targetJob.name} 不符合目前角色性別的官方轉職限制。` };
  }
  if (!Array.isArray(currentJob.nextJobs) || !currentJob.nextJobs.includes(targetKey)) {
    return { ok: false, message: `目前職業不能轉成 ${targetJob.name}。` };
  }

  const constitution = getJobConstitution();
  const common = constitution.commonRequirements || {};

  for (const entry of common.requiredUnequippedSystems || []) {
    if (isConstitutionStatusActive(entry)) {
      return { ok: false, message: entry.message || "請先解除特殊狀態。" };
    }
  }

  if (common.requireAllSkillPointsSpent !== false) {
    if (getPendingSkillPointCostSafe() > 0) {
      return { ok: false, message: "尚有暫存技能點未確認，請先套用或取消技能配點。" };
    }
    if (getRemainingSkillPointsForConstitution() > 0) {
      return { ok: false, message: "當前技能剩餘點數必須全部點完才能轉職。" };
    }
  }

  const requirement = getEffectiveJobChangeRequirement(rule, targetJob);
  if (requirement.lockedMessage) return { ok: false, message: requirement.lockedMessage };

  const directRouteCheck = validateNoForbiddenDirectNormalRoute(currentJob, targetJob, requirement);
  if (!directRouteCheck.ok) return directRouteCheck;

  if (isRebirthJobChange(rule, targetJob)) {
    const rebirthRequirement = getRebirthRequirement();
    if (rebirthRequirement.status === "reserved" || rebirthRequirement.status === "pending_confirm") {
      return { ok: false, message: "轉生系統目前只寫入憲法，尚未開放實作。" };
    }
    if (Number(player.baseLevel || 1) < rebirthRequirement.requiredBaseLevel || Number(player.jobLevel || 1) < rebirthRequirement.requiredJobLevel) {
      return { ok: false, message: `轉生條件不足：需要 Base ${rebirthRequirement.requiredBaseLevel} / Job ${rebirthRequirement.requiredJobLevel}。` };
    }
  }

  if (Number(player.baseLevel || 1) < requirement.requiredBaseLevel || Number(player.jobLevel || 1) < requirement.requiredJobLevel) {
    return { ok: false, message: `等級尚未達到轉職條件：需要 Base ${requirement.requiredBaseLevel} / Job ${requirement.requiredJobLevel}。` };
  }

  const skillCheck = validateRequiredSkills(requirement.requiredSkills);
  if (!skillCheck.ok) return skillCheck;

  return { ok: true, message: "", requirement };
}

function describeJobConstitutionRequirement(rule = {}) {
  const targetJob = typeof getJobData === "function" ? getJobData(rule.toJob) : null;
  const requirement = getEffectiveJobChangeRequirement(rule, targetJob);
  const skillText = (requirement.requiredSkills || [])
    .map(req => `${req.name || req.id || req.skillId} Lv${req.level || req.requiredLevel}`)
    .filter(Boolean)
    .join("、");
  return {
    ...requirement,
    skillText
  };
}
