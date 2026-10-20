// 状态条（HUD）的分级与文案：纯函数，settlement.js 渲染、单测直接调用。
// 三档：ok（绿，不用管）/ warn（黄，留意）/ danger（红，先处理）。
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function hungerLevel(hunger) {
  const h = Number(hunger) || 0;
  if (h >= 7) return { tone: "danger", word: "饿了" };
  if (h >= 4) return { tone: "warn", word: "有点饿" };
  return { tone: "ok", word: "不饿" };
}
export function activityLevel(remaining, capacity) {
  const r = Number(remaining) || 0;
  if (r <= 0) return { tone: "danger", word: "今天做完了" };
  if (r <= Math.max(1, Math.round((Number(capacity) || 8) / 4))) return { tone: "warn", word: "快用完" };
  return { tone: "ok", word: "还早" };
}
export function roofLevel(roof) {
  if (!roof) return null;
  const ratio = roof.max ? roof.condition / roof.max : 1;
  if (roof.leaking || ratio < .25) return { tone: "danger", word: roof.leaking ? "在漏雨" : "快塌了" };
  if (ratio < .6) return { tone: "warn", word: "要修" };
  return { tone: "ok", word: "结实" };
}
export function loadLevel(load) {
  if (!load) return null;
  const ratio = load.maxMass ? load.mass / load.maxMass : 0;
  if (ratio >= 1) return { tone: "danger", word: "背不动了" };
  if (ratio >= .8) return { tone: "warn", word: "偏重" };
  return { tone: "ok", word: "轻松" };
}
const TIPS = {
  饥饿: "0 是吃饱，10 是饿极。到 4 开始留意，7 以上先找东西吃。",
  今天: "每天 8 格活动时间。走动、劳动、交谈都会用掉格子，用完就该歇了。",
  屋顶: "屋顶结实程度。漏雨时屋里的东西会受潮，记得修。",
  负重: "随身带的东西有多重。超过上限就走不动，先放下一些。",
};
export function hudTip(label) { return TIPS[label] || ""; }

function shell(label, level, inner, value) {
  const tone = level?.tone && level.tone !== "ok" ? level.tone : "";
  return `<span class="hud-item ${tone}" title="${esc(hudTip(label))}"><span class="hud-label">${esc(label)}${level ? `<span class="hud-word">${esc(level.word)}</span>` : ""}</span>${inner}<b>${esc(value)}</b></span>`;
}
export function hudMeter(label, value, max, level) {
  const pct = max ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;
  return shell(label, level, `<span class="hud-track"><i style="width:${pct}%"></i></span>`, `${value}/${max}`);
}
export function hudPips(remaining, capacity) {
  const cap = Number(capacity ?? 8), left = Number(remaining ?? 0);
  const pips = Array.from({ length: cap }, (_, i) => `<i class="${i < left ? "on" : ""}"></i>`).join("");
  return shell("今天", activityLevel(left, cap), `<span class="hud-pips">${pips}</span>`, `剩 ${left} 格`);
}
/** 读屏用的一句话，和画出来的状态条说同样的事。 */
export function hudSentence(s) {
  const act = s.dailyActivity || { remaining: 0, capacity: 8 };
  const parts = [`饥饿 ${s.hunger ?? 0}/10（${hungerLevel(s.hunger).word}）`, `今日活动剩 ${act.remaining ?? 0}/${act.capacity ?? 8} 格`];
  const roof = roofLevel(s.roof);
  if (roof) parts.push(`屋顶 ${s.roof.condition}/${s.roof.max}（${roof.word}）`);
  const load = loadLevel(s.portableLoad);
  if (load) parts.push(`负重 ${Number(s.portableLoad.mass.toFixed(1))}/${s.portableLoad.maxMass}（${load.word}）`);
  return parts.join(" · ");
}
export function renderHud(s) {
  const act = s.dailyActivity || { remaining: 0, capacity: 8 };
  const load = s.portableLoad;
  return [
    hudMeter("饥饿", s.hunger ?? 0, 10, hungerLevel(s.hunger)),
    hudPips(act.remaining, act.capacity),
    s.roof ? hudMeter("屋顶", s.roof.condition, s.roof.max, roofLevel(s.roof)) : "",
    load ? hudMeter("负重", Number(load.mass.toFixed(1)), load.maxMass, loadLevel(load)) : "",
  ].join("");
}
