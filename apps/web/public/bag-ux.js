/**
 * 行囊页（2026-10-25 午场）：
 *  1. 同名物品叠成一摞（粟 ×2），不再一格一件重复摆；点开仍是第一件的详情。
 *  2. 每张格子都写「在手中」是重复信息：整页只在标题旁写一次「N 样 · M 件」，格子里只保留特别的位置/容量。
 *  3. 折叠的「亲手留下的作品」补上读屏状态和「还没有」提示。
 */
const $ = (id) => document.getElementById(id);

export function groupBag(items) {
  const groups = [];
  const byName = new Map();
  for (const it of items) {
    const key = it.name;
    if (!byName.has(key)) { const g = { name: key, ids: [], pressed: null, placement: it.placement }; byName.set(key, g); groups.push(g); }
    const g = byName.get(key);
    g.ids.push(it.id);
    if (it.pressed) g.pressed = it.id;
  }
  return groups.map((g) => ({ ...g, count: g.ids.length, show: g.pressed ?? g.ids[0] }));
}

export function summaryWord(groups) {
  const total = groups.reduce((n, g) => n + g.count, 0);
  if (!total) return "";
  return groups.length === total ? `${total} 件` : `${groups.length} 样 · ${total} 件`;
}

function enhance(screen) {
  const box = screen.querySelector(".portable-items");
  if (!box || box.dataset.bagUx === String(box.children.length)) return;
  const btns = [...box.querySelectorAll(".portable-item")];
  const items = btns.map((b) => ({ id: b.dataset.bagId, name: b.querySelector("strong")?.textContent ?? "", placement: b.querySelector("small")?.textContent ?? "", pressed: b.getAttribute("aria-pressed") === "true" }));
  const groups = groupBag(items);
  for (const g of groups) {
    const shown = btns.find((b) => b.dataset.bagId === g.show);
    for (const id of g.ids) { const b = btns.find((x) => x.dataset.bagId === id); if (b !== shown) b.hidden = true; }
    if (g.count > 1 && shown && !shown.querySelector(".bagx-count")) {
      shown.insertAdjacentHTML("beforeend", `<span class="bagx-count" aria-hidden="true">${g.count} 份</span>`);
      shown.setAttribute("aria-label", `${g.name}，共 ${g.count} 份`);
    }
    if (shown) { const s = shown.querySelector("small"); if (s && /^在手中$/.test(s.textContent.trim())) s.hidden = true; }
  }
  const head = screen.querySelector(".bag-heading .eyebrow");
  if (head && !screen.querySelector(".bagx-summary")) head.insertAdjacentHTML("afterend", `<span class="bagx-summary">${summaryWord(groups)}</span>`);
  else { const s = screen.querySelector(".bagx-summary"); if (s) s.textContent = summaryWord(groups); }
  box.dataset.bagUx = String(box.children.length);
  const fold = screen.querySelector(".collection-fold");
  if (fold && !fold.dataset.bagUx) {
    fold.dataset.bagUx = "1";
    const sum = fold.querySelector("summary");
    sum?.setAttribute("aria-expanded", String(fold.open));
    fold.addEventListener("toggle", () => sum?.setAttribute("aria-expanded", String(fold.open)));
  }
}

export function installBagUx() {
  if (!document.querySelector('link[href="/bag-ux.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = "/bag-ux.css"; document.head.append(link);
  }
  const ready = () => {
    const screen = $("screen-works");
    if (!screen) return requestAnimationFrame(ready);
    let pending = false;
    new MutationObserver(() => { if (pending) return; pending = true; queueMicrotask(() => { pending = false; enhance(screen); }); }).observe(screen, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-pressed"] });
    enhance(screen);
  };
  ready();
}
if (typeof document !== "undefined") installBagUx();
