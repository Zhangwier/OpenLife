/**
 * 界面第一轮（状态条 / 导航 / 弹窗 / 新手引导）的静态守卫。
 *
 * 这些测试守的是「规矩」而不是「像素」：状态条不许把数值摆到画面上、四级
 * 导航各有一枚线条图标、手机底栏列数跟着实际入口数走、每个弹窗都登记了自己
 * 的关闭按钮。浏览器里的实际观感另见 docs/ui/UI_GUIDELINES.md 的手动验收清单。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// @ts-ignore - plain browser module, no types
import { hungerLevel, activityLevel, roofLevel, loadLevel, renderHud, hudSentence, hudTip } from "../../apps/web/public/hud.js";

const pub = (f: string) => readFileSync(new URL(`../../apps/web/public/${f}`, import.meta.url), "utf8");
// 仓库在 Windows 上检出为 CRLF，断言行尾前先统一，否则同一份文件在两台机器上判定不同。
const crlf = (s: string) => s.replace(/\r\n/g, "\n");
const html = crlf(pub("index.html"));
/** 画出来的部分：去掉 title 属性（那是悬停说明，不是画面文字）。 */
const visible = (out: string) => out.replace(/title="[^"]*"/g, "").replace(/<[^>]+>/g, "");

test("HUD: 越难受越红，且只有真影响干活才转危险色", () => {
  // 分级必须单调：从吃饱到饿极，tone 只会越来越重，不会来回跳。
  const order = { ok: 0, warn: 1, danger: 2 };
  const tones = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((h) => order[hungerLevel(h).tone]);
  assert.deepEqual(tones, [...tones].sort((a, b) => a - b), "饥饿分级不单调");
  // 4 分只是「有点饿」，不该报警；8 分起才真拖累劳动。
  assert.equal(hungerLevel(0).tone, "ok");
  assert.equal(hungerLevel(4).tone, "ok");
  assert.equal(hungerLevel(6).tone, "warn");
  assert.equal(hungerLevel(8).tone, "danger");
  assert.equal(hungerLevel(3, { sick: true }).word, "饿病了", "饿病了要单独说，不能只报分数");

  // 活动格：剩 1/4 以下才开始提醒，用完才算「做不动」。
  assert.equal(activityLevel(8, 8).tone, "ok");
  assert.equal(activityLevel(2, 8).tone, "warn");
  assert.equal(activityLevel(0, 8).tone, "warn");
  assert.equal(activityLevel(0, 8).word, "今天做不动了");

  assert.equal(roofLevel({ condition: 0, max: 10, leaking: true }).word, "在漏雨");
  assert.equal(roofLevel({ condition: 5, max: 10, leaking: false }).tone, "warn");
  assert.equal(roofLevel({ condition: 9, max: 10, leaking: false }).tone, "ok");
  assert.equal(roofLevel(null), null, "没有屋子就不谈屋顶");
  assert.deepEqual([1.2, 8, 10].map((m) => loadLevel({ mass: m, maxMass: 10 }).tone), ["ok", "warn", "danger"]);
});

test("HUD: 画面上没有数字，读屏才拿到数值", () => {
  const s = { hunger: 8, dailyActivity: { remaining: 1, capacity: 8 }, roof: { condition: 0, max: 10, leaking: true }, portableLoad: { mass: 2.84, maxMass: 10 } };
  const out = renderHud(s);
  assert.equal((out.match(/class="hud-item/g) || []).length, 4);
  assert.equal(visible(out).search(/[0-9]/), -1, `画面文字里不该出现数字：${visible(out)}`);
  assert.match(out, /hud-item danger/);
  assert.match(out, /屋顶<span class="hud-word">在漏雨/);

  // 读屏没有轻重感可依靠，必须给完整数值，并且和画面说的是同一件事。
  const said = hudSentence(s);
  for (const part of ["饥饿 8/10（饿得发慌）", "今天还剩 1/8 格活动时间", "屋顶 0/10（在漏雨）", "负重 2.8/10（背得动）"]) assert.ok(said.includes(part), part);
  for (const label of ["肚子", "今天", "屋顶", "身上"]) assert.ok(hudTip(label).length > 8, `${label} 缺悬停说明`);
  assert.ok(!renderHud({ hunger: 0 }).includes("屋顶"), "没有屋子就不显示屋顶");
});

test("导航：四个主页面各有线条图标，手机底栏列数跟着入口数走", () => {
  const nav = html.slice(html.indexOf('id="appNavigation"'), html.indexOf('<details class="nav-more"'));
  const routes = [...nav.matchAll(/data-route="([^"]+)"/g)].map((m) => m[1]);
  // 四个主页面按「玩家来这儿解决什么问题」分；故事是这四页里的组织方式，不是第五个入口。
  assert.deepEqual(routes, ["activities", "works", "people", "character"]);
  const css = pub("theme.css") + pub("ui-polish.css");
  for (const r of routes) assert.match(css, new RegExp(`#appNavigation button\\[data-route="${r}"\\] \\{ --icon:`), `${r} 缺图标`);
  // 底栏列数必须等于主入口数，否则会把「人生」挤到第二行压住内容。
  for (const block of [css.match(/@media \(max-width: 600px\)[\s\S]*?grid-template-columns: repeat\((\d+)/), css.match(/html\.is-phone\) #appNavigation[\s\S]*?repeat\((\d+)/)]) {
    assert.equal(Number(block?.[1]), routes.length, "手机底栏列数与主入口数不一致");
  }
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
