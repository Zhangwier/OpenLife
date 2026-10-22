/**
 * 每日 UI 优化 2026-10-22 合并场（pm）题目一：HUD · 行囊栏。只做表现层，不发游戏动作。
 *  1. 余量看得见：「随身」下面一排格子（实心=占用、虚线=空着），「负重」下面一条细进度条。
 *     遵守行囊「不给数字」的规矩（shell.js bagMeter）：屏幕上仍只有格子和词，件数留在 title / 读屏。
 *  2. 同样的东西叠成一摞：两份粟只占一张卡，卡角写「两份」，卡片做成叠放的样子；点它照旧打开第一份。
 *  3. 去掉每张卡都重复的「在手中」（行囊里的东西本来就都在手中），容器只留「容量」那半句。
 *  4. 补回空位：第二轮的「空位」虚线格靠读数字，数字被改成词以后就再没出现过；这里按 title 里的余量补回。
 *  5. 物品详情：「在手中 · 当前位置：陶家庭院」改成「随身带着 · 此刻在陶家庭院」；桌面上操作两列排。
 *  6. 「亲手留下的作品」还没有作品时，折叠标题后面直接写「还没有」，不用点开才知道是空的。
 * 样式在 bag-ux.css（本文件自己挂上）。
 */
const $ = (id) => document.getElementById(id);

/** 从 bagMeter 的 title（「随身 2/4件」「负重 1.2/10」）读出用量。导出给单测用。 */
export function parseMeter(title) {
  const m = String(title || "").match(/^(\S+)\s+([\d.]+)\s*\/\s*([\d.]+)/);
  if (!m) return null;
  const value = Number(m[2]), max = Number(m[3]);
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return null;
  return { label: m[1], value, max, ratio: Math.max(0, Math.min(1, value / max)) };
}

/** 格子：最多画 12 格，超过就按比例缩。返回 [true,…,false]，true=占用。 */
export function slotPips(value, max, cap = 12) {
  const total = Math.max(0, Math.round(Number(max) || 0));
  if (!total) return [];
  const shown = Math.min(total, cap);
  const used = Math.round((Math.max(0, Math.min(total, Number(value) || 0)) / total) * shown);
  return Array.from({ length: shown }, (_, i) => i < used);
}

const COUNT_WORDS = ["", "", "两份", "三份", "四份", "五份"];
/** 一摞有几份，用词说：2→两份 … 5→五份，再多→好几份。 */
export function stackWord(n) {
  const k = Math.floor(Number(n) || 0);
  if (k < 2) return "";
  return COUNT_WORDS[k] || "好几份";
}

/** 卡片小字：「在手中」不再重复，「在手中 · 容量 1/3」只留后半句。 */
export function itemNote(text) {
  const t = String(text || "").trim();
  if (t === "在手中") return "";
  return t.replace(/^在手中\s*·\s*/, "");
}

/** 哪些卡能叠：名字和小字都一样、且不是容器（容器里装的东西不同）。返回 [[首张, 其余…], …]。 */
export function groupItems(items) {
  const groups = new Map();
  for (const item of items) {
    const key = item.capacity ? `#${item.id}` : `${item.name}\u0000${item.note}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.values()];
}

/** 详情里的位置句。 */
export function detailWhere(text) {
  const m = String(text || "").match(/^在手中\s*·\s*当前位置：(.+)$/);
  return m ? `随身带着 · 此刻在${m[1]}` : String(text || "");
}

function enhanceMeters(pack) {
  pack.querySelectorAll(".bag-meter").forEach((meter) => {
    if (meter.querySelector(".bag-gauge")) return;
    const info = parseMeter(meter.getAttribute("title"));
    if (!info) return;
    const gauge = document.createElement("span");
    gauge.className = "bag-gauge";
    gauge.setAttribute("aria-hidden", "true");
    if (info.label === "随身") {
      gauge.classList.add("bag-gauge--slots");
      gauge.innerHTML = slotPips(info.value, info.max).map((on) => `<i class="${on ? "on" : ""}"></i>`).join("");
    } else {
      gauge.classList.add("bag-gauge--bar");
      gauge.innerHTML = `<i style="width:${Math.round(info.ratio * 100)}%"></i>`;
    }
    meter.append(gauge);
  });
}

function enhanceItems(pack) {
  const box = pack.querySelector(".portable-items");
  if (!box || box.dataset.bagUx === "1") return;
  box.dataset.bagUx = "1";
  const buttons = [...box.querySelectorAll(".portable-item")];
  if (!buttons.length) return;
  const items = buttons.map((button) => {
    const small = button.querySelector("small");
    const raw = small?.textContent || "";
    return { button, id: button.dataset.bagId, name: button.querySelector("strong")?.textContent || "", note: raw, capacity: /容量/.test(raw) };
  });
  for (const item of items) {
    const small = item.button.querySelector("small");
    const note = itemNote(item.note);
    if (small) { if (note) small.textContent = note; else small.remove(); }
  }
  for (const group of groupItems(items)) {
    if (group.length < 2) continue;
    const [first, ...rest] = group;
    const word = stackWord(group.length);
    first.button.classList.add("is-stacked");
    first.button.insertAdjacentHTML("beforeend", `<span class="bag-stack">${word}</span>`);
    first.button.setAttribute("aria-label", `${first.name}，${word}`);
    rest.forEach((r) => { r.button.hidden = true; r.button.classList.add("bag-dup"); });
  }
  // 空位：按随身余量补虚线格（第二轮 scene-ux 读的是数字，现在读不到了）。
  if (!box.querySelector(".bag-slot-free")) {
    const meter = [...pack.querySelectorAll(".bag-meter")].map((m) => parseMeter(m.getAttribute("title"))).find((m) => m?.label === "随身");
    const free = meter ? Math.max(0, Math.round(meter.max - meter.value)) : 0;
    const shown = Math.min(free, 6);
    if (shown) {
      box.insertAdjacentHTML("beforeend", Array.from({ length: shown }, () => '<span class="bag-slot-free bag-ux-free" aria-hidden="true">空位</span>').join(""));
      box.setAttribute("aria-description", free > 1 ? "还能再拿好几件" : "还能再拿一件");
    }
  }
}

function enhanceDetail(pack) {
  const detail = pack.querySelector("#bagDetail");
  if (!detail || detail.hidden) return;
  const p = detail.querySelector(":scope > p");
  if (p && !p.dataset.bagUx) { p.dataset.bagUx = "1"; p.textContent = detailWhere(p.textContent); }
}

function enhanceWorksFold(screen) {
  const fold = screen.querySelector(".collection-fold");
  const summary = fold?.querySelector("summary");
  if (!summary) return;
  const empty = !screen.querySelector("#workshopWorks .vessel-card");
  let tag = summary.querySelector(".bag-fold-tag");
  if (empty && !tag) { tag = document.createElement("span"); tag.className = "bag-fold-tag"; tag.textContent = "还没有"; summary.append(tag); }
  if (!empty && tag) tag.remove();
}

let busy = false;
function enhance() {
  if (busy) return;
  busy = true;
  try {
    const screen = $("screen-works");
    const pack = $("portableOverview");
    if (pack) { pack.classList.add("bag-ux"); enhanceMeters(pack); enhanceItems(pack); enhanceDetail(pack); }
    if (screen) enhanceWorksFold(screen);
  } finally { busy = false; }
}

export function installBagUx() {
  if (typeof document === "undefined") return;
  if (!document.querySelector('link[href="/bag-ux.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = "/bag-ux.css";
    document.head.append(link);
  }
  const ready = () => {
    const screen = $("screen-works");
    if (!screen) { requestAnimationFrame(ready); return; }
    new MutationObserver(enhance).observe(screen, { childList: true, subtree: true });
    enhance();
  };
  ready();
}
if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installBagUx, { once: true });
  else installBagUx();
}
