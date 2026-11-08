// Building in steps — foundation, walls, roof — and the know-how to lead the work. Pure rules; app.js does the rest.

/** Each building goes up in steps. A step takes its own materials, then its own work (game minutes). */
export const BUILD_STAGES = {
  wall: [{ name: "砌墙", needs: { wattle: 1, clay: 1 }, work: 60, thaw: true }],   // one length of wall (walls.js SEG_COST)
  bighouse: [
    { name: "打地基", needs: { stone: 6, clay: 2 }, work: 360 },
    { name: "砌墙", needs: { log: 8, clay: 2 }, work: 600 },
    { name: "上屋顶", needs: { reed: 8, rope: 3, log: 2 }, work: 480 },
  ],
  barn: [
    { name: "打地基", needs: { stone: 3 }, work: 180 },
    { name: "立墙", needs: { log: 4 }, work: 180 },
    { name: "上屋顶", needs: { reed: 6, log: 2 }, work: 120 },
  ],
  hut: [
    { name: "打地基", needs: { stone: 2 }, work: 120 },
    { name: "立墙", needs: { log: 4 }, work: 240 },
    { name: "苫顶", needs: { reed: 4, rope: 1 }, work: 120 },
  ],
  farm: [
    { name: "清理荒地", needs: {}, work: 120 },
    { name: "翻地", needs: {}, work: 240, tool: "hoe", thaw: true },
  ],
  granaryPit: [
    { name: "挖窖", needs: {}, work: 180, thaw: true },
    { name: "铺石", needs: { stone: 4 }, work: 120 },
    { name: "盖顶", needs: { log: 2 }, work: 60 },
  ],
  calendarStick: [{ name: "立竿", needs: { log: 1, stone: 1 }, work: 60 }],
  chest: [
    { name: "刨板", needs: { log: 3 }, work: 120 },
    { name: "箍箱", needs: { rope: 1 }, work: 60 },
  ],
  compost: [
    { name: "挖坑", needs: {}, work: 180, thaw: true },
    { name: "围石", needs: { stone: 2 }, work: 60 },
  ],
  cellar: [
    { name: "挖窖", needs: {}, work: 240, thaw: true },
    { name: "砌石", needs: { stone: 4 }, work: 120 },
    { name: "盖顶", needs: { log: 2, reed: 2 }, work: 60 },
  ],
  boat: [                                                                     // a dugout: one big log, hollowed with axe and fire
    { name: "选一根粗木头", needs: { log: 3 }, work: 120 },
    { name: "烧掏船膛", needs: { wood: 2 }, work: 300, tool: "axe" },
    { name: "削桨、补缝", needs: { log: 1, reed: 2 }, work: 120 },
  ],
};

/** Everything a building takes, all steps together. */
export function totalNeeds(stages) {
  const out = {};
  for (const s of stages) for (const [k, n] of Object.entries(s.needs)) out[k] = (out[k] ?? 0) + n;
  return out;
}
export const totalWork = (stages) => stages.reduce((n, s) => n + s.work, 0);

/** The steps a foundation follows: its own (an old single-step save) or the kind's. */
export const stagesOf = (plot) => plot.stages ?? BUILD_STAGES[plot.build];
export const stageOf = (plot) => stagesOf(plot)[plot.stage ?? 0];
/** Whether you can tell what the current step wants: you know the craft, or someone talked you through this step.
 *  hints: what you were told, by foundation id — the craft itself stays unknown. */
export const stepKnown = (c, known, hints) => c.build === "farm" || Boolean(known?.[c.build])
  || (hints?.[c.id]?.kind === c.build && hints[c.id]?.stage === (c.stage ?? 0));

/** Put work into the current step. Returns what happened: still going, a step finished, or the whole thing done. */
export function addWork(plot, minutes) {
  const stages = stagesOf(plot), s = stages[plot.stage ?? 0];
  plot.work = (plot.work ?? 0) + minutes;
  if (plot.work < s.work) return "working";
  if ((plot.stage ?? 0) + 1 >= stages.length) return "done";
  plot.stage = (plot.stage ?? 0) + 1; plot.work = 0; plot.need = { ...stages[plot.stage].needs };
  return "stage";
}

/** What has gone into a foundation so far: every finished step, and what was handed in on this one. */
export function delivered(plot) {
  const stages = stagesOf(plot), out = {}, at = plot.stage ?? 0;
  stages.forEach((s, i) => {
    if (i > at) return;
    for (const [k, n] of Object.entries(s.needs)) out[k] = (out[k] ?? 0) + (i < at ? n : n - (plot.need?.[k] ?? 0));
  });
  return out;
}

// ---- Know-how ----
export const LEAD = 0.3;          // enough know-how to lead the work
/** One session of building. A practised hand always gets on; a new one sometimes has to pull it down and start again. */
export function buildSession(skill, random) {
  if (skill < LEAD) return { minutes: 0, gain: 0, failed: false, unable: true };
  const failed = random() > 0.5 + skill / 2;
  return { minutes: failed ? 60 : 240, gain: failed ? 0.05 : 0.15, failed, unable: false };
}
/** Lending a hand where someone who knows how has been at it today: half the work, and you pick it up as you go. */
export const helpSession = () => ({ minutes: 120, gain: 0.1 });
export const raiseSkill = (skill, gain) => Math.min(1, (skill ?? 0) + gain);
