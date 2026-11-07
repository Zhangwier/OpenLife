/**
 * Rule Engine - Modifier pipeline (§15).
 *
 * All non-trivial numeric outcomes should be produced here so the system can
 * always answer "why did this happen?" with a Decision Trace (§16).
 */

import type { Modifier, ModifierOp } from "@openlife/contracts";

export interface ModifierTraceEntry {
  id: string;
  source: string;
  target: string;
  op: ModifierOp;
  value: unknown;
  reason: string;
  priority: number;
  /** Value of the running total after this modifier was applied. */
  after: number;
}

export interface ResolutionTrace {
  target: string;
  base: number;
  result: number;
  entries: ModifierTraceEntry[];
  /** Modifiers skipped because they expired. */
  expired: Modifier[];
}

const OP_ORDER: Record<ModifierOp, number> = {
  set: 0,
  add: 1,
  mul: 2,
  clamp: 3,
};

/**
 * Applies modifiers deterministically:
 *   1. drop expired modifiers,
 *   2. sort by op phase, then priority, then id (stable, replay-safe),
 *   3. apply set -> add -> mul -> clamp.
 */
export function applyModifiers(
  target: string,
  base: number,
  modifiers: readonly Modifier[],
  now: number,
): ResolutionTrace {
  const expired: Modifier[] = [];
  const active: Modifier[] = [];
  for (const modifier of modifiers) {
    if (modifier.expiresAt !== undefined && modifier.expiresAt <= now) expired.push(modifier);
    else active.push(modifier);
  }

  const sorted = [...active].sort((a, b) => {
    const phase = OP_ORDER[a.op] - OP_ORDER[b.op];
    if (phase !== 0) return phase;
    const priority = (a.priority ?? 0) - (b.priority ?? 0);
    if (priority !== 0) return priority;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  let value = base;
  const entries: ModifierTraceEntry[] = [];
  for (const modifier of sorted) {
    value = applyOne(value, modifier);
    entries.push({
      id: modifier.id,
      source: modifier.source,
      target: modifier.target,
      op: modifier.op,
      value: modifier.value,
      reason: modifier.reason,
      priority: modifier.priority ?? 0,
      after: value,
    });
  }

  return { target, base, result: value, entries, expired };
}

function applyOne(value: number, modifier: Modifier): number {
  switch (modifier.op) {
    case "set":
      return toNumber(modifier.value, value);
    case "add":
      return value + toNumber(modifier.value, 0);
    case "mul":
      return value * toNumber(modifier.value, 1);
    case "clamp": {
      const bounds = Array.isArray(modifier.value) ? modifier.value : [];
      const lower = bounds.length > 0 ? toNumber(bounds[0], Number.NEGATIVE_INFINITY) : Number.NEGATIVE_INFINITY;
      const upper = bounds.length > 1 ? toNumber(bounds[1], Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
      return Math.min(Math.max(value, lower), upper);
    }
    default:
      return value;
  }
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  return fallback;
}
