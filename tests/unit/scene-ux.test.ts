/** UI 与交互第二轮（2026-10-20）：结果条、状态条变化、故事页折叠、行囊空位的纯逻辑与接线。 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// @ts-ignore - plain browser module, no types
import { hudDeltas, freeSlots } from "../../apps/web/public/scene-ux.js";
// @ts-ignore - plain browser module, no types
import { actionIconName } from "../../apps/web/public/icons.js";

const pub = (f: string) => readFileSync(new URL(`../../apps/web/public/${f}`, import.meta.url), "utf8");

test("状态条变化：饥饿升高是坏事，屋顶修好是好事，活动格只是提示", () => {
  const d = hudDeltas({ 饥饿: 2, 今天: 8, 屋顶: 0, 负重: 1.2 }, { 饥饿: 3, 今天: 7, 屋顶: 2, 负重: 1.2 });
  assert.deepEqual(d, [
    { label: "饥饿", delta: 1, tone: "bad" },
    { label: "今天", delta: -1, tone: "neutral" },
    { label: "屋顶", delta: 2, tone: "good" },
  ]);
  assert.deepEqual(hudDeltas({ 负重: 1.24 }, { 负重: 1.26 }), [], "小于 0.1 的浮动不标");
  assert.deepEqual(hudDeltas({}, { 饥饿: 3 }), [], "第一次出现的项不算变化");
});

test("行囊空位：从「2/4件」算出还能装 2 件", () => {
  assert.equal(freeSlots("2/4件"), 2);
  assert.equal(freeSlots("4 / 4 件"), 0);
  assert.equal(freeSlots(""), 0);
});

test("送礼动作有自己的图标", () => {
  assert.equal(actionIconName({ id: "settlement-locations.gift" }), "gift");
  assert.match(pub("icons.js"), /gift: '<path/);
});

test("移动面板：村里免费的步行不再标成「屋内」", () => {
  assert.match(pub("settlement.js"), /action\.id === "world-space\.move_within" \? '屋内' : '不花时间'/);
});

test("第二轮脚本在页面最后加载，并自己挂上样式表", () => {
  // 仓库在 Windows 上检出为 CRLF；断言的是「脚本是最后一个元素」，不该被行尾差异判失败。
  const html = pub("index.html").replace(/\r\n/g, "\n").trimEnd();
  assert.ok(html.endsWith('<script type="module" src="/scene-ux.js"></script>\n</body></html>'), html.slice(-160));
  assert.match(pub("scene-ux.js"), /link\.href = "\/scene-ux\.css"/);
});
