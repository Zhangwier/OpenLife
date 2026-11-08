// Births and deaths in the wild: each kind has its season for young, how many to a litter, how long to grow up and
// how long it lives — and the wood feeds only so many. Ages are in game days (a year is 16). Pure; app.js spawns and
// removes the animals.

/** K: how many the land holds. adult: days to grow up. life: [from, to] days, the span over which old age comes.
 *  seasons: when young are born. litter: [min, max]. chance: of a grown female having young that season (rabbits:
 *  of a litter, each warm day, per pair). daily: litters come any warm day (rabbits) rather than once a year. */
export const LIFE = {
  deer:     { K: 16, adult: 16, life: [100, 150], seasons: ["春"], litter: [1, 2], chance: 0.95, young: "小鹿" },
  boar:     { K: 7, adult: 16, life: [80, 120], seasons: ["春"], litter: [2, 3], chance: 0.85, young: "小野猪" },
  goat:     { K: 10, adult: 16, life: [100, 150], seasons: ["春"], litter: [1, 1], chance: 0.65, young: "小山羊" },
  rabbit:   { K: 24, adult: 4, life: [28, 48], seasons: ["春", "夏"], litter: [1, 2], chance: 0.3, daily: true, young: "小兔" },
  fox:      { K: 4, adult: 16, life: [60, 100], seasons: ["春"], litter: [1, 2], chance: 0.5, young: "小狐狸" },
  wolf:     { K: 4, adult: 16, life: [80, 120], seasons: ["春"], litter: [1, 1], chance: 0.7, young: "小狼" },
  pheasant: { K: 24, adult: 8, life: [40, 70], seasons: ["春"], litter: [3, 6], chance: 0.7, young: "小野鸡" },
  bear:     { K: 1, adult: 32, life: [160, 220], seasons: [], litter: [1, 1], chance: 0, young: "小熊" },
  tiger:    { K: 1, adult: 32, life: [180, 240], seasons: [], litter: [1, 1], chance: 0, young: "小老虎" },
};

export const isYoung = (kind, age) => age < (LIFE[kind]?.adult ?? 0);

/** How many young a kind has today. animals: [{ sex, age, fed }] — a hungry mother has none. dayOfSeason: 1-based; once-a-year litters come on day 2.
 *  cap: the land's hold (defaults to K). */
export function births(kind, animals, { season, dayOfSeason, cap }, random) {
  const L = LIFE[kind], room = (cap ?? L?.K ?? 0) - animals.length;
  if (!L || room <= 0 || !L.seasons.includes(season)) return 0;
  const grown = animals.filter((a) => a.age >= L.adult), mothers = grown.filter((a) => a.sex === "female" && a.fed !== false), fathers = grown.some((a) => a.sex === "male");
  if (!mothers.length || !fathers) return 0;
  const litter = () => L.litter[0] + Math.floor(random() * (L.litter[1] - L.litter[0] + 1));
  let n = 0;
  if (L.daily) { for (let k = 0; k < Math.min(mothers.length, grown.length - mothers.length); k++) if (random() < L.chance) n += litter(); }
  else if (dayOfSeason === 2) for (const _ of mothers) if (random() < L.chance) n += litter();
  return Math.min(n, room);
}

/** Does this one die of old age today? Not before the first age of the span; surely by the last. */
export function diesOfAge(kind, age, random) {
  const L = LIFE[kind];
  if (!L || age < L.life[0]) return false;
  const p = Math.min(1, ((age - L.life[0]) / Math.max(1, L.life[1] - L.life[0])) * 0.25 + 0.02);
  return age >= L.life[1] || random() < p;
}

/** In winter the land holds fewer: how many too many there are. */
export const winterSurplus = (kind, count) => Math.max(0, count - Math.ceil((LIFE[kind]?.K ?? count) * 0.75));

// ---- Hunger ----
/** Hunger runs 0 (full) to 10 (starving). It climbs by itself; a mouthful at a patch of food takes some off. An
 *  animal eats when it's hungry enough, not at every patch it passes. Starving day after day, it dies. */
export const HUNGER = { perMinute: 1 / 150, bite: 4, eatsAt: 3, starving: 9.5, fedBelow: 6 };
const STARVE_DAYS = { fox: 4, wolf: 4, tiger: 5 };
/** At the day's end: one more day starving (or the count goes back to nought), and whether it dies of it. */
export function starveDay(kind, hunger, days = 0) {
  const n = hunger >= HUNGER.starving ? days + 1 : 0;
  return { days: n, dies: n >= (STARVE_DAYS[kind] ?? 3) };
}
