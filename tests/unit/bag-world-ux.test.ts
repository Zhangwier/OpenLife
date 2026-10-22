/** 每日 UI 优化 2026-10-22 合并场（pm）：行囊栏（bag-ux）与「时代与世界」页（world-ux）。 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// @ts-ignore - plain browser modules, no types
import { parseMeter, slotPips, stackWord, itemNote, groupItems, detailWhere } from "../../apps/web/public/bag-ux.js";
// @ts-ignore - plain browser modules, no types
import { isQuiet, quietSentence, QUIET_SECTIONS, SECTION_CLASSES } from "../../apps/web/public/world-ux.js";

const pub = (f: string) => readFileSync(new URL(`../../apps/web/public/${f}`, import.meta.url), "utf8");

test("行囊：从 title 读用量，读不到时不乱画", () => {
  assert.deepEqual(parseMeter("随身 2/4件"), { label: "随身", value: 2, max: 4, ratio: 0.5 });
  assert.equal(parseMeter("负重 1.2/10")?.ratio, 0.12);
  assert.equal(parseMeter("负重 12/10")?.ratio, 1);
  assert.equal(parseMeter("随身 装得下"), null);
  assert.equal(parseMeter("随身 1/0件"), null);
  assert.equal(parseMeter(undefined), null);
});

test("行囊：格子按占用画，最多 12 格", () => {
  assert.deepEqual(slotPips(2, 4), [true, true, false, false]);
  assert.deepEqual(slotPips(0, 3), [false, false, false]);
  assert.deepEqual(slotPips(9, 4), [true, true, true, true]);
  assert.equal(slotPips(10, 24).length, 12);
  assert.equal(slotPips(12, 24).filter(Boolean).length, 6);
  assert.deepEqual(slotPips(1, 0), []);
});

test("行囊：一摞用词说份数，不出现数字", () => {
  assert.equal(stackWord(1), "");
  assert.equal(stackWord(2), "两份");
  assert.equal(stackWord(5), "五份");
  assert.equal(stackWord(9), "好几份");
  for (let n = 2; n < 12; n++) assert.doesNotMatch(stackWord(n), /\d/);
});

test("行囊：卡片小字不再重复「在手中」，容器保留容量；只叠同名同状态的非容器", () => {
  assert.equal(itemNote("在手中"), "");
  assert.equal(itemNote("在手中 · 容量 1/3"), "容量 1/3");
  assert.equal(itemNote("挂在腰间"), "挂在腰间");
  const g = groupItems([
    { id: "a", name: "粟", note: "在手中", capacity: false },
    { id: "b", name: "粟", note: "在手中", capacity: false },
    { id: "c", name: "陶罐", note: "在手中 · 容量 0/3", capacity: true },
    { id: "d", name: "陶罐", note: "在手中 · 容量 0/3", capacity: true },
    { id: "e", name: "燧石", note: "在手中", capacity: false },
  ]);
  assert.deepEqual(g.map((x: { id: string }[]) => x.map((i) => i.id)), [["a", "b"], ["c"], ["d"], ["e"]]);
  assert.equal(detailWhere("在手中 · 当前位置：陶家庭院"), "随身带着 · 此刻在陶家庭院");
  assert.equal(detailWhere("别的句子"), "别的句子");
});

test("时代与世界：只有占位句的小节算「还没出现」，页尾句子读得通", () => {
  assert.equal(isQuiet([]), true);
  assert.equal(isQuiet([["subtle"]]), true);
  assert.equal(isQuiet([["knowledge-chip"], ["knowledge-chip"]]), false);
  assert.equal(isQuiet([["subtle"], ["tradition-item"]]), false);
  assert.equal(quietSentence([]), "");
  assert.equal(quietSentence(["时代人物"]), "时代人物");
  assert.equal(quietSentence(["时代人物", "思想与学派", "后世仍记得的人"]), "时代人物、思想与学派和后世仍记得的人");
});

test("时代与世界：登记的小节和内容 id 都真实存在于 index.html", () => {
  const html = pub("index.html");
  for (const cls of SECTION_CLASSES) assert.match(html, new RegExp(`class="${cls}"`), cls);
  for (const [, id] of QUIET_SECTIONS) assert.match(html, new RegExp(`id="${id}"`), id);
});

test("接线：app.js 引入两个新模块，样式只用令牌，不加新阴影", () => {
  const app = pub("app.js");
  assert.match(app, /import "\/bag-ux\.js";/);
  assert.match(app, /import "\/world-ux\.js";/);
  for (const f of ["bag-ux.css", "world-ux.css"]) {
    const css = pub(f).replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,6}\b/, `${f} 有写死的颜色`);
    assert.doesNotMatch(css, /box-shadow/, `${f} 新增了阴影`);
  }
  // 行囊「不给数字」的规矩：新模块不往屏幕上写件数、重量。
  const bag = pub("bag-ux.js");
  assert.doesNotMatch(bag, /\$\{info\.(value|max)\}/);
});
