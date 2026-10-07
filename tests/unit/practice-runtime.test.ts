import { test } from "node:test";
import assert from "node:assert/strict";
import type { OpenLifeModule } from "@openlife/contracts";
import { practiceAutonomyModule } from "@openlife/module-practice-autonomy";
import {
  practiceRuntimeModule,
  PracticeComponents,
  PracticeKinds,
  PracticeRelations,
  type PracticeRuntimeApi,
} from "@openlife/module-practice-runtime";
import { Simulation } from "@openlife/simulation";

const fixtureModule: OpenLifeModule = {
  manifest: {
    id: "practice-fixture",
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    requires: ["practice.runtime"],
  },
  register(ctx) {
    const practice = ctx.registry.capabilityImplementation("practice.runtime") as PracticeRuntimeApi | undefined;
    if (!practice) throw new Error("practice runtime implementation unavailable");
    practice.registerDefinition({
      id: "practice-fixture.observe-pattern",
      category: "research",
      description: "Minimal domain fixture proving work -> checkpoint -> resolution -> completion.",
      stages: ["observe", "interpret"],
      advance: ({ practice: state }) => {
        const work = Number(state.accumulatedWork ?? 0);
        const checkpointCount = Number(state.checkpointCount ?? 0);
        if (checkpointCount > 0) return { work: 1, nextStage: "interpret", complete: true };
        if (work >= 1) {
          return {
            work: 1,
            nextStage: "interpret",
            checkpoint: {
              type: "interpretation",
              interactionMode: "choice",
              context: { observation: "three measurements show a repeating pattern" },
              candidateActions: [
                { id: "repeat", label: "Repeat the observation", autonomyWeight: 1 },
                { id: "propose-pattern", label: "Propose a stable pattern", autonomyWeight: 3 },
              ],
            },
          };
        }
        return { work: 1 };
      },
    });

    ctx.registerComponent({ id: "practice-fixture.actor", persist: true });
    ctx.registerCommand({ type: "practice-fixture.spawn_actor" });
    ctx.registerResolutionRule({
      id: "practice-fixture.spawn_actor.resolve",
      commandType: "practice-fixture.spawn_actor",
      resolve: () => [{
        kind: "spawnEntity",
        localId: "actor",
        entityKind: "practice-fixture.actor",
        components: { "practice-fixture.actor": { name: "Observer" } },
        announce: false,
      }],
    });
  },
};

function must(simulation: Simulation, intent: Parameters<Simulation["dispatch"]>[0]) {
  const result = simulation.dispatch(intent);
  assert.equal(result.ok, true, result.errors.map((error) => error.message).join("; "));
}

function createSimulation(seed = 9801, withAutonomy = false) {
  const simulation = new Simulation({
    worldSeed: seed,
    modules: withAutonomy
      ? [practiceRuntimeModule, practiceAutonomyModule, fixtureModule]
      : [practiceRuntimeModule, fixtureModule],
  });
  must(simulation, { type: "practice-fixture.spawn_actor" });
  const actorId = simulation.worldView().listEntities({ kind: "practice-fixture.actor" })[0]!.id;
  return { simulation, actorId };
}

test("Practice persists work, blocks on a Checkpoint, resolves through one command path, then completes", () => {
  const { simulation, actorId } = createSimulation();
  must(simulation, {
    type: "practice-runtime.start",
    actorId,
    payload: { definitionId: "practice-fixture.observe-pattern", goal: "understand the repeated pattern" },
  });

  const practice = simulation.worldView().listEntities({ kind: PracticeKinds.practice })[0];
  assert.ok(practice);
  const relation = simulation.worldView().listRelations({
    type: PracticeRelations.participatesIn,
    from: actorId,
    to: practice.id,
  })[0];
  assert.ok(relation);

  simulation.advanceBy(2);
  const blocked = simulation.worldView().getComponent(practice.id, PracticeComponents.practice) ?? {};
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.stage, "interpret");
  assert.equal(Number(blocked.accumulatedWork), 2);

  const checkpointId = String(blocked.activeCheckpointId ?? "");
  assert.ok(checkpointId);
  const checkpoint = simulation.worldView().getComponent(checkpointId, PracticeComponents.checkpoint) ?? {};
  assert.equal(checkpoint.status, "pending");
  assert.equal(checkpoint.interactionMode, "choice");

  must(simulation, {
    type: "practice-runtime.resolve_checkpoint",
    actorId,
    targetId: checkpointId,
    payload: { checkpointId, actionId: "propose-pattern" },
  });

  const resolved = simulation.worldView().getComponent(checkpointId, PracticeComponents.checkpoint) ?? {};
  assert.equal(resolved.status, "resolved");
  assert.deepEqual(resolved.resolution, { actionId: "propose-pattern" });

  simulation.advanceBy(1);
  const completed = simulation.worldView().getComponent(practice.id, PracticeComponents.practice) ?? {};
  assert.equal(completed.status, "completed");

  const events = simulation.history.view().listEvents();
  assert.ok(events.some((event) => event.type === "practice-runtime.checkpoint_created"));
  assert.ok(events.some((event) => event.type === "practice-runtime.checkpoint_resolved"));
  assert.ok(events.some((event) => event.type === "practice-runtime.completed"));
});

test("manual and autonomous participants resolve the same Checkpoint through the same command/event path", () => {
  const manualRun = createSimulation(9810, true);
  must(manualRun.simulation, {
    type: "practice-runtime.start",
    actorId: manualRun.actorId,
    payload: {
      definitionId: "practice-fixture.observe-pattern",
      goal: "manual observation",
      decisionMode: "manual",
    },
  });
  manualRun.simulation.advanceBy(3);
  const manualPractice = manualRun.simulation.worldView().listEntities({ kind: PracticeKinds.practice })[0]!;
  const manualState = manualRun.simulation.worldView().getComponent(manualPractice.id, PracticeComponents.practice) ?? {};
  assert.equal(manualState.status, "blocked", "autonomy module must not take over a manual participant");
  const manualCheckpointId = String(manualState.activeCheckpointId ?? "");
  must(manualRun.simulation, {
    type: "practice-runtime.resolve_checkpoint",
    actorId: manualRun.actorId,
    targetId: manualCheckpointId,
    payload: { checkpointId: manualCheckpointId, actionId: "repeat" },
  });
  const manualResolved = manualRun.simulation.history
    .view()
    .listEvents({ type: "practice-runtime.checkpoint_resolved" })[0];
  assert.ok(manualResolved);
  assert.equal(manualResolved.actorId, manualRun.actorId);
  assert.equal(manualResolved.data.actionId, "repeat");

  const autonomousRun = createSimulation(9810, true);
  must(autonomousRun.simulation, {
    type: "practice-runtime.start",
    actorId: autonomousRun.actorId,
    payload: {
      definitionId: "practice-fixture.observe-pattern",
      goal: "autonomous observation",
      decisionMode: "autonomous",
    },
  });
  autonomousRun.simulation.advanceBy(3);
  const autonomousPractice = autonomousRun.simulation.worldView().listEntities({ kind: PracticeKinds.practice })[0]!;
  const autonomousState = autonomousRun.simulation.worldView().getComponent(
    autonomousPractice.id,
    PracticeComponents.practice,
  ) ?? {};
  assert.equal(autonomousState.status, "active", "autonomous participant should have resolved the pending checkpoint");

  const autonomousResolved = autonomousRun.simulation.history
    .view()
    .listEvents({ type: "practice-runtime.checkpoint_resolved" })[0];
  assert.ok(autonomousResolved);
  assert.equal(autonomousResolved.actorId, autonomousRun.actorId);
  assert.ok(["repeat", "propose-pattern"].includes(String(autonomousResolved.data.actionId)));

  const autonomousCheckpoint = autonomousRun.simulation.worldView().getComponent(
    String(autonomousResolved.targetId ?? ""),
    PracticeComponents.checkpoint,
  ) ?? {};
  assert.equal(autonomousCheckpoint.status, "resolved");
  assert.deepEqual(autonomousCheckpoint.resolution, { actionId: autonomousResolved.data.actionId });
});

test("autonomous Checkpoint choices are deterministic for the same world seed", () => {
  const run = () => {
    const { simulation, actorId } = createSimulation(9811, true);
    must(simulation, {
      type: "practice-runtime.start",
      actorId,
      payload: {
        definitionId: "practice-fixture.observe-pattern",
        goal: "autonomous deterministic observation",
        decisionMode: "autonomous",
      },
    });
    simulation.advanceBy(3);
    const resolved = simulation.history
      .view()
      .listEvents({ type: "practice-runtime.checkpoint_resolved" })[0];
    return { actorId: resolved?.actorId, actionId: resolved?.data.actionId };
  };

  assert.deepEqual(run(), run());
});

test("PracticeDefinition remains module-owned and the same seed produces the same Practice trace", () => {
  const run = () => {
    const { simulation, actorId } = createSimulation(9802);
    assert.equal(simulation.definitions.components.has("core.practice"), false);
    must(simulation, {
      type: "practice-runtime.start",
      actorId,
      payload: { definitionId: "practice-fixture.observe-pattern", goal: "observe" },
    });
    simulation.advanceBy(2);
    return simulation.history.view().listEvents({ type: "practice-runtime.checkpoint_created" }).map((event) => ({
      at: event.at,
      targetId: event.targetId,
      data: event.data,
    }));
  };

  assert.deepEqual(run(), run());
});
