import { test } from "node:test";
import assert from "node:assert/strict";
import type { OpenLifeModule } from "@openlife/contracts";
import { GeographyKinds, worldGeographyModule } from "@openlife/module-world-geography";
import { worldGeosphereModule } from "@openlife/module-world-geosphere";
import { worldClimateModule } from "@openlife/module-world-climate";
import { worldWeatherModule } from "@openlife/module-world-weather";
import { HydrologyComponents, worldHydrologyModule } from "@openlife/module-world-hydrology";
import { EcologyComponents, worldEcologyModule } from "@openlife/module-world-ecology";
import { worldVegetationModule, type VegetationApi } from "@openlife/module-world-vegetation";
import { worldSpeciesModule, type SpeciesApi } from "@openlife/module-world-species";
import { worldGrazingModule } from "@openlife/module-world-grazing";
import { WorldTimeComponents, worldTimeModule } from "@openlife/module-world-time";
import { Simulation } from "@openlife/simulation";

const fixture: OpenLifeModule = {
  manifest: {
    id: "world-time-fixture",
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "content-pack",
    requires: ["world.vegetation", "world.species"],
  },
  register(ctx) {
    const vegetation = ctx.registry.capabilityImplementation("world.vegetation") as VegetationApi;
    const species = ctx.registry.capabilityImplementation("world.species") as SpeciesApi;
    vegetation.registerDefinition({
      id: "world-time-fixture.grass",
      name: "Grass",
      foodTags: ["grass"],
      temperatureOptimumC: 18,
      temperatureToleranceC: 24,
      waterOptimum: 0.55,
      waterTolerance: 0.6,
      growthRate: 0.7,
      woody: false,
    });
    species.registerDefinition({
      id: "world-time-fixture.grazer",
      name: "Grazer",
      trophicRole: "herbivore",
      diet: ["grass"],
      temperatureOptimumC: 20,
      temperatureToleranceC: 20,
      waterOptimum: 0.6,
      waterTolerance: 0.6,
      lifeHistory: {
        maturityYears: 1.5,
        lifespanYears: 10,
        reproductiveOutput: 0.6,
        offspringInvestment: 0.5,
        baselineAnnualMortality: 0.08,
      },
    });
  },
};

function must(simulation: Simulation, intent: Parameters<Simulation["dispatch"]>[0]) {
  const result = simulation.dispatch(intent);
  assert.equal(result.ok, true, result.errors.map((error) => `${error.code}: ${error.message}`).join("; "));
}

function buildWorld() {
  const simulation = new Simulation({
    worldSeed: 25001,
    modules: [
      worldGeographyModule,
      worldGeosphereModule,
      worldClimateModule,
      worldWeatherModule,
      worldHydrologyModule,
      worldEcologyModule,
      worldVegetationModule,
      worldSpeciesModule,
      fixture,
      worldGrazingModule,
      worldTimeModule,
    ],
  });
  must(simulation, { type: "world-geography.create_region", payload: { name: "Time Region" } });
  const regionId = simulation.worldView().listEntities({ kind: GeographyKinds.region })[0]!.id;

  const createLocation = (name: string) => {
    must(simulation, { type: "world-geography.create_location", payload: { regionId, name } });
    const locationId = simulation.worldView().listEntities({ kind: GeographyKinds.location })
      .find((entity) => String(entity.components["world-geography.location"]?.name ?? "") === name)!.id;
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
      payload: { initialSoilMoisture: 0.7 },
    });
    must(simulation, {
      type: "world-ecology.initialize_location",
      targetId: locationId,
      payload: { plantBiomass: 0.8, herbivorePopulation: 30, predatorPopulation: 0 },
    });
    must(simulation, {
      type: "world-vegetation.seed_composition",
      targetId: locationId,
      payload: { composition: [{ vegetationId: "world-time-fixture.grass", biomass: 0.6 }] },
    });
    must(simulation, {
      type: "world-species.seed_populations",
      targetId: locationId,
      payload: { populations: [{ speciesId: "world-time-fixture.grazer", population: 12 }] },
    });
    return locationId;
  };

  return { simulation, regionId, createLocation };
}

function updatedAt(simulation: Simulation, locationId: string, component: string) {
  return Number(simulation.worldView().getComponent(locationId, component)?.updatedAt ?? 0);
}

test("one Region pulse services multiple Locations without one scheduler task per Location", () => {
  const world = buildWorld();
  const nearId = world.createLocation("Near");
  const backgroundId = world.createLocation("Background");
  must(world.simulation, { type: "world-time.set_resolution", targetId: nearId, payload: { tier: "near" } });
  must(world.simulation, { type: "world-time.set_resolution", targetId: backgroundId, payload: { tier: "background" } });

  const tasks = world.simulation.kernel.scheduledTasks().filter((task) => task.owner === "world-time");
  assert.equal(tasks.length, 1, "two Locations in one Region should share one recurring scheduler task");

  world.simulation.advanceBy(1);
  assert.equal(updatedAt(world.simulation, nearId, EcologyComponents.state), 1, "near ecology advances monthly");
  assert.equal(updatedAt(world.simulation, backgroundId, EcologyComponents.state), 0, "background ecology should not run monthly");
  assert.equal(updatedAt(world.simulation, backgroundId, HydrologyComponents.state), 0, "background hydrology should sleep until the annual coarse step");

  world.simulation.advanceBy(11);
  assert.equal(updatedAt(world.simulation, backgroundId, EcologyComponents.state), 12, "background ecology advances as one annual coarse step");
  assert.equal(updatedAt(world.simulation, backgroundId, HydrologyComponents.state), 12, "background hydrology wakes only with the annual coarse step");
  const resolution = world.simulation.worldView().getComponent(backgroundId, WorldTimeComponents.resolution)!;
  assert.equal(Number(resolution.lastSlowTick), 12);
});

test("regional Locations advance slow ecology quarterly rather than monthly", () => {
  const world = buildWorld();
  const locationId = world.createLocation("Regional");
  must(world.simulation, { type: "world-time.set_resolution", targetId: locationId, payload: { tier: "regional" } });
  world.simulation.advanceBy(2);
  assert.equal(updatedAt(world.simulation, locationId, EcologyComponents.state), 0);
  assert.equal(updatedAt(world.simulation, locationId, HydrologyComponents.state), 0);
  world.simulation.advanceBy(1);
  assert.equal(updatedAt(world.simulation, locationId, EcologyComponents.state), 3);
  assert.equal(updatedAt(world.simulation, locationId, HydrologyComponents.state), 3);

  const projection = world.simulation.project({ id: "world-time.location-resolution", params: { locationId } });
  assert.equal(projection.data?.tier, "regional");
  assert.equal(projection.data?.cadenceTicks, 3);
  assert.equal(projection.data?.coarseDaysPerSlowStep, 90);
  assert.equal(projection.data?.nextSlowTick, 6);
});
