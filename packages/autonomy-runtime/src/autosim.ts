/**
 * AutoSim (§41).
 *
 * AutoSim is not "speed up the clock". It repeatedly asks a DecisionProvider
 * for commands and runs them, optionally advancing time, until a stopping
 * condition is met (reached a year, graduated, got a job, died, ...).
 *
 * The kernel remains the only thing that mutates state.
 */

import type { CommandIntent, CommandResult, JsonValue } from "@openlife/contracts";
import type { Kernel } from "@openlife/kernel";
import type { DecisionContext, DecisionProvider, AutonomyPolicy } from "./provider.ts";
import { policyLevel } from "./provider.ts";

export interface AutoSimStopCondition {
  id: string;
  /** Returns true when simulation should stop. */
  isSatisfied(ctx: AutoSimContext): boolean;
  description?: string;
}

export interface AutoSimContext {
  kernel: Kernel;
  tick: number;
  steps: number;
  commandsIssued: number;
  actorId: string;
  /** Commands awaiting player authorisation (§42). */
  pendingApproval: { command: CommandIntent; reason?: string }[];
  stop: (reason: string) => void;
  stopped: boolean;
  stopReason?: string;
}

export interface AutoSimOptions {
  kernel: Kernel;
  actorId: string;
  provider: DecisionProvider;
  policy?: AutonomyPolicy;
  /** Builds the projection the provider sees. */
  projection: (ctx: { actorId: string; tick: number }) => Record<string, JsonValue>;
  stopConditions?: AutoSimStopCondition[];
  /** Hard cap on commands, to make runaway simulations impossible. */
  maxCommands?: number;
  /** Ticks to advance after each batch of commands. */
  advanceTicksPerStep?: number;
}

export interface AutoSimResult {
  ok: boolean;
  steps: number;
  commandsIssued: number;
  commandsRejected: number;
  pendingApproval: { command: CommandIntent; reason?: string }[];
  stopped: boolean;
  stopReason?: string;
  results: CommandResult[];
}

export function runAutoSim(options: AutoSimOptions): AutoSimResult {
  const ctx: AutoSimContext = {
    kernel: options.kernel,
    tick: options.kernel.tick,
    steps: 0,
    commandsIssued: 0,
    actorId: options.actorId,
    pendingApproval: [],
    stopped: false,
    stop: (reason: string) => {
      ctx.stopped = true;
      ctx.stopReason = reason;
    },
  };
  const results: CommandResult[] = [];
  const maxCommands = options.maxCommands ?? 1_000;
  let rejected = 0;

  for (;;) {
    if (ctx.stopped) break;
    if (ctx.commandsIssued >= maxCommands) {
      ctx.stopped = true;
      ctx.stopReason = `maxCommands (${maxCommands}) reached`;
      break;
    }
    for (const condition of options.stopConditions ?? []) {
      if (condition.isSatisfied(ctx)) {
        ctx.stopped = true;
        ctx.stopReason = condition.description ?? condition.id;
      }
    }
    if (ctx.stopped) break;

    const decisionContext: DecisionContext = {
      actorId: options.actorId,
      view: options.projection({ actorId: options.actorId, tick: options.kernel.tick }),
      tick: options.kernel.tick,
      policy: options.policy ?? { rules: {}, default: "auto" },
    };
    const options_ = options.provider.decide(decisionContext);
    if (options_.length === 0) {
      // Nothing to do: advance time so the world can progress.
      const advance = options.advanceTicksPerStep ?? 1;
      options.kernel.advanceBy(advance);
      ctx.tick = options.kernel.tick;
      ctx.steps += 1;
      continue;
    }

    for (const option of options_) {
      const category = (option.command.payload?.autonomyCategory as string | undefined) ?? "general";
      const level = policyLevel(decisionContext.policy, category);
      if (level === "never") {
        decisionContext.policy; // no-op; policy already consulted
        continue;
      }
      if (level === "ask") {
        ctx.pendingApproval.push({
          command: option.command,
          ...(option.reason ? { reason: option.reason } : {}),
        });
        continue;
      }
      ctx.commandsIssued += 1;
      const result = options.kernel.dispatch(option.command);
      results.push(result);
      if (!result.ok) rejected += 1;
    }

    const advance = options.advanceTicksPerStep ?? 1;
    options.kernel.advanceBy(advance);
    ctx.tick = options.kernel.tick;
    ctx.steps += 1;
  }

  return {
    ok: rejected === 0 || results.some((result) => result.ok),
    steps: ctx.steps,
    commandsIssued: ctx.commandsIssued,
    commandsRejected: rejected,
    pendingApproval: ctx.pendingApproval,
    stopped: ctx.stopped,
    ...(ctx.stopReason ? { stopReason: ctx.stopReason } : {}),
    results,
  };
}

/** Convenience stop condition: stop once the clock reaches `tick`. */
export function untilTick(tick: number): AutoSimStopCondition {
  return {
    id: `until_tick_${tick}`,
    description: `reached tick ${tick}`,
    isSatisfied: (ctx) => ctx.kernel.tick >= tick,
  };
}

/** Convenience stop condition: stop when the actor entity is archived. */
export function untilActorArchived(actorId: string): AutoSimStopCondition {
  return {
    id: `until_actor_archived_${actorId}`,
    description: `actor ${actorId} is gone`,
    isSatisfied: (ctx) => {
      const entity = ctx.kernel.worldView().getEntity(actorId);
      return entity === undefined || entity.archivedAt !== undefined;
    },
  };
}

/**
 * A simple provider that replays a fixed command list. Useful for tests,
 * determinism checks and scripted demos.
 */
export function scriptedProvider(id: string, commands: CommandIntent[]): DecisionProvider {
  let index = 0;
  return {
    id,
    decide: () => {
      if (index >= commands.length) return [];
      const command = commands[index] as CommandIntent;
      index += 1;
      return [{ command }];
    },
  };
}

/**
 * A rule-based provider: evaluates weighted candidate actions and picks the
 * highest scoring one, using the kernel RNG for tie-breaking only.
 */
export function weightedProvider(
  id: string,
  candidates: (ctx: DecisionContext) => { command: CommandIntent; score: number; reason?: string }[],
): DecisionProvider {
  return {
    id,
    decide: (ctx) => {
      const scored = candidates(ctx);
      if (scored.length === 0) return [];
      let best = scored[0] as { command: CommandIntent; score: number; reason?: string };
      for (const candidate of scored) {
        if (candidate.score > best.score) best = candidate;
      }
      return [
        {
          command: best.command,
          ...(best.reason ? { reason: best.reason } : {}),
          weight: best.score,
        },
      ];
    },
  };
}
