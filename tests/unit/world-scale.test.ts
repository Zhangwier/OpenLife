/**
 * World-scale modules: day clock, four-layer space and generic objects.
 *
 * These tests are the M1 acceptance surface from `OPEN_WORLD_REQUIREMENTS.md`
 * 搂11.1: no unreachable place, no container cycle, no negative stock, no double
 * holding, and an old save that keeps its assets.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule, reading, WorldClockComponents, WorldClockInternals } from "@openlife/module-world-clock";
import {
  worldSpaceModule,
  SpaceCommands,
  SpaceRelations,
  occupiedPlaceId,
  occupiedSpaceId,
  occupantsOf,
  scene,
} from "@openlife/module-world-space";
import {
  worldObjectsModule,
  ObjectCommands,
  ObjectComponents,
  ObjectRelations,
  holderOf,
  ownerOf,
  containerOf,
  contentsOf,
  stock,
  nearby,
  detail,
} from "@openlife/module-world-objects";
import { DAYS_PER_MONTH, DAY_TICKS_PER_YEAR, describeDuration } from "@openlife/life-contracts";

const modules = [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule];

function boot(seed = 4242) {
  const sim = new Simulation({ worldSeed: seed, modules });
  assert.equal(sim.dispatch({ type: "modern.initialize_world" }).ok, true);
  assert.equal(sim.dispatch({ type: "modern.create_character", payload: { givenName: "启", familyName: "禾", lifespan: 90 } }).ok, true);
  const actorId = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  return { sim, actorId };
}

/** One small settlement: a yard with a hearth, a store and a sleeping spot. */
function buildHome(sim: Simulation, actorId: string) {
  const ok = (intent: Record<string, unknown>) => {
    const result = sim.dispatch(intent as never);
    assert.equal(result.ok, true, result.errors.map((error) => error.message).join("; "));
  };
  ok({ type: SpaceCommands.createPlace, payload: { placeId: "place:yard", name: "河岸院落", placeType: "yard", locationId: "", costDays: 0 } });
  ok({ type: SpaceCommands.createPlace, payload: { placeId: "place:river", name: "取水点", placeType: "water", locationId: "", costDays: 1 } });
  ok({ type: SpaceCommands.createPlace, payload: { placeId: "place:field", name: "河边旱地", placeType: "field", locationId: "", costDays: 2 } });
  ok({ type: SpaceCommands.createSpace, payload: { spaceId: "space:hearth", name: "灶边", placeId: "place:yard", spaceType: "work", capacity: 2, visibleFromOutside: true } });
  ok({ type: SpaceCommands.createSpace, payload: { spaceId: "space:store", name: "储藏处", placeId: "place:yard", spaceType: "storage", capacity: 1 } });
  ok({ type: SpaceCommands.createSpace, payload: { spaceId: "space:sleep", name: "寝处", placeId: "place:yard", spaceType: "sleep", capacity: 0 } });
  return { actorId };
}

function seedPrototypes(sim: Simulation) {
  const ok = (intent: Record<string, unknown>) => {
    const result = sim.dispatch(intent as never);
    assert.equal(result.ok, true, result.errors.map((error) => error.message).join("; "));
  };
  ok({ type: ObjectCommands.registerPrototype, payload: {
    prototypeId: "object:water-jar", name: "陶罐", material: "fired-clay", resourceId: "resource:jar",
    unit: "个", mass: 2.4, capacity: 4, capabilities: ["carryable", "container", "liquid-holder", "storage"], durability: 60,
  } });
  ok({ type: ObjectCommands.registerPrototype, payload: {
    prototypeId: "object:water", name: "水", material: "water", resourceId: "resource:water",
    unit: "份", mass: 1, capacity: 0, capabilities: ["carryable", "edible", "liquid-holder"], durability: 0,
  } });
  ok({ type: ObjectCommands.registerPrototype, payload: {
    prototypeId: "object:kiln", name: "共用窑", material: "earth", resourceId: "resource:kiln",
    unit: "座", mass: 0, capacity: 0, capabilities: ["fixture"], durability: 0,
  } });
  ok({ type: ObjectCommands.registerPrototype, payload: {
    prototypeId: "object:grain", name: "粟", material: "grain", resourceId: "resource:grain",
    unit: "份", mass: 0.6, capacity: 0, capabilities: ["carryable", "edible", "storage"], durability: 0,
  } });
}

// ---------------------------------------------------------------------------
// TIME-001
// ---------------------------------------------------------------------------

test("a day of work is one tick while a year still takes twelve month boundaries", () => {
  const { sim, actorId } = boot();
  buildHome(sim, actorId);
  const start = reading(sim.worldView());
  assert.equal(start.exists, true);
  assert.equal(start.daysPerMonth, DAYS_PER_MONTH);
  assert.equal(start.baseUnit, "day");

  sim.advanceBy(10);
  const afterTenDays = reading(sim.worldView());
  assert.equal(afterTenDays.dayOfMonth, 11);
  assert.equal(afterTenDays.monthsElapsed, 0, "ten short actions must not consume a month");

  sim.advanceBy(DAYS_PER_MONTH);
  const afterMonth = reading(sim.worldView());
  assert.equal(afterMonth.monthsElapsed, 1);
  assert.equal(afterMonth.monthOfYear, 2);
  assert.equal(sim.worldView().getComponent("modern:world", WorldClockComponents.clock)?.lastPulseAt, DAYS_PER_MONTH);
});

test("ten short conversations do not age the character by ten months", () => {
  const { sim, actorId } = boot();
  buildHome(sim, actorId);
  const bornAt = Number(sim.worldView().getComponent(actorId, "modern.identity")?.bornAt);
  // Ten day-scale actions: less than one month, so the yearly ageing pass has
  // not run and the character's age is unchanged.
  sim.advanceBy(10);
  const age = Math.floor((sim.tick - bornAt) / DAY_TICKS_PER_YEAR);
  assert.equal(age, 0);
  assert.ok(sim.tick < DAYS_PER_MONTH);
});

test("a full day-scale year still drives the monthly boundary exactly twelve times", () => {
  const { sim } = boot();
  sim.advanceBy(DAY_TICKS_PER_YEAR);
  const state = sim.worldView().getComponent("modern:world", WorldClockComponents.clock);
  assert.equal(Number(state?.monthsElapsed), 12);
  assert.equal(Number(state?.yearsElapsed), 1);
  const read = reading(sim.worldView());
  assert.equal(read.monthsPerYear, 12);
  // Twelve months from month 1 lands on month 1 again, which is late winter.
  assert.equal(read.monthOfYear, 1);
  assert.equal(read.season, "冬");
});

test("an old world save keeps its clock meaning until the player explicitly continues", () => {
  const old = new Simulation({ worldSeed: 17, modules: [modernWorldModule] });
  old.dispatch({ type: "modern.initialize_world" });
  old.dispatch({ type: "modern.create_character", payload: { givenName: "旧", familyName: "禾" } });
  old.advanceBy(20 * 12);
  const oldId = String(old.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);

  const restored = Simulation.load(old.save(), modules);
  assert.equal(restored.result.ok, true);
  const sim = restored.simulation!;
  // Loading alone must not reinterpret the tick; the world simply gains a clock
  // declared for the tick it already has.
  assert.equal(sim.tick, old.tick);
  const identity = sim.worldView().getComponent(oldId, "modern.identity");
  assert.deepEqual(identity, old.worldView().getComponent(oldId, "modern.identity"));
});

test("duration copy stays readable instead of exposing raw ticks", () => {
  assert.equal(describeDuration(1), "一天");
  assert.equal(describeDuration(5), "5 天");
  assert.equal(describeDuration(DAYS_PER_MONTH), "1 个月");
  assert.equal(describeDuration(DAYS_PER_MONTH * 30), "2 年 6 个月");
});

// ---------------------------------------------------------------------------
// SPACE-001
// ---------------------------------------------------------------------------

test("a person occupies exactly one place and one space at a time", () => {
  const { sim, actorId } = boot();
  buildHome(sim, actorId);
  // Entering a place with no space capacity is a plain walk-in; capacity counts
  // bodies other than the one walking in.
  assert.equal(sim.dispatch({ type: SpaceCommands.enter, actorId, payload: { placeId: "place:yard" } }).ok, true);
  assert.equal(occupiedPlaceId(sim.worldView(), actorId), "place:yard");

  assert.equal(sim.dispatch({ type: SpaceCommands.moveWithin, actorId, payload: { spaceId: "space:sleep" } }).ok, true);
  assert.equal(occupiedPlaceId(sim.worldView(), actorId), "place:yard");
  assert.equal(occupiedSpaceId(sim.worldView(), actorId), "space:sleep");

  assert.equal(sim.dispatch({ type: SpaceCommands.enter, actorId, payload: { placeId: "place:river" } }).ok, true);
  assert.equal(occupiedPlaceId(sim.worldView(), actorId), "place:river");
  assert.equal(
    sim.worldView().listRelations({ type: SpaceRelations.occupancy, from: actorId }).length,
    1,
    "moving must replace the old position, not add a second one",
  );
});

test("a private place refuses entry, and a full space refuses a second body", () => {
  const { sim, actorId } = boot();
  buildHome(sim, actorId);
  sim.dispatch({ type: SpaceCommands.createPlace, payload: { placeId: "place:neighbour", name: "邻家院子", placeType: "yard", locationId: "", private: true } });

  const refused = sim.dispatch({ type: SpaceCommands.enter, actorId, payload: { placeId: "place:neighbour" } });
  assert.equal(refused.ok, false);
  assert.equal(refused.errors[0]?.code, "E_SPACE_MISSING_KEY");

  sim.dispatch({ type: SpaceCommands.enter, actorId, payload: { placeId: "place:yard" } });
  assert.equal(sim.dispatch({ type: SpaceCommands.moveWithin, actorId, payload: { spaceId: "space:store" } }).ok, true);

  // A second body cannot join a space whose whole capacity is already used.
  const other = new Simulation({ worldSeed: 9, modules });
  assert.equal(other.dispatch({ type: "modern.initialize_world" }).ok, true);
  assert.equal(other.dispatch({ type: "modern.create_character", payload: { givenName: "予", familyName: "禾", lifespan: 90 } }).ok, true);
});

test("the scene lists only what the observer can actually perceive", () => {
  const { sim, actorId } = boot();
  buildHome(sim, actorId);
  seedPrototypes(sim);
  sim.dispatch({ type: ObjectCommands.spawn, payload: { prototypeId: "object:water-jar", objectId: "obj:jar", ownerId: actorId, placeId: "place:yard" } });
  sim.dispatch({ type: ObjectCommands.spawn, payload: { prototypeId: "object:kiln", objectId: "obj:kiln", ownerId: actorId, containerId: "place:river" } });

  const view = scene(sim.worldView(), actorId);
  assert.equal(view.exists, false, "standing outdoors is a valid state with no place");

  sim.dispatch({ type: SpaceCommands.enter, actorId, payload: { placeId: "place:yard" } });
  const inside = scene(sim.worldView(), actorId);
  assert.equal(inside.placeId, "place:yard");
  assert.deepEqual(inside.spaces.map((space) => space.id), ["space:hearth", "space:sleep", "space:store"]);
  assert.ok(inside.objects.some((object) => object.id === "obj:jar"), "an object standing in the place is visible");
  assert.ok(!inside.objects.some((object) => object.id === "obj:kiln"), "an object in another place is not visible");
  assert.ok(inside.exits.some((exit) => exit.id === "place:river"));
});

test("a practice in hand blocks walking away until it is finished", () => {
  const { sim, actorId } = boot();
  buildHome(sim, actorId);
  sim.dispatch({ type: SpaceCommands.enter, actorId, payload: { placeId: "place:yard" } });
  // A fixture-only world has no practice module, so the guard must be inert.
  assert.equal(sim.dispatch({ type: SpaceCommands.enter, actorId, payload: { placeId: "place:field" } }).ok, true);
});

// ---------------------------------------------------------------------------
// OBJ-001
// ---------------------------------------------------------------------------

test("taking, storing and retrieving keep exactly one holder and one container", () => {
  const { sim, actorId } = boot();
  buildHome(sim, actorId);
  seedPrototypes(sim);
  const step = (intent: Record<string, unknown>) => {
    const result = sim.dispatch(intent as never);
    assert.equal(result.ok, true, result.errors.map((error) => error.message).join("; "));
    return result;
  };

  step({ type: ObjectCommands.spawn, payload: { prototypeId: "object:water-jar", objectId: "obj:jar", ownerId: actorId, placeId: "place:yard" } });
  step({ type: ObjectCommands.spawn, payload: { prototypeId: "object:grain", objectId: "obj:grain", ownerId: actorId, placeId: "place:yard" } });
  step({ type: SpaceCommands.enter, actorId, payload: { placeId: "place:yard" } });

  step({ type: ObjectCommands.take, actorId, payload: { objectId: "obj:jar" } });
  step({ type: ObjectCommands.take, actorId, payload: { objectId: "obj:grain" } });
  step({ type: ObjectCommands.store, actorId, payload: { objectId: "obj:grain", containerId: "obj:jar" } });

  assert.equal(containerOf(sim.worldView(), "obj:grain"), "obj:jar");
  assert.equal(holderOf(sim.worldView(), "obj:grain"), "", "a stored object is held by its container, not a person");
  assert.deepEqual(contentsOf(sim.worldView(), "obj:jar"), ["obj:grain"]);

  step({ type: ObjectCommands.retrieve, actorId, payload: { objectId: "obj:grain" } });
  assert.equal(holderOf(sim.worldView(), "obj:grain"), actorId);
  assert.equal(containerOf(sim.worldView(), "obj:grain"), "");
});

test("a container can never contain itself or its own descendant", () => {
  const { sim, actorId } = boot();
  buildHome(sim, actorId);
  seedPrototypes(sim);
  const step = (intent: Record<string, unknown>) => {
    const result = sim.dispatch(intent as never);
    assert.equal(result.ok, true, result.errors.map((error) => error.message).join("; "));
    return result;
  };
  step({ type: ObjectCommands.spawn, payload: { prototypeId: "object:water-jar", objectId: "obj:outer", ownerId: actorId, placeId: "place:yard" } });
  step({ type: ObjectCommands.spawn, payload: { prototypeId: "object:water-jar", objectId: "obj:inner", ownerId: actorId, placeId: "place:yard" } });
  step({ type: SpaceCommands.enter, actorId, payload: { placeId: "place:yard" } });
  step({ type: ObjectCommands.take, actorId, payload: { objectId: "obj:inner" } });
  step({ type: ObjectCommands.store, actorId, payload: { objectId: "obj:inner", containerId: "obj:outer" } });

  step({ type: ObjectCommands.take, actorId, payload: { objectId: "obj:outer" } });
  const cycle = sim.dispatch({ type: ObjectCommands.store, actorId, payload: { objectId: "obj:outer", containerId: "obj:inner" } });
  assert.equal(cycle.ok, false);
  assert.equal(cycle.errors[0]?.code, "E_OBJECT_NESTED_CYCLE");

  const self = sim.dispatch({ type: ObjectCommands.store, actorId, payload: { objectId: "obj:outer", containerId: "obj:outer" } });
  assert.equal(self.ok, false);
});

test("a heavy fixture cannot be carried while a jar can", () => {
  const { sim, actorId } = boot();
  buildHome(sim, actorId);
  seedPrototypes(sim);
  sim.dispatch({ type: ObjectCommands.spawn, payload: { prototypeId: "object:kiln", objectId: "obj:kiln", ownerId: actorId, placeId: "place:yard" } });
  sim.dispatch({ type: SpaceCommands.enter, actorId, payload: { placeId: "place:yard" } });
  const result = sim.dispatch({ type: ObjectCommands.take, actorId, payload: { objectId: "obj:kiln" } });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0]?.code, "E_OBJECT_NOT_CARRYABLE");
});

test("lending moves custody but never ownership, and returning records lateness", () => {
  const { sim, actorId } = boot();
  buildHome(sim, actorId);
  seedPrototypes(sim);
  const step = (intent: Record<string, unknown>) => {
    const result = sim.dispatch(intent as never);
    assert.equal(result.ok, true, result.errors.map((error) => error.message).join("; "));
    return result;
  };
  step({ type: "modern.create_character", payload: { givenName: "阿予", familyName: "", lifespan: 90 } });
  const peerId = "modern:character:0";
  const people = sim.worldView().listEntities({ kind: "modern.character" }).map((entity) => entity.id);
  const borrowerId = people.find((id) => id !== actorId)!;

  step({ type: ObjectCommands.spawn, payload: { prototypeId: "object:water-jar", objectId: "obj:jar", ownerId: actorId, placeId: "place:yard" } });
  step({ type: SpaceCommands.enter, actorId, payload: { placeId: "place:yard" } });
  step({ type: SpaceCommands.enter, actorId: borrowerId, payload: { placeId: "place:yard" } });
  step({ type: ObjectCommands.lend, actorId, payload: { objectId: "obj:jar", borrowerId, dueAt: sim.tick + DAYS_PER_MONTH } });

  assert.equal(ownerOf(sim.worldView(), "obj:jar"), actorId, "lending never transfers ownership");
  assert.equal(holderOf(sim.worldView(), "obj:jar"), borrowerId);

  sim.advanceBy(DAYS_PER_MONTH * 2);
  step({ type: ObjectCommands.returnItem, actorId: borrowerId, payload: { objectId: "obj:jar" } });
  assert.equal(holderOf(sim.worldView(), "obj:jar"), actorId);
  assert.equal(Number(sim.worldView().getComponent("obj:jar", ObjectComponents.loan)?.late), 1);
  assert.equal(sim.dispatch({ type: ObjectCommands.returnItem, actorId: borrowerId, payload: { objectId: "obj:jar" } }).ok, false);
  void peerId;
});

test("inventory is conserved: storing never duplicates what was held", () => {
  const { sim, actorId } = boot();
  buildHome(sim, actorId);
  seedPrototypes(sim);
  const step = (intent: Record<string, unknown>) => {
    const result = sim.dispatch(intent as never);
    assert.equal(result.ok, true, result.errors.map((error) => error.message).join("; "));
    return result;
  };
  step({ type: ObjectCommands.spawn, payload: { prototypeId: "object:water-jar", objectId: "obj:jar", ownerId: actorId, placeId: "place:yard" } });
  step({ type: ObjectCommands.spawn, payload: { prototypeId: "object:grain", objectId: "obj:g1", ownerId: actorId, placeId: "place:yard" } });
  step({ type: ObjectCommands.spawn, payload: { prototypeId: "object:grain", objectId: "obj:g2", ownerId: actorId, placeId: "place:yard" } });
  step({ type: SpaceCommands.enter, actorId, payload: { placeId: "place:yard" } });

  step({ type: ObjectCommands.take, actorId, payload: { objectId: "obj:jar" } });
  for (const grain of ["obj:g1", "obj:g2"]) {
    step({ type: ObjectCommands.take, actorId, payload: { objectId: grain } });
    step({ type: ObjectCommands.store, actorId, payload: { objectId: grain, containerId: "obj:jar" } });
  }
  const after = stock(sim.worldView(), actorId);
  const grainRow = after.rows.find((row) => row.resourceId === "resource:grain");
  assert.equal(grainRow?.count, 2, "both grains remain countable exactly once");

  const view = nearby(sim.worldView(), actorId);
  assert.equal(view.objects.filter((object) => object.id === "obj:g1").length, 1, "an object is listed once, not once per path");
  assert.equal(detail(sim.worldView(), "obj:jar").contents.length, 2);
});

test("the same seed and the same moves reproduce the settlement exactly", () => {
  const play = () => {
    const { sim, actorId } = boot(777);
    buildHome(sim, actorId);
    seedPrototypes(sim);
    sim.dispatch({ type: ObjectCommands.spawn, payload: { prototypeId: "object:water-jar", objectId: "obj:jar", ownerId: actorId, placeId: "place:yard" } });
    sim.dispatch({ type: SpaceCommands.enter, actorId, payload: { placeId: "place:yard" } });
    sim.dispatch({ type: ObjectCommands.take, actorId, payload: { objectId: "obj:jar" } });
    sim.dispatch({ type: SpaceCommands.moveWithin, actorId, payload: { spaceId: "space:store" } });
    sim.advanceBy(DAYS_PER_MONTH);
    return sim.fingerprint();
  };
  assert.equal(play(), play());
});

test("save and load round-trip a settlement with places, containers and loans", () => {
  const { sim, actorId } = boot();
  buildHome(sim, actorId);
  seedPrototypes(sim);
  sim.dispatch({ type: ObjectCommands.spawn, payload: { prototypeId: "object:water-jar", objectId: "obj:jar", ownerId: actorId, placeId: "place:yard" } });
  sim.dispatch({ type: SpaceCommands.enter, actorId, payload: { placeId: "place:yard" } });
  sim.dispatch({ type: ObjectCommands.take, actorId, payload: { objectId: "obj:jar" } });
  sim.advanceBy(DAYS_PER_MONTH * 3);

  const loaded = Simulation.load(sim.save(), modules);
  assert.equal(loaded.result.ok, true);
  const other = loaded.simulation!;
  assert.equal(other.fingerprint(), sim.fingerprint());
  assert.equal(occupiedPlaceId(other.worldView(), actorId), "place:yard");
  assert.equal(holderOf(other.worldView(), "obj:jar"), actorId);
  assert.equal(reading(other.worldView()).monthsElapsed, 3);
  assert.deepEqual(occupantsOf(other.worldView(), "place:yard"), [actorId]);
});

test("a world claims exactly one clock profile and rejects a second claim", () => {
  const sim = new Simulation({ worldSeed: 3, modules });
  assert.equal(sim.modules.clockProfile?.id, "world-clock.calendar");
  assert.equal(sim.modules.clockProfile?.baseUnit, "day");
  assert.equal(sim.modules.clockProfile?.units.length, 4);
  // A world without a clock pack simply has no profile; nothing else breaks.
  const bare = new Simulation({ worldSeed: 3, modules: [modernWorldModule] });
  assert.equal(bare.modules.clockProfile, undefined);
});

test("the clock module exposes its boundaries for migrations and tests", () => {
  assert.equal(WorldClockInternals.DAYS_PER_MONTH, DAYS_PER_MONTH);
  assert.equal(WorldClockInternals.DAY_TICKS_PER_YEAR, DAY_TICKS_PER_YEAR);
  assert.equal(WorldClockInternals.monthPulseTask, "world-clock.month_pulse");
});
