/**
 * Public calendar vocabulary for life modules (TIME-RFC-001).
 *
 * One kernel tick, two readings. The profile a world pack registers decides
 * which reading is authoritative (M1.2-B):
 *
 *   - the **day scale** is what player-facing actions cost. Fetching water or
 *     holding a conversation is one day, not one month.
 *   - the **month scale** is the legacy reading a save written before
 *     TIME-RFC-001 keeps. It is preserved for old saves and for modules that
 *     were authored against `TICKS_PER_YEAR = 12`.
 *
 * 鲁Rule (M1.2-B): no module may divide a raw tick by a constant of its own.
 * Ageing, seasons and annual events must read time from the world clock, which
 * is the only holder of the world's declared scale.
 *
 * This package owns vocabulary only. It reads no world state and mutates none.
 */

/** Day ticks in one month. The day/month aggregation boundary. */
export const DAYS_PER_MONTH = 30;
/** Months in one year. */
export const MONTHS_PER_YEAR = 12;
/** Day ticks in one year. */
export const DAY_TICKS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR;
/** Day ticks in one month; alias of `DAYS_PER_MONTH` that reads better in code. */
export const DAY_TICKS_PER_MONTH = DAYS_PER_MONTH;

/**
 * The time scale a world's ticks are counted in.
 *
 * `day` is the current life scenario. `month` is what a pre-TIME-RFC-001 save
 * means by its tick, and is preserved rather than converted (TIME-RFC-001 搂5).
 */
export type TimeScale = "day" | "month" | "year";

/**
 * Kernel ticks in one unit, per scale.
 *
 * This table is the single place that knows how many ticks a world's year is
 * worth. Nothing else may hard-code 12 or 360.
 */
export const TICKS_PER_UNIT: Readonly<Record<TimeScale, number>> = {
  day: 1,
  month: DAYS_PER_MONTH,
  year: DAY_TICKS_PER_YEAR,
};

/**
 * Kernel ticks in one **year** at the historical (month) scale.
 *
 * Re-exported from `./modern.ts`, which stays the single definition so that a
 * star export of this package cannot produce two sources for one name. Kept at
 * 12 so an old save keeps its meaning; see TIME-RFC-001 搂3.1.
 *
 * New code should prefer `ticksPerYearOfScale` and never assume this constant.
 */
export { TICKS_PER_YEAR, TICKS_PER_MONTH } from "./modern.ts";

/** Ticks in one year for a given scale. The only correct way to get this. */
export function ticksPerYearOfScale(scale: TimeScale): number {
  return TICKS_PER_UNIT.year / TICKS_PER_UNIT[scale];
}

/** Ticks in one month for a given scale. */
export function ticksPerMonthOfScale(scale: TimeScale): number {
  return TICKS_PER_UNIT.month / TICKS_PER_UNIT[scale];
}

/** Scales a duration expressed in `scale` units into the given scale's units. */
export function convertUnits(value: number, from: TimeScale, to: TimeScale): number {
  return (value * TICKS_PER_UNIT[from]) / TICKS_PER_UNIT[to];
}

/** Converts a day-scale duration into kernel ticks. */
export function daysToTicks(days: number): number {
  return Math.max(0, Math.round(days));
}

/** Converts a month-scale duration into kernel ticks. */
export function monthsToTicks(months: number): number {
  return Math.max(0, Math.round(months * DAYS_PER_MONTH));
}

/** Converts kernel ticks into whole elapsed days. */
export function ticksToDays(ticks: number): number {
  return Math.max(0, Math.floor(ticks));
}

/**
 * How many months have elapsed from tick 0 to `tick`.
 *
 * This is the scale `yearOfTick`, ageing and every pre-existing annual rule use.
 */
export function monthsElapsed(tick: number): number {
  return Math.floor(tick / DAYS_PER_MONTH);
}

/**
 * The month-scale equivalent of a day-scale tick.
 *
 * Used wherever a module needs to keep the old "one tick = one month" reading
 * while the world now advances by days: `monthTick = monthOfTick(dayTick)`.
 */
export function monthOfTick(tick: number): number {
  return monthsElapsed(tick);
}

/**
 * The day-scale tick at which a given month-scale tick begins.
 *
 * `monthOfTick(dayOfMonthTick(m)) === m` for every non-negative `m`.
 */
export function dayOfMonthTick(monthTick: number): number {
  return monthTick * DAYS_PER_MONTH;
}

/** Day within the current month, 1..30. */
export function dayOfMonth(tick: number): number {
  return (tick % DAYS_PER_MONTH) + 1;
}

/** Month within the current year, 1..12 (month scale). */
export function monthOfYear(tick: number): number {
  return (monthsElapsed(tick) % MONTHS_PER_YEAR) + 1;
}

/** Season name for a month-scale tick, by months 3-5 / 6-8 / 9-11 / 12-2. */
export function seasonOfTick(tick: number): string {
  const month = monthOfYear(tick);
  if (month >= 3 && month <= 5) return "春";
  if (month >= 6 && month <= 8) return "夏";
  if (month >= 9 && month <= 11) return "秋";
  return "冬";
}

// ---------------------------------------------------------------------------
// Scale-aware readings (M1.2-B)
//
// Everything below takes the world's declared scale explicitly. They exist so
// that no consumer has to divide a raw tick by a constant of its own, which is
// what produced the 30x era drift the M1.1 audit found.
// ---------------------------------------------------------------------------

/** Whole units of `scale` that `tick` represents. */
export function unitsElapsed(tick: number, scale: TimeScale): number {
  const perUnit = TICKS_PER_UNIT[scale];
  return perUnit > 0 ? Math.floor(Math.max(0, tick) / perUnit) : 0;
}

/**
 * Whole years elapsed at the world's declared scale.
 *
 * This is the one correct answer to "how many years is this tick worth".
 * `world-clock` computes it from its declared profile; other modules read it
 * rather than recomputing.
 */
export function yearsElapsedAt(tick: number, scale: TimeScale): number {
  return Math.floor(Math.max(0, tick) / ticksPerYearOfScale(scale));
}

/**
 * A character's age in years, given a birth tick, at the world's scale.
 *
 * Ageing must never assume the month scale: at the day scale a 360-tick-old
 * character is one year old, not thirty.
 */
export function ageInYearsAt(bornAt: number, now: number, scale: TimeScale): number {
  return Math.floor(Math.max(0, now - bornAt) / ticksPerYearOfScale(scale));
}

/**
 * Converts a duration expressed in world years into kernel ticks at `scale`.
 *
 * Annual scheduling uses this instead of `N * TICKS_PER_YEAR`, so the same
 * source says "one year" in every world.
 */
export function yearsToTicksAt(years: number, scale: TimeScale): number {
  return Math.round(years * ticksPerYearOfScale(scale));
}

/** Converts a duration expressed in world months into kernel ticks at `scale`. */
export function monthsToTicksAt(months: number, scale: TimeScale): number {
  return Math.round(months * ticksPerMonthOfScale(scale));
}

/**
 * A player-facing duration description.
 *
 * Deliberately qualitative above a season; TIME-001 asks for an understandable
 * scale, not false precision about a month that is not over yet.
 */
export function describeDuration(days: number): string {
  const whole = Math.max(0, Math.round(days));
  if (whole === 0) return "片刻";
  if (whole === 1) return "一天";
  if (whole < DAYS_PER_MONTH) return `${whole} 天`;
  const months = Math.round(whole / DAYS_PER_MONTH);
  if (months < MONTHS_PER_YEAR) return `${months} 个月`;
  const years = Math.floor(months / MONTHS_PER_YEAR);
  const rest = months % MONTHS_PER_YEAR;
  return rest === 0 ? `${years} 年` : `${years} 年 ${rest} 个月`;
}

/**
 * Converts a pre-TIME-RFC-001 timestamp (where one tick was one month) into the
 * day scale. Only used by explicit, player-visible migration.
 */
export function legacyTickToDayTick(legacyTick: number): number {
  return Math.max(0, Math.round(legacyTick)) * DAYS_PER_MONTH;
}

/**
 * Inverse of `legacyTickToDayTick`. Anything finer than a whole month collapses
 * onto the month it falls in, which is exactly the precision the old world had.
 */
export function dayTickToLegacyTick(dayTick: number): number {
  return monthsElapsed(Math.max(0, dayTick));
}
