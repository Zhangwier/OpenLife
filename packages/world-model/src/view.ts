/**
 * Read-only projection of the world store handed to rules, modules and queries.
 *
 * The view exposes no mutation methods, which is how INV-001 / INV-007 are
 * enforced structurally rather than by convention.
 */

import type { EntityView, RelationView, WorldView } from "@openlife/contracts";
import type { WorldStore } from "./store.ts";
import { deepClone } from "./store.ts";

export class StoreBackedWorldView implements WorldView {
  readonly #store: WorldStore;
  readonly #tick: () => number;

  constructor(store: WorldStore, tick: () => number) {
    this.#store = store;
    this.#tick = tick;
  }

  get tick(): number {
    return this.#tick();
  }

  getEntity(id: string): EntityView | undefined {
    const entity = this.#store.getEntity(id);
    if (!entity) return undefined;
    return freezeEntity(entity);
  }

  hasEntity(id: string): boolean {
    return this.#store.hasEntity(id);
  }

  listEntities(filter: { kind?: string; includeArchived?: boolean } = {}): EntityView[] {
    return this.#store.listEntities(filter).map(freezeEntity);
  }

  getComponent(entityId: string, component: string): Record<string, unknown> | undefined {
    const value = this.#store.getComponent(entityId, component);
    return value ? deepClone(value) : undefined;
  }

  listRelations(
    filter: { type?: string; from?: string; to?: string; includeArchived?: boolean } = {},
  ): RelationView[] {
    return this.#store.listRelations(filter).map(freezeRelation);
  }

  countEntities(kind: string): number {
    return this.#store.countEntities(kind);
  }
}

function freezeEntity(entity: {
  id: string;
  kind: string;
  components: Record<string, Record<string, unknown>>;
  createdAt: number;
  archivedAt?: number;
  archivedReason?: string;
}): EntityView {
  const view: EntityView = {
    id: entity.id,
    kind: entity.kind,
    components: deepClone(entity.components),
    createdAt: entity.createdAt,
  };
  if (entity.archivedAt !== undefined) view.archivedAt = entity.archivedAt;
  return view;
}

function freezeRelation(relation: {
  id: string;
  type: string;
  from: string;
  to: string;
  components: Record<string, Record<string, unknown>>;
  createdAt: number;
  archivedAt?: number;
}): RelationView {
  const view: RelationView = {
    id: relation.id,
    type: relation.type,
    from: relation.from,
    to: relation.to,
    components: deepClone(relation.components),
    createdAt: relation.createdAt,
  };
  if (relation.archivedAt !== undefined) view.archivedAt = relation.archivedAt;
  return view;
}
