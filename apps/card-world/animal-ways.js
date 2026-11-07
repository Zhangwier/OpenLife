// Spacing is in map pixels and allows for the cards (112 wide): close, but each one still readable.
// How each animal lives: alone or in a group, when it's up and about, and how a group keeps together — a loose flock
// round the leader, or a line of young behind their mother. Pure; app.js moves the cards.

/** group: "flock" (moves together round a leader) or "alone". active(h): hours it's up and feeding; the rest it lies up. */
export const HABITS = {
  duck:   { group: "flock", spacing: 125, active: (h) => h >= 5.5 && h < 19.5 },                       // by day on the water; nights ashore
  deer:   { group: "flock", spacing: 150, active: (h) => (h >= 4.5 && h < 9) || (h >= 16 && h < 20.5) }, // dawn and dusk at the wood's edge
  goat:   { group: "flock", spacing: 135, active: (h) => h >= 6 && h < 18 },                           // by day up on the plateau
  rabbit: { group: "alone", active: (h) => (h >= 4.5 && h < 8.5) || h >= 17 || h < 2 },                // dawn, dusk and the first of the night
  boar:   { group: "alone", active: (h) => h >= 17 || h < 5 },                                         // an old boar keeps to himself, out at dusk and night
  tiger:  { group: "alone", active: (h) => h >= 17.5 || h < 7 },                                       // hunts from dusk to dawn
};
export const isActive = (kind, hour) => HABITS[kind]?.active(hour) ?? true;

/** The one the rest follow: the oldest (earliest born; ties to the lowest id). */
export const leaderOf = (members) =>
  members.slice().sort((a, b) => (a.born ?? 0) - (b.born ?? 0) || a.id - b.id)[0] ?? null;

/** The i-th follower's place (i ≥ 1) in a loose flock: fanned out behind and beside the leader, by the way it's facing. */
export function flockSlot(leader, heading, i, spacing) {
  const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
  const back = row * spacing * 0.8, across = side * spacing * (0.55 + 0.15 * row);
  const cos = Math.cos(heading), sin = Math.sin(heading);
  return { x: leader.x - cos * back - sin * across, y: leader.y - sin * back + cos * across };
}

/** A place in a line: just behind the one in front, along the way it's going. */
export const fileSlot = (front, heading, spacing) => ({ x: front.x - Math.cos(heading) * spacing, y: front.y - Math.sin(heading) * spacing });

/** How fast a follower goes: its own pace, faster when it's fallen behind, no faster than it can. */
export const catchUp = (gap, spacing) => (gap > spacing * 3 ? 1.8 : gap > spacing * 1.5 ? 1.3 : 1);

// ---- A flock of ducks through the day ----
// What a mallard flock does with its time: mostly dabbling along the margins (paddling slowly on, heads down, hardly
// ever still), now and then crossing open water to another stretch of shore, walking up the bank to graze and then
// standing to preen, and loafing at midday. Nights they sit quietly on the water by the reeds.
const DUCK_DAY = [
  { until: 9, weights: { dabble: 0.45, graze: 0.35, cross: 0.2 } },
  { until: 11, weights: { dabble: 0.5, cross: 0.2, loaf: 0.3 } },
  { until: 15, weights: { loaf: 0.55, dabble: 0.35, cross: 0.1 } },
  { until: 18, weights: { dabble: 0.4, graze: 0.35, cross: 0.25 } },
  { until: 24, weights: { dabble: 0.6, cross: 0.4 } },
];
/** How long each lasts, in game minutes: [shortest, longest]. */
export const DUCK_SPELL = { dabble: [40, 90], cross: [10, 25], graze: [30, 55], preen: [12, 25], loaf: [40, 90], roost: [60, 120] };

/** The next thing the flock does: roosting at night, otherwise by the hour's habits. */
export function duckPlan(hour, random) {
  if (hour < 5.5 || hour >= 19.5) return "roost";
  const w = DUCK_DAY.find((d) => hour < d.until).weights, total = Object.values(w).reduce((n, x) => n + x, 0);
  let r = random() * total;
  for (const [k, v] of Object.entries(w)) if ((r -= v) <= 0) return k;
  return "dabble";
}
export const spellLength = (act, random) => { const [a, b] = DUCK_SPELL[act]; return a + random() * (b - a); };

/** The next point along a ring of shore points, going one way round; wraps at the ends. */
export const alongShore = (index, dir, count) => (((index + dir) % count) + count) % count;
