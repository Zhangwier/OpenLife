/**
 * Multi-resolution natural-world time orchestration.
 *
 * One monthly scheduler task is kept per Region. Regional weather refreshes
 * monthly, while Location-level hydrology and ecological systems advance only
 * when that Location's resolution cadence is due. The module owns cadence only,
 * never domain truth.
 */

import type { OpenLifeModule } from "@openlife/contracts";
import { GeographyKinds, GeographyRelations } from "@openlife/module-world-geography";
import { HydrologyComponents } from "@openlife/module-world-hydrology";
import { EcologyComponents } from "@openlife/module-world-ecology";
import { VegetationComponents } from "@openlife/module-world-vegetation";
import { SpeciesComponents } from "@openlife/module-world-species";

const OWNER = "world-time";
const REGION_PULSE_TASK = "world-time.region_pulse";
const MARK_SLOW_ADVANCED = "world-time.mark_slow_advanced";

export type WorldResolutionTier = "near" | "regional" | "background";

export interface WorldTimeResolutionState {
  tier: WorldResolutionTier;
  lastSlowTick: number;
  updatedAt: number;
}

export const WorldTimeComponents = {
  resolution: "world-time.resolution",
} as const;

export const WorldTimeCadence = {
  near: { ticks: 1, days: 30 },
  regional: { ticks: 3, days: 90 },
  background: { ticks: 12, days: 360 },
} as const;

export const worldTimeModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "World Multi-Resolution Time",
    description: "Schedules one monthly pulse per Region and advances expensive natural systems only at the resolution required by each Location.",
    requires: [
      "world.geography",
      "world.weather-current",
      "world.hydrology-state",
      "world.ecology-state",
      "world.vegetation",
      "world.species",
      "world.grazing-pressure",
    ],
    provides: ["world.time-resolution"],
    capabilities: [
      "component.register",
      "command.register",
      "rule.constraint.register",
      "rule.resolution.register",
      "schedule.register",
      "projection.register",
    ],
  },

  register(ctx) {
    ctx.provideCapability("world.time-resolution");

    ctx.registerComponent({
      id: WorldTimeComponents.resolution,
      persist: true,
      description: "Per-Location simulation resolution tier and last completed slow ecological tick.",
    });

    ctx.registerCommand({
      type: "world-time.set_resolution",
      description: "Assign near, regional or background simulation cadence to one initialized natural-world Location.",
    });
    ctx.registerCommand({
      type: MARK_SLOW_ADVANCED,
      description: "Internal: mark one Location after its ordered slow ecological command batch completed.",
    });

    ctx.registerConstraintRule({
      id: "world-time.set_resolution.allowed",
      commandType: "world-time.set_resolution",
      evaluate: (c) => {
        const locationId = c.command.targetId;
        const location = locationId ? c.world.getEntity(locationId) : undefined;
        if (!location || location.kind !== GeographyKinds.location || location.archivedAt !== undefined) {
          return { ok: false, code: "E_WORLD_TIME_LOCATION", message: "target must be an active geography Location" };
        }
        const tier = String(c.command.payload.tier ?? "");
        if (!isTier(tier)) {
          return { ok: false, code: "E_WORLD_TIME_TIER", message: "tier must be near, regional or background" };
        }
        const regionId = c.world.listRelations({ type: GeographyRelations.contains, to: locationId as string })[0]?.from;
        if (!regionId) {
          return { ok: false, code: "E_WORLD_TIME_REGION", message: "Location must belong to a Region" };
        }
        if (!c.world.getComponent(locationId as string, HydrologyComponents.state)
          || !c.world.getComponent(locationId as string, EcologyComponents.state)
          || !c.world.getComponent(locationId as string, VegetationComponents.composition)
          || !c.world.getComponent(locationId as string, SpeciesComponents.populations)) {
          return { ok: false, code: "E_WORLD_TIME_STATE", message: "Location must initialize hydrology, ecology, vegetation and species before time orchestration" };
        }
        return { ok: true };
      },
    });

    ctx.registerResolutionRule({
      id: "world-time.set_resolution.resolve",
      commandType: "world-time.set_resolution",
      resolve: (c) => {
        const locationId = c.command.targetId as string;
        const tier = String(c.command.payload.tier) as WorldResolutionTier;
        const regionId = c.world.listRelations({ type: GeographyRelations.contains, to: locationId })[0]!.from;
        const state: WorldTimeResolutionState = {
          tier,
          lastSlowTick: c.world.tick,
          updatedAt: c.world.tick,
        };
        const exists = Boolean(c.world.getComponent(locationId, WorldTimeComponents.resolution));
        return [{
          kind: exists ? "modifyComponent" as const : "setComponent" as const,
          entityId: locationId,
          component: WorldTimeComponents.resolution,
          ...(exists ? { patch: state } : { value: state }),
          reason: "location simulation resolution was assigned",
        }, {
          kind: "scheduleTask",
          taskType: REGION_PULSE_TASK,
          afterTicks: 1,
          everyTicks: 1,
          payload: { regionId },
          dedupeKey: `region:${regionId}`,
        }];
      },
    });

    ctx.registerConstraintRule({
      id: "world-time.mark_slow_advanced.allowed",
      commandType: MARK_SLOW_ADVANCED,
      evaluate: (c) => {
        const locationId = c.command.targetId;
        if (!locationId || !c.world.getComponent(locationId, WorldTimeComponents.resolution)) {
          return { ok: false, code: "E_WORLD_TIME_TRACKING", message: "Location is not tracked by world-time" };
        }
        return { ok: true };
      },
    });

    ctx.registerResolutionRule({
      id: "world-time.mark_slow_advanced.resolve",
      commandType: MARK_SLOW_ADVANCED,
      resolve: (c) => [{
        kind: "modifyComponent",
        entityId: c.command.targetId as string,
        component: WorldTimeComponents.resolution,
        patch: { lastSlowTick: c.world.tick, updatedAt: c.world.tick },
        reason: "ordered slow ecological batch completed",
      }],
    });

    ctx.registerTask({
      type: REGION_PULSE_TASK,
      description: "Monthly Region pulse: weather refreshes monthly; Location-level natural systems advance only when each Location tier is due.",
      handler: (c) => {
        const regionId = String(c.payload.regionId ?? "");
        const region = regionId ? c.world.getEntity(regionId) : undefined;
        if (!region || region.kind !== GeographyKinds.region || region.archivedAt !== undefined) return undefined;

        const locations = c.world.listRelations({ type: GeographyRelations.contains, from: regionId })
          .map((relation) => c.world.getEntity(relation.to))
          .filter((entity) => entity?.kind === GeographyKinds.location && entity.archivedAt === undefined)
          .map((entity) => entity!)
          .filter((entity) => Boolean(entity.components[WorldTimeComponents.resolution]))
          .sort((a, b) => a.id.localeCompare(b.id));
        if (locations.length === 0) return undefined;

        const seasonPhase = ((c.at % 12) + 12) % 12 / 12;
        const commands: NonNullable<ReturnType<typeof batchOutcome>["commands"]> = [{
          type: "world-weather.advance_region",
          targetId: regionId,
          payload: { seasonPhase },
          source: "system",
        }];

        for (const location of locations) {
          const state = resolutionState(location.components[WorldTimeComponents.resolution]);
          const cadence = WorldTimeCadence[state.tier];
          if (c.at - state.lastSlowTick < cadence.ticks) continue;

          // Hydrology currently integrates a concrete weather snapshot and only
          // accepts up to 30 days. Coarse tiers therefore refresh one
          // representative month when they wake, rather than pretending the
          // current weather represented an entire quarter or year.
          commands.push(
            { type: "world-hydrology.advance_location", targetId: location.id, payload: { days: 30 }, source: "system" },
            { type: "world-ecology.advance_location", targetId: location.id, payload: { days: cadence.days }, source: "system" },
            { type: "world-vegetation.advance_location", targetId: location.id, payload: { days: cadence.days }, source: "system" },
            { type: "world-species.advance_location", targetId: location.id, payload: { days: cadence.days }, source: "system" },
            { type: "world-grazing.advance_location", targetId: location.id, payload: { days: cadence.days }, source: "system" },
            { type: MARK_SLOW_ADVANCED, targetId: location.id, source: "system" },
          );
        }
        return batchOutcome(commands);
      },
    });

    ctx.registerProjection({
      id: "world-time.location-resolution",
      description: "Inspect one Location's multi-resolution cadence and next slow ecological due tick.",
      build: ({ world, params }) => {
        const locationId = String(params.locationId ?? "");
        const raw = world.getComponent(locationId, WorldTimeComponents.resolution);
        if (!raw) return { exists: false, locationId };
        const state = resolutionState(raw);
        const cadence = WorldTimeCadence[state.tier];
        return {
          exists: true,
          locationId,
          ...state,
          cadenceTicks: cadence.ticks,
          coarseDaysPerSlowStep: cadence.days,
          nextSlowTick: state.lastSlowTick + cadence.ticks,
        };
      },
    });
  },
};

function batchOutcome(commands: Array<{
  type: string;
  actorId?: string;
  targetId?: string;
  payload?: Record<string, unknown>;
  source?: "player" | "ai" | "system" | "network";
}>) {
  return { commands };
}

function isTier(value: string): value is WorldResolutionTier {
  return value === "near" || value === "regional" || value === "background";
}

function resolutionState(raw: unknown): WorldTimeResolutionState {
  const data = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const tier = String(data.tier ?? "background");
  return {
    tier: isTier(tier) ? tier : "background",
    lastSlowTick: Math.max(0, Number(data.lastSlowTick ?? 0)),
    updatedAt: Math.max(0, Number(data.updatedAt ?? 0)),
  };
}
