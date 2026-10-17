import { test } from "node:test";
import assert from "node:assert/strict";
import type { OpenLifeModule } from "@openlife/contracts";
import type { SpeciesApi, SpeciesDefinition } from "@openlife/module-world-species";
import { faunaBondsModule, FaunaKinds } from "@openlife/module-fauna-bonds";
import { Simulation } from "@openlife/simulation";

const life = { maturityYears: 1, lifespanYears: 12, reproductiveOutput: 0.5, offspringInvestment: 0.5, baselineAnnualMortality: 0.1 };
const defs: SpeciesDefinition[] = [
  { id: "t.dog", name: "Dog", trophicRole: "predator", diet: ["meat"], temperatureOptimumC: 15, temperatureToleranceC: 20, waterOptimum: 0.5, waterTolerance: 0.5, lifeHistory: life, tags: ["domesticable"] },
  { id: "t.wolf", name: "Wolf", trophicRole: "predator", diet: ["meat"], temperatureOptimumC: 10, temperatureToleranceC: 20, waterOptimum: 0.5, waterTolerance: 0.5, lifeHistory: life },
];

/** Stand-in for world.species plus a trivial person/place spawner. */
const fixture: OpenLifeModule = {
  manifest: { id: "fauna-fixture", version: "0.1.0", engineRange: "^0.1.0", type: "content-pack", provides: ["world.species"] },
  register(ctx) {
    const api: SpeciesApi = {
      registerDefinition: () => {},
      getDefinition: (id) => defs.find((d) => d.id === id),
      listDefinitions: () => defs,
      populations: () => defs.map((d) => ({
        speciesId: d.id, population: 20, habitatFitness: 1, foodAvailability: 1, trophicRole: d.trophicRole,
        traitOffsets: { temperatureOptimumDeltaC: 0, waterOptimumDelta: 0, reproductiveOutputDelta: 0 },
        lineage: { selectionGenerations: 0, isolationGenerations: 0, recentGeneFlow: 0 },
      })),
    };
    ctx.provideCapability("world.species", api);
    ctx.registerCommand({ type: "fauna-fixture.spawn" });
    ctx.registerResolutionRule({
      id: "fauna-fixture.spawn.resolve",
      commandType: "fauna-fixture.spawn",
      resolve: (c) => [{ kind: "spawnEntity", localId: "x", id: String(c.command.payload.id), entityKind: "fauna-fixture.thing", components: {} }],
    });
  },
};

function ok(result: { ok: boolean; errors: Array<{ code: string; message: string }> }) {
  assert.equal(result.ok, true, result.errors.map((e) => `${e.code}: ${e.message}`).join("; "));
}

function setup(speciesId: string) {
  const sim = new Simulation({ worldSeed: 11, modules: [fixture, faunaBondsModule] });
  for (const id of ["place", "keeper", "hunter"]) ok(sim.dispatch({ type: "fauna-fixture.spawn", payload: { id } }));
  ok(sim.dispatch({ type: "fauna-bonds.materialize", targetId: "place", payload: { speciesId, name: "Ah Huang" } }));
  const animalId = sim.worldView().listEntities({ kind: FaunaKinds.animal })[0]!.id;
  const view = (personId: string) => sim.project({ id: "fauna-bonds.animal", params: { animalId, personId } }).data as any;
  return { sim, animalId, view };
}

test("feeding builds trust until a domesticable animal can be tamed", () => {
  const s = setup("t.dog");
  ok(s.sim.dispatch({ type: "fauna-bonds.feed", actorId: "keeper", targetId: s.animalId }));
  assert.equal(s.sim.dispatch({ type: "fauna-bonds.feed", actorId: "keeper", targetId: s.animalId }).errors[0]?.code, "E_FAUNA_ALREADY_FED");
  s.sim.advanceBy(1);
  const early = s.sim.dispatch({ type: "fauna-bonds.tame", actorId: "keeper", targetId: s.animalId });
  assert.equal(early.errors[0]?.code, "E_FAUNA_NOT_TRUSTING");
  let tamed = false;
  for (let i = 0; i < 30 && !tamed; i++) {
    ok(s.sim.dispatch({ type: "fauna-bonds.feed", actorId: "keeper", targetId: s.animalId }));
    s.sim.advanceBy(1);
    if (s.view("keeper").bond.trust >= 0.6) {
      ok(s.sim.dispatch({ type: "fauna-bonds.tame", actorId: "keeper", targetId: s.animalId }));
      tamed = s.view("keeper").stage === "tame";
    }
  }
  assert.equal(tamed, true);
  assert.equal(s.view("keeper").keeperId, "keeper");
  assert.equal(s.view("keeper").attitude, "friendly");
  assert.equal(s.sim.worldView().listRelations({ type: "fauna-bonds.companion_of", from: s.animalId }).length, 1);
});

test("a wolf cannot be tamed and remembers who hurt it", () => {
  const s = setup("t.wolf");
  for (let i = 0; i < 12; i++) {
    ok(s.sim.dispatch({ type: "fauna-bonds.feed", actorId: "keeper", targetId: s.animalId }));
    s.sim.advanceBy(1);
  }
  assert.equal(s.sim.dispatch({ type: "fauna-bonds.tame", actorId: "keeper", targetId: s.animalId }).errors[0]?.code, "E_FAUNA_NOT_DOMESTICABLE");
  ok(s.sim.dispatch({ type: "fauna-bonds.harm", actorId: "hunter", targetId: s.animalId }));
  assert.equal(s.view("hunter").attitude, "hostile");
  assert.equal(s.view("keeper").attitude, "friendly");
});
