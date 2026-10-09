import { test } from "node:test";
import assert from "node:assert/strict";
import { worldGeographyModule, GeographyKinds } from "@openlife/module-world-geography";
import { worldGeosphereModule } from "@openlife/module-world-geosphere";
import { worldClimateModule } from "@openlife/module-world-climate";
import { worldWeatherModule } from "@openlife/module-world-weather";
import { Simulation } from "@openlife/simulation";

function must(simulation: Simulation, intent: Parameters<Simulation["dispatch"]>[0]) {
  const result = simulation.dispatch(intent);
  assert.equal(result.ok, true, result.errors.map((error) => `${error.code}: ${error.message}`).join("; "));
}

function buildRegion(seed: number, latitudeDeg = 35) {
  const simulation = new Simulation({
    worldSeed: seed,
    modules: [worldGeographyModule, worldGeosphereModule, worldClimateModule, worldWeatherModule],
  });
  must(simulation, { type: "world-geography.create_region", payload: { name: "Weather Region" } });
  const regionId = simulation.worldView().listEntities({ kind: GeographyKinds.region })[0]!.id;

  const addLocation = (
    name: string,
    elevationM: number,
    terrain: string,
    maritimeInfluence: number,
  ) => {
    must(simulation, { type: "world-geography.create_location", payload: { regionId, name } });
    const locations = simulation.worldView().listEntities({ kind: GeographyKinds.location });
    const locationId = locations.find((entity) => entity.components["world-geography.location"]?.name === name)!.id;
    must(simulation, {
      type: "world-geosphere.set_profile",
      targetId: locationId,
      payload: { elevationM, terrain, substrate: terrain === "coast" ? "alluvium" : "granite", tectonicSetting: "stable" },
    });
    must(simulation, {
      type: "world-climate.set_baseline",
      targetId: locationId,
      payload: { latitudeDeg, maritimeInfluence },
    });
    return locationId;
  };

  const coastId = addLocation("Coast", 20, "coast", 0.95);
  const mountainId = addLocation("Mountain", 1900, "mountain", 0.45);
  must(simulation, {
    type: "world-geography.connect_locations",
    payload: { fromLocationId: coastId, toLocationId: mountainId, distanceKm: 42 },
  });
  return { simulation, regionId, coastId, mountainId };
}

function weather(simulation: Simulation, locationId: string) {
  const projection = simulation.project({ id: "world-weather.location-conditions", params: { locationId } });
  assert.equal(projection.data?.exists, true);
  return projection.data!;
}

test("locations in one region share the same weather disturbance while local climate and terrain still matter", () => {
  const { simulation, regionId, coastId, mountainId } = buildRegion(19001);
  must(simulation, {
    type: "world-weather.advance_region",
    targetId: regionId,
    payload: { seasonPhase: 0.25 },
    source: "system",
  });

  const coast = weather(simulation, coastId);
  const mountain = weather(simulation, mountainId);

  assert.equal(coast.regionId, mountain.regionId);
  assert.equal(coast.regionalTemperatureAnomalyC, mountain.regionalTemperatureAnomalyC);
  assert.equal(coast.regionalHumidityAnomaly, mountain.regionalHumidityAnomaly);
  assert.equal(coast.precipitationActive, mountain.precipitationActive, "one regional rain event should not randomly disappear between nearby locations");
  assert.ok(Number(mountain.currentTemperatureC) < Number(coast.currentTemperatureC), "high-elevation mountain should remain colder under the same disturbance");
  assert.ok(Number(mountain.windSpeedMps) > Number(coast.windSpeedMps) * 0.8, "terrain may modify, not replace, the shared regional wind state");
});

test("season phase changes the local temperature around the same climate baseline", () => {
  const winter = buildRegion(19002, 42);
  must(winter.simulation, {
    type: "world-weather.advance_region",
    targetId: winter.regionId,
    payload: { seasonPhase: 0 },
    source: "system",
  });

  const summer = buildRegion(19002, 42);
  must(summer.simulation, {
    type: "world-weather.advance_region",
    targetId: summer.regionId,
    payload: { seasonPhase: 0.5 },
    source: "system",
  });

  const winterCoast = weather(winter.simulation, winter.coastId);
  const summerCoast = weather(summer.simulation, summer.coastId);
  assert.ok(Number(summerCoast.currentTemperatureC) > Number(winterCoast.currentTemperatureC) + 8);
  assert.equal(winterCoast.regionalTemperatureAnomalyC, summerCoast.regionalTemperatureAnomalyC, "same seed should isolate the seasonal offset from random anomaly");
});

test("a late-added neighboring Region participates in weather continuity through the geography seam", () => {
  const simulation = new Simulation({
    worldSeed: 19004,
    modules: [worldGeographyModule, worldGeosphereModule, worldClimateModule, worldWeatherModule],
  });

  const createRegionWithBorder = (regionName: string, borderName: string) => {
    must(simulation, { type: "world-geography.create_region", payload: { name: regionName } });
    const regionId = simulation.worldView().listEntities({ kind: GeographyKinds.region })
      .find((entity) => entity.components["world-geography.region"]?.name === regionName)!.id;
    must(simulation, { type: "world-geography.create_location", payload: { regionId, name: borderName } });
    const locationId = simulation.worldView().listEntities({ kind: GeographyKinds.location })
      .find((entity) => entity.components["world-geography.location"]?.name === borderName)!.id;
    must(simulation, {
      type: "world-geosphere.set_profile",
      targetId: locationId,
      payload: { elevationM: 80, terrain: "plain", substrate: "alluvium", tectonicSetting: "stable" },
    });
    must(simulation, {
      type: "world-climate.set_baseline",
      targetId: locationId,
      payload: { latitudeDeg: 34, maritimeInfluence: 0.6 },
    });
    return { regionId, locationId };
  };

  const original = createRegionWithBorder("Original Country", "Original Border");
  must(simulation, {
    type: "world-weather.advance_region",
    targetId: original.regionId,
    payload: { seasonPhase: 0.25 },
    source: "system",
  });

  const expansion = createRegionWithBorder("Expansion Country", "Expansion Border");
  must(simulation, {
    type: "world-geography.connect_locations",
    payload: { fromLocationId: original.locationId, toLocationId: expansion.locationId, distanceKm: 20 },
  });
  must(simulation, {
    type: "world-weather.advance_region",
    targetId: expansion.regionId,
    payload: { seasonPhase: 0.25 },
    source: "system",
  });

  const expansionState = simulation.worldView().getComponent(expansion.regionId, "world-weather.region-state")!;
  assert.equal(expansionState.neighboringRegionInfluenceCount, 1, "new Region weather should immediately see the stitched existing neighbor");

  const neighbors = simulation.project({ id: "world-geography.region-neighbors", params: { regionId: expansion.regionId } });
  assert.equal((neighbors.data?.neighbors as unknown[]).length, 1);
});

test("regional weather evolution is deterministic for the same seed and input sequence", () => {
  const run = () => {
    const setup = buildRegion(19003);
    for (const seasonPhase of [0.1, 0.12, 0.14]) {
      must(setup.simulation, {
        type: "world-weather.advance_region",
        targetId: setup.regionId,
        payload: { seasonPhase },
        source: "system",
      });
    }
    return {
      coast: weather(setup.simulation, setup.coastId),
      mountain: weather(setup.simulation, setup.mountainId),
    };
  };

  assert.deepEqual(run(), run());
});
