import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore
import { summarizeFamily } from "../../apps/web/public/family-ux.js";

test("单人家族不出摘要", () => {
  const s = summarizeFamily([{ current: true, alive: true, generation: 1 }]);
  assert.equal(s.text, ""); assert.equal(s.total, 1);
});
test("多人家族给出人数、在世数与代数", () => {
  const s = summarizeFamily([{ generation: 1, alive: false }, { generation: 2, alive: true, current: true }, { generation: 3, alive: true }]);
  assert.equal(s.text, "家族共 3 人，仍在生活 2 人，传到第 3 代。");
});
test("空列表安全", () => {
  assert.equal(summarizeFamily([]).total, 0);
});
