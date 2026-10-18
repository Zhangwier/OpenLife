/**
 * Content round 2026-10-18: big things made from real materials, the new
 * buildings and wild places, the four newcomers, hunting, and animal events.
 * Every check runs the real commands on a real village.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule, occupiedSpaceId, occupiedPlaceId } from "@openlife/module-world-space";
import { worldObjectsModule, ObjectRelations, prototypeOf } from "@openlife/module-world-objects";
import {
  settlementLocationsModule, SettlementCommands, homestead, RIVER_TERRACE_PACK, RIVER_TERRACE_RECIPES,
  validateSettlementPack, prototypeForResource, residentId,
} from "@openlife/module-settlement-locations";
import { STORY_PACK, BONDS_PACK } from "@openlife/module-village-stories";
import { withoutAgents } from "../helpers/agents.ts";

const NEW_PLACES = ["place:longhouse", "place:weaving-shed", "place:shrine", "place:market", "place:chestnut-wood", "place:stone-beach"];
const NEWCOMERS = ["weaver", "hunter", "shrine-keeper", "market-keeper", "longhouse-matron"];

function life(seed = 18) {
  const sim = new Simulation({ worldSeed: seed, modules: [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule, withoutAgents(settlementLocationsModule)] });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "启" } });
  assert.equal(sim.dispatch({ type: SettlementCommands.found }).ok, true);
  const id = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  const run = (type: string, payload: Record<string, unknown> = {}) => sim.dispatch({ type, actorId: id, source: "player", payload: payload as never });
  const must = (type: string, payload: Record<string, unknown> = {}) => {
    const r = run(type, payload); assert.equal(r.ok, true, `${type} ${JSON.stringify(payload)}: ${JSON.stringify(r.errors)}`); return r;
  };
  const held = (proto: string) => sim.worldView().listRelations({ type: ObjectRelations.heldBy, to: id })
    .map((r) => r.from).filter((o) => prototypeOf(sim.worldView(), o).prototypeId === proto);
  const go = (placeId: string, spaceId?: string) => {
    sim.advanceBy(1); // a fresh day for each errand
    if (occupiedPlaceId(sim.worldView(), id) !== placeId) must(SettlementCommands.arrive, { placeId });
    if (spaceId && occupiedSpaceId(sim.worldView(), id) !== spaceId) must("world-space.move_within", { spaceId });
  };
  return { sim, id, run, must, held, go };
}

test("the pack stays sound with the new content, and every new raw good gathers as its own object", () => {
  assert.deepEqual(validateSettlementPack(RIVER_TERRACE_PACK), []);
  for (const p of NEW_PLACES) assert.ok(RIVER_TERRACE_PACK.places.some((x) => x.id === p), p);
  const buildings = RIVER_TERRACE_PACK.places.filter((p) => ["place:longhouse", "place:weaving-shed", "place:shrine", "place:market"].includes(p.id));
  for (const b of buildings) assert.ok(b.spaces.length >= 3, `${b.name} has several rooms`);
  assert.equal(prototypeForResource("resource:wood"), "prototype:log");
  assert.equal(prototypeForResource("resource:stone"), "prototype:flint-stone");
  assert.equal(prototypeForResource("resource:chestnut"), "prototype:chestnut");
  const broken = { ...RIVER_TERRACE_PACK, rawPrototypes: { "resource:wood": "prototype:grain" } };
  assert.ok(validateSettlementPack(broken).some((p) => p.includes("carries resource:grain")));
});

test("the newcomers live in their new homes and appear in every story layer", () => {
  const { sim } = life();
  const world = sim.worldView();
  for (const key of NEWCOMERS) {
    const r = RIVER_TERRACE_PACK.residents.find((x) => x.key === key)!;
    assert.ok(world.hasEntity(residentId(key)), key);
    assert.ok(RIVER_TERRACE_PACK.people![key]!.heartEvents!.length >= 3);
    assert.ok(Object.keys(STORY_PACK.dialogues[key]!.nodes).length >= 3);
    assert.ok(BONDS_PACK.network.some((e) => e.a === key || e.b === key));
    assert.ok(BONDS_PACK.tierEvents.filter((e) => e.npc === key).length >= 2);
    assert.ok(RIVER_TERRACE_PACK.places.some((p) => p.id === r.workPlace));
  }
  // The longhouse already holds its big things: an urn in the loft, a smoking rack and a mortar by the fire.
  const inSpace = (space: string) => world.listRelations({ type: ObjectRelations.containedIn, to: space }).map((r) => prototypeOf(world, r.from).prototypeId);
  assert.ok(inSpace("space:longhouse-loft").includes("prototype:big-urn"));
  assert.ok(inSpace("space:longhouse-hall").includes("prototype:smoking-rack"));
  assert.ok(inSpace("space:longhouse-hall").includes("prototype:mortar"));
  assert.ok(inSpace("space:ford-landing").includes("prototype:dugout"));
});

test("a dugout from scratch: rope, a ground stone axe, three logs from the wood, hollowed at the ford", () => {
  const { sim, id, must, held, go } = life();
  sim.advanceBy(90 - sim.tick); // spring
  go("place:reedbed");
  must(SettlementCommands.draw, { placeId: "place:reedbed", resourceId: "resource:reed", amount: 1 });
  must(SettlementCommands.craft, { recipeId: "recipe:twist-rope" });
  go("place:stone-beach");
  must(SettlementCommands.draw, { placeId: "place:stone-beach", resourceId: "resource:stone", amount: 2 });
  assert.equal(held("prototype:flint-stone").length, 2, "flint gathers as flint, not grain");
  go("place:stone-beach", "space:knapping-shed");
  must(SettlementCommands.craft, { recipeId: "recipe:stone-axe" });
  assert.equal(held("prototype:stone-axe").length, 1);
  go("place:chestnut-wood");
  must(SettlementCommands.draw, { placeId: "place:chestnut-wood", resourceId: "resource:wood", amount: 3 });
  assert.equal(held("prototype:log").length, 3);
  go("place:ford", "space:ford-landing");
  must(SettlementCommands.craft, { recipeId: "recipe:dugout" });
  const world = sim.worldView();
  assert.equal(held("prototype:log").length, 0, "the logs went into the boat");
  assert.equal(held("prototype:stone-axe").length, 1, "the axe is kept");
  const boats = world.listRelations({ type: ObjectRelations.containedIn, to: "space:ford-landing" })
    .map((r) => r.from).filter((o) => prototypeOf(world, o).prototypeId === "prototype:dugout");
  assert.equal(boats.length, 2, "the new boat lies at the landing beside the old one");
  assert.ok(boats.some((b) => world.listRelations({ type: ObjectRelations.ownedBy, from: b })[0]?.to === id), "and it is yours");
});

test("hunting: a snare at the wood edge catches a hare, the longhouse fire smokes it, and smoked meat feeds you", () => {
  const { sim, must, run, held, go } = life();
  go("place:reedbed");
  must(SettlementCommands.draw, { placeId: "place:reedbed", resourceId: "resource:reed", amount: 2 });
  must(SettlementCommands.craft, { recipeId: "recipe:twist-rope" });
  must(SettlementCommands.craft, { recipeId: "recipe:twist-rope" });
  go("place:chestnut-wood");
  must(SettlementCommands.craft, { recipeId: "recipe:snare" });
  assert.equal(run(SettlementCommands.craft, { recipeId: "recipe:hunt-deer" }).ok, false, "deer need a bow and the old chestnut tree");
  must(SettlementCommands.craft, { recipeId: "recipe:snare-hare" });
  assert.equal(held("prototype:game").length, 1);
  go("place:reedbed");
  must(SettlementCommands.draw, { placeId: "place:reedbed", resourceId: "resource:fuel", amount: 1 });
  go("place:longhouse");
  must(SettlementCommands.craft, { recipeId: "recipe:smoked-meat" });
  assert.equal(held("prototype:smoked-meat").length, 2);
  const meat = held("prototype:smoked-meat")[0]!;
  sim.advanceBy(10);
  const ate = run(SettlementCommands.eat, { objectId: meat });
  assert.equal(ate.ok, true, JSON.stringify(ate.errors));
});

test("the wild places and buildings offer their own work, and the shrine keeps its own feast", () => {
  const { id, sim, go } = life();
  go("place:weaving-shed", "space:retting-pool");
  const acts = homestead(sim.worldView(), id).actions.map((a: { id: string; label?: string }) => a.label ?? a.id).join("|");
  assert.match(acts, /沤好的麻/);
  assert.ok(RIVER_TERRACE_PACK.happenings!.feasts.some((f) => f.placeId === "place:shrine"));
  assert.ok(RIVER_TERRACE_PACK.storyteller!.events.some((e) => Object.keys(e.yields ?? {}).some((k) => k.startsWith("place:chestnut-wood"))));
});

test("the recipe book's new big things all validate and name a real place", () => {
  const big = ["recipe:dugout", "recipe:big-urn", "recipe:loom", "recipe:mortar", "recipe:totem-pole", "recipe:smoking-rack", "recipe:stall-awning"];
  for (const id of big) {
    const r = RIVER_TERRACE_RECIPES.recipes.find((x) => x.id === id)!;
    assert.ok(r, id);
    const out = RIVER_TERRACE_PACK.prototypes.find((p) => p.id === r.outputs[0]!.prototypeId)!;
    assert.ok(out.mass >= 14 && !out.capabilities.includes("carryable"), `${out.name} is a big, standing thing`);
    // inputs plus a tool must fit in two hands and a back: four things, ten kilos
    const inputs = r.inputs.reduce((n, i) => n + i.count, 0) + (r.tools?.length ?? 0);
    const mass = r.inputs.reduce((m, i) => m + i.count * RIVER_TERRACE_PACK.prototypes.find((p) => p.id === i.prototypeId)!.mass, 0)
      + (r.tools ?? []).reduce((m, t) => m + RIVER_TERRACE_PACK.prototypes.find((p) => p.id === t)!.mass, 0);
    assert.ok(inputs <= 4 && mass <= 10, `${r.name} can be carried to the workplace (${inputs} things, ${mass} kg)`);
  }
  assert.ok(STORY_PACK.incidents.list.filter((i) => ["wolf-night", "boar-chestnut", "deer-field", "great-turtle", "shan-sao", "otter-pool"].includes(i.id)).length === 6);
});
