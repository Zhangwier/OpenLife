/**
 * Plugin guard for the web game (docs/PLUGINS.md §2): every module not marked
 * core can be switched off in apps/web/openlife.modules.json, and the game must
 * still found the village, live some days and survive a save round trip.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import type { OpenLifeModule } from "@openlife/contracts";
import { planModules, readDisabledModules } from "../../apps/web/src/module-plan.ts";
import { WEB_MODULE_ENTRIES, webModules } from "../../apps/web/src/modules.ts";
import { ensureNature, withNature } from "../../apps/web/src/nature.ts";

const optional = WEB_MODULE_ENTRIES.filter((e) => !e.core).map((e) => e.module.manifest.id as string);

function play(modules: OpenLifeModule[]) {
  const sim = new Simulation({ worldSeed: 11, modules });
  const ok = (r: ReturnType<Simulation["dispatch"]>, what: string) => assert.equal(r.ok, true, `${what}: ${JSON.stringify(r.errors ?? [])}`);
  ok(sim.dispatch({ type: "modern.initialize_world", source: "system" }), "initialize");
  ok(sim.dispatch({ type: "modern.create_character", payload: { givenName: "启", familyName: "禾", lifespan: 84 }, source: "system" }), "character");
  const actorId = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  ok(sim.dispatch({ type: "settlement-locations.found", source: "system" }), "found");
  ensureNature(sim);
  ok(sim.dispatch({ type: "settlement-locations.arrive", actorId, payload: { placeId: "place:yard" }, source: "system" }), "arrive");
  sim.advanceBy(20);
  withNature(sim, { placeId: "place:yard" }, actorId);
  const { simulation: again, result } = Simulation.load(sim.save({ label: "plugin-guard" }), modules);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(again!.worldView().tick, sim.worldView().tick);
  return sim;
}

test("the shipped config installs every web module", () => {
  const plan = webModules({});
  assert.deepEqual(plan.problems, []);
  assert.equal(plan.modules.length, WEB_MODULE_ENTRIES.length);
});

test("planModules rejects typos and core modules, and cascades lost requirements", () => {
  const bad = planModules(WEB_MODULE_ENTRIES, ["no-such-module", "settlement-locations"]);
  assert.match(bad.problems.join("\n"), /unknown module in disabled list: no-such-module/);
  assert.match(bad.problems.join("\n"), /settlement-locations is core/);
  // world-hazard needs world.hydrology-state, which settlement-nature provides.
  const plan = planModules(WEB_MODULE_ENTRIES, ["settlement-nature"]);
  assert.deepEqual(plan.problems, []);
  assert.ok(plan.cascaded.includes("world-hazard"), JSON.stringify(plan));
});

test("OPENLIFE_DISABLE_MODULES adds to the config file", () => {
  const ids = readDisabledModules("/nonexistent/openlife.modules.json", { OPENLIFE_DISABLE_MODULES: "social-conflict, fauna-bonds" });
  assert.deepEqual(ids, ["social-conflict", "fauna-bonds"]);
});

for (const id of optional) {
  test(`the game still starts, plays and saves with ${id} switched off`, () => {
    const plan = planModules(WEB_MODULE_ENTRIES, [id]);
    assert.deepEqual(plan.problems, []);
    play(plan.modules);
  });
}

test("the game plays with every optional module switched off at once", () => {
  const plan = planModules(WEB_MODULE_ENTRIES, optional);
  assert.deepEqual(plan.problems, []);
  play(plan.modules);
});

test("a save made with every module still loads after a plugin is removed", () => {
  const full = play(webModules({}).modules);
  const plan = planModules(WEB_MODULE_ENTRIES, ["social-conflict", "fauna-bonds"]);
  const { simulation, result } = Simulation.load(full.save({ label: "before-removal" }), plan.modules);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  simulation!.advanceBy(5);
});
