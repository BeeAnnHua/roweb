//=======================================
// RO_WEB 角色性別選擇／外觀切換 0.9.82GC
// 性別只決定人物 Atlas；不得改動職業、能力、技能、裝備或進度。
//=======================================

const RO_WEB_CHARACTER_GENDERS = Object.freeze({
  male: Object.freeze({ key: "male", label: "男性", noviceImage: "assets/characters/novice/male/idle.png" }),
  female: Object.freeze({ key: "female", label: "女性", noviceImage: "assets/characters/novice/female/idle.png" })
});

let roGenderSelectionRequired = false;
let roGenderSelectionResolver = null;
let roGenderSelectionBusy = false;

function getChosenCharacterGender() {
  const normalize = typeof normalizeCharacterGenderValue === "function"
    ? normalizeCharacterGenderValue
    : value => (["female", "f", "女"].includes(String(value || "").toLowerCase()) ? "female" : (["male", "m", "男"].includes(String(value || "").toLowerCase()) ? "male" : null));
  return normalize(player?.gender);
}
window.getChosenCharacterGender = getChosenCharacterGender;

function updateCharacterGenderUI() {
  const gender = getChosenCharacterGender();
  // 0.9.82GD：角色資訊卡不再顯示性別或切換按鈕；此處只同步選擇視窗。

  document.querySelectorAll("[data-character-gender]").forEach(card => {
    const selected = gender && card.dataset.characterGender === gender;
    card.classList.toggle("is-selected", Boolean(selected));
    card.setAttribute("aria-pressed", selected ? "true" : "false");
  });
}
window.updateCharacterGenderUI = updateCharacterGenderUI;

function setCharacterGenderModalBusy(busy) {
  roGenderSelectionBusy = Boolean(busy);
  document.querySelectorAll("[data-character-gender]").forEach(button => { button.disabled = roGenderSelectionBusy; });
  const close = document.getElementById("characterGenderClose");
  if (close) close.disabled = roGenderSelectionBusy;
}

function closeCharacterGenderSelection(result = null) {
  if (roGenderSelectionRequired || roGenderSelectionBusy) return false;
  const modal = document.getElementById("characterGenderModal");
  if (modal) modal.hidden = true;
  document.body.classList.remove("character-gender-modal-open");
  const resolver = roGenderSelectionResolver;
  roGenderSelectionResolver = null;
  if (resolver) resolver(result);
  return true;
}
window.closeCharacterGenderSelection = closeCharacterGenderSelection;

function openCharacterGenderSelection(options = {}) {
  const modal = document.getElementById("characterGenderModal");
  if (!modal) return Promise.resolve(null);

  roGenderSelectionRequired = Boolean(options.required);
  const source = String(options.source || "").trim();
  const title = document.getElementById("characterGenderTitle");
  const description = document.getElementById("characterGenderDescription");
  const close = document.getElementById("characterGenderClose");
  const note = document.getElementById("characterGenderNotice");

  if (title) title.textContent = roGenderSelectionRequired ? "選擇初學者性別" : "角色性別切換";
  if (description) {
    description.textContent = roGenderSelectionRequired
      ? "建立新角色前，請選擇男性或女性初學者。完成後會立即建立並保存角色。"
      : `${source ? `${source}：` : ""}選擇要使用的男性或女性人物外觀。`;
  }
  if (note) {
    note.textContent = roGenderSelectionRequired
      ? "此選擇之後仍可在角色介面或普隆德拉「角色造型師」免費更換。"
      : "只更換人物動畫與外觀；職業、等級、技能、素質、裝備、卡片、背包、金錢與地圖進度全部保留。";
  }
  if (close) close.hidden = roGenderSelectionRequired;

  updateCharacterGenderUI();
  setCharacterGenderModalBusy(false);
  modal.hidden = false;
  document.body.classList.add("character-gender-modal-open");
  requestAnimationFrame(() => {
    const selected = modal.querySelector("[data-character-gender].is-selected") || modal.querySelector("[data-character-gender]");
    selected?.focus?.();
  });

  return new Promise(resolve => {
    if (roGenderSelectionResolver) roGenderSelectionResolver(null);
    roGenderSelectionResolver = resolve;
  });
}
window.openCharacterGenderSelection = openCharacterGenderSelection;

async function applyCharacterGender(gender, options = {}) {
  const normalized = typeof normalizeCharacterGenderValue === "function"
    ? normalizeCharacterGenderValue(gender)
    : (gender === "female" ? "female" : gender === "male" ? "male" : null);
  if (!player || !RO_WEB_CHARACTER_GENDERS[normalized]) return false;

  const previousGender = getChosenCharacterGender();
  const protectedSnapshot = JSON.stringify({
    jobKey: player.jobKey,
    job: player.job,
    baseLevel: player.baseLevel,
    baseExp: player.baseExp,
    jobLevel: player.jobLevel,
    jobExp: player.jobExp,
    stats: player.stats,
    traits: player.traits,
    learnedSkills: player.learnedSkills,
    skills: player.skills,
    equipment: player.equipment,
    equipmentInstances: player.equipmentInstances,
    inventory: player.inventory,
    zeny: player.zeny,
    map: player.map,
    currentCity: player.currentCity,
    lastFieldMap: player.lastFieldMap
  });

  const mutate = () => {
    player.gender = normalized;
    player.genderChosen = true;
    // 讓 Atlas Resolver 依「目前職業＋新性別＋武器＋坐騎」重新解析。
    player.characterAtlas = null;
  };
  if (typeof withPlayerBuildMutation === "function") withPlayerBuildMutation("gender_change", mutate);
  else mutate();

  if (protectedSnapshot !== JSON.stringify({
    jobKey: player.jobKey,
    job: player.job,
    baseLevel: player.baseLevel,
    baseExp: player.baseExp,
    jobLevel: player.jobLevel,
    jobExp: player.jobExp,
    stats: player.stats,
    traits: player.traits,
    learnedSkills: player.learnedSkills,
    skills: player.skills,
    equipment: player.equipment,
    equipmentInstances: player.equipmentInstances,
    inventory: player.inventory,
    zeny: player.zeny,
    map: player.map,
    currentCity: player.currentCity,
    lastFieldMap: player.lastFieldMap
  })) {
    console.error("角色性別切換安全檢查失敗：偵測到非外觀資料被修改。");
    return false;
  }

  const atlasReady = Boolean(window.RO_STUDIO_PLAYER_ATLAS?.manifest?.characters);
  if (atlasReady && typeof resolveROStudioCharacterKey === "function" && typeof setROStudioPlayerCharacter === "function") {
    const desired = resolveROStudioCharacterKey();
    const loaded = await setROStudioPlayerCharacter(desired, { force: true, preserveMotion: true });
    if (!loaded) console.warn("切換性別後無法載入指定 Atlas，保留安全回退外觀：", desired);
  } else if (typeof syncROStudioCharacterFromPlayer === "function") {
    syncROStudioCharacterFromPlayer();
  }

  if (typeof setROStudioIdleImagesForCurrentCharacter === "function") setROStudioIdleImagesForCurrentCharacter();
  updateCharacterGenderUI();
  if (typeof updatePlayerUI === "function") updatePlayerUI();
  if (typeof updateTownUI === "function" && player.currentCity) updateTownUI();
  if (typeof saveGame === "function") saveGame();

  if (!options.silent && typeof addBattleLog === "function") {
    const label = RO_WEB_CHARACTER_GENDERS[normalized].label;
    addBattleLog(previousGender === normalized ? `角色維持${label}外觀。` : `角色外觀已切換為${label}。職業與所有養成資料皆保留。`);
  }
  return true;
}
window.applyCharacterGender = applyCharacterGender;

async function selectCharacterGender(gender) {
  if (roGenderSelectionBusy) return false;
  setCharacterGenderModalBusy(true);
  try {
    const changed = await applyCharacterGender(gender, { silent: roGenderSelectionRequired });
    if (!changed) return false;

    const modal = document.getElementById("characterGenderModal");
    if (modal) modal.hidden = true;
    document.body.classList.remove("character-gender-modal-open");
    const resolver = roGenderSelectionResolver;
    roGenderSelectionResolver = null;
    roGenderSelectionRequired = false;
    if (resolver) resolver(getChosenCharacterGender());
    return true;
  } finally {
    setCharacterGenderModalBusy(false);
  }
}
window.selectCharacterGender = selectCharacterGender;

async function ensureInitialCharacterGenderSelection() {
  const gender = getChosenCharacterGender();
  if (player?.genderChosen && gender) {
    updateCharacterGenderUI();
    return gender;
  }
  return openCharacterGenderSelection({ required: true, source: "建立新角色" });
}
window.ensureInitialCharacterGenderSelection = ensureInitialCharacterGenderSelection;

document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  const modal = document.getElementById("characterGenderModal");
  if (!modal || modal.hidden || roGenderSelectionRequired) return;
  event.preventDefault();
  closeCharacterGenderSelection();
});
