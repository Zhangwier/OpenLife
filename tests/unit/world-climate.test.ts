import { test } from "node:test";
import assert from "node:assert/strict";
import { worldGeographyModule, GeographyKinds } from "@openlife/module-world-geography";
import { worldGeosphereModule } from "@openlife/module-world-geosphere";
import { worldClimateModule, type ClimateApi } from "@openlife/module-world-climate";
import { Simulation } from "@openlife/simulation";

function must(simulation: Simulation, intent: Parameters<Simulation["dispatch"]>[0]) {
  const result = simulation.dispatch(intent);
  assert.equal(result.ok, true, result.errors.map((error) => `${error.code}: ${error.message}`).join("; "));
}

function setupLocation(
  seed: number,
  geo: { elevationM: number; terrain: string; substrate?: string; tectonicSetting?: string },
  latitudeDeg: number,
  maritimeInfluence: number,
) {
  const simulation = new Simulation({
    worldSeed: seed,
    modules: [worldGeographyModule, worldGeosphereModule, worldClimateModule],
  });
  must(simulation, { type: "world-geography.create_region", payload: { name: "Climate Region" } });
  const regionId = simulation.worldView().listEntities({ kind: GeographyKinds.region })[0]!.id;
  must(simulation, { type: "world-geography.create_location", payload: { regionId, name: "Climate Location" } });
  const locationId = simulation.worldView().listEntities({ kind: GeographyKinds.location })[0]!.id;
  must(simulation, {
    type: "world-geosphere.set_profile",
    targetId: locationId,
    payload: {
      elevationM: geo.elevationM,
      terrain: geo.terrain,
      substrate: geo.substrate ?? "granite",
      tectonicSetting: geo.tectonicSetting ?? "stable",
    },
  });
  must(simulation, {
    type: "world-climate.set_baseline",
    targetId: locationId,
    payload: { latitudeDeg, maritimeInfluence },
  });
  const profile = simulation.project({ id: "world-climate.location-profile", params: { locationId } });
  return { simulation, locationId, profile: profile.data! };
}

test("high elevation cools otherwise similar locations", () => {
  const low = setupLocation(18001, { elevationM: 100, terrain: "plain" }, 30, 0.4);
  const high = setupLocation(18002, { elevationM: 2100, terrain: "mountain" }, 30, 0.4);

  assert.ok(Number(high.profile.meanAnnualTemperatureC) < Number(low.profile.meanAnnualTemperatureC) - 10);
  assert.equal(high.profile.elevationM, 2100);
  assert.equal(high.profile.terrain, "mountain");
});

test("maritime influence softens temperature seasonality and increases the wetness tendency", () => {
  const inland = setupLocation(18003, { elevationM: 120, terrain: "plain" }, 42, 0.05);
  const maritime = setupLocation(18004, { elevationM: 120, terrain: "coast" }, 42, 0.95);

  assert.ok(Number(maritime.profile.temperatureSeasonalityC) < Number(inland.profile.temperatureSeasonalityC));
  assert.ok(Number(maritime.profile.annualPrecipitationMm) > Number(inland.profile.annualPrecipitationMm));
  assert.ok(Number(maritime.profile.humidityTendency) > Number(inland.profile.humidityTendency));
});

test("subtropical dry belts are represented as climate tendency rather than hard biome labels", () => {
  const subtropical = setupLocation(18005, { elevationM: 250, terrain: "plain" }, 27, 0.1);
  const equatorial = setupLocation(18006, { elevationM: 250, terrain: "plain" }, 2, 0.1);

  assert.ok(Number(subtropical.profile.annualPrecipitationMm) < Number(equatorial.profile.annualPrecipitationMm));
  assert.ok(Number(subtropical.profile.aridityTendency) > Number(equatorial.profile.aridityTendency));
  assert.equal("biome" in subtropical.profile, false, "climate should not decide ecology/biome labels");
});

test("climate capability exposes long-term baseline but no daily weather state", () => {
  let climateApi: ClimateApi | undefined;
  const probeModule = {
    manifest: {
      id: "climate-probe",
      version: "0.1.0",
      engineRange: "^0.1.0",
      type: "system-pack" as const,
      requires: ["world.climate-profile"],
    },
    register(ctx: Parameters<typeof worldClimateModule.register>[0]) {
      climateApi = ctx.registry.capabilityImplementation("world.climate-profile") as ClimateApi | undefined;
    },
  };
  const simulation = new Simulation({
    worldSeed: 18007,
    modules: [worldGeographyModule, worldGeosphereModule, worldClimateModule, probeModule],
  });
  must(simulation, { type: "world-geography.create_region", payload: { name: "Probe Region" } });
  const regionId = simulation.worldView().listEntities({ kind: GeographyKinds.region })[0]!.id;
  must(simulation, { type: "world-geography.create_location", payload: { regionId, name: "Probe Coast" } });
  const locationId = simulation.worldView().listEntities({ kind: GeographyKinds.location })[0]!.id;
  must(simulation, {
    type: "world-geosphere.set_profile",
    targetId: locationId,
    payload: { elevationM: 25, terrain: "coast", substrate: "alluvium", tectonicSetting: "stable" },
  });
  must(simulation, {
    type: "world-climate.set_baseline",
    targetId: locationId,
    payload: { latitudeDeg: 34, maritimeInfluence: 0.9 },
  });

  assert.ok(climateApi);
  const profile = climateApi.profile(simulation.worldView(), locationId);
  assert.ok(profile);
  const serialized = JSON.stringify(profile);
  assert.equal(serialized.includes("currentTemperature"), false);
  assert.equal(serialized.includes("rainToday"), false);
  assert.equal(serialized.includes("storm"), false);
});
