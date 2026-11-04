import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import { settlementLocationsModule } from "@openlife/module-settlement-locations";
import { withoutAgents } from "../helpers/agents.ts";
import { settlementMap } from "../../apps/web/src/local-map.ts";

const modules = [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule, withoutAgents(settlementLocationsModule)];
function boot() {
  const sim = new Simulation({ worldSeed: 104, modules });
  assert.ok(sim.dispatch({ type: "modern.initialize_world" }).ok);
  assert.ok(sim.dispatch({ type: "modern.create_character", payload: { givenName: "启", lifespan: 90 } }).ok);
  const actorId = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  assert.ok(sim.dispatch({ type: "settlement-locations.found" }).ok);
  assert.ok(sim.dispatch({ type: "settlement-locations.arrive", actorId, payload: { placeId: "place:yard" } }).ok);
  return { sim, actorId };
}
function view(sim: Simulation, actorId: string) {
  const p = sim.project({ id: "world-space.local-map", params: { actorId } });
  assert.ok(p.ok, "local map projection must be registered");
  return p.data as Record<string, any>;
}
test("local map movement is authoritative, rejects walls and stale requests, and never ages a player", () => {
  const { sim, actorId } = boot();
  let m = view(sim, actorId);
  const tick = sim.tick;
  const walk = (x: number, y: number, expectedPosition = m.player.revision) => sim.dispatch({ type: "world-space.local_move", actorId,
    payload: { x, y, sceneId: m.sceneId, expectedPosition } });
  const dest = { x: m.player.x + 1, y: m.player.y };
  assert.ok(walk(dest.x, dest.y).ok);
  const oldRevision = m.player.revision;
  m = view(sim, actorId);
  assert.equal(m.player.x, dest.x);
  assert.equal(sim.tick, tick);
  assert.equal(walk(dest.x + 1, dest.y, oldRevision).ok, false);
  assert.equal(walk(0, 0).ok, false, "map edge cannot be walked through");
  assert.equal(walk(1.5, 2).ok, false, "fractional cells are invalid");
  const saved = sim.saveToJson();
  const loaded = Simulation.loadFromJson(saved, modules);
  assert.ok(loaded.simulation);
  assert.deepEqual(view(loaded.simulation!, actorId), m);
});
test("moving to another semantic space resets the local position safely and repeatably", () => {
  const { sim, actorId } = boot();
  const before = view(sim, actorId);
  assert.ok(sim.dispatch({ type: "world-space.move_within", actorId, payload: { spaceId: "space:drying-rack" } }).ok);
  const after = view(sim, actorId);
  assert.notEqual(after.sceneId, before.sceneId);
  assert.equal(sim.dispatch({ type: "world-space.local_move", actorId, payload: { sceneId: before.sceneId,
    expectedPosition: before.player.revision, x: 4, y: 4 } }).ok, false);
  const again = Simulation.loadFromJson(sim.saveToJson(), modules).simulation!;
  assert.deepEqual(view(again, actorId), after);
});
test("taking one object does not move the other physical targets around the map", () => {
  const { sim, actorId } = boot();
  const objects = ["a", "b", "c"].map(id => ({ id, name: id, placement: "放着", canTake: true }));
  const before = settlementMap(sim, actorId, { objects, actions: [] })!;
  const after = settlementMap(sim, actorId, { objects: objects.slice(1), actions: [] })!;
  for (const t of after.targets) {
    const was = before.targets.find(p => p.key === t.key)!;
    assert.deepEqual({ x: t.x, y: t.y }, { x: was.x, y: was.y }, t.key);
  }
});
