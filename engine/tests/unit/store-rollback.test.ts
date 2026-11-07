/**
 * Transaction rollback uses an undo journal instead of deep-copying the world
 * on every transaction. A rollback must restore the exact previous state,
 * including relation order, and leave index lookups consistent.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { WorldStore } from "@openlife/world-model";

function seeded(): WorldStore {
  const store = new WorldStore();
  for (const id of ["a", "b", "c"]) store.createEntity({ id, kind: "thing", components: { "x.v": { n: 1 } }, createdAt: 0 });
  store.addRelation({ id: store.nextRelationId(), type: "held_by", from: "a", to: "b", components: {}, createdAt: 0 });
  store.addRelation({ id: store.nextRelationId(), type: "held_by", from: "c", to: "b", components: { "r.c": { k: 1 } }, createdAt: 0 });
  const r = store.addRelation({ id: store.nextRelationId(), type: "near", from: "a", to: "c", components: {}, createdAt: 0 });
  store.archiveRelation(r.id, 1, "moved");
  return store;
}

test("store rollback restores the exact snapshot after every kind of mutation", () => {
  const store = seeded();
  const before = store.fingerprint();
  const mark = store.checkpoint();
  store.createEntity({ id: store.nextEntityId("t"), kind: "thing", components: {}, createdAt: 2 });
  store.setComponent("a", "x.v", { n: 9 });
  store.setComponent("a", "x.new", { m: 1 });
  store.mergeComponent("b", "x.v", { extra: true });
  store.archiveEntity("c", 2, "gone");
  // Re-establish the archived relation: the archived record is replaced.
  store.addRelation({ id: store.nextRelationId(), type: "near", from: "a", to: "c", components: {}, createdAt: 2 });
  const held = store.listRelations({ type: "held_by", from: "c" })[0]!;
  store.mergeRelationComponent(held.id, "r.c", { k: 2 });
  store.archiveRelation(held.id, 2, "dropped");
  assert.notEqual(store.fingerprint(), before);
  store.rollback(mark);
  assert.equal(store.fingerprint(), before);
  assert.deepEqual(store.listRelations({ to: "b" }).map((r) => r.from), ["a", "c"]);
  assert.equal(store.listRelations({ type: "near", includeArchived: true }).length, 1);
  assert.equal(store.getRelation("near", "a", "c")?.archivedAt, 1);
  // Ids continue from the same sequence after a rollback.
  assert.equal(store.nextRelationId(), "rel:r4");
});

test("a committed checkpoint keeps changes, and indexed lookups match a full scan", () => {
  const store = seeded();
  const mark = store.checkpoint();
  store.addRelation({ id: store.nextRelationId(), type: "held_by", from: "b", to: "a", components: {}, createdAt: 3 });
  store.commit(mark);
  const all = store.listRelations({ includeArchived: true });
  for (const filter of [{ type: "held_by" }, { from: "a" }, { to: "b" }, { type: "held_by", to: "a" }, { from: "zzz" }]) {
    const expected = all.filter((r) => r.archivedAt === undefined && Object.entries(filter).every(([k, v]) => (r as unknown as Record<string, string>)[k] === v));
    assert.deepEqual(store.listRelations(filter).map((r) => r.id), expected.map((r) => r.id), JSON.stringify(filter));
  }
});
