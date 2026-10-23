import test from "node:test";
import assert from "node:assert/strict";
// @ts-ignore
import { lifeSummary, nameProblem } from "../../apps/web/public/newlife-ux.js";

test("摘要：空名字提示先起名", () => {
  assert.equal(lifeSummary({ given: " ", family: "" }), "先给这个人起个名字。");
});
test("摘要：随缘出身", () => {
  assert.equal(lifeSummary({ given: "启", family: "禾", city: "北岸聚落", origin: "随缘（按人生编号抽取出身与天赋）" }), "将以「禾启」开始，生在北岸聚落，出身随缘。");
});
test("摘要：具体出身去掉括号说明", () => {
  assert.match(lifeSummary({ given: "启", family: "禾", city: "南丘聚落", origin: "渡口人家（带船）" }), /出身「渡口人家」/);
});
test("名字校验", () => {
  assert.equal(nameProblem(""), "名字不能空着。");
  assert.equal(nameProblem("启"), "");
});
