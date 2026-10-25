// 2026-10-24 合并场验收：家族谱页。用法：node x.mjs <端口> <截图目录> [before|after]
import { chromium } from "playwright";
import fs from "node:fs";
const [port, out, mode = "after"] = [process.argv[2] || "8787", process.argv[3] || "./shots", process.argv[4]];
const strict = mode === "after"; fs.mkdirSync(out, { recursive: true });
const BASE = `http://127.0.0.1:${port}/`;
const fails = [], errors = []; let passed = 0;
const check = (ok, m) => { if (!ok) { fails.push(m); console.log("  ✗", m); } else { passed++; console.log("  ✓", m); } };
const CASES = [["desktop",1366,800,"light"],["mobile",390,844,"light"],["desktop-dark",1366,800,"dark"],["mobile-dark",390,844,"dark"]];
const FAKE = `<div class="family-node"><strong>老 禾</strong><span>第 1 代 · 已进入家族史</span></div><div class="family-node"><strong>禾 母</strong><span>第 2 代 · 仍在生活</span></div><div class="family-node current"><strong>启 禾</strong><span>第 3 代 · 仍在生活</span></div><div class="family-node"><strong>小 禾</strong><span>第 4 代 · 仍在生活</span></div><div class="family-node"><strong>幼 禾</strong><span>第 4 代 · 仍在生活</span></div>`;
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
  await p.evaluate(() => window.dispatchEvent(new CustomEvent("openlife:navigate", { detail: "family" }))); await p.waitForTimeout(700);
  await p.screenshot({ path: `${out}/${tag}-family-solo.png`, fullPage: true });
  if (strict) {
    check(await p.locator("#familyTree .fux-you").count() === 1, "当前成员有「你」标签");
    check(await p.locator("#familyUxSummary").count() === 0, "单人不出摘要");
    check(await p.locator("#familyHandoff.fux-empty").count() === 1, "空的交棒区收起");
  }
  await p.evaluate(h => { document.getElementById("familyTree").innerHTML = h; }, FAKE); await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/${tag}-family-multi.png`, fullPage: true });
  if (strict) {
    check((await p.textContent("#familyUxSummary")) === "家族共 5 人，仍在生活 4 人，传到第 4 代。", "多人摘要正确");
    check(await p.locator(".fux-gone").count() === 1, "已进入家族史的成员淡显");
    check(await p.locator('#familyTree [role=listitem]').count() === 5 && (await p.getAttribute("#familyTree .current","aria-label")).includes("是你"), "读屏列表语义与「是你」");
    check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "页面无横向滚动");
    if (w < 600) check(await p.evaluate(() => { const t = document.getElementById("familyTree"); const c = t.querySelector(".current").getBoundingClientRect(); const r = t.getBoundingClientRect(); return c.left >= r.left - 2 && c.right <= r.right + 2; }), "手机上当前成员滚入视野");
  }
  await p.close();
}
await b.close();
check(errors.length === 0, `页面报错 ${errors.length} 条`); errors.slice(0,8).forEach(e => console.log("   ", e));
console.log(`\n通过 ${passed}，失败 ${fails.length}`); process.exit(fails.length ? 1 : 0);
