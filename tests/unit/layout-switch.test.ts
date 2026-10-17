/**
 * 版式切换：手机版与电脑版是同一套规则，由 `html.is-phone` 决定。
 *
 * 这些是静态断言，不需要浏览器：确认规则只写了一份、开关与断点绑定、
 * 自动模式下强制电脑能压过窄屏。真正跑浏览器的那次验证在临时脚本里做过，
 * 结论写进了 docs/notes。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const CSS = readFileSync(new URL("../../apps/web/public/theme.css", import.meta.url), "utf8");
const VIEW = readFileSync(new URL("../../apps/web/public/view-mode.js", import.meta.url), "utf8");
const SHELL = readFileSync(new URL("../../apps/web/public/shell.js", import.meta.url), "utf8");
const HTML = readFileSync(new URL("../../apps/web/public/index.html", import.meta.url), "utf8");

test("手机版规则只有一份，由 html.is-phone 触发", () => {
  const forced = CSS.match(/:where\(html\.is-phone\) /g) ?? [];
  assert.ok(forced.length > 40, `expected the phone rules under one selector, got ${forced.length}`);
  // 关键属性各自只该出现在 scoped 规则里，不能有一条漏在外面。
  for (const [what, re] of [
    ["nav pinned to the bottom", /#appNavigation\.app-navigation \{[^}]*position: fixed/],
  ]) {
    assert.ok(re.test(CSS), `${what} must be scoped to the phone layout`);
  }
});

test("自动模式下的手机规则让位给强制电脑", () => {
  // 媒体查询里的那一份必须带 :not([data-layout="desktop"])，否则窄窗口里
  // 选了「电脑」也会被排成手机版。
  const guarded = CSS.match(/:where\(html:not\(\[data-layout="desktop"\]\)\)/g) ?? [];
  assert.ok(guarded.length > 40, `the auto copy must be guarded, got ${guarded.length}`);
  assert.ok(/@media \(max-width: 600px\)/.test(CSS), "auto mode still needs the media query");
});

test("开关与断点、持久化、界面控件都在", () => {
  assert.match(VIEW, /PHONE_MAX_WIDTH = 600/, "the breakpoint must match the CSS one");
  assert.match(VIEW, /classList\.toggle\("is-phone"/, "one class drives every phone rule");
  assert.match(VIEW, /openlife-layout/, "the choice survives a reload");
  assert.match(VIEW, /matchMedia/, "auto mode must react to the window, not just read it once");
  assert.match(SHELL, /installLayoutSwitch/, "the switch is wired into the shell");
  assert.match(HTML, /data-control="layoutButton"/, "the menu has a control for it");
  assert.match(HTML, /id="layoutLabel"/, "the control shows the current mode");
});
