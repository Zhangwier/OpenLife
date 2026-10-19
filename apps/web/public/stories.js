/**
 * 「故事」页：主线/支线任务、身边村民的对话、今天的节日仪式、限时活动、突发事件与成就。
 * 数据来自 /api/state 的 stories（village-stories 投影）；每个按钮都是一条经过校验的命令。
 */
import { html } from "/player.js";

let onAction = () => {};
let installed = false;

const PLACE = {
  "place:yard": "陶家庭院", "place:hearth-yard": "公用灶台", "place:river": "河边取水点", "place:field": "河岸旱地",
  "place:kiln": "共用陶窑", "place:claypits": "河湾黏土坑", "place:reedbed": "芦苇滩", "place:ford": "渡口",
  "place:longhouse": "族人长屋", "place:weaving-shed": "织坊", "place:shrine": "河神祠", "place:market": "交换场",
  "place:chestnut-wood": "北坡栗林", "place:stone-beach": "上游石滩",
};
const KIND = { main: "主线", side: "支线" };
const TIE = { kin: "亲", friend: "友", rival: "仇" };
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

function peopleSection(p) {
  if (!p) return "";
  const log = p.log.length ? `<ul class="story-log">${p.log.map((e) => `<li><b>${html(e.name)}</b> ${html(e.why)}
    <small>${[["熟悉", e.familiarity], ["信任", e.trust], ["芥蒂", e.grudge]].filter(([, v]) => v).map(([k, v]) => `${k}${signed(v)}`).join(" ")}</small></li>`).join("")}</ul>` : "<p>还没有记下什么来往。</p>";
  const quarrel = p.quarrel ? `<section class="panel story-incident"><span class="story-tag story-alert">争执</span><h3>${html(p.quarrel.aName)}和${html(p.quarrel.bName)}吵起来了</h3>
    <p>${html(p.quarrel.text)}（${html(PLACE[p.quarrel.placeId] ?? p.quarrel.placeId)}）</p>
    <div class="story-choices">${p.quarrel.settled ? "<small>你已经掺和过了。</small>" : p.quarrel.sides.map((x) => button(x.label, "village-stories.quarrel.settle", { side: x.side }, x.enabled, x.reason)).join("")}</div></section>` : "";
  const services = `<div class="story-choices">${p.services.flatMap((s) => s.targets.map((t) => button(`${s.title}·${s.npcName}：${s.label}${t.name ? `（${t.name}）` : ""}`,
    "village-stories.service.use", { serviceId: s.id, ...(t.npc ? { targetNpc: t.npc } : {}) }, t.enabled, t.reason))).join("")}</div>`;
  const rows = p.villagers.map((v) => `<li class="story-person${v.feud ? " is-feud" : ""}"><b>${html(v.name)}</b>${v.special ? `<span class="story-tag story-limited">${html(v.special)}</span>` : ""}
    <span class="story-tag">${html(v.feud ? "心存芥蒂" : v.tierName)}</span><small>${"♥".repeat(Math.min(10, v.hearts))}${v.nextTier ? ` · 再 ${v.nextTier.hearts - v.hearts} 颗心成「${html(v.nextTier.name)}」` : ""}</small>
    <small class="story-where">在${html(PLACE[v.placeId] ?? "家里")}${v.routine?.now ? ` · 这个时辰常在${html(PLACE[v.routine.now] ?? v.routine.now)}` : ""}</small>
    <span class="story-ties">${v.relations.map((r) => `<i class="tie-${r.type}" title="${html(r.label)}">${TIE[r.type] ?? ""}·${html(r.name)}</i>`).join("")}</span>
    ${v.warmth ? `<details class="story-warmth"><summary>交情怎么涨 · 涨了有什么${v.warmth.next ? `（下一个：${html(v.warmth.next.tierName)}解锁${html(v.warmth.next.kind)}）` : ""}</summary>
      <ul>${v.warmth.ways.map((w) => `<li>${html(w)}</li>`).join("")}</ul>
      <ul class="story-unlocks">${v.warmth.unlocks.map((u) => `<li class="${u.reached ? "is-reached" : ""}${u.done ? " is-done" : ""}"><span class="story-tag">${html(u.tierName)}</span>${html(u.kind)}：${html(u.what)}${u.done ? " ✓" : u.reached ? "" : " 🔒"}</li>`).join("")}</ul></details>` : ""}</li>`).join("");
  return `${quarrel}<section class="panel story-people"><h3>村里的人 <small>${html(p.slot)} · ${html(p.weather)}</small></h3>
    <ul class="story-roster">${rows}</ul><h3>能人相助</h3>${services}<h3>最近的来往</h3>${log}</section>`;
}

function button(label, action, payload, enabled = true, reason = "") {
  return `<button class="story-button" data-story-action="${html(action)}" data-story-payload='${html(JSON.stringify(payload))}' ${enabled ? "" : "disabled"} title="${html(reason)}">${html(label)}</button>${!enabled && reason ? `<small class="story-reason">${html(reason)}</small>` : ""}`;
}

function bar(done, target) {
  const pct = Math.round((Math.min(done, target) / Math.max(1, target)) * 100);
  return `<span class="story-bar" role="progressbar" aria-valuenow="${done}" aria-valuemax="${target}"><i style="width:${pct}%"></i></span><small>${done}/${target}</small>`;
}

function questCard(q) {
  const tag = `<span class="story-tag story-${q.kind}">${KIND[q.kind] ?? q.kind}${q.chapter ? ` · 第${q.chapter}章` : ""}</span>`;
  if (q.status === "active" && q.step) {
    return `<article class="story-card">${tag}<h4>${html(q.title)}</h4><p>${html(q.summary)}</p>
      ${q.step.intro ? `<p class="story-line">${html(q.step.intro)}</p>` : ""}<div class="story-step"><b>第 ${q.step.index + 1}/${q.step.of} 步</b> ${html(q.step.text)} ${q.step.deliver || q.decide ? "" : bar(q.step.done, q.step.target)}</div>
      ${q.daysLeft !== null && q.daysLeft !== undefined ? `<span class="story-tag story-alert">限期 · 还剩 ${q.daysLeft + 1} 天</span>` : ""}
      ${q.decide ? `<div class="story-choices">${q.decide.map((d) => button(d.label, "village-stories.quest.decide", { questId: q.id, optionId: d.id }, d.enabled, d.reason)).join("")}</div><small>选了就不能反悔。</small>` : ""}
      ${q.step.turnIn ? button(`交给${q.step.deliver.npcName}`, "village-stories.quest.turn_in", { questId: q.id }, q.step.turnIn.enabled, q.step.turnIn.reason) : ""}</article>`;
  }
  if (q.status === "failed") return `<article class="story-card is-done is-failed">${tag}<h4>${html(q.title)} ✗</h4><small>误了期限，没有办成。</small></article>`;
  if (q.status === "available") {
    return `<article class="story-card is-offer">${tag}<h4>${html(q.title)}</h4><p>${html(q.summary)}</p>
      ${q.giverName ? `<small>找${html(q.giverName)}接下</small>` : ""}${q.deadlineDays ? `<small class="story-reason">接下后 ${q.deadlineDays} 天内要办完</small>` : ""}${button("接下这件事", "village-stories.quest.accept", { questId: q.id }, q.accept?.enabled, q.accept?.reason)}</article>`;
  }
  return `<article class="story-card is-done">${tag}<h4>${html(q.title)} ✓</h4></article>`;
}

export function renderStories(state, perform) {
  onAction = perform;
  const screen = document.getElementById("screen-stories");
  if (!screen) return;
  if (!installed) {
    installed = true;
    screen.addEventListener("click", (event) => {
      const el = event.target.closest("[data-story-action]");
      if (!el || el.disabled) return;
      onAction(el.dataset.storyAction, JSON.parse(el.dataset.storyPayload || "{}"));
    });
  }
  const s = state.stories;
  if (!s) {
    screen.innerHTML = `<section class="panel story-empty"><h3>故事还没开始</h3><p>到了河岸聚落，村里的人和事才会找上你。</p></section>`;
    return;
  }
  const active = s.quests.filter((q) => q.status === "active");
  const offers = s.quests.filter((q) => q.status === "available");
  const done = s.quests.filter((q) => q.status === "done" || q.status === "failed");
  const unlocked = s.achievements.filter((a) => a.unlocked).length;
  const events = s.events.filter((e) => e.active || e.inDays <= 10);

  const omens = (s.omens ?? []).map((o) => `<section class="panel story-incident"><span class="story-tag story-limited">预兆</span><p>${html(o.text)}</p></section>`).join("");
  const titles = s.title?.earned?.length ? `<div class="story-choices"><small>名号：${html(s.title.current ?? "（不挂）")}</small>${s.title.earned.map((t) => button(`以「${t}」自称`, "village-stories.title.set", { title: t }, t !== s.title.current, t === s.title.current ? "已经是这个名号了" : "")).join("")}${s.title.current ? button("不挂名号", "village-stories.title.set", { title: "" }) : ""}</div>` : "";
  screen.innerHTML = `
    ${omens}
    ${s.incident ? `<section class="panel story-incident"><span class="story-tag story-alert">突发</span>${s.incident.chained ? '<span class="story-tag story-limited">后续</span>' : ""}<h3>${html(s.incident.title)}</h3><p>${html(s.incident.text)}</p>
      <div class="story-choices">${s.incident.resolved ? "<small>这件事你已经应对过了。</small>" : s.incident.choices.map((c) => button(c.label, "village-stories.incident.resolve", { incidentId: s.incident.id, choiceId: c.id }, c.enabled, c.reason)).join("")}</div></section>` : ""}
    ${s.festival ? `<section class="panel story-festival"><span class="story-tag story-feast">节日</span><h3>今天是${html(s.festival.name)}</h3>
      <p>在${html(PLACE[s.festival.placeId] ?? s.festival.placeId)}：${html(s.festival.label)}${s.festival.streak > 0 ? `（已连着过了 ${s.festival.streak} 年）` : ""}</p>${s.festival.done ? "<small>今年的仪式你已经做过了。</small>" : `<div class="story-choices">${(s.festival.rites?.length ? s.festival.rites : [{ id: "", label: s.festival.label, enabled: s.festival.enabled, reason: s.festival.reason }]).map((r) => button(r.label, "village-stories.festival.rite", r.id ? { riteId: r.id } : {}, r.enabled, r.reason)).join("")}</div>${s.festival.rites?.length > 1 ? "<small>每年只能选一种过法。</small>" : ""}`}</section>` : ""}
    ${events.length ? `<section class="panel story-events"><h3>限时活动</h3>${events.map((e) => `<article class="story-card"><span class="story-tag story-limited">${e.active ? "进行中" : `${e.inDays} 天后`}</span><h4>${html(e.name)}</h4>
      <p>${html(e.intro)}（${e.window.month} 月 ${e.window.from}–${e.window.to} 日 · ${html(PLACE[e.placeId] ?? e.placeId)}）</p>
      ${e.visits > 1 ? `<small>每年能来 ${e.visits} 回，已来 ${e.used} 回${e.complete ? (e.complete.done ? " · 样样都做过了 ✓" : " · 样样都做一遍有额外的赏") : ""}</small>` : ""}
      ${e.active ? (e.used >= e.visits ? "<small>今年的次数用完了。</small>" : `<div class="story-choices">${e.offers.map((o) => button(o.limit ? `${o.label}（${o.taken}/${o.limit}）` : o.label, "village-stories.event.join", { eventId: e.id, offerId: o.id }, o.enabled, o.reason)).join("")}</div>`) : ""}</article>`).join("")}</section>` : ""}
    <section class="panel story-dialogues"><h3>身边的人</h3>${s.dialogues.length ? s.dialogues.map((d) => `<article class="story-card story-talk"><h4>${html(d.name)} <small>${"♥".repeat(Math.min(10, d.hearts))}</small></h4><p class="story-line">${html(d.text)}</p>${d.remark ? `<p class="story-remark">${html(d.remark)}</p>` : ""}
      <div class="story-choices">${d.options.map((o) => button(o.once ? `${o.label} ✦` : o.label, "village-stories.dialogue.choose", { npc: d.npc, node: d.node, option: o.id }, o.enabled, o.reason)).join("")}</div></article>`).join("") : "<p>这里没有能深谈的人。到村里别处走走，或者等他们过来。</p>"}</section>
    ${peopleSection(s.people)}
    <section class="panel story-quests"><h3>正在办的事</h3>${active.length ? active.map(questCard).join("") : "<p>手上没有正在办的事。</p>"}
      ${offers.length ? `<h3>可以接下的事</h3>${offers.map(questCard).join("")}` : ""}
      ${done.length ? `<details><summary>办完的事（${done.length}）</summary>${done.map(questCard).join("")}</details>` : ""}</section>
    <section class="panel story-achievements"><h3>成就 <small>${unlocked}/${s.achievements.length}</small></h3>${titles}
      ${[...new Set(s.achievements.map((a) => a.category ?? "其他"))].map((cat) => `<h4>${html(cat)}</h4><ul class="story-badges">${s.achievements.filter((a) => (a.category ?? "其他") === cat).map((a) => `<li class="${a.unlocked ? "is-unlocked" : ""}${a.hidden ? " is-hidden" : ""}" title="${html(a.text)}"><b>${html(a.name)}</b><small>${html(a.text)}${a.progress && !a.unlocked ? `（${a.progress.have}/${a.progress.need}）` : ""}${a.title ? ` · 名号「${html(a.title)}」` : ""}</small>${a.reward && a.unlocked ? (a.reward.claimed ? "<small>赏已领</small>" : button("领赏", "village-stories.achievement.claim", { achievementId: a.id }, a.reward.enabled, a.reward.reason)) : ""}</li>`).join("")}</ul>`).join("")}</section>`;
}
