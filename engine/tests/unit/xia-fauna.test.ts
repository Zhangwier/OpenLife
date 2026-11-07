/**
 * Xia fauna (2026-10-18 content round): eight animals and four plant covers
 * registered into world-vegetation / world-species and simulated in real
 * habitats. Checks that the data is sound and that the ecology reads it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { GeographyKinds, worldGeographyModule } from "@openlife/module-world-geography";
import { worldGeosphereModule } from "@openlife/module-world-geosphere";
import { worldClimateModule } from "@openlife/module-world-climate";
import { worldWeatherModule } from "@openlife/module-world-weather";
import { worldHydrologyModule } from "@openlife/module-world-hydrology";
import { worldEcologyModule } from "@openlife/module-world-ecology";
import { worldVegetationModule } from "@openlife/module-world-vegetation";
import { worldSpeciesModule, xiaFaunaModule, XIA_FAUNA, validateFaunaPack } from "@openlife/module-world-species";
import { Simulation } from "@openlife/simulation";

function must(sim: Simulation, intent: Parameters<Simulation["dispatch"]>[0]) {
  const r = sim.dispatch(intent);
  assert.equal(r.ok, true, r.errors.map((e) => `${e.code}: ${e.message}`).join("; "));
}

function habitat(seed: number, soilMoisture: number, cover: Array<[string, number]>) {
  const sim = new Simulation({ worldSeed: seed, modules: [worldGeographyModule, worldGeosphereModule, worldClimateModule, worldWeatherModule,
    worldHydrologyModule, worldEcologyModule, worldVegetationModule, worldSpeciesModule, xiaFaunaModule] });
  must(sim, { type: "world-geography.create_region", payload: { name: "北坡" } });
  const regionId = sim.worldView().listEntities({ kind: GeographyKinds.region })[0]!.id;
  must(sim, { type: "world-geography.create_location", payload: { regionId, name: "栗林" } });
  const loc = sim.worldView().listEntities({ kind: GeographyKinds.location })[0]!.id;
  must(sim, { type: "world-geosphere.set_profile", targetId: loc, payload: { elevationM: 300, terrain: "hill", substrate: "alluvium", tectonicSetting: "stable" } });
  must(sim, { type: "world-climate.set_baseline", targetId: loc, payload: { latitudeDeg: 34, maritimeInfluence: 0.5 } });
  must(sim, { type: "world-hydrology.initialize_location", targetId: loc, payload: { initialSoilMoisture: soilMoisture } });
  must(sim, { type: "world-ecology.initialize_location", targetId: loc, payload: {} });
  must(sim, { type: "world-vegetation.seed_composition", targetId: loc,
    payload: { composition: cover.map(([id, biomass]) => ({ vegetationId: `xia-fauna.${id}`, biomass })) } });
  return { sim, loc };
}

function pops(sim: Simulation, loc: string) {
  const p = sim.project({ id: "world-species.location-populations", params: { locationId: loc } });
  return Object.fromEntries((p.data?.populations as Array<Record<string, any>>).map((x) => [x.speciesId.replace("xia-fauna.", ""), x]));
}

test("the Xia fauna pack is sound: fifteen animals, five plant covers (2026-10-19 marsh round), every diet has something to eat", () => {
  assert.deepEqual(validateFaunaPack(XIA_FAUNA), []);
  assert.equal(XIA_FAUNA.species.length, 15);
  assert.equal(XIA_FAUNA.vegetation.length, 5);
  assert.equal(XIA_FAUNA.species.filter((s) => s.trophicRole === "predator").length, 8);
  assert.match(validateFaunaPack({ ...XIA_FAUNA, species: [...XIA_FAUNA.species, { ...XIA_FAUNA.species[4]!, id: "xia-fauna.ghost", diet: ["dragon"] }] }).join(), /ghost/);
});

test("a year in the chestnut wood: deer and boar live off the mast, wolves and dholes find prey", () => {
  const { sim, loc } = habitat(181018, 0.6, [["chestnut-oak", 0.5], ["hazel-thicket", 0.3], ["understory-grass", 0.3]]);
  const all = XIA_FAUNA.species.map((s) => ({ speciesId: s.id, population: s.trophicRole === "predator" ? 4 : 30 }));
  must(sim, { type: "world-species.seed_populations", targetId: loc, payload: { populations: all } });
  must(sim, { type: "world-species.advance_location", targetId: loc, payload: { days: 360 }, source: "system" });
  const p = pops(sim, loc);
  for (const id of ["sika-deer", "wild-boar", "woolly-hare"]) assert.ok(p[id].population > 0, id);
  assert.ok(p["sika-deer"].foodAvailability > p["water-deer"].foodAvailability, "deer browse the wood; water deer want sedge");
  assert.ok(p["grey-wolf"].foodAvailability > 0);
  assert.ok(p["dhole"].foodAvailability > 0, "dholes hunt deer");
});

test("water deer belong to the reed flats, not the dry slope", () => {
  const wet = habitat(181019, 0.85, [["reed-sedge", 0.9]]);
  const dry = habitat(181019, 0.3, [["hazel-thicket", 0.9]]);
  for (const h of [wet, dry]) {
    must(h.sim, { type: "world-species.seed_populations", targetId: h.loc, payload: { populations: [{ speciesId: "xia-fauna.water-deer", population: 20 }] } });
    must(h.sim, { type: "world-species.advance_location", targetId: h.loc, payload: { days: 180 }, source: "system" });
  }
  assert.ok(pops(wet.sim, wet.loc)["water-deer"].population > pops(dry.sim, dry.loc)["water-deer"].population);
});
