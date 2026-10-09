/**
 * OpenLife Core Contract - Time.
 *
 * The kernel only understands an abstract monotonically increasing tick.
 * Calendars, years, seasons and birthdays are module concerns (see §66).
 */

/** Abstract simulation tick. Meaning is supplied by a module calendar. */
export type SimTick = number;

export interface ClockState {
  /** Current simulation tick of this timeline. */
  tick: SimTick;
  /** Number of `advance` steps applied so far (for debugging/replay). */
  advances: number;
}

export interface Clock {
  readonly tick: SimTick;
  /** Advance the simulation clock to at least `tick`; never moves backwards. */
  advanceTo(tick: SimTick): void;
  advanceBy(ticks: number): void;
}

/**
 * One named time unit a world pack exposes (TIME-RFC-001).
 *
 * The kernel never sees this. A world pack declares how many abstract ticks one
 * of its units costs, plus how many of the unit fit in the next unit up, so
 * modules can talk about days without the kernel learning what a day is (搂3.1).
 */
export interface ClockScale {
  /** Stable unit id inside the profile, e.g. `day`, `month`, `year`. */
  id: string;
  /** Display label owned by the world pack, e.g. `鏃`. */
  label: string;
  /** Ticks consumed by one unit. */
  ticks: number;
  /** How many of this unit fit into `parentUnit`. Absent on the top unit. */
  perParent?: number;
  /** Id of the next larger unit, when this unit aggregates. */
  parentUnit?: string;
}

/**
 * A world pack's declared time interpretation.
 *
 * The kernel keeps a monotonically increasing integer tick; the profile is what
 * gives that integer a meaning. Two profiles can coexist on the same tick - the
 * fine (`day`) scale drives moment-to-moment activity, the coarse (`month`)
 * scale keeps year-length semantics stable for modules written before the fine
 * scale existed (TIME-RFC-001 搂5, 搂INV-008).
 */
export interface ClockProfile {
  id: string;
  /** Owner module id; a world pack declares, nothing else may redefine. */
  owner?: string;
  /** The finest unit a player-facing action may cost. */
  baseUnit: string;
  /** Every unit this profile exposes, including the base unit. */
  units: ClockScale[];
  description?: string;
}

/** Reads one unit out of a profile without assuming it exists. */
export function clockUnit(profile: ClockProfile, unitId: string): ClockScale | undefined {
  return profile.units.find((unit) => unit.id === unitId);
}

/** Ticks per unit, or `undefined` when the profile does not declare that unit. */
export function ticksPerUnit(profile: ClockProfile, unitId: string): number | undefined {
  return clockUnit(profile, unitId)?.ticks;
}

/**
 * Converts a count of `unitId` into ticks, rounding **up** so a fractional unit
 * never becomes a free action. Returns `undefined` for an unknown unit so the
 * caller can reject the command instead of guessing.
 */
export function ticksFor(profile: ClockProfile, unitId: string, count = 1): number | undefined {
  const unit = clockUnit(profile, unitId);
  if (!unit || !Number.isFinite(count)) return undefined;
  return Math.ceil(unit.ticks * count);
}

/**
 * How many whole `unitId` fit inside `ticks`. Used for player-facing copy
 * ("about three days of work") and for grouping, never for state mutation.
 */
export function unitsWithin(profile: ClockProfile, unitId: string, ticks: number): number {
  const unit = clockUnit(profile, unitId);
  if (!unit || unit.ticks <= 0) return 0;
  return Math.floor(ticks / unit.ticks);
}
