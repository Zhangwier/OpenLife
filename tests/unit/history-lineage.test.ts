/**
 * Sections 31-39 and INV-006: history outlives entities, and lineage
 * continuity carries an ancestor's deeds to later generations.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TICKS_PER_YEAR,
  activeCharacterId,
  advanceToAge,
  advanceUntilDead,
  bootWorld,
  generation,
  isArchived,
  mustDispatch,
} from "../helpers/modern.ts";

test("history records survive the archival of their subject entity", () => {
  const { simulation, characterId } = bootWorld({ seed: 101, lifespan: 70 });
  mustDispatch(simulation, {
    type: "career.start_business",
    actorId: characterId,
    payload: { name: "Stone Atelier", capital: 5_000 },
  });
  const before = simulation.history.listRecords({ entityId: characterId });
  assert.ok(before.length > 0, "creating a character and a business must record history");

  assert.equal(advanceUntilDead(simulation, characterId), true);
  assert.equal(isArchived(simulation, characterId), true);

  const after = simulation.history.listRecords({ entityId: characterId });
  assert.ok(after.length >= before.length, "history must not shrink when a character dies");
  assert.ok(
    after.some((record) => record.type === "career.business_founded"),
    "the business founding must remain in history",
  );
});

test("records are marked archived when their subject disappears, but are kept", () => {
  const { simulation, characterId } = bootWorld({ seed: 102, lifespan: 70 });
  advanceUntilDead(simulation, characterId);
  simulation.syncHistory();
  const records = simulation.history.listRecords({ entityId: characterId });
  assert.ok(records.length > 0);
  assert.ok(records.some((record) => record.subjectArchived === true));
});

test("an organisation outlives its founder and stays discoverable", () => {
  const { simulation, characterId } = bootWorld({ seed: 103, lifespan: 70 });
  mustDispatch(simulation, {
    type: "career.start_business",
    actorId: characterId,
    payload: { name: "Stone Atelier", capital: 5_000 },
  });
  advanceUntilDead(simulation, characterId);

  const atelier = simulation
    .worldView()
    .listEntities({ kind: "modern.organization", includeArchived: true })
    .find((entity) => entity.components["modern.organization"]?.name === "Stone Atelier");
  assert.ok(atelier, "the business entity must still exist");
  assert.equal(atelier.archivedAt, undefined, "the business must still be running");
});

test("three generations can be played and each inherits the previous chronicle", () => {
  const { simulation, characterId } = bootWorld({ seed: 104, startingCash: 20_000, lifespan: 85 });
  mustDispatch(simulation, {
    type: "career.start_business",
    actorId: characterId,
    payload: { name: "Stone Atelier", capital: 5_000 },
  });
  const lineageId = String(
    simulation.worldView().getEntity(characterId)?.components["modern.identity"]?.lineageId,
  );
  assert.ok(lineageId);

  // Generation 1 must reproduce before it dies, or there is nobody to switch to.
  assert.equal(advanceToAge(simulation, characterId, 22), true);
  mustDispatch(simulation, {
    type: "family.marry",
    actorId: characterId,
    payload: { spouseName: "Cy" },
  });
  mustDispatch(simulation, {
    type: "family.have_child",
    actorId: characterId,
    payload: { givenName: "Dan", lifespan: 85 },
  });

  assert.equal(advanceUntilDead(simulation, characterId), true);
  mustDispatch(simulation, { type: "modern.switch_generation" });
  const gen2 = activeCharacterId(simulation);
  assert.notEqual(gen2, characterId);
  assert.equal(generation(simulation), 2);

  assert.equal(advanceToAge(simulation, gen2, 19), true);
  mustDispatch(simulation, { type: "family.marry", actorId: gen2, payload: { spouseName: "Rin" } });
  mustDispatch(simulation, {
    type: "family.have_child",
    actorId: gen2,
    payload: { givenName: "Fen", lifespan: 85 },
  });

  assert.equal(advanceUntilDead(simulation, gen2), true);
  mustDispatch(simulation, { type: "modern.switch_generation" });
  const gen3 = activeCharacterId(simulation);
  assert.notEqual(gen3, gen2);
  assert.equal(generation(simulation), 3);

  const founding = simulation
    .history
    .listRecords({ minSignificance: 0.45 })
    .find((record) => record.type === "career.business_founded");
  assert.ok(founding, "generation 3 must still see the business founded by generation 1");

  const lineage = simulation.history.lineage(lineageId);
  assert.ok(lineage);
  assert.ok(lineage.members.length >= 3, "the lineage must contain at least three members");
});

test("causal explanations link events back to their causes", () => {
  const { simulation, characterId } = bootWorld({ seed: 105, lifespan: 70 });
  mustDispatch(simulation, {
    type: "career.start_business",
    actorId: characterId,
    payload: { name: "Stone Atelier", capital: 5_000 },
  });
  const founding = simulation
    .history
    .listRecords({ entityId: characterId })
    .find((record) => record.type === "career.business_founded");
  assert.ok(founding);
  const explanation = simulation.history.explain(founding.eventId);
  assert.ok(explanation);
  assert.equal(explanation.type, "career.business_founded");
  assert.ok(explanation.causes.length > 0, "the causing command must be traceable");
});

test("a full life can be lived from birth to death", () => {
  const { simulation, characterId } = bootWorld({ seed: 106, lifespan: 70 });
  assert.equal(advanceToAge(simulation, characterId, 6), true);
  mustDispatch(simulation, { type: "education.enroll_school", actorId: characterId });
  assert.equal(advanceToAge(simulation, characterId, 10), true);
  assert.equal(
    simulation.worldView().getComponent(characterId, "education.level")?.level,
    "higher",
  );
  assert.equal(advanceToAge(simulation, characterId, 18), true);
  mustDispatch(simulation, { type: "family.marry", actorId: characterId, payload: { spouseName: "Cy" } });
  mustDispatch(simulation, { type: "family.have_child", actorId: characterId, payload: { givenName: "Dan" } });
  assert.equal(advanceUntilDead(simulation, characterId), true);
  const vitals = simulation.worldView().getEntity(characterId)?.components["modern.vitals"];
  assert.equal(vitals?.alive, false);
  assert.ok(Number(vitals?.ageYears ?? 0) > 0);
  assert.ok(simulation.tick >= TICKS_PER_YEAR);
});
