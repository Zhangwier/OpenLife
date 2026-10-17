/**
 * Hunger as plain numbers (split out of module.ts): how fast it grows and how
 * much one portion of each food eases it.
 */

/** Hunger grows by one point every HUNGER_DAYS_PER_POINT days since the last meal, capped at 10. */
export const HUNGER_DAYS_PER_POINT = 2;
export function hungerAt(base: number, since: number, tick: number, daysPerPoint = HUNGER_DAYS_PER_POINT): number {
  return Math.max(0, Math.min(10, base + Math.floor(Math.max(0, tick - since) / daysPerPoint)));
}

/**
 * Hunger eased by one portion: cooked food 4, millet cake 4, dried fish 3,
 * raw grain 2, fish 2. Keys are also the set of foods a resident may eat.
 */
export const HUNGER_EASED: Record<string, number> = {
  "resource:cooked": 4, "resource:millet-cake": 4, "resource:dried-fish": 3, "resource:grain": 2, "resource:fish": 2,
};
