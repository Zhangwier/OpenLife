// 每日 UI 优化 2026-10-23 早场验收：「今天」卡（此刻页）+「心事与去处」卡（人生页）。
// 用法：node daily-20261023-am.verify.mjs <端口> <截图目录> [before|after]
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
const fails = [];
const KNOWN_MISSING = ["/art/scene-"]; // 基线本来就缺的插画，文字模式下不显示
const knownMissing = new Set();
const errors = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); else console.log("  ✓", msg); };

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
  await page.evaluate((t) => { localStorage.clear(); localStorage.setItem("openlife-theme", t); }, theme);
  await page.reload();
  await page.waitForTimeout(900);
  await page.click("#homeNewLife");
  await page.waitForTimeout(400);
  await page.click("#newLifeForm button[type=submit]");
  await page.waitForSelector('[data-outlook="today"]', { timeout: 15000 });
  await page.waitForTimeout(800);
  const R = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom, r: r.right }; }, sel);
  const T = (sel) => page.evaluate((s) => document.querySelector(s)?.innerText ?? "", sel);

  // ---------- 此刻页：「今天」卡 ----------
  await page.evaluate(() => scrollTo(0, 0));
  await page.locator('[data-outlook="today"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/${tag}-1-now-today-view.png` });
  await page.locator('[data-outlook="today"]').screenshot({ path: `${out}/${tag}-2-now-today-card.png` });
  if (strict) {
    const card = '[data-outlook="today"]';
    check((await page.locator(`${card}[data-ox]`).count()) === 1, "「今天」卡由新模块画出（带 data-ox）");
    check((await page.locator(`${card} .ox-ladder li`).count()) === 6, "村子六级阶梯画了 6 格");
    check((await page.locator(`${card} .ox-ladder li.is-now`).count()) === 1, "阶梯里恰好一格是「眼下」");
    check((await page.locator(`${card} .ox-cal li .ox-when`).count()) >= 1 && (await page.locator(`${card} .ox-cal li .ox-what`).count()) >= 1, "日历行拆成「日期｜事」两列");
    const todo = await page.locator(`${card} .ox-todo li`).count();
    check(todo >= 1, `「眼下要紧的」至少一条（${todo}）——原先读错数据层级，一条都没有`);
    check((await page.locator(`${card} .ox-season li`).count()) >= 1, "「这一季要办的事」清单出现");
    const spoken = await T(card);
    check(!/[0-9]/.test(spoken), `「今天」卡里没有阿拉伯数字`);
    check(!/（起起落落）|\(起起落落\)/.test(spoken), "气氛标签不再和句末括号重复");
    check((await page.locator(`${card} .ox-mood-tag`).count()) === 1, "气氛标签在卡头");
    const c = await R(card);
    if (phone) {
      check(c.x >= 10 && c.r <= width - 10, `手机卡片两边留白（${Math.round(c.x)} / ${Math.round(width - c.r)}px）`);
      const cal = await R(`${card} .ox-cal`), td = await R(`${card} .ox-todo`);
      check(td.y > cal.y, "手机上两栏改成上下排");
    } else {
      check(c.w <= 1001, `桌面卡片宽度不超过列宽（${Math.round(c.w)}px）`);
      const cal = await R(`${card} .ox-cal`), td = await R(`${card} .ox-todo`);
      check(td.x > cal.r - 1 && Math.abs(td.y - cal.y) < 40, "桌面上日历和要紧的事左右两栏");
    }
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    check(sw <= width, `此刻页没有横向滚动（${sw} ≤ ${width}）`);
    if (theme === "dark") check(await page.evaluate(() => document.documentElement.dataset.theme === "dark"), "深色模式生效");
  }

  // ---------- 人生页：「心事与去处」卡 ----------
  await page.locator('[data-route="character"]:visible').first().click();
  await page.waitForSelector('[data-outlook="life"]', { state: "visible" });
  await page.waitForTimeout(500);
  await page.evaluate(() => scrollTo(0, 0));
  await page.locator('[data-outlook="life"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/${tag}-3-life-view.png` });
  await page.locator('[data-outlook="life"]').screenshot({ path: `${out}/${tag}-4-life-card.png` });
  if (strict) {
    const card = '[data-outlook="life"]';
    check((await page.locator(`${card}[data-ox]`).count()) === 1, "「心事与去处」卡由新模块画出");
    const subs = await page.locator(`${card} .ox-sub`).allInnerTexts();
    check(["这一段", "放不下的事", "听来的心事", "能去的地方"].every((s) => subs.includes(s)), `四个小节标题齐全（${subs.join("、")}）`);
    check((await page.locator(`${card} .ox-stages li`).count()) === 5, "人生五段轨画了 5 格");
    check((await page.locator(`${card} .ox-stages li.is-now`).count()) === 1, "人生轨里恰好一格是「眼下」");
    const btn = page.locator(`${card} [data-travel="travel.depart"]`).first();
    check((await btn.count()) === 1, "有一个「出门」按钮");
    const label = await btn.getAttribute("aria-label");
    check(/^出门去.+/.test(label || ""), `按钮读屏名「${label}」`);
    const meta = await T(`${card} .ox-go-meta`);
    check(/天/.test(meta), `去处行写了路上要几天（${meta.trim()}）`);
    const bb = await btn.boundingBox();
    check(bb.height >= 43.5 && bb.width >= 43.5, `出门按钮点击区 ≥44（${Math.round(bb.width)}×${Math.round(bb.height)}）`);
    const spoken = await T(card);
    check(!/[0-9]/.test(spoken), "「心事与去处」卡里没有阿拉伯数字");
    // 点击反馈：把下行请求拖慢 600ms，按钮要立刻变忙
    await page.route("**/api/action", async (route) => { await new Promise((r) => setTimeout(r, 600)); await route.continue(); });
    await btn.click();
    await page.waitForTimeout(120);
    const busy = await page.evaluate(() => { const b = document.querySelector('[data-outlook="life"] [data-travel="travel.depart"]'); return b ? { text: b.textContent.trim(), busy: b.getAttribute("aria-busy"), disabled: b.disabled } : null; });
    check(busy && busy.busy === "true" && busy.disabled && /出发中/.test(busy.text), `点「出门」立刻变「出发中…」并锁住（${busy && busy.text}）`);
    await page.screenshot({ path: `${out}/${tag}-5-travel-busy.png` });
    await page.waitForFunction(() => document.querySelector('[data-outlook="life"] [data-travel="travel.day"], [data-outlook="life"] [data-travel="travel.arrive"]'), null, { timeout: 8000 });
    await page.waitForTimeout(300);
    const after = await T(card);
    check(/再走一天|落脚/.test(after) && /往回走/.test(after), "出发后换成「再走一天 / 往回走」");
    check((await page.locator(`${card} [data-travel="travel.depart"]`).count()) === 0, "出发后「出门」按钮消失");
    await page.evaluate(() => scrollTo(0, 0));
    await page.locator(card).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/${tag}-6-travelling.png` });
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    check(sw <= width, `人生页没有横向滚动（${sw} ≤ ${width}）`);
    await page.unroute("**/api/action");
  } else {
    // 基线也拍一张出发后的样子，方便对照
    const b = page.locator('[data-travel="travel.depart"]').first();
    if (await b.count()) { await b.click(); await page.waitForTimeout(1200); await page.locator('[data-outlook="life"]').screenshot({ path: `${out}/${tag}-6-travelling.png` }); }
  }
  await page.close();
}
await browser.close();

if (knownMissing.size) console.log(`\n基线已知缺图（不计入报错）：${[...knownMissing].join("、")}`);
console.log(`\n页面报错：${errors.length}`);
errors.forEach((e) => console.log("  ✗", e));
if (fails.length) { console.log(`\n未通过 ${fails.length} 项：`); fails.forEach((f) => console.log("  ✗", f)); }
if (strict && (fails.length || errors.length)) process.exit(1);
if (!strict && errors.length) process.exit(1);
console.log(strict ? "\n全部通过" : "\n基线截图完成");
