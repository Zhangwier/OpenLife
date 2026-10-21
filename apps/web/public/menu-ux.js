/**
 * UI 与交互第六轮（2026-10-21）：主菜单（☰「人生与世界」）。只做表现层。
 *  - 8 个入口分成三组：这段人生 / 回头看看 / 离开这段人生；每个入口有线条图标和一行说明。
 *  - 说明里带当前状态：最近一份记忆是什么时候、日程启用没有、家族有几代；当前所在页标「在这里」。
 *  - 「开启新人生」会结束眼前的人生：先在菜单里确认，并给出「先留住此刻」。
 *  - 打开时焦点落在第一个入口；↑↓←→ / Home / End 在入口间移动。
 * 点下去仍然是原来的 data-control / data-route 按钮，shell.js 的跳转逻辑不变。
 */
import { icon } from "./icons.js";
import { relativeTime, SLOTS, SAVE_PREFIX } from "./memory-ux.js";

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

if (typeof document !== "undefined" && !document.querySelector('link[href="/menu-ux.css"]')) {
  const link = document.createElement("link");
  link.rel = "stylesheet"; link.href = "/menu-ux.css";
  document.head.appendChild(link);
}

/** 每个入口：分组、图标、说明。key 是按钮上的 data-control 或 data-route。 */
export const MENU_ITEMS = {
  memoryButton: { group: "life", icon: "bed", hint: "存下此刻，或回到以前" },
  autoButton: { group: "life", icon: "clock", hint: "排日程，让日子自己过" },
  family: { group: "look", icon: "hands", hint: "一代代人怎样接下去" },
  history: { group: "look", icon: "thread", hint: "这个世界记住了什么" },
  world: { group: "look", icon: "sunset", hint: "此刻是什么年代" },
  modules: { group: "look", icon: "rack", hint: "世界由哪些模块组成" },
  // 其他分支给菜单加的入口（地图、图鉴、新手引导）也登记上，合并后同样有图标和说明。
  map: { group: "look", icon: "place", hint: "附近有哪些地方" },
  codex: { group: "look", icon: "pot", hint: "做法、物件和材料" },
  coach: { group: "life", icon: "talk", hint: "三步看懂生活页" },
  home: { group: "leave", icon: "house", hint: "人生不会重置，随时回来" },
  resetButton: { group: "leave", icon: "sprout", hint: "眼前这段人生会结束", danger: true },
};
export const GROUPS = [
  { id: "life", title: "这段人生" },
  { id: "look", title: "回头看看" },
  { id: "leave", title: "离开这段人生" },
];
export const keyOf = (button) => button.dataset.control || button.dataset.route || ("coachReopen" in button.dataset ? "coach" : "");

/** 方向键在一组按钮间移动：两列网格里 ←→ 走一格、↑↓ 走一行。 */
export function nextIndex(index, key, count, columns = 2) {
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }[key];
  if (step === undefined) return index;
  return Math.max(0, Math.min(count - 1, index + step));
}

/** 说明后面跟的状态：读页面上已经显示的东西，不另外请求。 */
export function statusFor(key, ctx) {
  if (key === "memoryButton") return ctx.latestSave ? `最近一份${ctx.latestSave}` : "还没有记忆";
  if (key === "autoButton") return ctx.planOn ? "日程已启用" : "日程未启用";
  if (key === "family") return ctx.generation ? `第 ${ctx.generation} 代` : "";
  if (key === "world") return ctx.era || "";
  return "";
}

function context() {
  const saves = SLOTS.map((s) => { try { return JSON.parse(localStorage.getItem(SAVE_PREFIX + s) || "null"); } catch { return null; } })
    .filter((e) => e?.savedAt).sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
  const CN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5 };
  const pill = ($("generationPill")?.textContent || "").trim();
  const gen = pill.match(/第\s*(\d+|[一二三四五])\s*代/);
  const ribbon = $("timeRibbon")?.textContent || "";
  const era = (ribbon.match(/公元前\s*\d+\s*年|公元\s*\d+\s*年|\d{3,4}\s*年/) || [""])[0];
  return {
    latestSave: saves[0] ? relativeTime(saves[0].savedAt) : "",
    planOn: /已启用/.test($("dailyPlanStatus")?.textContent || ""),
    generation: gen ? (CN[gen[1]] || Number(gen[1])) : 0,
    era,
    route: location.hash.slice(1) || "home",
    alive: !/已经结束|已离世/.test($("pageIdentity")?.textContent || ""),
  };
}

function install() {
  const modal = $("menuModal");
  const list = modal?.querySelector(".menu-links");
  if (!list || list.dataset.menuUx) return;
  list.dataset.menuUx = "1";
  modal.querySelector(".modal")?.classList.add("menu-ux");
  const buttons = [...list.querySelectorAll("button")];
  const frag = document.createDocumentFragment();
  for (const g of GROUPS) {
    const sec = document.createElement("section");
    sec.className = "menu-group"; sec.dataset.group = g.id;
    sec.setAttribute("aria-labelledby", `menuGroup-${g.id}`);
    sec.innerHTML = `<h3 id="menuGroup-${g.id}">${esc(g.title)}</h3><div class="menu-group-items"></div>`;
    frag.append(sec);
  }
  for (const b of buttons) {
    const meta = MENU_ITEMS[keyOf(b)];
    const label = b.textContent.trim();
    b.classList.add("menu-item");
    if (meta?.danger) b.classList.add("is-danger");
    b.innerHTML = `<span class="menu-item-icon" aria-hidden="true">${icon(meta?.icon || "dot")}</span>
      <span class="menu-item-text"><b>${esc(label)}</b><small data-menu-hint>${esc(meta?.hint || "")}</small></span>
      <span class="menu-item-state" data-menu-state></span>`;
    b.dataset.label = label;
    frag.querySelector(`[data-group="${meta?.group || "look"}"] .menu-group-items`).append(b);
  }
  list.replaceChildren(frag);
  const confirm = document.createElement("div");
  confirm.className = "menu-confirm"; confirm.hidden = true;
  confirm.setAttribute("role", "alertdialog"); confirm.setAttribute("aria-labelledby", "menuConfirmText");
  confirm.innerHTML = `<p id="menuConfirmText"><b>要开启新的人生吗？</b>眼前这段人生会结束。想以后回来，先把此刻存进记忆。</p>
    <div class="menu-confirm-actions">
      <button type="button" class="ghost-button" data-menu-confirm="cancel">先不</button>
      <button type="button" class="ghost-button" data-menu-confirm="save">先留住此刻</button>
      <button type="button" class="action-button danger" data-menu-confirm="go">开始新人生</button>
    </div>`;
  list.after(confirm);

  // 「开启新人生」先确认（捕获阶段，早于 shell.js 的 data-control 监听）。
  modal.addEventListener("click", (e) => {
    const b = e.target.closest('.menu-links [data-control="resetButton"]');
    if (!b || b.dataset.confirmed === "1" || !context().alive || !document.body.dataset.screen || document.body.dataset.screen === "home") return;
    e.stopImmediatePropagation(); e.preventDefault();
    list.hidden = true; confirm.hidden = false;
    confirm.querySelector('[data-menu-confirm="cancel"]').focus();
  }, true);
  confirm.addEventListener("click", (e) => {
    const act = e.target.closest("[data-menu-confirm]")?.dataset.menuConfirm;
    if (!act) return;
    const reset = list.querySelector('[data-control="resetButton"]');
    const memory = list.querySelector('[data-control="memoryButton"]');
    closeConfirm(act === "cancel");
    if (act === "go") { reset.dataset.confirmed = "1"; reset.click(); delete reset.dataset.confirmed; }
    if (act === "save") memory.click();
  });
  // 挂在 window 的捕获阶段：早于 ui-polish.js 等在 document 上关弹窗的 Esc 处理。
  window.addEventListener("keydown", (e) => {
    if (modal.hidden) return;
    if (!confirm.hidden && e.key === "Escape") { e.stopPropagation(); e.preventDefault(); closeConfirm(true); return; }
    const items = [...list.querySelectorAll(".menu-item")];
    const i = items.indexOf(document.activeElement);
    if (i < 0 || !["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const cols = getComputedStyle(list.querySelector(".menu-group-items")).gridTemplateColumns.split(" ").length || 1;
    items[nextIndex(i, e.key, items.length, cols)].focus();
  }, true);
  new MutationObserver(() => { if (!modal.hidden) { closeConfirm(false); refresh(); setTimeout(() => list.querySelector(".menu-item")?.focus(), 0); } })
    .observe(modal, { attributes: true, attributeFilter: ["hidden"] });

  function closeConfirm(refocus) {
    if (confirm.hidden) return;
    confirm.hidden = true; list.hidden = false;
    if (refocus) list.querySelector('[data-control="resetButton"]')?.focus();
  }
}

function refresh() {
  const ctx = context();
  for (const b of document.querySelectorAll("#menuModal .menu-item")) {
    const key = keyOf(b);
    const state = b.querySelector("[data-menu-state]");
    const here = b.dataset.route && b.dataset.route === ctx.route;
    b.toggleAttribute("aria-current", Boolean(here));
    if (here) b.setAttribute("aria-current", "page");
    state.textContent = here ? "在这里" : statusFor(key, ctx);
    state.classList.toggle("is-here", Boolean(here));
    state.classList.toggle("is-on", key === "autoButton" && ctx.planOn);
    b.setAttribute("aria-label", [b.dataset.label, b.querySelector("[data-menu-hint]").textContent, state.textContent].filter(Boolean).join("，"));
  }
}

if (typeof window !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
}
