/**
 * 每日 UI 优化 2026-10-22 午场 · 题目一：手机「资料页」切换条（移动端 / 小屏适配）。
 *
 * 手机上底栏只有「此刻 / 行囊 / 熟人 / 人生」四个入口，故事、家族谱、地图、时代、记忆、图鉴
 * 这六个资料页只能从 ☰ 菜单进去；进去以后页面里没有任何“回去”或“看下一页”的入口，
 * 底栏的高亮还会落在不相干的地方（地图页亮「此刻」，故事页一个都不亮）。
 *
 * 这里只补表现层：
 *  1. 资料页标题下加一条横向切换条：‹ 此刻 + 六个资料页，当前页高亮（aria-current），
 *     粘在顶栏下面，翻到页面底部也随手可切；当前页自动滚进可见区。
 *  2. 切换条内 ← → / Home / End 移动焦点，Enter 打开。
 *  3. 手机底栏：六个资料页统一高亮「人生」（与菜单里“回头看看”的分组一致）。
 * 点下去仍是带 data-route 的按钮，跳转由 shell.js 原有的点击处理完成；桌面侧栏不受影响。
 * 样式在 refnav-ux.css（本文件自己挂上）。
 */
export const REF_ROUTES = [
  ["stories", "故事"],
  ["family", "家族谱"],
  ["map", "地图"],
  ["world", "时代"],
  ["history", "记忆"],
  ["codex", "图鉴"],
];
export const BACK_ROUTE = "activities";
/** 手机底栏上资料页统一归到的入口。 */
export const REF_HOME = "character";

/** 当前页是资料页时返回切换条要画的条目，否则返回 null。 */
export function refNavModel(route) {
  if (!REF_ROUTES.some(([r]) => r === route)) return null;
  return [
    { route: BACK_ROUTE, label: "此刻", back: true, current: false },
    ...REF_ROUTES.map(([r, label]) => ({ route: r, label, back: false, current: r === route })),
  ];
}

/** 手机底栏该高亮哪个入口：资料页一律归「人生」，其余保持原样（返回 null 表示不干预）。 */
export function phoneNavRoute(route) {
  return refNavModel(route) ? REF_HOME : null;
}

/**
 * 当前那一格要看得见：已经整格可见就不动（保住最前面的「‹ 此刻」），
 * 否则只滚到刚好露出它（留 pad 边距），且不越过两端。
 */
export function chipScrollLeft(chipLeft, chipWidth, stripWidth, scrollWidth, current = 0, pad = 12) {
  const max = Math.max(0, scrollWidth - stripWidth);
  let want = current;
  if (chipLeft - pad < current) want = chipLeft - pad;
  else if (chipLeft + chipWidth + pad > current + stripWidth) want = chipLeft + chipWidth + pad - stripWidth;
  return Math.round(Math.min(max, Math.max(0, want)));
}

/** 键盘在切换条里移动：返回新的下标。 */
export function nextIndex(key, index, count) {
  if (key === "ArrowRight") return (index + 1) % count;
  if (key === "ArrowLeft") return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return index;
}

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isPhone = () => {
  const nav = document.getElementById("appNavigation");
  return document.documentElement.classList.contains("is-phone") || (!!nav && getComputedStyle(nav).position === "fixed");
};

function ensureStrip() {
  let strip = document.getElementById("refNav");
  if (strip) return strip;
  const heading = document.querySelector(".page-container .page-heading");
  if (!heading) return null;
  strip = document.createElement("nav");
  strip.id = "refNav";
  strip.className = "ref-nav";
  strip.setAttribute("aria-label", "资料页切换");
  strip.hidden = true;
  heading.after(strip);
  strip.addEventListener("keydown", (event) => {
    const buttons = [...strip.querySelectorAll("button")];
    const i = buttons.indexOf(document.activeElement);
    if (i < 0) return;
    const j = nextIndex(event.key, i, buttons.length);
    if (j === i) return;
    event.preventDefault();
    buttons[j].focus();
  });
  return strip;
}

function render() {
  const route = document.body.dataset.screen || "";
  const model = refNavModel(route);
  const strip = ensureStrip();
  const phone = isPhone();
  document.body.classList.toggle("has-ref-nav", !!(model && phone));
  if (strip) {
    if (!model || !phone) {
      strip.hidden = true;
    } else {
      const key = model.map((m) => m.route + (m.current ? "*" : "")).join(",");
      if (strip.dataset.key !== key) {
        strip.dataset.key = key;
        strip.innerHTML = `<div class="ref-nav-track">${model.map((m) =>
          `<button type="button" data-route="${esc(m.route)}" class="ref-chip${m.back ? " ref-back" : ""}${m.current ? " is-current" : ""}"${m.current ? ' aria-current="page"' : ""}>${m.back ? '<span aria-hidden="true">‹ </span>' : ""}${esc(m.label)}</button>`).join("")}</div>`;
      }
      strip.hidden = false;
      const top = document.querySelector(".topbar")?.getBoundingClientRect().height || 56;
      strip.style.setProperty("--ref-nav-top", `${Math.round(top)}px`);
      const track = strip.querySelector(".ref-nav-track");
      const cur = strip.querySelector(".is-current");
      if (track && cur) track.scrollLeft = chipScrollLeft(cur.offsetLeft - track.offsetLeft, cur.offsetWidth, track.clientWidth, track.scrollWidth, track.scrollLeft);
    }
  }
  // 手机底栏高亮：资料页统一亮「人生」。
  const want = phone ? phoneNavRoute(route) : null;
  if (want) {
    for (const b of document.querySelectorAll("#appNavigation > [data-route]")) {
      const on = b.dataset.route === want;
      b.classList.toggle("selected", on);
      b.classList.toggle("ref-parent", on);
      if (on) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
    }
  } else {
    for (const b of document.querySelectorAll("#appNavigation > .ref-parent")) {
      b.classList.remove("ref-parent");
      if (b.dataset.route !== route) { b.classList.remove("selected"); b.removeAttribute("aria-current"); }
    }
  }
}

export function installRefNav() {
  if (!document.querySelector('link[href="/refnav-ux.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = "/refnav-ux.css";
    document.head.append(link);
  }
  // shell.js 先改 data-screen 再改高亮，这里排在它之后再补一层。
  new MutationObserver(() => queueMicrotask(render)).observe(document.body, { attributes: true, attributeFilter: ["data-screen"] });
  new MutationObserver(() => queueMicrotask(render)).observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-layout"] });
  addEventListener("resize", render);
  render();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installRefNav, { once: true });
  else installRefNav();
}
