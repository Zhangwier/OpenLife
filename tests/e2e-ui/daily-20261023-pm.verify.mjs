// 2026-10-23 合并场验收：「人生」页「这一生」人物卡。用法：node x.mjs <端口> <截图目录> [before|after]
import { chromium } from "playwright";
import fs from "node:fs";
const [port, out, mode = "after"] = [process.argv[2] || "8787", process.argv[3] || "./shots", process.argv[4]];
const strict = mode === "after"; fs.mkdirSync(out, { recursive: true });
const BASE = `http://127.0.0.1:${port}/`;
const fails = [], errors = []; let passed = 0;
const check = (ok, m) => { if (!ok) { fails.push(m); console.log("  ✗", m); } else { passed++; console.log("  ✓", m); } };
const CASES = [["desktop",1366,800,"light"],["mobile",390,844,"light"],["desktop-dark",1366,800,"dark"],["mobile-dark",390,844,"dark"]];
const b = await chromium.launch();
for (const [tag,w,h,th] of CASES) {
  console.log(`\n[${tag}]`);
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on("pageerror", e => errors.push(`${tag} pageerror ${e.message}`));
  p.on("console", m => { if (m.type()==="error" && !m.text().startsWith("Failed to load resource")) errors.push(`${tag} console ${m.text()}`); });
  p.on("response", r => { if (r.status()>=400 && !r.url().includes("/art/scene-")) errors.push(`${tag} ${r.status()} ${r.url()}`); });
  await p.goto(BASE);
  await p.evaluate(x => { localStorage.clear(); localStorage.setItem("openlife-theme", x); localStorage.setItem("openlife-coach-dismissed","1"); }, th);
  await p.reload(); await p.waitForTimeout(900);
  await p.click("#homeNewLife"); await p.waitForTimeout(400);
  await p.click("#newLifeForm button[type=submit]"); await p.waitForSelector("body[data-screen=activities]", { timeout: 15000 });
  await p.waitForTimeout(800);
  await p.evaluate(() => window.dispatchEvent(new CustomEvent("openlife:navigate", { detail: "character" })));
  await p.waitForSelector("#screen-character .life-rail", { state: "visible" }); await p.waitForTimeout(700);
  const rail = p.locator("#screen-character .life-rail");
  await rail.screenshot({ path: `${out}/${tag}-character-card.png` });
  if (strict) {
    const labels = await p.$$eval("#screen-character .life-line-labels span", e => e.map(x => x.textContent.trim()));
    check(labels.at(-1) === "往后的日子", `人生线右端：${labels.join("/")}`);
    check(await p.$eval("#screen-character .life-line", e => e.getAttribute("aria-label")).then(s => /此刻/.test(s)), "人生线有读屏说明");
    check(await p.$$eval("#screen-character .cx-sub", e => e.length) === 1, "天赋小标只有一条");
    check(await p.$eval("#screen-character .origin-wish .cx-tag", e => e.textContent) === "念想", "念想标签");
    const empties = await p.$$eval("#screen-character .soft-stats strong.cx-empty", e => e.length);
    check(empties >= 3, `空状态词标淡 ${empties} 个`);
    const colors = await p.evaluate(() => { const e = document.querySelector("#screen-character .soft-stats strong.cx-empty"); const n = document.querySelector("#screen-character .soft-stats strong:not(.cx-empty)"); return [getComputedStyle(e).color, getComputedStyle(n).color]; });
    check(colors[0] !== colors[1], "空状态词与已有状态词颜色不同");
    check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "无横向滚动");
    await p.waitForTimeout(500);
    check(await p.$$eval("#screen-character .cx-sub, #screen-character .cx-tag", e => e.length) === 2, "重绘后不重复");
    await p.screenshot({ path: `${out}/${tag}-character-page.png`, fullPage: true });
  } else await p.screenshot({ path: `${out}/${tag}-character-page.png`, fullPage: true });
  await p.close();
}
await b.close();
check(errors.length === 0, `页面报错 ${errors.length} 条`); errors.slice(0,8).forEach(e => console.log("   ", e));
console.log(`\n通过 ${passed}，失败 ${fails.length}`); process.exit(fails.length ? 1 : 0);
