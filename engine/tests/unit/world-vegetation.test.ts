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
import { Simulation } from "@openlife/simulation";

const vegetationFixture: OpenLifeModule = {
  manifest: {
    id: "vegetation-fixture",
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "content-pack",
    requires: ["world.vegetation"],
  },
  register(ctx) {
    const vegetation = ctx.registry.capabilityImplementation("world.vegetation") as VegetationApi | undefined;
    if (!vegetation) throw new Error("vegetation fixture requires world.vegetation");
    vegetation.registerDefinition({
      id: "vegetation-fixture.grass",
      name: "Open Grass",
      foodTags: ["grass", "forage"],
      temperatureOptimumC: 18,
      temperatureToleranceC: 24,
      waterOptimum: 0.5,
      waterTolerance: 0.55,
      growthRate: 0.82,
      woody: false,
      tags: ["open-ground"],
    });
    vegetation.registerDefinition({
      id: "vegetation-fixture.shrub",
      name: "Dry Shrub",
      foodTags: ["shrubs", "browse"],
      temperatureOptimumC: 22,
      temperatureToleranceC: 22,
      waterOptimum: 0.3,
      waterTolerance: 0.42,
      growthRate: 0.48,
      woody: true,
      tags: ["drought-tolerant"],
    });
    vegetation.registerDefinition({
      id: "vegetation-fixture.forest",
      name: "Temperate Forest",
      foodTags: ["leaves", "mast"],
      temperatureOptimumC: 15,
      temperatureToleranceC: 17,
      waterOptimum: 0.7,
      waterTolerance: 0.42,
      growthRate: 0.24,
      woody: true,
      tags: ["canopy"],
    });
    vegetation.registerDefinition({
      id: "vegetation-fixture.wetland",
      name: "Wetland Plants",
      foodTags: ["aquatic-plants", "reeds"],
      temperatureOptimumC: 17,
      temperatureToleranceC: 22,
      waterOptimum: 0.95,
      waterTolerance: 0.3,
      growthRate: 0.68,
      woody: false,
      tags: ["wetland"],
    });
  },
};

function must(simulation: Simulation, intent: Parameters<Simulation["dispatch"]>[0]) {
  const result = simulation.dispatch(intent);
  assert.equal(result.ok, true, result.errors.map((error) => `${error.code}: ${error.message}`).join("; "));
}

function buildHabitat(seed: number, latitudeDeg: number, soilMoisture: number) {
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
      vegetationFixture,
    ],
  });
  must(simulation, { type: "world-geography.create_region", payload: { name: "Vegetation Region" } });
  const regionId = simulation.worldView().listEntities({ kind: GeographyKinds.region })[0]!.id;
  must(simulation, { type: "world-geography.create_location", payload: { regionId, name: "Vegetation Habitat" } });
  const locationId = simulation.worldView().listEntities({ kind: GeographyKinds.location })[0]!.id;
  must(simulation, {
    type: "world-geosphere.set_profile",
    targetId: locationId,
    payload: { elevationM: 100, terrain: "plain", substrate: "alluvium", tectonicSetting: "stable" },
  });
  must(simulation, {
    type: "world-climate.set_baseline",
    targetId: locationId,
    payload: { latitudeDeg, maritimeInfluence: 0.6 },
  });
  must(simulation, {
    type: "world-hydrology.initialize_location",
    targetId: locationId,
    payload: { initialSoilMoisture: soilMoisture },
  });
  must(simulation, { type: "world-ecology.initialize_location", targetId: locationId, payload: { plantBiomass: 0.9 } });
  must(simulation, {
    type: "world-vegetation.seed_composition",
    targetId: locationId,
    payload: {
      composition: [
        { vegetationId: "vegetation-fixture.grass", biomass: 0.2 },
        { vegetationId: "vegetation-fixture.shrub", biomass: 0.2 },
        { vegetationId: "vegetation-fixture.forest", biomass: 0.2 },
        { vegetationId: "vegetation-fixture.wetland", biomass: 0.2 },
      ],
    },
  });
  return { simulation, locationId };
}

function composition(simulation: Simulation, locationId: string) {
  const projection = simulation.project({ id: "world-vegetation.location-composition", params: { locationId } });
  assert.equal(projection.data?.exists, true);
  return projection.data?.composition as Array<Record<string, any>>;
}

function byId(entries: Array<Record<string, any>>, id: string) {
  return entries.find((entry) => entry.vegetationId === id)!;
}

test("vegetation definitions remain module-owned and expose food/resource traits without individual plants", () => {
  let api: VegetationApi | undefined;
  const probe: OpenLifeModule = {
    manifest: { id: "vegetation-probe", version: "0.1.0", engineRange: "^0.1.0", type: "system-pack", requires: ["world.vegetation"] },
    register(ctx) {
      api = ctx.registry.capabilityImplementation("world.vegetation") as VegetationApi | undefined;
    },
  };
  new Simulation({
    worldSeed: 23001,
    modules: [worldGeographyModule, worldGeosphereModule, worldClimateModule, worldWeatherModule, worldHydrologyModule, worldEcologyModule, worldVegetationModule, vegetationFixture, probe],
  });
  assert.ok(api);
  const forest = api.getDefinition("vegetation-fixture.forest");
  assert.equal(forest?.woody, true);
  assert.deepEqual(forest?.foodTags, ["leaves", "mast"]);
});

test("wet habitats favor wetland vegetation while drier habitats favor shrub composition", () => {
  const wet = buildHabitat(23002, 20, 0.95);
  const dry = buildHabitat(23003, 24, 0.2);
  for (const setup of [wet, dry]) {
    must(setup.simulation, {
      type: "world-vegetation.advance_location",
      targetId: setup.locationId,
      payload: { days: 180 },
      source: "system",
    });
  }
  const wetComposition = composition(wet.simulation, wet.locationId);
  const dryComposition = composition(dry.simulation, dry.locationId);
  assert.ok(byId(wetComposition, "vegetation-fixture.wetland").habitatFitness > byId(wetComposition, "vegetation-fixture.shrub").habitatFitness);
  assert.ok(byId(dryComposition, "vegetation-fixture.shrub").habitatFitness > byId(dryComposition, "vegetation-fixture.wetland").habitatFitness);
  assert.ok(byId(wetComposition, "vegetation-fixture.wetland").biomass > byId(wetComposition, "vegetation-fixture.shrub").biomass);
  assert.ok(byId(dryComposition, "vegetation-fixture.shrub").biomass > byId(dryComposition, "vegetation-fixture.wetland").biomass);
});

test("represented vegetation biomass cannot exceed ecology total plant biomass", () => {
  const setup = buildHabitat(23004, 18, 0.7);
  const ecology = setup.simulation.project({ id: "world-ecology.location-state", params: { locationId: setup.locationId } }).data!;
  must(setup.simulation, {
    type: "world-vegetation.seed_composition",
    targetId: setup.locationId,
    payload: {
      composition: [
        { vegetationId: "vegetation-fixture.grass", biomass: 5 },
        { vegetationId: "vegetation-fixture.forest", biomass: 5 },
        { vegetationId: "vegetation-fixture.wetland", biomass: 5 },
      ],
    },
  });
  const entries = composition(setup.simulation, setup.locationId);
  const represented = entries.reduce((sum, entry) => sum + Number(entry.biomass), 0);
  assert.ok(represented <= Number(ecology.plantBiomass) + 0.003);
  const serialized = JSON.stringify(entries);
  assert.equal(serialized.includes("individual"), false);
  assert.equal(serialized.includes("mutation"), false);
  assert.equal(serialized.includes("succession"), false);
});
