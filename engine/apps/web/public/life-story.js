/**
 * 人生：the main screen of the text life (UI/UX V1.0 + 适配附录 V1.1).
 *
 * Three layers. Person: portrait, name, age, settlement, season, today's
 * activity, a few states. This season's book: what happened, what is in front
 * of you (people speaking, matters to settle), written as a chapter rather
 * than a log. Main actions: 继续生活 (live on to the next season, or finish
 * today), 日常行动 (the day's single actions), 我想…… (find a way towards a
 * wish). Phones in landscape put the person and actions on the left and the
 * book on the right; upright phones stack them.
 *
 * Every choice is an ordinary action of the game, sent through the same
 * channel as the other pages; nothing here decides rules or invents events.
 * The book is kept per life on this device (the world itself is saved on the
 * server; the book is how this player read it).
 */
import { playMode } from "/play-mode.js";
import { syncPanel } from "/life-map.js";
import { hungerLevel, roofLevel, loadLevel } from "/hud.js";
import { renderFigure } from "/character-appearance.js";
import { sfx } from "/audio.js";
import {
  sceneText, dayHeading, chapterTitle, choiceGroups, searchIntent, newsSince,
  dayKey, seasonKey, placeKey, dateLine,
  daysLeftInSeason, nextSeason, seasonFocuses, upcomingThisSeason, keyMatters, seasonChanges,
} from "/life-story-text.js";

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]);
const game = () => window.OpenLifeGame;
const enabled = () => playMode() === "story";
const MAX_ENTRIES = 400;
const WISHES = ["填饱肚子", "做个陶罐", "修屋顶", "交个朋友", "学门手艺", "换点东西", "成个家"];

let root = null, state = null, book = null, pending = false, deferred = null, actions = [], sheet = "", wish = "", setAside = "";

// ---------------------------------------------------------------------------
// The book (kept per life on this device)
// ---------------------------------------------------------------------------

const bookKey = (s) => `openlife.book.v2.${s?.settlement?.characterId ?? s?.character?.id ?? "anon"}`;
function loadBook(s) {
  try {
    const b = JSON.parse(localStorage.getItem(bookKey(s)) || "null");
    if (b && Array.isArray(b.entries)) return b;
  } catch { /* a broken book starts a new one */ }
  return { entries: [], chapter: 0, day: "", season: "", place: "", news: [] };
}
function saveBook() {
  if (!book || !state) return;
  book.entries = book.entries.slice(-MAX_ENTRIES);
  try { localStorage.setItem(bookKey(state), JSON.stringify(book)); } catch { /* full storage never stops the game */ }
}
function write(kind, text, extra = {}) {
  if (!text && kind !== "summary") return;
  const entry = { kind, text: String(text ?? ""), ...extra };
  book.entries.push(entry);
  $("lsBook")?.append(entryElement(entry));
}

const chineseNumber = (n) => {
  const d = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (n < 10) return d[n];
  if (n < 20) return `十${n % 10 ? d[n % 10] : ""}`;
  if (n < 100) return `${d[Math.floor(n / 10)]}十${n % 10 ? d[n % 10] : ""}`;
  return String(n);
};

/** Compare the new state with what the book last saw and write what a reader needs. */
function chronicle(s, previous) {
  if (!s?.settlement?.exists) return;
  const first = book.entries.length === 0;
  const newSeason = seasonKey(s) !== book.season, newDay = dayKey(s) !== book.day, moved = placeKey(s) !== book.place;
  if (first || newSeason) {
    book.chapter += 1;
    write("chapter", `第${chineseNumber(book.chapter)}回　${chapterTitle(s)}`);
    if (first) {
      const o = s.settlement.origin;
      if (o?.story) write("prose", o.story);
      if (o?.aspiration) write("prose", `你心里记着一件事：${o.aspiration}`);
      write("tip", "「日常行动」里是今天能做的事；想把这一季过下去，按「继续生活」。想做什么却不知道从哪下手，就说「我想……」。");
    }
  }
  if (previous) {
    const recent = book.entries.slice(-12).map((e) => `${e.text} ${(e.lines ?? []).join(" ")}`).join("\n");
    for (const line of newsSince(previous, s)) {
      const core = line.replace(/^✦\s*/, "").split(/[：:]/)[0];
      if (line.startsWith("✦") && !recent.includes(core)) write("mark", line);
    }
  }
  if (first || newSeason || newDay) write("day", dayHeading(s));
  if (first || newDay || moved) write("scene", sceneText(s));
  book.season = seasonKey(s); book.day = dayKey(s); book.place = placeKey(s);
  const fresh = (s.settlement.happenings ?? []).filter((h) => !book.news.includes(h));
  for (const h of fresh) write("news", h);
  book.news = [...book.news, ...fresh].slice(-40);
  saveBook();
}

function entryElement(e) {
  if (e.kind === "summary") {
    const card = document.createElement("section");
    card.className = "ls-summary";
    card.innerHTML = `<h4>${esc(e.title ?? "这一季")}</h4>${(e.lines ?? []).map((l) => `<p>${esc(l)}</p>`).join("")}${(e.changes ?? []).length ? `<ul>${e.changes.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}`;
    return card;
  }
  const p = document.createElement(e.kind === "chapter" ? "h2" : e.kind === "day" ? "h3" : "p");
  p.className = `ls-${e.kind}`;
  if (e.kind === "you") p.innerHTML = `<span aria-hidden="true">›</span> ${esc(e.text)}`;
  else if (e.kind === "say" && e.who) p.innerHTML = `<b>${esc(e.who)}</b>${esc(e.text)}`;
  else p.textContent = e.text;
  return p;
}
function renderBook() {
  const box = $("lsBook");
  box.innerHTML = "";
  const start = Math.max(0, book.entries.length - 160);
  if (start > 0) {
    const more = document.createElement("button");
    more.type = "button"; more.className = "ls-older"; more.textContent = `往前还有 ${start} 段，翻开看`;
    more.addEventListener("click", () => { more.remove(); box.prepend(...book.entries.slice(0, start).map(entryElement)); });
    box.append(more);
  }
  box.append(...book.entries.slice(start).map(entryElement));
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

const NAV = [["character", "人生"], ["map", "聚落"], ["people", "人物"], ["works", "物品"], ["history", "记录"]];

function build() {
  root = document.createElement("section");
  root.id = "lifeStory";
  root.className = "ls";
  root.setAttribute("aria-label", "人生");
  root.innerHTML = `
    <aside class="ls-side">
      <div class="ls-me" id="lsMe"></div>
      <div class="ls-actions" id="lsActions"></div>
    </aside>
    <main class="ls-main">
      <nav class="ls-nav" aria-label="其他页面">${NAV.map(([r, l]) => `<button type="button" data-ls="${r}">${l}</button>`).join("")}<button type="button" data-ls="menu" aria-label="菜单">☰</button></nav>
      <div class="ls-scroll" id="lsScroll">
        <article class="ls-book" id="lsBook" aria-live="polite"></article>
        <section class="ls-now" id="lsNow" aria-label="眼下"></section>
      </div>
    </main>
    <div class="ls-sheet" id="lsSheet" hidden role="dialog"></div>
    <div class="ls-card-wrap" id="lsCard" hidden role="dialog" aria-modal="true"></div>`;
  document.body.append(root);
  root.querySelector(".ls-nav").addEventListener("click", (e) => {
    const b = e.target.closest("[data-ls]");
    if (!b) return;
    if (b.dataset.ls === "menu") document.getElementById("menuButton")?.click();
    else window.dispatchEvent(new CustomEvent("openlife:navigate", { detail: b.dataset.ls }));
  });
  root.addEventListener("click", onClick);
  root.addEventListener("input", (e) => { if (e.target.id === "lsWish") { wish = e.target.value; renderWishResults(); } });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && root && !root.hidden) { closeCard(); closeSheet(); } });
}

function renderMe(s) {
  const S = s.settlement, c = s.character ?? {}, a = S.dailyActivity ?? { remaining: 0, capacity: 0 };
  const states = [["饱暖", hungerLevel(S.hunger, S.hungerToll)], ["屋顶", roofLevel(S.roof)], ["负重", loadLevel(S.portableLoad)]].filter(([, st]) => st);
  const me = $("lsMe");
  const figureId = S.characterId ?? c.id ?? "me";
  if (me.dataset.figure !== figureId) { me.dataset.figure = figureId; me.innerHTML = `<div class="ls-face">${renderFigure(figureId, "player")}</div><div class="ls-id"></div><div class="ls-states"></div>`; }
  me.querySelector(".ls-id").innerHTML = `<b>${esc(c.name ?? "")}</b><span>${esc(c.age ?? "")} 岁 · ${esc(c.city ?? "")}</span>
    <span class="ls-when">${esc(dateLine(s))}</span>
    <span class="ls-pips" title="今天还剩 ${a.remaining} 格活动时间">${Array.from({ length: a.capacity }, (_, i) => `<i class="${i < a.remaining ? "on" : ""}"></i>`).join("")}<em>今天 ${a.remaining}/${a.capacity}</em></span>`;
  me.querySelector(".ls-states").innerHTML = states.map(([label, st]) => `<span class="ls-st ${st.tone}"><small>${label}</small>${esc(st.word)}</span>`).join("")
    + `<span class="ls-st"><small>手艺</small>${(S.skills ?? []).length ? `${(S.skills ?? []).length} 门` : "还在学"}</span>`;
}

/** The main button changes with the moment: finish today, or live on to the next season. */
function mainAction(s) {
  const a = s.settlement.dailyActivity ?? {};
  const midDay = Number(a.used ?? 0) > 0 && Number(a.remaining ?? 0) > 0;
  if (!s.character?.alive) return { kind: "end", label: "这一生写完了", sub: "看看留下了什么" };
  if (midDay) return { kind: "day", label: "度过今天剩下的", sub: "村里也一起过完这一天" };
  return { kind: "season", label: "继续生活", sub: `把这一季过下去 · 还有 ${daysLeftInSeason(s)} 天到${nextSeason(s)}` };
}

function renderActions(s) {
  const m = mainAction(s);
  const midDay = m.kind === "day";
  $("lsActions").innerHTML = `
    <button type="button" class="ls-main-btn" data-do="${m.kind}"><b>${esc(m.label)}</b><small>${esc(m.sub)}</small></button>
    <div class="ls-sub-btns">
      <button type="button" data-do="daily">日常行动</button>
      <button type="button" data-do="wish">我想……</button>
      ${midDay ? `<button type="button" data-do="season" class="ls-quiet">进入下一季</button>` : ""}
    </div>`;
}

const choiceButton = (c, cls = "") => {
  actions.push(c);
  const i = actions.length - 1;
  return `<button type="button" class="ls-choice ${cls}${c.enabled === false ? " off" : ""}" data-i="${i}" ${c.enabled === false ? 'aria-disabled="true"' : ""}>
    <span>${esc(c.label)}</span>${c.cost ? `<em>${esc(c.cost)}</em>` : ""}${c.enabled === false && c.reason ? `<small>${esc(c.reason)}</small>` : ""}</button>`;
};

/** 眼下: people speaking to you and matters to settle, under the book. */
function renderNow() {
  actions = [];
  const s = state, g = choiceGroups(s), parts = [];
  if (g.routes.length) parts.push(`<section class="ls-card-inline"><h4>这段日子想做什么</h4>${g.routes.map(r => `<details class="ls-route"><summary>${esc(r.title)}</summary><p>${esc(r.text)}</p><div class="ls-opts">${r.options.map(o => choiceButton(o)).join("")}</div></details>`).join("")}</section>`);
  if (!s.character?.alive) {
    const next = (s.actions ?? []).find((a) => a.id === "next-generation" && a.enabled);
    parts.push(`<section class="ls-card-inline end"><h4>这一生写完了</h4><p>翻翻「记录」和「人生」，看看留下了什么${next ? "，再接着写下一代" : ""}。</p>${next ? choiceButton({ id: next.id, payload: {}, label: "接着写下一代", enabled: true }) : ""}</section>`);
  }
  for (const t of g.talk) {
    parts.push(`<section class="ls-card-inline talk"><div class="ls-talker">${t.npc ? `<div class="ls-mini">${renderFigure(`settlement-locations:resident:${t.npc}`)}</div>` : ""}<p><b>${esc(t.who)}</b>${esc(t.text)}</p></div>
      <div class="ls-opts">${t.options.map((o) => choiceButton(o, "talk")).join("")}</div>${t.later ? `<small class="ls-later">还有 ${t.later} 句话，等再熟一些才好开口。</small>` : ""}</section>`);
  }
  for (const m of g.matters) {
    parts.push(`<section class="ls-card-inline matter"><p><b>${esc(m.text)}</b>${m.deadline != null ? `<em>还剩 ${esc(m.deadline)} 天</em>` : ""}</p>${m.why ? `<small>${esc(m.why)}</small>` : ""}
      ${m.options.length ? `<div class="ls-opts">${m.options.map((o) => choiceButton(o)).join("")}</div>` : ""}</section>`);
  }
  $("lsNow").innerHTML = parts.length ? `<h4 class="ls-now-head">眼下</h4>${parts.join("")}` : "";
  if (sheet === "daily") renderDaily(); else if (sheet === "wish") renderWish();
}

// ---------------------------------------------------------------------------
// Sheets: 日常行动 and 我想……
// ---------------------------------------------------------------------------

function openSheet(kind) { sheet = kind; kind === "daily" ? renderDaily() : renderWish(); $("lsSheet").hidden = false; root.classList.add("has-sheet"); }
function closeSheet() { sheet = ""; const el = $("lsSheet"); if (el) { el.hidden = true; el.innerHTML = ""; } root?.classList.remove("has-sheet"); }

function renderDaily() {
  const g = choiceGroups(state);
  const people = new Map(), rest = [];
  for (const c of g.here) (c.who ? (people.get(c.who) ?? people.set(c.who, []).get(c.who)) : rest).push(c);
  const endDay = g.time.find((c) => c.id === "settlement-locations.end_day");
  $("lsSheet").innerHTML = `<header><h3>日常行动</h3><span>今天还剩 ${state.settlement.dailyActivity?.remaining ?? 0} 格 · 在${esc(state.settlement.placeName ?? "")}</span><button type="button" class="ls-x" data-do="close" aria-label="关闭">×</button></header>
    <div class="ls-sheet-body">
      ${rest.length ? `<h4>这里能做</h4><div class="ls-opts">${rest.map((c) => choiceButton(c)).join("")}</div>` : ""}
      ${[...people].map(([who, list]) => `<h4>${esc(who)}</h4><div class="ls-opts">${list.map((c) => choiceButton({ ...c, label: c.label.replace(`${who}：`, "") })).join("")}</div>`).join("")}
      ${g.go.length ? `<h4>去别处</h4><div class="ls-opts ls-chips">${g.go.map((c) => choiceButton(c, "chip")).join("")}</div>` : ""}
      ${endDay ? `<h4>这一天</h4><div class="ls-opts">${choiceButton(endDay)}</div>` : ""}
      ${g.blocked.length ? `<details class="ls-fold"><summary>还有 ${g.blocked.length} 件暂时做不成</summary>${g.blocked.slice(0, 20).map((b) => `<div class="ls-blocked"><p>${esc(b.label)}<small>${esc(b.reason || "现在还不行")}</small></p>${b.next ? `<small class="ls-next">${esc(b.next)}</small>` : ""}${b.step ? choiceButton({ ...b.step, label: `先${b.step.label}` }, "step") : ""}</div>`).join("")}</details>` : ""}
    </div>`;
}

function renderWish() {
  $("lsSheet").innerHTML = `<header><h3>我想……</h3><span>说一个念头，看看现在有什么门路</span><button type="button" class="ls-x" data-do="close" aria-label="关闭">×</button></header>
    <div class="ls-sheet-body">
      <input id="lsWish" type="text" placeholder="比如：做个陶罐" value="${esc(wish)}" autocomplete="off" />
      <div class="ls-chips ls-wish-chips">${WISHES.map((w) => `<button type="button" data-wish="${esc(w)}" class="${w === wish ? "on" : ""}">${esc(w)}</button>`).join("")}</div>
      <div id="lsWishOut" class="ls-opts"></div>
    </div>`;
  renderWishResults();
}
function renderWishResults() {
  const out = $("lsWishOut");
  if (!out) return;
  if (!wish.trim()) { out.innerHTML = ""; return; }
  const found = searchIntent(state, wish);
  const ready = found.filter((c) => c.enabled !== false), later = found.filter((c) => c.enabled === false);
  out.innerHTML = !found.length ? `<p class="ls-none">眼下想不出跟「${esc(wish)}」有关的门路。换个说法，或者去别处看看、问问人。</p>`
    : `${ready.length ? `<h4>现在就能做</h4>${ready.map((c) => choiceButton(c)).join("")}` : ""}
       ${later.length ? `<h4>还差一步</h4>${later.map((c) => `<div class="ls-blocked"><p>${esc(c.label)}<small>${esc(c.reason || "现在还不行")}</small></p>${c.next ? `<small class="ls-next">${esc(c.next)}</small>` : ""}${c.step ? choiceButton({ ...c.step, label: `先${c.step.label}` }, "step") : ""}</div>`).join("")}` : ""}`;
}

// ---------------------------------------------------------------------------
// Choice card: how to spend this season (and anything to settle first)
// ---------------------------------------------------------------------------

function openSeasonCard() {
  const s = state;
  const matters = keyMatters(s).filter((m) => `${m.kind}|${m.text}` !== setAside);
  const card = $("lsCard");
  if (matters.length) {
    card.innerHTML = `<div class="ls-card"><span class="ls-seal">事</span><h3>先别急着过这一季</h3>
      <p>有事还没了：</p><ul>${matters.map((m) => `<li>${esc(m.text)}</li>`).join("")}</ul>
      <p class="ls-quietp">一季过去，这些事不会等你。</p>
      <div class="ls-opts"><button type="button" class="ls-choice" data-do="close-card">回去先处理</button>
      <button type="button" class="ls-choice ls-quiet" data-do="set-aside" data-key="${esc(`${matters[0].kind}|${matters[0].text}`)}">先放着，照样过这一季</button></div></div>`;
  } else {
    const focuses = seasonFocuses(s), coming = upcomingThisSeason(s);
    card.innerHTML = `<div class="ls-card"><span class="ls-seal">季</span><h3>这一季，怎么过？</h3>
      <p>还有 ${daysLeftInSeason(s)} 天就是${esc(nextSeason(s))}了。把心思放在一处，一季过去，看看攒下了什么、跟谁更亲了。</p>
      ${coming.length ? `<p class="ls-coming">这一季里还有：${coming.map((c) => `${esc(c.text)}（${c.inDays} 天后）`).join("、")}。一口气过下去会错过。</p>` : ""}
      <div class="ls-opts ls-focuses">${focuses.map((f) => choiceButton({ ...f, cost: "" }, "focus")).join("")}</div>
      <div class="ls-opts"><button type="button" class="ls-choice ls-quiet" data-do="close-card">再想想，先一天天过</button></div></div>`;
    card.querySelectorAll(".focus").forEach((b) => { const f = actions[Number(b.dataset.i)]; if (f?.hint && f.enabled !== false) b.insertAdjacentHTML("beforeend", `<small>${esc(f.hint)}</small>`); });
  }
  card.hidden = false;
}
function closeCard() { const c = $("lsCard"); if (c) { c.hidden = true; c.innerHTML = ""; } }

// ---------------------------------------------------------------------------
// Acting
// ---------------------------------------------------------------------------

async function onClick(e) {
  const wishChip = e.target.closest("[data-wish]");
  if (wishChip) { wish = wishChip.dataset.wish; renderWish(); return; }
  const d = e.target.closest("[data-do]");
  if (d) {
    const what = d.dataset.do;
    if (what === "close") return closeSheet();
    if (what === "close-card") return closeCard();
    if (what === "set-aside") { setAside = d.dataset.key; return openSeasonCard(); }
    if (what === "daily" || what === "wish") return sheet === what ? closeSheet() : openSheet(what);
    if (what === "season") { closeSheet(); return openSeasonCard(); }
    if (what === "end") return window.dispatchEvent(new CustomEvent("openlife:navigate", { detail: "history" }));
    if (what === "day") {
      const endDay = (state.settlement.actions ?? []).find((a) => a.id === "settlement-locations.end_day");
      if (endDay) return run({ id: endDay.id, payload: endDay.payload ?? {}, label: "度过今天剩下的" });
    }
    return;
  }
  const b = e.target.closest("[data-i]");
  if (!b || pending) return;
  const c = actions[Number(b.dataset.i)];
  if (!c) return;
  if (c.enabled === false) { b.classList.add("shake"); setTimeout(() => b.classList.remove("shake"), 400); return; }
  run(c);
}

async function run(c) {
  if (pending) return;
  const season = c.id === "settlement-locations.season.begin";
  pending = true;
  root.classList.add("busy");
  closeCard();
  const before = state;
  write("you", c.label);
  const out = await game()?.act(c.id, c.payload ?? {});
  if (out?.ok) {
    const lines = out.narrative?.length ? out.narrative : out.told ? [out.told] : [];
    if (season) {
      // A season lived is told as one card: what it was like, then what changed.
      const after = deferred ?? state;
      write("summary", "", { title: `${before.outlook?.calendar?.season ?? ""}天过去了`, lines, changes: seasonChanges(before, after) });
      sfx("day");
    } else {
      lines.forEach((line, i) => (c.speaker && i === 0 && !String(line).startsWith(c.speaker) ? write("say", line, { who: c.speaker }) : writeLine(line)));
      if (out.chips?.length) write("note", out.chips.join("，"));
    }
  } else write("fail", out?.error || "这件事没做成。");
  pending = false;
  root.classList.remove("busy");
  setAside = "";
  const next = deferred ?? state;
  deferred = null;
  settle(next, before);
}

function writeLine(line) {
  if (/^【成就】|关系变成了「/.test(String(line))) { write("mark", `✦ ${String(line).replace(/^【成就】/, "")}`); return; }
  const m = String(line).match(/^([^\s：“"]{1,6})[：:]\s*(“.*)$/);
  if (m) write("say", m[2], { who: m[1] });
  else write("prose", line);
}

function settle(next, before) {
  state = next;
  chronicle(next, before);
  paint();
  saveBook();
  requestAnimationFrame(() => {
    const entries = [...($("lsBook")?.children ?? [])];
    const target = entries.reverse().find((el) => el.classList.contains("ls-you")) ?? $("lsNow");
    target?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });
}

function paint() {
  renderMe(state);
  renderActions(state);
  renderNow();
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

window.addEventListener("openlife:state", (e) => {
  if (!enabled()) return;
  const s = e.detail;
  if (!s?.settlement?.exists) return;
  document.body.classList.add("has-life-story");
  document.documentElement.classList.add("game-skin", "story-skin");
  if (!root) build();
  root.hidden = false;
  if (pending) { deferred = s; return; }
  let fresh = false;
  try { fresh = sessionStorage.getItem("openlife.book.fresh") === "1"; sessionStorage.removeItem("openlife.book.fresh"); } catch { /* ignore */ }
  if (fresh) { try { localStorage.removeItem(bookKey(s)); } catch { /* ignore */ } book = null; }
  const sameLife = book && bookKey(state) === bookKey(s);
  const before = sameLife ? state : null;
  if (!sameLife) { book = loadBook(s); state = s; renderBook(); }
  state = s;
  chronicle(s, before);
  paint();
  syncPanel();
});
document.addEventListener("submit", (e) => {
  if (e.target?.id === "newLifeForm") { try { sessionStorage.setItem("openlife.book.fresh", "1"); } catch { /* ignore */ } }
}, true);
