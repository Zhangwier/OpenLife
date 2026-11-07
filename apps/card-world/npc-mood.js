// How someone feels, and why: a handful of plain feelings (a hot meal, a cold night, too much work, a new building
// in the village) add up to a mood that drifts towards their sum. Low spirits slow the work, and past a point
// someone downs tools for half a day. Pure rules; app.js gathers the facts and applies the effects.

export const BASE_MOOD = 6;

/** The feelings someone has right now, each with what they'd say about it. */
export function moodlets(f) {
  const out = [];
  const add = (id, value, text) => out.push({ id, value, text });
  if (f.starving) add("starving", -3, "一整天没吃上东西");
  else if (f.hungry) add("hungry", -1.5, "肚子饿着");
  else if (f.ateHot) add("hot-meal", 0.8, "今天吃了口热饭");
  if (f.cold) add("cold", -1.5, "火塘夜里老灭，冻得睡不着");
  if (f.worked >= 600) add("overworked", -1.5, "从早忙到黑，没歇口气");
  else if (f.worked >= 420) add("busy", -0.5, "今天活不少");
  if (f.chatted) add("chatted", 0.5, "跟人说了会儿话");
  if (f.lowGrain) add("low-grain", -1.5, "公仓快见底了，心里发慌");
  if (f.goodHarvest) add("harvest", 1, "今年收成不错");
  if (f.newBuilding) add("built", 1, `村里新添了${f.newBuilding}`);
  if (f.mourning) add("mourning", -2, `${f.mourning}走了，心里空落落的`);
  if (f.festival) add("festival", 1.5, "刚过了节");
  if (f.friend) add("friend", 0.5, "跟你处得不错");
  if (f.grudge) add("grudge", -1, "跟你心里有疙瘩");
  if (f.wet) add("wet", -0.5, "淋了一身雨");
  if (f.sick) add("sick", -1.5, "身上发烧，没力气");
  if (f.floor) add("floor", -1, "没铺位，睡在地上，腰酸背疼");
  return out;
}

export const moodTarget = (list) => Math.max(0, Math.min(10, BASE_MOOD + list.reduce((n, m) => n + m.value, 0)));

/** Mood follows its target slowly: about a third of the way in three hours. */
export const moodStep = (mood, target, minutes) => mood + (target - mood) * Math.min(1, minutes / 480);

/** How long work takes: glum hands are slow, cheerful ones a little quicker. */
export const moodPace = (mood) => (mood < 3 ? 1.3 : mood > 7.5 ? 0.9 : 1);

/** Past this they put down their work for a while. */
export const BREAK_AT = 1.5;

/** The feeling weighing on them most, for when a friend asks. */
export const worst = (list) => list.filter((m) => m.value < 0).sort((a, b) => a.value - b.value)[0] ?? null;
