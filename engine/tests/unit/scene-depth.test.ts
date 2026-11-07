import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore - plain browser module, no types
import { GROUND, coverPoint, depthScale, groundSpot } from "../../apps/web/public/scene-depth.js";

test("2.5D stage: farther is smaller, every place has ground for the player, villagers and things", () => {
  assert.ok(depthScale(.9) > depthScale(.6));
  assert.ok(depthScale(0) >= .55 && depthScale(1) <= 1.15);
  for (const [place, g] of Object.entries(GROUND) as [string, any][]) {
    assert.equal(g.actors.length, 4, place);
    for (const [u, v] of [g.avatar, ...g.actors, ...g.objects, ...g.yields]) {
      assert.ok(u > 0 && u < 1 && v > g.horizon - .1 && v < 1, `${place} spot inside painting ground`);
    }
  }
  assert.deepEqual(groundSpot("place:nowhere", "avatar"), GROUND["place:yard"].avatar);
});

test("2.5D stage: painting coordinates follow object-fit cover on narrow screens", () => {
  // Same aspect as the art: identity.
  const [x, y] = coverPoint([.5, .5], 1376, 768);
  assert.equal(Math.round(x), 50); assert.equal(Math.round(y), 50);
  // Phone portrait crops the sides: a point at 30% of the art moves left of the box edge.
  const [px] = coverPoint([.3, .5], 390, 300);
  assert.ok(px < 30);
});
