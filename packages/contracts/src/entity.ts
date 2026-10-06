/**
 * OpenLife Core Contract - World Model primitives.
 *
 * Entity + Component + Relation. No module-specific concept (money, mana,
 * school, marriage) may appear here.
 */

import type { ComponentTypeId, EntityId, RelationId, RelationTypeId } from "./ids.ts";
import type { SimTick } from "./time.ts";

/** JSON-serialisable value tree. All persisted state must satisfy this. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ComponentData = Record<string, JsonValue>;

/**
 * An entity is a bag of components plus an `kind` label.
 * `kind` is namespaced and owned by a module; the kernel treats it as opaque.
 */
export interface EntityRecord {
  id: EntityId;
  /** Namespaced entity kind, e.g. `life.character`, `modern.company`. */
  kind: string;
  components: Record<ComponentTypeId, ComponentData>;
  createdAt: SimTick;
  /** Set when the entity is archived (died, dissolved, demolished). */
  archivedAt?: SimTick;
  archivedReason?: string;
}

export interface RelationRecord {
  id: RelationId;
  type: RelationTypeId;
  from: EntityId;
  to: EntityId;
  components: Record<ComponentTypeId, ComponentData>;
  createdAt: SimTick;
  archivedAt?: SimTick;
  archivedReason?: string;
}

/**
 * Component definition, contributed by a module through the
 * `component.register` extension point.
 */
export interface ComponentDefinition {
  id: ComponentTypeId;
  /** Module that owns this definition. */
  owner: string;
  /** Whether the component is written to save files. */
  persist: boolean;
  /** Human readable purpose, used by the debug console. */
  description?: string;
}

export interface RelationDefinition {
  id: RelationTypeId;
  owner: string;
  /** Namespaced kinds this relation may connect (empty = any). */
  allowedFrom?: string[];
  allowedTo?: string[];
  persist: boolean;
  description?: string;
}
