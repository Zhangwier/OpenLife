// The land remembers and the wild answers back: soil that tires and recovers, rabbits that follow the food,
// a tiger that leaves the deep wood when its deer are gone, bare hillsides that send the spring water down fast.
// Pure rules; app.js applies them to the board.

// ---- Fields ----
export const SOIL_MAX = 4;
export const SOIL_START = 3;
export const SOIL_WORDS = ["种乏了", "薄", "平常", "肥", "很肥"];
export const SEEDS = ["bean", "grain"];                // what can go in the ground

export const soilOf = (field) => field.soil ?? SOIL_START;

/** Grain or beans at harvest: each step of growth is worth more on good ground. */
export function harvestYield(field) {
  const n = field.stock ?? 0, soil = soilOf(field);
  if (n < 1) return 0;
  return soil === 0 ? Math.ceil(n / 2) : n * [1, 1, 2, 2, 3][soil];
}

/** Millet takes from the ground; beans give back. */
export function soilAfterHarvest(field) {
  const soil = soilOf(field);
  return field.crop === "bean" ? Math.min(SOIL_MAX, soil + 2) : Math.max(0, soil - 1);
}

/** At the turn of winter: ground that nothing was taken from this year rests and recovers a little. */
export const soilAtWinter = (field) => (field.cropped ? soilOf(field) : Math.min(SOIL_MAX, soilOf(field) + 1));

/** How many dry summer days a crop stands before it wilts: beans root deep. */
export const droughtDays = (field) => (field.crop === "bean" ? 6 : 4);

// ---- Rabbits ----
/** As many rabbits as the berries and standing crops can feed. */
export const rabbitCap = (forage) => Math.max(1, Math.min(6, 2 + Math.floor(forage / 5)));

/** Which fields lose a step of growth to rabbits tonight. A dog about the place keeps most of them off;
 *  a field's own scarecrow or fence (f.guard, a multiplier) keeps off more. */
export function rabbitRaid({ rabbits, guarded, season }, fields, random) {
  if (!rabbits || season === "冬") return [];
  const chance = Math.min(0.35, 0.06 * rabbits) * (guarded ? 0.4 : 1);
  return fields.filter((f) => f.sown !== false && (f.stock ?? 0) >= 1 && random() < chance * (f.guard ?? 1));
}
/** How much of the rabbits' chance a field's protection leaves. */
export const FIELD_GUARD = { scarecrow: 0.4, fence: 0.15 };
export const fieldGuard = (kit) => Math.min(1, ...kit.map((k) => FIELD_GUARD[k] ?? 1));

// ---- The tiger ----
export const TIGER_PROWL = 12;                         // hunger at which it leaves the deep wood
export const PROWL_PREY = ["boar", "goat", "rabbit", "dog"];

// ---- Hillsides ----
export const BARE_HILLS = 5;
/** Felled ground, remembered: stumps add to it each day, regrowth wears it down. */
export const fellingNext = (felled, stumps) => Math.min(30, (felled ?? 0) * 0.85 + stumps);
/** Wet days before the lake overtops its banks: sooner when the hills are bare. */
export const floodAfter = (felled) => ((felled ?? 0) >= BARE_HILLS ? 1 : 2);
