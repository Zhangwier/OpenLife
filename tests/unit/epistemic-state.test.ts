import { test } from "node:test";
import assert from "node:assert/strict";
import type { OpenLifeModule } from "@openlife/contracts";
import {
  epistemicStateModule,
  EpistemicComponents,
  EpistemicKinds,
  EpistemicRelations,
} from "@openlife/module-epistemic-state";
import { practiceRuntimeModule } from "@openlife/module-practice-runtime";
import {
  scienceResearchModule,
  ScienceResearchDefinitions,
  ScienceResearchKnowledge,
} from "@openlife/module-science-research";
import { Simulation } from "@openlife/simulation";

const fixtureModule: OpenLifeModule = {
  manifest: {
    id: "epistemic-fixture",
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
  },
  register(ctx) {
    ctx.registerComponent({ id: "epistemic-fixture.actor", persist: true });
    ctx.registerKnowledge({
      id: "epistemic-fixture.example-knowledge",
      kind: "knowledge",
      description: "Fixture content used to test holder-specific epistemic state.",
    });
    ctx.registerCommand({ type: "epistemic-fixture.spawn_actor" });
    ctx.registerResolutionRule({
      id: "epistemic-fixture.spawn_actor.resolve",
      commandType: "epistemic-fixture.spawn_actor",
      resolve: (c) => [{
        kind: "spawnEntity",
        localId: "actor",
        entityKind: "epistemic-fixture.actor",
        components: {
          "epistemic-fixture.actor": { name: String(c.command.payload.name ?? "Person") },
        },
        announce: false,
      }],
    });
  },
};

function must(simulation: Simulation, intent: Parameters<Simulation["dispatch"]>[0]) {
  const result = simulation.dispatch(intent);
  assert.equal(result.ok, true, result.errors.map((error) => error.message).join("; "));
}

function spawn(simulation: Simulation, name: string): string {
  const before = new Set(simulation.worldView().listEntities({ kind: "epistemic-fixture.actor" }).map((entity) => entity.id));
  must(simulation, { type: "epistemic-fixture.spawn_actor", payload: { name } });
  return simulation.worldView().listEntities({ kind: "epistemic-fixture.actor" }).find((entity) => !before.has(entity.id))!.id;
}

test("epistemic state is holder-specific: one person knowing does not make another person aware", () => {
  const simulation = new Simulation({ worldSeed: 13001, modules: [epistemicStateModule, fixtureModule] });
  const first = spawn(simulation, "First");
  const second = spawn(simulation, "Second");

  must(simulation, {
    type: "epistemic-state.acquire",
    actorId: first,
    payload: {
      canonicalKnowledgeId: "epistemic-fixture.example-knowledge",
      awareness: "examined",
      stance: "accepts",
      confidence: 0.7,
      understanding: 0.4,
      basisRefs: ["evidence:first"],
      source: "direct-observation",
    },
  });

  const firstView = simulation.project({ id: "epistemic-state.holder", params: { holderId: first } });
  const secondView = simulation.project({ id: "epistemic-state.holder", params: { holderId: second } });
  assert.equal((firstView.data?.records as unknown[])?.length, 1);
  assert.deepEqual(secondView.data?.records, []);

  const record = simulation.worldView().listEntities({ kind: EpistemicKinds.record })[0]!;
  const heldByFirst = simulation.worldView().listRelations({ type: EpistemicRelations.holds, from: first, to: record.id });
  const heldBySecond = simulation.worldView().listRelations({ type: EpistemicRelations.holds, from: second, to: record.id });
  assert.equal(heldByFirst.length, 1);
  assert.equal(heldBySecond.length, 0);
});

test("a holder can revise stance, confidence and understanding without changing the KnowledgeDefinition", () => {
  const simulation = new Simulation({ worldSeed: 13002, modules: [epistemicStateModule, fixtureModule] });
  const holderId = spawn(simulation, "Researcher");
  must(simulation, {
    type: "epistemic-state.acquire",
    actorId: holderId,
    payload: {
      canonicalKnowledgeId: "epistemic-fixture.example-knowledge",
      stance: "accepts",
      confidence: 0.9,
      understanding: 0.3,
      basisRefs: ["source:a"],
    },
  });

  const record = simulation.worldView().listEntities({ kind: EpistemicKinds.record })[0]!;
  must(simulation, {
    type: "epistemic-state.revise",
    actorId: holderId,
    targetId: record.id,
    payload: {
      stance: "rejects",
      confidence: 0.8,
      understanding: 0.75,
      basisRefs: ["source:b"],
    },
  });

  const revised = simulation.worldView().getComponent(record.id, EpistemicComponents.record) ?? {};
  assert.equal(revised.stance, "rejects");
  assert.equal(revised.confidence, 0.8);
  assert.equal(revised.understanding, 0.75);
  assert.deepEqual(revised.basisRefs, ["source:a", "source:b"]);

  const definition = simulation.definitions.knowledge.get("epistemic-fixture.example-knowledge");
  assert.ok(definition);
  assert.equal(definition.description, "Fixture content used to test holder-specific epistemic state.");
});

test("a scientific Insight gives only its thinker a personal epistemic record", () => {
  const simulation = new Simulation({
    worldSeed: 13003,
    modules: [practiceRuntimeModule, epistemicStateModule, scienceResearchModule, fixtureModule],
  });
  const thinker = spawn(simulation, "Thinker");
  const bystander = spawn(simulation, "Bystander");

  must(simulation, {
    type: "practice-runtime.start",
    actorId: thinker,
    payload: {
      definitionId: ScienceResearchDefinitions.magneticDirection,
      goal: "understand magnetic direction",
      decisionMode: "manual",
    },
  });
  simulation.advanceBy(3);
  const practice = simulation.worldView().listEntities({ kind: "practice-runtime.practice" })[0]!;
  const practiceState = simulation.worldView().getComponent(practice.id, "practice-runtime.practice") ?? {};
  const checkpointId = String(practiceState.activeCheckpointId ?? "");
  must(simulation, {
    type: "practice-runtime.resolve_checkpoint",
    actorId: thinker,
    targetId: checkpointId,
    payload: { checkpointId, actionId: "propose-stable-direction" },
  });

  const thinkerView = simulation.project({ id: "epistemic-state.holder", params: { holderId: thinker } });
  const thinkerRecords = thinkerView.data?.records as Array<Record<string, unknown>>;
  assert.equal(thinkerRecords.length, 1);
  assert.equal(thinkerRecords[0]?.canonicalKnowledgeId, ScienceResearchKnowledge.magneticDirectionPattern);
  assert.equal(thinkerRecords[0]?.awareness, "examined");
  assert.equal(thinkerRecords[0]?.stance, "accepts");
  assert.equal(thinkerRecords[0]?.confidence, 0.62);
  assert.equal(thinkerRecords[0]?.understanding, 0.45);

  const bystanderView = simulation.project({ id: "epistemic-state.holder", params: { holderId: bystander } });
  assert.deepEqual(bystanderView.data?.records, []);

  const acquired = simulation.history.view().listEvents({ type: "epistemic-state.acquired" })[0];
  assert.ok(acquired);
  assert.equal(acquired.actorId, thinker);
  assert.equal(acquired.data.canonicalKnowledgeId, ScienceResearchKnowledge.magneticDirectionPattern);
});
