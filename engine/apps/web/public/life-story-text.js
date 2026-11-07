/**
 * Words for the text life (文字人生): turns the player's projected state into
 * prose and choices. Pure functions over the state the server already sent —
 * nothing here can see more than the player knows, and the same state always
 * reads the same way (variants are picked by a stable hash, never at random).
 */

const pick = (list, seed) => list[Math.abs(hashStr(String(seed))) % list.length];
export function hashStr(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const NUM = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
/** 1 → 初一, 15 → 十五, 21 → 廿一, 30 → 三十 */
export function dayName(d) {
  d = Math.max(1, Math.min(30, Number(d) || 1));
  if (d <= 10) return `初${NUM[d]}`;
  if (d < 20) return `十${NUM[d - 10]}`;
  if (d === 20) return "二十";
  if (d < 30) return `廿${NUM[d - 20]}`;
  return "三十";
}

/** Where in the day the player is, from how much of it is spent. */
export function daypart(s) {
  const a = s?.settlement?.dailyActivity ?? {};
  const cap = Math.max(1, Number(a.capacity ?? 8)), used = Number(a.used ?? 0);
  if (Number(a.remaining ?? 1) <= 0) return "night";
  const f = used / cap;
  return f < 0.25 ? "morning" : f < 0.5 ? "noon" : f < 0.75 ? "afternoon" : "dusk";
}
const DAYPART_WORD = { morning: ["天刚亮", "清早", "早上"], noon: ["上午", "日头正高"], afternoon: ["过了晌午", "下午"], dusk: ["日头偏西", "傍晚"], night: ["天黑了", "夜里"] };

function weatherPhrase(sky, seed) {
  sky = String(sky ?? "");
  if (sky.includes("雪")) return pick(["雪还在下", "细雪落个不停", "四下一片雪白"], seed);
  if (sky.includes("雨")) return pick(["下着雨", "雨点打在屋顶上", "地上湿漉漉的"], seed);
  if (sky.includes("阴")) return pick(["天阴着", "云压得很低"], seed);
  if (sky.includes("雾")) return "河上起了雾";
  if (sky.includes("晴")) return pick(["天晴着", "日头很好", "天光透亮"], seed);
  return sky ? `天气${sky}` : "";
}

/** "冬 · 一月初一 · 雪" */
export function dateLine(s) {
  const c = s?.outlook?.calendar, S = s?.settlement;
  if (!c) return [S?.season, S?.weather?.sky].filter(Boolean).join(" · ");
  return [c.season ?? S?.season, `${c.monthName ?? `${c.month}月`}${dayName(c.day)}`, S?.weather?.sky].filter(Boolean).join(" · ");
}
/** A stable key for the day the player is living. */
export const dayKey = (s) => `${s?.outlook?.calendar?.year ?? ""}-${s?.outlook?.calendar?.month ?? ""}-${s?.outlook?.calendar?.day ?? s?.tick ?? ""}`;
export const seasonKey = (s) => `${s?.outlook?.calendar?.year ?? ""}-${s?.outlook?.calendar?.season ?? s?.settlement?.season ?? ""}`;
export const placeKey = (s) => `${s?.settlement?.placeId ?? ""}|${s?.settlement?.spaceId ?? ""}`;

/** "一月初二，雪。" */
export function dayHeading(s) {
  const c = s?.outlook?.calendar;
  const head = c ? `${c.monthName ?? `${c.month}月`}${dayName(c.day)}` : `第 ${s?.settlement?.day ?? ""} 天`;
  const sky = s?.settlement?.weather?.sky;
  return `${head}${sky ? `，${sky}` : ""}。`;
}

const listJoin = (items) => items.length <= 1 ? items.join("") : `${items.slice(0, -1).join("、")}和${items[items.length - 1]}`;
const people = (s) => (s?.settlement?.map?.targets ?? []).filter((t) => t.type === "person");

/** The paragraph that opens a place or a day: when, where, who, what is around, what is on your mind. */
export function sceneText(s) {
  const S = s?.settlement;
  if (!S) return "";
  const seed = `${s.tick}|${placeKey(s)}`;
  const out = [];
  const when = pick(DAYPART_WORD[daypart(s)], seed), sky = weatherPhrase(S.weather?.sky, seed);
  out.push(`${when}${sky ? `，${sky}` : ""}。`);
  out.push(`你在${S.placeName ?? "这里"}${S.spaceName ? `的${S.spaceName}` : ""}。`);
  const here = people(s);
  if (here.length) {
    // Strangers share a description ("陌生的老人"): count them instead of repeating it.
    const counts = new Map();
    for (const p of here) counts.set(p.name, (counts.get(p.name) ?? 0) + 1);
    const who = [...counts].map(([n, k]) => k === 1 ? n : `${["", "", "两个", "三个", "四个", "几个"][Math.min(k, 5)]}${n.replace(/^陌生的/, "不认识的")}`);
    const busy = here.filter((p) => /正在忙/.test(p.note ?? "") && !p.name.startsWith("陌生")).map((p) => p.name);
    const doing = busy.length ? `，${listJoin(busy.slice(0, 3))}正忙着手里的活` : here.some((p) => /正在忙/.test(p.note ?? "")) ? "，有人在忙活" : "";
    out.push(`${listJoin(who.slice(0, 4))}${who.length > 4 ? "等人" : ""}也在${doing}。`);
  } else out.push(pick(["这里只有你一个人。", "四下没有别人。"], seed));
  const animal = (S.nature?.animals ?? []).find((a) => a.line);
  if (animal) out.push(String(animal.line).replace(/[。.]?$/, "。"));
  const things = [...new Set((S.objects ?? []).filter((o) => o.visible !== false && o.placement === "放着").map((o) => o.name))].slice(0, 5);
  if (things.length) out.push(`${S.map?.kind === "interior" ? "屋里" : "近处"}放着${listJoin(things)}${(S.objects ?? []).length > 6 ? "，还有些零碎" : ""}。`);
  const yields = (S.yields ?? []).filter((y) => y.stock > 0).map((y) => y.label);
  if (yields.length) out.push(`这里能取到${listJoin(yields.slice(0, 4))}。`);
  const hunger = Number(S.hunger ?? 0);
  if (hunger >= 8) out.push("你饿得发慌，得先找口吃的。");
  else if (hunger >= 6) out.push("肚子空着。");
  if (S.roof?.leaking && S.spaceId === S.roof.spaceId) out.push("屋顶在漏，夜里会冷。");
  const today = (s.outlook?.calendar?.entries ?? []).find((e) => e.offset === 0 && e.kind !== "crop" && e.named);
  const soon = (s.outlook?.calendar?.entries ?? []).find((e) => e.offset > 0 && e.offset <= 3 && e.named);
  if (today) out.push(`今天是${today.text}。`);
  else if (soon) out.push(`再过${["", "一", "两", "三"][soon.offset]}天就是${soon.text}了。`);
  if (S.communitySituation?.visible && S.communitySituation.note) out.push(S.communitySituation.note);
  return out.join("");
}

/** Chapter title for a new season: "冬 · 初到河岸". */
export function chapterTitle(s) {
  const active = (s?.stories?.quests ?? []).find((q) => q.status === "active" && q.kind === "main");
  const season = s?.outlook?.calendar?.season ?? s?.settlement?.season ?? "";
  return `${season}${active ? ` · ${active.title}` : ""}`;
}

/** The cost of an action, in the player's words. */
export function costOf(a) {
  if (Number(a?.days) > 0) return `${a.days} 天`;
  if (a?.activityCost) return `${a.activityCost} 格`;
  const said = String(a?.hint ?? "").match(/花\s*(\d+)\s*格/);
  if (said) return `${said[1]} 格`;
  return "";
}

const TIME_ACTIONS = new Set(["settlement-locations.end_day", "settlement-locations.season.begin"]);
const act = (id, payload, label, extra = {}) => ({ id, payload: payload ?? {}, label, ...extra });

/**
 * Everything the player can do now, grouped the way a reader thinks:
 * talk (who is speaking to you), matters (what is on your mind), here (what
 * this place offers), go (where you can walk), time (letting days pass),
 * blocked (what you cannot do yet, and the next step towards it).
 */
export function choiceGroups(s) {
  const S = s?.settlement ?? {}, J = s?.stories ?? {}, G = s?.guide ?? {};
  const groups = { talk: [], matters: [], here: [], go: [], time: [], blocked: [], routes: [] };
  const progress = s?.outlook?.progress;
  for (const r of progress?.routes ?? []) groups.routes.push({ title: r.title, text: r.text,
    options: r.actions.map(a => act(a.id, a.payload, a.label, { ...a, cost: costOf(a) })) });
  const improvement = progress?.improvement;
  if (improvement) groups.matters.push({ text: improvement.title, why: improvement.text,
    options: improvement.actions.filter(a => a.enabled).map(a => act(a.id, a.payload, a.label, { ...a, cost: costOf(a) })) });

  for (const d of (J.dialogues ?? []).slice(0, 2)) {
    // Only what you can say now; questions that need more trust are counted, not listed.
    const open = (d.options ?? []).filter((o) => o.enabled !== false);
    groups.talk.push({ who: d.name, npc: d.npc, text: d.text, remark: d.remark ?? "", later: (d.options ?? []).length - open.length,
      options: open.map((o) => act("village-stories.dialogue.choose", { npc: d.npc, node: d.node, option: o.id }, o.label, { enabled: true, speaker: d.name })) });
  }
  const inc = J.incident;
  if (inc && (inc.choices ?? inc.options)?.length) {
    groups.talk.unshift({ who: inc.who ?? inc.title ?? "突然", text: inc.text ?? inc.intro ?? inc.title ?? "", remark: "", options: (inc.choices ?? inc.options).map((c) =>
      act("village-stories.incident.resolve", { choiceId: c.id }, c.label, { enabled: c.enabled !== false, reason: c.reason ?? "" })) });
  }

  for (const q of J.quests ?? []) {
    if (q.status === "active") {
      const st = q.step;
      const line = st ? `「${q.title}」：${st.text}${st.target > 1 ? `（${st.done}/${st.target}）` : ""}` : `「${q.title}」`;
      const options = [];
      if (st?.turnIn) options.push(act("village-stories.quest.turn_in", { questId: q.id }, st.turnIn.label ?? "交差", { enabled: st.turnIn.enabled !== false, reason: st.turnIn.reason ?? "" }));
      for (const o of q.decide?.options ?? []) options.push(act("village-stories.quest.decide", { questId: q.id, optionId: o.id }, o.label, { enabled: o.enabled !== false, reason: o.reason ?? "" }));
      groups.matters.push({ text: line, why: q.decide?.text ?? q.summary ?? "", options, quest: true, deadline: q.daysLeft });
    } else if (q.status === "available" && q.accept?.enabled) {
      groups.matters.push({ text: `${q.giverName ?? "有人"}有事相托：「${q.title}」`, why: q.summary ?? "",
        options: [act("village-stories.quest.accept", { questId: q.id }, `接下「${q.title}」`, { enabled: true })] });
    }
  }
  for (const e of (J.events ?? []).filter((x) => x.active)) {
    groups.matters.push({ text: `${e.name}：${e.intro ?? ""}`, why: e.inDays === 0 ? "就在这几天" : "",
      options: (e.offers ?? []).map((o) => act("village-stories.event.join", { eventId: e.id, offerId: o.id }, o.label, { enabled: o.enabled !== false, reason: o.reason ?? "" })) });
  }
  if (G.focus && !groups.matters.some((m) => m.text.includes(G.focus.title))) {
    const f = G.focus;
    groups.matters.unshift({ text: f.title, why: f.why ?? "", options: f.action ? [act(f.action.type, f.action.payload, f.action.label, { enabled: true })] : [] });
  }
  for (const r of S.requests ?? []) {
    groups.matters.push({ text: r.title ?? r.text ?? "有人来找你", why: r.note ?? r.why ?? "", options: (r.actions ?? []).map((a) => act(a.id, a.payload, a.label, a)) });
  }

  const targets = S.map?.targets ?? [];
  const talkedTo = new Set((J.dialogues ?? []).map((d) => d.name));
  const seen = new Set();
  const take = (a, prefix = "") => {
    const key = `${a.id}|${JSON.stringify(a.payload ?? {})}`;
    if (seen.has(key)) return null;
    seen.add(key);
    return act(a.id, a.payload, prefix + a.label, { enabled: a.enabled !== false, reason: a.reason ?? "", hint: a.hint ?? "", cost: costOf(a), days: a.days, activityCost: a.activityCost });
  };
  for (const t of targets) {
    if (t.type === "exit" || t.type === "door") {
      for (const a of t.actions) { const c = take(a); if (c) (c.enabled ? groups.go : groups.blocked).push({ ...c, label: c.label.replace(/^走到/, "去") }); }
      continue;
    }
    for (const a of t.actions) {
      if (TIME_ACTIONS.has(a.id)) continue;
      const named = t.type === "person" && !String(a.label).includes(t.name) ? `${t.name}：` : "";
      const c = take(a, named);
      if (!c) continue;
      if (!c.enabled) { if (a.id !== "world-objects.take") groups.blocked.push(c); continue; } // others' things are simply not yours
      groups.here.push({ ...c, who: t.type === "person" ? t.name : "", talkedTo: talkedTo.has(t.name) });
    }
  }
  // Actions the map does not place (no target), so nothing the player can do is lost.
  for (const a of S.actions ?? []) {
    if (TIME_ACTIONS.has(a.id) || a.id === "settlement-locations.configure_plan") continue;
    if (a.id === "world-space.move_within" && a.payload?.spaceId === S.spaceId) continue; // already standing there
    const c = take(a);
    if (c) (c.enabled ? groups.here : groups.blocked).push(c);
  }
  const endDay = (S.actions ?? []).find((a) => a.id === "settlement-locations.end_day");
  if (endDay) groups.time.push(act(endDay.id, endDay.payload, "让这一天过去", { enabled: endDay.enabled !== false, reason: endDay.reason ?? "", hint: endDay.hint ?? "", cost: "1 天" }));
  groups.time.push(act("story.advance", {}, "过几天看看", { enabled: true, hint: "日子一天天过，有人找你、有事发生或该你拿主意时就停下。", cost: "几天" }));
  for (const a of (S.actions ?? []).filter((x) => x.id === "settlement-locations.season.begin")) {
    groups.time.push(act(a.id, a.payload, a.label, { enabled: a.enabled !== false, reason: a.reason ?? "", hint: a.hint ?? "", cost: costOf(a), season: true }));
  }
  // What cannot be done yet, with the next step the rules already know.
  const blockedByLabel = new Map(groups.blocked.map((b) => [b.label, b]));
  for (const b of G.blocked ?? []) {
    const known = blockedByLabel.get(b.label);
    const next = b.action ? act(b.action.type, b.action.payload, b.action.label, { enabled: true }) : null;
    if (known) Object.assign(known, { next: b.next ?? "", step: next });
    else groups.blocked.push(act(b.actionId, {}, b.label, { enabled: false, reason: b.reason ?? "", next: b.next ?? "", step: next }));
  }
  return groups;
}

/**
 * "我想……": find what the player could do towards a wish, among everything
 * offered now and everything blocked (with its next step). Plain character
 * overlap — no hidden knowledge, no invented actions.
 */
export function searchIntent(s, query) {
  const q = String(query ?? "").replace(/\s+/g, "").replace(/^我?想(要)?/, "");
  if (!q) return [];
  const g = choiceGroups(s);
  const pool = [
    ...g.routes.flatMap(r => r.options.map(c => ({ ...c, group: "route" }))),
    ...g.here.map((c) => ({ ...c, group: "here" })), ...g.go.map((c) => ({ ...c, group: "go" })), ...g.time.map((c) => ({ ...c, group: "time" })),
    ...g.matters.flatMap((m) => m.options.map((o) => ({ ...o, hint: m.text, group: "matters" }))),
    ...g.talk.flatMap((t) => t.options.map((o) => ({ ...o, label: `${t.who}：${o.label}`, group: "talk" }))),
    ...g.blocked.map((c) => ({ ...c, group: "blocked" })),
  ];
  // Everyday words lead to the words the game uses for the same things.
  const terms = new Set([q]);
  for (const [keys, words] of WISH_WORDS) if (keys.some((k) => q.includes(k))) words.forEach((w) => terms.add(w));
  const chars = [...new Set([...q])];
  const scored = pool.map((c) => {
    const label = c.label, hay = `${label} ${c.hint ?? ""} ${c.reason ?? ""} ${c.next ?? ""}`;
    let score = 0;
    for (const t of terms) { if (label.includes(t)) score += t === q ? 4 : 2; else if (hay.includes(t)) score += t === q ? 2 : 0.8; }
    score += chars.filter((ch) => label.includes(ch)).length / chars.length;
    return { c, score: score - (c.enabled === false ? 0.3 : 0) };
  }).filter((x) => x.score >= 1).sort((a, b) => b.score - a.score);
  const out = [];
  const keys = new Set();
  for (const { c } of scored) {
    const k = `${c.id}|${JSON.stringify(c.payload)}|${c.label}`;
    if (keys.has(k)) continue;
    keys.add(k);
    out.push(c);
    if (out.length >= 6) break;
  }
  return out;
}

const WISH_WORDS = [
  [["罐", "碗", "陶", "器", "瓦"], ["陶坯", "坯", "窑", "黏土", "烧", "陶"]],
  [["吃", "饿", "饭", "粮", "食"], ["吃", "煮", "粟", "灶", "饭", "鱼", "换"]],
  [["屋", "房", "漏", "顶"], ["屋顶", "修补", "芦苇", "草绳", "盖"]],
  [["认识", "朋友", "聊", "说话", "熟"], ["叫住", "说", "问", "聊", "帮"]],
  [["换", "买", "交易"], ["换", "交换", "摊", "集市"]],
  [["水", "渴"], ["水", "河", "罐"]],
  [["改进", "发明", "省力", "桔槔"], ["桔槔", "配重", "打水", "试做", "备料"]],
  [["远行", "出门", "旅行", "外面"], ["渡口", "远行", "集市", "出行"]],
  [["柴", "暖", "冷", "火"], ["柴草", "生火", "火", "芦苇"]],
  [["布", "衣", "穿", "织"], ["织", "纤维", "麻", "布", "披", "编"]],
  [["鱼", "网"], ["鱼", "网", "渔"]],
  [["学", "手艺", "师"], ["学", "教", "请教"]],
  [["娶", "嫁", "成亲", "结婚", "喜欢"], ["提亲", "成亲", "心意", "陪"]],
  [["孩子", "后代", "传"], ["孩子", "传给", "下一代", "交棒"]],
  [["种", "田", "地", "收"], ["播种", "收", "田", "粟", "下地"]],
  [["睡", "歇", "累", "休息"], ["休息", "睡", "铺"]],
];

/** What changed in the village while days passed: lines worth writing into the book. */
export function newsSince(before, after) {
  const lines = [];
  const oldImprovement = before?.outlook?.progress?.improvement, newImprovement = after?.outlook?.progress?.improvement;
  if (newImprovement?.stage === "installed" && oldImprovement?.stage !== "installed") lines.push("✦ 河边有了桔槔，大家打水省力了。这项改变会留给下一代。");
  const was = new Set(before?.settlement?.happenings ?? []);
  for (const h of after?.settlement?.happenings ?? []) if (!was.has(h)) lines.push(String(h));
  const g0 = before?.outlook?.goals, g1 = after?.outlook?.goals;
  if (g0 && g1 && g1.stage > g0.stage) lines.push(`✦ 村子到了「${g1.stageName}」这一步。`);
  const done0 = new Set((before?.stories?.quests ?? []).filter((q) => q.status === "done" || q.status === "complete").map((q) => q.id));
  for (const q of after?.stories?.quests ?? []) if ((q.status === "done" || q.status === "complete") && !done0.has(q.id)) lines.push(`✦ 「${q.title}」这件事，办成了。`);
  const ach0 = new Set((before?.stories?.achievements ?? []).filter((a) => a.unlocked || a.done).map((a) => a.id));
  for (const a of after?.stories?.achievements ?? []) if ((a.unlocked || a.done) && !ach0.has(a.id)) lines.push(`✦ ${a.name ?? a.title ?? "一件值得记下的事"}${a.text ? `：${a.text}` : ""}`);
  return lines;
}

/** Whether the world wants the player now (stop letting days pass). */
export function needsPlayer(before, after) {
  const A = after?.stories ?? {}, B = before?.stories ?? {};
  if (A.incident && !B.incident) return "出了件事，得你拿主意。";
  if ((after?.settlement?.requests ?? []).length > (before?.settlement?.requests ?? []).length) return "有人找上门来了。";
  const acc = (s) => (s?.stories?.quests ?? []).filter((q) => q.status === "available" && q.accept?.enabled).length;
  if (acc(after) > acc(before)) return "有人有事相托。";
  const live = (s) => (s?.stories?.events ?? []).filter((e) => e.active).length;
  if (live(after) > live(before)) return "村里有热闹了。";
  if (Number(after?.settlement?.hunger ?? 0) >= 7 && Number(before?.settlement?.hunger ?? 0) < 7) return "饿了，得先吃点东西。";
  if (seasonKey(after) !== seasonKey(before)) return "换季了。";
  return "";
}

// ---------------------------------------------------------------------------
// Season life (the main way to live on: 继续生活)
// ---------------------------------------------------------------------------

const SEASON_END_MONTH = { 春: 5, 夏: 8, 秋: 11, 冬: 2 };
const NEXT_SEASON = { 春: "夏", 夏: "秋", 秋: "冬", 冬: "春" };
/** Days left in this season, counting today (30-day months, as the world clock). */
export function daysLeftInSeason(s) {
  const c = s?.outlook?.calendar;
  const season = c?.season ?? s?.settlement?.season;
  if (!c || !SEASON_END_MONTH[season]) return 0;
  const monthsLeft = (SEASON_END_MONTH[season] - c.month + 12) % 12;
  return monthsLeft * 30 + (30 - c.day) + 1;
}
export const nextSeason = (s) => NEXT_SEASON[s?.outlook?.calendar?.season ?? s?.settlement?.season] ?? "";

/** The ways to spend this season the rules offer ("这一季多在地里" …). */
export function seasonFocuses(s) {
  return (s?.settlement?.actions ?? []).filter((a) => a.id === "settlement-locations.season.begin").map((a) => ({
    id: a.id, payload: a.payload, label: a.label, hint: String(a.hint ?? "").replace(/（余下这一季[^）]*）/, ""),
    enabled: a.enabled !== false, reason: a.reason ?? "",
  }));
}

/** Things that will happen later this season (a season lived in one go passes them by). */
export function upcomingThisSeason(s) {
  const left = daysLeftInSeason(s);
  const out = [];
  for (const e of s?.stories?.events ?? []) if (!e.active && e.inDays > 0 && e.inDays < left) out.push({ text: e.name, inDays: e.inDays, why: e.intro ?? "" });
  for (const e of s?.outlook?.calendar?.entries ?? []) {
    if (e.offset > 0 && e.offset < left && e.named && e.kind !== "crop" && !out.some((o) => o.text === e.text)) out.push({ text: e.text, inDays: e.offset, why: "" });
  }
  return out.sort((a, b) => a.inDays - b.inDays).slice(0, 4);
}

/**
 * Matters that want the player before a season passes: a happening that
 * needs a decision, a promise that needs an answer, someone asking for help.
 * Never skipped silently: the player handles them or sets them aside.
 */
export function keyMatters(s) {
  const out = [];
  const inc = s?.stories?.incident;
  if (inc && (inc.choices ?? inc.options)?.length) out.push({ kind: "incident", text: inc.title ?? inc.text ?? "出了件事" });
  for (const q of s?.stories?.quests ?? []) if (q.status === "active" && q.decide?.options?.length) out.push({ kind: "decide", text: `「${q.title}」要你拿主意` });
  for (const q of s?.stories?.quests ?? []) if (q.status === "active" && q.daysLeft != null && q.daysLeft < daysLeftInSeason(s)) out.push({ kind: "deadline", text: `「${q.title}」还剩 ${q.daysLeft} 天` });
  for (const r of s?.settlement?.requests ?? []) out.push({ kind: "request", text: r.title ?? r.text ?? "有人找你帮忙" });
  for (const e of s?.stories?.events ?? []) if (e.active) out.push({ kind: "event", text: `${e.name}正在这几天` });
  return out;
}

/** What one season changed, for the summary card: things in hand, people, the village, age. */
export function seasonChanges(before, after) {
  const out = [];
  const count = (s) => new Map((s?.settlement?.carrying ?? []).map((r) => [r.label ?? r.resourceId, Number(r.count) || 0]));
  const a = count(before), b = count(after);
  const gained = [], lost = [];
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    const d = (b.get(k) ?? 0) - (a.get(k) ?? 0);
    if (d > 0) gained.push(`${k}×${d}`); else if (d < 0) lost.push(`${k}×${-d}`);
  }
  if (gained.length) out.push(`多了：${gained.join("、")}`);
  if (lost.length) out.push(`用掉：${lost.join("、")}`);
  const g0 = before?.outlook?.goals, g1 = after?.outlook?.goals;
  if (g0 && g1 && g1.stage > g0.stage) out.push(`村子到了「${g1.stageName}」`);
  const age0 = Number(before?.character?.age), age1 = Number(after?.character?.age);
  if (age1 > age0) out.push(`你${age1}岁了`);
  const skills0 = (before?.settlement?.skills ?? []).length, skills1 = (after?.settlement?.skills ?? []).length;
  if (skills1 > skills0) out.push("学会了新手艺");
  return out;
}
