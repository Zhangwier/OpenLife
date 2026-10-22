/**
 * 每日 UI 优化 2026-10-22 早场 · 题目一：「此刻」页主界面布局。
 * 全部是样式（now-ux.css），这里只负责把样式表挂在 ui-polish.css 之后，
 * 并导出断点给单测，免得 CSS 和测试各写一份数字。
 */
// @ts-check
export const NOW_TWO_COLUMN = { min: 1100, max: 1599 };
export const NOW_COLUMN_MAX = 1000;
if (typeof document !== "undefined" && !document.querySelector('link[href="/now-ux.css"]')) {
  const link = document.createElement("link");
  link.rel = "stylesheet"; link.href = "/now-ux.css";
  document.head.append(link);
}
