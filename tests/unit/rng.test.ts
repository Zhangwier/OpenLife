import { test } from "node:test";
import assert from "node:assert/strict";
import { DeterministicRng, hashString } from "@openlife/kernel";

test("same seed produces the same sequence", () => {
  const a = new DeterministicRng(1234);
  const b = new DeterministicRng(1234);
  for (let index = 0; index < 100; index += 1) {
    assert.equal(a.nextUint32(), b.nextUint32());
  }
});

test("different seeds produce different sequences", () => {
  const a = new DeterministicRng(1);
  const b = new DeterministicRng(2);
  const drawsA = Array.from({ length: 20 }, () => a.nextUint32());
  const drawsB = Array.from({ length: 20 }, () => b.nextUint32());
  assert.notDeepEqual(drawsA, drawsB);
});

test("forked streams are stable regardless of call order", () => {
  const root = new DeterministicRng(99);
  const first = root.fork("alpha").nextUint32();
  const second = root.fork("beta").nextUint32();

  const other = new DeterministicRng(99);
  const secondFirst = other.fork("beta").nextUint32();
  const firstSecond = other.fork("alpha").nextUint32();

  assert.equal(first, firstSecond);
  assert.equal(second, secondFirst);
});

test("forked streams diverge from the parent and from each other", () => {
  const root = new DeterministicRng(7);
  const parentDraw = root.nextUint32();
  const childA = root.fork("a").nextUint32();
  const childB = root.fork("b").nextUint32();
  assert.notEqual(parentDraw, childA);
  assert.notEqual(childA, childB);
});

test("nextInt stays inside its range and covers it", () => {
  const rng = new DeterministicRng(5);
  const seen = new Set<number>();
  for (let index = 0; index < 500; index += 1) {
    const value = rng.nextInt(3, 8);
    assert.ok(value >= 3 && value < 8, `out of range: ${value}`);
    seen.add(value);
  }
  assert.deepEqual([...seen].sort(), [3, 4, 5, 6, 7]);
});

test("chance(0) is always false and chance(1) always true", () => {
  const rng = new DeterministicRng(11);
  for (let index = 0; index < 50; index += 1) {
    assert.equal(rng.chance(0), false);
    assert.equal(rng.chance(1), true);
  }
});

test("snapshot and restore resume the exact stream", () => {
  const rng = new DeterministicRng(31);
  rng.nextUint32();
  const state = rng.snapshot();
  const expected = [rng.nextUint32(), rng.nextUint32(), rng.nextUint32()];
  rng.restore(state);
  assert.deepEqual([rng.nextUint32(), rng.nextUint32(), rng.nextUint32()], expected);
});

test("hashString is stable and seed-from-string is reproducible", () => {
  assert.equal(hashString("openlife"), hashString("openlife"));
  assert.notEqual(hashString("openlife"), hashString("openlifef"));
  const a = DeterministicRng.fromSeed("world-seed");
  const b = DeterministicRng.fromSeed("world-seed");
  assert.equal(a.nextUint32(), b.nextUint32());
});
