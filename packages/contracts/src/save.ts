/**
 * OpenLife Core Contract - Save System (§60).
 *
 * A save package is a snapshot plus an append-only journal plus per-module
 * opaque state. The core never interprets module state (§61).
 */

import type { ModuleId, TimelineId, WorldId } from "./ids.ts";
import type { WorldEvent } from "./event.ts";
import type { HistoricalRecord } from "./module.ts";

export const SAVE_FORMAT_VERSION = 1;
export const ENGINE_VERSION = "0.1.0";

export interface SaveManifest {
  formatVersion: number;
  engineVersion: string;
  worldId: WorldId;
  timelineId: TimelineId;
  worldSeed: number;
  savedAtTick: number;
  modules: { id: ModuleId; version: string }[];
  /** Canonical hash of the snapshot; verified on load. */
  snapshotHash: string;
}

export interface SaveSnapshot {
  world: unknown;
  clock: unknown;
  rng: unknown;
  scheduler: unknown;
}

export interface SavePackage {
  manifest: SaveManifest;
  snapshot: SaveSnapshot;
  /** Opaque per-module state, keyed by module id. */
  moduleState: Record<ModuleId, Record<string, unknown>>;
  /** Append-only event journal. */
  eventJournal: WorldEvent[];
  /** Historical records that survive entity archival. */
  history: HistoricalRecord[];
  metadata: {
    label?: string;
    createdAt?: string;
    [key: string]: unknown;
  };
}

export interface LoadOptions {
  /** Allow loading a save whose engine version differs. */
  allowVersionMismatch?: boolean;
  /** Verify the snapshot hash before accepting the save. */
  verifyHash?: boolean;
}

export interface LoadResult {
  ok: boolean;
  errors: { code: string; message: string }[];
  warnings: string[];
  migrationsApplied: { module: ModuleId; from: string; to: string }[];
}
