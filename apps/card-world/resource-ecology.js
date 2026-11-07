const SEASON_INDEX = { 春: 0, 夏: 1, 秋: 2, 冬: 3 };

export function nextSourcePulse(minute, id) {
  const dawn = Math.floor((minute - 360) / 1440) * 1440 + 360;
  const at = dawn + 20 + (Math.abs(id * 97) % 820);
  return at > minute ? at : at + 1440;
}

// Capacity and daily renewal in spring, summer, autumn and winter.
const RULES = {
  chestnut: { cap: [4, 5, 5, 2], grow: [1, 1, 1, 0], wait: 3, plant: "tree" },
  pineGrove: { cap: [4, 5, 5, 4], grow: [1, 1, 1, 1], wait: 4, plant: "pine" },
  berries: { cap: [5, 7, 5, 0], grow: [2, 3, 2, 0], wait: 2, wet: 1, dry: true, plant: "berry" },
  hemp: { cap: [6, 7, 5, 0], grow: [2, 2, 1, 0], wait: 2, wet: 1, dry: true, plant: "reeds" },
  herbs: { cap: [4, 5, 3, 0], grow: [1, 2, 1, 0], wait: 2, wet: 1, dry: true, plant: "herb" },
  reeds: { cap: [5, 7, 5, 0], grow: [2, 2, 1, 0], wait: 2, wet: 1, plant: "reeds" },
  peach: { cap: [0, 7, 4, 0], grow: [0, 3, 1, 0], wait: 2, dry: true, plant: "fruit" },
  jujube: { cap: [0, 0, 7, 0], grow: [0, 0, 3, 0], wait: 2, dry: true, plant: "fruit" },
  lake: { cap: [9, 7, 9, 3], grow: [1, 1, 2, 1], wait: 1 },
  nest: { cap: [4, 4, 3, 0], grow: [2, 2, 1, 0], wait: 1 },
  shallows: { cap: [6, 7, 6, 3], grow: [1, 2, 1, 1], wait: 2 },
  pit: { cap: [6, 6, 6, 6], grow: [1, 1, 1, 1], wait: 2, wet: 1 },
  scree: { cap: [6, 6, 6, 6], grow: [1, 1, 1, 1], wait: 2 },
  mineFace: { cap: [7, 7, 7, 7], grow: [2, 2, 2, 2], wait: 1 },
  flintVein: { cap: [5, 5, 5, 5], grow: [1, 1, 1, 1], wait: 2 },
  copperRock: { cap: [3, 3, 3, 3], grow: [1, 1, 1, 1], wait: 3, alternate: true },
};

export const naturalSource = (key) => Object.hasOwn(RULES, key);
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
  if (weather === "雨" && ["pit", "lake", "reeds"].includes(key)) return "wet";
  return stock / sourceCapacity(key, conditions) <= 0.34 ? "sparse" : "full";
}
