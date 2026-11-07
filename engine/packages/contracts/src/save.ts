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
  /**
   * Modules the save used that are not installed now (§62 ORPHANED). Their
   * world data stays untouched and their opaque state is carried into the
   * next save, so installing the module again later loses nothing.
   */
  orphanedModules?: { id: ModuleId; version: string }[];
}

/**
 * Engine compatibility policy for saves.
 *
 * A save loads when it was written by the same major engine line and an
 * engine no newer than this one. While the engine is 0.x, the minor version
 * is the breaking line (semver §4). A newer or other-line save needs
 * `allowVersionMismatch`. A loaded save is re-stamped with this engine's
 * version on its next save.
 */
export function engineSaveCompatibility(saved: string, current: string): "same" | "older" | "incompatible" {
  if (saved === current) return "same";
  const parse = (v: string) => {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] as const : undefined;
  };
  const a = parse(saved), b = parse(current);
  if (!a || !b) return "incompatible";
  if (a[0] !== b[0]) return "incompatible";
  if (b[0] === 0 && a[1] !== b[1]) return "incompatible";
  const cmp = a[1] - b[1] || a[2] - b[2];
  return cmp < 0 ? "older" : cmp === 0 ? "same" : "incompatible";
}
