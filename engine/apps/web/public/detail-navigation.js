// A detail occupies one browser-history entry, so phone Back closes it first.
// Navigation replaces that entry: Back still returns to the originating page.
let detail = null;
export function openDetail(key, close) {
  if (detail?.key === key) { detail.close = close; return; }
  if (detail) {
    const previous = detail;
    detail = null;
    previous.close();
    history.replaceState({ openlifeDetail: key }, "");
  } else if (history.state?.openlifeDetail) {
    history.replaceState({ openlifeDetail: key }, "");
  } else {
    history.pushState({ openlifeDetail: key }, "");
  }
  detail = { key, close, focus: document.activeElement };
}
export function closeDetail(key) {
  if (detail?.key !== key) return;
  const previous = detail;
  detail = null;
  previous.close();
  if (previous.focus?.isConnected) previous.focus.focus({ preventScroll: true });
  if (history.state?.openlifeDetail === key) history.back();
}
export function leaveDetail() {
  if (!detail) return false;
  const previous = detail;
  detail = null;
  previous.close();
  return true;
}
window.addEventListener("popstate", () => {
  if (!detail) return;
  const previous = detail;
  detail = null;
  previous.close();
  if (previous.focus?.isConnected) previous.focus.focus({ preventScroll: true });
});
