/**
 * Minimal geosphere layer for world locations.
 *
 * This module stores stable geological facts and derives broad tectonic
 * tendencies. It does not yet simulate plate motion, weather, hydrology,
 * erosion or ecology.
 */

import type { Effect, OpenLifeModule, WorldView } from "@openlife/contracts";
import { GeographyKinds } from "@openlife/module-world-geography";

const OWNER = "world-geosphere";
const CAPABILITY = "world.geosphere-profile";

export type TerrainType = "plain" | "valley" | "hill" | "mountain" | "plateau" | "coast";
export type SubstrateType = "alluvium" | "clay-rich-sediment" | "sandstone" | "limestone" | "granite" | "basalt" | "volcanic-ash";
export type TectonicSetting = "stable" | "convergent" | "divergent" | "transform" | "hotspot";

export const GeosphereComponents = {
  profile: "world-geosphere.profile",
} as const;

export interface GeosphereProfileSnapshot {
  elevationM: number;
  terrain: TerrainType;
  substrate: SubstrateType;
  tectonicSetting: TectonicSetting;
  seismicPotential: number;
  volcanicPotential: number;
  upliftPotential: number;
  geologicalYears: number;
  cumulativeElevationChangeM: number;
  seismicEpisodes: number;
  volcanicEpisodes: number;
}

export interface GeosphereApi {
  profile(world: WorldView, locationId: string): GeosphereProfileSnapshot | undefined;
}

const TERRAINS = new Set<TerrainType>(["plain", "valley", "hill", "mountain", "plateau", "coast"]);
const SUBSTRATES = new Set<SubstrateType>([
  "alluvium",
  "clay-rich-sediment",
  "sandstone",
  "limestone",
  "granite",
  "basalt",
  "volcanic-ash",
]);
const TECTONICS = new Set<TectonicSetting>(["stable", "convergent", "divergent", "transform", "hotspot"]);

export const worldGeosphereModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "World Geosphere Prototype",
    description: "Stable geological profiles and broad tectonic tendencies for geography locations.",
    requires: ["world.geography"],
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
    const api: GeosphereApi = {
      profile(world, locationId) {
        const location = world.getEntity(locationId);
        if (!location || location.kind !== GeographyKinds.location || location.archivedAt !== undefined) return undefined;
        const raw = location.components[GeosphereComponents.profile];
        if (!raw) return undefined;
        return snapshot(raw);
      },
    };
    ctx.provideCapability(CAPABILITY, api);

    ctx.registerComponent({
      id: GeosphereComponents.profile,
      persist: true,
      description: "Stable geological profile of one world location.",
    });

    ctx.registerCommand({
      type: "world-geosphere.set_profile",
      description: "Assign or revise the stable geological profile of one geography location.",
    });
    ctx.registerCommand({
      type: "world-geosphere.advance_epoch",
      description: "Advance one location by a coarse geological time step; intended for hundreds to millions of years, not daily simulation.",
    });

    ctx.registerConstraintRule({
      id: "world-geosphere.set_profile.allowed",
      commandType: "world-geosphere.set_profile",
      evaluate: (c) => {
        const locationId = c.command.targetId;
        const location = locationId ? c.world.getEntity(locationId) : undefined;
        if (!location || location.kind !== GeographyKinds.location || location.archivedAt !== undefined) {
          return { ok: false, code: "E_GEOSPHERE_LOCATION", message: "target must be an existing geography location" };
        }
        const elevationM = Number(c.command.payload.elevationM);
        if (!Number.isFinite(elevationM) || elevationM < -12000 || elevationM > 10000) {
          return { ok: false, code: "E_GEOSPHERE_ELEVATION", message: "elevationM must be a plausible finite elevation" };
        }
        if (!TERRAINS.has(String(c.command.payload.terrain) as TerrainType)) {
          return { ok: false, code: "E_GEOSPHERE_TERRAIN", message: "unknown terrain type" };
        }
        if (!SUBSTRATES.has(String(c.command.payload.substrate) as SubstrateType)) {
          return { ok: false, code: "E_GEOSPHERE_SUBSTRATE", message: "unknown substrate type" };
        }
        if (!TECTONICS.has(String(c.command.payload.tectonicSetting) as TectonicSetting)) {
          return { ok: false, code: "E_GEOSPHERE_TECTONIC", message: "unknown tectonic setting" };
        }
        return { ok: true };
      },
    });

    ctx.registerResolutionRule({
      id: "world-geosphere.set_profile.resolve",
      commandType: "world-geosphere.set_profile",
      resolve: (c) => {
        const elevationM = Number(c.command.payload.elevationM);
        const terrain = String(c.command.payload.terrain) as TerrainType;
        const substrate = String(c.command.payload.substrate) as SubstrateType;
        const tectonicSetting = String(c.command.payload.tectonicSetting) as TectonicSetting;
        const tendencies = tectonicTendencies(tectonicSetting);
        return [{
          kind: "setComponent",
          entityId: c.command.targetId as string,
          component: GeosphereComponents.profile,
          value: {
            elevationM,
            terrain,
            substrate,
            tectonicSetting,
            ...tendencies,
            geologicalYears: 0,
            cumulativeElevationChangeM: 0,
            seismicEpisodes: 0,
            volcanicEpisodes: 0,
            updatedAt: c.world.tick,
          },
          reason: "geological profile assigned to geography location",
        }, {
          kind: "emitEvent",
          eventType: "world-geosphere.profile_set",
          targetId: c.command.targetId,
          data: { elevationM, terrain, substrate, tectonicSetting, ...tendencies },
          historicalSignificance: 0,
        }];
      },
    });

    ctx.registerConstraintRule({
      id: "world-geosphere.advance_epoch.allowed",
      commandType: "world-geosphere.advance_epoch",
      evaluate: (c) => {
        const locationId = c.command.targetId;
        const location = locationId ? c.world.getEntity(locationId) : undefined;
        if (!location || location.kind !== GeographyKinds.location || location.archivedAt !== undefined) {
          return { ok: false, code: "E_GEOSPHERE_LOCATION", message: "target must be an existing geography location" };
        }
        if (!location.components[GeosphereComponents.profile]) {
          return { ok: false, code: "E_GEOSPHERE_PROFILE", message: "location needs a geological profile before it can evolve" };
        }
        const years = Number(c.command.payload.years);
        if (!Number.isFinite(years) || years < 100 || years > 1_000_000) {
          return { ok: false, code: "E_GEOSPHERE_YEARS", message: "geological step must be between 100 and 1,000,000 years" };
        }
        return { ok: true };
      },
    });

    ctx.registerResolutionRule({
      id: "world-geosphere.advance_epoch.resolve",
      commandType: "world-geosphere.advance_epoch",
      resolve: (c) => {
        const locationId = c.command.targetId as string;
        const raw = c.world.getComponent(locationId, GeosphereComponents.profile) ?? {};
        const profile = snapshot(raw);
        const years = Number(c.command.payload.years);
        const elevationChangeM = Number((tectonicElevationRate(profile.tectonicSetting) * years).toFixed(3));
        const nextElevation = Math.max(-12000, Math.min(10000, profile.elevationM + elevationChangeM));
        const seismicEpisodes = coarseEpisodes(profile.seismicPotential, years, 1.0, c.rng.nextFloat());
        const volcanicEpisodes = coarseEpisodes(profile.volcanicPotential, years, 0.55, c.rng.nextFloat());
        const effects: Effect[] = [{
          kind: "modifyComponent" as const,
          entityId: locationId,
          component: GeosphereComponents.profile,
          patch: {
            elevationM: nextElevation,
            geologicalYears: profile.geologicalYears + years,
            cumulativeElevationChangeM: Number((profile.cumulativeElevationChangeM + elevationChangeM).toFixed(3)),
            seismicEpisodes: profile.seismicEpisodes + seismicEpisodes,
            volcanicEpisodes: profile.volcanicEpisodes + volcanicEpisodes,
            updatedAt: c.world.tick,
          },
          reason: "coarse geological epoch advanced",
        }, {
          kind: "emitEvent" as const,
          eventType: "world-geosphere.epoch_advanced",
          targetId: locationId,
          data: {
            years,
            elevationChangeM,
            seismicEpisodes,
            volcanicEpisodes,
            tectonicSetting: profile.tectonicSetting,
          },
          historicalSignificance: 0,
        }];
        if (seismicEpisodes > 0) {
          effects.push({
            kind: "emitEvent" as const,
            eventType: "world-geosphere.seismic_activity",
            targetId: locationId,
            data: { years, episodes: seismicEpisodes, potential: profile.seismicPotential },
            historicalSignificance: 0,
          });
        }
        if (volcanicEpisodes > 0) {
          effects.push({
            kind: "emitEvent" as const,
            eventType: "world-geosphere.volcanic_activity",
            targetId: locationId,
            data: { years, episodes: volcanicEpisodes, potential: profile.volcanicPotential },
            historicalSignificance: 0,
          });
        }
        return effects;
      },
    });

    ctx.registerProjection({
      id: "world-geosphere.location-profile",
      description: "Inspect one location's geological profile and broad tectonic tendencies.",
      build: ({ world, params }) => {
        const locationId = String(params.locationId ?? "");
        const profile = api.profile(world, locationId);
        return profile ? { exists: true, locationId, ...profile } : { exists: false, locationId };
      },
    });
  },
};

function tectonicTendencies(setting: TectonicSetting): Pick<
  GeosphereProfileSnapshot,
  "seismicPotential" | "volcanicPotential" | "upliftPotential"
> {
  switch (setting) {
    case "convergent":
      return { seismicPotential: 0.78, volcanicPotential: 0.68, upliftPotential: 0.82 };
    case "divergent":
      return { seismicPotential: 0.48, volcanicPotential: 0.58, upliftPotential: 0.18 };
    case "transform":
      return { seismicPotential: 0.88, volcanicPotential: 0.06, upliftPotential: 0.1 };
    case "hotspot":
      return { seismicPotential: 0.28, volcanicPotential: 0.92, upliftPotential: 0.24 };
    case "stable":
    default:
      return { seismicPotential: 0.06, volcanicPotential: 0.02, upliftPotential: 0.04 };
  }
}

function snapshot(raw: Readonly<Record<string, unknown>>): GeosphereProfileSnapshot {
  return {
    elevationM: Number(raw.elevationM ?? 0),
    terrain: String(raw.terrain ?? "plain") as TerrainType,
    substrate: String(raw.substrate ?? "alluvium") as SubstrateType,
    tectonicSetting: String(raw.tectonicSetting ?? "stable") as TectonicSetting,
    seismicPotential: clamp01(Number(raw.seismicPotential ?? 0)),
    volcanicPotential: clamp01(Number(raw.volcanicPotential ?? 0)),
    upliftPotential: clamp01(Number(raw.upliftPotential ?? 0)),
    geologicalYears: Math.max(0, Number(raw.geologicalYears ?? 0)),
    cumulativeElevationChangeM: Number(raw.cumulativeElevationChangeM ?? 0),
    seismicEpisodes: Math.max(0, Math.floor(Number(raw.seismicEpisodes ?? 0))),
    volcanicEpisodes: Math.max(0, Math.floor(Number(raw.volcanicEpisodes ?? 0))),
  };
}

function tectonicElevationRate(setting: TectonicSetting): number {
  switch (setting) {
    case "convergent": return 0.0012;
    case "divergent": return -0.00018;
    case "hotspot": return 0.00028;
    case "transform": return 0.00002;
    case "stable":
    default: return 0.00001;
  }
}

function coarseEpisodes(potential: number, years: number, intensity: number, random: number): number {
  const expected = clamp01(potential) * (years / 1000) * Math.max(0, intensity);
  const whole = Math.floor(expected);
  const fractional = expected - whole;
  return whole + (random < fractional ? 1 : 0);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
