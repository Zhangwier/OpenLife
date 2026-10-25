import test from "node:test";
import assert from "node:assert/strict";
// @ts-ignore
import { groupBag, summaryWord } from "../../apps/web/public/bag-ux.js";

test("同名物品叠成一摞，选中的那件作为显示项", () => {
  const g = groupBag([{ id: "a", name: "粟" }, { id: "b", name: "粟", pressed: true }, { id: "c", name: "陶罐" }]);
  assert.equal(g.length, 2);
  assert.equal(g[0].count, 2);
  assert.equal(g[0].show, "b");
  assert.equal(g[1].show, "c");
});
test("摘要：无叠放只写件数，有叠放写样数", () => {
  assert.equal(summaryWord([]), "");
  assert.equal(summaryWord(groupBag([{ id: "a", name: "粟" }, { id: "b", name: "罐" }])), "2 件");
  assert.equal(summaryWord(groupBag([{ id: "a", name: "粟" }, { id: "b", name: "粟" }])), "1 样 · 2 件");
});
