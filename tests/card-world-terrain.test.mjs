import assert from "node:assert/strict";
import test from "node:test";
import { G, findPath, generateWorld, reachAlong, walkable } from "../apps/card-world/mapgen.js";
import { coastRaidRoute, raidLoot } from "../apps/card-world/coast-raid.js";
import { LAND, SITES } from "../apps/card-world/valley.js";

const cols = 10, rows = 10;
const map = () => ({ W: 400, H: 400, cols, rows, cls: new Uint8Array(cols * rows).fill(G.MEADOW),
  road: new Uint8Array(cols * rows), water: new Uint8Array(cols * rows),
  X: (i) => (i % cols) * 40 + 20, Y: (i) => Math.floor(i / cols) * 40 + 20,
  idx: (x, y) => Math.floor(y / 40) * cols + Math.floor(x / 40) });

test("straight movement reports the first real obstacle, not the ground behind it", () => {
  const land = map();
  const a = { x: 60, y: 140 }, b = { x: 300, y: 140 };
  land.cls[land.idx(260, 140)] = G.DEEP;
  land.blocks = [{ x: 150, y: 40, w: 14, h: 220 }];
  assert.equal(reachAlong(land, a, b).reason, "wall");
  land.blocks = [];
  assert.equal(reachAlong(land, a, b).reason, "water");
  land.cls[land.idx(260, 140)] = G.ROCK;
  assert.equal(reachAlong(land, a, b).reason, "cliff");
});

test("a walking route detours around a wall, and never ends on open water", () => {
  const land = map();
  land.blocks = [{ x: 150, y: 40, w: 14, h: 220 }];
  const a = { x: 60, y: 140 }, b = { x: 300, y: 140 };
  const path = findPath(land, a, b);
  assert.ok(path.length > 1);
  assert.deepEqual(path.at(-1), b);
  for (const [i, p] of path.entries()) assert.equal(reachAlong(land, i ? path[i - 1] : a, p).blocked, false);
  land.cls[land.idx(b.x, b.y)] = G.DEEP;
  assert.equal(findPath(land, a, b), null);
});

test("Black Reef raid boats approach by sea before following a land route to the granary", () => {
  for (const seed of [LAND.seed, 3, 42]) {
    const world = generateWorld(seed, LAND.tiles, SITES);
    const { x, y } = world.sites.stove;
    const { points, landing } = coastRaidRoute(world, { x: x + 90, y });
    assert.ok(points.slice(0, landing).every((point) => world.water[world.idx(point.x, point.y)] === 3));
    assert.ok(points.slice(landing).every((point) => walkable(world, point.x, point.y)));
    assert.ok(points.slice(landing + 1).every((point, i) => !reachAlong(world, points[landing + i], point).blocked));
  }
});

test("a raid can take at most three portions and leaves reserved seed in the granary", () => {
  assert.equal(raidLoot(12, 2), 3);
  assert.equal(raidLoot(3, 2), 1);
  assert.equal(raidLoot(1, 2), 0);
});
