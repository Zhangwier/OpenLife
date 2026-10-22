/**
 * 每日 UI 优化 2026-10-22 早场 · 题目二：新手引导界面
 *
 * ui-polish.js 的「三步看懂这一页」只有一张卡和一个虚线框：点「指给我看」后页面跳走，
 * 说明文字留在页顶的卡里，看不到；手机上这张卡一张就占满第一屏。这里接管两件事：
 *  1. 导览：点「指给我看」打开一个跟着目标走的说明气泡（第几步 / 共几步、标题、说明、
 *     上一步 / 下一步 / 结束），目标外整页压暗（一块固定定位的聚光框，不改目标自身的层级）；
 *     Esc 结束，← → 翻步；最后一步「完成」= 原来的「知道了」，以后不再出现。
 *     手机上气泡贴在底栏上方，目标滚到气泡上面。纯文字模式没有动画，全靠位置和压暗。
 *  2. 卡片：手机上三步只留标题（说明进气泡里看），卡片从一整屏缩到四分之一屏。
 * 记忆键仍是 ui-polish.js 的 openlife-coach-dismissed，菜单「新手引导」照旧能重开。
 */
// @ts-check
import { COACH_STEPS } from "./ui-polish.js";

const TIP_W = 340;
const GAP = 12;

/**
 * 气泡放哪：桌面放目标下方，下方放不下就放上方，再放不下就贴视口底；
 * 手机（≤600 宽）一律贴底，留出底栏。纯函数，单测直接测。
 * @param {{top:number,left:number,width:number,height:number}} rect 目标在视口里的位置
 * @param {{width:number,height:number}} view 视口
 * @param {{width?:number,height:number}} tip 气泡尺寸
 * @param {{phone?:boolean,navH?:number}} [opt]
 */
export function placeTip(rect, view, tip, opt = {}) {
  const phone = opt.phone ?? view.width <= 600;
  if (phone) {
    const w = Math.min(view.width - 16, 560);
    return { side: "dock", left: Math.round((view.width - w) / 2), top: Math.round(view.height - (opt.navH ?? 0) - tip.height - 8), width: w };
  }
  const w = Math.min(tip.width ?? TIP_W, view.width - 2 * GAP);
  const left = Math.round(Math.max(GAP, Math.min(rect.left, view.width - w - GAP)));
  const below = rect.top + rect.height + GAP;
  if (below + tip.height <= view.height - GAP) return { side: "below", left, top: Math.round(below), width: w };
  const above = rect.top - GAP - tip.height;
  if (above >= GAP) return { side: "above", left, top: Math.round(above), width: w };
  return { side: "dock", left, top: Math.round(view.height - tip.height - GAP), width: w };
}

/** 第 i 步的按钮文字和进度。 */
export function stepLabels(i, total) {
  return {
    count: `第 ${i + 1} 步 / 共 ${total} 步`,
    prev: i > 0 ? "上一步" : "",
    next: i >= total - 1 ? "完成，开始生活" : "下一步",
  };
}

/** 跳过当前页面上看不到的目标（比如今天没有今日指引），返回下一个可见的步号；都看不到返回 -1。 */
export function nextVisible(from, dir, isVisible, total) {
  for (let i = from; i >= 0 && i < total; i += dir) if (isVisible(i)) return i;
  return -1;
}

if (typeof document !== "undefined") {
  if (!document.querySelector('link[href="/coach-ux.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = "/coach-ux.css";
    document.head.append(link);
  }
  const $ = (id) => document.getElementById(id);
  const isPhone = () => document.documentElement.classList.contains("is-phone") || matchMedia("(max-width: 600px)").matches;
  const targetOf = (i) => $(COACH_STEPS[i]?.target);
  const shown = (el) => !!el && !el.hidden && el.getClientRects().length > 0;
  let step = -1;
  /** @type {HTMLElement|null} */ let tip = null;
  /** @type {HTMLElement|null} */ let spot = null;
  /** @type {Element|null} */ let opener = null;

  const build = () => {
    spot = document.createElement("div");
    spot.className = "coach-spot"; spot.setAttribute("aria-hidden", "true");
    tip = document.createElement("section");
    tip.className = "coach-tip"; tip.id = "coachTip";
    tip.setAttribute("role", "dialog"); tip.setAttribute("aria-modal", "false"); tip.setAttribute("aria-labelledby", "coachTipTitle");
    tip.addEventListener("click", (e) => {
      const b = /** @type {HTMLElement} */ (e.target).closest("[data-coach-step]");
      if (!b) return;
      const what = b.getAttribute("data-coach-step");
      if (what === "next") go(step + 1, 1);
      else if (what === "prev") go(step - 1, -1);
      else end(false);
    });
    document.body.append(spot, tip);
  };

  const position = () => {
    const el = targetOf(step);
    if (!tip || !spot || !el) return;
    const r = el.getBoundingClientRect();
    const pad = 6;
    Object.assign(spot.style, { top: `${r.top - pad}px`, left: `${r.left - pad}px`, width: `${r.width + 2 * pad}px`, height: `${r.height + 2 * pad}px` });
    const nav = isPhone() ? $("appNavigation") : null;
    const navH = nav && getComputedStyle(nav).position === "fixed" ? nav.getBoundingClientRect().height : 0;
    const p = placeTip(r, { width: innerWidth, height: innerHeight }, { width: TIP_W, height: tip.offsetHeight || 160 }, { phone: isPhone(), navH });
    tip.dataset.side = p.side;
    Object.assign(tip.style, { top: `${Math.max(8, p.top)}px`, left: `${p.left}px`, width: `${p.width}px` });
  };

  const render = () => {
    if (!tip) build();
    const s = COACH_STEPS[step];
    const L = stepLabels(step, COACH_STEPS.length);
    const dots = COACH_STEPS.map((_, i) => `<i class="${i === step ? "on" : i < step ? "done" : ""}"></i>`).join("");
    /** @type {HTMLElement} */ (tip).innerHTML = `<header><span class="coach-tip-count">${L.count}</span><span class="coach-dots" aria-hidden="true">${dots}</span></header>
      <h3 id="coachTipTitle">${s.title}</h3><p>${s.text}</p>
      <div class="coach-tip-actions">
        <button type="button" class="coach-tip-end" data-coach-step="end">结束引导</button>
        <span></span>
        ${L.prev ? `<button type="button" class="coach-tip-prev" data-coach-step="prev">${L.prev}</button>` : ""}
        <button type="button" class="coach-tip-next" data-coach-step="next">${L.next}</button>
      </div>`;
    document.querySelectorAll(".coach-target").forEach((el) => el.classList.remove("coach-target"));
    const el = targetOf(step);
    el?.classList.add("coach-target");
    document.documentElement.classList.add("coach-touring");
    // 手机：目标滚到气泡上方；桌面：目标放到上三分之一，气泡在它下面。
    if (el) {
      const r = el.getBoundingClientRect();
      const room = isPhone() ? innerHeight * 0.18 : innerHeight * 0.16;
      scrollBy({ top: r.top - room, behavior: "auto" });
    }
    position();
    /** @type {HTMLElement|null} */ (tip?.querySelector(".coach-tip-next"))?.focus({ preventScroll: true });
  };

  const go = (to, dir) => {
    if (to >= COACH_STEPS.length) { end(true); return; }
    const i = nextVisible(Math.max(0, to), dir || 1, (k) => shown(targetOf(k)), COACH_STEPS.length);
    if (i < 0) { if (dir > 0) end(true); return; }
    step = i;
    render();
  };

  const end = (finished) => {
    step = -1;
    tip?.remove(); spot?.remove(); tip = spot = null;
    document.documentElement.classList.remove("coach-touring");
    document.querySelectorAll(".coach-target").forEach((el) => el.classList.remove("coach-target"));
    const card = $("coachCard");
    // 「完成」等于原来的「知道了」：交给 ui-polish.js 记住并收起卡片。
    if (finished) { /** @type {HTMLElement|null} */ (card?.querySelector(".coach-done"))?.click(); }
    else {
      card?.scrollIntoView({ block: "start" });
      /** @type {HTMLElement|null} */ (opener instanceof HTMLElement ? opener : null)?.focus({ preventScroll: true });
    }
  };

  // 在捕获阶段接管「指给我看」，ui-polish.js 原来的虚线框逻辑就不再跑。
  document.addEventListener("click", (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest?.("#coachCard .coach-next");
    if (!b) return;
    e.stopImmediatePropagation(); e.preventDefault();
    opener = b;
    go(0, 1);
  }, true);
  // 卡片被关掉（×、知道了）或离开此刻页时，导览一并结束。
  document.addEventListener("click", (e) => {
    if (step >= 0 && /** @type {HTMLElement} */ (e.target).closest?.("#coachCard .coach-done, #coachCard .coach-close")) end(false);
  });
  new MutationObserver(() => { if (step >= 0 && document.body.dataset.screen !== "activities") end(false); })
    .observe(document.body, { attributes: true, attributeFilter: ["data-screen"] });
  document.addEventListener("keydown", (e) => {
    if (step < 0) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); end(false); }
    else if (e.key === "ArrowRight") { e.preventDefault(); go(step + 1, 1); }
    else if (e.key === "ArrowLeft" && step > 0) { e.preventDefault(); go(step - 1, -1); }
  }, true);
  addEventListener("resize", () => { if (step >= 0) position(); });
  addEventListener("scroll", () => { if (step >= 0) position(); }, { passive: true });

  // 手机卡片：三步只留标题，说明交给气泡；给卡片加一句提示。
  const tidyCard = () => {
    const card = $("coachCard");
    if (!card || card.dataset.coachUx) return;
    card.dataset.coachUx = "1";
    const h = card.querySelector("h3");
    if (h && !card.querySelector(".coach-lede")) {
      const p = document.createElement("p");
      p.className = "coach-lede";
      p.textContent = "点「指给我看」，一步一步框出来讲；随时按 Esc 或「结束引导」退出。";
      h.after(p);
    }
  };
  const mo = new MutationObserver(() => { tidyCard(); if ($("coachCard")?.dataset.coachUx) mo.disconnect(); });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  tidyCard();
}
