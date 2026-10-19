/**
 * Species composition layered on top of aggregate ecology.
 *
 * Ecology owns guild-wide plant/herbivore/predator budgets. This module owns
 * concrete species definitions and the known local populations that occupy
 * part of those budgets. Species populations are therefore capped by, but do
 * not replace, the aggregate ecology totals. Individuals, genetics, evolution,
 * disease and detailed food webs are intentionally out of scope here.
 */

import type { JsonValue, OpenLifeModule, WorldView, Effect } from "@openlife/contracts";
import { writeComponent } from "@openlife/contracts";
import { GeographyComponents, GeographyKinds, GeographyRelations } from "@openlife/module-world-geography";
import type { ClimateApi } from "@openlife/module-world-climate";
import type { HydrologyApi } from "@openlife/module-world-hydrology";
import type { EcologyApi } from "@openlife/module-world-ecology";
import type { VegetationApi } from "@openlife/module-world-vegetation";

const OWNER = "world-species";
const CAPABILITY = "world.species";

export type TrophicRole = "herbivore" | "predator";

export interface SpeciesLifeHistory {
  maturityYears: number;
  lifespanYears: number;
  reproductiveOutput: number;
  offspringInvestment: number;
  baselineAnnualMortality: number;
}

export interface SpeciesDefinition {
  id: string;
  name: string;
  trophicRole: TrophicRole;
  diet: string[];
  temperatureOptimumC: number;
  temperatureToleranceC: number;
  waterOptimum: number;
  waterTolerance: number;
  lifeHistory: SpeciesLifeHistory;
  tags?: string[];
}

export interface PopulationTraitOffsets {
  temperatureOptimumDeltaC: number;
  waterOptimumDelta: number;
  reproductiveOutputDelta: number;
}

export interface PopulationLineageState {
  selectionGenerations: number;
  isolationGenerations: number;
  recentGeneFlow: number;
}

export interface SpeciesPopulationSnapshot {
  speciesId: string;
  population: number;
  habitatFitness: number;
  foodAvailability: number;
  traitOffsets: PopulationTraitOffsets;
  lineage: PopulationLineageState;
  trophicRole: TrophicRole;
}

export interface SpeciesApi {
  registerDefinition(definition: SpeciesDefinition): void;
  getDefinition(id: string): SpeciesDefinition | undefined;
  listDefinitions(): SpeciesDefinition[];
  populations(world: WorldView, locationId: string): SpeciesPopulationSnapshot[];
}

export const SpeciesComponents = {
  populations: "world-species.populations",
} as const;

export const worldSpeciesModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "World Species Prototype",
    description: "Concrete species definitions and local aggregate populations constrained by ecology guild totals and available food.",
    requires: ["world.geography", "world.climate-profile", "world.hydrology-state", "world.ecology-state", "world.vegetation"],
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
    const vegetation = ctx.registry.capabilityImplementation("world.vegetation") as VegetationApi | undefined;
    if (!climate) throw new Error("world species requires world.climate-profile");
    if (!hydrology) throw new Error("world species requires world.hydrology-state");
    if (!ecology) throw new Error("world species requires world.ecology-state");
    if (!vegetation) throw new Error("world species requires world.vegetation");

    const definitions = new Map<string, SpeciesDefinition>();
    const api: SpeciesApi = {
      registerDefinition(definition) {
        validateDefinition(definition);
        if (definitions.has(definition.id)) throw new Error(`species definition already registered: ${definition.id}`);
        definitions.set(definition.id, freezeDefinition(definition));
      },
      getDefinition: (id) => definitions.get(id),
      listDefinitions: () => [...definitions.values()],
      populations(world, locationId) {
        const location = world.getEntity(locationId);
        if (!location || location.kind !== GeographyKinds.location || location.archivedAt !== undefined) return [];
        return populationEntries(location.components[SpeciesComponents.populations]);
      },
    };
    ctx.provideCapability(CAPABILITY, api);

    ctx.registerComponent({
      id: SpeciesComponents.populations,
      persist: true,
      description: "Known aggregate populations of concrete species at one Location; totals may cover only part of the ecology guild.",
    });

    ctx.registerCommand({
      type: "world-species.seed_populations",
      description: "Seed known species populations at one Location, capped by the aggregate ecology guild totals.",
    });
    ctx.registerCommand({
      type: "world-species.advance_location",
      description: "Advance known species populations using environmental fitness and species reproduction traits.",
    });
    ctx.registerCommand({
      type: "world-species.disperse_to_neighbor",
      description: "Move part of the known species composition from one Location to one adjacent Location according to distance, crowding, target fitness and free guild capacity.",
    });
    ctx.registerCommand({
      type: "world-species.apply_selection",
      description: "Apply slow directional natural selection to local population environmental optima over many generations; ordinary ecology advancement never changes traits.",
    });

    ctx.registerConstraintRule({
      id: "world-species.seed_populations.allowed",
      commandType: "world-species.seed_populations",
      evaluate: (c) => {
        const base = validateLocation(c.world, c.command.targetId, climate, hydrology, ecology, vegetation);
        if (!base.ok) return base;
        const entries = populationInputs(c.command.payload.populations);
        if (entries.length === 0) {
          return { ok: false, code: "E_SPECIES_POPULATIONS", message: "at least one species population is required" };
        }
        for (const entry of entries) {
          if (!definitions.has(entry.speciesId)) {
            return { ok: false, code: "E_SPECIES_UNKNOWN", message: `unknown species definition: ${entry.speciesId}` };
          }
          if (!Number.isFinite(entry.population) || entry.population < 0) {
            return { ok: false, code: "E_SPECIES_POPULATION", message: "species population must be a non-negative number" };
          }
          if (!validTraitOffsets(entry.traitOffsets)) {
            return { ok: false, code: "E_SPECIES_TRAITS", message: "population trait offsets are outside the supported prototype range" };
          }
        }
        return { ok: true };
      },
    });

    ctx.registerResolutionRule({
      id: "world-species.seed_populations.resolve",
      commandType: "world-species.seed_populations",
      resolve: (c) => {
        const locationId = c.command.targetId as string;
        const eco = ecology.state(c.world, locationId)!;
        const climateState = climate.profile(c.world, locationId)!;
        const water = hydrology.state(c.world, locationId)!;
        const inputs = populationInputs(c.command.payload.populations);
        const seedContext: SpeciesPopulationSnapshot[] = inputs.map((entry) => {
          const definition = definitions.get(entry.speciesId)!;
          return {
            speciesId: entry.speciesId,
            population: entry.population,
            habitatFitness: 0,
            foodAvailability: 0,
            traitOffsets: entry.traitOffsets,
            lineage: { selectionGenerations: 0, isolationGenerations: 0, recentGeneFlow: 0 },
            trophicRole: definition.trophicRole,
          };
        });
        const seeded = seedContext.map((entry) => {
          const definition = definitions.get(entry.speciesId)!;
          const food = foodAvailability(definition, c.world, locationId, vegetation, eco, seedContext, (id) => definitions.get(id));
          return {
            ...entry,
            habitatFitness: habitatFitness(definition, entry.traitOffsets, climateState.meanAnnualTemperatureC, water.waterAvailability, food),
            foodAvailability: food,
          } satisfies SpeciesPopulationSnapshot;
        });
        const capped = capGuildPopulations(seeded, eco.herbivorePopulation, eco.predatorPopulation);
        return [{
          kind: "setComponent",
          entityId: locationId,
          component: SpeciesComponents.populations,
          value: {
            bySpecies: toPopulationMap(capped),
            updatedAt: c.world.tick,
          },
          reason: "concrete species populations seeded within aggregate ecology guild limits",
        }];
      },
    });

    ctx.registerConstraintRule({
      id: "world-species.advance_location.allowed",
      commandType: "world-species.advance_location",
      evaluate: (c) => {
        const base = validateLocation(c.world, c.command.targetId, climate, hydrology, ecology, vegetation);
        if (!base.ok) return base;
        const locationId = c.command.targetId as string;
        if (!c.world.getComponent(locationId, SpeciesComponents.populations)) {
          return { ok: false, code: "E_SPECIES_STATE", message: "location needs seeded species populations before they can advance" };
        }
        const days = Number(c.command.payload.days ?? 30);
        if (!Number.isFinite(days) || days <= 0 || days > 365) {
          return { ok: false, code: "E_SPECIES_DAYS", message: "days must be between 0 and 365" };
        }
        return { ok: true };
      },
    });

    ctx.registerResolutionRule({
      id: "world-species.advance_location.resolve",
      commandType: "world-species.advance_location",
      resolve: (c) => {
        const locationId = c.command.targetId as string;
        const eco = ecology.state(c.world, locationId)!;
        const climateState = climate.profile(c.world, locationId)!;
        const water = hydrology.state(c.world, locationId)!;
        const months = Number(c.command.payload.days ?? 30) / 30;
        const current = api.populations(c.world, locationId);
        const next = current.map((entry) => {
          const definition = definitions.get(entry.speciesId);
          if (!definition) return entry;
          const food = foodAvailability(definition, c.world, locationId, vegetation, eco, current, (id) => definitions.get(id));
          const fitness = habitatFitness(definition, entry.traitOffsets, climateState.meanAnnualTemperatureC, water.waterAvailability, food);
          const demographicChange = lifeHistoryPopulationChange(definition, entry.traitOffsets, fitness, months);
          const predationLoss = definition.trophicRole === "herbivore"
            ? specificPredationLoss(entry, definition, current, definitions, months)
            : 0;
          const population = Math.max(0, entry.population * (1 + demographicChange) - predationLoss);
          return {
            speciesId: entry.speciesId,
            population: round2(population),
            habitatFitness: fitness,
            foodAvailability: food,
            traitOffsets: entry.traitOffsets,
            lineage: entry.lineage,
            trophicRole: definition.trophicRole,
          } satisfies SpeciesPopulationSnapshot;
        });
        const capped = capGuildPopulations(next, eco.herbivorePopulation, eco.predatorPopulation);
        return [{
          kind: "modifyComponent",
          entityId: locationId,
          component: SpeciesComponents.populations,
          patch: {
            bySpecies: toPopulationMap(capped),
            updatedAt: c.world.tick,
          },
          reason: "species composition responded to environmental fitness within ecology guild limits",
        }, {
          kind: "emitEvent",
          eventType: "world-species.location_advanced",
          targetId: locationId,
          data: {
            days: Number(c.command.payload.days ?? 30),
            populations: capped as unknown as JsonValue,
          },
          historicalSignificance: 0,
        }];
      },
    });

    ctx.registerConstraintRule({
      id: "world-species.apply_selection.allowed",
      commandType: "world-species.apply_selection",
      evaluate: (c) => {
        const base = validateLocation(c.world, c.command.targetId, climate, hydrology, ecology, vegetation);
        if (!base.ok) return base;
        const locationId = c.command.targetId as string;
        if (!c.world.getComponent(locationId, SpeciesComponents.populations)) {
          return { ok: false, code: "E_SPECIES_STATE", message: "location needs seeded species populations before natural selection can be applied" };
        }
        const generations = Number(c.command.payload.generations ?? 20);
        if (!Number.isInteger(generations) || generations <= 0 || generations > 1000) {
          return { ok: false, code: "E_SPECIES_GENERATIONS", message: "generations must be an integer between 1 and 1000" };
        }
        const standingVariation = Number(c.command.payload.standingVariation ?? 0.5);
        if (!Number.isFinite(standingVariation) || standingVariation < 0 || standingVariation > 1) {
          return { ok: false, code: "E_SPECIES_VARIATION", message: "standingVariation must be between 0 and 1" };
        }
        return { ok: true };
      },
    });

    ctx.registerResolutionRule({
      id: "world-species.apply_selection.resolve",
      commandType: "world-species.apply_selection",
      resolve: (c) => {
        const locationId = c.command.targetId as string;
        const generations = Number(c.command.payload.generations ?? 20);
        const standingVariation = Number(c.command.payload.standingVariation ?? 0.5);
        const climateState = climate.profile(c.world, locationId)!;
        const water = hydrology.state(c.world, locationId)!;
        const eco = ecology.state(c.world, locationId)!;
        const current = api.populations(c.world, locationId);
        const longTermWaterTarget = clamp01(
          water.waterAvailability * 0.65 + climateState.humidityTendency * 0.35,
        );
        const response = standingVariation * (1 - Math.exp(-generations / 120)) * 0.35;
        const changes: Array<Record<string, JsonValue>> = [];

        const selected = current.map((entry) => {
          const definition = definitions.get(entry.speciesId);
          if (!definition || entry.population <= 0) return entry;
          const lineage: PopulationLineageState = {
            selectionGenerations: entry.lineage.selectionGenerations + generations,
            isolationGenerations: entry.lineage.isolationGenerations + generations,
            recentGeneFlow: round3(clamp01(entry.lineage.recentGeneFlow * Math.exp(-generations / 45))),
          };
          if (response <= 0) return { ...entry, lineage };

          const effectiveTemperatureOptimum = definition.temperatureOptimumC + entry.traitOffsets.temperatureOptimumDeltaC;
          const effectiveWaterOptimum = clamp01(definition.waterOptimum + entry.traitOffsets.waterOptimumDelta);
          const temperatureShift = clamp(
            (climateState.meanAnnualTemperatureC - effectiveTemperatureOptimum) * response,
            -2,
            2,
          );
          const waterShift = clamp(
            (longTermWaterTarget - effectiveWaterOptimum) * response,
            -0.08,
            0.08,
          );
          const provisionalOffsets: PopulationTraitOffsets = {
            temperatureOptimumDeltaC: round3(clamp(
              entry.traitOffsets.temperatureOptimumDeltaC + temperatureShift,
              -20,
              20,
            )),
            waterOptimumDelta: round3(clamp(
              entry.traitOffsets.waterOptimumDelta + waterShift,
              -1,
              1,
            )),
            reproductiveOutputDelta: entry.traitOffsets.reproductiveOutputDelta,
          };
          const food = foodAvailability(definition, c.world, locationId, vegetation, eco, current, (id) => definitions.get(id));
          const provisionalFitness = habitatFitness(
            definition,
            provisionalOffsets,
            climateState.meanAnnualTemperatureC,
            water.waterAvailability,
            food,
          );
          const reproductiveOutputShift = lifeHistorySelectionShift(
            definition,
            provisionalOffsets,
            provisionalFitness,
            response,
          );
          const traitOffsets: PopulationTraitOffsets = {
            ...provisionalOffsets,
            reproductiveOutputDelta: round3(clamp(
              provisionalOffsets.reproductiveOutputDelta + reproductiveOutputShift,
              -1,
              1,
            )),
          };
          const fitness = habitatFitness(
            definition,
            traitOffsets,
            climateState.meanAnnualTemperatureC,
            water.waterAvailability,
            food,
          );
          changes.push({
            speciesId: entry.speciesId,
            temperatureOptimumDeltaC: traitOffsets.temperatureOptimumDeltaC,
            waterOptimumDelta: traitOffsets.waterOptimumDelta,
            reproductiveOutputDelta: traitOffsets.reproductiveOutputDelta,
          });
          return {
            ...entry,
            traitOffsets,
            lineage,
            foodAvailability: food,
            habitatFitness: fitness,
          } satisfies SpeciesPopulationSnapshot;
        });

        return [{
          kind: "modifyComponent",
          entityId: locationId,
          component: SpeciesComponents.populations,
          patch: { bySpecies: toPopulationMap(selected), updatedAt: c.world.tick },
          reason: "standing variation responded slowly to sustained local environmental selection",
        }, {
          kind: "emitEvent",
          eventType: "world-species.selection_applied",
          targetId: locationId,
          data: {
            generations,
            standingVariation,
            temperatureTargetC: climateState.meanAnnualTemperatureC,
            waterTarget: round3(longTermWaterTarget),
            changes: changes as unknown as JsonValue,
          },
          historicalSignificance: 0,
        }];
      },
    });

    ctx.registerConstraintRule({
      id: "world-species.disperse_to_neighbor.allowed",
      commandType: "world-species.disperse_to_neighbor",
      evaluate: (c) => {
        const sourceId = c.command.targetId;
        const destinationId = String(c.command.payload.toLocationId ?? "");
        const source = validateLocation(c.world, sourceId, climate, hydrology, ecology, vegetation);
        if (!source.ok) return source;
        const destination = validateLocation(c.world, destinationId, climate, hydrology, ecology, vegetation);
        if (!destination.ok) return destination;
        if (sourceId === destinationId) {
          return { ok: false, code: "E_SPECIES_DISPERSAL_SELF", message: "species cannot disperse to the same location" };
        }
        if (!c.world.getComponent(sourceId as string, SpeciesComponents.populations)) {
          return { ok: false, code: "E_SPECIES_STATE", message: "source location needs known species populations before dispersal" };
        }
        const connection = c.world.listRelations({
          type: GeographyRelations.adjacentTo,
          from: sourceId as string,
          to: destinationId,
        })[0];
        if (!connection) {
          return { ok: false, code: "E_SPECIES_NOT_ADJACENT", message: "species dispersal currently requires directly adjacent locations" };
        }
        const distanceKm = Number(connection.components[GeographyComponents.connection]?.distanceKm ?? 0);
        if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
          return { ok: false, code: "E_SPECIES_DISTANCE", message: "adjacent locations need a positive distance for dispersal" };
        }
        const days = Number(c.command.payload.days ?? 30);
        if (!Number.isFinite(days) || days <= 0 || days > 365) {
          return { ok: false, code: "E_SPECIES_DAYS", message: "days must be between 0 and 365" };
        }
        return { ok: true };
      },
    });

    ctx.registerResolutionRule({
      id: "world-species.disperse_to_neighbor.resolve",
      commandType: "world-species.disperse_to_neighbor",
      resolve: (c): Effect[] => {
        const sourceId = c.command.targetId as string;
        const destinationId = String(c.command.payload.toLocationId);
        const days = Number(c.command.payload.days ?? 30);
        const months = days / 30;
        const connection = c.world.listRelations({
          type: GeographyRelations.adjacentTo,
          from: sourceId,
          to: destinationId,
        })[0]!;
        const distanceKm = Number(connection.components[GeographyComponents.connection]?.distanceKm ?? 1);

        const sourceEco = ecology.state(c.world, sourceId)!;
        const destinationEco = ecology.state(c.world, destinationId)!;
        const destinationClimate = climate.profile(c.world, destinationId)!;
        const destinationWater = hydrology.state(c.world, destinationId)!;
        const sourceEntries = api.populations(c.world, sourceId);
        const destinationEntries = api.populations(c.world, destinationId);
        const nextSource = sourceEntries.map((entry) => ({ ...entry }));
        const nextDestination = destinationEntries.map((entry) => ({ ...entry }));
        const moved: Array<{ speciesId: string; population: number }> = [];

        for (const sourceEntry of nextSource) {
          const definition = definitions.get(sourceEntry.speciesId);
          if (!definition || sourceEntry.population <= 0) continue;

          const sourceGuildTotal = guildTotal(sourceEco, definition.trophicRole);
          const sourceGuildCapacity = guildCapacity(sourceEco, definition.trophicRole);
          const crowding = clamp01(sourceGuildTotal / Math.max(0.01, sourceGuildCapacity));
          const emigrationPressure = clamp01(0.12 + Math.max(0, crowding - 0.62) * 1.45);
          const distanceFactor = 1 / (1 + distanceKm / 18);
          const targetFood = foodAvailability(definition, c.world, destinationId, vegetation, destinationEco, nextDestination, (id) => definitions.get(id));
          const targetFitness = habitatFitness(
            definition,
            sourceEntry.traitOffsets,
            destinationClimate.meanAnnualTemperatureC,
            destinationWater.waterAvailability,
            targetFood,
          );

          const targetGuildTotal = guildTotal(destinationEco, definition.trophicRole);
          const representedAtTarget = nextDestination
            .filter((entry) => entry.trophicRole === definition.trophicRole)
            .reduce((sum, entry) => sum + entry.population, 0);
          const freeTargetBudget = Math.max(0, targetGuildTotal - representedAtTarget);
          if (freeTargetBudget <= 0 || targetFitness <= 0.05) continue;

          const proposed = sourceEntry.population
            * 0.16
            * months
            * emigrationPressure
            * distanceFactor
            * targetFitness;
          const migrated = round2(Math.min(
            sourceEntry.population * 0.28,
            freeTargetBudget,
            Math.max(0, proposed),
          ));
          if (migrated <= 0) continue;

          sourceEntry.population = round2(Math.max(0, sourceEntry.population - migrated));
          const existing = nextDestination.find((entry) => entry.speciesId === sourceEntry.speciesId);
          if (existing) {
            const previousPopulation = existing.population;
            existing.population = round2(existing.population + migrated);
            const migrantFraction = clamp01(migrated / Math.max(0.01, existing.population));
            existing.traitOffsets = blendTraitOffsets(existing.traitOffsets, previousPopulation, sourceEntry.traitOffsets, migrated);
            existing.lineage = {
              selectionGenerations: round2(weightedAverage(
                existing.lineage.selectionGenerations,
                previousPopulation,
                sourceEntry.lineage.selectionGenerations,
                migrated,
              )),
              isolationGenerations: round2(existing.lineage.isolationGenerations * (1 - migrantFraction)),
              recentGeneFlow: round3(clamp01(existing.lineage.recentGeneFlow * 0.5 + migrantFraction)),
            };
            existing.habitatFitness = habitatFitness(
              definition,
              existing.traitOffsets,
              destinationClimate.meanAnnualTemperatureC,
              destinationWater.waterAvailability,
              targetFood,
            );
            existing.foodAvailability = targetFood;
          } else {
            nextDestination.push({
              speciesId: sourceEntry.speciesId,
              population: migrated,
              habitatFitness: targetFitness,
              foodAvailability: targetFood,
              traitOffsets: { ...sourceEntry.traitOffsets },
              lineage: {
                selectionGenerations: sourceEntry.lineage.selectionGenerations,
                isolationGenerations: 0,
                recentGeneFlow: 1,
              },
              trophicRole: definition.trophicRole,
            });
          }
          moved.push({ speciesId: sourceEntry.speciesId, population: migrated });
        }

        const cappedDestination = capGuildPopulations(
          nextDestination,
          destinationEco.herbivorePopulation,
          destinationEco.predatorPopulation,
        );
        return [{
          kind: "modifyComponent",
          entityId: sourceId,
          component: SpeciesComponents.populations,
          patch: { bySpecies: toPopulationMap(nextSource), updatedAt: c.world.tick },
          reason: "known species dispersed from a crowded source location",
        }, writeComponent(Boolean(c.world.getComponent(destinationId, SpeciesComponents.populations)), destinationId, SpeciesComponents.populations,
          { bySpecies: toPopulationMap(cappedDestination), updatedAt: c.world.tick }, "known species arrived from an adjacent location"), {
          kind: "emitEvent",
          eventType: "world-species.dispersed",
          targetId: destinationId,
          data: {
            fromLocationId: sourceId,
            toLocationId: destinationId,
            distanceKm,
            days,
            moved: moved as unknown as JsonValue,
          },
          historicalSignificance: 0,
        }];
      },
    });

    ctx.registerProjection({
      id: "world-species.location-populations",
      description: "Inspect known concrete species populations at one Location.",
      build: ({ world, params }) => {
        const locationId = String(params.locationId ?? "");
        const location = world.getEntity(locationId);
        if (!location || location.kind !== GeographyKinds.location) return { exists: false, locationId };
        return {
          exists: true,
          locationId,
          populations: api.populations(world, locationId),
        };
      },
    });

    ctx.registerProjection({
      id: "world-species.divergence",
      description: "Compare two local populations of the same species and expose divergence potential without creating a lineage or new species.",
      build: ({ world, params }) => {
        const speciesId = String(params.speciesId ?? "");
        const locationAId = String(params.locationAId ?? "");
        const locationBId = String(params.locationBId ?? "");
        const a = api.populations(world, locationAId).find((entry) => entry.speciesId === speciesId);
        const b = api.populations(world, locationBId).find((entry) => entry.speciesId === speciesId);
        if (!a || !b) return { exists: false, speciesId, locationAId, locationBId };

        const traitDistance = divergenceTraitDistance(a.traitOffsets, b.traitOffsets);
        const isolationGenerations = Math.min(a.lineage.isolationGenerations, b.lineage.isolationGenerations);
        const isolationFactor = clamp01(1 - Math.exp(-isolationGenerations / 180));
        const geneFlowSignal = round3(clamp01((a.lineage.recentGeneFlow + b.lineage.recentGeneFlow) / 2));
        const divergencePotential = round3(clamp01(
          traitDistance * (0.3 + isolationFactor * 0.7) * (1 - geneFlowSignal * 0.8),
        ));
        return {
          exists: true,
          speciesId,
          locationAId,
          locationBId,
          traitDistance,
          isolationGenerations,
          geneFlowSignal,
          divergencePotential,
          speciationTriggered: false,
        };
      },
    });

    ctx.registerProjection({
      id: "world-species.reproductive-isolation",
      description: "Estimate reproductive-isolation potential between two local populations using ecological trait divergence, isolation and gene flow; no mating or genetic incompatibility is simulated yet.",
      build: ({ world, params }) => {
        const speciesId = String(params.speciesId ?? "");
        const locationAId = String(params.locationAId ?? "");
        const locationBId = String(params.locationBId ?? "");
        const a = api.populations(world, locationAId).find((entry) => entry.speciesId === speciesId);
        const b = api.populations(world, locationBId).find((entry) => entry.speciesId === speciesId);
        if (!a || !b) return { exists: false, speciesId, locationAId, locationBId };

        const traitDistance = divergenceTraitDistance(a.traitOffsets, b.traitOffsets);
        const isolationGenerations = Math.min(a.lineage.isolationGenerations, b.lineage.isolationGenerations);
        const isolationFactor = clamp01(1 - Math.exp(-isolationGenerations / 180));
        const geneFlowSignal = round3(clamp01((a.lineage.recentGeneFlow + b.lineage.recentGeneFlow) / 2));
        const rawIsolation = clamp01(traitDistance * 0.55 + isolationFactor * 0.45);
        const reproductiveIsolationPotential = round3(clamp01(rawIsolation * (1 - geneFlowSignal * 0.75)));
        const mateCompatibilityProxy = round3(clamp01(1 - reproductiveIsolationPotential * 0.82));
        const hybridFitnessProxy = round3(clamp01(1 - traitDistance * (0.48 + isolationFactor * 0.18)));
        return {
          exists: true,
          speciesId,
          locationAId,
          locationBId,
          traitDistance,
          isolationGenerations,
          geneFlowSignal,
          reproductiveIsolationPotential,
          mateCompatibilityProxy,
          hybridFitnessProxy,
          behavioralIsolationModeled: false,
          geneticIncompatibilityModeled: false,
          matingSimulated: false,
          speciationTriggered: false,
        };
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
  vegetation: VegetationApi,
) {
  const location = locationId ? world.getEntity(locationId) : undefined;
  if (!location || location.kind !== GeographyKinds.location || location.archivedAt !== undefined) {
    return { ok: false as const, code: "E_SPECIES_LOCATION", message: "target must be an existing geography location" };
  }
  if (!climate.profile(world, locationId as string)) {
    return { ok: false as const, code: "E_SPECIES_CLIMATE", message: "location needs a climate profile" };
  }
  if (!hydrology.state(world, locationId as string)) {
    return { ok: false as const, code: "E_SPECIES_HYDROLOGY", message: "location needs hydrology state" };
  }
  if (!ecology.state(world, locationId as string)) {
    return { ok: false as const, code: "E_SPECIES_ECOLOGY", message: "location needs aggregate ecology state" };
  }
  if (vegetation.composition(world, locationId as string).length === 0) {
    return { ok: false as const, code: "E_SPECIES_VEGETATION", message: "location needs vegetation composition before concrete species can be evaluated" };
  }
  return { ok: true as const };
}

function validateDefinition(definition: SpeciesDefinition): void {
  if (!definition.id.includes(".")) throw new Error(`species definition id must be namespaced: ${definition.id}`);
  if (!definition.name.trim()) throw new Error(`species definition needs a name: ${definition.id}`);
  if (definition.trophicRole !== "herbivore" && definition.trophicRole !== "predator") {
    throw new Error(`unknown trophic role for species: ${definition.id}`);
  }
  if (!Array.isArray(definition.diet) || definition.diet.length === 0) {
    throw new Error(`species definition needs at least one diet tag: ${definition.id}`);
  }
  if (!Number.isFinite(definition.temperatureToleranceC) || definition.temperatureToleranceC <= 0) {
    throw new Error(`species temperature tolerance must be positive: ${definition.id}`);
  }
  if (!Number.isFinite(definition.waterTolerance) || definition.waterTolerance <= 0) {
    throw new Error(`species water tolerance must be positive: ${definition.id}`);
  }
  const life = definition.lifeHistory;
  if (!life || !Number.isFinite(life.maturityYears) || life.maturityYears <= 0) {
    throw new Error(`species maturityYears must be positive: ${definition.id}`);
  }
  if (!Number.isFinite(life.lifespanYears) || life.lifespanYears <= life.maturityYears) {
    throw new Error(`species lifespanYears must exceed maturityYears: ${definition.id}`);
  }
  if (!Number.isFinite(life.reproductiveOutput) || life.reproductiveOutput < 0 || life.reproductiveOutput > 1) {
    throw new Error(`species reproductiveOutput must be between 0 and 1: ${definition.id}`);
  }
  if (!Number.isFinite(life.offspringInvestment) || life.offspringInvestment < 0 || life.offspringInvestment > 1) {
    throw new Error(`species offspringInvestment must be between 0 and 1: ${definition.id}`);
  }
  if (!Number.isFinite(life.baselineAnnualMortality) || life.baselineAnnualMortality < 0 || life.baselineAnnualMortality > 1) {
    throw new Error(`species baselineAnnualMortality must be between 0 and 1: ${definition.id}`);
  }
}

function freezeDefinition(definition: SpeciesDefinition): SpeciesDefinition {
  return Object.freeze({
    ...definition,
    diet: Object.freeze([...definition.diet]) as unknown as string[],
    lifeHistory: Object.freeze({ ...definition.lifeHistory }),
    ...(definition.tags ? { tags: Object.freeze([...definition.tags]) as unknown as string[] } : {}),
  });
}

function populationInputs(value: unknown): Array<{ speciesId: string; population: number; traitOffsets: PopulationTraitOffsets }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    .map((entry) => ({
      speciesId: String(entry.speciesId ?? ""),
      population: Number(entry.population ?? 0),
      traitOffsets: normalizeTraitOffsets(entry.traitOffsets),
    }));
}

function populationEntries(raw: unknown): SpeciesPopulationSnapshot[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const bySpecies = (raw as Record<string, unknown>).bySpecies;
  if (!bySpecies || typeof bySpecies !== "object" || Array.isArray(bySpecies)) return [];
  return Object.entries(bySpecies as Record<string, unknown>)
    .map(([speciesId, value]) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
      const entry = value as Record<string, unknown>;
      const role = String(entry.trophicRole ?? "") as TrophicRole;
      if (role !== "herbivore" && role !== "predator") return undefined;
      return {
        speciesId,
        population: Math.max(0, Number(entry.population ?? 0)),
        habitatFitness: clamp01(Number(entry.habitatFitness ?? 0)),
        foodAvailability: clamp01(Number(entry.foodAvailability ?? 0)),
        traitOffsets: normalizeTraitOffsets(entry.traitOffsets),
        lineage: normalizeLineage(entry.lineage),
        trophicRole: role,
      } satisfies SpeciesPopulationSnapshot;
    })
    .filter((entry): entry is SpeciesPopulationSnapshot => entry !== undefined)
    .sort((a, b) => a.speciesId.localeCompare(b.speciesId));
}

function toPopulationMap(entries: SpeciesPopulationSnapshot[]): JsonValue {
  const map: Record<string, JsonValue> = {};
  for (const entry of entries) {
    map[entry.speciesId] = {
      population: round2(entry.population),
      habitatFitness: round3(entry.habitatFitness),
      foodAvailability: round3(entry.foodAvailability),
      traitOffsets: { ...entry.traitOffsets },
      lineage: { ...entry.lineage },
      trophicRole: entry.trophicRole,
    };
  }
  return map;
}

function habitatFitness(
  definition: SpeciesDefinition,
  offsets: PopulationTraitOffsets,
  temperatureC: number,
  waterAvailability: number,
  food: number,
): number {
  const temperatureOptimumC = definition.temperatureOptimumC + offsets.temperatureOptimumDeltaC;
  const waterOptimum = clamp01(definition.waterOptimum + offsets.waterOptimumDelta);
  const thermal = clamp01(1 - Math.abs(temperatureC - temperatureOptimumC) / definition.temperatureToleranceC);
  const water = clamp01(1 - Math.abs(waterAvailability - waterOptimum) / definition.waterTolerance);
  const environmental = thermal * 0.56 + water * 0.44;
  return round3(environmental * (0.3 + clamp01(food) * 0.7));
}

function specificPredationLoss(
  preyEntry: SpeciesPopulationSnapshot,
  preyDefinition: SpeciesDefinition,
  localSpecies: SpeciesPopulationSnapshot[],
  definitions: Map<string, SpeciesDefinition>,
  months: number,
): number {
  let loss = 0;
  for (const predatorEntry of localSpecies) {
    if (predatorEntry.trophicRole !== "predator" || predatorEntry.population <= 0) continue;
    const predator = definitions.get(predatorEntry.speciesId);
    if (!predator || !predatorCanEat(predator, preyDefinition)) continue;

    const compatiblePreyTotal = localSpecies.reduce((sum, candidate) => {
      if (candidate.trophicRole !== "herbivore") return sum;
      const candidateDefinition = definitions.get(candidate.speciesId);
      if (!candidateDefinition || !predatorCanEat(predator, candidateDefinition)) return sum;
      return sum + candidate.population;
    }, 0);
    if (compatiblePreyTotal <= 0) continue;

    const predatorFoodSupport = clamp01(predatorEntry.foodAvailability);
    const predatorDemand = predatorEntry.population * 0.32 * (0.45 + predatorFoodSupport * 0.55) * months;
    loss += predatorDemand * (preyEntry.population / compatiblePreyTotal);
  }
  return round2(Math.min(preyEntry.population * 0.45, Math.max(0, loss)));
}

function predatorCanEat(predator: SpeciesDefinition, prey: SpeciesDefinition): boolean {
  const edible = new Set(predator.diet);
  return edible.has(prey.id) || (prey.tags ?? []).some((tag) => edible.has(tag));
}

function foodAvailability(
  definition: SpeciesDefinition,
  world: WorldView,
  locationId: string,
  vegetation: VegetationApi,
  ecology: NonNullable<ReturnType<EcologyApi["state"]>>,
  localSpecies: SpeciesPopulationSnapshot[],
  resolveSpecies: (id: string) => SpeciesDefinition | undefined,
): number {
  const edible = new Set(definition.diet);
  if (definition.trophicRole === "herbivore") {
    const compatibleBiomass = vegetation.composition(world, locationId).reduce((sum, entry) => {
      const plant = vegetation.getDefinition(entry.vegetationId);
      if (!plant || !plant.foodTags.some((tag) => edible.has(tag))) return sum;
      return sum + entry.biomass;
    }, 0);
    return round3(clamp01(compatibleBiomass / Math.max(0.01, ecology.plantBiomass)));
  }

  const compatiblePrey = localSpecies.reduce((sum, entry) => {
    if (entry.trophicRole !== "herbivore") return sum;
    const prey = resolveSpecies(entry.speciesId);
    if (!prey) return sum;
    return predatorCanEat(definition, prey) ? sum + entry.population : sum;
  }, 0);
  return round3(clamp01(compatiblePrey / Math.max(0.01, ecology.herbivorePopulation)));
}

function capGuildPopulations(
  entries: SpeciesPopulationSnapshot[],
  herbivoreTotal: number,
  predatorTotal: number,
): SpeciesPopulationSnapshot[] {
  const result = entries.map((entry) => ({ ...entry }));
  capRole(result, "herbivore", Math.max(0, herbivoreTotal));
  capRole(result, "predator", Math.max(0, predatorTotal));
  return result;
}

function capRole(entries: SpeciesPopulationSnapshot[], role: TrophicRole, guildTotal: number): void {
  const members = entries.filter((entry) => entry.trophicRole === role);
  const represented = members.reduce((sum, entry) => sum + entry.population, 0);
  if (represented <= guildTotal || represented <= 0) return;
  const scale = guildTotal / represented;
  for (const entry of members) entry.population = round2(entry.population * scale);
}

function guildTotal(ecology: ReturnType<EcologyApi["state"]> extends infer T ? Exclude<T, undefined> : never, role: TrophicRole): number {
  return role === "herbivore" ? ecology.herbivorePopulation : ecology.predatorPopulation;
}

function guildCapacity(ecology: ReturnType<EcologyApi["state"]> extends infer T ? Exclude<T, undefined> : never, role: TrophicRole): number {
  return role === "herbivore" ? ecology.herbivoreCarryingCapacity : ecology.predatorCarryingCapacity;
}

function normalizeTraitOffsets(value: unknown): PopulationTraitOffsets {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    temperatureOptimumDeltaC: Number(raw.temperatureOptimumDeltaC ?? 0),
    waterOptimumDelta: Number(raw.waterOptimumDelta ?? 0),
    reproductiveOutputDelta: Number(raw.reproductiveOutputDelta ?? 0),
  };
}

function normalizeLineage(value: unknown): PopulationLineageState {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    selectionGenerations: Math.max(0, Number(raw.selectionGenerations ?? 0)),
    isolationGenerations: Math.max(0, Number(raw.isolationGenerations ?? 0)),
    recentGeneFlow: clamp01(Number(raw.recentGeneFlow ?? 0)),
  };
}

function validTraitOffsets(offsets: PopulationTraitOffsets): boolean {
  return Number.isFinite(offsets.temperatureOptimumDeltaC)
    && offsets.temperatureOptimumDeltaC >= -20
    && offsets.temperatureOptimumDeltaC <= 20
    && Number.isFinite(offsets.waterOptimumDelta)
    && offsets.waterOptimumDelta >= -1
    && offsets.waterOptimumDelta <= 1
    && Number.isFinite(offsets.reproductiveOutputDelta)
    && offsets.reproductiveOutputDelta >= -1
    && offsets.reproductiveOutputDelta <= 1;
}

function effectiveReproductiveOutput(definition: SpeciesDefinition, offsets: PopulationTraitOffsets): number {
  return clamp01(definition.lifeHistory.reproductiveOutput + offsets.reproductiveOutputDelta);
}

function lifeHistoryPopulationChange(
  definition: SpeciesDefinition,
  offsets: PopulationTraitOffsets,
  habitatFitnessValue: number,
  months: number,
): number {
  const life = definition.lifeHistory;
  const maturityFactor = clamp01(1 / (1 + life.maturityYears / 4));
  const outputDelta = offsets.reproductiveOutputDelta;
  const effectiveInvestment = clamp01(life.offspringInvestment - outputDelta * 0.35);
  const quantityAfterInvestment = 1 - effectiveInvestment * 0.45;
  const recruitmentQuality = 0.55 + effectiveInvestment * 0.45;
  const recruitmentAnnual = effectiveReproductiveOutput(definition, offsets)
    * maturityFactor
    * quantityAfterInvestment
    * recruitmentQuality
    * (0.45 + clamp01(habitatFitnessValue) * 0.55);
  const lifespanPressure = 0.35 / Math.max(1, life.lifespanYears);
  const environmentalMortality = Math.max(0, 0.55 - habitatFitnessValue) * 0.28;
  const extraReproductiveCost = Math.max(0, outputDelta)
    * (0.2 + (1 - clamp01(habitatFitnessValue)) * 0.35);
  const conservationBenefit = Math.max(0, -outputDelta) * 0.08;
  const mortalityAnnual = clamp01(
    life.baselineAnnualMortality
      + lifespanPressure
      + environmentalMortality
      + extraReproductiveCost
      - conservationBenefit,
  );
  return round3((recruitmentAnnual - mortalityAnnual) * (months / 12));
}

function lifeHistorySelectionShift(
  definition: SpeciesDefinition,
  offsets: PopulationTraitOffsets,
  habitatFitnessValue: number,
  response: number,
): number {
  const step = 0.04;
  const higher: PopulationTraitOffsets = {
    ...offsets,
    reproductiveOutputDelta: clamp(offsets.reproductiveOutputDelta + step, -1, 1),
  };
  const lower: PopulationTraitOffsets = {
    ...offsets,
    reproductiveOutputDelta: clamp(offsets.reproductiveOutputDelta - step, -1, 1),
  };
  const higherScore = lifeHistoryPopulationChange(definition, higher, habitatFitnessValue, 12);
  const lowerScore = lifeHistoryPopulationChange(definition, lower, habitatFitnessValue, 12);
  const gradient = higherScore - lowerScore;
  return round3(clamp(gradient * response * 4, -0.03, 0.03));
}

function blendTraitOffsets(
  resident: PopulationTraitOffsets,
  residentPopulation: number,
  migrants: PopulationTraitOffsets,
  migrantPopulation: number,
): PopulationTraitOffsets {
  const total = residentPopulation + migrantPopulation;
  if (total <= 0) return { ...resident };
  const blend = (a: number, b: number) => round3((a * residentPopulation + b * migrantPopulation) / total);
  return {
    temperatureOptimumDeltaC: blend(resident.temperatureOptimumDeltaC, migrants.temperatureOptimumDeltaC),
    waterOptimumDelta: blend(resident.waterOptimumDelta, migrants.waterOptimumDelta),
    reproductiveOutputDelta: blend(resident.reproductiveOutputDelta, migrants.reproductiveOutputDelta),
  };
}

function weightedAverage(a: number, aWeight: number, b: number, bWeight: number): number {
  const total = aWeight + bWeight;
  if (total <= 0) return a;
  return (a * aWeight + b * bWeight) / total;
}

function divergenceTraitDistance(a: PopulationTraitOffsets, b: PopulationTraitOffsets): number {
  const temperature = clamp01(Math.abs(a.temperatureOptimumDeltaC - b.temperatureOptimumDeltaC) / 20);
  const water = clamp01(Math.abs(a.waterOptimumDelta - b.waterOptimumDelta));
  const reproductiveOutput = clamp01(Math.abs(a.reproductiveOutputDelta - b.reproductiveOutputDelta));
  return round3(temperature * 0.55 + water * 0.3 + reproductiveOutput * 0.15);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
