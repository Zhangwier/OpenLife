/**
 * Minimal aggregate ecology layer.
 *
 * This module intentionally models trophic guilds rather than individual species:
 * plant biomass -> herbivores -> predators. Climate and local water availability
 * determine carrying capacity; populations then respond to food pressure and
 * predation. Species, individuals, evolution and disease come later.
 */

import type { OpenLifeModule, WorldView } from "@openlife/contracts";
import { GeographyKinds } from "@openlife/module-world-geography";
import type { ClimateApi, ClimateProfileSnapshot } from "@openlife/module-world-climate";
import type { HydrologyApi, HydrologySnapshot } from "@openlife/module-world-hydrology";

const OWNER = "world-ecology";
const CAPABILITY = "world.ecology-state";

export const EcologyComponents = {
  state: "world-ecology.state",
} as const;

export interface EcologySnapshot {
  plantBiomass: number;
  herbivorePopulation: number;
  predatorPopulation: number;
  plantCarryingCapacity: number;
  herbivoreCarryingCapacity: number;
  predatorCarryingCapacity: number;
  habitatSuitability: number;
  grazingPressure: number;
  predationPressure: number;
  foodStress: number;
  updatedAt: number;
}

export interface EcologyApi {
  state(world: WorldView, locationId: string): EcologySnapshot | undefined;
}

export const worldEcologyModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "World Ecology Prototype",
    description: "Aggregate plant, herbivore and predator dynamics grounded in climate and local water availability.",
    requires: ["world.geography", "world.climate-profile", "world.hydrology-state"],
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
    if (!climate) throw new Error("world ecology requires world.climate-profile");
    if (!hydrology) throw new Error("world ecology requires world.hydrology-state");

    const api: EcologyApi = {
      state(world, locationId) {
        const location = world.getEntity(locationId);
        if (!location || location.kind !== GeographyKinds.location || location.archivedAt !== undefined) return undefined;
        const raw = location.components[EcologyComponents.state];
        return raw ? snapshot(raw) : undefined;
      },
    };
    ctx.provideCapability(CAPABILITY, api);

    ctx.registerComponent({
      id: EcologyComponents.state,
      persist: true,
      description: "Aggregate local trophic state; no individual animals, named species or evolution semantics.",
    });

    ctx.registerCommand({
      type: "world-ecology.initialize_location",
      description: "Initialize aggregate trophic state from the location's climate and hydrology.",
    });
    ctx.registerCommand({
      type: "world-ecology.advance_location",
      description: "Advance plant, herbivore and predator dynamics for a coarse ecological time step.",
    });

    ctx.registerConstraintRule({
      id: "world-ecology.initialize_location.allowed",
      commandType: "world-ecology.initialize_location",
      evaluate: (c) => validateEnvironment(c.world, c.command.targetId, climate, hydrology),
    });
    ctx.registerResolutionRule({
      id: "world-ecology.initialize_location.resolve",
      commandType: "world-ecology.initialize_location",
      resolve: (c) => {
        const locationId = c.command.targetId as string;
        const climateState = climate.profile(c.world, locationId)!;
        const water = hydrology.state(c.world, locationId)!;
        const capacity = carryingCapacity(climateState, water);
        const plantBiomass = clamp(
          Number(c.command.payload.plantBiomass ?? capacity.plant * 0.68),
          0,
          1.2,
        );
        const herbivorePopulation = Math.max(
          0,
          Number(c.command.payload.herbivorePopulation ?? capacity.herbivores * 0.42),
        );
        const predatorPopulation = Math.max(
          0,
          Number(c.command.payload.predatorPopulation ?? capacity.predators * 0.3),
        );
        return [{
          kind: "setComponent",
          entityId: locationId,
          component: EcologyComponents.state,
          value: {
            plantBiomass: round3(plantBiomass),
            herbivorePopulation: round2(herbivorePopulation),
            predatorPopulation: round2(predatorPopulation),
            plantCarryingCapacity: capacity.plant,
            herbivoreCarryingCapacity: capacity.herbivores,
            predatorCarryingCapacity: capacity.predators,
            habitatSuitability: capacity.habitat,
            grazingPressure: 0,
            predationPressure: 0,
            foodStress: 0,
            updatedAt: c.world.tick,
          },
          reason: "aggregate ecology initialized from climate and hydrology",
        }];
      },
    });

    ctx.registerConstraintRule({
      id: "world-ecology.advance_location.allowed",
      commandType: "world-ecology.advance_location",
      evaluate: (c) => {
        const base = validateEnvironment(c.world, c.command.targetId, climate, hydrology);
        if (!base.ok) return base;
        const locationId = c.command.targetId as string;
        if (!c.world.getComponent(locationId, EcologyComponents.state)) {
          return { ok: false, code: "E_ECOLOGY_STATE", message: "location must be initialized before ecology can advance" };
        }
        const days = Number(c.command.payload.days ?? 30);
        if (!Number.isFinite(days) || days <= 0 || days > 365) {
          return { ok: false, code: "E_ECOLOGY_DAYS", message: "days must be between 0 and 365" };
        }
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: "world-ecology.advance_location.resolve",
      commandType: "world-ecology.advance_location",
      resolve: (c) => {
        const locationId = c.command.targetId as string;
        const current = snapshot(c.world.getComponent(locationId, EcologyComponents.state) ?? {});
        const climateState = climate.profile(c.world, locationId)!;
        const water = hydrology.state(c.world, locationId)!;
        const capacity = carryingCapacity(climateState, water);
        const months = Number(c.command.payload.days ?? 30) / 30;

        const plantRecovery = (capacity.plant - current.plantBiomass) * 0.24 * months;
        const grazingDemand = current.herbivorePopulation * 0.0024 * months;
        const availablePlant = Math.max(0, current.plantBiomass + Math.max(0, plantRecovery));
        const grazing = Math.min(availablePlant * 0.7, grazingDemand);
        const nextPlant = clamp(current.plantBiomass + plantRecovery - grazing, 0, 1.2);

        const foodRatio = clamp(nextPlant / Math.max(0.05, capacity.plant), 0, 1.4);
        const herbivoreBirths = current.herbivorePopulation * 0.095 * Math.min(1.15, foodRatio) * months;
        const herbivoreStarvation = current.herbivorePopulation * 0.11 * Math.max(0, 0.72 - foodRatio) * months;
        const predatorFoodRatio = clamp(
          current.herbivorePopulation / Math.max(1, capacity.herbivores),
          0,
          1.5,
        );
        const predation = Math.min(
          current.herbivorePopulation * 0.45,
          current.predatorPopulation * 0.34 * (0.45 + predatorFoodRatio) * months,
        );
        const densityLoss = current.herbivorePopulation > capacity.herbivores
          ? (current.herbivorePopulation - capacity.herbivores) * 0.08 * months
          : 0;
        const nextHerbivores = Math.max(
          0,
          current.herbivorePopulation + herbivoreBirths - herbivoreStarvation - predation - densityLoss,
        );

        const predatorSupport = clamp(nextHerbivores / Math.max(1, capacity.herbivores), 0, 1.5);
        const predatorBirths = current.predatorPopulation * 0.075 * Math.min(1.15, predatorSupport) * months;
        const predatorStarvation = current.predatorPopulation * 0.09 * Math.max(0, 0.65 - predatorSupport) * months;
        const predatorDensityLoss = current.predatorPopulation > capacity.predators
          ? (current.predatorPopulation - capacity.predators) * 0.1 * months
          : 0;
        const nextPredators = Math.max(
          0,
          current.predatorPopulation + predatorBirths - predatorStarvation - predatorDensityLoss,
        );

        const grazingPressure = round2(clamp(grazingDemand / Math.max(0.05, capacity.plant), 0, 2));
        const predationPressure = round2(clamp(predation / Math.max(1, current.herbivorePopulation), 0, 1));
        const foodStress = round2(clamp(1 - foodRatio, 0, 1));
        const patch: EcologySnapshot = {
          plantBiomass: round3(nextPlant),
          herbivorePopulation: round2(nextHerbivores),
          predatorPopulation: round2(nextPredators),
          plantCarryingCapacity: capacity.plant,
          herbivoreCarryingCapacity: capacity.herbivores,
          predatorCarryingCapacity: capacity.predators,
          habitatSuitability: capacity.habitat,
          grazingPressure,
          predationPressure,
          foodStress,
          updatedAt: c.world.tick,
        };

        return [{
          kind: "modifyComponent",
          entityId: locationId,
          component: EcologyComponents.state,
          patch,
          reason: "aggregate trophic populations responded to current habitat and food pressure",
        }, {
          kind: "emitEvent",
          eventType: "world-ecology.location_advanced",
          targetId: locationId,
          data: {
            days: Number(c.command.payload.days ?? 30),
            plantBiomass: patch.plantBiomass,
            herbivorePopulation: patch.herbivorePopulation,
            predatorPopulation: patch.predatorPopulation,
            habitatSuitability: patch.habitatSuitability,
            grazingPressure,
            predationPressure,
            foodStress,
          },
          historicalSignificance: 0,
        }];
      },
    });

    ctx.registerProjection({
      id: "world-ecology.location-state",
      description: "Inspect aggregate local plant, herbivore and predator dynamics.",
      build: ({ world, params }) => {
        const locationId = String(params.locationId ?? "");
        const state = api.state(world, locationId);
        return state ? { exists: true, locationId, ...state } : { exists: false, locationId };
      },
    });
  },
};

function validateEnvironment(
  world: WorldView,
  locationId: string | undefined,
  climate: ClimateApi,
  hydrology: HydrologyApi,
) {
  const location = locationId ? world.getEntity(locationId) : undefined;
  if (!location || location.kind !== GeographyKinds.location || location.archivedAt !== undefined) {
    return { ok: false as const, code: "E_ECOLOGY_LOCATION", message: "target must be an existing geography location" };
  }
  if (!climate.profile(world, locationId as string)) {
    return { ok: false as const, code: "E_ECOLOGY_CLIMATE", message: "location needs a climate profile" };
  }
  if (!hydrology.state(world, locationId as string)) {
    return { ok: false as const, code: "E_ECOLOGY_HYDROLOGY", message: "location needs hydrology state" };
  }
  return { ok: true as const };
}

function carryingCapacity(climate: ClimateProfileSnapshot, water: HydrologySnapshot) {
  const temperatureSuitability = clamp(1 - Math.abs(climate.meanAnnualTemperatureC - 18) / 34, 0.08, 1);
  const waterSuitability = clamp(
    water.waterAvailability * 0.72
    + water.soilMoisture * 0.18
    + Math.min(1, water.surfaceWaterMm / 45) * 0.1,
    0,
    1,
  );
  const terrainFactor = climate.terrain === "valley" ? 1.08
    : climate.terrain === "plain" ? 1
      : climate.terrain === "coast" ? 0.94
        : climate.terrain === "hill" ? 0.88
          : climate.terrain === "plateau" ? 0.8
            : 0.66;
  const habitat = clamp(
    (temperatureSuitability * 0.42
      + waterSuitability * 0.48
      + (1 - climate.aridityTendency) * 0.1)
    * terrainFactor,
    0.03,
    1,
  );
  const plant = round3(clamp(0.06 + habitat * 0.94, 0.06, 1));
  const herbivores = round2(Math.max(2, plant * 115 * (0.65 + waterSuitability * 0.35)));
  const predators = round2(Math.max(0.15, herbivores * 0.075 * habitat));
  return { plant, herbivores, predators, habitat: round3(habitat) };
}

function snapshot(raw: Readonly<Record<string, unknown>>): EcologySnapshot {
  return {
    plantBiomass: clamp(Number(raw.plantBiomass ?? 0), 0, 1.2),
    herbivorePopulation: Math.max(0, Number(raw.herbivorePopulation ?? 0)),
    predatorPopulation: Math.max(0, Number(raw.predatorPopulation ?? 0)),
    plantCarryingCapacity: clamp(Number(raw.plantCarryingCapacity ?? 0), 0, 1),
    herbivoreCarryingCapacity: Math.max(0, Number(raw.herbivoreCarryingCapacity ?? 0)),
    predatorCarryingCapacity: Math.max(0, Number(raw.predatorCarryingCapacity ?? 0)),
    habitatSuitability: clamp(Number(raw.habitatSuitability ?? 0), 0, 1),
    grazingPressure: clamp(Number(raw.grazingPressure ?? 0), 0, 2),
    predationPressure: clamp(Number(raw.predationPressure ?? 0), 0, 1),
    foodStress: clamp(Number(raw.foodStress ?? 0), 0, 1),
    updatedAt: Math.max(0, Number(raw.updatedAt ?? 0)),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
