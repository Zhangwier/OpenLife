// What to do next: a few first steps for someone new, learnt by doing (each passes the moment you've done it),
// then always the village's nearest goal on its ladder. Pure; app.js keeps the flags and draws the bar.
import { LADDER, condDone } from "./village.js";

export const FIRST_STEPS = [
  { id: "walk", text: "点一块空地走过去，或者直接拖着「你」走", done: (f) => f.walked },
  { id: "talk", text: "走到阿三身边，点他的牌，听他说两句", done: (f) => f.talked, hint: "san" },
  { id: "gather", text: "站到野果丛、芦苇荡或栗子树上，采点东西带在身上", done: (f) => f.carrying },
  { id: "eat", text: "饿了就吃：点院里的饭桌选「上桌吃饭」，或点开身上的吃的", done: (f) => f.ate, hint: "table" },
  { id: "book", text: "点开院里的工作台：看看能做什么。把料堆上去，人站上去就做", done: (f) => f.openedBook, hint: "workbench" },
  { id: "village", text: "点右上角 ☰ 里的「村子」：看看村子眼下要做到什么", done: (f) => f.openedVillage },
];

/** The first step not yet done, or null when they're all behind you (or skipped). */
export function guideStep(guide) {
  if (!guide || guide.done) return null;
  return FIRST_STEPS.find((s) => !s.done(guide.flags ?? {})) ?? null;
}

/** The village's nearest goal: the first unmet condition on the rung it's on. */
export function ladderGoal(rung, v) {
  const r = LADDER[rung];
  if (!r) return { rung: LADDER.length, name: "远行", text: "海那边的路也走通了", progress: null };
  const c = r.conds.find((x) => !condDone(x, v)) ?? r.conds[0];
  return { rung, name: r.name, text: c.text, progress: c.value ? progressWord(c.value(v), c.need) : null };
}
/** How far along, in words: nobody keeps a tally. */
export const progressWord = (have, need) => (have >= need ? "够了" : have / need < 0.34 ? "还差得远" : have / need < 0.67 ? "差一半上下" : "快够了");
