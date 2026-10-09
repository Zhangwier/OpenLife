import { html } from "/player.js";

const TITLES = { life: "此刻的人生", character: "人物", activities: "活动", people: "关系", works: "物品与作品", family: "家族谱", map: "地图与地点", world: "时代与世界", history: "记忆与历史", modules: "模块管理" };
let active = "home", started = false, currentState, callbacks;
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
  document.addEventListener("click", async event => {
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
    try { if (!started) await options.continueLife(); started = true; navigate("life"); }
    catch (error) { $("homeStatus").textContent = `这段人生暂时无法恢复：${error.message}。可以从人生存档选择其他记录。`; }
    finally { updateHome(); }
  });
  window.addEventListener("hashchange", () => showRoute(routeFromHash()));
  showRoute("home");
}

function routeFromHash() { const route = location.hash.slice(1); return route === "home" || TITLES[route] ? route : "home"; }
export function navigate(route) {
  if (route !== "home" && !TITLES[route]) return;
  if (location.hash !== `#${route}`) history.pushState(null, "", `#${route}`);
  showRoute(route);
}
function showRoute(route) {
  active = route; document.body.dataset.screen = route;
  $("homeScreen").hidden = route !== "home";
  $("applicationLayout").hidden = route === "home";
  document.querySelectorAll("[data-screen-panel]").forEach(el => el.hidden = el.dataset.screenPanel !== route);
  document.querySelectorAll("#appNavigation [data-route]").forEach(el => {
    const selected = el.dataset.route === route; el.classList.toggle("selected", selected);
    if (selected) el.setAttribute("aria-current", "page"); else el.removeAttribute("aria-current");
  });
  if (route !== "home") {
    $("pageTitle").textContent = TITLES[route];
    $("pageEyebrow").textContent = ["modules", "world", "map", "history"].includes(route) ? "生活的世界" : "我的人生";
    $("pageTitle").focus({ preventScroll: true });
  }
  if (route === "modules") loadModules();
  if (route === "map") loadMap();
  window.scrollTo({ top: 0, behavior: "instant" });
}
export function enterLife() { started = true; if (currentState) renderShell(currentState); updateHome(); navigate("life"); }
export function renderShell(state) {
  currentState = state; updateHome();
  $("pageIdentity").textContent = state.character ? `${state.character.name} · ${state.character.age} 岁 · ${state.character.city}` : "";
  const c = state.character, p = state.player;
  const inProgress = Boolean(p?.practice);
  $("screen-life").innerHTML = `<section class="life-overview panel"><div class="overview-label">${html(state.era)} · ${state.month} 月 · ${html(c?.city)}</div><h2>${html(c?.name)}，${c?.alive ? "今天想怎样生活？" : "这一生留下了什么？"}</h2><p class="overview-intro">${c?.alive ? "生活里有许多值得停留的地方。照看自己，见一见熟人，或者接着做手中的事。" : "你留下的关系、作品与家人仍在世界里。可以到家族谱寻找接续的人生。"}</p><div class="overview-facts"><span>${c?.age ?? 0} 岁</span><span>第 ${state.generation} 代</span><span>${html(c?.role)}</span></div>${p?.outcome ? `<div class="overview-memory"><span>最近发生的事</span><p>${html(p.outcome)}</p></div>` : ""}</section>
    <div class="destination-grid">
      <button class="destination-card" data-route="activities"><span class="destination-symbol">◎</span><h3>${inProgress ? "继续手中的活动" : "安排一段生活"}</h3><p>${inProgress ? "制陶进行中，有一个选择在等待你。" : "学习、劳作与日常。制陶是目前开放的一项手艺。"}</p><span class="destination-link">进入活动 →</span></button>
      <button class="destination-card" data-route="people"><span class="destination-symbol">人</span><h3>去见一个人</h3><p>看看熟悉的人，选择相处、帮助或共同生活。</p><span class="destination-link">查看关系 →</span></button>
      <button class="destination-card" data-route="map"><span class="destination-symbol">山</span><h3>看看你生活的地方</h3><p>查看当前位置与已有的地图资料。</p><span class="destination-link">地图与地点 →</span></button>
      <button class="destination-card" data-route="character"><span class="destination-symbol">我</span><h3>照看自己</h3><p>身体、所学与手中的材料，都是这段人生的一部分。</p><span class="destination-link">查看人物 →</span></button>
    </div>`;
  if (!started && !callbacks.hasSave()) {
    $("screen-family").querySelector(".lineage-card").hidden = true;
    if (!$("familyEmpty")) { const empty = document.createElement("p"); empty.id = "familyEmpty"; empty.className = "page-empty panel"; empty.textContent = "还没有开始的人生。开启新人生后，家族谱会记录成员与传承。"; $("screen-family").append(empty); }
  } else {
    $("screen-family").querySelector(".lineage-card").hidden = false; $("familyEmpty")?.remove();
  }
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
    screen.innerHTML = `<div class="catalog-intro panel"><h2>这个世界的组成</h2><p>当前人生使用「早期聚落」组合。这里显示真实加载状态与本地可用模块；更换组合与运行中启停将在依赖、存档兼容检查完成后开放。</p><span class="catalog-total">${data.modules.filter(m => m.loaded).length} 个已加载 · ${data.modules.length} 个本地模块</span></div><div class="module-list">${data.modules.map(m => `<article class="module-card panel"><div><h3>${html(m.label)}</h3><span class="module-status ${m.loaded ? "loaded" : ""}">${m.loaded ? "当前世界已加载" : "本地已有 · 当前未接入"}</span></div><p>${html(m.description)}</p><details><summary>模块信息</summary><p>${html(m.id)} · ${html(m.version)}</p><p>${m.loaded ? `依赖能力：${html(m.requires.join("、") || "无")}` : "接入前需核对依赖与世界规则。"}</p></details></article>`).join("")}</div>`;
  } catch (error) { screen.innerHTML = `<p class="page-empty panel">${html(error.message)}</p>`; }
}
async function loadMap() {
  const screen = $("screen-map");
  screen.innerHTML = '<p class="page-empty panel">正在读取地图资料…</p>';
  try {
    const response = await fetch("/api/catalog"); if (!response.ok) throw new Error("地图资料读取失败");
    const data = await response.json();
    screen.innerHTML = `<section class="catalog-intro panel"><div class="overview-label">当前位置</div><h2>${html(currentState?.character?.city ?? "尚未进入世界")}</h2><p>当前人生只记录出生聚落，还没有地点移动、房间探索或物体交互。下方是已有地图包的地理资料，尚未作为可游玩的地图接入。</p></section>${data.maps.map(map => `<section class="map-pack panel"><div class="panel-title-row"><div><div class="eyebrow">地图资料</div><h2>${html(map.label)}</h2></div><span class="module-status">${map.ok ? "结构校验通过" : "资料需修复"}</span></div><div class="map-counts"><span>${map.regions.length} 个区域</span><span>${map.locations.length} 个地点</span><span>${map.edges} 条连接</span></div><p class="map-limit">地形与连接已有定义；居民、房屋内部、可交互物体和衣物尚未随地图包填充。</p>${map.regions.map(region => `<details class="region-entry"><summary>${html(region.name)} <small>${html(region.id)}</small></summary><ul>${map.locations.filter(loc => loc.regionId === region.id).map(loc => `<li><strong>${html(loc.name)}</strong><span>${html(loc.type)}</span></li>`).join("")}</ul></details>`).join("")}</section>`).join("")}`;
  } catch (error) { screen.innerHTML = `<p class="page-empty panel">${html(error.message)}</p>`; }
}
