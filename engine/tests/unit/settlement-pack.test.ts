/** M5-A: the village is a validated data pack, not code. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { RIVER_TERRACE_PACK, validateSettlementPack, SettlementContent, type SettlementPack } from "@openlife/module-settlement-locations";

const copy = (): SettlementPack => structuredClone(RIVER_TERRACE_PACK);

test("the shipped River Terrace pack is sound and is what the module uses", () => {
  assert.deepEqual(validateSettlementPack(RIVER_TERRACE_PACK), []);
  assert.equal(SettlementContent.residents, RIVER_TERRACE_PACK.residents.length);
  assert.equal(SettlementContent.places, RIVER_TERRACE_PACK.places.length);
  assert.equal(SettlementContent.instances, RIVER_TERRACE_PACK.instances.length);
  assert.deepEqual(SettlementContent.residentKeys, RIVER_TERRACE_PACK.residents.map((r) => r.key));
});

test("broken references are reported, every one of them", () => {
  const pack = copy();
  pack.residents[0]!.workPlace = "place:nowhere";
  pack.residents[1]!.homeSpace = "space:nowhere";
  pack.yields[0]!.placeId = "place:gone";
  pack.instances[0]!.owner = "ghost";
  pack.instances[1]!.prototypeId = "prototype:unknown";
  pack.places[0]!.entrySpace = "space:not-here";
  const problems = validateSettlementPack(pack);
  for (const fragment of ["unknown work place", "unknown home space", "unknown place place:gone",
    "unknown owner ghost", "unknown prototype", "entry space"]) {
    assert.ok(problems.some((p) => p.includes(fragment)), `${fragment} in ${problems.join(" | ")}`);
  }
});

test("duplicates and a wrong format version are rejected", () => {
  const pack = copy();
  pack.residents.push({ ...pack.residents[0]! });
  pack.formatVersion = 2;
  const problems = validateSettlementPack(pack);
  assert.ok(problems.some((p) => p.startsWith("duplicate resident")));
  assert.ok(problems.some((p) => p.includes("pack format 2")));
});

test("M5-B: village routines take their people, places and rooms from the pack", async () => {
  const { villageRoles, VillageRoles } = await import("@openlife/module-settlement-locations");
  assert.equal(VillageRoles.cook.name, "阿灶");
  assert.equal(VillageRoles.cook.workPlace, "place:hearth-yard");
  assert.equal(VillageRoles.fuelGatherer.workSpot, "space:reed-cut");
  assert.equal(VillageRoles.farmer.home, "space:yu-sleep");
  const pack = copy();
  pack.autonomy.farmer = "yu-brother";
  const roles = villageRoles(pack);
  assert.equal(roles.farmer.name, "阿石");
  assert.equal(roles.farmer.home, "space:yu-sleep");
  pack.autonomy.cook = "nobody";
  assert.ok(validateSettlementPack(pack).some((p) => p.includes("autonomy role cook")));
  const badSpot = copy();
  badSpot.places[1]!.workSpot = "space:elsewhere";
  badSpot.places[0]!.jobResource = "resource:gold";
  const problems = validateSettlementPack(badSpot);
  assert.ok(problems.some((p) => p.includes("work spot")));
  assert.ok(problems.some((p) => p.includes("job resource")));
});

test("M5-B: the homestead view tells clients who the cook is", async () => {
  const { Simulation } = await import("@openlife/simulation");
  const { modernWorldModule } = await import("@openlife/module-modern-world");
  const { worldClockModule } = await import("@openlife/module-world-clock");
  const { worldSpaceModule } = await import("@openlife/module-world-space");
  const { worldObjectsModule } = await import("@openlife/module-world-objects");
  const { settlementLocationsModule, SettlementCommands, homestead } = await import("@openlife/module-settlement-locations");
  const sim = new Simulation({ worldSeed: 5, modules: [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule] });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "启" } });
  assert.equal(sim.dispatch({ type: SettlementCommands.found }).ok, true);
  const id = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  const view = homestead(sim.worldView(), id);
  assert.deepEqual(view.roles.cook, { id: "settlement-locations:resident:cook", name: "阿灶", workPlace: "place:hearth-yard" });
});
