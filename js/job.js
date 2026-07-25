//=======================================
// JobManager v0.4
// 職業系統 / 冒險者修練 / 轉職架構
//=======================================

let jobs = {};
let skillsData = null;
let serverConfig = null;

function normalizeSkillPrerequisites(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(req => ({
      id: req?.id ?? req?.officialId ?? req?.skillId,
      officialId: req?.officialId ?? req?.id ?? req?.skillId,
      level: Math.max(1, Number(req?.level || 1))
    }))
    .filter(req => req.id !== undefined && req.id !== null && req.id !== "");
}

function getSkillPrerequisites(skill) {
  return normalizeSkillPrerequisites(skill?.requires);
}

async function loadServerConfig() {
  try {
    serverConfig = await loadJson("./data/server_config.json");
    console.log("伺服器設定載入完成：", serverConfig);
  } catch (error) {
    console.warn("伺服器設定載入失敗，使用 1 倍預設值。", error);
    serverConfig = {
      server: {
        rateScale: 100,
        rates: {
          baseExp: 100,
          jobExp: 100,
          drop: 100,
          zeny: 100
        }
      }
    };
  }
}

async function loadJobData() {
  try {
    jobs = await loadJson("./data/jobs.json", {});
    console.log("職業資料載入完成：", jobs);
  } catch (error) {
    console.warn("職業資料載入失敗。", error);
    jobs = {};
  }
}

async function loadSkillData() {
  try {
    const manifest = await loadJson("./data/skill_manifest.json", null);
    if (!manifest?.cores?.length) throw new Error("Skill Core V3 manifest missing");

    const skillIndex = {};
    for (const corePath of manifest.cores) {
      const core = await loadJson(`./${corePath}`, { skills: {} });
      Object.entries(core?.skills || {}).forEach(([id, skill]) => {
        if (skillIndex[id]) throw new Error(`Duplicate official Skill ID: ${id}`);
        const raRequirements = (!Array.isArray(skill?.requires) && skill?.requires && typeof skill.requires === "object")
          ? skill.requires
          : (skill?.raRequirements || null);
        const officialId = skill?.officialId ?? skill?.id ?? Number(id);
        skillIndex[id] = {
          ...skill,
          officialId,
          icon: skill?.icon || (officialId !== undefined && officialId !== null ? `images/skills/${officialId}.png` : ""),
          raRequirements,
          requires: normalizeSkillPrerequisites(Array.isArray(skill?.requires) ? skill.requires : [])
        };
      });
    }

    const jobsMap = {};
    for (const treePath of manifest.trees || []) {
      const tree = await loadJson(`./${treePath}`, null);
      if (!tree?.job) continue;
      jobsMap[tree.job] = (tree.skills || []).filter(node => node?.exclude !== true).map(node => {
        const body = skillIndex[String(node.skillId)];
        if (!body) throw new Error(`Orphan skill tree reference: ${tree.job} -> ${node.skillId}`);
        const raRequirements = (!Array.isArray(body.requires) && body.requires && typeof body.requires === "object")
          ? body.requires
          : (body.raRequirements || null);
        const skill = {
          ...body,
          maxLevel: node.maxLevel ?? body.maxLevel,
          raRequirements,
          requires: normalizeSkillPrerequisites(node.requires)
        };
        if (node.requiredJobLevel !== undefined) skill.requiredJobLevel = node.requiredJobLevel;
        return skill;
      });
    }

    const runtimeProfiles = {};
    for (const runtimePath of manifest.runtimeProfiles || []) {
      const pack = await loadJson(`./${runtimePath}`, { skills: {} });
      Object.entries(pack?.skills || {}).forEach(([id, profile]) => { runtimeProfiles[String(id)] = profile; });
    }

    const trainingData = await loadJson("./data/adventurer_training.json", { adventurer_training: [] });
    const copyableSkills = manifest.copyableSkills ? await loadJson(`./${manifest.copyableSkills}`, { plagiarism: [], reproduce: [] }) : { plagiarism: [], reproduce: [] };
    skillsData = {
      meta: { version: "0.9.82EH", schema: "Skill Core V3 + Runtime Profile Only", manifest },
      adventurer_training: trainingData?.adventurer_training || [],
      skillIndex,
      runtimeProfiles,
      copyableSkills,
      jobs: jobsMap
    };
    console.log("Skill Core V3 loaded:", Object.keys(skillIndex).length, "unique skills /", Object.keys(jobsMap).length, "job trees");
  } catch (error) {
    console.error("Skill Core V3 load failed. Legacy skills.json fallback has been retired.", error);
    skillsData = { meta: { version: "0.9.82EH", loadError: String(error) }, adventurer_training: [], skillIndex: {}, runtimeProfiles: {}, jobs: {} };
  }
}

function getRate(rateKey) {
  const scale = Number(serverConfig?.server?.rateScale || 100);
  const raw = Number(serverConfig?.server?.rates?.[rateKey] ?? scale);
  return raw / scale;
}

function applyRate(value, rateKey) {
  return Math.max(0, Math.floor(Number(value || 0) * getRate(rateKey)));
}

function getJobData(jobKey = player?.jobKey) {
  if (!jobKey) return null;
  return jobs?.[jobKey] || null;
}

function getCurrentJobData() {
  return getJobData(player?.jobKey);
}

function getJobDisplayName(jobKey) {
  return getJobData(jobKey)?.name || jobKey || "未知職業";
}

function getAdventurerTrainingList() {
  return skillsData?.adventurer_training || [];
}

function getUnlockedAdventurerTraining() {
  if (!player || player.jobKey !== "novice") {
    return player?.completedAdventurerTraining || [];
  }

  const basicLevel = typeof getSkillLevel === "function" ? getSkillLevel("NV_BASIC") : 0;
  const unlockedTrainingLevel = Math.min(10, Number(basicLevel || 0) + (basicLevel > 0 ? 1 : 0));
  return getAdventurerTrainingList()
    .filter(training => Number(training.jobLevel || 0) <= unlockedTrainingLevel);
}

function getTrainingBonusTotals() {
  const totals = {
    maxHpRate: 0,
    maxSpRate: 0,
    atkRate: 0,
    defRate: 0,
    damageRate: 0,
    baseExpRate: 0,
    jobExpRate: 0,
    dropRate: 0,
    zenyRate: 0,
    atkFlat: 0,
    defFlat: 0
  };

  // Batch101：初心者知識正式納入技能 Runtime 統計。
  // 每 1 級：Base EXP / Job EXP / 掉寶率 +2%，Zeny +5%。
  // NV_BASIC 在通用被動統計中刻意排除，獎勵倍率只由此入口套用一次。
  const basicLevel = typeof getSkillLevel === "function" ? Number(getSkillLevel("NV_BASIC") || 0) : 0;
  const expDropBonus = Math.max(0, basicLevel) * 2;
  const zenyBonus = Math.max(0, basicLevel) * 5;
  totals.baseExpRate += expDropBonus;
  totals.jobExpRate += expDropBonus;
  totals.dropRate += expDropBonus;
  totals.zenyRate += zenyBonus;

  return totals;
}

function getRewardBonusRate(rateKey) {
  const totals = getTrainingBonusTotals();
  const active = typeof getActiveBuffBonusTotals === "function" ? getActiveBuffBonusTotals() : {};
  if (rateKey === "baseExp") return Number(totals.baseExpRate || 0) + Number(active.baseExpRate || 0);
  if (rateKey === "jobExp") return Number(totals.jobExpRate || 0) + Number(active.jobExpRate || 0);
  if (rateKey === "drop") return totals.dropRate || 0;
  if (rateKey === "zeny") return totals.zenyRate || 0;
  return 0;
}

function applyTrainingRewardBonus(value, rateKey) {
  const bonus = getRewardBonusRate(rateKey);
  return Math.max(0, Math.floor(Number(value || 0) * (100 + bonus) / 100));
}


function getJobRulePlayerGender() {
  const raw = String(player?.gender || player?.sex || player?.bodyGender || "male").trim().toLowerCase();
  return ["female", "f", "女", "woman", "girl"].includes(raw) ? "female" : "male";
}

function isJobChangeRuleVisibleForPlayer(rule = null) {
  if (!rule || !player) return false;
  if (rule.enabled === false || rule.fromJob !== player.jobKey) return false;
  if (rule.requiredRebirthFamily && String(player.rebirthFamily || "") !== String(rule.requiredRebirthFamily)) return false;
  if (rule.requiredRebirthOrigin && String(player.rebirthOriginJobKey || "") !== String(rule.requiredRebirthOrigin)) return false;
  const allowedGenders = Array.isArray(rule.allowedGenders) ? rule.allowedGenders.map(String) : [];
  if (allowedGenders.length && !allowedGenders.includes(getJobRulePlayerGender())) return false;
  return true;
}
window.isJobChangeRuleVisibleForPlayer = isJobChangeRuleVisibleForPlayer;

function getAvailableJobChanges() {
  if (!player) return [];

  const currentJob = getCurrentJobData();
  if (!currentJob) return [];

  const ruleList = Array.isArray(jobChangeRules)
    ? jobChangeRules.filter(rule => isJobChangeRuleVisibleForPlayer(rule))
    : [];

  if (ruleList.length > 0) {
    return ruleList
      .map(rule => {
        const job = getJobData(rule.toJob);
        if (!job) return null;
        const check = typeof validateJobConstitution === "function"
          ? validateJobConstitution(rule, rule.toJob)
          : { ok: true, message: "" };
        return check.ok ? job : null;
      })
      .filter(Boolean);
  }

  if (!Array.isArray(currentJob.nextJobs)) return [];
  return currentJob.nextJobs
    .map(jobKey => getJobData(jobKey))
    .filter(Boolean)
    .filter(job => {
      const rule = { fromJob: player.jobKey, toJob: job.id, enabled: true };
      const check = typeof validateJobConstitution === "function"
        ? validateJobConstitution(rule, job.id)
        : { ok: Number(player.jobLevel || 1) >= Number(currentJob.jobMaxLevel || 0) };
      return check.ok;
    });
}


function meetsJobChangeSkillRequirements(rule = null) {
  if (typeof describeJobConstitutionRequirement === "function") {
    const requirement = describeJobConstitutionRequirement(rule || {});
    return validateRequiredSkills(requirement.requiredSkills || []);
  }
  return { ok: true, message: "" };
}

function changeJob(targetJobKey, rule = null) {
  if (!player) return;

  const targetJob = getJobData(targetJobKey);
  const currentJob = getCurrentJobData();

  if (!targetJob || !currentJob) {
    addBattleLog("找不到轉職資料。");
    return;
  }

  const effectiveRule = rule || (jobChangeRules || []).find(item => item.fromJob === player.jobKey && item.toJob === targetJobKey) || {
    fromJob: player.jobKey,
    toJob: targetJobKey,
    enabled: true
  };

  const constitutionCheck = typeof validateJobConstitution === "function"
    ? validateJobConstitution(effectiveRule, targetJobKey)
    : { ok: true, message: "" };
  if (!constitutionCheck.ok) {
    addBattleLog(constitutionCheck.message);
    return;
  }

  if (player.jobKey === "novice") {
    // 初學者修練永久保留，轉職後繼續吃被動加成。
    player.completedAdventurerTraining = getAdventurerTrainingList().filter(training => Number(training.jobLevel || 0) <= 10);
  }

  const oldJobName = player.job;
  const wasTraitJob = currentJob.id === "hyper_novice" || Number(currentJob.tier || 0) === 4 || String(currentJob.routeGroup || "") === "fourth";
  const becomesTraitJob = targetJob.id === "hyper_novice" || Number(targetJob.tier || 0) === 4 || String(targetJob.routeGroup || "") === "fourth";
  const enteredTraitJob = becomesTraitJob && !wasTraitJob;
  const isRebirthChange = typeof isRebirthJobChange === "function" ? isRebirthJobChange(effectiveRule, targetJob) : false;

  if (isRebirthChange) {
    player.rebirthOriginJobKey = String(player.jobKey || "");
    player.rebirthFamily = String(currentJob.family || "");
  }

  player.jobKey = targetJob.id;
  player.appearanceGroup = String(targetJob.appearanceGroup || targetJob.id || "novice");
  if (typeof syncROStudioCharacterFromPlayer === "function") syncROStudioCharacterFromPlayer();
  player.job = targetJob.name;
  // rAthena pc_jobchange：切換職業後逐欄重新驗證裝備，僅將新職業無法使用的裝備退回背包。
  if (typeof unequipInvalidEquipmentAfterJobChange === "function") unequipInvalidEquipmentAfterJobChange();
  player.jobLevel = 1;
  player.jobExp = 0;
  player.jobExpToNext = getExpToNext("job", 1);
  player.skillPoints = targetJob.id === "novice" || targetJob.id === "high_novice" ? 0 : 1;
  player.learnedSkills = player.learnedSkills || {};

  if (isRebirthChange && typeof applyRebirthConstitutionReset === "function") {
    applyRebirthConstitutionReset();
    player.baseLevel = 1;
    player.baseExp = 0;
    player.baseExpToNext = getExpToNext("base", 1);
    player.learnedSkills = {};
    player.pendingSkillAdds = {};
    if (Array.isArray(player.quickSlots)) {
      player.quickSlots = player.quickSlots.map(slot => slot?.type === "skill" ? { type: "empty" } : slot);
    }
    if (player.autoCombat) {
      player.autoCombat.heal = null;
      player.autoCombat.attack = null;
      player.autoCombat.attacks = [];
      player.autoCombat.buffs = {};
    }
  }

  if (enteredTraitJob && typeof syncTraitPointCache === "function") syncTraitPointCache();
  recalculatePlayerStats();
  updatePlayerUI();
  updateJobUI();
  updateSkillUI();
  if (typeof updateQuickSlotUI === "function") updateQuickSlotUI();
  saveGame();

  addBattleLog(`${oldJobName} 轉職成 ${targetJob.name}！`);
  if (enteredTraitJob) {
    const bonus = typeof getTraitJobChangeBonus === "function" ? getTraitJobChangeBonus(targetJob.id, player.baseLevel) : 7;
    addBattleLog(`轉為四轉職業，獲得特性點數 ${bonus} 點，可立即配點。`);
  }
}

function updateJobUI() {
  const jobPanel = document.getElementById("job-panel");
  if (!jobPanel || !player) return;

  const jobData = getCurrentJobData();
  const maxJob = getMaxLevel("job");
  const availableChanges = getAvailableJobChanges();

  const trainingList = getAdventurerTrainingList();
  const unlockedTrainings = getUnlockedAdventurerTraining();
  const unlockedIds = new Set(unlockedTrainings.map(item => item.id));

  let html = `
    <div class="job-current">
      <div class="job-name">${player.job}</div>
      <div>Base Lv ${player.baseLevel} / ${Number(jobData?.baseMaxLevel || 99)}</div>
      <div>Job Lv ${player.jobLevel} / ${maxJob}</div>
      <div>Skill Point ${Number(player.skillPoints || 0)}</div>
    </div>
  `;

  if (player.jobKey === "novice") {
    html += `<div class="job-section-title">🌱 冒險者修練</div>`;
    html += `<div class="training-list">`;
    trainingList.forEach(training => {
      const unlocked = unlockedIds.has(training.id);
      html += `
        <div class="training-row ${unlocked ? "unlocked" : "locked"}">
          <span>Job ${training.jobLevel} ${training.name}</span>
          <b>${unlocked ? "✓" : "未開啟"}</b>
          <small>${training.effect}</small>
        </div>
      `;
    });
    html += `</div>`;
  } else if (player.completedAdventurerTraining && player.completedAdventurerTraining.length > 0) {
    html += `<div class="job-section-title">永久修練</div>`;
    html += `<div class="training-summary">冒險者修練已完成，永久被動生效中。</div>`;
  }

  html += `<div class="job-section-title">轉職</div>`;

  if (availableChanges.length === 0) {
    if (player.jobLevel >= maxJob && jobData?.nextJobs?.length === 0) {
      html += `<div class="job-hint">目前已達此階段上限。後續職業之後再開放。</div>`;
    } else {
      html += `<div class="job-hint">Job Lv 達到 ${maxJob} 後，請前往對應城鎮尋找轉職 NPC。</div>`;
    }
  } else {
    html += `<div class="job-change-list">`;
    html += `<div class="job-hint">你已符合轉職條件，請前往對應城鎮尋找轉職 NPC。</div>`;
    availableChanges.forEach(job => {
      const cityHint = job.changeCity ? `｜${job.changeCity}` : "";
      const lockedText = job.locked ? "（未開放）" : "";
      html += `<div class="job-hint">可轉職：${job.name}${lockedText}${cityHint}</div>`;
    });
    html += `</div>`;
  }

  jobPanel.innerHTML = html;
}

function uniqueSkillsByOfficialId(lists = []) {
  const result = [], seen = new Set();
  (Array.isArray(lists) ? lists : []).flat().forEach(skill => {
    const id = String(skill?.officialId ?? skill?.id ?? "");
    if (!id || seen.has(id)) return;
    seen.add(id); result.push(skill);
  });
  return result;
}

function getJobSkillTreeKeys(jobKey = player?.jobKey) {
  const job = getJobData(jobKey);
  if (Array.isArray(job?.skillTreeChain)) return job.skillTreeChain;
  return jobKey ? [jobKey] : [];
}

function getCurrentJobSkills() {
  if (!player || !skillsData?.jobs) return [];
  if (isSuperNoviceFamilyJob(player.jobKey)) {
    const keys = player.jobKey === "hyper_novice" ? ["novice","super_novice","expanded_super_novice","hyper_novice"]
      : player.jobKey === "expanded_super_novice" ? ["novice","super_novice","expanded_super_novice"] : ["novice","super_novice"];
    return uniqueSkillsByOfficialId(keys.map(key => skillsData.jobs[key] || []));
  }
  return uniqueSkillsByOfficialId(getJobSkillTreeKeys().map(key => skillsData.jobs[key] || []));
}

function getSkillPrimaryId(skillOrId) {
  if (skillOrId && typeof skillOrId === "object") {
    return skillOrId.officialId ?? skillOrId.id;
  }
  const skill = getSkillDataById(skillOrId, true);
  return skill ? (skill.officialId ?? skill.id) : skillOrId;
}

function getSkillStorageKey(skillOrId) {
  const primary = getSkillPrimaryId(skillOrId);
  return String(primary);
}

// RO 0~2 job/quest skills are treated as already completed once the character is in
// an applicable job tree. They cost no skill points, survive reset, and are granted
// again automatically after rebirth/job changes.
const AUTO_GRANTED_JOB_QUEST_SKILL_IDS = new Set([
  142,144,145,146,147,148,149,150,151,152,153,154,155,156,157,
  238,1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,
  1011,1012,1013,1014,1015,1016,1017,1018,1019,2535,2544
]);

function isAutoGrantedJobQuestSkill(skillOrId) {
  const skill = skillOrId && typeof skillOrId === "object" ? skillOrId : getSkillDataById(skillOrId, true);
  const officialId = Number(skill?.officialId ?? skill?.id ?? skillOrId ?? 0);
  if (!AUTO_GRANTED_JOB_QUEST_SKILL_IDS.has(officialId)) return false;
  return getCurrentJobSkills().some(candidate => Number(candidate?.officialId ?? candidate?.id ?? 0) === officialId);
}
window.isAutoGrantedJobQuestSkill = isAutoGrantedJobQuestSkill;

function isSkillBasic(skill) {
  return String(skill?.code || "") === "NV_BASIC" || Number(skill?.officialId ?? skill?.id) === 1;
}

function getSkillDataById(skillId, skipNormalize = false) {
  const raw = skillId && typeof skillId === "object" ? (skillId.officialId ?? skillId.id) : skillId;
  const current = getCurrentJobSkills().find(skill => {
    const official = skill.officialId ?? skill.id;
    return String(skill.id) === String(raw) || String(official) === String(raw) || String(skill.code || skill.key || "") === String(raw);
  });
  if (current) return current;
  const direct = skillsData?.skillIndex?.[String(raw)];
  if (direct) return direct;
  return Object.values(skillsData?.skillIndex || {}).find(skill => String(skill.code || skill.key || "") === String(raw)) || null;
}

function getNativeSkillLevel(skillId) {
  const skill = getSkillDataById(skillId);
  if (skill?.autoUnlocked || isAutoGrantedJobQuestSkill(skill || skillId)) return 1;
  if (!player || !player.learnedSkills) return 0;
  const key = getSkillStorageKey(skill || skillId);
  const legacyKey = skill?.code ? String(skill.code) : null;
  return Number(player.learnedSkills[key] ?? (legacyKey ? player.learnedSkills[legacyKey] : 0) ?? 0);
}

function getSkillLevel(skillId) {
  const nativeLevel = getNativeSkillLevel(skillId);
  const extraLevel = typeof getExtraSkillLevel === "function" ? Number(getExtraSkillLevel(getSkillPrimaryId(skillId)) || 0) : 0;
  return Math.max(nativeLevel, extraLevel);
}

function getPendingSkillAdds() {
  if (!player) return {};
  player.pendingSkillAdds = player.pendingSkillAdds && typeof player.pendingSkillAdds === "object" ? player.pendingSkillAdds : {};
  return player.pendingSkillAdds;
}

function getPendingSkillAdd(skillId) {
  const key = getSkillStorageKey(skillId);
  return Number(getPendingSkillAdds()[key] || 0);
}

function getPreviewSkillLevel(skillId) {
  return getSkillLevel(skillId) + getPendingSkillAdd(skillId);
}

function getPendingSkillPointCost() {
  return Object.values(getPendingSkillAdds()).reduce((sum, value) => sum + Math.max(0, Number(value || 0)), 0);
}

function getAvailableSkillPointsForPreview() {
  return Math.max(0, Number(player?.skillPoints || 0) - getPendingSkillPointCost());
}


function forceSkillFooterVisible() {
  const footer = document.getElementById("skill-point-footer");
  const skillWindow = document.getElementById("skill-window");
  const body = skillWindow?.querySelector(".skill-window-body");
  if (!footer || !skillWindow || !body) return;

  // v0.9.46：footer 固定掛在 #skill-window 最外層。
  // 這樣不會被 skill-panel 的 scroll 區或 .window-body overflow 裁切。
  if (footer.parentElement !== skillWindow) {
    skillWindow.appendChild(footer);
  }

  Object.assign(skillWindow.style, {
    position: "absolute",
    overflow: "visible"
  });

  Object.assign(footer.style, {
    position: "absolute",
    left: "88px",
    right: "14px",
    bottom: "12px",
    height: "38px",
    minHeight: "38px",
    maxHeight: "38px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    boxSizing: "border-box",
    zIndex: "9000",
    visibility: "visible",
    opacity: "1",
    pointerEvents: "auto",
    overflow: "visible"
  });
}


function clearPendingSkillAdds() {
  if (player) player.pendingSkillAdds = {};
}


function migrateSkillStorageToOfficialIds() {
  if (!player || typeof getCurrentJobSkills !== "function") return;
  const allSkills = [];
  Object.values(skillsData?.jobs || {}).forEach(list => {
    if (Array.isArray(list)) allSkills.push(...list);
  });

  const normalizeMapValue = (value) => {
    const skill = allSkills.find(item =>
      String(item.id) === String(value) ||
      String(item.officialId ?? item.id) === String(value) ||
      String(item.code || "") === String(value)
    );
    return skill ? String(skill.officialId ?? skill.id) : String(value);
  };

  if (player.learnedSkills && typeof player.learnedSkills === "object") {
    const next = {};
    Object.entries(player.learnedSkills).forEach(([key, value]) => {
      const normalized = normalizeMapValue(key);
      next[normalized] = Math.max(Number(next[normalized] || 0), Number(value || 0));
    });
    player.learnedSkills = next;
  }

  if (player.pendingSkillAdds && typeof player.pendingSkillAdds === "object") {
    const next = {};
    Object.entries(player.pendingSkillAdds).forEach(([key, value]) => {
      const normalized = normalizeMapValue(key);
      next[normalized] = Math.max(Number(next[normalized] || 0), Number(value || 0));
    });
    player.pendingSkillAdds = next;
  }

  if (Array.isArray(player.quickSlots)) {
    player.quickSlots.forEach(slot => {
      if (slot && slot.type === "skill" && slot.id !== undefined) {
        slot.id = normalizeMapValue(slot.id);
      }
    });
  }

  if (player.autoCombat) {
    if (player.autoCombat.heal?.skillId) player.autoCombat.heal.skillId = normalizeMapValue(player.autoCombat.heal.skillId);
    if (player.autoCombat.attack?.skillId) player.autoCombat.attack.skillId = normalizeMapValue(player.autoCombat.attack.skillId);
    if (Array.isArray(player.autoCombat.attacks)) {
      player.autoCombat.attacks.forEach(slot => {
        if (slot?.skillId) slot.skillId = normalizeMapValue(slot.skillId);
      });
      player.autoCombat.attack = player.autoCombat.attacks[0] || player.autoCombat.attack;
    }
    if (player.autoCombat.buffs && typeof player.autoCombat.buffs === "object") {
      const nextBuffs = {};
      Object.entries(player.autoCombat.buffs).forEach(([key, value]) => {
        nextBuffs[normalizeMapValue(key)] = value;
      });
      player.autoCombat.buffs = nextBuffs;
    }
  }
}

function getSkillRequirementText(skill) {
  const parts = [];
  if (Number(skill.requiredJobLevel || 1) > 1) {
    parts.push(`Job ${skill.requiredJobLevel}`);
  }

  getSkillPrerequisites(skill).forEach(req => {
    const reqSkill = getSkillDataById(req.id);
    parts.push(`${reqSkill?.name || req.id} Lv ${req.level}`);
  });

  return parts.length ? parts.join(" / ") : "無前置";
}


function getSkillLevelValueForUI(value, level, fallback = 0) {
  if (typeof getLevelValue === "function") return getLevelValue(value, level, fallback);
  if (Array.isArray(value)) {
    const index = Math.max(0, Number(level || 1) - 1);
    return Number(value[index] ?? value[value.length - 1] ?? fallback);
  }
  if (value && typeof value === "object") {
    return Number(value[level] ?? value[String(level)] ?? fallback);
  }
  return Number(value ?? fallback);
}

function formatSkillDurationForUI(ms) {
  const value = Number(ms || 0);
  if (value <= 0) return "無";
  if (value >= 1000) return `${Math.round(value / 1000)} 秒`;
  return `${value} ms`;
}

function getSkillEffectLabel(key) {
  const labels = {
    maxHpRate: "Max HP",
    maxSpRate: "Max SP",
    atkRate: "ATK",
    defRate: "DEF",
    damageRate: "最終傷害",
    baseExpRate: "Base EXP",
    jobExpRate: "Job EXP",
    dropRate: "掉寶率",
    zenyRate: "Zeny",
    atkFlat: "ATK",
    defFlat: "DEF",
    matAtkFlat: "MATK",
    matkFlat: "MATK",
    hitFlat: "HIT",
    fleeFlat: "FLEE",
    perfectDodgeFlat: "完全迴避",
    perfectHitRate: "完全命中",
    resFlat: "RES",
    mresFlat: "MRES",
    pAtk: "P.ATK",
    sMatk: "S.MATK",
    staFlat: "STA",
    wisFlat: "WIS",
    splFlat: "SPL",
    powFlat: "POW",
    conFlat: "CON",
    crtFlat: "CRT",
    resPiercePercent: "RES 穿透",
    mresPiercePercent: "MRES 穿透",
    criFlat: "CRI",
    aspdFlat: "ASPD",
    avoidRate: "受擊迴避機率",
    attackRangeCells: "普攻射程",
    hpRecoverySkillLevel: "HP 自然恢復技能等級",
    spRecoverySkillLevel: "SP 自然恢復技能等級",
    strFlat: "STR",
    agiFlat: "AGI",
    vitFlat: "VIT",
    intFlat: "INT",
    dexFlat: "DEX",
    lukFlat: "LUK",
    spRecoveryRate: "SP 自然恢復",
    itemHpRecoveryRate: "HP 回復道具效果",
    itemSpRecoveryRate: "SP 回復道具效果",
    healPowerRate: "治療量",
    offertoriumHealPowerRate: "奉獻頌治療量",
    skillSpCostIncreaseRate: "技能 SP 消耗",
    criticalDamageRate: "暴擊傷害",
    defPiercePercent: "DEF 無視",
    mdefPiercePercent: "MDEF 無視",
    fixedCastReductionRate: "固定詠唱縮短",
    holyDamageTakenRate: "受到聖屬性傷害",
    longRangePhysicalImmunity: "遠距離物理免疫",
    holyDefenseElement: "聖屬性防禦",
    kyrieBarrierMaxHpRate: "霸邪護盾 HP",
    kyrieBarrierHits: "霸邪承受次數",
    basilicaPhysicalDarkUndeadRate: "暗／不死物理增傷",
    holyMagicDamageRate: "聖屬性魔法增傷",
    incomingDamageRate: "受到傷害",
    steelBody: "金剛不壞",
    furyState: "爆氣"
  };
  return labels[key] || key;
}

function isPercentSkillEffect(key) {
  return /Rate$/.test(key) || ["avoidRate", "damageRate", "dropRate", "zenyRate", "baseExpRate", "jobExpRate"].includes(key);
}

function formatSkillEffectForUI(key, value) {
  const number = Number(value || 0);
  const sign = number >= 0 ? "+" : "";
  const suffix = isPercentSkillEffect(key) ? "%" : "";
  return `${getSkillEffectLabel(key)} ${sign}${number}${suffix}`;
}


function buildSkillTooltipText(skill, currentLevel, check, maxed) {
  if (!skill) return "";
  if (isSkillBasic(skill)) {
    const bonus = Number(currentLevel || 0) * 2;
    return [
      `${skill.name} Lv.${currentLevel} / ${skill.maxLevel}`,
      "類型：被動 / 初心者知識",
      "前置：無前置",
      "消耗 SP：0",
      `效果：Base EXP +${bonus}% / Job EXP +${bonus}% / 掉寶率 +${bonus}% / Zeny +${bonus}%`,
      "說明：RO_WEB 初心者知識。點擊左鍵可查看目前修練倍率與轉職資訊；技能等級需由玩家自行配點。",
      "操作：點擊可查看初心者修練與轉職資訊。",
      maxed ? "狀態：已達上限" : `狀態：${check?.ok ? "可升級" : (check?.reason || "不可升級")}`
    ].join("\n");
  }
  const nextLevel = Math.min(Number(skill.maxLevel || 1), Math.max(1, currentLevel + 1));
  const previewLevel = currentLevel > 0 ? currentLevel : nextLevel;
  const typeText = typeof getSkillTypeText === "function" ? getSkillTypeText(skill) : (skill.skillType || "技能");
  const lines = [
    `${skill.name} Lv.${currentLevel} / ${skill.maxLevel}`,
    `類型：${typeText}`,
    `前置：${getSkillRequirementText(skill)}`
  ];

  if (skill.spCost !== undefined) {
    lines.push(`消耗 SP：${getSkillLevelValueForUI(skill.spCost, previewLevel, 0)}`);
  }
  const runtimeProfile = typeof getSkillRuntimeProfile === "function" ? getSkillRuntimeProfile(skill) : null;
  if (runtimeProfile) {
    if (runtimeProfile.ratio !== undefined) lines.push(`傷害倍率：${getSkillLevelValueForUI(runtimeProfile.ratio, previewLevel, 100)}%`);
    if (runtimeProfile.heal !== undefined) lines.push(`恢復量：${getSkillLevelValueForUI(runtimeProfile.heal, previewLevel, 0)} HP`);
    const runtimeDuration = runtimeProfile.duration !== undefined
      ? getSkillLevelValueForUI(runtimeProfile.duration, previewLevel, 0)
      : (runtimeProfile.durationFromSkill ? getSkillLevelValueForUI(skill.duration, previewLevel, 0) : 0);
    if (runtimeDuration > 0) lines.push(`持續時間：${formatSkillDurationForUI(runtimeDuration)}`);
    if (runtimeProfile.passiveBonuses) {
      const bonusParts = Object.keys(runtimeProfile.passiveBonuses).map(key => formatSkillEffectForUI(key, getSkillLevelValueForUI(runtimeProfile.passiveBonuses[key], previewLevel, 0)));
      if (bonusParts.length) lines.push(`被動效果：${bonusParts.join(" / ")}`);
    }
    if (runtimeProfile.effects) {
      const effectParts = Object.keys(runtimeProfile.effects).map(key => formatSkillEffectForUI(key, runtimeProfile.effects[key] === "level" ? previewLevel : getSkillLevelValueForUI(runtimeProfile.effects[key], previewLevel, 0)));
      if (effectParts.length) lines.push(`效果：${effectParts.join(" / ")}`);
    }
  } else {
    lines.push("Runtime：尚未完成（不會使用舊傷害或效果公式）");
  }

  lines.push(`說明：${skill.description || skill.name}`);

  if (isSkillBasic(skill)) {
    lines.push("操作：點擊可查看初心者修練與轉職資訊。");
  }
  if (skill.autoUnlocked || skill.autoLevelByJobLevel) {
    lines.push("狀態：初心者技能，已開放。");
  } else {
    lines.push(maxed ? "狀態：已達上限" : `狀態：${check?.ok ? "可升級" : (check?.reason || "不可升級")}`);
  }
  if (currentLevel > 0 && canSkillUseQuickSlotForJob(skill)) {
    lines.push("快捷欄：已學會後會自動列入候選。 ");
  }
  return lines.join("\n");
}

function setSkillPointFooterText() {
  const footer = document.getElementById("skill-point-footer");
  if (!footer) return;
  if (getVisibleSkillTier() === "other") {
    const count = typeof getExtraSkillEntries === "function" ? getExtraSkillEntries().length : 0;
    footer.innerHTML = `<span>其他技能：<b>${count}</b></span><span class="skill-extra-hint">來源卸除或被覆蓋時會自動移除</span>`;
    forceSkillFooterVisible();
    return;
  }
  const available = getAvailableSkillPointsForPreview();
  footer.innerHTML = `
    <span>剩餘點數：<b>${available}</b></span>
    <span class="skill-footer-actions">
      <button type="button" id="confirmSkillPointsBtn">確認配點</button>
      <button type="button" id="resetSkillPointsBtn" title="需要：技能重置棒">初始化</button>
    </span>
  `;
  footer.querySelector("#confirmSkillPointsBtn")?.addEventListener("click", confirmPendingSkillPoints);
  footer.querySelector("#resetSkillPointsBtn")?.addEventListener("click", resetPendingSkillPoints);
  forceSkillFooterVisible();
}

function getProjectedSkillLevelForPlan(skillOrId, pendingMap = getPendingSkillAdds(), additions = {}) {
  const key = getSkillStorageKey(skillOrId);
  return getSkillLevel(skillOrId) + Number(pendingMap?.[key] || 0) + Number(additions?.[key] || 0);
}

function buildSkillPrerequisiteAutoPlan(skillOrId, options = {}) {
  const target = getSkillDataById(skillOrId);
  const pending = getPendingSkillAdds();
  const additions = {};
  const order = [];
  const blocked = [];
  const cycles = [];
  let remaining = Math.max(0, Number(options.availablePoints ?? getAvailableSkillPointsForPreview()) || 0);

  const addLevels = (skill, requested) => {
    const key = getSkillStorageKey(skill);
    const maxLevel = Math.max(0, Number(skill?.maxLevel || 0));
    const current = getProjectedSkillLevelForPlan(skill, pending, additions);
    const wanted = Math.max(current, Math.min(maxLevel, Number(requested || current)));
    const need = Math.max(0, wanted - current);
    const spend = Math.min(need, remaining);
    if (spend <= 0) return 0;
    additions[key] = Number(additions[key] || 0) + spend;
    remaining -= spend;
    let row = order.find(entry => entry.key === key);
    if (!row) {
      row = { key, skill, add: 0 };
      order.push(row);
    }
    row.add += spend;
    return spend;
  };

  const ensureLevel = (skill, requiredLevel, stack = []) => {
    if (!skill) return false;
    const key = getSkillStorageKey(skill);
    if (stack.includes(key)) {
      cycles.push([...stack, key]);
      return false;
    }
    const requiredJobLevel = Number(skill.requiredJobLevel || 1);
    if (Number(player?.jobLevel || 1) < requiredJobLevel) {
      blocked.push({ type: 'job', skill, requiredJobLevel });
      return false;
    }
    const nextStack = [...stack, key];
    for (const req of getSkillPrerequisites(skill)) {
      const reqSkill = getSkillDataById(req.id);
      if (!reqSkill) {
        blocked.push({ type: 'missing_skill', id: req.id, level: Number(req.level || 1), owner: skill });
        return false;
      }
      if (!ensureLevel(reqSkill, Number(req.level || 1), nextStack)) return false;
    }
    const current = getProjectedSkillLevelForPlan(skill, pending, additions);
    if (current < Number(requiredLevel || 0)) addLevels(skill, Number(requiredLevel || 0));
    return getProjectedSkillLevelForPlan(skill, pending, additions) >= Number(requiredLevel || 0);
  };

  if (!target) {
    return { target: null, additions, order, pointsUsed: 0, remainingPoints: remaining, complete: false, blocked: [{ type: 'missing_target' }], cycles, deficits: [] };
  }

  const targetCurrent = getProjectedSkillLevelForPlan(target, pending, additions);
  const targetWanted = Math.min(Number(target.maxLevel || 1), targetCurrent + Math.max(1, Number(options.targetAdd || 1)));
  const prerequisitesReady = getSkillPrerequisites(target).every(req => {
    const reqSkill = getSkillDataById(req.id);
    return reqSkill ? ensureLevel(reqSkill, Number(req.level || 1), [getSkillStorageKey(target)]) : false;
  });

  if (prerequisitesReady && Number(player?.jobLevel || 1) >= Number(target.requiredJobLevel || 1)) {
    addLevels(target, targetWanted);
  } else if (Number(player?.jobLevel || 1) < Number(target.requiredJobLevel || 1)) {
    blocked.push({ type: 'job', skill: target, requiredJobLevel: Number(target.requiredJobLevel || 1) });
  }

  const deficits = [];
  const collectDeficits = (skill, visited = new Set()) => {
    if (!skill) return;
    const key = getSkillStorageKey(skill);
    if (visited.has(key)) return;
    visited.add(key);
    for (const req of getSkillPrerequisites(skill)) {
      const reqSkill = getSkillDataById(req.id);
      const have = reqSkill ? getProjectedSkillLevelForPlan(reqSkill, pending, additions) : 0;
      const need = Number(req.level || 1);
      if (have < need) deficits.push({ skill: reqSkill, id: req.id, have, need, missing: need - have });
      if (reqSkill) collectDeficits(reqSkill, visited);
    }
  };
  collectDeficits(target);
  const finalTargetLevel = getProjectedSkillLevelForPlan(target, pending, additions);
  const complete = finalTargetLevel >= targetWanted;
  const pointsUsed = order.reduce((sum, row) => sum + Number(row.add || 0), 0);
  return { target, additions, order, pointsUsed, remainingPoints: remaining, complete, blocked, cycles, deficits, targetWanted, finalTargetLevel };
}
window.buildSkillPrerequisiteAutoPlan = buildSkillPrerequisiteAutoPlan;

function formatSkillAutoPlanRows(plan) {
  return (plan?.order || []).map(row => `${row.skill?.name || row.key} +${row.add} → Lv ${getPreviewSkillLevel(row.skill || row.key) + Number(row.add || 0)}`);
}

function formatSkillPlanDeficits(plan) {
  const rows = [];
  (plan?.deficits || []).forEach(row => rows.push(`${row.skill?.name || row.id} 還差 ${row.missing} 級`));
  (plan?.blocked || []).forEach(row => {
    if (row.type === 'job') rows.push(`${row.skill?.name || '技能'} 需要 Job Lv ${row.requiredJobLevel}`);
    else if (row.type === 'missing_skill') rows.push(`缺少前置技能資料 ${row.id} Lv ${row.level}`);
  });
  if (plan?.cycles?.length) rows.push('技能前置資料存在循環，已停止自動補點');
  return [...new Set(rows)];
}

function canLearnSkill(skill) {
  if (!player || !skill) return { ok: false, reason: '找不到技能資料' };
  if (skill.autoUnlocked || isAutoGrantedJobQuestSkill(skill)) return { ok: false, reason: '職業自動技能' };

  const currentLevel = getPreviewSkillLevel(skill.id);
  if (currentLevel >= Number(skill.maxLevel || 0)) return { ok: false, reason: '已達上限' };
  if (Number(player.jobLevel || 1) < Number(skill.requiredJobLevel || 1)) return { ok: false, reason: `需要 Job Lv ${skill.requiredJobLevel}` };
  if (getAvailableSkillPointsForPreview() <= 0) return { ok: false, reason: '技能點不足' };

  const unmet = getSkillPrerequisites(skill).filter(req => getPreviewSkillLevel(req.id) < Number(req.level || 0));
  if (!unmet.length) return { ok: true, reason: '可以學習', autoPrerequisite: false };

  const plan = buildSkillPrerequisiteAutoPlan(skill, { targetAdd: 1 });
  if (plan.pointsUsed > 0) {
    return { ok: true, reason: plan.complete ? '將自動補齊前置技能' : '可先補部分前置技能', autoPrerequisite: true, plan };
  }
  const deficits = formatSkillPlanDeficits(plan);
  return { ok: false, reason: deficits[0] || '前置技能不足' };
}

function learnSkill(skillId) {
  const skill = getSkillDataById(skillId);
  const check = canLearnSkill(skill);
  if (!check.ok) {
    addBattleLog(`無法暫存技能配點：${check.reason}`);
    updateSkillUI();
    return;
  }

  const plan = buildSkillPrerequisiteAutoPlan(skill, { targetAdd: 1 });
  if (!plan.pointsUsed) {
    addBattleLog(`無法暫存技能配點：${formatSkillPlanDeficits(plan)[0] || '沒有可用技能點'}`);
    updateSkillUI();
    return;
  }

  const pending = getPendingSkillAdds();
  plan.order.forEach(row => {
    pending[row.key] = Number(pending[row.key] || 0) + Number(row.add || 0);
  });

  const rows = formatSkillAutoPlanRows(plan);
  if (plan.complete) {
    addBattleLog(`${skill.name} 已連同必要前置加入待確認配點：${rows.join('、')}。請按「確認配點」後才會消耗技能點。`);
  } else {
    const remaining = formatSkillPlanDeficits(plan);
    addBattleLog(`技能點不足，已先補可用的前置配點：${rows.join('、')}。目前仍需：${remaining.join('、') || `${skill.name} 前置條件`}。確認配點後才會正式消耗點數。`);
  }
  updateSkillUI();
}

function confirmPendingSkillPoints() {
  const pending = getPendingSkillAdds();
  const entries = Object.entries(pending).filter(([, value]) => Number(value || 0) > 0);
  if (!entries.length) {
    addBattleLog("目前沒有暫存技能配點。");
    return;
  }
  const totalCost = entries.reduce((sum, [, value]) => sum + Number(value || 0), 0);
  if (totalCost > Number(player.skillPoints || 0)) {
    addBattleLog("技能點不足，請重新配點。");
    updateSkillUI();
    return;
  }
  const lines = entries.map(([skillId, add]) => {
    const skill = getSkillDataById(skillId);
    return `${skill?.name || skillId} +${add} → Lv ${getSkillLevel(skillId) + Number(add || 0)}`;
  });
  if (!confirm(`是否確認配點？\n${lines.join("\n")}\n將消耗 ${totalCost} 點技能點。`)) return;

  player.learnedSkills = player.learnedSkills || {};
  entries.forEach(([skillId, add]) => {
    const skill = getSkillDataById(skillId);
    const key = getSkillStorageKey(skill || skillId);
    player.learnedSkills[key] = getSkillLevel(skill || skillId) + Number(add || 0);
  });
  player.skillPoints = Math.max(0, Number(player.skillPoints || 0) - totalCost);
  clearPendingSkillAdds();

  addBattleLog(`已確認技能配點，消耗 ${totalCost} 點。`);
  recalculatePlayerStats();
  updateSkillUI();
  updateJobUI();
  updatePlayerUI();
  if (typeof updateAutoCombatUI === "function") updateAutoCombatUI();
  if (typeof updateQuickSlotUI === "function") updateQuickSlotUI();
  saveGame();
}

function resetPendingSkillPoints() {
  if (getPendingSkillPointCost() > 0) {
    clearPendingSkillAdds();
    addBattleLog("已取消尚未確認的技能配點。");
  } else {
    const resetItemId = 12213;
    const resetItem = (player.inventory || []).find(item => String(item.id) === String(resetItemId) && Number(item.count || 0) > 0);
    if (!resetItem) {
      addBattleLog("技能初始化需要：技能重置棒。");
      return;
    }
    if (!confirm("是否使用技能重置棒，重置目前職業技能？")) return;
    resetItem.count = Number(resetItem.count || 0) - 1;
    if (resetItem.count <= 0) player.inventory = (player.inventory || []).filter(item => item !== resetItem);
    player.learnedSkills = {};
    player.skillPoints = Math.max(0, Number(player.jobLevel || 1) - 1);
    clearPendingSkillAdds();
    addBattleLog("已使用技能重置棒，技能點數已初始化。");
    recalculatePlayerStats();
    updatePlayerUI();
    saveGame();
  }
  updateSkillUI();
}


function formatRateMultiplierForBasicInfo(rawValue) {
  const rateScale = Number(serverConfig?.server?.rateScale || 100);
  const value = Number(rawValue || rateScale);
  return `${Math.round((value / rateScale) * 100) / 100} 倍`;
}

function openJobTrainingFromBasicSkill(event) {
  if (event) event.stopPropagation();
  let infoWindow = document.getElementById("basic-skill-info-window");
  if (!infoWindow) {
    infoWindow = document.createElement("section");
    infoWindow.id = "basic-skill-info-window";
    infoWindow.className = "game-window draggable-window basic-skill-info-window";
    infoWindow.dataset.defaultX = "40";
    infoWindow.dataset.defaultY = "190";
    infoWindow.style.left = "40px";
    infoWindow.style.top = "190px";
    infoWindow.style.setProperty("--basic-info-left", "40px");
    infoWindow.style.setProperty("--basic-info-top", "190px");
    infoWindow.innerHTML = `
      <div class="window-title drag-handle">初心者知識 <button class="window-close" data-target="basic-skill-info-window">×</button></div>
      <div class="window-body basic-skill-info-body"></div>
    `;
    (document.getElementById("battle-field") || document.getElementById("game-root"))?.appendChild(infoWindow);
    const closeButton = infoWindow.querySelector(".window-close");
    if (closeButton) {
      closeButton.addEventListener("click", event => {
        event.stopPropagation();
        infoWindow.classList.add("hidden-window");
        if (typeof updateToggleButtonStates === "function") updateToggleButtonStates();
      });
    }
    if (typeof initDraggableWindows === "function") initDraggableWindows();
  }

  // v0.9.42：只在第一次開啟時給安全預設座標；之後讓玩家拖曳位置生效。
  infoWindow.classList.remove("hidden-window");
  if (!infoWindow.dataset.positionInitialized) {
    infoWindow.style.left = "40px";
    infoWindow.style.top = "190px";
    infoWindow.style.setProperty("--basic-info-left", "40px");
    infoWindow.style.setProperty("--basic-info-top", "190px");
    infoWindow.dataset.positionInitialized = "1";
  }
  infoWindow.style.right = "auto";
  infoWindow.style.bottom = "auto";

  const basicLevel = getSkillLevel("NV_BASIC");
  const expDropBonus = basicLevel * 2;
  const zenyBonus = basicLevel * 5;
  const body = infoWindow.querySelector(".basic-skill-info-body");
  if (body) {
    body.innerHTML = `
      <div class="basic-info-title">RO_WEB 初心者知識</div>
      <div class="basic-info-grid">
        <span>基本技能</span><b>Lv ${basicLevel} / 9</b>
        <span>Base EXP</span><b>+${expDropBonus}%</b>
        <span>Job EXP</span><b>+${expDropBonus}%</b>
        <span>掉寶率</span><b>+${expDropBonus}%</b>
        <span>Zeny</span><b>+${zenyBonus}%</b>
        <span>死亡懲罰</span><b>目前不掉經驗</b>
      </div>
      <div class="basic-info-note">每提升 1 級：Base EXP / Job EXP / 掉寶率 +2%，Zeny +5%。</div>
      <div class="basic-info-note">Job Lv 10、基本技能 Lv9，且技能點全部點完後，即可前往城鎮轉職。</div>
    `;
  }
  infoWindow.classList.remove("hidden-window");
  const bf = document.getElementById("battle-field");
  const maxX = bf ? Math.max(0, bf.clientWidth - infoWindow.offsetWidth - 12) : 140;
  const maxY = bf ? Math.max(0, bf.clientHeight - infoWindow.offsetHeight - 12) : 90;
  const curX = parseInt(infoWindow.style.getPropertyValue("--basic-info-left") || infoWindow.style.left, 10);
  const curY = parseInt(infoWindow.style.getPropertyValue("--basic-info-top") || infoWindow.style.top, 10);
  if (!Number.isFinite(curX) || curX < 0 || curX > maxX) {
    const x = Math.min(40, maxX);
    infoWindow.style.left = `${x}px`;
    infoWindow.style.setProperty("--basic-info-left", `${x}px`);
  }
  if (!Number.isFinite(curY) || curY < 0 || curY > maxY) {
    const y = Math.min(190, maxY);
    infoWindow.style.top = `${y}px`;
    infoWindow.style.setProperty("--basic-info-top", `${y}px`);
  }
  if (typeof bringWindowToFront === "function") bringWindowToFront(infoWindow);
}

let currentSkillTier = "first";

function isSuperNoviceFamilyJob(jobKey = player?.jobKey) {
  return ["super_novice", "expanded_super_novice", "hyper_novice"].includes(String(jobKey || ""));
}

function getSkillIdSet(list = []) {
  return new Set((Array.isArray(list) ? list : []).map(skill => String(skill?.officialId ?? skill?.id ?? skill?.code ?? "")));
}

function getSkillDifference(fullList = [], inheritedList = []) {
  const inheritedIds = getSkillIdSet(inheritedList);
  return (Array.isArray(fullList) ? fullList : []).filter(skill => {
    const id = String(skill?.officialId ?? skill?.id ?? skill?.code ?? "");
    return id && !inheritedIds.has(id);
  });
}

function getSkillTierList(tier) {
  if (tier === "other") return typeof getExtraSkillSkillList === "function" ? getExtraSkillSkillList() : [];
  if (!skillsData?.jobs) return [];
  const jobKey = String(player?.jobKey || "novice");
  if (tier === "novice") return skillsData.jobs.novice || [];

  // V0.9.80ZH：超初系列不得再套用劍士技能樹。
  // 一般超初顯示超初技能；界限解放與終初只在後續分頁顯示新增技能，避免重複。
  if (isSuperNoviceFamilyJob(jobKey)) {
    const superSkills = skillsData.jobs.super_novice || [];
    const expandedSkills = skillsData.jobs.expanded_super_novice || [];
    const hyperSkills = skillsData.jobs.hyper_novice || [];
    if (tier === "first") return superSkills;
    if (tier === "second") {
      return ["expanded_super_novice", "hyper_novice"].includes(jobKey)
        ? getSkillDifference(expandedSkills, superSkills)
        : [];
    }
    if (tier === "fourth") {
      return jobKey === "hyper_novice"
        ? getSkillDifference(hyperSkills, expandedSkills)
        : [];
    }
    return [];
  }

  const job = getJobData(jobKey);
  const trees = job?.skillTierTrees?.[tier] || [];
  return uniqueSkillsByOfficialId(trees.map(key => skillsData.jobs[key] || []));
}

function getVisibleSkillTier() {
  if (currentSkillTier === "novice") currentSkillTier = "first";
  return currentSkillTier || "first";
}

function refreshSkillTabs() {
  const superFamily = isSuperNoviceFamilyJob();
  const superLabels = { first: "超初", second: "界限解放", third: "—", fourth: "終初" };
  const normalLabels = { first: "一轉", second: "二轉", third: "三轉", fourth: "四轉" };
  document.querySelectorAll("#skill-window .skill-tab[data-skill-tier]").forEach(tab => {
    const tier = tab.dataset.skillTier;
    tab.textContent = (superFamily ? superLabels : normalLabels)[tier] || tab.textContent;
    const disabled = tier === "other" ? false : getSkillTierList(tier).length === 0;
    tab.classList.toggle("is-active", tier === getVisibleSkillTier());
    tab.classList.toggle("is-disabled", disabled);
    tab.disabled = disabled;
  });

  if (getSkillTierList(getVisibleSkillTier()).length === 0) {
    currentSkillTier = ["first", "second", "third", "fourth", "other"].find(tier => getSkillTierList(tier).length > 0) || "first";
    document.querySelectorAll("#skill-window .skill-tab[data-skill-tier]").forEach(tab => {
      tab.classList.toggle("is-active", tab.dataset.skillTier === currentSkillTier);
    });
  }
}

function initSkillTabs() {
  document.querySelectorAll("#skill-window .skill-tab[data-skill-tier]").forEach(tab => {
    if (tab.dataset.skillBound === "1") return;
    tab.dataset.skillBound = "1";
    tab.addEventListener("click", () => {
      const tier = tab.dataset.skillTier;
      currentSkillTier = tier;
      clearPendingSkillAdds();
      updateSkillUI();
    });
  });
}


function initNoviceSkillRowDelegation() {
  const row = document.getElementById("novice-skill-row");
  if (!row || row.dataset.delegated === "1") return;
  row.dataset.delegated = "1";
  row.addEventListener("click", event => {
    const plus = event.target.closest(".novice-skill-chip-plus");
    if (plus) return;
    const chip = event.target.closest(".novice-skill-chip.opens-training");
    if (!chip) return;
    event.preventDefault();
    event.stopPropagation();
    openJobTrainingFromBasicSkill(event);
  }, true);
}

function removeSkillPathOverlay() {
  const overlay = document.querySelector("#skill-panel .skill-path-overlay");
  if (overlay) overlay.remove();
}

function clearSkillRequirementHighlights() {
  document.querySelectorAll("#skill-panel .skill-grid-slot").forEach(slot => {
    slot.classList.remove("skill-focus", "skill-prereq-ok", "skill-prereq-needed", "skill-path-node");
  });
  removeSkillPathOverlay();
}

function drawSkillPrereqPath(fromSlot, toSlot, ok) {
  const panel = document.getElementById("skill-panel");
  if (!panel || !fromSlot || !toSlot) return;

  let svg = panel.querySelector(".skill-path-overlay");
  if (!svg) {
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("skill-path-overlay");
    svg.setAttribute("aria-hidden", "true");
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const grad = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
    grad.setAttribute("id", "skillPathRedGold");
    grad.setAttribute("gradientUnits", "userSpaceOnUse");
    grad.setAttribute("x1", "0");
    grad.setAttribute("y1", "0");
    grad.setAttribute("x2", "1");
    grad.setAttribute("y2", "0");
    const stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    stop1.setAttribute("offset", "0%");
    stop1.setAttribute("stop-color", "#ffd86a");
    const stop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    stop2.setAttribute("offset", "100%");
    stop2.setAttribute("stop-color", "#ff4a2f");
    grad.appendChild(stop1);
    grad.appendChild(stop2);
    defs.appendChild(grad);
    svg.appendChild(defs);
    panel.prepend(svg);
  }

  const panelRect = panel.getBoundingClientRect();
  const fromRect = fromSlot.getBoundingClientRect();
  const toRect = toSlot.getBoundingClientRect();

  const x1 = fromRect.left - panelRect.left + panel.scrollLeft + fromRect.width / 2;
  const y1 = fromRect.top - panelRect.top + panel.scrollTop + fromRect.height / 2;
  const x2 = toRect.left - panelRect.left + panel.scrollLeft + toRect.width / 2;
  const y2 = toRect.top - panelRect.top + panel.scrollTop + toRect.height / 2;
  const midX = (x1 + x2) / 2;

  svg.setAttribute("width", String(Math.max(panel.scrollWidth, panel.clientWidth)));
  svg.setAttribute("height", String(Math.max(panel.scrollHeight, panel.clientHeight)));
  svg.setAttribute("viewBox", `0 0 ${Math.max(panel.scrollWidth, panel.clientWidth)} ${Math.max(panel.scrollHeight, panel.clientHeight)}`);

  const grad = svg.querySelector("#skillPathRedGold");
  if (grad) {
    grad.setAttribute("x1", String(x1));
    grad.setAttribute("y1", String(y1));
    grad.setAttribute("x2", String(x2));
    grad.setAttribute("y2", String(y2));
  }

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`);
  path.setAttribute("class", ok ? "skill-path-line ok" : "skill-path-line needed");
  svg.appendChild(path);

  const arrow = document.createElementNS("http://www.w3.org/2000/svg", "path");
  // V0.9.64：Hover 當前技能時，紅線一路回指到「所有前置技能」。
  // fromSlot = 目前節點，toSlot = 前置節點；箭頭頭端固定放在前置技能端。
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = 9;
  const ax1 = x2 - Math.cos(angle - Math.PI / 6) * size;
  const ay1 = y2 - Math.sin(angle - Math.PI / 6) * size;
  const ax2 = x2 - Math.cos(angle + Math.PI / 6) * size;
  const ay2 = y2 - Math.sin(angle + Math.PI / 6) * size;
  arrow.setAttribute("d", `M ${ax1} ${ay1} L ${x2} ${y2} L ${ax2} ${ay2}`);
  arrow.setAttribute("class", ok ? "skill-path-arrow ok" : "skill-path-arrow needed");
  svg.appendChild(arrow);
}

function getSkillSlotById(skillId) {
  if (!skillId) return null;
  const key = getSkillStorageKey(skillId);
  const safeId = (window.CSS && CSS.escape) ? CSS.escape(String(key)) : String(key).replace(/"/g, '\\"');
  return document.querySelector(`#skill-panel .skill-grid-slot[data-skill-id="${safeId}"]`);
}

function highlightSkillRequirementChain(skill, fromSlot, visited = new Set()) {
  const visitKey = getSkillStorageKey(skill);
  if (!skill || !fromSlot || visited.has(visitKey)) return;
  visited.add(visitKey);

  getSkillPrerequisites(skill).forEach(req => {
    const reqSkill = getSkillDataById(req.id);
    const reqSlot = getSkillSlotById(req.id);
    if (!reqSlot) return;

    const ok = getPreviewSkillLevel(req.id) >= Number(req.level || 0);
    reqSlot.classList.add(ok ? "skill-prereq-ok" : "skill-prereq-needed", "skill-path-node");
    drawSkillPrereqPath(fromSlot, reqSlot, ok);

    // 連鎖顯示：Hover 最後技能時，會一路回亮它的所有上游前置技能。
    if (reqSkill) highlightSkillRequirementChain(reqSkill, reqSlot, visited);
  });
}

function highlightSkillRequirements(skill) {
  clearSkillRequirementHighlights();
  if (!skill) return;
  const current = getSkillSlotById(skill.id);
  if (current) current.classList.add("skill-focus", "skill-path-node");
  highlightSkillRequirementChain(skill, current);
}

function getSkillUiTypeForJob(skill) {
  if (typeof getRuntimeSkillUiType === "function") return getRuntimeSkillUiType(skill);
  return String(skill?.skillType || "pending").toLowerCase();
}

function canSkillUseQuickSlotForJob(skill) {
  if (typeof isRuntimeSkillQuickSlotEligible === "function") return isRuntimeSkillQuickSlotEligible(skill);
  return ["attack", "buff", "heal", "support"].includes(getSkillUiTypeForJob(skill));
}

function makeSkillDragPayload(skill) {
  return JSON.stringify({ type: "skill", id: getSkillStorageKey(skill) });
}

function makeBasicAttackDragPayload() {
  return JSON.stringify({ type: "basic" });
}

function renderNoviceSkillRow() {
  const row = document.getElementById("novice-skill-row");
  if (!row) return;
  row.innerHTML = "";

  const basicAttack = document.createElement("button");
  basicAttack.type = "button";
  basicAttack.className = "novice-skill-chip draggable-skill-chip";
  basicAttack.draggable = !((typeof isMobileViewport === "function" && isMobileViewport()) || Boolean(window.matchMedia?.("(pointer: coarse)")?.matches));
  basicAttack.dataset.tooltip = "普通攻擊：點擊可放入快捷欄。";
  basicAttack.innerHTML = `<span class="novice-skill-chip-icon">⚔</span><span>普通攻擊</span>`;
  if (basicAttack.draggable) basicAttack.addEventListener("dragstart", event => {
    event.dataTransfer.setData("application/json", makeBasicAttackDragPayload());
    event.dataTransfer.effectAllowed = "copy";
  });
  basicAttack.addEventListener("click", () => {
    if (typeof openBasicAttackQuickSlotDialog === "function") openBasicAttackQuickSlotDialog();
  });
  row.appendChild(basicAttack);

  (skillsData?.jobs?.novice || []).forEach(skill => {
    const level = getPreviewSkillLevel(skill.id);
    const check = canLearnSkill(skill);
    const maxed = level >= Number(skill.maxLevel || 0);
    const canDrag = canSkillUseQuickSlotForJob(skill) && level > 0;
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "novice-skill-chip" + (canDrag ? " draggable-skill-chip" : "") + (level > 0 ? " learned" : "") + (check.ok ? " learnable" : " locked") + (maxed ? " maxed" : "");
    chip.dataset.tooltip = buildSkillTooltipText(skill, level, check, maxed);
    if (canDrag) {
      chip.draggable = !((typeof isMobileViewport === "function" && isMobileViewport()) || Boolean(window.matchMedia?.("(pointer: coarse)")?.matches));
      if (chip.draggable) chip.addEventListener("dragstart", event => {
        event.dataTransfer.setData("application/json", makeSkillDragPayload(skill));
        event.dataTransfer.effectAllowed = "copy";
      });
    }
    if (!isSkillBasic(skill)) {
      chip.addEventListener("click", () => {
        if (typeof openSkillQuickSlotDialog === "function") openSkillQuickSlotDialog(skill);
      });
    }
    if (isSkillBasic(skill)) {
      chip.classList.add("opens-training");
      chip.title = "左鍵查看初心者知識 / 修練資訊；按 + 加入待確認配點";
      chip.addEventListener("click", openJobTrainingFromBasicSkill);
    }

    const iconHtml = skill.icon ? `<img src="${skill.icon}" alt="${skill.name}">` : (skill.iconText || skill.name.slice(0,1));
    chip.innerHTML = `<span class="novice-skill-chip-icon">${iconHtml}</span><span class="novice-skill-chip-text">${skill.name} Lv${level}</span>`;

    if (!skill.autoUnlocked && !maxed) {
      const plus = document.createElement("span");
      plus.className = "novice-skill-chip-plus";
      plus.textContent = "+";
      plus.title = `${skill.name} +1`;
      plus.setAttribute("role", "button");
      plus.setAttribute("aria-label", `${skill.name} +1`);
      plus.classList.toggle("is-disabled", !check.ok);
      plus.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        if (check.ok) learnSkill(skill.id);
      });
      chip.appendChild(plus);
    }
    row.appendChild(chip);
  });
}

function updateSkillUI() {
  const skillPanel = document.getElementById("skill-panel");
  if (!skillPanel) return;
  setSkillPointFooterText();
  renderNoviceSkillRow();
  initNoviceSkillRowDelegation();

  initSkillTabs();
  refreshSkillTabs();
  const activeTier = getVisibleSkillTier();
  const skillList = getSkillTierList(activeTier);
  skillPanel.innerHTML = "";
  skillPanel.classList.add("skill-slot-grid");
  skillPanel.dataset.activeTier = activeTier;

  if (!skillList.length) {
    const emptyText = activeTier === "other" ? "目前沒有從裝備、卡片、抄襲或繁殖取得的其他技能。" : "目前職業尚未開放技能資料。";
    skillPanel.innerHTML = `<div class="skill-empty" data-tooltip="${emptyText}">${emptyText}</div>`;
    setSkillPointFooterText();
    forceSkillFooterVisible();
    return;
  }

  const visibleSkills = skillList;
  const skillSlotCount = Math.max(40, visibleSkills.length);

  for (let index = 0; index < skillSlotCount; index += 1) {
    const slot = document.createElement("div");
    slot.className = "skill-grid-slot";
    slot.dataset.slotIndex = String(index + 1);

    const skill = visibleSkills[index];
    if (!skill) {
      slot.classList.add("empty");
      skillPanel.appendChild(slot);
      continue;
    }

    const isExtraSkill = activeTier === "other" || skill.extraSkill === true;
    const baseLevel = isExtraSkill ? Number(skill.extraSkillLevel || getSkillLevel(skill.id)) : getSkillLevel(skill.id);
    const pendingAdd = getPendingSkillAdd(skill.id);
    const currentLevel = baseLevel + pendingAdd;
    slot.dataset.skillId = getSkillStorageKey(skill);
    const check = canLearnSkill(skill);
    const maxed = currentLevel >= Number(skill.maxLevel || 0);
    const tooltip = buildSkillTooltipText(skill, currentLevel, check, maxed);

    slot.classList.add(check.ok ? "learnable" : "locked");
    if (currentLevel > 0) slot.classList.add("learned");
    if (maxed) slot.classList.add("maxed");
    slot.dataset.tooltip = tooltip;
    slot.addEventListener("mouseenter", () => highlightSkillRequirements(skill));
    slot.addEventListener("mouseleave", clearSkillRequirementHighlights);
    if (isSkillBasic(skill)) {
      slot.classList.add("opens-training");
      slot.addEventListener("click", openJobTrainingFromBasicSkill);
    }

    const iconBox = document.createElement("button");
    iconBox.type = "button";
    iconBox.className = "skill-grid-icon";
    iconBox.dataset.tooltip = tooltip;
    if (canSkillUseQuickSlotForJob(skill) && currentLevel > 0) {
      iconBox.draggable = !((typeof isMobileViewport === "function" && isMobileViewport()) || Boolean(window.matchMedia?.("(pointer: coarse)")?.matches));
      iconBox.title = `${skill.name}：點擊可放入快捷欄`;
      if (iconBox.draggable) iconBox.addEventListener("dragstart", event => {
        event.dataTransfer.setData("application/json", makeSkillDragPayload(skill));
        event.dataTransfer.effectAllowed = "copy";
      });
    }
    if (isSkillBasic(skill)) {
      iconBox.title = "查看初心者基本技能 / 修練";
      iconBox.onclick = openJobTrainingFromBasicSkill;
    } else {
      iconBox.onclick = event => {
        event.stopPropagation();
        if (typeof openSkillQuickSlotDialog === "function") openSkillQuickSlotDialog(skill);
      };
    }

    if (skill.icon) {
      const icon = document.createElement("img");
      icon.src = skill.icon;
      icon.alt = skill.name;
      icon.onerror = function () {
        icon.style.display = "none";
        iconBox.textContent = skill.iconText || skill.name.slice(0, 1);
      };
      iconBox.appendChild(icon);
    } else {
      iconBox.textContent = skill.iconText || skill.name.slice(0, 1);
    }

    const level = document.createElement("span");
    level.className = "skill-grid-level";
    level.textContent = currentLevel > 0 ? (pendingAdd > 0 ? `${currentLevel}*` : String(currentLevel)) : "";

    const name = document.createElement("span");
    name.className = "skill-grid-name";
    name.textContent = skill.name;
    name.dataset.tooltip = tooltip;

    const plus = document.createElement("button");
    plus.type = "button";
    plus.className = "skill-grid-plus";
    plus.textContent = "+";
    plus.title = `${skill.name} +1`;
    plus.disabled = !check.ok;
    plus.onclick = function (event) {
      event.stopPropagation();
      learnSkill(skill.id);
    };

    slot.appendChild(iconBox);
    slot.appendChild(level);
    slot.appendChild(name);
    if (!skill.autoUnlocked && !isExtraSkill) {
      slot.appendChild(plus);
    }
    if (isExtraSkill) {
      const sourceBadge = document.createElement("span");
      sourceBadge.className = "skill-source-mini";
      sourceBadge.textContent = skill.extraSourceText || "其他";
      slot.appendChild(sourceBadge);
    }
    if (!isExtraSkill && getSkillPrerequisites(skill).length) {
      const reqBadge = document.createElement("span");
      reqBadge.className = "skill-req-mini";
      reqBadge.textContent = getSkillPrerequisites(skill).map(req => `前置${req.level}`).join("/");
      slot.appendChild(reqBadge);
    }
    skillPanel.appendChild(slot);
  }

  setSkillPointFooterText();
  forceSkillFooterVisible();

  if (typeof updateQuickSlotUI === "function") updateQuickSlotUI();
}
