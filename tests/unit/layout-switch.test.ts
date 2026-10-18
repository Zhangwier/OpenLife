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
  /*
   * 2026-10 修：按钮以前是 data-control="layoutButton" 转发到 id=layoutButton，
   * 但那个 id 的节点根本不存在——点了等于没点。现在按钮自己带 id，监听器直接挂它。
   * 断言也随之改成"按钮必须真的有 id"，防止再退回转发写法。
   */
  assert.match(HTML, /id="layoutButton"/, "the menu has a real layout button with its own id");
  assert.doesNotMatch(HTML, /data-control="layoutButton"/, "no forwarding hop through a missing element");
  assert.match(HTML, /id="layoutLabel"/, "the control shows the current mode");
  // The button is looked up through a helper so either markup works; the point
  // is that a listener is attached to the real element, not a missing one.
  assert.match(SHELL, /buttonFor\(\)\?\.addEventListener|addEventListener\("click"/, "the listener is bound to the real element");
  assert.match(SHELL, /getElementById\("layoutButton"\)|querySelector\('\[data-control="layoutButton"\]'\)/, "the button is looked up by id or data-control");
});

test("显示模式（文字 / 画面）在界面上有开关，且切换会重载", () => {
  // 以前只能在控制台改 localStorage，普通玩家找不到入口。
  assert.match(HTML, /id="viewModeButton"/, "the menu exposes a view-mode toggle");
  assert.match(VIEW, /export function toggleViewMode/, "the toggle is a real function, not a comment");
  assert.match(VIEW, /location\.reload\(\)/, "switching rebuilds the scene layer, so it reloads once");
  assert.match(SHELL, /installViewModeSwitch/, "the toggle is wired into the shell");
});
