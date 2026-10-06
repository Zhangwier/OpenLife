/**
 * OpenLife Core Contract - Rule Engine.
 *
 * Three rule kinds (§14):
 *   - Constraint: may this command run at all?
 *   - Resolution: what happens when it runs?
 *   - Reaction:   what else happens after an event?
 */

import type { CommandType, EventType, RuleId } from "./ids.ts";
import type { Effect, Modifier } from "./effect.ts";
import type { Command } from "./command.ts";
import type { WorldEvent } from "./event.ts";

export type RuleKind = "constraint" | "resolution" | "reaction";

export interface RuleDefinitionBase {
  id: RuleId;
  owner: string;
  kind: RuleKind;
  /** Higher priority rules run first. Default 0. */
  priority?: number;
  description?: string;
}

export interface ConstraintRule extends RuleDefinitionBase {
  kind: "constraint";
  commandType: CommandType;
  evaluate(ctx: ConstraintContext): ConstraintOutcome;
}

export interface ResolutionRule extends RuleDefinitionBase {
  kind: "resolution";
  commandType: CommandType;
  resolve(ctx: ResolutionContext): Effect[];
}

export interface ReactionRule extends RuleDefinitionBase {
  kind: "reaction";
  eventType: EventType;
  react(ctx: ReactionContext): Effect[];
}

export type AnyRule = ConstraintRule | ResolutionRule | ReactionRule;

/** Result of a constraint rule. `modifiers` are recorded in the decision trace. */
export interface ConstraintOutcome {
  ok: boolean;
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
  modifiers?: Modifier[];
}

export interface ConstraintContext {
  command: Command;
  /** Read-only state view. Mutating it has no effect on the world. */
  world: WorldView;
  /** Deterministic stream scoped to this rule and command. */
  rng: DeterministicRngLike;
  /** Record an explanation note for the decision trace (§16). */
  note(message: string, data?: Record<string, unknown>): void;
}

export interface ResolutionContext extends ConstraintContext {
  /** Outcomes of every constraint rule that ran for this command. */
  constraints: ConstraintOutcome[];
  /** Resolved numeric quantities produced by the modifier pipeline. */
  resolve(target: string, base: number, modifiers?: Modifier[]): number;
}

export interface ReactionContext {
  event: WorldEvent;
  world: WorldView;
  rng: DeterministicRngLike;
  note(message: string, data?: Record<string, unknown>): void;
}

/**
 * Minimal deterministic RNG surface exposed to rules. The full implementation
 * lives in the kernel; modules must not bring their own random source (§INV-007).
 */
export interface DeterministicRngLike {
  readonly label: string;
  nextFloat(): number;
  nextInt(minInclusive: number, maxExclusive: number): number;
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  fork(label: string): DeterministicRngLike;
  readonly drawCount: number;
}

/**
 * Read-only world view given to rules. Contains no mutation methods, so a rule
 * physically cannot bypass the transaction boundary.
 */
export interface WorldView {
  readonly tick: number;
  getEntity(id: string): Readonly<EntityView> | undefined;
  hasEntity(id: string): boolean;
  listEntities(filter?: { kind?: string; includeArchived?: boolean }): ReadonlyArray<EntityView>;
  getComponent(entityId: string, component: string): Readonly<Record<string, unknown>> | undefined;
  listRelations(filter?: {
    type?: string;
    from?: string;
    to?: string;
    includeArchived?: boolean;
  }): ReadonlyArray<RelationView>;
  /** Deterministic count of entities of a kind (used by LOD / population). */
  countEntities(kind: string): number;
}

export interface EntityView {
  id: string;
  kind: string;
  components: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  createdAt: number;
  archivedAt?: number;
}

export interface RelationView {
  id: string;
  type: string;
  from: string;
  to: string;
  components: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  createdAt: number;
  archivedAt?: number;
}
