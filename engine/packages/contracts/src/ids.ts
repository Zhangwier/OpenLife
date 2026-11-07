/**
 * OpenLife Core Contract - Identifier layer.
 *
 * All cross-module identifiers are namespaced strings. The kernel never
 * interprets the meaning of a namespace, it only enforces shape and ownership.
 */

export type EntityId = string;
export type RelationId = string;
export type CommandId = string;
export type EventId = string;
export type TransactionId = string;
export type FactId = string;
export type TaskId = string;
export type LineageId = string;
export type TimelineId = string;
export type WorldId = string;

/** Namespaced type identifiers, e.g. `life.identity`, `family.parent_of`. */
export type ComponentTypeId = string;
export type RelationTypeId = string;
export type CommandType = string;
export type EventType = string;
export type TaskTypeId = string;
export type CapabilityId = string;
export type ProjectionId = string;
export type ExtensionPointId = string;
export type RuleId = string;

/** A module (World Pack / System Pack / Content Pack / ...) id. */
export type ModuleId = string;

/**
 * Namespace shape: `<namespace>.<name>` with optional deeper segments.
 * Segments are lower snake/kebab case. At least two segments are required so
 * that no core type can accidentally live in the root namespace.
 */
const NAMESPACED_ID = /^[a-z][a-z0-9-]*(?:\.[a-z0-9][a-z0-9_-]*)+$/;

/** A module id is a single lowercase token that acts as a namespace root. */
const MODULE_ID = /^[a-z][a-z0-9-]*$/;

/** Entity ids are opaque; only module-issued ids need to be readable. */
export function isNamespacedId(value: unknown): value is string {
  return typeof value === "string" && NAMESPACED_ID.test(value);
}

export function assertNamespacedId(value: unknown, what: string): string {
  if (!isNamespacedId(value)) {
    throw new Error(
      `${what} must be a namespaced id like "namespace.name", received: ${JSON.stringify(value)}`,
    );
  }
  return value;
}

export function isModuleId(value: unknown): value is string {
  return typeof value === "string" && MODULE_ID.test(value);
}

export function assertModuleId(value: unknown): string {
  if (!isModuleId(value)) {
    throw new Error(
      `module id must be a single lowercase token like "modern-world", received: ${JSON.stringify(value)}`,
    );
  }
  return value;
}

/**
 * True when `definitionNamespace` may be used by the module called `moduleId`.
 *
 * A module owns its own namespace root: module `career` owns `career.*`, and
 * module `modern-world` owns `modern.*` (its first hyphen-separated segment).
 * This is what stops a module from squatting another module's namespace
 * (§55, §INV-007) while still allowing the naming style used in the spec.
 */
export function isNamespaceCompatible(moduleId: string, definitionNamespace: string): boolean {
  if (moduleId === definitionNamespace) return true;
  const moduleRoot = moduleId.split("-")[0] ?? moduleId;
  return moduleRoot === definitionNamespace || definitionNamespace.startsWith(`${moduleRoot}-`);
}

/** Returns the namespace segment, e.g. `family` for `family.parent_of`. */
export function namespaceOf(id: string): string {
  const dot = id.indexOf(".");
  return dot === -1 ? id : id.slice(0, dot);
}

/** True when `id` belongs to `namespace` or one of its sub-namespaces. */
export function isInNamespace(id: string, namespace: string): boolean {
  return id === namespace || id.startsWith(`${namespace}.`);
}

/** Composite key for a relation lookup index. */
export function relationKey(type: RelationTypeId, from: EntityId, to: EntityId): string {
  return `${type}\u0000${from}\u0000${to}`;
}
