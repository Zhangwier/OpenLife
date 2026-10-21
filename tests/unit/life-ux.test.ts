/** UI 与交互第四轮（2026-10-20 中午场）：图鉴地点名、做法搜索、认识阶段、生命线标记、加载态判断。 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { codex } from "../../apps/web/src/codex.ts";
// @ts-ignore - plain browser modules, no types
import { nowMarker, isLoadingText } from "../../apps/web/public/life-ux.js";

const pub = (f: string) => readFileSync(new URL(`../../apps/web/public/${f}`, import.meta.url), "utf8");

test("图鉴：做法地点写成名字，不再给出内部 space ID，也不再说「进入聚落后才能制作」", () => {
  // codex() 只读数据包，不碰模拟本身。
  const data = codex({} as never, "");
  assert.ok(data.recipes.length > 0);
  for (const r of data.recipes) {
    assert.doesNotMatch(r.where, /space:|@home/, r.id);
    assert.ok(r.placeId, `${r.id} 缺 placeId`);
    assert.ok(!r.reason.includes("进入聚落后才能制作"));
    assert.ok(r.reason.includes(r.where));
  }
});

test("生命线「此刻」：靠两端时贴边，中间居中，写出年龄", () => {
  assert.deepEqual(nowMarker(2, 0), { left: "2%", align: "start", text: "此刻 · 0 岁" });
  assert.equal(nowMarker(50, 45).align, "center");
  assert.equal(nowMarker(99, 89).align, "end");
  assert.equal(nowMarker(150, NaN).left, "100%");
  assert.equal(nowMarker(30, NaN).text, "此刻");
});

test("加载态：只把「正在…」认作加载，报错文字不算", () => {
  assert.ok(isLoadingText("正在读取地图资料…"));
  assert.ok(isLoadingText("  正在翻开图鉴…"));
  assert.ok(!isLoadingText("地图资料读取失败"));
});

test("人际阶段与 settlement-locations 的 contactLevel 用同一套说法", () => {
  const module = readFileSync(new URL("../../modules/settlement-locations/src/module.ts", import.meta.url), "utf8");
  assert.match(module, /count >= 3 \? "相识" : count > 0 \? "见过" : "陌生"/);
  assert.match(pub("player.js"), /CONTACT_STAGES = \["陌生", "见过", "相识"\]/);
  assert.match(pub("player.js"), /3 - Number\(conversations/);
});

test("第四轮脚本已挂上，图鉴搜索函数可用", async () => {
  assert.match(pub("index.html"), /<script type="module" src="\/life-ux\.js"><\/script>/);
  assert.match(pub("life-ux.js"), /link\.href = "\/life-ux\.css"/);
  assert.match(pub("codex.js"), /export function recipeMatches/);
});
