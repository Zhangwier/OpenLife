/**
 * Minimal dynamic weather layer.
 *
 * A Region owns the shared weather disturbance. Locations inside that Region
 * derive current conditions from the same disturbance plus their own long-term
 * climate and terrain. This provides spatial continuity without pretending to
 * solve atmospheric fluid dynamics.
 */

import type { OpenLifeModule, WorldView } from "@openlife/contracts";
import { GeographyKinds, GeographyRelations, type GeographyApi } from "@openlife/module-world-geography";
import type { ClimateApi, ClimateProfileSnapshot } from "@openlife/module-world-climate";

const OWNER = "world-weather";
const CAPABILITY = "world.weather-current";

export const WeatherComponents = {
  regionState: "world-weather.region-state",
} as const;

export interface RegionWeatherSnapshot {
  seasonPhase: number;
  stepIndex: number;
  temperatureAnomalyC: number;
  humidityAnomaly: number;
  pressureHpa: number;
  windSpeedMps: number;
  cloudCover: number;
  precipitationActive: boolean;
  precipitationMmPerDay: number;
  neighboringRegionInfluenceCount: number;
}

export interface WeatherConditionsSnapshot {
  locationId: string;
  regionId: string;
  currentTemperatureC: number;
  relativeHumidity: number;
  windSpeedMps: number;
  cloudCover: number;
  precipitationActive: boolean;
  precipitationMmPerDay: number;
  precipitationType: "none" | "rain" | "snow";
  seasonPhase: number;
  regionalTemperatureAnomalyC: number;
  regionalHumidityAnomaly: number;
}

export interface WeatherApi {
  regionState(world: WorldView, regionId: string): RegionWeatherSnapshot | undefined;
  current(world: WorldView, locationId: string): WeatherConditionsSnapshot | undefined;
}

export const worldWeatherModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "World Weather Prototype",
    description: "Region-scale dynamic weather disturbances with location-scale climate and terrain correction.",
    requires: ["world.geography", "world.climate-profile"],
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
    const climate = ctx.registry.capabilityImplementation("world.climate-profile") as ClimateApi | undefined;
    const geography = ctx.registry.capabilityImplementation("world.geography") as GeographyApi | undefined;
    if (!climate) throw new Error("world weather requires the world.climate-profile implementation");
    if (!geography) throw new Error("world weather requires the world.geography implementation");

    const api: WeatherApi = {
      regionState(world, regionId) {
        const region = world.getEntity(regionId);
        if (!region || region.kind !== GeographyKinds.region || region.archivedAt !== undefined) return undefined;
        const raw = region.components[WeatherComponents.regionState];
        return raw ? regionSnapshot(raw) : undefined;
      },
      current(world, locationId) {
        const location = world.getEntity(locationId);
        if (!location || location.kind !== GeographyKinds.location || location.archivedAt !== undefined) return undefined;
        const climateProfile = climate.profile(world, locationId);
        if (!climateProfile) return undefined;
        const regionId = world.listRelations({ type: GeographyRelations.contains, to: locationId })[0]?.from ?? "";
        if (!regionId) return undefined;
        const state = api.regionState(world, regionId);
        if (!state) return undefined;
        const regionalClimates = climatesInRegion(world, regionId, climate);
        return locationConditions(locationId, regionId, climateProfile, state, regionalClimates);
      },
    };
    ctx.provideCapability(CAPABILITY, api);

    ctx.registerComponent({
      id: WeatherComponents.regionState,
      persist: true,
      description: "Shared short-term atmospheric disturbance affecting locations within one Region.",
    });

    ctx.registerCommand({
      type: "world-weather.advance_region",
      description: "Advance one Region's weather by one abstract weather step at the supplied point in the annual seasonal cycle.",
    });

    ctx.registerConstraintRule({
      id: "world-weather.advance_region.allowed",
      commandType: "world-weather.advance_region",
      evaluate: (c) => {
        const regionId = c.command.targetId;
        const region = regionId ? c.world.getEntity(regionId) : undefined;
        if (!region || region.kind !== GeographyKinds.region || region.archivedAt !== undefined) {
          return { ok: false, code: "E_WEATHER_REGION", message: "target must be an existing geography region" };
        }
        const seasonPhase = Number(c.command.payload.seasonPhase);
        if (!Number.isFinite(seasonPhase) || seasonPhase < 0 || seasonPhase > 1) {
          return { ok: false, code: "E_WEATHER_SEASON", message: "seasonPhase must be between 0 and 1" };
        }
        if (climatesInRegion(c.world, regionId as string, climate).length === 0) {
          return { ok: false, code: "E_WEATHER_CLIMATE", message: "region needs at least one location with a climate baseline" };
        }
        return { ok: true };
      },
    });

    ctx.registerResolutionRule({
      id: "world-weather.advance_region.resolve",
      commandType: "world-weather.advance_region",
      resolve: (c) => {
        const regionId = c.command.targetId as string;
        const seasonPhase = Number(c.command.payload.seasonPhase);
        const climates = climatesInRegion(c.world, regionId, climate);
        const previous = api.regionState(c.world, regionId);
        const meanHumidity = mean(climates.map((item) => item.humidityTendency));
        const meanPrecipitation = mean(climates.map((item) => item.annualPrecipitationMm));
        const meanSeasonality = mean(climates.map((item) => item.precipitationSeasonality));
        const neighboringStates = geography.neighboringRegions(c.world, regionId)
          .map((neighbor) => api.regionState(c.world, neighbor.regionId))
          .filter((state): state is RegionWeatherSnapshot => state !== undefined);
        const neighboringTemperatureAnomaly = neighboringStates.length > 0
          ? mean(neighboringStates.map((state) => state.temperatureAnomalyC))
          : 0;
        const neighboringHumidityAnomaly = neighboringStates.length > 0
          ? mean(neighboringStates.map((state) => state.humidityAnomaly))
          : 0;
        const neighboringPressureOffset = neighboringStates.length > 0
          ? mean(neighboringStates.map((state) => state.pressureHpa - 1013))
          : 0;
        const neighborCoupling = neighboringStates.length > 0 ? 0.18 : 0;

        const temperatureNoise = centered(c.rng.nextFloat()) * 5.5;
        const humidityNoise = centered(c.rng.nextFloat()) * 0.28;
        const pressureNoise = centered(c.rng.nextFloat()) * 9;
        const precipitationRoll = c.rng.nextFloat();
        const precipitationStrength = c.rng.nextFloat();
        const windNoise = c.rng.nextFloat();

        const temperaturePersistence = previous ? 0.56 : 0;
        const humidityPersistence = previous ? 0.52 : 0;
        const pressurePersistence = previous ? 0.44 : 0;
        const temperatureAnomalyC = round1(
          (previous?.temperatureAnomalyC ?? 0) * temperaturePersistence
          + neighboringTemperatureAnomaly * neighborCoupling
          + temperatureNoise * (1 - temperaturePersistence - neighborCoupling),
        );
        const humidityAnomaly = round2(
          (previous?.humidityAnomaly ?? 0) * humidityPersistence
          + neighboringHumidityAnomaly * neighborCoupling
          + humidityNoise * (1 - humidityPersistence - neighborCoupling),
        );
        const pressureHpa = round1(
          1013
          + (previous ? previous.pressureHpa - 1013 : 0) * pressurePersistence
          + neighboringPressureOffset * neighborCoupling
          + pressureNoise * (1 - pressurePersistence - neighborCoupling),
        );
        const wetness = clamp(meanHumidity + humidityAnomaly, 0, 1);
        const precipitationChance = clamp(
          0.08
          + wetness * 0.48
          + Math.min(1, meanPrecipitation / 2200) * 0.22
          + meanSeasonality * seasonalPrecipitationPulse(seasonPhase) * 0.14,
          0.03,
          0.88,
        );
        const precipitationActive = precipitationRoll < precipitationChance;
        const precipitationMmPerDay = precipitationActive
          ? round1(1.5 + precipitationStrength * (5 + meanPrecipitation / 95))
          : 0;
        const windSpeedMps = round1(clamp(
          1.1 + Math.abs(pressureHpa - 1013) * 0.32 + windNoise * 5.5,
          0,
          28,
        ));
        const cloudCover = round2(clamp(
          wetness * 0.72 + (precipitationActive ? 0.25 : 0) + centered(c.rng.nextFloat()) * 0.08,
          0,
          1,
        ));

        const nextState: RegionWeatherSnapshot = {
          seasonPhase,
          stepIndex: (previous?.stepIndex ?? 0) + 1,
          temperatureAnomalyC,
          humidityAnomaly,
          pressureHpa,
          windSpeedMps,
          cloudCover,
          precipitationActive,
          precipitationMmPerDay,
          neighboringRegionInfluenceCount: neighboringStates.length,
        };
        return [{
          kind: "setComponent",
          entityId: regionId,
          component: WeatherComponents.regionState,
          value: { ...nextState, updatedAt: c.world.tick },
          reason: "regional weather state advanced",
        }, {
          kind: "emitEvent",
          eventType: "world-weather.region_advanced",
          targetId: regionId,
          data: nextState,
          historicalSignificance: 0,
        }];
      },
    });

    ctx.registerProjection({
      id: "world-weather.location-conditions",
      description: "Inspect current weather at one Location, derived from its Region's shared state and local climate/terrain.",
      build: ({ world, params }) => {
        const locationId = String(params.locationId ?? "");
        const current = api.current(world, locationId);
        return current ? { exists: true, ...current } : { exists: false, locationId };
      },
    });
  },
};

function climatesInRegion(world: WorldView, regionId: string, climate: ClimateApi): ClimateProfileSnapshot[] {
  return world.listRelations({ type: GeographyRelations.contains, from: regionId })
    .map((relation) => climate.profile(world, relation.to))
    .filter((profile): profile is ClimateProfileSnapshot => profile !== undefined);
}

function locationConditions(
  locationId: string,
  regionId: string,
  climate: ClimateProfileSnapshot,
  state: RegionWeatherSnapshot,
  regionalClimates: ClimateProfileSnapshot[],
): WeatherConditionsSnapshot {
  const seasonalOffset = temperatureSeasonOffset(climate, state.seasonPhase);
  const currentTemperatureC = round1(climate.meanAnnualTemperatureC + seasonalOffset + state.temperatureAnomalyC);
  const relativeHumidity = round2(clamp(climate.humidityTendency + state.humidityAnomaly, 0.05, 1));
  const regionalMeanPrecip = Math.max(1, mean(regionalClimates.map((item) => item.annualPrecipitationMm)));
  const localWetnessFactor = clamp(climate.annualPrecipitationMm / regionalMeanPrecip, 0.65, 1.45);
  const terrainRainFactor = climate.terrain === "mountain" ? 1.22
    : climate.terrain === "hill" ? 1.1
      : climate.terrain === "coast" ? 1.08
        : climate.terrain === "valley" ? 0.92
          : 1;
  const terrainWindFactor = climate.terrain === "mountain" ? 1.24
    : climate.terrain === "coast" ? 1.16
      : climate.terrain === "valley" ? 0.76
        : climate.terrain === "hill" ? 1.08
          : 1;
  const precipitationMmPerDay = state.precipitationActive
    ? round1(state.precipitationMmPerDay * localWetnessFactor * terrainRainFactor)
    : 0;
  const precipitationType = !state.precipitationActive
    ? "none"
    : currentTemperatureC <= 0.5
      ? "snow"
      : "rain";

  return {
    locationId,
    regionId,
    currentTemperatureC,
    relativeHumidity,
    windSpeedMps: round1(state.windSpeedMps * terrainWindFactor),
    cloudCover: state.cloudCover,
    precipitationActive: state.precipitationActive,
    precipitationMmPerDay,
    precipitationType,
    seasonPhase: state.seasonPhase,
    regionalTemperatureAnomalyC: state.temperatureAnomalyC,
    regionalHumidityAnomaly: state.humidityAnomaly,
  };
}

function temperatureSeasonOffset(climate: ClimateProfileSnapshot, seasonPhase: number): number {
  if (Math.abs(climate.latitudeDeg) < 3) return 0;
  const hemisphere = climate.latitudeDeg >= 0 ? 1 : -1;
  const amplitude = climate.temperatureSeasonalityC / 2;
  return round1(-Math.cos(seasonPhase * Math.PI * 2) * amplitude * hemisphere);
}

function seasonalPrecipitationPulse(seasonPhase: number): number {
  return 0.5 + 0.5 * Math.sin(seasonPhase * Math.PI * 2);
}

function regionSnapshot(raw: Readonly<Record<string, unknown>>): RegionWeatherSnapshot {
  return {
    seasonPhase: clamp(Number(raw.seasonPhase ?? 0), 0, 1),
    stepIndex: Math.max(0, Math.floor(Number(raw.stepIndex ?? 0))),
    temperatureAnomalyC: Number(raw.temperatureAnomalyC ?? 0),
    humidityAnomaly: Number(raw.humidityAnomaly ?? 0),
    pressureHpa: Number(raw.pressureHpa ?? 1013),
    windSpeedMps: Math.max(0, Number(raw.windSpeedMps ?? 0)),
    cloudCover: clamp(Number(raw.cloudCover ?? 0), 0, 1),
    precipitationActive: raw.precipitationActive === true,
    precipitationMmPerDay: Math.max(0, Number(raw.precipitationMmPerDay ?? 0)),
  };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function centered(value: number): number {
  return clamp(value, 0, 1) * 2 - 1;
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
