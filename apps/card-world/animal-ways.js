// Spacing is in map pixels and allows for the cards (112 wide): close, but each one still readable.
// How each animal lives: alone or in a group, when it's up and about, and how a group keeps together — a loose flock
// round the leader, or a line of young behind their mother. Pure; app.js moves the cards.

/** group: "flock" (moves together round a leader) or "alone". active(h): hours it's up and feeding; the rest it lies up. */
/** How fast each goes, against a person walking (1): its everyday walk, and its run — fleeing, charging, a tiger's
 *  rush. A tiger also stalks (slower than its walk) and trots when it ranges hungry; a duck swims. */
export const GAIT = {
  rabbit: { walk: 0.35, run: 2.6 },
  deer: { walk: 0.5, run: 3 },
  goat: { walk: 0.45, run: 2.4 },
  fox: { walk: 0.55, run: 2.4 },
  pheasant: { walk: 0.3, run: 4 },                                   // flushed, it flies
  boar: { walk: 0.45, run: 2.3 },
  bear: { walk: 0.4, run: 2 },
  wolf: { walk: 0.55, stalk: 0.28, trot: 1.15, run: 3.6 },                // a pack runs its quarry down over distance
  tiger: { walk: 0.5, stalk: 0.22, trot: 1.2, lope: 1.9, run: 5.5 },   // the rush: twice a deer's run, for a short burst
  duck: { walk: 0.3, swim: 0.7, run: 2.5 },
};
/** One awake block per animal, not a dawn-and-dusk split: most game animals read better with one long sleep. */
export const AWAKE = {
  duck: [5.5, 20], deer: [5.5, 21], goat: [5.5, 20.5], pheasant: [5.5, 19.5], bear: [6, 20],
  rabbit: [17, 8], boar: [16, 7], wolf: [17, 7], tiger: [17, 7], fox: [16, 8],
};
const inHours = (h, [a, b]) => (a < b ? h >= a && h < b : h >= a || h < b);
export const HABITS = {
  duck:   { group: "flock", spacing: 125, active: (h) => inHours(h, AWAKE.duck) },                     // day on the water, night ashore
  deer:   { group: "flock", spacing: 150, active: (h) => inHours(h, AWAKE.deer) },                     // one long day out of the wood
  goat:   { group: "flock", spacing: 135, active: (h) => inHours(h, AWAKE.goat) },
  rabbit: { group: "alone", active: (h) => inHours(h, AWAKE.rabbit) },                                 // one long night
  boar:   { group: "alone", active: (h) => inHours(h, AWAKE.boar) },
  wolf:   { group: "flock", spacing: 135, active: (h) => inHours(h, AWAKE.wolf) },
  tiger:  { group: "alone", active: (h) => inHours(h, AWAKE.tiger) },
  fox:    { group: "alone", active: (h) => inHours(h, AWAKE.fox) },
  pheasant: { group: "flock", spacing: 115, active: (h) => inHours(h, AWAKE.pheasant) },
  bear:   { group: "alone", active: (h) => inHours(h, AWAKE.bear) },                                   // and asleep all winter
};
export const isActive = (kind, hour) => HABITS[kind]?.active(hour) ?? true;

/** The complement of the awake block: one long sleep, so they don't doze, wake, walk and doze again in the same day. */
export const ASLEEP = Object.fromEntries(Object.keys(AWAKE).map((kind) => [kind, (h) => !inHours(h, AWAKE[kind])]));
export const isAsleep = (kind, hour) => ASLEEP[kind]?.(hour) ?? false;

/** How long an animal lies still before it stirs — a step, a look up, a new bed (game minutes): [shortest, longest]. */
export const STIR = { duck: [15, 35], deer: [20, 45], goat: [25, 50], rabbit: [30, 60], boar: [25, 55], fox: [30, 60], wolf: [20, 45], tiger: [20, 45], pheasant: [18, 40], bear: [30, 60] };
export const stirAfter = (kind, random) => { const [a, b] = STIR[kind] ?? [25, 50]; return a + random() * (b - a); };

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

/** A behaviour as a share of the gait it belongs to: a mouthful and a step, a wary creep, a barely-moving drift on
 *  the water, dabbling along the margins, scrambling up the bank. Running, stalking, trotting and swimming are the
 *  animal's own (GAIT). */
const SHARE = { graze: 0.45, creep: 0.85, drift: 0.15, dabble: 0.4, shore: 1.5 };
/** How fast an animal goes at a given thing, as a multiple of a person walking. The one source every branch that moves
 *  a wild animal reads from, so a deer moves like a deer whether it grazes, flees, or keeps up with the herd.
 *  act: "walk" (default), "graze", "creep", "drift", "dabble", "shore", "stalk", "trot", "swim", "run". */
export function paceOf(kind, act = "walk") {
  const g = GAIT[kind] ?? { walk: 0.6, run: 2 };
  if (act === "run") return g.run;
  if (act === "stalk") return g.stalk ?? g.walk;
  if (act === "trot") return g.trot ?? g.walk;
  if (act === "lope") return g.lope ?? g.trot ?? g.walk;
  if (act === "swim") return g.swim ?? g.walk;
  if (act === "graze") return Math.max(0.2, g.walk * SHARE.graze);          // the smallest birds still peck along
  if (act === "drift" || act === "dabble") return (g.swim ?? g.walk) * SHARE[act];
  if (act === "creep" || act === "shore") return g.walk * SHARE[act];
  return g.walk;
}

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
