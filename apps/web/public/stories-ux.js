/**
 * 「故事与约定」页体验（2026-10-24 午场）。只做表现层，不发游戏动作。
 *  1. 每次状态刷新整页重画，会把用户展开的「交情怎么涨」「办完的事」收回去 → 记住展开状态，重画后还原。
 *  2. 故事按钮点击后立刻显示「处理中…」并防连点，状态回来后自然恢复。
 *  3. 成就分类小标题补「已得/共有」；桌面成就与村民列表两列。
 * （页首跳转条 scene-ux 已有，本文件不重复。）样式在 stories-ux.css（本文件自己挂上）。
 */
export function detailKey(summaryText) { return String(summaryText ?? "").replace(/\s+/g, " ").replace(/（.*$/, "").trim().slice(0, 24); }

if (typeof document !== "undefined") {
  const link = document.createElement("link"); link.rel = "stylesheet"; link.href = "/stories-ux.css"; document.head.append(link);
  const opened = new Set();
  let busy = false;
  const enhance = () => {
    const screen = document.getElementById("screen-stories");
    if (!screen || busy || !screen.firstElementChild || screen.querySelector(".story-empty")) return;
    busy = true;
    try {
      screen.querySelectorAll("details").forEach((d) => { if (opened.has(detailKey(d.querySelector("summary")?.textContent))) d.open = true; });
      screen.querySelectorAll(".story-achievements h4").forEach((h) => {
        const ul = h.nextElementSibling;
        if (!ul || !ul.matches(".story-badges") || h.querySelector(".su-count")) return;
        const c = document.createElement("small"); c.className = "su-count"; c.textContent = ` ${ul.querySelectorAll(".is-unlocked").length}/${ul.children.length}`; h.append(c);
      });
    } finally { busy = false; }
  };
  const start = () => {
    const screen = document.body;
    let q = 0;
    new MutationObserver(() => { if (!busy && !q) q = requestAnimationFrame(() => { q = 0; enhance(); }); }).observe(screen, { childList: true, subtree: true });
    screen.addEventListener("click", (e) => {
      if (!e.target.closest("#screen-stories")) return;
      const sum = e.target.closest("summary");
      if (sum && sum.parentElement.tagName === "DETAILS") {
        const d = sum.parentElement, k = detailKey(sum.textContent);
        if (d.open) opened.delete(k); else opened.add(k);
        return;
      }
      const b = e.target.closest(".story-button");
      if (b && !b.disabled) {
        b.dataset.suLabel = b.textContent; b.textContent = "处理中…"; b.disabled = true; b.setAttribute("aria-busy", "true");
        setTimeout(() => { if (b.isConnected && b.dataset.suLabel) { b.textContent = b.dataset.suLabel; b.disabled = false; b.removeAttribute("aria-busy"); } }, 2500);
      }
    }, true);
    enhance();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
}
