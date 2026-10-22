/**
 * 每日 UI 优化 2026-10-22 午场 · 题目二：「地图与地点」页（视觉风格统一 + 页面布局）。
 *
 * 原来的地图页是一长串一样的大卡：每张都挂着开发用语「结构校验通过」，每张都重复同一句
 * “地形与连接已有定义；居民、房屋内部、可交互物体和衣物尚未随地图包填充。”，
 * 三个数字做成三颗药丸，两个折叠钮各占一整行；桌面上卡片一列排到底，手机要翻五六屏。
 *
 * 这里只在 shell.js 画完之后补一层（不改 shell.js，不发游戏动作）：
 *  1. 页首「当前位置」卡下加一行总览：几片地图 · 共几个地点 · 几处值得留意；
 *     那句共同的限制只在这里说一次（改成玩家听得懂的话）。
 *  2. 每张地图卡：「结构校验通过」不再显示，只有出问题时显示醒目的「资料需修复」；
 *     三颗药丸改成一行“数字 + 单位”的读数；重复的限制句删掉，卡片只留自己的话。
 *  3. 「查看事件点 / 查看区域」两个折叠钮并排成一行，展开的那个占满整行。
 *  4. 桌面（≥900px）地图卡两列排；手机一列但更紧凑。
 * 样式在 atlas-ux.css（本文件自己挂上）。
 */
export const SHARED_LIMIT = "地形与连接已有定义；居民、房屋内部、可交互物体和衣物尚未随地图包填充。";
export const SHARED_NOTE = "远处的地图目前只有地形和道路：那里的人、屋里的陈设和物件还没有填进来，所以暂时只能在这里翻看，不能前往。";

/** 「2 个区域」→ { n: 2, unit: "区域" }；读不出数字返回 null。 */
export function parseCount(text) {
  const m = String(text ?? "").trim().match(/^(\d+)\s*(?:个|条|处)?\s*(.+)$/);
  return m ? { n: Number(m[1]), unit: m[2].trim() } : null;
}

/** 去掉每张卡都重复的那句限制，只留这张卡自己的话。 */
export function ownLimitText(text) {
  return String(text ?? "").replace(SHARED_LIMIT, "").trim();
}

/** 页首总览：packs 是 [{ regions, places, points }]。 */
export function atlasSummary(packs) {
  const places = packs.reduce((s, p) => s + (p.places || 0), 0);
  const points = packs.reduce((s, p) => s + (p.points || 0), 0);
  return [`${packs.length} 片地图`, `共 ${places} 个地点`, points ? `${points} 处值得留意` : ""].filter(Boolean);
}

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function enhancePack(pack) {
  const info = { regions: 0, places: 0, points: 0 };
  const status = pack.querySelector(".module-status");
  if (status) {
    const ok = status.textContent.includes("通过");
    status.classList.toggle("atlas-status-ok", ok);
    status.classList.toggle("atlas-status-bad", !ok);
    if (ok) status.setAttribute("aria-hidden", "true");
  }
  const counts = pack.querySelector(".map-counts");
  if (counts && !counts.classList.contains("atlas-counts")) {
    counts.classList.add("atlas-counts");
    for (const span of counts.querySelectorAll(":scope > span")) {
      const c = parseCount(span.textContent);
      if (!c) continue;
      if (c.unit.includes("区域")) info.regions = c.n;
      else if (c.unit.includes("地点")) info.places = c.n;
      span.innerHTML = `<b>${c.n}</b> ${esc(c.unit)}`;
      span.dataset.n = String(c.n);
    }
  } else if (counts) {
    for (const span of counts.querySelectorAll(":scope > span")) {
      const n = Number(span.dataset.n || 0);
      if (span.textContent.includes("区域")) info.regions = n;
      else if (span.textContent.includes("地点")) info.places = n;
    }
  }
  const limit = pack.querySelector(".map-limit");
  if (limit) {
    const own = ownLimitText(limit.textContent);
    if (own !== limit.textContent.trim()) limit.textContent = own;
    limit.hidden = !own;
  }
  const event = pack.querySelector(".event-fold > summary");
  const em = event?.textContent.match(/(\d+)/);
  if (em) info.points = Number(em[1]);
  // 两个折叠钮并排：把卡片里直属的 details 收进一个网格
  const folds = [...pack.querySelectorAll(":scope > details.region-fold")];
  if (folds.length && !pack.querySelector(":scope > .atlas-folds")) {
    const row = document.createElement("div");
    row.className = "atlas-folds";
    row.dataset.count = String(folds.length);
    folds[0].before(row);
    row.append(...folds);
  }
  // 卡片里那句「这片地图记有 n 处…」与折叠钮重复时也不再单列
  if (limit && info.points && /^这片地图记有 \d+ 处值得留意的地方。$/.test(limit.textContent.trim())) limit.hidden = true;
  return info;
}

function enhance(screen) {
  const packs = [...screen.querySelectorAll(":scope > .map-pack")];
  if (!packs.length) { screen.classList.remove("atlas"); return; }
  screen.classList.add("atlas");
  const infos = packs.map(enhancePack);
  const intro = screen.querySelector(":scope > .catalog-intro");
  if (intro) {
    const p = intro.querySelector(":scope > p");
    if (p && !p.dataset.atlas) { p.dataset.atlas = "1"; p.textContent = "你所在的聚落可以在「此刻」里真实走动、进屋、拿取和使用东西。下面是这个世界已经记下的更远的地方。"; }
    let line = intro.querySelector(".atlas-summary");
    if (!line) { line = document.createElement("div"); line.className = "atlas-summary"; intro.append(line); }
    const html = atlasSummary(infos).map((t) => `<span>${esc(t)}</span>`).join("");
    if (line.innerHTML !== html) line.innerHTML = html;
    let note = intro.querySelector(".atlas-note");
    if (!note) { note = document.createElement("p"); note.className = "atlas-note"; note.textContent = SHARED_NOTE; intro.append(note); }
  }
}

export function installAtlas() {
  if (!document.querySelector('link[href="/atlas-ux.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = "/atlas-ux.css";
    document.head.append(link);
  }
  const screen = document.getElementById("screen-map");
  if (!screen) {
    // 页面容器由 app.js 稍后建好，建好了再接上。
    const host = document.getElementById("pageScreens");
    if (!host) return;
    const wait = new MutationObserver(() => { if (document.getElementById("screen-map")) { wait.disconnect(); installAtlas(); } });
    wait.observe(host, { childList: true });
    return;
  }
  let busy = false;
  new MutationObserver(() => {
    if (busy) return;
    busy = true;
    try { enhance(screen); } finally { queueMicrotask(() => { busy = false; }); }
  }).observe(screen, { childList: true });
  enhance(screen);
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installAtlas, { once: true });
  else installAtlas();
}
