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
}

/** Mutable services shared across the kernel, exposed for save/load wiring. */
export interface KernelInternals {
  store: WorldStore;
  clock: ClockState;
  rng: DeterministicRng;
  scheduler: Scheduler;
  eventLog: EventLog;
  facts: FactStore;
  definitions: DefinitionSet;
}
