/**
 * UI 与交互第五轮（2026-10-20 晚）：时间与日程。只做表现层，不改规则，也不自己发游戏动作。
 *  1. 日程编辑弹窗：每一步写明花几格活动时间、合计「约用 n / 8 格」；排不下、重复走路、
 *     没到陶窑就开工、整天不吃饭这些会让日程停下的排法，保存前就标出来；加上下移、
 *     三套现成日程；有改动没保存时标出来；一屏只留一个主按钮。
 *  2. 持续推进：推进时顶部（手机在底栏上方）常驻一条「时间在走」，写已过几天、今天日期、
 *     日程走到第几项，带大号「暂停」；停下后变成一张小结：过了几天、从哪天到哪天、
 *     饥饿和年龄的变化、日程做了哪些事、为什么停，并给「看纪事」「再走一段」。
 * 改日程仍走 app.js 原有的下拉框、上移、删除、添加按钮（这里只是替玩家点它们），
 * 所以保存、校验、服务端规则都跟原来一样。
 */
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

if (typeof document !== "undefined" && !document.querySelector('link[href="/time-ux.css"]')) {
  const link = document.createElement("link");
  link.rel = "stylesheet"; link.href = "/time-ux.css";
  document.head.appendChild(link);
}

// ---------- 纯逻辑（单测直接调用） ----------
export const PLACE_NAMES = {
  "place:yard": "庭院", "place:hearth-yard": "公用灶台", "place:field": "田地", "place:kiln": "陶窑",
};
const WALK_TO = { "go-hearth": "place:hearth-yard", "go-field": "place:field", "go-kiln": "place:kiln", "go-home": "place:yard" };
const OUTDOOR = new Set(["place:field", "place:reedbed", "place:claypits", "place:river", "place:ford"]);
export const STEP_SHORT = {
  eat: "吃饭", tend: "劳动", rest: "休息", "go-hearth": "去灶台", "go-field": "去田地",
  "go-kiln": "去陶窑", "go-home": "回庭院", pottery: "制陶开工",
};
const STEP_ICON = { eat: "碗", tend: "锄", rest: "眠", "go-hearth": "行", "go-field": "行", "go-kiln": "行", "go-home": "行", pottery: "窑" };

/**
 * 按服务端的价目估算一天日程：吃饭 1、休息 2、劳动 3（雨雪天在户外 +1，能吃苦免）、
 * 村内步行 1（腿脚快头两趟免）、制陶开工 2。从当前所在地点一步步推演走到哪里。
 */
export function planCost(steps, ctx = {}) {
  let place = ctx.placeId || "place:yard";
  let freeWalks = ctx.freeWalks ?? 0;
  const capacity = ctx.capacity ?? 8;
  const rows = [];
  const warnings = [];
  let total = 0;
  const start = place;
  let moved = false;
  // 服务端只吃「手里的熟食」或「所在地点的熟食/粮食」；公用灶台每天都有熟食。
  const foodAt = (where) => {
    if (!ctx.food || ctx.food.carried || where === "place:hearth-yard") return true;
    if (where === start && !moved) return ctx.food.here;
    return null;
  };
  steps.forEach((step, i) => {
    let cost = 0, note = "";
    if (step === "eat") {
      cost = 1;
      const ok = foodAt(place);
      if (ok === false) warnings.push({ index: i, level: "stop", text: `第 ${i + 1} 项吃饭：手里没有熟食，${PLACE_NAMES[place] || "这里"}也没有粮食，日程会在这里停下。先「去灶台」再吃。` });
      else if (ok === null) warnings.push({ index: i, level: "warn", text: `第 ${i + 1} 项在${PLACE_NAMES[place] || "那里"}吃饭：那里不一定有吃的，没有就会停下。` });
    }
    else if (step === "rest") cost = 2;
    else if (step === "pottery") {
      cost = 2;
      if (place !== "place:kiln") warnings.push({ index: i, level: "stop", text: `第 ${i + 1} 项制陶开工前，要先安排「去陶窑」。` });
    } else if (step === "tend") {
      cost = 3;
      if (ctx.wet && !ctx.ignoreWet && OUTDOOR.has(place)) { cost += 1; note = `${ctx.sky || "雨雪"}天户外 +1`; }
    } else if (WALK_TO[step]) {
      const dest = WALK_TO[step];
      if (dest === place) {
        warnings.push({ index: i, level: "stop", text: `第 ${i + 1} 项：那时已经在${PLACE_NAMES[dest]}，日程会在这里停下。删掉它或换个去处。` });
      } else if (freeWalks > 0) { freeWalks -= 1; note = "腿脚快，不花时间"; }
      else cost = 1;
      place = dest; moved = true;
    }
    total += cost;
    rows.push({ step, cost, note, place });
  });
  if (total > capacity) {
    let run = 0;
    const cut = rows.findIndex((r) => (run += r.cost) > capacity);
    warnings.push({ index: cut, level: "stop", text: `比一天的 ${capacity} 格多出 ${total - capacity} 格：从第 ${cut + 1} 项起今天做不完，日程会停在那里。` });
  }
  if (steps.length && !steps.includes("eat") && ctx.repeat !== false) {
    warnings.push({ index: -1, level: "warn", text: "每天都不吃饭，饥饿涨满后推进会停下。" });
  }
  return { total, capacity, rows, warnings, fits: total <= capacity };
}

/** 现成日程：都在 8 格以内，从庭院出发也走得通。 */
export const PRESETS = [
  { id: "field", name: "下地的一天", steps: ["go-hearth", "eat", "go-field", "tend", "go-home"], hint: "灶台吃饭 → 下地劳动 → 回家" },
  { id: "kiln", name: "窑上的一天", steps: ["go-hearth", "eat", "go-kiln", "pottery", "go-home", "rest"], hint: "要随身带 1 份黏土和 2 捆柴草" },
  { id: "easy", name: "歇一歇", steps: ["go-hearth", "eat", "go-home", "rest"], hint: "吃饱了回家歇着" },
];

/** 停下的原因分三类：要你处理（红）、你自己停的（中性）、安排做完了（绿）。 */
export function stopTone(message = "") {
  if (/一次性日程已完成/.test(message)) return "done";
  if (/已暂停|控制权交还给你|暂停推进/.test(message) && !/日程暂停|饥饿|制陶|无法|失败|结束|已满/.test(message)) return "paused";
  if (/已满 \d+ 岁/.test(message)) return "milestone";
  return "attention";
}

export function runSummary(start, end, actions = [], message = "") {
  const s0 = start?.settlement || {}, s1 = end?.settlement || {};
  const days = Math.max(0, Number(end?.tick ?? 0) - Number(start?.tick ?? 0));
  const counts = {};
  let walks = 0;
  for (const a of actions) { if (WALK_TO[a]) walks += 1; else counts[a] = (counts[a] || 0) + 1; }
  const deeds = Object.entries(counts).map(([k, n]) => `${STEP_SHORT[k] || k} ×${n}`);
  if (walks) deeds.push(`村里走动 ×${walks}`);
  const changes = [];
  const h0 = Number(s0.hunger ?? 0), h1 = Number(s1.hunger ?? 0);
  if (h1 !== h0) changes.push({ label: "饥饿", from: h0, to: h1, tone: h1 > h0 ? "bad" : "good" });
  const a0 = Number(start?.character?.age), a1 = Number(end?.character?.age);
  if (Number.isFinite(a0) && Number.isFinite(a1) && a1 !== a0) changes.push({ label: "年龄", from: `${a0} 岁`, to: `${a1} 岁`, tone: "neutral" });
  if (s0.placeName && s1.placeName && s0.placeName !== s1.placeName) changes.push({ label: "所在", from: s0.placeName, to: s1.placeName, tone: "neutral" });
  return {
    days, deeds, changes, tone: stopTone(message), message,
    from: dayLabel(start), to: dayLabel(end),
  };
}
export function dayLabel(s) {
  const c = s?.clock;
  if (!c) return "";
  return `${c.season} · ${c.monthOfYear} 月 ${c.dayOfMonth} 日`;
}

// ---------- 浏览器接线 ----------
let state = null;

function ctxFromState() {
  const s = state?.settlement || {};
  const talents = (s.origin?.talents || []).map((t) => t.id);
  const sky = s.weather?.sky || "";
  const carried = (s.objects || []).some((o) => o.prototypeId === "prototype:cooked-food" && o.placement === "在手中");
  const here = (s.yields || []).some((y) => ["resource:cooked", "resource:grain"].includes(y.resourceId) && y.stock > 0);
  return {
    food: s.placeId ? { carried, here } : undefined,
    placeId: s.placeId, capacity: s.dailyActivity?.capacity ?? 8,
    freeWalks: talents.includes("fleet") ? 2 : 0, ignoreWet: talents.includes("hardy"),
    wet: sky === "雨" || sky === "雪", sky, repeat: $("planRepeat")?.checked !== false,
  };
}
const readDraft = () => [...document.querySelectorAll("#planSteps [data-plan-choice]")].map((el) => el.value);
const savedSteps = () => (state?.settlement?.dailyPlan?.steps || []);
const savedRepeat = () => state?.settlement?.dailyPlan?.repeat !== false;

function install() {
  const modal = $("autoModal");
  if (!modal || modal.dataset.timeUx) return;
  modal.dataset.timeUx = "1";
  modal.querySelector(".modal")?.classList.add("time-modal");
  const editor = modal.querySelector(".daily-plan-editor");
  // 顶部：日程现在是什么状态
  const head = document.createElement("div");
  head.className = "plan-head";
  head.innerHTML = `<strong>每天做什么</strong><span class="plan-state" data-plan-state></span>`;
  editor.querySelector(":scope > strong")?.replaceWith(head);
  const lead = editor.querySelector(":scope > p");
  if (lead) lead.textContent = "从上到下一项项做。一天有 8 格活动时间，排不下的、走不通的会在下面标出来，保存前就能改。";
  // 现成日程
  const presets = document.createElement("div");
  presets.className = "plan-presets";
  presets.setAttribute("role", "group");
  presets.setAttribute("aria-label", "现成日程");
  presets.innerHTML = `<span>套用：</span>${PRESETS.map((p) => `<button type="button" class="chip-button" data-plan-preset="${p.id}" title="${esc(p.hint)}">${esc(p.name)}</button>`).join("")}`;
  lead?.after(presets);
  // 合计与提醒
  const budget = document.createElement("div");
  budget.className = "plan-budget";
  budget.innerHTML = `<div class="plan-budget-line"><span data-plan-total></span><span class="plan-pips" data-plan-pips aria-hidden="true"></span></div><ul class="plan-warnings" data-plan-warnings role="status" aria-live="polite"></ul>`;
  $("planSteps").after(budget);
  const dirty = document.createElement("p");
  dirty.className = "plan-dirty"; dirty.hidden = true; dirty.dataset.planDirty = "";
  dirty.textContent = "有改动还没保存，保存后才会照新日程过。";
  editor.querySelector(".plan-actions")?.before(dirty);
  // 下半部分：让时间走
  const runHead = document.createElement("div");
  runHead.className = "plan-head run-head";
  runHead.innerHTML = `<strong>让时间走</strong><span class="run-hint" data-run-hint></span>`;
  modal.querySelector('label[for="autoSpeed"]')?.before(runHead);
  modal.querySelector('[data-auto="milestone"]')?.classList.replace("gold", "quiet");

  presets.addEventListener("click", (e) => {
    const b = e.target.closest("[data-plan-preset]");
    if (b) applySteps(PRESETS.find((p) => p.id === b.dataset.planPreset).steps);
  });
  new MutationObserver(() => decorateRows()).observe($("planSteps"), { childList: true });
  modal.addEventListener("change", () => refreshEditor());
  new MutationObserver(() => { if (!modal.hidden) refreshEditor(); }).observe(modal, { attributes: true, attributeFilter: ["hidden"] });
  decorateRows();
}

/** 替玩家点原来的按钮：先删光，再一项项添加并选好。 */
function applySteps(steps) {
  const box = $("planSteps");
  let guard = 12;
  while (box.querySelector("[data-plan-remove]") && guard--) box.querySelector("[data-plan-remove]").click();
  steps.forEach((step, i) => {
    $("addPlanStep").click();
    const sel = box.querySelector(`[data-plan-choice="${i}"]`);
    if (sel) { sel.value = step; sel.dispatchEvent(new Event("change", { bubbles: true })); }
  });
  decorateRows();
}

function decorateRows() {
  const box = $("planSteps");
  if (!box) return;
  const rows = [...box.querySelectorAll("[data-plan-row]")];
  rows.forEach((row, i) => {
    if (row.dataset.timeUx) return;
    row.dataset.timeUx = "1";
    const up = row.querySelector("[data-plan-up]");
    up?.setAttribute("aria-label", `第 ${i + 1} 项上移`);
    row.querySelector("[data-plan-remove]")?.setAttribute("aria-label", `删掉第 ${i + 1} 项`);
    const down = document.createElement("button");
    down.type = "button"; down.textContent = "↓"; down.dataset.planDown = String(i);
    down.setAttribute("aria-label", `第 ${i + 1} 项下移`);
    down.disabled = i === rows.length - 1;
    // 下移 = 让下一项上移；这样仍走 app.js 自己的交换逻辑。
    down.addEventListener("click", () => {
      box.querySelector(`[data-plan-up="${i + 1}"]`)?.click();
      box.querySelector(`[data-plan-down="${i + 1}"]`)?.focus();
    });
    up?.after(down);
    const icon = document.createElement("span");
    icon.className = "plan-step-icon"; icon.setAttribute("aria-hidden", "true");
    row.prepend(icon);
    const cost = document.createElement("span");
    cost.className = "plan-step-cost";
    row.querySelector("select")?.after(cost);
  });
  refreshEditor();
}

function refreshEditor() {
  const modal = $("autoModal");
  if (!modal?.dataset.timeUx) return;
  if (document.querySelector("#planSteps [data-plan-row]:not([data-time-ux])")) return decorateRows();
  const steps = readDraft();
  const r = planCost(steps, ctxFromState());
  [...document.querySelectorAll("#planSteps [data-plan-row]")].forEach((row, i) => {
    const info = r.rows[i];
    const step = info?.step;
    row.querySelector(".plan-step-icon").textContent = STEP_ICON[step] || "·";
    const c = row.querySelector(".plan-step-cost");
    c.textContent = info ? (info.cost ? `${info.cost} 格` : "不花") : "";
    c.title = info?.note || "";
    c.classList.toggle("has-note", Boolean(info?.note));
    const bad = r.warnings.some((w) => w.index === i);
    row.classList.toggle("plan-row-bad", bad);
    row.querySelector("select")?.setAttribute("aria-invalid", String(bad));
  });
  const total = modal.querySelector("[data-plan-total]");
  total.textContent = steps.length ? `一天约用 ${r.total} / ${r.capacity} 格` : "还没有安排";
  total.className = r.fits ? "" : "over";
  modal.querySelector("[data-plan-pips]").innerHTML = Array.from({ length: Math.max(r.capacity, r.total) }, (_, i) =>
    `<i class="${i < Math.min(r.total, r.capacity) ? "on" : i >= r.capacity ? "over" : ""}"></i>`).join("");
  const list = modal.querySelector("[data-plan-warnings]");
  list.innerHTML = r.warnings.map((w) => `<li class="${w.level}">${esc(w.text)}</li>`).join("");
  list.hidden = r.warnings.length === 0;
  // 状态与改动
  const plan = state?.settlement?.dailyPlan;
  const st = modal.querySelector("[data-plan-state]");
  st.textContent = plan?.enabled ? `已启用 · ${plan.repeat ? "每天重复" : "只做一次"}` : "未启用";
  st.className = `plan-state ${plan?.enabled ? "on" : ""}`;
  const changed = steps.join() !== savedSteps().join() || ($("planRepeat")?.checked ?? true) !== savedRepeat();
  const isDirty = changed && (steps.length > 0 || savedSteps().length > 0);
  modal.querySelector("[data-plan-dirty]").hidden = !isDirty;
  // 一屏一个主按钮：有没保存的改动时主按钮是「保存」，否则是「开始」。
  const save = $("saveDailyPlan"), start = $("startContinuousAuto");
  save.classList.toggle("gold", isDirty || !plan?.enabled);
  save.classList.toggle("quiet", !(isDirty || !plan?.enabled));
  start.classList.toggle("gold", !isDirty);
  start.classList.toggle("quiet", isDirty);
  save.textContent = plan?.enabled && !isDirty ? "已保存" : plan?.enabled ? "保存改动" : "保存并启用日程";
  save.disabled = Boolean(plan?.enabled && !isDirty);
  $("disableDailyPlan").hidden = !plan?.enabled;
  const hint = modal.querySelector("[data-run-hint]");
  hint.textContent = isDirty ? "先保存日程，再开始" : plan?.enabled ? "照日程过，遇事会停下" : "不照日程，只让日子过去";
}

// ---------- 2. 持续推进条与停下后的小结 ----------
let run = null;
function ensureBar() {
  let bar = $("timeRunBar");
  if (bar) return bar;
  bar = document.createElement("section");
  bar.id = "timeRunBar"; bar.className = "time-run-bar"; bar.hidden = true;
  bar.setAttribute("aria-live", "polite");
  bar.innerHTML = `<div class="run-live" data-run-live>
      <span class="run-dot" aria-hidden="true"></span>
      <div class="run-copy"><strong data-run-title>时间在走</strong><small data-run-detail></small></div>
      <button type="button" class="action-button gold run-pause" data-run-pause>暂停</button>
    </div>
    <div class="run-report" data-run-report hidden></div>`;
  document.body.appendChild(bar);
  bar.querySelector("[data-run-pause]").addEventListener("click", () => {
    $("pauseAutoButton")?.click();
    if (run) { run.pausing = true; refreshRunBar(); }
  });
  bar.addEventListener("click", (e) => {
    const b = e.target.closest("[data-run-act]");
    if (!b) return;
    if (b.dataset.runAct === "close") bar.hidden = true;
    if (b.dataset.runAct === "again") { bar.hidden = true; $("autoButton")?.click(); }
    if (b.dataset.runAct === "log") {
      bar.hidden = true;
      if (location.hash !== "#activities") location.hash = "#activities";
      setTimeout(() => $("lifeLog")?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }), 60);
    }
  });
  return bar;
}

/** 手机上推进条贴在底栏上方：按底栏实际高度留出 8px。 */
function placeBar(bar) {
  const nav = $("appNavigation");
  const fixed = nav && getComputedStyle(nav).position === "fixed";
  bar.style.setProperty("--run-bottom", fixed ? `${Math.ceil(innerHeight - nav.getBoundingClientRect().top) + 8}px` : "");
}
function onAutorun(d) {
  const bar = ensureBar();
  placeBar(bar);
  if (d.phase === "start") {
    run = { start: d.state || state, actions: [], batches: 0, pausing: false };
    document.body.classList.add("time-running");
    bar.hidden = false;
    bar.querySelector("[data-run-live]").hidden = false;
    bar.querySelector("[data-run-report]").hidden = true;
    bar.dataset.tone = "";
    refreshRunBar();
  } else if (d.phase === "batch" && run) {
    run.batches += 1;
    run.actions.push(...(d.result?.actions || []));
    refreshRunBar();
  } else if (d.phase === "end") {
    document.body.classList.remove("time-running");
    if (!run) return;
    const sum = runSummary(run.start, d.state || state, run.actions, d.message || "");
    run = null;
    showReport(bar, sum);
    d.handled = true; // 小结里已经写了原因，app.js 就不再弹同一句提示。
  }
}

function refreshRunBar() {
  const bar = $("timeRunBar");
  if (!bar || !run) return;
  const days = Math.max(0, Number(state?.tick ?? 0) - Number(run.start?.tick ?? 0));
  const plan = state?.settlement?.dailyPlan;
  bar.querySelector("[data-run-title]").textContent = run.pausing ? "正在停下…" : `时间在走 · 已过 ${days} 天`;
  bar.querySelector("[data-run-detail]").textContent = [
    dayLabel(state),
    plan?.enabled ? `照日程过 · 已做 ${run.actions.length} 件事` : "不照日程，只让日子过去",
    run.pausing ? "做完这一小段就停" : "随时可以暂停",
  ].filter(Boolean).join(" · ");
  const pause = bar.querySelector("[data-run-pause]");
  pause.disabled = run.pausing;
  pause.textContent = run.pausing ? "停下中" : "暂停";
}

const TONE_TITLE = { paused: "你按了暂停", done: "安排做完了", milestone: "到了一个坎", attention: "有事要你处理" };
function showReport(bar, sum) {
  bar.hidden = false;
  bar.dataset.tone = sum.tone;
  bar.querySelector("[data-run-live]").hidden = true;
  const box = bar.querySelector("[data-run-report]");
  box.hidden = false;
  box.innerHTML = `
    <div class="run-report-head">
      <span class="run-badge">${TONE_TITLE[sum.tone]}</span>
      <strong>${sum.days ? `这一段过了 ${sum.days} 天` : "还没过完一天就停下了"}</strong>
      ${sum.from && sum.days ? `<small>${esc(sum.from)} → ${esc(sum.to)}</small>` : ""}
      <button type="button" class="run-close" data-run-act="close" aria-label="收起小结">×</button>
    </div>
    ${sum.message && sum.tone !== "paused" ? `<p class="run-reason">${esc(sum.message)}</p>` : ""}
    ${sum.changes.length || sum.deeds.length ? `<ul class="run-facts">
      ${sum.changes.map((c) => `<li class="${c.tone}"><span>${esc(c.label)}</span>${esc(c.from)} → <b>${esc(c.to)}</b></li>`).join("")}
      ${sum.deeds.length ? `<li class="deeds"><span>日程做了</span>${esc(sum.deeds.join("、"))}</li>` : ""}
    </ul>` : ""}
    <div class="run-report-actions">
      <button type="button" class="action-button quiet" data-run-act="log">看人生纪事</button>
      <button type="button" class="action-button ${sum.tone === "attention" ? "quiet" : "gold"}" data-run-act="again">${sum.tone === "attention" ? "去改日程" : "再走一段"}</button>
    </div>`;
  box.querySelector(".run-close").focus({ preventScroll: true });
}

// 最后再接线：上面的 const / let 都已初始化。
if (typeof window !== "undefined") {
  window.addEventListener("openlife:state", (e) => { state = e.detail; refreshEditor(); refreshRunBar(); });
  window.addEventListener("openlife:autorun", (e) => onAutorun(e.detail || {}));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
}
