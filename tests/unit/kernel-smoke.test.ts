import { test } from "node:test";
import assert from "node:assert/strict";
import { DefinitionSet } from "@openlife/rule-engine";
import { Kernel } from "@openlife/kernel";

/**
 * Wiring smoke test: proves the command pipeline, transaction, scheduler and
 * event cascade work end to end with no game content involved.
 */
function buildKernel(seed = 1234): Kernel {
  const definitions = new DefinitionSet();
  definitions.components.register("demo.counter", { id: "demo.counter", persist: true }, "demo");
  definitions.commands.register(
    "demo.ping",
    { type: "demo.ping", description: "increments a counter" },
    "demo",
  );
  definitions.constraints.register(
    "demo.ping.guard",
    {
      id: "demo.ping.guard",
      kind: "constraint",
      commandType: "demo.ping",
      evaluate: (ctx) => (ctx.command.actorId ? { ok: true } : { ok: false, code: "E_NO_ACTOR" }),
    },
    "demo",
  );
  definitions.resolutions.register(
    "demo.ping.resolve",
    {
      id: "demo.ping.resolve",
      kind: "resolution",
      commandType: "demo.ping",
      resolve: (ctx) => {
        const entity = ctx.world.getEntity(ctx.command.actorId as string);
        const current = Number(entity?.components["demo.counter"]?.value ?? 0);
        return [
          { kind: "modifyComponent", entityId: ctx.command.actorId as string, component: "demo.counter", patch: { value: current + 1 } },
          { kind: "emitEvent", eventType: "demo.pinged", data: { value: current + 1 } },
        ];
      },
    },
    "demo",
  );
  definitions.reactions.register(
    "demo.ping.react",
    {
      id: "demo.ping.react",
      kind: "reaction",
      eventType: "demo.pinged",
      react: (ctx) => [
        { kind: "emitEvent", eventType: "demo.ping_observed", data: { from: ctx.event.id } },
      ],
    },
    "demo",
  );
  definitions.tasks.register(
    "demo.tick",
    {
      id: "demo.tick",
      handler: (ctx) => ({
        command: { type: "demo.ping", actorId: ctx.payload.actorId as string, source: "system" },
      }),
    },
    "demo",
  );

  const kernel = new Kernel({ worldSeed: seed, definitions });
  const store = kernel.internals.store;
  store.createEntity({
    id: "demo:actor",
    kind: "demo.actor",
    components: { "demo.counter": { value: 0 } },
    createdAt: 0,
  });
  return kernel;
}

test("command pipeline mutates state through transaction only", () => {
  const kernel = buildKernel();
  const result = kernel.dispatch({ type: "demo.ping", actorId: "demo:actor" });
  assert.equal(result.ok, true);
  assert.equal(result.rejected, false);
  assert.deepEqual(
    kernel.worldView().getComponent("demo:actor", "demo.counter"),
    { value: 1 },
  );
});

test("reaction rule fires from an emitted event", () => {
  const kernel = buildKernel();
  kernel.dispatch({ type: "demo.ping", actorId: "demo:actor" });
  const types = kernel.internals.eventLog.all().map((event) => event.type);
  assert.deepEqual(types, ["demo.pinged", "demo.ping_observed"]);
});

test("constraint rejection leaves world state untouched", () => {
  const kernel = buildKernel();
  const result = kernel.dispatch({ type: "demo.ping" });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0]?.code, "E_NO_ACTOR");
  assert.deepEqual(
    kernel.worldView().getComponent("demo:actor", "demo.counter"),
    { value: 0 },
  );
  assert.equal(kernel.internals.eventLog.length, 0);
});

test("scheduler advances time and runs scheduled tasks", () => {
  const kernel = buildKernel();
  kernel.internals.scheduler.schedule({
    type: "demo.tick",
    dueAt: 5,
    payload: { actorId: "demo:actor" },
    owner: "demo",
  });
  kernel.advanceTo(10);
  assert.equal(kernel.tick, 10);
  assert.deepEqual(
    kernel.worldView().getComponent("demo:actor", "demo.counter"),
    { value: 1 },
  );
});

test("unknown command is rejected without throwing", () => {
  const kernel = buildKernel();
  const result = kernel.dispatch({ type: "demo.does_not_exist" });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0]?.code, "E_UNKNOWN_COMMAND");
});
