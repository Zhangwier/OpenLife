const SEASON_INDEX = { 春: 0, 夏: 1, 秋: 2, 冬: 3 };

export function nextSourcePulse(minute, id) {
  const dawn = Math.floor((minute - 360) / 1440) * 1440 + 360;
  const at = dawn + 20 + (Math.abs(id * 97) % 820);
  return at > minute ? at : at + 1440;
}

// Capacity and daily renewal in spring, summer, autumn and winter.
const RULES = {
  chestnut: { cap: [8, 10, 10, 4], grow: [2, 2, 2, 0], wait: 3, plant: "tree" },        // a stand of trees: each unit a tree to fell
  pineGrove: { cap: [10, 12, 12, 10], grow: [2, 2, 2, 1], wait: 4, plant: "pine" },     // the deep wood's old pines
  berries: { cap: [5, 7, 5, 0], grow: [2, 3, 2, 0], wait: 2, wet: 1, dry: true, plant: "berry" },
  hemp: { cap: [6, 7, 5, 0], grow: [2, 2, 1, 0], wait: 2, wet: 1, dry: true, plant: "reeds" },
  herbs: { cap: [4, 5, 3, 0], grow: [1, 2, 1, 0], wait: 2, wet: 1, dry: true, plant: "herb" },
  reeds: { cap: [5, 7, 5, 0], grow: [2, 2, 1, 0], wait: 2, wet: 1, plant: "reeds" },
  peach: { cap: [0, 7, 4, 0], grow: [0, 3, 1, 0], wait: 2, dry: true, plant: "fruit" },
  jujube: { cap: [0, 0, 7, 0], grow: [0, 0, 3, 0], wait: 2, dry: true, plant: "fruit" },
  lake: { cap: [9, 7, 9, 3], grow: [1, 1, 2, 1], wait: 1 },
  nest: { cap: [4, 4, 3, 0], grow: [2, 2, 1, 0], wait: 1 },
  shallows: { cap: [6, 7, 6, 3], grow: [1, 2, 1, 1], wait: 2 },
  saltPan: { cap: [3, 6, 5, 2], grow: [1, 2, 2, 1], wait: 3 },                            // the sun dries it; most salt in summer
  shellBank: { cap: [5, 5, 6, 4], grow: [1, 1, 1, 1], wait: 2 },
  pit: { cap: [6, 6, 6, 6], grow: [1, 1, 1, 1], wait: 2, wet: 1 },
  scree: { cap: [6, 6, 6, 6], grow: [1, 1, 1, 1], wait: 2 },
  mineFace: { cap: [7, 7, 7, 7], grow: [2, 2, 2, 2], wait: 1 },
  flintVein: { cap: [5, 5, 5, 5], grow: [1, 1, 1, 1], wait: 2 },
  copperRock: { cap: [3, 3, 3, 3], grow: [1, 1, 1, 1], wait: 3, alternate: true },
  mushrooms: { cap: [3, 2, 6, 0], grow: [1, 0, 2, 0], wait: 1, wet: 2 },                // after rain, and most in autumn
  hive: { cap: [2, 4, 4, 1], grow: [1, 1, 1, 0], wait: 4 },                              // wild honey, a little at a time
};

export const naturalSource = (key) => Object.hasOwn(RULES, key);
/** How grown a stand of chestnuts/pines is, by how much of the season's capacity stands: thin, young, mature, old. */
export const treeStage = (stock, cap) => {
  if (!cap || !stock) return "empty";
  const r = stock / cap;
  return r <= 0.25 ? "sapling" : r <= 0.5 ? "young" : r <= 0.8 ? "mature" : "old";
};
/** What one felling gives from that stand: 1 for saplings up to 3 for old growth, with an axe one more. */
export const treeYield = (stock, cap, axe = false) => {
  if (!cap || !stock) return 0;
  const r = stock / cap, base = r <= 0.25 ? 1 : r <= 0.5 ? 2 : r <= 0.8 ? 3 : 4;
  return Math.min(4, base + (axe ? 1 : 0));
};
export const sourceWait = (key) => RULES[key].wait;
export const sourcePlant = (key) => RULES[key].plant;

export function sourceCapacity(key, { season, weather, frostProne, winterDay }) {
  if (key === "chestnut" && frostProne && season === "冬" && (weather === "雪" || winterDay >= 2)) return 0;
  return RULES[key].cap[SEASON_INDEX[season]];
}

export function sourceNextStock(key, stock, conditions) {
  const cap = sourceCapacity(key, conditions);
  const { season, weather, drought, flood, day, readyDay } = conditions;
  if (!cap || (!stock && day < (readyDay ?? day))) return 0;
  const rule = RULES[key];
  let delta = rule.grow[SEASON_INDEX[season]];
  if (key === "nest" && conditions.nesting === false) delta = 0;
  if (rule.alternate && day % 2) delta = 0;
  if (weather === "雨") delta += rule.wet ?? 0;
  if (drought && rule.dry) delta = -1;
  if (key === "lake" && flood) delta += 2;
  return Math.max(0, Math.min(cap, stock + delta));
}

export function sourceStage(key, stock, conditions) {
  const { season, weather, flood } = conditions;
  if (flood && ["reeds", "nest", "pit"].includes(key)) return "flooded";
  if (!stock) {
    if (key === "chestnut" && season === "冬" && sourceCapacity(key, conditions) === 0) return "frostdead";
    return season === "冬" && sourcePlant(key) && key !== "pineGrove" ? "dormant" : "empty";
  }
  if (key === "pineGrove" && (season === "冬" || weather === "雪")) return "snowgreen";
  if (key === "chestnut" && season === "冬") return "bare";
  if (key === "chestnut" || key === "pineGrove") return treeStage(stock, sourceCapacity(key, conditions));
  if (weather === "雨" && ["pit", "lake", "reeds"].includes(key)) return "wet";
  return stock / sourceCapacity(key, conditions) <= 0.34 ? "sparse" : "full";
}
