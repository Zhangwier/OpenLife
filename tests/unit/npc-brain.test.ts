import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule, ObjectRelations, prototypeOf } from "@openlife/module-world-objects";
import {
  settlementLocationsModule, SettlementCommands, residentId, homestead, dailyActivity,
  VILLAGE_DAY_AGENT, type VillageDayBoundary, mindOf, temperamentWords, residentMind, RIVER_TERRACE_PACK,
} from "@openlife/module-settlement-locations";

const modules = [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule];
function village(seed: number) {
  const sim = new Simulation({ worldSeed: seed, modules });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  const playerId = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  assert.equal(sim.dispatch({ type: SettlementCommands.found }).ok, true);
  return { sim, playerId };
}
function days(sim: Simulation, n: number): VillageDayBoundary[] {
  const out: VillageDayBoundary[] = [];
  for (let i = 0; i < n; i++) {
    sim.advanceBy(1);
    const report = sim.agentReport(VILLAGE_DAY_AGENT);
    assert.equal(report?.error, undefined, String(report?.error));
    out.push(report!.report as VillageDayBoundary);
  }
  return out;
}
const owns = (sim: Simulation, actorId: string, resourceId: string) => sim.worldView()
  .listRelations({ type: ObjectRelations.ownedBy, to: actorId })
  .filter((r) => sim.worldView().getEntity(r.from)?.archivedAt === undefined)
  .filter((r) => prototypeOf(sim.worldView(), r.from).resourceId === resourceId).length;

test("brain: personality and attributes come from the data pack, or a stable derivation", () => {
  const lan = residentMind(residentId("lan"))!;
  assert.equal(lan.personality.curiosity, 90);
  assert.deepEqual(temperamentWords(lan).slice(0, 2), ["好奇", "合群"]);
  const a = mindOf({ key: "someone-new", age: 10 }), b = mindOf({ key: "someone-new", age: 10 });
  assert.deepEqual(a, b, "a resident without authored traits always gets the same ones");
  assert.ok(a.attributes.strength <= 6, "children are weaker");
  for (const r of RIVER_TERRACE_PACK.residents) assert.ok(r.personality && r.attributes, r.key);
});

test("brain: nobody is scheduled, yet villagers pursue multi-day goals through real commands", () => {
  const { sim, playerId } = village(7);
  const before = dailyActivity(sim.worldView(), playerId).used;
  const reports = days(sim, 12);
  // Someone who wanted a jar dug clay, shaped greenware, waited for it to dry, fetched fuel and fired it.
  const potters = RIVER_TERRACE_PACK.residents.map((r) => residentId(r.key))
    .filter((id) => owns(sim, id, "resource:jar") > 0 && reports.some((d) => d.residents.find((x) => x.actorId === id)?.actions.some((a) => a.includes("陶坯"))));
  assert.ok(potters.length > 0, reports.map((d) => d.notes.join("\n")).join("\n==\n"));
  // Cold season: villagers without clothing made their own.
  assert.ok(reports[0]!.notes.some((n) => n.includes("裹身") && n.includes("御寒")), reports[0]!.notes.join("\n"));
  // Different temperaments produce different days.
  const day1 = reports[0]!.residents;
  const sociable = day1.find((r) => r.actorId === residentId("trader-elder"))!;
  assert.ok(sociable.actions.some((a) => a.includes("聊") || a.includes("换")), sociable.note);
  assert.equal(dailyActivity(sim.worldView(), playerId).used, before, "villagers never spend the player's time");
  // Their day is visible to the player as a readable note with motives and temperament.
  sim.dispatch({ type: SettlementCommands.arrive, actorId: playerId, payload: { placeId: "place:reedbed" } });
  const n = homestead(sim.worldView(), playerId).neighbours.find((p) => p.id === residentId("lan-mother"));
  if (n) assert.ok(n.temperament.includes("勤快"), JSON.stringify(n));
});

test("brain: same seed, same village life (deterministic, save/load safe)", () => {
  const run = () => { const { sim } = village(4242); days(sim, 4); return sim.fingerprint(); };
  assert.equal(run(), run());
  const { sim } = village(4242);
  days(sim, 2);
  const loaded = Simulation.load(sim.save(), modules).simulation!;
  days(sim, 2); days(loaded, 2);
  assert.equal(loaded.fingerprint(), sim.fingerprint());
});
