/**
 * Modern World - calendar.
 *
 * The kernel clock is an abstract tick (§12, §66). This module supplies the
 * mapping from ticks to a human calendar. One tick is one month.
 */

export const TICKS_PER_YEAR = 12;
export const TICKS_PER_MONTH = 1;

export function yearsToTicks(years: number): number {
  return Math.round(years * TICKS_PER_YEAR);
}

export function ticksToYears(ticks: number): number {
  return Math.floor(ticks / TICKS_PER_YEAR);
}

/** Age in whole years, given a birth tick and the current tick. */
export function ageInYears(bornAt: number, now: number): number {
  return Math.max(0, Math.floor((now - bornAt) / TICKS_PER_YEAR));
}

/** Calendar label for debugging, e.g. `Y12/M04`. */
export function formatTick(tick: number, startYear = 1): string {
  const year = startYear + Math.floor(tick / TICKS_PER_YEAR);
  const month = (tick % TICKS_PER_YEAR) + 1;
  return `Y${year}/M${String(month).padStart(2, "0")}`;
}
