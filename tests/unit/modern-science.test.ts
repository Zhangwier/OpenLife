import { test } from "node:test";
import assert from "node:assert/strict";
import { modernScienceModule, ScienceComponents } from "@openlife/module-modern-science";
import { modernWorldModule } from "@openlife/module-modern-world";
import { Simulation } from "@openlife/simulation";

test("modern science separates fixed reality from civilization knowledge", () => {
  const simulation = new Simulation({
    worldSeed: 9001,
    modules: [modernWorldModule, modernScienceModule],
  });
  assert.equal(simulation.dispatch({ type: "modern.initialize_world" }).ok, true);

  const world = simulation.worldView();
  const laws = world.getComponent("modern:world", ScienceComponents.worldLaws);
  const knowledge = world.getComponent(
    "modern:world",
    ScienceComponents.civilizationKnowledge,
  );
  assert.equal(laws?.matterIsAtomic, true);
  assert.equal(laws?.electromagnetismExists, true);
  assert.ok(Array.isArray(knowledge?.known));
  assert.ok((knowledge?.known as unknown[]).includes("modern-science.atomic_structure"));

  const publicView = simulation.project({ id: "modern-science.civilization", params: {} });
  assert.equal(publicView.ok, true);
  assert.ok(
    (publicView.data?.established as { id: string }[]).some(
      (item) => item.id === "modern-science.electric_power_engineering",
    ),
  );
  assert.equal("matterIsAtomic" in (publicView.data ?? {}), false);
  assert.equal("worldLaws" in (publicView.data ?? {}), false);
});

test("modern scientific concepts are registered as a dependency graph, not core vocabulary", () => {
  const simulation = new Simulation({
    worldSeed: 9002,
    modules: [modernWorldModule, modernScienceModule],
  });
  const atomic = simulation.definitions.knowledge.get("modern-science.atomic_structure");
  const power = simulation.definitions.knowledge.get("modern-science.electric_power_engineering");

  assert.equal(atomic?.kind, "knowledge");
  assert.deepEqual(atomic?.dependsOn, ["modern-science.matter_has_atomic_structure"]);
  assert.equal(power?.kind, "capability");
  assert.deepEqual(power?.dependsOn, ["modern-science.electromagnetism"]);
  assert.equal(
    simulation.definitions.components.has("core.atomic_structure"),
    false,
    "atomic concepts must never become Core components",
  );
});
