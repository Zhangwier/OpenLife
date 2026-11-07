/**
 * Deterministic utility arbitration shared by village NPCs.
 * Motives are derived from physical needs, accessible resources and memory.
 * It selects intentions; only ordinary validated world Commands can act.
 * Never uses an LLM to mutate world state or fake a successful action.
 */
export interface NpcIntent {
  id: string;
  utility: number;
  possible: boolean;
  because: string;
}
export function chooseNpcIntent(options: readonly NpcIntent[]): NpcIntent | null {
  return options
    .filter(o => o.possible && Number.isFinite(o.utility))
    .sort((a, b) => b.utility - a.utility || a.id.localeCompare(b.id))[0] ?? null;
}

/** Scarcity increases the urgency of seeking cooperation. */
export function shortagePressure(available: number, safeReserve: number): number {
  if (safeReserve <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((safeReserve - Math.max(0, available)) * 100 / safeReserve)));
}
