/** Generic recipes: real inputs, a tool in hand or at the workplace, the right place, time spent. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule, ObjectRelations, prototypeOf } from "@openlife/module-world-objects";
import {
  settlementLocationsModule, SettlementCommands, homestead, dailyActivity, RIVER_TERRACE_PACK,
  validateSettlementPack, seasonOf, skyOn, roofState, ROOF_MAX, ROOF_LEAKS_AT, recipesHere,
} from "@openlife/module-settlement-locations";
import { withoutAgents } from "../helpers/agents.ts";

function life() {
  const sim = new Simulation({ worldSeed: 11, modules: [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule, withoutAgents(settlementLocationsModule)] });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "启" } });
  assert.equal(sim.dispatch({ type: SettlementCommands.found }).ok, true);
  const id = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  const run = (type: string, payload: Record<string, unknown> = {}) =>
    sim.dispatch({ type, actorId: id, source: "player", payload: payload as never });
  const must = (type: string, payload: Record<string, unknown> = {}) => {
    const r = run(type, payload); assert.equal(r.ok, true, `${type}: ${JSON.stringify(r.errors)}`); return r;
  };
  const held = (proto: string) => sim.worldView().listRelations({ type: ObjectRelations.heldBy, to: id })
    .map((r) => r.from).filter((o) => prototypeOf(sim.worldView(), o).prototypeId === proto);
  return { sim, id, run, must, held, view: () => homestead(sim.worldView(), id) };
}

test("the pack's recipes validate, and a broken recipe is reported", () => {
  assert.ok((RIVER_TERRACE_PACK.recipes ?? []).length >= 5);
  assert.deepEqual(validateSettlementPack(RIVER_TERRACE_PACK), []);
  const bad = { ...RIVER_TERRACE_PACK, recipes: [{ ...RIVER_TERRACE_PACK.recipes![0]!, spaceId: "space:nowhere", tool: "prototype:magic" }] };
  const problems = validateSettlementPack(bad);
  assert.ok(problems.some((p) => p.includes("unknown space")));
  assert.ok(problems.some((p) => p.includes("unknown tool")));
});

test("reed becomes rope, and reed + rope + a knife at the workplace become a basket left on site", () => {
  const { sim, id, run, must, held, view } = life();
  sim.advanceBy(90 - sim.tick); // spring: reed grows
  assert.equal(seasonOf(sim.tick), "春");
  must(SettlementCommands.arrive, { placeId: "place:reedbed" });
  const rope = view().actions.find((a: { id: string; payload: Record<string, unknown> }) => a.id === SettlementCommands.craft && a.payload.recipeId === "recipe:twist-rope");
  assert.ok(rope);
  assert.equal(rope!.enabled, false);
  assert.match(String(rope!.reason), /缺少1份自己的芦苇/);
  must(SettlementCommands.draw, { placeId: "place:reedbed", resourceId: "resource:reed", amount: 2 });
  const usedBefore = dailyActivity(sim.worldView(), id).used;
  must(SettlementCommands.craft, { recipeId: "recipe:twist-rope" });
  assert.equal(dailyActivity(sim.worldView(), id).used, usedBefore + 1, "the recipe's time is spent");
  assert.equal(held("prototype:rope").length, 1);
  assert.equal(held("prototype:reed-bundle").length, 1, "exactly one reed was used");
  const basket = run(SettlementCommands.craft, { recipeId: "recipe:grain-basket" });
  assert.equal(basket.ok, false, "three reeds are needed");
  sim.advanceBy(1);
  must(SettlementCommands.draw, { placeId: "place:reedbed", resourceId: "resource:reed", amount: 2 });
  must(SettlementCommands.craft, { recipeId: "recipe:grain-basket" });
  assert.equal(held("prototype:reed-bundle").length + held("prototype:rope").length, 0, "all inputs are gone");
  assert.equal(held("prototype:grain-basket").length, 1, "the basket can be carried home to store grain");
});

test("fishing needs a net and the right season; a fish can be roasted at the hearth", () => {
  const { sim, must, run, held, view } = life();
  must(SettlementCommands.arrive, { placeId: "place:river" });
  const atBank = view().actions.find((a: { id: string; payload: Record<string, unknown> }) => a.id === SettlementCommands.craft && a.payload.recipeId === "recipe:net-fish");
  if (seasonOf(sim.tick) === "冬") {
    assert.match(String(atBank?.reason ?? run(SettlementCommands.craft, { recipeId: "recipe:net-fish" }).errors[0]?.message), /冬天做不了|要到/);
    sim.advanceBy(90 - sim.tick);
  }
  const fish = run(SettlementCommands.craft, { recipeId: "recipe:net-fish" });
  if (!fish.ok) {
    // walk to the bank space first
    must("world-space.move_within", { spaceId: "space:bank" });
    must(SettlementCommands.craft, { recipeId: "recipe:net-fish" });
  }
  assert.equal(held("prototype:fish").length, 1, "the bank's own net caught a real fish");
  must(SettlementCommands.arrive, { placeId: "place:reedbed" });
  must(SettlementCommands.draw, { placeId: "place:reedbed", resourceId: "resource:fuel" });
  sim.advanceBy(1);
  must(SettlementCommands.arrive, { placeId: "place:hearth-yard" });
  if (!run(SettlementCommands.craft, { recipeId: "recipe:roast-fish" }).ok) {
    must("world-space.move_within", { spaceId: "space:hearth" });
    must(SettlementCommands.craft, { recipeId: "recipe:roast-fish" });
  }
  assert.equal(held("prototype:fish").length, 0);
  assert.equal(held("prototype:cooked-food").length, 1);
});

test("the wrong place is refused with where to go", () => {
  const { run } = life();
  const r = run(SettlementCommands.craft, { recipeId: "recipe:twist-rope" });
  assert.equal(r.ok, false);
  assert.match(r.errors[0]!.message, /要到/);
  assert.equal(run(SettlementCommands.craft, { recipeId: "recipe:nope" }).ok, false);
});

test("the older weaving commands now run their pack recipes and keep ids, provenance and events", () => {
  const { sim, must, held, view } = life();
  sim.advanceBy(90 - sim.tick);
  must(SettlementCommands.arrive, { placeId: "place:reedbed" });
  const listed = view().actions.filter((a: { id: string }) => a.id === SettlementCommands.prepareFiber || a.id === SettlementCommands.weaveMat);
  assert.equal(listed.length, 2, "listed from the recipes under their own commands");
  must(SettlementCommands.draw, { placeId: "place:reedbed", resourceId: "resource:reed", amount: 2 });
  const reeds = held("prototype:reed-bundle").sort();
  const r = must(SettlementCommands.prepareFiber);
  assert.equal(r.eventIds.length >= 1, true, "the fibre event is committed");
  const fibers = held("prototype:fiber-bundle").sort();
  assert.deepEqual(fibers, reeds.map((id) => `settlement-locations:processed-fiber:${id}`), "one fibre per reed, stable ids");
  must(SettlementCommands.weaveWrap);
  assert.equal(held("prototype:fiber-wrap")[0], `settlement-locations:fiber-wrap:${fibers[0]}`);
});

test("pottery: clay becomes greenware, dries overnight, and a dry day's kiln fires it into a jar", () => {
  const { sim, must, run, held } = life();
  const isWetDay = (d: number) => ["雨", "雪"].includes(skyOn(d));
  must(SettlementCommands.arrive, { placeId: "place:claypits" });
  must(SettlementCommands.draw, { placeId: "place:claypits", resourceId: "resource:clay", amount: 2 });
  must(SettlementCommands.arrive, { placeId: "place:yard" });
  must("world-space.move_within", { spaceId: "space:drying-rack" });
  must(SettlementCommands.craft, { recipeId: "recipe:shape-greenware" });
  assert.equal(held("prototype:greenware").length, 1);
  assert.equal(held("prototype:clay-batch").length, 0);
  // fuel for the kiln, then the next dry day
  sim.advanceBy(1);
  must(SettlementCommands.arrive, { placeId: "place:reedbed" });
  must(SettlementCommands.draw, { placeId: "place:reedbed", resourceId: "resource:fuel", amount: 2 });
  let d = sim.tick + 1; while (isWetDay(d)) d += 1;
  sim.advanceBy(d - sim.tick);
  must(SettlementCommands.arrive, { placeId: "place:kiln" });
  const fired = run(SettlementCommands.craft, { recipeId: "recipe:fire-jar" });
  assert.equal(fired.ok, true, JSON.stringify(fired.errors));
  assert.equal(held("prototype:small-jar").length, 1, "a real jar the villagers want");
  assert.equal(held("prototype:greenware").length + held("prototype:fuel-bundle").length, 0);
});

test("wet greenware cannot be fired the same day it was shaped", () => {
  const { must, run } = life();
  must(SettlementCommands.arrive, { placeId: "place:claypits" });
  must(SettlementCommands.draw, { placeId: "place:claypits", resourceId: "resource:clay", amount: 2 });
  must(SettlementCommands.arrive, { placeId: "place:yard" });
  must("world-space.move_within", { spaceId: "space:drying-rack" });
  must(SettlementCommands.craft, { recipeId: "recipe:shape-greenware" });
  const r = run(SettlementCommands.craft, { recipeId: "recipe:fire-bowl" });
  assert.equal(r.ok, false);
});

test("homes: rain and snow wear the roof down, a leaking roof spoils a wet night, mending restores it", () => {
  const { sim, id, must, run, held, view } = life();
  const st = () => roofState(sim.worldView(), "space:main-sleep");
  const go = (placeId: string) => { if (view().placeId !== placeId) must(SettlementCommands.arrive, { placeId }); };
  const wetToday = () => ["雨", "雪"].includes(skyOn(sim.tick));
  assert.equal(st().condition, ROOF_MAX);
  assert.equal(view().roof.condition, ROOF_MAX);
  // weave one's own mat in spring
  sim.advanceBy(90 - sim.tick);
  go("place:reedbed");
  must(SettlementCommands.draw, { placeId: "place:reedbed", resourceId: "resource:reed", amount: 2 });
  must("world-space.move_within", { spaceId: "space:reed-cut" });
  must(SettlementCommands.craft, { recipeId: "recipe:weave-mat" });
  while (!(st().leaking && wetToday())) sim.advanceBy(1);
  assert.ok(st().condition <= ROOF_LEAKS_AT);
  assert.equal(view().roof.leaking, true);
  go("place:yard");
  must("world-space.move_within", { spaceId: "space:main-sleep" });
  const matRest = view().actions.find((a: { id: string; payload: Record<string, unknown> }) => a.id === SettlementCommands.rest && a.payload.matId);
  assert.ok(matRest, "the household mat is at home");
  must(SettlementCommands.rest, matRest!.payload);
  sim.advanceBy(1);
  assert.equal(dailyActivity(sim.worldView(), id).capacity, 8, "soaked bedding: the mat gives no extra unit");
  must("world-objects.place", { objectId: matRest!.payload.matId, placeId: "place:yard" });
  // gather reed, rope and clay (reed only grows in spring–autumn)
  while (seasonOf(sim.tick) === "冬") sim.advanceBy(1);
  sim.advanceBy(1);
  go("place:reedbed");
  must(SettlementCommands.draw, { placeId: "place:reedbed", resourceId: "resource:reed", amount: 2 });
  must(SettlementCommands.craft, { recipeId: "recipe:twist-rope" });
  sim.advanceBy(1);
  go("place:reedbed");
  must(SettlementCommands.draw, { placeId: "place:reedbed", resourceId: "resource:reed", amount: 1 });
  go("place:claypits");
  must(SettlementCommands.draw, { placeId: "place:claypits", resourceId: "resource:clay", amount: 1 });
  sim.advanceBy(1);
  while (wetToday()) sim.advanceBy(1);
  go("place:yard");
  must("world-space.move_within", { spaceId: "space:main-sleep" });
  const mend = view().actions.find((a: { payload: Record<string, unknown> }) => a.payload.recipeId === "recipe:mend-roof");
  assert.ok(mend, "mending is offered at home");
  const r = run(SettlementCommands.craft, { recipeId: "recipe:mend-roof" });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(st().condition, ROOF_MAX);
  assert.equal(held("prototype:reed-bundle").length + held("prototype:rope").length + held("prototype:clay-batch").length, 0);
  assert.equal(run(SettlementCommands.craft, { recipeId: "recipe:mend-roof" }).ok, false, "a sound roof needs no mending");
});
