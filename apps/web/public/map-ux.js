/*
 * 地图与地点页（map-ux）：六张地图资料卡高度雷同、整页很长。这里只改表现，不改规则：
 *  1. 页首加一条摘要（几套地图资料、合计区域与地点）和跳转小标签，点一下滚到那张卡；
 *  2. 每张卡都重复的「地形与连接已有定义……」只在第一张完整写，其余只留各自特有的一句；
 *  3. 「查看事件点 / 查看区域」两个折叠并排（桌面两列），整页桌面两列；
 *  4. 折叠展开时给摘要补 aria-expanded 读屏状态，跳转后目标卡短暂高亮。
 * 地图页是 shell.js 异步写入的，所以挂在 body 上观察。
 */
if (typeof document !== "undefined" && !document.querySelector('link[href="/map-ux.css"]')) {
  const link = document.createElement("link");
  link.rel = "stylesheet"; link.href = "/map-ux.css";
  document.head.appendChild(link);
}
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (s) => Number((String(s).match(/\d+/) ?? [0])[0]);

/** 各卡共有的开头句：只在第一张卡里完整保留。 */
export const SHARED_LIMIT = "地形与连接已有定义；居民、房屋内部、可交互物体和衣物尚未随地图包填充。";

/** 去掉共有句，只留各卡特有的部分；没有则返回空串。 */
export function uniqueLimit(text) {
  return String(text ?? "").replace(SHARED_LIMIT, "").trim();
}

/** 把若干卡的数字合计。 */
export function totals(packs) {
  return packs.reduce((t, p) => ({ regions: t.regions + p.regions, locations: t.locations + p.locations, edges: t.edges + p.edges }),
    { regions: 0, locations: 0, edges: 0 });
}

export function summaryMarkup(packs) {
  const t = totals(packs);
  const chips = packs.length > 1
    ? `<nav class="mux-jump" aria-label="跳到某套地图资料">${packs.map((p, i) => `<button type="button" data-mux-jump="${i}">${esc(p.label)}</button>`).join("")}</nav>` : "";
  return `<section class="mux-summary" aria-label="地图资料概览"><p><strong>${packs.length}</strong> 套地图资料 · 共 <strong>${t.regions}</strong> 个区域 · <strong>${t.locations}</strong> 个地点 · <strong>${t.edges}</strong> 条连接</p>${chips}</section>`;
}

export function enhance(screen) {
  if (!screen || screen.dataset.mux) return;
  const intro = screen.querySelector(".catalog-intro");
  const cards = [...screen.querySelectorAll(".map-pack")];
  if (!intro || !cards.length) return;
  screen.dataset.mux = "1";
  const packs = cards.map((c) => {
    const counts = [...c.querySelectorAll(".map-counts span")].map((s) => num(s.textContent));
    return { label: c.querySelector("h2")?.textContent.trim() ?? "", regions: counts[0] ?? 0, locations: counts[1] ?? 0, edges: counts[2] ?? 0 };
  });
  intro.insertAdjacentHTML("afterend", summaryMarkup(packs));
  cards.forEach((c, i) => {
    c.id = c.id || `mux-pack-${i}`;
    const limit = c.querySelector(".map-limit");
    if (limit && i > 0) {
      const rest = uniqueLimit(limit.textContent);
      if (rest) limit.textContent = rest; else limit.remove();
    }
    const folds = [...c.querySelectorAll(":scope > details.region-fold")];
    if (folds.length) {
      const row = document.createElement("div"); row.className = "mux-folds";
      folds[0].before(row); folds.forEach((f) => row.appendChild(f));
    }
  });
  screen.addEventListener("click", (e) => {
    const b = e.target.closest?.("[data-mux-jump]");
    if (!b) return;
    const target = cards[Number(b.dataset.muxJump)];
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.classList.add("is-flash"); setTimeout(() => target.classList.remove("is-flash"), 1400);
  });
  screen.addEventListener("toggle", (e) => {
    const s = e.target?.querySelector?.(":scope > summary");
    if (s) s.setAttribute("aria-expanded", String(e.target.open));
  }, true);
}

if (typeof document !== "undefined") {
  const run = () => { const s = document.querySelector("#screen-map"); if (s) enhance(s); };
  new MutationObserver(run).observe(document.body, { childList: true, subtree: true });
  run();
}
