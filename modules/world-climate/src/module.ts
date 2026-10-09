/**
 * Long-term climate baseline for world locations.
 *
 * Climate answers "what is this place usually like?". It deliberately does
 * not generate daily weather, storms, fronts, rain shadows or hydrology.
 */

import type { OpenLifeModule, WorldView } from "@openlife/contracts";
import { GeographyKinds } from "@openlife/module-world-geography";
import type { GeosphereApi, TerrainType } from "@openlife/module-world-geosphere";

const OWNER = "world-climate";
const CAPABILITY = "world.climate-profile";

export const ClimateComponents = {
  profile: "world-climate.profile",
} as const;

export interface ClimateProfileSnapshot {
  latitudeDeg: number;
  maritimeInfluence: number;
  meanAnnualTemperatureC: number;
  temperatureSeasonalityC: number;
  annualPrecipitationMm: number;
  precipitationSeasonality: number;
  humidityTendency: number;
  aridityTendency: number;
  elevationM: number;
  terrain: TerrainType;
}

export interface ClimateApi {
  profile(world: WorldView, locationId: string): ClimateProfileSnapshot | undefined;
}

export const worldClimateModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "World Climate Prototype",
    description: "Long-term temperature, precipitation and seasonality baselines derived from location and geosphere facts.",
    requires: ["world.geography", "world.geosphere-profile"],
    provides: [CAPABILITY],
    capabilities: [
      "component.register",
      "command.register",
      "rule.constraint.register",
      "rule.resolution.register",
      "projection.register",
    ],
  },

  register(ctx) {
    const geosphere = ctx.registry.capabilityImplementation("world.geosphere-profile") as GeosphereApi | undefined;
    if (!geosphere) throw new Error("world climate requires the world.geosphere-profile implementation");

    const api: ClimateApi = {
      profile(world, locationId) {
        const location = world.getEntity(locationId);
        if (!location || location.kind !== GeographyKinds.location || location.archivedAt !== undefined) return undefined;
        const raw = location.components[ClimateComponents.profile];
        return raw ? snapshot(raw) : undefined;
      },
    };
    ctx.provideCapability(CAPABILITY, api);

    ctx.registerComponent({
      id: ClimateComponents.profile,
      persist: true,
      description: "Long-term climate baseline for one geography location; not current weather.",
    });

    ctx.registerCommand({
      type: "world-climate.set_baseline",
      description: "Derive one location's long-term climate baseline from latitude, maritime influence and current geosphere facts.",
    });

    ctx.registerConstraintRule({
      id: "world-climate.set_baseline.allowed",
      commandType: "world-climate.set_baseline",
      evaluate: (c) => {
        const locationId = c.command.targetId;
        const location = locationId ? c.world.getEntity(locationId) : undefined;
        if (!location || location.kind !== GeographyKinds.location || location.archivedAt !== undefined) {
          return { ok: false, code: "E_CLIMATE_LOCATION", message: "target must be an existing geography location" };
        }
        if (!geosphere.profile(c.world, locationId as string)) {
          return { ok: false, code: "E_CLIMATE_GEOSPHERE", message: "location needs a geosphere profile before climate can be derived" };
        }
        const latitudeDeg = Number(c.command.payload.latitudeDeg);
        if (!Number.isFinite(latitudeDeg) || latitudeDeg < -90 || latitudeDeg > 90) {
          return { ok: false, code: "E_CLIMATE_LATITUDE", message: "latitudeDeg must be between -90 and 90" };
        }
        const maritimeInfluence = Number(c.command.payload.maritimeInfluence ?? 0.5);
        if (!Number.isFinite(maritimeInfluence) || maritimeInfluence < 0 || maritimeInfluence > 1) {
          return { ok: false, code: "E_CLIMATE_MARITIME", message: "maritimeInfluence must be between 0 and 1" };
        }
        return { ok: true };
      },
    });

    ctx.registerResolutionRule({
      id: "world-climate.set_baseline.resolve",
      commandType: "world-climate.set_baseline",
      resolve: (c) => {
        const locationId = c.command.targetId as string;
        const geo = geosphere.profile(c.world, locationId)!;
        const latitudeDeg = Number(c.command.payload.latitudeDeg);
        const maritimeInfluence = Number(c.command.payload.maritimeInfluence ?? 0.5);
        const derived = deriveClimate(latitudeDeg, maritimeInfluence, geo.elevationM, geo.terrain);
        return [{
          kind: "setComponent",
          entityId: locationId,
          component: ClimateComponents.profile,
          value: {
            latitudeDeg,
            maritimeInfluence,
            elevationM: geo.elevationM,
            terrain: geo.terrain,
            ...derived,
            updatedAt: c.world.tick,
          },
          reason: "long-term climate baseline derived from latitude and geosphere facts",
        }, {
          kind: "emitEvent",
          eventType: "world-climate.baseline_set",
          targetId: locationId,
          data: { latitudeDeg, maritimeInfluence, elevationM: geo.elevationM, terrain: geo.terrain, ...derived },
          historicalSignificance: 0,
        }];
      },
    });

    ctx.registerProjection({
      id: "world-climate.location-profile",
      description: "Inspect one location's long-term climate baseline; current weather is intentionally absent.",
      build: ({ world, params }) => {
        const locationId = String(params.locationId ?? "");
        const profile = api.profile(world, locationId);
        return profile ? { exists: true, locationId, ...profile } : { exists: false, locationId };
      },
    });
  },
};

function deriveClimate(latitudeDeg: number, maritimeInfluence: number, elevationM: number, terrain: TerrainType) {
  const absLat = Math.abs(latitudeDeg);
  const latitudeTemperature = 29 - absLat * 0.48;
  const elevationCooling = Math.max(0, elevationM) * 0.006;
  const meanAnnualTemperatureC = round1(latitudeTemperature - elevationCooling);

  const continentality = 1 - maritimeInfluence;
  const temperatureSeasonalityC = round1(
    4 + (absLat / 90) * 22 + continentality * 9,
  );

  const equatorialWetness = Math.exp(-Math.pow(absLat / 18, 2));
  const subtropicalDryBelt = Math.exp(-Math.pow((absLat - 27) / 11, 2));
  const midLatitudeMoisture = Math.exp(-Math.pow((absLat - 50) / 20, 2));
  const terrainWetness = terrain === "mountain" ? 220
    : terrain === "hill" ? 110
      : terrain === "coast" ? 160
        : terrain === "valley" ? 40
          : 0;
  const precipitation = 650
    + equatorialWetness * 1200
    - subtropicalDryBelt * 520
    + midLatitudeMoisture * 340
    + maritimeInfluence * 420
    + terrainWetness;
  const annualPrecipitationMm = Math.round(clamp(precipitation, 120, 3200));

  const precipitationSeasonality = round2(clamp(
    0.18
    + subtropicalDryBelt * 0.35
    + continentality * 0.22
    + (terrain === "mountain" ? 0.05 : 0),
    0,
    1,
  ));
  const humidityTendency = round2(clamp(
    annualPrecipitationMm / 2200 * 0.65
    + maritimeInfluence * 0.35,
    0,
    1,
  ));
  const aridityTendency = round2(clamp(
    0.72
    - annualPrecipitationMm / 2600
    + Math.max(0, meanAnnualTemperatureC - 18) * 0.012,
    0,
    1,
  ));

  return {
    meanAnnualTemperatureC,
    temperatureSeasonalityC,
    annualPrecipitationMm,
    precipitationSeasonality,
    humidityTendency,
    aridityTendency,
  };
}

function snapshot(raw: Readonly<Record<string, unknown>>): ClimateProfileSnapshot {
  return {
    latitudeDeg: Number(raw.latitudeDeg ?? 0),
    maritimeInfluence: clamp(Number(raw.maritimeInfluence ?? 0.5), 0, 1),
    meanAnnualTemperatureC: Number(raw.meanAnnualTemperatureC ?? 0),
    temperatureSeasonalityC: Math.max(0, Number(raw.temperatureSeasonalityC ?? 0)),
    annualPrecipitationMm: Math.max(0, Number(raw.annualPrecipitationMm ?? 0)),
    precipitationSeasonality: clamp(Number(raw.precipitationSeasonality ?? 0), 0, 1),
    humidityTendency: clamp(Number(raw.humidityTendency ?? 0), 0, 1),
    aridityTendency: clamp(Number(raw.aridityTendency ?? 0), 0, 1),
    elevationM: Number(raw.elevationM ?? 0),
    terrain: String(raw.terrain ?? "plain") as TerrainType,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
