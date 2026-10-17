/**
 * River-terrace nature: plugs world-hazard and fauna-bonds into the playable
 * settlement without touching settlement-locations.
 *
 * The Web world does not install geography/climate/hydrology/species yet; the
 * settlement already uses a local deterministic sky (weather.ts). This content
 * pack follows the same stand-in pattern (§30 capability dependency):
 *
 *  - provides `world.hydrology-state` for the river-side places, DERIVED from
 *    the settlement sky of the last days (no stored second truth);
 *  - provides `world.species` with the two animals the village knows: the
 *    village dog (domesticable) and the wolf of the reed flat (not);
 *  - adds one constraint to settlement travel: while the river is in flood,
 *    the river bank, ford and reed flat cannot be reached.
 *
 * When the settlement later sits inside real world-* modules, drop this pack
 * and the same hazard / fauna modules read the real capabilities instead.
 */

import type { OpenLifeModule, WorldView } from "@openlife/contracts";
import { isWet } from "@openlife/module-settlement-locations";
import type { HydrologyApi, HydrologySnapshot } from "@openlife/module-world-hydrology";
import type { SpeciesApi, SpeciesDefinition, SpeciesPopulationSnapshot } from "@openlife/module-world-species";
import { HazardComponents, type HazardState } from "@openlife/module-world-hazard";

const OWNER = "settlement-nature";

/** The place whose water level stands for the whole river terrace. */
export const RIVER_PLACE = "place:river";
/** Places cut off while the river is in flood. */
export const FLOODED_PLACES = new Set(["place:river", "place:ford", "place:reedbed", "place:claypits"]);

export const NatureSpecies = {
  dog: "settlement-nature.dog",
  wolf: "settlement-nature.wolf",
} as const;

const life = { maturityYears: 1, lifespanYears: 12, reproductiveOutput: 0.5, offspringInvestment: 0.5, baselineAnnualMortality: 0.1 };
const DEFINITIONS: SpeciesDefinition[] = [
  { id: NatureSpecies.dog, name: "狗", trophicRole: "predator", diet: ["scraps", "meat"], temperatureOptimumC: 15, temperatureToleranceC: 25, waterOptimum: 0.5, waterTolerance: 0.5, lifeHistory: life, tags: ["domesticable", "companion"] },
  { id: NatureSpecies.wolf, name: "狼", trophicRole: "predator", diet: ["meat"], temperatureOptimumC: 10, temperatureToleranceC: 25, waterOptimum: 0.5, waterTolerance: 0.5, lifeHistory: { ...life, lifespanYears: 10 } },
];
/** Where each kind of animal lives on the terrace, and roughly how many. */
const HABITAT: Record<string, Array<{ speciesId: string; population: number }>> = {
  "place:yard": [{ speciesId: NatureSpecies.dog, population: 3 }],
  "place:hearth-yard": [{ speciesId: NatureSpecies.dog, population: 2 }],
  "place:reedbed": [{ speciesId: NatureSpecies.wolf, population: 2 }],
};

/** Days of sky memory the river keeps. */
const MEMORY_DAYS = 14;

/**
 * Soil and river water read from recent sky. A wet spell of three or four
 * days raises surface water quickly; two dry weeks dry the soil out.
 */
export function riverWater(day: number): HydrologySnapshot {
  let surface = 0;
  let wetDays = 0;
  for (let k = 0; k < MEMORY_DAYS; k += 1) {
    const d = day - k;
    if (d < 0) break;
    if (!isWet(d)) continue;
    wetDays += 1;
    if (k < 7) surface += 13 * Math.pow(0.78, k);
  }
  const soil = Math.min(1, 0.1 + wetDays * 0.075);
  return {
    soilMoisture: round2(soil),
    surfaceWaterMm: round2(surface),
    waterAvailability: round2(Math.min(1, soil + surface / 60)),
    lastInfiltrationMm: 0,
    lastRunoffMm: 0,
    lastEvaporationMm: 0,
    infiltrationCapacity: 0.5,
    retentionCapacity: 0.5,
    runoffTendency: 0.5,
    updatedAt: day,
  };
}

export function floodActive(world: WorldView): boolean {
  const state = world.getComponent(RIVER_PLACE, HazardComponents.state) as unknown as HazardState | undefined;
  return state?.flood.stage === "active";
}

export const settlementNatureModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "content-pack",
    name: "River Terrace Nature",
    description: "Stand-in hydrology and animals for the river-terrace settlement; floods close the river-side paths.",
    requires: ["life.settlement"],
    provides: ["world.hydrology-state", "world.species"],
    capabilities: ["rule.constraint.register"],
  },

  register(ctx) {
    const hydrology: HydrologyApi = {
      state(world, locationId) {
        return world.getEntity(locationId) && FLOODED_PLACES.has(locationId) ? riverWater(world.tick) : undefined;
      },
    };
    ctx.provideCapability("world.hydrology-state", hydrology);

    const species: SpeciesApi = {
      registerDefinition: () => { throw new Error("settlement-nature species are fixed by the content pack"); },
      getDefinition: (id) => DEFINITIONS.find((d) => d.id === id),
      listDefinitions: () => DEFINITIONS,
      populations: (_world, locationId) => (HABITAT[locationId] ?? []).map((h): SpeciesPopulationSnapshot => ({
        speciesId: h.speciesId,
        population: h.population,
        habitatFitness: 1,
        foodAvailability: 1,
        trophicRole: DEFINITIONS.find((d) => d.id === h.speciesId)!.trophicRole,
        traitOffsets: { temperatureOptimumDeltaC: 0, waterOptimumDelta: 0, reproductiveOutputDelta: 0 },
        lineage: { selectionGenerations: 0, isolationGenerations: 0, recentGeneFlow: 0 },
      })),
    };
    ctx.provideCapability("world.species", species);

    ctx.registerConstraintRule({
      id: "settlement-nature.flood_closes_river",
      commandType: "settlement-locations.arrive",
      evaluate: (c) => {
        const placeId = String(c.command.payload.placeId ?? "");
        if (FLOODED_PLACES.has(placeId) && floodActive(c.world)) {
          return { ok: false, code: "E_NATURE_FLOODED", message: "河水暴涨漫过了河滩，这几天去不了河边、渡口、芦苇滩和黏土坑。" };
        }
        return { ok: true };
      },
    });
  },
};

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
