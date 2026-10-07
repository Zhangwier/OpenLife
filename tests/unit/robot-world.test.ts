import { test } from "node:test";
import assert from "node:assert/strict";
import {
  robotTestWorldModule,
  RobotComponents,
  RobotRelations,
} from "@openlife/module-robot-test-world";
import { Simulation } from "@openlife/simulation";

function must(simulation: Simulation, intent: Parameters<Simulation["dispatch"]>[0]) {
  const result = simulation.dispatch(intent);
  assert.equal(result.ok, true, result.errors.map((error) => error.message).join("; "));
}

test("robot world runs energy, processes, succession and history without modern vocabulary", () => {
  const simulation = new Simulation({ worldSeed: 5150, modules: [robotTestWorldModule] });
  must(simulation, { type: "robot.initialize_world" });
  must(simulation, { type: "robot.assemble_unit", payload: { name: "Rho" } });

  const initial = simulation.project({ id: "robot.unit_view", params: {} });
  const firstId = String(initial.data?.activeUnitId ?? "");
  assert.ok(firstId);

  const before = Number(simulation.worldView().getComponent(firstId, RobotComponents.power)?.charge ?? 0);
  must(simulation, { type: "robot.work", actorId: firstId });
  const afterWork = Number(simulation.worldView().getComponent(firstId, RobotComponents.power)?.charge ?? 0);
  assert.equal(afterWork, before - 12);

  must(simulation, { type: "robot.recharge", actorId: firstId });
  const afterRecharge = Number(simulation.worldView().getComponent(firstId, RobotComponents.power)?.charge ?? 0);
  assert.ok(afterRecharge > afterWork);

  must(simulation, { type: "robot.fabricate_successor", actorId: firstId, payload: { name: "Sigma" } });
  const successorRelation = simulation
    .worldView()
    .listRelations({ type: RobotRelations.fabricated, from: firstId })[0];
  assert.ok(successorRelation);
  const successorId = successorRelation.to;

  must(simulation, { type: "robot.shutdown", actorId: firstId });
  must(simulation, { type: "robot.switch_unit" });

  const next = simulation.project({ id: "robot.unit_view", params: {} });
  assert.equal(next.data?.activeUnitId, successorId);
  assert.equal(next.data?.generation, 2);

  const successorBeforeCycle = Number(
    simulation.worldView().getComponent(successorId, RobotComponents.power)?.charge ?? 0,
  );
  simulation.advanceBy(8);
  const successorAfterCycle = Number(
    simulation.worldView().getComponent(successorId, RobotComponents.power)?.charge ?? 0,
  );
  assert.ok(successorAfterCycle < successorBeforeCycle);

  simulation.syncHistory();
  assert.ok(simulation.history.records.some((record) => record.type === "robot.successor_fabricated"));
  assert.ok(simulation.history.records.some((record) => record.type === "robot.control_transferred"));

  assert.equal(simulation.definitions.resources.has("robot.energy"), true);
  assert.equal(simulation.definitions.processes.has("robot.work_process"), true);
  assert.equal(simulation.definitions.processes.has("robot.fabrication_process"), true);

  const allIds = [
    ...simulation.definitions.components.keys(),
    ...simulation.definitions.commands.keys(),
    ...simulation.definitions.resources.keys(),
    ...simulation.definitions.processes.keys(),
  ];
  assert.equal(allIds.some((id) => id.startsWith("modern.")), false);
  assert.equal(allIds.some((id) => id.startsWith("magic.")), false);
});

test("robot world save/load preserves the active successor", () => {
  const simulation = new Simulation({ worldSeed: 5151, modules: [robotTestWorldModule] });
  must(simulation, { type: "robot.initialize_world" });
  must(simulation, { type: "robot.assemble_unit", payload: { name: "Alpha" } });
  const firstId = String(simulation.project({ id: "robot.unit_view", params: {} }).data?.activeUnitId ?? "");
  must(simulation, { type: "robot.fabricate_successor", actorId: firstId, payload: { name: "Beta" } });
  must(simulation, { type: "robot.shutdown", actorId: firstId });
  must(simulation, { type: "robot.switch_unit" });

  const before = simulation.project({ id: "robot.unit_view", params: {} });
  const pkg = simulation.save({ label: "robot continuity" });
  const loaded = Simulation.load(pkg, [robotTestWorldModule]);

  assert.equal(loaded.result.ok, true);
  assert.ok(loaded.simulation);
  const after = loaded.simulation.project({ id: "robot.unit_view", params: {} });
  assert.equal(after.data?.activeUnitId, before.data?.activeUnitId);
  assert.equal(after.data?.generation, 2);
});
