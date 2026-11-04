/**
 * How 此刻 is played: as an interactive novel (story, the default), on the
 * pixel map (map), or on the older text pages (classic). One setting, kept on
 * this device; switching reloads so every module starts in the new mode.
 */
const KEY = "openlife-play";
export const PLAY_MODES = ["story", "map", "classic"];
export const PLAY_LABEL = { story: "文字人生", map: "地图", classic: "经典页面" };

export function playMode() {
  try {
    const v = localStorage.getItem(KEY);
    if (PLAY_MODES.includes(v)) return v;
    // Players who had switched the map off before keep their text pages.
    return localStorage.getItem("openlife-map") === "off" ? "classic" : "story";
  } catch { return "story"; }
}

export function setPlayMode(mode) {
  try { localStorage.setItem(KEY, PLAY_MODES.includes(mode) ? mode : "story"); } catch { /* 本次会话内 */ }
  location.reload();
}

export function nextPlayMode() {
  const i = PLAY_MODES.indexOf(playMode());
  return PLAY_MODES[(i + 1) % PLAY_MODES.length];
}
