import { test } from "node:test";
import assert from "node:assert/strict";
import { GeographyKinds, worldGeographyModule } from "@openlife/module-world-geography";
import { worldGeosphereModule } from "@openlife/module-world-geosphere";
import { worldClimateModule } from "@openlife/module-world-climate";
import { worldWeatherModule } from "@openlife/module-world-weather";
import { worldHydrologyModule } from "@openlife/module-world-hydrology";
import { worldEcologyModule } from "@openlife/module-world-ecology";
import { Simulation } from "@openlife/simulation";

function must(simulation: Simulation, intent: Parameters<Simulation["dispatch"]>[0]) {
  const result = simulation.dispatch(intent);
  assert.equal(result.ok, true, result.errors.map((error) => `${error.code}: ${error.message}`).join("; "));
}

function buildHabitat(
  seed: number,
  options: {
    latitudeDeg: number;
    maritimeInfluence: number;
    terrain: string;
    substrate: string;
    elevationM: number;
    soilMoisture: number;
    plantBiomass?: number;
    herbivores?: number;
    predators?: number;
  },
) {
  const simulation = new Simulation({
    worldSeed: seed,
    modules: [
      worldGeographyModule,
      worldGeosphereModule,
      worldClimateModule,
      worldWeatherModule,
      worldHydrologyModule,
      worldEcologyModule,
    ],
  });
  must(simulation, { type: "world-geography.create_region", payload: { name: "Ecology Region" } });
  const regionId = simulation.worldView().listEntities({ kind: GeographyKinds.region })[0]!.id;
  must(simulation, { type: "world-geography.create_location", payload: { regionId, name: "Habitat" } });
  const locationId = simulation.worldView().listEntities({ kind: GeographyKinds.location })[0]!.id;
  must(simulation, {
    type: "world-geosphere.set_profile",
    targetId: locationId,
    payload: {
      elevationM: options.elevationM,
      terrain: options.terrain,
      substrate: options.substrate,
      tectonicSetting: "stable",
    },
  });
  must(simulation, {
    type: "world-climate.set_baseline",
    targetId: locationId,
    payload: { latitudeDeg: options.latitudeDeg, maritimeInfluence: options.maritimeInfluence },
  });
  must(simulation, {
    type: "world-hydrology.initialize_location",
    targetId: locationId,
    payload: { initialSoilMoisture: options.soilMoisture },
  });
  must(simulation, {
    type: "world-ecology.initialize_location",
    targetId: locationId,
    payload: {
      ...(options.plantBiomass !== undefined ? { plantBiomass: options.plantBiomass } : {}),
      ...(options.herbivores !== undefined ? { herbivorePopulation: options.herbivores } : {}),
      ...(options.predators !== undefined ? { predatorPopulation: options.predators } : {}),
    },
  });
  return { simulation, locationId };
}

function state(simulation: Simulation, locationId: string) {
  const projection = simulation.project({ id: "world-ecology.location-state", params: { locationId } });
  assert.equal(projection.data?.exists, true);
  return projection.data!;
}

test("wet temperate valleys support more plant and animal biomass than dry harsh uplands", () => {
  const wet = buildHabitat(21001, {
    latitudeDeg: 20, maritimeInfluence: 0.85, terrain: "valley", substrate: "alluvium", elevationM: 120, soilMoisture: 0.82,
  });
  const dry = buildHabitat(21002, {
    latitudeDeg: 28, maritimeInfluence: 0.05, terrain: "plateau", substrate: "sandstone", elevationM: 1700, soilMoisture: 0.14,
  });
  const wetState = state(wet.simulation, wet.locationId);
  const dryState = state(dry.simulation, dry.locationId);

  assert.ok(Number(wetState.habitatSuitability) > Number(dryState.habitatSuitability));
  assert.ok(Number(wetState.plantCarryingCapacity) > Number(dryState.plantCarryingCapacity));
  assert.ok(Number(wetState.herbivoreCarryingCapacity) > Number(dryState.herbivoreCarryingCapacity));
  assert.ok(Number(wetState.predatorCarryingCapacity) > Number(dryState.predatorCarryingCapacity));
});

test("too many herbivores create grazing pressure, reduce plants and develop food stress", () => {
  const setup = buildHabitat(21003, {
    latitudeDeg: 18, maritimeInfluence: 0.8, terrain: "plain", substrate: "alluvium", elevationM: 60, soilMoisture: 0.72,
    plantBiomass: 0.72, herbivores: 150, predators: 0,
  });
  const before = state(setup.simulation, setup.locationId);
  must(setup.simulation, {
    type: "world-ecology.advance_location",
    targetId: setup.locationId,
    payload: { days: 90 },
    source: "system",
  });
  const after = state(setup.simulation, setup.locationId);

  assert.ok(Number(after.grazingPressure) > 0.5);
  assert.ok(Number(after.plantBiomass) < Number(before.plantBiomass));
  assert.ok(Number(after.foodStress) > 0);
  assert.ok(Number(after.herbivorePopulation) < Number(before.herbivorePopulation), "over-capacity herbivores should not grow without limit");
});

test("predators convert abundant herbivores into predation pressure and are themselves food-limited", () => {
  const preyRich = buildHabitat(21004, {
    latitudeDeg: 22, maritimeInfluence: 0.7, terrain: "valley", substrate: "alluvium", elevationM: 100, soilMoisture: 0.78,
    plantBiomass: 0.82, herbivores: 95, predators: 4,
  });
  const preyPoor = buildHabitat(21005, {
    latitudeDeg: 22, maritimeInfluence: 0.7, terrain: "valley", substrate: "alluvium", elevationM: 100, soilMoisture: 0.78,
    plantBiomass: 0.82, herbivores: 4, predators: 4,
  });
  const richBefore = state(preyRich.simulation, preyRich.locationId);
  const poorBefore = state(preyPoor.simulation, preyPoor.locationId);

  must(preyRich.simulation, { type: "world-ecology.advance_location", targetId: preyRich.locationId, payload: { days: 120 }, source: "system" });
  must(preyPoor.simulation, { type: "world-ecology.advance_location", targetId: preyPoor.locationId, payload: { days: 120 }, source: "system" });
  const richAfter = state(preyRich.simulation, preyRich.locationId);
  const poorAfter = state(preyPoor.simulation, preyPoor.locationId);

  assert.ok(Number(richAfter.predationPressure) > 0);
  assert.ok(Number(richAfter.herbivorePopulation) < Number(richBefore.herbivorePopulation) + 40, "predation should constrain prey growth");
  assert.ok(Number(richAfter.predatorPopulation) > Number(richBefore.predatorPopulation), "abundant prey should support predator growth");
  assert.ok(Number(poorAfter.predatorPopulation) < Number(poorBefore.predatorPopulation), "predators should decline when prey support is very low");
});
