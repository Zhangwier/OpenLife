/**
 * Aggregate herbivore grazing mediator.
 *
 * Species owns herbivore populations and diets. Vegetation owns concrete
 * plant biomass. Grazing only connects those truths and records pressure;
 * it does not own a second copy of either population or vegetation state.
 */

import type { JsonValue, OpenLifeModule, WorldView } from "@openlife/contracts";
import { GeographyKinds } from "@openlife/module-world-geography";
import { VegetationComponents, type VegetationApi, type VegetationPopulationSnapshot } from "@openlife/module-world-vegetation";
import type { SpeciesApi, SpeciesDefinition, SpeciesPopulationSnapshot } from "@openlife/module-world-species";

const OWNER = "world-grazing";

export const GrazingComponents = {
  pressure: "world-grazing.pressure",
} as const;

export interface GrazingPressureSnapshot {
  days: number;
  herbivoreDemand: number;
  consumedBiomass: number;
  pressureByVegetation: Record<string, number>;
  updatedAt: number;
}

export const worldGrazingModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "World Grazing Prototype",
    description: "Connect aggregate herbivore diets to concrete vegetation biomass without duplicating either source of truth.",
    requires: ["world.geography", "world.vegetation", "world.species"],
    provides: ["world.grazing-pressure"],
    capabilities: [
      "component.register",
      "command.register",
      "rule.constraint.register",
      "rule.resolution.register",
      "projection.register",
    ],
  },

  register(ctx) {
    const vegetation = ctx.registry.capabilityImplementation("world.vegetation") as VegetationApi | undefined;
    const species = ctx.registry.capabilityImplementation("world.species") as SpeciesApi | undefined;
    if (!vegetation) throw new Error("world grazing requires world.vegetation");
    if (!species) throw new Error("world grazing requires world.species");

    ctx.registerComponent({
      id: GrazingComponents.pressure,
      persist: true,
      description: "Observed aggregate grazing pressure from concrete herbivores onto concrete vegetation composition.",
    });

    ctx.registerCommand({
      type: "world-grazing.advance_location",
      description: "Apply aggregate herbivore consumption to edible vegetation over a bounded period.",
    });

    ctx.registerConstraintRule({
      id: "world-grazing.advance_location.allowed",
      commandType: "world-grazing.advance_location",
      evaluate: (c) => {
        const locationId = c.command.targetId;
        const location = locationId ? c.world.getEntity(locationId) : undefined;
        if (!location || location.kind !== GeographyKinds.location || location.archivedAt !== undefined) {
          return { ok: false, code: "E_GRAZING_LOCATION", message: "target must be an existing geography location" };
        }
        if (vegetation.composition(c.world, locationId as string).length === 0) {
          return { ok: false, code: "E_GRAZING_VEGETATION", message: "location needs vegetation composition before grazing can advance" };
        }
        if (species.populations(c.world, locationId as string).length === 0) {
          return { ok: false, code: "E_GRAZING_SPECIES", message: "location needs concrete species populations before grazing can advance" };
        }
        const days = Number(c.command.payload.days ?? 30);
        if (!Number.isFinite(days) || days <= 0 || days > 365) {
          return { ok: false, code: "E_GRAZING_DAYS", message: "days must be between 0 and 365" };
        }
        return { ok: true };
      },
    });

    ctx.registerResolutionRule({
      id: "world-grazing.advance_location.resolve",
      commandType: "world-grazing.advance_location",
      resolve: (c) => {
        const locationId = c.command.targetId as string;
        const days = Number(c.command.payload.days ?? 30);
        const months = days / 30;
        const plants = vegetation.composition(c.world, locationId).map((entry) => ({ ...entry }));
        const herbivores = species.populations(c.world, locationId)
          .filter((entry) => entry.trophicRole === "herbivore" && entry.population > 0);
        const requestedByVegetation = new Map<string, number>();
        let herbivoreDemand = 0;

        for (const herbivore of herbivores) {
          const definition = species.getDefinition(herbivore.speciesId);
          if (!definition) continue;
          const edible = ediblePlants(definition, plants, vegetation);
          const edibleTotal = edible.reduce((sum, entry) => sum + entry.biomass, 0);
          if (edibleTotal <= 0) continue;

          const demand = herbivore.population * 0.0018 * months;
          herbivoreDemand += demand;
          for (const plant of edible) {
            const share = plant.biomass / edibleTotal;
            requestedByVegetation.set(
              plant.vegetationId,
              (requestedByVegetation.get(plant.vegetationId) ?? 0) + demand * share,
            );
          }
        }

        let consumedBiomass = 0;
        const pressureByVegetation: Record<string, number> = {};
        const grazed = plants.map((plant) => {
          const requested = requestedByVegetation.get(plant.vegetationId) ?? 0;
          const consumed = Math.min(plant.biomass * 0.6, requested);
          consumedBiomass += consumed;
          pressureByVegetation[plant.vegetationId] = round3(
            plant.biomass > 0 ? consumed / plant.biomass : 0,
          );
          return {
            ...plant,
            biomass: round3(Math.max(0, plant.biomass - consumed)),
          };
        });

        const pressure: GrazingPressureSnapshot = {
          days,
          herbivoreDemand: round3(herbivoreDemand),
          consumedBiomass: round3(consumedBiomass),
          pressureByVegetation,
          updatedAt: c.world.tick,
        };
        const alreadyObserved = Boolean(c.world.getComponent(locationId, GrazingComponents.pressure));
        return [{
          kind: "modifyComponent",
          entityId: locationId,
          component: VegetationComponents.composition,
          patch: { byVegetation: toVegetationMap(grazed), updatedAt: c.world.tick },
          reason: "concrete herbivores consumed vegetation matching their diets",
        }, {
          kind: alreadyObserved ? "modifyComponent" as const : "setComponent" as const,
          entityId: locationId,
          component: GrazingComponents.pressure,
          ...(alreadyObserved ? { patch: pressure as unknown as Record<string, JsonValue> } : { value: pressure as unknown as JsonValue }),
          reason: "aggregate grazing pressure was observed without duplicating plant or animal truth",
        }, {
          kind: "emitEvent",
          eventType: "world-grazing.location_advanced",
          targetId: locationId,
          data: {
            days,
            herbivoreDemand: round3(herbivoreDemand),
            consumedBiomass: round3(consumedBiomass),
            pressureByVegetation: pressureByVegetation as unknown as JsonValue,
          },
          historicalSignificance: 0,
        }];
      },
    });

    ctx.registerProjection({
      id: "world-grazing.location-pressure",
      description: "Inspect the latest aggregate grazing pressure at one Location.",
      build: ({ world, params }) => {
        const locationId = String(params.locationId ?? "");
        const location = world.getEntity(locationId);
        if (!location || location.kind !== GeographyKinds.location) return { exists: false, locationId };
        const raw = location.components[GrazingComponents.pressure];
        return { exists: Boolean(raw), locationId, pressure: raw ?? null };
      },
    });
  },
};

function ediblePlants(
  herbivore: SpeciesDefinition,
  plants: VegetationPopulationSnapshot[],
  vegetation: VegetationApi,
): VegetationPopulationSnapshot[] {
  const diet = new Set(herbivore.diet);
  return plants.filter((entry) => {
    const definition = vegetation.getDefinition(entry.vegetationId);
    return Boolean(definition?.foodTags.some((tag) => diet.has(tag)));
  });
}

function toVegetationMap(entries: VegetationPopulationSnapshot[]): JsonValue {
  const map: Record<string, JsonValue> = {};
  for (const entry of entries) {
    map[entry.vegetationId] = {
      biomass: round3(entry.biomass),
      habitatFitness: round3(entry.habitatFitness),
    };
  }
  return map;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
