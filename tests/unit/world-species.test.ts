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
import { Simulation } from "@openlife/simulation";

const vegetationFixture: OpenLifeModule = {
  manifest: {
    id: "species-vegetation-fixture",
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "content-pack",
    requires: ["world.vegetation"],
  },
  register(ctx) {
    const vegetation = ctx.registry.capabilityImplementation("world.vegetation") as VegetationApi | undefined;
    if (!vegetation) throw new Error("species vegetation fixture requires world.vegetation");
    vegetation.registerDefinition({
      id: "species-vegetation-fixture.grass",
      name: "Grass Patch",
      foodTags: ["grass"],
      temperatureOptimumC: 16,
      temperatureToleranceC: 28,
      waterOptimum: 0.55,
      waterTolerance: 0.7,
      growthRate: 0.75,
      woody: false,
    });
    vegetation.registerDefinition({
      id: "species-vegetation-fixture.shrub",
      name: "Shrub Patch",
      foodTags: ["shrubs"],
      temperatureOptimumC: 20,
      temperatureToleranceC: 26,
      waterOptimum: 0.4,
      waterTolerance: 0.65,
      growthRate: 0.45,
      woody: true,
    });
    vegetation.registerDefinition({
      id: "species-vegetation-fixture.lichen",
      name: "Lichen Patch",
      foodTags: ["lichen"],
      temperatureOptimumC: 4,
      temperatureToleranceC: 24,
      waterOptimum: 0.45,
      waterTolerance: 0.7,
      growthRate: 0.22,
      woody: false,
    });
  },
};

const speciesFixture: OpenLifeModule = {
  manifest: {
    id: "species-fixture",
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "content-pack",
    requires: ["world.species"],
  },
  register(ctx) {
    const species = ctx.registry.capabilityImplementation("world.species") as SpeciesApi | undefined;
    if (!species) throw new Error("species fixture requires world.species");
    species.registerDefinition({
      id: "species-fixture.warm-grazer",
      name: "Warm Grazer",
      trophicRole: "herbivore",
      diet: ["grass", "shrubs"],
      temperatureOptimumC: 22,
      temperatureToleranceC: 16,
      waterOptimum: 0.72,
      waterTolerance: 0.5,
      lifeHistory: {
        maturityYears: 1.5,
        lifespanYears: 12,
        reproductiveOutput: 0.72,
        offspringInvestment: 0.55,
        baselineAnnualMortality: 0.08,
      },
      tags: ["grazer", "medium-herbivore"],
    });
    species.registerDefinition({
      id: "species-fixture.cold-grazer",
      name: "Cold Grazer",
      trophicRole: "herbivore",
      diet: ["grass", "lichen"],
      temperatureOptimumC: 4,
      temperatureToleranceC: 15,
      waterOptimum: 0.48,
      waterTolerance: 0.48,
      lifeHistory: {
        maturityYears: 2,
        lifespanYears: 14,
        reproductiveOutput: 0.52,
        offspringInvestment: 0.62,
        baselineAnnualMortality: 0.07,
      },
      tags: ["grazer", "cold-adapted"],
    });
    species.registerDefinition({
      id: "species-fixture.pack-predator",
      name: "Pack Predator",
      trophicRole: "predator",
      diet: ["medium-herbivore"],
      temperatureOptimumC: 10,
      temperatureToleranceC: 24,
      waterOptimum: 0.55,
      waterTolerance: 0.7,
      lifeHistory: {
        maturityYears: 3,
        lifespanYears: 16,
        reproductiveOutput: 0.3,
        offspringInvestment: 0.75,
        baselineAnnualMortality: 0.09,
      },
      tags: ["social-hunter"],
    });
    species.registerDefinition({
      id: "species-fixture.fast-life",
      name: "Fast Life Test Grazer",
      trophicRole: "herbivore",
      diet: ["grass", "shrubs"],
      temperatureOptimumC: 22,
      temperatureToleranceC: 16,
      waterOptimum: 0.72,
      waterTolerance: 0.5,
      lifeHistory: {
        maturityYears: 1,
        lifespanYears: 8,
        reproductiveOutput: 0.8,
        offspringInvestment: 0.35,
        baselineAnnualMortality: 0.16,
      },
      tags: ["test-only"],
    });
    species.registerDefinition({
      id: "species-fixture.slow-life",
      name: "Slow Life Test Grazer",
      trophicRole: "herbivore",
      diet: ["grass", "shrubs"],
      temperatureOptimumC: 22,
      temperatureToleranceC: 16,
      waterOptimum: 0.72,
      waterTolerance: 0.5,
      lifeHistory: {
        maturityYears: 4,
        lifespanYears: 20,
        reproductiveOutput: 0.45,
        offspringInvestment: 0.8,
        baselineAnnualMortality: 0.05,
      },
      tags: ["test-only"],
    });
  },
};

function must(simulation: Simulation, intent: Parameters<Simulation["dispatch"]>[0]) {
  const result = simulation.dispatch(intent);
  assert.equal(result.ok, true, result.errors.map((error) => `${error.code}: ${error.message}`).join("; "));
}

function seedVegetation(
  simulation: Simulation,
  locationId: string,
  composition = [
    { vegetationId: "species-vegetation-fixture.grass", biomass: 0.3 },
    { vegetationId: "species-vegetation-fixture.shrub", biomass: 0.3 },
    { vegetationId: "species-vegetation-fixture.lichen", biomass: 0.3 },
  ],
) {
  must(simulation, {
    type: "world-vegetation.seed_composition",
    targetId: locationId,
    payload: { composition },
  });
}

function buildLocation(seed: number, options: { latitudeDeg: number; elevationM: number; terrain: string; soilMoisture: number }) {
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
      worldSpeciesModule,
      speciesFixture,
    ],
  });
  must(simulation, { type: "world-geography.create_region", payload: { name: "Species Region" } });
  const regionId = simulation.worldView().listEntities({ kind: GeographyKinds.region })[0]!.id;
  must(simulation, { type: "world-geography.create_location", payload: { regionId, name: "Species Habitat" } });
  const locationId = simulation.worldView().listEntities({ kind: GeographyKinds.location })[0]!.id;
  must(simulation, {
    type: "world-geosphere.set_profile",
    targetId: locationId,
    payload: { elevationM: options.elevationM, terrain: options.terrain, substrate: "alluvium", tectonicSetting: "stable" },
  });
  must(simulation, {
    type: "world-climate.set_baseline",
    targetId: locationId,
    payload: { latitudeDeg: options.latitudeDeg, maritimeInfluence: 0.65 },
  });
  must(simulation, {
    type: "world-hydrology.initialize_location",
    targetId: locationId,
    payload: { initialSoilMoisture: options.soilMoisture },
  });
  must(simulation, { type: "world-ecology.initialize_location", targetId: locationId, payload: {} });
  seedVegetation(simulation, locationId);
  return { simulation, locationId };
}

function populations(simulation: Simulation, locationId: string) {
  const projection = simulation.project({ id: "world-species.location-populations", params: { locationId } });
  assert.equal(projection.data?.exists, true);
  return projection.data?.populations as Array<Record<string, any>>;
}

function byId(entries: Array<Record<string, any>>, id: string) {
  return entries.find((entry) => entry.speciesId === id)!;
}

function buildConnectedHabitats(
  seed: number,
  distanceKm: number,
  target: { latitudeDeg: number; elevationM: number; terrain: string; soilMoisture: number },
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
      worldVegetationModule,
      vegetationFixture,
      worldSpeciesModule,
      speciesFixture,
    ],
  });
  must(simulation, { type: "world-geography.create_region", payload: { name: "Migration Region" } });
  const regionId = simulation.worldView().listEntities({ kind: GeographyKinds.region })[0]!.id;

  const add = (
    name: string,
    options: { latitudeDeg: number; elevationM: number; terrain: string; soilMoisture: number },
  ) => {
    must(simulation, { type: "world-geography.create_location", payload: { regionId, name } });
    const locationId = simulation.worldView().listEntities({ kind: GeographyKinds.location })
      .find((entity) => entity.components["world-geography.location"]?.name === name)!.id;
    must(simulation, {
      type: "world-geosphere.set_profile",
      targetId: locationId,
      payload: { elevationM: options.elevationM, terrain: options.terrain, substrate: "alluvium", tectonicSetting: "stable" },
    });
    must(simulation, {
      type: "world-climate.set_baseline",
      targetId: locationId,
      payload: { latitudeDeg: options.latitudeDeg, maritimeInfluence: 0.65 },
    });
    must(simulation, {
      type: "world-hydrology.initialize_location",
      targetId: locationId,
      payload: { initialSoilMoisture: options.soilMoisture },
    });
    must(simulation, {
      type: "world-ecology.initialize_location",
      targetId: locationId,
      payload: name === "Source" ? { herbivorePopulation: 95, predatorPopulation: 4 } : {},
    });
    seedVegetation(simulation, locationId);
    return locationId;
  };

  const sourceId = add("Source", { latitudeDeg: 18, elevationM: 80, terrain: "plain", soilMoisture: 0.78 });
  const targetId = add("Target", target);
  must(simulation, {
    type: "world-geography.connect_locations",
    payload: { fromLocationId: sourceId, toLocationId: targetId, distanceKm },
  });
  must(simulation, {
    type: "world-species.seed_populations",
    targetId: sourceId,
    payload: {
      populations: [
        { speciesId: "species-fixture.warm-grazer", population: 50 },
        { speciesId: "species-fixture.pack-predator", population: 2 },
      ],
    },
  });
  return { simulation, sourceId, targetId };
}

test("species definitions stay module-owned and preserve diet and adaptation traits", () => {
  let api: SpeciesApi | undefined;
  const probe: OpenLifeModule = {
    manifest: {
      id: "species-probe",
      version: "0.1.0",
      engineRange: "^0.1.0",
      type: "system-pack",
      requires: ["world.species"],
    },
    register(ctx) {
      api = ctx.registry.capabilityImplementation("world.species") as SpeciesApi | undefined;
    },
  };
  new Simulation({
    worldSeed: 22001,
    modules: [worldGeographyModule, worldGeosphereModule, worldClimateModule, worldWeatherModule, worldHydrologyModule, worldEcologyModule, worldVegetationModule, vegetationFixture, worldSpeciesModule, speciesFixture, probe],
  });
  assert.ok(api);
  const warm = api.getDefinition("species-fixture.warm-grazer");
  assert.equal(warm?.trophicRole, "herbivore");
  assert.deepEqual(warm?.diet, ["grass", "shrubs"]);
  assert.equal(warm?.temperatureOptimumC, 22);
  assert.deepEqual(warm?.lifeHistory, {
    maturityYears: 1.5,
    lifespanYears: 12,
    reproductiveOutput: 0.72,
    offspringInvestment: 0.55,
    baselineAnnualMortality: 0.08,
  });
});

test("life-history tradeoffs affect aggregate population growth without materializing age cohorts", () => {
  const setup = buildLocation(22024, { latitudeDeg: 18, elevationM: 100, terrain: "plain", soilMoisture: 0.72 });
  must(setup.simulation, {
    type: "world-species.seed_populations",
    targetId: setup.locationId,
    payload: {
      populations: [
        { speciesId: "species-fixture.fast-life", population: 8 },
        { speciesId: "species-fixture.slow-life", population: 8 },
      ],
    },
  });
  must(setup.simulation, {
    type: "world-species.advance_location",
    targetId: setup.locationId,
    payload: { days: 365 },
    source: "system",
  });
  const entries = populations(setup.simulation, setup.locationId);
  const fast = byId(entries, "species-fixture.fast-life");
  const slow = byId(entries, "species-fixture.slow-life");
  assert.ok(fast.population > slow.population, "earlier maturity and higher reproductive output should currently outweigh the fast-life mortality cost");
  const serialized = JSON.stringify(entries);
  assert.equal(serialized.includes("juvenile"), false);
  assert.equal(serialized.includes("adult"), false);
  assert.equal(serialized.includes("ageCohort"), false);
});

test("the same herbivore species composition responds differently to warm lowland and cold highland habitats", () => {
  const warm = buildLocation(22002, { latitudeDeg: 15, elevationM: 100, terrain: "plain", soilMoisture: 0.75 });
  const cold = buildLocation(22003, { latitudeDeg: 48, elevationM: 1800, terrain: "plateau", soilMoisture: 0.5 });
  for (const setup of [warm, cold]) {
    must(setup.simulation, {
      type: "world-species.seed_populations",
      targetId: setup.locationId,
      payload: {
        populations: [
          { speciesId: "species-fixture.warm-grazer", population: 20 },
          { speciesId: "species-fixture.cold-grazer", population: 20 },
        ],
      },
    });
    must(setup.simulation, {
      type: "world-species.advance_location",
      targetId: setup.locationId,
      payload: { days: 120 },
      source: "system",
    });
  }

  const warmPops = populations(warm.simulation, warm.locationId);
  const coldPops = populations(cold.simulation, cold.locationId);
  assert.ok(byId(warmPops, "species-fixture.warm-grazer").habitatFitness > byId(warmPops, "species-fixture.cold-grazer").habitatFitness);
  assert.ok(byId(warmPops, "species-fixture.warm-grazer").population > byId(warmPops, "species-fixture.cold-grazer").population);
  assert.ok(byId(coldPops, "species-fixture.cold-grazer").habitatFitness > byId(coldPops, "species-fixture.warm-grazer").habitatFitness);
  assert.ok(byId(coldPops, "species-fixture.cold-grazer").population > byId(coldPops, "species-fixture.warm-grazer").population);
});

test("local population trait offsets change effective adaptation without mutating the species definition", () => {
  const baseline = buildLocation(22014, { latitudeDeg: 48, elevationM: 1800, terrain: "plateau", soilMoisture: 0.5 });
  const coldShifted = buildLocation(22015, { latitudeDeg: 48, elevationM: 1800, terrain: "plateau", soilMoisture: 0.5 });

  must(baseline.simulation, {
    type: "world-species.seed_populations",
    targetId: baseline.locationId,
    payload: { populations: [{ speciesId: "species-fixture.warm-grazer", population: 20 }] },
  });
  must(coldShifted.simulation, {
    type: "world-species.seed_populations",
    targetId: coldShifted.locationId,
    payload: {
      populations: [{
        speciesId: "species-fixture.warm-grazer",
        population: 20,
        traitOffsets: {
          temperatureOptimumDeltaC: -8,
          waterOptimumDelta: -0.08,
          reproductiveOutputDelta: -0.04,
        },
      }],
    },
  });

  for (const setup of [baseline, coldShifted]) {
    must(setup.simulation, {
      type: "world-species.advance_location",
      targetId: setup.locationId,
      payload: { days: 120 },
      source: "system",
    });
  }

  const baselinePop = byId(populations(baseline.simulation, baseline.locationId), "species-fixture.warm-grazer");
  const shiftedPop = byId(populations(coldShifted.simulation, coldShifted.locationId), "species-fixture.warm-grazer");
  assert.ok(shiftedPop.habitatFitness > baselinePop.habitatFitness);
  assert.deepEqual(shiftedPop.traitOffsets, {
    temperatureOptimumDeltaC: -8,
    waterOptimumDelta: -0.08,
    reproductiveOutputDelta: -0.04,
  }, "ordinary ecology advancement must not mutate population traits");

  let definition: ReturnType<SpeciesApi["getDefinition"]>;
  const probe: OpenLifeModule = {
    manifest: { id: "trait-definition-probe", version: "0.1.0", engineRange: "^0.1.0", type: "system-pack", requires: ["world.species"] },
    register(ctx) {
      const api = ctx.registry.capabilityImplementation("world.species") as SpeciesApi;
      definition = api.getDefinition("species-fixture.warm-grazer");
    },
  };
  new Simulation({
    worldSeed: 22016,
    modules: [worldGeographyModule, worldGeosphereModule, worldClimateModule, worldWeatherModule, worldHydrologyModule, worldEcologyModule, worldVegetationModule, vegetationFixture, worldSpeciesModule, speciesFixture, probe],
  });
  assert.equal(definition!.temperatureOptimumC, 22, "population adaptation must not rewrite the species baseline");
});

test("natural selection slowly shifts environmental optima and can adjust reproductive output through life-history tradeoffs", () => {
  const cold = buildLocation(22018, { latitudeDeg: 52, elevationM: 1700, terrain: "plateau", soilMoisture: 0.45 });
  must(cold.simulation, {
    type: "world-species.seed_populations",
    targetId: cold.locationId,
    payload: {
      populations: [{
        speciesId: "species-fixture.warm-grazer",
        population: 20,
        traitOffsets: {
          temperatureOptimumDeltaC: 0,
          waterOptimumDelta: 0,
          reproductiveOutputDelta: 0.07,
        },
      }],
    },
  });
  const before = byId(populations(cold.simulation, cold.locationId), "species-fixture.warm-grazer");
  must(cold.simulation, {
    type: "world-species.apply_selection",
    targetId: cold.locationId,
    payload: { generations: 120, standingVariation: 0.6 },
    source: "system",
  });
  const after = byId(populations(cold.simulation, cold.locationId), "species-fixture.warm-grazer");

  assert.ok(after.traitOffsets.temperatureOptimumDeltaC < before.traitOffsets.temperatureOptimumDeltaC, "cold conditions should shift the local thermal optimum downward");
  assert.ok(Math.abs(after.traitOffsets.temperatureOptimumDeltaC) <= 2.001, "one coarse selection step must remain slow even across many generations");
  assert.ok(after.traitOffsets.reproductiveOutputDelta <= 0.07, "harsh conditions should not reward unchecked reproductive output");
  assert.ok(Math.abs(after.traitOffsets.reproductiveOutputDelta - 0.07) <= 0.031, "life-history selection must remain gradual per coarse selection step");
  assert.ok(after.habitatFitness >= before.habitatFitness);
});

test("no standing variation means selection cannot move population traits", () => {
  const setup = buildLocation(22019, { latitudeDeg: 50, elevationM: 1600, terrain: "plateau", soilMoisture: 0.48 });
  must(setup.simulation, {
    type: "world-species.seed_populations",
    targetId: setup.locationId,
    payload: { populations: [{ speciesId: "species-fixture.warm-grazer", population: 20 }] },
  });
  const before = byId(populations(setup.simulation, setup.locationId), "species-fixture.warm-grazer");
  must(setup.simulation, {
    type: "world-species.apply_selection",
    targetId: setup.locationId,
    payload: { generations: 300, standingVariation: 0 },
    source: "system",
  });
  const after = byId(populations(setup.simulation, setup.locationId), "species-fixture.warm-grazer");
  assert.deepEqual(after.traitOffsets, before.traitOffsets);
});

test("life-history selection can favor different reproductive-output directions under favorable and harsh conditions", () => {
  const favorable = buildLocation(22025, { latitudeDeg: 18, elevationM: 80, terrain: "plain", soilMoisture: 0.74 });
  const harsh = buildLocation(22026, { latitudeDeg: 55, elevationM: 2100, terrain: "plateau", soilMoisture: 0.35 });
  for (const setup of [favorable, harsh]) {
    must(setup.simulation, {
      type: "world-species.seed_populations",
      targetId: setup.locationId,
      payload: { populations: [{ speciesId: "species-fixture.warm-grazer", population: 20 }] },
    });
    must(setup.simulation, {
      type: "world-species.apply_selection",
      targetId: setup.locationId,
      payload: { generations: 240, standingVariation: 0.8 },
      source: "system",
    });
  }

  const favorablePop = byId(populations(favorable.simulation, favorable.locationId), "species-fixture.warm-grazer");
  const harshPop = byId(populations(harsh.simulation, harsh.locationId), "species-fixture.warm-grazer");
  assert.ok(
    favorablePop.traitOffsets.reproductiveOutputDelta > harshPop.traitOffsets.reproductiveOutputDelta,
    "favorable habitat should support a higher selected reproductive-output strategy than harsh habitat",
  );
  assert.ok(Math.abs(favorablePop.traitOffsets.reproductiveOutputDelta) <= 0.031);
  assert.ok(Math.abs(harshPop.traitOffsets.reproductiveOutputDelta) <= 0.031);
});

test("vegetation food tags alter herbivore fitness and population even under the same climate", () => {
  const shrubHabitat = buildLocation(22008, { latitudeDeg: 20, elevationM: 100, terrain: "plain", soilMoisture: 0.6 });
  const lichenHabitat = buildLocation(22009, { latitudeDeg: 20, elevationM: 100, terrain: "plain", soilMoisture: 0.6 });

  seedVegetation(shrubHabitat.simulation, shrubHabitat.locationId, [
    { vegetationId: "species-vegetation-fixture.shrub", biomass: 0.9 },
  ]);
  seedVegetation(lichenHabitat.simulation, lichenHabitat.locationId, [
    { vegetationId: "species-vegetation-fixture.lichen", biomass: 0.9 },
  ]);

  for (const setup of [shrubHabitat, lichenHabitat]) {
    must(setup.simulation, {
      type: "world-species.seed_populations",
      targetId: setup.locationId,
      payload: {
        populations: [
          { speciesId: "species-fixture.warm-grazer", population: 20 },
          { speciesId: "species-fixture.cold-grazer", population: 20 },
        ],
      },
    });
    must(setup.simulation, {
      type: "world-species.advance_location",
      targetId: setup.locationId,
      payload: { days: 120 },
      source: "system",
    });
  }

  const shrubPops = populations(shrubHabitat.simulation, shrubHabitat.locationId);
  const lichenPops = populations(lichenHabitat.simulation, lichenHabitat.locationId);
  assert.ok(byId(shrubPops, "species-fixture.warm-grazer").foodAvailability > byId(shrubPops, "species-fixture.cold-grazer").foodAvailability);
  assert.ok(byId(shrubPops, "species-fixture.warm-grazer").population > byId(shrubPops, "species-fixture.cold-grazer").population);
  assert.ok(byId(lichenPops, "species-fixture.cold-grazer").foodAvailability > byId(lichenPops, "species-fixture.warm-grazer").foodAvailability);
  assert.ok(byId(lichenPops, "species-fixture.cold-grazer").population > byId(lichenPops, "species-fixture.warm-grazer").population);
});

test("predator food availability depends on matching concrete prey rather than the abstract herbivore total alone", () => {
  const preyRich = buildLocation(22010, { latitudeDeg: 22, elevationM: 100, terrain: "plain", soilMoisture: 0.7 });
  const preyMismatch = buildLocation(22011, { latitudeDeg: 22, elevationM: 100, terrain: "plain", soilMoisture: 0.7 });

  must(preyRich.simulation, {
    type: "world-species.seed_populations",
    targetId: preyRich.locationId,
    payload: {
      populations: [
        { speciesId: "species-fixture.warm-grazer", population: 35 },
        { speciesId: "species-fixture.pack-predator", population: 3 },
      ],
    },
  });
  must(preyMismatch.simulation, {
    type: "world-species.seed_populations",
    targetId: preyMismatch.locationId,
    payload: {
      populations: [
        { speciesId: "species-fixture.cold-grazer", population: 35 },
        { speciesId: "species-fixture.pack-predator", population: 3 },
      ],
    },
  });

  for (const setup of [preyRich, preyMismatch]) {
    must(setup.simulation, {
      type: "world-species.advance_location",
      targetId: setup.locationId,
      payload: { days: 180 },
      source: "system",
    });
  }

  const richPredator = byId(populations(preyRich.simulation, preyRich.locationId), "species-fixture.pack-predator");
  const mismatchPredator = byId(populations(preyMismatch.simulation, preyMismatch.locationId), "species-fixture.pack-predator");
  assert.ok(richPredator.foodAvailability > mismatchPredator.foodAvailability);
  assert.ok(richPredator.habitatFitness > mismatchPredator.habitatFitness);
  assert.ok(richPredator.population > mismatchPredator.population);
});

test("specific predators suppress matching prey without applying the same loss to unmatched herbivores", () => {
  const hunted = buildLocation(22012, { latitudeDeg: 20, elevationM: 100, terrain: "plain", soilMoisture: 0.72 });
  const control = buildLocation(22013, { latitudeDeg: 20, elevationM: 100, terrain: "plain", soilMoisture: 0.72 });

  must(hunted.simulation, {
    type: "world-species.seed_populations",
    targetId: hunted.locationId,
    payload: {
      populations: [
        { speciesId: "species-fixture.warm-grazer", population: 8 },
        { speciesId: "species-fixture.cold-grazer", population: 8 },
        { speciesId: "species-fixture.pack-predator", population: 3 },
      ],
    },
  });
  must(control.simulation, {
    type: "world-species.seed_populations",
    targetId: control.locationId,
    payload: {
      populations: [
        { speciesId: "species-fixture.warm-grazer", population: 8 },
        { speciesId: "species-fixture.cold-grazer", population: 8 },
      ],
    },
  });

  for (const setup of [hunted, control]) {
    must(setup.simulation, {
      type: "world-species.advance_location",
      targetId: setup.locationId,
      payload: { days: 180 },
      source: "system",
    });
  }

  const huntedPops = populations(hunted.simulation, hunted.locationId);
  const controlPops = populations(control.simulation, control.locationId);
  const huntedWarm = byId(huntedPops, "species-fixture.warm-grazer").population;
  const controlWarm = byId(controlPops, "species-fixture.warm-grazer").population;
  const huntedCold = byId(huntedPops, "species-fixture.cold-grazer").population;
  const controlCold = byId(controlPops, "species-fixture.cold-grazer").population;

  assert.ok(huntedWarm < controlWarm, "matching prey should lose population to the predator");
  assert.ok(Math.abs(huntedCold - controlCold) < 0.03, "unmatched prey should not receive the predator's direct species-level loss");
});

test("known concrete populations cannot exceed the aggregate ecology guild totals", () => {
  const setup = buildLocation(22004, { latitudeDeg: 25, elevationM: 120, terrain: "valley", soilMoisture: 0.7 });
  const ecology = setup.simulation.project({ id: "world-ecology.location-state", params: { locationId: setup.locationId } }).data!;
  must(setup.simulation, {
    type: "world-species.seed_populations",
    targetId: setup.locationId,
    payload: {
      populations: [
        { speciesId: "species-fixture.warm-grazer", population: 999 },
        { speciesId: "species-fixture.cold-grazer", population: 999 },
        { speciesId: "species-fixture.pack-predator", population: 999 },
      ],
    },
  });
  const entries = populations(setup.simulation, setup.locationId);
  const herbivores = entries.filter((entry) => entry.trophicRole === "herbivore").reduce((sum, entry) => sum + Number(entry.population), 0);
  const predators = entries.filter((entry) => entry.trophicRole === "predator").reduce((sum, entry) => sum + Number(entry.population), 0);

  assert.ok(herbivores <= Number(ecology.herbivorePopulation) + 0.02);
  assert.ok(predators <= Number(ecology.predatorPopulation) + 0.02);
  const serialized = JSON.stringify(entries);
  assert.equal(serialized.includes("genes"), false);
  assert.equal(serialized.includes("individual"), false);
  assert.equal(serialized.includes("mutation"), false);
});

test("species disperse to an adjacent habitat by transferring real population rather than spawning copies", () => {
  const setup = buildConnectedHabitats(
    22005,
    8,
    { latitudeDeg: 20, elevationM: 100, terrain: "valley", soilMoisture: 0.74 },
  );
  const sourceBefore = byId(populations(setup.simulation, setup.sourceId), "species-fixture.warm-grazer").population;

  must(setup.simulation, {
    type: "world-species.disperse_to_neighbor",
    targetId: setup.sourceId,
    payload: { toLocationId: setup.targetId, days: 180 },
    source: "system",
  });

  const sourceAfter = byId(populations(setup.simulation, setup.sourceId), "species-fixture.warm-grazer").population;
  const targetAfter = byId(populations(setup.simulation, setup.targetId), "species-fixture.warm-grazer").population;
  assert.ok(targetAfter > 0);
  assert.ok(sourceAfter < sourceBefore);
  assert.ok(Math.abs((sourceBefore - sourceAfter) - targetAfter) < 0.03, "dispersal should conserve the represented species population");
});

test("dispersal carries population trait offsets into a newly colonized location", () => {
  const setup = buildConnectedHabitats(
    22017,
    5,
    { latitudeDeg: 20, elevationM: 100, terrain: "valley", soilMoisture: 0.74 },
  );
  must(setup.simulation, {
    type: "world-species.seed_populations",
    targetId: setup.sourceId,
    payload: {
      populations: [{
        speciesId: "species-fixture.warm-grazer",
        population: 50,
        traitOffsets: {
          temperatureOptimumDeltaC: -3,
          waterOptimumDelta: 0.06,
          reproductiveOutputDelta: 0.02,
        },
      }],
    },
  });
  must(setup.simulation, {
    type: "world-species.disperse_to_neighbor",
    targetId: setup.sourceId,
    payload: { toLocationId: setup.targetId, days: 180 },
    source: "system",
  });
  const colonist = byId(populations(setup.simulation, setup.targetId), "species-fixture.warm-grazer");
  assert.deepEqual(colonist.traitOffsets, {
    temperatureOptimumDeltaC: -3,
    waterOptimumDelta: 0.06,
    reproductiveOutputDelta: 0.02,
  });
});

test("isolated local populations can accumulate divergence potential without automatically becoming new species", () => {
  const setup = buildConnectedHabitats(
    22020,
    12,
    { latitudeDeg: 42, elevationM: 900, terrain: "plateau", soilMoisture: 0.5 },
  );
  must(setup.simulation, {
    type: "world-species.seed_populations",
    targetId: setup.sourceId,
    payload: {
      populations: [{
        speciesId: "species-fixture.warm-grazer",
        population: 30,
        traitOffsets: {
          temperatureOptimumDeltaC: -6,
          waterOptimumDelta: -0.18,
          reproductiveOutputDelta: 0,
        },
      }],
    },
  });
  must(setup.simulation, {
    type: "world-species.seed_populations",
    targetId: setup.targetId,
    payload: {
      populations: [{
        speciesId: "species-fixture.warm-grazer",
        population: 18,
        traitOffsets: {
          temperatureOptimumDeltaC: 5,
          waterOptimumDelta: 0.22,
          reproductiveOutputDelta: 0.08,
        },
      }],
    },
  });
  for (const locationId of [setup.sourceId, setup.targetId]) {
    must(setup.simulation, {
      type: "world-species.apply_selection",
      targetId: locationId,
      payload: { generations: 240, standingVariation: 0 },
      source: "system",
    });
  }

  const divergence = setup.simulation.project({
    id: "world-species.divergence",
    params: {
      speciesId: "species-fixture.warm-grazer",
      locationAId: setup.sourceId,
      locationBId: setup.targetId,
    },
  }).data!;
  assert.equal(divergence.exists, true);
  assert.equal(divergence.isolationGenerations, 240);
  assert.equal(divergence.geneFlowSignal, 0);
  assert.ok(Number(divergence.traitDistance) > 0.3);
  assert.ok(Number(divergence.divergencePotential) > 0.2);
  assert.equal(divergence.speciationTriggered, false);
  assert.equal("newSpeciesId" in divergence, false, "divergence observation must not silently create a new species");
});

test("gene flow mixes traits and lowers divergence potential between local populations", () => {
  const setup = buildConnectedHabitats(
    22021,
    5,
    { latitudeDeg: 28, elevationM: 180, terrain: "plain", soilMoisture: 0.7 },
  );
  must(setup.simulation, {
    type: "world-species.seed_populations",
    targetId: setup.sourceId,
    payload: {
      populations: [{
        speciesId: "species-fixture.warm-grazer",
        population: 45,
        traitOffsets: {
          temperatureOptimumDeltaC: -5,
          waterOptimumDelta: -0.16,
          reproductiveOutputDelta: 0,
        },
      }],
    },
  });
  must(setup.simulation, {
    type: "world-species.seed_populations",
    targetId: setup.targetId,
    payload: {
      populations: [{
        speciesId: "species-fixture.warm-grazer",
        population: 8,
        traitOffsets: {
          temperatureOptimumDeltaC: 4,
          waterOptimumDelta: 0.18,
          reproductiveOutputDelta: 0,
        },
      }],
    },
  });
  for (const locationId of [setup.sourceId, setup.targetId]) {
    must(setup.simulation, {
      type: "world-species.apply_selection",
      targetId: locationId,
      payload: { generations: 180, standingVariation: 0 },
      source: "system",
    });
  }
  const before = setup.simulation.project({
    id: "world-species.divergence",
    params: { speciesId: "species-fixture.warm-grazer", locationAId: setup.sourceId, locationBId: setup.targetId },
  }).data!;

  must(setup.simulation, {
    type: "world-species.disperse_to_neighbor",
    targetId: setup.sourceId,
    payload: { toLocationId: setup.targetId, days: 365 },
    source: "system",
  });

  const after = setup.simulation.project({
    id: "world-species.divergence",
    params: { speciesId: "species-fixture.warm-grazer", locationAId: setup.sourceId, locationBId: setup.targetId },
  }).data!;
  assert.ok(Number(after.geneFlowSignal) > Number(before.geneFlowSignal));
  assert.ok(Number(after.traitDistance) < Number(before.traitDistance));
  assert.ok(Number(after.isolationGenerations) < Number(before.isolationGenerations));
  assert.ok(Number(after.divergencePotential) < Number(before.divergencePotential));
  assert.equal(after.speciationTriggered, false);
});

test("reproductive isolation remains a conservative proxy and never auto-speciates", () => {
  const setup = buildConnectedHabitats(
    22022,
    15,
    { latitudeDeg: 44, elevationM: 1100, terrain: "plateau", soilMoisture: 0.48 },
  );
  must(setup.simulation, {
    type: "world-species.seed_populations",
    targetId: setup.sourceId,
    payload: { populations: [{
      speciesId: "species-fixture.warm-grazer",
      population: 28,
      traitOffsets: { temperatureOptimumDeltaC: -7, waterOptimumDelta: -0.2, reproductiveOutputDelta: 0 },
    }] },
  });
  must(setup.simulation, {
    type: "world-species.seed_populations",
    targetId: setup.targetId,
    payload: { populations: [{
      speciesId: "species-fixture.warm-grazer",
      population: 20,
      traitOffsets: { temperatureOptimumDeltaC: 6, waterOptimumDelta: 0.24, reproductiveOutputDelta: 0.06 },
    }] },
  });
  for (const locationId of [setup.sourceId, setup.targetId]) {
    must(setup.simulation, {
      type: "world-species.apply_selection",
      targetId: locationId,
      payload: { generations: 260, standingVariation: 0 },
      source: "system",
    });
  }

  const isolation = setup.simulation.project({
    id: "world-species.reproductive-isolation",
    params: { speciesId: "species-fixture.warm-grazer", locationAId: setup.sourceId, locationBId: setup.targetId },
  }).data!;
  assert.equal(isolation.exists, true);
  assert.ok(Number(isolation.reproductiveIsolationPotential) > 0.25);
  assert.ok(Number(isolation.mateCompatibilityProxy) < 1);
  assert.ok(Number(isolation.hybridFitnessProxy) < 1);
  assert.equal(isolation.behavioralIsolationModeled, false);
  assert.equal(isolation.geneticIncompatibilityModeled, false);
  assert.equal(isolation.matingSimulated, false);
  assert.equal(isolation.speciationTriggered, false);
});

test("renewed gene flow raises compatibility proxies and lowers reproductive-isolation potential", () => {
  const setup = buildConnectedHabitats(
    22023,
    4,
    { latitudeDeg: 27, elevationM: 160, terrain: "plain", soilMoisture: 0.72 },
  );
  must(setup.simulation, {
    type: "world-species.seed_populations",
    targetId: setup.sourceId,
    payload: { populations: [{
      speciesId: "species-fixture.warm-grazer",
      population: 48,
      traitOffsets: { temperatureOptimumDeltaC: -6, waterOptimumDelta: -0.18, reproductiveOutputDelta: 0 },
    }] },
  });
  must(setup.simulation, {
    type: "world-species.seed_populations",
    targetId: setup.targetId,
    payload: { populations: [{
      speciesId: "species-fixture.warm-grazer",
      population: 7,
      traitOffsets: { temperatureOptimumDeltaC: 5, waterOptimumDelta: 0.2, reproductiveOutputDelta: 0 },
    }] },
  });
  for (const locationId of [setup.sourceId, setup.targetId]) {
    must(setup.simulation, {
      type: "world-species.apply_selection",
      targetId: locationId,
      payload: { generations: 200, standingVariation: 0 },
      source: "system",
    });
  }
  const before = setup.simulation.project({
    id: "world-species.reproductive-isolation",
    params: { speciesId: "species-fixture.warm-grazer", locationAId: setup.sourceId, locationBId: setup.targetId },
  }).data!;

  must(setup.simulation, {
    type: "world-species.disperse_to_neighbor",
    targetId: setup.sourceId,
    payload: { toLocationId: setup.targetId, days: 365 },
    source: "system",
  });

  const after = setup.simulation.project({
    id: "world-species.reproductive-isolation",
    params: { speciesId: "species-fixture.warm-grazer", locationAId: setup.sourceId, locationBId: setup.targetId },
  }).data!;
  assert.ok(Number(after.geneFlowSignal) > Number(before.geneFlowSignal));
  assert.ok(Number(after.reproductiveIsolationPotential) < Number(before.reproductiveIsolationPotential));
  assert.ok(Number(after.mateCompatibilityProxy) > Number(before.mateCompatibilityProxy));
  assert.ok(Number(after.hybridFitnessProxy) > Number(before.hybridFitnessProxy));
  assert.equal(after.speciationTriggered, false);
});

test("shorter connections and more suitable target habitats receive more dispersers", () => {
  const nearWarm = buildConnectedHabitats(
    22006,
    4,
    { latitudeDeg: 20, elevationM: 90, terrain: "valley", soilMoisture: 0.78 },
  );
  const farWarm = buildConnectedHabitats(
    22006,
    80,
    { latitudeDeg: 20, elevationM: 90, terrain: "valley", soilMoisture: 0.78 },
  );
  const nearCold = buildConnectedHabitats(
    22006,
    4,
    { latitudeDeg: 55, elevationM: 1900, terrain: "plateau", soilMoisture: 0.42 },
  );

  for (const setup of [nearWarm, farWarm, nearCold]) {
    must(setup.simulation, {
      type: "world-species.disperse_to_neighbor",
      targetId: setup.sourceId,
      payload: { toLocationId: setup.targetId, days: 180 },
      source: "system",
    });
  }

  const nearWarmCount = byId(populations(nearWarm.simulation, nearWarm.targetId), "species-fixture.warm-grazer").population;
  const farWarmCount = byId(populations(farWarm.simulation, farWarm.targetId), "species-fixture.warm-grazer").population;
  const nearColdCount = byId(populations(nearCold.simulation, nearCold.targetId), "species-fixture.warm-grazer").population;
  assert.ok(nearWarmCount > farWarmCount, "distance should damp dispersal");
  assert.ok(nearWarmCount > nearColdCount, "poor target habitat fitness should damp colonization");
});

test("dispersal requires geography adjacency and never exceeds the target ecology guild total", () => {
  const setup = buildConnectedHabitats(
    22007,
    6,
    { latitudeDeg: 21, elevationM: 100, terrain: "plain", soilMoisture: 0.74 },
  );
  must(setup.simulation, {
    type: "world-species.disperse_to_neighbor",
    targetId: setup.sourceId,
    payload: { toLocationId: setup.targetId, days: 365 },
    source: "system",
  });
  const targetEcology = setup.simulation.project({ id: "world-ecology.location-state", params: { locationId: setup.targetId } }).data!;
  const targetPops = populations(setup.simulation, setup.targetId);
  const representedHerbivores = targetPops
    .filter((entry) => entry.trophicRole === "herbivore")
    .reduce((sum, entry) => sum + Number(entry.population), 0);
  assert.ok(representedHerbivores <= Number(targetEcology.herbivorePopulation) + 0.02);

  must(setup.simulation, { type: "world-geography.create_location", payload: {
    regionId: setup.simulation.worldView().listEntities({ kind: GeographyKinds.region })[0]!.id,
    name: "Isolated",
  } });
  const isolatedId = setup.simulation.worldView().listEntities({ kind: GeographyKinds.location })
    .find((entity) => entity.components["world-geography.location"]?.name === "Isolated")!.id;
  must(setup.simulation, {
    type: "world-geosphere.set_profile",
    targetId: isolatedId,
    payload: { elevationM: 120, terrain: "plain", substrate: "alluvium", tectonicSetting: "stable" },
  });
  must(setup.simulation, {
    type: "world-climate.set_baseline",
    targetId: isolatedId,
    payload: { latitudeDeg: 22, maritimeInfluence: 0.65 },
  });
  must(setup.simulation, {
    type: "world-hydrology.initialize_location",
    targetId: isolatedId,
    payload: { initialSoilMoisture: 0.7 },
  });
  must(setup.simulation, {
    type: "world-ecology.initialize_location",
    targetId: isolatedId,
    payload: {},
  });
  seedVegetation(setup.simulation, isolatedId);
  const rejected = setup.simulation.dispatch({
    type: "world-species.disperse_to_neighbor",
    targetId: setup.sourceId,
    payload: { toLocationId: isolatedId, days: 30 },
    source: "system",
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.errors[0]?.code, "E_SPECIES_NOT_ADJACENT");
});
