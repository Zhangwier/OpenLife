/**
 * 每日 UI 优化 2026-10-22 合并场（pm）题目二：视觉风格统一 ·「时代与世界」页。只做表现层，不发游戏动作。
 *  1. 三个数字铺满整行、手机上标签不再拆成「持续存在的聚 / 落」。
 *  2. 「还没出现」收成一块：时代人物、思想与学派、流传中的历史、后世仍记得的人……这些小节只有一句
 *     「还没有」时，不再一节一节排到底；页尾一块「这个时代还没出现」列出名字，点「看看它们会是什么样」再展开。
 *     哪一节有了内容，就自动回到正文里。
 *  3. 桌面（≥1000px）正文小节两列排，右侧不再大片空白。
 *  4. 小节标题、正文、说明三层字号和颜色与其它资料页对齐。
 * app.js 的 renderWorld 只按 id 写内容；这里只把小节挪进一个容器并加标记，id 不变，渲染不受影响。
 * 样式在 world-ux.css（本文件自己挂上）。
 */
const $ = (id) => document.getElementById(id);

/** 可能整节为空的小节：[小节 class, 内容容器 id]。导出给单测用。 */
export const QUIET_SECTIONS = [
  ["world-historical-people", "worldHistoricalPeople"],
  ["world-knowledge", "worldKnowledge"],
  ["world-intellectual", "worldTraditions"],
  ["world-history-memory", "worldHistoryWorks"],
  ["world-notables", "worldNotablePeople"],
];
export const SECTION_CLASSES = ["world-mood", "world-era-context", ...QUIET_SECTIONS.map(([c]) => c)];

/** 内容容器里只有占位句（.subtle）或什么都没有，就算「还没出现」。参数是子元素 class 列表的列表。 */
export function isQuiet(childClassLists) {
  const list = [...(childClassLists || [])];
  return list.length === 0 || list.every((classes) => [...classes].includes("subtle"));
}

/** 页尾那句：「这个时代还没出现：A、B 和 C」。 */
export function quietSentence(names) {
  const n = [...names].filter(Boolean);
  if (!n.length) return "";
  if (n.length === 1) return n[0];
  return `${n.slice(0, -1).join("、")}和${n.at(-1)}`;
}

function sectionName(section) {
  return section.querySelector(":scope > span")?.textContent.replace(/\s*·.*$/, "").trim() || "";
}

function build(card) {
  if (card.querySelector(".world-sections")) return;
  card.classList.add("world-ux");
  const wrap = document.createElement("div");
  wrap.className = "world-sections";
  const sections = SECTION_CLASSES.map((c) => card.querySelector(`:scope > .${c}`)).filter(Boolean);
  if (!sections.length) return;
  sections[0].before(wrap);
  sections.forEach((s) => wrap.append(s));
  const quiet = document.createElement("div");
  quiet.className = "world-quiet";
  quiet.hidden = true;
  quiet.innerHTML = `<span class="world-quiet-eyebrow">这个时代还没出现</span>
    <p class="world-quiet-names"></p>
    <button type="button" class="ghost-button world-quiet-toggle" aria-expanded="false">看看它们会是什么样</button>`;
  wrap.after(quiet);
  quiet.querySelector("button").addEventListener("click", () => {
    const open = !card.classList.contains("show-quiet");
    card.classList.toggle("show-quiet", open);
    quiet.querySelector("button").setAttribute("aria-expanded", String(open));
    quiet.querySelector("button").textContent = open ? "收起" : "看看它们会是什么样";
  });
}

function sync(card) {
  const names = [];
  for (const [cls, id] of QUIET_SECTIONS) {
    const section = card.querySelector(`.${cls}`);
    const box = $(id);
    if (!section || !box) continue;
    const quiet = isQuiet([...box.children].map((el) => el.classList));
    if (quiet) names.push(sectionName(section));
    if (quiet !== section.hasAttribute("data-world-empty")) section.toggleAttribute("data-world-empty", quiet);
  }
  const block = card.querySelector(".world-quiet");
  if (!block) return;
  const text = quietSentence(names);
  const p = block.querySelector(".world-quiet-names");
  if (p.textContent !== text) p.textContent = text;
  const hide = names.length === 0;
  if (block.hidden !== hide) block.hidden = hide;
  if (hide && card.classList.contains("show-quiet")) card.classList.remove("show-quiet");
}

export function installWorldUx() {
  if (typeof document === "undefined") return;
  if (!document.querySelector('link[href="/world-ux.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = "/world-ux.css";
    document.head.append(link);
  }
  const ready = () => {
    const card = document.querySelector(".world-card");
    if (!card) { requestAnimationFrame(ready); return; }
    build(card);
    sync(card);
    new MutationObserver(() => sync(card)).observe(card.querySelector(".world-sections") || card, { childList: true, subtree: true });
  };
  ready();
}
if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installWorldUx, { once: true });
  else installWorldUx();
}
