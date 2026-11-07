/**
 * Command pipeline tests: Command -> Validation -> Rule -> Effect ->
 * Transaction -> Event -> Reaction (§INV-001, §INV-002, §14).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { DefinitionSet } from "@openlife/rule-engine";
import { Kernel } from "@openlife/kernel";
import { WorldStore } from "@openlife/world-model";
import { seedEntities, scheduleThroughCommand } from "../helpers/seed.ts";

function buildKernel(): Kernel {
  const definitions = new DefinitionSet();
  definitions.components.register("demo.counter", { id: "demo.counter", persist: true }, "demo");
  definitions.commands.register("demo.ping", { type: "demo.ping" }, "demo");
  definitions.constraints.register(
    "demo.ping.guard",
    {
      id: "demo.ping.guard",
      kind: "constraint",
      commandType: "demo.ping",
      evaluate: (ctx) =>
        ctx.command.actorId
          ? { ok: true }
          : { ok: false, code: "E_NO_ACTOR", message: "actor required" },
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
        const actorId = ctx.command.actorId as string;
        const current = Number(ctx.world.getComponent(actorId, "demo.counter")?.value ?? 0);
        return [
          {
            kind: "modifyComponent",
            entityId: actorId,
            component: "demo.counter",
            patch: { value: current + 1 },
          },
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

  const kernel = new Kernel({ worldSeed: 1, definitions });
  seedEntities(kernel, [{ id: "demo:actor", kind: "demo.actor", components: { "demo.counter": { value: 0 } } }]);
  return kernel;
}

test("events carry the command and transaction that produced them", () => {
  const kernel = buildKernel();
  const result = kernel.dispatch({ type: "demo.ping", actorId: "demo:actor" });
  assert.equal(result.ok, true);
  const events = kernel.internals.eventLog.all();
  assert.equal(events[0]?.commandId, result.commandId);
  assert.equal(events[0]?.transactionId, result.transactionId);
  assert.equal(events[0]?.causedBy.length, 0);
});

test("reaction events record the event that caused them", () => {
  const kernel = buildKernel();
  kernel.dispatch({ type: "demo.ping", actorId: "demo:actor" });
  const events = kernel.internals.eventLog.all();
  const reaction = events.find((event) => event.type === "demo.ping_observed");
  assert.ok(reaction);
  assert.deepEqual(reaction.causedBy, [events[0]?.id]);
});

test("rejected commands produce no events and no state change", () => {
  const kernel = buildKernel();
  const before = kernel.internals.store.fingerprint();
  const result = kernel.dispatch({ type: "demo.ping" });
  assert.equal(result.ok, false);
  assert.equal(result.rejected, true);
  assert.equal(result.eventIds.length, 0);
  assert.equal(kernel.internals.eventLog.length, 0);
  // World state is untouched. The command counter advances because the
  // command was stamped and recorded, which is intentional and auditable.
  assert.equal(kernel.internals.store.fingerprint(), before);
});

test("decision traces record constraint verdicts", () => {
  const kernel = buildKernel();
  kernel.dispatch({ type: "demo.ping" });
  const trace = kernel.recentTraces().at(-1);
  assert.ok(trace);
  assert.equal(trace.constraints.length, 1);
  assert.equal(trace.constraints[0]?.ok, false);
  assert.equal(trace.constraints[0]?.code, "E_NO_ACTOR");
});

test("the world view given to rules cannot mutate state", () => {
  const kernel = buildKernel();
  const view = kernel.worldView();
  const component = view.getComponent("demo:actor", "demo.counter");
  assert.deepEqual(component, { value: 0 });
  // Mutating the returned object must not reach the store.
  (component as { value: number }).value = 999;
  assert.deepEqual(kernel.worldView().getComponent("demo:actor", "demo.counter"), { value: 0 });
});

test("a reaction cycle is suppressed instead of looping forever", () => {
  const definitions = new DefinitionSet();
  definitions.components.register("demo.counter", { id: "demo.counter", persist: true }, "demo");
  definitions.commands.register("demo.spin", { type: "demo.spin" }, "demo");
  definitions.resolutions.register(
    "demo.spin.resolve",
    {
      id: "demo.spin.resolve",
      kind: "resolution",
      commandType: "demo.spin",
      resolve: () => [{ kind: "emitEvent", eventType: "demo.tick", data: {} }],
    },
    "demo",
  );
  // A -> B -> A: the cycle detector must stop it.
  definitions.reactions.register(
    "demo.tick.react",
    {
      id: "demo.tick.react",
      kind: "reaction",
      eventType: "demo.tick",
      react: () => [{ kind: "emitEvent", eventType: "demo.tock", data: {} }],
    },
    "demo",
  );
  definitions.reactions.register(
    "demo.tock.react",
    {
      id: "demo.tock.react",
      kind: "reaction",
      eventType: "demo.tock",
      react: () => [{ kind: "emitEvent", eventType: "demo.tick", data: {} }],
    },
    "demo",
  );

  const kernel = new Kernel({ worldSeed: 3, definitions, maxEventsPerTransaction: 64 });
  const result = kernel.dispatch({ type: "demo.spin" });
  assert.equal(result.ok, true, "the cycle must terminate rather than fail");
  const tickCount = kernel.internals.eventLog.all().filter((event) => event.type === "demo.tick").length;
  assert.ok(tickCount <= 4, `cycle suppression should cap repeats, saw ${tickCount}`);
});

test("a failed reaction rolls back every earlier effect in the transaction", () => {
  const definitions = new DefinitionSet();
  definitions.components.register("demo.counter", { id: "demo.counter", persist: true }, "demo");
  definitions.commands.register("demo.atomic", { type: "demo.atomic" }, "demo");
  definitions.resolutions.register(
    "demo.atomic.resolve",
    {
      id: "demo.atomic.resolve",
      kind: "resolution",
      commandType: "demo.atomic",
      resolve: () => [
        {
          kind: "modifyComponent",
          entityId: "demo:actor",
          component: "demo.counter",
          patch: { value: 99 },
        },
        { kind: "emitEvent", eventType: "demo.atomic_started", data: {} },
      ],
    },
    "demo",
  );
  definitions.reactions.register(
    "demo.atomic.fail_late",
    {
      id: "demo.atomic.fail_late",
      kind: "reaction",
      eventType: "demo.atomic_started",
      react: () => [
        {
          kind: "modifyComponent",
          entityId: "demo:missing",
          component: "demo.counter",
          patch: { value: 1 },
        },
      ],
    },
    "demo",
  );
  const kernel = new Kernel({ worldSeed: 9, definitions });
  seedEntities(kernel, [{ id: "demo:actor", kind: "demo.actor", components: { "demo.counter": { value: 0 } } }]);

  const before = kernel.internals.store.fingerprint();
  const result = kernel.dispatch({ type: "demo.atomic" });

  assert.equal(result.ok, false);
  assert.equal(kernel.internals.store.fingerprint(), before);
  assert.equal(kernel.internals.eventLog.length, 0);
  assert.deepEqual(kernel.worldView().getComponent("demo:actor", "demo.counter"), { value: 0 });
});

test("unknown effects fail loudly instead of being ignored", () => {
  const definitions = new DefinitionSet();
  definitions.commands.register("demo.bad", { type: "demo.bad" }, "demo");
  definitions.resolutions.register(
    "demo.bad.resolve",
    {
      id: "demo.bad.resolve",
      kind: "resolution",
      commandType: "demo.bad",
      resolve: () => [{ kind: "notARealEffect" } as never],
    },
    "demo",
  );
  const kernel = new Kernel({ worldSeed: 1, definitions });
  const result = kernel.dispatch({ type: "demo.bad" });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0]?.code, "E_INTERNAL");
});

test("store rejects unknown entity writes from effects", () => {
  const store = new WorldStore();
  assert.throws(() => store.setComponent("nope", "demo.counter", { value: 1 }));
});
