import assert from "node:assert/strict";
import test from "node:test";
import { THREAT, bestWeapon, stance, strengthAt } from "../apps/card-world/fight.js";
import { afloat, nearestWater, shoreAt, waterRoute } from "../apps/card-world/sailing.js";
import { mindful } from "../apps/card-world/knowledge.js";

test("who stands and fights: nerve, strength and what's in hand against the beast", () => {
  const young = { courage: 0.7, strength: strengthAt(25) }, old = { courage: 0.25, strength: strengthAt(66) };
  assert.equal(stance({ ...young, weapon: "spear", threat: THREAT.boar }), "fight");
  assert.equal(stance({ ...young, threat: THREAT.boar }), "fight", "a strong young man takes on a boar even bare-handed");
  assert.equal(stance({ ...old, threat: THREAT.boar }), "flee");
  assert.equal(stance({ ...young, threat: THREAT.tiger }), "flee");
  assert.equal(stance({ ...young, threat: THREAT.boar, hurt: 0.6 }), "flee", "badly hurt, even the brave get away");
  assert.equal(stance({ ...old, torch: true, threat: THREAT.bear }), "ward", "fire keeps a beast off");
  assert.equal(bestWeapon((k) => k === "knife" || k === "axe"), "axe");
  assert.equal(bestWeapon(() => false), "fist");
});

test("a boat goes round the land, never over it; ashore at the end", () => {
  // 10×6 grid: water (1) everywhere but a wall of land down column 4, open only at the bottom row
  const cols = 10, rows = 6, CELL = 40;
  const water = Uint8Array.from({ length: cols * rows }, (_, i) => (i % cols === 4 && Math.floor(i / cols) < 5 ? 0 : 1));
  water[2 * cols + 9] = 0;                                              // a bit of shore on the right
  const m = { cols, rows, water, ford: new Uint8Array(cols * rows), idx: (x, y) => Math.floor(y / CELL) * cols + Math.floor(x / CELL), X: (i) => ((i % cols) + 0.5) * CELL, Y: (i) => (Math.floor(i / cols) + 0.5) * CELL };
  const a = { x: 60, y: 60 }, b = { x: 300, y: 60 };
  const r = waterRoute(m, a, b);
  assert.ok(r && r.length > 1);
  assert.ok(r.some((p) => p.y > 4 * CELL), "it goes round by the bottom");
  assert.ok(r.every((p) => afloat(m, m.idx(p.x, p.y))));
  const land = { x: 9 * CELL + 20, y: 2 * CELL + 20 };
  const r2 = waterRoute(m, a, land);
  assert.deepEqual(r2.at(-1), land, "the last step is onto the shore");
  assert.ok(shoreAt(m, land, 1));
  assert.equal(nearestWater(m, m.idx(land.x, land.y), 0), -1);
});

test("people only puzzle over what their work brings them up against", () => {
  assert.equal(mindful("soil-tires", "farm"), true);
  assert.equal(mindful("soil-tires", "fish"), false);
  assert.equal(mindful("food-spoils", "cook"), true);
  assert.equal(mindful("cold-sick", "fish"), true);
});
