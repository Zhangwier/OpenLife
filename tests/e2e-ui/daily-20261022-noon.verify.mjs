// 每日 UI 优化 2026-10-22 午场验收：手机「资料页」切换条 + 「地图与地点」页。
// 用法：node daily-20261022-noon.verify.mjs <端口> <截图目录> [before|after]
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
const KNOWN_MISSING = ["/art/scene-"]; // 基线原本就缺的插画（文字模式不显示），不算本场引入
const fails = [], errors = [], knownMissing = new Set();
let passed = 0;
const check = (ok, msg) => { if (!ok) { fails.push(msg); console.log("  ✗", msg); } else { passed++; console.log("  ✓", msg); } };
const SHARED_LIMIT = "地形与连接已有定义；居民、房屋内部、可交互物体和衣物尚未随地图包填充。";

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
  await page.evaluate((t) => { localStorage.clear(); localStorage.setItem("openlife-theme", t); localStorage.setItem("openlife-coach-dismissed", "1"); }, theme);
  await page.reload();
  await page.waitForTimeout(900);
  await page.click("#homeNewLife");
  await page.waitForTimeout(400);
  await page.click("#newLifeForm button[type=submit]");
  await page.waitForSelector("body[data-screen=activities]", { timeout: 15000 });
  await page.waitForTimeout(1200);

  const go = async (route) => {
    await page.evaluate((r) => window.dispatchEvent(new CustomEvent("openlife:navigate", { detail: r })), route);
    await page.waitForTimeout(500);
  };
  const R = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom, r: r.right, hidden: e.hidden || cs.display === "none" || r.width === 0 }; }, sel);
  const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

  // ---------- 题目二：地图与地点 ----------
  await go("map");
  await page.waitForSelector("#screen-map .map-pack", { timeout: 15000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: `${out}/${tag}-1-map.png` });
  if (strict) {
    check(await page.evaluate(() => document.getElementById("screen-map").classList.contains("atlas")), "地图页挂上新排版");
    const summary = await page.textContent("#screen-map .atlas-summary").catch(() => "");
    check(/\d+ 片地图/.test(summary) && /共 \d+ 个地点/.test(summary), `页首总览：${summary}`);
    const packs = await page.locator("#screen-map .map-pack").count();
    check(summary.includes(`${packs} 片地图`), `总览片数与地图卡数一致（${packs}）`);
    const visibleOk = await page.evaluate(() => [...document.querySelectorAll("#screen-map .module-status")].filter((e) => e.textContent.includes("结构校验通过") && e.getClientRects().length).length);
    check(visibleOk === 0, "「结构校验通过」不再显示");
    const repeats = await page.evaluate((s) => [...document.querySelectorAll("#screen-map .map-limit")].filter((e) => e.getClientRects().length && e.textContent.includes(s)).length, SHARED_LIMIT);
    check(repeats === 0, "重复的限制句不再每张卡都写");
    check((await page.locator("#screen-map .atlas-note").count()) === 1, "限制只在页首说一次");
    const pill = await page.evaluate(() => { const s = document.querySelector("#screen-map .map-counts span"); const cs = getComputedStyle(s); return { border: cs.borderTopWidth, b: !!s.querySelector("b") }; });
    check(pill.border === "0px" && pill.b, "数量从药丸改成数字读数");
    const f = await page.evaluate(() => { const row = document.querySelector("#screen-map .atlas-folds[data-count='2']"); if (!row) return null; const [a, b] = row.querySelectorAll(":scope > details > summary"); return { ay: a.getBoundingClientRect().y, by: b.getBoundingClientRect().y, ax: a.getBoundingClientRect().x, bx: b.getBoundingClientRect().x }; });
    check(f && Math.abs(f.ay - f.by) < 1 && f.bx > f.ax, "两个折叠钮并排一行");
    if (!phone) {
      const two = await page.evaluate(() => { const p = [...document.querySelectorAll("#screen-map .map-pack")]; const a = p[0].getBoundingClientRect(), b = p[1].getBoundingClientRect(); return Math.abs(a.y - b.y) < 1 && b.x > a.right - 1; });
      check(two, "桌面地图卡两列排");
    } else {
      const w = await R("#screen-map .map-pack");
      check(w.w > width - 40, "手机地图卡占满一列");
    }
    const h0 = await page.evaluate(() => document.documentElement.scrollHeight);
    check(h0 > 0, `地图页总高 ${h0}px`);
    check(await noHScroll(), "地图页无横向滚动");
  }
  // 打开第一张有两个折叠的卡里的「区域」
  await page.evaluate(() => { const d = document.querySelector("#screen-map .map-pack details.region-fold:not(.event-fold)"); if (d) { d.open = true; d.scrollIntoView({ block: "start" }); scrollBy(0, -120); } });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${tag}-2-map-open.png` });
  if (strict) {
    const open = await page.evaluate(() => { const d = document.querySelector("#screen-map .map-pack details.region-fold[open]"); const row = d.parentElement; return Math.abs(d.getBoundingClientRect().width - row.getBoundingClientRect().width) < 2; });
    check(open, "展开的折叠占满整行");
    if (!phone) {
      const full = await page.evaluate(() => { const p = document.querySelector("#screen-map details.region-fold[open]").closest(".map-pack"); return p.getBoundingClientRect().width > document.getElementById("screen-map").getBoundingClientRect().width - 2; });
      check(full, "桌面：展开的那张卡占满两列");
    }
  }
  await page.evaluate(() => document.querySelectorAll("#screen-map details[open]").forEach((d) => (d.open = false)));
  await page.evaluate(() => scrollTo(0, 0));

  // ---------- 题目一：资料页切换条 ----------
  if (strict) {
    const strip = await R("#refNav");
    if (!phone) {
      check(!strip || strip.hidden, "桌面不显示切换条（侧栏已有）");
    } else {
      check(strip && !strip.hidden, "手机地图页出现资料页切换条");
      const cur = await page.textContent("#refNav [aria-current=page]");
      check(cur?.trim() === "地图", `切换条高亮当前页（${cur?.trim()}）`);
      const sel = await page.evaluate(() => [...document.querySelectorAll("#appNavigation > button.selected")].map((b) => b.dataset.route));
      check(sel.length === 1 && sel[0] === "character", `底栏只亮「人生」（${sel.join(",")}）`);
      const chips = await page.evaluate(() => [...document.querySelectorAll("#refNav button")].map((b) => b.getBoundingClientRect().height));
      check(chips.length === 7 && chips.every((h) => h >= 40), `7 个入口、每个 ≥40px 高`);
      check(await noHScroll(), "切换条不撑出横向滚动");
    }
  }
  if (phone) {
    await go("family");
    await page.screenshot({ path: `${out}/${tag}-3-family-strip.png` });
    await go("stories");
    await page.screenshot({ path: `${out}/${tag}-4-stories-strip.png` });
    await page.evaluate(() => scrollTo(0, 900));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/${tag}-5-stories-scrolled.png` });
    if (strict) {
      const s = await R("#refNav"), top = await R(".topbar");
      check(Math.abs(s.y - top.b) < 2, `往下翻后切换条粘在顶栏下（${Math.round(s.y)} / ${Math.round(top.b)}）`);
      const sel = await page.evaluate(() => [...document.querySelectorAll("#appNavigation > button.selected")].map((b) => b.dataset.route));
      check(sel.join() === "character", "故事页底栏也亮「人生」");
      await page.click("#refNav button[data-route=history]");
      await page.waitForTimeout(500);
      check(await page.evaluate(() => document.body.dataset.screen === "history"), "点「记忆」切到记忆与历史");
      check((await page.textContent("#refNav [aria-current=page]"))?.trim() === "记忆", "切换后高亮跟着走");
      await page.focus("#refNav button[data-route=history]");
      await page.keyboard.press("ArrowRight");
      check(await page.evaluate(() => document.activeElement?.dataset.route === "codex"), "→ 键把焦点移到下一项");
      await page.keyboard.press("Home");
      check(await page.evaluate(() => document.activeElement?.dataset.route === "activities"), "Home 键回到第一项");
      await go("codex");
      const vis = await page.evaluate(() => { const t = document.querySelector("#refNav .ref-nav-track"), c = document.querySelector("#refNav .is-current"); const a = t.getBoundingClientRect(), b = c.getBoundingClientRect(); return b.x >= a.x - 1 && b.right <= a.right + 1; });
      check(vis, "最后一项「图鉴」自动滚进可见区");
      await page.screenshot({ path: `${out}/${tag}-6-codex-strip.png` });
      await page.click("#refNav .ref-back");
      await page.waitForTimeout(500);
      check(await page.evaluate(() => document.body.dataset.screen === "activities"), "「‹ 此刻」回到此刻");
      check((await R("#refNav")).hidden, "此刻页不显示切换条");
      const sel2 = await page.evaluate(() => [...document.querySelectorAll("#appNavigation > button.selected")].map((b) => b.dataset.route));
      check(sel2.join() === "activities", "回到此刻后底栏亮「此刻」");
      await go("works");
      const sel3 = await page.evaluate(() => [...document.querySelectorAll("#appNavigation > button.selected")].map((b) => b.dataset.route));
      check(sel3.join() === "works" && (await R("#refNav")).hidden, "主页面（行囊）不受影响");
    }
  } else {
    await go("family");
    await page.screenshot({ path: `${out}/${tag}-3-family.png` });
  }
  await page.close();
}
await browser.close();
console.log(`\n通过 ${passed} 项；失败 ${fails.length} 项；页面报错 ${errors.length}`);
if (knownMissing.size) console.log("基线已知缺失（不计）：", [...knownMissing].join(", "));
for (const e of errors) console.log("  报错:", e);
for (const f of fails) console.log("  失败:", f);
process.exit(strict && (fails.length || errors.length) ? 1 : errors.length ? 1 : 0);
