import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore
import { groupKey, filterLabel, FILTERS } from "../../apps/web/public/modules-ux.js";

test("按标题识别模块分组", () => {
  assert.equal(groupKey("核心 · 11"), "core");
  assert.equal(groupKey("当前世界已加载 · 29"), "on");
  assert.equal(groupKey("下次启动时关掉 · 2"), "off");
  assert.equal(groupKey("本地已有、当前未接入 · 20"), "idle");
  assert.equal(groupKey("别的"), "");
});
test("筛选条标签带数量", () => {
  assert.equal(filterLabel("on", 29), "可开关 29");
  assert.equal(FILTERS[0]![0], "all");
});
test("在无 document 的环境里导入不报错", () => {
  assert.equal(typeof (globalThis as any).document, "undefined");
});
