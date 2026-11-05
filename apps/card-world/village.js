// The village and how it grows: the ladder it climbs, who comes to join it and when, and the days it keeps.
// Adapted from the old engine's settlement-goals (goals.json), village-stories (festivals) and the river-terrace cast.
// The ladder reads a snapshot (v) the game builds; it never changes the world itself.

/** Six rungs. Each condition: text, and either test(v) → true/false, or value(v) with need (shown as "3/6"). */
export const LADDER = [
  { name: "落脚", unlock: "外乡人会来投奔", conds: [
    { text: "收下第一季的粟", test: (v) => v.firstHarvest },
    { text: "跟家里每个人都熟了", test: (v) => v.allKnown },
    { text: "没人挨过一整天的饿", test: (v) => v.starved === 0 },
  ] },
  { name: "安顿", unlock: "打石头的阿砺会从山那边来", conds: [
    { text: "熬过一个冬天", test: (v) => v.winters >= 1 },
    { text: "能住的地方", value: (v) => v.beds, need: 6 },
    { text: "公仓存粮", value: (v) => v.granary, need: 15 },
  ] },
  { name: "添丁", unlock: "（以后）远行", conds: [
    { text: "村里的人", value: (v) => v.people, need: 6 },
    { text: "种着的田", value: (v) => v.fields, need: 3 },
  ] },
  { name: "有名", unlock: "（以后）", conds: [{ text: "有外乡人来换东西（还没有）", test: () => false }] },
  { name: "兴旺", unlock: "（以后）", conds: [{ text: "村里的人", value: (v) => v.people, need: 12 }, { text: "三代同堂的人家（还没有）", test: () => false }] },
  { name: "传承", unlock: "（以后）", conds: [{ text: "传到第二代（还没有）", test: () => false }] },
];
export const condDone = (c, v) => (c.test ? c.test(v) : c.value(v) >= c.need);
export const rungDone = (r, v) => r.conds.every((c) => condDone(c, v));

export const POP_CAP = 80;            // a village small enough that everyone can be known

/** Who comes, in order: the rung that opens the way, where they come from (a tile and a point in it), their work,
 *  where they like to sleep, the card's text, and what they say on arriving. */
export const NEWCOMERS = [
  { key: "gu", name: "阿罟", icon: "boatman", rung: 1, from: ["lake", 0.95, 0.35], job: "fish", style: "huashao",
    text: "打了半辈子鱼的老把式，看水色就知道鱼在哪一层。手上全是网绳勒出的老茧。",
    intro: "“湖那头待不下去了。听说这边有口热灶……我会打鱼，不白吃。”", how: "从湖那边划着筏子来投奔" },
  { key: "wei", name: "阿苇", icon: "cook", rung: 1, from: ["forest", 0.86, 0.9], job: "reed", style: "huashao",
    text: "割芦苇、编席子的。话少，总担心芦苇荡一年比一年稀。",
    intro: "“……我会编席。你们的芦苇荡，得有人管着点割。”", how: "从林子那边走出来投奔" },
  { key: "li", name: "阿砺", icon: "digger", rung: 2, from: ["mountain", 0.02, 0.74], job: "stone", style: "huashao",
    text: "打制石器的匠人。手上全是老茧，敲石头比说话利索。",
    intro: "“山里那条矿道，石头纹路顺。我打石头的，留我一口饭，工具我包了。”", how: "从山里那条矿道走出来投奔" },
];

/** The days the village keeps. day: day of the season (1–4); they gather at the stove at dusk. cost: what it takes. */
export const FESTIVALS = [
  { id: "spring", season: "春", day: 1, name: "春祭", line: "大家围着公灶，你学着老人的样子把一把粟撒向田那边。大伙一起喊：“雨匀！”", cost: { granary: 1 } },
  { id: "harvest", season: "秋", day: 3, name: "秋收共餐", line: "新粟煮了满满一锅，第一碗端给了年纪最大的人。灶边一直闹到天黑透。", cost: { granary: 2 }, feast: 6 },
  { id: "solstice", season: "冬", day: 3, name: "冬至守火", line: "这一夜公灶的火不能灭。大家轮流添柴，讲着各自老家的事，一直坐到后半夜。", cost: { fuel: 1 } },
];
