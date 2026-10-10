import { test } from "node:test";
import assert from "node:assert/strict";
import {
  historicalMemoryModule,
  HistoricalMemoryComponents as HC,
  HistoricalMemoryKinds as HK,
  HistoricalMemoryRelations as HR,
} from "@openlife/module-historical-memory";
import { earlyCivilizationModule } from "@openlife/module-early-civilization";
import { familyModule } from "@openlife/module-family";
import { modernWorldModule } from "@openlife/module-modern-world";
import { Simulation } from "@openlife/simulation";

const YEAR = 12;

function must(sim: Simulation, intent: Parameters<Simulation["dispatch"]>[0]) {
  const result = sim.dispatch(intent);
  assert.equal(result.ok, true, result.errors.map((error) => error.message).join("; "));
}

function onlyEntity(sim: Simulation, kind: string) {
  const list = sim.worldView().listEntities({ kind, includeArchived: true });
  assert.equal(list.length, 1);
  return list[0]!;
}

test("world truth, surviving evidence and public historical memory can diverge then reconcile", () => {
  const sim = new Simulation({
    worldSeed: 8101,
    modules: [
      modernWorldModule,
      familyModule,
      earlyCivilizationModule,
      historicalMemoryModule,
    ],
  });
  must(sim, { type: "modern.initialize_world" });
  must(sim, {
    type: "modern.create_character",
    payload: {
      givenName: "陶",
      familyName: "禾",
      lifespan: 95,
      lineageId: "family:lineage:memory",
    },
  });

  const creatorId = String(
    sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId,
  );
  sim.advanceBy(14 * YEAR);
  must(sim, {
    type: "early-civilization.take_role",
    actorId: creatorId,
    payload: { role: "craftsperson" },
  });

  must(sim, {
    type: "historical-memory.create_work",
    actorId: creatorId,
    payload: {
      title: "灰陶火候法",
      category: "craft",
      contentKey: "kiln-control",
      medium: "clay",
      markCreator: true,
    },
  });

  const work = onlyEntity(sim, HK.work);
  const original = onlyEntity(sim, HK.artifact);
  assert.equal(work.components[HC.work]?.creatorId, creatorId, "world truth keeps the real creator");
  assert.equal(original.components[HC.artifact]?.attributionCreatorId, creatorId);

  const peopleBefore = sim.worldView().listEntities({ kind: "modern.character" }).length;
  const inventedFriend = sim.dispatch({ type: "family.make_friend", actorId: creatorId,
    payload: { targetName: "从未见过的人" } });
  assert.equal(inventedFriend.ok, false, "friendship cannot invent someone from a label");
  assert.equal(sim.worldView().listEntities({ kind: "modern.character" }).length, peopleBefore);

  // A second real character copies the technique: friendship must never
  // spawn a stranger on demand merely to fabricate a witness.
  must(sim, { type: "modern.create_character", payload: {
    givenName: "予", familyName: "河", lifespan: 95, lineageId: "family:lineage:copyist",
  } });
  const copyistId = sim.worldView().listEntities({ kind: "modern.character" })
    .find((person) => person.id !== creatorId)?.id;
  assert.ok(copyistId && copyistId !== creatorId);
  must(sim, { type: "family.make_friend", actorId: creatorId, targetId: copyistId });

  must(sim, {
    type: "historical-memory.copy_artifact",
    actorId: copyistId,
    targetId: original.id,
    payload: { medium: "clay", preserveAttribution: false },
  });

  const artifacts = sim.worldView().listEntities({ kind: HK.artifact });
  assert.equal(artifacts.length, 2);
  const copy = artifacts.find((entity) => entity.id !== original.id);
  assert.ok(copy);

  // The original disappears. Civilization can still see the copied technique,
  // but the direct creator evidence has vanished.
  must(sim, { type: "historical-memory.lose_artifact", targetId: original.id });
  const creatorFootprintAfterLoss = sim.project({
    id: "historical-memory.subject_footprint",
    params: { subjectId: creatorId },
  });
  assert.equal(creatorFootprintAfterLoss.ok, true);
  assert.equal(creatorFootprintAfterLoss.data?.state, "forgotten");

  // Later people incorrectly attribute the surviving copy to its copyist.
  must(sim, {
    type: "historical-memory.form_claim",
    actorId: copyistId,
    payload: {
      workId: work.id,
      attributedEntityId: copyistId,
      evidenceArtifactIds: [copy.id],
    },
  });

  const rememberedWrong = sim.project({
    id: "historical-memory.work_memory",
    params: { workId: work.id },
  });
  assert.equal(rememberedWrong.ok, true);
  assert.equal(rememberedWrong.data?.memoryState, "attributed");
  assert.equal(
    (rememberedWrong.data?.publicAttribution as { entityId: string })?.entityId,
    copyistId,
  );

  // The actual creator dies. World truth and event history survive the person.
  must(sim, { type: "modern.die", actorId: creatorId, payload: { cause: "old age" } });
  assert.notEqual(sim.worldView().getEntity(creatorId)?.archivedAt, undefined);
  assert.equal(work.components[HC.work]?.creatorId, creatorId);

  // Centuries later the original marked object is rediscovered. The public
  // claim is revised from the copyist back to the actual creator.
  sim.advanceBy(240 * YEAR);
  must(sim, { type: "historical-memory.rediscover_artifact", targetId: original.id });

  const rememberedCorrectly = sim.project({
    id: "historical-memory.work_memory",
    params: { workId: work.id },
  });
  assert.equal(
    (rememberedCorrectly.data?.publicAttribution as { entityId: string })?.entityId,
    creatorId,
  );
  assert.equal(
    (rememberedCorrectly.data?.publicAttribution as { status: string })?.status,
    "revised",
  );
  const claimsAfterRediscovery = sim.worldView().listEntities({ kind: HK.claim });
  const disputedOldClaim = claimsAfterRediscovery.find((entity) =>
    entity.components[HC.claim]?.attributedEntityId === copyistId
  );
  const correctedClaim = claimsAfterRediscovery.find((entity) =>
    entity.components[HC.claim]?.attributedEntityId === creatorId
  );
  assert.equal(disputedOldClaim?.components[HC.claim]?.status, "disputed");
  assert.ok(["revised", "supported"].includes(String(correctedClaim?.components[HC.claim]?.status)));

  const creatorFootprintRestored = sim.project({
    id: "historical-memory.subject_footprint",
    params: { subjectId: creatorId },
  });
  assert.equal(creatorFootprintRestored.data?.state, "remembered");

  sim.syncHistory();
  assert.ok(
    sim.history.records.some((record) => record.type === "historical-memory.claim_revised"),
    "the correction itself becomes history",
  );
});

test("an early-civilization legacy becomes a work and material evidence when memory is installed", () => {
  const sim = new Simulation({
    worldSeed: 8104,
    modules: [
      modernWorldModule,
      familyModule,
      earlyCivilizationModule,
      historicalMemoryModule,
    ],
  });
  must(sim, { type: "modern.initialize_world" });
  must(sim, {
    type: "modern.create_character",
    payload: { givenName: "启", familyName: "禾", lifespan: 90 },
  });
  const actorId = String(
    sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId,
  );
  sim.advanceBy(14 * YEAR);
  must(sim, {
    type: "early-civilization.take_role",
    actorId,
    payload: { role: "craftsperson" },
  });
  must(sim, { type: "early-civilization.leave_legacy", actorId });

  const works = sim.worldView().listEntities({ kind: HK.work });
  const artifacts = sim.worldView().listEntities({ kind: HK.artifact });
  assert.equal(works.length, 1);
  assert.equal(artifacts.length, 1);
  assert.equal(works[0]?.components[HC.work]?.category, "craft-legacy");
  assert.equal(artifacts[0]?.components[HC.artifact]?.medium, "clay");
  assert.equal(
    sim.worldView().listRelations({
      type: HR.embodies,
      from: artifacts[0]?.id,
      to: works[0]?.id,
    }).length,
    1,
  );
});

test("visible creator marks can support a provisional public attribution before a formal claim exists", () => {
  const sim = new Simulation({
    worldSeed: 8105,
    modules: [modernWorldModule, historicalMemoryModule],
  });
  must(sim, { type: "modern.initialize_world" });
  must(sim, {
    type: "modern.create_character",
    payload: { givenName: "署", familyName: "名", lifespan: 90 },
  });
  const creatorId = String(
    sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId,
  );

  must(sim, {
    type: "historical-memory.create_work",
    actorId: creatorId,
    payload: {
      title: "有署名的陶片",
      medium: "clay",
      markCreator: true,
    },
  });
  const work = onlyEntity(sim, HK.work);
  const publicView = sim.project({
    id: "historical-memory.work_memory",
    params: { workId: work.id },
  });

  assert.equal(publicView.data?.memoryState, "attributed_evidence");
  assert.equal(
    (publicView.data?.publicAttribution as { entityId: string })?.entityId,
    creatorId,
  );
  assert.equal(
    (publicView.data?.publicAttribution as { status: string })?.status,
    "evidence_only",
  );
  assert.deepEqual(publicView.data?.claims, []);
});

test("public memory projection never leaks the hidden world-truth creator field", () => {
  const sim = new Simulation({
    worldSeed: 8102,
    modules: [modernWorldModule, historicalMemoryModule],
  });
  must(sim, { type: "modern.initialize_world" });
  must(sim, {
    type: "modern.create_character",
    payload: { givenName: "无名", familyName: "人", lifespan: 90 },
  });
  const creatorId = String(
    sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId,
  );

  must(sim, {
    type: "historical-memory.create_work",
    actorId: creatorId,
    payload: {
      title: "无名刻痕",
      medium: "stone",
      markCreator: false,
    },
  });
  const work = onlyEntity(sim, HK.work);
  const publicView = sim.project({
    id: "historical-memory.work_memory",
    params: { workId: work.id },
  });
  assert.equal(publicView.ok, true);
  const publicJson = JSON.stringify(publicView.data);
  assert.equal(publicJson.includes(creatorId), false);
  assert.equal(publicJson.includes("creatorId"), false);
  assert.equal(publicView.data?.memoryState, "anonymous_trace");

  // Yet the full world state still preserves the truth for deterministic
  // simulation/debugging and future evidence recovery.
  assert.equal(work.components[HC.work]?.creatorId, creatorId);
});

test("copies and fragments can preserve only part of a multi-segment work", () => {
  const sim = new Simulation({
    worldSeed: 8110,
    modules: [modernWorldModule, historicalMemoryModule],
  });
  must(sim, { type: "modern.initialize_world" });
  must(sim, {
    type: "modern.create_character",
    payload: { givenName: "书", familyName: "人", lifespan: 90 },
  });
  const creatorId = String(
    sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId,
  );
  const segments = Array.from({ length: 20 }, (_, index) => `篇${index + 1}`);

  must(sim, {
    type: "historical-memory.create_work",
    actorId: creatorId,
    payload: {
      title: "二十篇旧书",
      medium: "bamboo",
      markCreator: true,
      segments,
    },
  });
  const work = onlyEntity(sim, HK.work);
  const original = onlyEntity(sim, HK.artifact);

  must(sim, {
    type: "historical-memory.copy_artifact",
    actorId: creatorId,
    targetId: original.id,
    payload: { medium: "bamboo", fidelity: 0.65, preserveAttribution: true },
  });
  const copy = sim.worldView()
    .listEntities({ kind: HK.artifact })
    .find((entity) => entity.id !== original.id);
  assert.ok(copy);
  assert.equal((copy.components[HC.artifact]?.retainedSegments as unknown[])?.length, 13);
  assert.equal(copy.components[HC.artifact]?.contentIntegrity, 0.65);

  must(sim, { type: "historical-memory.lose_artifact", targetId: original.id });
  must(sim, {
    type: "historical-memory.damage_artifact",
    targetId: copy.id,
    payload: { retainRatio: 0.5, retainAttribution: true },
  });

  const damaged = sim.worldView().getEntity(copy.id);
  const damagedSegments = damaged?.components[HC.artifact]?.retainedSegments as unknown[];
  assert.equal(damagedSegments.length, 7);
  assert.ok(Number(damaged?.components[HC.artifact]?.contentIntegrity ?? 1) < 0.4);

  const publicView = sim.project({
    id: "historical-memory.work_memory",
    params: { workId: work.id },
  });
  assert.equal(publicView.ok, true);
  assert.equal(publicView.data?.knownSegmentCount, 7);
  assert.equal(publicView.data?.contentState, "fragmentary");
  assert.deepEqual(
    new Set(publicView.data?.knownSegments as string[]),
    new Set(damagedSegments as string[]),
  );
});

test("a claim becomes uncertain when its last visible evidence disappears", () => {
  const sim = new Simulation({
    worldSeed: 8111,
    modules: [modernWorldModule, historicalMemoryModule],
  });
  must(sim, { type: "modern.initialize_world" });
  must(sim, {
    type: "modern.create_character",
    payload: { givenName: "史", familyName: "官", lifespan: 90 },
  });
  const creatorId = String(
    sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId,
  );
  must(sim, {
    type: "historical-memory.create_work",
    actorId: creatorId,
    payload: { title: "有署名的石刻", medium: "stone", markCreator: true },
  });
  const work = onlyEntity(sim, HK.work);
  const artifact = onlyEntity(sim, HK.artifact);
  must(sim, {
    type: "historical-memory.form_claim",
    actorId: creatorId,
    payload: {
      workId: work.id,
      attributedEntityId: creatorId,
      evidenceArtifactIds: [artifact.id],
    },
  });
  const claim = onlyEntity(sim, HK.claim);
  assert.equal(claim.components[HC.claim]?.status, "supported");

  must(sim, { type: "historical-memory.lose_artifact", targetId: artifact.id });
  const weakened = sim.worldView().getEntity(claim.id);
  assert.equal(weakened?.components[HC.claim]?.status, "uncertain");
  assert.ok(Number(weakened?.components[HC.claim]?.confidence ?? 1) <= 0.45);
});

test("historical notability emerges from surviving evidence rather than a fame flag", () => {
  const sim = new Simulation({
    worldSeed: 8112,
    modules: [modernWorldModule, historicalMemoryModule],
  });
  must(sim, { type: "modern.initialize_world" });
  must(sim, {
    type: "modern.create_character",
    payload: { givenName: "名", familyName: "匠", lifespan: 90 },
  });
  const creatorId = String(
    sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId,
  );
  must(sim, {
    type: "historical-memory.create_work",
    actorId: creatorId,
    payload: {
      title: "反复传抄的技艺",
      medium: "clay",
      markCreator: true,
      segments: ["法一", "法二", "法三"],
    },
  });
  const original = onlyEntity(sim, HK.artifact);
  for (let i = 0; i < 4; i += 1) {
    must(sim, {
      type: "historical-memory.copy_artifact",
      actorId: creatorId,
      targetId: original.id,
      payload: { medium: "clay", fidelity: 1, preserveAttribution: true },
    });
  }

  const footprint = sim.project({
    id: "historical-memory.subject_footprint",
    params: { subjectId: creatorId },
  });
  assert.equal(footprint.data?.state, "influential");

  const notable = sim.project({ id: "historical-memory.notable_subjects", params: {} });
  const subjects = notable.data?.subjects as { subjectId: string; state: string }[];
  assert.ok(subjects.some((subject) =>
    subject.subjectId === creatorId && subject.state === "influential"
  ));

  const overview = sim.project({ id: "historical-memory.public_overview", params: {} });
  assert.equal(overview.data?.visibleWorkCount, 1);
});

test("material preservation can be scheduled without hard-coding a calendar into the module", () => {
  const sim = new Simulation({
    worldSeed: 8103,
    modules: [modernWorldModule, historicalMemoryModule],
  });
  must(sim, { type: "modern.initialize_world" });
  must(sim, {
    type: "modern.create_character",
    payload: { givenName: "记", familyName: "录", lifespan: 90 },
  });
  const creatorId = String(
    sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId,
  );

  must(sim, {
    type: "historical-memory.create_work",
    actorId: creatorId,
    payload: {
      title: "口述歌谣",
      medium: "oral",
      markCreator: true,
      preservationIntervalTicks: 1,
    },
  });
  const artifact = onlyEntity(sim, HK.artifact);
  const before = artifact.components[HC.artifact]?.condition;

  // Same seed means the preservation sequence is deterministic. We only assert
  // that the generic task can eventually change evidence; the module itself
  // does not know what a "year" is.
  sim.advanceBy(20);
  const after = sim.worldView().getEntity(artifact.id)?.components[HC.artifact]?.condition;
  assert.notEqual(after, before);
  assert.ok(["fragmented", "lost"].includes(String(after)));

  assert.equal(
    sim.worldView().listRelations({ type: HR.embodies, from: artifact.id }).length,
    1,
  );
});
