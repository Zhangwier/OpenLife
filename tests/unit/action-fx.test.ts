import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore - plain browser module, no types
import { fxKindFor, gainedObjects } from "../../apps/web/public/action-fx.js";

test("action animations: each action picks a fitting effect", () => {
  assert.equal(fxKindFor("settlement-locations.craft", { recipeId: "recipe:net-fish" }), "fish");
  assert.equal(fxKindFor("settlement-locations.craft", { recipeId: "recipe:fire-jar" }), "kiln");
  assert.equal(fxKindFor("settlement-locations.craft", { recipeId: "recipe:mend-roof" }), "build");
  assert.equal(fxKindFor("settlement-locations.craft", { recipeId: "recipe:twist-rope" }), "weave");
  assert.equal(fxKindFor("settlement-locations.tend", {}, { spaceId: "space:kiln-mouth" }), "kiln");
  assert.equal(fxKindFor("settlement-locations.draw", { resourceId: "resource:reed" }), "gather");
  assert.equal(fxKindFor("settlement-locations.rest", {}), "rest");
  assert.equal(fxKindFor("world-objects.place", {}), "");
});

test("action animations: only objects newly in hand fly to the bag", () => {
  const before = { objects: [{ id: "a", placement: "在手中" }, { id: "b", placement: "放着" }] };
  const after = { objects: [{ id: "a", placement: "在手中" }, { id: "b", placement: "在手中" }, { id: "c", placement: "在手中" }, { id: "d", placement: "放着" }] };
  assert.deepEqual(gainedObjects(before, after).map((o: { id: string }) => o.id), ["b", "c"]);
});
