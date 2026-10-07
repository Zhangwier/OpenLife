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
  const known = knowledge?.known as unknown[];
  assert.ok(known.includes("modern-science.electromagnetic_phenomena"));
  assert.ok(known.includes("modern-science.material_change_observation"));
  assert.ok(known.includes("modern-science.living_bodies_have_structure"));
  assert.equal(
    known.includes("modern-science.atomic_structure"),
    false,
    "a fixed atomic reality must not imply that early civilization already knows atomic structure",
  );

  const publicView = simulation.project({ id: "modern-science.civilization", params: {} });
  assert.equal(publicView.ok, true);
  const established = publicView.data?.established as { id: string }[];
  assert.ok(established.some((item) => item.id === "modern-science.electromagnetic_phenomena"));
  assert.equal(
    established.some((item) => item.id === "modern-science.electric_power_engineering"),
    false,
    "electric power engineering must be discoverable later rather than present at the world anchor",
  );
  assert.equal("matterIsAtomic" in (publicView.data ?? {}), false);
  assert.equal("worldLaws" in (publicView.data ?? {}), false);
  const publicJson = JSON.stringify(publicView.data);
  assert.equal(
    publicJson.includes("modern-science.atomic_theory"),
    false,
    "the public civilization view must not name undiscovered concepts",
  );
  assert.equal(
    publicJson.includes("modern-science.electric_power_engineering"),
    false,
    "future engineering capabilities must remain epistemically hidden",
  );
  assert.ok(Number(publicView.data?.frontierCount ?? 0) > 0);
});

test("civilization discovers knowledge through prerequisites rather than fixed calendar unlocks", () => {
  const simulation = new Simulation({
    worldSeed: 9003,
    modules: [modernWorldModule, modernScienceModule],
  });
  assert.equal(simulation.dispatch({ type: "modern.initialize_world" }).ok, true);

  simulation.advanceBy(200 * 12);
  const early = simulation.project({ id: "modern-science.civilization", params: {} });
  const earlyIds = (early.data?.established as { id: string }[]).map((item) => item.id);
  assert.equal(earlyIds.includes("modern-science.atomic_structure"), false);
  assert.equal(earlyIds.includes("modern-science.electric_power_engineering"), false);

  // Run into the modern era. Exact discovery years are intentionally *not*
  // asserted: content tuning may change them, while dependency ordering must not.
  simulation.advanceBy((4096 - 200) * 12);
  const modern = simulation.project({ id: "modern-science.civilization", params: {} });
  const modernIds = new Set(
    (modern.data?.established as { id: string }[]).map((item) => item.id),
  );
  for (const id of [
    "modern-science.atomic_structure",
    "modern-science.electromagnetism",
    "modern-science.electric_power_engineering",
    "modern-science.cell_theory",
  ]) {
    assert.equal(modernIds.has(id), true, `modern civilization should eventually establish ${id}`);
  }

  const discoveries = simulation.history
    .view()
    .listEvents({ type: "modern-science.discovery_made" });
  const at = (id: string) => Number(
    discoveries.find((event) => event.data.id === id)?.at ?? Number.POSITIVE_INFINITY,
  );

  assert.ok(at("modern-science.atomic_theory") < at("modern-science.atomic_evidence"));
  assert.ok(at("modern-science.atomic_evidence") < at("modern-science.atomic_structure"));
  assert.ok(at("modern-science.electromagnetic_theory") < at("modern-science.electromagnetic_evidence"));
  assert.ok(at("modern-science.electromagnetic_evidence") < at("modern-science.electromagnetism"));
  assert.ok(at("modern-science.electromagnetism") < at("modern-science.electric_power_engineering"));
  assert.ok(at("modern-science.optical_instruments") < at("modern-science.microscopic_evidence"));
  assert.ok(at("modern-science.microscopic_evidence") < at("modern-science.cell_theory"));
});

test("science discovery sequence is deterministic for the same world seed", () => {
  const run = () => {
    const simulation = new Simulation({
      worldSeed: 9004,
      modules: [modernWorldModule, modernScienceModule],
    });
    assert.equal(simulation.dispatch({ type: "modern.initialize_world" }).ok, true);
    simulation.advanceBy(4096 * 12);
    return simulation.history
      .view()
      .listEvents({ type: "modern-science.discovery_made" })
      .map((event) => ({ at: event.at, id: event.data.id }));
  };

  assert.deepEqual(run(), run());
});

test("modern scientific concepts are registered as a dependency graph, not core vocabulary", () => {
  const simulation = new Simulation({
    worldSeed: 9002,
    modules: [modernWorldModule, modernScienceModule],
  });
  const atomic = simulation.definitions.knowledge.get("modern-science.atomic_structure");
  const power = simulation.definitions.knowledge.get("modern-science.electric_power_engineering");

  assert.equal(atomic?.kind, "knowledge");
  assert.deepEqual(atomic?.dependsOn, [
    "modern-science.atomic_theory",
    "modern-science.atomic_evidence",
  ]);
  assert.equal(power?.kind, "capability");
  assert.deepEqual(power?.dependsOn, ["modern-science.electromagnetism"]);
  assert.equal(
    simulation.definitions.components.has("core.atomic_structure"),
    false,
    "atomic concepts must never become Core components",
  );
});
