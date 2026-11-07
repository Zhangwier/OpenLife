import { test } from "node:test";
import assert from "node:assert/strict";
import { WorldStore, stableStringify } from "@openlife/world-model";

test("entities and components round trip through serialize/deserialize", () => {
  const store = new WorldStore();
  store.createEntity({
    id: "demo:e1",
    kind: "demo.thing",
    components: { "demo.counter": { value: 3 } },
    createdAt: 0,
  });
  store.setComponent("demo:e1", "demo.extra", { label: "hello" });
  store.mergeComponent("demo:e1", "demo.counter", { value: 4, note: "merged" });

  const restored = WorldStore.deserialize(store.serialize());
  assert.deepEqual(restored.getEntity("demo:e1"), store.getEntity("demo:e1"));
  assert.equal(restored.fingerprint(), store.fingerprint());
});

test("relation lookup index enforces uniqueness", () => {
  const store = new WorldStore();
  store.createEntity({ id: "demo:a", kind: "demo.thing", components: {}, createdAt: 0 });
  store.createEntity({ id: "demo:b", kind: "demo.thing", components: {}, createdAt: 0 });
  store.addRelation({
    id: "rel:1",
    type: "demo.link",
    from: "demo:a",
    to: "demo:b",
    components: {},
    createdAt: 0,
  });
  assert.ok(store.getRelation("demo.link", "demo:a", "demo:b"));
  assert.equal(store.getRelation("demo.link", "demo:b", "demo:a"), undefined);
  assert.throws(() =>
    store.addRelation({
      id: "rel:2",
      type: "demo.link",
      from: "demo:a",
      to: "demo:b",
      components: {},
      createdAt: 0,
    }),
  );
});

test("archived entities are excluded unless requested", () => {
  const store = new WorldStore();
  store.createEntity({ id: "demo:a", kind: "demo.thing", components: {}, createdAt: 0 });
  store.createEntity({ id: "demo:b", kind: "demo.thing", components: {}, createdAt: 0 });
  store.archiveEntity("demo:a", 10, "test");
  assert.deepEqual(
    store.listEntities({ kind: "demo.thing" }).map((entity) => entity.id),
    ["demo:b"],
  );
  assert.deepEqual(
    store.listEntities({ kind: "demo.thing", includeArchived: true }).map((entity) => entity.id),
    ["demo:a", "demo:b"],
  );
  assert.equal(store.countEntities("demo.thing"), 1);
});

test("archived relations are excluded unless requested", () => {
  const store = new WorldStore();
  store.createEntity({ id: "demo:a", kind: "demo.thing", components: {}, createdAt: 0 });
  store.createEntity({ id: "demo:b", kind: "demo.thing", components: {}, createdAt: 0 });
  store.addRelation({
    id: "rel:1",
    type: "demo.link",
    from: "demo:a",
    to: "demo:b",
    components: {},
    createdAt: 0,
  });
  store.archiveRelation("rel:1", 5, "ended");
  assert.equal(store.listRelations({ type: "demo.link" }).length, 0);
  assert.equal(store.listRelations({ type: "demo.link", includeArchived: true }).length, 1);
});

test("generated entity ids are deterministic and monotonic", () => {
  const store = new WorldStore();
  assert.equal(store.nextEntityId("demo"), "demo:e1");
  assert.equal(store.nextEntityId("demo"), "demo:e2");
  const restored = WorldStore.deserialize(store.serialize());
  assert.equal(restored.nextEntityId("demo"), "demo:e3");
});

test("stableStringify sorts keys so hashes are order independent", () => {
  assert.equal(stableStringify({ b: 1, a: 2 }), stableStringify({ a: 2, b: 1 }));
});
