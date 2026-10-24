/**
 * 界面交互第三轮（2026-10-20）：二级页面、错误提示、深色与大屏。只做表现层，不发游戏动作。
 *  1. 错误与断线：纯文字模式下被拒绝或失败的动作原本完全看不见 → 弹出「没做成」提示条；
 *     本地服务连不上时，英文报错改成中文，并在顶部常驻「连不上」横幅，能一键重连，恢复后自己消失。
 *  2. 导航定位：进入「更多资料」里的页面时，展开分组并只高亮当前页，不再错高亮「人物」。
 *  3. 记忆与历史：同一年的事只写一次年份；「仍留在这个世界里」这句默认说明不再每条重复。
 *  4. 模块管理：加搜索；已加载分组里不再每张卡重复「当前世界已加载」。
 *  5. 家族谱：只有自己一个人时，补一张「家族怎样延续」的说明，指向能做的下一步。
 *  6. 大屏（≥1600px）：生活页右侧加一条粘性栏，人生纪事和心里记着的事放进去，主列不用再上下翻找。
 * 样式在 pages-ux.css（本文件自己挂上）。
 */
import "./stories-ux.js";
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- 1. 错误与断线 ----------
export const OFFLINE_TEXT = "连不上本地世界服务，这一步没有生效。";
export function friendlyError(message) {
  const m = String(message || "");
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(m)) return OFFLINE_TEXT;
  return m;
}
function offlineBanner(show) {
  let bar = $("offlineBanner");
  const root = document.documentElement;
  if (!show) { if (bar) bar.hidden = true; root.style.removeProperty("--offline-h"); return; }
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "offlineBanner";
    bar.className = "offline-banner";
    bar.setAttribute("role", "alert");
    bar.innerHTML = `<span><b>连不上本地世界服务</b>可能是服务停了或网络断了。已做的事都存在服务里，重新连上后接着玩。</span><button type="button" data-reconnect>重新连接</button>`;
    bar.querySelector("[data-reconnect]").addEventListener("click", async (e) => {
      const btn = e.currentTarget; btn.disabled = true; btn.textContent = "正在连接…";
      try { const r = await fetch("/api/state", { cache: "no-store" }); if (r.ok) { location.reload(); return; } } catch { /* 还连不上 */ }
      btn.disabled = false; btn.textContent = "再试一次";
    });
    document.body.prepend(bar);
  }
  bar.hidden = false;
  // 横幅和顶栏都粘在顶部：顶栏往下让出横幅的高度，翻页时不会互相盖住。
  root.style.setProperty("--offline-h", `${bar.offsetHeight}px`);
}
function installFetchGuard() {
  if (window.__olFetchGuard) return;
  window.__olFetchGuard = true;
  const raw = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input?.url || "";
    const api = url.startsWith("/api/") || url.includes(`${location.host}/api/`);
    try {
      const res = await raw(input, init);
      if (api) offlineBanner(false);
      return res;
    } catch (error) {
      if (!api || error?.name === "AbortError") throw error;
      offlineBanner(true);
      throw new Error(friendlyError(error?.message));
    }
  };
}

let noticeTimer = 0;
function showNotice(text) {
  let bar = $("noticeBar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "noticeBar";
    bar.className = "notice-bar";
    bar.setAttribute("role", "alert");
    bar.addEventListener("click", (e) => { if (e.target.closest("[data-notice-close]")) bar.hidden = true; });
    bar.addEventListener("pointerenter", () => clearTimeout(noticeTimer));
    document.body.append(bar);
  }
  bar.innerHTML = `<div><small>没做成</small><p>${esc(text)}</p></div><button type="button" data-notice-close aria-label="关闭提示">知道了</button>`;
  bar.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { bar.hidden = true; }, 8000);
}
const lastLogKey = () => {
  const li = document.querySelector("#lifeLog .life-log-list li:last-child");
  return li ? li.textContent : "";
};
function installActionNotice() {
  const feedback = $("actionFeedback");
  if (!feedback) return;
  let before = null;
  new MutationObserver(() => {
    const busy = document.body.classList.contains("is-busy");
    if (busy && !before) before = { log: lastLogKey(), text: feedback.textContent };
    else if (!busy && before) {
      const snap = before; before = null;
      setTimeout(() => {
        // 只有当这句反馈被藏起来（纯文字模式）、而且纪事没多出一条时，才说明这一步没做成且玩家看不到。
        if (getComputedStyle(feedback).display !== "none") return;
        const text = feedback.textContent.trim();
        if (text && text !== snap.text && lastLogKey() === snap.log) showNotice(friendlyError(text));
      }, 80);
    }
  }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
}

// ---------- 2. 导航定位 ----------
const PRIMARY = ["activities", "works", "people", "stories", "character"];
function syncNav() {
  const nav = $("appNavigation");
  const more = nav?.querySelector(".nav-more");
  if (!nav || !more) return;
  const route = document.body.dataset.screen;
  const sub = more.querySelector(`[data-route="${CSS.escape(route || "")}"]`);
  // 手机上「更多资料」不显示，底栏仍用「人物」兜底高亮，保留原逻辑。
  if (!sub || getComputedStyle(more).display === "none") return;
  more.open = true;
  more.classList.add("has-current");
  for (const b of nav.querySelectorAll(":scope > [data-route]")) {
    if (PRIMARY.includes(b.dataset.route) && b.dataset.route !== route) { b.classList.remove("selected"); b.removeAttribute("aria-current"); }
  }
}
function installNav() {
  new MutationObserver(syncNav).observe(document.body, { attributes: true, attributeFilter: ["data-screen"] });
  syncNav();
}

// ---------- 3. 记忆与历史 ----------
export const DEFAULT_HISTORY_NOTE = "仍留在这个世界里";
function enhanceHistory(box) {
  let prev = "";
  for (const item of box.querySelectorAll(".history-item")) {
    const year = item.querySelector(".history-year")?.textContent.trim() || "";
    item.classList.toggle("same-year", year === prev);
    prev = year;
    const note = item.querySelector(".history-copy small");
    if (note && note.textContent.trim() === DEFAULT_HISTORY_NOTE) note.classList.add("is-default");
  }
}
function installHistory() {
  const box = $("historyStream");
  if (!box) return;
  new MutationObserver(() => enhanceHistory(box)).observe(box, { childList: true });
  enhanceHistory(box);
}

// ---------- 4. 模块管理 ----------
export function matchModule(text, query) {
  const q = String(query || "").trim().toLowerCase();
  return !q || q.split(/\s+/).every((w) => String(text).toLowerCase().includes(w));
}
function enhanceModules(screen) {
  if (!screen.querySelector(".module-card") || screen.querySelector(".module-search")) return;
  for (const badge of screen.querySelectorAll(".module-list:not(.module-fold .module-list) .module-status.loaded")) badge.classList.add("is-redundant");
  const cards = [...screen.querySelectorAll(".module-card")];
  const head = screen.querySelector(".module-group");
  const bar = document.createElement("div");
  bar.className = "module-search";
  bar.innerHTML = `<label><span class="visually-hidden">搜索模块</span><input type="search" placeholder="搜模块名称或说明，比如：陶、故事、时钟" autocomplete="off"></label><small aria-live="polite">共 ${cards.length} 个</small>`;
  head?.before(bar);
  const input = bar.querySelector("input"), count = bar.querySelector("small");
  const empty = document.createElement("p");
  empty.className = "module-none page-empty"; empty.hidden = true; empty.textContent = "没有找到对应的模块，换个词试试。";
  bar.after(empty);
  input.addEventListener("input", () => {
    let shown = 0;
    for (const card of cards) {
      const hit = matchModule(card.textContent, input.value);
      card.hidden = !hit; if (hit) shown++;
    }
    const fold = screen.querySelector(".module-fold");
    if (fold && input.value.trim() && fold.querySelector(".module-card:not([hidden])")) fold.open = true;
    for (const list of screen.querySelectorAll(".module-list")) list.classList.toggle("is-empty", !list.querySelector(".module-card:not([hidden])"));
    count.textContent = input.value.trim() ? `显示 ${shown} / ${cards.length}` : `共 ${cards.length} 个`;
    empty.hidden = shown > 0;
  });
}
function installModules() {
  const screen = $("screen-modules");
  // 各页面容器由 shell.js 在首次渲染时才创建，没出现就下一帧再找。
  if (!screen) { requestAnimationFrame(installModules); return; }
  new MutationObserver(() => enhanceModules(screen)).observe(screen, { childList: true });
  enhanceModules(screen);
}

// ---------- 5. 家族谱 ----------
function enhanceFamily() {
  const tree = $("familyTree");
  if (!tree) return;
  const card = tree.closest(".lineage-card");
  const solo = tree.querySelectorAll(".family-node").length <= 1;
  let tip = card?.querySelector(".family-next");
  if (!solo) { tip?.remove(); return; }
  if (!card || tip) return;
  tip = document.createElement("div");
  tip.className = "family-next";
  tip.innerHTML = `<p class="family-next-lead">家族从你这一代开始。现在：<b data-family-word>${esc($("familyWord")?.textContent || "尚未建立家庭")}</b></p>
    <ol><li><b>结成伴侣</b><span>在人际里和一个人走得足够近</span></li><li><b>生养孩子</b><span>孩子会出现在这张谱上</span></li>
    <li><b>交棒</b><span>家人成年后可以接过他的人生，作品与一段手艺留给下一代</span></li></ol>
    <button type="button" class="ghost-button" data-route="people">去看人际 →</button>`;
  tree.after(tip);
}
function installFamily() {
  const tree = $("familyTree");
  if (!tree) return;
  new MutationObserver(enhanceFamily).observe(tree, { childList: true });
  enhanceFamily();
  const word = $("familyWord");
  if (word) new MutationObserver(() => { const b = document.querySelector("[data-family-word]"); if (b) b.textContent = word.textContent; }).observe(word, { childList: true, characterData: true, subtree: true });
}

// ---------- 6. 大屏右栏 ----------
const WIDE = "(min-width: 1600px)";
function placeRail() {
  const layout = $("applicationLayout"), log = $("lifeLog"), hopes = $("hopes"), dock = $("interactionDock");
  if (!layout || !log || !hopes || !dock) return;
  let rail = $("wideRail");
  const wide = matchMedia(WIDE).matches && document.body.dataset.screen === "activities";
  if (wide) {
    if (!rail) { rail = document.createElement("aside"); rail.id = "wideRail"; rail.className = "wide-rail"; rail.setAttribute("aria-label", "人生纪事侧栏"); layout.append(rail); }
    if (log.parentElement !== rail) rail.append(log, hopes);
    document.body.classList.add("has-wide-rail");
  } else if (rail && log.parentElement === rail) {
    dock.before(log, hopes);
    document.body.classList.remove("has-wide-rail");
  } else document.body.classList.remove("has-wide-rail");
}
function installRail() {
  matchMedia(WIDE).addEventListener?.("change", placeRail);
  new MutationObserver(placeRail).observe(document.body, { attributes: true, attributeFilter: ["data-screen"] });
  placeRail();
}

export function installPagesUx() {
  if (!document.querySelector('link[href="/pages-ux.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = "/pages-ux.css";
    document.head.append(link);
  }
  installFetchGuard();
  installActionNotice();
  installNav();
  installHistory();
  installModules();
  installFamily();
  installRail();
}
if (typeof document !== "undefined") {
  if (typeof window !== "undefined" && window.fetch) { try { installFetchGuard(); } catch { /* 早装上，app.js 的第一次读取也能被接住 */ } }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installPagesUx, { once: true });
  else installPagesUx();
}
