/**
 * 界面交互第二轮（2026-10-20）：只做表现层，不发任何游戏动作。
 *  1. 场景操作菜单：打开时滚到看得见、标题不被顶栏挡住；关掉后把视线带回刚才点的人/物。
 *  2. 行动结果条：做完一件事，纪事不在视野里时，底部弹出这一步的结果和变化，可一键跳到纪事。
 *  3. 状态条变化标记：饥饿、活动格、屋顶、负重变了，就在那一项旁边标出 +n / −n，好坏分色。
 *  4. 故事页：顶部加分区导航；暂时接不了的事折叠进「时候未到」；能接的事按钮变主按钮。
 *  5. 行囊：随身格子用虚线空位画出来，“2/4 件”一眼看得出还能装几件。
 * 都是观察已有渲染结果再补一层，不改 app.js / stories.js / shell.js 的渲染逻辑。
 */
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const topbarHeight = () => document.querySelector(".topbar")?.getBoundingClientRect().height || 60;
const bottomNavHeight = () => {
  const nav = $("appNavigation");
  return nav && getComputedStyle(nav).position === "fixed" ? nav.getBoundingClientRect().height : 0;
};
function inView(el, margin = 0) {
  const r = el.getBoundingClientRect();
  return r.bottom > topbarHeight() + margin && r.top < innerHeight - bottomNavHeight() - margin;
}

// ---------- 1. 场景操作菜单 ----------
const TARGET_KEYS = ["data-person", "data-object", "data-yield", "data-carry", "data-loan", "id"];
function targetSelector(el) {
  const target = el?.closest?.(TARGET_KEYS.map((k) => `[${k}]`).join(","));
  if (!target) return "";
  const key = TARGET_KEYS.find((k) => target.hasAttribute(k));
  return `[${key}="${CSS.escape(target.getAttribute(key))}"]`;
}
function installQuickMenu() {
  const box = $("sceneQuickActions");
  if (!box) return;
  let wasHidden = box.hidden, opener = "";
  // 菜单打开时焦点已被移到菜单标题，所以在点击那一刻记下点的是谁。
  document.addEventListener("click", (e) => {
    const sel = e.target.closest?.("#settlementScene, #dockTools") && targetSelector(e.target);
    if (sel && !box.contains(e.target)) opener = sel;
  }, true);
  new MutationObserver(() => {
    if (wasHidden && !box.hidden) {
      // settlement.js 用 scrollIntoView("nearest") 露出菜单，会把标题顶到顶栏下面；稍后再校正一次。
      setTimeout(() => {
        if (box.hidden) return;
        const want = topbarHeight() + 12, r = box.getBoundingClientRect();
        if (r.top < want || r.top > innerHeight - bottomNavHeight() - 120) window.scrollBy(0, r.top - want);
      }, 60);
    } else if (!wasHidden && box.hidden) {
      // 列表重画后原按钮已被替换：按它的 data-* 找回同一个人/物，滚回去并把焦点放上。
      const selector = opener;
      setTimeout(() => {
        const el = (selector && document.querySelector(`#settlementScene ${selector}`)) || document.activeElement;
        if (!el || el === document.body) return;
        if (!inView(el, 8)) el.scrollIntoView({ block: "center" });
        if (document.activeElement !== el && el.focus) el.focus({ preventScroll: true });
      }, 60);
    }
    wasHidden = box.hidden;
  }).observe(box, { attributes: true, attributeFilter: ["hidden"] });
}

// ---------- 2. 行动结果条 ----------
let snackTimer = 0;
export function entryKey(li) { return li ? `${li.querySelector(".life-log-time")?.textContent || ""}|${li.querySelector("p")?.textContent || ""}` : ""; }
function snackbar() {
  let bar = $("outcomeBar");
  if (bar) return bar;
  bar = document.createElement("div");
  bar.id = "outcomeBar";
  bar.className = "outcome-bar";
  bar.setAttribute("role", "status");
  bar.setAttribute("aria-live", "polite");
  bar.hidden = true;
  bar.addEventListener("click", (e) => {
    if (e.target.closest("[data-outcome-jump]")) { hideSnack(); $("lifeLog")?.scrollIntoView({ block: "center" }); $("lifeLog")?.querySelector("li:last-child")?.classList.add("just-now"); }
    else if (e.target.closest("[data-outcome-close]")) hideSnack();
  });
  bar.addEventListener("pointerenter", () => clearTimeout(snackTimer));
  bar.addEventListener("pointerleave", () => armSnack());
  bar.addEventListener("focusin", () => clearTimeout(snackTimer));
  document.body.append(bar);
  return bar;
}
function hideSnack() { clearTimeout(snackTimer); const bar = $("outcomeBar"); if (bar) bar.hidden = true; }
function armSnack() { clearTimeout(snackTimer); snackTimer = setTimeout(hideSnack, 7000); }
function showSnack(li) {
  const bar = snackbar();
  const chips = [...li.querySelectorAll(".life-log-chips span")].map((s) => `<span class="${esc(s.className)}">${esc(s.textContent)}</span>`).join("");
  bar.innerHTML = `<div class="outcome-copy"><small>${esc(li.querySelector(".life-log-time")?.textContent || "刚刚")}</small>
    <p>${esc(li.querySelector("p")?.textContent || "")}</p>${chips ? `<div class="outcome-chips">${chips}</div>` : ""}</div>
    <button type="button" data-outcome-jump>看纪事</button><button type="button" class="outcome-close" data-outcome-close aria-label="关闭结果提示">×</button>`;
  bar.hidden = false;
  armSnack();
}
function installOutcome() {
  const log = $("lifeLog");
  if (!log) return;
  let last = null;
  new MutationObserver(() => {
    const li = log.querySelector(".life-log-list li:last-child");
    const key = entryKey(li);
    if (last === null) { last = key; return; } // 第一次渲染只记基线
    if (!li || key === last) return;
    last = key;
    li.classList.add("just-now");
    if (document.body.dataset.screen === "activities" && !log.hidden && !inView(log, 40)) showSnack(li);
  }).observe(log, { childList: true });
  window.addEventListener("hashchange", hideSnack);
}

// ---------- 3. 状态条变化标记 ----------
// 哪个方向是好事：饥饿升高是坏事，屋顶升高是好事，活动格和负重只是提示。
const GOOD_WHEN = { 饥饿: -1, 屋顶: 1, 今天: 0, 负重: 0 };
export function readHud(root) {
  const out = {};
  for (const item of root.querySelectorAll(".hud-item")) {
    const label = item.querySelector(".hud-label")?.firstChild?.textContent?.trim().replace(/漏$/, "") || "";
    const n = parseFloat((item.querySelector("b")?.textContent || "").replace(/^[^\d-]*/, ""));
    if (label && Number.isFinite(n)) out[label] = n;
  }
  return out;
}
export function hudDeltas(before, after) {
  const out = [];
  for (const [label, value] of Object.entries(after)) {
    if (!(label in before)) continue;
    const d = Math.round((value - before[label]) * 10) / 10;
    if (!d) continue;
    const dir = GOOD_WHEN[label] ?? 0;
    out.push({ label, delta: d, tone: dir === 0 ? "neutral" : Math.sign(d) === dir ? "good" : "bad" });
  }
  return out;
}
function installHudDelta() {
  const box = $("sceneSummary");
  if (!box) return;
  let previous = null;
  new MutationObserver(() => {
    const now = readHud(box);
    if (previous) {
      for (const d of hudDeltas(previous, now)) {
        const item = [...box.querySelectorAll(".hud-item")].find((i) => i.querySelector(".hud-label")?.firstChild?.textContent?.trim().replace(/漏$/, "") === d.label);
        if (!item) continue;
        item.classList.add("hud-changed", `hud-${d.tone}`);
        item.querySelector(".hud-label")?.insertAdjacentHTML("beforeend", `<em class="hud-delta">${d.delta > 0 ? "+" : "−"}${Math.abs(d.delta)}</em>`);
      }
    }
    previous = now;
  }).observe(box, { childList: true });
}

// ---------- 4. 故事页 ----------
export function splitOffers(cards) {
  const now = [], later = [];
  for (const card of cards) (card.querySelector(".story-button:disabled") ? later : now).push(card);
  return { now, later };
}
function enhanceStories(screen) {
  if (screen.querySelector(".story-overview")) return;
  const quests = screen.querySelector(".story-quests");
  if (quests) {
    const { now, later } = splitOffers([...quests.querySelectorAll(":scope > .story-card.is-offer")]);
    for (const card of now) card.querySelector(".story-button")?.classList.add("is-primary");
    if (later.length) {
      const fold = document.createElement("details");
      fold.className = "story-later";
      fold.innerHTML = `<summary>还没到时候的事（${later.length}）<small>条件够了会自动移上来</small></summary>`;
      fold.append(...later);
      const done = quests.querySelector(":scope > details:not(.story-later)");
      quests.insertBefore(fold, done || null);
    }
    const offerHead = [...quests.querySelectorAll(":scope > h3")].find((h) => h.textContent.startsWith("可以接下的事"));
    if (offerHead && !now.length) offerHead.insertAdjacentHTML("afterend", '<p class="story-none">眼下没有能马上接的事。</p>');
  }
  const targets = [
    [".story-incident", "突发"], [".story-festival", "节日"], [".story-events", "限时活动"], [".story-dialogues", "身边的人"],
    [".story-people", "村里的人"], [".story-quests", "要办的事"], [".story-achievements", "成就"],
  ].filter(([sel]) => screen.querySelector(`:scope > ${sel}`));
  if (targets.length < 3) return;
  const active = quests ? quests.querySelectorAll(":scope > .story-card:not(.is-offer):not(.is-done)").length : 0;
  const ready = quests ? quests.querySelectorAll(":scope > .story-card.is-offer").length : 0;
  const nav = document.createElement("nav");
  nav.className = "story-overview";
  nav.setAttribute("aria-label", "故事页分区");
  nav.innerHTML = targets.map(([sel, name]) => {
    const extra = sel === ".story-quests" ? `<b>${active} 在办 · ${ready} 可接</b>` : sel === ".story-achievements" ? `<b>${esc(screen.querySelector(".story-achievements h3 small")?.textContent || "")}</b>` : "";
    return `<button type="button" data-story-jump="${sel}">${name}${extra}</button>`;
  }).join("");
  nav.addEventListener("click", (e) => {
    const b = e.target.closest("[data-story-jump]");
    if (b) screen.querySelector(`:scope > ${b.dataset.storyJump}`)?.scrollIntoView({ block: "start" });
  });
  screen.prepend(nav);
}
function installStories() {
  const screen = $("screen-stories");
  if (!screen) return;
  new MutationObserver(() => enhanceStories(screen)).observe(screen, { childList: true });
  enhanceStories(screen);
}

// ---------- 5. 行囊空位 ----------
export function freeSlots(meterText) {
  const m = String(meterText || "").match(/(\d+)\s*\/\s*(\d+)/);
  return m ? Math.max(0, Number(m[2]) - Number(m[1])) : 0;
}
function enhanceBag(screen) {
  const items = screen.querySelector(".portable-items");
  if (!items || items.querySelector(".bag-slot-free")) return;
  const meter = [...screen.querySelectorAll(".bag-meter")].find((m) => m.firstElementChild?.textContent === "随身");
  const free = freeSlots(meter?.querySelector("b")?.textContent);
  if (!free || !items.querySelector(".portable-item")) return;
  items.insertAdjacentHTML("beforeend", Array.from({ length: free }, () => '<span class="bag-slot-free" aria-hidden="true">空位</span>').join(""));
  items.setAttribute("aria-description", `还能再拿 ${free} 件`);
}
function installBag() {
  const screen = $("screen-works");
  if (!screen) return;
  new MutationObserver(() => enhanceBag(screen)).observe(screen, { childList: true, subtree: true });
  enhanceBag(screen);
}

export function installSceneUx() {
  if (!document.querySelector('link[href="/scene-ux.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = "/scene-ux.css";
    document.head.append(link);
  }
  installQuickMenu();
  installOutcome();
  installHudDelta();
  const ready = () => ($("screen-stories") && $("screen-works") ? (installStories(), installBag()) : requestAnimationFrame(ready));
  ready();
}
if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installSceneUx, { once: true });
  else installSceneUx();
}
