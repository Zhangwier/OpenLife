/**
 * Rule Engine - definition registries.
 *
 * Every registry enforces the same contract rules:
 *   - ids must be namespaced (§55);
 *   - duplicate ids are rejected rather than silently overriding;
 *   - definitions remember which module owns them, so unloading a module can
 *     deactivate its definitions without deleting history (§62).
 */

import type {
  CommandDefinition,
  ComponentDefinition,
  ConstraintRule,
  ProjectionDefinition,
  QueryDefinition,
  ReactionRule,
  RelationDefinition,
  ResolutionRule,
  TaskDefinition,
  KnowledgeDefinition,
  ResourceDefinition,
  ProcessDefinition,
} from "@openlife/contracts";
import {
  ErrorCode,
  fail,
  assertNamespacedId,
  isNamespaceCompatible,
  namespaceOf,
} from "@openlife/contracts";

export interface OwnedDefinition {
  owner: string;
  /** False once the owning module is deactivated (§62). */
  enabled: boolean;
}

export type Registered<T> = T & OwnedDefinition;

export class DefinitionRegistry<T extends { id?: string; type?: string }> {
  readonly #items = new Map<string, Registered<T>>();
  readonly #kindLabel: string;

  constructor(kindLabel: string) {
    this.#kindLabel = kindLabel;
  }

  register(key: string, definition: T, owner: string): Registered<T> {
    assertNamespacedId(key, `${this.#kindLabel} id`);
    if (!isNamespaceCompatible(owner, namespaceOf(key))) {
      fail(
        ErrorCode.NamespaceViolation,
        `${this.#kindLabel} "${key}" is outside the namespace owned by module "${owner}"`,
        { key, owner, namespace: namespaceOf(key) },
      );
    }
    if (this.#items.has(key)) {
      fail(
        ErrorCode.DuplicateRegistration,
        `${this.#kindLabel} already registered: ${key}`,
        { key, existingOwner: this.#items.get(key)?.owner, owner },
      );
    }
    const registered: Registered<T> = { ...definition, owner, enabled: true };
    this.#items.set(key, registered);
    return registered;
  }

  get(key: string): Registered<T> | undefined {
    return this.#items.get(key);
  }

  has(key: string): boolean {
    return this.#items.has(key);
  }

  /** Enabled definitions only; disabled ones stay stored for history (§62). */
  active(): Registered<T>[] {
    return [...this.#items.values()].filter((item) => item.enabled);
  }

  all(): Registered<T>[] {
    return [...this.#items.values()];
  }

  keys(): string[] {
    return [...this.#items.keys()];
  }

  /** Deactivate (not delete) everything owned by a module. */
  disableOwner(owner: string): number {
    let count = 0;
    for (const item of this.#items.values()) {
      if (item.owner === owner && item.enabled) {
        item.enabled = false;
        count += 1;
      }
    }
    return count;
  }

  enableOwner(owner: string): number {
    let count = 0;
    for (const item of this.#items.values()) {
      if (item.owner === owner && !item.enabled) {
        item.enabled = true;
        count += 1;
      }
    }
    return count;
  }

  ownersOf(): string[] {
    return [...new Set([...this.#items.values()].map((item) => item.owner))];
  }
}

export type CommandRegistry = DefinitionRegistry<CommandDefinition>;
export type TaskRegistry = DefinitionRegistry<TaskDefinition>;
export type KnowledgeRegistry = DefinitionRegistry<KnowledgeDefinition>;
export type ResourceRegistry = DefinitionRegistry<ResourceDefinition>;
export type ProcessRegistry = DefinitionRegistry<ProcessDefinition>;
export type ProjectionRegistry = DefinitionRegistry<ProjectionDefinition>;
export type QueryRegistry = DefinitionRegistry<QueryDefinition>;
export type ComponentRegistry = DefinitionRegistry<ComponentDefinition>;
export type RelationRegistry = DefinitionRegistry<RelationDefinition>;

export interface RuleRegistries {
  constraints: DefinitionRegistry<ConstraintRule>;
  resolutions: DefinitionRegistry<ResolutionRule>;
  reactions: DefinitionRegistry<ReactionRule>;
}

/**
 * All definition registries used by a simulation.
 * Grouped so the module runtime can wire one object into modules.
 */
export class DefinitionSet {
  readonly components = new DefinitionRegistry<ComponentDefinition>("component");
  readonly relations = new DefinitionRegistry<RelationDefinition>("relation");
  readonly commands = new DefinitionRegistry<CommandDefinition>("command");
  readonly tasks = new DefinitionRegistry<TaskDefinition>("task");
  readonly knowledge = new DefinitionRegistry<KnowledgeDefinition>("knowledge");
  readonly resources = new DefinitionRegistry<ResourceDefinition>("resource");
  readonly processes = new DefinitionRegistry<ProcessDefinition>("process");
  readonly projections = new DefinitionRegistry<ProjectionDefinition>("projection");
  readonly queries = new DefinitionRegistry<QueryDefinition>("query");
  readonly constraints = new DefinitionRegistry<ConstraintRule>("constraint rule");
  readonly resolutions = new DefinitionRegistry<ResolutionRule>("resolution rule");
  readonly reactions = new DefinitionRegistry<ReactionRule>("reaction rule");

  /** Every registry, for bulk lifecycle operations. */
  all(): DefinitionRegistry<{ id?: string; type?: string }>[] {
    return [
      this.components,
      this.relations,
      this.commands,
      this.tasks,
      this.knowledge,
      this.resources,
      this.processes,
      this.projections,
      this.queries,
      this.constraints,
      this.resolutions,
      this.reactions,
    ] as unknown as DefinitionRegistry<{ id?: string; type?: string }>[];
  }

  disableOwner(owner: string): void {
    for (const registry of this.all()) registry.disableOwner(owner);
  }

  enableOwner(owner: string): void {
    for (const registry of this.all()) registry.enableOwner(owner);
  }
}
