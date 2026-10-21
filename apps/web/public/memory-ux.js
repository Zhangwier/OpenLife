/**
 * UI 与交互第六轮（2026-10-21）：人生记忆（存档与读档）弹窗。只做表现层。
 *  - 每个格子写清楚存的是谁、在哪、哪一天，以及多久以前存的（悬停显示具体时间）。
 *  - 「留住此刻」盖掉已有记忆前、「回到这里」替换眼前人生前，都在格子里先确认一次。
 *  - 存好的那一格亮一下并写「刚刚留下」；弹窗顶部有一条 aria-live 状态。
 *  - 手动记忆可以清空（也要确认）；底部显示浏览器存储用了多少。
 *  - 主菜单「人生存档」下面写着有几份记忆、最近一份是什么时候。
 * 存档、读档仍走 app.js 原来的按钮和接口；这里只在点击前插一步确认、在之后补上说明。
 */
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const SAVE_PREFIX = "openlife.save.";
export const SCENE_PREFIX = "openlife.save-scene.";
export const SLOTS = ["auto", "manual-1", "manual-2", "manual-3"];
const SLOT_NAME = { auto: "最近的记忆", "manual-1": "记忆一", "manual-2": "记忆二", "manual-3": "记忆三" };
const QUOTA_CHARS = 5 * 1024 * 1024; // 主流浏览器每个站点约 5M 个字符

if (typeof document !== "undefined" && !document.querySelector('link[href="/memory-ux.css"]')) {
  const link = document.createElement("link");
  link.rel = "stylesheet"; link.href = "/memory-ux.css";
  document.head.appendChild(link);
}

// ---------- 纯逻辑（单测直接调用） ----------
/** 「刚刚 / 3 分钟前 / 2 小时前 / 昨天 21:40 / 10月18日 09:05」 */
export function relativeTime(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "刚刚";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} 分钟前`;
  const d = new Date(t), n = new Date(now);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const dayDiff = Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
  if (dayDiff === 0) return `${Math.round(s / 3600)} 小时前`;
  if (dayDiff === 1) return `昨天 ${hm}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
}
export function absoluteTime(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
const GEN = ["", "第一代", "第二代", "第三代", "第四代", "第五代", "第六代", "第七代", "第八代", "第九代", "第十代"];
/** 一个格子要显示的几行字。 */
export function slotLines(entry, scene, now = Date.now()) {
  if (!entry?.summary) return null;
  const s = entry.summary, c = s.character;
  const who = c ? `${c.name} · ${c.age} 岁${c.alive === false ? " · 已离世" : ""}` : "没有正在经历人生的人";
  const gen = GEN[s.generation] || `第 ${s.generation} 代`;
  const when = s.era ?? (s.year < 0 ? `公元前 ${-s.year + 1} 年` : `${s.year} 年`);
  const fresh = scene && scene.savedAt === entry.savedAt ? scene : null;
  const where = fresh ? [fresh.place, fresh.day].filter(Boolean).join(" · ") : "";
  return {
    who, gen, where, when: `${when}${s.month ? ` · ${s.month} 月` : ""}`,
    ago: relativeTime(entry.savedAt, now), at: absoluteTime(entry.savedAt),
  };
}
/** localStorage 里一个值大约占多少：按 UTF-16 字符数算。 */
export function storageUse(sizes) {
  const used = sizes.reduce((a, b) => a + b, 0);
  return { used, ratio: Math.min(1, used / QUOTA_CHARS), label: `${(used / 1024 / 1024).toFixed(1)} MB` };
}
export function isQuotaError(error) {
  return Boolean(error && (error.name === "QuotaExceededError" || error.code === 22 || /quota/i.test(String(error.message))));
}

// ---------- 浏览器接线 ----------
const read = (slot) => { try { return JSON.parse(localStorage.getItem(SAVE_PREFIX + slot) || "null"); } catch { return null; } };
const readScene = (slot) => { try { return JSON.parse(localStorage.getItem(SCENE_PREFIX + slot) || "null"); } catch { return null; } };
/** 存档时人在哪：直接读页面上已经显示的场景标题和日子。 */
function currentScene() {
  const place = [$("scenePlace")?.textContent, $("sceneSpace")?.textContent].filter((x) => x && x.trim()).join(" · ");
  return { place, day: $("sceneDay")?.textContent?.trim() || "" };
}
/** 某格的存档刚变了（手动存或自动存），就把当时的场景记在旁边。 */
function syncScene(slot) {
  const e = read(slot);
  if (!e?.savedAt) return;
  const sc = readScene(slot);
  if (sc?.savedAt === e.savedAt) return;
  try { localStorage.setItem(SCENE_PREFIX + slot, JSON.stringify({ savedAt: e.savedAt, ...currentScene() })); } catch { /* 空间不够时宁可不记 */ }
}

let justSaved = "";
let pending = null; // { slot, kind: "save" | "load" | "clear" }

function install() {
  const modal = $("memoryModal");
  if (!modal || modal.dataset.memoryUx) return;
  modal.dataset.memoryUx = "1";
  const section = modal.querySelector(".modal");
  const status = document.createElement("p");
  status.className = "memory-status"; status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  section.querySelector(".memory-slots")?.before(status);
  for (const slot of SLOTS) {
    const card = modal.querySelector(`[data-memory-slot="${slot}"]`);
    if (!card) continue;
    const info = document.createElement("div");
    info.className = "slot-info"; info.dataset.slotInfo = slot;
    (card.querySelector(".memory-slot-copy") || card.querySelector("strong"))?.after(info);
    const confirm = document.createElement("div");
    confirm.className = "slot-confirm"; confirm.hidden = true; confirm.dataset.slotConfirm = slot;
    card.append(confirm);
    if (slot !== "auto") {
      const clear = document.createElement("button");
      clear.type = "button"; clear.className = "ghost-button compact slot-clear"; clear.dataset.clearSlot = slot;
      clear.textContent = "清空"; clear.setAttribute("aria-label", `清空${SLOT_NAME[slot]}`);
      card.querySelector(".slot-actions")?.append(clear);
    }
  }
  const foot = document.createElement("div");
  foot.className = "memory-storage";
  foot.innerHTML = `<span data-storage-label></span><span class="memory-storage-bar" aria-hidden="true"><i data-storage-fill></i></span>`;
  modal.querySelector("#closeMemory")?.before(foot);

  // 点击前先插一步确认（捕获阶段，早于 app.js 自己的监听）。
  modal.addEventListener("click", (e) => {
    const save = e.target.closest("[data-save-slot]");
    const load = e.target.closest("[data-load-slot]");
    const clear = e.target.closest("[data-clear-slot]");
    const btn = save || load || clear;
    if (!btn || btn.dataset.confirmed === "1") return;
    const slot = btn.dataset.saveSlot || btn.dataset.loadSlot || btn.dataset.clearSlot;
    const kind = save ? "save" : load ? "load" : "clear";
    if (kind === "save") {
      pending = { slot, kind };
      if (!read(slot)) { justSaved = slot; setStatus(`正在把此刻存进${SLOT_NAME[slot]}…`); return; }
    }
    e.stopImmediatePropagation(); e.preventDefault();
    askConfirm(slot, kind);
  }, true);
  modal.addEventListener("click", (e) => {
    const yes = e.target.closest("[data-confirm-yes]");
    const no = e.target.closest("[data-confirm-no]");
    if (no) { closeConfirm(no.dataset.confirmNo, true); return; }
    if (!yes) return;
    const { slot, kind } = { slot: yes.dataset.confirmYes, kind: yes.dataset.kind };
    closeConfirm(slot, false);
    if (kind === "clear") {
      localStorage.removeItem(SAVE_PREFIX + slot); localStorage.removeItem(SCENE_PREFIX + slot);
      const loadBtn = modal.querySelector(`[data-load-slot="${slot}"]`);
      if (loadBtn) loadBtn.disabled = true;
      setStatus(`${SLOT_NAME[slot]}已清空。`);
      refresh();
      modal.querySelector(`[data-save-slot="${slot}"]`)?.focus();
      return;
    }
    const btn = modal.querySelector(kind === "save" ? `[data-save-slot="${slot}"]` : `[data-load-slot="${slot}"]`);
    if (!btn) return;
    if (kind === "save") { justSaved = slot; pending = { slot, kind }; setStatus(`正在把此刻存进${SLOT_NAME[slot]}…`); }
    if (kind === "load") setStatus(`正在回到${SLOT_NAME[slot]}…`);
    btn.dataset.confirmed = "1";
    btn.click();
    delete btn.dataset.confirmed;
  });
  // 挂在 window 的捕获阶段：早于 ui-polish.js 等在 document 上关弹窗的 Esc 处理。
  window.addEventListener("keydown", (e) => {
    if (modal.hidden || e.key !== "Escape") return;
    const open = modal.querySelector(".slot-confirm:not([hidden])");
    if (open) { e.stopPropagation(); closeConfirm(open.dataset.slotConfirm, true); }
  }, true);
  // 打开弹窗、存档按钮从忙碌恢复时都刷新一遍。
  new MutationObserver(() => { if (!modal.hidden) { closeAll(); refresh(); } else { setStatus(""); justSaved = ""; } })
    .observe(modal, { attributes: true, attributeFilter: ["hidden"] });
  for (const b of modal.querySelectorAll("[data-save-slot]")) {
    new MutationObserver(() => { if (!b.disabled) afterSave(b.dataset.saveSlot); })
      .observe(b, { attributes: true, attributeFilter: ["disabled"] });
  }
  // 自动记忆在每次行动后写入：顺手记下当时的地点。
  window.addEventListener("storage", refresh);
  setInterval(() => { syncScene("auto"); if (!modal.hidden) refresh(); updateHomeSaves(); }, 4000);
  document.addEventListener("click", () => setTimeout(() => { syncScene("auto"); updateHomeSaves(); }, 1500));
  refresh();
}

function setStatus(text, tone = "") {
  const el = document.querySelector("#memoryModal .memory-status");
  if (!el) return;
  el.textContent = text; el.dataset.tone = tone; el.hidden = !text;
}

function afterSave(slot) {
  if (pending?.slot !== slot || pending.kind !== "save") return;
  pending = null;
  const e = read(slot);
  const ok = e?.savedAt && Date.now() - Date.parse(e.savedAt) < 15000;
  if (ok) {
    syncScene(slot);
    setStatus(`已存进${SLOT_NAME[slot]}。`, "ok");
  } else {
    justSaved = "";
    const err = window.__openlifeLastMemoryError;
    setStatus(isQuotaError(err)
      ? "没存上：浏览器给这个网站的存储空间满了。清空一个不要的记忆再试。"
      : `没存上：${err?.message || "请再试一次"}`, "bad");
  }
  refresh();
}

function askConfirm(slot, kind) {
  closeAll();
  const modal = $("memoryModal");
  const card = modal.querySelector(`[data-memory-slot="${slot}"]`);
  const box = card?.querySelector(".slot-confirm");
  if (!box) return;
  const lines = slotLines(read(slot), readScene(slot));
  const auto = slotLines(read("auto"), readScene("auto"));
  const text = {
    save: `会盖掉这里原来的记忆（${lines ? `${lines.who}，${lines.ago}存的` : "空"}）。`,
    load: `眼前这段人生会换成这里的样子${lines ? `（${lines.who}）` : ""}。${slot !== "auto" && auto ? `最近一次自动记忆是${auto.ago}，那之后的经历会丢掉。` : "那之后的经历会丢掉。"}`,
    clear: `清空后就找不回来了${lines ? `（${lines.who}，${lines.ago}存的）` : ""}。`,
  }[kind];
  const yes = { save: "盖掉并存入", load: "回到这里", clear: "清空" }[kind];
  box.innerHTML = `<p>${esc(text)}</p><div class="slot-confirm-actions">
    <button type="button" class="ghost-button compact" data-confirm-no="${slot}">先不</button>
    <button type="button" class="action-button compact ${kind === "load" ? "gold" : "danger"}" data-confirm-yes="${slot}" data-kind="${kind}">${yes}</button></div>`;
  box.hidden = false;
  card.classList.add("is-confirming");
  card.querySelector(".slot-actions, :scope > button")?.setAttribute("hidden", "");
  box.querySelector("[data-confirm-no]").focus();
}
function closeConfirm(slot, refocus) {
  const card = document.querySelector(`#memoryModal [data-memory-slot="${slot}"]`);
  if (!card) return;
  const box = card.querySelector(".slot-confirm");
  box.hidden = true; box.innerHTML = "";
  card.classList.remove("is-confirming");
  card.querySelector(".slot-actions, :scope > button")?.removeAttribute("hidden");
  if (refocus) card.querySelector("[data-save-slot], [data-load-slot]")?.focus();
}
function closeAll() { for (const s of SLOTS) closeConfirm(s, false); }

function refresh() {
  const modal = $("memoryModal");
  if (!modal?.dataset.memoryUx) return;
  const sizes = [];
  let any = false;
  for (const slot of SLOTS) {
    const raw = localStorage.getItem(SAVE_PREFIX + slot);
    sizes.push(raw ? raw.length : 0);
    const entry = read(slot);
    const lines = slotLines(entry, readScene(slot));
    const card = modal.querySelector(`[data-memory-slot="${slot}"]`);
    const info = card?.querySelector(".slot-info");
    if (!info) continue;
    card.classList.toggle("is-empty", !lines);
    card.classList.toggle("just-saved", justSaved === slot && Boolean(lines));
    if (lines) any = true;
    info.innerHTML = lines ? `
      <span class="slot-who">${esc(lines.who)}<em>${esc(lines.gen)}</em></span>
      <span class="slot-where">${esc([lines.when, lines.where].filter(Boolean).join(" · "))}</span>
      <time class="slot-ago" datetime="${esc(entry.savedAt)}" title="${esc(lines.at)}">${justSaved === slot ? "✓ 刚刚留下" : `${esc(lines.ago)}存的`}</time>`
      : `<span class="slot-empty">${slot === "auto" ? "还没有自动记忆。每做一件事都会自动记一次。" : "空着。点「留住此刻」把眼前存进来。"}</span>`;
    const autoErr = slot === "auto" && window.__openlifeAutoMemoryError;
    if (autoErr && (!entry?.savedAt || Date.parse(autoErr.at) > Date.parse(entry.savedAt))) {
      info.insertAdjacentHTML("beforeend", `<span class="slot-warn">上次自动记忆没存上：${esc(autoErr.message)}</span>`);
    }
    const clear = card.querySelector("[data-clear-slot]");
    if (clear) clear.hidden = !lines;
    const save = card.querySelector("[data-save-slot]");
    if (save) save.textContent = lines ? "存到这里" : "留住此刻";
  }
  const use = storageUse(sizes);
  modal.querySelector("[data-storage-label]").textContent = `记忆存在这台设备的浏览器里，已用 ${use.label}，约占 ${Math.round(use.ratio * 100)}%`;
  const fill = modal.querySelector("[data-storage-fill]");
  fill.style.width = `${Math.max(2, use.ratio * 100)}%`;
  fill.dataset.level = use.ratio > 0.85 ? "bad" : use.ratio > 0.6 ? "warn" : "";
  modal.classList.toggle("memory-none", !any);
}

function updateHomeSaves() {
  const btn = $("homeSaves");
  if (!btn) return;
  const entries = SLOTS.map(read).filter((e) => e?.savedAt);
  const small = btn.querySelector("small");
  if (!small) return;
  if (!entries.length) { small.textContent = "还没有留下记忆"; return; }
  const latest = entries.sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))[0];
  small.textContent = `${entries.length} 份记忆 · 最近一份${relativeTime(latest.savedAt)}`;
}

if (typeof window !== "undefined") {
  const start = () => { install(); updateHomeSaves(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
}
