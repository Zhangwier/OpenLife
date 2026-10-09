/**
 * World Clock - the world pack's declared time interpretation (TIME-RFC-001).
 *
 * The kernel still knows only a monotonically increasing integer tick. This
 * module is what gives that integer a life-sized meaning:
 *
 *   day  (1 tick)      what one player action costs
 *   month (30 ticks)   the aggregation boundary
 *   year (360 ticks)   twelve of those months
 *
 * M1.2-B: this module is the **only** authority on "how long is a year here".
 * Other modules ask it rather than dividing a tick by their own constant. That
 * is what stops ageing, seasons and annual scheduling from drifting apart.
 *
 * It owns no world truth beyond "how the tick is read". It does not move the
 * clock: only `Simulation.advanceTo` does. Every action still reaches the world
 * through Command -> Constraint -> Resolution -> Effect -> Transaction -> Event.
 */

import type {
  CommandIntent,
  ComponentData,
  Effect,
  OpenLifeModule,
  WorldView,
} from "@openlife/contracts";
import { PracticeComponents } from "@openlife/module-practice-runtime";
import {
  DAYS_PER_MONTH,
  MONTHS_PER_YEAR,
  DAY_TICKS_PER_YEAR,
  ERA_START_YEAR,
  yearsToTicksAt,
  type TimeScale,
} from "@openlife/life-contracts";

const OWNER = "world-clock";
const WORLD = "modern:world";
const STATE = "modern.world_state";
const IDENTITY = "modern.identity";
/** The world's zero point, shared with `life-contracts` (Xia founding, 2070 BCE). */
const ERA_START = ERA_START_YEAR;

/**
 * The scale this world's ticks are counted in.
 *
 * Registered as a capability so a module can ask the world instead of assuming.
 * `month` is what a pre-TIME-RFC-001 save means; it is preserved, never
 * silently converted (TIME-RFC-001 搂5).
 */
export const TIME_SCALE_CAPABILITY = "time.scale";

/** The declared scale of an unprofiled world: one tick is one month. */
export const LEGACY_TIME_SCALE: TimeScale = "month";
/** The scale the M1 life scenario declares. */
export const LIFE_TIME_SCALE: TimeScale = "day";

export const WorldClockComponents = {
  clock: "world-clock.clock",
  routine: "world-clock.routine",
} as const;

export const WorldClockProfileId = "world-clock.calendar";

export const WorldClockUnits = {
  moment: "moment",
  day: "day",
  month: "month",
  year: "year",
} as const;

/**
 * The profile registered into the module runtime. `moment` exists so that a
 * genuinely instant action (looking, reading) can be declared instead of being
 * silently rounded up to a day.
 */
export const WorldClockProfile = {
  id: WorldClockProfileId,
  baseUnit: WorldClockUnits.day,
  description: "早期聚落生活时间：以日为最小行动单位，30 日聚合成一个月，12 个月为一年。",
  units: [
    { id: WorldClockUnits.moment, label: "片刻", ticks: 1, perParent: DAYS_PER_MONTH, parentUnit: WorldClockUnits.day },
    { id: WorldClockUnits.day, label: "日", ticks: 1, perParent: DAYS_PER_MONTH, parentUnit: WorldClockUnits.month },
    { id: WorldClockUnits.month, label: "月", ticks: DAYS_PER_MONTH, perParent: MONTHS_PER_YEAR, parentUnit: WorldClockUnits.year },
    { id: WorldClockUnits.year, label: "年", ticks: DAY_TICKS_PER_YEAR },
  ],
} as const;

/**
 * Annual "one month passes" pulse.
 *
 * Modules written before the day scale schedule yearly work with
 * `afterTicks: TICKS_PER_YEAR` (12). Those now fire twelve times a year, so
 * this module issues the honest monthly boundary marker that reactions and
 * projections can key on, and keeps a single owner for "the month turned".
 */
const MONTH_PULSE_TASK = "world-clock.month_pulse";
const MONTH_PULSE_COMMAND = "world-clock.mark_month";
const COMPACT_COMMAND = "world-clock.compact";

interface ClockState {
  startedAt: number;
  monthsElapsed: number;
  yearsElapsed: number;
  lastPulseAt: number;
  /** Set when this clock was created by an explicit legacy migration. */
  migratedFromLegacy: boolean;
  createdAt: number;
}

/**
 * The read surface other modules use instead of doing their own tick maths.
 *
 * Every method takes the world, so the answer always reflects the world's own
 * declared scale rather than the caller's assumption (M1.2-B).
 */
export interface TimeScaleApi {
  /** The declared scale of this world's tick. */
  readonly scale: TimeScale;
  readonly ticksPerYear: number;
  readonly ticksPerMonth: number;
  readonly monthsPerYear: number;
  /** Whole years elapsed in this world. */
  yearsElapsed(world: WorldView): number;
  /** Whole months elapsed in this world. */
  monthsElapsed(world: WorldView): number;
  /** The era year a given tick falls in. */
  yearOf(world: WorldView, tick: number): number;
  /** A character's age in world years. */
  ageInYears(world: WorldView, bornAt: number, now: number): number;
  /** Kernel ticks in `years` of this world's time. */
  yearsToTicks(years: number): number;
  /** Season name at a given tick. */
  seasonAt(world: WorldView, tick: number): string;
}

export const worldClockModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "world-pack",
    name: "World Clock",
    description: "Day-scale life time with a month aggregation boundary, declared as a clock profile.",
    requires: ["time.calendar"],
    provides: ["time.life-scale", TIME_SCALE_CAPABILITY],
    capabilities: [
      "component.register",
      "command.register",
      "rule.constraint.register",
      "rule.resolution.register",
      "schedule.register",
      "projection.register",
    ],
  },

  register(ctx) {
    ctx.registerClockProfile(WorldClockProfile);

    // The world's declared scale, published so no module has to guess it.
    // M1.2-B: this is the single source every time reading flows from.
    const scaleApi: TimeScaleApi = {
      scale: LIFE_TIME_SCALE,
      ticksPerYear: DAY_TICKS_PER_YEAR,
      ticksPerMonth: DAYS_PER_MONTH,
      monthsPerYear: MONTHS_PER_YEAR,
      yearsElapsed: (world) => Number(readClock(world)?.yearsElapsed ?? 0),
      monthsElapsed: (world) => Number(readClock(world)?.monthsElapsed ?? 0),
      yearOf: (world, tick) => eraYearAt(world, tick),
      ageInYears: (world, bornAt, now) => ageAt(world, bornAt, now),
      yearsToTicks: (years) => yearsToTicksAt(years, LIFE_TIME_SCALE),
      seasonAt: (world, tick) => seasonFor(monthsOfTick(world, tick)),
    };
    ctx.provideCapability(TIME_SCALE_CAPABILITY, scaleApi);

    ctx.registerComponent({
      id: WorldClockComponents.clock,
      persist: true,
      description: "Day-scale reading of the kernel tick: months/years elapsed and the last monthly boundary.",
    });
    ctx.registerComponent({
      id: WorldClockComponents.routine,
      persist: true,
      description: "A person's standing daily routine: which daily work they keep up, and when it last ran.",
    });

    ctx.registerCommand({
      type: MONTH_PULSE_COMMAND,
      description: "Internal: mark that one month of the day-scale clock has completed.",
    });
    ctx.registerCommand({
      type: COMPACT_COMMAND,
      description: "Fold a long stretch of unattended days into a bounded, auditable summary.",
    });

    registerMarkMonth(ctx);
    registerCompact(ctx);
    registerMonthPulse(ctx);

    ctx.registerProjection({
      id: "world-clock.reading",
      description: "How the current tick reads on the day, month and year scales.",
      build: ({ world }) => reading(world),
    });

    ctx.registerProjection({
      id: "world-clock.routine",
      description: "What daily work this person keeps up on their own, and whether it is currently due.",
      build: ({ world, params }) => {
        const personId = String(params.personId ?? "");
        return routineFor(world, personId);
      },
    });

    // The clock component is attached to the world entity by the same command
    // that initializes the world, so a world always has exactly one clock.
    ctx.registerReactionRule({
      id: "world-clock.world_initialized.start",
      eventType: "modern.world_initialized",
      react: (c) => {
        if (c.world.getComponent(WORLD, WorldClockComponents.clock)) return [];
        return [
          { kind: "setComponent", entityId: WORLD, component: WorldClockComponents.clock, value: freshClock(c.world.tick) },
          {
            kind: "scheduleTask",
            taskType: MONTH_PULSE_TASK,
            afterTicks: DAYS_PER_MONTH,
            everyTicks: DAYS_PER_MONTH,
            dedupeKey: "world-clock:month-pulse",
          },
        ];
      },
    });

    // A long unattended stretch of days is folded into one summary rather than
    // replayed as hundreds of indistinguishable daily notes (MEM-004 搂2).
    ctx.registerReactionRule({
      id: "world-clock.long_gap.compact",
      eventType: "world-clock.month_marked",
      react: (c) => {
        const state = readClock(c.world);
        if (!state || state.monthsElapsed % MONTHS_PER_YEAR !== 0 || state.monthsElapsed === 0) return [];
        return [{
          kind: "scheduleTask",
          taskType: MONTH_PULSE_TASK,
          afterTicks: 1,
          payload: { compact: true },
          dedupeKey: `world-clock:compact:${state.monthsElapsed}`,
        }];
      },
    });
  },
};

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * Months elapsed at this world's declared scale.
 *
 * A `month`-scale world has one month per tick; a `day`-scale world has one
 * month per `DAYS_PER_MONTH` ticks. Everything that needs "which month" goes
 * through here, so the two scales can never be mixed up again.
 */
export function monthsOfTick(world: WorldView, tick: number): number {
  const scale = declaredScale(world);
  const perMonth = scale === "month" ? 1 : DAYS_PER_MONTH;
  return Math.floor(Math.max(0, tick) / perMonth);
}

/** The era year a tick falls in, at this world's declared scale. */
export function eraYearAt(world: WorldView, tick: number): number {
  return ERA_START + Math.floor(monthsOfTick(world, tick) / MONTHS_PER_YEAR);
}

/** A character's age in world years. Never assumes the month scale. */
export function ageAt(world: WorldView, bornAt: number, now: number): number {
  return Math.max(0, Math.floor(monthsOfTick(world, Math.max(0, now - bornAt)) / MONTHS_PER_YEAR));
}

/**
 * The declared scale of a world.
 *
 * A world with a clock component is on the day scale (that is what this module
 * declares). A world without one is an un-migrated legacy save, whose tick
 * still means one month - preserved on purpose, never converted in place.
 */
export function declaredScale(world: WorldView): TimeScale {
  return world.getComponent(WORLD, WorldClockComponents.clock) ? LIFE_TIME_SCALE : LEGACY_TIME_SCALE;
}

export interface ClockReading {
  exists: boolean;
  tick: number;
  day: number;
  /** Which scale this world's tick is counted in (M1.2-B). */
  scale: TimeScale;
  /** Era year at this world's scale - the value UI and history should show. */
  eraYear: number;
  /** True when this world has no clock and its tick still means one month. */
  legacyScale: boolean;
  monthTick: number;
  dayOfMonth: number;
  monthOfYear: number;
  monthsElapsed: number;
  yearsElapsed: number;
  season: string;
  unitLabel: string;
  baseUnit: string;
  daysPerMonth: number;
  monthsPerYear: number;
  dayTicksPerYear: number;
  migratedFromLegacy: boolean;
}

/**
 * Pure reading of a tick, at whatever scale this world declares.
 *
 * Safe on a world that never installed this module: such a world keeps the
 * legacy month scale, and is reported as `legacyScale` rather than being
 * silently reinterpreted.
 */
export function reading(world: WorldView): ClockReading {
  const state = readClock(world);
  const tick = world.tick;
  const scale = declaredScale(world);
  const legacyScale = scale !== LIFE_TIME_SCALE;
  // On a month-scale world one tick *is* a month; on the day scale a month is
  // DAYS_PER_MONTH ticks. Both go through monthsOfTick so the reading is right
  // in either world.
  const monthsElapsed = monthsOfTick(world, tick);
  const ticksPerMonth = legacyScale ? 1 : DAYS_PER_MONTH;
  return {
    exists: Boolean(state),
    tick,
    day: tick,
    scale,
    eraYear: eraYearAt(world, tick),
    legacyScale,
    monthTick: monthsElapsed,
    dayOfMonth: (tick % ticksPerMonth) + 1,
    monthOfYear: (monthsElapsed % MONTHS_PER_YEAR) + 1,
    monthsElapsed,
    yearsElapsed: Math.floor(monthsElapsed / MONTHS_PER_YEAR),
    season: seasonFor(monthsElapsed),
    unitLabel: legacyScale ? "月" : "日",
    baseUnit: legacyScale ? WorldClockUnits.month : WorldClockUnits.day,
    daysPerMonth: DAYS_PER_MONTH,
    monthsPerYear: MONTHS_PER_YEAR,
    dayTicksPerYear: DAY_TICKS_PER_YEAR,
    migratedFromLegacy: Boolean(state?.migratedFromLegacy),
  };
}

export function seasonFor(monthsElapsed: number): string {
  const month = (monthsElapsed % MONTHS_PER_YEAR) + 1;
  if (month >= 3 && month <= 5) return "春";
  if (month >= 6 && month <= 8) return "夏";
  if (month >= 9 && month <= 11) return "秋";
  return "冬";
}

/**
 * The reading a **past** tick had, at this world's declared scale.
 *
 * History rendering uses this instead of re-deriving a year from a raw tick, so
 * a record written at tick 300 keeps reading exactly as it did when it was
 * written, even after the world changed scale.
 */
export function readingAtTick(world: WorldView, tick: number): {
  tick: number;
  eraYear: number;
  monthsElapsed: number;
  monthOfYear: number;
  yearsElapsed: number;
  season: string;
} {
  const monthsElapsed = monthsOfTick(world, tick);
  return {
    tick,
    eraYear: eraYearAt(world, tick),
    monthsElapsed,
    monthOfYear: (monthsElapsed % MONTHS_PER_YEAR) + 1,
    yearsElapsed: Math.floor(monthsElapsed / MONTHS_PER_YEAR),
    season: seasonFor(monthsElapsed),
  };
}

/** The next tick at which a pending human decision blocks the clock. */
export function nextDecisionTick(world: WorldView): number | undefined {
  const candidates: number[] = [];
  for (const entity of world.listEntities({ kind: "practice-runtime.practice" })) {
    const state = entity.components[PracticeComponents.practice];
    if (state?.status !== "blocked") continue;
    candidates.push(Number(state.lastAdvancedAt ?? world.tick));
  }
  return candidates.length > 0 ? Math.min(...candidates) : undefined;
}

/**
 * True when advancing from `world.tick` to `target` would silently walk past a
 * checkpoint the player is supposed to answer.
 */
export function crossesDecision(world: WorldView, target: number): boolean {
  const boundary = nextDecisionTick(world);
  return boundary !== undefined && target > boundary && world.tick <= boundary;
}

// ---------------------------------------------------------------------------
// Daily routine (LIFE-001: basic needs must not become a manual checklist)
// ---------------------------------------------------------------------------

export type RoutineKind = "cook" | "tend" | "repair";

export interface RoutineState {
  kind: RoutineKind;
  startedAt: number;
  lastRunAt: number;
  runs: number;
  suspendedReason: string;
}

export function routineFor(world: WorldView, personId: string): {
  exists: boolean;
  personId: string;
  routine: RoutineState | null;
  due: boolean;
  nextDueAt: number;
} {
  const raw = personId ? world.getComponent(personId, WorldClockComponents.routine) : undefined;
  if (!raw) return { exists: false, personId, routine: null, due: false, nextDueAt: 0 };
  const routine = readRoutine(raw);
  const nextDueAt = routine.lastRunAt + DAYS_PER_MONTH;
  return {
    exists: true,
    personId,
    routine,
    // A standing routine is due once its month is over and it is not suspended.
    due: routine.suspendedReason === "" && world.tick >= nextDueAt,
    nextDueAt,
  };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

type Registration = Parameters<OpenLifeModule["register"]>[0];

function registerMarkMonth(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${MONTH_PULSE_COMMAND}.allowed`,
    commandType: MONTH_PULSE_COMMAND,
    evaluate: (c) => {
      if (!readClock(c.world)) {
        return { ok: false, code: "E_CLOCK_MISSING", message: "世界还没有生活时钟，先初始化世界。" };
      }
      const at = Number(c.command.payload.at ?? c.world.tick);
      if (!Number.isFinite(at) || at % DAYS_PER_MONTH !== 0) {
        return { ok: false, code: "E_CLOCK_BOUNDARY", message: "月份边界只能落在整月上。" };
      }
      if (at <= Number(readClock(c.world)?.lastPulseAt ?? 0)) {
        return { ok: false, code: "E_CLOCK_ALREADY_MARKED", message: "这个月已经结算过了。" };
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: `${MONTH_PULSE_COMMAND}.resolve`,
    commandType: MONTH_PULSE_COMMAND,
    resolve: (c) => {
      const current = readClock(c.world)!;
      const at = Number(c.command.payload.at ?? c.world.tick);
      const monthsElapsed = Math.floor(at / DAYS_PER_MONTH);
      return [
        {
          kind: "modifyComponent",
          entityId: WORLD,
          component: WorldClockComponents.clock,
          patch: {
            monthsElapsed,
            yearsElapsed: Math.floor(monthsElapsed / MONTHS_PER_YEAR),
            lastPulseAt: at,
          },
          reason: "one month of day-scale time completed",
        },
        {
          kind: "emitEvent",
          eventType: "world-clock.month_marked",
          targetId: WORLD,
          data: { at, monthsElapsed, season: seasonFor(monthsElapsed) },
          historicalSignificance: 0,
        },
      ];
    },
  });
}

function registerCompact(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${COMPACT_COMMAND}.allowed`,
    commandType: COMPACT_COMMAND,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      if (!actorId || !c.world.hasEntity(actorId)) {
        return { ok: false, code: "E_CLOCK_ACTOR", message: "需要一位正在生活的人。" };
      }
      const days = Number(c.command.payload.days ?? 0);
      if (!Number.isInteger(days) || days <= 0) {
        return { ok: false, code: "E_CLOCK_DAYS", message: "需要一段正的天数。" };
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: `${COMPACT_COMMAND}.resolve`,
    commandType: COMPACT_COMMAND,
    resolve: (c) => {
      const actorId = c.command.actorId as string;
      const days = Math.floor(Number(c.command.payload.days));
      const summary = String(c.command.payload.summary ?? "这段日子平静地过去了。");
      const months = Math.floor(days / DAYS_PER_MONTH);
      return [
        {
          kind: "modifyComponent",
          entityId: actorId,
          component: WorldClockComponents.clock,
          patch: { lastCompactedAt: c.world.tick, lastCompactedDays: days },
          reason: "long unattended stretch folded into one summary",
        },
        {
          kind: "emitEvent",
          eventType: "world-clock.days_compacted",
          actorId,
          data: { days, months, summary },
          historicalSignificance: 0,
        },
      ];
    },
  });
}

/**
 * The monthly boundary task.
 *
 * The kernel's scheduler only understands ticks, so a pack cannot ask for "every
 * month" directly. Instead this task re-arms itself with `everyTicks` at the day
 * scale and refuses to do anything until a whole month has actually elapsed,
 * which keeps the boundary honest even if a world is advanced unevenly.
 */
function registerMonthPulse(ctx: Registration): void {
  ctx.registerTask({
    type: MONTH_PULSE_TASK,
    description: "Issue the monthly boundary command exactly once per elapsed month.",
    handler: (c) => {
      const state = readClock(c.world);
      if (!state) return undefined;
      const boundary = (Math.floor(c.world.tick / DAYS_PER_MONTH)) * DAYS_PER_MONTH;
      if (boundary <= state.lastPulseAt || boundary === 0) return undefined;
      const commands: NonNullable<ReturnType<typeof batch>["commands"]> = [
        {
          type: MONTH_PULSE_COMMAND,
          payload: { at: boundary },
          source: "system" as CommandIntent["source"],
        },
      ];
      return batch(commands);
    },
  });
}

function batch(commands: Array<{
  type: string;
  actorId?: string;
  targetId?: string;
  payload?: Record<string, unknown>;
  source?: CommandIntent["source"];
}>) {
  return { commands };
}

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

function freshClock(tick: number): ComponentData {
  return {
    startedAt: tick,
    monthsElapsed: Math.floor(tick / DAYS_PER_MONTH),
    yearsElapsed: Math.floor(tick / DAYS_PER_MONTH / MONTHS_PER_YEAR),
    lastPulseAt: Math.floor(tick / DAYS_PER_MONTH) * DAYS_PER_MONTH,
    migratedFromLegacy: false,
    createdAt: tick,
  };
}

function readClock(world: WorldView): ClockState | undefined {
  const raw = world.getComponent(WORLD, WorldClockComponents.clock);
  if (!raw) return undefined;
  return {
    startedAt: Math.max(0, Number(raw.startedAt ?? 0)),
    monthsElapsed: Math.max(0, Number(raw.monthsElapsed ?? 0)),
    yearsElapsed: Math.max(0, Number(raw.yearsElapsed ?? 0)),
    lastPulseAt: Math.max(0, Number(raw.lastPulseAt ?? 0)),
    migratedFromLegacy: raw.migratedFromLegacy === true,
    createdAt: Math.max(0, Number(raw.createdAt ?? 0)),
  };
}

function readRoutine(raw: Readonly<Record<string, unknown>>): RoutineState {
  const kind = String(raw.kind ?? "cook");
  return {
    kind: kind === "tend" || kind === "repair" ? kind : "cook",
    startedAt: Math.max(0, Number(raw.startedAt ?? 0)),
    lastRunAt: Math.max(0, Number(raw.lastRunAt ?? 0)),
    runs: Math.max(0, Number(raw.runs ?? 0)),
    suspendedReason: typeof raw.suspendedReason === "string" ? raw.suspendedReason : "",
  };
}

/** Exported so migrations and tests share one definition of "the clock". */
export const WorldClockInternals = {
  DAYS_PER_MONTH,
  MONTHS_PER_YEAR,
  DAY_TICKS_PER_YEAR,
  worldEntityId: WORLD,
  worldStateComponent: STATE,
  identityComponent: IDENTITY,
  monthPulseTask: MONTH_PULSE_TASK,
  monthPulseCommand: MONTH_PULSE_COMMAND,
  freshClock,
  readClock,
} as const;

export type { ClockState, Effect };
