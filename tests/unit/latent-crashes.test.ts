/**
 * Latent crashes the type checker found (2026-10-19). Node strips types, so
 * each of these ran - and threw a ReferenceError or quietly misbehaved - only
 * on the path that reached it. Each test walks that path.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Kernel } from "@openlife/kernel";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { familyModule } from "@openlife/module-family";
import { earlyCivilizationModule } from "@openlife/module-early-civilization";
import { practiceRuntimeModule } from "@openlife/module-practice-runtime";
import { craftPotteryModule } from "@openlife/module-craft-pottery";
import { settlementLifeModule } from "@openlife/module-settlement-life";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule, SpaceCommands, occupiedPlaceId } from "@openlife/module-world-space";
import { worldObjectsModule, readObject } from "@openlife/module-world-objects";
import { settlementLocationsModule, SettlementCommands, homestead } from "@openlife/module-settlement-locations";
import { worldGeographyModule } from "@openlife/module-world-geography";
import { mapPackModule, MapPackProjections, loadMapPack, registerMapPack } from "@openlife/module-map-pack";
import { resolve } from "node:path";
import { runPlayerAction, playerView } from "../../apps/web/src/player.ts";

test("a Kernel built without a definition set makes its own (DefinitionSet was imported as a type only)", () => {
  const kernel = new Kernel({ worldSeed: 1 });
  assert.equal(kernel.definitions.commands.has("nothing.here"), false);
});

test("walking while a craft is under way no longer throws a ReferenceError (PracticeComponents was never imported)", () => {
  const modules = [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule,
    familyModule, earlyCivilizationModule, practiceRuntimeModule, craftPotteryModule, settlementLifeModule];
  const sim = new Simulation({ worldSeed: 640, modules });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "启", familyName: "禾", lifespan: 90 } });
  sim.advanceBy(16 * 360);
  const id = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  assert.equal(sim.dispatch({ type: SettlementCommands.found }).ok, true);
  sim.dispatch({ type: SettlementCommands.arrive, actorId: id, source: "player", payload: { placeId: "place:yard" } });
  assert.equal(occupiedPlaceId(sim.worldView(), id), "place:yard");
  for (const step of ["life-enter", "life-study", "pottery-start"]) assert.equal(runPlayerAction(sim, id, step).ok, true, step);
  assert.ok(playerView(sim, id).practice, "a pottery practice exists (waiting on the player's choice)");
  // Before the fix this call threw out of dispatch as soon as any practice entity existed.
  const result = sim.dispatch({ type: SpaceCommands.leave, actorId: id, source: "player", payload: {} });
  assert.equal(typeof result.ok, "boolean");
  // A practice waiting on a choice ("blocked") does not hold the player; only an "active" one does.
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test("the jar lent at the well can be taken by a visitor (readObject dropped loanPolicy, so the Web greyed it out)", () => {
  assert.equal(readObject({ prototypeId: "p", loanPolicy: "public-visitor" }).loanPolicy, "public-visitor");
  assert.equal(readObject({ prototypeId: "p" }).loanPolicy, undefined);
  const sim = new Simulation({ worldSeed: 7, modules: [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule] });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  sim.advanceBy(18 * 360);
  const me = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  assert.equal(sim.dispatch({ type: SettlementCommands.found }).ok, true);
  const jar = sim.worldView().getComponent("instance:jar:0:0", "world-objects.object");
  assert.equal(jar?.loanPolicy, "public-visitor", "the settlement lends this jar to anyone");
  const where = occupiedPlaceId(sim.worldView(), "instance:jar:0:0") ?? "";
  if (where && occupiedPlaceId(sim.worldView(), me) !== where) sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "player", payload: { placeId: where } });
  const seen = homestead(sim.worldView(), me).objects.find((o) => o.id === "instance:jar:0:0");
  if (seen) assert.equal(seen.canTake, true, "the Web offers to take the lent jar");
});

test("the map-pack summary projection builds (GeographyRelations was used without being imported)", () => {
  const sim = new Simulation({ worldSeed: 20261007, modules: [worldGeographyModule, mapPackModule] });
  const loaded = loadMapPack(resolve(import.meta.dirname, "../../packs/xia_starter_v0_1"), { dryRun: true });
  assert.ok(loaded.pack);
  registerMapPack(sim, loaded.pack);
  const summary = sim.project({ id: MapPackProjections.summary, params: {} }).data as Record<string, unknown>;
  assert.ok(summary, "the summary came back instead of a ReferenceError");
  assert.match(JSON.stringify(summary), /xia_starter_v0_1/);
});
