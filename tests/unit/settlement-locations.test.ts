/**
 * Settlement Locations: the M1 first loop and density targets.
 *
 * `OPEN_WORLD_REQUIREMENTS.md` MAP-001 asks for one habitable settlement with
 * 6+ outdoor work places, 8+ enterable life spaces, 12-16 residents with a home,
 * 30+ prototypes and 80+ placed instances. 搂11 asks for the first real loop to
 * reproduce from a clean baseline: walk in, take a container, fill it, put it
 * back.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule, reading } from "@openlife/module-world-clock";
import { worldSpaceModule, SpaceCommands, occupiedPlaceId, occupiedSpaceId, scene } from "@openlife/module-world-space";
import {
  worldObjectsModule,
  ObjectCommands,
  holderOf,
  containerOf,
  contentsOf,
  prototypeOf,
  readObject,
  ObjectComponents,
} from "@openlife/module-world-objects";
import {
  settlementLocationsModule,
  SettlementCommands,
  SettlementContent,
  SettlementProjections,
  SettlementId,
  residentId,
  carrying,
  people,
  worksites,
  homestead,
  dailyActivity,
} from "@openlife/module-settlement-locations";
import { DAYS_PER_MONTH } from "@openlife/life-contracts";

const modules = [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule];

function world(seed = 4242, locationId = "") {
  const sim = new Simulation({ worldSeed: seed, modules });
  assert.equal(sim.dispatch({ type: "modern.initialize_world" }).ok, true);
  assert.equal(sim.dispatch({ type: "modern.create_character", payload: { givenName: "启", familyName: "禾", lifespan: 90 } }).ok, true);
  const actorId = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  assert.equal(sim.dispatch({ type: SettlementCommands.found, payload: { locationId } }).ok, true);
  return { sim, actorId };
}

function must(sim: Simulation, intent: Record<string, unknown>) {
  const result = sim.dispatch(intent as never);
  assert.equal(result.ok, true, `${intent.type}: ${result.errors.map((error) => error.message).join("; ")}`);
  return result;
}

// ---------------------------------------------------------------------------
// Density (MAP-001)
// ---------------------------------------------------------------------------

test("the settlement meets the first-batch density targets", () => {
  const { sim } = world();
  const view = sim.worldView();
  assert.ok(SettlementContent.outdoorPlaces >= 6, "at least six connected outdoor activity places");
  assert.ok(SettlementContent.spaces >= 8, "at least eight enterable life spaces");
  assert.ok(SettlementContent.residents >= 12 && SettlementContent.residents <= 16, "12-16 NPCs with a household");
  assert.ok(SettlementContent.prototypes >= 30, "30+ operable object prototypes");
  assert.ok(SettlementContent.instances >= 80, "80+ placed instances");

  // Every resident really exists in the world, not just in the authoring list.
  const residentEntities = view
    .listEntities({ kind: "modern.character" })
    .filter((entity) => Boolean(entity.components["settlement-locations.resident"]));
  assert.equal(residentEntities.length, SettlementContent.residents);

  // Every instance has a position and an owner.
  for (const spec of sim.worldView().listEntities({ kind: "world-objects.item" })) {
    const contained = view
      .listRelations({ type: "world-objects.contained_in", from: spec.id })
      .map((relation) => relation.to);
    const owned = view.listRelations({ type: "world-objects.owned_by", from: spec.id });
    assert.equal(contained.length, 1, `${spec.id} must have exactly one position`);
    assert.equal(owned.length, 1, `${spec.id} must have exactly one owner`);
  }
});

test("each authored place has a purpose, an object and a person attached", () => {
  const { sim } = world();
  const { places } = worksites(sim.worldView());
  assert.equal(places.length, 8);
  for (const place of places) {
    assert.ok(place.purpose.length > 0, `${place.placeId} needs a purpose`);
    assert.ok(place.objects > 0, `${place.placeId} needs at least one object`);
  }
  const staff = people(sim.worldView()).residents;
  for (const place of places) {
    assert.ok(
      staff.some((resident) => resident.workPlace === place.placeId),
      `${place.placeId} needs someone whose work is there`,
    );
  }
});

test("residents are already somewhere when the player arrives, not idle at origen", () => {
  const { sim } = world();
  const staff = people(sim.worldView()).residents;
  assert.equal(staff.length, 14);
  for (const resident of staff) {
    assert.ok(resident.placeId, `${resident.id} must start the day somewhere`);
    assert.equal(resident.atWork ?? true, true);
  }
  assert.equal(people(sim.worldView()).households, 8);
});

// ---------------------------------------------------------------------------
// The first loop: walk in, take a container, fill it, put it back
// ---------------------------------------------------------------------------

test("the first loop reproduces from a clean baseline: walk in, take a jar, fill it, put it back", () => {
  const { sim, actorId } = world();
  const home = residentId("elder");

  // 1. Walk from nowhere into the settlement yard.
  must(sim, { type: SpaceCommands.enter, actorId, payload: { placeId: "place:yard" } });
  assert.equal(occupiedPlaceId(sim.worldView(), actorId), "place:yard");

  // 2. The scene shows what is actually here.
  const here = scene(sim.worldView(), actorId);
  assert.equal(here.placeId, "place:yard");
  assert.ok(here.spaces.length >= 3, "the yard has several rooms");

  // 3. Pick up the household jar from the main sleeping space.
  must(sim, { type: SpaceCommands.moveWithin, actorId, payload: { spaceId: "space:main-sleep" } });
  assert.equal(occupiedSpaceId(sim.worldView(), actorId), "space:main-sleep");

  // Find a jar that is standing in this room and belongs to someone here.
  const jar = sim.worldView()
    .listRelations({ type: "world-objects.contained_in", to: "space:main-sleep" })
    .map((relation) => relation.from)
    .find((id) => prototypeOf(sim.worldView(), id).capabilities.includes("liquid-holder"));
  assert.ok(jar, "a water jar must be reachable in the sleeping room");

  const owner = sim.worldView().listRelations({ type: "world-objects.owned_by", from: jar })[0]?.to;
  assert.equal(owner, home, "the jar belongs to the household that lives here");

  // 4. Take it. Carrying is custody; ownership is untouched.
  const borrowed = sim.dispatch({ type: ObjectCommands.lend, actorId: owner!, payload: { objectId: jar, borrowerId: actorId, dueAt: sim.tick + 2 * DAYS_PER_MONTH } });
  assert.equal(borrowed.ok, true, borrowed.errors.map((error) => error.message).join("; "));
  assert.equal(holderOf(sim.worldView(), jar), actorId);
  assert.equal(sim.worldView().listRelations({ type: "world-objects.owned_by", from: jar })[0]?.to, owner, "a loan must not move ownership");

  // 5. Carry it to the river and fill it.
  const before = reading(sim.worldView()).day;
  must(sim, { type: SpaceCommands.enter, actorId, payload: { placeId: "place:river" } });
  assert.equal(occupiedPlaceId(sim.worldView(), actorId), "place:river");

  const waterBefore = worksites(sim.worldView()).places
    .find((place) => place.placeId === "place:river")!
    .resources.find((resource) => resource.resourceId === "resource:water")!.stock;

  must(sim, { type: SettlementCommands.drink, actorId, payload: { containerId: jar, resourceId: "resource:water" } });

  const waterAfter = worksites(sim.worldView()).places
    .find((place) => place.placeId === "place:river")!
    .resources.find((resource) => resource.resourceId === "resource:water")!.stock;
  assert.ok(waterAfter < waterBefore, "the river must lose exactly what the jar gained");

  const inside = contentsOf(sim.worldView(), jar);
  assert.equal(inside.length, 1, "the jar now contains one water stack");
  const water = readObject(sim.worldView().getComponent(inside[0]!, ObjectComponents.object));
  assert.equal(water.quantity, waterBefore - waterAfter, "the jar's contents equal the river's loss");
  assert.equal(waterBefore - waterAfter, prototypeOf(sim.worldView(), jar).capacity);

  // 6. Carry it home and put it back in the room it came from.
  must(sim, { type: SpaceCommands.enter, actorId, payload: { placeId: "place:yard" } });
  must(sim, { type: SpaceCommands.moveWithin, actorId, payload: { spaceId: "space:main-sleep" } });
  must(sim, { type: ObjectCommands.place, actorId, payload: { objectId: jar, placeId: "place:yard" } });

  assert.equal(holderOf(sim.worldView(), jar), "", "putting it down leaves it held by nobody");
  assert.equal(containerOf(sim.worldView(), jar), "place:yard", "it is back in the yard");
  assert.equal(
    sim.worldView().listRelations({ type: "world-objects.owned_by", from: jar })[0]?.to,
    owner,
    "returning restores the household's hold",
  );

  // 7. Pay it back properly and record the return.
  must(sim, { type: ObjectCommands.returnItem, actorId, payload: { objectId: jar } });
  assert.equal(Number(sim.worldView().getComponent(jar, "world-objects.loan")?.active), 0);
  assert.equal(holderOf(sim.worldView(), jar), owner);

  // 8. Time moved by days, not months.
  assert.ok(reading(sim.worldView()).day > before || reading(sim.worldView()).day === before);
});

test("drawing water into a carried jar conserves stock across the pair", () => {
  const { sim, actorId } = world();
  must(sim, { type: SpaceCommands.enter, actorId, payload: { placeId: "place:river" } });

  const bank = worksites(sim.worldView()).places.find((place) => place.placeId === "place:river")!;
  const cache = bank.resources.find((resource) => resource.resourceId === "resource:water");
  assert.ok(cache);

  // Take water as loose units: the yield falls by the same count that appears
  // in the player's hands.
  const before = carrying(sim.worldView(), actorId).find((row) => row.resourceId === "resource:water")?.count ?? 0;
  const stockBefore = worksites(sim.worldView()).places
    .find((place) => place.placeId === "place:river")!
    .resources.find((resource) => resource.resourceId === "resource:water")!.stock;
  must(sim, { type: SettlementCommands.draw, actorId, payload: { resourceId: "resource:water", placeId: "place:river", amount: 3 } });

  const after = carrying(sim.worldView(), actorId).find((row) => row.resourceId === "resource:water")?.count ?? 0;
  const stockAfter = worksites(sim.worldView()).places
    .find((place) => place.placeId === "place:river")!
    .resources.find((resource) => resource.resourceId === "resource:water")!.stock;
  assert.equal(after - before, 3);
  assert.equal(stockBefore - stockAfter, 3);
});

test("a place cannot be drained below zero however often it is drawn", () => {
  const { sim, actorId } = world();
  const point = "resource:clay";
  const place = "place:claypits";
  must(sim, { type: SpaceCommands.enter, actorId, payload: { placeId: place } });
  const capacity = worksites(sim.worldView()).places
    .find((entry) => entry.placeId === place)!
    .resources.find((resource) => resource.resourceId === point)!.stock;

  let refusals = 0;
  for (let index = 0; index < capacity + 4; index += 1) {
    // Daily labour now has a cap: finish each working day before continuing
    // this multi-day resource exhaustion test; clay renews only every 20 days.
    if (dailyActivity(sim.worldView(), actorId).remaining < 2) sim.advanceBy(1);
    const result = sim.dispatch({ type: SettlementCommands.draw, actorId, payload: { resourceId: point, placeId: place, amount: 1 } });
    if (!result.ok) {
      refusals += 1;
      assert.equal(result.errors[0]?.code, "E_SETTLEMENT_EXHAUSTED");
    }
  }
  assert.equal(refusals, 4, "exactly the draws past the stock are refused");
  const remaining = worksites(sim.worldView()).places
    .find((entry) => entry.placeId === place)!
    .resources.find((resource) => resource.resourceId === point)!.stock;
  assert.ok(remaining >= 0, "an exhausted place must never go negative");
  assert.equal(remaining, 0, "drawing past the stock must stop at zero");
});

test("renewing resources come back only as fast as their own cycle allows", () => {
  const { sim, actorId } = world();
  must(sim, { type: SpaceCommands.enter, actorId, payload: { placeId: "place:reedbed" } });
  const read = () => worksites(sim.worldView()).places
    .find((entry) => entry.placeId === "place:reedbed")!
    .resources.find((resource) => resource.resourceId === "resource:fuel")!;

  const start = read().stock;
  must(sim, { type: SettlementCommands.draw, actorId, payload: { resourceId: "resource:fuel", placeId: "place:reedbed", amount: 5 } });
  assert.equal(read().stock, start - 5);

  // Twelve days is one renewal cycle for this place.
  sim.advanceBy(11);
  assert.equal(read().stock, start - 5, "fuel must not return before its cycle");
  sim.advanceBy(1);
  assert.equal(read().stock, start - 4, "one bundle returns after twelve days");
  sim.advanceBy(12 * 8);
  assert.equal(read().stock, start, "renewal is capped at the place's capacity");
});

test("drawing from a place you are not standing in is refused with a reason", () => {
  const { sim, actorId } = world();
  const result = sim.dispatch({ type: SettlementCommands.draw, actorId, payload: { resourceId: "resource:water", placeId: "place:river" } });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0]?.code, "E_SETTLEMENT_WRONG_PLACE");
});

test("eating consumes the shared stock and is recorded as a shared meal", () => {
  const { sim, actorId } = world();
  must(sim, { type: SpaceCommands.enter, actorId, payload: { placeId: "place:hearth-yard" } });
  const before = worksites(sim.worldView()).places
    .find((place) => place.placeId === "place:hearth-yard")!
    .resources.find((resource) => resource.resourceId === "resource:cooked")!.stock;
  assert.ok(before > 0);
  must(sim, { type: SettlementCommands.eat, actorId, payload: { resourceId: "resource:cooked", placeId: "place:hearth-yard" } });
  const after = worksites(sim.worldView()).places
    .find((place) => place.placeId === "place:hearth-yard")!
    .resources.find((resource) => resource.resourceId === "resource:cooked")!.stock;
  assert.equal(after, before - 1);
});

test("M2-A1: gathered grain and fuel become one real cooked ration at the hearth", () => {
  const { sim, actorId } = world(5221);
  const gather = (placeId: string, resourceId: string) => {
    must(sim, { type: SettlementCommands.arrive, actorId, payload: { placeId } });
    must(sim, { type: SettlementCommands.draw, actorId, payload: { resourceId, placeId, amount: 1 } });
  };
  gather("place:field", "resource:grain");
  gather("place:reedbed", "resource:fuel");

  const before = carrying(sim.worldView(), actorId);
  assert.equal(before.find((row) => row.resourceId === "resource:grain")?.count, 1);
  assert.equal(before.find((row) => row.resourceId === "resource:fuel")?.count, 1);
  // Cooking is not allowed across the map, even with ingredients in hand.
  const remote = sim.dispatch({ type: SettlementCommands.cook, actorId });
  assert.equal(remote.ok, false);
  assert.equal(remote.errors[0]?.code, "E_SETTLEMENT_WRONG_PLACE");

  must(sim, { type: SettlementCommands.arrive, actorId, payload: { placeId: "place:hearth-yard" } });
  const action = homestead(sim.worldView(), actorId).actions.find((a) => a.id === SettlementCommands.cook);
  assert.equal(action?.enabled, true, "Web action is available when inputs and location are valid");
  must(sim, { type: SettlementCommands.cook, actorId });

  const after = carrying(sim.worldView(), actorId);
  assert.equal(after.find((row) => row.resourceId === "resource:grain"), undefined);
  assert.equal(after.find((row) => row.resourceId === "resource:fuel"), undefined);
  assert.equal(after.find((row) => row.resourceId === "resource:cooked")?.count, 1);
  const cooked = sim.worldView().listRelations({ type: "world-objects.held_by", to: actorId })
    .map((relation) => relation.from)
    .find((id) => prototypeOf(sim.worldView(), id).resourceId === "resource:cooked")!;
  const provenance = readObject(sim.worldView().getComponent(cooked, ObjectComponents.object)).provenance;
  assert.ok(provenance.fromGrainId && provenance.fromFuelId, "inputs remain traceable");
  assert.ok(sim.worldView().getEntity(String(provenance.fromGrainId))?.archivedAt !== undefined);
  assert.ok(sim.worldView().getEntity(String(provenance.fromFuelId))?.archivedAt !== undefined);

  const repeat = sim.dispatch({ type: SettlementCommands.cook, actorId });
  assert.equal(repeat.ok, false, "no duplicate meal without new material");
  assert.equal(carrying(sim.worldView(), actorId).find((row) => row.resourceId === "resource:cooked")?.count, 1);
  const loaded = Simulation.load(sim.save(), modules);
  assert.equal(loaded.result.ok, true);
  assert.equal(loaded.simulation!.fingerprint(), sim.fingerprint());
});

test("M2-A1: same gathered ingredients and actions reproduce exactly", () => {
  const play = () => {
    const { sim, actorId } = world(5222);
    for (const [placeId, resourceId] of [
      ["place:field", "resource:grain"],
      ["place:reedbed", "resource:fuel"],
    ]) {
      must(sim, { type: SettlementCommands.arrive, actorId, payload: { placeId } });
      must(sim, { type: SettlementCommands.draw, actorId, payload: { resourceId, placeId, amount: 1 } });
    }
    must(sim, { type: SettlementCommands.arrive, actorId, payload: { placeId: "place:hearth-yard" } });
    must(sim, { type: SettlementCommands.cook, actorId });
    return sim.fingerprint();
  };
  assert.equal(play(), play());
});

test("M2-A2: a real carried ration is eaten and eases persistent hunger without touching shared meals", () => {
  const { sim, actorId } = world(5331);
  for (const [placeId, resourceId] of [
    ["place:field", "resource:grain"],
    ["place:reedbed", "resource:fuel"],
  ]) {
    must(sim, { type: SettlementCommands.arrive, actorId, payload: { placeId } });
    must(sim, { type: SettlementCommands.draw, actorId, payload: { resourceId, placeId, amount: 1 } });
  }
  must(sim, { type: SettlementCommands.arrive, actorId, payload: { placeId: "place:hearth-yard" } });
  must(sim, { type: SettlementCommands.cook, actorId });
  const cookedId = sim.worldView().listRelations({ type: "world-objects.held_by", to: actorId })
    .map((r) => r.from).find((id) => prototypeOf(sim.worldView(), id).resourceId === "resource:cooked")!;
  const sharedBefore = worksites(sim.worldView()).places
    .find((p) => p.placeId === "place:hearth-yard")!.resources
    .find((v) => v.resourceId === "resource:cooked")!.stock;

  sim.advanceBy(7);
  assert.equal(homestead(sim.worldView(), actorId).hunger, 7);
  assert.ok(homestead(sim.worldView(), actorId).actions.some((a) =>
    a.id === SettlementCommands.eat && a.payload.objectId === cookedId));
  const bad = sim.dispatch({ type: SettlementCommands.eat, actorId,
    payload: { objectId: "instance:hearth-grain", resourceId: "resource:cooked" } });
  assert.equal(bad.ok, false, "another person's food is not a free meal");
  assert.equal(bad.errors[0]?.code, "E_SETTLEMENT_NOT_YOURS");
  assert.equal(homestead(sim.worldView(), actorId).hunger, 7);

  must(sim, { type: SettlementCommands.eat, actorId, payload: { objectId: cookedId } });
  assert.equal(homestead(sim.worldView(), actorId).hunger, 3);
  assert.equal(sim.worldView().getEntity(cookedId)?.archivedAt !== undefined, true);
  assert.ok(!sim.worldView().listRelations({ type: "world-objects.held_by", to: actorId })
    .some((r) => r.from === cookedId), "food is no longer held");
  assert.equal(carrying(sim.worldView(), actorId).find((r) => r.resourceId === "resource:cooked"), undefined);
  assert.equal(worksites(sim.worldView()).places.find((p) => p.placeId === "place:hearth-yard")!
    .resources.find((v) => v.resourceId === "resource:cooked")!.stock, sharedBefore);
  assert.equal(sim.dispatch({ type: SettlementCommands.eat, actorId, payload: { objectId: cookedId } }).ok, false);
  sim.advanceBy(2);
  assert.equal(homestead(sim.worldView(), actorId).hunger, 5, "hunger rises as days pass");
  const loaded = Simulation.load(sim.save(), modules);
  assert.equal(loaded.result.ok, true);
  assert.equal(loaded.simulation!.fingerprint(), sim.fingerprint());
  assert.equal(homestead(loaded.simulation!.worldView(), actorId).hunger, 5);
});

test("M2-A2: shared meals still consume their own stock and also ease hunger", () => {
  const { sim, actorId } = world(5332);
  must(sim, { type: SpaceCommands.enter, actorId, payload: { placeId: "place:hearth-yard" } });
  sim.advanceBy(6);
  const before = worksites(sim.worldView()).places.find((p) => p.placeId === "place:hearth-yard")!
    .resources.find((v) => v.resourceId === "resource:cooked")!.stock;
  assert.equal(homestead(sim.worldView(), actorId).hunger, 6);
  must(sim, { type: SettlementCommands.eat, actorId, payload: { resourceId: "resource:cooked", placeId: "place:hearth-yard" } });
  assert.equal(homestead(sim.worldView(), actorId).hunger, 2);
  assert.equal(worksites(sim.worldView()).places.find((p) => p.placeId === "place:hearth-yard")!
    .resources.find((v) => v.resourceId === "resource:cooked")!.stock, before - 1);
});

test("M2-A3: sowing uses real grain, tending and time produce bounded harvest items", () => {
  const { sim, actorId } = world(5441);
  const fieldStock = () => worksites(sim.worldView()).places
    .find((p) => p.placeId === "place:field")!
    .resources.find((r) => r.resourceId === "resource:grain")!.stock;
  must(sim, { type: SettlementCommands.arrive, actorId, payload: { placeId: "place:field" } });
  assert.equal(homestead(sim.worldView(), actorId).crop?.phase, "fallow");
  const withoutSeed = sim.dispatch({ type: SettlementCommands.sow, actorId });
  assert.equal(withoutSeed.ok, false);
  assert.equal(withoutSeed.errors[0]?.code, "E_SETTLEMENT_EMPTY");
  must(sim, { type: SettlementCommands.draw, actorId,
    payload: { resourceId: "resource:grain", placeId: "place:field", amount: 1 } });
  const remaining = fieldStock();
  assert.equal(carrying(sim.worldView(), actorId).find((r) => r.resourceId === "resource:grain")?.count, 1);
  must(sim, { type: SettlementCommands.sow, actorId });
  assert.equal(carrying(sim.worldView(), actorId).find((r) => r.resourceId === "resource:grain"), undefined);
  assert.equal(homestead(sim.worldView(), actorId).crop?.phase, "growing");
  assert.equal(sim.dispatch({ type: SettlementCommands.sow, actorId }).ok, false, "cannot sow same plot twice");
  assert.equal(sim.dispatch({ type: SettlementCommands.harvest, actorId }).ok, false, "cannot harvest untended seed");
  must(sim, { type: SettlementCommands.tend, actorId, payload: { spaceId: "space:field-edge" } });
  assert.equal(homestead(sim.worldView(), actorId).crop?.tended, true);
  sim.advanceBy(29);
  assert.equal(sim.dispatch({ type: SettlementCommands.harvest, actorId }).ok, false, "cannot skip maturity");
  assert.equal(homestead(sim.worldView(), actorId).crop?.remainingDays, 1);
  sim.advanceBy(1);
  assert.equal(homestead(sim.worldView(), actorId).crop?.phase, "ready");
  assert.equal(fieldStock(), remaining, "finite initial seed stock does not magically regenerate");
  must(sim, { type: SettlementCommands.harvest, actorId });
  assert.equal(homestead(sim.worldView(), actorId).crop?.phase, "fallow");
  assert.equal(carrying(sim.worldView(), actorId).find((r) => r.resourceId === "resource:grain")?.count, 3);
  const produced = sim.worldView().listRelations({ type: "world-objects.held_by", to: actorId })
    .map((r) => r.from).filter((id) => prototypeOf(sim.worldView(), id).resourceId === "resource:grain");
  assert.equal(produced.length, 3);
  for (const objectId of produced) {
    assert.ok(readObject(sim.worldView().getComponent(objectId, ObjectComponents.object)).provenance.seedId);
  }
  assert.equal(sim.dispatch({ type: SettlementCommands.harvest, actorId }).ok, false, "cannot harvest twice");
  const loaded = Simulation.load(sim.save(), modules);
  assert.equal(loaded.result.ok, true);
  assert.equal(loaded.simulation!.fingerprint(), sim.fingerprint());
  assert.equal(homestead(loaded.simulation!.worldView(), actorId).crop?.phase, "fallow");
  must(loaded.simulation!, { type: SettlementCommands.sow, actorId });
  assert.equal(carrying(loaded.simulation!.worldView(), actorId).find((r) => r.resourceId === "resource:grain")?.count, 2,
    "a harvested grain can be replanted; next crop consumes another real seed");
});

test("M2-A3: field growth and harvest replay deterministically, old saves have a fallow field", () => {
  const run = () => {
    const { sim, actorId } = world(5442);
    const oldSave = sim.save();
    const reopened = Simulation.load(oldSave, modules);
    assert.equal(reopened.result.ok, true);
    const restored = reopened.simulation!;
    assert.equal(homestead(restored.worldView(), actorId).crop?.phase, undefined);
    must(restored, { type: SettlementCommands.arrive, actorId, payload: { placeId: "place:field" } });
    assert.equal(homestead(restored.worldView(), actorId).crop?.phase, "fallow");
    must(restored, { type: SettlementCommands.draw, actorId,
      payload: { resourceId: "resource:grain", placeId: "place:field" } });
    must(restored, { type: SettlementCommands.sow, actorId });
    must(restored, { type: SettlementCommands.tend, actorId, payload: { spaceId: "space:field-edge" } });
    restored.advanceBy(30);
    must(restored, { type: SettlementCommands.harvest, actorId });
    return restored.fingerprint();
  };
  assert.equal(run(), run());
});

test("M2-UX2-A: several meals, field work and rest share one world day and one atomic capacity", () => {
  const { sim, actorId } = world(5561);
  must(sim, { type: SettlementCommands.arrive, actorId, payload: { placeId: "place:field" } });
  const tick = sim.tick;
  const foodStock = () => worksites(sim.worldView()).places
    .find((p) => p.placeId === "place:field")!.resources
    .find((r) => r.resourceId === "resource:grain")!.stock;
  const firstStock = foodStock();
  assert.equal(dailyActivity(sim.worldView(), actorId).remaining, 8);
  must(sim, { type: SettlementCommands.eat, actorId, payload: { resourceId: "resource:grain", placeId: "place:field" } });
  assert.equal(dailyActivity(sim.worldView(), actorId).used, 1);
  must(sim, { type: SettlementCommands.tend, actorId, payload: { spaceId: "space:field-edge" } });
  must(sim, { type: SettlementCommands.eat, actorId, payload: { resourceId: "resource:grain", placeId: "place:field" } });
  must(sim, { type: SettlementCommands.rest, actorId, payload: { spaceId: "space:field-edge" } });
  assert.equal(sim.tick, tick, "all four real actions fit within one authoritative day");
  assert.equal(dailyActivity(sim.worldView(), actorId).used, 7);
  assert.equal(foodStock(), firstStock - 2, "two meals consume real inventory, not budget points");
  assert.equal(Number(sim.worldView().getComponent(actorId, "settlement-locations.holding")?.workCount), 1);
  assert.equal(Number(sim.worldView().getComponent(actorId, "settlement-locations.holding")?.lastRestedAt), tick);

  must(sim, { type: SettlementCommands.eat, actorId, payload: { resourceId: "resource:grain", placeId: "place:field" } });
  assert.equal(dailyActivity(sim.worldView(), actorId).remaining, 0);
  const stockBeforeFailedAction = foodStock();
  const failure = sim.dispatch({ type: SettlementCommands.eat, actorId,
    payload: { resourceId: "resource:grain", placeId: "place:field" } });
  assert.equal(failure.ok, false, "cannot consume a ninth activity point in the same day");
  assert.equal(failure.errors[0]?.code, "E_SETTLEMENT_EXHAUSTED");
  assert.equal(foodStock(), stockBeforeFailedAction, "failed action must not consume any grain");
  assert.equal(dailyActivity(sim.worldView(), actorId).used, 8);

  const saved = Simulation.load(sim.save(), modules);
  assert.equal(saved.result.ok, true);
  assert.equal(saved.simulation!.fingerprint(), sim.fingerprint(), "same-day capacity survives save and load");
  assert.equal(dailyActivity(saved.simulation!.worldView(), actorId).remaining, 0);
  saved.simulation!.advanceBy(1);
  assert.equal(dailyActivity(saved.simulation!.worldView(), actorId).remaining, 8, "new world day resets capacity");
  assert.equal(saved.simulation!.tick, tick + 1);
});

test("M2-UX2-A: failed business constraints spend no daily capacity", () => {
  const { sim, actorId } = world(5562);
  must(sim, { type: SettlementCommands.arrive, actorId, payload: { placeId: "place:field" } });
  const before = dailyActivity(sim.worldView(), actorId);
  const cannotCook = sim.dispatch({ type: SettlementCommands.cook, actorId });
  assert.equal(cannotCook.ok, false, "cooking still requires the hearth and ingredients");
  assert.deepEqual(dailyActivity(sim.worldView(), actorId), before);
  assert.equal(dailyActivity(sim.worldView(), actorId).used, 0);
  must(sim, { type: SettlementCommands.tend, actorId, payload: { spaceId: "space:field-edge" } });
  assert.equal(dailyActivity(sim.worldView(), actorId).used, 3);
  const noFood = sim.dispatch({ type: SettlementCommands.eat, actorId,
    payload: { resourceId: "resource:cooked", placeId: "place:field" } });
  assert.equal(noFood.ok, false);
  assert.equal(dailyActivity(sim.worldView(), actorId).used, 3);
});

test("M2-UX2-B: authorized daily plan commits each real step with its cursor and saves safely", () => {
  const { sim, actorId } = world(5661);
  must(sim, { type: SettlementCommands.arrive, actorId, payload: { placeId: "place:field" } });
  const invalid = sim.dispatch({ type: SettlementCommands.configurePlan, actorId,
    payload: { steps: ["magic"], enabled: true, repeat: true } });
  assert.equal(invalid.ok, false);
  assert.equal(homestead(sim.worldView(), actorId).dailyPlan.enabled, false);
  must(sim, { type: SettlementCommands.configurePlan, actorId,
    payload: { steps: ["eat", "tend", "rest"], enabled: true, repeat: true } });
  assert.equal(homestead(sim.worldView(), actorId).dailyPlan.revision, 1);
  const stock = () => worksites(sim.worldView()).places.find((p) => p.placeId === "place:field")!
    .resources.find((v) => v.resourceId === "resource:grain")!.stock;
  const firstStock = stock();
  const wrongOrder = sim.dispatch({ type: SettlementCommands.tend, actorId, source: "autosim",
    payload: { spaceId: "space:field-edge", planIndex: 0 } });
  assert.equal(wrongOrder.ok, false);
  assert.equal(dailyActivity(sim.worldView(), actorId).used, 0);
  const missingMarker = sim.dispatch({ type: SettlementCommands.eat, actorId, source: "autosim",
    payload: { resourceId: "resource:grain", placeId: "place:field" } });
  assert.equal(missingMarker.ok, false);
  assert.equal(stock(), firstStock);
  const tick = sim.tick;
  must(sim, { type: SettlementCommands.eat, actorId, source: "autosim",
    payload: { resourceId: "resource:grain", placeId: "place:field", planIndex: 0, planStep: "eat" } });
  assert.equal(homestead(sim.worldView(), actorId).dailyPlan.progressIndex, 1);
  assert.equal(stock(), firstStock - 1);
  must(sim, { type: SettlementCommands.tend, actorId, source: "autosim",
    payload: { spaceId: "space:field-edge", planIndex: 1, planStep: "tend" } });
  must(sim, { type: SettlementCommands.rest, actorId, source: "autosim",
    payload: { spaceId: "space:field-edge", planIndex: 2, planStep: "rest" } });
  assert.equal(sim.tick, tick);
  assert.equal(dailyActivity(sim.worldView(), actorId).used, 6);
  assert.equal(homestead(sim.worldView(), actorId).dailyPlan.progressIndex, 3);
  const restored = Simulation.load(sim.save(), modules);
  assert.equal(restored.result.ok, true);
  assert.equal(restored.simulation!.fingerprint(), sim.fingerprint());
  assert.equal(homestead(restored.simulation!.worldView(), actorId).dailyPlan.progressIndex, 3);
  restored.simulation!.advanceBy(1);
  assert.equal(homestead(restored.simulation!.worldView(), actorId).dailyPlan.progressIndex, 0);
  assert.equal(homestead(restored.simulation!.worldView(), actorId).dailyPlan.enabled, true);
  must(restored.simulation!, { type: SettlementCommands.configurePlan, actorId,
    payload: { steps: ["eat"], enabled: true, repeat: false } });
  must(restored.simulation!, { type: SettlementCommands.eat, actorId, source: "autosim",
    payload: { resourceId: "resource:grain", placeId: "place:field", planIndex: 0, planStep: "eat" } });
  assert.equal(homestead(restored.simulation!.worldView(), actorId).dailyPlan.enabled, false);
});

test("M2-UX2-C: local village walks use daily capacity, preserve the single clock and reject invalid paths", () => {
  const { sim, actorId } = world(5771);
  const outside = sim.dispatch({ type: SettlementCommands.arrive, actorId,
    payload: { placeId: "place:field", travelMode: "local" } });
  assert.equal(outside.ok, false, "local travel must start inside an authored village place");
  assert.equal(outside.errors[0]?.code, "E_SETTLEMENT_WRONG_PLACE");
  must(sim, { type: SettlementCommands.arrive, actorId, payload: { placeId: "place:yard" } });
  const startTick = sim.tick;
  const initial = dailyActivity(sim.worldView(), actorId);
  assert.equal(initial.remaining, 8);
  const unknown = sim.dispatch({ type: SettlementCommands.arrive, actorId,
    payload: { placeId: "place:field", travelMode: "instant" } });
  assert.equal(unknown.ok, false, "cannot invent a free travel mode");
  assert.equal(dailyActivity(sim.worldView(), actorId).used, 0);
  must(sim, { type: SettlementCommands.arrive, actorId,
    payload: { placeId: "place:field", travelMode: "local" } });
  assert.equal(homestead(sim.worldView(), actorId).placeId, "place:field");
  assert.equal(dailyActivity(sim.worldView(), actorId).used, 1);
  assert.equal(sim.tick, startTick, "a village walk does not advance the global day");
  must(sim, { type: SettlementCommands.tend, actorId, payload: { spaceId: "space:field-edge" } });
  must(sim, { type: SettlementCommands.arrive, actorId,
    payload: { placeId: "place:kiln", travelMode: "local" } });
  must(sim, { type: SettlementCommands.rest, actorId, payload: { spaceId: "space:kiln-mouth" } });
  assert.equal(homestead(sim.worldView(), actorId).placeId, "place:kiln");
  assert.equal(dailyActivity(sim.worldView(), actorId).used, 7);
  const loaded = Simulation.load(sim.save(), modules);
  assert.equal(loaded.result.ok, true);
  assert.equal(loaded.simulation!.fingerprint(), sim.fingerprint());
  assert.equal(dailyActivity(loaded.simulation!.worldView(), actorId).remaining, 1);
  must(loaded.simulation!, { type: SettlementCommands.arrive, actorId,
    payload: { placeId: "place:hearth-yard", travelMode: "local" } });
  assert.equal(dailyActivity(loaded.simulation!.worldView(), actorId).remaining, 0);
  const blocked = loaded.simulation!.dispatch({ type: SettlementCommands.arrive, actorId,
    payload: { placeId: "place:field", travelMode: "local" } });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.errors[0]?.code, "E_SETTLEMENT_EXHAUSTED");
  assert.equal(homestead(loaded.simulation!.worldView(), actorId).placeId, "place:hearth-yard");
  loaded.simulation!.advanceBy(1);
  assert.equal(dailyActivity(loaded.simulation!.worldView(), actorId).remaining, 8);
});

test("M2-UX2-C: ordered routine can walk to field, work and walk to kiln in one day", () => {
  const { sim, actorId } = world(5772);
  must(sim, { type: SettlementCommands.arrive, actorId, payload: { placeId: "place:hearth-yard" } });
  must(sim, { type: SettlementCommands.configurePlan, actorId, payload: {
    steps: ["eat", "go-field", "tend", "go-kiln", "rest"], enabled: true, repeat: true,
  } });
  const initialStock = worksites(sim.worldView()).places.find((p) => p.placeId === "place:hearth-yard")!
    .resources.find((v) => v.resourceId === "resource:cooked")!.stock;
  const startTick = sim.tick;
  const routine = [
    [SettlementCommands.eat, { resourceId: "resource:cooked", placeId: "place:hearth-yard", planIndex: 0, planStep: "eat" }],
    [SettlementCommands.arrive, { placeId: "place:field", travelMode: "local", planIndex: 1, planStep: "go-field" }],
    [SettlementCommands.tend, { spaceId: "space:field-edge", planIndex: 2, planStep: "tend" }],
    [SettlementCommands.arrive, { placeId: "place:kiln", travelMode: "local", planIndex: 3, planStep: "go-kiln" }],
    [SettlementCommands.rest, { spaceId: "space:kiln-mouth", planIndex: 4, planStep: "rest" }],
  ] as const;
  for (const [type, payload] of routine) {
    if (payload.planIndex === 1) {
      const wrongDestination = sim.dispatch({ type: SettlementCommands.arrive, actorId, source: "autosim",
        payload: { placeId: "place:kiln", travelMode: "local", planIndex: 1, planStep: "go-field" } });
      assert.equal(wrongDestination.ok, false, "a planned field walk cannot be redirected to the kiln");
      assert.equal(dailyActivity(sim.worldView(), actorId).used, 1, "rejected walk spends nothing");
    }
    must(sim, { type, actorId, source: "autosim", payload: { ...payload } });
  }
  assert.equal(sim.tick, startTick);
  assert.equal(dailyActivity(sim.worldView(), actorId).used, 8);
  assert.equal(homestead(sim.worldView(), actorId).dailyPlan.progressIndex, 5);
  assert.equal(homestead(sim.worldView(), actorId).placeId, "place:kiln");
  assert.equal(worksites(sim.worldView()).places.find((p) => p.placeId === "place:hearth-yard")!
    .resources.find((v) => v.resourceId === "resource:cooked")!.stock, initialStock - 1);
});

test("working at a worksite is only possible from that worksite", () => {
  const { sim, actorId } = world();
  must(sim, { type: SpaceCommands.enter, actorId, payload: { placeId: "place:kiln" } });
  const wrong = sim.dispatch({ type: SettlementCommands.tend, actorId, payload: { spaceId: "space:hearth" } });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.errors[0]?.code, "E_SETTLEMENT_WRONG_PLACE");
  must(sim, { type: SpaceCommands.moveWithin, actorId, payload: { spaceId: "space:kiln-mouth" } });
  must(sim, { type: SettlementCommands.tend, actorId, payload: { spaceId: "space:kiln-mouth" } });
  assert.equal(Number(sim.worldView().getComponent(actorId, "settlement-locations.holding")?.workCount), 1);
});

// ---------------------------------------------------------------------------
// Projections and determinism
// ---------------------------------------------------------------------------

test("the homestead projection offers at least three legal answers to one shortage", () => {
  const { sim, actorId } = world();
  must(sim, { type: SpaceCommands.enter, actorId, payload: { placeId: "place:yard" } });
  const view = homestead(sim.worldView(), actorId);
  assert.equal(view.exists, true);
  assert.equal(view.placeId, "place:yard");

  // SCENE-A's shape: a container shortage has more than one route.
  const routes = new Set<string>();
  if (view.exits.some((exit) => exit.placeId === "place:claypits")) routes.add("make-one");
  if (view.exits.some((exit) => exit.placeId === "place:kiln")) routes.add("fire-one");
  if (view.objects.some((object) => object.prototypeId === "prototype:water-jar")) routes.add("borrow-one");
  assert.ok(routes.size >= 2, "a shortage must have more than one answer");

  // Every refused action explains itself.
  for (const action of view.actions) {
    if (!action.enabled) assert.ok(action.reason.length > 0, `${action.id} must say why it is unavailable`);
    assert.ok(action.days >= 0);
  }
});

test("the settlement projection lists places with their remaining stock", () => {
  const { sim } = world();
  const view = sim.project({ id: SettlementProjections.worksites, params: {} });
  assert.equal(view.ok, true);
  const places = view.data.places as { placeId: string; resources: { stock: number }[] }[];
  assert.equal(places.length, 8);
  const totals = view.data.totals as { resourceId: string; stock: number; capacity: number }[];
  assert.ok(totals.some((row) => row.resourceId === "resource:water" && row.stock > 0));
});

test("the same seed and the same settlement actions reproduce the world", () => {
  const play = () => {
    const { sim, actorId } = world(1234);
    must(sim, { type: SpaceCommands.enter, actorId, payload: { placeId: "place:river" } });
    must(sim, { type: SettlementCommands.draw, actorId, payload: { resourceId: "resource:water", placeId: "place:river", amount: 2 } });
    must(sim, { type: SpaceCommands.enter, actorId, payload: { placeId: "place:yard" } });
    must(sim, { type: SpaceCommands.moveWithin, actorId, payload: { spaceId: "space:store" } });
    must(sim, { type: SettlementCommands.tend, actorId, payload: { spaceId: "space:store" } }).ok;
    sim.advanceBy(DAYS_PER_MONTH);
    return sim.fingerprint();
  };
  assert.equal(play(), play());
});

test("a settlement survives save and load with its places, stock and residents intact", () => {
  const { sim, actorId } = world();
  must(sim, { type: SpaceCommands.enter, actorId, payload: { placeId: "place:river" } });
  must(sim, { type: SettlementCommands.draw, actorId, payload: { resourceId: "resource:water", placeId: "place:river", amount: 2 } });
  sim.advanceBy(7);

  const loaded = Simulation.load(sim.save(), modules);
  assert.equal(loaded.result.ok, true);
  const other = loaded.simulation!;
  assert.equal(other.fingerprint(), sim.fingerprint());
  assert.ok(other.worldView().getEntity(SettlementId));
  assert.equal(occupiedPlaceId(other.worldView(), actorId), "place:river");
  assert.equal(people(other.worldView()).residents.length, 14);
  assert.deepEqual(
    worksites(other.worldView()).totals,
    worksites(sim.worldView()).totals,
  );
  assert.deepEqual(carrying(other.worldView(), actorId), carrying(sim.worldView(), actorId));
});

test("an old save from before the settlement gains one without losing its people", () => {
  const legacy = new Simulation({ worldSeed: 99, modules: [modernWorldModule] });
  legacy.dispatch({ type: "modern.initialize_world" });
  legacy.dispatch({ type: "modern.create_character", payload: { givenName: "旧", familyName: "禾" } });
  legacy.advanceBy(20 * 12);
  const legacyId = String(legacy.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);

  const restored = Simulation.load(legacy.save(), modules);
  assert.equal(restored.result.ok, true);
  const sim = restored.simulation!;
  assert.equal(sim.tick, legacy.tick);
  assert.deepEqual(
    sim.worldView().getComponent(legacyId, "modern.identity"),
    legacy.worldView().getComponent(legacyId, "modern.identity"),
  );

  // Founding the settlement afterwards must not disturb the existing life.
  must(sim, { type: SettlementCommands.found, payload: {} });
  assert.ok(sim.worldView().getEntity(SettlementId));
  assert.deepEqual(
    sim.worldView().getComponent(legacyId, "modern.identity"),
    legacy.worldView().getComponent(legacyId, "modern.identity"),
  );
  assert.equal(people(sim.worldView()).residents.length, 14);
});

test("founding refuses a second settlement and an unknown map location", () => {
  const { sim } = world();
  const again = sim.dispatch({ type: SettlementCommands.found, payload: {} });
  assert.equal(again.ok, false);
  assert.equal(again.errors[0]?.code, "E_SETTLEMENT_ALREADY");

  const fresh = new Simulation({ worldSeed: 5, modules });
  fresh.dispatch({ type: "modern.initialize_world" });
  fresh.dispatch({ type: "modern.create_character", payload: { givenName: "启", familyName: "禾" } });
  const bad = fresh.dispatch({ type: SettlementCommands.found, payload: { locationId: "no-such-place" } });
  assert.equal(bad.ok, false);
});

test("the M1 invariants hold under sustained mixed play, not just single steps", () => {
  // 搂11.1 asks for these failures to be covered; one clean step is not enough
  // evidence, so this drives a long randomised-but-deterministic walk through
  // every place while drawing whatever each one offers.
  const places = [
    "place:yard", "place:hearth-yard", "place:river", "place:field",
    "place:kiln", "place:claypits", "place:reedbed", "place:ford",
  ];
  const run = (sim: Simulation, id: string) => {
    // Enough steps to visit every place several times over, while staying fast
    // enough that the whole suite is not dominated by one test.
    for (let step = 0; step < 96; step += 1) {
      const placeId = places[(step * 7 + 3) % places.length]!;
      sim.dispatch({ type: SettlementCommands.arrive, actorId: id, payload: { placeId } });

      // Exactly one effective position, always.
      assert.equal(
        sim.worldView().listRelations({ type: "world-space.occupies", from: id }).length,
        1,
        `step ${step}: an actor must occupy exactly one place`,
      );
      assert.ok(
        sim.worldView().listRelations({ type: "world-space.standing_in", from: id }).length <= 1,
        `step ${step}: an actor must stand in at most one space`,
      );

      // Stock may never go negative, anywhere, at any point.
      const here = occupiedPlaceId(sim.worldView(), id);
      const site = worksites(sim.worldView()).places.find((place) => place.placeId === here)!;
      for (const resource of site.resources) {
        sim.dispatch({
          type: SettlementCommands.draw,
          actorId: id,
          payload: { resourceId: resource.resourceId, placeId: here, amount: 1 },
        });
      }
      for (const place of worksites(sim.worldView()).places) {
        for (const resource of place.resources) {
          assert.ok(resource.stock >= 0, `step ${step}: ${place.placeId}/${resource.resourceId} went negative`);
        }
      }
      if (step % 17 === 0) sim.advanceBy(1);
    }
  };

  const first = world(2026);
  run(first.sim, first.actorId);
  const second = world(2026);
  run(second.sim, second.actorId);
  assert.equal(second.sim.fingerprint(), first.sim.fingerprint(), "the same seed and choices must reproduce the world");

  // The world is still coherent enough to save and continue.
  assert.equal(first.sim.dispatch({ type: SettlementCommands.step, actorId: first.actorId }).ok, true);
  const reloaded = Simulation.load(first.sim.save(), modules);
  assert.equal(reloaded.result.ok, true);
  assert.equal(reloaded.simulation!.fingerprint(), first.sim.fingerprint());
});
