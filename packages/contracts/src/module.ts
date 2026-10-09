/**
 * OpenLife Core Contract - Module system.
 *
 * Modules extend the world through registered Extension Points only (§57, §58).
 * They never patch the kernel, never hold their own world truth and never own
 * their own RNG (§INV-007).
 */

import type { CapabilityId, ExtensionPointId, ModuleId } from "./ids.ts";

export type ModuleType =
  | "world-pack"
  | "system-pack"
  | "content-pack"
  | "narrative-pack"
  | "presentation-pack"
  | "compatibility-pack";

/** Lifecycle state of an installed module (§62). */
export type ModuleState = "registered" | "active" | "dormant" | "orphaned" | "failed";

export interface ModuleManifest {
  id: ModuleId;
  version: string;
  /** Semver range of engine versions this module supports. */
  engineRange: string;
  type: ModuleType;
  name?: string;
  description?: string;
  /** Hard capability requirements. */
  requires?: CapabilityId[];
  /** Soft capability requirements (degrade gracefully when missing). */
  optional?: CapabilityId[];
  /** Module ids that must not be installed together. */
  incompatible?: ModuleId[];
  /** Capabilities this module provides to others. */
  provides?: CapabilityId[];
  /** Capabilities this module expects to consume at runtime. */
  expects?: CapabilityId[];
  /** Extension points this module registers into. */
  capabilities?: ExtensionPointId[];
  /** Declared permissions, validated by the module runtime. */
  permissions?: string[];
  /** Public exports other modules may depend on. */
  exports?: string[];
}

/**
 * The complete v0.1 extension point surface (§58). Anything a module wants to
 * add must fit one of these; otherwise it is a Core Change RFC.
 */
export const ExtensionPoints = {
  ComponentRegister: "component.register",
  RelationRegister: "relation.register",
  CommandRegister: "command.register",
  ConstraintRuleRegister: "rule.constraint.register",
  ResolutionRuleRegister: "rule.resolution.register",
  ReactionRuleRegister: "rule.reaction.register",
  EffectRegister: "effect.register",
  EventSubscribe: "event.subscribe",
  ResourceRegister: "resource.register",
  ProcessRegister: "process.register",
  KnowledgeRegister: "knowledge.register",
  BehaviorDimensionRegister: "behavior.dimension.register",
  ProjectionRegister: "projection.register",
  NarrativeRegister: "narrative.register",
  MigrationRegister: "migration.register",
  ScheduleRegister: "schedule.register",
  QueryRegister: "query.register",
  /**
   * Declare how this world pack interprets the kernel's abstract tick
   * (TIME-RFC-001). Declarative only: it adds no kernel behaviour and no
   * world-view concept beyond "how long is one unit".
   */
  ClockProfileRegister: "clock.profile.register",
} as const;

export type ExtensionPointName = (typeof ExtensionPoints)[keyof typeof ExtensionPoints];

export interface CommandDefinition {
  type: string;
  owner: string;
  /** Human readable argument summary for the debug console / AI adapters. */
  params?: Record<string, string>;
  description?: string;
  /** Capabilities the command needs at runtime. */
  requires?: CapabilityId[];
}

export interface TaskDefinition {
  type: string;
  owner: string;
  description?: string;
  /**
   * A scheduled task turns into a command (or nothing) at its due tick.
   * Returning `undefined` means "nothing to do" (already satisfied).
   */
  handler(ctx: TaskContext): TaskOutcome | undefined;
}

export interface TaskContext {
  taskType: string;
  payload: Record<string, unknown>;
  at: number;
  world: import("./rule.ts").WorldView;
  rng: import("./rule.ts").DeterministicRngLike;
  note(message: string, data?: Record<string, unknown>): void;
}

export interface TaskOutcome {
  command?: {
    type: string;
    actorId?: string;
    targetId?: string;
    payload?: Record<string, unknown>;
    source?: import("./command.ts").CommandSource;
  };
  /**
   * Ordered command batch emitted by one scheduled task. Commands execute
   * sequentially and stop at the first rejection. Useful for coarse-grained
   * orchestration without registering one scheduler task per world entity.
   */
  commands?: Array<{
    type: string;
    actorId?: string;
    targetId?: string;
    payload?: Record<string, unknown>;
    source?: import("./command.ts").CommandSource;
  }>;
  /** Reschedule the task at a later tick instead of running a command. */
  rescheduleAt?: number;
}

export interface ModuleMigration {
  from: string;
  to: string;
  /** Transforms this module's persisted state; core never inspects it. */
  migrate(state: Record<string, unknown>): Record<string, unknown>;
}

export interface OpenLifeModule {
  manifest: ModuleManifest;
  /** Declarative registration; called once during install. */
  register(registry: ModuleRegistrationContext): void;
  activate?(ctx: ModuleLifecycleContext): void;
  deactivate?(ctx: ModuleLifecycleContext): void;
  migrations?: ModuleMigration[];
}

/**
 * What a module may do during `register`. Every method corresponds to one
 * Extension Point; there is no generic "patch the world" escape hatch.
 */
export interface ModuleRegistrationContext {
  registerComponent(definition: Omit<import("./entity.ts").ComponentDefinition, "owner">): void;
  registerRelation(definition: Omit<import("./entity.ts").RelationDefinition, "owner">): void;
  registerCommand(definition: Omit<CommandDefinition, "owner">): void;
  registerConstraintRule(rule: Omit<import("./rule.ts").ConstraintRule, "owner" | "kind">): void;
  registerResolutionRule(rule: Omit<import("./rule.ts").ResolutionRule, "owner" | "kind">): void;
  registerReactionRule(rule: Omit<import("./rule.ts").ReactionRule, "owner" | "kind">): void;
  registerTask(definition: Omit<TaskDefinition, "owner">): void;
  registerKnowledge(
    definition: Omit<import("./knowledge.ts").KnowledgeDefinition, "owner">,
  ): void;
  registerResource(
    definition: Omit<import("./resource.ts").ResourceDefinition, "owner">,
  ): void;
  registerProcess(
    definition: Omit<import("./resource.ts").ProcessDefinition, "owner">,
  ): void;
  registerProjection(definition: ProjectionDefinition): void;
  registerMigration(migration: ModuleMigration): void;
  /**
   * Declares this world pack's tick interpretation. Registration order decides
   * precedence: the first module to claim the slot owns it, later claims fail
   * loudly rather than silently shadowing a world's calendar.
   */
  registerClockProfile(profile: Omit<import("./time.ts").ClockProfile, "owner">): void;
  provideCapability(id: CapabilityId, implementation?: unknown): void;
  /** Read-only access to already-registered definitions. */
  readonly registry: ModuleRegistryView;
}

export interface ModuleRegistryView {
  hasComponent(id: string): boolean;
  hasCommand(type: string): boolean;
  hasKnowledge(id: string): boolean;
  hasResource(id: string): boolean;
  hasProcess(id: string): boolean;
  hasCapability(id: CapabilityId): boolean;
  capabilityImplementation(id: CapabilityId): unknown | undefined;
  /** The registered clock profile, when a world pack has already claimed it. */
  clockProfile(): import("./time.ts").ClockProfile | undefined;
  listComponents(): string[];
  listCommands(): string[];
  listKnowledge(): string[];
  listResources(): string[];
  listProcesses(): string[];
  listCapabilities(): CapabilityId[];
}

export interface ModuleLifecycleContext {
  world: import("./rule.ts").WorldView;
  /** Per-module private state slot; the kernel persists it opaquely. */
  readonly state: Record<string, unknown>;
  readonly worldSeed: number;
}

export interface ProjectionDefinition {
  id: string;
  owner?: string;
  description?: string;
  build(ctx: ProjectionContext): Record<string, unknown>;
}

export interface ProjectionContext {
  world: import("./rule.ts").WorldView;
  history: HistoryView;
  /** Observer this projection is generated for; `undefined` = system view. */
  viewerId?: string;
  params: Record<string, unknown>;
  rng: import("./rule.ts").DeterministicRngLike;
}

export interface HistoryView {
  listEvents(filter?: {
    type?: string;
    actorId?: string;
    sinceTick?: number;
    minSignificance?: number;
  }): ReadonlyArray<import("./event.ts").WorldEvent>;
  listRecords(filter?: { entityId?: string; minSignificance?: number }): ReadonlyArray<HistoricalRecord>;
  explain(eventId: string): CausalExplanation | undefined;
  lineage(lineageId: string): LineageView | undefined;
}

export interface HistoricalRecord {
  id: string;
  eventId: string;
  type: string;
  at: number;
  subjectId?: string;
  summary: string;
  significance: number;
  /** Set once the subject entity is archived; the record survives (§INV-006). */
  subjectArchived?: boolean;
  owner?: string;
}

export interface CausalConsequence {
  eventId: string;
  type: string;
  at: number;
  summary: string;
}

export interface CausalEventExplanation {
  kind: "event";
  eventId: string;
  type: string;
  at: number;
  summary: string;
  /** Command that directly produced this event, when there was one. */
  commandId?: string;
  causes: CausalExplanation[];
  consequences: CausalConsequence[];
}

export interface CausalCommandExplanation {
  kind: "command";
  commandId: string;
  type: "command";
  at: number;
  summary: string;
  causes: CausalExplanation[];
  consequences: CausalConsequence[];
}

export type CausalExplanation = CausalEventExplanation | CausalCommandExplanation;
export interface LineageView {
  id: string;
  founderId?: string;
  members: { characterId: string; generation: number; alive: boolean }[];
  records: HistoricalRecord[];
}
