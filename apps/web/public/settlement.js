/**
 * Settlement scene rendering (M1).
 *
 * The M1 screen is deliberately "scene - target - action" in that order
 * (UI-003): where you are, who and what is here, then what you can do. Nothing
 * is hidden behind a debug view, and every unavailable action explains itself
 * in the same words the rule engine used.
 */

const $ = (id) => document.getElementById(id);

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]);
}

export function renderSettlement(state, onAction) {
  const panel = $("settlementScene");
  if (!panel) return;
  const settlement = state.settlement;
  if (!settlement || !settlement.exists) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;

  $("scenePlace").textContent = settlement.placeName || "开阔处";
  $("sceneSpace").textContent = settlement.spaceName || "院子里";
  $("sceneDay").textContent = `第 ${settlement.day} 天 · ${settlement.season}`;
  $("sceneSummary").textContent = [settlement.note || "", `饥饿 ${settlement.hunger ?? 0}/10（0 为饱足）`, settlement.dailyActivity ? `今日活动 ${settlement.dailyActivity.used}/${settlement.dailyActivity.capacity} 格；结束今天后恢复` : "", settlement.crop?.summary].filter(Boolean).join(" · ");

  // People present.
  const neighbours = $("sceneNeighbours");
  neighbours.innerHTML = settlement.neighbours.length
    ? settlement.neighbours.map((person) => `<article class="scene-person">
        <div class="scene-person-head">
          <span class="scene-avatar">${esc(person.name.slice(0, 1))}</span>
          <div><strong>${esc(person.name)}</strong><span>${esc(person.role)} · ${esc(person.household)}</span></div>
        </div>
        <small>${person.atWork ? "正在这里做自己的事" : "暂时在这里"}</small>
      </article>`).join("")
    : '<p class="scene-empty">这里暂时只有你自己。村里人在别处忙各自的事。</p>';

  // Reachable objects.
  const objects = $("sceneObjects");
  objects.innerHTML = settlement.objects.length
    ? settlement.objects.map((object) => `<button class="scene-object" data-object="${esc(object.id)}" data-prototype="${esc(object.prototypeId)}">
        <span class="scene-object-name">${esc(object.name)}</span>
        <small>${esc(object.placement)}${object.quantity ? ` · ${object.quantity}` : ""}</small>
      </button>`).join("")
    : '<p class="scene-empty">这里没有可以动手的东西。</p>';

  // Renewing resources of this place.
  const yields = $("sceneYields");
  yields.innerHTML = settlement.yields.length
    ? settlement.yields.map((row) => `<div class="scene-yield">
        <span>${esc(row.label)}</span>
        <b>${row.stock} / ${row.capacity} ${esc(row.unit)}</b>
      </div>`).join("")
    : '<p class="scene-empty">这个地方没有会自己恢复的资源。</p>';

  // What the player is carrying.
  const carried = $("sceneCarried");
  carried.innerHTML = settlement.carrying.length
    ? settlement.carrying.map((row) => `<span class="carry-chip">${esc(row.label)} <b>${row.count}</b> ${esc(row.unit)}</span>`).join("")
    : '<span class="scene-empty">手里没有拿着东西。</span>';

  // Outstanding borrows, so a promise does not quietly disappear (NPC-004).
  const loans = $("sceneLoans");
  if (loans) {
    loans.innerHTML = settlement.loans?.length
      ? settlement.loans.map((loan) => `<button class="scene-loan ${loan.overdue ? "overdue" : ""}" data-return="${esc(loan.objectId)}">
          <span>借来的${esc(loan.name)}</span>
          <small>${loan.overdue ? `已经逾期 ${Math.abs(loan.dueAt - (loan.dueAt + loan.daysLeft))} 天未还` : `${loan.daysLeft} 天内归还`}</small>
        </button>`).join("")
      : '<span class="scene-empty">你没有借来的东西。</span>';
    loans.querySelectorAll("[data-return]").forEach((button) => {
      button.addEventListener("click", () => onAction("world-objects.return", { objectId: button.dataset.return }));
    });
  }

  // Actions, grouped so the common ones stay at hand (UI-003).
  const actions = $("sceneActions");
  const walk = settlement.actions.filter((action) => action.id === "settlement-locations.arrive");
  const room = settlement.actions.filter((action) => action.id === "world-space.move_within");
  const work = settlement.actions.filter((action) => !walk.includes(action) && !room.includes(action));

  actions.innerHTML = [
    group("在这里", work),
    group("走进院子里的别处", room),
    group("走到别的地方", walk),
  ].filter(Boolean).join("");

  actions.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => onAction(button.dataset.action, JSON.parse(button.dataset.payload || "{}")));
  });

  // Objects the player can act on: take, or pick a jar to fill at the river.
  objects.querySelectorAll("[data-object]").forEach((button) => {
    button.addEventListener("click", () => onAction("world-objects.take", { objectId: button.dataset.object }));
  });
}

function group(title, actions) {
  if (!actions.length) return "";
  return `<section class="scene-action-group">
    <h4>${esc(title)}</h4>
    <div class="scene-action-grid">${actions.map(actionButton).join("")}</div>
  </section>`;
}

function actionButton(action) {
  const days = Number(action.days ?? 0);
  const activityCost = Number(action.activityCost ?? 0);
  const cost = activityCost > 0 ? `<small>${activityCost} 格活动</small>` : days > 0 ? `<small>${days} 天</small>` : "<small>当场</small>";
  return `<button class="scene-action" data-action="${esc(action.id)}" data-payload="${esc(JSON.stringify(action.payload ?? {}))}" ${action.enabled === false ? "disabled" : ""}>
    <span class="scene-action-head">${esc(action.label)}${cost}</span>
    ${action.hint ? `<span class="scene-action-hint">${esc(action.hint)}</span>` : ""}
    ${action.enabled === false && action.reason ? `<span class="scene-action-reason">${esc(action.reason)}</span>` : ""}
  </button>`;
}

/** One line describing what just happened, in the player's own terms. */
export function describeSettlementResult(actionId, result) {
  if (result?.ok === false) return result.errors?.[0]?.message ?? "这件事现在做不了。";
  const labels = {
    "settlement-locations.arrive": "你走到了新的地方。",
    "world-space.move_within": "你在院子里换了个位置。",
    "world-objects.take": "你把它拿在手里。",
    "world-objects.place": "你把它放下了。",
    "world-objects.return": "你把它还了回去。",
    "settlement-locations.draw": "你取走了一些东西，今天还有时间可以安排别的事。",
    "settlement-locations.drink": "容器装上了水。",
    "settlement-locations.eat": "你在这里吃了一顿。",
    "settlement-locations.tend": "你在这里劳动了一段时间。",
    "settlement-locations.rest": "你歇了一会儿。",
    "settlement-locations.end_day": "这一天过去了。",
  };
  return labels[actionId] ?? "世界发生了一点变化。";
}
