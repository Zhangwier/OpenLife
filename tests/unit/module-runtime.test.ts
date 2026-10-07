/**
 * MVP criteria 10, 11 and 12: modules extend the kernel without modifying it,
 * unload without deleting history, and validate their dependencies.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import type { OpenLifeModule } from "@openlife/contracts";
import { DefinitionSet } from "@openlife/rule-engine";
import { Kernel } from "@openlife/kernel";
import { ModuleRuntime } from "@openlife/module-runtime";
import { Simulation } from "@openlife/simulation";
import { magicTestWorldModule } from "@openlife/module-magic-test-world";
import {
  MODERN_MODULES,
  TICKS_PER_YEAR,
  advanceToAge,
  bootWorld,
  mustDispatch,
} from "../helpers/modern.ts";

function runtimeFor(definitions = new DefinitionSet()): ModuleRuntime {
  return new ModuleRuntime({ definitions, engineVersion: "0.1.0", worldSeed: 1 });
}

const simpleModule: OpenLifeModule = {
  manifest: {
    id: "demo",
    version: "1.0.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    provides: ["demo.capability"],
  },
  register(ctx) {
    ctx.registerComponent({ id: "demo.thing", persist: true });
    ctx.registerCommand({ type: "demo.do", description: "does a thing" });
    ctx.registerKnowledge({
      id: "demo.observable",
      kind: "phenomenon",
      description: "A generic observable phenomenon.",
    });
    ctx.registerResource({
      id: "demo.energy",
      unit: "unit",
      description: "A generic module-owned resource.",
    });
    ctx.registerProcess({
      id: "demo.transform",
      consumes: { "demo.energy": 1 },
      description: "A generic resource transformation.",
    });
    ctx.registerConstraintRule({
      id: "demo.do.allowed",
      kind: "constraint",
      commandType: "demo.do",
      evaluate: () => ({ ok: true }),
    });
    ctx.registerResolutionRule({
      id: "demo.do.resolve",
      kind: "resolution",
      commandType: "demo.do",
      resolve: () => [{ kind: "emitEvent", eventType: "demo.done", data: {} }],
    });
  },
};

test("a module registers definitions without touching the kernel", () => {
  const runtime = runtimeFor();
  const info = runtime.install(simpleModule);
  assert.equal(info.state, "active");
  assert.deepEqual(info.definitions.components, ["demo.thing"]);
  assert.deepEqual(info.definitions.commands, ["demo.do"]);
  assert.deepEqual(info.definitions.knowledge, ["demo.observable"]);
  assert.deepEqual(info.definitions.resources, ["demo.energy"]);
  assert.deepEqual(info.definitions.processes, ["demo.transform"]);
  assert.ok(runtime.hasCapability("demo.capability"));
});

test("declarative extension registrations follow module lifecycle", () => {
  const definitions = new DefinitionSet();
  const runtime = runtimeFor(definitions);
  runtime.install(simpleModule);

  assert.equal(definitions.knowledge.get("demo.observable")?.enabled, true);
  assert.equal(definitions.resources.get("demo.energy")?.enabled, true);
  assert.equal(definitions.processes.get("demo.transform")?.enabled, true);

  runtime.unload("demo");
  assert.deepEqual(definitions.knowledge.active(), []);
  assert.deepEqual(definitions.resources.active(), []);
  assert.deepEqual(definitions.processes.active(), []);

  runtime.activate("demo");
  assert.deepEqual(definitions.knowledge.active().map((item) => item.id), ["demo.observable"]);
  assert.deepEqual(definitions.resources.active().map((item) => item.id), ["demo.energy"]);
  assert.deepEqual(definitions.processes.active().map((item) => item.id), ["demo.transform"]);
});

test("capabilities disappear while their provider is unloaded and return on activation", () => {
  const runtime = runtimeFor();
  runtime.install(simpleModule);
  assert.equal(runtime.hasCapability("demo.capability"), true);
  runtime.unload("demo");
  assert.equal(runtime.hasCapability("demo.capability"), false);
  runtime.activate("demo");
  assert.equal(runtime.hasCapability("demo.capability"), true);
});

test("module ids and definition namespaces are enforced", () => {
  const runtime = runtimeFor();
  assert.throws(
    () =>
      runtime.install({
        manifest: { id: "Bad Id", version: "1.0.0", engineRange: "*", type: "system-pack" },
        register: () => undefined,
      }),
    /module id/,
  );
  // A module cannot register definitions inside another module's namespace.
  // Registration failures are contained: the module is marked failed instead
  // of corrupting the shared registries.
  const squatter = runtime.install({
    manifest: { id: "squatter", version: "1.0.0", engineRange: "*", type: "system-pack" },
    register: (ctx) => {
      ctx.registerComponent({ id: "other.thing", persist: true });
    },
  });
  assert.equal(squatter.state, "failed");
  assert.match(squatter.error ?? "", /outside the namespace/);
  assert.equal(runtime.list().find((info) => info.id === "squatter")?.state, "failed");
});

test("missing required capabilities are rejected", () => {
  const runtime = runtimeFor();
  assert.throws(
    () =>
      runtime.install({
        manifest: {
          id: "needy",
          version: "1.0.0",
          engineRange: "*",
          type: "system-pack",
          requires: ["nobody.provides_this"],
        },
        register: () => undefined,
      }),
    /requires capability/,
  );
});

test("an engine version mismatch is rejected", () => {
  const runtime = runtimeFor();
  assert.throws(
    () =>
      runtime.install({
        manifest: {
          id: "future",
          version: "1.0.0",
          engineRange: "^2.0.0",
          type: "system-pack",
        },
        register: () => undefined,
      }),
    /requires engine/,
  );
});

test("incompatible modules cannot be installed together", () => {
  const runtime = runtimeFor();
  runtime.install(simpleModule);
  assert.throws(
    () =>
      runtime.install({
        manifest: {
          id: "rival",
          version: "1.0.0",
          engineRange: "*",
          type: "system-pack",
          incompatible: ["demo"],
        },
        register: () => undefined,
      }),
    /incompatible/,
  );
});

test("unloading a module disables its rules without deleting its history", () => {
  const { simulation, characterId } = bootWorld({
    seed: 201,
    startingCash: 20_000,
    lifespan: 70,
  });
  mustDispatch(simulation, {
    type: "career.start_business",
    actorId: characterId,
    payload: { name: "Stone Atelier", capital: 5_000 },
  });
  const recordsBefore = simulation.history.listRecords().length;
  const eventsBefore = simulation.kernel.internals.eventLog.length;

  const info = simulation.unload("career");
  assert.equal(info.state, "orphaned");

  // History and world data survive.
  assert.equal(simulation.history.listRecords().length, recordsBefore);
  assert.equal(simulation.kernel.internals.eventLog.length, eventsBefore);
  assert.ok(
    simulation
      .worldView()
      .listEntities({ kind: "modern.organization", includeArchived: true })
      .some((entity) => entity.components["modern.organization"]?.name === "Stone Atelier"),
  );

  // Its commands stop working.
  const result = simulation.dispatch({
    type: "career.get_job",
    actorId: characterId,
    payload: { occupation: "engineer" },
  });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0]?.code, "E_UNKNOWN_COMMAND");
});

test("reactivating a module restores its behaviour", () => {
  const { simulation, characterId } = bootWorld({ seed: 202, lifespan: 70 });
  // Give the character time to reach working age first.
  advanceToAge(simulation, characterId, 20);
  simulation.unload("career");
  assert.equal(
    simulation.dispatch({
      type: "career.get_job",
      actorId: characterId,
      payload: { occupation: "engineer" },
    }).ok,
    false,
  );
  simulation.activate("career");
  assert.equal(
    simulation.dispatch({
      type: "career.get_job",
      actorId: characterId,
      payload: { occupation: "engineer" },
    }).ok,
    true,
  );
});

test("the magic world runs with no kernel changes and no modern module", () => {
  const simulation = new Simulation({
    worldSeed: 42,
    modules: [magicTestWorldModule],
  });
  assert.equal(simulation.dispatch({ type: "magic.initialize_world" }).ok, true);
  assert.equal(
    simulation.dispatch({ type: "magic.create_soul", payload: { name: "Nyx" } }).ok,
    true,
  );
  const soulId = String(
    simulation.worldView().getComponent("magic:world", "magic.world_state")?.activeSoulId,
  );
  assert.ok(soulId);
  assert.equal(simulation.dispatch({ type: "magic.meditate", actorId: soulId }).ok, true);
  // A successor must exist before the active soul can ascend.
  assert.equal(
    simulation.dispatch({ type: "magic.create_soul", payload: { name: "Vela" } }).ok,
    true,
  );
  simulation.advanceBy(12);
  assert.equal(simulation.dispatch({ type: "magic.ascend", actorId: soulId }).ok, true);
  assert.equal(simulation.dispatch({ type: "magic.reincarnate" }).ok, true);
  simulation.syncHistory();
  assert.ok(simulation.history.records.length > 0);
});

test("the two worlds do not share vocabulary", () => {
  const modern = new DefinitionSet();
  const modernRuntime = new ModuleRuntime({ definitions: modern, engineVersion: "0.1.0", worldSeed: 1 });
  for (const module of MODERN_MODULES) modernRuntime.install(module);

  const magic = new DefinitionSet();
  const magicRuntime = new ModuleRuntime({ definitions: magic, engineVersion: "0.1.0", worldSeed: 1 });
  magicRuntime.install(magicTestWorldModule);

  const modernComponents = new Set(modern.components.keys());
  const magicComponents = new Set(magic.components.keys());
  const overlap = [...modernComponents].filter((id) => magicComponents.has(id));
  assert.deepEqual(overlap, [], "the two world packs must not share component types");

  const modernCommands = new Set(modern.commands.keys());
  const magicCommands = new Set(magic.commands.keys());
  assert.deepEqual(
    [...modernCommands].filter((id) => magicCommands.has(id)),
    [],
    "the two world packs must not share command types",
  );
});

test("module state is isolated per module", () => {
  const { simulation } = bootWorld({ seed: 203 });
  simulation.modules.setState("career", { jobs: 3 });
  simulation.modules.setState("education", { graduates: 1 });
  assert.deepEqual(simulation.modules.getState("career"), { jobs: 3 });
  assert.deepEqual(simulation.modules.getState("education"), { graduates: 1 });
});

test("a module that throws during registration is marked failed", () => {
  const runtime = runtimeFor();
  const info = runtime.install({
    manifest: { id: "broken", version: "1.0.0", engineRange: "*", type: "system-pack" },
    register: () => {
      throw new Error("boom");
    },
  });
  assert.equal(info.state, "failed");
  assert.match(info.error ?? "", /boom/);
});

test("scheduler tasks are cancelled when their owner unloads", () => {
  const { simulation, characterId } = bootWorld({ seed: 204, lifespan: 70 });
  advanceToAge(simulation, characterId, 20);
  mustDispatch(simulation, {
    type: "career.get_job",
    actorId: characterId,
    payload: { occupation: "engineer" },
  });
  const tasksBefore = simulation.kernel.scheduledTasks().filter((task) => task.owner === "career");
  assert.ok(tasksBefore.length > 0);
  simulation.unload("career");
  const tasksAfter = simulation.kernel.scheduledTasks().filter((task) => task.owner === "career");
  assert.equal(tasksAfter.length, 0);
  // The world still advances without crashing.
  simulation.advanceBy(12 * TICKS_PER_YEAR);
  assert.ok(simulation.tick > 0);
});
