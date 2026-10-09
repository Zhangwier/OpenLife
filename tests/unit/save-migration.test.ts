/**
 * SAVE-001: legacy saves keep their assets when the M1 world scale arrives.
 *
 * `OPEN_WORLD_REQUIREMENTS.md` SAVE-001 forbids silently dropping existing
 * works, partners, children or identities, and asks for either a migration or
 * an explicit compatibility limit. The M1 decision (TIME-RFC-001 搂5) is to add
 * no implicit conversion: an old save keeps the meaning it was written with and
 * gains the new systems only when the player asks for them.
 *
 * This file guards that promise end to end, with a legacy life that actually
 * has something to lose.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule, TICKS_PER_YEAR } from "@openlife/module-modern-world";
import { familyModule } from "@openlife/module-family";
import { earlyCivilizationModule } from "@openlife/module-early-civilization";
import { practiceRuntimeModule } from "@openlife/module-practice-runtime";
import { craftPotteryModule } from "@openlife/module-craft-pottery";
import { settlementLifeModule } from "@openlife/module-settlement-life";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import { settlementLocationsModule, SettlementCommands, SettlementId } from "@openlife/module-settlement-locations";
import { runPlayerAction, playerView } from "../../apps/web/src/player.ts";
import { DAYS_PER_MONTH } from "@openlife/life-contracts";

/** The module set a save written before M1 would have been loaded with. */
const LEGACY_MODULES = [
  modernWorldModule,
  familyModule,
  earlyCivilizationModule,
  practiceRuntimeModule,
  craftPotteryModule,
  settlementLifeModule,
];

/** The module set a new world gets after M1. */
const M1_MODULES = [
  modernWorldModule,
  worldClockModule,
  worldSpaceModule,
  worldObjectsModule,
  settlementLocationsModule,
  familyModule,
  earlyCivilizationModule,
  practiceRuntimeModule,
  craftPotteryModule,
  settlementLifeModule,
];

/**
 * Builds a legacy life that has something real to lose: a finished vessel kept
 * in the family, a spouse, and a child.
 */
function legacyLife() {
  const sim = new Simulation({ worldSeed: 640, modules: LEGACY_MODULES });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "启", familyName: "禾", lifespan: 90 } });
  sim.advanceBy(16 * TICKS_PER_YEAR);
  const id = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);

  runPlayerAction(sim, id, "life-enter");
  runPlayerAction(sim, id, "life-study");
  runPlayerAction(sim, id, "pottery-start");
  for (const actionId of ["screen-and-knead", "coil-balanced", "slow-shade", "staged-preheat"]) {
    const checkpointId = playerView(sim, id).practice?.interaction.checkpointId;
    assert.equal(runPlayerAction(sim, id, "pottery-choice", { checkpointId, actionId }).ok, true);
  }
  const vesselId = playerView(sim, id).vessels[0].id;
  assert.equal(runPlayerAction(sim, id, "life-dispose", { vesselId, mode: "keep" }).ok, true);

  sim.advanceBy(2 * TICKS_PER_YEAR);
  const peer = playerView(sim, id).people.find((person: { name: string }) => person.name === "阿予").id;
  runPlayerAction(sim, id, "life-help", { targetId: peer });
  runPlayerAction(sim, id, "life-visit", { targetId: peer });
  assert.equal(runPlayerAction(sim, id, "life-marry", { targetId: peer }).ok, true);
  assert.equal(runPlayerAction(sim, id, "life-child").ok, true);
  sim.advanceBy(10);

  const childId = sim.worldView().listRelations({ type: "family.parent_of", from: id }).map((relation) => relation.to)[0];
  assert.ok(childId, "the legacy life must have a child to lose");
  return { sim, id, peer, childId, vesselId };
}

test("a legacy save keeps its work, partner and child when it loads into the M1 world", () => {
  const { sim: before, id, peer, childId, vesselId } = legacyLife();
  const save = before.save();

  const loaded = Simulation.load(save, M1_MODULES);
  assert.equal(loaded.result.ok, true, loaded.result.errors.map((error) => error.message).join("; "));
  const after = loaded.simulation!;

  // No silent clock conversion: the tick is the tick the old world wrote.
  assert.equal(after.tick, before.tick);
  assert.equal(
    JSON.stringify(after.worldView().getComponent(id, "modern.identity")),
    JSON.stringify(before.worldView().getComponent(id, "modern.identity")),
  );
  assert.equal(
    JSON.stringify(after.worldView().getComponent(id, "settlement-life.state")),
    JSON.stringify(before.worldView().getComponent(id, "settlement-life.state")),
  );

  // The finished vessel survives, still fired, still the maker's.
  const vessels = playerView(after, id).vessels;
  assert.equal(vessels.length, 1);
  assert.equal(vessels[0].id, vesselId);
  assert.equal(vessels[0].status, "fired");
  assert.deepEqual(playerView(after, id).familyWorks, playerView(before, id).familyWorks);

  // Partner and child are untouched, including when the child was born.
  assert.equal(after.worldView().getEntity(peer)?.archivedAt, before.worldView().getEntity(peer)?.archivedAt);
  assert.equal(after.worldView().getEntity(childId)?.archivedAt, before.worldView().getEntity(childId)?.archivedAt);
  assert.equal(
    after.worldView().getComponent(childId, "modern.identity")?.bornAt,
    before.worldView().getComponent(childId, "modern.identity")?.bornAt,
  );
  assert.deepEqual(playerView(after, id).children, playerView(before, id).children);

  // Loading does not quietly add the new world systems.
  assert.equal(after.worldView().getComponent("modern:world", "world-clock.clock"), undefined);
  assert.equal(after.worldView().getEntity(SettlementId), undefined);

  // And nothing is half-applied: the loaded world still runs normally.
  const step = after.dispatch({ type: SettlementCommands.step, actorId: id });
  assert.equal(step.ok, true, step.errors.map((error) => error.message).join("; "));
  after.advanceBy(DAYS_PER_MONTH);
  assert.equal(after.worldView().getEntity(childId)?.archivedAt, undefined);
});

test("the settlement can be founded later without disturbing an existing life", () => {
  const { sim: before, id, childId, vesselId } = legacyLife();
  const loaded = Simulation.load(before.save(), M1_MODULES);
  const after = loaded.simulation!;

  const identityBefore = JSON.stringify(after.worldView().getComponent(id, "modern.identity"));
  const founded = after.dispatch({ type: SettlementCommands.found, payload: {} });
  assert.equal(founded.ok, true, founded.errors.map((error) => error.message).join("; "));

  // The new content arrives without rewriting the old one.
  assert.ok(after.worldView().getEntity(SettlementId));
  assert.equal(JSON.stringify(after.worldView().getComponent(id, "modern.identity")), identityBefore);
  assert.equal(playerView(after, id).vessels[0].id, vesselId);
  assert.equal(after.worldView().getEntity(childId)?.archivedAt, undefined);
  assert.equal(after.tick, before.tick);

  // The world is now save-recoverable as an M1 world too.
  const roundTrip = Simulation.load(after.save(), M1_MODULES);
  assert.equal(roundTrip.result.ok, true);
  assert.equal(roundTrip.simulation!.fingerprint(), after.fingerprint());
});

test("a save keeps its exact state through an M1 round trip including the new systems", () => {
  const sim = new Simulation({ worldSeed: 88, modules: M1_MODULES });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "启", familyName: "禾", lifespan: 90 } });
  const id = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  assert.equal(sim.dispatch({ type: SettlementCommands.found, payload: {} }).ok, true);
  assert.equal(sim.dispatch({ type: SettlementCommands.arrive, actorId: id, payload: { placeId: "place:yard" } }).ok, true);
  sim.advanceBy(45);

  const loaded = Simulation.load(sim.save(), M1_MODULES);
  assert.equal(loaded.result.ok, true);
  const after = loaded.simulation!;
  assert.equal(after.fingerprint(), sim.fingerprint());
  assert.ok(after.worldView().getEntity(SettlementId));
  assert.equal(
    after.worldView().getComponent("modern:world", "world-clock.clock")?.monthsElapsed,
    sim.worldView().getComponent("modern:world", "world-clock.clock")?.monthsElapsed,
  );
});

test("a save from a world without the settlement still loads when the settlement pack is added", () => {
  // The narrowest legacy case: only the world pack, no life modules at all.
  const bare = new Simulation({ worldSeed: 5, modules: [modernWorldModule] });
  bare.dispatch({ type: "modern.initialize_world" });
  bare.dispatch({ type: "modern.create_character", payload: { givenName: "旧", familyName: "禾" } });
  bare.advanceBy(30 * TICKS_PER_YEAR);
  const bareId = String(bare.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);

  const loaded = Simulation.load(bare.save(), M1_MODULES);
  assert.equal(loaded.result.ok, true);
  const after = loaded.simulation!;
  assert.equal(after.tick, bare.tick);
  assert.deepEqual(
    after.worldView().getComponent(bareId, "modern.identity"),
    bare.worldView().getComponent(bareId, "modern.identity"),
  );
  assert.equal(after.worldView().getEntity(SettlementId), undefined, "no settlement is invented on load");
});
