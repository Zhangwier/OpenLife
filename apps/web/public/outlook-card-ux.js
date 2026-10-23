/*
 * 「今天」卡（此刻页）与「心事与去处」卡（人生页）的重画。
 *
 * outlook-ux.js 把服务端算好的 outlook 写成了两块字符串，能用但粗：
 *   - goalBlock 读 `goals.today` / `goals.season`，而服务端的数据在
 *     `goals.goals.today` / `goals.goals.season`，所以「今天最要紧的事」和「这一季
 *     要办的事」从来没有出现过；
 *   - 日历行是一整句「二月二（还有三十一天） · 社日」；气氛标签挂在句尾，还和句末
 *     括号说了两遍；
 *   - 去处只有一个孤零零的「出门」，不说要走几天，点下去也没有反应。
 *
 * 这里不改 outlook-ux.js：在它画完之后（同一个 openlife:state 事件里，同步）把
 * 同名的 section 换成新写的，所以不会闪。两条老规矩照旧：整段文字里不出现阿拉伯
 * 数字（服务端句子里的数字改写成汉字），听说的心事只给线索——secretBlock 直接
 * 复用 outlook-ux.js 的，不自己拼正文。
 */
import { secretBlock, travelBlock, wantBlock } from "./outlook-ux.js";

const esc = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");
const arr = (value) => (Array.isArray(value) ? value : []);
const rec = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : null);
const str = (value) => (typeof value === "string" ? value : "");

const DIGITS = "零一二三四五六七八九";
/** 0–9999 的汉字写法：1→一，10→十，23→二十三，105→一百零五。 */
export function cn(n) {
  n = Math.trunc(Number(n));
  if (!Number.isFinite(n) || n < 0) return String(n);
  if (n < 10) return DIGITS[n];
  if (n < 20) return `十${n % 10 ? DIGITS[n % 10] : ""}`;
  if (n < 100) return `${DIGITS[Math.floor(n / 10)]}十${n % 10 ? DIGITS[n % 10] : ""}`;
  if (n < 1000) {
    const rest = n % 100;
    const mid = rest === 0 ? "" : rest < 10 ? `零${DIGITS[rest]}` : cn(rest);
    return `${DIGITS[Math.floor(n / 100)]}百${mid}`;
  }
  if (n < 10000) {
    const rest = n % 1000;
    const mid = rest === 0 ? "" : rest < 100 ? `零${cn(rest)}` : cn(rest);
    return `${DIGITS[Math.floor(n / 1000)]}千${mid}`;
  }
  return String(n);
}

/** 服务端句子里夹的数字写成汉字，顺手吃掉数字两侧的空格：「只够 1 天」→「只够一天」。 */
export function words(text) {
  return str(text).replace(/\s*(\d+)\s*/g, (_, d) => cn(Number(d)));
}

/** 「二月二（还有三十一天）」→ 日期与旁注。 */
export function splitWhen(when) {
  const m = /^(.+?)[（(](.+?)[）)]$/.exec(str(when).trim());
  return m ? { date: m[1].trim(), note: m[2].trim() } : { date: str(when).trim(), note: "" };
}

/** 「日期 · 事」→ 两列；没有「 · 」的整句当作事。 */
export function calendarRows(lines) {
  return arr(lines).map(str).filter(Boolean).map((line) => {
    const at = line.indexOf(" · ");
    if (at < 0) return { date: "", note: "", what: words(line) };
    const { date, note } = splitWhen(line.slice(0, at));
    return { date, note, what: words(line.slice(at + 3)) };
  });
}

/** 服务端把「差几步」写成了「0/1 个冬天」这类比例句：界面不说数字，整句不要。 */
const hasRatio = (text) => /\d+\s*\/\s*\d+/.test(str(text));

/** goals 的真实数据在 goals.goals 里；老结构（直接挂在 goals 上）也认。 */
export function goalData(goals) {
  const g = rec(goals);
  if (!g) return { stageName: "", ladder: [], now: -1, today: [], season: [], nextName: "" };
  const inner = rec(g.goals) ?? g;
  const ladder = arr(g.ladders).map((l) => rec(l)).filter(Boolean).map((l) => str(l.name)).filter(Boolean);
  const stageName = str(g.stageName);
  let now = ladder.indexOf(stageName);
  if (now < 0 && Number.isFinite(g.stage)) now = Math.min(ladder.length - 1, Math.max(0, Number(g.stage) - 1));
  const today = arr(inner.today).map((t) => rec(t)).filter(Boolean)
    .filter((t) => str(t.text) && !hasRatio(t.text)).slice(0, 2).map((t) => words(str(t.text)));
  const season = rec(inner.season);
  const items = season ? arr(season.items).map((i) => rec(i)).filter(Boolean) : [];
  return {
    stageName, ladder, now, today,
    season: items.filter((i) => str(i.text)).map((i) => ({ text: words(str(i.text)), done: i.done === true })),
    nextName: str(g.nextName),
  };
}

/** 阶梯：走过的、眼下的、往后的。不写第几级，也不写几分之几。 */
export function ladderHtml(names, now, label) {
  if (!names.length || now < 0) return "";
  const items = names.map((name, i) => {
    const cls = i < now ? "is-past" : i === now ? "is-now" : "is-next";
    return `<li class="${cls}"${i === now ? ' aria-current="step"' : ""}>${esc(name)}</li>`;
  }).join("");
  return `<ol class="ox-ladder" aria-label="${esc(label)}">${items}</ol>`;
}

function calendarHtml(calendar) {
  const c = rec(calendar);
  if (!c) return "";
  const rows = calendarRows(c.lines);
  const head = `${str(c.monthName) || `${cn(Number(c.month) || 1)}月`}里`;
  if (!rows.length) return `<div class="ox-col"><h3 class="ox-sub">日历</h3><p class="ox-empty">${esc(head)}还没有定下的事。</p></div>`;
  return `<div class="ox-col"><h3 class="ox-sub">日历 · ${esc(head)}</h3><ul class="ox-cal">${rows.map((r) => `<li>
      <span class="ox-when"><b>${esc(r.date || "—")}</b>${r.note ? `<small>${esc(r.note)}</small>` : ""}</span>
      <span class="ox-what">${esc(r.what)}</span></li>`).join("")}</ul></div>`;
}

function todoHtml(g) {
  const parts = [];
  if (g.today.length) parts.push(`<ul class="ox-todo">${g.today.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`);
  if (g.season.length) {
    const left = g.season.filter((i) => !i.done).length;
    const head = left === 0 ? "这一季要办的事都办齐了" : left === 1 ? "这一季还差一件" : `这一季还差${cn(left)}件`;
    parts.push(`<p class="ox-season-head">${esc(head)}</p><ul class="ox-season">${g.season.map((i) =>
      `<li class="${i.done ? "is-done" : "is-open"}"><span class="ox-mark" aria-hidden="true">${i.done ? "✓" : ""}</span><span>${esc(i.text)}${i.done ? '<span class="ox-sr">，已办成</span>' : ""}</span></li>`).join("")}</ul>`);
  }
  if (!parts.length) return "";
  return `<div class="ox-col"><h3 class="ox-sub">眼下要紧的</h3>${parts.join("")}</div>`;
}

/** 气氛一句话里的「（起起落落）」已经在卡头标过了，句里去掉。 */
export function moodLine(director) {
  const d = rec(director);
  if (!d) return { line: "", label: "" };
  const label = str(d.modeLabel);
  let line = str(d.line);
  if (label) line = line.replace(new RegExp(`\\s*[（(]${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[）)]`), "");
  return { line: words(line), label };
}

export function renderToday(outlook) {
  const o = rec(outlook);
  if (!o) return "";
  const g = goalData(o.goals);
  const cal = rec(o.calendar);
  const mood = moodLine(o.director);
  const season = cal ? str(cal.season) : "";
  const eyebrow = [season, cal ? str(cal.monthName) : ""].filter(Boolean).join(" · ");
  const cols = [calendarHtml(o.calendar), todoHtml(g)].filter(Boolean);
  const ladder = ladderHtml(g.ladder, g.now, "村子走到哪一级");
  if (!cols.length && !ladder && !mood.line) return "";
  return `<section class="outlook panel ox-card" data-outlook="today" data-ox>
    <header class="ox-head">
      <div>${eyebrow ? `<p class="ox-eyebrow">${esc(eyebrow)}</p>` : ""}<h2>今天</h2></div>
      ${mood.label ? `<span class="ox-mood-tag">${esc(mood.label)}</span>` : ""}
    </header>
    ${ladder ? `<div class="ox-ladder-wrap"><p class="ox-ladder-cap">村子走到哪一级</p>${ladder}</div>` : ""}
    ${cols.length ? `<div class="ox-cols">${cols.join("")}</div>` : ""}
    ${mood.line ? `<p class="ox-mood">${esc(mood.line)}</p>` : ""}
  </section>`;
}

const TERRAIN = { road: "走大路", path: "走小路", trail: "走小路", river: "走水路", ford: "涉水", marsh: "穿泽地", mountain: "翻山", forest: "穿林子", hill: "翻坡" };

/** 路上要几天、走什么路，说不全就只说能说的。 */
export function goMeta(d) {
  const days = Number(d.days);
  const parts = [];
  if (Number.isFinite(days) && days > 0) parts.push(`路上要${cn(days)}天`);
  const t = TERRAIN[str(d.terrain)];
  if (t) parts.push(t);
  return parts.join(" · ");
}

function destinationsHtml(travel) {
  const t = rec(travel);
  if (!t) return "";
  if (t.travelling === true) return travelBlock(t);
  const list = arr(t.destinations).map((d) => rec(d)).filter(Boolean);
  if (!list.length) return `<p class="ox-empty">${esc(str(t.line) || "眼下没有能去的地方。")}</p>`;
  return `<ul class="ox-gos">${list.slice(0, 6).map((d) => {
    const name = str(d.name) || "那儿";
    const meta = goMeta(d);
    return `<li><span class="ox-go-text"><b>${esc(name)}</b>${meta ? `<small class="ox-go-meta">${esc(meta)}</small>` : ""}</span>${
      d.id ? `<button type="button" class="outlook-go ox-go" data-travel="travel.depart" data-to="${esc(str(d.id))}" aria-label="出门去${esc(name)}">出门</button>` : ""
    }</li>`;
  }).join("")}</ul>`;
}

/** 人生五段：眼下在哪一段。不写年龄。 */
export function stagesHtml(life) {
  const l = rec(life);
  const stages = l ? arr(l.stages).map((s) => rec(s)).filter(Boolean) : [];
  if (!stages.length) return "";
  const nowAt = stages.findIndex((s) => s.here === true);
  const items = stages.map((s, i) => {
    const cls = nowAt < 0 ? "is-next" : i < nowAt ? "is-past" : i === nowAt ? "is-now" : "is-next";
    return `<li class="${cls}"${i === nowAt ? ' aria-current="step"' : ""}>${esc(str(s.name))}</li>`;
  }).join("");
  return `<ol class="ox-stages" aria-label="这一生的几段">${items}</ol>`;
}

export function renderLife(outlook) {
  const o = rec(outlook);
  if (!o) return "";
  const life = rec(o.life);
  const stage = life ? rec(life.stage) : null;
  const moodWords = stage ? str(stage.mood) : "";
  const stageHtml = stagesHtml(life);
  const secrets = secretBlock(o.secrets);
  const fear = wantBlock(o.wants);
  const travel = destinationsHtml(o.travel);
  const sec = (title, body) => body ? `<section class="ox-block"><h3 class="ox-sub">${title}</h3>${body}</section>` : "";
  const blocks = [
    stageHtml || moodWords ? sec("这一段", `${stageHtml}${moodWords ? `<p class="ox-lead">${esc(moodWords)}</p>` : ""}`) : "",
    sec("放不下的事", fear),
    sec("听来的心事", secrets),
    sec(rec(o.travel)?.travelling === true ? "在路上" : "能去的地方", travel),
  ].filter(Boolean);
  if (!blocks.length) return "";
  return `<section class="outlook panel ox-card" data-outlook="life" data-ox>
    <header class="ox-head"><div><p class="ox-eyebrow">这一生</p><h2>心事与去处</h2></div></header>
    <div class="ox-blocks">${blocks.join("")}</div>
  </section>`;
}

/** 把 outlook-ux.js 刚画的那块，原位换成新的。 */
function upgrade(slotId, slot, html) {
  const host = document.getElementById(slotId);
  if (!host || !html) return;
  const old = host.querySelector(`:scope > [data-outlook="${slot}"]`);
  const tpl = document.createElement("template");
  tpl.innerHTML = html.trim();
  const fresh = tpl.content.firstElementChild;
  if (!fresh) return;
  if (old) old.replaceWith(fresh); else host.prepend(fresh);
}

export function paintOutlookCards(state) {
  const outlook = rec(state?.outlook);
  if (!outlook) return;
  upgrade("screen-activities", "today", renderToday(outlook));
  upgrade("screen-character", "life", renderLife(outlook));
}

/* 点「出门 / 再走一天 / 往回走」：立刻有反应，状态回来（卡片重画）自然恢复，4 秒没回来也恢复。 */
const BUSY_WORDS = { "travel.depart": "出发中…", "travel.day": "走着…", "travel.arrive": "落脚中…", "travel.return": "往回走…" };
function installBusy() {
  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest(".ox-card [data-travel]") : null;
    if (!button || button.disabled) return;
    const card = button.closest(".ox-card");
    const was = button.textContent;
    const wasLabel = button.getAttribute("aria-label");
    card.querySelectorAll("[data-travel]").forEach((b) => { b.disabled = true; });
    button.setAttribute("aria-busy", "true");
    button.textContent = BUSY_WORDS[button.getAttribute("data-travel") || ""] || "请稍等…";
    button.classList.add("is-busy");
    setTimeout(() => {
      if (!button.isConnected) return;
      card.querySelectorAll("[data-travel]").forEach((b) => { b.disabled = false; });
      button.removeAttribute("aria-busy");
      button.classList.remove("is-busy");
      button.textContent = was;
      if (wasLabel) button.setAttribute("aria-label", wasLabel);
    }, 4000);
  });
}

function installStyle() {
  if (document.querySelector('link[href="/outlook-card-ux.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/outlook-card-ux.css";
  document.head.append(link);
}

export function installOutlookCards() {
  installStyle();
  installBusy();
  window.addEventListener("openlife:state", (event) => paintOutlookCards(event.detail));
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installOutlookCards, { once: true });
  else installOutlookCards();
}
