import { test } from "node:test";
import assert from "node:assert/strict";
import { historicalEraModule, HistoricalEraComponents } from "@openlife/module-historical-era";
import { modernWorldModule } from "@openlife/module-modern-world";
import { tickOfYear } from "@openlife/life-contracts";
import { Simulation } from "@openlife/simulation";

function createSimulation(seed = 9301) {
  const sim = new Simulation({
    worldSeed: seed,
    modules: [modernWorldModule, historicalEraModule],
  });
  const result = sim.dispatch({ type: "modern.initialize_world" });
  assert.equal(result.ok, true);
  return sim;
}

test("Era remains a module-owned prototype rather than becoming Core vocabulary", () => {
  const sim = createSimulation();
  assert.equal(sim.definitions.components.has("core.era"), false);
  assert.equal(sim.definitions.components.has(HistoricalEraComponents.state), true);
  assert.equal(sim.definitions.knowledge.has("historical-era.bronze"), false);

  const era = sim.project({ id: "historical-era.current", params: {} });
  assert.equal(era.ok, true);
  assert.equal(era.data?.id, "xia");
  assert.equal(era.data?.label, "夏");
  assert.equal(era.data?.currentYear, "公元前 2070 年");
});

test("era transitions are world history, while context lists are not forced technology unlocks", () => {
  const sim = createSimulation(9302);

  const checkpoints = [
    [-1599, "shang", "商"],
    [-1045, "western-zhou", "西周"],
    [-769, "spring-autumn", "春秋"],
    [-474, "warring-states", "战国"],
  ] as const;

  for (const [year, id, label] of checkpoints) {
    sim.advanceTo(tickOfYear(year));
    const era = sim.project({ id: "historical-era.current", params: {} });
    assert.equal(era.data?.id, id);
    assert.equal(era.data?.label, label);
  }

  sim.syncHistory();
  const transitions = sim.history
    .view()
    .listEvents({ type: "historical-era.changed" });
  assert.deepEqual(
    transitions.map((event) => event.data.toId),
    ["shang", "western-zhou", "spring-autumn", "warring-states"],
  );

  const current = sim.project({ id: "historical-era.current", params: {} });
  assert.ok((current.data?.tools as string[]).includes("铁农具"));
  assert.ok((current.data?.thoughtClimate as string[]).includes("百家争鸣"));

  // Era context tells content authors what is characteristic; it does not
  // silently mutate the Knowledge Graph or invent a Core technology tree.
  assert.equal(sim.definitions.knowledge.keys().some((id) => id.startsWith("historical-era.")), false);
});

test("era context survives save/load and keeps its authored content", () => {
  const sim = createSimulation(9303);
  sim.advanceTo(tickOfYear(-769));
  const before = sim.project({ id: "historical-era.current", params: {} });
  const save = sim.save({ label: "era prototype" });
  const loaded = Simulation.load(save, [modernWorldModule, historicalEraModule]);
  assert.equal(loaded.result.ok, true);
  assert.ok(loaded.simulation);
  const after = loaded.simulation.project({ id: "historical-era.current", params: {} });
  assert.deepEqual(after.data, before.data);
});
