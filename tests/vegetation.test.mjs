import assert from "node:assert/strict";
import test from "node:test";
import { VEG, ageSapling, cellsToThin, edgeGrass, isMature, patches } from "../apps/card-world/vegetation.js";

// A 6×4 grid: wood (W) on the left two columns, grass (g) to the right.
const W = 5, g = 4, cols = 6, rows = 4;
const grid = () => Uint8Array.from({ length: cols * rows }, (_, i) => (i % cols < 2 ? W : g));

test("seed takes only on grass right at the wood's edge, and where nothing is in the way", () => {
  const edge = edgeGrass(grid(), cols, rows, W, g);
  assert.ok(edge.length > 0 && edge.every((i) => i % cols === 2), JSON.stringify(edge));
  assert.deepEqual(edgeGrass(grid(), cols, rows, W, g, (i) => i !== 8), edge.filter((i) => i !== 8));
});

test("a sapling grows a little each year and is wood after about four", () => {
  let s = { size: 0.3, age: 0 };
  for (let y = 0; y < VEG.mature - 1; y++) { s = ageSapling(s); assert.equal(isMature(s), false); }
  s = ageSapling(s);
  assert.equal(isMature(s), true);
  assert.ok(s.size > 0.9);
});

test("a hard-cut stand loses the wood along its edge first, a few cells at a time", () => {
  const thin = cellsToThin(grid(), cols, rows, W, g, { x: 60, y: 60 }, 200, 40, 3);
  assert.equal(thin.length, 3);
  assert.ok(thin.every((i) => i % cols === 1), "only the cells touching grass");
});

test("cells that touch make one patch", () => {
  const groups = patches([0, 1, 7, 20, 23], cols, rows);
  assert.equal(groups.length, 3);
  assert.ok(groups.some((p) => p.length === 3));
});
