/**
 * 界面交互收口（2026-10-20）。只做表现层，不发任何游戏动作：
 *  - 对话框：打开时把焦点移进去、Tab 不跑出去、Esc / 点遮罩关闭、关闭后焦点回到打开它的按钮。
 *    关闭一律“点它自己的关闭按钮”，所以 app.js 里各自的关闭逻辑照常执行。
 *  - 忙碌：body.is-busy 时顶栏显示“正在进行…”，并给读屏器 aria-busy。
 *  - 新人生表单：天赋“已选 n / 2”计数。
 *  - 新手引导卡：第一次进入「生活」时出现，三步说明，可“指给我看”，关掉后记住；菜单里能再打开。
 */
const COACH_KEY = "openlife-coach-dismissed";
const CLOSE_BUTTON = { menuModal: "closeMenu", autoModal: "closeAuto", memoryModal: "closeMemory", newLifeModal: "closeNewLife" };
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
const $ = (id) => document.getElementById(id);
const visible = (el) => !!el && el.getClientRects().length > 0;

// ---------- 对话框 ----------
const openers = new Map();
export function openModals() {
  return [...document.querySelectorAll(".modal-backdrop")].filter((m) => !m.hidden);
}
function topModal() {
  const open = openModals();
  return open.sort((a, b) => Number(getComputedStyle(b).zIndex || 0) - Number(getComputedStyle(a).zIndex || 0))[0] || null;
}
export function closeModal(backdrop) {
  if (!backdrop || backdrop.hidden) return false;
  if (backdrop.id === "newLifeModal" && document.body.classList.contains("is-busy")) return false; // 正在创建人生，别中途关掉
  const button = $(CLOSE_BUTTON[backdrop.id]);
  if (button) button.click(); else backdrop.hidden = true;
  return true;
}
function onModalToggle(backdrop) {
  if (!backdrop.hidden) {
    const active = document.activeElement;
    if (active && !backdrop.contains(active)) openers.set(backdrop.id, active);
    requestAnimationFrame(() => {
      if (backdrop.hidden || backdrop.contains(document.activeElement)) return;
      const first = backdrop.querySelector("input:not([type=hidden]):not([disabled]), select") || backdrop.querySelector(FOCUSABLE);
      first?.focus({ preventScroll: true });
    });
  } else {
    const opener = openers.get(backdrop.id);
    openers.delete(backdrop.id);
    if (opener?.isConnected && visible(opener) && !openModals().length) opener.focus({ preventScroll: true });
  }
}
function installModals() {
  const observer = new MutationObserver((records) => {
    for (const r of records) if (r.target.classList?.contains("modal-backdrop")) onModalToggle(r.target);
  });
  let downOnBackdrop = null;
  for (const backdrop of document.querySelectorAll(".modal-backdrop")) {
    observer.observe(backdrop, { attributes: true, attributeFilter: ["hidden"] });
    backdrop.setAttribute("role", "presentation");
    const dialog = backdrop.querySelector(".modal");
    if (dialog) {
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      const title = dialog.querySelector("h2");
      if (title) { title.id ||= `${backdrop.id}Title`; dialog.setAttribute("aria-labelledby", title.id); }
    }
    // 只有“按下和松开都在遮罩上”才算点遮罩，拖选文字拖出去不会误关。
    backdrop.addEventListener("pointerdown", (e) => { downOnBackdrop = e.target === backdrop ? backdrop : null; });
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop && downOnBackdrop === backdrop) closeModal(backdrop); downOnBackdrop = null; });
  }
  document.addEventListener("keydown", (e) => {
    const modal = topModal();
    if (!modal) return;
    if (e.key === "Escape") { if (closeModal(modal)) { e.preventDefault(); e.stopPropagation(); } return; }
    if (e.key !== "Tab") return;
    const items = [...modal.querySelectorAll(FOCUSABLE)].filter(visible);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (!modal.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }, true);
}

// ---------- 忙碌指示 ----------
function installBusy() {
  const actions = document.querySelector(".top-actions");
  if (actions && !actions.querySelector(".busy-chip")) actions.insertAdjacentHTML("afterbegin", '<span class="busy-chip" aria-hidden="true">正在进行…</span>');
  const sync = () => document.body.setAttribute("aria-busy", String(document.body.classList.contains("is-busy")));
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  sync();
}

// ---------- 天赋计数 ----------
export function talentCountText(checked, max, random) {
  return random ? "" : `已选 ${checked} / ${max}`;
}
function installTalentCount() {
  const list = $("newTalentList"), legend = document.querySelector("#newTalents legend"), origin = $("newOrigin");
  if (!list || !legend) return;
  const badge = document.createElement("span");
  badge.className = "talent-count";
  badge.setAttribute("aria-live", "polite");
  legend.append(badge);
  const sync = () => { badge.textContent = talentCountText(list.querySelectorAll("input:checked").length, 2, origin?.value === "random"); };
  list.addEventListener("change", sync);
  origin?.addEventListener("change", sync);
  new MutationObserver(sync).observe(list, { childList: true });
  sync();
}

// ---------- 新手引导 ----------
export const COACH_STEPS = [
  { title: "看「今日指引」", text: "下面这张卡告诉你现在最要紧的事，按卡上的按钮直接就能做。", target: "dailyGuide" },
  { title: "盯住状态条", text: "饥饿、今天还剩几格活动、屋顶和负重。变黄要留意，变红就得先处理。", target: "sceneSummary" },
  { title: "移动 · 劳动 · 时间", text: "去别处、做活歇息、安排日程过日子，都在这三个大按钮里。", target: "dockTools" },
];
function dismissed() { try { return localStorage.getItem(COACH_KEY) === "1"; } catch { return false; } }
function remember(value) { try { if (value) localStorage.setItem(COACH_KEY, "1"); else localStorage.removeItem(COACH_KEY); } catch {} }
let pointer = -1;
function clearTarget() { document.querySelectorAll(".coach-target").forEach((el) => el.classList.remove("coach-target")); }
function pointAt(index) {
  clearTarget();
  const step = COACH_STEPS[index];
  const el = step && $(step.target);
  if (!el || !visible(el)) return false;
  el.classList.add("coach-target");
  el.scrollIntoView({ block: "center", behavior: "auto" });
  return true;
}
function coachCard() {
  let card = $("coachCard");
  if (card) return card;
  card = document.createElement("section");
  card.id = "coachCard";
  card.className = "panel coach-card";
  card.setAttribute("aria-label", "新手引导");
  card.innerHTML = `<span class="eyebrow">第一次来</span><h3>三步看懂这一页</h3>
    <ol class="coach-steps">${COACH_STEPS.map((s) => `<li><b>${s.title}</b>${s.text}</li>`).join("")}</ol>
    <div class="coach-actions"><button type="button" class="coach-done">知道了，开始生活</button><button type="button" class="coach-next">指给我看</button></div>
    <button type="button" class="coach-close" aria-label="关闭新手引导">×</button>`;
  card.addEventListener("click", (e) => {
    if (e.target.closest(".coach-next")) {
      pointer = (pointer + 1) % COACH_STEPS.length;
      if (!pointAt(pointer)) pointAt(pointer = 0);
      e.target.closest(".coach-next").textContent = pointer === COACH_STEPS.length - 1 ? "从头再指一遍" : `下一处（${pointer + 2}/${COACH_STEPS.length}）`;
      return;
    }
    if (e.target.closest(".coach-done, .coach-close")) { remember(true); clearTarget(); card.hidden = true; pointer = -1; }
  });
  return card;
}
function placeCoach() {
  const screen = $("screen-activities");
  if (!screen) return;
  const card = coachCard();
  if (dismissed()) { card.hidden = true; return; }
  card.hidden = false;
  // 放在最上面：第一步就指向紧挨着它的「今日指引」。
  if (screen.firstElementChild !== card) screen.prepend(card);
}
export function reopenCoach() { remember(false); placeCoach(); $("coachCard")?.scrollIntoView({ block: "start" }); }
function installCoach() {
  const screen = $("screen-activities");
  if (screen) new MutationObserver(placeCoach).observe(screen, { childList: true });
  placeCoach();
  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-coach-reopen]")) return;
    $("menuModal").hidden = true;
    window.dispatchEvent(new CustomEvent("openlife:navigate", { detail: "activities" }));
    requestAnimationFrame(reopenCoach);
  });
}

export function installUiPolish() {
  installModals();
  installBusy();
  installTalentCount();
  // 页面框架由 shell.js 在 app.js 里搭好；等它把 #screen-activities 建出来。
  const ready = () => $("screen-activities") ? installCoach() : requestAnimationFrame(ready);
  ready();
}
if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installUiPolish, { once: true });
  else installUiPolish();
}
