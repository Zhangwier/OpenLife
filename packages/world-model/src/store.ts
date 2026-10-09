/**
 * World Model - the authoritative state container.
 *
 * Only the kernel transaction applies mutations to this store. Everything else
 * (rules, modules, UI, AI) receives a read-only `WorldView`.
 */

import type {
  ComponentData,
  ComponentTypeId,
  EntityId,
  EntityRecord,
  JsonValue,
  RelationId,
  RelationRecord,
  RelationTypeId,
} from "@openlife/contracts";
import { relationKey } from "@openlife/contracts";

export interface WorldStoreOptions {
  /** Prefix used when generating ids for kernel-created entities. */
  entityIdPrefix?: string;
  startEntitySeq?: number;
  startRelationSeq?: number;
}

export interface SerializedWorld {
  entities: EntityRecord[];
  relations: RelationRecord[];
  entitySeq: number;
  relationSeq: number;
  entityIdPrefix: string;
}

/**
 * Deterministic entity/relation store.
 *
 * Iteration order is insertion order, which is fully determined by the command
 * sequence and the world seed, so replays produce identical snapshots.
 */
export class WorldStore {
  #entities = new Map<EntityId, EntityRecord>();
  #relations = new Map<RelationId, RelationRecord>();
  #byKind = new Map<string, Set<EntityId>>();
  #relationsByType = new Map<RelationTypeId, Set<RelationId>>();
  #relationsByFrom = new Map<EntityId, Set<RelationId>>();
  #relationsByTo = new Map<EntityId, Set<RelationId>>();
  #relationIndex = new Map<string, RelationId>();
  #entitySeq: number;
  #relationSeq = 0;
  #entityIdPrefix: string;

  constructor(options: WorldStoreOptions = {}) {
    this.#entitySeq = options.startEntitySeq ?? 0;
    this.#relationSeq = options.startRelationSeq ?? 0;
    this.#entityIdPrefix = options.entityIdPrefix ?? "core";
  }

  get entityCount(): number {
    return this.#entities.size;
  }

  get relationCount(): number {
    return this.#relations.size;
  }

  /** Generates a deterministic id for a kernel-created entity. */
  nextEntityId(namespace: string): EntityId {
    this.#entitySeq += 1;
    return `${namespace}:e${this.#entitySeq}`;
  }

  nextRelationId(): RelationId {
    this.#relationSeq += 1;
    return `rel:r${this.#relationSeq}`;
  }

  getEntity(id: EntityId): EntityRecord | undefined {
    return this.#entities.get(id);
  }

  hasEntity(id: EntityId): boolean {
    return this.#entities.has(id);
  }

  listEntities(filter: { kind?: string; includeArchived?: boolean } = {}): EntityRecord[] {
    const includeArchived = filter.includeArchived ?? false;
    const source = filter.kind ? this.#byKind.get(filter.kind) : undefined;
    const out: EntityRecord[] = [];
    if (filter.kind) {
      if (!source) return out;
      for (const id of source) {
        const entity = this.#entities.get(id);
        if (!entity) continue;
        if (!includeArchived && entity.archivedAt !== undefined) continue;
        out.push(entity);
      }
      return out;
    }
    for (const entity of this.#entities.values()) {
      if (!includeArchived && entity.archivedAt !== undefined) continue;
      out.push(entity);
    }
    return out;
  }

  countEntities(kind: string): number {
    const ids = this.#byKind.get(kind);
    if (!ids) return 0;
    let count = 0;
    for (const id of ids) {
      const entity = this.#entities.get(id);
      if (entity && entity.archivedAt === undefined) count += 1;
    }
    return count;
  }

  getComponent(entityId: EntityId, component: ComponentTypeId): ComponentData | undefined {
    return this.#entities.get(entityId)?.components[component];
  }

  /** Used by the transaction; callers must not mutate the returned object. */
  createEntity(record: EntityRecord): EntityRecord {
    if (this.#entities.has(record.id)) {
      throw new Error(`entity already exists: ${record.id}`);
    }
    this.#entities.set(record.id, record);
    let bucket = this.#byKind.get(record.kind);
    if (!bucket) {
      bucket = new Set();
      this.#byKind.set(record.kind, bucket);
    }
    bucket.add(record.id);
    return record;
  }

  setComponent(entityId: EntityId, component: ComponentTypeId, value: ComponentData): void {
    const entity = this.#requireEntity(entityId);
    entity.components[component] = value;
  }

  mergeComponent(entityId: EntityId, component: ComponentTypeId, patch: ComponentData): void {
    const entity = this.#requireEntity(entityId);
    const current = entity.components[component];
    entity.components[component] = current ? { ...current, ...patch } : { ...patch };
  }

  archiveEntity(entityId: EntityId, at: number, reason: string): void {
    const entity = this.#requireEntity(entityId);
    entity.archivedAt = at;
    entity.archivedReason = reason;
  }

  addRelation(record: RelationRecord): RelationRecord {
    const key = relationKey(record.type, record.from, record.to);
    const existingId = this.#relationIndex.get(key);
    if (existingId !== undefined) {
      const existing = this.#relations.get(existingId);
      // A relation key identifies one *current* fact. Re-adding a key whose
      // previous relation was archived is not a duplicate: it is the same fact
      // being re-established (a jar taken again, a place re-entered). Keeping
      // the archived record and adding a second live one would give the world
      // two answers to "is A related to B", so the archived record is replaced.
      if (existing && existing.archivedAt === undefined) {
        throw new Error(`relation already exists: ${record.type} ${record.from} -> ${record.to}`);
      }
      if (existing) {
        this.#relations.delete(existingId);
        remove(this.#relationsByType, existing.type, existingId);
        remove(this.#relationsByFrom, existing.from, existingId);
        remove(this.#relationsByTo, existing.to, existingId);
      }
    }
    this.#relations.set(record.id, record);
    this.#relationIndex.set(key, record.id);
    push(this.#relationsByType, record.type, record.id);
    push(this.#relationsByFrom, record.from, record.id);
    push(this.#relationsByTo, record.to, record.id);
    return record;
  }

  getRelation(type: RelationTypeId, from: EntityId, to: EntityId): RelationRecord | undefined {
    const id = this.#relationIndex.get(relationKey(type, from, to));
    return id ? this.#relations.get(id) : undefined;
  }

  listRelations(
    filter: { type?: string; from?: string; to?: string; includeArchived?: boolean } = {},
  ): RelationRecord[] {
    const includeArchived = filter.includeArchived ?? false;
    const out: RelationRecord[] = [];
    for (const relation of this.#relations.values()) {
      if (filter.type && relation.type !== filter.type) continue;
      if (filter.from && relation.from !== filter.from) continue;
      if (filter.to && relation.to !== filter.to) continue;
      if (!includeArchived && relation.archivedAt !== undefined) continue;
      out.push(relation);
    }
    return out;
  }

  mergeRelationComponent(
    relationId: RelationId,
    component: ComponentTypeId,
    patch: ComponentData,
  ): void {
    const relation = this.#relations.get(relationId);
    if (!relation) throw new Error(`unknown relation: ${relationId}`);
    const current = relation.components[component];
    relation.components[component] = current ? { ...current, ...patch } : { ...patch };
  }

  archiveRelation(relationId: RelationId, at: number, reason: string): void {
    const relation = this.#relations.get(relationId);
    if (!relation) throw new Error(`unknown relation: ${relationId}`);
    relation.archivedAt = at;
    relation.archivedReason = reason;
  }

  #requireEntity(id: EntityId): EntityRecord {
    const entity = this.#entities.get(id);
    if (!entity) throw new Error(`unknown entity: ${id}`);
    return entity;
  }

  serialize(): SerializedWorld {
    return {
      entities: [...this.#entities.values()].map(cloneEntity),
      relations: [...this.#relations.values()].map(cloneRelation),
      entitySeq: this.#entitySeq,
      relationSeq: this.#relationSeq,
      entityIdPrefix: this.#entityIdPrefix,
    };
  }

  /** Restores this store in place. Used by the transaction engine for atomic rollback. */
  restore(data: SerializedWorld): void {
    const restored = WorldStore.deserialize(data);
    this.#entities = restored.#entities;
    this.#relations = restored.#relations;
    this.#byKind = restored.#byKind;
    this.#relationsByType = restored.#relationsByType;
    this.#relationsByFrom = restored.#relationsByFrom;
    this.#relationsByTo = restored.#relationsByTo;
    this.#relationIndex = restored.#relationIndex;
    this.#entitySeq = restored.#entitySeq;
    this.#relationSeq = restored.#relationSeq;
    this.#entityIdPrefix = restored.#entityIdPrefix;
  }

  static deserialize(data: SerializedWorld): WorldStore {
    const store = new WorldStore({
      startEntitySeq: data.entitySeq,
      startRelationSeq: data.relationSeq,
      entityIdPrefix: data.entityIdPrefix,
    });
    for (const entity of data.entities) store.createEntity(cloneEntity(entity));
    for (const relation of data.relations) store.addRelation(cloneRelation(relation));
    return store;
  }

  /** Structural fingerprint used to verify save/load round trips. */
  fingerprint(): string {
    return stableStringify(this.serialize());
  }
}

function push<K, V>(map: Map<K, Set<V>>, key: K, value: V): void {
  let bucket = map.get(key);
  if (!bucket) {
    bucket = new Set();
    map.set(key, bucket);
  }
  bucket.add(value);
}

/** Removes one id from an index bucket without leaving an empty set behind. */
function remove<K, V>(map: Map<K, Set<V>>, key: K, value: V): void {
  const bucket = map.get(key);
  if (!bucket) return;
  bucket.delete(value);
  if (bucket.size === 0) map.delete(key);
}

function cloneEntity(entity: EntityRecord): EntityRecord {
  return {
    ...entity,
    components: deepClone(entity.components),
  };
}

function cloneRelation(relation: RelationRecord): RelationRecord {
  return {
    ...relation,
    components: deepClone(relation.components),
  };
}

/** Deterministic JSON clone; keys are sorted so output is stable. */
export function deepClone<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => deepClone(item)) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    out[key] = deepClone((value as Record<string, unknown>)[key]);
  }
  return out as T;
}

/** Canonical JSON with sorted keys, so hashes are reproducible. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): JsonValue {
  if (value === null || typeof value !== "object") return value as JsonValue;
  if (Array.isArray(value)) return value.map(sortValue);
  const out: Record<string, JsonValue> = {};
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record).sort()) {
    if (record[key] === undefined) continue;
    out[key] = sortValue(record[key]);
  }
  return out;
}
