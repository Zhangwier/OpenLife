import { test } from "node:test";
import assert from "node:assert/strict";
import { modernWorldModule } from "@openlife/module-modern-world";
import { familyModule } from "@openlife/module-family";
import {
  historicalMemoryModule,
  HistoricalMemoryComponents as HC,
  HistoricalMemoryKinds as HK,
} from "@openlife/module-historical-memory";
import {
  intellectualHistoryModule,
  IntellectualComponents as IC,
  IntellectualKinds as IK,
  IntellectualRelations as IR,
} from "@openlife/module-intellectual-history";
import { Simulation } from "@openlife/simulation";

function must(sim: Simulation, intent: Parameters<Simulation["dispatch"]>[0]) {
  const result = sim.dispatch(intent);
  assert.equal(result.ok, true, result.errors.map((error) => error.message).join("; "));
}

function createPerson(sim: Simulation, givenName: string): string {
  must(sim, {
    type: "modern.create_character",
    payload: { givenName, familyName: "氏", lifespan: 90 },
  });
  return sim.worldView().listEntities({ kind: "modern.character" }).at(-1)!.id;
}

test("idea -> teaching -> historical transmission -> school -> community influence forms one chain", () => {
  const sim = new Simulation({
    worldSeed: 9201,
    modules: [
      modernWorldModule,
      familyModule,
      historicalMemoryModule,
      intellectualHistoryModule,
    ],
  });
  must(sim, { type: "modern.initialize_world" });
  const founderId = createPerson(sim, "思");
  const studentId = createPerson(sim, "学");

  must(sim, {
    type: "intellectual-history.propose_idea",
    actorId: founderId,
    payload: {
      title: "共生之道",
      thesis: "共同体的长久来自相互承担，而不只是个人力量。",
      principles: ["相互承担", "经验应被传给后来者", "公共决定需要听见不同声音"],
      medium: "oral",
      markCreator: true,
    },
  });

  const idea = sim.worldView().listEntities({ kind: IK.idea })[0]!;
  assert.equal(idea.components[IC.idea]?.title, "共生之道");
  assert.equal(sim.worldView().listEntities({ kind: HK.work }).length, 1);
  const originalArtifact = sim.worldView().listEntities({ kind: HK.artifact })[0]!;
  assert.equal(
    sim.worldView().listEntities({ kind: HK.work })[0]?.components[HC.work]?.sourceEntityId,
    idea.id,
  );
  assert.equal(
    sim.worldView().listRelations({ type: IR.documentedBy, from: idea.id }).length,
    1,
  );

  must(sim, {
    type: "intellectual-history.teach_idea",
    actorId: founderId,
    targetId: studentId,
    payload: {
      ideaId: idea.id,
      medium: "oral",
      fidelity: 0.67,
      preserveAttribution: true,
    },
  });
  assert.equal(
    sim.worldView().listRelations({ type: IR.embraces, from: studentId, to: idea.id }).length,
    1,
  );
  const artifacts = sim.worldView().listEntities({ kind: HK.artifact });
  assert.equal(artifacts.length, 2, "teaching creates a historical transmission when memory is installed");
  const oralCopy = artifacts.find((artifact) => artifact.id !== originalArtifact.id)!;
  assert.ok(Number(oralCopy.components[HC.artifact]?.contentIntegrity ?? 1) < 1);

  must(sim, {
    type: "intellectual-history.form_school",
    actorId: founderId,
    payload: { ideaId: idea.id, name: "共生之学" },
  });
  const school = sim.worldView().listEntities({ kind: IK.school })[0]!;
  assert.equal(school.components[IC.school]?.name, "共生之学");
  assert.equal(sim.worldView().listRelations({ type: IR.memberOf, to: school.id }).length, 2);

  must(sim, {
    type: "intellectual-history.apply_idea",
    actorId: founderId,
    targetId: "modern:city:north",
    payload: { ideaId: idea.id, strength: 0.7 },
  });

  const publicIdea = sim.project({
    id: "intellectual-history.idea",
    params: { ideaId: idea.id },
  });
  assert.equal(publicIdea.data?.adherentCount, 2);
  assert.equal(publicIdea.data?.schoolCount, 1);
  assert.equal(publicIdea.data?.influenceCount, 1);
  assert.equal(publicIdea.data?.documentedWorkCount, 1);
});

test("a student can reinterpret a tradition into a documented branch without mutating the parent", () => {
  const sim = new Simulation({
    worldSeed: 9202,
    modules: [
      modernWorldModule,
      historicalMemoryModule,
      intellectualHistoryModule,
    ],
  });
  must(sim, { type: "modern.initialize_world" });
  const founderId = createPerson(sim, "师");
  const studentId = createPerson(sim, "徒");

  must(sim, {
    type: "intellectual-history.propose_idea",
    actorId: founderId,
    payload: {
      title: "守序说",
      thesis: "稳定来自遵循共同约定。",
      principles: ["守约", "秩序"],
      markCreator: true,
    },
  });
  const parent = sim.worldView().listEntities({ kind: IK.idea })[0]!;
  must(sim, {
    type: "intellectual-history.teach_idea",
    actorId: founderId,
    targetId: studentId,
    payload: { ideaId: parent.id, preserveAttribution: true },
  });
  must(sim, {
    type: "intellectual-history.branch_idea",
    actorId: studentId,
    payload: {
      parentIdeaId: parent.id,
      title: "活约说",
      thesis: "共同约定应随现实修正，而不是永远不变。",
      principles: ["守约", "允许修订", "现实反馈"],
      markCreator: true,
    },
  });

  const ideas = sim.worldView().listEntities({ kind: IK.idea });
  assert.equal(ideas.length, 2);
  const branch = ideas.find((entity) => entity.id !== parent.id)!;
  assert.equal(
    sim.worldView().listRelations({ type: IR.derivedFrom, from: branch.id, to: parent.id }).length,
    1,
  );
  assert.equal(parent.components[IC.idea]?.thesis, "稳定来自遵循共同约定。");
  assert.equal(branch.components[IC.idea]?.thesis, "共同约定应随现实修正，而不是永远不变。");
  assert.equal(sim.worldView().listEntities({ kind: HK.work }).length, 2);

  const overview = sim.project({ id: "intellectual-history.overview", params: {} });
  const traditions = overview.data?.traditions as { id: string; branchCount: number; parentIdeaId: string | null }[];
  assert.equal(traditions.find((idea) => idea.id === parent.id)?.branchCount, 1);
  assert.equal(traditions.find((idea) => idea.id === branch.id)?.parentIdeaId, parent.id);
});

test("intellectual history remains usable when Historical Memory is absent", () => {
  const sim = new Simulation({
    worldSeed: 9203,
    modules: [modernWorldModule, intellectualHistoryModule],
  });
  must(sim, { type: "modern.initialize_world" });
  const founderId = createPerson(sim, "独");
  const studentId = createPerson(sim, "行");

  must(sim, {
    type: "intellectual-history.propose_idea",
    actorId: founderId,
    payload: {
      title: "简朴说",
      thesis: "少一些占有，能留下更多选择。",
    },
  });
  const idea = sim.worldView().listEntities({ kind: IK.idea })[0]!;
  must(sim, {
    type: "intellectual-history.teach_idea",
    actorId: founderId,
    targetId: studentId,
    payload: { ideaId: idea.id },
  });
  must(sim, {
    type: "intellectual-history.form_school",
    actorId: founderId,
    payload: { ideaId: idea.id },
  });

  assert.equal(sim.worldView().listEntities({ kind: IK.school }).length, 1);
  assert.equal(sim.definitions.components.has("historical-memory.work"), false);
});
