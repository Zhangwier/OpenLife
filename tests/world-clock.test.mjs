import test from "node:test";
import assert from "node:assert/strict";

test("elapsed time settles every dawn once, identically at any input speed", async () => {
  const { advanceClock, dayAt } = await import("../apps/card-world/world-clock.js");
  const start = 1799.5;
  function simulate(targets) {
    const clock = { min: start };
    const dawns = [];
    let total = 0, previous = dayAt(start);
    for (const target of targets) advanceClock(clock, target, (elapsed) => {
      total += elapsed;
      if (dayAt(clock.min) !== previous) { previous = dayAt(clock.min); dawns.push(clock.min); }
    });
    return { dawns, total, end: clock.min };
  }
  const expected = { dawns: [1800, 3240, 4680], total: 2880.5, end: 4680 };
  assert.deepEqual(simulate([4680]), expected);
  assert.deepEqual(simulate([1800.1, 3239.999, 3240, 4000, 4680, 4680, 4670]), expected);
});

test("a sub-minute frame waits for the same minute boundary after a legacy fractional save", async () => {
  const { advanceClock } = await import("../apps/card-world/world-clock.js");
  const clock = { min: 359.75 }, steps = [];
  for (const target of [359.95, 360, 360.3, 361.1]) advanceClock(clock, target, (elapsed) => steps.push(elapsed));
  assert.deepEqual(steps, [0.25, 1]);
  assert.equal(clock.min, 361);
});

test("game RNG continues after save and keeps dialogue draws in a separate stream", async () => {
  const { createWorldRandom } = await import("../apps/card-world/world-clock.js");
  const random = createWorldRandom(3);
  const first = random.next("world");
  const saved = JSON.parse(JSON.stringify(random.snapshot()));
  random.next("voice");
  const second = random.next("world");
  const restored = createWorldRandom(3, saved);
  assert.equal(restored.next("world"), second);
  assert.equal(createWorldRandom(3).next("world"), first);
  assert.notEqual(createWorldRandom(4).next("world"), first);
});
