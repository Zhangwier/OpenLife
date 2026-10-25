// 2026-10-25 午场验收：行囊页。用法：node x.mjs <端口> <截图目录> [before|after]
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
  for (const r of ["works"]) { await p.evaluate(r => document.querySelector(`[data-route="${r}"]`)?.click(), r); await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}/${tag}-${r}.png`, fullPage: true }); }
  if (strict) {
    const vis = await p.locator(".portable-item:not([hidden])").count(); const all = await p.locator(".portable-item").count();
    check(all >= 2 && vis < all, `同名叠放：${all} 件 → ${vis} 格`);
    check(await p.locator(".bagx-count").count() >= 1, "叠放角标「N 份」");
    check(await p.locator(".bagx-summary").count() === 1, "标题下摘要一份");
    const t = await p.locator(".portable-item:not([hidden]) small:not([hidden])").allTextContents();
    check(!t.some(x => x.trim() === "在手中"), "格子不再重复「在手中」");
    check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "无横向滚动");
    await p.locator(".portable-item:not([hidden])").first().click(); await p.waitForTimeout(500);
    check(await p.locator(".portable-item[aria-pressed=true]:not([hidden])").count() === 1, "点开后选中格仍可见");
    const sm = p.locator(".collection-fold > summary"); await sm.click();
    check(await sm.getAttribute("aria-expanded") === "true", "作品折叠 aria-expanded");
    await p.screenshot({ path: `${out}/${tag}-works-open.png`, fullPage: true });
  }
  await p.close();
}
await b.close();
check(errors.length === 0, `页面报错 ${errors.length} 条`); errors.slice(0,8).forEach(e => console.log("   ", e));
console.log(`\n通过 ${passed}，失败 ${fails.length}`); process.exit(fails.length ? 1 : 0);
