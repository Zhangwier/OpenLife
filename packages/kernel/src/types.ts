/**
 * Kernel - internal wiring types.
 */

import type { DefinitionSet } from "@openlife/rule-engine";
import type { WorldStore } from "@openlife/world-model";
import type { DeterministicRng } from "./rng.ts";
import type { EventLog } from "./event-log.ts";
import type { Scheduler } from "./scheduler.ts";
import type { ClockState } from "@openlife/contracts";
import type { FactStore } from "./facts.ts";

export interface KernelOptions {
  worldSeed: number;
  worldId?: string;
  timelineId?: string;
  /** Shared definition registries. Created empty when omitted. */
  definitions?: DefinitionSet;
  /** Maximum reaction cascade depth per transaction (§88). */
  maxDepth?: number;
  /** Maximum events produced by a single transaction (§88). */
  maxEventsPerTransaction?: number;
  /**
   * Longest single advance (in ticks) whose days agents live through one by
   * one. A longer advance is a time skip: scheduled tasks still run, agents do
   * not replay the skipped days. Defaults to 31.
   */
  agentCatchUpLimit?: number;
}

/** Read-only view of the world store (no create/set/merge/archive/restore). */
export type ReadonlyWorldStore = Pick<WorldStore,
  "entityCount" | "relationCount" | "getEntity" | "hasEntity" | "listEntities" |
  "countEntities" | "getComponent" | "getRelation" | "serialize" | "fingerprint">;
/** Read-only view of the event journal (no append/restore). */
export type ReadonlyEventLog = Pick<EventLog, "length" | "nextSeq" | "all" | "since" | "list" | "get" | "serialize">;
/** Read-only view of the scheduler (no schedule/complete/cancel/restore). */
export type ReadonlyScheduler = Pick<Scheduler, "size" | "list" | "nextDueTick" | "serialize">;
/** Read-only view of the fact store (no add/restore). */
export type ReadonlyFactStore = Pick<FactStore, "size" | "all" | "list" | "serialize">;

/**
 * Inspection surface for the history runtime, save wiring and debug console.
 *
 * Every member is a live read-only facade: it always reads the kernel's
 * current state (also after `restore`), and offers no way to write it. The
 * only write paths stay `dispatch` (Command) and `advanceTo` (Clock).
 */
export interface KernelInternals {
  readonly store: ReadonlyWorldStore;
  readonly clock: Readonly<ClockState>;
  readonly rng: { snapshot(): { seed: number; draws: number } };
  readonly scheduler: ReadonlyScheduler;
  readonly eventLog: ReadonlyEventLog;
  readonly facts: ReadonlyFactStore;
  readonly definitions: DefinitionSet;
}
