/** 每日 UI 优化 2026-10-22 早场：「此刻」页布局（now-ux）与新手引导导览（coach-ux）。 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// @ts-ignore - plain browser module, no types
import { placeTip, stepLabels, nextVisible } from "../../apps/web/public/coach-ux.js";
// @ts-ignore - plain browser module, no types
import { NOW_TWO_COLUMN, NOW_COLUMN_MAX } from "../../apps/web/public/now-ux.js";
// @ts-ignore - plain browser module, no types
import { COACH_STEPS } from "../../apps/web/public/ui-polish.js";

const pub = (f: string) => readFileSync(new URL(`../../apps/web/public/${f}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const view = { width: 1366, height: 800 };
const tip = { width: 340, height: 160 };

test("导览气泡：桌面优先放目标下方，左边和目标对齐", () => {
  const p = placeTip({ top: 100, left: 280, width: 1000, height: 300 }, view, tip, { phone: false });
  assert.equal(p.side, "below");
  assert.equal(p.top, 412);
  assert.equal(p.left, 280);
  assert.equal(p.width, 340);
});

test("导览气泡：下方放不下放上方，都放不下贴底；不出右边界", () => {
  assert.equal(placeTip({ top: 500, left: 280, width: 600, height: 200 }, view, tip, { phone: false }).side, "above");
  const dock = placeTip({ top: 60, left: 1200, width: 160, height: 700 }, view, tip, { phone: false });
  assert.equal(dock.side, "dock");
  assert.ok(dock.left + dock.width <= view.width - 12, "右边不出界");
  assert.ok(dock.top + tip.height <= view.height, "底边不出界");
});

test("导览气泡：手机贴在底栏上方，左右留 8px", () => {
  const p = placeTip({ top: 100, left: 12, width: 366, height: 200 }, { width: 390, height: 844 }, tip, { phone: true, navH: 68 });
  assert.equal(p.side, "dock");
  assert.equal(p.left, 8);
  assert.equal(p.width, 374);
  assert.equal(p.top + tip.height, 844 - 68 - 8);
});

test("导览文字：第几步、上一步只在第二步起出现、最后一步是完成", () => {
  assert.deepEqual(stepLabels(0, 3), { count: "第 1 步 / 共 3 步", prev: "", next: "下一步" });
  assert.equal(stepLabels(1, 3).prev, "上一步");
  assert.equal(stepLabels(2, 3).next, "完成，开始生活");
});

test("导览跳过当前页面看不到的目标", () => {
  const seen = (i: number) => i !== 1;
  assert.equal(nextVisible(1, 1, seen, 3), 2);
  assert.equal(nextVisible(1, -1, seen, 3), 0);
  assert.equal(nextVisible(0, 1, () => false, 3), -1);
});

test("导览步骤沿用 ui-polish.js 的三步，没有另起一份", () => {
  assert.equal(COACH_STEPS.length, 3);
  assert.match(pub("coach-ux.js"), /import \{ COACH_STEPS \} from "\.\/ui-polish\.js"/);
  assert.match(pub("coach-ux.js"), /openlife-coach-dismissed|\.coach-done/);
});

test("接线：两个脚本在 scene-ux.js 之前加载，各自挂样式表", () => {
  const html = pub("index.html");
  const at = (s: string) => html.indexOf(`<script type="module" src="/${s}"></script>`);
  assert.ok(at("now-ux.js") > at("ui-polish.js") && at("now-ux.js") < at("scene-ux.js"));
  assert.ok(at("coach-ux.js") > at("now-ux.js") && at("coach-ux.js") < at("scene-ux.js"));
  assert.match(pub("now-ux.js"), /link\.href = "\/now-ux\.css"/);
  assert.match(pub("coach-ux.js"), /link\.href = "\/coach-ux\.css"/);
});

test("此刻页布局：两栏断点、列宽和 JS 常量一致，右栏放身边的事和心事", () => {
  const css = pub("now-ux.css");
  assert.ok(css.includes(`@media (min-width: ${NOW_TWO_COLUMN.min}px) and (max-width: ${NOW_TWO_COLUMN.max}px)`));
  assert.ok(css.includes(`--now-col: ${NOW_COLUMN_MAX}px`));
  assert.match(css, /"log feed" "log hopes"/);
  // ≥1600 交给 pages-ux.js 的大屏右栏，两栏规则不能越过 1599
  assert.match(pub("pages-ux.js"), /min-width: 1600px/);
});

test("样式只用令牌：除了压暗色这一处定义，不写死颜色", () => {
  for (const f of ["now-ux.css", "coach-ux.css"]) {
    const bare = pub(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/var\([^()]*(\([^()]*\))?[^()]*\)/g, "").replace(/--coach-dim: [^;]+;/, "").replace(/inset 0 2px 4px rgba\(0,0,0,\.12\)/, "");
    assert.doesNotMatch(bare, /#[0-9a-f]{3,8}\b|rgba?\(/i, `${f} 里有写死的颜色`);
  }
});
