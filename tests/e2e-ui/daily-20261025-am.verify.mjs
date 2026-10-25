// 2026-10-25 早场验收：地图与地点页。用法：node x.mjs <端口> <截图目录> [before|after]
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
  await p.evaluate(() => document.querySelector('[data-route="map"]').click()); await p.waitForTimeout(900);
  await p.screenshot({ path: `${out}/${tag}-map.png`, fullPage: true });
  if (strict) {
    const n = await p.locator(".map-pack").count();
    check(n >= 2, `地图资料卡 ${n} 张`);
    check(await p.locator(".mux-summary").count() === 1, "页首摘要出现");
    check(await p.locator("[data-mux-jump]").count() === n, "每张卡一个跳转标签");
    const limits = await p.locator(".map-limit").allTextContents();
    check(limits.filter(t => t.includes("地形与连接已有定义")).length === 1, "共有说明只保留一份");
    check(await p.locator(".mux-folds").count() === n, "折叠并排容器齐全");
    check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "无横向滚动");
    if (w > 900) check(await p.evaluate(() => { const c=[...document.querySelectorAll(".map-pack")]; return c.length>1 && c[0].getBoundingClientRect().top === c[1].getBoundingClientRect().top; }), "桌面两列");
    await p.click('[data-mux-jump="2"]'); await p.waitForTimeout(900);
    check(await p.locator(".map-pack.is-flash, .map-pack").nth(2).evaluate(e => e.getBoundingClientRect().top < innerHeight), "点标签后滚到该卡");
    const d = p.locator(".map-pack").nth(2).locator("details.region-fold > summary").first();
    await d.click();
    check(await d.getAttribute("aria-expanded") === "true", "展开后 aria-expanded=true");
  }
  await p.close();
}
await b.close();
check(errors.length === 0, `页面报错 ${errors.length} 条`); errors.slice(0,8).forEach(e => console.log("   ", e));
console.log(`\n通过 ${passed}，失败 ${fails.length}`); process.exit(fails.length ? 1 : 0);
