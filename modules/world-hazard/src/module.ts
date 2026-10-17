/**
 * World hazards (flood / drought) derived from existing world state.
 *
 * Hazards are never rolled out of thin air: pressure is read from the
 * hydrology layer (surface water, soil moisture, water availability). Each
 * hazard walks a small, explainable lifecycle:
 *
 *   calm -> omen -> active -> aftermath -> calm
 *
 * Omens are observable signs (who can read them is an epistemic question for
 * later layers); striking writes a public fact so the disaster survives as
 * history (§INV-006, §32). Earthworks (levees, dykes) are first-class legacy
 * entities that lower flood pressure for every later generation (§33).
 */

import type { Effect, JsonValue, OpenLifeModule, WorldView } from "@openlife/contracts";
import type { HydrologyApi, HydrologySnapshot } from "@openlife/module-world-hydrology";

const OWNER = "world-hazard";
const CAPABILITY = "world.hazard-state";

export const HazardComponents = {
  state: "world-hazard.state",
  earthwork: "world-hazard.earthwork",
} as const;

export const HazardKinds = {
  earthwork: "world-hazard.earthwork",
} as const;

export const HazardRelations = {
  protects: "world-hazard.protects",
} as const;

export type HazardType = "flood" | "drought";
export type HazardStage = "calm" | "omen" | "active" | "aftermath";

export interface HazardTrack {
  stage: HazardStage;
  pressure: number;
  severity: number;
  startedAt: number | null;
  aftermathLeft: number;
  /** Tick of the most recent strike; kept after the hazard calms, so seasonal stories can ask "did it flood this season?". */
  lastStrikeAt?: number | null;
  /** Human-readable causes of the current pressure (§16 explainability). */
  causes: string[];
}

export interface HazardState {
  flood: HazardTrack;
  drought: HazardTrack;
  updatedAt: number;
}

export interface HazardApi {
  state(world: WorldView, locationId: string): HazardState | undefined;
  floodProtection(world: WorldView, locationId: string): number;
}

/** Tunable thresholds; exported so content packs and tests share one truth. */
export const HazardThresholds = {
  omen: 0.5,
  strike: 0.75,
  calmBelow: 0.4,
  subsideBelow: 0.5,
  aftermathAssessments: 2,
  earthworkProtection: 0.2,
  maxProtection: 0.6,
  maxEarthworksPerLocation: 3,
} as const;

const SIGNS: Record<HazardType, string[]> = {
  flood: ["river_rising", "water_turbid", "days_of_rain"],
  drought: ["soil_cracking", "springs_failing", "crops_wilting"],
};

export const worldHazardModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "World Hazard Prototype",
    description: "Flood and drought lifecycles derived from hydrology, with omens, aftermath and protective earthworks.",
    requires: ["world.hydrology-state"],
    provides: [CAPABILITY],
    capabilities: [
      "component.register",
      "relation.register",
      "command.register",
      "rule.constraint.register",
      "rule.resolution.register",
      "projection.register",
      "schedule.register",
    ],
  },

  register(ctx) {
    const hydrology = ctx.registry.capabilityImplementation("world.hydrology-state") as HydrologyApi | undefined;
    if (!hydrology) throw new Error("world hazard requires world.hydrology-state");

    const api: HazardApi = {
      state(world, locationId) {
        const raw = world.getComponent(locationId, HazardComponents.state);
        return raw ? (raw as unknown as HazardState) : undefined;
      },
      floodProtection(world, locationId) {
        return protectionAt(world, locationId);
      },
    };
    ctx.provideCapability(CAPABILITY, api);

    ctx.registerComponent({ id: HazardComponents.state, persist: true, description: "Flood/drought lifecycle at one Location." });
    ctx.registerComponent({ id: HazardComponents.earthwork, persist: true, description: "A built levee/dyke; outlives its builders." });
    ctx.registerRelation({ id: HazardRelations.protects, persist: true, allowedFrom: [HazardKinds.earthwork] });

    ctx.registerCommand({
      type: "world-hazard.assess_location",
      description: "Read hydrology at a Location and advance its flood/drought lifecycle by one assessment.",
    });
    ctx.registerCommand({
      type: "world-hazard.build_earthwork",
      description: "Build a levee/dyke that lowers flood pressure at a Location.",
      params: { name: "display name of the earthwork" },
    });

    ctx.registerCommand({
      type: "world-hazard.watch_location",
      description: "Assess a place on a repeating schedule so hazards unfold as time passes.",
      params: { everyTicks: "ticks between assessments (default 1)" },
    });
    ctx.registerTask({
      type: "world-hazard.assess",
      description: "Scheduled hazard assessment for one place.",
      handler: (t) => {
        const locationId = String(t.payload.locationId ?? "");
        if (!locationId || !isLocation(t.world, locationId) || !hydrology.state(t.world, locationId)) return undefined;
        return { command: { type: "world-hazard.assess_location", targetId: locationId, payload: {}, source: "system" } };
      },
    });
    ctx.registerConstraintRule({
      id: "world-hazard.watch_location.allowed",
      commandType: "world-hazard.watch_location",
      evaluate: (c) => {
        const locationId = c.command.targetId;
        if (!locationId || !isLocation(c.world, locationId)) return { ok: false, code: "E_HAZARD_LOCATION", message: "target must be an existing place" };
        const every = Number(c.command.payload.everyTicks ?? 1);
        if (!Number.isInteger(every) || every < 1) return { ok: false, code: "E_HAZARD_INTERVAL", message: "everyTicks must be a positive integer" };
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: "world-hazard.watch_location.resolve",
      commandType: "world-hazard.watch_location",
      resolve: (c) => {
        const locationId = c.command.targetId as string;
        const every = Number(c.command.payload.everyTicks ?? 1);
        return [{
          kind: "scheduleTask",
          taskType: "world-hazard.assess",
          afterTicks: every,
          everyTicks: every,
          payload: { locationId },
          dedupeKey: `world-hazard.watch:${locationId}`,
        }];
      },
    });

    ctx.registerConstraintRule({
      id: "world-hazard.assess_location.allowed",
      commandType: "world-hazard.assess_location",
      evaluate: (c) => {
        const locationId = c.command.targetId;
        if (!locationId || !isLocation(c.world, locationId)) {
          return { ok: false, code: "E_HAZARD_LOCATION", message: "target must be an existing place" };
        }
        if (!hydrology.state(c.world, locationId)) {
          return { ok: false, code: "E_HAZARD_HYDROLOGY", message: "location needs hydrology state before hazards can be assessed" };
        }
        return { ok: true };
      },
    });

    ctx.registerResolutionRule({
      id: "world-hazard.assess_location.resolve",
      commandType: "world-hazard.assess_location",
      resolve: (c) => {
        const locationId = c.command.targetId as string;
        const water = hydrology.state(c.world, locationId) as HydrologySnapshot;
        const previous = api.state(c.world, locationId) ?? emptyState(c.world.tick);
        const protection = protectionAt(c.world, locationId);
        const effects: Effect[] = [];

        const flood = floodPressure(water, protection);
        const drought = droughtPressure(water);
        const next: HazardState = {
          flood: step("flood", previous.flood, flood.pressure, flood.causes, c, locationId, effects),
          drought: step("drought", previous.drought, drought.pressure, drought.causes, c, locationId, effects),
          updatedAt: c.world.tick,
        };

        effects.unshift({
          kind: c.world.getComponent(locationId, HazardComponents.state) ? "modifyComponent" : "setComponent",
          entityId: locationId,
          component: HazardComponents.state,
          ...(c.world.getComponent(locationId, HazardComponents.state)
            ? { patch: next as unknown as Record<string, JsonValue> }
            : { value: next as unknown as Record<string, JsonValue> }),
          reason: "hazard pressure derived from hydrology and earthworks",
        } as Effect);
        return effects;
      },
    });

    ctx.registerConstraintRule({
      id: "world-hazard.build_earthwork.allowed",
      commandType: "world-hazard.build_earthwork",
      evaluate: (c) => {
        const locationId = c.command.targetId;
        if (!locationId || !isLocation(c.world, locationId)) {
          return { ok: false, code: "E_HAZARD_LOCATION", message: "target must be an existing place" };
        }
        const count = c.world.listRelations({ type: HazardRelations.protects, to: locationId }).length;
        if (count >= HazardThresholds.maxEarthworksPerLocation) {
          return { ok: false, code: "E_HAZARD_EARTHWORK_LIMIT", message: "this location already has as many earthworks as it can use" };
        }
        return { ok: true };
      },
    });

    ctx.registerResolutionRule({
      id: "world-hazard.build_earthwork.resolve",
      commandType: "world-hazard.build_earthwork",
      resolve: (c): Effect[] => {
        const locationId = c.command.targetId as string;
        const name = String(c.command.payload.name ?? "earthwork");
        const builtBy = c.command.actorId ?? null;
        return [
          {
            kind: "spawnEntity",
            localId: "earthwork",
            entityKind: HazardKinds.earthwork,
            components: {
              [HazardComponents.earthwork]: {
                name,
                locationId,
                builtBy,
                builtAt: c.world.tick,
                protection: HazardThresholds.earthworkProtection,
              },
            },
          },
          { kind: "addRelation", type: HazardRelations.protects, from: "@earthwork", to: locationId },
          {
            kind: "addFact",
            factType: "world-hazard.earthwork_built",
            subject: locationId,
            ...(builtBy ? { object: builtBy } : {}),
            data: { name, builtAt: c.world.tick },
            historicalSignificance: 0.6,
            visibility: "public",
          },
          {
            kind: "emitEvent",
            eventType: "world-hazard.earthwork_built",
            ...(builtBy ? { actorId: builtBy } : {}),
            targetId: locationId,
            data: { name },
            historicalSignificance: 0.6,
            visibility: "public",
          },
        ];
      },
    });

    ctx.registerProjection({
      id: "world-hazard.location-state",
      description: "Hazard lifecycle, causes and protection at one Location.",
      build: ({ world, params }) => {
        const locationId = String(params.locationId ?? "");
        if (!isLocation(world, locationId)) return { exists: false, locationId };
        return {
          exists: true,
          locationId,
          state: api.state(world, locationId) ?? null,
          floodProtection: protectionAt(world, locationId),
          earthworks: world.listRelations({ type: HazardRelations.protects, to: locationId }).map((r) => r.from),
        };
      },
    });
  },
};

function step(
  type: HazardType,
  prev: HazardTrack,
  pressure: number,
  causes: string[],
  c: { world: WorldView; rng: { nextFloat(): number }; note(m: string, d?: Record<string, unknown>): void },
  locationId: string,
  effects: Effect[],
): HazardTrack {
  const t = HazardThresholds;
  const track: HazardTrack = { ...prev, pressure: round3(pressure), causes };
  const tick = c.world.tick;
  const emit = (eventType: string, significance: number, data: Record<string, JsonValue>) =>
    effects.push({
      kind: "emitEvent",
      eventType,
      targetId: locationId,
      data: { hazard: type, pressure: track.pressure, causes, ...data },
      historicalSignificance: significance,
      visibility: "public",
      dedupeKey: `${eventType}:${type}:${locationId}:${tick}`,
    });

  switch (prev.stage) {
    case "calm":
      if (pressure >= t.strike) return strike();
      if (pressure >= t.omen) {
        track.stage = "omen";
        emit("world-hazard.omen_observed", 0.02, { signs: SIGNS[type] });
      }
      return track;
    case "omen":
      if (pressure >= t.strike) return strike();
      if (pressure < t.calmBelow) track.stage = "calm";
      return track;
    case "active":
      track.severity = round3(Math.max(prev.severity, pressure));
      if (pressure < t.subsideBelow) {
        track.stage = "aftermath";
        track.aftermathLeft = t.aftermathAssessments;
        emit("world-hazard.subsided", 0.1, { severity: track.severity, startedAt: prev.startedAt ?? tick });
      }
      return track;
    case "aftermath":
      if (pressure >= t.strike) return strike();
      track.aftermathLeft = Math.max(0, prev.aftermathLeft - 1);
      if (track.aftermathLeft === 0) {
        track.stage = "calm";
        track.severity = 0;
        track.startedAt = null;
      }
      return track;
  }

  function strike(): HazardTrack {
    const severity = round3(Math.min(1, pressure + c.rng.nextFloat() * 0.1));
    track.stage = "active";
    track.severity = severity;
    track.startedAt = tick;
    track.lastStrikeAt = tick;
    track.aftermathLeft = 0;
    const significance = round3(0.3 + severity * 0.4);
    c.note(`${type} struck`, { pressure, severity, causes });
    emit("world-hazard.struck", significance, { severity });
    effects.push({
      kind: "addFact",
      factType: `world-hazard.${type}`,
      subject: locationId,
      data: { severity, struckAt: tick, causes },
      historicalSignificance: significance,
      visibility: "public",
    });
    return track;
  }
}

export function floodPressure(water: HydrologySnapshot, protection = 0): { pressure: number; causes: string[] } {
  const surface = clamp01(water.surfaceWaterMm / 40);
  const saturation = clamp01((water.soilMoisture - 0.6) / 0.4);
  const raw = surface * 0.65 + saturation * 0.35;
  const causes: string[] = [];
  if (surface > 0.5) causes.push("surface_water_high");
  if (saturation > 0.5) causes.push("soil_saturated");
  if (protection > 0) causes.push("earthworks_reduce_pressure");
  return { pressure: clamp01(raw - protection), causes };
}

export function droughtPressure(water: HydrologySnapshot): { pressure: number; causes: string[] } {
  const dryness = clamp01((0.35 - water.soilMoisture) / 0.3);
  const scarcity = clamp01(1 - water.waterAvailability);
  const raw = dryness * 0.7 + scarcity * 0.3;
  const causes: string[] = [];
  if (dryness > 0.5) causes.push("soil_dry");
  if (scarcity > 0.6) causes.push("water_scarce");
  return { pressure: water.surfaceWaterMm > 5 ? clamp01(raw - 0.3) : clamp01(raw), causes };
}

function protectionAt(world: WorldView, locationId: string): number {
  let total = 0;
  for (const rel of world.listRelations({ type: HazardRelations.protects, to: locationId })) {
    const work = world.getComponent(rel.from, HazardComponents.earthwork);
    total += Number(work?.protection ?? 0);
  }
  return Math.min(HazardThresholds.maxProtection, round3(total));
}

function emptyTrack(): HazardTrack {
  return { stage: "calm", pressure: 0, severity: 0, startedAt: null, aftermathLeft: 0, causes: [] };
}

function emptyState(tick: number): HazardState {
  return { flood: emptyTrack(), drought: emptyTrack(), updatedAt: tick };
}

/**
 * Any live place-like entity can carry hazards: a geography Location, or a
 * settlement place, as long as some module provides its hydrology (§30).
 */
function isLocation(world: WorldView, id: string): boolean {
  const entity = world.getEntity(id);
  return Boolean(entity && entity.archivedAt === undefined);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
