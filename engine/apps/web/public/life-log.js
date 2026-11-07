// 人生纪事：纯文字模式的主叙事区。
// 每次行动后写一条「时间 · 叙述 · 变化」记录（变化由行动前后的聚落状态对比得出），
// 换日时自动补一条日子流逝的记录。记录按人物保存在浏览器里，最多 60 条。
import { daypartOf } from "/scene-fx.js";

const MAX = 60;
const DAYPART = { dawn: "清晨", day: "白天", dusk: "傍晚", night: "夜里" };
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const keyOf = (state) => `openlife.log.${state?.settlement?.characterId ?? state?.character?.id ?? "anon"}`;

function load(state) {
  try { const v = JSON.parse(localStorage.getItem(keyOf(state)) || "null"); return v && Array.isArray(v.entries) ? v : { entries: [], lastDay: null }; }
  catch { return { entries: [], lastDay: null }; }
}
function save(state, log) {
  log.entries = log.entries.slice(-MAX);
  try { localStorage.setItem(keyOf(state), JSON.stringify(log)); } catch { /* 存储满了也不影响游戏 */ }
}

export function stampOf(s) {
  if (!s) return "";
  return `${String(s.season ?? "").slice(0, 1)} · 第 ${s.origin?.daysHere ?? s.day} 天 · ${DAYPART[daypartOf(s.dailyActivity)]}`;
}

/** 行动前后的可见变化：随身物、饥饿、今日剩余时间、屋顶、负重、所在地点。 */
export function diffSettlement(before, after) {
  if (!before || !after) return [];
  const chips = [];
  const count = (s) => new Map((s.carrying || []).map((r) => [r.resourceId, r]));
  const a = count(before), b = count(after);
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const d = (b.get(id)?.count ?? 0) - (a.get(id)?.count ?? 0);
    if (d) { const r = b.get(id) || a.get(id); chips.push({ label: r.label, delta: d, unit: r.unit, good: d > 0 }); }
  }
  const hunger = (after.hunger ?? 0) - (before.hunger ?? 0);
  if (hunger) chips.push({ label: "饥饿", delta: hunger, good: hunger < 0 });
  const roof = (after.roof?.condition ?? 0) - (before.roof?.condition ?? 0);
  if (before.roof && after.roof && roof) chips.push({ label: "屋顶", delta: roof, good: roof > 0 });
  const sameDay = before.day === after.day;
  const time = (after.dailyActivity?.remaining ?? 0) - (before.dailyActivity?.remaining ?? 0);
  if (sameDay && time < 0) chips.push({ label: "今日时间", delta: time, unit: "格", good: null });
  if (before.placeId !== after.placeId && after.placeName) chips.push({ label: `来到${after.placeName}`, delta: 0, good: null });
  return chips;
}

export function chipText(chips) {
  return chips.map((c) => c.delta ? `${c.label} ${c.delta > 0 ? "+" : "−"}${Math.abs(c.delta)}${c.unit && c.unit !== "格" ? "" : c.unit || ""}` : c.label).join(" · ");
}

/** 记下一次行动。 */
export function logAction(state, text, chips = []) {
  const s = state?.settlement;
  if (!s?.exists) return;
  const log = load(state);
  log.entries.push({ t: stampOf(s), text, chips, place: s.placeName || "" });
  log.lastDay = s.day;
  save(state, log);
}

function syncDay(state, log) {
  const s = state.settlement;
  if (log.lastDay === null || log.lastDay === undefined) {
    const story = s.origin && s.origin.id !== "none" ? `${s.origin.story}心里有个念想：${s.origin.aspiration}。` : "";
    log.entries.push({ t: stampOf(s), text: story || `你在${s.placeName || "聚落"}${s.spaceName ? "的" + s.spaceName : ""}。${s.communitySituation?.note || "日子从这里开始。"}`, chips: [], kind: "day" });
  } else if (s.day > log.lastDay) {
    const n = s.day - log.lastDay;
    const sky = s.weather?.sky ? `，天色${s.weather.sky}` : "";
    const news = Array.isArray(s.happenings) && s.happenings.length ? s.happenings.join("") : "";
    log.entries.push({ t: stampOf(s), text: (n === 1 ? `新的一天${sky}。你在${s.placeName || "聚落"}醒来。` : `${n} 天过去了${sky}。现在是${s.season}，你在${s.placeName || "聚落"}。`) + news, chips: [], kind: "day" });
  } else return false;
  log.lastDay = s.day;
  return true;
}

export function renderLifeLog(state) {
  const box = document.getElementById("lifeLog");
  const s = state?.settlement;
  if (!box) return;
  if (!s?.exists) { box.hidden = true; return; }
  box.hidden = false;
  const log = load(state);
  if (syncDay(state, log)) save(state, log);
  const shown = log.entries.slice(-12);
  box.innerHTML = `<div class="life-log-head"><span>人生纪事</span><small>${esc(stampOf(s))}</small></div>
    <ol class="life-log-list">${shown.map((e, i) => `<li class="${e.kind === "day" ? "is-day" : ""}${i === shown.length - 1 ? " is-new" : ""}">
      <small class="life-log-time">${esc(e.t)}</small><p>${esc(e.text)}</p>
      ${e.chips?.length ? `<div class="life-log-chips">${e.chips.map((c) => `<span class="${c.good === true ? "up" : c.good === false ? "down" : ""}">${esc(c.label)}${c.delta ? ` <b>${c.delta > 0 ? "+" : "−"}${Math.abs(c.delta)}${c.unit === "格" ? " 格" : ""}</b>` : ""}</span>`).join("")}</div>` : ""}
    </li>`).join("")}</ol>`;
  const list = box.querySelector(".life-log-list");
  list.scrollTop = list.scrollHeight;
}

/** 心里记着的事：出身念想与听来的村民心愿（都从世界读出，不是任务清单）。 */
export function renderHopes(state) {
  const box = document.getElementById("hopes");
  const s = state?.settlement;
  if (!box) return;
  const hope = s?.exists ? s.aspiration : null;
  const wishes = s?.exists && Array.isArray(s.wishes) ? s.wishes : [];
  const news = s?.exists && Array.isArray(s.happenings) ? s.happenings : [];
  const skills = s?.exists && Array.isArray(s.skills) ? s.skills : [];
  const fam = s?.exists ? s.family : null;
  const home = fam && (fam.spouse || fam.children?.length || fam.expecting);
  if (!hope && !wishes.length && !news.length && !skills.length && !home) { box.hidden = true; return; }
  box.hidden = false;
  const items = news.map((t) => `<li class="is-news"><b>${esc(t)}</b></li>`);
  if (home) {
    const kids = (fam.children || []).map((c) => `${c.name}（${c.age}岁，${c.stage}）`).join("、");
    items.push(`<li class="is-home"><b>家：${esc([fam.spouse ? `和${fam.spouse.name}成了亲` : "", kids ? `孩子 ${kids}` : "", fam.expecting ? "家里要添丁了" : ""].filter(Boolean).join("；"))}</b><small>${esc(s.age ? `你今年${s.age}岁` : "")}</small></li>`);
  }
  if (hope) items.push(`<li class="${hope.done ? "is-done" : ""}"><b>${esc(hope.text)}</b><small>${esc(hope.done ? "已经成真" : hope.progress || "")}</small></li>`);
  for (const w of wishes) {
    const state = w.fulfilled ? (w.byYou ? "你帮着圆了" : "已经圆了") : (w.how || "还记在心上");
    items.push(`<li class="${w.fulfilled ? "is-done" : ""}"><b>${esc(w.name)}：${esc(w.wish)}</b><small>${esc(state)}</small></li>`);
  }
  for (const k of skills)
    items.push(`<li class="${k.learned ? "is-done" : ""}"><b>手艺·${esc(k.name)}（${esc(k.teacher)}教的）</b><small>${esc(k.learned ? k.blurb : `学了 ${k.lessons}/${k.of} 课`)}</small></li>`);
  box.innerHTML = `<div class="life-log-head"><span>心里记着的事</span></div><ul class="hopes-list">${items.join("")}</ul>`;
}
