/**
 * Data-driven crafting (settlement-locations.craft) and the recipe book that
 * feeds it: every recipe validates against the pack, a craft consumes exactly
 * the owned, held inputs, keeps tools, and hands the maker new objects.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule, ObjectRelations, holderOf, ownerOf, prototypeOf } from "@openlife/module-world-objects";
import {
  settlementLocationsModule,
  SettlementCommands,
  SettlementComponents,
  RIVER_TERRACE_PACK,
  RIVER_TERRACE_RECIPES,
  validateRecipeBook,
  craftOptions,
  CRAFTED_EVENT,
} from "@openlife/module-settlement-locations";
import { withoutAgents } from "../helpers/agents.ts";

const modules = [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule, withoutAgents(settlementLocationsModule)];

function world(seed = 4242) {
  const sim = new Simulation({ worldSeed: seed, modules });
  assert.equal(sim.dispatch({ type: "modern.initialize_world" }).ok, true);
  assert.equal(sim.dispatch({ type: "modern.create_character", payload: { givenName: "启", familyName: "禾", lifespan: 90 } }).ok, true);
  const actorId = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  assert.equal(sim.dispatch({ type: SettlementCommands.found, payload: { locationId: "" } }).ok, true);
  return { sim, actorId };
}

function must(sim: Simulation, type: string, actorId: string, payload: Record<string, unknown> = {}) {
  const result = sim.dispatch({ type, actorId, payload } as never);
  assert.equal(result.ok, true, `${type}: ${result.errors.map((e) => e.message).join("; ")}`);
  return result;
}

function held(sim: Simulation, actorId: string, prototypeId: string): string[] {
  const view = sim.worldView();
  return view.listRelations({ type: ObjectRelations.heldBy, to: actorId }).map((r) => r.from)
    .filter((id) => view.getEntity(id)?.archivedAt === undefined && prototypeOf(view, id).prototypeId === prototypeId);
}

test("the shipped recipe book validates against the River Terrace pack", () => {
  assert.deepEqual(validateRecipeBook(RIVER_TERRACE_RECIPES, RIVER_TERRACE_PACK), []);
  assert.ok(RIVER_TERRACE_RECIPES.recipes.length >= 8);
  const broken = structuredClone(RIVER_TERRACE_RECIPES);
  broken.recipes[0]!.inputs[0]!.prototypeId = "prototype:unobtainium";
  broken.recipes[1]!.spaceId = "space:nowhere";
  const problems = validateRecipeBook(broken, RIVER_TERRACE_PACK);
  assert.ok(problems.some((p) => p.includes("unobtainium")));
  assert.ok(problems.some((p) => p.includes("space:nowhere")));
});

test("every new item prototype is reachable: made by a recipe or seeded in the village", () => {
  const made = new Set(RIVER_TERRACE_RECIPES.recipes.flatMap((r) => r.outputs.map((o) => o.prototypeId)));
  const seeded = new Set(RIVER_TERRACE_PACK.instances.map((i) => i.prototypeId));
  for (const id of ["prototype:dried-fish", "prototype:millet-cake", "prototype:spindle-whorl", "prototype:clay-xun",
    "prototype:bone-hook", "prototype:hemp-cloth", "prototype:reed-screen", "prototype:salt-cake", "prototype:herb-bundle"]) {
    assert.ok(RIVER_TERRACE_PACK.prototypes.some((p) => p.id === id), `${id} is a prototype`);
    assert.ok(made.has(id) || seeded.has(id), `${id} can appear in the world`);
  }
});

test("crafting spindle whorls at the kiln consumes clay and fuel and hands over two whorls", () => {
  const { sim, actorId } = world();
  must(sim, SettlementCommands.arrive, actorId, { placeId: "place:claypits" });
  must(sim, SettlementCommands.draw, actorId, { placeId: "place:claypits", resourceId: "resource:clay" });
  // Wrong place is refused without spending anything.
  const early = sim.dispatch({ type: SettlementCommands.craft, actorId, payload: { recipeId: "recipe:spindle-whorl" } } as never);
  assert.equal(early.ok, false);
  must(sim, SettlementCommands.arrive, actorId, { placeId: "place:kiln" });
  must(sim, SettlementCommands.draw, actorId, { placeId: "place:kiln", resourceId: "resource:fuel" });
  const clay = held(sim, actorId, "prototype:clay-batch");
  const fuel = held(sim, actorId, "prototype:fuel-bundle");
  assert.equal(clay.length, 1);
  assert.equal(fuel.length, 1);
  assert.equal(craftOptions(sim.worldView(), actorId).find((o) => o.recipeId === "recipe:spindle-whorl")?.ready, true);

  const result = must(sim, SettlementCommands.craft, actorId, { recipeId: "recipe:spindle-whorl" });
  const view = sim.worldView();
  assert.notEqual(view.getEntity(clay[0]!)?.archivedAt, undefined, "clay was used up");
  assert.notEqual(view.getEntity(fuel[0]!)?.archivedAt, undefined, "fuel was used up");
  const whorls = held(sim, actorId, "prototype:spindle-whorl");
  assert.equal(whorls.length, 2);
  for (const id of whorls) {
    assert.equal(ownerOf(view, id), actorId);
    assert.equal(holderOf(view, id), actorId);
  }
  assert.ok(result.eventIds.length > 0, `${CRAFTED_EVENT} was recorded`);
});

test("a recipe that needs a tool is refused until the maker holds one", () => {
  const { sim, actorId } = world();
  must(sim, SettlementCommands.arrive, actorId, { placeId: "place:claypits" });
  must(sim, SettlementCommands.draw, actorId, { placeId: "place:claypits", resourceId: "resource:clay" });
  must(sim, SettlementCommands.arrive, actorId, { placeId: "place:kiln" });
  must(sim, SettlementCommands.draw, actorId, { placeId: "place:kiln", resourceId: "resource:fuel" });
  const refused = sim.dispatch({ type: SettlementCommands.craft, actorId, payload: { recipeId: "recipe:clay-xun" } } as never);
  assert.equal(refused.ok, false);
  assert.match(refused.errors[0]!.message, /骨针/);
  assert.equal(held(sim, actorId, "prototype:clay-batch").length, 1, "nothing was consumed by the refusal");
});

test("millet cakes are made at the hearth and can be eaten", () => {
  const { sim, actorId } = world();
  must(sim, SettlementCommands.arrive, actorId, { placeId: "place:field" });
  must(sim, SettlementCommands.draw, actorId, { placeId: "place:field", resourceId: "resource:grain", amount: 2 });
  must(sim, SettlementCommands.arrive, actorId, { placeId: "place:reedbed" });
  must(sim, SettlementCommands.draw, actorId, { placeId: "place:reedbed", resourceId: "resource:fuel" });
  must(sim, SettlementCommands.arrive, actorId, { placeId: "place:hearth-yard" });
  must(sim, SettlementCommands.craft, actorId, { recipeId: "recipe:millet-cake" });
  const cakes = held(sim, actorId, "prototype:millet-cake");
  assert.equal(cakes.length, 2);
  must(sim, SettlementCommands.step, actorId);
  const before = Number(sim.worldView().getComponent(actorId, SettlementComponents.resident)?.hunger ?? NaN);
  must(sim, SettlementCommands.eat, actorId, { objectId: cakes[0] });
  assert.notEqual(sim.worldView().getEntity(cakes[0]!)?.archivedAt, undefined, "the cake was eaten");
  const after = Number(sim.worldView().getComponent(actorId, SettlementComponents.resident)?.hunger ?? NaN);
  if (Number.isFinite(before) && Number.isFinite(after)) assert.ok(after <= before, "a cake eases hunger");
});
