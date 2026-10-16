/** Kernel.internals is an inspection surface, never a second write path. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DefinitionSet } from "@openlife/rule-engine";
import { Kernel } from "@openlife/kernel";
import { seedEntities } from "../helpers/seed.ts";

function kernel() {
  const definitions = new DefinitionSet();
  definitions.components.register("demo.counter", { id: "demo.counter", persist: true }, "demo");
  const k = new Kernel({ worldSeed: 3, definitions });
  seedEntities(k, [{ id: "demo:a", kind: "demo.actor", components: { "demo.counter": { value: 1 } } }]);
  return k;
}

test("internals expose no mutators", () => {
  const { store, eventLog, scheduler, facts, rng } = kernel().internals as unknown as Record<string, Record<string, unknown>>;
  for (const name of ["createEntity", "setComponent", "mergeComponent", "archiveEntity", "addRelation", "restore"]) {
    assert.equal(store[name], undefined, `store.${name}`);
  }
  assert.equal(eventLog.append, undefined);
  assert.equal(scheduler.schedule, undefined);
  assert.equal(scheduler.complete, undefined);
  assert.equal(facts.add, undefined);
  assert.equal(rng.nextFloat, undefined);
  assert.ok(Object.isFrozen(store) && Object.isFrozen(eventLog) && Object.isFrozen(scheduler));
});

test("values read through internals are copies", () => {
  const k = kernel();
  const before = k.internals.store.fingerprint();
  const component = k.internals.store.getComponent("demo:a", "demo.counter") as { value: number };
  component.value = 999;
  const entity = k.internals.store.getEntity("demo:a")!;
  entity.components["demo.counter"] = { value: 42 };
  const clock = k.internals.clock as { tick: number };
  assert.throws(() => { clock.tick = 100; });
  assert.equal(k.internals.store.fingerprint(), before);
  assert.equal(k.tick, 0);
});

test("facades stay live across restore", () => {
  const k = kernel();
  const internals = k.internals;
  const saved = k.serialize();
  const other = new Kernel({ worldSeed: 3, definitions: k.definitions });
  other.restore(saved);
  assert.equal(other.internals.store.fingerprint(), internals.store.fingerprint());
  k.restore({ ...saved, store: { ...saved.store, entities: [] } } as never);
  assert.equal(internals.store.hasEntity("demo:a"), false, "an old facade reads the restored store");
});
