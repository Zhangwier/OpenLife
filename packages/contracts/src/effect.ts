/**
 * OpenLife Core Contract - Effect.
 *
 * Effects are *declarative* state changes produced by Resolution / Reaction
 * rules. Rules never touch world state; they return Effects, and only the
 * kernel transaction applies them (§INV-001, §INV-007).
 */

import type { ComponentTypeId, EntityId, EventType, RelationTypeId, TaskTypeId } from "./ids.ts";
import type { ComponentData, JsonValue } from "./entity.ts";
import type { SimTick } from "./time.ts";

/** How a numeric component field is combined with its modifier. */
export type ModifierOp = "add" | "mul" | "set" | "clamp";

export interface Modifier {
  id: string;
  /** Where the modifier came from, e.g. `modern.wealth`. */
  source: string;
  /** Target quantity, e.g. `career.job.success`. */
  target: string;
  op: ModifierOp;
  value: JsonValue;
  /** Human readable cause; required for explainability (§16). */
  reason: string;
  /** Higher priority applies later. Default 0. */
  priority?: number;
  /** Tick at which the modifier stops applying. */
  expiresAt?: SimTick;
  /** `"additive"` (default) or `"multiplicative"` grouping label. */
  scope?: string;
}

export type Effect =
  | SetComponentEffect
  | ModifyComponentEffect
  | SpawnEntityEffect
  | ArchiveEntityEffect
  | AddRelationEffect
  | RemoveRelationEffect
  | AddFactEffect
  | ScheduleTaskEffect
  | EmitEventEffect;

export interface SetComponentEffect {
  kind: "setComponent";
  entityId: EntityId;
  component: ComponentTypeId;
  value: ComponentData;
  reason?: string;
  /** Modifiers that produced this value, recorded for explainability (§15). */
  modifiers?: Modifier[];
}

export interface ModifyComponentEffect {
  kind: "modifyComponent";
  entityId: EntityId;
  component: ComponentTypeId;
  /** Shallow patch merged into the component. */
  patch: ComponentData;
  reason?: string;
  modifiers?: Modifier[];
}

export interface SpawnEntityEffect {
  kind: "spawnEntity";
  /** Local alias, usable by later effects in the same transaction. */
  localId: string;
  entityKind: string;
  /**
   * Explicit entity id. When omitted the kernel generates a deterministic id.
   * Modules use this when they need a stable, human-readable id.
   */
  id?: EntityId;
  components: Record<ComponentTypeId, ComponentData>;
  /** Emit an `core.entity_spawned` event for this entity. Default true. */
  announce?: boolean;
}

export interface ArchiveEntityEffect {
  kind: "archiveEntity";
  entityId: EntityId;
  reason: string;
  /** Emit a `core.entity_archived` event. Default true. */
  announce?: boolean;
}

export interface AddRelationEffect {
  kind: "addRelation";
  type: RelationTypeId;
  from: EntityId;
  to: EntityId;
  components?: Record<ComponentTypeId, ComponentData>;
  announce?: boolean;
}

export interface RemoveRelationEffect {
  kind: "removeRelation";
  type: RelationTypeId;
  from: EntityId;
  to: EntityId;
  reason: string;
  announce?: boolean;
}

export interface AddFactEffect {
  kind: "addFact";
  /** Namespaced fact type, e.g. `career.employed_by`. */
  factType: string;
  subject: EntityId;
  object?: EntityId;
  data?: Record<string, JsonValue>;
  /** 0..1; decides whether the fact becomes public history (§32). */
  historicalSignificance?: number;
  /** Who can know this fact. `public` facts skip fog (§INV-005). */
  visibility?: "public" | "private" | "secret";
}

export interface ScheduleTaskEffect {
  kind: "scheduleTask";
  taskType: TaskTypeId;
  /** Absolute tick; use `afterTicks` for relative scheduling. */
  at?: SimTick;
  afterTicks?: number;
  payload?: Record<string, JsonValue>;
  /** When set the task repeats every `everyTicks` until `untilTick`. */
  everyTicks?: number;
  untilTick?: SimTick;
  /** Deduplication key: scheduling the same key twice is a no-op. */
  dedupeKey?: string;
}

export interface EmitEventEffect {
  kind: "emitEvent";
  eventType: EventType;
  actorId?: EntityId;
  targetId?: EntityId;
  data?: Record<string, JsonValue>;
  historicalSignificance?: number;
  visibility?: "public" | "private" | "secret";
  /**
   * Deduplication key (§88). Within one transaction, two events with the same
   * type+key are collapsed so reaction cascades cannot duplicate work.
   */
  dedupeKey?: string;
}
