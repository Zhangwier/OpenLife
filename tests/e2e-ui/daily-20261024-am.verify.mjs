// 2026-10-24 早场验收：熟人页。用法：node x.mjs <端口> <截图目录> [before|after]
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
  await p.click("#newLifeForm button[type=submit]");
  await p.waitForSelector("body[data-screen=activities]", { timeout: 15000 }); await p.waitForTimeout(700);
  await p.click('[data-route="people"]:visible'); await p.waitForTimeout(700);
  await p.screenshot({ path: `${out}/${tag}-people.png`, fullPage: true });
  if (strict) {
    const n = await p.locator(".stranger-list li").count();
    check(n >= 1, `陌生人清单有 ${n} 行`);
    check(await p.locator(".pux-ord").count() === n, "每行都有「第N位」编号");
    const labels = await p.locator(".stranger-list button").evaluateAll(a => a.map(x => x.getAttribute("aria-label")));
    check(new Set(labels).size === labels.length && labels.every(Boolean), `搭话按钮读屏名互不相同：${labels.join(" / ")}`);
    check(await p.locator(".pux-steps li").count() === 3, "三步路标出现");
    check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "无横向滚动");
    if (w < 600) check(await p.evaluate(() => { const r = document.querySelector(".pux-steps").getBoundingClientRect(); return r.right <= innerWidth && r.left >= 0; }), "手机路标不溢出");
    await p.click(".stranger-list button");
    await p.waitForSelector("body[data-screen=activities]", { timeout: 5000 });
    check(true, "点搭话回到「此刻」并选中对方");
  }
  await p.close();
}
await b.close();
check(errors.length === 0, `页面报错 ${errors.length} 条`); errors.slice(0,8).forEach(e => console.log("   ", e));
console.log(`\n通过 ${passed}，失败 ${fails.length}`); process.exit(fails.length ? 1 : 0);
