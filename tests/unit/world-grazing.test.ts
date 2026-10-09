import { test } from "node:test";
import assert from "node:assert/strict";
import type { OpenLifeModule } from "@openlife/contracts";
import { GeographyKinds, worldGeographyModule } from "@openlife/module-world-geography";
import { worldGeosphereModule } from "@openlife/module-world-geosphere";
import { worldClimateModule } from "@openlife/module-world-climate";
import { worldWeatherModule } from "@openlife/module-world-weather";
import { worldHydrologyModule } from "@openlife/module-world-hydrology";
import { worldEcologyModule } from "@openlife/module-world-ecology";
import { worldVegetationModule, type VegetationApi } from "@openlife/module-world-vegetation";
import { worldSpeciesModule, type SpeciesApi } from "@openlife/module-world-species";
import { worldGrazingModule } from "@openlife/module-world-grazing";
import { Simulation } from "@openlife/simulation";

const foodFixture: OpenLifeModule = {
  manifest: {
    id: "grazing-food-fixture",
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "content-pack",
    requires: ["world.vegetation", "world.species"],
  },
  register(ctx) {
    const vegetation = ctx.registry.capabilityImplementation("world.vegetation") as VegetationApi;
    const species = ctx.registry.capabilityImplementation("world.species") as SpeciesApi;
    vegetation.registerDefinition({
      id: "grazing-food.grass",
      name: "Grass",
      foodTags: ["grass"],
      temperatureOptimumC: 18,
      temperatureToleranceC: 24,
      waterOptimum: 0.55,
      waterTolerance: 0.6,
      growthRate: 0.8,
      woody: false,
    });
    vegetation.registerDefinition({
      id: "grazing-food.shrub",
      name: "Shrub",
      foodTags: ["shrubs"],
      temperatureOptimumC: 20,
      temperatureToleranceC: 24,
      waterOptimum: 0.45,
      waterTolerance: 0.55,
      growthRate: 0.45,
      woody: true,
    });
    vegetation.registerDefinition({
      id: "grazing-food.forest",
      name: "Forest",
      foodTags: ["leaves", "mast"],
      temperatureOptimumC: 16,
      temperatureToleranceC: 20,
      waterOptimum: 0.7,
      waterTolerance: 0.45,
      growthRate: 0.25,
      woody: true,
    });
    species.registerDefinition({
      id: "grazing-food.grass-grazer",
      name: "Grass Grazer",
      trophicRole: "herbivore",
      diet: ["grass"],
      temperatureOptimumC: 20,
      temperatureToleranceC: 20,
      waterOptimum: 0.6,
      waterTolerance: 0.6,
      lifeHistory: {
        maturityYears: 1.5,
        lifespanYears: 10,
        reproductiveOutput: 0.65,
        offspringInvestment: 0.5,
        baselineAnnualMortality: 0.08,
      },
    });
    species.registerDefinition({
      id: "grazing-food.browser",
      name: "Shrub Browser",
      trophicRole: "herbivore",
      diet: ["shrubs"],
      temperatureOptimumC: 20,
      temperatureToleranceC: 20,
      waterOptimum: 0.5,
      waterTolerance: 0.6,
      lifeHistory: {
        maturityYears: 2,
        lifespanYears: 12,
        reproductiveOutput: 0.5,
        offspringInvestment: 0.6,
        baselineAnnualMortality: 0.07,
      },
    });
  },
};

function must(simulation: Simulation, intent: Parameters<Simulation["dispatch"]>[0]) {
  const result = simulation.dispatch(intent);
  assert.equal(result.ok, true, result.errors.map((error) => `${error.code}: ${error.message}`).join("; "));
}

function build(seed: number, grazers: number, browsers: number) {
  const simulation = new Simulation({
    worldSeed: seed,
    modules: [
      worldGeographyModule,
      worldGeosphereModule,
      worldClimateModule,
      worldWeatherModule,
      worldHydrologyModule,
      worldEcologyModule,
      worldVegetationModule,
      worldSpeciesModule,
      foodFixture,
      worldGrazingModule,
    ],
  });
  must(simulation, { type: "world-geography.create_region", payload: { name: "Grazing Region" } });
  const regionId = simulation.worldView().listEntities({ kind: GeographyKinds.region })[0]!.id;
  must(simulation, { type: "world-geography.create_location", payload: { regionId, name: "Grazing Habitat" } });
  const locationId = simulation.worldView().listEntities({ kind: GeographyKinds.location })[0]!.id;
  must(simulation, {
    type: "world-geosphere.set_profile",
    targetId: locationId,
    payload: { elevationM: 100, terrain: "plain", substrate: "alluvium", tectonicSetting: "stable" },
  });
  must(simulation, {
    type: "world-climate.set_baseline",
    targetId: locationId,
    payload: { latitudeDeg: 20, maritimeInfluence: 0.6 },
  });
  must(simulation, {
    type: "world-hydrology.initialize_location",
    targetId: locationId,
    payload: { initialSoilMoisture: 0.72 },
  });
  must(simulation, {
    type: "world-ecology.initialize_location",
    targetId: locationId,
    payload: { plantBiomass: 0.9, herbivorePopulation: 90, predatorPopulation: 0 },
  });
  must(simulation, {
    type: "world-vegetation.seed_composition",
    targetId: locationId,
    payload: {
      composition: [
        { vegetationId: "grazing-food.grass", biomass: 0.3 },
        { vegetationId: "grazing-food.shrub", biomass: 0.3 },
        { vegetationId: "grazing-food.forest", biomass: 0.3 },
      ],
    },
  });
  must(simulation, {
    type: "world-species.seed_populations",
    targetId: locationId,
    payload: {
      populations: [
        { speciesId: "grazing-food.grass-grazer", population: grazers },
        { speciesId: "grazing-food.browser", population: browsers },
      ],
    },
  });
  return { simulation, locationId };
}

function vegetation(simulation: Simulation, locationId: string) {
  const projection = simulation.project({ id: "world-vegetation.location-composition", params: { locationId } });
  return projection.data?.composition as Array<Record<string, any>>;
}

function biomass(entries: Array<Record<string, any>>, id: string) {
  return Number(entries.find((entry) => entry.vegetationId === id)!.biomass);
}

test("grass-specialist grazing reduces matching grass without directly consuming unmatched forest", () => {
  const setup = build(24001, 40, 0);
  const before = vegetation(setup.simulation, setup.locationId);
  must(setup.simulation, {
    type: "world-grazing.advance_location",
    targetId: setup.locationId,
    payload: { days: 180 },
    source: "system",
  });
  const after = vegetation(setup.simulation, setup.locationId);
  assert.ok(biomass(after, "grazing-food.grass") < biomass(before, "grazing-food.grass"));
  assert.equal(biomass(after, "grazing-food.forest"), biomass(before, "grazing-food.forest"));
  const pressure = setup.simulation.project({ id: "world-grazing.location-pressure", params: { locationId: setup.locationId } }).data!;
  assert.equal(pressure.exists, true);
  assert.ok(Number(pressure.pressure.consumedBiomass) > 0);
  assert.ok(Number(pressure.pressure.pressureByVegetation["grazing-food.grass"]) > 0);
  assert.equal(Number(pressure.pressure.pressureByVegetation["grazing-food.forest"]), 0);
});

test("mixed herbivore diets produce differentiated pressure on matching vegetation", () => {
  const setup = build(24002, 45, 10);
  must(setup.simulation, {
    type: "world-grazing.advance_location",
    targetId: setup.locationId,
    payload: { days: 180 },
    source: "system",
  });
  const after = vegetation(setup.simulation, setup.locationId);
  const grassLoss = 0.3 - biomass(after, "grazing-food.grass");
  const shrubLoss = 0.3 - biomass(after, "grazing-food.shrub");
  const forestLoss = 0.3 - biomass(after, "grazing-food.forest");
  assert.ok(grassLoss > shrubLoss, "more grass grazers should create more grass pressure than shrub pressure");
  assert.ok(shrubLoss > 0, "browsers should consume matching shrubs");
  assert.ok(Math.abs(forestLoss) < 0.001, "unmatched forest should not be directly consumed");
});

test("grazing is bounded and cannot drive any vegetation biomass below zero in one coarse step", () => {
  const setup = build(24003, 90, 90);
  must(setup.simulation, {
    type: "world-grazing.advance_location",
    targetId: setup.locationId,
    payload: { days: 365 },
    source: "system",
  });
  const after = vegetation(setup.simulation, setup.locationId);
  for (const entry of after) assert.ok(Number(entry.biomass) >= 0);
  assert.ok(biomass(after, "grazing-food.grass") >= 0.12 - 0.001, "one coarse step consumes at most 60% of a vegetation component");
});

test("vegetation recovery refills part of free biomass budget while preserving grazing-driven composition change", () => {
  const grazed = build(24004, 55, 0);
  const control = build(24005, 55, 0);

  must(grazed.simulation, {
    type: "world-grazing.advance_location",
    targetId: grazed.locationId,
    payload: { days: 180 },
    source: "system",
  });
  const afterGrazing = vegetation(grazed.simulation, grazed.locationId);
  const totalAfterGrazing = afterGrazing.reduce((sum, entry) => sum + Number(entry.biomass), 0);

  for (const setup of [grazed, control]) {
    must(setup.simulation, {
      type: "world-vegetation.advance_location",
      targetId: setup.locationId,
      payload: { days: 180 },
      source: "system",
    });
  }

  const recovered = vegetation(grazed.simulation, grazed.locationId);
  const untouched = vegetation(control.simulation, control.locationId);
  const recoveredTotal = recovered.reduce((sum, entry) => sum + Number(entry.biomass), 0);
  const ecology = grazed.simulation.project({ id: "world-ecology.location-state", params: { locationId: grazed.locationId } }).data!;
  const recoveredGrassShare = biomass(recovered, "grazing-food.grass") / recoveredTotal;
  const controlTotal = untouched.reduce((sum, entry) => sum + Number(entry.biomass), 0);
  const controlGrassShare = biomass(untouched, "grazing-food.grass") / controlTotal;

  assert.ok(recoveredTotal > totalAfterGrazing, "vegetation should reclaim part of free aggregate biomass budget");
  assert.ok(recoveredTotal <= Number(ecology.plantBiomass) + 0.003, "concrete vegetation cannot exceed ecology's current aggregate plant biomass");
  assert.ok(recoveredGrassShare < controlGrassShare, "selective grazing should leave a persistent composition effect after recovery");
});
