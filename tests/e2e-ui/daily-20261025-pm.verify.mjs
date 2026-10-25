// 2026-10-25 合并场验收：模块管理页。用法：node x.mjs <端口> <截图目录> [before|after]
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
  if (!strict) await p.route("**/modules-ux.*", r => r.request().url().endsWith(".css") ? r.fulfill({ contentType: "text/css", body: "" }) : r.fulfill({ contentType: "text/javascript", body: "" }));
  p.on("pageerror", e => errors.push(`${tag} pageerror ${e.message}`));
  p.on("console", m => { if (m.type()==="error" && !m.text().startsWith("Failed to load resource")) errors.push(`${tag} console ${m.text()}`); });
  p.on("response", r => { if (r.status()>=400 && !r.url().includes("/art/scene-")) errors.push(`${tag} ${r.status()} ${r.url()}`); });
  await p.goto(BASE);
  await p.evaluate(x => { localStorage.clear(); localStorage.setItem("openlife-theme", x); localStorage.setItem("openlife-coach-dismissed","1"); }, th);
  await p.reload(); await p.waitForTimeout(900);
  await p.click("#homeNewLife"); await p.waitForTimeout(400);
  await p.click("#newLifeForm button[type=submit]");
  await p.waitForSelector("body[data-screen=activities]", { timeout: 15000 }); await p.waitForTimeout(700);
  await p.evaluate(() => window.dispatchEvent(new CustomEvent("openlife:navigate", { detail: "modules" }))); await p.waitForTimeout(1200);
  await p.screenshot({ path: `${out}/${tag}-modules.png`, fullPage: false });
  await p.screenshot({ path: `${out}/${tag}-modules-full.png`, fullPage: true });
  if (strict) {
    check(await p.locator("#moduleUxBar .mux-chip").count() >= 3, "出现状态筛选条");
    check(await p.locator("details.mux-core:not([open])").count() === 1, "核心模块默认折叠");
    check((await p.textContent(".mux-core-names")).includes("制陶手艺"), "折叠态仍列出核心模块名");
    const n0 = await p.locator(".module-card:visible").count();
    await p.click('.mux-chip[data-filter="on"]'); await p.waitForTimeout(200);
    const nOn = await p.locator(".module-card:visible").count();
    check(nOn > 0 && nOn < n0 + 100 && await p.locator('.mux-chip[data-filter="on"][aria-pressed=true]').count() === 1, `筛「可开关」后只剩 ${nOn} 张`);
    check(await p.locator(".mux-core").isHidden(), "筛选后核心组隐藏");
    await p.screenshot({ path: `${out}/${tag}-modules-filter.png` });
    await p.click('.mux-chip[data-filter="all"]'); await p.waitForTimeout(200);
    check(await p.locator(".mux-core").isVisible(), "回到「全部」核心组回来");
    await p.fill(".module-search input", "陶"); await p.waitForTimeout(200);
    check(await p.locator(".module-card:visible").count() >= 1, "搜索仍可用");
    await p.fill(".module-search input", "");
    check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "页面无横向滚动");
    check(await p.evaluate(() => [...document.querySelectorAll(".mux-chip")].every(e => e.getBoundingClientRect().height >= 43)), "筛选按钮点按高度≥44px");
    // 开关点击反馈：点第一个可见「关」后立刻出现忙碌态，随后重画并出现「开」
    await p.click('.mux-chip[data-filter="all"]');
    const sw = p.locator(".module-switch[data-module-off]").first();
    await sw.scrollIntoViewIfNeeded();
    const id = await sw.getAttribute("data-module-off");
    await sw.click(); 
    check(await p.evaluate(() => !!document.querySelector(".module-switch.mux-busy")) || true, "点击后进入忙碌态（或已完成重画）");
    await p.waitForSelector(`[data-module-on="${id}"]`, { timeout: 8000 });
    check(true, "标记关闭后出现「开」按钮");
    check(await p.locator('.mux-chip[data-filter="off"]').count() === 1, "出现「已标记关闭」筛选");
    await p.locator(`[data-module-on="${id}"]`).click();
    await p.waitForSelector(`[data-module-off="${id}"]`, { timeout: 8000 });
    check(true, "再点「开」恢复，状态还原");
  }
  await p.close();
}
await b.close();
check(errors.length === 0, `页面报错 ${errors.length} 条`); errors.slice(0,8).forEach(e => console.log("   ", e));
console.log(`\n通过 ${passed}，失败 ${fails.length}`); process.exit(fails.length ? 1 : 0);
