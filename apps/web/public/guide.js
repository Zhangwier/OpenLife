/**
 * 今日指引: one card at the top of 生活 (此刻). It shows the one thing that
 * matters most now, at most three suggestions, the next step for anything the
 * player tried and could not do, and what tomorrow holds. Every button sends an
 * action the server already reports as valid; the server re-validates it.
 */
let onAction = () => {};
let installed = false;
let showBlocked = false;
const html = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const enc = (v) => html(JSON.stringify(v ?? {}));

function act(a) {
  return a ? `<button class="guide-go" data-guide-action="${html(a.type)}" data-guide-payload="${enc(a.payload)}">${html(a.label)}</button>` : "";
}
function item(s, lead) {
  return `<li class="guide-item${lead ? " is-focus" : ""}" data-kind="${html(s.kind)}"><div><strong>${html(s.title)}</strong><p>${html(s.why)}</p></div>${s.options?.length > 1 ? `<div class="guide-options">${s.options.map((o) => o.action ? act(o.action) : `<small title="${html(o.reason)}">${html(o.label)}：${html(o.reason)}</small>`).join("")}</div>` : act(s.action)}</li>`;
}

export function renderGuide(state, perform) {
  onAction = perform;
  const screen = document.getElementById("screen-activities");
  if (!screen) return;
  let card = document.getElementById("dailyGuide");
  if (!card) {
    card = document.createElement("section");
    card.id = "dailyGuide";
    card.className = "panel daily-guide";
    card.setAttribute("aria-label", "今日指引");
    screen.prepend(card);
  }
  if (!installed) {
    installed = true;
    card.addEventListener("click", (event) => {
      const toggle = event.target.closest("[data-guide-toggle]");
      if (toggle) { showBlocked = !showBlocked; renderGuide(state, onAction); return; }
      const b = event.target.closest("[data-guide-action]");
      if (!b) return;
      let payload = {};
      try { payload = JSON.parse(b.dataset.guidePayload || "{}"); } catch { payload = {}; }
      onAction(b.dataset.guideAction, payload);
    });
  }
  const g = state?.guide;
  card.hidden = !g;
  if (!g) return;
  const items = [g.focus && item(g.focus, true), ...g.suggestions.map((s) => item(s, false))].filter(Boolean).join("");
  const blocked = g.blocked.length ? `<button class="guide-toggle" data-guide-toggle aria-expanded="${showBlocked}">${showBlocked ? "收起" : `${g.blocked.length} 件事暂时做不成，看看怎么办`}</button>
    ${showBlocked ? `<ul class="guide-blocked">${g.blocked.map((b) => `<li><span>${html(b.label)}</span><small>${html(b.reason)} → ${html(b.next)}</small>${act(b.action)}</li>`).join("")}</ul>` : ""}` : "";
  const tomorrow = g.tomorrow.length ? `<p class="guide-tomorrow"><b>明天</b>${g.tomorrow.map(html).join(" ")}</p>` : "";
  card.innerHTML = `<header><span class="eyebrow">今日指引</span><small>${g.day.month} 月 ${g.day.day} 日 · ${html(g.weather)}</small></header>
    ${items ? `<ol class="guide-list">${items}</ol>` : "<p>今天没什么急事，随心过一天吧。</p>"}${g.more ? `<small class="guide-more">还有 ${g.more} 件可做的事，在「故事」里。</small>` : ""}${blocked}${tomorrow}`;
}
