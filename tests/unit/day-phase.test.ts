import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { DayPhase, RIVER_TERRACE_PACK, residentId, SettlementCommands, SettlementId } from "@openlife/module-settlement-locations";
import { occupiedPlaceId, occupiedSpaceId } from "@openlife/module-world-space";
import { webModules } from "../../apps/web/src/modules.ts";
import { runSettlementAction } from "../../apps/web/src/player.ts";

const modules = webModules().modules;
const RESIDENTS = RIVER_TERRACE_PACK.residents;
function boot() {
  const sim = new Simulation({ worldSeed: 21, modules });
  assert.ok(sim.dispatch({ type: "modern.initialize_world" }).ok);
  assert.ok(sim.dispatch({ type: "modern.create_character", payload: { givenName: "启", lifespan: 90 } }).ok);
  const actorId = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  assert.ok(sim.dispatch({ type: "settlement-locations.found", source: "system" }).ok);
  assert.ok(sim.dispatch({ type: "settlement-locations.arrive", actorId, payload: { placeId: "place:yard" } }).ok);
  return { sim, actorId };
}
const where = (sim: Simulation) => Object.fromEntries(RESIDENTS.map((r) => {
  const id = residentId(r.key), w = sim.worldView();
  return [id, `${occupiedPlaceId(w, id)}|${occupiedSpaceId(w, id)}`];
}));
/** Everything the village's day produces: residents' state, positions, the settlement's own components. */
function village(sim: Simulation) {
  const w = sim.worldView();
  const settlement = { ...w.getEntity(SettlementId)!.components };
  delete settlement[DayPhase.component];
  return {
    where: where(sim),
    residents: RESIDENTS.map((r) => w.getEntity(residentId(r.key))?.components),
    settlement,
    items: w.listEntities({ kind: "world-objects.item" }).filter((e) => e.archivedAt === undefined).length,
  };
}

test("mid-day residents go to work, in the evening they go back exactly where they began", () => {
  const { sim } = boot();
  const morning = where(sim);
  assert.ok(sim.dispatch({ type: DayPhase.command, source: "system", payload: { phase: 1 } }).ok);
  const working = where(sim);
  const moved = RESIDENTS.filter((r) => working[residentId(r.key)] !== morning[residentId(r.key)]);
  assert.ok(moved.length > 0, "someone works away from where they woke up");
  for (const r of moved) assert.ok(working[residentId(r.key)]!.startsWith(`${r.workPlace}|`), r.key);
  assert.equal(sim.dispatch({ type: DayPhase.command, source: "system", payload: { phase: 1 } }).ok, false, "a phase never runs twice");
  const reloaded = Simulation.loadFromJson(sim.saveToJson(), modules).simulation!;
  assert.deepEqual(where(reloaded), working);
  assert.ok(reloaded.dispatch({ type: DayPhase.command, source: "system", payload: { phase: 2 } }).ok);
  assert.deepEqual(where(reloaded), morning);
  assert.equal(sim.tick, reloaded.tick, "phases never move the clock");
});

test("the village's next day is the same whether or not residents spent the day at work", () => {
  const plain = boot(), phased = boot();
  assert.ok(phased.sim.dispatch({ type: DayPhase.command, source: "system", payload: { phase: 1 } }).ok);
  for (const run of [plain, phased]) assert.ok(runSettlementAction(run.sim, run.actorId, SettlementCommands.step, {}).ok);
  assert.deepEqual(village(phased.sim), village(plain.sim));
});
