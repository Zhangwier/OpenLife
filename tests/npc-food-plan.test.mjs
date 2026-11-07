import test from "node:test";
import assert from "node:assert/strict";
import { chooseNpcIntent } from "../apps/card-world/npc-goals.js";

test("a hungry villager plans the observable chain from grain to a meal and honors seed reserves", async () => {
  const { planNpcFood } = await import("../apps/card-world/npc-goals.js");
  const view = { hunger: 8, granary: 4, reserve: 2, route: { stove: 10, granary: 12 } };
  assert.deepEqual(planNpcFood(view).steps, ["fetch", "cook", "eat"]);
  assert.equal(planNpcFood({ ...view, granary: 2 }), null);
  assert.equal(planNpcFood({ ...view, route: { stove: 10 } }), null);
});

test("a villager retries via another reachable source after their food plan fails", async () => {
  const { planNpcFood } = await import("../apps/card-world/npc-goals.js");
  const view = { hunger: 9, berries: 3, fish: 2, route: { stove: 10, berries: 8, lake: 12 } };
  assert.deepEqual(planNpcFood(view).steps, ["forage"]);
  assert.deepEqual(planNpcFood({ ...view, blocked: "forage" }).steps, ["fish", "give", "eat"]);
  assert.equal(planNpcFood({ ...view, blocked: "forage", fish: 0 }), null);
  assert.equal(chooseNpcIntent([]), null);
});

test("cooking can credit servings only if the required grain still exists", async () => {
  const { planProduction } = await import("../apps/card-world/production.js");
  const request = { kind: "cook", source: { stock: 2 }, credit: 3, use: ["grain"] };
  assert.equal(planProduction(request), null);
  const grain = { key: "grain" };
  assert.deepEqual(planProduction({ ...request, cards: [grain] }), { inputs: [grain], stock: { stock: 5 }, output: [] });
});
