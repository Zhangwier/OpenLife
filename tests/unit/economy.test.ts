import { test } from "node:test";
import assert from "node:assert/strict";
import { economyModule } from "@openlife/module-economy";
import { careerModule } from "@openlife/module-career";
import { modernWorldModule } from "@openlife/module-modern-world";
import { Simulation } from "@openlife/simulation";

function boot(seed: number): Simulation {
  const simulation = new Simulation({
    worldSeed: seed,
    modules: [modernWorldModule, economyModule],
  });
  const result = simulation.dispatch({ type: "modern.initialize_world" });
  assert.equal(result.ok, true);
  return simulation;
}

test("economy evolves as a module-owned world system and leaves public history", () => {
  const simulation = boot(7001);
  const initial = simulation.project({ id: "economy.overview", params: {} });
  assert.equal(initial.ok, true);
  assert.equal(initial.data?.phase, "steady");

  simulation.advanceBy(12 * 12);

  const current = simulation.project({ id: "economy.overview", params: {} });
  assert.equal(current.ok, true);
  assert.notEqual(current.data?.phase, undefined);

  const events = simulation.history
    .view()
    .listEvents()
    .filter((event) => event.type === "economy.phase_changed");
  assert.ok(events.length >= 2, "a twelve-year span should cross multiple economic phases");
  assert.ok(events.every((event) => event.owner === "economy"));
  assert.ok(
    simulation.history.listRecords().some((record) => record.type === "economy.phase_changed"),
    "major economic changes should enter world history",
  );
});

test("career income responds to the optional economic climate", () => {
  const simulation = new Simulation({
    worldSeed: 7003,
    modules: [modernWorldModule, economyModule, careerModule],
  });
  assert.equal(simulation.dispatch({ type: "modern.initialize_world" }).ok, true);
  assert.equal(simulation.dispatch({
    type: "modern.create_character",
    payload: {
      givenName: "Mara",
      familyName: "Vale",
      cityId: "modern:city:north",
      lifespan: 100,
      startingCash: 0,
    },
  }).ok, true);

  const actorId = String(
    simulation.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId,
  );

  for (let years = 0; years < 30; years += 1) {
    const economy = simulation.project({ id: "economy.overview", params: {} });
    const age = Number(simulation.worldView().getComponent(actorId, "modern.vitals")?.ageYears ?? 0);
    if (age >= 16 && economy.data?.phase === "expansion") break;
    simulation.advanceBy(12);
  }

  const economy = simulation.project({ id: "economy.overview", params: {} });
  assert.equal(economy.data?.phase, "expansion");
  const hired = simulation.dispatch({
    type: "career.get_job",
    actorId,
    payload: { occupation: "engineer", companyName: "Northport Works" },
  });
  assert.equal(hired.ok, true);

  const baseSalary = Number(
    simulation.worldView().getComponent(actorId, "career.employment")?.salary ?? 0,
  );
  const before = Number(simulation.worldView().getComponent(actorId, "modern.wealth")?.cash ?? 0);
  simulation.advanceBy(1);
  const after = Number(simulation.worldView().getComponent(actorId, "modern.wealth")?.cash ?? 0);

  assert.ok(after - before > baseSalary, "expansion should lift the next salary payment above base");
  const payment = simulation.history
    .view()
    .listEvents()
    .find((event) => event.type === "career.salary_paid" && event.actorId === actorId);
  assert.equal(payment?.data.economyPhase, "expansion");
});

test("economic cycles are deterministic for the same world seed", () => {
  const first = boot(7002);
  const second = boot(7002);
  first.advanceBy(20 * 12);
  second.advanceBy(20 * 12);

  const phases = (simulation: Simulation) => simulation.history
    .view()
    .listEvents()
    .filter((event) => event.type === "economy.phase_changed")
    .map((event) => ({ at: event.at, from: event.data.from, to: event.data.to }));

  assert.deepEqual(phases(first), phases(second));
});
