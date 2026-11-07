import { test } from "node:test";
import assert from "node:assert/strict";
import { GeographyKinds, worldGeographyModule } from "@openlife/module-world-geography";
import { worldGeosphereModule } from "@openlife/module-world-geosphere";
import { worldClimateModule } from "@openlife/module-world-climate";
import { worldWeatherModule } from "@openlife/module-world-weather";
import { worldHydrologyModule } from "@openlife/module-world-hydrology";
import { Simulation } from "@openlife/simulation";

function must(simulation: Simulation, intent: Parameters<Simulation["dispatch"]>[0]) {
  const result = simulation.dispatch(intent);
  assert.equal(result.ok, true, result.errors.map((error) => `${error.code}: ${error.message}`).join("; "));
}

function buildLocation(
  seed: number,
  substrate: string,
  terrain: string,
  elevationM: number,
  initialSoilMoisture = 0.35,
) {
  const simulation = new Simulation({
    worldSeed: seed,
    modules: [worldGeographyModule, worldGeosphereModule, worldClimateModule, worldWeatherModule, worldHydrologyModule],
  });
  must(simulation, { type: "world-geography.create_region", payload: { name: "Water Region" } });
  const regionId = simulation.worldView().listEntities({ kind: GeographyKinds.region })[0]!.id;
  must(simulation, { type: "world-geography.create_location", payload: { regionId, name: "Water Location" } });
  const locationId = simulation.worldView().listEntities({ kind: GeographyKinds.location })[0]!.id;
  must(simulation, {
    type: "world-geosphere.set_profile",
    targetId: locationId,
    payload: { elevationM, terrain, substrate, tectonicSetting: "stable" },
  });
  must(simulation, {
    type: "world-climate.set_baseline",
    targetId: locationId,
    payload: { latitudeDeg: 18, maritimeInfluence: 0.85 },
  });
  must(simulation, {
    type: "world-hydrology.initialize_location",
    targetId: locationId,
    payload: { initialSoilMoisture },
  });
  return { simulation, regionId, locationId };
}

function state(simulation: Simulation, locationId: string) {
  const projection = simulation.project({ id: "world-hydrology.location-state", params: { locationId } });
  assert.equal(projection.data?.exists, true);
  return projection.data!;
}

function advanceWeatherUntilRain(simulation: Simulation, regionId: string, locationId: string) {
  for (let step = 0; step < 12; step += 1) {
    must(simulation, {
      type: "world-weather.advance_region",
      targetId: regionId,
      payload: { seasonPhase: 0.2 + step * 0.01 },
      source: "system",
    });
    const weather = simulation.project({ id: "world-weather.location-conditions", params: { locationId } }).data!;
    if (weather.precipitationActive && Number(weather.precipitationMmPerDay) > 0) return weather;
  }
  assert.fail("expected deterministic wet tropical setup to produce rain within twelve weather steps");
}

test("soil physical properties come from substrate and terrain rather than ecology labels", () => {
  const clay = buildLocation(20001, "clay-rich-sediment", "valley", 80);
  const granite = buildLocation(20002, "granite", "mountain", 1300);
  const clayState = state(clay.simulation, clay.locationId);
  const graniteState = state(granite.simulation, granite.locationId);

  assert.ok(Number(clayState.retentionCapacity) > Number(graniteState.retentionCapacity));
  assert.ok(Number(clayState.infiltrationCapacity) > Number(graniteState.infiltrationCapacity), "valley geometry can outweigh impermeable clay relative to steep exposed granite");
  assert.ok(Number(graniteState.runoffTendency) > Number(clayState.runoffTendency));
  assert.equal("fertility" in clayState, false);
  assert.equal("biome" in clayState, false);
});

test("rainfall becomes infiltration, runoff and higher local water availability", () => {
  const wet = buildLocation(20003, "alluvium", "plain", 40, 0.2);
  const before = state(wet.simulation, wet.locationId);
  const weather = advanceWeatherUntilRain(wet.simulation, wet.regionId, wet.locationId);
  must(wet.simulation, {
    type: "world-hydrology.advance_location",
    targetId: wet.locationId,
    payload: { days: 1 },
    source: "system",
  });
  const after = state(wet.simulation, wet.locationId);

  assert.ok(Number(weather.precipitationMmPerDay) > 0);
  assert.ok(Number(after.lastInfiltrationMm) > 0);
  assert.ok(Number(after.lastRunoffMm) >= 0);
  assert.ok(Number(after.soilMoisture) > Number(before.soilMoisture));
  assert.ok(Number(after.waterAvailability) > Number(before.waterAvailability));
});

test("the same rainy weather partitions differently between flat alluvium and steep granite", () => {
  const alluvium = buildLocation(20004, "alluvium", "plain", 50, 0.25);
  const granite = buildLocation(20004, "granite", "mountain", 1300, 0.25);

  const rainA = advanceWeatherUntilRain(alluvium.simulation, alluvium.regionId, alluvium.locationId);
  const rainB = advanceWeatherUntilRain(granite.simulation, granite.regionId, granite.locationId);
  assert.equal(rainA.regionalTemperatureAnomalyC, rainB.regionalTemperatureAnomalyC);

  must(alluvium.simulation, { type: "world-hydrology.advance_location", targetId: alluvium.locationId, payload: { days: 1 }, source: "system" });
  must(granite.simulation, { type: "world-hydrology.advance_location", targetId: granite.locationId, payload: { days: 1 }, source: "system" });
  const alluviumState = state(alluvium.simulation, alluvium.locationId);
  const graniteState = state(granite.simulation, granite.locationId);

  assert.ok(Number(alluviumState.lastInfiltrationMm) > Number(graniteState.lastInfiltrationMm));
  assert.ok(Number(graniteState.lastRunoffMm) > Number(alluviumState.lastRunoffMm));
});
