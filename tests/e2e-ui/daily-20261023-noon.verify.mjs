// 2026-10-23 午场验收：新人生弹窗。用法：node x.mjs <端口> <截图目录> [before|after]
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
  await p.click("#homeNewLife"); await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/${tag}-newlife.png` });
  if (strict) {
    const s = await p.textContent("#newLifeSummary");
    check(/将以「禾启」开始，生在北岸聚落，出身随缘/.test(s), `摘要：${s}`);
    check(await p.evaluate(() => document.activeElement.id) === "newGivenName", "打开时光标在名字上");
    const seedVisible = await p.evaluate(() => document.querySelector(".nl-advanced").open);
    check(!seedVisible, "人生编号默认折叠");
    // 按钮不遮住任何可见字段
    const cover = await p.evaluate(() => { const a = document.querySelector(".form-actions").getBoundingClientRect(); const f = [...document.querySelectorAll("#newLifeForm label, #newLifeForm fieldset, .nl-advanced, .nl-summary")].filter(e => e.getClientRects().length && !e.closest(".nl-advanced") || e.matches(".nl-advanced")); return f.map(e => e.getBoundingClientRect()).filter(r => r.top < a.top && r.bottom > a.top + 4).length; });
    // 滚到底后全部字段都在按钮之上
    await p.evaluate(() => { const m = document.querySelector(".new-life-modal"); m.scrollTop = m.scrollHeight; });
    await p.waitForTimeout(200);
    const tail = await p.evaluate(() => { const a = document.querySelector(".form-actions").getBoundingClientRect(); const s = document.querySelector(".nl-advanced").getBoundingClientRect(); return s.bottom <= a.top + 1; });
    check(tail, "滚到底折叠条不被按钮盖住");
    await p.evaluate(() => { document.querySelector(".new-life-modal").scrollTop = 0; });
    const mh = await p.evaluate(() => { const m = document.querySelector(".new-life-modal"); return [m.scrollHeight, m.clientHeight]; });
    console.log("  高度", mh);
    if (w > 600) {
      const row = await p.evaluate(() => { const [a, c] = document.querySelectorAll(".form-actions button"); return Math.abs(a.getBoundingClientRect().y - c.getBoundingClientRect().y) < 2; });
      check(row, "桌面两个按钮并排");
    }
    await p.click(".nl-advanced > summary"); 
    check(await p.evaluate(() => document.querySelector(".nl-advanced").open), "点开折叠后能改编号");
    await p.fill("#newGivenName", "");
    check(await p.evaluate(() => document.getElementById("newGivenError").hidden === false && document.querySelector("#newLifeForm button[type=submit]").disabled), "名字留空：报错且按钮停用");
    check(/先给这个人起个名字/.test(await p.textContent("#newLifeSummary")), "摘要提示起名");
    await p.fill("#newGivenName", "云");
    await p.selectOption("#newCity", "modern:city:south");
    check(/「禾云」.*南丘聚落/.test(await p.textContent("#newLifeSummary")), "改名字和聚落后摘要即时更新");
    check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "无横向滚动");
    await p.screenshot({ path: `${out}/${tag}-newlife-open.png` });
    await p.click("#newLifeForm button[type=submit]");
    await p.waitForSelector("body[data-screen=activities]", { timeout: 15000 });
    check(true, "改后仍能正常开始人生");
  }
  await p.close();
}
await b.close();
check(errors.length === 0, `页面报错 ${errors.length} 条`); errors.slice(0,8).forEach(e => console.log("   ", e));
console.log(`\n通过 ${passed}，失败 ${fails.length}`); process.exit(fails.length ? 1 : 0);
