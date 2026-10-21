import { renderPlayer, renderActionButtons, installModalAccess, selectView } from "/player.js";
import { installShell, renderShell, enterLife } from "/shell.js";
import "/memory-ux.js";
import "/menu-ux.js";
import { renderSettlement, describeSettlementResult } from "/settlement.js";
import { renderStories } from "/stories.js";
import { renderGuide } from "/guide.js";
import { renderFigure } from "/character-appearance.js";
import { playActionFx } from "/action-fx.js";
import { isTextMode } from "/view-mode.js";
import { renderLifeLog, renderHopes, logAction, diffSettlement, chipText } from "/life-log.js";
const $ = (id) => document.getElementById(id);
let state;
let busy = false;

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
  // 统一时间文案：玩家过的是「冬 · 第 N 天」，公元纪年作为副标题。
  $("timeRibbon").querySelector(".time-year").textContent = s.settlement?.exists
    ? `${s.settlement.season} · 第 ${s.settlement.origin?.daysHere ?? s.settlement.day} 天${s.settlement.weather ? ` · ${s.settlement.weather.sky}` : ""}` : (s.era ?? String(s.year));
  $("timeRibbon").title = s.settlement?.weather?.note ?? "";
  $("timeRibbon").dataset.era = s.era ?? "";
  $("timeRibbon").querySelector(".time-copy").textContent = continuousRunning
    ? `${s.era ?? ""} · ${s.month} 月 · 推进中` : `${s.era ?? ""} · ${s.month} 月 · 已暂停`;
  $("generationPill").textContent = numberGeneration(s.generation);
  $("lineageLabel").textContent = numberGeneration(s.generation);

  if (c) {
    $("characterName").textContent = c.name;
    renderOriginCard(s);
    $("characterMeta").textContent = `${c.age} 岁 · ${c.city}`;
    $("portraitInitial").textContent = c.name.slice(0, 1);
    // 人物页头像与生活场景里的角色用同一套手绘形象。
    const figureId = s.settlement?.characterId ?? c.id ?? c.name;
    const portrait = document.querySelector(".portrait-figure");
    if (portrait && !isTextMode() && portrait.dataset.figure !== figureId) {
      portrait.dataset.figure = figureId; portrait.classList.add("has-figure");
      portrait.innerHTML = renderFigure(figureId, "player");
    }
    $("healthWord").textContent = c.healthWord;
    $("educationWord").textContent = c.learning;
    $("occupationWord").textContent = c.role;
    $("familyWord").textContent = c.family;
    $("footprintWord").textContent = footprintLabel(c.historicalFootprint);
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
  renderPlayer(s, performAction);
  renderSettlement(s, performSettlementAction);
  if (isTextMode()) { renderLifeLog(s); renderHopes(s); }
  updatePlanStatus(s);
  renderShell(s);
  renderStories(s, performSettlementAction);
  renderGuide(s, performSettlementAction);
}

function renderActions(actions) {
  renderActionButtons($("actionGrid"), actions, performAction);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

function renderHistory(history) {
  $("historyStream").innerHTML = history.length === 0
    ? '<div class="subtle">历史还很安静。第一件值得记住的事，很快会发生。</div>'
    : history.map((item) => `<article class="history-item">
        <div class="history-year">${escapeHtml(item.era ?? item.year)}</div>
        <div class="history-copy">${escapeHtml(item.summary)}<small>${item.archived ? "人物已离开，但这件事仍被记得" : "仍留在这个世界里"}</small></div>
      </article>`).join("");
}

function renderRelations(relations, c) {
  $("relationCount").textContent = `${relations.length} 条关系`;
  const currentInitial = escapeHtml(c?.name?.slice(0, 1) ?? "?");
  $("relationshipOrbit").innerHTML = [
    `<div class="relation-chip"><div class="relation-avatar">${currentInitial}</div><strong>你</strong><span>此刻的人生</span></div>`,
    ...relations.map((relation) => {
      const name = escapeHtml(relation.targetName);
      const initial = escapeHtml(relation.targetName.slice(0, 1));
      return `<div class="relation-chip">
        <div class="relation-avatar">${initial}</div>
        <strong>${name}</strong><span>${escapeHtml(relationLabel(relation.type))}</span>
      </div>`;
    }),
  ].join("");
  $("scenePeople").innerHTML = relations.slice(0, 4)
    .map((relation) => {
      const name = escapeHtml(relation.targetName);
      const initial = escapeHtml(relation.targetName.slice(0, 1));
      return `<span class="person-dot" title="${name}">${initial}</span>`;
    }).join("");
}

function renderLineage(lineage, c) {
  const members = Array.isArray(lineage?.members) ? lineage.members : [];
  $("familyTree").innerHTML = members.length === 0
    ? '<div class="subtle">家族的第一条线，正在形成。</div>'
    : members.sort((a, b) => Number(a.generation) - Number(b.generation)).map((member) =>
      `<div class="family-node ${member.id === c?.id ? "current" : ""}">
        <strong>${escapeHtml(member.name || member.id)}</strong>
        <span>第 ${escapeHtml(member.generation)} 代 · ${member.alive ? "仍在生活" : "已进入家族史"}</span>
      </div>`,
    ).join("");
}
function renderWorld(world) {
  $("worldPeople").textContent = String(world.people);
  $("worldCommunities").textContent = String(world.communities);
  $("worldRecords").textContent = String(world.records);
  $("worldPulse").textContent = world.pulse?.label || "聚落缓慢生长";
  $("worldPulseNote").textContent = world.pulse?.note || "亲族与技艺维系着共同体的日常。";
  const eraContext = world.eraContext ?? {};
  $("worldEraLabel").textContent = eraContext.label || world.pulse?.eraLabel || "夏";
  const eraItems = [
    ...(Array.isArray(eraContext.tools) ? eraContext.tools.slice(0, 3) : []),
    ...(Array.isArray(eraContext.media) ? eraContext.media.slice(0, 1) : []),
    ...(Array.isArray(eraContext.institutions) ? eraContext.institutions.slice(0, 1) : []),
  ];
  $("worldEraChips").innerHTML = eraItems.length
    ? eraItems.map((item) => `<span class="era-chip">${escapeHtml(item)}</span>`).join("")
    : '<span class="subtle">时代特征仍在形成</span>';
  const daily = Array.isArray(eraContext.dailyLife) ? eraContext.dailyLife.slice(0, 2) : [];
  $("worldEraNote").textContent = daily.length
    ? `常见生活：${daily.join("、")}。这是时代背景，不代表每个人都掌握全部技艺。`
    : "这是此时常见的生活背景，不代表每个人都掌握全部技艺。";

  const anchoredPeople = Array.isArray(world.historicalAnchors?.people)
    ? world.historicalAnchors.people
    : [];
  $("worldHistoricalPeople").innerHTML = anchoredPeople.length
    ? anchoredPeople.slice(-3).reverse().map((person) => {
        const precision = person.datePrecision === "approximate" ? "约 " : "";
        const life = person.alive ? "仍在世" : "已经离世";
        return `<div class="historical-person">
          <strong>${escapeHtml(person.name || "无名人物")}</strong>
          <span>${escapeHtml(person.region || "")} · ${precision}${escapeHtml(person.birth || "")} · ${life}</span>
        </div>`;
      }).join("")
    : '<span class="subtle">这个时代还没有进入世界的历史人物锚点</span>';
  $("worldHistoricalPeopleNote").textContent = anchoredPeople.length
    ? "这里只说明人物进入了世界；是否被后世记住，仍由作品、证据与传播决定。"
    : "人物出现不等于被后世记住；名望仍取决于作品、证据与传播。";
  const established = Array.isArray(world.science?.established) ? world.science.established : [];
  const frontierCount = Number(world.science?.frontierCount ?? 0);
  $("worldKnowledge").innerHTML = established.length
    ? established.slice(-5).map((item) =>
        `<span class="knowledge-chip">${escapeHtml(item.label)}</span>`,
      ).join("")
    : '<span class="subtle">文明仍在理解这个世界</span>';
  const researchEnvironment = world.science?.researchEnvironment ?? {};
  const supportMultiplier = Number(researchEnvironment.supportMultiplier ?? 1);
  const supportSignals = Array.isArray(researchEnvironment.signals)
    ? researchEnvironment.signals.slice(0, 3).map((signal) => signal.label).filter(Boolean)
    : [];
  const environmentNote = supportMultiplier >= 1.25
    ? "记录、工艺与知识网络正在明显加快探索。"
    : supportMultiplier >= 0.9
      ? "当前文明环境能够稳定支持探索。"
      : "当前的记录、工艺与知识网络仍限制着复杂研究。";
  $("worldKnowledgeNote").textContent = frontierCount > 0
    ? `还有 ${frontierCount} 条问题正在积累观察与证据。${environmentNote}${supportSignals.length ? ` 有利条件：${supportSignals.join("、")}。` : ""}`
    : `这些知识已经形成体系，但世界仍不等于文明所知道的一切。${environmentNote}`;

  const intellectual = world.intellectual ?? {};
  const traditions = Array.isArray(intellectual.traditions) ? intellectual.traditions : [];
  $("worldTraditions").innerHTML = traditions.length
    ? traditions.slice(0, 3).map((idea) => {
        const reach = [];
        if (Number(idea.adherentCount ?? 0) > 0) reach.push(`${idea.adherentCount} 人认同`);
        if (Number(idea.schoolCount ?? 0) > 0) reach.push(`${idea.schoolCount} 个学派`);
        if (Number(idea.influenceCount ?? 0) > 0) reach.push(`影响 ${idea.influenceCount} 处共同体`);
        if (Number(idea.branchCount ?? 0) > 0) reach.push(`${idea.branchCount} 个分支`);
        return `<div class="tradition-item">
          <strong>${escapeHtml(idea.title || "无名思想")}</strong>
          <span>${escapeHtml(reach.join(" · ") || "刚刚被提出")}</span>
        </div>`;
      }).join("")
    : '<span class="subtle">这个时代还没有形成可辨认的思想传统</span>';
  $("worldTraditionNote").textContent = traditions.length
    ? `已有 ${traditions.length} 种思想留下传播痕迹，形成 ${Number(intellectual.schoolCount ?? 0)} 个学派。`
    : "有些想法会随着人离开，有些会被别人继续讲下去。";

  const memory = world.historicalMemory ?? {};
  const works = Array.isArray(memory.works) ? memory.works : [];
  $("worldHistoryWorks").innerHTML = works.length
    ? works.slice(0, 3).map((work) => {
        const title = escapeHtml(work.title || "无名作品");
        const state = historyWorkState(work);
        return `<div class="memory-trace"><strong>${title}</strong><span>${escapeHtml(state)}</span></div>`;
      }).join("")
    : '<span class="subtle">还没有足以穿过时间的作品或证据</span>';
  $("worldHistoryNote").textContent = memory.visibleWorkCount
    ? `仍可辨认 ${memory.visibleWorkCount} 项；残缺 ${memory.fragmentaryWorkCount || 0} 项，归属争议 ${memory.contestedWorkCount || 0} 项。`
    : "没有证据留下时，过去也会变得安静。";

  const notablePeople = Array.isArray(world.notablePeople) ? world.notablePeople : [];
  $("worldNotablePeople").innerHTML = notablePeople.length
    ? notablePeople.map((person) =>
        `<span class="notable-person"><strong>${escapeHtml(person.name)}</strong> · ${escapeHtml(footprintLabel(person.state))}</span>`,
      ).join("")
    : '<span class="subtle">暂时还没有谁真正穿过时间被后世记住</span>';
}

function historyWorkState(work) {
  const content = {
    complete: "内容较完整",
    substantial: "大部仍存",
    fragmentary: "只剩残篇",
    lost: "内容失传",
  }[work.contentState] || "保存状态不明";
  if (work.memoryState === "contested" || work.contested) return `${content} · 归属有争议`;
  if (work.memoryState === "attributed_evidence") return `${content} · 留有署名证据`;
  if (work.memoryState === "anonymous_trace") return `${content} · 作者不明`;
  return content;
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
  try {
    localStorage.setItem(SAVE_PREFIX + slot, JSON.stringify(value));
  } catch (error) {
    // 第六轮：浏览器存储满了时给中文原因，memory-ux.js 据此提示清空一个记忆。
    window.__openlifeLastMemoryError = error;
    if (error?.name === "QuotaExceededError") throw new Error("浏览器存储空间满了，清空一个不要的记忆再试。");
    throw error;
  }
}

function memorySummary(entry) {
  if (!entry?.summary) return "这里还是空的";
  const c = entry.summary.character;
  const person = c ? `${c.name} · ${c.age} 岁` : "没有正在经历人生的人";
  return `${entry.summary.era ?? `${entry.summary.year} 年`} · ${numberGeneration(entry.summary.generation)} · ${person}`;
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
    window.__openlifeAutoMemoryError = { message: error?.message || String(error), at: new Date().toISOString() };
  }
}

/**
 * Runs one settlement action.
 *
 * Kept separate from `performAction` so the older pottery flow is untouched:
 * the settlement scene is the M1 default, but a save from the earlier slice
 * still drives its own buttons.
 */
async function performSettlementAction(action, payload) {
  if (busy) { showToast("上一个行动正在完成，稍后再试。"); return; }
  busy = true;
  document.body.classList.add("is-busy");
  try {
    const data = await api("/api/action", {
      method: "POST",
      body: JSON.stringify({
        action,
        payload: payload ?? {},
        expectedTick: state.tick,
        expectedActorId: state.character?.id,
        expectedActivityUsed: state.settlement?.dailyActivity?.used,
        expectedPlanRevision: state.settlement?.dailyPlan?.revision,
      }),
    });
    if (!data.result.ok) throw new Error(data.result.errors?.[0]?.message || "这件事现在还不能发生");
    const before = state.settlement;
    state = data.state;
    const target = payload?.targetId ? (before?.neighbours || []).find((n) => n.id === payload.targetId) : null;
    const told = data.narrative?.length ? data.narrative.join("")
      : describeSettlementResult(action, data.result, state).replace("眼前的村民", target?.name || "眼前的村民");
    const chips = diffSettlement(before, state.settlement);
    if (isTextMode()) logAction(state, told, chips);
    render(state, true);
    if (!isTextMode()) playActionFx({ action, payload: payload ?? {}, before, after: state.settlement });
    showToast(isTextMode() && chips.length ? `${told}（${chipText(chips)}）` : told);
    await autoRemember();
  } catch (error) {
    showToast(error.message);
    await loadState().catch(() => {});
  } finally {
    busy = false;
    document.body.classList.remove("is-busy");
  }
}

async function performAction(action, button) {
  if (busy) return;
  busy = true;
  document.body.classList.add("is-busy");
  button.disabled = true;
  try {
    const actionId = typeof action === "string" ? action : action.id;
    const data = await api("/api/action", { method: "POST", body: JSON.stringify({ action: actionId, payload: action.payload ?? {}, expectedTick: state.tick, expectedActorId: state.character?.id }) });
    if (!data.result.ok) throw new Error(data.result.errors?.[0]?.message || "这件事现在还不能发生");
    state = data.state;
    render(state, true);
    showToast(state.player?.entered ? "这一段生活已经留下变化" : actionMessage(actionId));
    if (actionId === "pottery-choice" && !state.player?.practice) selectView("works");
    if (actionId === "life-child" || actionId === "life-handoff") selectView("family");
    await autoRemember();
  } catch (error) {
    showToast(error.message);
    await loadState().catch(() => {});
  } finally {
    busy = false;
    document.body.classList.remove("is-busy");
  }
}

function stageTitle(c) {  if (!c.alive) return "这一生已经写完";
  if (c.age < 6) return "世界正在你面前慢慢展开";
  if (c.age < 16) return "你开始理解自己和别人";
  if (c.age < 25) return "人生第一次真正属于你";
  if (c.age < 50) return "你正在留下自己的形状";
  if (c.age < 70) return "时间开始显露重量";
  return "记忆比日子走得更远";
}

function sceneText(c, s) {
  if (!c.alive) return "你离开了，但关系、技艺和记忆没有一起消失。";
  if (c.children?.length) return `你已经不再只为自己生活。下一代正在${s.era ?? `${s.year} 年`}的世界里长大。`;
  if (c.thought?.stage === "established") return `“${c.thought.title}”已经不只属于你，它开始改变别人理解共同体的方式。`;
  if (c.thought?.schoolCount > 0) return `围绕“${c.thought.title}”已经有人聚在一起，它正在变成一条真正的思想传统。`;
  if (c.thought?.adherentCount > 1) return `“${c.thought.title}”已经被别人听见。想法一旦进入别人的生活，就会开始变化。`;
  if (c.thought?.title) return `你开始整理“${c.thought.title}”。它现在还只是你对生活的一种理解。`;
  if (c.family !== "尚未建立家庭") return "有人开始与你共享劳作、季节和未来。";
  if (c.legacy) return "一些手艺和经验开始比日子活得更久。";
  if (c.role !== "尚未承担聚落角色") return "你开始承担共同体的一部分重量，也留下自己的痕迹。";
  if (c.learning !== "尚未开始系统学习") return "你从长辈、季节与反复的劳作里理解这个世界。";
  if (c.age < 6) return "世界比你先存在，也会在你之后继续。";
  return "一些选择看起来很小，但会被未来重新理解。";
}function footprintLabel(state) {
  return {
    remembered: "证据仍让后人记得你",
    influential: "你的痕迹已经影响了后世",
    trace: "还留有一些可追寻的线索",
    forgotten: "尚未留下可辨认的痕迹",
  }[state] || "尚未留下可辨认的痕迹";
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
    learn:"你开始从长辈、生活与技艺中学习",
    friend:"一个陌生人变成了认识的人",
    role:"你开始承担聚落里的一份角色",
    marry:"从今天起，人生里多了另一个人",
    child:"家族迎来了新的生命",
    legacy:"一门手艺与经验开始被记住",
    thought:"一种想法开始离开你的脑海，进入这个世界",
    "next-generation":"故事交到了下一代手里",
  }[action] || "世界发生了一点变化";
}
let toastTimer;
function showToast(message) {
  const el = $("toast");
  const inLife = document.body.dataset.screen === "activities";
  const inPage = document.body.dataset.screen !== "home";
  const modal = [...document.querySelectorAll(".modal-backdrop")].some(m => !m.hidden);
  if (inPage && !modal) {
    const feedback = $(inLife ? "actionFeedback" : "pageFeedback");
    feedback.hidden = false;
    feedback.textContent = message;
  }
  el.textContent = inPage && !modal ? "" : message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}


/**
 * Continuous waiting runs only while this page explicitly requests bounded
 * batches. Pause takes effect before the next batch; the server never loops in
 * the background after the tab closes.
 */
let continuousRunning = false;
let stopRequested = false;
function updateContinuousControls(message = "") {
  $("pauseAutoButton").hidden = !continuousRunning;
  $("sceneTimeButton").textContent = continuousRunning ? "暂停推进" : "时间安排";
  $("sceneTimeButton").onclick = continuousRunning ? pauseContinuousLife : openPlanEditor;
  $("autoButton").textContent = continuousRunning ? "时间设置" : "时间与日程";
  $("autoRunStatus").textContent = message || (continuousRunning ? "持续推进中，可随时暂停" : "当前已暂停");
  $("timeRibbon").querySelector(".time-copy").textContent =
    continuousRunning ? "自动推进中 · 可暂停" : `${state?.era ?? ""} · ${state?.month ?? 1} 月 · 已暂停`;
}
function pauseContinuousLife() {
  if (!continuousRunning) return;
  stopRequested = true;
  continuousRunning = false;
  updateContinuousControls("正在完成当前短批次，然后暂停");
}

async function startContinuousLife() {
  if (busy || continuousRunning) return;
  if (!state?.character?.alive) return showToast("这一生已经结束，无法继续接管。");
  if (state?.clock?.legacyScale) return showToast("旧月刻度人生请使用年度时间推进。");
  $("autoModal").hidden = true;
  continuousRunning = true;
  stopRequested = false;
  busy = true;
  document.body.classList.add("is-busy");
  updateContinuousControls();
  const days = Number($("autoSpeed").value) || 3;
  let batches = 0;
  let endMessage = "已暂停，控制权交还给你。";
  try {
    while (!stopRequested && continuousRunning && !document.hidden) {
      const data = await api("/api/autosim", {
        method: "POST",
        body: JSON.stringify({
          mode: "continuous-batch",
          days,
          expectedTick: state.tick,
          expectedActorId: state.character?.id,
          expectedPlanRevision: state.settlement?.dailyPlan?.revision,
        }),
      });
      if (data.result.ok === false) {
        throw new Error(data.result.errors?.[0]?.message || "无法继续自动推进。");
      }
      state = data.state;
      render(state);
      batches += 1;
      if (data.result.interrupted) {
        endMessage = data.result.stopReason || "发生需要你处理的重要事情。";
        continuousRunning = false;
        break;
      }
      if (batches % 5 === 0) await autoRemember();
      // Yield to the browser so Pause is always responsive between requests.
      if (!stopRequested && continuousRunning) {
        await new Promise((resolve) => setTimeout(resolve, 180));
      }
    }
  } catch (error) {
    endMessage = error.message;
    await loadState().catch(() => {});
  } finally {
    continuousRunning = false;
    stopRequested = false;
    updateContinuousControls(endMessage);
    busy = false;
    document.body.classList.remove("is-busy");
    if (batches > 0) await autoRemember();
    showToast(endMessage);
  }
}
$("startContinuousAuto").addEventListener("click", () => { void startContinuousLife(); });
$("pauseAutoButton").addEventListener("click", pauseContinuousLife);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pauseContinuousLife();
});
window.addEventListener("pagehide", pauseContinuousLife);

/** The editor changes intentions; only the server's world commands change facts. */
const PLAN_LABELS = { eat: "吃饭（随身熟食优先）", tend: "在当前位置劳动", rest: "休息", "go-hearth": "步行去公用灶台", "go-field": "步行去田地", "go-kiln": "步行去陶窑", "go-home": "步行回庭院", pottery: "在陶窑用真实材料开工（遇工艺抉择暂停）" };
let draftPlan = [];
function openPlanEditor() {
  const saved = state?.settlement?.dailyPlan;
  draftPlan = saved?.steps?.length ? [...saved.steps] : ["eat", "tend", "rest"];
  $("planRepeat").checked = saved?.repeat !== false;
  renderPlanEditor();
  $("autoModal").hidden = false;
}
function renderPlanEditor() {
  $("planSteps").innerHTML = draftPlan.map((step, index) => `
    <div class="plan-step-row" data-plan-row="${index}">
      <select aria-label="第 ${index + 1} 项安排" data-plan-choice="${index}">
        ${Object.entries(PLAN_LABELS).map(([value, label]) =>
          `<option value="${value}" ${value === step ? "selected" : ""}>${index + 1}. ${label}</option>`).join("")}
      </select>
      <button type="button" data-plan-up="${index}" ${index === 0 ? "disabled" : ""} aria-label="上移">↑</button>
      <button type="button" data-plan-remove="${index}" aria-label="删除">×</button>
    </div>`).join("");
  $("addPlanStep").disabled = draftPlan.length >= 6;
  $("planSteps").querySelectorAll("[data-plan-choice]").forEach((el) => {
    el.addEventListener("change", () => { draftPlan[Number(el.dataset.planChoice)] = el.value; });
  });
  $("planSteps").querySelectorAll("[data-plan-remove]").forEach((el) => {
    el.addEventListener("click", () => { draftPlan.splice(Number(el.dataset.planRemove), 1); renderPlanEditor(); });
  });
  $("planSteps").querySelectorAll("[data-plan-up]").forEach((el) => {
    el.addEventListener("click", () => {
      const i = Number(el.dataset.planUp);
      if (i > 0) [draftPlan[i - 1], draftPlan[i]] = [draftPlan[i], draftPlan[i - 1]];
      renderPlanEditor();
    });
  });
  updatePlanStatus(state);
}
function updatePlanStatus(s) {
  const saved = s?.settlement?.dailyPlan;
  const status = $("dailyPlanStatus");
  if (!status) return;
  status.textContent = saved?.enabled
    ? `日程已启用 · ${saved.steps.length} 项 · ${saved.repeat ? "每天重复" : "只执行一次"} · 已完成第 ${saved.progressIndex} 项`
    : "日程未启用，时间将按原来的被动模式运行。";
}
async function saveRoutine(enabled) {
  if (busy) return;
  if (enabled && draftPlan.length === 0) return showToast("请至少安排一项活动。");
  busy = true;
  document.body.classList.add("is-busy");
  try {
    const data = await api("/api/action", {
      method: "POST",
      body: JSON.stringify({
        action: "settlement-locations.plan.configure",
        payload: {
          steps: enabled ? draftPlan : state.settlement?.dailyPlan?.steps ?? [],
          enabled, repeat: $("planRepeat").checked,
        },
        expectedTick: state.tick,
        expectedActorId: state.character?.id,
        expectedActivityUsed: state.settlement?.dailyActivity?.used,
        expectedPlanRevision: state.settlement?.dailyPlan?.revision,
      }),
    });
    if (!data.result.ok) throw new Error(data.result.errors?.[0]?.message || "日程无法保存");
    state = data.state;
    render(state);
    showToast(enabled ? "日程已保存。点击开始可自动执行。" : "日程已暂停，可继续手动生活。");
    await autoRemember();
  } catch (error) {
    showToast(error.message);
    await loadState().catch(() => {});
  } finally {
    busy = false;
    document.body.classList.remove("is-busy");
  }
}
$("addPlanStep").addEventListener("click", () => {
  if (draftPlan.length >= 6) return;
  draftPlan.push("eat");
  renderPlanEditor();
});
$("saveDailyPlan").addEventListener("click", () => { void saveRoutine(true); });
$("disableDailyPlan").addEventListener("click", () => { void saveRoutine(false); });

$("autoButton").addEventListener("click", openPlanEditor);
$("closeAuto").addEventListener("click", () => $("autoModal").hidden = true);
document.querySelectorAll("[data-auto]").forEach((button) => {
  button.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    document.body.classList.add("is-busy");
    $("autoModal").hidden = true;
    try {
      const data = await api("/api/autosim", { method: "POST", body: JSON.stringify({ mode: button.dataset.auto }) });
      if (data.result.ok === false) throw new Error(data.result.errors?.[0]?.message || "先完成当前选择");
      state = data.state;
      render(state, true);
      showToast(data.result.steps > 1 ? `时间向前走了 ${data.result.steps} 年` : "一年过去了");
      await autoRemember();
    } catch (error) {
      showToast(error.message);
    } finally {
      busy = false;
      document.body.classList.remove("is-busy");
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
      window.__openlifeLastMemoryError = null;
      await captureMemory(button.dataset.saveSlot);
    } catch (error) {
      window.__openlifeLastMemoryError ||= error;
      showToast(error.message);
    } finally {
      button.disabled = false;
    }
  });
});
document.querySelectorAll("[data-load-slot]").forEach((button) => {
  button.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    document.body.classList.add("is-busy");
    button.disabled = true;
    try {
      await restoreMemory(button.dataset.loadSlot);
      enterLife();
    } catch (error) {
      showToast(error.message);
      renderMemorySlots();
    } finally {
      button.disabled = false;
      busy = false;
      document.body.classList.remove("is-busy");
    }
  });
});

$("resetButton").addEventListener("click", () => {
  fillOriginChoices(state?.originCatalog);
  $("newLifeModal").hidden = false;
  $("newGivenName").focus();
});

/** 新人生表单：出身下拉与天赋勾选，来自服务器的数据包目录。 */
function fillOriginChoices(catalog) {
  const select = $("newOrigin"), list = $("newTalentList");
  if (!catalog || !select || select.dataset.filled) return;
  select.dataset.filled = "1";
  for (const o of catalog.origins) select.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(o.id)}">${escapeHtml(o.name)}</option>`);
  list.innerHTML = catalog.talents.map((t) => `<label class="talent-choice"><input type="checkbox" value="${escapeHtml(t.id)}" />
    <b>${escapeHtml(t.name)}</b><small>${escapeHtml(t.blurb)}</small></label>`).join("");
  const sync = () => {
    const random = select.value === "random";
    const o = catalog.origins.find((x) => x.id === select.value);
    $("newOriginStory").textContent = o ? `${o.story}（心里的念想：${o.aspiration}）` : "出身与两个天赋由人生编号决定，同一个编号总是同一种开局。";
    const checked = list.querySelectorAll("input:checked").length;
    for (const box of list.querySelectorAll("input")) box.disabled = random || (!box.checked && checked >= catalog.maxTalents);
  };
  select.addEventListener("change", sync);
  list.addEventListener("change", sync);
  sync();
}


/** 人物卡上的出身与天赋。 */
function renderOriginCard(s) {
  const card = $("originCard");
  const o = s?.settlement?.origin;
  if (!card) return;
  if (!o || o.id === "none") { card.hidden = true; card.innerHTML = ""; return; }
  card.hidden = false;
  card.innerHTML = `<div class="origin-head"><span>出身</span><strong>${escapeHtml(o.name)}</strong></div>
    <p class="origin-story">${escapeHtml(o.story)}</p>
    <p class="origin-wish">心里的念想：${escapeHtml(o.aspiration)}</p>
    <ul class="origin-talents">${o.talents.map((t) => `<li><b>${escapeHtml(t.name)}</b> ${escapeHtml(t.blurb)}</li>`).join("")}</ul>`;
}
$("closeNewLife").addEventListener("click", () => $("newLifeModal").hidden = true);
$("newLifeForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  document.body.classList.add("is-busy");
  const submit = event.currentTarget.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const data = await api("/api/reset", {
      method: "POST",
      body: JSON.stringify({
        seed: Number($("newSeed").value || 104),
        givenName: $("newGivenName").value,
        familyName: $("newFamilyName").value,
        cityId: $("newCity").value,
        originId: $("newOrigin")?.value || "random",
        talents: [...document.querySelectorAll("#newTalentList input:checked")].map((box) => box.value),
      }),
    });
    state = data.state;
    $("newLifeModal").hidden = true;
    render(state, true);
    showToast("一段新的人生开始了");
    await autoRemember();
    enterLife();
  } catch (error) {
    showToast(error.message);
  } finally {
    submit.disabled = false;
    busy = false;
    document.body.classList.remove("is-busy");
  }
});
installShell({
  onSettlementAction: performSettlementAction,
  hasSave: () => Boolean(readMemory("auto")?.save),
  saveSummary: () => readMemory("auto")?.summary,
  continueLife: async () => {
    if (busy) throw new Error("正在处理上一项操作");
    busy = true;
    try { await restoreMemory("auto"); } finally { busy = false; }
  },
});
installModalAccess();
renderMemorySlots();
loadState().catch(error => { showToast(error.message); $("homeStatus").textContent = "世界暂时无法读取，请检查本地服务后刷新。"; });
