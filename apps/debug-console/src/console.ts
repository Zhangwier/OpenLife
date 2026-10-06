/**
 * Debug console - the simulation debugger required by §86.
 *
 * It exposes exactly what the spec demands: world state, entities, relations,
 * events, command trace, decision trace, causal graph, module ownership, RNG
 * state, scheduled tasks and save/load.
 */

import type {
  CausalExplanation,
  CommandIntent,
  JsonValue,
  OpenLifeModule,
  ProjectionResult,
} from "@openlife/contracts";
import { Simulation } from "@openlife/simulation";
import type { InstalledModuleInfo } from "@openlife/module-runtime";
import { formatEntities, formatEvent, formatRelations, formatTrace, section } from "./format.ts";
import { parseLine, toCommandIntent } from "./args.ts";

export interface ConsoleOptions {
  seed: number;
  modules: OpenLifeModule[];
  out?: (line: string) => void;
}

/** A recorded operation, so the console can replay a session for determinism. */
type JournalEntry =
  | { kind: "dispatch"; intent: CommandIntent }
  | { kind: "advance"; ticks: number };

export class DebugConsole {
  simulation: Simulation;
  #modules: OpenLifeModule[];
  #out: (line: string) => void;
  #journal: JournalEntry[] = [];
  #savedJson: string | undefined;

  constructor(options: ConsoleOptions) {
    this.#modules = options.modules;
    this.#out = options.out ?? ((line) => process.stdout.write(`${line}\n`));
    this.simulation = new Simulation({ worldSeed: options.seed, modules: options.modules });
  }

  print(line = ""): void {
    this.#out(line);
  }

  run(line: string): void {
    const parsed = parseLine(line);
    if (!parsed) return;
    const builtin = this.#builtins[parsed.verb];
    if (builtin) {
      builtin(parsed.positional, parsed.options);
      return;
    }
    this.dispatch(toCommandIntent(parsed));
  }

  dispatch(intent: CommandIntent): void {
    this.#journal.push({ kind: "dispatch", intent });
    const result = this.simulation.dispatch(intent);
    this.simulation.syncHistory();
    const trace = this.simulation.kernel.recentTraces().at(-1);
    if (result.ok) {
      this.print(
        `ok  ${intent.type} -> txn ${result.transactionId}, ${result.eventIds.length} event(s)`,
      );
    } else {
      this.print(`FAIL ${intent.type}`);
      for (const error of result.errors) {
        this.print(`  ${error.code}: ${error.message}`);
      }
    }
    if (trace) this.print(formatTrace(trace));
  }

  advance(ticks: number): void {
    this.#journal.push({ kind: "advance", ticks });
    this.simulation.advanceBy(ticks);
  }

  get journal(): readonly JournalEntry[] {
    return this.#journal;
  }

  /** Replays this session into a fresh simulation and returns it. */
  replay(seed = this.simulation.worldSeed): Simulation {
    const replay = new Simulation({ worldSeed: seed, modules: this.#modules });
    for (const entry of this.#journal) {
      if (entry.kind === "dispatch") replay.dispatch(entry.intent);
      else replay.advanceBy(entry.ticks);
    }
    replay.syncHistory();
    return replay;
  }

  #builtins: Record<
    string,
    (positional: string[], options: Record<string, JsonValue>) => void
  > = {
    help: () => this.print(HELP_TEXT),

    quit: () => {
      this.print("bye");
      process.exit(0);
    },
    exit: () => {
      this.print("bye");
      process.exit(0);
    },

    tick: () => this.print(`tick = ${this.simulation.tick}`),

    advance: (positional, options) => {
      if (typeof options.to === "number") {
        const target = options.to;
        this.#journal.push({ kind: "advance", ticks: target - this.simulation.tick });
        this.simulation.advanceTo(target);
        this.print(`advanced to tick ${this.simulation.tick}`);
        return;
      }
      const years = typeof options.years === "number" ? options.years : Number(positional[0] ?? 1);
      const ticks = typeof options.months === "number" ? options.months : years * 12;
      this.advance(ticks);
      this.print(`advanced ${ticks} ticks -> tick ${this.simulation.tick}`);
    },

    state: () => {
      const world = this.simulation.worldView();
      this.print(section("WORLD STATE"));
      this.print(`  tick: ${this.simulation.tick}`);
      this.print(`  worldSeed: ${this.simulation.worldSeed}`);
      this.print(`  entities: ${world.listEntities({ includeArchived: true }).length}`);
      this.print(`  relations: ${world.listRelations({ includeArchived: true }).length}`);
      this.print(`  events: ${this.simulation.kernel.internals.eventLog.length}`);
      this.print(`  historical records: ${this.simulation.history.records.length}`);
      this.print(`  scheduled tasks: ${this.simulation.kernel.scheduledTasks().length}`);
      this.print(`  rng: ${JSON.stringify(this.simulation.kernel.internals.rng.snapshot())}`);
    },

    entities: (_positional, options) =>
      this.print(
        `${section("ENTITIES")}\n${formatEntities(this.simulation.worldView(), {
          includeArchived: options.archived === true,
        })}`,
      ),

    relations: (_positional, options) =>
      this.print(
        `${section("RELATIONS")}\n${formatRelations(this.simulation.worldView(), {
          includeArchived: options.archived === true,
        })}`,
      ),

    events: (_positional, options) => {
      const limit = typeof options.limit === "number" ? options.limit : 40;
      const events = this.simulation.kernel.internals.eventLog.all().slice(-limit);
      this.print(section(`EVENTS (last ${events.length})`));
      if (events.length === 0) this.print("  (no events)");
      for (const event of events) this.print(formatEvent(event));
    },

    trace: (_positional, options) => {
      const limit = typeof options.limit === "number" ? options.limit : 5;
      const recent = this.simulation.kernel.recentTraces().slice(-limit);
      this.print(section(`COMMAND / DECISION TRACE (last ${recent.length})`));
      if (recent.length === 0) this.print("  (no traces)");
      for (const entry of recent) this.print(formatTrace(entry));
    },

    why: (positional) => {
      const eventId = positional[0];
      if (!eventId) {
        this.print("usage: why <eventId>");
        return;
      }
      const explanation = this.simulation.history.explain(eventId);
      if (!explanation) {
        this.print(`unknown event: ${eventId}`);
        return;
      }
      this.print(section(`CAUSAL EXPLANATION ${eventId}`));
      printExplanation(this, explanation, 0);
    },

    history: (_positional, options) => {
      const min = typeof options.min === "number" ? options.min : 0;
      const records = this.simulation.history.listRecords({ minSignificance: min });
      this.print(section(`HISTORY (${records.length} records, min significance ${min})`));
      if (records.length === 0) this.print("  (no records)");
      for (const record of records) {
        const archived = record.subjectArchived ? " [subject archived]" : "";
        this.print(
          `  ${record.id} t=${record.at} sig=${record.significance.toFixed(2)} ${record.type}${archived}`,
        );
        this.print(`    ${record.summary}`);
      }
    },

    lineage: (positional, options) => {
      const lineageId =
        typeof options.id === "string" ? options.id : positional[0] ?? "family:lineage:1";
      const view = this.simulation.history.lineage(lineageId);
      if (!view) {
        this.print(`unknown lineage: ${lineageId}`);
        return;
      }
      this.print(section(`LINEAGE ${lineageId}`));
      this.print(`  founder: ${view.founderId ?? "(none)"}`);
      for (const member of view.members) {
        this.print(
          `  gen ${member.generation}: ${member.characterId} ${member.alive ? "(alive)" : "(dead)"}`,
        );
      }
      this.print(`  chronicle records: ${view.records.length}`);
      for (const record of view.records) {
        this.print(`    t=${record.at} ${record.type} - ${record.summary}`);
      }
    },

    modules: () => {
      this.print(section("MODULES"));
      for (const info of this.simulation.modules.list()) printModule(this, info);
    },

    schedule: () => {
      const tasks = this.simulation.kernel.scheduledTasks();
      this.print(section(`SCHEDULED TASKS (${tasks.length})`));
      if (tasks.length === 0) this.print("  (nothing scheduled)");
      for (const task of tasks) {
        this.print(
          `  ${task.id} ${task.type} dueAt=${task.dueAt} owner=${task.owner ?? "?"} runs=${task.runs}`,
        );
      }
    },

    project: (positional, options) => {
      const id = positional[0];
      if (!id) {
        this.print(section("PROJECTIONS"));
        for (const projection of this.simulation.projections.list()) {
          this.print(`  ${projection.id} [${projection.owner}] ${projection.description ?? ""}`);
        }
        return;
      }
      const viewer = typeof options.viewer === "string" ? options.viewer : undefined;
      const result: ProjectionResult = this.simulation.project({
        id,
        ...(viewer ? { viewerId: viewer } : {}),
      });
      this.print(section(`PROJECTION ${id}${viewer ? ` for ${viewer}` : ""}`));
      this.print(JSON.stringify(result.data, null, 2));
    },

    save: (positional, options) => {
      const label = typeof options.label === "string" ? options.label : positional[0];
      this.#savedJson = this.simulation.saveToJson(label ? { label } : {});
      this.print(`saved ${this.#savedJson.length} bytes (in-memory slot)`);
    },

    load: () => {
      if (!this.#savedJson) {
        this.print("nothing saved yet; run `save` first");
        return;
      }
      const before = this.simulation.fingerprint();
      const loaded = Simulation.loadFromJson(this.#savedJson, this.#modules);
      if (!loaded.result.ok || !loaded.simulation) {
        this.print(`load failed: ${loaded.result.errors.map((error) => error.message).join("; ")}`);
        return;
      }
      const after = loaded.simulation.fingerprint();
      this.simulation = loaded.simulation;
      this.print(`loaded; fingerprint ${before === after ? "MATCHES" : "DIFFERS"}`);
      if (before !== after) this.print("  WARNING: save/load round trip is not identical");
    },

    verify: () => this.#verify(),

    dispatch: (positional, options) => {
      const type = positional[0];
      if (!type) {
        this.print("usage: dispatch <command.type> [key=value ...]");
        return;
      }
      this.dispatch({ type, payload: options, source: "system" });
    },
  };

  #verify(): void {
    this.print(section("VERIFY"));

    const snapshot = this.simulation.saveToJson({ label: "verify" });
    const loaded = Simulation.loadFromJson(snapshot, this.#modules);
    if (!loaded.result.ok || !loaded.simulation) {
      this.print("  save/load: FAIL");
      for (const error of loaded.result.errors) this.print(`    ${error.code}: ${error.message}`);
      return;
    }
    this.print(
      `  save/load identical: ${
        this.simulation.fingerprint() === loaded.simulation.fingerprint() ? "PASS" : "FAIL"
      }`,
    );

    const replayed = this.replay();
    this.print(
      `  replay with same seed is identical: ${
        this.simulation.fingerprint() === replayed.fingerprint() ? "PASS" : "FAIL"
      }`,
    );

    const differentSeed = this.replay(this.simulation.worldSeed + 1);
    this.print(
      `  replay with different seed differs: ${
        this.simulation.fingerprint() !== differentSeed.fingerprint() ? "PASS" : "FAIL"
      }`,
    );
  }
}

function printModule(console_: DebugConsole, info: InstalledModuleInfo): void {
  console_.print(`  ${info.id}@${info.version} [${info.type}] state=${info.state}`);
  if (info.error) console_.print(`    ERROR: ${info.error}`);
  if (info.provides.length > 0) console_.print(`    provides: ${info.provides.join(", ")}`);
  if (info.requires.length > 0) console_.print(`    requires: ${info.requires.join(", ")}`);
  const definitions = Object.entries(info.definitions)
    .filter(([, items]) => items.length > 0)
    .map(([kind, items]) => `${kind}=${items.length}`);
  if (definitions.length > 0) console_.print(`    definitions: ${definitions.join(" ")}`);
}

function printExplanation(
  console_: DebugConsole,
  explanation: CausalExplanation,
  depth: number,
): void {
  const indent = "  ".repeat(depth + 1);
  console_.print(`${indent}t=${explanation.at} ${explanation.type} (${explanation.eventId})`);
  if (explanation.commandId) {
    console_.print(`${indent}  caused by command: ${explanation.commandId}`);
  }
  if (explanation.causes.length > 0) {
    console_.print(`${indent}  caused by:`);
    for (const cause of explanation.causes) printExplanation(console_, cause, depth + 2);
  }
  if (explanation.consequences.length > 0) {
    console_.print(`${indent}  led to:`);
    for (const consequence of explanation.consequences) {
      console_.print(
        `${indent}    t=${consequence.at} ${consequence.type} (${consequence.eventId})`,
      );
    }
  }
}

export const HELP_TEXT = `OpenLife debug console

World
  state                      summary of the world
  entities [archived=true]   list entities
  relations [archived=true]  list relations
  events [limit=N]           recent events
  schedule                   scheduled tasks
  modules                    installed modules and their definitions
  project [id] [viewer=id]   list or run a projection

Debug
  trace [limit=N]            recent command / decision traces
  why <eventId>              causal explanation of an event
  history [min=0.0]          historical records
  lineage [id=...]           lineage chronicle
  verify                     save/load and determinism checks

Simulation
  advance years=1 | to=N     advance the clock
  save [label=...]           save to the in-memory slot
  load                       load the in-memory slot
  dispatch <type> [k=v ...]  run a command explicitly

Any other line is treated as a command, for example:
  modern.create_character givenName=Ada familyName=Stone cityId=modern:city:north
`;
