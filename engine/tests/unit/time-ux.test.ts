/** UI 与交互第五轮（2026-10-20 晚）：日程估算、停下原因分类、推进小结的纯逻辑与接线。 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// @ts-ignore - plain browser module, no types
import { planCost, PRESETS, stopTone, runSummary } from "../../apps/web/public/time-ux.js";

const pub = (f: string) => readFileSync(new URL(`../../apps/web/public/${f}`, import.meta.url), "utf8");
const yard = { placeId: "place:yard", capacity: 8, food: { carried: false, here: false } };

test("日程估算：按服务端价目合计，雨雪天在田里劳动多 1 格，腿脚快头两趟走动不花时间", () => {
  const steps = ["go-hearth", "eat", "go-field", "tend", "go-home"];
  assert.equal(planCost(steps, yard).total, 7);
  const snow = planCost(steps, { ...yard, wet: true, sky: "雪" });
  assert.equal(snow.total, 8);
  assert.equal(snow.rows[3].note, "雪天户外 +1");
  assert.equal(planCost(steps, { ...yard, wet: true, ignoreWet: true }).total, 7, "能吃苦不受雨雪影响");
  const fleet = planCost(steps, { ...yard, freeWalks: 2 });
  assert.deepEqual(fleet.rows.map((r: { cost: number }) => r.cost), [0, 1, 0, 3, 1]);
});

test("日程估算：会让日程停下的排法在保存前就标出来", () => {
  const over = planCost(["go-field", "tend", "tend", "rest"], yard);
  assert.equal(over.fits, false);
  assert.match(over.warnings.at(-2).text, /多出 1 格：从第 4 项起/);
  const dup = planCost(["go-home"], yard);
  assert.match(dup.warnings[0].text, /已经在庭院/);
  const kiln = planCost(["pottery"], yard);
  assert.match(kiln.warnings[0].text, /先安排「去陶窑」/);
  assert.equal(planCost(["go-kiln", "pottery"], yard).warnings.filter((w: { level: string }) => w.level === "stop").length, 0);
  const hungry = planCost(["eat"], yard);
  assert.match(hungry.warnings[0].text, /手里没有熟食/);
  assert.equal(planCost(["eat"], { ...yard, food: { carried: true, here: false } }).warnings.length, 0, "随身带着熟食就能吃");
  assert.equal(planCost(["go-hearth", "eat"], yard).warnings.length, 0, "公用灶台每天都有熟食");
  assert.ok(planCost(["rest"], yard).warnings.some((w: { text: string }) => /不吃饭/.test(w.text)));
});

test("现成日程从庭院出发都走得通、排得下", () => {
  for (const p of PRESETS) {
    const r = planCost(p.steps, { ...yard, wet: true });
    assert.ok(r.fits, `${p.name} 超出 8 格`);
    assert.equal(r.warnings.filter((w: { level: string }) => w.level === "stop").length, 0, p.name);
  }
});

test("停下原因分三类，配不同的标题颜色", () => {
  assert.equal(stopTone("已暂停，控制权交还给你。"), "paused");
  assert.equal(stopTone("一次性日程已完成，控制权交还给你。"), "done");
  assert.equal(stopTone("人物已满 18 岁，有新的成长选择值得留意。"), "milestone");
  assert.equal(stopTone("日程暂停：附近无可食用粮食，也没有随身熟食。"), "attention");
  assert.equal(stopTone("饥饿已达到极限，需要你安排食物。"), "attention");
});

test("推进小结：天数、日期、饥饿变化、日程做了什么（走动合并）", () => {
  const clock = (d: number) => ({ season: "冬", monthOfYear: 1, dayOfMonth: d });
  const a = { tick: 10, clock: clock(1), character: { age: 16 }, settlement: { hunger: 1, placeName: "陶家庭院" } };
  const b = { tick: 14, clock: clock(5), character: { age: 16 }, settlement: { hunger: 3, placeName: "陶家庭院" } };
  const s = runSummary(a, b, ["go-hearth", "eat", "go-field", "tend", "go-home", "go-hearth", "eat"], "已暂停，控制权交还给你。");
  assert.equal(s.days, 4);
  assert.equal(s.from, "冬 · 1 月 1 日");
  assert.equal(s.to, "冬 · 1 月 5 日");
  assert.deepEqual(s.deeds, ["吃饭 ×2", "劳动 ×1", "村里走动 ×4"]);
  assert.deepEqual(s.changes, [{ label: "饥饿", from: 1, to: 3, tone: "bad" }]);
  assert.equal(s.tone, "paused");
});

test("接线：app.js 引入 time-ux.js 并广播状态和推进事件；推进条按钮不受忙碌态屏蔽", () => {
  const app = pub("app.js");
  assert.match(app, /import "\/time-ux\.js";/);
  assert.match(app, /openlife:state/);
  for (const phase of ["start", "batch", "end"]) assert.match(app, new RegExp(`phase: "${phase}"`));
  assert.match(app, /if \(!ended\.handled\) showToast\(endMessage\)/);
  assert.match(pub("time-ux.css"), /\.is-busy \.time-run-bar button \{ pointer-events: auto/);
});
