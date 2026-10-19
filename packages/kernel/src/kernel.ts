/**
 * Kernel - the simulation entry point (§12).
 *
 * The kernel knows only: Command, Validation Boundary, Transaction, Clock,
 * Deterministic RNG and State Mutation. It has no idea what a school, a
 * marriage or a mana pool is; those live in modules.
 *
 * Command pipeline (§14):
 *   Command -> Constraint -> Resolution -> Effects -> Transaction -> Events -> Reactions
 */

import type {
  AgentHost,
  Command,
  CommandIntent,
  CommandResult,
  DeterministicRngLike,
  ScheduledTaskView,
  WorldView,
  WorldEvent,
} from "@openlife/contracts";
import { ErrorCode, OpenLifeErrorException, isOpenLifeError } from "@openlife/contracts";
import type { DefinitionSet, DecisionTrace } from "@openlife/rule-engine";
import {
  runConstraints,
  runResolutions,
  ruleSetFor,
} from "@openlife/rule-engine";
import { StoreBackedWorldView, WorldStore, type SerializedWorld } from "@openlife/world-model";
import { DeterministicRng } from "./rng.ts";
import { EventLog, type EventLogState } from "./event-log.ts";
import { FactStore } from "./facts.ts";
import { Scheduler, type SchedulerState } from "./scheduler.ts";
import {
  TransactionEngine,
  type TransactionConfig,
  type TransactionDeps,
} from "./transaction.ts";
import type { KernelInternals, KernelOptions } from "./types.ts";

const MAX_TASK_STEPS_PER_ADVANCE = 100_000;
const DEFAULT_AGENT_CATCH_UP_LIMIT = 31;

/** What an agent returned for the last tick it ran (runtime only, never saved). */
export interface AgentReport {
  agentId: string;
  owner: string;
  tick: number;
  report?: unknown;
  error?: string;
}

export interface KernelState {
  worldId: string;
  timelineId: string;
  worldSeed: number;
  clock: { tick: number; advances: number };
  commandSeq: number;
  txnSeq: number;
  store: SerializedWorld;
  rng: { seed: number; draws: number };
  eventLog: EventLogState;
  scheduler: SchedulerState;
  facts: ReturnType<FactStore["serialize"]>;
}

export class Kernel {
  readonly worldId: string;
  readonly timelineId: string;
  readonly worldSeed: number;

  #store: WorldStore;
  #clock = { tick: 0, advances: 0 };
  #rng: DeterministicRng;
  #eventLog = new EventLog();
  #scheduler = new Scheduler();
  #facts = new FactStore();
  #commandSeq = 0;
  #txnSeq = 0;
  #config: Partial<TransactionConfig>;
  #definitions: DefinitionSet;
  #transaction: TransactionEngine;
  /** Traces for the last N commands, for the debug console. */
  #traces: DecisionTrace[] = [];
  #traceLimit = 50;
  #agentCatchUpLimit: number;
  #agentReports = new Map<string, AgentReport>();

  constructor(options: KernelOptions) {
    this.worldId = options.worldId ?? "world:local";
    this.timelineId = options.timelineId ?? "timeline:main";
    this.worldSeed = options.worldSeed >>> 0;
    this.#store = new WorldStore();
    this.#rng = new DeterministicRng(this.worldSeed, "root");
    this.#definitions = options.definitions ?? new DefinitionSet();
    this.#config = {
      ...(options.maxDepth !== undefined ? { maxDepth: options.maxDepth } : {}),
      ...(options.maxEventsPerTransaction !== undefined
        ? { maxEventsPerTransaction: options.maxEventsPerTransaction }
        : {}),
    };
    this.#agentCatchUpLimit = options.agentCatchUpLimit ?? DEFAULT_AGENT_CATCH_UP_LIMIT;
    this.#transaction = this.#buildTransaction();
  }

  get tick(): number {
    return this.#clock.tick;
  }

  get definitions(): DefinitionSet {
    return this.#definitions;
  }

  get internals(): KernelInternals {
    const kernel = this;
    const store = () => kernel.#store;
    const log = () => kernel.#eventLog;
    const scheduler = () => kernel.#scheduler;
    const facts = () => kernel.#facts;
    return Object.freeze({
      store: Object.freeze({
        get entityCount() { return store().entityCount; },
        get relationCount() { return store().relationCount; },
        getEntity: (...a: Parameters<WorldStore["getEntity"]>) => structuredClone(store().getEntity(...a)),
        hasEntity: (...a: Parameters<WorldStore["hasEntity"]>) => store().hasEntity(...a),
        listEntities: (...a: Parameters<WorldStore["listEntities"]>) => structuredClone(store().listEntities(...a)),
        countEntities: (...a: Parameters<WorldStore["countEntities"]>) => store().countEntities(...a),
        getComponent: (...a: Parameters<WorldStore["getComponent"]>) => structuredClone(store().getComponent(...a)),
        getRelation: (...a: Parameters<WorldStore["getRelation"]>) => structuredClone(store().getRelation(...a)),
        serialize: () => store().serialize(),
        fingerprint: () => store().fingerprint(),
      }),
      get clock() { return Object.freeze({ ...kernel.#clock }); },
      rng: Object.freeze({ snapshot: () => kernel.#rng.snapshot() }),
      scheduler: Object.freeze({
        get size() { return scheduler().size; },
        list: () => structuredClone(scheduler().list()),
        nextDueTick: () => scheduler().nextDueTick(),
        serialize: () => scheduler().serialize(),
      }),
      eventLog: Object.freeze({
        get length() { return log().length; },
        get nextSeq() { return log().nextSeq; },
        all: () => Object.freeze(structuredClone([...log().all()])),
        since: (...a: Parameters<EventLog["since"]>) => structuredClone(log().since(...a)),
        list: (...a: Parameters<EventLog["list"]>) => structuredClone(log().list(...a)),
        get: (...a: Parameters<EventLog["get"]>) => structuredClone(log().get(...a)),
        serialize: () => log().serialize(),
      }),
      facts: Object.freeze({
        get size() { return facts().size; },
        all: () => structuredClone(facts().all()),
        list: (...a: Parameters<FactStore["list"]>) => structuredClone(facts().list(...a)),
        serialize: () => facts().serialize(),
      }),
      definitions: this.#definitions,
    }) as KernelInternals;
  }

  /** Read-only world view. Rules, modules and projections only ever see this. */
  worldView(): WorldView {
    return new StoreBackedWorldView(this.#store, () => this.#clock.tick);
  }

  /** Deterministic RNG accessor for the debug console; modules must not use it. */
  get rootRng(): DeterministicRngLike {
    return this.#rng;
  }

  recentTraces(): readonly DecisionTrace[] {
    return this.#traces;
  }

  /**
   * Converts an external intent into a stamped Command and runs the pipeline.
   * Every external input (player, UI, AI, AutoSim, network, module) uses this.
   */
  dispatch(intent: CommandIntent): CommandResult {
    const command = this.#stamp(intent);
    return this.execute(command);
  }

  /**
   * Runs an already-stamped command. Exposed for replay and for the debug
   * console, which wants to show the exact command that was executed.
   */
  execute(command: Command): CommandResult {
    const definition = this.#definitions.commands.get(command.type);
    if (!definition || !definition.enabled) {
      return this.#reject(command, ErrorCode.UnknownCommand, `unknown command type: ${command.type}`);
    }

    const view = this.worldView();
    const trace: DecisionTrace = {
      commandId: command.id,
      commandType: command.type,
      notes: [],
      constraints: [],
      resolutions: [],
      quantities: [],
      rngDraws: [],
    };

    try {
      const constraintRules = ruleSetFor(
        this.#definitions,
        command.type,
        "constraint",
      ) as import("@openlife/rule-engine").Registered<import("@openlife/contracts").ConstraintRule>[];
      const constraintPhase = runConstraints(
        constraintRules,
        command,
        view,
        this.#rng.fork(`command:${command.type}:${command.id}`),
      );
      trace.constraints = constraintPhase.trace.constraints;
      trace.notes.push(...constraintPhase.trace.notes);
      trace.rngDraws.push(...constraintPhase.trace.rngDraws);

      if (!constraintPhase.ok) {
        const failed = constraintPhase.outcomes.find((outcome) => !outcome.ok);
        this.#recordTrace(trace);
        return {
          ok: false,
          commandId: command.id,
          errors: [
            {
              code: failed?.code ?? ErrorCode.ConstraintRejected,
              message: failed?.message ?? `command rejected: ${command.type}`,
              ...(failed?.details ? { details: failed.details } : {}),
            },
          ],
          eventIds: [],
          rejected: true,
        };
      }

      const resolutionRules = ruleSetFor(
        this.#definitions,
        command.type,
        "resolution",
      ) as import("@openlife/rule-engine").Registered<import("@openlife/contracts").ResolutionRule>[];
      const resolutionPhase = runResolutions(
        resolutionRules,
        command,
        view,
        this.#rng.fork(`command:${command.type}:${command.id}`),
        constraintPhase.outcomes,
        trace,
      );

      this.#txnSeq += 1;
      const transactionId = `txn:${this.#txnSeq}`;
      const events = this.#transaction.applyEffects(resolutionPhase.effects, {
        tick: this.#clock.tick,
        commandId: command.id,
        transactionId,
        ...(command.actorId !== undefined ? { actorId: command.actorId } : {}),
        trace,
      });
      this.#recordTrace(trace);

      return {
        ok: true,
        commandId: command.id,
        errors: [],
        eventIds: events.map((event) => event.id),
        transactionId,
        rejected: false,
      };
    } catch (error) {
      this.#recordTrace(trace);
      if (isOpenLifeError(error)) {
        return {
          ok: false,
          commandId: command.id,
          errors: [error.toError() as { code: string; message: string }],
          eventIds: [],
          rejected: true,
        };
      }
      throw error;
    }
  }

  /** Advances the simulation clock, draining due tasks in tick order (§17). */
  advanceTo(targetTick: number): void {
    if (!Number.isFinite(targetTick)) {
      throw new OpenLifeErrorException(ErrorCode.ValidationFailed, "advance target must be finite");
    }
    if (targetTick < this.#clock.tick) {
      throw new OpenLifeErrorException(
        ErrorCode.ValidationFailed,
        `cannot advance backwards: ${this.#clock.tick} -> ${targetTick}`,
      );
    }
    const budget = { steps: 0 };
    const span = targetTick - this.#clock.tick;
    const livesThrough = Number.isInteger(targetTick) && span > 0 &&
      span <= this.#agentCatchUpLimit && this.#definitions.agents.active().length > 0;
    if (livesThrough) {
      // Day by day: every stepped tick runs its due tasks, then every agent.
      while (this.#clock.tick < targetTick) {
        const fromTick = this.#clock.tick;
        this.#runDueThrough(fromTick + 1, budget);
        this.#clock.tick = fromTick + 1;
        this.#runAgents(fromTick);
      }
    } else {
      this.#runDueThrough(targetTick, budget);
      this.#clock.tick = targetTick;
    }
    this.#clock.advances += 1;
  }

  /** Last report of each agent, for the debug console, Web and tests. */
  agentReport(agentId: string): AgentReport | undefined {
    return this.#agentReports.get(agentId);
  }

  #runDueThrough(targetTick: number, budget: { steps: number }): void {
    for (;;) {
      const next = this.#scheduler.nextDueTick();
      if (next === undefined || next > targetTick) break;
      this.#clock.tick = Math.max(this.#clock.tick, next);
      const due = this.#scheduler.peekDue(this.#clock.tick);
      for (const task of due) {
        budget.steps += 1;
        if (budget.steps > MAX_TASK_STEPS_PER_ADVANCE) {
          throw new OpenLifeErrorException(
            ErrorCode.EventStorm,
            `scheduler did not settle after ${MAX_TASK_STEPS_PER_ADVANCE} task runs`,
          );
        }
        this.#runTask(task.id, task.type, task.payload, task.owner);
        this.#scheduler.complete(task.id, this.#clock.tick);
      }
    }
  }

  #runAgents(fromTick: number): void {
    const kernel = this;
    const host: AgentHost = {
      get tick() { return kernel.tick; },
      worldView: () => kernel.worldView(),
      dispatch: (intent) => kernel.dispatch({ ...intent, source: "ai" }),
    };
    const agents = this.#definitions.agents.active()
      .sort((a, b) => a.id.localeCompare(b.id));
    for (const agent of agents) {
      const tick = this.#clock.tick;
      try {
        const report = agent.run(host, { fromTick, tick });
        this.#agentReports.set(agent.id, {
          agentId: agent.id, owner: agent.owner, tick,
          ...(report !== undefined ? { report } : {}),
        });
      } catch (error) {
        // One faulty agent never stalls the clock or the other agents; the
        // fault is visible to the debug console instead of being swallowed.
        this.#agentReports.set(agent.id, {
          agentId: agent.id, owner: agent.owner, tick,
          error: (error as Error)?.message ?? String(error),
        });
      }
    }
  }

  advanceBy(ticks: number): void {
    if (!Number.isInteger(ticks) || ticks < 0) {
      throw new OpenLifeErrorException(
        ErrorCode.ValidationFailed,
        `advanceBy requires a non-negative integer, received ${ticks}`,
      );
    }
    this.advanceTo(this.#clock.tick + ticks);
  }

  scheduledTasks(): ScheduledTaskView[] {
    return this.#scheduler.list().map((task) => ({
      id: task.id,
      type: task.type,
      dueAt: task.dueAt,
      owner: task.owner,
      runs: task.runs,
      payload: task.payload,
    }));
  }

  /** Drops scheduled tasks belonging to a module (used on unload). */
  cancelScheduledOwner(owner: string): number {
    return this.#scheduler.cancelOwner(owner);
  }

  serialize(): KernelState {
    return {
      worldId: this.worldId,
      timelineId: this.timelineId,
      worldSeed: this.worldSeed,
      clock: { ...this.#clock },
      commandSeq: this.#commandSeq,
      txnSeq: this.#txnSeq,
      store: this.#store.serialize(),
      rng: this.#rng.snapshot(),
      eventLog: this.#eventLog.serialize(),
      scheduler: this.#scheduler.serialize(),
      facts: this.#facts.serialize(),
    };
  }

  static deserialize(state: KernelState, definitions: DefinitionSet): Kernel {
    const kernel = new Kernel({
      worldSeed: state.worldSeed,
      worldId: state.worldId,
      timelineId: state.timelineId,
      definitions,
    });
    kernel.restore(state);
    return kernel;
  }

  /**
   * Replaces all simulation state in place. Used by the save system so that
   * a Simulation can be restored without rebuilding its collaborators.
   */
  restore(state: KernelState): void {
    this.#store = WorldStore.deserialize(state.store);
    this.#clock = { ...state.clock };
    this.#rng = new DeterministicRng(state.rng.seed, "root", state.rng.draws);
    this.#eventLog = EventLog.deserialize(state.eventLog);
    this.#scheduler = Scheduler.deserialize(state.scheduler);
    this.#facts = FactStore.deserialize(state.facts);
    this.#commandSeq = state.commandSeq;
    this.#txnSeq = state.txnSeq;
    this.#transaction = this.#buildTransaction();
    this.#traces = [];
  }

  /** Structural fingerprint, used to verify Save -> Load round trips. */
  fingerprint(): string {
    return JSON.stringify(this.serialize());
  }

  /**
   * Drops journal events `keep` rejects (see Simulation's journal retention).
   * Only between commands: never while a transaction is open.
   */
  compactJournal(keeper: (events: readonly WorldEvent[]) => (event: WorldEvent) => boolean): number {
    return this.#eventLog.compact(keeper(this.#eventLog.all()));
  }

  #buildTransaction(): TransactionEngine {
    const deps: TransactionDeps = {
      store: this.#store,
      eventLog: this.#eventLog,
      scheduler: this.#scheduler,
      facts: this.#facts,
      definitions: this.#definitions,
      rng: this.#rng,
      config: this.#config,
    };
    return new TransactionEngine(deps);
  }

  #stamp(intent: CommandIntent): Command {
    this.#commandSeq += 1;
    return {
      id: `cmd:${this.#commandSeq}`,
      type: intent.type,
      ...(intent.actorId !== undefined ? { actorId: intent.actorId } : {}),
      ...(intent.targetId !== undefined ? { targetId: intent.targetId } : {}),
      payload: intent.payload ?? {},
      source: intent.source ?? "player",
      issuedAt: this.#clock.tick,
    };
  }

  #runTask(taskId: string, taskType: string, payload: Record<string, unknown>, owner?: string): void {
    const definition = this.#definitions.tasks.get(taskType);
    if (!definition || !definition.enabled) {
      // Orphaned task: its module is unloaded. Skip without touching state (§62).
      return;
    }
    const view = this.worldView();
    const rng = this.#rng.fork(`task:${taskType}:${taskId}`);
    const notes: DecisionTrace["notes"] = [];
    const outcome = definition.handler({
      taskType,
      payload,
      at: this.#clock.tick,
      world: view,
      rng,
      note: (message, data) => notes.push(data ? { message, data } : { message }),
    });
    if (!outcome) return;
    if (outcome.commands && outcome.commands.length > 0) {
      for (const next of outcome.commands) {
        const result = this.dispatch({
          type: next.type,
          ...(next.actorId !== undefined ? { actorId: next.actorId } : {}),
          ...(next.targetId !== undefined ? { targetId: next.targetId } : {}),
          payload: (next.payload ?? {}) as unknown as Command["payload"],
          source: next.source ?? "system",
        });
        if (!result.ok) break;
      }
      return;
    }
    if (outcome.command) {
      this.dispatch({
        type: outcome.command.type,
        ...(outcome.command.actorId !== undefined ? { actorId: outcome.command.actorId } : {}),
        ...(outcome.command.targetId !== undefined ? { targetId: outcome.command.targetId } : {}),
        payload: (outcome.command.payload ?? {}) as unknown as Command["payload"],
        source: outcome.command.source ?? "system",
      });
      // A repeating task may both run a command and ask to be due again. The
      // reschedule must not be skipped just because a command was emitted, or
      // a re-arming task fires exactly once (M1.2-B).
      if (outcome.rescheduleAt !== undefined) {
        this.#scheduler.schedule({
          type: taskType,
          dueAt: outcome.rescheduleAt,
          payload: payload as unknown as Command["payload"],
          ...(owner ? { owner } : {}),
        });
      }
      return;
    }
    if (outcome.rescheduleAt !== undefined) {
      this.#scheduler.schedule({
        type: taskType,
        dueAt: outcome.rescheduleAt,
        payload: payload as unknown as Command["payload"],
        ...(owner ? { owner } : {}),
      });
    }
  }

  #reject(command: Command, code: string, message: string): CommandResult {
    return {
      ok: false,
      commandId: command.id,
      errors: [{ code, message }],
      eventIds: [],
      rejected: true,
    };
  }

  #recordTrace(trace: DecisionTrace): void {
    this.#traces.push(trace);
    if (this.#traces.length > this.#traceLimit) this.#traces.shift();
  }
}

export function createKernel(options: KernelOptions & { definitions?: DefinitionSet }): Kernel {
  return new Kernel(options);
}
