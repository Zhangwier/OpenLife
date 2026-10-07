import { test } from "node:test";
import assert from "node:assert/strict";
import { earlyCivilizationModule, EarlyComponents } from "@openlife/module-early-civilization";
import { familyModule } from "@openlife/module-family";
import { modernWorldModule } from "@openlife/module-modern-world";
import { Simulation } from "@openlife/simulation";

const YEAR = 12;

function must(sim: Simulation, intent: Parameters<Simulation["dispatch"]>[0]) {
  const result = sim.dispatch(intent);
  assert.equal(result.ok, true, result.errors.map((error) => error.message).join("; "));
}

test("the 2070 BCE opening can play a life without modern school/career vocabulary", () => {
  const sim = new Simulation({
    worldSeed: 7001,
    modules: [modernWorldModule, familyModule, earlyCivilizationModule],
  });
  must(sim, { type: "modern.initialize_world" });
  must(sim, {
    type: "modern.create_character",
    payload: {
      givenName: "A",
      familyName: "He",
      cityId: "modern:city:north",
      lineageId: "family:lineage:early",
      lifespan: 90,
    },
  });

  const world = sim.worldView();
  assert.equal(world.getComponent("modern:city:north", "modern.identity")?.name, "北岸聚落");
  assert.equal(world.getComponent("modern:city:south", "modern.identity")?.name, "南丘聚落");
  assert.equal(sim.definitions.commands.has("education.enroll_school"), false);
  assert.equal(sim.definitions.commands.has("career.get_job"), false);

  const actorId = String(world.getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  sim.advanceBy(6 * YEAR);
  must(sim, { type: "early-civilization.begin_learning", actorId });
  assert.ok(sim.worldView().getComponent(actorId, EarlyComponents.learning));

  sim.advanceBy(8 * YEAR);
  must(sim, { type: "early-civilization.take_role", actorId, payload: { role: "craftsperson" } });
  assert.equal(sim.worldView().getComponent(actorId, EarlyComponents.role)?.title, "手工业者");

  sim.advanceBy(4 * YEAR);
  must(sim, { type: "family.marry", actorId, payload: { spouseName: "Yu" } });
  must(sim, { type: "family.have_child", actorId, payload: { givenName: "Lan", lifespan: 90 } });
  must(sim, { type: "early-civilization.leave_legacy", actorId });

  sim.syncHistory();
  assert.ok(sim.history.records.some((record) => record.type === "early-civilization.legacy_left"));
  assert.ok(sim.history.records.some((record) => record.type === "family.child_born"));
});

test("inactive children learn and take settlement roles through scheduled commands", () => {
  const sim = new Simulation({
    worldSeed: 7002,
    modules: [modernWorldModule, familyModule, earlyCivilizationModule],
  });
  must(sim, { type: "modern.initialize_world" });
  must(sim, {
    type: "modern.create_character",
    payload: { givenName: "A", familyName: "He", lifespan: 100 },
  });
  const parentId = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  sim.advanceBy(18 * YEAR);
  must(sim, { type: "family.marry", actorId: parentId, payload: { spouseName: "Yu" } });
  must(sim, { type: "family.have_child", actorId: parentId, payload: { givenName: "Lan", lifespan: 100 } });
  const childId = sim.worldView().listRelations({ type: "family.parent_of", from: parentId })[0]?.to;
  assert.ok(childId);

  sim.advanceBy(15 * YEAR);
  const child = sim.worldView().getEntity(childId);
  assert.ok(child);
  assert.ok(child.components[EarlyComponents.learning]);
  assert.ok(child.components[EarlyComponents.role]);
});
