/**
 * 每日合并场 2026-10-23：「人生」页「这一生」人物卡。只做表现层，按 id/类名增强已渲染的 DOM，不改规则。
 *  1. 人生线：右端「未知」改成「往后的日子」，整条线补读屏说明（此刻 n 岁）。
 *  2. 出身卡：天赋列表前加小标「随出身带来的天赋」，「心里的念想：」改成小标签 + 句子。
 *  3. 五个状态词：「尚未……」这类还空着的，标成淡色并在前面补一个短横，一眼分清已有的和还空着的。
 *  4. 整张卡给读屏一个名字。
 * 全部幂等：重新渲染后 MutationObserver 再补一次，已经补过的不会重复。
 */
const EMPTY_RE = /^(尚未|还没|暂无|没有)/;

/** 状态词是不是「还空着」。 */
export function isEmptyWord(text) { return EMPTY_RE.test(String(text ?? "").trim()); }

/** 「心里的念想：xxx」拆成标签和句子；不是这个格式返回 null。 */
export function splitWish(text) {
  const m = /^\s*心里的念想[：:]\s*(.+)$/s.exec(String(text ?? ""));
  return m ? { label: "念想", body: m[1].trim() } : null;
}

/** 人生线的读屏说明。 */
export function lifeLineLabel(nowText) {
  const t = String(nowText ?? "").replace(/\s+/g, " ").trim();
  return t ? `人生进度：${t}，往后的日子还没写下` : "人生进度";
}

if (typeof document !== "undefined") {
  if (!document.querySelector('link[href="/character-ux.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = "/character-ux.css";
    document.head.appendChild(link);
  }
  const enhance = () => {
    const rail = document.querySelector("#screen-character .life-rail");
    if (!rail) return;
    if (rail.getAttribute("aria-label") !== "这一生") { rail.setAttribute("role", "region"); rail.setAttribute("aria-label", "这一生"); }
    const ll = rail.querySelector(".life-line");
    if (ll) {
      const spans = ll.querySelectorAll(".life-line-labels span");
      const last = spans[spans.length - 1];
      if (last && last.textContent.trim() === "未知") last.textContent = "往后的日子";
      const label = lifeLineLabel(ll.querySelector(".life-now")?.textContent);
      if (ll.getAttribute("aria-label") !== label) { ll.setAttribute("role", "img"); ll.setAttribute("aria-label", label); }
    }
    const talents = rail.querySelector(".origin-talents");
    if (talents && !rail.querySelector(".cx-sub")) {
      const h = document.createElement("div");
      h.className = "cx-sub"; h.textContent = "随出身带来的天赋";
      talents.before(h);
    }
    const wish = rail.querySelector(".origin-wish");
    if (wish && !wish.querySelector(".cx-tag")) {
      const w = splitWish(wish.textContent);
      if (w) { wish.textContent = ""; const t = document.createElement("span"); t.className = "cx-tag"; t.textContent = w.label; wish.append(t, document.createTextNode(w.body)); }
    }
    for (const s of rail.querySelectorAll(".soft-stats strong")) {
      const on = isEmptyWord(s.textContent);
      if (s.classList.contains("cx-empty") !== on) s.classList.toggle("cx-empty", on);
    }
  };
  let queued = false;
  const schedule = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; enhance(); }); };
  const start = () => { enhance(); new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true }); };
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
}
