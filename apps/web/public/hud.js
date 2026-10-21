/**
 * 状态条（HUD）：纯函数，settlement.js 渲染、单测直接调用。
 *
 * 两条规矩同时成立：
 *  - 看得到的界面只说人话，不报数字（DESIGN.md 原则 3）。「饿得发慌」不是
 *    「饥饿 8/10」，玩家不需要先换算才能决定要不要吃饭。
 *  - 屏幕阅读器拿到完整数值（hudSentence），因为它没有轻重感可依靠，只能说数。
 *
 * 三档 tone 只用于「轻重」着色：ok 不上色、warn 留意、danger 先处理。
 * 分级阈值来自玩法本身：饥饿 4 开始掉精神、7 起干活打折、10 到顶；
 * 活动格剩到 1/4 就只能再做一件小事。
 */
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function hungerLevel(hunger, toll) {
  const h = Number(hunger) || 0;
  if (toll?.sick) return { tone: "danger", word: "饿病了" };
  if (h >= 10) return { tone: "danger", word: "眼前发黑" };
  if (h >= 8) return { tone: "danger", word: "饿得发慌" };
  if (h >= 6) return { tone: "warn", word: "空着肚子" };
  if (h >= 3) return { tone: "ok", word: "有点饿" };
  return { tone: "ok", word: "吃得饱" };
}
export function activityLevel(remaining, capacity) {
  const r = Number(remaining) || 0;
  const cap = Number(capacity) || 8;
  if (r <= 0) return { tone: "warn", word: "今天做不动了" };
  if (r <= Math.max(1, Math.round(cap / 4))) return { tone: "warn", word: "还能做一点" };
  if (r <= Math.round(cap / 2)) return { tone: "ok", word: "还能做几件事" };
  return { tone: "ok", word: "一整天都在" };
}
export function roofLevel(roof) {
  if (!roof) return null;
  const ratio = roof.max ? roof.condition / roof.max : 1;
  if (roof.leaking || ratio < 0.25) return { tone: "danger", word: roof.leaking ? "在漏雨" : "快塌了" };
  if (ratio < 0.6) return { tone: "warn", word: "要修" };
  return { tone: "ok", word: "还挡得住" };
}
export function loadLevel(load) {
  if (!load) return null;
  const ratio = load.maxMass ? load.mass / load.maxMass : 0;
  if (ratio >= 1) return { tone: "danger", word: "背不动了" };
  if (ratio >= 0.75) return { tone: "warn", word: "有点沉" };
  return { tone: "ok", word: "背得动" };
}

const TIPS = {
  肚子: "0 是吃饱，10 是饿极。到 4 开始留意，7 以上先找东西吃。",
  今天: "每天 8 格活动时间。走动、劳动、交谈都会用掉格子，用完就该歇了。",
  屋顶: "屋顶结实程度。漏雨时屋里的东西会受潮，记得修。",
  身上: "随身带的东西有多重。超过上限就走不动，先放下一些。",
};
export function hudTip(label) { return TIPS[label] || ""; }

/** 一项状态：标题 + 一句白话。分级只用颜色，不额外加字。 */
export function hudWord(label, level) {
  if (!level) return "";
  const tone = level.tone && level.tone !== "ok" ? ` ${level.tone}` : "";
  return `<span class="hud-item${tone}" title="${esc(hudTip(label))}"><span class="hud-label">${esc(label)}<span class="hud-word">${esc(level.word)}</span></span></span>`;
}

/** 读屏用的一句话：把同一个状态换成完整数值，和画出来的白话一一对应。 */
export function hudSentence(s) {
  const act = s.dailyActivity || { remaining: 0, capacity: 8 };
  const parts = [`饥饿 ${s.hunger ?? 0}/10（${hungerLevel(s.hunger, s.hungerToll).word}）`, `今天还剩 ${act.remaining ?? 0}/${act.capacity ?? 8} 格活动时间`];
  const roof = roofLevel(s.roof);
  if (roof) parts.push(`屋顶 ${s.roof.condition}/${s.roof.max}（${roof.word}）`);
  const load = loadLevel(s.portableLoad);
  if (load) parts.push(`负重 ${Number(s.portableLoad.mass.toFixed(1))}/${s.portableLoad.maxMass}（${load.word}）`);
  return parts.join(" · ");
}

export function renderHud(s) {
  const act = s.dailyActivity || { remaining: 0, capacity: 8 };
  return [
    hudWord("肚子", hungerLevel(s.hunger, s.hungerToll)),
    hudWord("今天", activityLevel(act.remaining, act.capacity)),
    hudWord("身上", loadLevel(s.portableLoad)),
    hudWord("屋顶", roofLevel(s.roof)),
  ].join("");
}


