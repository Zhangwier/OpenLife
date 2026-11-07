import { test } from "node:test";
import assert from "node:assert/strict";
import { Scheduler } from "@openlife/kernel";

test("tasks drain in due-tick then insertion order", () => {
  const scheduler = new Scheduler();
  scheduler.schedule({ type: "demo.a", dueAt: 5 });
  scheduler.schedule({ type: "demo.b", dueAt: 5 });
  scheduler.schedule({ type: "demo.c", dueAt: 3 });
  assert.deepEqual(
    scheduler.peekDue(5).map((task) => task.type),
    ["demo.c", "demo.a", "demo.b"],
  );
});

test("dedupe keys prevent duplicate scheduling", () => {
  const scheduler = new Scheduler();
  assert.ok(scheduler.schedule({ type: "demo.a", dueAt: 1, dedupeKey: "once" }));
  assert.equal(scheduler.schedule({ type: "demo.a", dueAt: 2, dedupeKey: "once" }), undefined);
  assert.equal(scheduler.size, 1);
});

test("repeating tasks reschedule in place and stop at untilTick", () => {
  const scheduler = new Scheduler();
  const task = scheduler.schedule({
    type: "demo.repeat",
    dueAt: 10,
    everyTicks: 10,
    untilTick: 30,
  });
  assert.ok(task);
  scheduler.complete(task.id, 10);
  assert.equal(scheduler.list()[0]?.dueAt, 20);
  scheduler.complete(task.id, 20);
  assert.equal(scheduler.list()[0]?.dueAt, 30);
  scheduler.complete(task.id, 30);
  assert.equal(scheduler.size, 0);
});

test("one-shot tasks are removed and release their dedupe key", () => {
  const scheduler = new Scheduler();
  const task = scheduler.schedule({ type: "demo.a", dueAt: 1, dedupeKey: "k" });
  assert.ok(task);
  scheduler.complete(task.id, 1);
  assert.equal(scheduler.size, 0);
  assert.ok(scheduler.schedule({ type: "demo.a", dueAt: 5, dedupeKey: "k" }));
});

test("cancelling an owner removes its tasks", () => {
  const scheduler = new Scheduler();
  scheduler.schedule({ type: "demo.a", dueAt: 1, owner: "alpha" });
  scheduler.schedule({ type: "demo.b", dueAt: 1, owner: "beta" });
  assert.equal(scheduler.cancelOwner("alpha"), 1);
  assert.deepEqual(
    scheduler.list().map((task) => task.type),
    ["demo.b"],
  );
});

test("scheduler state round trips", () => {
  const scheduler = new Scheduler();
  scheduler.schedule({ type: "demo.a", dueAt: 4, payload: { x: 1 }, owner: "alpha" });
  scheduler.schedule({ type: "demo.b", dueAt: 9, everyTicks: 2, untilTick: 20 });
  const restored = Scheduler.deserialize(scheduler.serialize());
  assert.deepEqual(restored.list(), scheduler.list());
});
