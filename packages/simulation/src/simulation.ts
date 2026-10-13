/**
 * Simulation - composition root.
 *
 * Wires the kernel, module runtime, history, projections and save system into
 * one object. This is the only place that knows about all of them; each
 * package stays independent of the others' internals.
 *
 * The facade deliberately exposes no way to mutate world state directly. The
 * only write paths are `dispatch` (Command) and `advanceTo` (Clock).
 */

import type {
  CommandIntent,
  CommandResult,
  LoadOptions,
  LoadResult,
  ModuleId,
  OpenLifeModule,
  ProjectionRequest,
  ProjectionResult,
  SavePackage,
  WorldView,
} from "@openlife/contracts";
import { ENGINE_VERSION, ErrorCode, fail } from "@openlife/contracts";
import { DefinitionSet } from "@openlife/rule-engine";
import { Kernel, type KernelState } from "@openlife/kernel";
import { ModuleRuntime, type InstalledModuleInfo } from "@openlife/module-runtime";
import { HistoryRuntime, type HistoryState } from "@openlife/history-runtime";
import { ProjectionRuntime } from "@openlife/query";
import { buildSavePackage, checkLoadCompatibility, fromJson, toJson } from "@openlife/save-system";

export interface SimulationOptions {
  worldSeed: number;
  worldId?: string;
  timelineId?: string;
  engineVersion?: string;
  /** Modules installed at construction time, in order. */
  modules?: OpenLifeModule[];
  /** Minimum event significance that becomes a historical record. */
  historyThreshold?: number;
  maxDepth?: number;
  maxEventsPerTransaction?: number;
  /** See KernelOptions.agentCatchUpLimit. */
  agentCatchUpLimit?: number;
}

export interface SimulationSaveInput {
  label?: string;
}

interface SaveSnapshotShape {
  world: {
    store: KernelState["store"];
    facts: KernelState["facts"];
    commandSeq: number;
    txnSeq: number;
  };
  clock: KernelState["clock"];
  rng: KernelState["rng"];
  scheduler: KernelState["scheduler"];
}

export class Simulation {
  readonly definitions: DefinitionSet;
  readonly modules: ModuleRuntime;
  readonly kernel: Kernel;
  #history: HistoryRuntime;
  #projections: ProjectionRuntime;
  readonly #engineVersion: string;
  readonly #historyThreshold: number;

  constructor(options: SimulationOptions) {
    this.#engineVersion = options.engineVersion ?? ENGINE_VERSION;
    this.#historyThreshold = options.historyThreshold ?? 0.25;
    this.definitions = new DefinitionSet();
    this.kernel = new Kernel({
      worldSeed: options.worldSeed,
      ...(options.worldId !== undefined ? { worldId: options.worldId } : {}),
      ...(options.timelineId !== undefined ? { timelineId: options.timelineId } : {}),
      definitions: this.definitions,
      ...(options.maxDepth !== undefined ? { maxDepth: options.maxDepth } : {}),
      ...(options.maxEventsPerTransaction !== undefined
        ? { maxEventsPerTransaction: options.maxEventsPerTransaction }
        : {}),
      ...(options.agentCatchUpLimit !== undefined
        ? { agentCatchUpLimit: options.agentCatchUpLimit }
        : {}),
    });
    this.modules = new ModuleRuntime({
      definitions: this.definitions,
      engineVersion: this.#engineVersion,
      worldSeed: options.worldSeed,
      kernel: this.kernel,
    });
    this.#history = new HistoryRuntime({
      eventLog: this.kernel.internals.eventLog,
      store: this.kernel.internals.store,
      significanceThreshold: this.#historyThreshold,
    });
    this.#projections = this.#buildProjections();
    for (const module of options.modules ?? []) this.install(module);
  }

  get tick(): number {
    return this.kernel.tick;
  }

  get worldSeed(): number {
    return this.kernel.worldSeed;
  }

  get engineVersion(): string {
    return this.#engineVersion;
  }

  get history(): HistoryRuntime {
    return this.#history;
  }

  get projections(): ProjectionRuntime {
    return this.#projections;
  }

  install(module: OpenLifeModule): InstalledModuleInfo {
    return this.modules.install(module);
  }

  unload(moduleId: ModuleId): InstalledModuleInfo {
    return this.modules.unload(moduleId);
  }

  activate(moduleId: ModuleId): InstalledModuleInfo {
    return this.modules.activate(moduleId);
  }

  worldView(): WorldView {
    return this.kernel.worldView();
  }

  /**
   * Runs one command and folds the resulting events into history.
   *
   * History is always kept consistent with the event journal after a command,
   * so callers never have to remember to sync before reading history or saving.
   */
  dispatch(intent: CommandIntent): CommandResult {
    const result = this.kernel.dispatch(intent);
    this.syncHistory();
    return result;
  }

  /** Runs a batch of commands and folds resulting events into history. */
  dispatchAll(intents: CommandIntent[]): CommandResult[] {
    const results = intents.map((intent) => this.kernel.dispatch(intent));
    this.syncHistory();
    return results;
  }

  advanceTo(tick: number): void {
    this.kernel.advanceTo(tick);
    this.syncHistory();
  }

  advanceBy(ticks: number): void {
    this.kernel.advanceBy(ticks);
    this.syncHistory();
  }

  /** What a module agent reported for the last tick it lived through. */
  agentReport(agentId: string) {
    return this.kernel.agentReport(agentId);
  }

  /** Folds new events into history and reconciles archived subjects. */
  syncHistory(): void {
    this.#history.sync();
    this.#history.reconcileArchivedSubjects();
  }

  project(request: ProjectionRequest): ProjectionResult {
    return this.#projections.project(request);
  }

  save(input: SimulationSaveInput = {}): SavePackage {
    // Guarantee the saved history reflects the saved event journal, otherwise a
    // load would treat unfolded events as already folded.
    this.syncHistory();
    const kernelState = this.kernel.serialize();
    const historyState = this.#history.serialize();
    return buildSavePackage({
      worldId: this.kernel.worldId,
      timelineId: this.kernel.timelineId,
      worldSeed: this.kernel.worldSeed,
      savedAtTick: this.kernel.tick,
      snapshot: {
        world: {
          store: kernelState.store,
          facts: kernelState.facts,
          commandSeq: kernelState.commandSeq,
          txnSeq: kernelState.txnSeq,
        },
        clock: kernelState.clock,
        rng: kernelState.rng,
        scheduler: kernelState.scheduler,
      } satisfies SaveSnapshotShape,
      moduleState: this.modules.serializeState(),
      eventJournal: kernelState.eventLog.events,
      history: historyState.records,
      modules: this.modules.savedVersions(),
      metadata: {
        ...(input.label ? { label: input.label } : {}),
        engineVersion: this.#engineVersion,
        historyThreshold: this.#historyThreshold,
        historyState,
      },
    });
  }

  saveToJson(input: SimulationSaveInput = {}): string {
    return toJson(this.save(input));
  }

  /**
   * Loads a save into a fresh Simulation with the given modules installed.
   * Module state is restored and migrated before any command can run.
   */
  static load(
    pkg: SavePackage,
    modules: OpenLifeModule[],
    options: LoadOptions = {},
  ): { simulation: Simulation | undefined; result: LoadResult } {
    const compatibility = checkLoadCompatibility(pkg, options);
    if (!compatibility.ok) {
      return {
        simulation: undefined,
        result: {
          ok: false,
          errors: compatibility.errors,
          warnings: compatibility.warnings,
          migrationsApplied: [],
        },
      };
    }

    const snapshot = pkg.snapshot as unknown as SaveSnapshotShape;
    const historyThreshold =
      (pkg.metadata.historyThreshold as number | undefined) ?? 0.25;

    const simulation = new Simulation({
      worldSeed: pkg.manifest.worldSeed,
      worldId: pkg.manifest.worldId,
      timelineId: pkg.manifest.timelineId,
      engineVersion: options.allowVersionMismatch
        ? ENGINE_VERSION
        : pkg.manifest.engineVersion,
      historyThreshold,
    });
    for (const module of modules) simulation.install(module);

    // Restore the persisted old-version state first, then migrate that state.
    // Migrating the fresh default state would discard the migration result when
    // restoreState runs afterwards.
    simulation.modules.restoreState(pkg.moduleState);
    const migrationsApplied = simulation.modules.migrateFrom(pkg.manifest.modules);

    const kernelState: KernelState = {
      worldId: pkg.manifest.worldId,
      timelineId: pkg.manifest.timelineId,
      worldSeed: pkg.manifest.worldSeed,
      clock: snapshot.clock,
      commandSeq: snapshot.world.commandSeq,
      txnSeq: snapshot.world.txnSeq,
      store: snapshot.world.store,
      rng: snapshot.rng,
      eventLog: {
        events: pkg.eventJournal,
        seq: pkg.eventJournal.reduce((max, event) => Math.max(max, event.seq), 0),
      },
      scheduler: snapshot.scheduler,
      facts: snapshot.world.facts,
    };
    simulation.kernel.restore(kernelState);

    const historyState = pkg.metadata.historyState as HistoryState | undefined;
    simulation.#history = historyState
      ? HistoryRuntime.deserialize(historyState, {
          eventLog: simulation.kernel.internals.eventLog,
          store: simulation.kernel.internals.store,
          significanceThreshold: historyThreshold,
        })
      : new HistoryRuntime({
          eventLog: simulation.kernel.internals.eventLog,
          store: simulation.kernel.internals.store,
          significanceThreshold: historyThreshold,
        });
    simulation.#projections = simulation.#buildProjections();
    simulation.syncHistory();

    return {
      simulation,
      result: {
        ok: true,
        errors: [],
        warnings: compatibility.warnings,
        migrationsApplied,
      },
    };
  }

  static loadFromJson(
    json: string,
    modules: OpenLifeModule[],
    options: LoadOptions = {},
  ): { simulation: Simulation | undefined; result: LoadResult } {
    return Simulation.load(fromJson(json), modules, options);
  }

  /** Structural fingerprint of the whole simulation, for round-trip checks. */
  fingerprint(): string {
    return JSON.stringify({
      kernel: this.kernel.serialize(),
      history: this.#history.serialize(),
    });
  }

  #buildProjections(): ProjectionRuntime {
    return new ProjectionRuntime({
      definitions: this.definitions,
      history: this.#history,
      worldView: () => this.kernel.worldView(),
      rng: () => this.kernel.rootRng,
    });
  }
}

export function createSimulation(options: SimulationOptions): Simulation {
  return new Simulation(options);
}

export function requireSimulation(result: {
  simulation: Simulation | undefined;
  result: LoadResult;
}): Simulation {
  if (!result.result.ok || !result.simulation) {
    fail(
      ErrorCode.SaveIncompatible,
      result.result.errors[0]?.message ?? "failed to load save",
    );
  }
  return result.simulation;
}
