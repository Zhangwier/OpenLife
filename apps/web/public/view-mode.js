// 显示模式：text（纯文字，无插画、无动画、无音效，默认）或 picture（2.5D 场景画面，后期再启用）。
// 切换：localStorage.setItem("openlife-view", "picture") 后刷新。
export const VIEW_KEY = "openlife-view";
export function viewMode() {
  try { return localStorage.getItem(VIEW_KEY) === "picture" ? "picture" : "text"; } catch { return "text"; }
}
export const isTextMode = () => viewMode() === "text";

/**
 * 设备版式：auto（跟随窗口宽度）或 phone / desktop（手动锁定）。
 *
 * 自动时移动版靠 CSS 断点判断；手动锁定时给 <html> 加 data-layout，
 * 让同一套样式既能在大屏上按手机窄栏排，也能在窄窗里按桌面双栏排——
 * 这样在一台设备上就能直接对照两种版式，不必改窗口大小或换设备。
 */
export const LAYOUT_KEY = "openlife-layout";
/** 手机版式的宽度阈值：与 theme.css 里的断点一致。 */
export const PHONE_MAX_WIDTH = 600;

export function layoutMode() {
  try {
    const v = localStorage.getItem(LAYOUT_KEY);
    return v === "phone" || v === "desktop" ? v : "auto";
  } catch { return "auto"; }
}

/**
 * 现在要不要按手机版排。
 *
 * phone / desktop 是硬锁定；auto 跟随窗口宽度。`matchMedia` 而不是读
 * `innerWidth`，这样横竖屏切换、窗口拖动都能立刻反应过来。
 */
export function wantsPhoneLayout(mode = layoutMode()) {
  if (mode === "phone") return true;
  if (mode === "desktop") return false;
  try { return window.matchMedia(`(max-width: ${PHONE_MAX_WIDTH}px)`).matches; } catch { return false; }
}

export function setLayoutMode(mode) {
  try {
    if (mode === "auto") localStorage.removeItem(LAYOUT_KEY);
    else localStorage.setItem(LAYOUT_KEY, mode);
  } catch { /* 隐私模式：本次会话内仍然生效 */ }
  applyLayoutMode();
}

export function applyLayoutMode() {
  if (typeof document === "undefined") return;
  const mode = layoutMode();
  const root = document.documentElement;
  if (mode === "auto") root.removeAttribute("data-layout");
  else root.setAttribute("data-layout", mode);
  // 唯一的开关：CSS 里所有手机规则都挂在 html.is-phone 上。
  root.classList.toggle("is-phone", wantsPhoneLayout(mode));
  root.dataset.layoutResolved = wantsPhoneLayout(mode) ? "phone" : "desktop";
}

if (typeof document !== "undefined") {
  document.documentElement.dataset.view = viewMode();
  applyLayoutMode();
  // 自动模式下窗口跨过断点时跟着切；锁定模式不受影响。
  try {
    window.matchMedia(`(max-width: ${PHONE_MAX_WIDTH}px)`)
      .addEventListener("change", () => { if (layoutMode() === "auto") applyLayoutMode(); });
  } catch { /* 老浏览器没有 addEventListener on MediaQueryList */ }
}
