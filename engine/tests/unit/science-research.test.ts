import { test } from "node:test";
import assert from "node:assert/strict";
import type { OpenLifeModule } from "@openlife/contracts";
import { practiceAutonomyModule } from "@openlife/module-practice-autonomy";
import {
  practiceRuntimeModule,
  PracticeComponents,
  PracticeKinds,
} from "@openlife/module-practice-runtime";
import {
  scienceResearchModule,
  ScienceResearchComponents,
  ScienceResearchDefinitions,
  ScienceResearchKnowledge,
  ScienceResearchKinds,
  ScienceResearchRelations,
} from "@openlife/module-science-research";
import { Simulation } from "@openlife/simulation";

const actorFixture: OpenLifeModule = {
  manifest: {
    id: "science-fixture",
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
  },
  register(ctx) {
    ctx.registerComponent({ id: "science-fixture.actor", persist: true });
    ctx.registerCommand({ type: "science-fixture.spawn_actor" });
    ctx.registerResolutionRule({
      id: "science-fixture.spawn_actor.resolve",
      commandType: "science-fixture.spawn_actor",
      resolve: () => [{
        kind: "spawnEntity",
        localId: "actor",
        entityKind: "science-fixture.actor",
        components: { "science-fixture.actor": { name: "Observer" } },
        announce: false,
      }],
    });
  },
};

function must(simulation: Simulation, intent: Parameters<Simulation["dispatch"]>[0]) {
  const result = simulation.dispatch(intent);
  assert.equal(result.ok, true, result.errors.map((error) => error.message).join("; "));
}

function setup(options: { seed?: number; autonomy?: boolean } = {}) {
  const modules: OpenLifeModule[] = [practiceRuntimeModule];
  if (options.autonomy) modules.push(practiceAutonomyModule);
  modules.push(scienceResearchModule, actorFixture);
  const simulation = new Simulation({ worldSeed: options.seed ?? 12001, modules });
  must(simulation, { type: "science-fixture.spawn_actor" });
  const actorId = simulation.worldView().listEntities({ kind: "science-fixture.actor" })[0]!.id;
  return { simulation, actorId };
}

function startMagnetResearch(simulation: Simulation, actorId: string, decisionMode: "manual" | "autonomous") {
  must(simulation, {
    type: "practice-runtime.start",
    actorId,
    payload: {
      definitionId: ScienceResearchDefinitions.magneticDirection,
      goal: "understand why a suspended magnet repeatedly settles along a similar axis",
      decisionMode,
    },
  });
  return simulation.worldView().listEntities({ kind: PracticeKinds.practice })[0]!;
}

test("manual research turns repeated observation into a traceable Insight tied to Knowledge semantics", () => {
  const { simulation, actorId } = setup();
  const practice = startMagnetResearch(simulation, actorId, "manual");

  simulation.advanceBy(3);
  const practiceState = simulation.worldView().getComponent(practice.id, PracticeComponents.practice) ?? {};
  assert.equal(practiceState.status, "blocked");
  assert.equal(practiceState.stage, "interpret");

  const checkpointId = String(practiceState.activeCheckpointId ?? "");
  const checkpoint = simulation.worldView().getComponent(checkpointId, PracticeComponents.checkpoint) ?? {};
  assert.equal(checkpoint.type, "interpret-observation");
  assert.equal(checkpoint.interactionMode, "choice");
  assert.ok(Array.isArray(checkpoint.candidateActions));
  assert.ok(Array.isArray((checkpoint.context as Record<string, unknown>)?.observations));

  must(simulation, {
    type: "practice-runtime.resolve_checkpoint",
    actorId,
    targetId: checkpointId,
    payload: { checkpointId, actionId: "propose-stable-direction" },
  });

  assert.equal(simulation.definitions.knowledge.has(ScienceResearchKnowledge.magneticDirectionPattern), true);
  const insight = simulation.worldView().listEntities({ kind: ScienceResearchKinds.insight })[0];
  assert.ok(insight);
  const insightState = insight.components[ScienceResearchComponents.insight] ?? {};
  assert.equal(insightState.knowledgeId, ScienceResearchKnowledge.magneticDirectionPattern);
  assert.equal(insightState.thinkerId, actorId);
  assert.equal(insightState.sourcePracticeId, practice.id);
  assert.equal(insightState.sourceCheckpointId, checkpointId);

  const relation = simulation.worldView().listRelations({
    type: ScienceResearchRelations.derivedFromPractice,
    from: insight.id,
    to: practice.id,
  })[0];
  assert.ok(relation);

  const event = simulation.history.view().listEvents({ type: "science-research.insight_formed" })[0];
  assert.ok(event);
  assert.equal(event.actorId, actorId);
  assert.equal(event.data.knowledgeId, ScienceResearchKnowledge.magneticDirectionPattern);
});

test("a cautious interpretation is preserved as a valid decision instead of being scored as a wrong answer", () => {
  const { simulation, actorId } = setup({ seed: 12002 });
  startMagnetResearch(simulation, actorId, "manual");
  simulation.advanceBy(3);
  const practice = simulation.worldView().listEntities({ kind: PracticeKinds.practice })[0]!;
  const state = simulation.worldView().getComponent(practice.id, PracticeComponents.practice) ?? {};
  const checkpointId = String(state.activeCheckpointId ?? "");

  must(simulation, {
    type: "practice-runtime.resolve_checkpoint",
    actorId,
    targetId: checkpointId,
    payload: { checkpointId, actionId: "repeat-observation" },
  });

  const resolved = simulation.worldView().getComponent(checkpointId, PracticeComponents.checkpoint) ?? {};
  assert.equal(resolved.status, "resolved");
  assert.deepEqual(resolved.resolution, { actionId: "repeat-observation" });
  assert.equal(simulation.worldView().listEntities({ kind: ScienceResearchKinds.insight }).length, 0);
  assert.equal(
    simulation.history.view().listEvents({ type: "science-research.insight_formed" }).length,
    0,
  );
});

test("an autonomous researcher resolves the same scientific Checkpoint through the common Practice command path", () => {
  const { simulation, actorId } = setup({ seed: 12003, autonomy: true });
  const practice = startMagnetResearch(simulation, actorId, "autonomous");

  simulation.advanceBy(4);

  const resolved = simulation.history.view().listEvents({ type: "practice-runtime.checkpoint_resolved" })[0];
  assert.ok(resolved);
  assert.equal(resolved.actorId, actorId);
  assert.equal(resolved.data.actionId, "propose-stable-direction");
  assert.equal(resolved.data.definitionId, ScienceResearchDefinitions.magneticDirection);

  const insight = simulation.worldView().listEntities({ kind: ScienceResearchKinds.insight })[0];
  assert.ok(insight);
  assert.equal(
    insight.components[ScienceResearchComponents.insight]?.knowledgeId,
    ScienceResearchKnowledge.magneticDirectionPattern,
  );

  const state = simulation.worldView().getComponent(practice.id, PracticeComponents.practice) ?? {};
  assert.equal(state.status, "active");
  assert.equal(state.activeCheckpointId, "");
});
