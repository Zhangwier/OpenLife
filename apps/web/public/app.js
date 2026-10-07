const $ = (id) => document.getElementById(id);
let state;

const SAVE_PREFIX = "openlife.save.";
const SLOT_LABELS = {
  auto: "最近的记忆",
  "manual-1": "记忆一",
  "manual-2": "记忆二",
  "manual-3": "记忆三",
};

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { "content-type": "application/json" }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

async function loadState(animate = false) {
  state = await api("/api/state");
  render(state, animate);
}

function render(s, animate = false) {
  if (animate) {
    document.body.classList.remove("is-transitioning");
    void document.body.offsetWidth;
    document.body.classList.add("is-transitioning");
    setTimeout(() => document.body.classList.remove("is-transitioning"), 750);
  }
  const c = s.character;
  $("timeRibbon").querySelector(".time-year").textContent = String(s.year);
  $("timeRibbon").querySelector(".time-copy").textContent = `${s.month} 月 · 时间正在流逝`;
  $("generationPill").textContent = numberGeneration(s.generation);
  $("lineageLabel").textContent = numberGeneration(s.generation);

  if (c) {
    $("characterName").textContent = c.name;
    $("characterMeta").textContent = `${c.age} 岁 · ${c.city}`;
    $("portraitInitial").textContent = c.name.slice(0, 1);
    $("healthWord").textContent = c.healthWord;
    $("educationWord").textContent = educationLabel(c.education);
    $("occupationWord").textContent = c.occupation;
    $("familyWord").textContent = c.family;
    $("lifeProgress").style.width = `${Math.min(100, Math.max(2, (c.age / 90) * 100))}%`;
    $("stageTitle").textContent = stageTitle(c);
    $("sceneKicker").textContent = `${c.city} · ${seasonForMonth(s.month)}`;
    $("sceneText").textContent = sceneText(c, s);
  }

  renderActions(s.actions);
  renderHistory(s.history);
  renderRelations(s.relations, c);
  renderLineage(s.lineage, c);
  renderWorld(s.world);
}

function renderActions(actions) {
  $("actionGrid").innerHTML = actions.map((action) =>
    `<button class="action-button ${action.tone}" data-action="${action.id}" ${action.enabled ? "" : "disabled"}>${action.label}</button>`,
  ).join("");
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => performAction(button.dataset.action, button));
  });
}

function renderHistory(history) {
  $("historyStream").innerHTML = history.length === 0
    ? '<div class="subtle">历史还很安静。第一件值得记住的事，很快会发生。</div>'
    : history.map((item) => `<article class="history-item">
        <div class="history-year">${item.year}</div>
        <div class="history-copy">${item.summary}<small>${item.archived ? "人物已离开，但这件事仍被记得" : "仍留在这个世界里"}</small></div>
      </article>`).join("");
}

function renderRelations(relations, c) {
  $("relationCount").textContent = `${relations.length} 条关系`;
  $("relationshipOrbit").innerHTML = [
    `<div class="relation-chip"><div class="relation-avatar">${c?.name?.slice(0, 1) ?? "?"}</div><strong>你</strong><span>此刻的人生</span></div>`,
    ...relations.map((relation) => `<div class="relation-chip">
      <div class="relation-avatar">${relation.targetName.slice(0, 1)}</div>
      <strong>${relation.targetName}</strong><span>${relationLabel(relation.type)}</span>
    </div>`),
  ].join("");
  $("scenePeople").innerHTML = relations.slice(0, 4)
    .map((relation) => `<span class="person-dot" title="${relation.targetName}">${relation.targetName.slice(0, 1)}</span>`).join("");
}

function renderLineage(lineage, c) {
  const members = Array.isArray(lineage?.members) ? lineage.members : [];
  $("familyTree").innerHTML = members.length === 0
    ? '<div class="subtle">家族的第一条线，正在形成。</div>'
    : members.sort((a, b) => Number(a.generation) - Number(b.generation)).map((member) =>
      `<div class="family-node ${member.id === c?.id ? "current" : ""}">
        <strong>${member.name || member.id}</strong>
        <span>第 ${member.generation} 代 · ${member.alive ? "仍在生活" : "已进入家族史"}</span>
      </div>`,
    ).join("");
}

function renderWorld(world) {
  $("worldPeople").textContent = String(world.people);
  $("worldOrganizations").textContent = String(world.organizations);
  $("worldRecords").textContent = String(world.records);
  $("worldEconomy").textContent = world.economy?.label || "市场平稳";
  $("worldEconomyNote").textContent = world.economy?.note || "世界仍在自己的节奏里运行。";
}

function readMemory(slot) {
  try {
    const raw = localStorage.getItem(SAVE_PREFIX + slot);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeMemory(slot, value) {
  localStorage.setItem(SAVE_PREFIX + slot, JSON.stringify(value));
}

function memorySummary(entry) {
  if (!entry?.summary) return "这里还是空的";
  const c = entry.summary.character;
  const person = c ? `${c.name} · ${c.age} 岁` : "没有正在经历人生的人";
  return `${entry.summary.year} 年 · ${numberGeneration(entry.summary.generation)} · ${person}`;
}

function renderMemorySlots() {
  for (const slot of Object.keys(SLOT_LABELS)) {
    const entry = readMemory(slot);
    const meta = document.querySelector(`[data-slot-meta="${slot}"]`);
    const load = document.querySelector(`[data-load-slot="${slot}"]`);
    if (meta) meta.textContent = entry ? memorySummary(entry) : slot === "auto" ? "还没有自动记忆" : "这里还是空的";
    if (load) load.disabled = !entry;
  }
}

async function captureMemory(slot, quiet = false) {
  const label = SLOT_LABELS[slot] || "OpenLife";
  const data = await api("/api/save", {
    method: "POST",
    body: JSON.stringify({ label }),
  });
  writeMemory(slot, {
    savedAt: new Date().toISOString(),
    summary: data.summary,
    save: data.save,
  });
  renderMemorySlots();
  if (!quiet) showToast("这一刻已经被记住");
}

async function restoreMemory(slot) {
  const entry = readMemory(slot);
  if (!entry?.save) return;
  const data = await api("/api/load", {
    method: "POST",
    body: JSON.stringify({ save: entry.save }),
  });
  state = data.state;
  render(state, true);
  $("memoryModal").hidden = true;
  showToast("你回到了那段人生");
}

async function autoRemember() {
  try {
    await captureMemory("auto", true);
  } catch (error) {
    console.warn("OpenLife autosave failed", error);
  }
}

async function performAction(action, button) {
  button.disabled = true;
  try {
    const data = await api("/api/action", { method: "POST", body: JSON.stringify({ action }) });
    if (!data.result.ok) throw new Error(data.result.errors?.[0]?.message || "这件事现在还不能发生");
    state = data.state;
    render(state, true);
    showToast(actionMessage(action));
    await autoRemember();
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
}

function stageTitle(c) {
  if (!c.alive) return "这一生已经写完";
  if (c.age < 6) return "世界正在你面前慢慢展开";
  if (c.age < 16) return "你开始理解自己和别人";
  if (c.age < 25) return "人生第一次真正属于你";
  if (c.age < 50) return "你正在留下自己的形状";
  if (c.age < 70) return "时间开始显露重量";
  return "记忆比日子走得更远";
}

function sceneText(c, s) {
  if (!c.alive) return "你离开了，但关系、事业和记忆没有一起消失。";
  if (c.children?.length) return `你已经不再只为自己生活。下一代正在 ${s.year} 年的世界里长大。`;
  if (c.family !== "尚未建立家庭") return "有人开始与你共享每天的琐碎、安静和未来。";
  if (c.occupation !== "尚未选择职业") return "日子有了重复的节奏，也开始留下属于你的痕迹。";
  if (c.age < 6) return "世界比你先存在，也会在你之后继续。";
  return "一些选择看起来很小，但会被未来重新理解。";
}

function educationLabel(value) {
  return { none: "尚未入学", primary: "基础教育", secondary: "中等教育", higher: "完成高等教育" }[value] || value;
}
function relationLabel(type) {
  return { "family.friend_of": "朋友", "family.married_to": "伴侣", "family.parent_of": "孩子" }[type] || "关系";
}
function seasonForMonth(month) {
  if ([3,4,5].includes(month)) return "春";
  if ([6,7,8].includes(month)) return "夏";
  if ([9,10,11].includes(month)) return "秋";
  return "冬";
}
function numberGeneration(n) {
  return ["第零代","第一代","第二代","第三代","第四代","第五代"][n] || `第 ${n} 代`;
}
function actionMessage(action) {
  return {
    "advance-year":"又一年过去了",
    school:"你走进了新的学习阶段",
    friend:"一个陌生人变成了认识的人",
    job:"你开始拥有自己的职业生活",
    marry:"从今天起，人生里多了另一个人",
    child:"家族迎来了新的生命",
    business:"世界里多了一件可能比你活得更久的事",
    "next-generation":"故事交到了下一代手里",
  }[action] || "世界发生了一点变化";
}

let toastTimer;
function showToast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

$("autoButton").addEventListener("click", () => $("autoModal").hidden = false);
$("closeAuto").addEventListener("click", () => $("autoModal").hidden = true);
document.querySelectorAll("[data-auto]").forEach((button) => {
  button.addEventListener("click", async () => {
    $("autoModal").hidden = true;
    try {
      const data = await api("/api/autosim", { method: "POST", body: JSON.stringify({ mode: button.dataset.auto }) });
      state = data.state;
      render(state, true);
      showToast(data.result.steps > 1 ? `时间向前走了 ${data.result.steps} 年` : "一年过去了");
      await autoRemember();
    } catch (error) {
      showToast(error.message);
    }
  });
});
$("memoryButton").addEventListener("click", () => {
  renderMemorySlots();
  $("memoryModal").hidden = false;
});
$("closeMemory").addEventListener("click", () => $("memoryModal").hidden = true);
document.querySelectorAll("[data-save-slot]").forEach((button) => {
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await captureMemory(button.dataset.saveSlot);
    } catch (error) {
      showToast(error.message);
    } finally {
      button.disabled = false;
    }
  });
});
document.querySelectorAll("[data-load-slot]").forEach((button) => {
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await restoreMemory(button.dataset.loadSlot);
    } catch (error) {
      showToast(error.message);
      renderMemorySlots();
    } finally {
      button.disabled = false;
    }
  });
});

$("resetButton").addEventListener("click", async () => {
  const data = await api("/api/reset", { method: "POST", body: JSON.stringify({ seed: 104 }) });
  state = data.state;
  render(state, true);
  showToast("一段新的人生重新开始");
});

renderMemorySlots();
loadState();
