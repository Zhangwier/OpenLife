/*
 * 阶段二与阶段三的画面：今天有什么、村子在往哪走、你知道谁的心事、这一生走到哪
 * 一段、附近能去什么地方。
 *
 * 这些数据服务端一直在算（`apps/web/src/outlook.ts` 把六个投影与一份日历收成
 * 一个 `outlook`），但此前没有任何界面读它——模块、投影、测试都在，玩家看不到。
 * 这一层只做一件事：把已经算好的东西按当下这一刻的说法写出来。
 *
 * 两条不能破的线：
 *   1. 不给数字。没有百分比、没有进度数字、没有「3/6 级」。程度用「多/一半/还差
 *      几步」，与 `docs/design/DESIGN.md` 一致。
 *   2. 不替玩家知道。心事分「听说」与「确知」两档，听说的只有线索，绝不显示正文
 *      ——投影已经守住这条（`village-secrets.known` 的 heard 档没有 text），界面
 *      也不能自己拼出正文来。
 *
 * 挂在 `openlife:state` 事件上，因此 `app.js` 一行都不用改。
 */
const KIND_WORDS = {
  ailment: "病",
  misdeed: "旧事",
  feeling: "心事",
  origin: "来历",
};

/** 事件里可能夹带标签，避免 html 注入。 */
const esc = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const arr = (value) => (Array.isArray(value) ? value : []);
const rec = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : null);
const str = (value) => (typeof value === "string" ? value : "");

/**
 * 这一生走到哪一段，前面还有几段。
 *
 * 只给「第几段 / 一共几段」这种舞台提示不算违规——它不是进度数字，是「你现在是
 * 少年，后面还有壮年与老年」这一句的另一种写法。真正被禁的是把数值当目标。
 */
export function stageLine(life) {
  const now = rec(life) ? rec(life.stage) : null;
  if (!now) return "";
  const mood = str(now.mood);
  return mood ? `${str(now.name)}：${mood}` : str(now.name);
}

/** 今天与往后两个月里，日历上已经写着的事。 */
export function calendarBlock(calendar) {
  const c = rec(calendar);
  if (!c) return "";
  const lines = arr(c.lines).map(str).filter(Boolean);
  const head = `${str(c.monthName) || `${str(c.month)} 月`}里`;
  if (!lines.length) return `<p class="outlook-lead">${esc(head)}还没有定下的事。</p>`;
  return `<p class="outlook-lead">${esc(head)}：</p><ul class="outlook-list">${
    lines.map((line) => `<li>${esc(line)}</li>`).join("")
  }</ul>`;
}

/** 村子现在这一级要办成什么，今天最紧的一件事是什么。 */
export function goalBlock(goals) {
  const g = rec(goals);
  if (!g) return "";
  const stageName = str(g.stageName);
  const today = arr(g.today).map((t) => rec(t)).filter(Boolean).slice(0, 2);
  const season = rec(g.season);
  const items = season ? arr(season.items).map((i) => rec(i)).filter(Boolean) : [];
  const done = items.filter((i) => i.done === true).length;
  const parts = [];
  if (stageName) parts.push(`<p class="outlook-lead">村子眼下在「${esc(stageName)}」这一级${str(g.nextName) && str(g.nextName) !== stageName ? `，再往前是「${esc(str(g.nextName))}」` : ""}。</p>`);
  if (today.length) {
    parts.push(`<ul class="outlook-list">${today.map((t) => `<li>${esc(str(t.text))}</li>`).join("")}</ul>`);
  }
  if (items.length) {
    // 「还差三件」「差不多办齐了」——说件数，不说比例。
    const left = items.length - done;
    const tail = left === 0 ? "这一季要办的事都办齐了。" : left === 1 ? "这一季还差一件没办。" : `这一季还差${left}件没办：`;
    const pending = items.filter((i) => i.done !== true).slice(0, 3).map((i) => `<li>${esc(str(i.text))}</li>`).join("");
    parts.push(`<p class="outlook-lead">${esc(tail)}</p>${pending ? `<ul class="outlook-list">${pending}</ul>` : ""}`);
  }
  return parts.join("");
}

/** 村里的气氛：叙事者现在把日子拨到哪一档。 */
export function moodBlock(director) {
  const d = rec(director);
  if (!d) return "";
  const line = str(d.line);
  const label = str(d.modeLabel);
  if (!line) return "";
  return `<p class="outlook-note">${esc(line)}${label ? `<span class="outlook-tag">${esc(label)}</span>` : ""}</p>`;
}

/**
 * 你知道的心事，以及只听说过的。
 *
 * 「听说」一档只显示线索，不显示正文——这不是界面克制，是这个模块的红线：投影
 * 里 heard 档本来就没有 text，界面若自己拼出来就等于替玩家知道了。
 */
export function secretBlock(secrets) {
  const s = rec(secrets);
  if (!s) return "";
  const known = arr(s.known).map((k) => rec(k)).filter(Boolean);
  const heard = arr(s.heard).map((k) => rec(k)).filter(Boolean);
  if (!known.length && !heard.length) {
    return `<p class="outlook-lead">这会儿还没有谁把心里的事说给你听。</p>`;
  }
  const rows = [];
  for (const k of known) {
    const kind = KIND_WORDS[str(k.kind)] ?? "心事";
    rows.push(`<li class="outlook-secret is-known"><b>${esc(str(k.ownerName))}</b><span class="outlook-tag">${esc(kind)}</span><p>${esc(str(k.text))}</p></li>`);
  }
  for (const k of heard) {
    const kind = KIND_WORDS[str(k.kind)] ?? "心事";
    rows.push(`<li class="outlook-secret is-heard"><b>${esc(str(k.ownerName))}</b><span class="outlook-tag">${esc(kind)}</span><p>${esc(str(k.line))}</p></li>`);
  }
  const tail = heard.length ? `<p class="outlook-lead">听说来的还不作数，得再对上一条才敢信。</p>` : "";
  return `<ul class="outlook-secrets">${rows.join("")}</ul>${tail}`;
}

/** 心里放不下的那件事，与今天的心情。 */
export function wantBlock(wants) {
  const w = rec(wants);
  if (!w) return "";
  const fear = rec(w.fear);
  if (!fear) return "";
  return `<p class="outlook-fear"><b>${esc(str(fear.name))}</b>${esc(str(fear.text))}</p>`;
}

/** 附近能去的地方；已经在路上时说路，并且给下一步的按钮。 */
export function travelBlock(travel) {
  const t = rec(travel);
  if (!t) return "";
  if (t.travelling === true) {
    const here = str(t.toName) || "那儿";
    const steps = t.arrived === true
      ? `<button class="outlook-go" data-travel="travel.arrive">在${esc(here)}落脚</button>`
      : `<button class="outlook-go" data-travel="travel.day">再走一天</button>`;
    return `<p class="outlook-lead">${esc(str(t.line))}</p>
      <div class="outlook-actions">${steps}<button class="outlook-go is-quiet" data-travel="travel.return">往回走</button></div>`;
  }
  const list = arr(t.destinations).map((d) => rec(d)).filter(Boolean);
  if (!list.length) return `<p class="outlook-lead">${esc(str(t.line))}</p>`;
  return `<p class="outlook-lead">从这里可以往这些地方走：</p><ul class="outlook-list outlook-gos">${
    list.slice(0, 6).map((d) => `<li><span>${esc(str(d.name))}</span>${
      d.id ? `<button class="outlook-go" data-travel="travel.depart" data-to="${esc(str(d.id))}">出门</button>` : ""
    }</li>`).join("")
  }</ul>`;
}

/** 「此刻」页顶部那块：今天有什么、村子在追什么、气氛如何。 */
export function renderOutlookToday(outlook) {
  const o = rec(outlook);
  if (!o) return "";
  const blocks = [
    calendarBlock(o.calendar),
    goalBlock(o.goals),
    moodBlock(o.director),
  ].filter(Boolean);
  if (!blocks.length) return "";
  return `<section class="outlook panel" data-outlook="today">
    <div class="panel-title-row"><h2>今天</h2></div>
    ${blocks.join("")}
  </section>`;
}

/** 「人生」页那块：这一生、心事、怕的事、能去的地方。 */
export function renderOutlookLife(outlook) {
  const o = rec(outlook);
  if (!o) return "";
  const lifeBlock = stageLine(o.life);
  const blocks = [
    lifeBlock ? `<p class="outlook-lead">${esc(lifeBlock)}</p>` : "",
    wantBlock(o.wants),
    secretBlock(o.secrets),
    travelBlock(o.travel),
  ].filter(Boolean);
  if (!blocks.length) return "";
  return `<section class="outlook panel" data-outlook="life">
    <div class="panel-title-row"><h2>心事与去处</h2></div>
    ${blocks.join("")}
  </section>`;
}

/** 摘掉上一轮画的那块，再画新的。`insertAdjacentHTML` 不会替换，会叠。 */
function swap(host, html, slot) {
  if (!host) return;
  host.querySelectorAll(`:scope > [data-outlook="${slot}"]`).forEach((node) => node.remove());
  if (html) host.insertAdjacentHTML("afterbegin", html);
}

export function paintOutlook(state) {
  const outlook = rec(state?.outlook);
  const today = document.getElementById("screen-activities");
  const life = document.getElementById("screen-character");
  if (!outlook) { swap(today, "", "today"); swap(life, "", "life"); return; }
  swap(today, renderOutlookToday(outlook), "today");
  swap(life, renderOutlookLife(outlook), "life");
}

/**
 * 「出门 / 再走一天 / 往回走」走 `openlife:action` 事件，不自己去 POST。
 *
 * `app.js` 里那条通道会带上 expectedTick 一类校验、成功后刷新状态、写记录、放
 * 动画；自己再组一份请求就绕过了这些，界面与状态会各走各的。
 */
function sendAction(action, payload = {}) {
  window.dispatchEvent(new CustomEvent("openlife:action", { detail: { action, payload } }));
}

function installTravelButtons() {
  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-travel]") : null;
    if (!button) return;
    const action = button.getAttribute("data-travel") || "";
    const to = button.getAttribute("data-to") || "";
    if (!action) return;
    sendAction(action, to ? { to } : {});
  });
}

function installStyle() {
  if (document.querySelector('link[href="/outlook-ux.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/outlook-ux.css";
  document.head.append(link);
}

export function installOutlook() {
  installStyle();
  installTravelButtons();
  window.addEventListener("openlife:state", (event) => paintOutlook(event.detail));
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installOutlook, { once: true });
  else installOutlook();
}
