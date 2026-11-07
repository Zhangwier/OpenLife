// The storyteller: now and then something happens that no one planned. It reads how the village is doing — food per
// head, spirits, how long since the last upset — and leans the other way: a comfortable village gets trouble, a
// struggling one a break. Bad things send word a day ahead. Pure; app.js carries the events out.

export const DIFFICULTY = {
  安稳: { gap: 4, bad: 0.5, harm: 0.6 },
  寻常: { gap: 3, bad: 1, harm: 1 },
  艰难: { gap: 2, bad: 1.6, harm: 1.4 },
};

/** kind: good / bad / social. seasons: when it can happen. when(ctx): anything else it needs. omen: what's said the day before. */
export const EVENTS = [
  { id: "fish-run", kind: "good", seasons: ["春", "夏", "秋"], weight: 1, text: "湖里起了鱼汛，捞一网是一网。" },
  { id: "bumper", kind: "good", seasons: ["夏", "秋"], weight: 1, text: "今年野果结得格外多，枝子都压弯了。" },
  { id: "traveller", kind: "good", weight: 0.8, text: "一个过路的老人歇了歇脚，走前留下几样东西。" },
  { id: "rats", kind: "bad", weight: 1, when: (c) => c.grain >= 6, omen: "“公仓里夜里窸窸窣窣的，怕是闹耗子。”", text: "公仓闹了耗子，粟被祸害了不少。" },
  { id: "fever", kind: "bad", weight: 1, when: (c) => c.people >= 2, omen: "“这两天早晚凉，当心着点，别闹病。”", text: "有人发了烧，躺倒了。" },
  { id: "cold-snap", kind: "bad", seasons: ["秋", "冬"], weight: 1, omen: "“北边的天压得低，怕是要来寒潮。”", text: "寒潮来了，火塘和灶一天要烧两天的柴。" },
  { id: "fire", kind: "bad", seasons: ["夏", "秋"], weight: 0.6, when: (c) => c.dry && c.flammable >= 6, omen: "“天干物燥，院里的柴草堆离火塘远着点。”", text: "院里起了火，堆着的柴草烧掉了一片。" },
  { id: "quarrel", kind: "social", weight: 0.7, when: (c) => c.people >= 3 && c.mood < 6.5, text: "有两个人为一点小事吵了起来，谁也不理谁。" },
];

/** How well off the village is, −1 (struggling) … 1 (comfortable). */
export const comfort = ({ grain = 0, people = 1, mood = 6 }) =>
  Math.max(-1, Math.min(1, (grain / Math.max(1, people) - 3) / 5 + (mood - 6) / 4));

/** Today, maybe: an event, or nothing. ctx: day, lastEvent, difficulty, season, grain, people, mood, dry, flammable. */
export function pickEvent(ctx, random) {
  const d = DIFFICULTY[ctx.difficulty] ?? DIFFICULTY.寻常;
  const quiet = ctx.day - (ctx.lastEvent ?? -99);
  if (quiet < d.gap || random() > Math.min(0.85, 0.3 + 0.12 * (quiet - d.gap))) return null;
  const ease = comfort(ctx);                                    // well off: trouble comes; struggling: a break
  const weightOf = (e) => e.weight * (e.kind === "bad" ? d.bad * (1 + ease) : e.kind === "good" ? 1 - ease * 0.8 : 1);
  const open = EVENTS.filter((e) => (!e.seasons || e.seasons.includes(ctx.season)) && (!e.when || e.when(ctx)) && weightOf(e) > 0);
  const total = open.reduce((n, e) => n + weightOf(e), 0);
  if (!total) return null;
  let r = random() * total;
  for (const e of open) if ((r -= weightOf(e)) <= 0) return e;
  return open.at(-1);
}

/** How hard a bad event hits on this difficulty: a fraction, scaled. */
export const harm = (difficulty, base) => Math.min(0.9, base * (DIFFICULTY[difficulty] ?? DIFFICULTY.寻常).harm);
