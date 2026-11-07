/** UI 与交互第六轮（2026-10-21）：人生记忆弹窗与主菜单的纯逻辑和接线。 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// @ts-ignore - plain browser module, no types
import { relativeTime, absoluteTime, slotLines, storageUse, isQuotaError } from "../../apps/web/public/memory-ux.js";
// @ts-ignore - plain browser module, no types
import { MENU_ITEMS, GROUPS, nextIndex, statusFor } from "../../apps/web/public/menu-ux.js";

const pub = (f: string) => readFileSync(new URL(`../../apps/web/public/${f}`, import.meta.url), "utf8");
// 仓库在 Windows 上检出为 CRLF，按行断言前先统一行尾。
const crlf = (s: string) => s.replace(/\r\n/g, "\n");

test("记忆时间：刚刚、几分钟前、几小时前、昨天、更早写日期", () => {
  const now = new Date(2026, 9, 21, 12, 0).getTime();
  const at = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo, d, h, mi).toISOString();
  assert.equal(relativeTime(at(2026, 9, 21, 12, 0), now + 20_000), "刚刚");
  assert.equal(relativeTime(at(2026, 9, 21, 11, 48), now), "12 分钟前");
  assert.equal(relativeTime(at(2026, 9, 21, 9, 0), now), "3 小时前");
  assert.equal(relativeTime(at(2026, 9, 20, 21, 40), now), "昨天 21:40");
  assert.equal(relativeTime(at(2026, 9, 18, 9, 5), now), "10月18日 09:05");
  assert.equal(relativeTime("坏数据", now), "");
  assert.match(absoluteTime(at(2026, 9, 18, 9, 5)), /^2026-10-18 09:05$/);
});

test("记忆格子：人物、代数、年代；地点只用同一次存档记下的", () => {
  const entry = { savedAt: "2026-10-21T04:00:00.000Z", summary: { year: -2053, month: 1, generation: 1, character: { name: "启 禾", age: 16, alive: true } } };
  const now = Date.parse("2026-10-21T04:05:00.000Z");
  const l = slotLines(entry, { savedAt: entry.savedAt, place: "陶家庭院 · 主屋寝处", day: "第 3 天 · 冬" }, now);
  assert.equal(l.who, "启 禾 · 16 岁");
  assert.equal(l.gen, "第一代");
  assert.equal(l.when, "公元前 2054 年 · 1 月");
  assert.equal(l.where, "陶家庭院 · 主屋寝处 · 第 3 天 · 冬");
  assert.equal(l.ago, "5 分钟前");
  assert.equal(slotLines(entry, { savedAt: "别的时间", place: "田地" }, now).where, "", "旧的地点记录不能张冠李戴");
  assert.equal(slotLines({ ...entry, summary: { ...entry.summary, character: { name: "甲", age: 70, alive: false } } }, null, now).who, "甲 · 70 岁 · 已离世");
  assert.equal(slotLines(null, null, now), null);
});

test("存储用量与空间不足的判断", () => {
  const u = storageUse([1024 * 1024, 1024 * 1024 / 2, 0]);
  assert.equal(u.label, "1.5 MB");
  assert.ok(u.ratio > 0.29 && u.ratio < 0.31);
  assert.equal(storageUse([99e6]).ratio, 1);
  assert.ok(isQuotaError({ name: "QuotaExceededError" }));
  assert.ok(isQuotaError(new Error("Setting the value exceeded the quota.")));
  assert.ok(!isQuotaError(new Error("请求失败")));
});

test("主菜单：每个入口都有分组、图标、说明；只有「开启新人生」是警示色", () => {
  const html = pub("index.html");
  const keys = [...html.slice(html.indexOf('class="menu-links"'), html.indexOf('id="autoModal"')).matchAll(/data-(?:control|route)="([^"]+)"/g)].map((m) => m[1]);
  // 入口数量跟着 index.html 走，不写死。合并进来的分支会往菜单里加入口（地图、图鉴、新手引导），
  // 写死数字会让「谁的分支后合」决定测试红绿。
  assert.ok(keys.length >= 8, `菜单入口太少：${keys.length}`);
  for (const k of keys) {
    assert.ok(MENU_ITEMS[k], `${k} 没有登记`);
    assert.ok(GROUPS.some((g: { id: string }) => g.id === MENU_ITEMS[k].group), `${k} 的分组不存在`);
    assert.ok(MENU_ITEMS[k].hint, `${k} 缺说明`);
  }
  assert.deepEqual(keys.filter((k) => MENU_ITEMS[k].danger), ["resetButton"], "只有结束这段人生要警示色");
  const icons = pub("icons.js");
  for (const k of keys) assert.match(icons, new RegExp(`\\b${MENU_ITEMS[k].icon}:`), `图标 ${MENU_ITEMS[k].icon} 不存在`);
});

test("主菜单：方向键在两列网格里移动，Home/End 到头尾", () => {
  assert.equal(nextIndex(0, "ArrowRight", 8), 1);
  assert.equal(nextIndex(0, "ArrowDown", 8), 2);
  assert.equal(nextIndex(1, "ArrowUp", 8), 0);
  assert.equal(nextIndex(7, "ArrowDown", 8), 7);
  assert.equal(nextIndex(3, "End", 8), 7);
  assert.equal(nextIndex(3, "Home", 8), 0);
  assert.equal(nextIndex(0, "ArrowDown", 8, 1), 1, "手机上一列时 ↓ 走一格");
  assert.equal(nextIndex(2, "a", 8), 2);
});

test("主菜单状态文字", () => {
  assert.equal(statusFor("memoryButton", { latestSave: "3 分钟前" }), "最近一份3 分钟前");
  assert.equal(statusFor("memoryButton", {}), "还没有记忆");
  assert.equal(statusFor("autoButton", { planOn: true }), "日程已启用");
  assert.equal(statusFor("family", { generation: 2 }), "第 2 代");
  assert.equal(statusFor("modules", {}), "");
});

test("接线：app.js 引入两个模块；存储满时给中文原因；自动记忆失败会记下来", () => {
  const app = crlf(pub("app.js"));
  // 两个模块都要被引入；它们之间的先后不重要，别的分支还会往这段 import 里插东西。
  assert.match(app, /^import "\/memory-ux\.js";$/m);
  assert.match(app, /^import "\/menu-ux\.js";$/m);
  assert.match(app, /QuotaExceededError/);
  assert.match(app, /__openlifeAutoMemoryError/);
});
