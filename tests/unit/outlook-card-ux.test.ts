/**
 * 「今天」卡与「心事与去处」卡的重画（outlook-card-ux.js）守卫。
 *   1. 读对数据层级：服务端的今日要紧事与本季清单在 goals.goals 里；
 *   2. 整段渲染不出现阿拉伯数字，服务端句子里的数字写成汉字；
 *   3. 听说的心事不写正文（复用 outlook-ux 的 secretBlock）；
 *   4. 去处按钮读屏名带地名，点下去立刻忙；接线与样式令牌。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  cn, words, splitWhen, calendarRows, goalData, ladderHtml, moodLine, goMeta,
  stagesHtml, renderToday, renderLife,
} from "../../apps/web/public/outlook-card-ux.js";

const pub = (f: string) => readFileSync(new URL(`../../apps/web/public/${f}`, import.meta.url), "utf8");
const text = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const noDigit = (html: string) => html.replace(/<[^>]*>/g, "").search(/[0-9]/);

const goals = {
  stage: 2, stageName: "安顿", nextName: "安顿",
  ladders: ["落脚", "安顿", "添丁", "有名", "兴旺", "传承"].map((name, i) => ({ index: i + 1, name })),
  goals: {
    today: [
      { id: "feed", text: "存粮只够 1 天，得想办法补上。" },
      { id: "stock", text: "存粮撑不到开春，多备一点总没错。" },
      { id: "goal", text: "离「安顿」还差：存粮 1/60 天。" },
    ],
    season: { items: [{ text: "熬过第一个冬天", done: false }, { text: "无人饿死", done: true }] },
  },
};
const outlook = {
  calendar: { month: 1, monthName: "一月", season: "冬", lines: ["今天 · 田里空着，什么时候下种都行。", "二月二（还有三十一天） · 社日"] },
  goals,
  director: { modeLabel: "起起落落", line: "村里这几天很安静。（起起落落）" },
  life: { stage: { name: "成年", mood: "事情开始落到自己肩上。" }, stages: [
    { name: "童年", here: false }, { name: "少年", here: false }, { name: "成年", here: true }, { name: "壮年", here: false }, { name: "老年", here: false },
  ] },
  wants: { fear: { name: "怕挨饿", text: "饿过一次的人，看见空罐子就心慌。" } },
  secrets: { known: [], heard: [{ ownerName: "阿石", kind: "feeling", line: "听说阿石心里有事。", text: "SECRET-BODY" }] },
  travel: { travelling: false, destinations: [{ id: "p:1", name: "旧渡口", days: 1, terrain: "road" }], line: "可以说走就走。" },
};

test("cn：小数字写成汉字", () => {
  assert.equal(cn(0), "零"); assert.equal(cn(1), "一"); assert.equal(cn(10), "十"); assert.equal(cn(11), "十一");
  assert.equal(cn(23), "二十三"); assert.equal(cn(30), "三十"); assert.equal(cn(105), "一百零五"); assert.equal(cn(120), "一百二十");
});

test("words：句子里的数字改汉字并吃掉两侧空格", () => {
  assert.equal(words("存粮只够 1 天，得想办法补上。"), "存粮只够一天，得想办法补上。");
  assert.equal(words("还有 31 天"), "还有三十一天");
});

test("日历行拆成日期、旁注、事", () => {
  assert.deepEqual(splitWhen("二月二（还有三十一天）"), { date: "二月二", note: "还有三十一天" });
  assert.deepEqual(splitWhen("今天"), { date: "今天", note: "" });
  const rows = calendarRows(["今天 · 田里空着。", "二月二（还有三十一天） · 社日", "只有一句话"]);
  assert.equal(rows[0]!.date, "今天"); assert.equal(rows[0]!.what, "田里空着。");
  assert.equal(rows[1]!.note, "还有三十一天"); assert.equal(rows[1]!.what, "社日");
  assert.equal(rows[2]!.date, ""); assert.equal(rows[2]!.what, "只有一句话");
});

test("goalData 读 goals.goals 里的今日要紧事与本季清单，比例句丢掉", () => {
  const g = goalData(goals);
  assert.equal(g.now, 1);
  assert.deepEqual(g.today, ["存粮只够一天，得想办法补上。", "存粮撑不到开春，多备一点总没错。"]);
  assert.equal(g.season.length, 2);
  assert.equal(goalData({ stageName: "落脚", today: [{ text: "先找水" }] }).today[0], "先找水", "老结构也认");
  assert.equal(goalData(null).ladder.length, 0);
});

test("阶梯与人生轨：恰好一格是眼下，之前的是走过的", () => {
  const html = ladderHtml(["落脚", "安顿", "添丁"], 1, "x");
  assert.equal((html.match(/is-now/g) || []).length, 1);
  assert.equal((html.match(/is-past/g) || []).length, 1);
  assert.equal(ladderHtml(["落脚"], -1, "x"), "");
  const stages = stagesHtml(outlook.life);
  assert.equal((stages.match(/<li/g) || []).length, 5);
  assert.match(stages, /is-now"[^>]*>成年/);
});

test("气氛：句末括号里的标签去掉", () => {
  assert.deepEqual(moodLine(outlook.director), { line: "村里这几天很安静。", label: "起起落落" });
  assert.deepEqual(moodLine(null), { line: "", label: "" });
});

test("去处旁注：几天、走什么路，说不全只说能说的", () => {
  assert.equal(goMeta({ days: 1, terrain: "road" }), "路上要一天 · 走大路");
  assert.equal(goMeta({ days: 3 }), "路上要三天");
  assert.equal(goMeta({ terrain: "marsh" }), "穿泽地");
  assert.equal(goMeta({}), "");
});

test("今天卡：有阶梯、两栏、卡头气氛标签，且没有阿拉伯数字", () => {
  const html = renderToday(outlook);
  assert.match(html, /data-outlook="today"/);
  assert.match(html, /ox-ladder/); assert.match(html, /ox-mood-tag/); assert.match(html, /ox-todo/); assert.match(html, /ox-season/);
  assert.equal(noDigit(html), -1, text(html));
  assert.doesNotMatch(text(html), /（起起落落）/);
  assert.equal(renderToday(null), "");
});

test("心事与去处卡：四个小节，听说的心事不出正文，按钮带地名", () => {
  const html = renderLife(outlook);
  for (const s of ["这一段", "放不下的事", "听来的心事", "能去的地方"]) assert.match(html, new RegExp(`>${s}<`));
  assert.doesNotMatch(html, /SECRET-BODY/);
  assert.match(html, /aria-label="出门去旧渡口"/);
  assert.match(html, /路上要一天/);
  assert.equal(noDigit(html), -1, text(html));
});

test("在路上时小节叫「在路上」，仍给「再走一天 / 往回走」", () => {
  const html = renderLife({ ...outlook, travel: { travelling: true, arrived: false, toName: "旧渡口", line: "正在路上。" } });
  assert.match(html, />在路上</);
  assert.match(html, /data-travel="travel.day"/);
  assert.match(html, /data-travel="travel.return"/);
});

test("接线：index.html 只加一行 script，scene-ux 仍是最后一个元素，模块自己 import outlook-ux 保证先后", () => {
  const html = pub("index.html");
  assert.equal((html.match(/\/outlook-card-ux\.js/g) || []).length, 1);
  assert.ok(html.indexOf("/outlook-card-ux.js") < html.indexOf("/scene-ux.js"));
  assert.match(html.trimEnd(), /<script type="module" src="\/scene-ux\.js"><\/script>\s*<\/body><\/html>$/);
  assert.doesNotMatch(html, /outlook-card-ux\.css/, "样式由 JS 追加，ui-polish.css 仍是最后一个 link");
  assert.match(pub("outlook-card-ux.js"), /import \{[^}]*\} from "\.\/outlook-ux\.js"/);
});

test("样式只用令牌：没有写死的十六进制色，手机规则写了两份", () => {
  const css = pub("outlook-card-ux.css");
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /:where\(html\.is-phone\)/);
  assert.match(css, /--now-col/);
});
