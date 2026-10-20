/**
 * 界面交互第四轮（2026-10-20 中午场）：人物页、新人生表单、加载与页面切换。只做表现层，不发游戏动作。
 *  1. 人物页：生命线上的「此刻」跟着真实进度走并写出年龄；没有立绘时，头像里显示名字首字。
 *  2. 新人生表单：选「随缘」时说明天赋为什么不能选，并给出「自己挑」的入口；天赋显示已选几个，
 *     选满了再点时提示先取消一个。
 *  3. 加载态：地图、模块、图鉴读取时显示骨架屏（aria-busy）；读取失败时给出「重新读取」。
 *  4. 页面切换：浏览器标签页标题跟着当前页面变。
 * 样式在 life-ux.css（本文件自己挂上）。图鉴搜索、人际关系阶段直接改在 codex.js 和 player.js 里。
 */

const $ = (id) => document.getElementById(id);

// ---------- 1. 人物页 ----------
/** 生命线上的「此刻」标签：靠近两端时贴边对齐，免得被裁掉。导出给单测用。 */
export function nowMarker(percent, age) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  const align = p < 12 ? "start" : p > 88 ? "end" : "center";
  return { left: `${p}%`, align, text: Number.isFinite(Number(age)) ? `此刻 · ${Number(age)} 岁` : "此刻" };
}
function syncLifeLine() {
  const progress = $("lifeProgress"), track = progress?.parentElement;
  if (!track) return;
  const age = Number.parseInt($("characterMeta")?.textContent || "", 10);
  const m = nowMarker(Number.parseFloat(progress.style.width), age);
  let mark = track.querySelector(".life-now");
  if (!mark) {
    mark = document.createElement("span");
    mark.className = "life-now";
    track.append(mark);
    track.closest(".life-line")?.classList.add("has-now");
  }
  mark.style.left = m.left;
  mark.dataset.align = m.align;
  mark.textContent = m.text;
}
function installLifeLine() {
  const progress = $("lifeProgress"), meta = $("characterMeta");
  if (!progress) return;
  new MutationObserver(syncLifeLine).observe(progress, { attributes: true, attributeFilter: ["style"] });
  if (meta) new MutationObserver(syncLifeLine).observe(meta, { childList: true, characterData: true, subtree: true });
  syncLifeLine();
}

// ---------- 2. 新人生表单 ----------
/** 与表单说明「选一到两个」一致（数据包 maxTalents）。 */
const MAX_TALENTS = 2;
function installNewLife() {
  const select = $("newOrigin"), list = $("newTalentList"), box = $("newTalents");
  if (!select || !list || !box) return;
  const legend = box.querySelector("legend");
  let count = legend?.querySelector(".talent-count");
  if (legend && !count) { count = document.createElement("b"); count.className = "talent-count"; count.setAttribute("aria-live", "polite"); legend.append(count); }
  let note = box.querySelector(".talent-random-note");
  if (!note) {
    note = document.createElement("p");
    note.className = "talent-random-note";
    note.innerHTML = `<span>现在是「随缘」：出身和两个天赋由人生编号决定，所以这里不能勾选。</span><button type="button" class="ghost-button" data-pick-origin>自己挑出身和天赋</button>`;
    legend?.after(note);
    note.querySelector("[data-pick-origin]").addEventListener("click", () => {
      select.focus();
      try { select.showPicker?.(); } catch { /* 有的浏览器不允许脚本打开下拉 */ }
    });
  }
  let hint = box.querySelector(".talent-limit-hint");
  if (!hint) { hint = document.createElement("p"); hint.className = "talent-limit-hint"; hint.setAttribute("role", "status"); hint.hidden = true; box.append(hint); }
  const sync = () => {
    const random = select.value === "random";
    const inputs = [...list.querySelectorAll("input")];
    const checked = inputs.filter((i) => i.checked).length;
    box.classList.toggle("is-random", random);
    note.hidden = !random;
    if (count) count.textContent = random ? "" : `已选 ${checked} / ${MAX_TALENTS}`;
    if (!random && checked < 2) hint.hidden = true;
  };
  // app.js 在 change 里同步禁用状态；放到下一拍再读，拿到的是它处理完的结果。
  select.addEventListener("change", () => setTimeout(sync));
  list.addEventListener("change", () => setTimeout(sync));
  list.addEventListener("click", (event) => {
    const label = event.target.closest(".talent-choice");
    const input = label?.querySelector("input");
    if (!input?.disabled || select.value === "random") return;
    hint.textContent = "最多选两个天赋。想换这个，先取消一个已选的。";
    hint.hidden = false;
  });
  new MutationObserver(() => setTimeout(sync)).observe(list, { childList: true });
  sync();
}

// ---------- 3. 加载态 ----------
const ASYNC_SCREENS = ["map", "modules", "codex"];
export function isLoadingText(text) { return /^正在/.test(String(text || "").trim()); }
function enhanceScreen(screen) {
  const empty = screen.querySelector(":scope > .page-empty");
  const only = empty && screen.children.length === 1;
  const loading = Boolean(only && isLoadingText(empty.textContent));
  empty?.classList.toggle("is-loading", loading);
  if (loading) screen.setAttribute("aria-busy", "true"); else screen.removeAttribute("aria-busy");
  if (only && !loading && !empty.querySelector("[data-retry]")) {
    const route = screen.dataset.screenPanel;
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "ghost-button page-retry"; btn.dataset.retry = route; btn.textContent = "重新读取";
    // 动态引入：单测在 Node 里加载本文件时不需要 shell.js。
    btn.addEventListener("click", () => import("/shell.js").then((m) => m.navigate(route)));
    empty.classList.add("is-error");
    empty.append(btn);
  }
}
function installLoading() {
  for (const route of ASYNC_SCREENS) {
    const screen = $(`screen-${route}`);
    if (!screen) { requestAnimationFrame(installLoading); return; }
  }
  for (const route of ASYNC_SCREENS) {
    const screen = $(`screen-${route}`);
    if (screen.dataset.loadingUx) continue;
    screen.dataset.loadingUx = "1";
    new MutationObserver(() => enhanceScreen(screen)).observe(screen, { childList: true });
    enhanceScreen(screen);
  }
}

// ---------- 4. 标签页标题 ----------
const BASE_TITLE = "OpenLife · 开放人生";
function syncTitle() {
  const route = document.body.dataset.screen;
  const page = $("pageTitle")?.textContent.trim();
  document.title = route && route !== "home" && page ? `${page} · ${BASE_TITLE}` : BASE_TITLE;
}
function installTitle() {
  new MutationObserver(syncTitle).observe(document.body, { attributes: true, attributeFilter: ["data-screen"] });
  const title = $("pageTitle");
  if (title) new MutationObserver(syncTitle).observe(title, { childList: true, characterData: true, subtree: true });
  syncTitle();
}

export function installLifeUx() {
  if (!document.querySelector('link[href="/life-ux.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = "/life-ux.css";
    document.head.append(link);
  }
  installLifeLine();
  installNewLife();
  installLoading();
  installTitle();
}
if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installLifeUx, { once: true });
  else installLifeUx();
}
