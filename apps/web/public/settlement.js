/**
 * A small-screen-first settlement scene. Select the person/material/object
 * first; only that target's meaningful commands are offered. This is a UI
 * projection over the same authoritative actions, never a parallel inventory.
 */
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

export function renderSettlement(state, onAction) {
  currentSceneState = state;
  currentSceneAction = onAction;
  const panel = $("settlementScene");
  if (!panel) return;
  const s = state.settlement;
  if (!s || !s.exists) { panel.hidden = true; selected = null; return; }
  panel.hidden = false;
  if (selectionPlace !== s.placeId) { selected = null; selectionPlace = s.placeId; }
  $("scenePlace").textContent = s.placeName || "聚落";
  $("sceneSpace").textContent = s.spaceName || "院子";
  $("sceneDay").textContent = `第 ${s.day} 天 · ${s.season}`;
  const status = [
    `饥饿 ${s.hunger ?? 0}/10`,
    `今日活动 ${s.dailyActivity?.remaining ?? 0}/${s.dailyActivity?.capacity ?? 8} 格`,
    s.portableLoad ? `随身 ${s.portableLoad.looseSlots}/${s.portableLoad.maxSlots} 件 · ${s.portableLoad.mass.toFixed(1)}/${s.portableLoad.maxMass} 负重` : "",
    s.outfit ? `已穿：${s.outfit.name}` : "",
    s.barter?.status === "offered" && s.barter.offeredAt === state.tick ? "阿灶正在等待你回复报价" : "",
  ];
  $("sceneSummary").textContent = status.filter(Boolean).join("  ·  ");

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
    mask.hidden = !selected;
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
  const candidates = selected ? commandsForTarget(s, selected) : [];
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

function commandsForTarget(s, target) {
  const all = s.actions || [];
  const { type, id } = target;
  const person = s.neighbours.find((p) => p.id === id);
  const item = s.objects.find((o) => o.id === id);
  const matches = (action) => {
    const a = action.id, p = action.payload || {};
    if (type === "walk") return TRAVEL.has(a);
    if (type === "person") return (a === "settlement-locations.talk" && p.targetId === id) ||
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
    if (type === "object") return p.objectId === id || p.matId === id || p.containerId === id;
    if (type === "work") return !TRAVEL.has(a) && !REED_WORK.has(a) && !FIBER_WORK.has(a) &&
      a !== "settlement-locations.talk" &&
      !a.startsWith("settlement-locations.barter.") &&
      !Object.keys(p).some((key) => key === "objectId" || key === "containerId");
    return false;
  };
  const result = all.filter(matches);
  if (type === "object" && item && item.placement === "放着")
    result.unshift({ id: "world-objects.take", label: `拾起${item.name}`, payload: { objectId: id }, enabled: true });
  if (type === "object" && item && item.placement === "在手中")
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

export function describeSettlementResult(actionId, result) {
  if (result?.ok === false) return result.errors?.[0]?.message ?? "这件事现在做不了。";
  const labels = {
    "settlement-locations.arrive": "你走到了新的地方。",
    "world-space.move_within": "你在院子里换了个位置。",
    "world-objects.take": "你把它拿在手里。",
    "world-objects.place": "你把它放下了。",
    "world-objects.return": "你把它还了回去。",
    "settlement-locations.talk": "你和眼前的村民聊了一会，彼此开始熟悉。",
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
