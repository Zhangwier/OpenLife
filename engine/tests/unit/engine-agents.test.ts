/**
 * M4-B: NPC autonomy lives in the engine, not in the Web layer.
 *
 * Whoever advances the clock (Web, debug console, AutoSim), the settlement
 * module's village agent lives every stepped day; long jumps are time skips.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { runAutoSim } from "@openlife/autonomy-runtime";
import type { OpenLifeModule } from "@openlife/contracts";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import {
  settlementLocationsModule, SettlementCommands, SettlementComponents, people,
  VILLAGE_DAY_AGENT, type VillageDayBoundary,
  RIVER_TERRACE_PACK,
} from "@openlife/module-settlement-locations";

const modules = [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule];
function village(seed: number) {
  const sim = new Simulation({ worldSeed: seed, modules });
  assert.equal(sim.dispatch({ type: "modern.initialize_world" }).ok, true);
  assert.equal(sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "启" } }).ok, true);
  assert.equal(sim.dispatch({ type: SettlementCommands.found }).ok, true);
  return sim;
}
const dailyCounts = (sim: Simulation) => people(sim.worldView()).residents
  .map((r) => Number(sim.worldView().getComponent(String(r.id), SettlementComponents.resident)?.npcDailyCount ?? 0));

test("M4-B: a 30-day advanceBy (debug console path) lives 30 village days", () => {
  const sim = village(4401);
  sim.advanceBy(30);
  const counts = dailyCounts(sim);
  assert.equal(counts.length, RIVER_TERRACE_PACK.residents.length);
  assert.ok(counts.every((n) => n === 30), `every resident lived each day: ${counts}`);
  const report = sim.agentReport(VILLAGE_DAY_AGENT);
  assert.equal(report?.tick, sim.tick);
  assert.equal((report?.report as VillageDayBoundary).ran, true);
});

test("M4-B: AutoSim stepping through the kernel keeps the village alive", () => {
  const sim = village(4402);
  const actorId = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  const start = sim.tick;
  runAutoSim({
    kernel: sim.kernel, actorId,
    provider: { id: "test.passive", decide: () => [] },
    projection: ({ tick }) => ({ tick, actorId }),
    advanceTicksPerStep: 1,
    stopConditions: [{ id: "ten-days", isSatisfied: (ctx) => ctx.kernel.tick >= start + 10 }],
  });
  sim.syncHistory();
  assert.equal(sim.tick, start + 10);
  assert.ok(dailyCounts(sim).every((n) => n === 10), String(dailyCounts(sim)));
});

test("M4-B: day-by-day and one-shot advances produce the same world", () => {
  const stepped = village(4403);
  for (let i = 0; i < 12; i++) stepped.advanceBy(1);
  const jumped = village(4403);
  jumped.advanceBy(12);
  // Only the clock's advance counter (12 calls vs 1) may differ.
  const world = (sim: Simulation) => {
    const print = JSON.parse(sim.fingerprint());
    delete print.kernel.clock.advances;
    return JSON.stringify(print);
  };
  assert.equal(world(stepped), world(jumped));
});

test("M4-B: a year-long jump is a time skip, not 360 replayed routines", () => {
  const sim = village(4404);
  sim.advanceBy(2);
  sim.advanceBy(360);
  assert.ok(dailyCounts(sim).every((n) => n === 2), String(dailyCounts(sim)));
  sim.advanceBy(1);
  assert.ok(dailyCounts(sim).every((n) => n === 3), "daily life resumes from the real day");
});

test("M4-B: agents act only as ai, survive faults, and stop with their module", () => {
  const seen: string[] = [];
  const probe: OpenLifeModule = {
    manifest: { id: "agent-probe", name: "probe", version: "0.1.0", type: "system-pack", engine: ">=0.0.0" } as never,
    register(ctx) {
      ctx.registerCommand({ type: "agent-probe.ping" });
      ctx.registerResolutionRule({
        id: "agent-probe.ping.resolve", commandType: "agent-probe.ping",
        resolve: (input: { command: { source: string } }) => { seen.push(input.command.source); return { effects: [] }; },
      } as never);
      ctx.registerAgent({ id: "agent-probe.claims-player", run: (host) => {
        host.dispatch({ type: "agent-probe.ping", source: "player" });
      } });
      ctx.registerAgent({ id: "agent-probe.faulty", run: () => { throw new Error("boom"); } });
    },
  };
  const sim = new Simulation({ worldSeed: 4405, modules: [probe] });
  sim.advanceBy(3);
  assert.deepEqual(seen, ["ai", "ai", "ai"], "the host stamps every agent command as ai");
  assert.equal(sim.agentReport("agent-probe.faulty")?.error, "boom");
  assert.equal(sim.tick, 3, "a faulty agent never stalls the clock");
  sim.unload("agent-probe");
  sim.advanceBy(2);
  assert.equal(seen.length, 3, "an unloaded module's agent no longer runs");
});
