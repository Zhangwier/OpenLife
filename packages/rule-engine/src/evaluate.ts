/**
 * Rule Engine - rule evaluation order (§14).
 *
 * Constraint -> Resolution -> Effects. Reaction rules are evaluated by the
 * event runtime after a transaction commits.
 */

import type {
  ConstraintContext,
  ConstraintOutcome,
  ConstraintRule,
  DeterministicRngLike,
  Effect,
  Modifier,
  ReactionContext,
  ReactionRule,
  ResolutionContext,
  ResolutionRule,
  WorldView,
  WorldEvent,
  Command,
} from "@openlife/contracts";
import type { DefinitionSet, Registered } from "./registry.ts";
import { applyModifiers, type ResolutionTrace } from "./modifier.ts";

export interface DecisionTrace {
  commandId: string;
  commandType: string;
  notes: { message: string; data?: Record<string, unknown> }[];
  constraints: {
    ruleId: string;
    owner: string;
    ok: boolean;
    code?: string;
    message?: string;
    modifiers: Modifier[];
  }[];
  resolutions: { ruleId: string; owner: string; effectCount: number }[];
  quantities: ResolutionTrace[];
  rngDraws: { label: string; draws: number }[];
}

export interface ConstraintPhaseResult {
  ok: boolean;
  outcomes: ConstraintOutcome[];
  trace: DecisionTrace;
}

/**
 * An effect plus the module that produced it. Ownership travels with the effect
 * so that emitted events and scheduled tasks can be attributed to a module,
 * which is what makes "unload a module without deleting history" work (§62).
 */
export interface TaggedEffect {
  effect: Effect;
  owner: string;
  ruleId: string;
}

export interface ResolutionPhaseResult {
  effects: TaggedEffect[];
  modifiers: Modifier[];
  trace: DecisionTrace;
}

export function runConstraints(
  rules: Registered<ConstraintRule>[],
  command: Command,
  world: WorldView,
  rng: DeterministicRngLike,
): ConstraintPhaseResult {
  const notes: DecisionTrace["notes"] = [];
  const outcomes: ConstraintOutcome[] = [];
  const traceConstraints: DecisionTrace["constraints"] = [];
  const rngDraws: DecisionTrace["rngDraws"] = [];
  let ok = true;

  const ordered = orderRules(rules);
  for (const rule of ordered) {
    // Each rule gets its own forked stream so that adding a rule does not shift
    // the random draws consumed by other rules.
    const ruleRng = rng.fork(rule.id);
    const before = ruleRng.drawCount;
    const ctx: ConstraintContext = {
      command,
      world,
      rng: ruleRng,
      note: (message, data) => notes.push(data ? { message, data } : { message }),
    };
    const outcome = rule.evaluate(ctx);
    const modifiers = outcome.modifiers ?? [];
    outcomes.push(outcome);
    traceConstraints.push({
      ruleId: rule.id,
      owner: rule.owner,
      ok: outcome.ok,
      ...(outcome.code ? { code: outcome.code } : {}),
      ...(outcome.message ? { message: outcome.message } : {}),
      modifiers,
    });
    if (ruleRng.drawCount !== before) {
      rngDraws.push({ label: rule.id, draws: ruleRng.drawCount - before });
    }
    if (!outcome.ok) ok = false;
  }

  return {
    ok,
    outcomes,
    trace: {
      commandId: command.id,
      commandType: command.type,
      notes,
      constraints: traceConstraints,
      resolutions: [],
      quantities: [],
      rngDraws,
    },
  };
}

export function runResolutions(
  rules: Registered<ResolutionRule>[],
  command: Command,
  world: WorldView,
  rng: DeterministicRngLike,
  constraints: ConstraintOutcome[],
  trace: DecisionTrace,
): ResolutionPhaseResult {
  const effects: TaggedEffect[] = [];
  const modifiers: Modifier[] = [];
  const quantities: ResolutionTrace[] = [];
  const ordered = orderRules(rules);

  for (const rule of ordered) {
    const ruleRng = rng.fork(rule.id);
    const before = ruleRng.drawCount;
    const ctx: ResolutionContext = {
      command,
      world,
      rng: ruleRng,
      constraints,
      note: (message, data) =>
        trace.notes.push(data ? { message, data } : { message }),
      resolve: (target, base, mods) => {
        const result = applyModifiers(target, base, mods ?? [], world.tick);
        quantities.push(result);
        return result.result;
      },
    };
    const produced = rule.resolve(ctx) ?? [];
    for (const effect of produced) {
      effects.push({ effect, owner: rule.owner, ruleId: rule.id });
      const mods = collectModifiers(effect);
      for (const mod of mods) modifiers.push(mod);
    }
    trace.resolutions.push({ ruleId: rule.id, owner: rule.owner, effectCount: produced.length });
    if (ruleRng.drawCount !== before) {
      trace.rngDraws.push({ label: rule.id, draws: ruleRng.drawCount - before });
    }
  }

  trace.quantities = quantities;
  return { effects, modifiers, trace };
}

export interface ReactionPhaseResult {
  effects: TaggedEffect[];
  ruleIds: string[];
}

export function runReactions(
  rules: Registered<ReactionRule>[],
  event: WorldEvent,
  world: WorldView,
  rng: DeterministicRngLike,
  notes: DecisionTrace["notes"],
): ReactionPhaseResult {
  const effects: TaggedEffect[] = [];
  const ruleIds: string[] = [];
  const ordered = orderRules(rules);
  for (const rule of ordered) {
    const ruleRng = rng.fork(`${rule.id}:${event.seq}`);
    const ctx: ReactionContext = {
      event,
      world,
      rng: ruleRng,
      note: (message, data) => notes.push(data ? { message, data } : { message }),
    };
    const produced = rule.react(ctx) ?? [];
    for (const effect of produced) {
      effects.push({ effect, owner: rule.owner, ruleId: rule.id });
    }
    ruleIds.push(rule.id);
  }
  return { effects, ruleIds };
}

/** Deterministic rule order: priority desc, then id asc. */
export function orderRules<T extends { id: string; priority?: number }>(rules: T[]): T[] {
  return [...rules].sort((a, b) => {
    const priority = (b.priority ?? 0) - (a.priority ?? 0);
    if (priority !== 0) return priority;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function collectModifiers(effect: Effect): Modifier[] {
  if (effect.kind === "setComponent" || effect.kind === "modifyComponent") {
    const list = (effect as { modifiers?: Modifier[] }).modifiers;
    return Array.isArray(list) ? list : [];
  }
  return [];
}

export function ruleSetFor(
  definitions: DefinitionSet,
  commandType: string,
  kind: "constraint" | "resolution",
): Registered<ConstraintRule>[] | Registered<ResolutionRule>[] {
  const registry = kind === "constraint" ? definitions.constraints : definitions.resolutions;
  return registry.active().filter((rule) => (rule as { commandType?: string }).commandType === commandType) as
    | Registered<ConstraintRule>[]
    | Registered<ResolutionRule>[];
}

export function reactionSetFor(
  definitions: DefinitionSet,
  eventType: string,
): Registered<ReactionRule>[] {
  return definitions.reactions
    .active()
    .filter((rule) => rule.eventType === eventType || rule.eventType === "*");
}
