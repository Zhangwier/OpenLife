import { isTextMode } from "/view-mode.js";
import { html } from "/player.js";
import { commandsForTarget } from "/settlement.js";
import { objectKind, propSvg, fillRatio } from "/scene-props.js";
import { openDetail, closeDetail, leaveDetail } from "/detail-navigation.js";
import { icon } from "/icons.js";
import { renderSceneFx } from "/scene-fx.js";
import { audioState, onAudioChange, setSoundMode, setVolume } from "/audio.js";
import { loadCodex, installMusicToggle } from "/codex.js";

const TITLES = { life: "人生概述", character: "人物", activities: "生活", people: "人际", stories: "故事", works: "行囊", family: "家族谱", map: "地图与地点", world: "时代与世界", history: "记忆与历史", codex: "图鉴", modules: "模块管理" };
let active = "home", started = false, currentState, callbacks;
let bagSelection = null;
const $ = id => document.getElementById(id);

export function installShell(options) {
  callbacks = options;
  const destinations = { character: ".life-rail", activities: ".life-stage", people: ".relationship-card", works: ".works-card", family: ".lineage-card", world: ".world-card", history: ".history-panel" };
  for (const route of Object.keys(TITLES)) {
    const screen = document.createElement("section");
    screen.id = `screen-${route}`; screen.dataset.screenPanel = route; screen.hidden = true;
    if (destinations[route]) {
      const panel = document.querySelector(destinations[route]);
      panel.hidden = false; panel.removeAttribute("data-view-panel"); screen.append(panel);
    }
    $("pageScreens").append(screen);
  }
  $("legacyLayout").remove();
  installMusicToggle();
  $("screen-character").insertAdjacentHTML("beforeend", `<section class="panel personal-links"><h3>人生手账</h3><div class="menu-links"><button data-route="life">人生概述</button><button data-route="family">家族与传承</button><button data-route="history">往日记忆</button><button data-route="world">时代与世界</button></div></section>`);
  const collection = document.createElement("details");
  collection.className = "collection-fold";
  collection.innerHTML = "<summary>亲手留下的作品</summary>";
  $("screen-works").append(collection);
  collection.append(document.querySelector(".works-card"));
  installTheme();
  if (!isTextMode()) renderSceneFx($("homeFx"), { location: "yard", daypart: "day", season: "秋" });
  if (!isTextMode()) installSound();
  $("menuButton").onclick = () => { $("menuModal").hidden = false; };
  $("closeMenu").onclick = () => { $("menuModal").hidden = true; };
  $("sceneTimeButton").onclick = () => $("autoButton").click();
  document.addEventListener("click", event => {
    const control = event.target.closest("[data-control]");
    if (control) {
      leaveDetail();
      $("menuModal").hidden = true;
      // Reuse the modal history entry when moving from menu to another dialog.
      $(control.dataset.control)?.click();
    }
  });
  document.addEventListener("click", async event => {
    const person = event.target.closest("[data-person-route]");
    if (person) {
      navigate("activities");
      window.dispatchEvent(new CustomEvent("openlife:select-person", { detail: person.dataset.personRoute }));
      return;
    }
    const button = event.target.closest("[data-route]");
    if (button) {
      if (button.dataset.route === "family" && !started && options.hasSave()) {
        try { await options.continueLife(); started = true; } catch (error) { $("homeStatus").textContent = `家族记录读取失败：${error.message}`; return; }
      }
      navigate(button.dataset.route);
    }
  });
  window.addEventListener("openlife:navigate", event => navigate(event.detail));
  $("homeNewLife").addEventListener("click", () => $("resetButton").click());
  $("homeSaves").addEventListener("click", () => $("memoryButton").click());
  $("continueLife").addEventListener("click", async () => {
    $("continueLife").disabled = true;
    try { if (!started) await options.continueLife(); started = true; navigate("activities"); }
    catch (error) { $("homeStatus").textContent = `这段人生暂时无法恢复：${error.message}。可以从人生存档选择其他记录。`; }
    finally { updateHome(); }
  });
  window.addEventListener("hashchange", () => showRoute(routeFromHash()));
  window.addEventListener("popstate", () => { if (routeFromHash() !== active) showRoute(routeFromHash()); });
  showRoute("home");
}

function routeFromHash() { const route = location.hash.slice(1); return route === "home" || TITLES[route] ? route : "home"; }
export function navigate(route) {
  if (route !== "home" && !TITLES[route]) return;
  const hadDetail = leaveDetail();
  $("menuModal").hidden = true;
  if (hadDetail) history.replaceState(null, "", `#${route}`);
  else if (location.hash !== `#${route}`) history.pushState(null, "", `#${route}`);
  showRoute(route);
}
function showRoute(route) {
  const changed = active !== route;
  if (changed) { $("toast").classList.remove("show"); $("pageFeedback").hidden = true; }
  active = route; document.body.dataset.screen = route;
  $("homeScreen").hidden = route !== "home";
  $("applicationLayout").hidden = route === "home";
  document.querySelectorAll("[data-screen-panel]").forEach(el => el.hidden = el.dataset.screenPanel !== route);
  const primary = ["activities", "works", "people", "stories", "character"].includes(route) ? route : route === "map" ? "activities" : "character";
  document.querySelectorAll("#appNavigation [data-route]").forEach(el => {
    const selected = el.dataset.route === route || (el.parentElement.id === "appNavigation" && el.dataset.route === primary); el.classList.toggle("selected", selected);
    if (selected) el.setAttribute("aria-current", "page"); else el.removeAttribute("aria-current");
  });
  if (route !== "home") {
    $("pageTitle").textContent = TITLES[route];
    $("pageEyebrow").textContent = ["modules", "world", "map", "history", "codex"].includes(route) ? "生活的世界" : "我的人生";
    $("pageTitle").focus({ preventScroll: true });
  }
  if (route === "modules") loadModules();
  if (route === "map") loadMap();
  if (route === "codex") loadCodex($("screen-codex"), callbacks.onSettlementAction);
  if (changed) window.scrollTo({ top: 0, behavior: "instant" });
}
export function enterLife() { started = true; if (currentState) renderShell(currentState); updateHome(); navigate("activities"); }
export function renderShell(state) {
  currentState = state; updateHome();
  $("pageIdentity").textContent = state.character ? `${state.character.name} · ${state.character.age} 岁 · ${state.character.city}` : "";
  const c = state.character, p = state.player;
  const inProgress = Boolean(p?.practice);
  $("screen-life").innerHTML = `<section class="life-overview panel"><div class="overview-label">${html(state.era)} · ${state.month} 月 · ${html(c?.city)}</div><h2>${html(c?.name)}，${c?.alive ? "今天想怎样生活？" : "这一生留下了什么？"}</h2><p class="overview-intro">${c?.alive ? "生活里有许多值得停留的地方。照看自己，见一见熟人，或者接着做手中的事。" : "你留下的关系、作品与家人仍在世界里。可以到家族谱寻找接续的人生。"}</p><div class="overview-facts"><span>${c?.age ?? 0} 岁</span><span>第 ${state.generation} 代</span><span>${html(c?.role)}</span></div>${p?.outcome ? `<div class="overview-memory"><span>最近发生的事</span><p>${html(p.outcome)}</p></div>` : ""}</section>
    <div class="destination-grid">
      <button class="destination-card" data-route="activities"><span class="destination-symbol">◎</span><h3>${inProgress ? "继续制作" : "回到生活"}</h3><p>${inProgress ? "你的手艺仍在进行。" : "遇见的人、手边的原料和附近的地点。"}</p><span class="destination-link">进入生活 →</span></button>
      <button class="destination-card" data-route="character"><span class="destination-symbol">我</span><h3>查看自己</h3><p>身体、经历与正在学习的能力。</p><span class="destination-link">进入人物 →</span></button>
      <button class="destination-card" data-route="works"><span class="destination-symbol">袋</span><h3>整理行囊</h3><p>查看真正携带的东西、负重和存放。</p><span class="destination-link">进入行囊 →</span></button>
      <button class="destination-card" data-route="people"><span class="destination-symbol">人</span><h3>人际关系</h3><p>见过、交谈、相识，关系需要真实经历。</p><span class="destination-link">打开人际 →</span></button>
    </div>`;
  const oldDecision = document.querySelector(".decision-area");
  if (oldDecision && !oldDecision.closest(".legacy-choice-details")) {
    const details = document.createElement("details");
    details.className = "legacy-choice-details";
    details.innerHTML = "<summary>手艺、年度与其他生活选择</summary>";
    oldDecision.before(details); details.append(oldDecision);
  }
  const bag = $("screen-works");
  let pack = $("portableOverview");
  if (!pack) {
    pack = document.createElement("section");
    pack.id = "portableOverview"; pack.className = "panel portable-overview";
    bag.prepend(pack);
  }
  renderBag();
  if (!started && !callbacks.hasSave()) {
    $("screen-family").querySelector(".lineage-card").hidden = true;
    if (!$("familyEmpty")) { const empty = document.createElement("p"); empty.id = "familyEmpty"; empty.className = "page-empty panel"; empty.textContent = "还没有开始的人生。开启新人生后，家族谱会记录成员与传承。"; $("screen-family").append(empty); }
  } else {
    $("screen-family").querySelector(".lineage-card").hidden = false; $("familyEmpty")?.remove();
  }
}
function bagMeter(label, value, max, unit) {
  const pct = max ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;
  return `<span class="bag-meter"><span>${label}</span><span class="hud-track"><i style="width:${pct}%"></i></span><b>${value}/${max}${unit}</b></span>`;
}
function renderBag() {
  const pack = $("portableOverview"), s = currentState?.settlement;
  if (!pack) return;
  const held = s?.objects?.filter(o => o.placement === "在手中") || [];
  const load = s?.portableLoad;
  pack.innerHTML = `<div class="bag-heading"><div><span class="eyebrow">随身携带</span><h2>随身行囊</h2></div><span class="bag-mark" aria-hidden="true">${propSvg("basket")}</span></div>
    <div class="portable-meter">${load ? `${bagMeter("随身", load.looseSlots, load.maxSlots, "件")}${bagMeter("负重", Number(load.mass.toFixed(1)), load.maxMass, "")}` : "暂无携带记录"}</div>
    <div class="portable-items">${held.length ? held.map(o =>
      `<button class="portable-item" data-bag-id="${html(o.id)}" aria-pressed="${bagSelection === o.id}"><span class="bag-item-art" aria-hidden="true">${propSvg(objectKind(o), fillRatio(o))}</span><strong>${html(o.name)}</strong><small>${html(o.placement)}${o.capacity ? ` · 容量 ${o.contentsCount || o.quantity || 0}/${o.capacity}` : ""}</small></button>`).join("") :
      '<div class="bag-empty"><strong>轻装出发</strong><p>行囊还是空的。到生活场景中，轻触物件或原料，查看能否取用。</p><button data-route="activities">去寻找材料 →</button></div>'}</div>
    <section id="bagDetail" class="bag-detail" aria-label="物品操作" hidden></section>`;
  pack.querySelectorAll("[data-bag-id]").forEach(button => button.onclick = () => {
    bagSelection = button.dataset.bagId;
    openDetail("bag", () => { bagSelection = null; renderBag(); });
    renderBagDetail();
    $("bagDetail").scrollIntoView({ block: "nearest" });
    $("bagDetail").querySelector("strong")?.focus({ preventScroll: true });
  });
  renderBagDetail();
}
function renderBagDetail() {
  const box = $("bagDetail"), s = currentState?.settlement;
  if (!box) return;
  const item = s?.objects.find(o => o.id === bagSelection);
  if (!item || !bagSelection || item.placement !== "在手中") { box.hidden = true; if (bagSelection) closeDetail("bag"); return; }
  box.hidden = false;
  $("portableOverview").querySelectorAll("[data-bag-id]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.bagId === bagSelection)));
  const actions = commandsForTarget(s, { type: "object", id: bagSelection });
  box.innerHTML = `<div class="scene-quick-head"><strong tabindex="-1">${html(item.name)}</strong><button data-bag-close aria-label="关闭物品详情">×</button></div>
    <p>${html(item.placement)} · 当前位置：${html(s.placeName)}</p>
    <div class="scene-quick-list">${actions.map((a, i) => `<button class="scene-quick-choice" data-bag-action="${i}" ${a.enabled === false ? "disabled" : ""}><span>${html(a.label)}</span>${a.activityCost ? `<small>${a.activityCost} 格活动</small>` : a.days ? `<small>${a.days} 天</small>` : ""}${a.enabled === false ? `<small class="quick-blocker">${html(a.reason || "当前条件不允许")}</small>` : ""}</button>`).join("") || '<p>这里暂时没有可用操作。可以前往其他地点查看。</p>'}</div>`;
  box.querySelector("[data-bag-close]").onclick = () => closeDetail("bag");
  box.querySelectorAll("[data-bag-action]").forEach(button => button.onclick = async () => {
    const action = actions[Number(button.dataset.bagAction)];
    if (!action || action.enabled === false || document.body.classList.contains("is-busy")) return;
    await callbacks.onSettlementAction(action.id, action.payload || {});
  });
}
function updateHome() {
  if (!callbacks) return;
  const saved = callbacks.saveSummary();
  const person = started ? currentState?.character : saved?.character;
  $("continueLife").disabled = !started && !callbacks.hasSave();
  $("continueSummary").textContent = person ? `${person.name} · ${person.age} 岁 · 第 ${started ? currentState.generation : saved.generation} 代` : "开启新人生后，从这里继续";
  $("homeStatus").textContent = started || callbacks.hasSave() ? "世界会在你作出选择时前行。回到主菜单不会重置人生。" : "先开启一段人生，或从存档找回之前的世界。";
}
async function loadModules() {
  const screen = $("screen-modules");
  screen.innerHTML = '<p class="page-empty panel">正在读取模块…</p>';
  try {
    const response = await fetch("/api/catalog"); if (!response.ok) throw new Error("模块资料读取失败");
    const data = await response.json();
    screen.innerHTML = `<div class="catalog-intro panel"><h2>这个世界的组成</h2><p>当前人生使用「早期聚落」组合。这里显示真实加载状态与本地可用模块；更换组合与运行中启停将在依赖、存档兼容检查完成后开放。</p><span class="catalog-total">${data.modules.filter(m => m.loaded).length} 个已加载 · ${data.modules.length} 个本地模块</span></div>${(() => { const card = m => `<article class="module-card panel"><div><h3>${html(m.label)}</h3><span class="module-status ${m.loaded ? "loaded" : ""}">${m.loaded ? "当前世界已加载" : "本地已有 · 当前未接入"}</span></div><p>${html(m.description)}</p><details><summary>模块信息</summary><p>${html(m.id)} · ${html(m.version)}</p><p>${m.loaded ? `依赖能力：${html(m.requires.join("、") || "无")}` : "接入前需核对依赖与世界规则。"}</p></details></article>`;
      const on = data.modules.filter(m => m.loaded), off = data.modules.filter(m => !m.loaded);
      return `<h3 class="module-group">当前世界已加载 · ${on.length}</h3><div class="module-list">${on.map(card).join("")}</div>` +
        (off.length ? `<details class="module-fold"><summary>本地已有、当前未接入 · ${off.length}</summary><div class="module-list">${off.map(card).join("")}</div></details>` : ""); })()}`;
  } catch (error) { screen.innerHTML = `<p class="page-empty panel">${html(error.message)}</p>`; }
}
const TERRAIN_LABELS = {
  plain: "平原", highland: "高地", wetland: "湿地", corridor: "走廊", basin: "盆地", delta: "三角洲", terrace: "台地",
  lakeshore: "湖岸", dry_plain: "旱原", frontier: "边地", river_bank: "河岸", river_branch: "支流", river_crossing: "渡河处",
  river_mouth: "河口", river_mouth_plain: "河口平原", inland_rise: "内陆高坡", crossing: "渡口", inlet: "入水口", marsh: "沼泽",
  meadow: "草甸", grassland: "草原", gully: "冲沟", valley: "河谷", spring: "泉", camp: "营地", trading_post: "交易点",
  hunting_ground: "猎场", waterhole: "水坑", wet_farmland: "水田", shallow_lake: "浅湖", reed_flat: "芦苇滩", basin_floor: "盆底",
  basin_rim: "盆缘", frontier_bank: "边地河岸", frontier_post: "边地哨所", slope: "山坡", ridge: "山脊", pass: "垭口",
  hill_slope: "丘陵坡地", oak_slope: "栎树坡", cave: "洞穴", bamboo_valley: "竹谷", bamboo_grove: "竹林", stream_ford: "溪滩",
  valley_floor: "谷底", waterfall_pool: "瀑潭", salt_spring_terrace: "盐泉台地", salt_spring: "盐泉", salt_flat: "盐滩",
  chestnut_slope: "栗林坡地", stone_bar_reach: "石滩河段", misty_ridge: "雾岭", chestnut_grove: "栗树林", rooting_ground: "野猪拱地",
  cobble_bar: "卵石滩", knapping_cliff: "打石崖", deep_pool: "深潭", river_islet: "河洲", lightning_tree: "雷劈树", wolf_den: "狼窝",
  cattail_reach: "蒲草河湾", great_marsh: "大泽", heron_isles: "鹭岛", cattail_bank: "蒲草岸", weir_shallows: "鱼梁浅滩",
  old_ferry: "旧渡口", reed_channel: "芦荡水道", floating_mat: "浮草甸", water_chestnut_pond: "菱塘", milu_islet: "麋鹿洲",
  heronry: "鹭鸟岛", drowned_forest: "沉木林", gator_den: "鼍窟", spring_head: "泉眼",
};
const TIME_LABELS = { any: "", dawn: "清晨", day: "白天", dusk: "黄昏", night: "夜里" };
const DANGER_LABELS = ["无害", "小心", "危险", "致命"];
// 事件点的可选细节：何时出现、遇见什么、它怎么做、能留下什么。
function eventPointDetail(point) {
  const bits = [];
  if (point.time && TIME_LABELS[point.time]) bits.push(`<span class="codex-tag">${html(TIME_LABELS[point.time])}</span>`);
  if (point.danger !== undefined) bits.push(`<span class="codex-tag">${html(DANGER_LABELS[point.danger] ?? "")}</span>`);
  if (point.creature) bits.push(`<strong>${html(point.creature)}</strong>`);
  const lines = [];
  if (point.behavior) lines.push(`<small>习性：${html(point.behavior)}</small>`);
  if (point.drops?.length) lines.push(`<small>可能留下：${html(point.drops.join("、"))}</small>`);
  return bits.length || lines.length ? `<div class="event-detail">${bits.join(" ")}${lines.join("<br>")}</div>` : "";
}
const EVENT_KIND_LABELS = { landmark: "地标", gathering: "采集", encounter: "相遇", hazard: "险情", omen: "征兆", festival: "节庆" };
const SEASON_LABELS = { any: "四季", spring: "春", summer: "夏", autumn: "秋", winter: "冬" };
function terrainLabel(type) { return TERRAIN_LABELS[type] ?? String(type ?? "").replaceAll("_", " "); }
function eventPointList(map) {
  if (!map.eventPoints?.length) return "";
  const names = new Map(map.locations.map(loc => [loc.id, loc.name]));
  return `<details class="region-fold event-fold"><summary>查看 ${map.eventPoints.length} 个事件点</summary><ul class="event-points">${map.eventPoints.map(point => `<li><div><strong>${html(point.name)}</strong><span class="codex-tag">${html(EVENT_KIND_LABELS[point.kind] ?? point.kind)} · ${html(SEASON_LABELS[point.season] ?? point.season)}</span></div><small>${html(names.get(point.locationId) ?? point.locationId)}</small><p>${html(point.text)}</p>${eventPointDetail(point)}</li>`).join("")}</ul></details>`;
}
async function loadMap() {
  const screen = $("screen-map");
  screen.innerHTML = '<p class="page-empty panel">正在读取地图资料…</p>';
  try {
    const response = await fetch("/api/catalog"); if (!response.ok) throw new Error("地图资料读取失败");
    const data = await response.json();
    screen.innerHTML = `<section class="catalog-intro panel"><div class="overview-label">当前位置</div><h2>${html(currentState?.character?.city ?? "尚未进入世界")}</h2><p>河岸聚落已经可以在「生活」里真实移动、走进房间和操作物品。更远的地图包仍主要是世界资料，暂不能全部直接前往。</p></section>${data.maps.map(map => `<section class="map-pack panel"><div class="panel-title-row"><div><div class="eyebrow">地图资料</div><h2>${html(map.label)}</h2></div><span class="module-status">${map.ok ? "结构校验通过" : "资料需修复"}</span></div><div class="map-counts"><span>${map.regions.length} 个区域</span><span>${map.locations.length} 个地点</span><span>${map.edges} 条连接</span></div><p class="map-limit">地形与连接已有定义；居民、房屋内部、可交互物体和衣物尚未随地图包填充。${map.eventPoints?.length ? `这片地图记有 ${map.eventPoints.length} 处值得留意的地方。` : ""}</p>${eventPointList(map)}<details class="region-fold"><summary>查看 ${map.regions.length} 个区域</summary>${map.regions.map(region => `<details class="region-entry"><summary>${html(region.name)} <small>${html(terrainLabel(region.type))} · ${html(region.id)}</small></summary><ul>${map.locations.filter(loc => loc.regionId === region.id).map(loc => `<li><strong>${html(loc.name)}</strong><span>${html(terrainLabel(loc.type))}</span></li>`).join("")}</ul></details>`).join("")}</details></section>`).join("")}`;
  } catch (error) { screen.innerHTML = `<p class="page-empty panel">${html(error.message)}</p>`; }
}

// Light / dark: follows the system until the player picks one; the choice is remembered.
const darkQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
function effectiveTheme() {
  return document.documentElement.dataset.theme || (darkQuery?.matches ? "dark" : "light");
}
function paintThemeButtons() {
  const dark = effectiveTheme() === "dark";
  for (const id of ["themeButton", "homeThemeButton"]) {
    const b = $(id); if (!b) continue;
    b.innerHTML = icon(dark ? "sun" : "moonTheme");
    b.setAttribute("aria-label", dark ? "切换到亮色模式" : "切换到深色模式");
    b.title = dark ? "亮色模式" : "深色模式";
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? "#121a17" : "#f2ece1";
}
function installTheme() {
  const toggle = () => {
    const next = effectiveTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("openlife-theme", next); } catch { /* private mode */ }
    paintThemeButtons();
  };
  for (const id of ["themeButton", "homeThemeButton"]) { const b = $(id); if (b) b.onclick = toggle; }
  darkQuery?.addEventListener?.("change", paintThemeButtons);
  paintThemeButtons();
}

// 声音：按钮打开小面板，选模式即开始播放（这次点击就是浏览器要求的手势）。
const MODE_LABEL = { music: "舒缓音乐", noise: "白噪音", off: "关闭" };
function installSound() {
  const panel = $("soundPanel"); if (!panel) return;
  const modeIcons = { music: "music", noise: "rain", off: "soundOff" };
  panel.querySelectorAll("[data-sound-mode]").forEach(b => {
    b.querySelector(".sm-icon").innerHTML = icon(modeIcons[b.dataset.soundMode]);
    b.onclick = () => setSoundMode(b.dataset.soundMode);
  });
  const vol = $("soundVolume");
  vol.oninput = () => setVolume(vol.value / 100);
  let anchor = null;
  const close = () => { panel.hidden = true; anchor?.setAttribute("aria-expanded", "false"); };
  const open = button => {
    anchor = button; panel.hidden = false; button.setAttribute("aria-expanded", "true");
    const r = button.getBoundingClientRect(), w = Math.min(300, window.innerWidth - 24);
    panel.style.width = w + "px";
    panel.style.top = Math.round(r.bottom + 8) + "px";
    panel.style.left = Math.round(Math.max(12, Math.min(window.innerWidth - w - 12, r.right - w))) + "px";
  };
  for (const id of ["soundButton", "homeSoundButton"]) {
    const b = $(id); if (!b) continue;
    b.onclick = event => { event.stopPropagation(); panel.hidden ? open(b) : close(); };
  }
  panel.addEventListener("click", e => e.stopPropagation());
  document.addEventListener("click", () => { if (!panel.hidden) close(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !panel.hidden) close(); });
  const paint = st => {
    const on = st.playing;
    for (const id of ["soundButton", "homeSoundButton"]) {
      const b = $(id); if (!b) continue;
      b.innerHTML = icon(on ? "soundOn" : "soundOff");
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-label", on ? "声音：" + MODE_LABEL[st.mode] : "声音：关闭");
      b.title = on ? MODE_LABEL[st.mode] : "声音已关闭";
    }
    const active = on ? st.mode : "off";
    panel.querySelectorAll("[data-sound-mode]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.soundMode === active)));
    $("soundStatus").textContent = on ? "正在播放 · " + MODE_LABEL[st.mode] : "关闭";
    vol.value = Math.round(st.volume * 100);
  };
  onAudioChange(paint); paint(audioState());
}
