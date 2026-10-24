import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ordinal, stepsMarkup } from "../../apps/web/public/people-ux.js";

test("序数：前十位用汉字，之后用数字", () => {
  assert.equal(ordinal(0), "第一位");
  assert.equal(ordinal(9), "第十位");
  assert.equal(ordinal(10), "第 11 位");
});
test("三步路标共三项且首项高亮", () => {
  const m = stepsMarkup();
  assert.equal((m.match(/<li/g) ?? []).length, 3);
  assert.match(m, /is-first/);
});
test("接线：index.html 在 scene-ux.js 之前加载 people-ux.js，样式只用令牌", () => {
  const html = fs.readFileSync("apps/web/public/index.html", "utf8");
  assert.ok(html.indexOf("/people-ux.js") > 0 && html.indexOf("/people-ux.js") < html.indexOf("/scene-ux.js"));
  const css = fs.readFileSync("apps/web/public/people-ux.css", "utf8");
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
});
