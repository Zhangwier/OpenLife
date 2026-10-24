import test from "node:test";
import assert from "node:assert/strict";
// @ts-ignore
import { detailKey } from "../../apps/web/public/stories-ux.js";

test("展开状态键：去掉括号里会变的数字", () => {
  assert.equal(detailKey("办完的事（3）"), detailKey("办完的事（4）"));
});
test("展开状态键：不同小节不同键", () => {
  assert.notEqual(detailKey("交情怎么涨 · 涨了有什么"), detailKey("办完的事（3）"));
});
test("展开状态键：空值不炸", () => { assert.equal(detailKey(undefined), ""); });
