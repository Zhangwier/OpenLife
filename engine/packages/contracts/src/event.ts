/**
 * OpenLife Core Contract - Event.
 *
 * An event records something that has already happened. Events are the only
 * input to Reaction Rules and the only source of history (§13, §31, §34).
 */

import type { CommandId, EntityId, EventId, EventType, TransactionId } from "./ids.ts";
import type { JsonValue } from "./entity.ts";
import type { SimTick } from "./time.ts";

export type Visibility = "public" | "private" | "secret";

export interface WorldEvent {
  id: EventId;
  /** Monotonic sequence within the timeline; also the ordering key. */
  seq: number;
  type: EventType;
  at: SimTick;
  actorId?: EntityId;
  targetId?: EntityId;
  data: Record<string, JsonValue>;
  /** Event ids that causally produced this event (§34). */
  causedBy: EventId[];
  commandId?: CommandId;
  transactionId?: TransactionId;
  historicalSignificance: number;
  visibility: Visibility;
  /** Deduplication key, when the emitter supplied one (§88). */
  dedupeKey?: string;
  /** Module that emitted the event; used by history ownership (§62). */
  owner?: string;
}
