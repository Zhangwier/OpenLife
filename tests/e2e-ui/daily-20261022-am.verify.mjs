// 每日 UI 优化 2026-10-22 早场验收：「此刻」页布局 + 新手引导导览。
// 用法：node daily-20261022-am.verify.mjs <端口> <截图目录> [before|after]
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
// 基线 origin/main 8f0c5a6 本来就缺的资源（文字模式下不显示），不是本场引入的。
const KNOWN_MISSING = ["/art/scene-"];
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
  // 「Failed to load resource」由下面的 response 统计，基线缺的插画（art/scene-*.webp）不算新报错。
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
  await page.waitForSelector("#coachCard:not([hidden])", { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: `${out}/${tag}-1-coach-card.png` });

  const R = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom, r: r.right, display: cs.display, hidden: e.hidden || cs.display === "none" || r.width === 0 }; }, sel);

  if (strict) {
    const card = await R("#coachCard");
    if (phone) {
      check(card.h < height * 0.5, `手机引导卡高度 ${Math.round(card.h)}px < 半屏`);
      const lede = await page.locator("#coachCard .coach-lede").count();
      check(lede === 1, "引导卡有一句怎么用的说明");
    } else {
      const guide = await R("#dailyGuide"), stage = await R("#screen-activities .life-stage");
      check(Math.abs(card.x - guide.x) < 1 && Math.abs(card.w - guide.w) < 1 && Math.abs(stage.x - guide.x) < 1, `引导卡 / 今日指引 / 场景同一左边缘同宽（${Math.round(card.x)}/${Math.round(guide.x)}/${Math.round(stage.x)}）`);
    }
  }

  // 导览：第 1 步
  await page.click("#coachCard .coach-next");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${tag}-2-tour-step1.png` });
  if (strict) {
    const tip = await R("#coachTip");
    check(tip && !tip.hidden, "点「指给我看」出现说明气泡");
    check((await page.textContent("#coachTip .coach-tip-count"))?.includes("第 1 步 / 共 3 步"), "气泡写第 1 步 / 共 3 步");
    const spot = await R(".coach-spot"), target = await R("#dailyGuide");
    check(spot && spot.x <= target.x && spot.r >= target.r && spot.y <= target.y + 1, "聚光框罩住今日指引");
    check(tip.y >= 0 && tip.b <= height, "气泡完整在视口内");
    const focused = await page.evaluate(() => document.activeElement?.classList.contains("coach-tip-next"));
    check(focused, "焦点在「下一步」上");
    if (phone) {
      const nav = await R("#appNavigation");
      check(tip.b <= nav.y + 1, `手机气泡在底栏上方（${Math.round(tip.b)} ≤ ${Math.round(nav.y)}）`);
    } else {
      const overlap = !(tip.y >= target.b || tip.b <= target.y);
      check(!overlap || target.h > height * 0.6, "桌面气泡不压住目标");
    }
  }
  // 第 2 步（按钮），第 3 步（→ 键）
  await page.click(strict ? "#coachTip .coach-tip-next" : "#coachCard .coach-next");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${tag}-3-tour-step2.png` });
  if (strict) {
    check((await page.textContent("#coachTip h3"))?.includes("状态条"), "下一步指到状态条");
    const spot = await R(".coach-spot"), target = await R("#sceneSummary");
    check(Math.abs(spot.y + 6 - target.y) < 2, "聚光框跟到状态条");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(250);
    check((await page.textContent("#coachTip .coach-tip-count"))?.includes("第 3 步"), "→ 键翻到第 3 步");
    check((await page.textContent("#coachTip .coach-tip-next"))?.includes("完成"), "最后一步主按钮是「完成，开始生活」");
    await page.screenshot({ path: `${out}/${tag}-4-tour-step3.png` });
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(200);
    check((await page.textContent("#coachTip .coach-tip-count"))?.includes("第 2 步"), "← 键退回第 2 步");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    check((await page.locator("#coachTip").count()) === 0 && (await page.locator(".coach-spot").count()) === 0, "Esc 结束导览，压暗撤掉");
    check(!(await R("#coachCard")).hidden, "Esc 只结束导览，引导卡还在");
    check(await page.evaluate(() => localStorage.getItem("openlife-coach-dismissed") !== "1"), "Esc 不记成已看过");
    // 重新走一遍并点完成
    await page.click("#coachCard .coach-next");
    for (let i = 0; i < 3; i++) { await page.click("#coachTip .coach-tip-next"); await page.waitForTimeout(150); }
    check((await page.locator("#coachTip").count()) === 0, "完成后气泡消失");
    check((await R("#coachCard")).hidden, "完成后引导卡收起");
    check(await page.evaluate(() => localStorage.getItem("openlife-coach-dismissed") === "1"), "完成记成已看过，刷新不再出现");
  } else {
    await page.click("#coachCard .coach-done").catch(() => {});
  }

  // 「此刻」页布局（引导卡已关）
  await page.evaluate(() => { localStorage.setItem("openlife-coach-dismissed", "1"); document.querySelector("#coachCard .coach-done")?.click(); scrollTo(0, 0); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${tag}-5-now-full.png`, fullPage: true });
  await page.evaluate(() => document.getElementById("interactionDock")?.scrollIntoView({ block: "start" }));
  await page.evaluate(() => scrollBy(0, -80));
  await page.screenshot({ path: `${out}/${tag}-6-now-dock.png` });
  if (strict) {
    const dock = await R("#dockTools"), area = await R("#interactionDock .scene-action-area");
    check(dock.y < area.y, "三个大按钮在提示语上面");
    check((await R('.scene-focus-row [data-focus="work"]')).hidden && (await R('.scene-focus-row [data-focus="walk"]')).hidden, "重复的「劳动与休息」「移动地点」小签收起");
    check(!(await R('.scene-focus-row [data-focus="season"]')).hidden, "「过一季」保留");
    const eyebrow = await page.evaluate(() => getComputedStyle(document.getElementById("interactionDock"), "::before").content);
    check(eyebrow.includes("现在可以做什么"), "做事区标题仍是「现在可以做什么」");
    const hs = await R(".hearth-story-heading span"), ht = await R(".hearth-story-heading strong");
    check(Math.abs(hs.x - ht.x) < 1 && ht.y > hs.y, "「身边的事」眉标在上、标题在下、左对齐");
    const log = await R("#lifeLog"), feed = await R("#communityFeed"), hopes = await R("#hopes");
    if (phone) {
      const logText = await R("#lifeLog .life-log-head span");
      check(logText.x >= 14, `手机纪事标题离屏幕边 ${Math.round(logText.x)}px（≥14）`);
      check(hopes.w > width * 0.9, `手机「心里记着的事」撑满一行（${Math.round(hopes.w)}px）`);
      // 点「劳动」后操作组出现在大按钮下面
      await page.click("#sceneWorkButton");
      await page.waitForTimeout(400);
      const grp = await R("#sceneActions .scene-action-group");
      check(grp && grp.y > (await R("#dockTools")).y, "点「劳动」后可做的事出现在大按钮下方");
      await page.screenshot({ path: `${out}/${tag}-7-work-open.png` });
    } else {
      check(feed.x > log.r && Math.abs(feed.y - log.y) < 2, "1366 宽：身边的事在纪事右侧同一行（两栏）");
      check(Math.abs(hopes.x - feed.x) < 1 && hopes.y > feed.y, "心里记着的事在右栏、身边的事下面");
      const stage = await R("#screen-activities .life-stage");
      check(Math.abs(log.x - stage.x) < 1, "纪事左边缘和场景对齐");
      await page.click("#sceneWorkButton");
      await page.waitForTimeout(400);
      const grp = await R("#sceneActions .scene-action-group");
      check(grp && grp.y > (await R("#dockTools")).y, "点「劳动」后可做的事出现在大按钮下方");
      await page.screenshot({ path: `${out}/${tag}-7-work-open.png` });
    }
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    check(sw <= width, `没有横向滚动（${sw} ≤ ${width}）`);
    if (theme === "dark") check(await page.evaluate(() => document.documentElement.dataset.theme === "dark"), "深色模式生效");
    // 菜单重新打开新手引导仍可用
    await page.evaluate(() => scrollTo(0, 0));
    await page.click("#menuButton");
    await page.waitForTimeout(250);
    await page.click("#menuModal [data-coach-reopen]");
    await page.waitForTimeout(400);
    check(!(await R("#coachCard")).hidden, "菜单 → 新手引导能重新打开引导卡");
    await page.click("#coachCard .coach-next");
    await page.waitForTimeout(200);
    check((await page.locator("#coachTip").count()) === 1, "重新打开后导览照样能走");
    await page.keyboard.press("Escape");
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
