/**
 * 此刻 as a place you walk around in (map-life M1–M2).
 *
 * Reads `state.settlement.map` (tiles, props, the player's confirmed cell and
 * every target with its own legitimate actions) and lets the player:
 *   tap ground → map.walk to that cell;  tap a person/thing → select it;
 *   choose an action → walk next to it (map.walk targetKey) → map.interact.
 * The server answers every step; the animation only plays routes it already
 * confirmed. Walking is free and never moves the day. Text pages below keep
 * offering the very same actions.
 */
import { MapRenderer, loadArt } from "/life-map-render.js";
import { CELL, drawThing, resourceLook } from "/life-map-art.js";
import { framesFor } from "/life-map-people.js";
import { icon, actionIconName } from "/icons.js";
import { hungerLevel } from "/hud.js";
import { sfx, audioState, toggleSound, onAudioChange, setAudioScene } from "/audio.js";

import { playMode, nextPlayMode, setPlayMode, PLAY_LABEL } from "/play-mode.js";
export const mapEnabled = () => playMode() === "map";
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]);
const SPEED = 6.5; // cells per second
const TYPE_LABEL = { person: "人", animal: "动物", object: "东西", yield: "原料", work: "做活的地方", door: "门", exit: "出口" };

let root, canvas, renderer, art, labels;
let state = null, map = null, sceneKey = "";
let selectedKey = "", dest = null, pending = null;
const me = { x: 0, y: 0, route: [], dist: 0, left: false, walking: false, facing: "up" };
/** Villagers drift a step or two around their spot (presentation only; their spot is what the rules use). */
const npcs = new Map();
let drag = null, camOffset = { x: 0, y: 0 }, lastCam = null;
let running = false, walkResolve = null, hoverKey = "";
let lastTick = null, lastPhase = null, lastCarry = null, floats = [], requesting = false, openAll = false;

const game = () => window.OpenLifeGame;
/** Read-only peek for browser checks (tests drive the same buttons a player does). */
window.__lifeMap = {
  get me() { return { ...me, route: me.route.length }; }, get player() { return map?.player; }, get selected() { return selectedKey; },
  /** Where a cell's centre is on screen (client px), for browser checks that tap the ground. */
  screenOf(x, y) {
    if (!lastCam || !canvas) return null;
    const r = canvas.getBoundingClientRect(), s = lastCam.k / lastCam.dpr;
    return { x: r.left + (x * CELL + 8 - lastCam.x) * s, y: r.top + (y * CELL + 8 - lastCam.y) * s };
  },
};

const SVG = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const GLYPH = {
  bag: SVG('<path d="M6 8h12l-1 12H7Z"/><path d="M9 8a3 3 0 0 1 6 0"/>'),
  people: SVG('<circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.2A4.5 4.5 0 0 1 20.5 19"/>'),
  life: SVG('<circle cx="12" cy="7.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>'),
  journal: SVG('<path d="M6 4h10a2 2 0 0 1 2 2v14H8a2 2 0 0 1-2-2Z"/><path d="M6 18a2 2 0 0 1 2-2h10M10 8h5M10 11h4"/>'),
  clock: SVG('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  menu: SVG('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  center: SVG('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>'),
  map: SVG('<path d="m4 6 5-2 6 2 5-2v14l-5 2-6-2-5 2Z"/><path d="M9 4v14M15 6v14"/>'),
  sound: SVG('<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>'),
};
const SKY_GLYPH = { 晴: "☀", 雪: "❄", 雨: "☂", 阴: "☁", 雾: "≋", 风: "≈" };

function build() {
  root = document.createElement("section");
  root.id = "lifeMap";
  root.className = "life-map";
  root.setAttribute("aria-label", "你所在的地方：可以走动的地图");
  root.innerHTML = `
    <div class="lm-stage" id="lmStage">
      <canvas id="lmCanvas" aria-hidden="true"></canvas>
      <div class="lm-labels" id="lmLabels" aria-hidden="true"></div>
      <aside class="lm-clock" id="lmClock" aria-live="polite"></aside>
      <nav class="lm-side" aria-label="游戏菜单">
        <button type="button" data-lm="works" title="行囊">${GLYPH.bag}<span>行囊</span></button>
        <button type="button" data-lm="people" title="熟人">${GLYPH.people}<span>熟人</span></button>
        <button type="button" data-lm="character" title="人生">${GLYPH.life}<span>人生</span></button>
        <button type="button" data-lm="journal" title="日志与今日指引">${GLYPH.journal}<span>日志</span></button>
        <button type="button" data-lm="time" title="时间与日程">${GLYPH.clock}<span>时间</span></button>
        <button type="button" data-lm="sound" title="声音" id="lmSound">${GLYPH.sound}<span>声音</span></button>
        <button type="button" data-lm="menu" title="菜单">${GLYPH.menu}<span>菜单</span></button>
      </nav>
      <button type="button" class="lm-recenter" id="lmCenter" aria-label="回到自己身边" hidden>${GLYPH.center}</button>
      <p class="lm-hint" id="lmHint" role="status" aria-live="polite"></p>
      <div class="lm-bar" id="lmBar" aria-label="随身带着的东西"></div>
      <section class="lm-sheet" id="lmSheet" hidden aria-live="polite"></section>
      <section class="lm-village" id="lmVillage" hidden role="dialog" aria-label="村子：选一个地方去">
        <header><h3>去哪儿</h3><p id="lmVillageNote"></p><button type="button" class="lm-close" aria-label="关闭">×</button></header>
        <div class="lm-village-map"><canvas id="lmVillageCanvas"></canvas><div class="lm-village-labels" id="lmVillageLabels"></div></div>
        <nav class="lm-village-list" id="lmVillageList" aria-label="能去的地方"></nav>
        <div class="lm-village-pick" id="lmVillagePick"></div>
      </section>
      <section class="lm-talk" id="lmTalk" hidden role="dialog" aria-live="polite">
        <div class="lm-face"><canvas width="16" height="19"></canvas><b></b></div>
        <div class="lm-words"><p></p><small>点一下继续 ▾</small></div>
      </section>
    </div>
    <nav class="lm-nearby sr-only" id="lmNearby" aria-label="附近的人和东西"></nav>`;
  canvas = root.querySelector("#lmCanvas");
  labels = root.querySelector("#lmLabels");
  renderer = new MapRenderer(canvas);
  installInput();
  root.querySelector("#lmCenter").addEventListener("click", () => { camOffset = { x: 0, y: 0 }; });
  root.querySelector(".lm-side").addEventListener("click", (e) => {
    const b = e.target.closest("[data-lm]");
    if (!b) return;
    const what = b.dataset.lm;
    if (what === "journal") setJournal(true);
    else if (what === "time") document.getElementById("autoButton")?.click();
    else if (what === "menu") document.getElementById("menuButton")?.click();
    else if (what === "sound") toggleSound().then(paintSound);
    else window.dispatchEvent(new CustomEvent("openlife:navigate", { detail: what }));
  });
  root.querySelector("#lmTalk").addEventListener("click", advanceTalk);
  root.querySelector("#lmBar").addEventListener("click", () => window.dispatchEvent(new CustomEvent("openlife:navigate", { detail: "works" })));
  return root;
}

function paintSound() {
  const b = document.getElementById("lmSound");
  if (b) { const on = audioState().playing; b.classList.toggle("on", on); b.title = on ? "声音：开（点一下关）" : "声音：关（点一下开）"; }
}
onAudioChange(paintSound);

/**
 * Pages over the map. With the map on, the map is the game screen and every
 * other page (行囊, 熟人, 人生, 日志 …) opens as a framed panel above it; the
 * map stays visible, dimmed, behind. Closing a panel returns to 此刻.
 */
function setJournal(on) {
  document.body.classList.toggle("lm-journal", on);
  if (on && document.body.dataset.screen !== "activities") window.dispatchEvent(new CustomEvent("openlife:navigate", { detail: "activities" }));
  syncPanel();
  if (on) document.querySelector(".page-container")?.scrollTo?.({ top: 0 });
}
function closePanel() {
  document.body.classList.remove("lm-journal");
  if (document.body.dataset.screen !== "activities") window.dispatchEvent(new CustomEvent("openlife:navigate", { detail: "activities" }));
  syncPanel();
  canvas?.focus({ preventScroll: true });
}
export function syncPanel() {
  const body = document.body, screen = body.dataset.screen;
  const game = body.classList.contains("has-life-map") || body.classList.contains("has-life-story");
  const on = game && screen !== "home" && (screen !== "activities" || body.classList.contains("lm-journal"));
  body.classList.toggle("lm-panel", on);
  const layout = document.getElementById("applicationLayout");
  if (layout && !document.getElementById("lmPanelClose")) {
    const close = document.createElement("button");
    const back = playMode() === "map" ? "回到地图" : "回到此刻";
    close.id = "lmPanelClose"; close.type = "button"; close.className = "lm-panel-close"; close.setAttribute("aria-label", `关闭，${back}`);
    close.innerHTML = `${playMode() === "map" ? GLYPH.map : GLYPH.journal}<span>${back}</span>`;
    close.addEventListener("click", closePanel);
    layout.prepend(close);
    const scrim = document.createElement("div");
    scrim.id = "lmScrim"; scrim.className = "lm-scrim";
    scrim.addEventListener("click", closePanel);
    document.body.append(scrim);
  }
}

function mount() {
  if (!root) { build(); document.body.append(root); paintSound(); }
  return true;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

async function update(next) {
  state = next;
  const m = next?.settlement?.map;
  if (!mapEnabled() || !m) {
    if (root) root.hidden = true;
    document.body.classList.remove("has-life-map");
    // The story mode keeps the game skin and the panels; only the classic pages drop them.
    if (playMode() === "classic") {
      document.body.classList.remove("lm-panel", "lm-journal");
      document.documentElement.classList.remove("game-skin");
    } else syncPanel();
    return;
  }
  if (!mount()) return;
  root.hidden = false;
  document.body.classList.add("has-life-map");
  document.documentElement.classList.add("game-skin");
  syncPanel();
  art ??= await loadArt().catch((error) => { hint(error.message); return null; });
  if (!art) return;
  const env = envOf(next.settlement);
  const key = `${m.sceneId}|${env.season}|${env.snow}|${env.rain}`;
  const sceneChanged = m.sceneId !== map?.sceneId;
  map = m;
  if (key !== sceneKey) { renderer.setScene(m, art, env); sceneKey = key; }
  renderer.scene.env.tint = env.tint;
  if (sceneChanged) {
    me.x = m.player.x; me.y = m.player.y; me.route = []; me.walking = false; dest = null; camOffset = { x: 0, y: 0 };
    me.facing = m.player.facing === "up" || m.player.facing === "down" || m.player.facing === "left" || m.player.facing === "right" ? m.player.facing : "up";
    npcs.clear();
    if (!m.targets.some((t) => t.key === selectedKey)) closeSheet();
    hint(`${m.placeName}${m.spaceName ? ` · ${m.spaceName}` : ""}`);
    if (lastTick !== null) sfx("door");
  } else if (!me.walking && !requesting && (me.x !== m.player.x || me.y !== m.player.y)) {
    me.x = m.player.x; me.y = m.player.y;
  }
  const carry = Object.fromEntries((next.settlement.carrying ?? []).map((r) => [r.resourceId, { n: Number(r.count) || 0, label: r.label ?? r.name ?? r.resourceId }]));
  if (lastTick !== null && next.tick > lastTick) { dayCard(next.settlement, next.tick - lastTick); closeSheet(); }
  else if (lastCarry && !sceneChanged) {
    for (const [id, row] of Object.entries(carry)) {
      const before = lastCarry[id]?.n ?? 0;
      if (row.n > before) sfx("pick");
      if (row.n !== before) floats.push({ text: `${row.n > before ? "+" : ""}${row.n - before} ${row.label}`, up: row.n > before, born: performance.now() });
    }
    for (const [id, row] of Object.entries(lastCarry)) if (!carry[id]) floats.push({ text: `-${row.n} ${row.label}`, up: false, born: performance.now() });
  }
  if (lastTick === next.tick && map && m.dayPhase > (lastPhase ?? 0)) hint(m.dayPhase === 1 ? "日头高了，村里人各自去做活。" : "天色晚了，大家陆续回家。");
  lastPhase = m.dayPhase;
  lastTick = next.tick; lastCarry = carry;
  renderHud(next.settlement);
  paintPortrait(m.playerLook);
  setAudioScene({ placeId: m.placeId, season: next.settlement.season ?? "春", daypart: m.dayPhase === 2 ? "dusk" : m.dayPhase === 1 ? "day" : "morning", sky: next.settlement.weather?.sky ?? "" });
  renderNearby();
  if (selectedKey) renderSheet();
  start();
}

function envOf(s) {
  const sky = String(s.weather?.sky ?? "");
  const used = Number(s.dailyActivity?.used ?? 0), cap = Math.max(1, Number(s.dailyActivity?.capacity ?? 8));
  const f = used / cap;
  // Light follows how much of the day is spent: morning gold → clear noon → dusk.
  const tint = f < 0.2 ? [255, 214, 150, 0.07] : f > 0.85 ? [70, 50, 110, 0.22] : f > 0.65 ? [230, 130, 70, 0.1] : null;
  const grey = /雪|雨|阴/.test(sky) ? [120, 130, 150, 0.1] : null;
  return { season: s.season ?? "春", snow: sky.includes("雪"), rain: sky.includes("雨"), tint: grey && !tint ? grey : tint };
}

function renderHud(s) {
  const a = s.dailyActivity ?? { remaining: 0, capacity: 0 };
  const sky = String(s.weather?.sky ?? "");
  const glyph = Object.entries(SKY_GLYPH).find(([k]) => sky.includes(k))?.[1] ?? "☀";
  const hunger = hungerLevel(s.hunger, s.hungerToll);
  const day = s.origin?.daysHere ?? s.day;
  $("lmClock").innerHTML = `<div class="lm-date"><strong>${esc(s.season ?? "")} · 第 ${esc(day)} 天</strong><span title="${esc(s.weather?.note ?? "")}">${glyph} ${esc(sky || "晴")}</span></div>
    <div class="lm-energy" title="今天还剩 ${a.remaining} 格活动时间">${Array.from({ length: a.capacity }, (_, i) => `<i class="${i < a.remaining ? "on" : ""}"></i>`).join("")}</div>
    <div class="lm-belly lm-${hunger.tone}">${esc(hunger.word)}</div>`;
  $("lmClock").setAttribute("aria-label", `${s.season ?? ""}第${day}天，${sky}；今天还剩 ${a.remaining} 格活动时间，共 ${a.capacity} 格；${hunger.word}`);
  renderBar(s);
}

/** Hotbar: what you carry, one slot per kind, drawn with the map's own pixel art. */
/** The 人生 page portrait is the player's own pixel figure, so the pages and the map show one person. */
function paintPortrait(look) {
  const box = document.querySelector(".portrait-figure");
  if (!box || (box.dataset.pixel === look && box.querySelector("canvas"))) return;
  box.dataset.pixel = look;
  box.classList.add("has-figure", "pixel-figure");
  box.innerHTML = "";
  const c = document.createElement("canvas");
  c.width = 16; c.height = 38;
  c.getContext("2d").drawImage(framesFor(look, "player").down[0], 0, 0);
  box.append(c);
}

/** A new day: the screen dims and shows the date, like waking up. */
function dayCard(s, days) {
  sfx("day");
  let card = document.getElementById("lmDayCard");
  if (!card) { card = document.createElement("div"); card.id = "lmDayCard"; card.className = "lm-daycard"; root.querySelector(".lm-stage").append(card); }
  const day = s.origin?.daysHere ?? s.day;
  card.innerHTML = `<strong>${esc(s.season ?? "")} · 第 ${esc(day)} 天</strong><span>${days > 1 ? `过去了 ${days} 天 · ` : ""}${esc(s.weather?.sky ?? "")}</span>`;
  card.classList.remove("show"); void card.offsetWidth; card.classList.add("show");
}

function renderBar(s) {
  const rows = (s.carrying ?? []).filter((r) => r.count > 0).slice(0, 10);
  const key = JSON.stringify(rows.map((r) => [r.resourceId, r.count]));
  const bar = $("lmBar");
  if (bar.dataset.key === key) return;
  bar.dataset.key = key;
  const slots = Array.from({ length: Math.max(6, rows.length) }, (_, i) => rows[i]);
  bar.innerHTML = slots.map((r) => `<span class="lm-slot" title="${r ? esc(`${r.label ?? r.resourceId} ×${r.count}`) : ""}">${r ? `<canvas width="24" height="24" data-look="${esc(r.resourceId)}"></canvas><b>${r.count}</b>` : ""}</span>`).join("");
  bar.querySelectorAll("canvas").forEach((c) => {
    const g = c.getContext("2d");
    drawThing(g, resourceLook(c.dataset.look), 12, 20, 0);
  });
}

const distTo = (t) => Math.max(Math.abs(t.x - map.player.x), Math.abs(t.y - map.player.y));
const usable = (t) => t.actions.filter((a) => a.enabled !== false).length;

function renderNearby() {
  const list = [...map.targets].filter((t) => t.actions.length).sort((a, b) => distTo(a) - distTo(b) || a.key.localeCompare(b.key));
  $("lmNearby").innerHTML = list.map((t) => `<button type="button" data-target="${esc(t.key)}" class="${t.key === selectedKey ? "selected" : ""}">
    <span class="lm-dot lm-${t.type}"></span>${esc(t.name)}${usable(t) ? `<small>${usable(t)}</small>` : ""}</button>`).join("");
}

// ---------------------------------------------------------------------------
// Sheet: one target, its own actions
// ---------------------------------------------------------------------------

function select(key) {
  sfx("select");
  const target = map?.targets.find((x) => x.key === key);
  if (target?.type === "exit" && target.actions.length) { openVillage(target); return; }
  if (key !== selectedKey) openAll = false;
  selectedKey = key;
  renderSheet();
  renderNearby();
  const t = map.targets.find((x) => x.key === key);
  if (t) camOffset = { x: 0, y: 0 };
}

function closeSheet() {
  selectedKey = "";
  const sheet = $("lmSheet");
  if (sheet) { sheet.hidden = true; sheet.innerHTML = ""; }
  root?.querySelector(".lm-stage")?.classList.remove("has-sheet");
  if (map) renderNearby();
}

function costOf(a) {
  if (a.days > 0) return `${a.days} 天`;
  if (a.activityCost) return `${a.activityCost} 格`;
  const said = String(a.hint ?? "").match(/花\s*(\d+)\s*格/); // some actions only state their cost in words
  if (said) return `${said[1]} 格`;
  return a.id === "world-space.move_within" ? "屋里" : "不花时间";
}

function renderSheet() {
  const t = map?.targets.find((x) => x.key === selectedKey);
  const sheet = $("lmSheet");
  if (!t) { closeSheet(); return; }
  const far = distTo(t) > 1;
  const exit = t.type === "exit";
  // Things that must be done elsewhere fold away: show what works here first.
  const ready = t.actions.filter((a) => a.enabled !== false).length;
  const shownActs = t.actions.map((a, i) => [a, i]).filter(([a], n) => a.enabled !== false || exit || openAll || n < ready + 2);
  const folded = t.actions.length - shownActs.length;
  const actions = shownActs.map(([a, i]) => `<button type="button" class="lm-act${a.enabled === false ? " off" : ""}" data-act="${i}" ${a.enabled === false ? 'aria-disabled="true"' : ""}>
      <span class="lm-act-icon">${icon(actionIconName(a))}</span>
      <span class="lm-act-text"><strong>${esc(exit ? a.label.replace(/^走到/, "") : a.label)}</strong><small>${esc(a.enabled === false ? a.reason || "现在还做不了" : a.hint || "")}</small></span>
      <em>${esc(costOf(a))}</em></button>`).join("") + (folded ? `<button type="button" class="lm-more">还有 ${folded} 件事要换个地方或条件才能做</button>` : "");
  sheet.innerHTML = `<header><div><span class="lm-kind lm-${t.type}">${TYPE_LABEL[t.type] ?? ""}</span><h3>${esc(t.name)}</h3>
      <p>${esc(t.note || "")}${far ? `${t.note ? " · " : ""}在 ${distTo(t)} 步外，选一件事会先走过去` : `${t.note ? " · " : ""}就在你身边`}</p></div>
      <button type="button" class="lm-close" aria-label="关闭">×</button></header>
    <div class="lm-acts${exit ? " lm-grid" : ""}">${actions || `<p class="lm-empty">现在对它没什么可做的。</p>`}</div>
    ${far ? `<button type="button" class="lm-go">只走过去</button>` : ""}`;
  sheet.hidden = false;
  root.querySelector(".lm-stage").classList.add("has-sheet");
  sheet.querySelector(".lm-close").onclick = closeSheet;
  sheet.querySelector(".lm-more")?.addEventListener("click", () => { openAll = true; renderSheet(); });
  sheet.querySelector(".lm-go")?.addEventListener("click", () => walkTo({ targetKey: t.key }));
  sheet.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => {
    const a = t.actions[Number(b.dataset.act)];
    if (a.enabled === false) { hint(a.reason || "现在还做不了。"); return; }
    perform(t, a);
  }));
}

async function perform(t, a) {
  await idle();
  if (distTo(t) > 1) {
    const ok = await walkTo({ targetKey: t.key }, true);
    if (!ok) return;
    const again = map.targets.find((x) => x.key === t.key);
    if (!again || distTo(again) > 1) { hint(`没能走到${t.name}跟前。`); return; }
  }
  const payload = { targetKey: t.key, action: a.id, payload: a.payload ?? {}, expectedPosition: map.player.revision };
  const keep = t.type === "person" || t.type === "object" || t.type === "yield" || t.type === "work";
  const out = await game()?.act("map.interact", payload);
  if (keep && map?.targets.some((x) => x.key === t.key)) select(t.key); else closeSheet();
  if (!out) return;
  if (!out.ok) { talk(null, [out.error || "这件事现在做不成。"]); return; }
  const lines = out.narrative?.length ? out.narrative : [out.told];
  // People answer in a dialogue box; small chores just leave a short note.
  const now = map?.targets.find((x) => x.key === t.key) ?? t; // the name may just have been learned
  if (t.type === "person" || out.narrative?.length) talk(t.type === "person" ? now : null, lines, out.chips);
  else hint(out.told);
}

// ---------------------------------------------------------------------------
// Village map: where the way out leads
// ---------------------------------------------------------------------------

let village = null; // { target, mod, hover, pick }
async function openVillage(target) {
  closeSheet();
  const box = $("lmVillage");
  let mod;
  try { mod = await import("/village-map.js"); } catch { mod = null; }
  if (!mod?.drawVillageMap) { selectedKey = target.key; renderSheet(); return; } // fall back to the list
  village = { target, mod, hover: null, pick: null };
  box.hidden = false;
  root.querySelector(".lm-stage").classList.add("has-village");
  const here = map.placeId;
  $("lmVillageNote").textContent = `你在${map.placeName}。点一个地方，看看去那儿要花多少。`;
  const canvas = $("lmVillageCanvas"), labels = $("lmVillageLabels");
  const placeOf = (a) => String(a.payload?.placeId ?? "");
  const places = target.actions.map((a) => ({ placeId: placeOf(a), name: a.label.replace(/^走到/, ""), costDays: a.days ?? 0, enabled: a.enabled !== false, action: a }));
  places.push({ placeId: here, name: map.placeName, costDays: 0, enabled: false, here: true });
  const known = places.filter((p) => mod.VILLAGE_LAYOUT[p.placeId]);
  labels.innerHTML = known.map((p) => `<button type="button" data-place="${esc(p.placeId)}" class="${p.here ? "here" : p.enabled ? "" : "off"}">${esc(p.name)}</button>`).join("");
  const list = $("lmVillageList");
  list.innerHTML = places.filter((p) => !p.here).map((p) => `<button type="button" data-place="${esc(p.placeId)}" class="${p.enabled ? "" : "off"}">${esc(p.name)}<small>${esc(costOf(p.action))}</small></button>`).join("");
  list.onclick = (e) => { const b = e.target.closest("[data-place]"); if (b) choose(b.dataset.place); };
  const choose = (placeId) => {
    const p = places.find((x) => x.placeId === placeId);
    if (!p || p.here) return;
    village.pick = placeId;
    const a = p.action;
    $("lmVillagePick").innerHTML = `<div><strong>${esc(p.name)}</strong><small>${esc(a.enabled === false ? a.reason || "现在去不了" : a.hint || "")}</small></div>
      <button type="button" class="lm-go-there" ${a.enabled === false ? "disabled" : ""}>${a.enabled === false ? "去不了" : `出发 · ${esc(costOf(a))}`}</button>`;
    $("lmVillagePick").querySelector(".lm-go-there")?.addEventListener("click", () => { closeVillage(); perform(target, a); });
  };
  labels.onclick = (e) => { const b = e.target.closest("[data-place]"); if (b) choose(b.dataset.place); };
  canvas.onpointermove = (e) => { if (!village) return; village.hover = hitVillage(e); canvas.style.cursor = village.hover ? "pointer" : "default"; };
  canvas.onclick = (e) => { if (!village) return; const id = hitVillage(e); if (id) choose(id); };
  $("lmVillagePick").innerHTML = `<p>点地图上的地方，看看去那儿要花多少、能做什么。</p>`;
  box.querySelector(".lm-close").onclick = closeVillage;
  const draw = (t) => {
    if (!village || box.hidden) return;
    const rect = canvas.parentElement.getBoundingClientRect(), dpr = Math.max(1, devicePixelRatio || 1);
    const k = Math.max(1, Math.floor(Math.min((rect.width * dpr) / 320, (rect.height * dpr) / 200)));
    if (canvas.width !== 320 * k) { canvas.width = 320 * k; canvas.height = 200 * k; }
    const css = k / dpr, offX = Math.round((rect.width - 320 * css) / 2), offY = Math.round((rect.height - 200 * css) / 2);
    canvas.style.width = `${320 * css}px`; canvas.style.height = `${200 * css}px`;
    canvas.style.left = `${offX}px`; canvas.style.top = `${offY}px`;
    const g = canvas.getContext("2d");
    mod.drawVillageMap(g, { places: known.map(({ placeId, name, costDays, enabled }) => ({ placeId, name, costDays, enabled })), currentPlaceId: here,
      season: state?.settlement?.season ?? "春", t, hover: village.pick ?? village.hover, k });
    labels.querySelectorAll("[data-place]").forEach((b) => {
      const a = mod.anchorOf(b.dataset.place);
      if (a) b.style.transform = `translate(${Math.round(offX + a.x * css)}px, ${Math.round(offY + (a.y + 2) * css)}px)`;
      b.classList.toggle("picked", b.dataset.place === village.pick);
    });
    $("lmVillageList").querySelectorAll("[data-place]").forEach((b) => b.classList.toggle("picked", b.dataset.place === village.pick));
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}
function hitVillage(e) {
  const canvas = $("lmVillageCanvas"), r = canvas.getBoundingClientRect();
  return village.mod.placeAt(((e.clientX - r.left) / r.width) * 320, ((e.clientY - r.top) / r.height) * 200);
}
function closeVillage() {
  village = null;
  const box = $("lmVillage");
  if (box) box.hidden = true;
  root?.querySelector(".lm-stage")?.classList.remove("has-village");
}

// ---------------------------------------------------------------------------
// Dialogue box: portrait, name, typed words; tap to go on
// ---------------------------------------------------------------------------

let talkPages = [], talkTimer = 0, talkFull = "", talkShown = 0;
function talk(person, lines, chips = []) {
  const box = $("lmTalk");
  if (!box) return;
  // Each page has its own speaker: someone in view whose name opens the line,
  // else (first page only) the person you addressed; otherwise it is narration.
  const known = (map?.targets ?? []).filter((t) => t.type === "person" && t.name && !t.name.startsWith("陌生"));
  talkPages = lines.filter(Boolean).map(String).map((text, i) => ({
    text, speaker: known.find((t) => text.startsWith(t.name)) ?? (i === 0 ? person : null),
  }));
  if (chips?.length && talkPages.length) talkPages[talkPages.length - 1].text += `（${chips.join("，")}）`;
  box.hidden = false;
  root.querySelector(".lm-stage").classList.add("has-talk");
  nextPage();
}
function nextPage() {
  const box = $("lmTalk");
  if (!talkPages.length) { box.hidden = true; root.querySelector(".lm-stage").classList.remove("has-talk"); return; }
  const page = talkPages.shift();
  talkFull = page.text; talkShown = 0;
  box.classList.toggle("narration", !page.speaker);
  if (page.speaker) {
    const g = box.querySelector("canvas").getContext("2d");
    g.clearRect(0, 0, 16, 19);
    g.drawImage(framesFor(page.speaker.look || page.speaker.key, page.speaker.id).down[0], 0, 0, 16, 19, 0, 0, 16, 19);
    box.querySelector("b").textContent = page.speaker.name;
  }
  const p = box.querySelector("p");
  clearInterval(talkTimer);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  talkTimer = setInterval(() => {
    talkShown = reduce ? talkFull.length : Math.min(talkFull.length, talkShown + 2);
    if (talkShown % 6 === 0 && talkShown < talkFull.length) sfx("talk");
    p.textContent = talkFull.slice(0, talkShown);
    if (talkShown >= talkFull.length) clearInterval(talkTimer);
  }, 33);
  box.querySelector("small").textContent = talkPages.length ? "点一下继续 ▾" : "点一下收起";
}
function advanceTalk() {
  if (talkShown < talkFull.length) { talkShown = talkFull.length; $("lmTalk").querySelector("p").textContent = talkFull; clearInterval(talkTimer); return; }
  nextPage();
}

// ---------------------------------------------------------------------------
// Walking
// ---------------------------------------------------------------------------

/** Resolves once the player stands still and no walk request is in flight. */
function idle() {
  return new Promise((resolve) => {
    const check = () => (!me.walking && !requesting ? resolve() : setTimeout(check, 50));
    check();
  });
}

/**
 * Walk somewhere. Taps on the ground keep only the latest destination while a
 * walk is under way; actions (`queue`) wait for the current walk to finish.
 */
async function walkTo(request, queue = false) {
  if (me.walking || requesting) {
    if (!queue) { pending = request; return false; }
    await idle();
  }
  const before = map;
  // Until the route comes back, keep drawing the player where they stand (the new state arrives first).
  requesting = true;
  const result = await game()?.walk({ sceneId: before.sceneId, expectedPosition: before.player.revision, ...request }).finally(() => { requesting = false; });
  if (!result?.ok) { hint(result?.errors?.[0]?.message ?? "走不过去。"); return false; }
  const route = result.route ?? [];
  if (!route.length) return true;
  dest = route[route.length - 1];
  me.route = route.map((c) => ({ x: c.x, y: c.y }));
  me.walking = true;
  camOffset = { x: 0, y: 0 };
  await new Promise((resolve) => { walkResolve = resolve; });
  dest = null;
  if (pending) { const next = pending; pending = null; return walkTo(next); }
  return true;
}

function stepWalk(dt) {
  if (!me.walking) return;
  let budget = dt * SPEED;
  while (budget > 0 && me.route.length) {
    const n = me.route[0], dx = n.x - me.x, dy = n.y - me.y, d = Math.hypot(dx, dy);
    if (dx) me.left = dx < 0;
    if (dx || dy) me.facing = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? "left" : "right") : (dy < 0 ? "up" : "down");
    if (d <= budget) { me.x = n.x; me.y = n.y; me.route.shift(); budget -= d; me.dist += d; sfx("step"); }
    else { me.x += (dx / d) * budget; me.y += (dy / d) * budget; me.dist += budget; budget = 0; }
  }
  if (!me.route.length) {
    me.walking = false;
    if (map) { me.x = map.player.x; me.y = map.player.y; }
    walkResolve?.(); walkResolve = null;
  }
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

function cellAt(clientX, clientY) {
  if (!lastCam) return null;
  const rect = canvas.getBoundingClientRect(), dpr = canvas.width / rect.width;
  const nx = ((clientX - rect.left) * dpr) / lastCam.k + lastCam.x, ny = ((clientY - rect.top) * dpr) / lastCam.k + lastCam.y;
  return { px: nx, py: ny, x: Math.floor(nx / CELL), y: Math.floor(ny / CELL) };
}

function hitTarget(p) {
  let best = null, bestD = Infinity;
  for (const t of map.targets) {
    const npc = npcs.get(t.key);
    const fx = (npc ? npc.x : t.x) * CELL + 8, fy = (npc ? npc.y : t.y) * CELL + 15;
    const tall = t.type === "person" ? 38 : t.type === "work" ? 30 : t.type === "animal" ? 14 : 18;
    const wide = t.type === "work" ? 20 : 11;
    if (p.px < fx - wide || p.px > fx + wide + (t.type === "work" ? 16 : 0) || p.py < fy - tall || p.py > fy + 4) continue;
    const d = Math.hypot(p.px - fx, p.py - (fy - tall / 2));
    if (d < bestD) { best = t; bestD = d; }
  }
  if (best) return best;
  // A building body selects its door.
  for (const prop of map.props) {
    if (!(prop.kind === "house" || prop.kind === "shed")) continue;
    if (p.x >= prop.x && p.x < prop.x + prop.w && p.y >= prop.y - prop.h - 1 && p.y <= prop.y) {
      const door = map.doors.find((d) => d.x >= prop.x && d.x < prop.x + prop.w && d.y === prop.y);
      if (door) return map.targets.find((t) => t.key === `door:${door.spaceId}`) ?? null;
    }
  }
  return null;
}

function installInput() {
  canvas.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY, ox: camOffset.x, oy: camOffset.y, moved: false };
    canvas.setPointerCapture?.(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag && e.pointerType === "mouse" && map) {
      const p = cellAt(e.clientX, e.clientY), t = p && hitTarget(p);
      hoverKey = t?.key ?? "";
      canvas.style.cursor = t ? "pointer" : "default";
    }
    if (!drag || !lastCam) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 8) return;
    drag.moved = true;
    const rect = canvas.getBoundingClientRect(), s = (canvas.width / rect.width) / lastCam.k;
    camOffset = { x: drag.ox - dx * s, y: drag.oy - dy * s };
  });
  canvas.addEventListener("pointerup", (e) => {
    const was = drag; drag = null;
    if (!was || was.moved || !map) return;
    const p = cellAt(e.clientX, e.clientY);
    if (!p) return;
    const t = hitTarget(p);
    if (t) { select(t.key); return; }
    if (p.x < 0 || p.y < 0 || p.x >= map.width || p.y >= map.height) return;
    if ("#~TofWp".includes(map.tiles[p.y][p.x])) { hint("那里走不过去。"); return; }
    closeSheet();
    walkTo({ x: p.x, y: p.y });
  });
  canvas.addEventListener("pointercancel", () => { drag = null; });
  canvas.addEventListener("pointerleave", () => { hoverKey = ""; });
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "application");
  canvas.setAttribute("aria-label", "地图：方向键走动，回车选身边最近的人或东西，Esc 关闭");
  canvas.addEventListener("keydown", (e) => {
    if (!map) return;
    const step = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] }[e.code];
    if (step) {
      e.preventDefault();
      const x = map.player.x + step[0], y = map.player.y + step[1];
      if (x >= 0 && y >= 0 && x < map.width && y < map.height && !"#~TofWp".includes(map.tiles[y][x])) walkTo({ x, y });
      return;
    }
    if ((e.key === "Enter" || e.key === " ") && !$("lmTalk").hidden) { e.preventDefault(); advanceTalk(); return; }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const near = [...map.targets].filter((t) => t.actions.length).sort((a, b) => distTo(a) - distTo(b))[0];
      if (near) select(near.key);
    }
    if (e.key === "Escape") closeSheet();
  });
  root.querySelector("#lmNearby").addEventListener("click", (e) => {
    const b = e.target.closest("[data-target]");
    if (b) select(b.dataset.target);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && selectedKey && document.body.dataset.screen === "activities") closeSheet(); });
}

function hint(text) {
  const el = $("lmHint");
  if (!el) return;
  el.textContent = text;
  el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
}

// ---------------------------------------------------------------------------
// Frame loop
// ---------------------------------------------------------------------------

function camera() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const bw = Math.max(1, Math.round(rect.width * dpr)), bh = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
  const mw = map.width * CELL, mh = map.height * CELL;
  const cap = Math.max(1, Math.floor(bw / (10 * CELL)));
  const portrait = bh > bw * 1.3;
  const k = map.kind === "interior"
    ? Math.max(1, Math.min(cap, portrait ? Math.max(Math.ceil(bw / mw), Math.floor((bh * 0.5) / mh)) : Math.floor(Math.min(bw / mw, bh / mh))))
    : Math.max(1, Math.min(cap, Math.ceil(Math.max(bw / mw, bh / mh))));
  const w = Math.ceil(bw / k), h = Math.ceil(bh / k);
  // With the dialogue box open, look a little lower so the player stays above it.
  const sheet = $("lmSheet");
  const bar = $("lmBar");
  const talking = $("lmTalk");
  const cover = talking && !talking.hidden ? talking : sheet && !sheet.hidden ? sheet : bar;
  const lift = cover ? (cover.getBoundingClientRect().height * dpr) / k / 2 : 0;
  const px = me.x * CELL + 8, py = me.y * CELL + 8 + lift;
  const fit = (pos, view, size, past = 0) => size <= view ? Math.round((size - view) / 2) : Math.round(Math.max(0, Math.min(size - view + past, pos)));
  // Below the map the camera may go as far as the hotbar/dialogue covers, so the player is never hidden behind them.
  const x = fit(px - w / 2 + camOffset.x, w, mw);
  let y = fit(py - h / 2 + camOffset.y, h, mh, Math.ceil(lift * 2));
  // Whatever the fit, keep the player's feet above the hotbar / dialogue at the bottom of the screen.
  if (!camOffset.y) y = Math.max(y, Math.round(me.y * CELL + 24 - (h - lift * 2)));
  return { x, y, w, h, k, dpr };
}

const OPEN = (x, y) => {
  x = Math.round(x); y = Math.round(y); // animated positions are fractional; tiles are whole cells
  return x > 0 && y > 0 && x < map.width - 1 && y < map.height - 1 && !"#~TofWpFDG".includes(map.tiles[y][x]);
};
function npcStep(dt, now) {
  const live = new Set();
  for (const t of map.targets) {
    if (t.type !== "person" && t.type !== "animal") continue;
    live.add(t.key);
    let n = npcs.get(t.key);
    if (!n || n.homeX !== t.x || n.homeY !== t.y) {
      n = { homeX: t.x, homeY: t.y, x: t.x, y: t.y, tx: t.x, ty: t.y, facing: "down", walking: false, dist: 0, nextAt: now + 1500 + (hashKey(t.key) % 4000), turn: 0 };
      npcs.set(t.key, n);
    }
    const busy = /正在忙/.test(t.note || "");
    const held = t.key === selectedKey || t.key === hoverKey;
    if (held) { n.tx = n.homeX; n.ty = n.homeY; }
    else if (!n.walking && now > n.nextAt && !busy) {
      n.turn++;
      const k = hashKey(`${t.key}:${n.turn}`);
      const cx = n.homeX + (k % 5) - 2, cy = n.homeY + ((k >>> 3) % 3) - 1;
      if (OPEN(cx, cy) && OPEN(cx, n.y) ) { n.tx = cx; n.ty = cy; }
      n.nextAt = now + 2500 + ((k >>> 6) % 5000);
    }
    const dx = n.tx - n.x, dy = n.ty - n.y, d = Math.hypot(dx, dy);
    if (d > 0.01) {
      // Walk the long axis first, like people on a grid do.
      const sp = (t.type === "animal" ? 3.2 : 1.8) * dt;
      if (Math.abs(dx) > 0.01) { const s = Math.sign(dx) * Math.min(Math.abs(dx), sp); n.x += s; n.facing = dx < 0 ? "left" : "right"; n.dist += Math.abs(s); }
      else { n.x = n.tx; const s = Math.sign(dy) * Math.min(Math.abs(dy), sp); n.y += s; n.facing = dy < 0 ? "up" : "down"; n.dist += Math.abs(s); }
      if (Math.abs(n.tx - n.x) <= 0.01 && Math.abs(n.ty - n.y) <= 0.01) { n.x = n.tx; n.y = n.ty; }
      n.walking = true;
    } else {
      n.walking = false;
      if (held || (t.type === "person" && Math.max(Math.abs(me.x - n.x), Math.abs(me.y - n.y)) <= 1.5)) {
        // Turn to the player standing close.
        const fx = me.x - n.x, fy = me.y - n.y;
        n.facing = Math.abs(fx) > Math.abs(fy) ? (fx < 0 ? "left" : "right") : (fy < 0 ? "up" : "down");
      }
    }
  }
  for (const key of npcs.keys()) if (!live.has(key)) npcs.delete(key);
}
const hashKey = (text) => { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

function frame(now) {
  if (!running) return;
  // One bad frame must never stop the game: report it and keep the loop alive.
  try { drawFrame(now); } catch (error) { console.error("life-map frame", error); }
  frame.last = now;
  requestAnimationFrame(frame);
}

function drawFrame(now) {
  const visible = map && root?.isConnected && !root.hidden && document.body.dataset.screen !== "home" && !document.hidden;
  if (visible) {
    const dt = Math.min(0.1, (now - (frame.last ?? now)) / 1000);
    stepWalk(dt);
    npcStep(dt, now);
    lastCam = camera();
    // Things sharing one cell are fanned out a few pixels so each stays visible.
    const seen = new Map();
    const actors = map.targets.map((t) => {
      const k = `${t.x},${t.y}`, n = seen.get(k) ?? 0;
      seen.set(k, n + 1);
      const npc = npcs.get(t.key);
      if (npc) return { ...t, fx: npc.x * CELL + 8, fy: npc.y * CELL + 15, facing: npc.facing, walking: npc.walking, dist: npc.dist * CELL };
      return { ...t, fx: t.x * CELL + 8 + (n ? (n % 2 ? 6 : -6) * Math.ceil(n / 2) : 0), fy: t.y * CELL + 15 - (n ? 1 : 0) };
    });
    actors.push({ player: true, key: "me", look: map.playerLook, fx: me.x * CELL + 8, fy: me.y * CELL + 15, facing: me.facing, walking: me.walking, dist: me.dist * CELL });
    renderer.draw(lastCam, actors, now, { selected: selectedKey, dest });
    placeLabels(lastCam);
  }
}

function start() { if (!running) { running = true; requestAnimationFrame(frame); } }

function placeLabels(cam) {
  const scale = cam.k / cam.dpr;
  const shown = map.targets.filter((t) => t.key === selectedKey || t.key === hoverKey);
  const center = $("lmCenter");
  if (center) center.hidden = Math.hypot(camOffset.x, camOffset.y) < 8;
  const html = shown.map((t) => {
    const lift = t.type === "person" ? 42 : t.type === "door" ? (map.kind === "interior" ? -4 : 30) : t.type === "exit" ? 8 : 20;
    const npc = npcs.get(t.key), tx = npc ? npc.x : t.x, ty = npc ? npc.y : t.y;
    const x = ((tx * CELL + (t.type === "exit" ? 18 : 8)) - cam.x) * scale, y = ((ty * CELL + 15 - lift) - cam.y) * scale;
    return `<span class="lm-label lm-${t.type}${t.key === selectedKey ? " selected" : ""}" style="transform:translate(${Math.round(x)}px,${Math.round(y)}px)">${esc(t.name)}</span>`;
  }).join("");
  const now = performance.now();
  floats = floats.filter((f) => now - f.born < 1600);
  const px = ((me.x * CELL + 8) - cam.x) * scale, py = ((me.y * CELL - 30) - cam.y) * scale;
  const rising = floats.map((f, i) => `<span class="lm-float${f.up ? " up" : ""}" style="transform:translate(${Math.round(px)}px,${Math.round(py - (now - f.born) / 30 - i * 22)}px);opacity:${Math.min(1, (1600 - (now - f.born)) / 500).toFixed(2)}">${esc(f.text)}</span>`).join("");
  const all = html + rising;
  if (labels.dataset.html !== all) { labels.innerHTML = all; labels.dataset.html = all; }
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

window.addEventListener("openlife:state", (e) => { update(e.detail); });
window.addEventListener("hashchange", () => { if (location.hash !== "#activities") document.body.classList.remove("lm-journal"); syncPanel(); });
window.addEventListener("popstate", () => syncPanel());
// The shell switches pages with pushState (no hashchange): follow body[data-screen] instead.
new MutationObserver(() => {
  if (document.body.dataset.screen !== "activities") document.body.classList.remove("lm-journal");
  syncPanel();
}).observe(document.body, { attributes: true, attributeFilter: ["data-screen"] });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && village) { closeVillage(); return; }
  if (e.key !== "Escape" || !document.body.classList.contains("lm-panel")) return;
  if ([...document.querySelectorAll(".modal-backdrop")].some((m) => !m.hidden)) return;
  closePanel();
});
document.addEventListener("click", (e) => {
  if (e.target.closest?.("[data-outcome-jump]") && document.body.classList.contains("has-life-map")) setJournal(true);
}, true);
window.addEventListener("openlife:select-person", (e) => {
  const key = `person:${e.detail}`;
  if (map?.targets.some((t) => t.key === key)) select(key);
});

// ---------------------------------------------------------------------------
// Phones play in landscape: ask to rotate, and lock it where the browser allows
// ---------------------------------------------------------------------------

const PORTRAIT_OK = "openlife-portrait-ok";
const coarse = () => matchMedia("(pointer: coarse)").matches;
/** On a phone, entering the game (a tap) goes fullscreen and asks for landscape; browsers that refuse are fine. */
function goLandscape() {
  if (!coarse() || !mapEnabled()) return;
  const el = document.documentElement;
  const lock = () => screen.orientation?.lock?.("landscape").catch(() => {});
  if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: "hide" }).then(lock, () => {});
  else lock();
}
function installRotate() {
  document.addEventListener("click", (e) => {
    if (e.target.closest?.("#continueLife, #newLifeForm button[type=submit]")) goLandscape();
  }, true);
  const box = document.createElement("div");
  box.id = "lmRotate"; box.className = "lm-rotate"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "请横过来玩");
  box.innerHTML = `<div class="lm-rotate-phone" aria-hidden="true"></div><strong>把手机横过来</strong><p>横屏能看到更大的村子，按钮也不挡画面。</p>
    <button type="button" id="lmRotateLock">横屏全屏</button><button type="button" id="lmRotateSkip" class="quiet">就这样竖着玩</button>`;
  document.body.append(box);
  box.querySelector("#lmRotateLock").addEventListener("click", goLandscape);
  box.querySelector("#lmRotateSkip").addEventListener("click", () => {
    try { localStorage.setItem(PORTRAIT_OK, "1"); } catch { /* 本次会话内 */ }
    document.body.classList.add("lm-portrait-ok");
  });
  try { if (localStorage.getItem(PORTRAIT_OK) === "1") document.body.classList.add("lm-portrait-ok"); } catch { /* ignore */ }
}

function installSetting() {
  installRotate();
  const label = $("mapModeLabel");
  if (label) label.textContent = PLAY_LABEL[playMode()];
  $("mapModeButton")?.addEventListener("click", () => setPlayMode(nextPlayMode()));
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installSetting); else installSetting();
