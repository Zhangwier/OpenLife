import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { SHARED_LIMIT, uniqueLimit, totals, summaryMarkup } from "../../apps/web/public/map-ux.js";

test("共有句被去掉，特有句保留", () => {
  assert.equal(uniqueLimit(SHARED_LIMIT), "");
  assert.equal(uniqueLimit(`${SHARED_LIMIT}这片地图记有 10 处值得留意的地方。`), "这片地图记有 10 处值得留意的地方。");
});
test("合计与摘要", () => {
  const packs = [{ label: "甲", regions: 2, locations: 8, edges: 9 }, { label: "乙", regions: 3, locations: 12, edges: 13 }];
  assert.deepEqual(totals(packs), { regions: 5, locations: 20, edges: 22 });
  const m = summaryMarkup(packs);
  assert.match(m, /<strong>2<\/strong> 套地图资料/);
  assert.equal((m.match(/data-mux-jump/g) ?? []).length, 2);
  assert.doesNotMatch(summaryMarkup(packs.slice(0, 1)), /mux-jump/);
});
test("接线：index.html 在 scene-ux.js 之前加载 map-ux.js，样式只用令牌", () => {
  const html = fs.readFileSync("apps/web/public/index.html", "utf8");
  assert.ok(html.indexOf("/map-ux.js") > 0 && html.indexOf("/map-ux.js") < html.indexOf("/scene-ux.js"));
  assert.doesNotMatch(fs.readFileSync("apps/web/public/map-ux.css", "utf8"), /#[0-9a-fA-F]{3,8}\b/);
});
