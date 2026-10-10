const $ = id => document.getElementById(id);
export function html(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c])); }
export function renderActionButtons(container, actions, onAction) {
  container.innerHTML = actions.map((a, i) => `<button class="action-button ${html(a.tone ?? "warm")}" data-choice-index="${i}" ${a.enabled === false ? "disabled" : ""}>
    <span class="action-heading">${html(a.label)}${a.cost ? `<small>${a.cost} 个月</small>` : ""}</span>
    ${a.hint ? `<span class="action-hint">${html(a.hint)}</span>` : ""}
    ${a.enabled === false && a.reason ? `<span class="action-reason">${html(a.reason)}</span>` : ""}
  </button>`).join("");
  container.querySelectorAll("[data-choice-index]").forEach(button => button.addEventListener("click", () => onAction(actions[Number(button.dataset.choiceIndex)], button)));
}

const STAGES = ["assess-clay", "forming", "drying", "firing"];
const STAGE_NAMES = ["辨泥与准备", "决定器形", "等待干燥", "掌握火候"];
export function renderPlayer(s, onAction) {
  const p = s.player;
  document.body.classList.toggle("has-practice", Boolean(p?.practice));
  if (!p?.entered && !p?.practice) {
    $("playerSituation").innerHTML = ""; $("playerOutcome").hidden = true;
    $("workshopInventory").innerHTML = ""; $("familyHandoff").innerHTML = "";
    $("workshopWorks").textContent = "进入聚落手艺生活后，可以在这里查看亲手做出的作品。";
    return;
  }
  const c = s.character;
  const stage = STAGES.indexOf(p.practice?.stage);
  const prompt = p.practice?.interaction?.context?.prompt;
  const undecided = p.vessels.filter(v => v.status === "fired" && !v.disposition);
  const heading = !c.alive ? "把故事留给后来的人" : p.practice ? STAGE_NAMES[Math.max(0, stage)] : undecided.length ? "陶器出窑了，你想让它去哪里？" : Number(p.lessons) === 0 ? "第一段手艺，从认识泥土开始" : "在手艺与日常之间，安排自己的生活";
  $("stageTitle").textContent = heading;
  $("sceneText").textContent = p.practice ? "泥土、等待与火，慢慢变成你手中的一件东西。" : Number(p.lessons) === 0 ? "陶叔在窑边招呼你：先看懂泥，再想好要做什么。" : "手艺会留下痕迹。你也可以把时间留给身边的人。";
  $("playerSituation").innerHTML = `<div class="chapter-label">聚落手艺 · ${p.practice ? "正在制作" : "自由安排"}</div><p>${html(prompt || (!c.alive ? "你的作品与家人仍留在世界里。选择一位成年家人，继续这段故事。" : undecided.length ? "交换能补充材料，赠送能加深关系，留存能成为家族的起点。每件作品只能选择一个去处。" : Number(p.lessons) === 0 ? "你有一份黏土和四捆柴火。向师傅学一段手艺，就能开始第一件陶器；也可以先去认识邻居。" : "继续练习、准备材料、制作作品，或到下面的「聚落里的人」里安排相处。"))}</p>
    ${p.practice ? `<ol class="craft-steps">${STAGE_NAMES.map((name, i) => `<li class="${i === stage ? "current" : i < stage ? "done" : ""}"><span>${i < stage ? "✓" : i + 1}</span>${name}</li>`).join("")}</ol>` : ""}`;
  $("playerOutcome").hidden = !p.outcome;
  $("playerOutcome").innerHTML = `<span>最近发生的事</span><p>${html(p.outcome)}</p>`;
  $("workshopInventory").innerHTML = `<div class="eyebrow">手中的材料</div><div class="stock-row"><span>黏土 <b>${Number(p.inventory.clay)}</b></span><span>燃料 <b>${Number(p.inventory.fuel)}</b></span></div><div class="skill-meter"><span>手艺经验</span><b>${Number(p.skill)} 段</b></div><p>${Number(p.completed)} 次出窑 · ${(p.familyWorks ?? []).length} 件家族作品</p>`;
  $("decisionHint").textContent = p.practice ? "这一阶段会占用一至两个月的生活时间。风险提示是取舍，结果仍受泥料与火候影响。" : "先做你现在关心的事。日常、手艺与相处都会占用生活时间。";
  $("occupationWord").textContent = Number(p.completed) >= 3 ? "逐渐熟练的制陶人" : "聚落里的制陶学徒";
  $("educationWord").textContent = `已完成 ${Number(p.lessons)} 段手艺学习`;
  renderPeople(p, c, s.settlement);
  renderWorks(p, c, onAction);
  renderHandoff(p, c, onAction);
}

function renderPeople(p, c, settlement) {
  const container = $("relationshipOrbit");
  container.classList.add("people-list");
  const contacts = settlement?.contacts ?? [];
  const nearby = (settlement?.neighbours ?? [])
    .filter(person => !contacts.some(known => known.id === person.id))
    .map(person => ({ ...person, nearby: true, contact: "陌生", conversations: 0 }));
  const list = [...contacts, ...nearby];
  container.innerHTML = list.map(person => `<article class="person-card">
    <div class="person-heading"><div class="person-avatar">${html(person.name.slice(0, 1))}</div>
    <div><h4>${html(person.name)}</h4><span>${html(person.role)} · ${html(person.contact || "陌生")}</span></div></div>
    <p class="person-trait">${person.conversations > 0 ? `当面聊过 ${person.conversations} 次` : "只是眼前的陌生人，还没有互相认识。"}</p>
    <p>${person.nearby ? "这位村民在附近。去周围选中对方，才能当面搭话。" : "这位熟人现在不在身边，不能远程搭话。"}</p>
    ${person.nearby ? '<button class="portable-item" data-route="activities">去周围搭话 →</button>' : ""}
  </article>`).join("") ||
    '<p class="empty-copy">目前还没有遇见的人。去「周围」当面交谈，才会逐渐认识村民。</p>';
}

function renderWorks(p, c, onAction) {
  const container = $("workshopWorks");
  container.innerHTML = [...p.vessels].reverse().map(v => `<article class="vessel-card ${v.status === "failed" ? "failed" : ""}">
    <div class="vessel-icon" aria-hidden="true"><div></div></div><div class="vessel-copy"><h4>${v.status === "failed" ? "一次未成的作品" : `${html(v.quality)}陶器`}</h4><p>${v.defects?.length ? html(v.defects.join("、")) : "这一次，泥料与火候配合得很好。"}</p><small>用去 ${Number(v.fuelUsed)} 捆燃料 · 制作过程留在世界里</small>
    <div class="vessel-choices" data-vessel="${html(v.id)}"></div></div>
  </article>`).join("") || '<p class="empty-copy">第一件作品还没出窑。学一段手艺，然后从辨泥开始。</p>';
  container.querySelectorAll("[data-vessel]").forEach(el => {
    const v = p.vessels.find(x => x.id === el.dataset.vessel);
    if (v.disposition) { el.innerHTML = `<p class="work-destination">${html({ exchange: "已交换成下一次制作的材料", gift: "已赠给聚落里的熟人", keep: "留给家族，等待后来的人" }[v.disposition.mode])}</p>`; return; }
    if (v.status === "failed") { el.innerHTML = '<p class="work-destination">可以补充材料，调整制作路线后再试。</p>'; return; }
    const enabled = c.alive && !p.practice;
    const actions = [
      { id: "life-dispose", label: "交换补给", hint: "+1 黏土、+3 燃料", cost: 1, enabled, payload: { vesselId: v.id, mode: "exchange" }, tone: "soft" },
      { id: "life-dispose", label: "留给家族", hint: "成为家族传承的一部分", cost: 1, enabled, payload: { vesselId: v.id, mode: "keep" }, tone: "gold" },
      ...p.people.filter(x => x.relation !== "孩子").map(person => ({ id: "life-dispose", label: `赠给${person.name}`, hint: "熟悉 +2", cost: 1, enabled, payload: { vesselId: v.id, mode: "gift", targetId: person.id }, tone: "rose" })),
    ];
    renderActionButtons(el, actions, onAction);
  });
}

function renderHandoff(p, c, onAction) {
  const container = $("familyHandoff");
  const inherited = p.inheritedFrom ? `<p class="inheritance-note">这一代带着 ${(p.familyWorks ?? []).length} 件家族作品开始。前人的经验成为你的起点。</p>` : "";
  const works = (p.familyWorkDetails ?? []).map(work => `<div class="family-node"><strong>${html(work.quality)}陶器</strong><span>${html(work.maker)}亲手留下的作品</span></div>`).join("");
  container.innerHTML = `${inherited}${works ? `<div class="family-tree">${works}</div>` : ""}<p class="empty-copy">你可以在仍然在世时交棒。成年家人会继承留下的作品与一段入门手艺，世界时间继续前行。</p><div id="handoffChoices"></div>`;
  renderActionButtons($("handoffChoices"), p.children.map(child => ({ id: "life-handoff", label: `接过${child.name}的人生 · ${child.age} 岁`, hint: "家族作品留下，下一代可以作出不同的选择", enabled: child.alive && child.age >= 18 && !p.practice, reason: !child.alive ? "这位家人已经离世" : p.practice ? "先完成手中的作品" : "孩子成年后可以接棒", payload: { targetId: child.id }, tone: "gold" })), onAction);
}

export function installViews() {
  document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => {
    selectView(button.dataset.view);
  }));
}
export function installModalAccess() {
  let returnFocus = null;
  document.addEventListener("focusin", event => {
    if (!event.target.closest(".modal-backdrop")) returnFocus = event.target;
  });
  const update = () => {
    const visible = [...document.querySelectorAll(".modal-backdrop")].find(modal => !modal.hidden);
    document.querySelector("main").inert = Boolean(visible);
    if (visible && !visible.contains(document.activeElement)) visible.querySelector("input,button,select")?.focus();
    if (!visible && returnFocus?.isConnected) returnFocus.focus();
  };
  document.querySelectorAll(".modal-backdrop").forEach(modal => {
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    const heading = modal.querySelector("h2");
    heading.id = `${modal.id}Title`;
    modal.setAttribute("aria-labelledby", heading.id);
    new MutationObserver(update).observe(modal, { attributes: true, attributeFilter: ["hidden"] });
  });
  document.addEventListener("keydown", event => {
    const modal = [...document.querySelectorAll(".modal-backdrop")].find(element => !element.hidden);
    if (!modal) return;
    if (event.key === "Escape") { modal.hidden = true; return; }
    if (event.key !== "Tab") return;
    const focusable = [...modal.querySelectorAll("button:not(:disabled),input,select,[tabindex='0']")];
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
}
export function selectView(view) {
  window.dispatchEvent(new CustomEvent("openlife:navigate", { detail: view }));
  document.querySelectorAll("[data-view]").forEach(button => { const active = button.dataset.view === view; button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active)); });
  document.querySelectorAll("[data-view-panel]").forEach(panel => panel.hidden = panel.dataset.viewPanel !== view);
}
