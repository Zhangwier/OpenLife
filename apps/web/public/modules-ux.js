// 模块管理页增强（2026-10-25 合并场）：核心模块折叠、状态筛选条（带数量）、开关点击即时反馈。
// 只按 id/类名观察 #screen-modules 的重画，幂等；不改 shell.js 的渲染。
export function groupKey(text) {
  const t = String(text || "").trim();
  if (t.startsWith("核心")) return "core";
  if (t.startsWith("当前世界已加载")) return "on";
  if (t.startsWith("下次启动时关掉")) return "off";
  if (t.startsWith("本地已有")) return "idle";
  return "";
}
export const FILTERS = [["all", "全部"], ["on", "可开关"], ["off", "已标记关闭"], ["idle", "未接入"], ["core", "核心"]];
export function filterLabel(key, n) { const f = FILTERS.find((x) => x[0] === key); return `${f ? f[1] : key} ${n}`; }
let current = "all";
function enhance(screen) {
  if (!screen.querySelector(".module-card") || !screen.querySelector(".module-search")) return;
  if (screen.querySelector("#moduleUxBar")) { apply(screen); return; }
  const counts = { core: 0, on: 0, off: 0, idle: 0 };
  // 核心组折叠成 details
  const coreHead = [...screen.querySelectorAll("h3.module-group")].find((h) => groupKey(h.textContent) === "core");
  if (coreHead && coreHead.nextElementSibling?.classList.contains("module-list")) {
    const list = coreHead.nextElementSibling;
    const names = [...list.querySelectorAll(".module-card h3")].map((h) => h.textContent.trim());
    const d = document.createElement("details"); d.className = "module-fold mux-core"; d.dataset.muxGroup = "core";
    const s = document.createElement("summary"); s.textContent = `${coreHead.textContent.trim()}（关掉世界会乱，所以不给开关）`;
    const p = document.createElement("p"); p.className = "mux-core-names"; p.textContent = names.join("、");
    coreHead.before(d); d.append(s, p, list); coreHead.remove();
  }
  for (const h of screen.querySelectorAll("h3.module-group")) {
    const k = groupKey(h.textContent); if (!k) continue;
    h.dataset.muxGroup = k; if (h.nextElementSibling?.classList.contains("module-list")) h.nextElementSibling.dataset.muxGroup = k;
  }
  const fold = screen.querySelector("details.module-fold:not(.mux-core)"); if (fold) fold.dataset.muxGroup = "idle";
  for (const k of Object.keys(counts)) counts[k] = screen.querySelectorAll(`.module-list[data-mux-group="${k}"] .module-card, .mux-core[data-mux-group="${k}"] .module-card, details[data-mux-group="${k}"] .module-card`).length;
  counts.core = screen.querySelectorAll(".mux-core .module-card").length;
  const bar = document.createElement("div"); bar.id = "moduleUxBar"; bar.className = "mux-bar"; bar.setAttribute("role", "group"); bar.setAttribute("aria-label", "按状态筛选模块");
  for (const [key] of FILTERS) {
    if (key !== "all" && !counts[key]) continue;
    const b = document.createElement("button"); b.type = "button"; b.className = "mux-chip"; b.dataset.filter = key;
    b.textContent = key === "all" ? `全部 ${screen.querySelectorAll(".module-card").length}` : filterLabel(key, counts[key]);
    bar.append(b);
  }
  screen.querySelector(".module-search").after(bar);
  bar.addEventListener("click", (e) => { const b = e.target.closest(".mux-chip"); if (!b) return; current = b.dataset.filter; apply(screen); });
  apply(screen);
}
function apply(screen) {
  const bar = screen.querySelector("#moduleUxBar"); if (!bar) return;
  if (!bar.querySelector(`[data-filter="${current}"]`)) current = "all";
  bar.querySelectorAll(".mux-chip").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.filter === current)));
  screen.querySelectorAll("[data-mux-group]").forEach((el) => {
    const hide = current !== "all" && el.dataset.muxGroup !== current;
    if (el.hidden !== hide) el.hidden = hide;
    if (!hide && current !== "all" && el.tagName === "DETAILS" && !el.open) el.open = true;
  });
}
export function installModulesUx() {
  if (typeof document === "undefined") return;
  if (!document.querySelector('link[href="/modules-ux.css"]')) {
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "/modules-ux.css"; document.head.append(l);
  }
  const hook = () => {
    const screen = document.getElementById("screen-modules");
    if (!screen) { requestAnimationFrame(hook); return; }
    new MutationObserver(() => enhance(screen)).observe(screen, { childList: true });
    screen.addEventListener("click", (e) => {
      const b = e.target.closest?.(".module-switch"); if (!b || b.disabled) return;
      b.setAttribute("aria-busy", "true"); b.classList.add("mux-busy");
      b.dataset.was = b.textContent; b.textContent = "…";
    }, true);
    enhance(screen);
  };
  hook();
}
installModulesUx();
