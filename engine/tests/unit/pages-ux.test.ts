/** UI 与交互第三轮（2026-10-20）：错误文案、模块搜索、历史默认说明，以及深色模式与加载接线。 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// @ts-ignore - plain browser module, no types
import { friendlyError, OFFLINE_TEXT, matchModule, DEFAULT_HISTORY_NOTE } from "../../apps/web/public/pages-ux.js";

const pub = (f: string) => readFileSync(new URL(`../../apps/web/public/${f}`, import.meta.url), "utf8");

test("网络错误换成中文，游戏自己的拒绝理由原样保留", () => {
  assert.equal(friendlyError("Failed to fetch"), OFFLINE_TEXT);
  assert.equal(friendlyError("NetworkError when attempting to fetch resource."), OFFLINE_TEXT);
  assert.equal(friendlyError("Load failed"), OFFLINE_TEXT);
  assert.equal(friendlyError("今日剩余 0 格活动时间，不足 1 格"), "今日剩余 0 格活动时间，不足 1 格");
});

test("模块搜索：多个词都要命中，大小写不敏感，空词全显示", () => {
  assert.ok(matchModule("陶器窑场 settlement-kiln", "陶"));
  assert.ok(matchModule("Village Stories 故事层", "village 故事"));
  assert.ok(!matchModule("Village Stories 故事层", "village 陶"));
  assert.ok(matchModule("任何东西", "  "));
});

test("历史默认说明与 app.js 的文案一致（改了文案这里会提醒）", () => {
  assert.ok(pub("app.js").includes(`"${DEFAULT_HISTORY_NOTE}"`));
});

test("深色模式：手动深色和跟随系统两种写法都覆盖了图鉴卡片与故事按钮", () => {
  const css = pub("pages-ux.css");
  for (const sel of [".codex-card", ".codex-text", ".story-button:not(.is-primary)"]) {
    assert.ok(css.includes(`:root[data-theme="dark"] ${sel}`), sel);
    assert.ok(css.includes(`:root:not([data-theme="light"]) ${sel}`), sel);
  }
});

test("第三轮脚本在 <head> 里最先加载，能接住 app.js 的第一次读取", () => {
  const html = pub("index.html");
  const at = html.indexOf('<script type="module" src="/pages-ux.js"></script>');
  assert.ok(at > 0 && at < html.indexOf("</head>"));
  assert.match(pub("pages-ux.js"), /link\.href = "\/pages-ux\.css"/);
});
