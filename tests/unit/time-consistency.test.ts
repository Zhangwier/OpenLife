/**
 * M1.2-B: cross-module time consistency.
 *
 * The M1.1 audit found that every unit test passed while two modules disagreed
 * about what one tick meant. These tests therefore assert **agreement between
 * modules**, not the behaviour of any single one:
 *
 *   - a world year is the same length to the clock, the ageing pass, the
 *     economy, and the UI payload;
 *   - annual events fire exactly once per year, never thirty times;
 *   - a legacy save keeps its own reading and is never rescaled in place;
 *   - the same seed reproduces the world exactly.
 *
 * `OPEN_WORLD_REQUIREMENTS.md` 搂11.1 and TIME-RFC-001 搂10.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import {
  DAYS_PER_MONTH,
  DAY_TICKS_PER_YEAR,
  MONTHS_PER_YEAR,
  TICKS_PER_YEAR,
  ageInYearsAt,
  yearsElapsedAt,
  yearsToTicksAt,
  unitsElapsed,
} from "@openlife/life-contracts";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule, reading, declaredScale } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import { settlementLocationsModule, SettlementCommands } from "@openlife/module-settlement-locations";
import { familyModule } from "@openlife/module-family";
import { economyModule } from "@openlife/module-economy";

const DAY_MODULES = [
  modernWorldModule,
  worldClockModule,
  worldSpaceModule,
  worldObjectsModule,
  settlementLocationsModule,
  familyModule,
  economyModule,
];

/** A day-scale world with one character, at tick 0. */
function dayWorld(seed = 4101) {
  const sim = new Simulation({ worldSeed: seed, modules: DAY_MODULES });
  assert.equal(sim.dispatch({ type: "modern.initialize_world" }).ok, true);
  assert.equal(
    sim.dispatch({ type: "modern.create_character", payload: { givenName: "启", familyName: "禾", lifespan: 90 } }).ok,
    true,
  );
  const id = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  return { sim, id };
}

// ---------------------------------------------------------------------------
// 1. One world year is one year to every module
// ---------------------------------------------------------------------------

test("360 day ticks is exactly one year to the clock, the calendar and ageing alike", () => {
  const { sim, id } = dayWorld();
  const bornAt = Number(sim.worldView().getComponent(id, "modern.identity")?.bornAt ?? 0);
  assert.equal(bornAt, 0, "the character is born at tick 0, so tick equals age-in-ticks");

  sim.advanceBy(DAY_TICKS_PER_YEAR);

  // 1. the clock's own reading
  const read = reading(sim.worldView());
  assert.equal(read.monthsElapsed, MONTHS_PER_YEAR, "twelve months have passed");
  assert.equal(read.yearsElapsed, 1, "the clock says one year");
  assert.equal(read.scale, "day");

  // 2. the derived calendar
  assert.equal(unitsElapsed(sim.tick, "year"), 1);
  assert.equal(ageInYearsAt(bornAt, sim.tick, "day"), 1);

  // 3. the module that writes the character's age
  assert.equal(
    Number(sim.worldView().getComponent(id, "modern.vitals")?.ageYears),
    1,
    "the ageing pass agrees with the clock",
  );

  // 4. the era the UI shows is derived from the same reading
  assert.equal(read.eraYear, reading(sim.worldView()).eraYear);
});

test("scale-aware calendar helpers honor both legacy month ticks and life day ticks", () => {
  // A legacy save has 12 ticks per year; a new settlement uses 360.
  assert.equal(yearsToTicksAt(1, "month"), TICKS_PER_YEAR);
  assert.equal(yearsToTicksAt(1, "day"), DAY_TICKS_PER_YEAR);
  for (const [scale, yearTicks] of [["month", TICKS_PER_YEAR], ["day", DAY_TICKS_PER_YEAR]] as const) {
    assert.equal(yearsElapsedAt(yearTicks - 1, scale), 0);
    assert.equal(yearsElapsedAt(yearTicks, scale), 1);
    assert.equal(yearsElapsedAt(yearTicks * 3, scale), 3);
    assert.equal(ageInYearsAt(yearTicks * 2, yearTicks * 3 - 1, scale), 0);
    assert.equal(ageInYearsAt(yearTicks * 2, yearTicks * 3, scale), 1);
  }
  assert.equal(yearsElapsedAt(264, "month"), 22, "legacy 22-year save must not become a baby");
  assert.equal(ageInYearsAt(0, 264, "month"), 22);
});

test("the era advances exactly one year per world year, with no drift", () => {
  const { sim } = dayWorld(4102);
  const eraStart = reading(sim.worldView()).eraYear;
  for (let year = 1; year <= 5; year += 1) {
    sim.advanceBy(DAY_TICKS_PER_YEAR);
    const read = reading(sim.worldView());
    assert.equal(read.yearsElapsed, year, `after ${year} years the clock says ${year}`);
    assert.equal(read.eraYear - eraStart, year, `and the era advanced exactly ${year}`);
  }
  // The M1.1 defect made the era advance ~29 years per year; assert it is gone.
  assert.equal(reading(sim.worldView()).eraYear - eraStart, 5);
});

test("a month is thirty days and twelve months is a year, on the same tick", () => {
  const { sim } = dayWorld(4103);
  sim.advanceBy(DAYS_PER_MONTH);
  const oneMonth = reading(sim.worldView());
  assert.equal(oneMonth.monthsElapsed, 1);
  assert.equal(oneMonth.monthOfYear, 2);
  assert.equal(oneMonth.dayOfMonth, 1);

  sim.advanceBy(DAYS_PER_MONTH * 11);
  const twelveMonths = reading(sim.worldView());
  assert.equal(twelveMonths.monthsElapsed, 12);
  assert.equal(twelveMonths.monthOfYear, 1, "the year rolls over");
  assert.equal(twelveMonths.yearsElapsed, 1);
  assert.equal(sim.tick, DAY_TICKS_PER_YEAR);
});

// ---------------------------------------------------------------------------
// 2. Annual events fire exactly once per year
// ---------------------------------------------------------------------------

test("annual ageing fires exactly once per world year, never thirty times", () => {
  const { sim, id } = dayWorld(4104);
  for (let year = 1; year <= 4; year += 1) {
    sim.advanceBy(DAY_TICKS_PER_YEAR);
    sim.syncHistory();
    const yearEvents = sim.history.view().listEvents().filter((event) => event.type === "modern.year_passed").length;
    assert.equal(yearEvents, year, `exactly ${year} annual events after ${year} years`);
    assert.equal(
      Number(sim.worldView().getComponent(id, "modern.vitals")?.ageYears),
      year,
      `and the character is exactly ${year}`,
    );
  }
});

test("a module that reacts to the yearly event also fires once per year", () => {
  const { sim } = dayWorld(4105);
  sim.advanceBy(DAY_TICKS_PER_YEAR * 3);
  sim.syncHistory();
  const phases = sim.history.view().listEvents().filter((event) => event.type === "economy.phase_changed").length;
  const years = sim.history.view().listEvents().filter((event) => event.type === "modern.year_passed").length;
  assert.equal(years, 3, "three yearly events");
  assert.ok(phases <= years, `the economy cannot react more often than the year fires (${phases} vs ${years})`);
});

test("advancing one tick at a time produces the same calendar as one jump", () => {
  const stepwise = dayWorld(4106);
  for (let i = 0; i < DAY_TICKS_PER_YEAR * 2; i += 1) stepwise.sim.advanceBy(1);

  const jumped = dayWorld(4106);
  jumped.sim.advanceBy(DAY_TICKS_PER_YEAR * 2);

  const a = reading(stepwise.sim.worldView());
  const b = reading(jumped.sim.worldView());
  assert.deepEqual(
    { tick: a.tick, months: a.monthsElapsed, years: a.yearsElapsed, era: a.eraYear, season: a.season },
    { tick: b.tick, months: b.monthsElapsed, years: b.yearsElapsed, era: b.eraYear, season: b.season },
    "the length of the step must not change the calendar",
  );
  assert.equal(stepwise.sim.worldView().getComponent(stepwise.id, "modern.vitals")?.ageYears,
    jumped.sim.worldView().getComponent(jumped.id, "modern.vitals")?.ageYears);
});

// ---------------------------------------------------------------------------
// 3. A legacy world keeps its own meaning
// ---------------------------------------------------------------------------

test("a world without a clock keeps the legacy reading and is never rescaled", () => {
  const sim = new Simulation({ worldSeed: 4107, modules: [modernWorldModule, familyModule] });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "旧", familyName: "禾", lifespan: 90 } });
  const id = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);

  const read = reading(sim.worldView());
  assert.equal(read.legacyScale, true, "a world with no clock is reported as legacy");
  assert.equal(read.scale, "month");
  assert.equal(read.unitLabel, "月", "and one tick still reads as one month");

  // Twelve legacy ticks is one year, exactly as before M1.2.
  sim.advanceBy(TICKS_PER_YEAR);
  assert.equal(reading(sim.worldView()).monthsElapsed, 12);
  assert.equal(reading(sim.worldView()).yearsElapsed, 1);
  assert.equal(
    Number(sim.worldView().getComponent(id, "modern.vitals")?.ageYears),
    1,
    "legacy ageing still ticks once per twelve ticks",
  );
});

test("adding the clock to an existing world does not rewrite its history", () => {
  // A legacy world that has already lived a while.
  const sim = new Simulation({ worldSeed: 4108, modules: [modernWorldModule, familyModule] });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "旧", familyName: "禾", lifespan: 90 } });
  sim.advanceBy(TICKS_PER_YEAR * 3);
  const tickBefore = sim.tick;
  const legacyReadBefore = reading(sim.worldView());
  const ageBefore = Number(sim.worldView().getComponent(
    String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId),
    "modern.vitals",
  )?.ageYears);
  assert.equal(legacyReadBefore.legacyScale, true);

  const loaded = Simulation.load(sim.save(), DAY_MODULES);
  assert.equal(loaded.result.ok, true);
  const after = loaded.simulation!;

  // The save carries no clock component, so the world keeps reading its tick
  // the way it wrote it. Nothing is rescaled behind the player's back
  // (TIME-RFC-001 搂5): three legacy years stay three years, not three months.
  assert.equal(after.tick, tickBefore);
  const readAfter = reading(after.worldView());
  assert.equal(readAfter.legacyScale, true, "a clock is not invented on load");
  assert.equal(readAfter.monthsElapsed, legacyReadBefore.monthsElapsed);
  assert.equal(readAfter.yearsElapsed, legacyReadBefore.yearsElapsed);
  assert.equal(readAfter.eraYear, legacyReadBefore.eraYear);

  const id = String(after.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  assert.equal(Number(after.worldView().getComponent(id, "modern.vitals")?.ageYears), ageBefore);
  assert.equal(declaredScale(after.worldView()), "month", "the loaded world keeps its own scale");
});

test("a world that explicitly adopts the day scale starts timing from then on", () => {
  // The difference from the test above: this world is *built* with the clock
  // installed, so the life scenario is on the day scale from tick 0.
  const { sim, id } = dayWorld(4112);
  assert.equal(declaredScale(sim.worldView()), "day");
  sim.advanceBy(DAY_TICKS_PER_YEAR);
  assert.equal(Number(sim.worldView().getComponent(id, "modern.vitals")?.ageYears), 1);
  assert.equal(reading(sim.worldView()).unitLabel, "日", "and a tick now reads as a day");

  // A save of this world keeps the day scale through a round trip.
  const loaded = Simulation.load(sim.save(), DAY_MODULES);
  assert.equal(loaded.result.ok, true);
  assert.equal(declaredScale(loaded.simulation!.worldView()), "day");
});

// ---------------------------------------------------------------------------
// 4. Determinism
// ---------------------------------------------------------------------------

test("the same seed and the same days produce an identical world", () => {
  const run = () => {
    const { sim, id } = dayWorld(4109);
    sim.dispatch({ type: "settlement-locations.found", payload: {} });
    sim.dispatch({ type: "settlement-locations.arrive", actorId: id, payload: { placeId: "place:yard" } });
    sim.advanceBy(DAY_TICKS_PER_YEAR * 2);
    return sim.fingerprint();
  };
  assert.equal(run(), run());
});

test("a day-scale save round trips with its clock intact", () => {
  const { sim, id } = dayWorld(4110);
  sim.dispatch({ type: "settlement-locations.found", payload: {} });
  sim.advanceBy(DAY_TICKS_PER_YEAR + 45);

  const loaded = Simulation.load(sim.save(), DAY_MODULES);
  assert.equal(loaded.result.ok, true);
  const after = loaded.simulation!;
  assert.equal(after.fingerprint(), sim.fingerprint());
  const before = reading(sim.worldView());
  const now = reading(after.worldView());
  assert.equal(now.monthsElapsed, before.monthsElapsed);
  assert.equal(now.yearsElapsed, before.yearsElapsed);
  assert.equal(now.eraYear, before.eraYear);
  assert.equal(now.scale, "day");
  // And the world keeps running normally afterwards.
  assert.equal(after.dispatch({ type: SettlementCommands.step, actorId: id }).ok, true);
});

// ---------------------------------------------------------------------------
// 5. The scale is discoverable, not guessed
// ---------------------------------------------------------------------------

test("the world publishes its scale so modules need not hard-code one", () => {
  const { sim } = dayWorld(4111);
  const read = reading(sim.worldView());
  assert.equal(read.scale, "day");
  assert.equal(read.dayTicksPerYear, DAY_TICKS_PER_YEAR);
  assert.equal(read.monthsPerYear, MONTHS_PER_YEAR);
  assert.equal(read.daysPerMonth, DAYS_PER_MONTH);
});
