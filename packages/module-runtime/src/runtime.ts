/**
 * Module Runtime (§53-§62).
 *
 * Responsibilities:
 *   - validate manifests (namespaced id, engine range, requires/incompatible);
 *   - give modules a registration surface limited to the v0.1 Extension Points;
 *   - own module lifecycle: registered -> active -> dormant -> orphaned;
 *   - keep module state opaque and persistable;
 *   - unload a module without deleting the history it produced.
 *
 * A module has no way to reach the kernel's state mutation path: it can only
 * register definitions and observe a read-only world view.
 */

import type {
  CapabilityId,
  JsonValue,
  ModuleId,
  ModuleLifecycleContext,
  ModuleManifest,
  ModuleMigration,
  ModuleRegistrationContext,
  ModuleRegistryView,
  ModuleState,
  OpenLifeModule,
} from "@openlife/contracts";
import { ErrorCode, fail, isNamespacedId, isModuleId } from "@openlife/contracts";
import type { DefinitionSet } from "@openlife/rule-engine";
import type { Kernel } from "@openlife/kernel";
import { satisfies } from "./semver.ts";

export interface ModuleRuntimeOptions {
  definitions: DefinitionSet;
  engineVersion: string;
  worldSeed: number;
  /** Optional kernel binding for lifecycle hooks and task cleanup. */
  kernel?: Kernel;
}

export interface InstalledModuleInfo {
  id: ModuleId;
  version: string;
  type: string;
  state: ModuleState;
  provides: CapabilityId[];
  requires: CapabilityId[];
  /** Definitions registered by this module, by registry kind. */
  definitions: Record<string, string[]>;
  error?: string;
}

interface InstalledModule {
  module: OpenLifeModule;
  state: ModuleState;
  state_: Record<string, unknown>;
  error?: string;
}

export class ModuleRuntime {
  readonly #options: ModuleRuntimeOptions;
  readonly #modules = new Map<ModuleId, InstalledModule>();
  readonly #capabilities = new Map<CapabilityId, { owner: ModuleId; implementation?: unknown }>();
  #installOrder: ModuleId[] = [];

  constructor(options: ModuleRuntimeOptions) {
    this.#options = options;
  }

  get engineVersion(): string {
    return this.#options.engineVersion;
  }

  list(): InstalledModuleInfo[] {
    return this.#installOrder.map((id) => this.#describe(id));
  }

  get(id: ModuleId): InstalledModuleInfo | undefined {
    return this.#modules.has(id) ? this.#describe(id) : undefined;
  }

  hasCapability(id: CapabilityId): boolean {
    const provided = this.#capabilities.get(id);
    if (provided) return this.#modules.get(provided.owner)?.state === "active";
    for (const installed of this.#modules.values()) {
      if (installed.state !== "active") continue;
      if ((installed.module.manifest.provides ?? []).includes(id)) return true;
    }
    return false;
  }

  capabilityImplementation<T = unknown>(id: CapabilityId): T | undefined {
    const provided = this.#capabilities.get(id);
    if (!provided || this.#modules.get(provided.owner)?.state !== "active") return undefined;
    return provided.implementation as T | undefined;
  }

  /** Validates and installs a module, then activates it. */
  install(module: OpenLifeModule): InstalledModuleInfo {
    const manifest = module.manifest;
    this.#validateManifest(manifest);
    if (this.#modules.has(manifest.id)) {
      fail(ErrorCode.DuplicateRegistration, `module already installed: ${manifest.id}`, {
        id: manifest.id,
      });
    }
    this.#checkDependencies(manifest);

    const record: InstalledModule = {
      module,
      state: "registered",
      state_: {},
    };
    this.#modules.set(manifest.id, record);
    this.#installOrder.push(manifest.id);

    const context = this.#registrationContext(manifest.id);
    try {
      module.register(context);
    } catch (error) {
      record.state = "failed";
      record.error = (error as Error).message;
      this.#options.definitions.disableOwner(manifest.id);
      return this.#describe(manifest.id);
    }

    for (const capability of manifest.provides ?? []) {
      this.#capabilities.set(capability, { owner: manifest.id });
    }

    this.#activate(record);
    return this.#describe(manifest.id);
  }

  /** Re-enables a previously unloaded module. */
  activate(id: ModuleId): InstalledModuleInfo {
    const record = this.#require(id);
    if (record.state === "active") return this.#describe(id);
    this.#options.definitions.enableOwner(id);
    for (const capability of record.module.manifest.provides ?? []) {
      if (!this.#capabilities.has(capability)) this.#capabilities.set(capability, { owner: id });
    }
    this.#activate(record);
    return this.#describe(id);
  }

  /** Keeps definitions and state but stops them from being used. */
  deactivate(id: ModuleId): InstalledModuleInfo {
    const record = this.#require(id);
    if (record.state !== "active") return this.#describe(id);
    record.module.deactivate?.(this.#lifecycleContext(id, record));
    this.#options.definitions.disableOwner(id);
    this.#options.kernel?.cancelScheduledOwner(id);
    record.state = "dormant";
    return this.#describe(id);
  }

  /**
   * Unloads a module. Definitions and scheduled tasks are deactivated, but the
   * module's persisted state and everything it wrote into the world and the
   * event journal stay in place (§INV-006, §62).
   */
  unload(id: ModuleId): InstalledModuleInfo {
    const record = this.#require(id);
    if (record.state === "active") record.module.deactivate?.(this.#lifecycleContext(id, record));
    this.#options.definitions.disableOwner(id);
    this.#options.kernel?.cancelScheduledOwner(id);
    record.state = "orphaned";
    return this.#describe(id);
  }

  getState(id: ModuleId): Record<string, unknown> {
    return this.#require(id).state_;
  }

  setState(id: ModuleId, state: Record<string, unknown>): void {
    this.#require(id).state_ = state;
  }

  serializeState(): Record<ModuleId, Record<string, unknown>> {
    const out: Record<ModuleId, Record<string, unknown>> = {};
    for (const [id, record] of this.#modules) {
      out[id] = { ...record.state_ };
    }
    return out;
  }

  restoreState(state: Record<ModuleId, Record<string, unknown>>): void {
    for (const [id, value] of Object.entries(state)) {
      const record = this.#modules.get(id);
      if (record) record.state_ = { ...value };
    }
  }

  /** Versions as recorded in a save file, for migration. */
  savedVersions(): { id: ModuleId; version: string }[] {
    return this.#installOrder.map((id) => ({
      id,
      version: this.#require(id).module.manifest.version,
    }));
  }

  /**
   * Applies module-owned migrations when a save was written by an older version
   * of the module (§61). The core never inspects module data.
   */
  migrateFrom(saved: { id: ModuleId; version: string }[]): { module: ModuleId; from: string; to: string }[] {
    const applied: { module: ModuleId; from: string; to: string }[] = [];
    for (const entry of saved) {
      const record = this.#modules.get(entry.id);
      if (!record) continue;
      const current = record.module.manifest.version;
      if (current === entry.version) continue;
      const migrations = orderMigrations(record.module.migrations ?? [], entry.version);
      let version = entry.version;
      let state = record.state_;
      for (const migration of migrations) {
        state = migration.migrate(state);
        version = migration.to;
        applied.push({ module: entry.id, from: migration.from, to: migration.to });
      }
      record.state_ = state;
      if (version !== current) {
        applied.push({ module: entry.id, from: version, to: current });
      }
    }
    return applied;
  }

  #activate(record: InstalledModule): void {
    try {
      record.module.activate?.(this.#lifecycleContext(record.module.manifest.id, record));
      record.state = "active";
    } catch (error) {
      record.state = "failed";
      record.error = (error as Error).message;
      this.#options.definitions.disableOwner(record.module.manifest.id);
    }
  }

  #lifecycleContext(id: ModuleId, record: InstalledModule): ModuleLifecycleContext {
    const kernel = this.#options.kernel;
    return {
      world: kernel ? kernel.worldView() : emptyWorldView(),
      state: record.state_,
      worldSeed: this.#options.worldSeed,
    };
  }

  #registrationContext(owner: ModuleId): ModuleRegistrationContext {
    const definitions = this.#options.definitions;
    const registryView: ModuleRegistryView = {
      hasComponent: (id) => definitions.components.has(id),
      hasCommand: (type) => definitions.commands.has(type),
      hasKnowledge: (id) => definitions.knowledge.has(id),
      hasCapability: (id) => this.hasCapability(id),
      listComponents: () => definitions.components.keys(),
      listCommands: () => definitions.commands.keys(),
      listKnowledge: () => definitions.knowledge.keys(),
      listCapabilities: () => [...this.#capabilities.keys()],
    };
    return {
      registry: registryView,
      registerComponent: (definition) =>
        definitions.components.register(definition.id, { ...definition, owner }, owner),
      registerRelation: (definition) =>
        definitions.relations.register(definition.id, { ...definition, owner }, owner),
      registerCommand: (definition) =>
        definitions.commands.register(definition.type, { ...definition, owner }, owner),
      registerConstraintRule: (rule) =>
        definitions.constraints.register(rule.id, { ...rule, kind: "constraint", owner }, owner),
      registerResolutionRule: (rule) =>
        definitions.resolutions.register(rule.id, { ...rule, kind: "resolution", owner }, owner),
      registerReactionRule: (rule) =>
        definitions.reactions.register(rule.id, { ...rule, kind: "reaction", owner }, owner),
      registerTask: (definition) =>
        definitions.tasks.register(definition.type, { ...definition, owner }, owner),
      registerKnowledge: (definition) =>
        definitions.knowledge.register(definition.id, { ...definition, owner }, owner),
      registerProjection: (definition) =>
        definitions.projections.register(definition.id, { ...definition, owner }, owner),
      registerMigration: (migration) => {
        const record = this.#modules.get(owner);
        if (!record) {
          fail(ErrorCode.ModuleNotFound, `module not installed: ${owner}`, { owner });
        }
        record.module.migrations = [...(record.module.migrations ?? []), migration];
      },
      provideCapability: (id, implementation) => {
        if (!isNamespacedId(id)) {
          fail(ErrorCode.NamespaceViolation, `capability id must be namespaced: ${id}`, { id });
        }
        if (this.#capabilities.has(id)) {
          fail(ErrorCode.DuplicateRegistration, `capability already provided: ${id}`, {
            id,
            owner,
            existingOwner: this.#capabilities.get(id)?.owner,
          });
        }
        this.#capabilities.set(id, { owner, implementation });
      },
    };
  }

  #validateManifest(manifest: ModuleManifest): void {
    if (!manifest.id || !isModuleId(manifest.id)) {
      fail(
        ErrorCode.NamespaceViolation,
        `module id must be a single lowercase token (e.g. "modern-world"): ${manifest.id}`,
        { id: manifest.id },
      );
    }
    if (!manifest.version || !/^\d+\.\d+\.\d+/.test(manifest.version)) {
      fail(ErrorCode.ValidationFailed, `module version must be semver: ${manifest.version}`, {
        id: manifest.id,
      });
    }
    if (manifest.engineRange && !satisfies(this.#options.engineVersion, manifest.engineRange)) {
      fail(
        ErrorCode.ModuleConflict,
        `module ${manifest.id}@${manifest.version} requires engine ${manifest.engineRange}, ` +
          `running ${this.#options.engineVersion}`,
        { id: manifest.id, engineRange: manifest.engineRange },
      );
    }
  }

  #checkDependencies(manifest: ModuleManifest): void {
    for (const required of manifest.requires ?? []) {
      if (!this.hasCapability(required)) {
        fail(ErrorCode.CapabilityMissing, `module ${manifest.id} requires capability ${required}`, {
          id: manifest.id,
          capability: required,
        });
      }
    }
    for (const incompatible of manifest.incompatible ?? []) {
      if (this.#modules.has(incompatible)) {
        fail(
          ErrorCode.ModuleConflict,
          `module ${manifest.id} is incompatible with installed module ${incompatible}`,
          { id: manifest.id, incompatible },
        );
      }
    }
  }

  #describe(id: ModuleId): InstalledModuleInfo {
    const record = this.#require(id);
    const definitions: Record<string, string[]> = {
      components: ownerEntries(this.#options.definitions.components.all(), id),
      relations: ownerEntries(this.#options.definitions.relations.all(), id),
      commands: ownerEntries(this.#options.definitions.commands.all(), id),
      tasks: ownerEntries(this.#options.definitions.tasks.all(), id),
      knowledge: ownerEntries(this.#options.definitions.knowledge.all(), id),
      projections: ownerEntries(this.#options.definitions.projections.all(), id),
      constraints: ownerEntries(this.#options.definitions.constraints.all(), id),
      resolutions: ownerEntries(this.#options.definitions.resolutions.all(), id),
      reactions: ownerEntries(this.#options.definitions.reactions.all(), id),
    };
    return {
      id,
      version: record.module.manifest.version,
      type: record.module.manifest.type,
      state: record.state,
      provides: record.module.manifest.provides ?? [],
      requires: record.module.manifest.requires ?? [],
      definitions,
      ...(record.error ? { error: record.error } : {}),
    };
  }

  #require(id: ModuleId): InstalledModule {
    const record = this.#modules.get(id);
    if (!record) fail(ErrorCode.ModuleNotFound, `module not installed: ${id}`, { id });
    return record;
  }
}

function ownerEntries(
  items: { id?: string; type?: string; owner: string }[],
  owner: string,
): string[] {
  return items
    .filter((item) => item.owner === owner)
    .map((item) => (item.id ?? item.type) as string);
}

function orderMigrations(migrations: ModuleMigration[], fromVersion: string): ModuleMigration[] {
  const ordered: ModuleMigration[] = [];
  let version = fromVersion;
  const remaining = [...migrations];
  for (;;) {
    const index = remaining.findIndex((migration) => migration.from === version);
    if (index === -1) break;
    const [migration] = remaining.splice(index, 1) as [ModuleMigration];
    ordered.push(migration);
    version = migration.to;
  }
  return ordered;
}

function emptyWorldView(): import("@openlife/contracts").WorldView {
  return {
    tick: 0,
    getEntity: () => undefined,
    hasEntity: () => false,
    listEntities: () => [],
    getComponent: () => undefined,
    listRelations: () => [],
    countEntities: () => 0,
  };
}

export function defineModule(module: OpenLifeModule): OpenLifeModule {
  return module;
}

export type { JsonValue };
