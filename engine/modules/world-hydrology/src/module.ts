/**
 * Minimal hydrology/soil-water layer.
 *
 * Weather reaches the ground here. Rainfall, terrain and substrate determine
 * infiltration, soil moisture, runoff, evaporation and local water availability.
 * River routing, groundwater networks, floods, agriculture and ecology belong to
 * later layers.
 */

import type { OpenLifeModule, WorldView, Effect } from "@openlife/contracts";
import { GeographyKinds } from "@openlife/module-world-geography";
import type { GeosphereApi, SubstrateType, TerrainType } from "@openlife/module-world-geosphere";
import type { WeatherApi } from "@openlife/module-world-weather";

const OWNER = "world-hydrology";
const CAPABILITY = "world.hydrology-state";

export const HydrologyComponents = {
  state: "world-hydrology.state",
} as const;

export type HydrologySnapshot = {
  soilMoisture: number;
  surfaceWaterMm: number;
  waterAvailability: number;
  lastInfiltrationMm: number;
  lastRunoffMm: number;
  lastEvaporationMm: number;
  infiltrationCapacity: number;
  retentionCapacity: number;
  runoffTendency: number;
  updatedAt: number;
};

export interface HydrologyApi {
  state(world: WorldView, locationId: string): HydrologySnapshot | undefined;
}

export const worldHydrologyModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "World Hydrology Prototype",
    description: "Local soil-water state derived from weather, terrain and substrate.",
    requires: ["world.geography", "world.geosphere-profile", "world.weather-current"],
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
    const weather = ctx.registry.capabilityImplementation("world.weather-current") as WeatherApi | undefined;
    if (!geosphere) throw new Error("world hydrology requires world.geosphere-profile");
    if (!weather) throw new Error("world hydrology requires world.weather-current");

    const api: HydrologyApi = {
      state(world, locationId) {
        const location = world.getEntity(locationId);
        if (!location || location.kind !== GeographyKinds.location || location.archivedAt !== undefined) return undefined;
        const raw = location.components[HydrologyComponents.state];
        return raw ? snapshot(raw) : undefined;
      },
    };
    ctx.provideCapability(CAPABILITY, api);

    ctx.registerComponent({
      id: HydrologyComponents.state,
      persist: true,
      description: "Local soil and surface-water state; no river network or ecology semantics.",
    });

    ctx.registerCommand({
      type: "world-hydrology.initialize_location",
      description: "Initialize soil-water properties for one location from substrate and terrain.",
    });
    ctx.registerCommand({
      type: "world-hydrology.advance_location",
      description: "Advance local soil-water state using the location's current weather.",
    });

    ctx.registerConstraintRule({
      id: "world-hydrology.initialize_location.allowed",
      commandType: "world-hydrology.initialize_location",
      evaluate: (c) => validateLocation(c.world, c.command.targetId, geosphere),
    });
    ctx.registerResolutionRule({
      id: "world-hydrology.initialize_location.resolve",
      commandType: "world-hydrology.initialize_location",
      resolve: (c) => {
        const locationId = c.command.targetId as string;
        const geo = geosphere.profile(c.world, locationId)!;
        const physical = soilPhysicalProfile(geo.substrate, geo.terrain);
        const initialSoilMoisture = clamp01(Number(c.command.payload.initialSoilMoisture ?? physical.retentionCapacity * 0.55));
        return [{
          kind: "setComponent",
          entityId: locationId,
          component: HydrologyComponents.state,
          value: {
            soilMoisture: initialSoilMoisture,
            surfaceWaterMm: 0,
            waterAvailability: round2(clamp01(initialSoilMoisture * 0.88)),
            lastInfiltrationMm: 0,
            lastRunoffMm: 0,
            lastEvaporationMm: 0,
            ...physical,
            updatedAt: c.world.tick,
          },
          reason: "local soil-water properties initialized from geosphere facts",
        }];
      },
    });

    ctx.registerConstraintRule({
      id: "world-hydrology.advance_location.allowed",
      commandType: "world-hydrology.advance_location",
      evaluate: (c) => {
        const base = validateLocation(c.world, c.command.targetId, geosphere);
        if (!base.ok) return base;
        const locationId = c.command.targetId as string;
        if (!c.world.getComponent(locationId, HydrologyComponents.state)) {
          return { ok: false, code: "E_HYDROLOGY_STATE", message: "location must be initialized before hydrology can advance" };
        }
        if (!weather.current(c.world, locationId)) {
          return { ok: false, code: "E_HYDROLOGY_WEATHER", message: "location needs current weather before hydrology can advance" };
        }
        const days = Number(c.command.payload.days ?? 1);
        if (!Number.isFinite(days) || days <= 0 || days > 30) {
          return { ok: false, code: "E_HYDROLOGY_DAYS", message: "days must be between 0 and 30" };
        }
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: "world-hydrology.advance_location.resolve",
      commandType: "world-hydrology.advance_location",
      resolve: (c): Effect[] => {
        const locationId = c.command.targetId as string;
        const current = snapshot(c.world.getComponent(locationId, HydrologyComponents.state) ?? {});
        const conditions = weather.current(c.world, locationId)!;
        const days = Number(c.command.payload.days ?? 1);
        const precipitationMm = conditions.precipitationMmPerDay * days;

        const wetnessHeadroom = clamp01(1 - current.soilMoisture);
        const infiltrationMm = round2(Math.min(
          precipitationMm,
          precipitationMm * current.infiltrationCapacity * (0.42 + wetnessHeadroom * 0.58),
        ));
        const directRunoffMm = Math.max(0, precipitationMm - infiltrationMm);
        const terrainRunoffMm = precipitationMm * current.runoffTendency * 0.28;
        const runoffMm = round2(Math.min(precipitationMm, directRunoffMm + terrainRunoffMm));

        const evaporationDemand = Math.max(0,
          (0.7
            + Math.max(0, conditions.currentTemperatureC) * 0.055
            + conditions.windSpeedMps * 0.07)
          * (1.05 - conditions.relativeHumidity * 0.72)
          * days,
        );
        const evaporationMm = round2(Math.min(
          evaporationDemand,
          current.surfaceWaterMm + current.soilMoisture * 18,
        ));

        const infiltratedMoistureGain = infiltrationMm / 32 * current.retentionCapacity;
        const evaporationMoistureLoss = evaporationMm / 24 * (1.1 - current.retentionCapacity * 0.35);
        const nextSoilMoisture = clamp01(current.soilMoisture + infiltratedMoistureGain - evaporationMoistureLoss);
        const retainedSurface = Math.max(0, current.surfaceWaterMm * 0.42 + precipitationMm - infiltrationMm - runoffMm - evaporationMm * 0.45);
        const nextSurfaceWaterMm = round2(Math.min(120, retainedSurface));
        const waterAvailability = round2(clamp01(
          nextSoilMoisture * 0.7
          + Math.min(1, nextSurfaceWaterMm / 35) * 0.3,
        ));

        const patch: HydrologySnapshot = {
          ...current,
          soilMoisture: round2(nextSoilMoisture),
          surfaceWaterMm: nextSurfaceWaterMm,
          waterAvailability,
          lastInfiltrationMm: infiltrationMm,
          lastRunoffMm: runoffMm,
          lastEvaporationMm: evaporationMm,
          updatedAt: c.world.tick,
        };
        return [{
          kind: "modifyComponent",
          entityId: locationId,
          component: HydrologyComponents.state,
          patch,
          reason: "current weather altered local soil and surface water",
        }, {
          kind: "emitEvent",
          eventType: "world-hydrology.location_advanced",
          targetId: locationId,
          data: {
            days,
            precipitationMm,
            soilMoisture: patch.soilMoisture,
            surfaceWaterMm: patch.surfaceWaterMm,
            waterAvailability: patch.waterAvailability,
            infiltrationMm,
            runoffMm,
            evaporationMm,
          },
          historicalSignificance: 0,
        }];
      },
    });

    ctx.registerProjection({
      id: "world-hydrology.location-state",
      description: "Inspect current local soil and surface-water state.",
      build: ({ world, params }) => {
        const locationId = String(params.locationId ?? "");
        const state = api.state(world, locationId);
        return state ? { exists: true, locationId, ...state } : { exists: false, locationId };
      },
    });
  },
};

function validateLocation(world: WorldView, locationId: string | undefined, geosphere: GeosphereApi) {
  const location = locationId ? world.getEntity(locationId) : undefined;
  if (!location || location.kind !== GeographyKinds.location || location.archivedAt !== undefined) {
    return { ok: false as const, code: "E_HYDROLOGY_LOCATION", message: "target must be an existing geography location" };
  }
  if (!geosphere.profile(world, locationId as string)) {
    return { ok: false as const, code: "E_HYDROLOGY_GEOSPHERE", message: "location needs a geosphere profile" };
  }
  return { ok: true as const };
}

function soilPhysicalProfile(substrate: SubstrateType, terrain: TerrainType) {
  const substrateProfile: Record<SubstrateType, { infiltration: number; retention: number }> = {
    "alluvium": { infiltration: 0.68, retention: 0.72 },
    "clay-rich-sediment": { infiltration: 0.34, retention: 0.88 },
    "sandstone": { infiltration: 0.72, retention: 0.44 },
    "limestone": { infiltration: 0.78, retention: 0.36 },
    "granite": { infiltration: 0.24, retention: 0.28 },
    "basalt": { infiltration: 0.42, retention: 0.4 },
    "volcanic-ash": { infiltration: 0.76, retention: 0.82 },
  };
  const base = substrateProfile[substrate];
  const slopeRunoff = terrain === "mountain" ? 0.82
    : terrain === "hill" ? 0.62
      : terrain === "plateau" ? 0.46
        : terrain === "valley" ? 0.22
          : terrain === "coast" ? 0.3
            : 0.34;
  const infiltrationCapacity = clamp01(base.infiltration * (terrain === "mountain" ? 0.78 : terrain === "hill" ? 0.9 : 1));
  return {
    infiltrationCapacity: round2(infiltrationCapacity),
    retentionCapacity: round2(base.retention),
    runoffTendency: round2(clamp01(slopeRunoff + (1 - infiltrationCapacity) * 0.16)),
  };
}

function snapshot(raw: Readonly<Record<string, unknown>>): HydrologySnapshot {
  return {
    soilMoisture: clamp01(Number(raw.soilMoisture ?? 0)),
    surfaceWaterMm: Math.max(0, Number(raw.surfaceWaterMm ?? 0)),
    waterAvailability: clamp01(Number(raw.waterAvailability ?? 0)),
    lastInfiltrationMm: Math.max(0, Number(raw.lastInfiltrationMm ?? 0)),
    lastRunoffMm: Math.max(0, Number(raw.lastRunoffMm ?? 0)),
    lastEvaporationMm: Math.max(0, Number(raw.lastEvaporationMm ?? 0)),
    infiltrationCapacity: clamp01(Number(raw.infiltrationCapacity ?? 0.5)),
    retentionCapacity: clamp01(Number(raw.retentionCapacity ?? 0.5)),
    runoffTendency: clamp01(Number(raw.runoffTendency ?? 0.5)),
    updatedAt: Math.max(0, Number(raw.updatedAt ?? 0)),
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
