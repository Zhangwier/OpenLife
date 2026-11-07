import { test } from "node:test";
import assert from "node:assert/strict";
import { basicAutonomyModule } from "@openlife/module-basic-autonomy";
import { careerModule } from "@openlife/module-career";
import { educationModule } from "@openlife/module-education";
import { familyModule } from "@openlife/module-family";
import { modernWorldModule } from "@openlife/module-modern-world";
import { Simulation } from "@openlife/simulation";

const TICKS_PER_YEAR = 12;

function mustDispatch(simulation: Simulation, intent: Parameters<Simulation["dispatch"]>[0]): void {
  const result = simulation.dispatch(intent);
  if (!result.ok) {
    throw new Error(result.errors.map((error) => `${error.code}: ${error.message}`).join("; "));
  }
}

test("inactive heirs continue living through the basic autonomy system pack", () => {
  const simulation = new Simulation({
    worldSeed: 104,
    modules: [
      modernWorldModule,
      educationModule,
      careerModule,
      familyModule,
      basicAutonomyModule,
    ],
  });

  mustDispatch(simulation, { type: "modern.initialize_world" });
  mustDispatch(simulation, {
    type: "modern.create_character",
    payload: {
      givenName: "Avery",
      familyName: "Lin",
      cityId: "modern:city:north",
      startingCash: 20_000,
      lifespan: 100,
      lineageId: "family:lineage:test",
    },
  });

  const parentId = String(
    simulation.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId,
  );

  simulation.advanceBy(18 * TICKS_PER_YEAR);
  mustDispatch(simulation, {
    type: "family.marry",
    actorId: parentId,
    payload: { spouseName: "Rowan" },
  });
  mustDispatch(simulation, {
    type: "family.have_child",
    actorId: parentId,
    payload: { givenName: "Noa", lifespan: 100 },
  });

  const childId = simulation
    .worldView()
    .listRelations({ type: "family.parent_of", from: parentId })[0]?.to;
  assert.ok(childId, "the child must exist");

  // The parent remains the player character. No command below is issued on
  // behalf of the child; its life is driven only by basic-autonomy tasks.
  simulation.advanceBy(36 * TICKS_PER_YEAR);

  const world = simulation.worldView();
  const child = world.getEntity(childId);
  assert.ok(child && child.archivedAt === undefined, "the inactive heir should still be alive");
  assert.equal(child.components["education.level"]?.level, "higher");
  assert.ok(child.components["career.employment"], "the inactive heir should have found work");
  assert.ok(
    world.listRelations({ type: "family.married_to", from: childId }).length > 0,
    "the inactive heir should have formed a partnership",
  );
  assert.ok(
    world.listRelations({ type: "family.parent_of", from: childId }).length > 0,
    "the inactive heir should have had a child",
  );
  assert.ok(
    world.listRelations({ type: "career.founded", from: childId }).length > 0,
    "the inactive heir should have founded a business",
  );

  const autonomousEvents = simulation.history
    .view()
    .listEvents()
    .filter((event) => event.actorId === childId);
  assert.ok(
    autonomousEvents.some((event) => event.type === "education.enrolled"),
    "autonomous education should still use the normal event pipeline",
  );
  assert.ok(
    autonomousEvents.some((event) => event.type === "career.job_accepted"),
    "autonomous career choices should still use the normal event pipeline",
  );
});
