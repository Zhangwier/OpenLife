/**
 * Vegetation composition layered on top of aggregate ecology.
 *
 * Ecology owns total plant biomass. This module explains which registered
 * vegetation types make up that biomass at each Location. It does not yet
 * simulate individual plants, succession, fire, logging or evolution.
 */

import type { JsonValue, OpenLifeModule, WorldView } from "@openlife/contracts";
import { GeographyKinds } from "@openlife/module-world-geography";
import type { ClimateApi } from "@openlife/module-world-climate";
import type { HydrologyApi } from "@openlife/module-world-hydrology";
import type { EcologyApi } from "@openlife/module-world-ecology";

const OWNER = "world-vegetation";
const CAPABILITY = "world.vegetation";

export interface VegetationDefinition {
  id: string;
  name: string;
  foodTags: string[];
  temperatureOptimumC: number;
  temperatureToleranceC: number;
  waterOptimum: number;
  waterTolerance: number;
  growthRate: number;
  woody: boolean;
  tags?: string[];
}

export interface VegetationPopulationSnapshot {
  vegetationId: string;
  biomass: number;
  habitatFitness: number;
}

export interface VegetationApi {
  registerDefinition(definition: VegetationDefinition): void;
  getDefinition(id: string): VegetationDefinition | undefined;
  listDefinitions(): VegetationDefinition[];
  composition(world: WorldView, locationId: string): VegetationPopulationSnapshot[];
}

export const VegetationComponents = {
  composition: "world-vegetation.composition",
} as const;

export const worldVegetationModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "World Vegetation Prototype",
    description: "Concrete vegetation composition constrained by ecology's aggregate plant biomass.",
    requires: ["world.geography", "world.climate-profile", "world.hydrology-state", "world.ecology-state"],
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
    const hydrology = ctx.registry.capabilityImplementation("world.hydrology-state") as HydrologyApi | undefined;
    const ecology = ctx.registry.capabilityImplementation("world.ecology-state") as EcologyApi | undefined;
    if (!climate) throw new Error("world vegetation requires world.climate-profile");
    if (!hydrology) throw new Error("world vegetation requires world.hydrology-state");
    if (!ecology) throw new Error("world vegetation requires world.ecology-state");

    const definitions = new Map<string, VegetationDefinition>();
    const api: VegetationApi = {
      registerDefinition(definition) {
        validateDefinition(definition);
        if (definitions.has(definition.id)) throw new Error(`vegetation definition already registered: ${definition.id}`);
        definitions.set(definition.id, freezeDefinition(definition));
      },
      getDefinition: (id) => definitions.get(id),
      listDefinitions: () => [...definitions.values()],
      composition(world, locationId) {
        const location = world.getEntity(locationId);
        if (!location || location.kind !== GeographyKinds.location || location.archivedAt !== undefined) return [];
        return compositionEntries(location.components[VegetationComponents.composition]);
      },
    };
    ctx.provideCapability(CAPABILITY, api);

    ctx.registerComponent({
      id: VegetationComponents.composition,
      persist: true,
      description: "Known vegetation composition at one Location; represented biomass must fit inside ecology plant biomass.",
    });

    ctx.registerCommand({
      type: "world-vegetation.seed_composition",
      description: "Seed known vegetation biomass at one Location within ecology's total plant biomass.",
    });
    ctx.registerCommand({
      type: "world-vegetation.advance_location",
      description: "Advance vegetation composition using climate, water availability and vegetation growth traits.",
    });

    ctx.registerConstraintRule({
      id: "world-vegetation.seed_composition.allowed",
      commandType: "world-vegetation.seed_composition",
      evaluate: (c) => {
        const base = validateLocation(c.world, c.command.targetId, climate, hydrology, ecology);
        if (!base.ok) return base;
        const entries = compositionInputs(c.command.payload.composition);
        if (entries.length === 0) {
          return { ok: false, code: "E_VEGETATION_COMPOSITION", message: "at least one vegetation entry is required" };
        }
        for (const entry of entries) {
          if (!definitions.has(entry.vegetationId)) {
            return { ok: false, code: "E_VEGETATION_UNKNOWN", message: `unknown vegetation definition: ${entry.vegetationId}` };
          }
          if (!Number.isFinite(entry.biomass) || entry.biomass < 0) {
            return { ok: false, code: "E_VEGETATION_BIOMASS", message: "vegetation biomass must be a non-negative number" };
          }
        }
        return { ok: true };
      },
    });

    ctx.registerResolutionRule({
      id: "world-vegetation.seed_composition.resolve",
      commandType: "world-vegetation.seed_composition",
      resolve: (c) => {
        const locationId = c.command.targetId as string;
        const climateState = climate.profile(c.world, locationId)!;
        const water = hydrology.state(c.world, locationId)!;
        const eco = ecology.state(c.world, locationId)!;
        const entries = compositionInputs(c.command.payload.composition).map((entry) => {
          const definition = definitions.get(entry.vegetationId)!;
          return {
            vegetationId: entry.vegetationId,
            biomass: entry.biomass,
            habitatFitness: habitatFitness(definition, climateState.meanAnnualTemperatureC, water.waterAvailability),
          } satisfies VegetationPopulationSnapshot;
        });
        const capped = capTotalBiomass(entries, eco.plantBiomass);
        return [{
          kind: "setComponent",
          entityId: locationId,
          component: VegetationComponents.composition,
          value: { byVegetation: toCompositionMap(capped), updatedAt: c.world.tick },
          reason: "vegetation composition seeded within ecology plant biomass",
        }];
      },
    });

    ctx.registerConstraintRule({
      id: "world-vegetation.advance_location.allowed",
      commandType: "world-vegetation.advance_location",
      evaluate: (c) => {
        const base = validateLocation(c.world, c.command.targetId, climate, hydrology, ecology);
        if (!base.ok) return base;
        const locationId = c.command.targetId as string;
        if (!c.world.getComponent(locationId, VegetationComponents.composition)) {
          return { ok: false, code: "E_VEGETATION_STATE", message: "location needs seeded vegetation before it can advance" };
        }
        const days = Number(c.command.payload.days ?? 30);
        if (!Number.isFinite(days) || days <= 0 || days > 365) {
          return { ok: false, code: "E_VEGETATION_DAYS", message: "days must be between 0 and 365" };
        }
        return { ok: true };
      },
    });

    ctx.registerResolutionRule({
      id: "world-vegetation.advance_location.resolve",
      commandType: "world-vegetation.advance_location",
      resolve: (c) => {
        const locationId = c.command.targetId as string;
        const climateState = climate.profile(c.world, locationId)!;
        const water = hydrology.state(c.world, locationId)!;
        const eco = ecology.state(c.world, locationId)!;
        const months = Number(c.command.payload.days ?? 30) / 30;
        const current = api.composition(c.world, locationId);
        const evaluated = current.map((entry) => {
          const definition = definitions.get(entry.vegetationId);
          if (!definition) return { ...entry, competitionWeight: 0 };
          const fitness = habitatFitness(definition, climateState.meanAnnualTemperatureC, water.waterAvailability);
          const growth = definition.growthRate * fitness * 0.12 * months;
          const stress = Math.max(0, 0.5 - fitness) * 0.18 * months;
          const biomass = Math.max(0, entry.biomass * (1 + growth - stress));
          const competitionWeight = entry.biomass > 0
            ? entry.biomass * fitness * (0.2 + definition.growthRate * 0.8)
            : 0;
          return {
            vegetationId: entry.vegetationId,
            biomass,
            habitatFitness: fitness,
            competitionWeight,
          };
        });
        const aggregateBudget = Math.max(0, eco.plantBiomass);
        const representedAfterGrowth = evaluated.reduce((sum, entry) => sum + entry.biomass, 0);
        const freeBudget = Math.max(0, aggregateBudget - representedAfterGrowth);
        const recoveryFraction = 1 - Math.exp(-months / 6);
        const recoverable = freeBudget * recoveryFraction;
        const totalWeight = evaluated.reduce((sum, entry) => sum + entry.competitionWeight, 0);
        const recovered = evaluated.map((entry) => ({
          vegetationId: entry.vegetationId,
          biomass: round3(Math.max(0, entry.biomass + (
            totalWeight > 0 ? recoverable * (entry.competitionWeight / totalWeight) : 0
          ))),
          habitatFitness: entry.habitatFitness,
        } satisfies VegetationPopulationSnapshot));
        const capped = capTotalBiomass(recovered, aggregateBudget);
        return [{
          kind: "modifyComponent",
          entityId: locationId,
          component: VegetationComponents.composition,
          patch: { byVegetation: toCompositionMap(capped), updatedAt: c.world.tick },
          reason: "vegetation composition recovered and competed for free biomass budget under climate and water constraints",
        }, {
          kind: "emitEvent",
          eventType: "world-vegetation.location_advanced",
          targetId: locationId,
          data: {
            days: Number(c.command.payload.days ?? 30),
            composition: capped as unknown as JsonValue,
          },
          historicalSignificance: 0,
        }];
      },
    });

    ctx.registerProjection({
      id: "world-vegetation.location-composition",
      description: "Inspect known vegetation composition at one Location.",
      build: ({ world, params }) => {
        const locationId = String(params.locationId ?? "");
        const location = world.getEntity(locationId);
        if (!location || location.kind !== GeographyKinds.location) return { exists: false, locationId };
        return { exists: true, locationId, composition: api.composition(world, locationId) };
      },
    });
  },
};

function validateLocation(
  world: WorldView,
  locationId: string | undefined,
  climate: ClimateApi,
  hydrology: HydrologyApi,
  ecology: EcologyApi,
) {
  const location = locationId ? world.getEntity(locationId) : undefined;
  if (!location || location.kind !== GeographyKinds.location || location.archivedAt !== undefined) {
    return { ok: false as const, code: "E_VEGETATION_LOCATION", message: "target must be an existing geography location" };
  }
  if (!climate.profile(world, locationId as string)) {
    return { ok: false as const, code: "E_VEGETATION_CLIMATE", message: "location needs a climate profile" };
  }
  if (!hydrology.state(world, locationId as string)) {
    return { ok: false as const, code: "E_VEGETATION_HYDROLOGY", message: "location needs hydrology state" };
  }
  if (!ecology.state(world, locationId as string)) {
    return { ok: false as const, code: "E_VEGETATION_ECOLOGY", message: "location needs aggregate ecology state" };
  }
  return { ok: true as const };
}

function validateDefinition(definition: VegetationDefinition): void {
  if (!definition.id.includes(".")) throw new Error(`vegetation definition id must be namespaced: ${definition.id}`);
  if (!definition.name.trim()) throw new Error(`vegetation definition needs a name: ${definition.id}`);
  if (!Array.isArray(definition.foodTags) || definition.foodTags.length === 0) {
    throw new Error(`vegetation definition needs at least one food tag: ${definition.id}`);
  }
  if (!Number.isFinite(definition.temperatureToleranceC) || definition.temperatureToleranceC <= 0) {
    throw new Error(`vegetation temperature tolerance must be positive: ${definition.id}`);
  }
  if (!Number.isFinite(definition.waterTolerance) || definition.waterTolerance <= 0) {
    throw new Error(`vegetation water tolerance must be positive: ${definition.id}`);
  }
  if (!Number.isFinite(definition.growthRate) || definition.growthRate < 0 || definition.growthRate > 1) {
    throw new Error(`vegetation growth rate must be between 0 and 1: ${definition.id}`);
  }
}

function freezeDefinition(definition: VegetationDefinition): VegetationDefinition {
  return Object.freeze({
    ...definition,
    foodTags: Object.freeze([...definition.foodTags]) as unknown as string[],
    ...(definition.tags ? { tags: Object.freeze([...definition.tags]) as unknown as string[] } : {}),
  });
}

function compositionInputs(value: unknown): Array<{ vegetationId: string; biomass: number }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    .map((entry) => ({ vegetationId: String(entry.vegetationId ?? ""), biomass: Number(entry.biomass ?? 0) }));
}

function compositionEntries(raw: unknown): VegetationPopulationSnapshot[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const byVegetation = (raw as Record<string, unknown>).byVegetation;
  if (!byVegetation || typeof byVegetation !== "object" || Array.isArray(byVegetation)) return [];
  return Object.entries(byVegetation as Record<string, unknown>)
    .map(([vegetationId, value]) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
      const entry = value as Record<string, unknown>;
      return {
        vegetationId,
        biomass: Math.max(0, Number(entry.biomass ?? 0)),
        habitatFitness: clamp01(Number(entry.habitatFitness ?? 0)),
      } satisfies VegetationPopulationSnapshot;
    })
    .filter((entry): entry is VegetationPopulationSnapshot => entry !== undefined)
    .sort((a, b) => a.vegetationId.localeCompare(b.vegetationId));
}

function toCompositionMap(entries: VegetationPopulationSnapshot[]): JsonValue {
  const map: Record<string, JsonValue> = {};
  for (const entry of entries) {
    map[entry.vegetationId] = {
      biomass: round3(entry.biomass),
      habitatFitness: round3(entry.habitatFitness),
    };
  }
  return map;
}

function habitatFitness(definition: VegetationDefinition, temperatureC: number, waterAvailability: number): number {
  const thermal = clamp01(1 - Math.abs(temperatureC - definition.temperatureOptimumC) / definition.temperatureToleranceC);
  const water = clamp01(1 - Math.abs(waterAvailability - definition.waterOptimum) / definition.waterTolerance);
  return round3(thermal * 0.5 + water * 0.5);
}

function capTotalBiomass(entries: VegetationPopulationSnapshot[], totalPlantBiomass: number): VegetationPopulationSnapshot[] {
  const result = entries.map((entry) => ({ ...entry }));
  const represented = result.reduce((sum, entry) => sum + entry.biomass, 0);
  const limit = Math.max(0, totalPlantBiomass);
  if (represented <= limit || represented <= 0) return result;
  const scale = limit / represented;
  for (const entry of result) entry.biomass = round3(entry.biomass * scale);
  return result;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
