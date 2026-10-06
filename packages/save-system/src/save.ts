/**
 * Save System (§60, §61).
 *
 * A save is a snapshot + opaque per-module state + the event journal + history.
 * The core never inspects module state, so adding a module cannot break the
 * save format; each module migrates its own data on load.
 */

import type {
  LoadOptions,
  LoadResult,
  ModuleId,
  SavePackage,
  SaveSnapshot,
} from "@openlife/contracts";
import { ENGINE_VERSION, ErrorCode, SAVE_FORMAT_VERSION } from "@openlife/contracts";
import { stableStringify } from "@openlife/world-model";

export interface BuildSaveInput {
  worldId: string;
  timelineId: string;
  worldSeed: number;
  savedAtTick: number;
  snapshot: SaveSnapshot;
  moduleState: Record<ModuleId, Record<string, unknown>>;
  eventJournal: SavePackage["eventJournal"];
  history: SavePackage["history"];
  modules: { id: ModuleId; version: string }[];
  metadata?: SavePackage["metadata"];
  engineVersion?: string;
}

export function buildSavePackage(input: BuildSaveInput): SavePackage {
  return {
    manifest: {
      formatVersion: SAVE_FORMAT_VERSION,
      engineVersion: input.engineVersion ?? ENGINE_VERSION,
      worldId: input.worldId,
      timelineId: input.timelineId,
      worldSeed: input.worldSeed,
      savedAtTick: input.savedAtTick,
      modules: input.modules,
      snapshotHash: hashSnapshot(input.snapshot),
    },
    snapshot: input.snapshot,
    moduleState: input.moduleState,
    eventJournal: input.eventJournal,
    history: input.history,
    metadata: input.metadata ?? {},
  };
}

/** Canonical hash over the snapshot, so corruption is detectable. */
export function hashSnapshot(snapshot: SaveSnapshot): string {
  return fnv1a(stableStringify(snapshot));
}

export function verifySave(pkg: SavePackage): { ok: boolean; errors: { code: string; message: string }[] } {
  const errors: { code: string; message: string }[] = [];
  if (pkg.manifest.formatVersion !== SAVE_FORMAT_VERSION) {
    errors.push({
      code: ErrorCode.SaveIncompatible,
      message: `save format ${pkg.manifest.formatVersion} is not supported (expected ${SAVE_FORMAT_VERSION})`,
    });
  }
  const actual = hashSnapshot(pkg.snapshot);
  if (actual !== pkg.manifest.snapshotHash) {
    errors.push({
      code: ErrorCode.SaveIncompatible,
      message: `snapshot hash mismatch: expected ${pkg.manifest.snapshotHash}, computed ${actual}`,
    });
  }
  return { ok: errors.length === 0, errors };
}

export function checkLoadCompatibility(
  pkg: SavePackage,
  options: LoadOptions = {},
): { ok: boolean; errors: { code: string; message: string }[]; warnings: string[] } {
  const warnings: string[] = [];
  const errors: { code: string; message: string }[] = [];
  if (options.verifyHash !== false) {
    const verification = verifySave(pkg);
    if (!verification.ok) errors.push(...verification.errors);
  }
  if (!options.allowVersionMismatch && pkg.manifest.engineVersion !== ENGINE_VERSION) {
    errors.push({
      code: ErrorCode.SaveIncompatible,
      message: `save was written by engine ${pkg.manifest.engineVersion}, running ${ENGINE_VERSION}`,
    });
  }
  if (pkg.manifest.engineVersion !== ENGINE_VERSION) {
    warnings.push(
      `engine version differs (${pkg.manifest.engineVersion} -> ${ENGINE_VERSION}); migrations will be applied`,
    );
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function toJson(pkg: SavePackage, pretty = true): string {
  return pretty ? JSON.stringify(pkg, null, 2) : JSON.stringify(pkg);
}

export function fromJson(json: string): SavePackage {
  const parsed = JSON.parse(json) as SavePackage;
  if (!parsed || typeof parsed !== "object" || !parsed.manifest) {
    throw new Error("not a valid OpenLife save package");
  }
  return parsed;
}

export function emptyLoadResult(): LoadResult {
  return { ok: true, errors: [], warnings: [], migrationsApplied: [] };
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
