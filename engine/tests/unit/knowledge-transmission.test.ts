import { test } from "node:test";
import assert from "node:assert/strict";
import type { OpenLifeModule } from "@openlife/contracts";
import { epistemicStateModule } from "@openlife/module-epistemic-state";
import { knowledgeTransmissionModule, KnowledgeTransmissionDefinitions } from "@openlife/module-knowledge-transmission";
import { practiceAutonomyModule } from "@openlife/module-practice-autonomy";
import {
  practiceRuntimeModule,
  PracticeComponents,
  PracticeKinds,
  PracticeRelations,
} from "@openlife/module-practice-runtime";
import {
  scienceResearchModule,
  ScienceResearchDefinitions,
  ScienceResearchKnowledge,
} from "@openlife/module-science-research";
import { Simulation } from "@openlife/simulation";

const fixtureModule: OpenLifeModule = {
  manifest: {
    id: "transmission-fixture",
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
  },
  register(ctx) {
    ctx.registerComponent({ id: "transmission-fixture.actor", persist: true });
    ctx.registerCommand({ type: "transmission-fixture.spawn_actor" });
    ctx.registerResolutionRule({
      id: "transmission-fixture.spawn_actor.resolve",
      commandType: "transmission-fixture.spawn_actor",
      resolve: (c) => [{
        kind: "spawnEntity",
        localId: "actor",
        entityKind: "transmission-fixture.actor",
        components: {
          "transmission-fixture.actor": { name: String(c.command.payload.name ?? "Person") },
        },
        announce: false,
      }],
    });
  },
};

function must(simulation: Simulation, intent: Parameters<Simulation["dispatch"]>[0]) {
  const result = simulation.dispatch(intent);
  assert.equal(result.ok, true, result.errors.map((error) => `${error.code}: ${error.message}`).join("; "));
}

function spawn(simulation: Simulation, name: string): string {
  const existing = new Set(simulation.worldView().listEntities({ kind: "transmission-fixture.actor" }).map((entity) => entity.id));
  must(simulation, { type: "transmission-fixture.spawn_actor", payload: { name } });
  return simulation.worldView().listEntities({ kind: "transmission-fixture.actor" }).find((entity) => !existing.has(entity.id))!.id;
}

function setup(seed: number, autonomy = false) {
  const modules: OpenLifeModule[] = [practiceRuntimeModule, epistemicStateModule];
  if (autonomy) modules.push(practiceAutonomyModule);
  modules.push(scienceResearchModule, knowledgeTransmissionModule, fixtureModule);
  const simulation = new Simulation({ worldSeed: seed, modules });
  const teacherId = spawn(simulation, "Teacher");
  const learnerId = spawn(simulation, "Learner");
  return { simulation, teacherId, learnerId };
}

function discoverMagneticPattern(simulation: Simulation, teacherId: string) {
  must(simulation, {
    type: "practice-runtime.start",
    actorId: teacherId,
    payload: {
      definitionId: ScienceResearchDefinitions.magneticDirection,
      goal: "understand magnetic direction",
      role: "researcher",
      decisionMode: "manual",
    },
  });
  simulation.advanceBy(3);
  const research = simulation.worldView().listEntities({ kind: PracticeKinds.practice }).find((entity) =>
    entity.components[PracticeComponents.practice]?.definitionId === ScienceResearchDefinitions.magneticDirection
  )!;
  const state = research.components[PracticeComponents.practice] ?? {};
  const checkpointId = String(state.activeCheckpointId ?? "");
  must(simulation, {
    type: "practice-runtime.resolve_checkpoint",
    actorId: teacherId,
    targetId: checkpointId,
    payload: { checkpointId, actionId: "propose-stable-direction" },
  });
}

function startTeaching(
  simulation: Simulation,
  teacherId: string,
  learnerId: string,
  learnerDecisionMode: "manual" | "autonomous" = "manual",
) {
  return simulation.dispatch({
    type: "practice-runtime.start",
    actorId: teacherId,
    payload: {
      definitionId: KnowledgeTransmissionDefinitions.teachCanonicalKnowledge,
      goal: "teach the magnetic direction pattern",
      role: "teacher",
      decisionMode: "manual",
      participants: [
        { id: learnerId, role: "learner", decisionMode: learnerDecisionMode },
      ],
      context: {
        knowledgeId: ScienceResearchKnowledge.magneticDirectionPattern,
        teacherId,
        learnerId,
      },
    },
  });
}

function holderRecords(simulation: Simulation, holderId: string): Array<Record<string, unknown>> {
  const view = simulation.project({ id: "epistemic-state.holder", params: { holderId } });
  return (view.data?.records ?? []) as Array<Record<string, unknown>>;
}

test("teaching is a multi-participant Practice and only the learner may resolve the learning checkpoint", () => {
  const { simulation, teacherId, learnerId } = setup(14001);
  discoverMagneticPattern(simulation, teacherId);

  const start = startTeaching(simulation, teacherId, learnerId);
  assert.equal(start.ok, true, start.errors.map((error) => error.message).join("; "));

  const teaching = simulation.worldView().listEntities({ kind: PracticeKinds.practice }).find((entity) =>
    entity.components[PracticeComponents.practice]?.definitionId === KnowledgeTransmissionDefinitions.teachCanonicalKnowledge
  )!;
  const participants = simulation.worldView().listRelations({ type: PracticeRelations.participatesIn, to: teaching.id });
  assert.equal(participants.length, 2);
  assert.equal(
    participants.find((relation) => relation.from === teacherId)?.components[PracticeComponents.participation]?.role,
    "teacher",
  );
  assert.equal(
    participants.find((relation) => relation.from === learnerId)?.components[PracticeComponents.participation]?.role,
    "learner",
  );

  simulation.advanceBy(2);
  const teachingState = simulation.worldView().getComponent(teaching.id, PracticeComponents.practice) ?? {};
  assert.equal(teachingState.status, "blocked");
  const checkpointId = String(teachingState.activeCheckpointId ?? "");
  const checkpoint = simulation.worldView().getComponent(checkpointId, PracticeComponents.checkpoint) ?? {};
  assert.equal(checkpoint.resolverRole, "learner");

  const teacherAttempt = simulation.dispatch({
    type: "practice-runtime.resolve_checkpoint",
    actorId: teacherId,
    targetId: checkpointId,
    payload: { checkpointId, actionId: "accept-provisionally" },
  });
  assert.equal(teacherAttempt.ok, false);
  assert.equal(teacherAttempt.errors[0]?.code, "E_CHECKPOINT_ROLE");

  must(simulation, {
    type: "practice-runtime.resolve_checkpoint",
    actorId: learnerId,
    targetId: checkpointId,
    payload: { checkpointId, actionId: "understand-but-verify" },
  });

  const learnerRecord = holderRecords(simulation, learnerId)[0];
  assert.ok(learnerRecord);
  assert.equal(learnerRecord.canonicalKnowledgeId, ScienceResearchKnowledge.magneticDirectionPattern);
  assert.equal(learnerRecord.stance, "undecided");
  assert.equal(learnerRecord.awareness, "examined");

  const teacherRecord = holderRecords(simulation, teacherId)[0];
  assert.ok(teacherRecord);
  assert.ok(Number(learnerRecord.understanding) < Number(teacherRecord.understanding));
  assert.ok(Number(learnerRecord.confidence) < Number(teacherRecord.confidence));
  assert.notEqual(learnerRecord.source, teacherRecord.source);
});

test("a person cannot teach canonical knowledge they do not personally hold", () => {
  const { simulation, teacherId, learnerId } = setup(14002);
  const result = startTeaching(simulation, teacherId, learnerId);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0]?.code, "E_TRANSMISSION_TEACHER_KNOWLEDGE");
  assert.equal(
    simulation.worldView().listEntities({ kind: PracticeKinds.practice }).filter((entity) =>
      entity.components[PracticeComponents.practice]?.definitionId === KnowledgeTransmissionDefinitions.teachCanonicalKnowledge
    ).length,
    0,
  );
});

test("an autonomous learner resolves the same learner checkpoint and receives their own epistemic record", () => {
  const { simulation, teacherId, learnerId } = setup(14003, true);
  discoverMagneticPattern(simulation, teacherId);
  const start = startTeaching(simulation, teacherId, learnerId, "autonomous");
  assert.equal(start.ok, true);

  simulation.advanceBy(3);

  const resolved = simulation.history.view().listEvents({ type: "practice-runtime.checkpoint_resolved" })
    .find((event) => event.data.definitionId === KnowledgeTransmissionDefinitions.teachCanonicalKnowledge);
  assert.ok(resolved);
  assert.equal(resolved.actorId, learnerId);

  const learnerRecord = holderRecords(simulation, learnerId)[0];
  assert.ok(learnerRecord);
  assert.equal(learnerRecord.canonicalKnowledgeId, ScienceResearchKnowledge.magneticDirectionPattern);
  assert.ok(Number(learnerRecord.understanding) > 0);

  const teacherRecords = holderRecords(simulation, teacherId);
  assert.equal(teacherRecords.length, 1, "teaching must not clone or replace the teacher's own record");
});
