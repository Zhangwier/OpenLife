// 显示模式：text（纯文字，无插画、无动画、无音效，默认）或 picture（2.5D 场景画面，后期再启用）。
// 切换：localStorage.setItem("openlife-view", "picture") 后刷新。
export const VIEW_KEY = "openlife-view";
export function viewMode() {
  try { return localStorage.getItem(VIEW_KEY) === "picture" ? "picture" : "text"; } catch { return "text"; }
}
export const isTextMode = () => viewMode() === "text";
if (typeof document !== "undefined") document.documentElement.dataset.view = viewMode();
