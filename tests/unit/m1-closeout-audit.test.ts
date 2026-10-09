/**
 * M1.1 architectural closeout: the three risks that a green suite does NOT prove.
 *
 * `OPEN_WORLD_REQUIREMENTS.md` 搂11 requires that M1's time, space and object
 * layers keep a single authority each, because the project intends to simulate
 * from the Xia era through to the present. These tests exist to make the
 * current *actual* behaviour explicit and reproducible, including the parts that
 * are currently wrong, so a later fix has a baseline to move away from.
 *
 * Each test states which of the three states it asserts:
 *   PASS  - behaviour is correct and should not regress
 *   ISSUE - behaviour is wrong today; the assertion documents the defect
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import {
  DAYS_PER_MONTH,
  DAY_TICKS_PER_YEAR,
  TICKS_PER_YEAR,
  ageInYears,
  ageInYearsAt,
  formatYear,
  monthsElapsed,
  tickOfYear,
  unitsElapsed,
  yearOfTick,
} from "@openlife/life-contracts";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule, reading } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import { settlementLocationsModule, SettlementCommands } from "@openlife/module-settlement-locations";
import { worldGeographyModule } from "@openlife/module-world-geography";

const M1_MODULES = [
  modernWorldModule,
  worldClockModule,
  worldSpaceModule,
  worldObjectsModule,
  settlementLocationsModule,
];

/** A day-scale world with one character at tick 0. */
function dayWorld(seed: number) {
  const sim = new Simulation({ worldSeed: seed, modules: M1_MODULES });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "启", familyName: "禾", lifespan: 90 } });
  const id = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  return { sim, id };
}

/** The era year the world clock reports, which is what the UI shows. */
function eraOf(sim: Simulation): number {
  return reading(sim.worldView()).eraYear;
}

// ---------------------------------------------------------------------------
// 1. Time: PASS - the day scale itself is internally consistent
// ---------------------------------------------------------------------------

test("PASS: the day scale converts to month and year correctly at its own level", () => {
  assert.equal(DAYS_PER_MONTH, 30);
  assert.equal(DAY_TICKS_PER_YEAR, 360);
  assert.equal(TICKS_PER_YEAR, 12, "the month scale stays 12 so old modules keep their meaning");

  // 360 day ticks is exactly one year on the day scale.
  assert.equal(monthsElapsed(DAY_TICKS_PER_YEAR), 12);
  assert.equal(monthsElapsed(DAY_TICKS_PER_YEAR * 5), 60);
  assert.equal(Math.floor(monthsElapsed(DAY_TICKS_PER_YEAR * 3) / 12), 3);

  // The month scale remains derived from the same single tick, not a second clock.
  assert.equal(DAY_TICKS_PER_YEAR / DAYS_PER_MONTH, 12);
});

test("PASS: the clock module reports twelve months and one year after 360 day ticks", () => {
  const sim = new Simulation({ worldSeed: 3, modules: M1_MODULES });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.advanceBy(DAY_TICKS_PER_YEAR);
  const clock = sim.worldView().getComponent("modern:world", "world-clock.clock");
  assert.equal(Number(clock?.monthsElapsed), 12);
  assert.equal(Number(clock?.yearsElapsed), 1);
});

// ---------------------------------------------------------------------------
// 2. Time: FIXED in M1.2-B - scale is declared, not guessed
// ---------------------------------------------------------------------------

test("FIXED: era, age and season are read at the world's declared scale", () => {
  // M1.1 found `yearOfTick` and `ageInYears` dividing day ticks by the legacy
  // constant of twelve, so one real year read as thirty. M1.2-B made the world
  // declare its scale and gave consumers one reading to share. These helpers
  // still exist for month-scale callers; the point is that nothing in the day
  // scenario uses them any more.
  const oneYearOfDays = DAY_TICKS_PER_YEAR;

  // The scale-correct reading:
  assert.equal(unitsElapsed(oneYearOfDays, "year"), 1);
  assert.equal(ageInYearsAt(0, oneYearOfDays, "day"), 1);

  // The legacy helpers are still month-scale, and are documented as such. They
  // are no longer reachable from the day-scale paths.
  assert.equal(yearOfTick(oneYearOfDays) - yearOfTick(0), 30, "the month-scale helper keeps its old meaning");
  assert.equal(ageInYears(0, oneYearOfDays), 30);
});

test("FIXED: a day-scale world's era advances exactly one year per year", () => {
  const { sim, id } = dayWorld(4104);
  const eraStart = eraOf(sim);
  for (let year = 1; year <= 5; year += 1) {
    sim.advanceBy(DAY_TICKS_PER_YEAR);
    assert.equal(eraOf(sim) - eraStart, year, `the era advanced exactly ${year} year(s)`);
    assert.equal(
      Number(sim.worldView().getComponent(id, "modern.vitals")?.ageYears),
      year,
      `and the character is exactly ${year}`,
    );
  }
  // The M1.1 defect produced ~29 years of drift per year here.
  assert.equal(eraOf(sim) - eraStart, 5);
});

test("FIXED: the server and the clock now report the same year", () => {
  const { sim } = dayWorld(4105);
  sim.advanceBy(DAY_TICKS_PER_YEAR * 2);
  // `gameState()` derives `year`/`era` from this same reading, so the two
  // numbers a player sees in one payload cannot disagree.
  const read = reading(sim.worldView());
  assert.equal(read.eraYear, eraOf(sim));
  assert.equal(read.yearsElapsed, 2);
  assert.equal(read.scale, "day");
});

// ---------------------------------------------------------------------------
// 3. Space: ISSUE - two position layers, neither aware of the other
// ---------------------------------------------------------------------------

test("ISSUE: a person can hold two independent position facts with nothing reconciling them", () => {
  const sim = new Simulation({ worldSeed: 7, modules: [...M1_MODULES, worldGeographyModule] });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "启", familyName: "禾", lifespan: 90 } });
  const id = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  sim.dispatch({ type: "settlement-locations.found", payload: {} });

  sim.dispatch({ type: "world-geography.create_region", payload: { entityId: "R1", name: "Plain", regionType: "plain" } });
  sim.dispatch({ type: "world-geography.create_location", payload: { entityId: "L1", regionEntityId: "R1", name: "Terrace", locationType: "terrace" } });

  // The macro layer places the person at a Location...
  assert.equal(sim.dispatch({ type: "world-geography.place_entity", actorId: id, targetId: "L1" }).ok, true);
  assert.equal(sim.worldView().listRelations({ type: "world-geography.located_at", from: id }).length, 1);

  // ...while the micro layer still has them nowhere, and neither notices.
  assert.equal(sim.worldView().listRelations({ type: "world-space.occupies", from: id }).length, 0);
  assert.equal(sim.worldView().listRelations({ type: "world-space.standing_in", from: id }).length, 0);
});

test("PASS: within the micro layer a person has exactly one effective position", () => {
  const sim = new Simulation({ worldSeed: 7, modules: M1_MODULES });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "启", familyName: "禾", lifespan: 90 } });
  const id = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  sim.dispatch({ type: "settlement-locations.found", payload: {} });

  for (const placeId of ["place:yard", "place:river", "place:kiln", "place:yard"]) {
    sim.dispatch({ type: "settlement-locations.arrive", actorId: id, payload: { placeId } });
    assert.equal(sim.worldView().listRelations({ type: "world-space.occupies", from: id }).length, 1, placeId);
    assert.ok(sim.worldView().listRelations({ type: "world-space.standing_in", from: id }).length <= 1, placeId);
  }
});

test("ISSUE: settlement places are not bound to a macro geography Location", () => {
  const sim = new Simulation({ worldSeed: 7, modules: M1_MODULES });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "启", familyName: "禾", lifespan: 90 } });
  sim.dispatch({ type: "settlement-locations.found", payload: {} });

  // The settlement and its places carry a locationId *string* that is empty when
  // no map is installed, and no relation ties a place to a geography Location.
  const settlement = sim.worldView().getComponent("settlement-locations:settlement:river-terrace", "settlement-locations.settlement");
  assert.equal(String(settlement?.locationId ?? ""), "", "founded without a map, the settlement is anchored nowhere");

  for (const placeId of ["place:yard", "place:river", "place:kiln"]) {
    const place = sim.worldView().getComponent(placeId, "world-space.place");
    assert.equal(String(place?.locationId ?? ""), "", `${placeId} is not anchored to a map Location`);
  }
});

// ---------------------------------------------------------------------------
// 4. Relations: PASS on uniqueness, ISSUE on history and audit trail
// ---------------------------------------------------------------------------

test("PASS: cut and re-join keeps exactly one live relation and never accumulates", () => {
  const { sim, T } = relationWorld();
  for (let cycle = 1; cycle <= 3; cycle += 1) {
    sim.dispatch({ type: "world-geography.disconnect_locations", payload: { fromLocationId: "L1", toLocationId: "L2", reason: `cut ${cycle}` } });
    assert.equal(liveRows(sim, T), 0, `after cut ${cycle}`);
    assert.equal(liveRows(sim, T, true), 0, `the reverse direction is removed too, after cut ${cycle}`);
    sim.dispatch({ type: "world-geography.connect_locations", payload: { fromLocationId: "L1", toLocationId: "L2", distanceKm: 5, terrainCost: 1 } });
    assert.equal(liveRows(sim, T), 1, `after join ${cycle}`);
    assert.equal(liveRows(sim, T, true), 1, `exactly one row per direction, after join ${cycle}`);
  }
  // The whole pair counts two rows in total (one per direction), never more.
  // Only the direction the cut was issued from leaves an archived row, because
  // the reverse half is archived through the same shared primitive.
  assert.equal(allRows(sim, T), 1);
  assert.equal(allRows(sim, T, true), 1);
});

test("ISSUE: re-joining the same pair destroys the archived relation row", () => {
  const { sim, T } = relationWorld();
  sim.dispatch({ type: "world-geography.connect_locations", payload: { fromLocationId: "L1", toLocationId: "L2", distanceKm: 5, terrainCost: 1 } });
  sim.dispatch({ type: "world-geography.disconnect_locations", payload: { fromLocationId: "L1", toLocationId: "L2", reason: "cut 1" } });

  const archivedRows = sim
    .worldView()
    .listRelations({ type: T, from: "L1", to: "L2", includeArchived: true })
    .filter((relation) => relation.archivedAt !== undefined);
  assert.equal(archivedRows.length, 1, "the cut leaves one archived row");
  const archivedId = archivedRows[0]!.id;

  sim.dispatch({ type: "world-geography.connect_locations", payload: { fromLocationId: "L1", toLocationId: "L2", distanceKm: 5, terrainCost: 1 } });
  const afterRows = sim
    .worldView()
    .listRelations({ type: T, from: "L1", to: "L2", includeArchived: true });

  assert.equal(afterRows.length, 1, "only the new live row survives");
  assert.notEqual(afterRows[0]!.id, archivedId, "the archived row was replaced, not retained alongside");
  assert.equal(
    afterRows.filter((relation) => relation.archivedAt !== undefined).length,
    0,
    "the pair's archived row history does not accumulate",
  );
});

test("ISSUE: relation churn leaves no event trail, so the replacement is not auditable", () => {
  const { sim, T } = relationWorld();
  const before = sim.history.view().listEvents().length;
  const connect = sim.dispatch({ type: "world-geography.connect_locations", payload: { fromLocationId: "L1", toLocationId: "L2", distanceKm: 5, terrainCost: 1 } });
  sim.syncHistory();
  assert.equal(connect.ok, true);
  assert.equal(connect.eventIds.length, 0, "the connect command commits no event");

  // Geography's relation effects use announce:false, so a cut/join cycle is
  // invisible in both the relation row history and the event journal.
  const after = sim.history.view().listEvents().length;
  assert.equal(after, before, "no event records the relationship change");
  assert.ok(liveRows(sim, T) === 1, "even though the relationship really did change");
});

test("PASS: a cut/join cycle still survives save and load exactly", () => {
  const { sim, T } = relationWorld();
  for (let cycle = 1; cycle <= 3; cycle += 1) {
    sim.dispatch({ type: "world-geography.disconnect_locations", payload: { fromLocationId: "L1", toLocationId: "L2", reason: `cut ${cycle}` } });
    sim.dispatch({ type: "world-geography.connect_locations", payload: { fromLocationId: "L1", toLocationId: "L2", distanceKm: 5, terrainCost: 1 } });
  }
  const loaded = Simulation.load(sim.save(), [modernWorldModule, worldGeographyModule]);
  assert.equal(loaded.result.ok, true);
  assert.equal(loaded.simulation!.fingerprint(), sim.fingerprint());
  assert.equal(liveRows(loaded.simulation!, T), 1);
});

/** A world with two connected Locations, for the relation-cycle tests. */
function relationWorld() {
  const sim = new Simulation({ worldSeed: 11, modules: [modernWorldModule, worldGeographyModule] });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "world-geography.create_region", payload: { entityId: "R1", name: "R", regionType: "plain" } });
  sim.dispatch({ type: "world-geography.create_location", payload: { entityId: "L1", regionEntityId: "R1", name: "L", locationType: "terrace" } });
  sim.dispatch({ type: "world-geography.create_location", payload: { entityId: "L2", regionEntityId: "R1", name: "L2", locationType: "terrace" } });
  return { sim, T: "world-geography.adjacent_to" };
}

function liveRows(sim: Simulation, type: string, reverse = false): number {
  return reverse
    ? sim.worldView().listRelations({ type, from: "L2", to: "L1" }).length
    : sim.worldView().listRelations({ type, from: "L1", to: "L2" }).length;
}

function allRows(sim: Simulation, type: string, reverse = false): number {
  return reverse
    ? sim.worldView().listRelations({ type, from: "L2", to: "L1", includeArchived: true }).length
    : sim.worldView().listRelations({ type, from: "L1", to: "L2", includeArchived: true }).length;
}

// ---------------------------------------------------------------------------
// 5. Object custody: PASS - borrowing is not theft, and is not auto-granted
// ---------------------------------------------------------------------------

test("FIXED: world rules reject taking another household's property without permission", () => {
  const sim = new Simulation({ worldSeed: 21, modules: M1_MODULES });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "启", familyName: "禾", lifespan: 90 } });
  const id = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  sim.dispatch({ type: "settlement-locations.found", payload: {} });
  sim.dispatch({ type: "settlement-locations.arrive", actorId: id, payload: { placeId: "place:yard" } });

  const jar = "instance:jar:0:0";
  const owner = sim.worldView().listRelations({ type: "world-objects.owned_by", from: jar })[0]?.to;
  assert.ok(owner && owner !== id, "the jar belongs to another household");

  // All drivers (Web, AI, console, AutoSim) enter through this same rule.
  const beforeHolder = sim.worldView().listRelations({ type: "world-objects.held_by", from: jar })[0]?.to;
  const taken = sim.dispatch({ type: "world-objects.take", actorId: id, payload: { objectId: jar } });
  assert.equal(taken.ok, false, "taking without owner permission must be rejected");
  assert.equal(taken.errors[0]?.code, "E_OBJECT_NOT_YOURS");
  assert.equal(sim.worldView().listRelations({ type: "world-objects.held_by", from: jar })[0]?.to, beforeHolder);
  assert.equal(sim.worldView().listRelations({ type: "world-objects.owned_by", from: jar })[0]?.to, owner);
  assert.equal(sim.worldView().getComponent(jar, "world-objects.loan"), undefined, "rejected action does not invent a loan");
});

test("PASS: lending is a distinct owner-issued act that grants custody without ownership", () => {
  const sim = new Simulation({ worldSeed: 21, modules: M1_MODULES });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "启", familyName: "禾", lifespan: 90 } });
  const id = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  sim.dispatch({ type: "settlement-locations.found", payload: {} });
  sim.dispatch({ type: "settlement-locations.arrive", actorId: id, payload: { placeId: "place:yard" } });

  const jar = "instance:jar:0:0";
  const owner = sim.worldView().listRelations({ type: "world-objects.owned_by", from: jar })[0]?.to as string;
  assert.ok(owner && owner !== id);

  // The owner may refuse to lend something already out.
  const lent = sim.dispatch({
    type: "world-objects.lend",
    actorId: owner,
    payload: { objectId: jar, borrowerId: id, dueAt: sim.tick + 60 },
  });
  assert.equal(lent.ok, true, lent.errors.map((error) => error.message).join("; "));
  assert.equal(sim.worldView().listRelations({ type: "world-objects.owned_by", from: jar })[0]?.to, owner, "ownership never moves");
  assert.equal(sim.worldView().listRelations({ type: "world-objects.held_by", from: jar })[0]?.to, id, "custody moves to the borrower");
  const loan = sim.worldView().getComponent(jar, "world-objects.loan");
  assert.equal(Number(loan?.active), 1, "the loan is recorded with a due date");
  assert.ok(Number(loan?.dueAt) > sim.tick);

  // A second lend on the same object is refused rather than silently duplicated.
  const again = sim.dispatch({
    type: "world-objects.lend",
    actorId: owner,
    payload: { objectId: jar, borrowerId: owner, dueAt: sim.tick + 60 },
  });
  assert.equal(again.ok, false);
  assert.equal(again.errors[0]?.code, "E_OBJECT_IN_USE");
});
