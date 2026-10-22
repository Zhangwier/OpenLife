/** 每日 UI 优化 2026-10-22 午场：手机资料页切换条（refnav-ux）与「地图与地点」页（atlas-ux）。 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// @ts-ignore - plain browser module, no types
import { REF_ROUTES, refNavModel, phoneNavRoute, chipScrollLeft, nextIndex } from "../../apps/web/public/refnav-ux.js";
// @ts-ignore - plain browser module, no types
import { SHARED_LIMIT, parseCount, ownLimitText, atlasSummary } from "../../apps/web/public/atlas-ux.js";

const pub = (f: string) => readFileSync(new URL(`../../apps/web/public/${f}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("切换条：只在六个资料页出现，第一格是「‹ 此刻」，当前页唯一高亮", () => {
  assert.equal(refNavModel("activities"), null);
  assert.equal(refNavModel("works"), null);
  assert.equal(refNavModel("home"), null);
  const m = refNavModel("map");
  assert.equal(m.length, 7);
  assert.deepEqual(m[0], { route: "activities", label: "此刻", back: true, current: false });
  assert.deepEqual(m.filter((x: any) => x.current).map((x: any) => x.route), ["map"]);
});

test("切换条的六页都是 index.html 侧栏「更多资料」里真有的路由", () => {
  const html = pub("index.html");
  const more = html.slice(html.indexOf('<details class="nav-more">'), html.indexOf("</details>", html.indexOf('<details class="nav-more">')));
  for (const [route] of REF_ROUTES) assert.ok(more.includes(`data-route="${route}"`), route);
});

test("手机底栏：资料页统一亮「人生」，主页面不干预", () => {
  for (const [route] of REF_ROUTES) assert.equal(phoneNavRoute(route), "character");
  for (const route of ["activities", "works", "people", "character", "home"]) assert.equal(phoneNavRoute(route), null);
});

test("当前格滚动：已可见不动；右侧看不见只滚到刚好露出；不越界", () => {
  assert.equal(chipScrollLeft(200, 60, 390, 600, 0), 0, "可见就不动，保住「‹ 此刻」");
  assert.equal(chipScrollLeft(500, 60, 390, 600, 0), 182, "500+60+12-390");
  assert.equal(chipScrollLeft(530, 60, 390, 600, 0), 210, "不超过 scrollWidth-stripWidth");
  assert.equal(chipScrollLeft(20, 60, 390, 600, 150), 8, "左边看不见就往回滚");
  assert.equal(chipScrollLeft(5, 60, 390, 600, 150), 0, "不小于 0");
});

test("键盘：← → 循环，Home / End 到两端，其它键不动", () => {
  assert.equal(nextIndex("ArrowRight", 6, 7), 0);
  assert.equal(nextIndex("ArrowLeft", 0, 7), 6);
  assert.equal(nextIndex("Home", 4, 7), 0);
  assert.equal(nextIndex("End", 1, 7), 6);
  assert.equal(nextIndex("a", 3, 7), 3);
});

test("地图读数：数字和单位拆开", () => {
  assert.deepEqual(parseCount("2 个区域"), { n: 2, unit: "区域" });
  assert.deepEqual(parseCount("9 条连接"), { n: 9, unit: "连接" });
  assert.deepEqual(parseCount("40 个地点"), { n: 40, unit: "地点" });
  assert.equal(parseCount("没有数字"), null);
});

test("共同限制句：与 shell.js 原文一致，每张卡只留自己的话", () => {
  assert.ok(pub("shell.js").includes(SHARED_LIMIT), "shell.js 改了文案这里会提醒");
  assert.equal(ownLimitText(SHARED_LIMIT), "");
  assert.equal(ownLimitText(`${SHARED_LIMIT}这片地图记有 31 处值得留意的地方。`), "这片地图记有 31 处值得留意的地方。");
});

test("页首总览：片数、地点合计、留意处合计；没有留意处就不写", () => {
  assert.deepEqual(atlasSummary([{ regions: 2, places: 8, points: 0 }, { regions: 3, places: 12, points: 24 }]), ["2 片地图", "共 20 个地点", "24 处值得留意"]);
  assert.deepEqual(atlasSummary([{ regions: 1, places: 3, points: 0 }]), ["1 片地图", "共 3 个地点"]);
});

test("接线：pages-ux.js 引入两个模块，不改 index.html；样式只用令牌", () => {
  const pages = pub("pages-ux.js");
  assert.ok(pages.includes('import "./refnav-ux.js";') && pages.includes('import "./atlas-ux.js";'));
  assert.ok(!pub("index.html").includes("refnav-ux") && !pub("index.html").includes("atlas-ux"));
  for (const f of ["refnav-ux.css", "atlas-ux.css"]) {
    const css = pub(f).replace(/\/\*[\s\S]*?\*\//g, "");
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css), `${f} 不写死颜色`);
    assert.ok(!/box-shadow/.test(css), `${f} 不新增阴影`);
  }
});
