/**
 * 图鉴（codex）页面与背景音乐。
 *
 * - 物品：每个原型的材质、重量、容量、耐久、用途，以及能用哪个做法做出来；
 * - 做法：所需材料、工具、地点，按当前人物是否能做排序，可直接「动手做」；
 * - 人物：河岸台地的居民，附立绘；
 * - 世界：世界观设定文本；
 * - 音乐：三首合成的背景音乐，可试听、可设为背景循环。
 *
 * 读取 /api/codex；制作仍走 /api/action（settlement-locations.craft）。
 */
import { html } from "/player.js";

const TABS = [
  ["recipes", "做法"],
  ["items", "物品"],
  ["people", "人物"],
  ["lore", "世界"],
  ["music", "音乐"],
];
let activeTab = "recipes";
let lastData = null;

export async function loadCodex(screen, onSettlementAction) {
  screen.innerHTML = '<p class="page-empty panel">正在翻开图鉴…</p>';
  try {
    const response = await fetch("/api/codex");
    if (!response.ok) throw new Error("图鉴读取失败，请稍后再打开。");
    lastData = await response.json();
    renderCodex(screen, onSettlementAction);
  } catch (error) {
    screen.innerHTML = `<p class="page-empty panel">${html(error.message)}</p>`;
  }
}

function renderCodex(screen, onSettlementAction) {
  const data = lastData;
  screen.innerHTML = `<section class="codex panel">
    <div class="codex-intro"><div class="overview-label">河岸台地 · 图鉴</div>
      <p>这里记着聚落里认得的东西、会做的手艺、住着的人和流传的故事。做法会按你此刻能不能做来排序。</p></div>
    <div class="codex-tabs" role="tablist" aria-label="图鉴分类">${TABS.map(([id, label]) =>
      `<button role="tab" data-codex-tab="${id}" aria-selected="${id === activeTab}">${label}</button>`).join("")}</div>
    <div class="codex-body" role="tabpanel">${renderTab(data)}</div>
  </section>`;
  screen.querySelectorAll("[data-codex-tab]").forEach((button) => button.onclick = () => {
    activeTab = button.dataset.codexTab;
    renderCodex(screen, onSettlementAction);
  });
  screen.querySelectorAll("[data-craft]").forEach((button) => button.onclick = async () => {
    button.disabled = true;
    await onSettlementAction("settlement-locations.craft", { recipeId: button.dataset.craft });
    await loadCodex(screen, onSettlementAction);
  });
  screen.querySelectorAll("[data-bgm]").forEach((button) => button.onclick = () => playTrack(button.dataset.bgm));
  screen.querySelector("[data-bgm-stop]")?.addEventListener("click", stopMusic);
}

function renderTab(data) {
  if (activeTab === "items") return renderItems(data.items);
  if (activeTab === "people") return renderPeople(data.residents);
  if (activeTab === "lore") return renderLore(data.lore);
  if (activeTab === "music") return renderMusic(data.music);
  return renderRecipes(data.recipes);
}

function renderRecipes(recipes) {
  const sorted = [...recipes].sort((a, b) => Number(b.ready) - Number(a.ready));
  return `<div class="codex-grid">${sorted.map((r) => `<article class="codex-card${r.ready ? " is-ready" : ""}">
    <header><h3>${html(r.name)}</h3><span class="codex-tag">${html(r.skill)}</span></header>
    <p class="codex-where">在 ${html(r.where)}</p>
    <dl class="codex-parts">
      <dt>材料</dt><dd>${r.inputs.map((i) => `${html(i.name)} × ${i.count}`).join("、")}</dd>
      <dt>工具</dt><dd>${r.tools.length ? r.tools.map(html).join("、") : "不需要"}</dd>
      <dt>得到</dt><dd>${r.outputs.map((o) => `${html(o.name)} × ${o.count}`).join("、")}</dd>
    </dl>
    <p class="codex-text">${html(r.description)}</p>
    ${r.ready
      ? `<button class="action-button ink" data-craft="${html(r.id)}">动手做 <small>2 格活动</small></button>`
      : `<p class="codex-blocker">${html(r.reason)}</p>`}
  </article>`).join("")}</div>`;
}

function renderItems(items) {
  return `<div class="codex-table-wrap"><table class="codex-table">
    <thead><tr><th>物品</th><th>类别</th><th>重量（kg）</th><th>容量</th><th>耐久</th><th>用途</th><th>来源</th></tr></thead>
    <tbody>${items.map((i) => `<tr>
      <th scope="row">${html(i.name)}<small>${html(i.unit)}</small></th>
      <td>${html(i.category)}</td>
      <td>${i.mass || "—"}</td>
      <td>${i.capacity ? `${i.capacity} 份` : "—"}</td>
      <td>${i.durability || "—"}</td>
      <td>${i.capabilities.map(html).join(" · ")}</td>
      <td>${i.madeBy.length ? `做法：${i.madeBy.map(html).join("、")}` : "采集、交换或村中已有"}</td>
    </tr>`).join("")}</tbody></table></div>`;
}

function renderPeople(residents) {
  return `<div class="codex-people">${residents.map((r) => `<article class="codex-person">
    ${r.portrait
      ? `<img class="codex-portrait" src="${html(r.portrait)}" alt="${html(r.name)}的立绘" loading="lazy" />`
      : `<div class="codex-portrait codex-portrait-empty" aria-hidden="true">${html(r.name.slice(-1))}</div>`}
    <div><h3>${html(r.name)} <small>${r.age} 岁 · ${html(r.household)}</small></h3>
      <p class="codex-role">${html(r.role)}</p>
      <p>${html(r.trait)}</p>
      <p class="codex-wish">心愿：${html(r.wish)}</p></div>
  </article>`).join("")}</div>`;
}

function renderLore(sections) {
  return `<div class="codex-lore">${sections.map((s) => `<section>
    <h3>${html(s.title)}</h3>${s.paragraphs.map((p) => `<p>${html(p)}</p>`).join("")}
  </section>`).join("")}</div>`;
}

function renderMusic(tracks) {
  const playing = currentTrack();
  return `<div class="codex-music">
    <p>三首曲子都按五声音阶合成，可以循环播放。选一首作为生活时的背景音乐，再点一次顶栏的「♪」可以静音。</p>
    ${tracks.map((t) => `<article class="codex-track${playing === t.id ? " is-playing" : ""}">
      <div><h3>${html(t.title)}</h3><p>${html(t.mood)} · 适合${html(t.fits)}</p></div>
      <audio controls preload="none" src="${html(t.src)}"></audio>
      <button class="ghost-button" data-bgm="${html(t.id)}">${playing === t.id ? "正在作为背景" : "设为背景音乐"}</button>
    </article>`).join("")}
    <button class="ghost-button" data-bgm-stop>停止背景音乐</button>
  </div>`;
}

// ---------------------------------------------------------------------------
// Background music: one looping <audio>, remembered across reloads.

const BGM_KEY = "openlife.bgm";
const TRACK_SRC = {
  "river-morning": "/audio/river-morning.ogg",
  "hearth-evening": "/audio/hearth-evening.ogg",
  "kiln-fire": "/audio/kiln-fire.ogg",
};
let player = null;

function currentTrack() { return localStorage.getItem(BGM_KEY) || ""; }

function ensurePlayer() {
  if (!player) {
    player = new Audio();
    player.loop = true;
    player.volume = 0.35;
  }
  return player;
}

export function playTrack(id) {
  if (!TRACK_SRC[id]) return;
  const audio = ensurePlayer();
  if (!audio.src.endsWith(TRACK_SRC[id])) audio.src = TRACK_SRC[id];
  localStorage.setItem(BGM_KEY, id);
  audio.play().catch(() => {});
  syncToggle();
  if (lastData && activeTab === "music") document.querySelectorAll("[data-bgm]").forEach((b) => {
    b.textContent = b.dataset.bgm === id ? "正在作为背景" : "设为背景音乐";
  });
}

export function stopMusic() {
  player?.pause();
  localStorage.removeItem(BGM_KEY);
  syncToggle();
}

function syncToggle() {
  const toggle = document.getElementById("musicToggle");
  if (!toggle) return;
  const on = Boolean(player && !player.paused);
  toggle.setAttribute("aria-pressed", String(on));
  toggle.title = on ? "背景音乐：开（点击静音）" : "背景音乐：关（点击播放）";
}

/** Adds the ♪ toggle to the top bar. Browsers only allow sound after a click. */
export function installMusicToggle() {
  const actions = document.querySelector(".top-actions");
  if (!actions || document.getElementById("musicToggle")) return;
  const toggle = document.createElement("button");
  toggle.id = "musicToggle";
  toggle.className = "icon-button";
  toggle.type = "button";
  toggle.setAttribute("aria-label", "背景音乐");
  toggle.textContent = "♪";
  toggle.onclick = () => {
    if (player && !player.paused) { player.pause(); syncToggle(); return; }
    playTrack(currentTrack() || "river-morning");
  };
  actions.prepend(toggle);
  syncToggle();
}
