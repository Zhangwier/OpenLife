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
    return value ? lazyCopy(value) : undefined;
  }

  getField(entityId: string, component: string, field: string): unknown {
    const value = this.#store.getComponent(entityId, component);
    return value && Object.hasOwn(value, field) ? deepClone(value[field]) : undefined;
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
  const view = { id: entity.id, kind: entity.kind } as EntityView;
  defineComponents(view, entity.components);
  view.createdAt = entity.createdAt;
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
  const view = { id: relation.id, type: relation.type, from: relation.from, to: relation.to } as RelationView;
  defineComponents(view, relation.components);
  view.createdAt = relation.createdAt;
  if (relation.archivedAt !== undefined) view.archivedAt = relation.archivedAt;
  return view;
}

/**
 * Most listEntities / listRelations callers only look at ids, kinds and
 * archive stamps, so a view's components map is built on first access. What
 * it will show is fixed when the view is made (a shallow capture of the
 * stored map: the store replaces component values, it never mutates them);
 * only the wrapping waits. Assigning `components` replaces it, as before.
 */
function defineComponents(view: object, raw: Record<string, Record<string, unknown>>): void {
  const captured = { ...raw };
  let built: Record<string, Record<string, unknown>> | undefined;
  Object.defineProperty(view, "components", {
    enumerable: true, configurable: true,
    get() { return (built ??= lazyComponents(captured)); },
    set(value: Record<string, Record<string, unknown>>) { built = value; },
  });
}

/**
 * A view's components, copied only when read.
 *
 * Reading the world is by far the hottest path (a village day lists every
 * resident and object many times), and most callers read one or two of an
 * entity's components. Each component value is captured by reference when
 * the view is made (the store replaces a component value on every write and
 * never mutates one in place, and the transaction stores its own copy of
 * every effect value), then deep-copied the first time it is read. The caller
 * still owns what it reads: mutating it changes nothing in the world, and
 * assigning a component on the view only changes the view.
 */
function lazyComponents(raw: Record<string, Record<string, unknown>>): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const key of Object.keys(raw).sort()) {
    const captured = raw[key]!;
    Object.defineProperty(out, key, {
      enumerable: true,
      configurable: true,
      get() {
        const copy = lazyCopy(captured);
        Object.defineProperty(out, key, { value: copy, writable: true, enumerable: true, configurable: true });
        return copy;
      },
      set(value: Record<string, unknown>) {
        Object.defineProperty(out, key, { value, writable: true, enumerable: true, configurable: true });
      },
    });
  }
  return out;
}

/**
 * A copy of one component whose fields are deep-copied on first read. A
 * resident's component carries its whole social memory; a rule asking for one
 * favour count should not copy all of it. Same ownership rules as above.
 */
export function lazyCopy<T>(value: T): T {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return deepClone(value);
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(src).sort()) {
    const captured = src[key];
    if (captured === null || typeof captured !== "object") { out[key] = captured; continue; }
    Object.defineProperty(out, key, {
      enumerable: true,
      configurable: true,
      get() {
        const copy = deepClone(captured);
        Object.defineProperty(out, key, { value: copy, writable: true, enumerable: true, configurable: true });
        return copy;
      },
      set(next: unknown) {
        Object.defineProperty(out, key, { value: next, writable: true, enumerable: true, configurable: true });
      },
    });
  }
  return out as T;
}
