/**
 * 远行模块：把地图包的地点变成真的能去。
 *
 * 这个模块只做三件事：
 *  1. 出发：从当前聚落出发，沿 edges 走到另一个地点
 *  2. 路上：按距离花时间，可能遇到事
 *  3. 到达与回来：到另一个地点，能看、能采、能见人；沿原路或另一条路回来
 *
 * 远行不是瞬移：路上要花天数，天数由距离和路况决定。
 */
import type {
  ConstraintOutcome, Effect, JsonValue, OpenLifeModule, WorldView,
} from "@openlife/contracts";
import {
  describeJourney, encounterFor, findRoute, journeyArrived, journeyDay,
  routeDays, routeExists,
  type Destination, type Journey, type Route,
} from "./routes.ts";

export const TRAVEL_OWNER = "travel";
export const TravelComponents = {
  journey: "travel.journey",
} as const;

export const TravelCommands = {
  depart: "travel.depart",
  arrive: "travel.arrive",
  return: "travel.return",
  day: "travel.day",
} as const;

export const TravelProjections = {
  journey: "travel.journey",
  destinations: "travel.destinations",
} as const;

export const TravelRejection = {
  NoJourney: "E_TRAVEL_NO_JOURNEY",
  AlreadyTravelling: "E_TRAVEL_ALREADY",
  NoRoute: "E_TRAVEL_NO_ROUTE",
  NotArrived: "E_TRAVEL_NOT_ARRIVED",
} as const;

export const TRAVEL_ENTITY = "travel:current";

function readJourney(world: WorldView): Journey | null {
  return world.getComponent(TRAVEL_ENTITY, TravelComponents.journey) as unknown as Journey | null;
}

function refuse(code: string, message: string) {
  return { ok: false as const, code, message };
}

function player(world: WorldView): string {
  return String(world.getComponent("modern:world", "modern.world_state")?.activeCharacterId ?? "");
}

export const travelModule: OpenLifeModule = {
  manifest: {
    id: TRAVEL_OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system",
    name: "远行",
    provides: ["world.travel"],
    requires: [],
    optional: ["map-pack.summary", "life.settlement"],
    incompatible: [],
    capabilities: [
      "component.register", "command.register", "rule.constraint.register",
      "rule.resolution.register", "projection.register",
    ],
  },

  register(ctx) {
    ctx.registerComponent({ id: TravelComponents.journey, persist: true, description: "the journey currently under way, if any" });
    for (const type of Object.values(TravelCommands)) ctx.registerCommand({ type, description: "Travel action." });

    const save = (world: WorldView, journey: Journey | null, why: string): Effect =>
      world.getEntity(TRAVEL_ENTITY)
        ? {
            kind: "setComponent", entityId: TRAVEL_ENTITY, component: TravelComponents.journey,
            value: journey as unknown as Record<string, never>, reason: why,
          }
        : {
            kind: "spawnEntity", localId: "journey", id: TRAVEL_ENTITY, entityKind: "travel.journey",
            components: { [TravelComponents.journey]: journey as unknown as Record<string, never> },
          };

    // ---- depart: leave the settlement for another place ---------------------
    ctx.registerConstraintRule({
      id: `${TravelCommands.depart}.allowed`, commandType: TravelCommands.depart,
      evaluate: (c): ConstraintOutcome => {
        const me = player(c.world);
        if (!me) return refuse(TravelRejection.NoJourney, "还没有人在这里生活。");
        if (readJourney(c.world)) return refuse(TravelRejection.AlreadyTravelling, "已经在路上了。");
        const to = String(c.command.payload.to ?? "");
        if (!to) return refuse(TravelRejection.NoRoute, "要说出去哪里。");
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${TravelCommands.depart}.resolve`, commandType: TravelCommands.depart,
      resolve: (c): Effect[] => {
        const me = player(c.world);
        const to = String(c.command.payload.to);
        const from = String(c.command.payload.from ?? "settlement");
        // A real map would give edges and distances; for now a route is one
        // step of road, so a journey always takes at least a day.
        const route: Route = {
          from, to, days: Number(c.command.payload.days ?? 1),
          terrain: "road", encounters: [],
        };
        const journey: Journey = {
          id: `journey:${me}:${to}:${c.world.tick}`,
          who: me, from, to,
          departedAt: c.world.tick, daysLeft: route.days, route,
          encounters: [],
        };
        return [
          save(c.world, journey, `departed for ${to}`),
          {
            kind: "emitEvent", eventType: "travel.departed", actorId: me,
            data: { to, days: route.days },
            historicalSignificance: 0.1,
          },
        ];
      },
    });

    // ---- day: one day on the road -------------------------------------------
    ctx.registerConstraintRule({
      id: `${TravelCommands.day}.allowed`, commandType: TravelCommands.day,
      evaluate: (c): ConstraintOutcome => {
        if (!readJourney(c.world)) return refuse(TravelRejection.NoJourney, "没有正在走的路。");
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${TravelCommands.day}.resolve`, commandType: TravelCommands.day,
      resolve: (c): Effect[] => {
        const journey = readJourney(c.world)!;
        const encounter = encounterFor(journey.route.terrain,
          (purpose, ...parts) => c.rng.keyed("travel", purpose, ...parts));
        const next = journeyDay(journey, encounter);
        const effects: Effect[] = [save(c.world, next, "a day on the road")];
        if (encounter) {
          effects.push({
            kind: "emitEvent", eventType: "travel.encounter", actorId: journey.who,
            data: { encounter, terrain: journey.route.terrain },
            historicalSignificance: 0.02,
          });
        }
        if (journeyArrived(next)) {
          effects.push({
            kind: "emitEvent", eventType: "travel.arrived", actorId: journey.who,
            data: { to: journey.to, days: journey.route.days, encounters: next.encounters.length },
            historicalSignificance: 0.1,
          });
        }
        return effects;
      },
    });

    // ---- arrive: settle in at the destination -------------------------------
    ctx.registerConstraintRule({
      id: `${TravelCommands.arrive}.allowed`, commandType: TravelCommands.arrive,
      evaluate: (c): ConstraintOutcome => {
        const journey = readJourney(c.world);
        if (!journey) return refuse(TravelRejection.NoJourney, "没有正在走的路。");
        if (!journeyArrived(journey)) return refuse(TravelRejection.NotArrived, "还没走到。");
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${TravelCommands.arrive}.resolve`, commandType: TravelCommands.arrive,
      resolve: (c): Effect[] => {
        const journey = readJourney(c.world)!;
        // Arriving somewhere is the same as walking there in the settlement:
        // reuse the settlement's own move logic so the place, its yields and
        // its people are all real, not a parallel copy.
        const effects: Effect[] = [
          save(c.world, null, "arrived and settled"),
          {
            kind: "emitEvent", eventType: "travel.settled", actorId: journey.who,
            data: { to: journey.to, encounters: journey.encounters },
            historicalSignificance: 0.1,
          },
        ];
        // If the destination is a real settlement place, walk there for real.
        if (String(journey.to).startsWith("place:")) {
          effects.push({
            kind: "emitEvent", eventType: "settlement-locations.arrived", actorId: journey.who,
            data: { placeId: journey.to, via: "travel" },
            historicalSignificance: 0.05,
          });
        }
        return effects;
      },
    });

    // ---- return: go back along the same or another route --------------------
    ctx.registerConstraintRule({
      id: `${TravelCommands.return}.allowed`, commandType: TravelCommands.return,
      evaluate: (c): ConstraintOutcome => {
        if (!readJourney(c.world)) return refuse(TravelRejection.NoJourney, "没有正在走的路。");
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${TravelCommands.return}.resolve`, commandType: TravelCommands.return,
      resolve: (c): Effect[] => {
        const journey = readJourney(c.world)!;
        const back: Journey = {
          ...journey,
          from: journey.to, to: journey.from,
          daysLeft: journey.route.days,
          encounters: [],
        };
        return [
          save(c.world, back, "turned back"),
          {
            kind: "emitEvent", eventType: "travel.turned_back", actorId: journey.who,
            data: { from: journey.to, to: journey.from },
            historicalSignificance: 0.05,
          },
        ];
      },
    });

    // ---- projections --------------------------------------------------------
    ctx.registerProjection({
      id: TravelProjections.journey,
      description: "The journey under way, in words.",
      build: ({ world }: { world: WorldView }): Record<string, JsonValue> => {
        const journey = readJourney(world);
        if (!journey) return { travelling: false, line: "没有正在走的路。" };
        return {
          travelling: true,
          to: journey.to,
          daysLeft: journey.daysLeft,
          arrived: journeyArrived(journey),
          line: describeJourney(journey),
        };
      },
    });

    ctx.registerProjection({
      id: TravelProjections.destinations,
      description: "Where you can go from here, read from the world's real geography.",
      build: ({ world }: { world: WorldView }): Record<string, JsonValue> => {
        const journey = readJourney(world);
        // The real map: locations registered by map packs, and the adjacency
        // between them. A destination is any location you can reach from here.
        const locations = world.listEntities({ kind: "world-geography.location" })
          .filter((e) => e.archivedAt === undefined);
        const adjacency = world.listRelations({ type: "world-geography.adjacent_to" });
        const here = String(world.getComponent("settlement-locations:settlement", "settlement-locations.settlement")?.placeId ?? "");
        const reachable = adjacency
          .filter((r) => r.from === here || r.to === here)
          .map((r) => (r.from === here ? r.to : r.from));
        const destinations = locations
          .filter((e) => reachable.includes(e.id))
          .map((e) => ({
            id: e.id,
            name: String(e.components["world-geography.location"]?.name ?? e.id),
            type: String(e.components["world-geography.location"]?.type ?? ""),
          }));
        return {
          travelling: Boolean(journey),
          destinations: destinations as unknown as JsonValue,
          line: journey ? "正在路上。" : destinations.length ? `可以说走就走，去${destinations[0]?.name ?? "别处"}。` : "附近没有可去的地方。",
        };
      },
    });
  },
};

export { describeJourney, encounterFor, findRoute, journeyArrived, journeyDay,
  routeDays, routeExists };
export type { Destination, Journey, Route };
