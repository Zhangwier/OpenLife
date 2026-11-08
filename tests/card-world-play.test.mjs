import assert from "node:assert/strict";
import test from "node:test";
import { bundleLayout, dragRange, playerStride, walkEffort } from "../apps/card-world/board-play.js";
import { nextSourcePulse } from "../apps/card-world/resource-ecology.js";

test("walking stays responsive while exhausted, and costs little outside work", () => {
  assert.equal(playerStride(560, 560), 32);
  assert.equal(playerStride(56, 560), 16);
  assert.ok(walkEffort(600) < 0.5);
  assert.ok(walkEffort(600, true) > walkEffort(600));
});

test("identical supplies share a display slot without merging their identities", () => {
  const cards = [{ key: "you" }, ...Array.from({ length: 10 }, (_, id) => ({ id, key: "grain" })), { key: "axe", uses: 5 }];
  const groups = bundleLayout(cards, (card) => card.key === "grain");
  assert.deepEqual(groups.map(({ start, end }) => [start, end]), [[0, 1], [1, 11], [11, 12]]);
  assert.equal(groups[1].card.id, 0);
  assert.equal(cards.length, 12);
});

test("dragging the top of a mixed pile takes the pile; a lower bundle takes only itself", () => {
  const groups = [{ start: 0, end: 1 }, { start: 1, end: 3 }, { start: 3, end: 4 }];
  assert.deepEqual(dragRange(groups, 0, { allCarry: true, total: 4 }), { start: 0, end: 4, whole: true });
  assert.deepEqual(dragRange(groups, 1, { allCarry: true, total: 4 }), { start: 1, end: 3, whole: false });
  assert.deepEqual(dragRange(groups, 0, { person: true, allCarry: true, total: 4 }), { start: 0, end: 1, whole: false });
  assert.deepEqual(dragRange(groups, 0, { allCarry: false, total: 4 }), { start: 0, end: 1, whole: false });
  assert.deepEqual(dragRange([{ start: 0, end: 3 }], 0, { allCarry: true, total: 3 }), { start: 0, end: 3, whole: false });
});

test("resource clocks are staggered and continue on the next day", () => {
  const a = nextSourcePulse(360, 81), b = nextSourcePulse(360, 82);
  assert.notEqual(a, b);
  assert.ok(a > 360 && a < 1440);
  assert.equal(nextSourcePulse(a, 81), a + 1440);
});
