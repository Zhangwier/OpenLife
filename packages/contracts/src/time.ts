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
