// 每日 UI 优化 2026-10-22 合并场（pm）验收：行囊栏（bag-ux）+「时代与世界」页（world-ux）。
// 用法：node daily-20261022-pm.verify.mjs <端口> <截图目录> [before|after]
//   before：只截图（基线没有这些改动，不做断言）；after：截图 + 全部断言。
// 覆盖：桌面 1366×800、手机 390×844、深色模式（桌面 + 手机）。页面报错必须为 0。
import { chromium } from "playwright";
import fs from "node:fs";

const port = process.argv[2] || "8787";
const out = process.argv[3] || "./shots";
const mode = process.argv[4] || "after";
const strict = mode === "after";
fs.mkdirSync(out, { recursive: true });
const BASE = `http://127.0.0.1:${port}/`;
const KNOWN_MISSING = ["/art/scene-"]; // 基线原本就缺的插画（文字模式不显示），不算本场引入
const fails = [], errors = [], knownMissing = new Set();
let passed = 0;
const check = (ok, msg) => { if (!ok) { fails.push(msg); console.log("  ✗", msg); } else { passed++; console.log("  ✓", msg); } };

const CASES = [
  ["desktop", 1366, 800, "light"],
  ["mobile", 390, 844, "light"],
  ["desktop-dark", 1366, 800, "dark"],
  ["mobile-dark", 390, 844, "dark"],
];

const browser = await chromium.launch();
for (const [tag, width, height, theme] of CASES) {
  console.log(`\n[${tag}] ${width}×${height} ${theme}`);
  const phone = width <= 600;
  const page = await browser.newPage({ viewport: { width, height } });
  page.on("pageerror", (e) => errors.push(`${tag} pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) errors.push(`${tag} console: ${m.text()}`); });
  page.on("response", (r) => {
    if (r.status() < 400) return;
    if (KNOWN_MISSING.some((k) => r.url().includes(k))) { knownMissing.add(r.url().replace(BASE, "/")); return; }
    errors.push(`${tag} ${r.status()}: ${r.url()}`);
  });
  await page.goto(BASE);
  await page.evaluate((t) => { localStorage.clear(); localStorage.setItem("openlife-theme", t); localStorage.setItem("openlife-coach-dismissed", "1"); }, theme);
  await page.reload();
  await page.waitForTimeout(900);
  if (theme === "dark") check(await page.evaluate(() => document.documentElement.dataset.theme === "dark" || matchMedia("(prefers-color-scheme: dark)").matches), "深色模式生效");
  await page.click("#homeNewLife");
  await page.waitForTimeout(400);
  await page.click("#newLifeForm button[type=submit]");
  await page.waitForSelector("body[data-screen=activities]", { timeout: 15000 });
  await page.waitForTimeout(1200);
  const go = async (route) => {
    await page.evaluate((r) => window.dispatchEvent(new CustomEvent("openlife:navigate", { detail: r })), route);
    await page.waitForTimeout(600);
    await page.evaluate(() => scrollTo(0, 0));
  };
  const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

  // ---------- 题目一：行囊 ----------
  await go("works");
  await page.waitForSelector("#portableOverview .portable-item", { timeout: 10000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${tag}-1-bag.png` });
  if (strict) {
    check(await page.evaluate(() => document.getElementById("portableOverview").classList.contains("bag-ux")), "行囊挂上新样式");
    const g = await page.evaluate(() => {
      const meters = [...document.querySelectorAll("#portableOverview .bag-meter")];
      const slot = meters.find((m) => m.title.startsWith("随身"));
      const mass = meters.find((m) => m.title.startsWith("负重"));
      const pips = [...slot.querySelectorAll(".bag-gauge--slots i")];
      const [, used, max] = slot.title.match(/(\d+)\s*\/\s*(\d+)/).map(Number);
      const bar = mass.querySelector(".bag-gauge--bar i");
      return { n: pips.length, on: pips.filter((i) => i.classList.contains("on")).length, used, max, bar: bar ? parseFloat(bar.style.width) : null,
        digits: [slot, mass].some((m) => { const c = m.cloneNode(true); c.querySelectorAll(".sr-only").forEach((e) => e.remove()); return /\d/.test(c.textContent); }) };
    });
    check(g.n === Math.min(g.max, 12) && g.on === g.used, `随身格子 ${g.on}/${g.n}（title ${g.used}/${g.max}）`);
    check(g.bar !== null && g.bar > 0 && g.bar <= 100, `负重细条 ${g.bar}%`);
    check(!g.digits, "屏幕上仍不出现件数、重量数字");
    const it = await page.evaluate(() => {
      const all = [...document.querySelectorAll("#portableOverview .portable-item")];
      const shown = all.filter((b) => b.getClientRects().length);
      const st = shown.find((b) => b.classList.contains("is-stacked"));
      return { all: all.length, shown: shown.length, stack: st?.querySelector(".bag-stack")?.textContent, label: st?.getAttribute("aria-label"),
        repeat: shown.filter((b) => b.querySelector("small")?.textContent.trim() === "在手中").length,
        free: [...document.querySelectorAll("#portableOverview .bag-slot-free")].filter((e) => e.getClientRects().length).length };
    });
    check(it.all === 2 && it.shown === 1, `两份粟叠成一张（共 ${it.all}，显示 ${it.shown}）`);
    check(it.stack === "两份" && it.label === "粟，两份", `叠放标签「${it.stack}」、读屏「${it.label}」`);
    check(it.repeat === 0, "不再每张卡写「在手中」");
    check(it.free === 2, `补回空位格 ${it.free} 个`);
    const fold = await page.evaluate(() => document.querySelector("#screen-works .collection-fold summary .bag-fold-tag")?.textContent);
    check(fold === "还没有", "作品折叠标题写明「还没有」");
    check(await noHScroll(), "行囊页无横向滚动");
  }
  await page.click("#portableOverview .portable-item");
  await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById("portableOverview").scrollIntoView({ block: "start" }));
  await page.evaluate(() => scrollBy(0, -80));
  await page.screenshot({ path: `${out}/${tag}-2-bag-detail.png` });
  if (strict) {
    const d = await page.evaluate(() => { const box = document.getElementById("bagDetail"); const btns = [...box.querySelectorAll(".scene-quick-choice")]; return { hidden: box.hidden, where: box.querySelector(":scope > p")?.textContent, ys: btns.map((b) => Math.round(b.getBoundingClientRect().y)), n: btns.length }; });
    check(!d.hidden, "点叠起来的卡照旧打开详情");
    check(d.where?.startsWith("随身带着 · 此刻在"), `详情位置句：${d.where}`);
    if (!phone) check(d.n >= 2 && d.ys[0] === d.ys[1], "桌面：详情操作两列排");
    else check(d.n >= 2 && d.ys[1] > d.ys[0], "手机：详情操作一列排");
    // 真正操作一次：放下一份，叠放跟着变成单张，格子跟着少一格（看得见的反馈）。
    const drop = page.locator("#bagDetail .scene-quick-choice", { hasText: "放下" }).first();
    if (await drop.count()) {
      await drop.click();
      await page.waitForTimeout(1500);
      const after = await page.evaluate(() => {
        const shown = [...document.querySelectorAll("#portableOverview .portable-item")].filter((b) => b.getClientRects().length);
        const slot = [...document.querySelectorAll("#portableOverview .bag-meter")].find((m) => m.title.startsWith("随身"));
        return { shown: shown.length, stacked: shown.some((b) => b.classList.contains("is-stacked")), on: slot ? slot.querySelectorAll(".bag-gauge--slots i.on").length : -1 };
      });
      check(after.shown === 1 && !after.stacked && after.on === 1, `放下一份后：单张、格子 ${after.on} 格`);
    } else check(false, "详情里有「放下」");
  }

  // ---------- 题目二：时代与世界 ----------
  await go("world");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${tag}-3-world.png` });
  await page.screenshot({ path: `${out}/${tag}-4-world-full.png`, fullPage: true });
  if (strict) {
    const w = await page.evaluate(() => {
      const card = document.querySelector(".world-card");
      const m = card.querySelector(".world-metrics").getBoundingClientRect();
      const inner = card.getBoundingClientRect();
      const labels = [...card.querySelectorAll(".world-metrics span")].map((s) => ({ h: s.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(s).lineHeight) }));
      const empty = [...card.querySelectorAll("[data-world-empty]")];
      const quiet = card.querySelector(".world-quiet");
      return { ux: card.classList.contains("world-ux"), mw: m.width, cw: inner.width, labels, emptyN: empty.length, emptyShown: empty.filter((e) => e.getClientRects().length).length,
        quietShown: quiet && quiet.getClientRects().length > 0, names: quiet?.querySelector(".world-quiet-names")?.textContent,
        ids: ["worldPeople", "worldPulse", "worldKnowledge", "worldNotablePeople"].every((id) => card.contains(document.getElementById(id))) };
    });
    check(w.ux && w.ids, "时代与世界挂上新样式，渲染用的 id 都还在");
    check(w.mw > w.cw - 60, `三个数字铺满整行（${Math.round(w.mw)}/${Math.round(w.cw)}）`);
    check(w.labels.every((l) => l.h <= l.lh * 2 + 1), "数字标签最多两行");
    if (phone) check(w.labels.every((l) => l.h <= l.lh + 1), "手机：数字标签一行放下，不再拆词");
    check(w.emptyN >= 3 && w.emptyShown === 0, `「还没有」的 ${w.emptyN} 节默认收起`);
    check(w.quietShown && /时代人物/.test(w.names) && /后世仍记得的人/.test(w.names), `页尾列出：${w.names}`);
    if (!phone) {
      const cols = await page.evaluate(() => { const s = [...document.querySelectorAll(".world-sections > div")].filter((e) => e.getClientRects().length && !e.classList.contains("world-mood")); if (s.length < 2) return false; const a = s[0].getBoundingClientRect(), b = s[1].getBoundingClientRect(); return Math.abs(a.y - b.y) < 2 && b.x > a.right; });
      check(cols, "桌面：小节两列排");
    }
    check(await noHScroll(), "时代与世界无横向滚动");
    // 展开 / 收起
    await page.click(".world-quiet-toggle");
    await page.waitForTimeout(300);
    const open = await page.evaluate(() => ({ shown: [...document.querySelectorAll("[data-world-empty]")].filter((e) => e.getClientRects().length).length, n: document.querySelectorAll("[data-world-empty]").length, exp: document.querySelector(".world-quiet-toggle").getAttribute("aria-expanded") }));
    check(open.shown === open.n && open.exp === "true", "点「看看它们会是什么样」展开全部空小节");
    await page.evaluate(() => document.querySelector(".world-quiet").scrollIntoView({ block: "center" }));
    await page.screenshot({ path: `${out}/${tag}-5-world-quiet-open.png` });
    await page.click(".world-quiet-toggle");
    await page.waitForTimeout(200);
    check(await page.evaluate(() => [...document.querySelectorAll("[data-world-empty]")].every((e) => !e.getClientRects().length)), "再点收起");
    // 内容变化后自动回到正文：模拟渲染写进一条思想传统。
    const back = await page.evaluate(async () => {
      document.getElementById("worldTraditions").innerHTML = '<div class="tradition-item"><strong>测试思想</strong><span>刚刚被提出</span></div>';
      await new Promise((r) => setTimeout(r, 50));
      const s = document.querySelector(".world-intellectual");
      return { empty: s.hasAttribute("data-world-empty"), shown: s.getClientRects().length > 0, names: document.querySelector(".world-quiet-names").textContent };
    });
    check(!back.empty && back.shown && !back.names.includes("思想与学派"), "有了内容的小节自动回到正文");
  }
  await page.close();
}
await browser.close();
console.log(`\n通过 ${passed} 项，失败 ${fails.length} 项；页面报错 ${errors.length} 个`);
if (knownMissing.size) console.log("已知缺图（基线原有，不计）：", [...knownMissing].join(", "));
errors.forEach((e) => console.log("  !", e));
if (strict && (fails.length || errors.length)) process.exit(1);
if (!strict && errors.length) process.exit(1);
