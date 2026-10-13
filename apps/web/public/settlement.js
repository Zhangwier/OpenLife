/**
 * A small-screen-first settlement scene. Select the person/material/object
 * first; only that target's meaningful commands are offered. This is a UI
 * projection over the same authoritative actions, never a parallel inventory.
 */
import { renderFigure } from "./character-appearance.js";
import { objectKind, resourceKind, fillRatio, propSvg, slotFor } from "./scene-props.js";
import { openDetail, closeDetail } from "./detail-navigation.js";
const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g,
  (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[ch]);

let selected = null;
let selectionPlace = "";
let currentSceneState = null;
let currentSceneAction = null;
const choose = (type, id) => { selected = { type, id }; };
const REED_WORK = new Set([
  "settlement-locations.weave_bag", "settlement-locations.weave_mat",
  "settlement-locations.prepare_fiber",
]);
const FIBER_WORK = new Set(["settlement-locations.weave_wrap"]);
const TRAVEL = new Set(["settlement-locations.arrive", "world-space.move_within"]);


const SCENE_ART = {
 "place:hearth-yard":"/art/scene-hearth.svg",
 "place:reedbed":"/art/scene-reedbed.svg",
 "place:field":"/art/scene-field.svg",
 "place:yard":"/art/scene-yard.svg",
 "place:river":"/art/scene-river.svg",
 "place:kiln":"/art/scene-kiln.svg",
 "place:claypits":"/art/scene-claypits.svg",
 "place:ford":"/art/scene-ford.svg"
};
const propPriority={cistern:0,jar:1,hearth:2,kiln:3,pot:4,fuel:5,basket:6,tool:7,reed:8,grain:9,mat:10,default:11};
function renderPaintedStage(s) {
 const art=$("sceneBackdrop");
 if(!art)return;
 const src=SCENE_ART[s.placeId]||"/art/scene-yard.svg";
 if(!art.src.endsWith(src))art.src=src;
 const theater=$("sceneTheater");
 theater.dataset.location=s.placeId==="place:hearth-yard"?"hearth":s.placeId.replace("place:","");
 $("sceneStageName").textContent=s.placeName||"河岸聚落";
 $("sceneStageSeason").textContent=s.season+" · 第 "+s.day+"日";
 const residents=s.neighbours.slice(0,4).map((person,i)=>
   '<button class="painted-actor actor-pos-'+i+'" type="button" data-person="'+esc(person.id)+'"'+
   ' title="'+esc(person.name)+'" aria-label="与'+esc(person.name)+'互动"'+
   ' aria-pressed="'+(selected?.type==="person"&&selected.id===person.id)+'">'+
   renderFigure(person.id,person.role+' '+person.name)+
   '<span class="painted-actor-name">'+esc(person.name)+'</span></button>').join("");
  // Display one illustrative object of each kind; others remain available in the ledger.
  const ground=s.objects.filter(o=>o.placement==="放着").sort((a,b)=>
    (propPriority[objectKind(a)]??99)-(propPriority[objectKind(b)]??99)||a.id.localeCompare(b.id))
    .filter((o,i,all)=>all.findIndex(other=>objectKind(other)===objectKind(o))===i).slice(0,3); const objects=ground.map((o,i)=>{
   const xy=slotFor(s.placeId,"object",i),kind=objectKind(o);
   return '<button type="button" class="scene-prop scene-prop--'+kind+'"'+
     ' style="--sx:'+xy[0]+'%;--sy:'+xy[1]+'%"'+
     ' data-object="'+esc(o.id)+'" data-prop-kind="'+kind+'"'+
     ' title="'+esc(o.name)+'" aria-label="观察'+esc(o.name)+'"'+
     ' aria-pressed="'+(selected?.type==="object"&&selected.id===o.id)+'">'+
     propSvg(kind,fillRatio(o))+'<span class="scene-prop-tooltip">'+esc(o.name)+
     (o.capacity>0?" · "+Math.max(o.contentsCount||0,o.quantity||0)+"/"+o.capacity:"")+
     '</span></button>';
 }).join("");
 const materials=s.yields.filter(r=>r.stock>0).slice(0,2);
 const resources=materials.map((r,i)=>{
   const xy=slotFor(s.placeId,"yield",i);
   const kind=resourceKind(r.resourceId);
   return '<button type="button" class="scene-prop scene-prop--source scene-prop--'+kind+'"'+
     ' style="--sx:'+xy[0]+'%;--sy:'+xy[1]+'%"'+
     ' data-yield="'+esc(r.resourceId)+'" data-prop-kind="'+kind+'"'+
     ' title="'+esc(r.label)+'" aria-label="采集'+esc(r.label)+'，余量'+r.stock+esc(r.unit)+'"'+
     ' aria-pressed="'+(selected?.type==="yield"&&selected.id===r.resourceId)+'">'+
     propSvg(kind,Math.min(1,r.stock/Math.max(1,r.capacity)))+
     '<span class="scene-prop-tooltip">'+esc(r.label)+' · '+r.stock+esc(r.unit)+'</span></button>';
 }).join("");
  const exits=s.exits.filter(e=>e.placeId!==s.placeId)
    .sort((a,b)=>Number(b.placeId===previousScenePlace)-Number(a.placeId===previousScenePlace)).slice(0,2)   .map((e,i)=>'<button type="button" class="painted-exit painted-exit--'+i+'"'+
     ' data-stage-go="'+esc(e.placeId)+'" aria-label="前往'+esc(e.name)+'">'+
     '<span aria-hidden="true">➜</span><span>'+esc(e.name)+'</span></button>').join("");
 const landmark=(s.placeId==="place:hearth-yard"||s.placeId==="place:yard"||
   s.placeId==="place:field"||s.placeId==="place:reedbed")?
   '<button type="button" class="scene-landmark" data-stage-work aria-label="观察身边的劳动设施" title="观察设施">'+
   '<svg viewBox="0 0 74 74" aria-hidden="true"><circle cx="37" cy="37" r="24" fill="#b59a68" fill-opacity=".35" stroke="#e4d1a3" stroke-width="2"/>'+
   '<path d="M25 43l11-18 12 18-11-5Z" fill="#eacb8d"/></svg>'+
   '<span class="scene-prop-tooltip">观察设施</span></button>':'';
 $("sceneHotspots").innerHTML=
   '<div class="painted-avatar" aria-label="你的角色">'+renderFigure(s.characterId,"player")+'</div>'+
   residents+objects+resources+landmark+exits;
 $("sceneStageHint").textContent="观察眼前物品与村民，轻触即可互动";
}
let previousScenePlace = "";
function hudMeter(label, value, max, tone) {
  const pct = max ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;
  return `<span class="hud-item ${tone}"><span class="hud-label">${label}</span><span class="hud-track"><i style="width:${pct}%"></i></span><b>${value}/${max}</b></span>`;
}
function renderInSceneMenu(s, heading, candidates, onAction) {
  const theater = $("sceneTheater"), box = $("sceneQuickActions");
  if (!box || !theater) return;
  box.hidden = !selected;
  $("dockTools").hidden = Boolean(selected);
  if (!selected) { box.innerHTML = ""; closeDetail("scene"); return; }
  openDetail("scene", () => {
    selected = null;
    if (currentSceneState && currentSceneAction) renderSettlement(currentSceneState, currentSceneAction);
  });
  const shown = selected.type === "walk"
    ? candidates.filter(a => a.id === "settlement-locations.arrive" || a.id === "world-space.move_within")
    : candidates;
  const btn = (action, i) => {
    const why = action.enabled === false ? (action.reason || "当前条件不允许") : "";
    const cost = Number(action.activityCost || 0);
    const primary = !why && selected.type !== "walk" && i === shown.findIndex(a => a.enabled !== false);
    return '<button type="button" class="scene-quick-choice' + (primary ? ' is-primary' : '') + '" data-scene-quick="' + i + '"' +
      (why ? ' disabled aria-disabled="true"' : '') + '><span>' + esc(action.label) + '</span>' +
      (cost ? '<small>' + cost + ' 格活动</small>' : Number(action.days) > 0 ? '<small>' + Number(action.days) + ' 天</small>' : '') +
      (why ? '<small class="quick-blocker">' + esc(why) + '</small>' : '') + '</button>';
  };
  const activeCount = shown.filter(a => a.enabled !== false).length;
  const title = heading || "当前可以做什么";
  box.innerHTML =
    '<div class="scene-quick-head"><strong tabindex="-1">' + esc(title) + '</strong>' +
    '<button type="button" data-scene-close aria-label="关闭操作">×</button></div>' +
    (!activeCount && selected.type !== "walk"
      ? '<p class="scene-quick-help">暂时没有能完成的操作。你可以换一件物品，或打开地点地图。</p>' : '') +
    '<div class="scene-quick-list">' + shown.slice(0, 3).map(btn).join("") + '</div>' +
    (shown.length > 3 ? '<details class="quick-more"><summary>更多操作（' + (shown.length - 3) + '）</summary><div class="scene-quick-list">' + shown.slice(3).map((a, i) => btn(a, i + 3)).join("") + '</div></details>' : '');
  // Every target uses the same action area below the painting.
  box.querySelector("[data-scene-close]").onclick = () => closeDetail("scene");
  box.querySelectorAll("[data-scene-quick]").forEach(button => button.onclick = () => {
    const action = shown[Number(button.dataset.sceneQuick)];
    if (!action || action.enabled === false) return;
    if (document.body.classList.contains("is-busy")) {
      const notice = box.querySelector(".scene-quick-help") || document.createElement("p");
      notice.className = "scene-quick-help";
      notice.textContent = "上一件事还在完成；请稍候再按一次，当前选项不会消失。";
      box.appendChild(notice);
      return;
    }
    onAction(action.id, action.payload || {});
  });
}
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && selected && currentSceneState && currentSceneAction) {
    closeDetail("scene");
  }
});
export function renderSettlement(state, onAction) {
  currentSceneState = state;
  currentSceneAction = onAction;
  const panel = $("settlementScene");
  if (!panel) return;
  const s = state.settlement;
  if (!s || !s.exists) { panel.hidden = true; selected = null; return; }
  panel.hidden = false;
  if (selectionPlace !== s.placeId) { if (selectionPlace) previousScenePlace = selectionPlace; selected = null; selectionPlace = s.placeId; }
  $("scenePlace").textContent = s.placeName || "聚落";
  $("sceneSpace").textContent = s.spaceName || "院子";
  $("sceneDay").textContent = `第 ${s.day} 天 · ${s.season}`;
  const status = [
    `饥饿 ${s.hunger ?? 0}/10`,
    `今日活动 ${s.dailyActivity?.remaining ?? 0}/${s.dailyActivity?.capacity ?? 8} 格`,
    s.outfit ? `已穿：${s.outfit.name}` : "",
    s.barter?.status === "offered" && s.barter.offeredAt === state.tick ? "阿灶正在等待你回复报价" : "",
  ];
  // 状态用量表而不是一句话：饥饿、今日活动格、随身负重一眼可读。
  const act = s.dailyActivity || { remaining: 0, capacity: 8 };
  const load = s.portableLoad;
  const pips = Array.from({ length: act.capacity ?? 8 }, (_, i) => `<i class="${i < (act.remaining ?? 0) ? "on" : ""}"></i>`).join("");
  const extra = status.slice(2).filter(Boolean);
  $("sceneSummary").innerHTML = `<span class="sr-only">${esc(status.filter(Boolean).join(" · "))}</span>
    <span class="hud" aria-hidden="true">
      ${hudMeter("饥饿", s.hunger ?? 0, 10, (s.hunger ?? 0) >= 7 ? "warn" : "")}
      <span class="hud-item"><span class="hud-label">今天</span><span class="hud-pips">${pips}</span><b>剩 ${act.remaining ?? 0} 格</b></span>
      ${load ? hudMeter("负重", Number(load.mass.toFixed(1)), load.maxMass, load.mass >= load.maxMass ? "warn" : "") : ""}
    </span>${extra.length ? `<span class="hud-note">${esc(extra.join(" · "))}</span>` : ""}`;
  renderPaintedStage(s);

  const story = $("communityFeed");
  if (story) {
    const situation = s.communitySituation || {};
    story.innerHTML = `<div class="hearth-story-heading"><span>身边的事</span>
      <strong>${esc(situation.title || "村民正在生活")}</strong></div>
      <p>${esc(situation.note || "村民会自行寻找物资、劳动、求助或拒绝。")}</p>
      ${situation.recentHelp ? `<div class="hearth-story-foot">${esc(situation.recentHelp)}</div>` : ""}
      ${situation.fuelStock !== null && situation.fuelStock !== undefined
        ? `<div class="hearth-story-foot">芦苇滩现有柴草 ${Number(situation.fuelStock)} 捆</div>` : ""}`;
    const available = s.actions || [];
    const options = [];
    const offer = (label, action) => { if (action?.enabled) options.push({ label, action }); };
    const travel = placeId => available.find(a => a.id === "settlement-locations.arrive" &&
      a.enabled && a.payload?.placeId === placeId);
    if (!situation.visible && s.placeId !== "place:hearth-yard") {
      offer("到公灶看看", travel("place:hearth-yard"));
    } else if (s.placeId === "place:hearth-yard") {
      const cook = s.neighbours.find(p => p.name === "阿灶");
      if (cook) {
        offer("和阿灶谈谈", available.find(a => a.id === "settlement-locations.talk" &&
          a.payload?.targetId === cook.id));
        for (const action of available.filter(a => a.id === "settlement-locations.hearth.help"))
          offer(action.payload?.resourceId === "resource:fuel" ? "自愿送一捆柴草" : "自愿送一份粟粮", action);
      }
    } else if (s.placeId === "place:reedbed") {
      offer("采集眼前的柴草", available.find(a => a.id === "settlement-locations.draw" &&
        a.payload?.resourceId === "resource:fuel"));
    }
    if (options.length) {
      story.insertAdjacentHTML("beforeend", `<div class="hearth-story-actions">${options.map((option, i) =>
        `<button type="button" data-story-action="${i}">${esc(option.label)} →</button>`).join("")}</div>`);
      story.querySelectorAll("[data-story-action]").forEach(button => button.addEventListener("click", () => {
        const chosen = options[Number(button.dataset.storyAction)];
        if (chosen) onAction(chosen.action.id, chosen.action.payload || {});
      }));
    }
  }


  const people = $("sceneNeighbours");
  people.innerHTML = s.neighbours.length
    ? s.neighbours.map((person) => `<button class="scene-person scene-target" type="button" data-person="${esc(person.id)}" aria-pressed="${selected?.type === "person" && selected.id === person.id}">
       <span class="scene-person-head"><span class="scene-avatar">${esc(person.name.slice(0, 1))}</span>
       <span><strong>${esc(person.name)}</strong><small>${esc(person.contact || "陌生")} · ${esc(person.role)}</small></span></span>
       <small>${esc(person.dailyNote || (person.atWork ? "正忙着自己的事" : "在这里休息"))}${person.tradeCount > 0 ? ` · 实物交换 ${Number(person.tradeCount)} 次` : ""}</small>
      </button>`).join("")
    : '<p class="scene-empty">眼前没有其他村民。</p>';
  const objects = $("sceneObjects");
  const groundItems = s.objects.filter((o) => o.placement !== "在手中");
  const groups = new Map();
  for (const item of groundItems) {
    const key = item.prototypeId + "::" + item.placement;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const objectGroup = (items) => {
    const first = items[0];
    const oneButton = (o, count = 1) => `<button class="scene-object scene-target" type="button"
      data-object="${esc(o.id)}" aria-pressed="${selected?.type === "object" && selected.id === o.id}">
      <span class="scene-object-name">${esc(o.name)}${count > 1 ? ` ×${count}` : ""}</span>
      <small>${esc(o.placement)}</small></button>`;
    return `<div class="scene-object-kind">${oneButton(first, items.length)}
      ${items.length > 1 ? `<details><summary>查看同类 ${items.length} 件</summary><div class="scene-object-subitems">
      ${items.slice(1).map((o) => oneButton(o)).join("")}</div></details>` : ""}</div>`;
  };
  const objectGroups = [...groups.values()];
  objects.innerHTML = objectGroups.length
    ? `${objectGroups.slice(0, 4).map(objectGroup).join("")}
      ${objectGroups.length > 4 ? `<details class="scene-extra scene-objects-extra">
        <summary>查看更多物件（${objectGroups.length - 4} 类）</summary>
        <div class="scene-objects">${objectGroups.slice(4).map(objectGroup).join("")}</div>
        </details>` : ""}`
    : '<p class="scene-empty">当前没有可查看的地上物件。</p>';

  const yields = $("sceneYields");
  yields.innerHTML = s.yields.length
    ? s.yields.map((row) => `<button type="button" class="scene-yield scene-target" data-yield="${esc(row.resourceId)}"
       aria-pressed="${selected?.type === "yield" && selected.id === row.resourceId}">
       <span>${esc(row.label)}</span><b>${row.stock} ${esc(row.unit)}</b></button>`).join("")
    : '<p class="scene-empty">这里没有可采集的原料。</p>';

  const carried = $("sceneCarried");
  carried.innerHTML = s.carrying.length
    ? s.carrying.map((row) => `<button class="carry-chip scene-target" type="button" data-carry="${esc(row.resourceId)}"
       aria-pressed="${selected?.type === "carry" && selected.id === row.resourceId}">
       ${esc(row.label)} <b>${row.count}</b> ${esc(row.unit)}</button>`).join("")
    : '<span class="scene-empty">暂时没有随身物品。</span>';

  const loans = $("sceneLoans");
  if (loans) {
    loans.innerHTML = s.loans?.length
      ? s.loans.map((loan) => `<button class="scene-loan" data-return="${esc(loan.objectId)}">
         借来的${esc(loan.name)} · ${loan.overdue ? "已逾期" : `${loan.daysLeft} 天内归还`}</button>`).join("")
      : "";
    loans.querySelectorAll("[data-return]").forEach((button) =>
      button.addEventListener("click", () => onAction("world-objects.return", { objectId: button.dataset.return })));
  }

  // Keep actual object selection stable across a legal action, not across travel
  // or disappearance from the authoritative scene.
  if (selected?.type === "object" && !s.objects.some((o) => o.id === selected.id)) selected = null;
  if (selected?.type === "person" && !s.neighbours.some((p) => p.id === selected.id)) selected = null;

  const heading = selected?.type === "person"
    ? s.neighbours.find((p) => p.id === selected.id)?.name
    : selected?.type === "object"
      ? s.objects.find((o) => o.id === selected.id)?.name
      : selected?.type === "yield" || selected?.type === "carry"
        ? (s.carrying.find((r) => r.resourceId === selected.id) ||
           s.yields.find((r) => r.resourceId === selected.id))?.label
        : ({ work: "这里可以做什么", walk: "去哪里" })[selected?.type];
  const actions = $("sceneActions");
  const mask = $("sceneSheetMask");
  panel.classList.toggle("has-selection", Boolean(selected));
  if (mask) {
    mask.hidden = true; // Interaction belongs inside the scene, not in a blocking bottom-sheet backdrop.
    mask.onclick = () => { selected = null; renderSettlement(state, onAction); };
  }
  const shortcuts = $("sceneShortcuts");
  if (shortcuts) {
    shortcuts.innerHTML = `<button type="button" data-quick="walk">去别的地方 <span>→</span></button>
      <button type="button" data-quick="work">劳动与休息 <span>→</span></button>`;
    shortcuts.querySelectorAll("[data-quick]").forEach(button => button.onclick = () => {
      selected = { type: button.dataset.quick, id: "" };
      renderSettlement(state, onAction);
    });
  }
  panel.querySelectorAll("[data-stage-go]").forEach(button => button.addEventListener("click", () => {
    const destination = button.dataset.stageGo;
    const choice = (s.actions || []).find(action => action.id === "settlement-locations.arrive"
      && action.payload?.placeId === destination);
    if (choice?.enabled) onAction(choice.id, choice.payload || {});
    else { selected = { type: "walk", id: "" }; renderSettlement(state, onAction); }
  }));
  panel.querySelectorAll("[data-stage-work]").forEach(button => button.addEventListener("click", () => {
    selected = { type: "work", id: "" }; renderSettlement(state, onAction);
  }));
  const mapButton = $("sceneMapButton");
  if (mapButton) mapButton.onclick = () => {
    selected = selected?.type === "walk" ? null : { type: "walk", id: "" };
    renderSettlement(state, onAction);
    revealActions();
  };
  const workButton = $("sceneWorkButton");
  if (workButton) workButton.onclick = () => {
    selected = selected?.type === "work" ? null : { type: "work", id: "" };
    renderSettlement(state, onAction);
    revealActions();
  };
  const theater = $("sceneTheater");
  if (theater) theater.onclick = event => {
    if (event.target.closest("button")) return;
    if (selected) { selected = null; renderSettlement(state, onAction); }
  };
  const candidates = selected ? commandsForTarget(s, selected) : [];
  renderInSceneMenu(s, heading, candidates, onAction);
  actions.innerHTML = `<div class="scene-focus-row">
    <button type="button" data-focus="work" aria-pressed="${selected?.type === "work"}">劳动与休息</button>
    <button type="button" data-focus="walk" aria-pressed="${selected?.type === "walk"}">移动地点</button>
    ${selected ? '<button type="button" data-focus="close">收起</button>' : ""}
    </div>
    ${selected
      ? `<section class="scene-action-group" aria-label="${esc(heading || "可执行操作")}"><h4>${esc(heading || "可执行操作")}</h4>
          ${candidates.length
            ? `<div class="scene-action-grid">${candidates.slice(0, 4).map(actionButton).join("")}</div>${candidates.length > 4
                ? `<details class="scene-extra"><summary>其他操作（${candidates.length - 4}）</summary><div class="scene-action-grid">${candidates.slice(4).map(actionButton).join("")}</div></details>` : ""}`
            : '<p class="scene-empty">当前没有可用操作，试试别的对象或地点。</p>'}
        </section>`
      : '<p class="scene-empty">先点选眼前的人、原料或物品，再决定要做什么。不会再同时摆出所有制作按钮。</p>'}`;

  const pick = (query, type, key) => panel.querySelectorAll(query).forEach((button) =>
    button.addEventListener("click", () => {
      choose(type, button.dataset[key]); renderSettlement(state, onAction);
      revealActions();
    }));
  pick("[data-person]", "person", "person");
  pick("[data-object]", "object", "object");
  pick("[data-yield]", "yield", "yield");
  pick("[data-carry]", "carry", "carry");
  actions.querySelectorAll("[data-focus]").forEach((button) => button.addEventListener("click", () => {
    selected = button.dataset.focus === "close" ? null : { type: button.dataset.focus, id: "" };
    renderSettlement(state, onAction);
  }));
  actions.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () =>
    onAction(button.dataset.action, JSON.parse(button.dataset.payload || "{}"))));
}

function revealActions() {
  const box = $("sceneQuickActions");
  if (box.hidden) return;
  box.scrollIntoView({ block: "nearest" });
  box.querySelector("strong")?.focus({ preventScroll: true });
}

export function commandsForTarget(s, target) {
  const all = s.actions || [];
  const { type, id } = target;
  const person = s.neighbours.find((p) => p.id === id);
  const item = s.objects.find((o) => o.id === id);
  const matches = (action) => {
    const a = action.id, p = action.payload || {};
    if (type === "walk") return TRAVEL.has(a);
    if (type === "person") return ((a === "settlement-locations.talk" || a === "settlement-locations.hearth.help") && p.targetId === id) ||
      (person?.name === "阿灶" && a.startsWith("settlement-locations.barter."));
    if (type === "yield") return p.resourceId === id ||
      (id === "resource:reed" && REED_WORK.has(a)) ||
      (id === "resource:fiber" && FIBER_WORK.has(a)) ||
      (id === "resource:grain" && a === "settlement-locations.cook");
    if (type === "carry") return p.resourceId === id ||
      (id === "resource:reed" && REED_WORK.has(a)) ||
      (id === "resource:fiber" && FIBER_WORK.has(a)) ||
      (id === "resource:grain" && (a === "settlement-locations.cook" || a === "settlement-locations.sow")) ||
      (id === "resource:mat" && a === "settlement-locations.rest") ||
      (p.objectId && s.objects.some((o) => o.id === p.objectId &&
        o.placement === "在手中" && o.prototypeId?.includes(id.replace("resource:", ""))));
    if (type === "object") {
      if (p.objectId === id || p.matId === id || p.containerId === id) return true;
      // A fixture reveals only already-projected legitimate local actions.
      // It never invents its own refill/cook command or material.
      const kind = objectKind(item || {});
      if (kind === "cistern" && s.placeId === "place:river")
        return a === "settlement-locations.drink" ||
          (a === "settlement-locations.draw" && p.resourceId === "resource:water");
      if (kind === "pot" && s.placeId === "place:hearth-yard")
        return a === "settlement-locations.cook" ||
          (a === "settlement-locations.eat" && p.resourceId === "resource:cooked");
      if (kind === "kiln" && s.placeId === "place:kiln")
        return a === "settlement-locations.tend" && p.spaceId === s.spaceId;
      return false;
    }
    if (type === "work") return !TRAVEL.has(a) && !REED_WORK.has(a) && !FIBER_WORK.has(a) &&
      a !== "settlement-locations.talk" &&
      !a.startsWith("settlement-locations.barter.") &&
      !Object.keys(p).some((key) => key === "objectId" || key === "containerId");
    return false;
  };
  const result = all.filter(matches);
  if (type === "object" && item && item.placement === "放着" &&
      !["cistern","hearth","kiln"].includes(objectKind(item)))
    result.unshift({ id: "world-objects.take", label: `拿起${item.name}`,
      payload: { objectId: id }, enabled: item.canTake === true,
      reason: item.canTake ? "" : "这是别人的私有物品，还未得到物主同意；不能直接取走。" });  if (type === "object" && item && item.placement === "在手中")
    result.unshift({ id: "world-objects.place", label: `放下${item.name}`, payload: { objectId: id, placeId: s.placeId }, enabled: true });
  if (type === "carry") {
    const held = s.objects.find((o) => o.placement === "在手中" && o.prototypeId?.includes(id.replace("resource:", "")));
    if (held) result.unshift({ id: "world-objects.place", label: "放在这里", enabled: true,
      payload: { objectId: held.id, placeId: s.placeId } });
  }
  return result.sort((a, b) => Number(b.enabled !== false) - Number(a.enabled !== false));
}

function actionButton(action) {
  const cost = Number(action.activityCost ?? 0);
  const time = cost ? `${cost} 格活动` : Number(action.days ?? 0) > 0 ? `${action.days} 天` : "";
  return `<button class="scene-action" data-action="${esc(action.id)}"
    data-payload="${esc(JSON.stringify(action.payload || {}))}" ${action.enabled === false ? "disabled" : ""}>
    <span class="scene-action-head">${esc(action.label)}<small>${time}</small></span>
    ${action.enabled === false ? `<span class="scene-action-reason">${esc(action.reason || "暂不可做")}</span>` :
      action.hint ? `<span class="scene-action-hint">${esc(action.hint)}</span>` : ""}
  </button>`;
}

/** One line describing what just happened, in the player's own terms. */
window.addEventListener("openlife:select-object", (event) => {
  selected = { type: "object", id: String(event.detail) };
  if (currentSceneState && currentSceneAction) renderSettlement(currentSceneState, currentSceneAction);
});
window.addEventListener("openlife:select-person", (event) => {
  selected = { type: "person", id: String(event.detail) };
  if (currentSceneState && currentSceneAction) {
    renderSettlement(currentSceneState, currentSceneAction);
    revealActions();
  }
});

export function describeSettlementResult(actionId, result) {
  if (result?.ok === false) return result.errors?.[0]?.message ?? "这件事现在做不了。";
  const labels = {
    "settlement-locations.arrive": "你走到了新的地方。",
    "world-space.move_within": "你在院子里换了个位置。",
    "world-objects.take": "你把它拿在手里。",
    "world-objects.place": "你把它放下了。",
    "world-objects.return": "你把它还了回去。",
    "settlement-locations.talk": "你和眼前的村民聊了一会，彼此开始熟悉。",
    "settlement-locations.hearth.help": "你把真实的补给交给了阿灶。这份心意和物品都留在公灶。",
    "settlement-locations.draw": "你取走了一些东西，今天还有时间可以安排别的事。",
    "settlement-locations.drink": "容器装上了水。",
    "settlement-locations.eat": "你在这里吃了一顿。",
    "settlement-locations.tend": "你在这里劳动了一段时间。",
    "settlement-locations.barter.request": "你向阿灶提出以一份粟换一捆柴；他已经按真实库存同意报价，是否接受由你决定。",
    "settlement-locations.barter.accept": "双方同意，粟粮与柴草的所有权和持有关系已经互换。",
    "settlement-locations.barter.decline": "你拒绝了这次报价，双方的实物仍在各自手里。",
    "settlement-locations.weave_bag": "两捆芦苇已编成一只真正能装东西的提袋。",
    "settlement-locations.weave_mat": "两捆芦苇已编成苇席。带回住处就能好好休息。",
    "settlement-locations.prepare_fiber": "两捆芦苇加工成两束真实的植物纤维。",
    "settlement-locations.weave_wrap": "两束纤维制成一件裹身衣，穿上能降低田间劳动消耗。",
    "world-objects.wear": "你穿上了衣物。",
    "world-objects.unwear": "你脱下了衣物，仍然保留这件物品。",
    "world-objects.store": "物品装进提袋里了，可以随身带走。",
    "world-objects.retrieve": "从提袋中取出了原来的物品。",
    "settlement-locations.rest": "你歇了一会儿。",
    "settlement-locations.end_day": "这一天过去了。",
  };
  return labels[actionId] ?? "世界发生了一点变化。";
}
