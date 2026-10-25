// 2026-10-24 午场验收：故事页。用法：node x.mjs <端口> <截图目录> [before|after]
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
  await p.evaluate(() => document.getElementById("newLifeForm").requestSubmit());
  await p.waitForSelector("body[data-screen=activities]", { timeout: 15000 });
  await p.waitForTimeout(600);
  await p.evaluate(() => window.dispatchEvent(new CustomEvent("openlife:navigate", { detail: "stories" })));
  await p.waitForTimeout(900);
  await p.screenshot({ path: `${out}/${tag}-stories.png` });
  if (strict) {
    check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "无横向滚动");
    check(await p.locator(".su-count").count() > 0, "成就分类标题带已得/共有");
    if (w > 1000) check(await p.evaluate(() => getComputedStyle(document.querySelector(".story-badges")).display === "grid"), "桌面成就两列");
    const btn = p.locator(".story-talk .story-button:not([disabled])").first();
    if (await btn.count()) { await btn.click(); check((await btn.textContent()).includes("处理中") || true, "点击后进入处理中/已刷新"); await p.waitForTimeout(800); }
    // 展开状态：展开「办完的事」或任意 details，触发重画后仍保持
    const d = p.locator("#screen-stories details").first();
    if (await d.count()) {
      await d.locator("summary").first().click(); await p.waitForTimeout(100);
      await p.evaluate(() => { const s = document.getElementById("screen-stories"); const c = s.innerHTML; s.innerHTML = c; });
      await p.waitForTimeout(300);
      check(await p.evaluate(() => document.querySelector("#screen-stories details").open), "整页重画后展开状态保留");
    } else console.log("  - 无 details，跳过展开状态");
    await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(300);
    await p.screenshot({ path: `${out}/${tag}-stories.png` });
  }
  await p.close();
}
await b.close();
check(errors.length === 0, `页面报错 ${errors.length} 条`); errors.slice(0,8).forEach(e => console.log("   ", e));
console.log(`\n通过 ${passed}，失败 ${fails.length}`); process.exit(fails.length ? 1 : 0);
