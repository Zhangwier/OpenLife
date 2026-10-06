/**
 * OpenLife Core Contract - History / Lineage vocabulary.
 *
 * The core defines the *shape* of history so that any world (modern, magic,
 * cultivation) can produce it, but the meaning of an event is module-owned.
 */

import type { EntityId, EventId, LineageId } from "./ids.ts";

export interface Fact {
  id: string;
  factType: string;
  subject: EntityId;
  object?: EntityId;
  data: Record<string, unknown>;
  at: number;
  visibility: "public" | "private" | "secret";
  historicalSignificance: number;
}

export interface LineageState {
  id: LineageId;
  founderId?: EntityId;
  /** Characters belonging to this lineage, with their generation number. */
  members: { characterId: EntityId; generation: number; bornAt: number; diedAt?: number }[];
  /** Records that must never be lost, even if entities disappear (§39). */
  records: string[];
  createdAt: number;
}

export interface CausalEdge {
  cause: EventId;
  effect: EventId;
}
