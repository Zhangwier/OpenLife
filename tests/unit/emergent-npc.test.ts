import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule, ObjectRelations, ownerOf, holderOf, prototypeOf } from "@openlife/module-world-objects";
import { settlementLocationsModule, SettlementComponents, SettlementCommands, residentId, people,
  VILLAGE_DAY_AGENT, type VillageDayBoundary } from "@openlife/module-settlement-locations";

const modules = [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule];

/** Advance one day; the engine's village agent lives through it (M4-B). */
function liveDay(sim: Simulation): VillageDayBoundary {
  const before = sim.tick;
  sim.advanceBy(1);
  const report = sim.agentReport(VILLAGE_DAY_AGENT);
  assert.equal(report?.tick, before + 1, "the village agent ran for the stepped day");
  assert.equal(report?.error, undefined, String(report?.error));
  return report!.report as VillageDayBoundary;
}
function make(seed: number) {
  const sim = new Simulation({ worldSeed: seed, modules });
  assert.equal(sim.dispatch({ type: "modern.initialize_world" }).ok, true);
  assert.equal(sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "启" } }).ok, true);
  assert.equal(sim.dispatch({ type: SettlementCommands.found }).ok, true);
  return sim;
}
function run30(seed: number, resumeAt = -1) {
  let sim = make(seed);
  const cook = residentId("cook"), reed = residentId("reed-worker"), yu = residentId("yu");
  const observed: { day: number; need: string; replied: string; supply: number; fire: boolean; notes: string[] }[] = [];
  for (let day = 1; day <= 30; day++) {
    const boundary = liveDay(sim);
    assert.equal(boundary.ran, true);
    assert.equal(boundary.notes.length, 14, "all authored villagers have a daily decision");
    const state = sim.worldView();
    const residents = people(state).residents;
    assert.equal(residents.length, 14);
    for (const resident of residents) {
      const id = String(resident.id);
      assert.equal(state.getComponent(id, SettlementComponents.resident)?.lastRoutineAt, sim.tick,
        "every living villager has acted or encountered a real limitation");
      assert.equal(state.getComponent(id, SettlementComponents.resident)?.npcDailyCount, day);
    }    const raw = state.getComponent(cook, SettlementComponents.resident);
    const need = (raw?.helpRequest ?? {}) as Record<string, unknown>;
    const source = state.getComponent("yield:place:reedbed:resource:fuel", SettlementComponents.yieldPoint);
    assert.ok(Number(source?.stock) >= 0 && Number(source?.stock) <= Number(source?.capacity), "finite resource stock");
    if (need.status === "accepted" && need.resolvedAt === sim.tick) {
      const realItemId = String(need.itemId);
      assert.ok(state.getEntity(realItemId) && state.getEntity(realItemId)?.archivedAt === undefined);
      assert.equal(ownerOf(state, realItemId), cook, "aid transfers one concrete owned item");
      assert.equal(holderOf(state, realItemId), cook, "same item, real custody transferred");
    }
    if (day % 10 === 0) {
      for (const item of state.listEntities({ kind: "world-objects.item" }).filter(e => e.archivedAt === undefined)) {
        assert.ok(state.listRelations({ type: ObjectRelations.ownedBy, from: item.id }).length <= 1,
          "no item ever has two owners");
        assert.ok(state.listRelations({ type: ObjectRelations.heldBy, from: item.id }).length <= 1,
          "no item ever has two holders");
      }
    }
    observed.push({ day, need: String(need.status ?? ""), replied: String(state.getComponent(reed, SettlementComponents.resident)?.lastHelpOutcome ?? ""),
      supply: Number(source?.stock), fire: raw?.lastFireAt === day, notes: boundary.notes });
    const saved = sim.save();
    if (day === resumeAt) {
      const load = Simulation.load(saved, modules);
      assert.equal(load.result.ok, true);
      sim = load.simulation!;
    }
  }
  return { fingerprint: sim.fingerprint(), observed, sim };
}

test("30 days: all 14 residents act, scarcity creates distinct outcomes, and replay is identical", () => {
  const control = run30(9901);
  const restored = run30(9901, 15);
  assert.equal(control.fingerprint, restored.fingerprint);
  const needs = control.observed.filter(row => row.need !== "");
  const replies = control.observed.filter(row => row.replied !== "");
  assert.ok(control.observed.some(row => row.fire), "hearth actually consumes real fuel");
  assert.ok(needs.length > 0, "shortage causes an NPC-owned request without player involvement");
  assert.ok(replies.length > 0, "a second NPC independently responds");
  assert.ok(control.observed.some(row => row.replied === "shared"), "aid is actually given when there is a spare item");
  // Refusal is no longer forced by the old renewal bug (every draw restarted
  // the regrowth clock, so the reed flat never recovered under daily use). The
  // decision itself is covered below against real holdings.
  assert.ok(control.observed.some(row => row.notes.some(note => note.includes("照料田地"))),
    "farmer continues working instead of joining a scripted quest");
});

test("NPC help rejects impersonation, remote agreement and fabricated item transfer", () => {
  const sim = make(9902), cook = residentId("cook"), reed = residentId("reed-worker");
  const player = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  assert.equal(sim.dispatch({ type: SettlementCommands.npcAskHelp, actorId: player, source: "player",
    payload: { targetId: reed } }).ok, false);
  assert.equal(sim.dispatch({ type: SettlementCommands.npcAnswerHelp, actorId: reed, source: "ai",
    payload: { requesterId: cook, accept: true, itemId: "fake" } }).ok, false);
  assert.equal(sim.worldView().getComponent(cook, SettlementComponents.resident)?.helpRequest, undefined);
});

test("the fuel gatherer refuses once his own reserve is gone, and shares when he has a spare", async () => {
  const { fuelHelpReply } = await import("@openlife/module-settlement-locations");
  assert.equal(fuelHelpReply(3, 5, 10), "share");
  assert.equal(fuelHelpReply(2, 5, 6), "share");
  assert.equal(fuelHelpReply(1, 9, 14), "refuse", "never gives away his last bundle");
  assert.equal(fuelHelpReply(0, 9, 14), "refuse");
});
