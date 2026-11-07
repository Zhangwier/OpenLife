// Adapted from archived settlement-locations/src/autonomy/npc-goals.ts.
// Pure, deterministic arbitration: decide intentions; CardWorld performs validated actions.
// The UI must never mistake an intention for an already completed action.
export function chooseNpcIntent(options, previous = null) {
  return options
    .filter((o) => o && typeof o.id === "string" && o.possible &&
      Number.isFinite(o.utility))
    .map((o) => ({ ...o, score: o.utility + (o.id === previous ? 0.35 : 0) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))[0] ?? null;
}
export function shortagePressure(available, reserve) {
  if (!Number.isFinite(available) || !Number.isFinite(reserve) || reserve <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((reserve - Math.max(0, available)) * 100 / reserve)));
}
export function chooseVillageAid({ grain = 0, cooked = 0, fish = 0, generosity = 0.5, canTravel = true, previous = null } = {}) {
  const shortage = shortagePressure(grain + cooked, 8);
  return chooseNpcIntent([
    { id: "resume-own-life", utility: 2.6, possible: true, because: "本职工作已经完成，继续休息或安排日常" },
    { id: "help-by-fishing", utility: shortage / 20 + Math.max(0, Math.min(1, generosity)) * 1.5,
      possible: canTravel && fish > 0, because: "公仓和灶上的吃食都不宽裕，湖里还能捕鱼补充" },
  ], previous);
}

// Each candidate sees public food locations it can reach and what it is actually carrying.
export function planNpcFood({ hunger, cooked = 0, granary = 0, reserve = 0, berries = 0, fish = 0, carry = null, route = {}, blocked, previous }) {
  const reachable = (site) => Number.isFinite(route[site]);
  const cost = (...sites) => sites.reduce((sum, site) => sum + (route[site] ?? 0), 0) / 120;
  const plans = [
    { id: "eat", steps: ["eat"], possible: cooked > 0 && reachable("stove"), utility: 9 + hunger - cost("stove"), because: "灶上有饭" },
    { id: "forage", steps: ["forage"], possible: berries > 0 && reachable("berries"), utility: 5 + hunger - cost("berries"), because: "附近有野果垫肚子" },
    { id: "use-grain", steps: ["cook", "eat"], possible: carry === "grain" && reachable("stove"), utility: 7 + hunger - cost("stove"), because: "手上有粟，可以煮一锅" },
    { id: "use-fish", steps: ["give", "eat"], possible: carry === "fish" && reachable("stove"), utility: 7 + hunger - cost("stove"), because: "手上有鱼，可以送上灶" },
    { id: "fetch-grain", steps: ["fetch", "cook", "eat"], possible: !carry && granary > reserve && reachable("granary") && reachable("stove"), utility: 4 + hunger - cost("granary", "stove"), because: "公仓留种后还有粮，可以取来煮" },
    { id: "fetch-fish", steps: ["fish", "give", "eat"], possible: !carry && fish > 0 && reachable("lake") && reachable("stove"), utility: 3 + hunger - cost("lake", "stove"), because: "公灶缺食，能去湖边捞鱼" },
  ];
  return chooseNpcIntent(plans.filter((plan) => plan.id !== blocked), previous);
}
