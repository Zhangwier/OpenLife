/**
 * 阶段二/三的画面守卫：今天、村子目标、气氛、心事、这一生、去处。
 *
 * 这一层最容易被写坏的两件事，都在这里钉住：
 *   1. 不许出现数字。`docs/design/DESIGN.md` 要求程度用「多/一半/还差几件」，
 *      所以整段渲染结果里一个阿拉伯数字都不该有。
 *   2. 听说的事不许写成正文。这一条是 village-secrets 的红线，投影已经守住了
 *      （heard 档只有 line，没有 text），界面不能自己补出来。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  calendarBlock, goalBlock, moodBlock, secretBlock, wantBlock, travelBlock,
  renderOutlookToday, renderOutlookLife, stageLine,
} from "../../apps/web/public/outlook-ux.js";

const pub = (f: string) => readFileSync(new URL(`../../apps/web/public/${f}`, import.meta.url), "utf8");
const text = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const digits = (html: string) => html.replace(/title="[^"]*"/g, "").search(/[0-9]/);

test("今天：日历只说「四月里」和已定的日子，不写「还有 22 天」以外的数字", () => {
  const calendar = {
    month: 4, monthName: "四月", day: 12, season: "春",
    entries: [],
    lines: ["四月十六 · 放河灯", "五月初三 · 春社"],
  };
  const out = calendarBlock(calendar);
  const spoken = text(out);
  assert.match(spoken, /四月里/);
  assert.match(spoken, /放河灯/);
  assert.match(spoken, /春社/);
  assert.equal(digits(text(out)), -1, `日历里出现了数字：${spoken}`);
});

test("今天：空日历不说「没有」，说「还没定下的事」", () => {
  const out = calendarBlock({ month: 9, monthName: "九月", lines: [] });
  assert.match(text(out), /九月里还没有定下的事/);
});

test("村子目标：说级数与还差几件，不说百分比或比例", () => {
  const goals = {
    stage: 2, stageName: "安顿", nextName: "添丁", totalStages: 6,
    today: [{ id: "feed", priority: 95, text: "存粮只够一天，得想办法补上。" }],
    season: { name: "这一季", done: 2, total: 5, ratio: 0.4, items: [
      { text: "把屋顶修好", done: true },
      { text: "给陶叔烧一窑", done: false },
      { text: "带阿予认一认草药", done: false },
      { text: "去河口看看鱼梁", done: false },
    ] },
    line: "村子在「安顿」这一级",
  };
  const out = goalBlock(goals);
  const spoken = text(out);
  assert.match(spoken, /村子眼下在「安顿」这一级/);
  assert.match(spoken, /再往前是「添丁」/);
  assert.match(spoken, /存粮只够一天/);
  assert.match(spoken, /这一季还差3件没办/);
  assert.doesNotMatch(spoken, /%|％|比例|进度/);
  // 目标是「还差几件」这种说法，进度条与百分比都不该出现。
  assert.equal(digits(spoken.replace(/还差3件/, "")), -1, `目标区出现了比例数字：${spoken}`);
});

test("村子目标：一季都办齐时明说办齐了，不列空清单", () => {
  const out = goalBlock({ stageName: "落脚", season: { items: [{ text: "把屋顶修好", done: true }] } });
  assert.match(text(out), /这一季要办的事都办齐了/);
  assert.doesNotMatch(out, /<ul/);
});

test("气氛：叙事者的话原样端出来，模式名当标签而不是解释", () => {
  const out = moodBlock({ mode: "rhythmic", modeLabel: "起起落落", line: "村里这几天很安静。" });
  assert.match(text(out), /村里这几天很安静。/);
  assert.match(text(out), /起起落落/);
});

test("心事：确知的说正文，听说的只说线索——不许把 heard 的内容当正文", () => {
  const secrets = {
    actorId: "me", total: 2,
    known: [{ secretId: "s1", ownerKey: "elder-wife", ownerName: "陶婶", kind: "ailment", stage: "known", text: "她的眼睛快撑不住了。", severity: 2, used: { kept: 0, advised: 0, exposed: 0, extorted: 0 } }],
    heard: [{ secretId: "s2", ownerKey: "fisher", ownerName: "阿罟", kind: "misdeed", stage: "heard", hints: 1, line: "有人在河口看见他半夜收网。" }],
  };
  const out = secretBlock(secrets);
  const spoken = text(out);
  assert.match(spoken, /陶婶/);
  assert.match(spoken, /她的眼睛快撑不住了。/);
  assert.match(spoken, /阿罟/);
  assert.match(spoken, /有人在河口看见他半夜收网。/);
  assert.match(spoken, /听说来的还不作数/);
  assert.match(out, /class="outlook-secret is-heard"/);
  assert.match(out, /class="outlook-secret is-known"/);
});

test("心事：只听说、没确知时，界面不能凭空说出正文", () => {
  const out = secretBlock({ known: [], heard: [{ ownerName: "阿芷", kind: "feeling", line: "药庐里那页纸她一直没写。" }] });
  assert.doesNotMatch(out, /is-known/);
  assert.match(text(out), /药庐里那页纸/);
});

test("心事：一件都不知道时说「还没有谁说给你听」，不是「无」", () => {
  const out = secretBlock({ known: [], heard: [] });
  assert.match(text(out), /还没有谁把心里的事说给你听/);
});

test("怕的事：说心里的那句话，不报心情数值", () => {
  const out = wantBlock({ fear: { id: "fear:village-wants.hunger", name: "怕挨饿", text: "饿过一次的人，看见空罐子就心慌。", moodDrop: 3 }, mood: 7 });
  const spoken = text(out);
  assert.match(spoken, /怕挨饿/);
  assert.match(spoken, /看见空罐子就心慌/);
  assert.equal(digits(spoken), -1);
});

test("去处：给出能走的地方名；路上就只说路", () => {
  const here = travelBlock({ travelling: false, destinations: [{ id: "a", name: "西岸旱地", type: "field" }, { id: "b", name: "河口", type: "river_bank" }], line: "" });
  assert.match(text(here), /西岸旱地/);
  assert.match(text(here), /河口/);
  const away = travelBlock({ travelling: true, destinations: [], line: "往河口去，还有两天。" });
  assert.match(text(away), /往河口去/);
  assert.doesNotMatch(away, /<ul/);
});

test("去处：没有可去的地方时照实说，不假装有", () => {
  assert.match(text(travelBlock({ travelling: false, destinations: [], line: "附近没有可去的地方。" })), /附近没有可去的地方/);
});

test("去处：每个能走的地方带一个「出门」，路上给「再走一天」与「往回走」", () => {
  const here = travelBlock({ travelling: false, destinations: [{ id: "xia:location:W0104", name: "旧渡口" }], line: "" });
  assert.match(here, /data-travel="travel\.depart"/);
  assert.match(here, /data-to="xia:location:W0104"/);
  assert.match(text(here), /出门/);

  const walking = travelBlock({ travelling: true, toName: "旧渡口", daysLeft: 2, arrived: false, line: "往旧渡口去，还有两天。" });
  assert.match(walking, /data-travel="travel\.day"/);
  assert.match(walking, /data-travel="travel\.return"/);
  assert.doesNotMatch(walking, /data-travel="travel\.depart"/);

  const arrived = travelBlock({ travelling: true, toName: "旧渡口", arrived: true, line: "到了旧渡口。" });
  assert.match(arrived, /data-travel="travel\.arrive"/);
  assert.match(text(arrived), /落脚/);
});

test("去处：按钮不自己发请求，统一走 openlife:action 通道", () => {
  const js = pub("outlook-ux.js");
  assert.match(js, /new CustomEvent\("openlife:action"/);
  assert.doesNotMatch(js, /fetch\(/, "界面层不自己 POST，否则绕过校验与状态刷新");
  // app.js 那一头必须真的把它接上，否则按钮是死的。
  const app = pub("app.js");
  assert.match(app, /addEventListener\("openlife:action"/);
  assert.match(app, /performSettlementAction\(detail\.action/);
});

test("这一生：写段名与这一段的心情，不写岁数区间", () => {
  assert.equal(stageLine({ stage: { id: "prime", name: "壮年", mood: "上有老下有小，谁也离不开你。" } }), "壮年：上有老下有小，谁也离不开你。");
  assert.equal(stageLine({ stage: { id: "prime", name: "壮年" } }), "壮年");
  assert.equal(stageLine(null), "");
});

test("两块合成页：今天在「此刻」、心事与去处在「人生」，标题不重复也不空", () => {
  const outlook = {
    calendar: { month: 4, monthName: "四月", lines: ["四月十六 · 放河灯"] },
    goals: { stageName: "安顿", today: [{ text: "把屋顶修好" }] },
    director: { modeLabel: "起起落落", line: "村里这几天很安静。" },
    life: { stage: { name: "壮年", mood: "上有老下有小。" }, age: 52 },
    wants: { fear: { name: "怕挨饿", text: "看见空罐子就心慌。" } },
    secrets: { known: [], heard: [] },
    travel: { travelling: false, destinations: [], line: "附近没有可去的地方。" },
  };
  const today = renderOutlookToday(outlook);
  assert.match(today, /data-outlook="today"/);
  assert.match(text(today), /放河灯/);
  assert.doesNotMatch(today, /心事与去处/);
  const life = renderOutlookLife(outlook);
  assert.match(life, /data-outlook="life"/);
  assert.match(text(life), /心事与去处/);
  assert.match(text(life), /壮年/);
  assert.equal(renderOutlookToday(null), "");
  assert.equal(renderOutlookLife(undefined), "");
});

test("外观：脚本已挂进 index.html，且仍在 scene-ux.js 之前", () => {
  const page = pub("index.html").replace(/\r\n/g, "\n");
  assert.match(page, /<script type="module" src="\/outlook-ux\.js"><\/script>/);
  assert.ok(
    page.indexOf('src="/outlook-ux.js"') < page.indexOf('src="/scene-ux.js"'),
    "scene-ux.js 必须是最后一个脚本（tests/unit/scene-ux.test.ts 守着这一条）",
  );
  assert.match(pub("outlook-ux.js"), /link\.href = "\/outlook-ux\.css"/);
});

test("样式：只用令牌字号与令牌颜色（design-check 的规矩，这里先挡一道）", () => {
  const css = pub("outlook-ux.css");
  const sizes = [...css.matchAll(/font(?:-size)?:\s*[^;]*?(\d+(?:\.\d+)?)px/g)].map((m) => m[1]);
  // 字号必须走 var(--fs-*)；只有 shorthand 里的 font-weight 之类不算字号，
  // 所以这里只查显式 px 字号。
  const explicit = [...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((m) => m[1]);
  assert.deepEqual(explicit, [], `字号要写 var(--fs-*)，发现裸 px：${explicit.join(", ")}`);
  assert.deepEqual(sizes.filter((s) => s !== undefined && !["1", "2"].includes(s)), []);
  assert.doesNotMatch(css, /#[0-9a-fA-F]{6}/, "颜色要走令牌，不许写死十六进制");
});
