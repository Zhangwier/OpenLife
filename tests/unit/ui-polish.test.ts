/**
 * UI 与交互第一轮（2026-10-20）的静态守卫：状态条分级、导航图标、手机底栏、
 * 样式加载顺序、新手引导指向的元素都真实存在。浏览器行为另见 docs/ui/UI_GUIDELINES.md 的手动验收清单。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// @ts-ignore - plain browser module, no types
import { hungerLevel, activityLevel, roofLevel, loadLevel, renderHud, hudSentence, hudTip } from "../../apps/web/public/hud.js";

const pub = (f: string) => readFileSync(new URL(`../../apps/web/public/${f}`, import.meta.url), "utf8");
const html = pub("index.html");

test("HUD: 饥饿、活动格、屋顶、负重都分 ok / warn / danger 三档", () => {
  assert.deepEqual([0, 3, 4, 6, 7, 10].map((h) => hungerLevel(h).tone), ["ok", "ok", "warn", "warn", "danger", "danger"]);
  assert.deepEqual([8, 3, 2, 1, 0].map((r) => activityLevel(r, 8).tone), ["ok", "ok", "warn", "warn", "danger"]);
  assert.equal(roofLevel({ condition: 0, max: 10, leaking: true }).word, "在漏雨");
  assert.equal(roofLevel({ condition: 5, max: 10, leaking: false }).tone, "warn");
  assert.equal(roofLevel({ condition: 9, max: 10, leaking: false }).tone, "ok");
  assert.equal(roofLevel(null), null);
  assert.deepEqual([1.2, 8, 10].map((m) => loadLevel({ mass: m, maxMass: 10 }).tone), ["ok", "warn", "danger"]);
});

test("HUD: 画出来的和读屏读到的是同一组状态，每项都有说明", () => {
  const s = { hunger: 8, dailyActivity: { remaining: 1, capacity: 8 }, roof: { condition: 0, max: 10, leaking: true }, portableLoad: { mass: 2.84, maxMass: 10 } };
  const out = renderHud(s);
  assert.equal((out.match(/class="hud-item/g) || []).length, 4);
  assert.match(out, /hud-item danger" title="0 是吃饱/);
  assert.match(out, /屋顶<span class="hud-word">在漏雨/);
  assert.match(out, /<b>2\.8\/10<\/b>/);
  const said = hudSentence(s);
  for (const part of ["饥饿 8/10（饿了）", "剩 1/8 格", "屋顶 0/10（在漏雨）", "负重 2.8/10（轻松）"]) assert.ok(said.includes(part), part);
  for (const label of ["饥饿", "今天", "屋顶", "负重"]) assert.ok(hudTip(label).length > 8, label);
  assert.ok(!renderHud({ hunger: 0 }).includes("屋顶"), "没有屋子就不显示屋顶");
});

test("导航：每个主入口都有自己的线条图标，手机底栏列数等于入口数", () => {
  const nav = html.slice(html.indexOf('id="appNavigation"'), html.indexOf('<details class="nav-more"'));
  const routes = [...nav.matchAll(/data-route="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(routes, ["activities", "works", "people", "stories", "character"]);
  const css = pub("theme.css") + pub("ui-polish.css");
  for (const r of routes) assert.match(css, new RegExp(`#appNavigation button\\[data-route="${r}"\\] \\{ --icon:`), `${r} 缺图标`);
  const mobile = pub("ui-polish.css").match(/@media \(max-width: 600px\)[\s\S]*?grid-template-columns: repeat\((\d+)/);
  assert.equal(Number(mobile?.[1]), routes.length);
});

test("样式：ui-polish.css 最后加载，脚本在 app.js 之后", () => {
  const sheets = [...html.matchAll(/<link rel="stylesheet" href="\/([^"]+)"/g)].map((m) => m[1]);
  assert.equal(sheets.at(-1), "ui-polish.css");
  assert.ok(html.indexOf('src="/ui-polish.js"') > html.indexOf('src="/app.js"'));
});

test("对话框：Esc / 遮罩关闭走的都是弹窗自己的关闭按钮", () => {
  const js = pub("ui-polish.js");
  const map = js.match(/CLOSE_BUTTON = (\{[^}]+\})/)?.[1] || "{}";
  const pairs = [...map.matchAll(/(\w+): "(\w+)"/g)];
  assert.equal(pairs.length, document_modals().length, "每个弹窗都登记了关闭按钮");
  for (const [, modal, button] of pairs) {
    assert.ok(html.includes(`id="${modal}"`), modal);
    assert.ok(html.includes(`id="${button}"`), button);
  }
});
function document_modals() { return [...html.matchAll(/class="modal-backdrop" id="(\w+)"/g)].map((m) => m[1]); }

test("新手引导：三步指向的元素都存在，菜单里能重新打开", async () => {
  // @ts-ignore - plain browser module, no types
  const { COACH_STEPS, talentCountText } = await import("../../apps/web/public/ui-polish.js");
  assert.equal(COACH_STEPS.length, 3);
  const guide = pub("guide.js");
  for (const step of COACH_STEPS) assert.ok(html.includes(`id="${step.target}"`) || guide.includes(`card.id = "${step.target}"`), step.target);
  assert.ok(html.includes("data-coach-reopen"));
  assert.equal(talentCountText(1, 2, false), "已选 1 / 2");
  assert.equal(talentCountText(0, 2, true), "");
});
