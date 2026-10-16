/**
 * Settlement Locations - the first inhabited content layer (MAP-001).
 *
 * Geography answers "where on the map". World Space answers "which building,
 * which room". This module answers the question a player actually asks:
 *
 *   "I am standing here. Who else is here, what can I pick up, and what can I
 *    do that will change something?"
 *
 * It authors one living settlement on a real geography Location, and it owns
 * only that content. Every action it adds is an ordinary Command, so a
 * settlement built here is save/load-able, replayable and auditable for free.
 *
 * M1 scope (OPEN_WORLD_REQUIREMENTS.md 搂11):
 *   - 1 habitable settlement, 6 connected outdoor work places,
 *   - at least 8 enterable life spaces,
 *   - 12-16 residents with a household and a routine,
 *   - 30+ operable object prototypes, 80+ placed instances,
 *   - a first real loop: walk in, take a container, fill it, put it back.
 */

import type { ComponentData, Effect, JsonValue, OpenLifeModule, WorldView } from "@openlife/contracts";
import { DAYS_PER_MONTH, DAY_TICKS_PER_YEAR } from "@openlife/life-contracts";
import {
  ObjectCommands,
  ObjectComponents,
  ObjectKinds,
  ObjectRelations,
  contentsOf,
  containerOf,
  holderOf,
  ownerOf,
  prototypeOf,
  readObject,
  wornByActor,
  canCarryPrototype,
  canCarryObject,
  portableLoad,
} from "@openlife/module-world-objects";
import {
  SpaceCommands,
  SpaceComponents,
  SpaceKinds,
  SpaceRelations,
  moveEffects,
  occupiedPlaceId,
  occupiedSpaceId,
  readPlace,
  readSpace,
} from "@openlife/module-world-space";
import { VILLAGE_DAY_AGENT, runVillageAgent } from "./autonomy/village-day.ts";
import { refuse, type Registration } from "./rules.ts";
import { registerNpcBarter, registerPlayerBarter, tradeReady } from "./barter.ts";
import { RIVER_TERRACE_PACK, type ResidentSpec, type PlaceSpec, type YieldSpec, type PrototypeSpec } from "./content.ts";

const OWNER = "settlement-locations";
const WORLD = "modern:world";
const STATE = "modern.world_state";

export const SettlementComponents = {
  /** Marks the settlement entity and carries its authored identity. */
  settlement: "settlement-locations.settlement",
  /** Per-resident daily life: household, work place, hunger, standing routine. */
  resident: "settlement-locations.resident",
  /** A resource a place holds and renews, with its own authoritative stock. */
  yieldPoint: "settlement-locations.yield",
  /** Per-holding state for one player: what they have drawn, carried and eaten. */
  holding: "settlement-locations.holding",
  /** Crop state on the existing field place; absent for old saves means fallow. */
  cropPlot: "settlement-locations.crop-plot",
  dailyPlan: "settlement-locations.daily-plan",
} as const;

export const SettlementCommands = {
  found: "settlement-locations.found",
  arrive: "settlement-locations.arrive",
  draw: "settlement-locations.draw",
  talk: "settlement-locations.talk",
  drink: "settlement-locations.drink",
  eat: "settlement-locations.eat",
  cook: "settlement-locations.cook",
  weaveBag: "settlement-locations.weave_bag",
  weaveMat: "settlement-locations.weave_mat",
  prepareFiber: "settlement-locations.prepare_fiber",
  weaveWrap: "settlement-locations.weave_wrap",
  harvest: "settlement-locations.harvest",
  sow: "settlement-locations.sow",
  tend: "settlement-locations.tend",
  rest: "settlement-locations.rest",
  step: "settlement-locations.end_day",
  configurePlan: "settlement-locations.plan.configure",
  npcMarkDay: "settlement-locations.npc.mark_day",
  npcOffer: "settlement-locations.npc.barter_offer",
  npcAccept: "settlement-locations.npc.barter_accept",
  playerBarterRequest: "settlement-locations.barter.request",
  cookBarterQuote: "settlement-locations.barter.cook_quote",
  playerBarterAccept: "settlement-locations.barter.accept",
  playerBarterDecline: "settlement-locations.barter.decline",
  helpHearth: "settlement-locations.hearth.help",
  npcAskHelp: "settlement-locations.npc.ask_help",
  npcAnswerHelp: "settlement-locations.npc.answer_help",
  npcFire: "settlement-locations.npc.fire",
} as const;

export const SettlementProjections = {
  homestead: "settlement-locations.homestead",
  people: "settlement-locations.people",
  worksites: "settlement-locations.worksites",
} as const;

export const SettlementRejection = {
  NotEntered: "E_SETTLEMENT_NOT_ENTERED",
  NoSuchResident: "E_SETTLEMENT_NO_RESIDENT",
  NoSuchPlace: "E_SETTLEMENT_NO_PLACE",
  WrongPlace: "E_SETTLEMENT_WRONG_PLACE",
  Empty: "E_SETTLEMENT_EMPTY",
  NotYours: "E_SETTLEMENT_NOT_YOURS",
  Already: "E_SETTLEMENT_ALREADY",
  NoRoom: "E_SETTLEMENT_NO_ROOM",
  Exhausted: "E_SETTLEMENT_EXHAUSTED",
  Busy: "E_SETTLEMENT_BUSY",
} as const;

/** The authored settlement: one terrace village beside the central river. */
export const SettlementId = "settlement-locations:settlement:river-terrace";


/**
 * Fourteen residents across six households.
 *
 * Every one answers "why is he here today": they have a home space, a work
 * place and a standing routine. Their names are plain reconstructions, which is
 * the honest label for a 2070 BCE village (see the content policy in
 * `OPEN_WORLD_REQUIREMENTS.md` 搂3).
 */
const RESIDENTS: ResidentSpec[] = RIVER_TERRACE_PACK.residents;

/** Places of the settlement, each with a purpose and a cost to reach. */
// Open outdoor arrival spots allow villagers and visitors to pass; 0 is the
// shared world-space convention for unbounded open areas. Indoor rooms remain
// capacity-limited. The main household accommodates its two adults + guests.
const PLACES: PlaceSpec[] = RIVER_TERRACE_PACK.places;

/** Renewing resources. Each has one authoritative owner: this module. */
const YIELDS: YieldSpec[] = RIVER_TERRACE_PACK.yields;

/**
 * Object prototypes. Capabilities decide what can be done with a thing, so a
 * new vessel never needs a new button (OBJ-001).
 */
const PROTOTYPES: PrototypeSpec[] = RIVER_TERRACE_PACK.prototypes;

const RESOURCE_LABELS: Record<string, string> = RIVER_TERRACE_PACK.resourceLabels;
/** Named routine holders, sent to clients so they never hardcode a villager. */
const ROLE_VIEW = Object.fromEntries(Object.entries(RIVER_TERRACE_PACK.autonomy).map(([role, key]) => {
  const resident = RIVER_TERRACE_PACK.residents.find((r) => r.key === key)!;
  return [role, { id: `settlement-locations:resident:${key}`, name: resident.name, workPlace: resident.workPlace }];
})) as Record<"farmer" | "cook" | "fuelGatherer", { id: string; name: string; workPlace: string }>;

export const settlementLocationsModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "content-pack",
    name: "Settlement Locations",
    description: "The first inhabited settlement: places, spaces, renewing resources, residents and the first daily loop.",
    requires: ["world.space", "world.objects", "time.life-scale"],
    optional: ["world.geography"],
    provides: ["life.settlement"],
    capabilities: [
      "component.register",
      "relation.register",
      "command.register",
      "rule.constraint.register",
      "rule.resolution.register",
      "projection.register",
    ],
  },

  register(ctx) {
    ctx.registerAgent({
      id: VILLAGE_DAY_AGENT,
      description: "村民每天按真实需求与物资自主生活（只通过经过校验的命令行动）",
      run: runVillageAgent,
    });
    for (const id of Object.values(SettlementComponents)) {
      ctx.registerComponent({ id, persist: true, description: `settlement-locations component ${id}` });
    }

    for (const type of Object.values(SettlementCommands)) {
      ctx.registerCommand({ type, description: "Settlement life action." });
    }

    registerFound(ctx);
    registerArrive(ctx);
    registerTalk(ctx);
    registerDraw(ctx);
    registerDrink(ctx);
    registerEat(ctx);
    registerCook(ctx);
    registerWeaveBag(ctx);
    registerWeaveMat(ctx);
    registerPrepareFiber(ctx);
    registerWeaveWrap(ctx);
    registerSow(ctx);
    registerHarvest(ctx);
    registerTend(ctx);
    registerRest(ctx);
    registerEndDay(ctx);
    registerActivityBudget(ctx);
    registerDailyPlan(ctx);
    registerPotteryPlanStart(ctx);
    registerNpcDayMarker(ctx);
    registerNpcBarter(ctx);
    registerPlayerBarter(ctx);
    registerHearthRelief(ctx);
    registerNpcHelp(ctx);
    registerNpcFire(ctx);

    ctx.registerProjection({
      id: SettlementProjections.homestead,
      description: "The settlement as one player sees it: where they are, who is here and what can be done now.",
      build: ({ world, params }) => homestead(world, String(params.actorId ?? "")),
    });
    ctx.registerProjection({
      id: SettlementProjections.people,
      description: "Every resident with their household, work place, standing routine and current whereabouts.",
      build: ({ world }) => people(world),
    });
    ctx.registerProjection({
      id: SettlementProjections.worksites,
      description: "Every place and its renewing resources, with the authoritative remaining stock.",
      build: ({ world }) => worksites(world),
    });
  },
};


// ---------------------------------------------------------------------------
// Founding
// ---------------------------------------------------------------------------

function registerFound(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.found}.allowed`,
    commandType: SettlementCommands.found,
    evaluate: (c) => {
      if (c.world.getEntity(SettlementId)) {
        return refuse(SettlementRejection.Already, "这个聚落已经存在了。");
      }
      const locationId = String(c.command.payload.locationId ?? "");
      const knownLocations = c.world.listEntities({ kind: "world-geography.location" });
      if (locationId && !knownLocations.some((entity) => entity.id === locationId)) {
        return refuse(SettlementRejection.NoSuchPlace, `找不到地理地点 ${locationId}。`);
      }
      // A world with a map must pin the settlement to a real Location; a world
      // without geography may still hold one, so the pack is testable alone.
      if (!locationId && knownLocations.length > 0) {
        return refuse(
          SettlementRejection.NoSuchPlace,
          "这个世界已经有地理地点，聚落必须落在一个真实地点上。",
        );
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: `${SettlementCommands.found}.resolve`,
    commandType: SettlementCommands.found,
    resolve: (c) => {
      const locationId = String(c.command.payload.locationId ?? "");
      const effects: Effect[] = [{
        kind: "spawnEntity",
        localId: "settlement",
        id: SettlementId,
        entityKind: "settlement-locations.settlement",
        components: {
          [SettlementComponents.settlement]: {
            name: String(c.command.payload.name ?? "河岸台地聚落"),
            locationId,
            foundedAt: c.world.tick,
          } as unknown as Record<string, never>,
        },
        announce: false,
      }];

      // Places and their spaces.
      for (const place of PLACES) {
        effects.push({
          kind: "spawnEntity",
          localId: place.id,
          id: place.id,
          entityKind: SpaceKinds.place,
          components: {
            [SpaceComponents.place]: {
              name: place.name, placeType: place.type, locationId,
              costDays: place.costDays, private: false, createdAt: c.world.tick,
            } as unknown as Record<string, never>,
          },
          announce: false,
        });
        for (const space of place.spaces) {
          effects.push({
            kind: "spawnEntity",
            localId: space.id,
            id: space.id,
            entityKind: SpaceKinds.space,
            components: {
              [SpaceComponents.space]: {
                name: space.name, spaceType: space.type,
                capacity: space.capacity, visibleFromOutside: space.visible === true,
                createdAt: c.world.tick,
              } as unknown as Record<string, never>,
            },
            announce: false,
          }, {
            kind: "addRelation",
            type: SpaceRelations.inside,
            from: space.id,
            to: place.id,
            announce: false,
          });
        }
      }

      // Renewing resources, each owned by exactly one place.
      for (const [index, yieldSpec] of YIELDS.entries()) {
        effects.push({
          kind: "spawnEntity",
          localId: `yield:${index}`,
          id: `yield:${yieldSpec.placeId}:${yieldSpec.resourceId}`,
          entityKind: "settlement-locations.yield-point",
          components: {
            [SettlementComponents.yieldPoint]: {
              placeId: yieldSpec.placeId, resourceId: yieldSpec.resourceId,
              label: yieldSpec.label, unit: yieldSpec.unit,
              capacity: yieldSpec.capacity, stock: yieldSpec.capacity,
              renewDays: yieldSpec.renewDays, lastRenewedAt: c.world.tick,
            } as unknown as Record<string, never>,
          },
          announce: false,
        });
      }

      // Prototypes.
      for (const prototype of PROTOTYPES) {
        effects.push({
          kind: "spawnEntity",
          localId: prototype.id,
          id: prototype.id,
          entityKind: ObjectKinds.prototype,
          components: {
            [ObjectComponents.prototype]: {
              name: prototype.name, material: prototype.material,
              resourceId: prototype.resourceId, unit: prototype.unit,
              mass: prototype.mass, capacity: prototype.capacity,
              capabilities: prototype.capabilities, durability: prototype.durability,
              visibleFromOutside: prototype.visible === true,
            } as unknown as Record<string, never>,
          },
          announce: false,
        });
      }

      // Residents: identity, vitals, residence and a settlement life record.
      for (const resident of RESIDENTS) {
        const id = residentId(resident.key);
        effects.push({
          kind: "spawnEntity",
          localId: `resident:${resident.key}`,
          id,
          entityKind: "modern.character",
          components: {
            "modern.identity": {
              givenName: resident.name, familyName: "",
              sex: "other", generation: 0, lineageId: `npc:${resident.household}`,
              bornAt: Math.max(0, c.world.tick - resident.age * DAY_TICKS_PER_YEAR),
            },
            "modern.vitals": { alive: true, health: 1, ageYears: resident.age, lifespan: 78 },
            "modern.residence": { cityId: "modern:city:north" },
            "modern.wealth": { cash: 0, debt: 0 },
            [SettlementComponents.resident]: {
              household: resident.household, role: resident.role,
              trait: resident.trait, wish: resident.wish,
              workPlace: resident.workPlace, homeSpace: resident.homeSpace,
              hunger: 0, rested: 1, standingRoutine: "",
            } as unknown as Record<string, never>,
          },
          announce: false,
        });
        // Everyone starts the day at work; overnight resting moves them home.
        effects.push({
          kind: "addRelation",
          type: SpaceRelations.occupancy,
          from: id,
          to: resident.workPlace,
          components: { [SpaceComponents.occupancy]: { placeId: resident.workPlace, spaceId: "", since: c.world.tick } },
          announce: false,
        });
      }

      // Placed objects. Every one has a location and an owner, so the world can
      // always answer "where is this and whose is it" (MAP-001 density target).
      for (const instance of INSTANCES) {
        effects.push({
          kind: "spawnEntity",
          localId: instance.id,
          id: instance.id,
          entityKind: ObjectKinds.item,
          components: {
            [ObjectComponents.object]: {
              prototypeId: instance.prototypeId,
              name: "",
              condition: "used",
              quantity: Math.max(0, instance.quantity ?? 0),
              durability: 50,
              madeAt: c.world.tick,
              provenance: { authored: true },
              ...(instance.id === "instance:jar:0:0" ? { loanPolicy: "public-visitor" } : {}),
              visibleFromOutside: true,
            } as unknown as Record<string, never>,
          },
          announce: false,
        }, {
          kind: "addRelation",
          type: ObjectRelations.instanceOf,
          from: instance.id,
          to: instance.prototypeId,
          announce: false,
        }, {
          kind: "addRelation",
          type: ObjectRelations.ownedBy,
          from: instance.id,
          to: instance.ownerId,
          announce: false,
        }, {
          kind: "addRelation",
          type: ObjectRelations.containedIn,
          from: instance.id,
          to: instance.inId,
          announce: false,
        });
      }

      effects.push({
        kind: "emitEvent",
        eventType: "settlement-locations.founded",
        targetId: SettlementId,
        data: {
          name: String(c.command.payload.name ?? "河岸台地聚落"),
          locationId,
          places: PLACES.length,
          spaces: PLACES.reduce((sum, place) => sum + place.spaces.length, 0),
          residents: RESIDENTS.length,
          prototypes: PROTOTYPES.length,
          instances: INSTANCES.length,
        },
        historicalSignificance: 0.6,
      });
      return effects;
    },
  });
}

// ---------------------------------------------------------------------------
// Arriving
// ---------------------------------------------------------------------------

/**
 * Walking somewhere and stepping inside are one action.
 *
 * `world-space.enter` only knows about places, so on its own it would leave the
 * player standing in a courtyard with nothing visible: every household object
 * lives in a room. Arriving therefore places the player in the place *and* in
 * the spot someone would actually stop at, in one transaction, so the scene the
 * player sees next is the room they walked into.
 */
function registerArrive(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.arrive}.allowed`,
    commandType: SettlementCommands.arrive,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      if (!actorId || !c.world.hasEntity(actorId)) {
        return refuse(SettlementRejection.NoSuchResident, "只有正在生活的人才能走进这里。");
      }
      const placeId = String(c.command.payload.placeId ?? "");
      const authored = PLACES.find((place) => place.id === placeId);
      if (!authored) return refuse(SettlementRejection.NoSuchPlace, "这个地方不属于这座聚落。");
      if (!c.world.getEntity(placeId)) return refuse(SettlementRejection.NoSuchPlace, "这个地方还没有建起来。");
      if (occupiedPlaceId(c.world, actorId) === placeId && occupiedSpaceId(c.world, actorId) === authored.entrySpace) {
        return refuse(SettlementRejection.Already, "你已经在这里了。");
      }
      if (c.command.payload.travelMode === "local") {
        const origin = occupiedPlaceId(c.world, actorId);
        if (!c.world.getEntity(SettlementId) || !PLACES.some((place) => place.id === origin)) {
          return refuse(SettlementRejection.WrongPlace, "只有在本聚落内才能使用短途步行。");
        }
        if (dailyActivity(c.world, actorId).remaining < 1) {
          return refuse(SettlementRejection.Exhausted, "今天已没有步行时间，请先结束这一天。");
        }
      } else if (c.command.payload.travelMode !== undefined) {
        return refuse(SettlementRejection.WrongPlace, "未知的出行方式。");
      }
      const capacity = readSpace(c.world.getComponent(authored.entrySpace, SpaceComponents.space)).capacity;
      const present = c.world
        .listRelations({ type: SpaceRelations.standingIn, to: authored.entrySpace })
        .filter((relation) => relation.from !== actorId).length;
      if (capacity > 0 && present >= capacity) {
        return refuse(SettlementRejection.NoRoom, "这里已经站满了人。");
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: `${SettlementCommands.arrive}.resolve`,
    commandType: SettlementCommands.arrive,
    resolve: (c) => {
      const actorId = c.command.actorId as string;
      const placeId = String(c.command.payload.placeId);
      const authored = PLACES.find((place) => place.id === placeId)!;
      const effects = moveEffects(c.world, actorId, placeId, authored.entrySpace, c.world.tick);
      if (c.command.payload.travelMode === "local") {
        const budget = dailyActivity(c.world, actorId);
        effects.push({
          kind: "modifyComponent", entityId: actorId,
          component: SettlementComponents.holding,
          patch: { activityDay: c.world.tick, activityUsed: budget.used + 1 },
          reason: "walk within the same settlement",
        });
      }
      effects.push({
        kind: "emitEvent",
        eventType: "settlement-locations.arrived",
        actorId,
        targetId: placeId,
        data: { placeId, spaceId: authored.entrySpace, costDays: c.command.payload.travelMode === "local" ? 0 : authored.costDays, travelMode: c.command.payload.travelMode ?? "legacy" },
        historicalSignificance: 0,
      });
      return effects;
    },
  });
}

// ---------------------------------------------------------------------------
// Reading: homestead, people, worksites
// ---------------------------------------------------------------------------

interface YieldState {
  placeId: string;
  resourceId: string;
  label: string;
  unit: string;
  capacity: number;
  stock: number;
  renewDays: number;
  lastRenewedAt: number;
}

/** Every yield point, with the stock that has regenerated since it was last drawn. */
function yieldPoints(world: WorldView): YieldState[] {
  return world
    .listEntities({ kind: "settlement-locations.yield-point" })
    .filter((entity) => entity.archivedAt === undefined)
    .map((entity) => {
      const raw = entity.components[SettlementComponents.yieldPoint] ?? {};
      const state: YieldState = {
        placeId: String(raw.placeId ?? ""),
        resourceId: String(raw.resourceId ?? ""),
        label: String(raw.label ?? ""),
        unit: String(raw.unit ?? "份"),
        capacity: Math.max(0, Number(raw.capacity ?? 0)),
        stock: Math.max(0, Number(raw.stock ?? 0)),
        renewDays: Math.max(1, Number(raw.renewDays ?? 30)),
        lastRenewedAt: Math.max(0, Number(raw.lastRenewedAt ?? 0)),
      };
      return { ...state, stock: renewedStock(state, world.tick) };
    })
    .sort((a, b) => (a.placeId + a.resourceId).localeCompare(b.placeId + b.resourceId));
}

/**
 * Deterministic renewal: one unit per whole `renewDays` since the last draw.
 *
 * Deliberately a pure function of (stock, tick) rather than a scheduled task,
 * so reading the world never changes it and two readers always agree. The stock
 * is only written back when someone actually draws, which keeps the number of
 * transactions proportional to player actions.
 */
/**
 * Clock anchor to store after a draw: keeps the partial renewal cycle already
 * under way, so drawing on day 2 of a 3-day cycle does not restart the wait.
 * A full point has nothing in progress, so its clock starts now.
 */
function renewalAnchor(point: YieldState, tick: number): number {
  if (point.stock >= point.capacity) return tick;
  const cycles = Math.floor(Math.max(0, tick - point.lastRenewedAt) / point.renewDays);
  return point.lastRenewedAt + cycles * point.renewDays;
}

function renewedStock(state: YieldState, tick: number): number {
  const elapsed = Math.max(0, tick - state.lastRenewedAt);
  const cycles = Math.floor(elapsed / state.renewDays);
  // The initial grain stock is finite seed grain; only sowing and harvest
  // produce new grain. Other natural yield points retain their renewal cycles.
  if (state.resourceId === "resource:grain") return state.stock;
  return Math.min(state.capacity, state.stock + cycles);
}

function readResident(world: WorldView, residentId: string) {
  const raw = world.getComponent(residentId, SettlementComponents.resident);
  if (!raw) return undefined;
  return {
    household: String(raw.household ?? ""),
    role: String(raw.role ?? ""),
    trait: String(raw.trait ?? ""),
    wish: String(raw.wish ?? ""),
    workPlace: String(raw.workPlace ?? ""),
    homeSpace: String(raw.homeSpace ?? ""),
    hunger: Math.max(0, Number(raw.hunger ?? 0)),
    rested: Math.max(0, Number(raw.rested ?? 1)),
    lastRoutineAt: Number(raw.lastRoutineAt ?? -1),
    standingRoutine: String(raw.standingRoutine ?? ""),
    lastRoutineActions: Array.isArray(raw.lastRoutineActions) ? raw.lastRoutineActions : [],
    tradeCount: Number(raw.tradeCount ?? 0),
  };
}

export function residentId(key: string): string {
  return `settlement-locations:resident:${key}`;
}

/** Hunger is derived from the world's day clock, not an extra ticking timer. */
function hungerLevel(world: WorldView, actorId: string): number {
  const state = world.getComponent(actorId, SettlementComponents.holding);
  const settlementStart = world.getComponent(SettlementId, SettlementComponents.settlement)?.foundedAt;
  const since = Number(state?.hungerAt ?? settlementStart ?? world.tick);
  const base = Number(state?.hunger ?? 0);
  return Math.max(0, Math.min(10, base + Math.max(0, world.tick - since)));
}

/** A carried cooked ration must be a real, owned, live item, not a yield point. */
function carriedRation(world: WorldView, actorId: string, objectId: string): boolean {
  return carriedFood(world, actorId, objectId) === "resource:cooked";
}

/**
 * What a carried, owned, live food item is: cooked ration or raw grain.
 * Raw grain is edible anywhere but eases less hunger than a cooked ration,
 * so a starving player holding grain is never locked out of eating.
 */
function carriedFood(world: WorldView, actorId: string, objectId: string): "resource:cooked" | "resource:grain" | "" {
  const entity = world.getEntity(objectId);
  if (!entity || entity.kind !== ObjectKinds.item || entity.archivedAt !== undefined) return "";
  if (ownerOf(world, objectId) !== actorId || holderOf(world, objectId) !== actorId) return "";
  if (readObject(entity.components[ObjectComponents.object]).quantity < 1) return "";
  const resourceId = prototypeOf(world, objectId).resourceId;
  return resourceId === "resource:cooked" || resourceId === "resource:grain" ? resourceId : "";
}

/** Hunger eased by one portion: cooked food 4, raw grain 2. */
const HUNGER_EASED: Record<string, number> = { "resource:cooked": 4, "resource:grain": 2 };


const CROP_GROW_DAYS = 30;
const CROP_YIELD = 3;

/** A plot lives on the existing field place; missing component means fallow (old saves). */
function fieldCrop(world: WorldView) {
  const raw = world.getComponent("place:field", SettlementComponents.cropPlot);
  const seedId = String(raw?.seedId ?? "");
  const sownAt = Number(raw?.sownAt ?? 0);
  const tended = Boolean(raw?.tended ?? false);
  const harvests = Math.max(0, Number(raw?.harvests ?? 0));
  const remainingDays = seedId ? Math.max(0, CROP_GROW_DAYS - Math.max(0, world.tick - sownAt)) : 0;
  return {
    seedId, sownAt, tended, harvests, remainingDays,
    phase: !seedId ? "fallow" : remainingDays === 0 && tended ? "ready" : "growing",
  };
}

function cropSummary(world: WorldView): string {
  const crop = fieldCrop(world);
  if (crop.phase === "fallow") return "田地闲置：带来一份粟作种粮，可开始播种。";
  if (crop.phase === "ready") return "粟已经成熟，可以收获三份真实粮食。";
  if (!crop.tended) return `粟正在生长，还需要照料；距成熟约 ${crop.remainingDays} 天。`;
  return `粟已经照料，距成熟约 ${crop.remainingDays} 天。`;
}

/** M2-UX2-A: a bounded capacity for actions within the current kernel day.
 * This is NOT a second clock: an old save without these fields starts with
 * 8 free activity units at the world's current tick. Time still advances via
 * the existing Simulation clock and its scheduler.
 */
export const DAILY_ACTIVITY_CAPACITY = 8;
const ACTIVITY_COST: Partial<Record<string, number>> = {
  [SettlementCommands.eat]: 1,
  [SettlementCommands.drink]: 1,
  [SettlementCommands.draw]: 2,
  [SettlementCommands.talk]: 1,
  [SettlementCommands.cook]: 2,
  [SettlementCommands.weaveBag]: 2,
  [SettlementCommands.weaveMat]: 2,
  [SettlementCommands.prepareFiber]: 2,
  [SettlementCommands.weaveWrap]: 2,
  [SettlementCommands.sow]: 3,
  [SettlementCommands.harvest]: 3,
  [SettlementCommands.tend]: 3,
  [SettlementCommands.rest]: 2,
};

/** A single personally owned wrap shields the worker at the field. */
function wornWrap(world: WorldView, actorId: string): string {
  const id = wornByActor(world, actorId);
  return id && prototypeOf(world, id).prototypeId === "prototype:fiber-wrap" ? id : "";
}
function activityCostFor(world: WorldView, actorId: string, commandType: string): number {
  const base = ACTIVITY_COST[commandType] ?? 0;
  if (commandType === SettlementCommands.tend &&
      occupiedSpaceId(world, actorId) === "space:field-edge" && wornWrap(world, actorId)) {
    return base - 1;
  }
  return base;
}

export function dailyActivity(world: WorldView, actorId: string) {
  const raw = world.getComponent(actorId, SettlementComponents.holding);
  const day = world.tick;
  // A genuinely used sleeping mat grants exactly one extra unit the next day.
  // The existing world tick stays authoritative; an old save gets 8 units.
  // Preserve today\'s already earned bonus if the player rests again today.
  const extraToday = day > 0 && (Number(raw?.matRestedAt ?? -1) === day - 1 ||
    Number(raw?.matBonusPreservedAt ?? -1) === day);
  const capacity = DAILY_ACTIVITY_CAPACITY + (extraToday ? 1 : 0);
  const used = Number(raw?.activityDay ?? -1) === day
    ? Math.max(0, Math.min(capacity, Number(raw?.activityUsed ?? 0)))
    : 0;
  return { day, used, remaining: capacity - used, capacity };
}

function registerActivityBudget(ctx: Registration): void {
  for (const [commandType, baseCost] of Object.entries(ACTIVITY_COST)) {
    if (!baseCost) continue;
    ctx.registerConstraintRule({
      id: `settlement-locations.activity.${commandType}.allowed`,
      commandType,
      evaluate: (c) => {
        const actorId = c.command.actorId ?? "";
        if (!c.world.hasEntity(actorId)) return refuse(SettlementRejection.NoSuchResident, "需要一位正在生活的人。");
        const remaining = dailyActivity(c.world, actorId).remaining;
        const cost = activityCostFor(c.world, actorId, commandType);
        if (remaining < cost) return refuse(SettlementRejection.Exhausted,
          `今天还剩 ${remaining} 格活动时间，这项需要 ${cost} 格，请先结束这一天。`);
        return { ok: true };
      },
    });
    // Multiple resolution rules' effects share one Kernel transaction. If the
    // business action fails its constraints, the budget is NOT charged.
    ctx.registerResolutionRule({
      id: `settlement-locations.activity.${commandType}.resolve`,
      commandType,
      resolve: (c): Effect[] => {
        const actorId = c.command.actorId as string;
        const before = dailyActivity(c.world, actorId);
        const cost = activityCostFor(c.world, actorId, commandType);
        return [{
          kind: "modifyComponent", entityId: actorId,
          component: SettlementComponents.holding,
          patch: { activityDay: c.world.tick, activityUsed: before.used + cost },
          reason: "activity capacity spent in the same world transaction",
        }];
      },
    });
  }
}

/** M2-UX2-B: a small persistent, authorized routine, not a second timeline. */
export type DailyPlanStep = "eat" | "tend" | "rest" | "go-hearth" | "go-field" | "go-kiln" | "go-home" | "pottery";
const PLAN_COMMAND: Record<DailyPlanStep, string> = {
  eat: SettlementCommands.eat,
  tend: SettlementCommands.tend,
  rest: SettlementCommands.rest,
  "go-hearth": SettlementCommands.arrive,
  "go-field": SettlementCommands.arrive,
  "go-kiln": SettlementCommands.arrive,
  "go-home": SettlementCommands.arrive,
  pottery: "practice-runtime.start",
};
const PLAN_DESTINATION: Record<string, string> = {
  "go-hearth": "place:hearth-yard", "go-field": "place:field",
  "go-kiln": "place:kiln", "go-home": "place:yard",
};
const PLAN_STEPS = new Set<string>(Object.keys(PLAN_COMMAND));
export function dailyPlan(world: WorldView, actorId: string) {
  const data = world.getComponent(actorId, SettlementComponents.dailyPlan);
  const steps = Array.isArray(data?.steps) ? data.steps.filter((v): v is DailyPlanStep =>
    typeof v === "string" && PLAN_STEPS.has(v)) : [];
  const progressDay = Number(data?.progressDay ?? -1);
  const repeat = data?.repeat !== false;
  return {
    enabled: data?.enabled === true && steps.length > 0,
    steps,
    repeat,
    revision: Math.max(0, Number(data?.revision ?? 0)),
    progressDay,
    progressIndex: progressDay === world.tick ? Math.min(steps.length,
      Math.max(0, Number(data?.progressIndex ?? 0))) : 0,
  };
}

function registerDailyPlan(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.configurePlan}.allowed`,
    commandType: SettlementCommands.configurePlan,
    evaluate: (c) => {
      if (!c.command.actorId || !c.world.getEntity(c.command.actorId)) {
        return refuse(SettlementRejection.NoSuchResident, "只有存在的人物可以安排日常。");
      }
      const raw = c.command.payload.steps;
      if (!Array.isArray(raw) || raw.length > 6 ||
        !raw.every((v) => typeof v === "string" && PLAN_STEPS.has(v)) ||
        (c.command.payload.enabled === true && raw.length === 0) ||
        typeof c.command.payload.enabled !== "boolean" ||
        typeof c.command.payload.repeat !== "boolean") {
        return refuse(SettlementRejection.Busy, "日程最多安排六项吃饭、劳动、休息或村内步行，启用时至少一项。");
      }
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.configurePlan}.resolve`,
    commandType: SettlementCommands.configurePlan,
    resolve: (c): Effect[] => [{
      kind: "setComponent", entityId: c.command.actorId as string,
      component: SettlementComponents.dailyPlan,
      value: {
        enabled: c.command.payload.enabled as boolean,
        steps: c.command.payload.steps as DailyPlanStep[],
        repeat: c.command.payload.repeat as boolean,
        revision: dailyPlan(c.world, c.command.actorId as string).revision + 1,
        progressDay: c.world.tick,
        progressIndex: 0,
      },
      reason: "player arranged their own repeatable daily routine",
    }],
  });

  for (const commandType of new Set(Object.values(PLAN_COMMAND))) {
    ctx.registerConstraintRule({
      id: `settlement-locations.plan.${commandType}.allowed`,
      commandType,
      evaluate: (c) => {
        if (c.command.source !== "autosim" || commandType === "practice-runtime.start") return { ok: true };
        const actorId = c.command.actorId ?? "";
        const plan = dailyPlan(c.world, actorId);
        const expectedStep = plan.steps[plan.progressIndex];
        if (!plan.enabled || PLAN_COMMAND[expectedStep] !== commandType ||
            c.command.payload.planStep !== expectedStep ||
            c.command.payload.planIndex !== plan.progressIndex ||
            (commandType === SettlementCommands.arrive &&
              (c.command.payload.travelMode !== "local" ||
               c.command.payload.placeId !== PLAN_DESTINATION[expectedStep]))) {
          return refuse(SettlementRejection.Busy, "自动动作与当前日程不一致，请由玩家重新安排。");
        }
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `settlement-locations.plan.${commandType}.resolve`,
      commandType,
      resolve: (c): Effect[] => {
        if (c.command.source !== "autosim" || commandType === "practice-runtime.start") return [];
        const actorId = c.command.actorId as string;
        const plan = dailyPlan(c.world, actorId);
        const nextIndex = plan.progressIndex + 1;
        return [{
          kind: "modifyComponent", entityId: actorId,
          component: SettlementComponents.dailyPlan,
          patch: {
            progressDay: c.world.tick,
            progressIndex: nextIndex,
            enabled: plan.repeat || nextIndex < plan.steps.length,
          },
          reason: "authorized routine step committed with its actual world action",
        }];
      },
    });
  }
}

/** Starting a Practice is a real transaction; the scheduled-plan cursor moves
 * only if Practice start itself succeeds. Quality checkpoints are never decided
 * by AutoSim.
 */
function registerPotteryPlanStart(ctx: Registration): void {
  const type = "practice-runtime.start";
  ctx.registerConstraintRule({
    id: "settlement-locations.plan.pottery.allowed",
    commandType: type,
    evaluate: (c) => {
      if (c.command.source !== "autosim" || c.command.payload.planStep !== "pottery") return { ok: true };
      const actorId = c.command.actorId ?? "";
      const plan = dailyPlan(c.world, actorId);
      if (!plan.enabled || plan.steps[plan.progressIndex] !== "pottery" ||
          c.command.payload.planIndex !== plan.progressIndex ||
          c.command.payload.definitionId !== "craft-pottery.make-vessel") {
        return refuse(SettlementRejection.Busy, "制陶日程已改变，不能擅自开工。");
      }
      if (occupiedPlaceId(c.world, actorId) !== "place:kiln" ||
          occupiedSpaceId(c.world, actorId) !== "space:kiln-mouth") {
        return refuse(SettlementRejection.WrongPlace, "需要先到共用陶窑的窑口。");
      }
      const alreadyCrafting = c.world.listRelations({ type: "practice-runtime.participates_in", from: actorId })
        .some((relation) => {
          const activity = c.world.getEntity(relation.to);
          const status = activity?.components["practice-runtime.practice"]?.status;
          return activity && activity.archivedAt === undefined && ["active", "blocked", "paused"].includes(String(status));
        });
      if (alreadyCrafting) return refuse(SettlementRejection.Busy, "手中还有未完成的制陶工序，请先亲自处理。");
      if (dailyActivity(c.world, actorId).remaining < 2) {
        return refuse(SettlementRejection.Exhausted, "制陶开工需要今天剩余至少两格活动时间。");
      }
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: "settlement-locations.plan.pottery.resolve",
    commandType: type,
    resolve: (c): Effect[] => {
      if (c.command.source !== "autosim" || c.command.payload.planStep !== "pottery") return [];
      const actorId = c.command.actorId as string;
      const plan = dailyPlan(c.world, actorId);
      const activity = dailyActivity(c.world, actorId);
      const nextIndex = plan.progressIndex + 1;
      return [{
        kind: "modifyComponent", entityId: actorId,
        component: SettlementComponents.dailyPlan,
        patch: { progressDay: c.world.tick, progressIndex: nextIndex, enabled: plan.repeat || nextIndex < plan.steps.length },
        reason: "real pottery Practice started; authorized routine step completed",
      }, {
        kind: "modifyComponent", entityId: actorId,
        component: SettlementComponents.holding,
        patch: { activityDay: c.world.tick, activityUsed: activity.used + 2 },
        reason: "pottery work occupies daily activity capacity",
      }];
    },
  });
}

/** M3-A: one selected resident's real daily commands finish with an auditable marker.
 * The daily marker is not a substitute for travel, labor, food or rest.
 */
function registerNpcDayMarker(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.npcMarkDay}.allowed`,
    commandType: SettlementCommands.npcMarkDay,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      if (c.command.source !== "ai" ||
          !c.world.getEntity(actorId)?.components[SettlementComponents.resident] ||
          c.world.getComponent("modern:world", "modern.world_state")?.activeCharacterId === actorId) {
        return refuse(SettlementRejection.NotYours, "NPC 日常状态只能由已授权的村民自动行为记录。");
      }
      const raw = c.world.getComponent(actorId, SettlementComponents.resident) ?? {};
      if (Number(raw.lastRoutineAt ?? -1) === c.world.tick) {
        return refuse(SettlementRejection.Already, "这位村民今天已经完成日常安排。");
      }
      if (!Array.isArray(c.command.payload.actions) ||
          (c.command.payload.actions as unknown[]).length > 12 ||
          !(c.command.payload.actions as unknown[]).every((v) => typeof v === "string") ||
          typeof c.command.payload.summary !== "string") {
        return refuse(SettlementRejection.Busy, "NPC 日常记录必须有可核对的执行摘要。");
      }
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.npcMarkDay}.resolve`,
    commandType: SettlementCommands.npcMarkDay,
    resolve: (c) => [{
      kind: "modifyComponent", entityId: c.command.actorId as string,
      component: SettlementComponents.resident,
      patch: {
        lastRoutineAt: c.world.tick,
        npcDailyCount: Number(c.world.getComponent(c.command.actorId as string, SettlementComponents.resident)?.npcDailyCount ?? 0) + 1,
        lastRoutineActions: c.command.payload.actions,
        standingRoutine: c.command.payload.summary,
      },
      reason: "NPC's real daily commands completed or a real obstacle was encountered",
    }, {
      kind: "emitEvent", eventType: "settlement-locations.npc_daily",
      actorId: c.command.actorId,
      data: { actions: c.command.payload.actions, summary: c.command.payload.summary },
      historicalSignificance: 0,
    }],
  });
}

/**
 * NPC-owned request/answer. These are ordinary world commands, not a scripted
 * quest. Both residents must physically meet; the answer is chosen by the
 * responder and only an accepted response transfers an actual item.
 */
function registerNpcHelp(ctx: Registration): void {
  const cook = residentId("cook"), reed = residentId("reed-worker");
  const requestOf = (w: WorldView) => {
    const raw = w.getComponent(cook, SettlementComponents.resident)?.helpRequest;
    return raw && typeof raw === "object" && !Array.isArray(raw)
      ? raw as Record<string, JsonValue> : {};
  };
  ctx.registerConstraintRule({
    id: `${SettlementCommands.npcAskHelp}.allowed`, commandType: SettlementCommands.npcAskHelp,
    evaluate: (c) => {
      if (c.command.source !== "ai" || c.command.actorId !== cook ||
          c.command.payload.targetId !== reed) return refuse(SettlementRejection.NotYours, "只有阿灶能自己当面向阿苇求助。");
      if (occupiedPlaceId(c.world, cook) !== "place:reedbed" ||
          occupiedPlaceId(c.world, reed) !== "place:reedbed")
        return refuse(SettlementRejection.WrongPlace, "两人必须真正在芦苇滩见面。");
      if (heldIngredient(c.world, cook, "resource:fuel"))
        return refuse(SettlementRejection.Already, "阿灶手里还有可用的柴草，不必求助。");
      const stock = yieldPoints(c.world).find(p => p.placeId === "place:reedbed" && p.resourceId === "resource:fuel")?.stock ?? 0;
      if (stock > 2) return refuse(SettlementRejection.Busy, "附近仍有柴草，阿灶应先尝试自己采集。");
      const prev = requestOf(c.world);
      if (prev.status === "pending" || c.world.tick - Number(prev.at ?? -100) < 3)
        return refuse(SettlementRejection.Busy, "阿灶已经提出过请求，先等一等对方。");
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.npcAskHelp}.resolve`, commandType: SettlementCommands.npcAskHelp,
    resolve: (c): Effect[] => [{
      kind: "modifyComponent", entityId: cook, component: SettlementComponents.resident,
      patch: { helpRequest: { status: "pending", at: c.world.tick, from: cook, to: reed,
        resourceId: "resource:fuel" } }, reason: "a resident independently asks for help when real fuel runs low",
    }, {
      kind: "emitEvent", eventType: "settlement-locations.help_requested",
      actorId: cook, targetId: reed, data: { resourceId: "resource:fuel", placeId: "place:reedbed" },
      historicalSignificance: 0.06,
    }],
  });
  ctx.registerConstraintRule({
    id: `${SettlementCommands.npcAnswerHelp}.allowed`, commandType: SettlementCommands.npcAnswerHelp,
    evaluate: (c) => {
      if (c.command.source !== "ai" || c.command.actorId !== reed ||
          c.command.payload.requesterId !== cook ||
          typeof c.command.payload.accept !== "boolean")
        return refuse(SettlementRejection.NotYours, "只能由受邀的阿苇自行答复。");
      const request = requestOf(c.world);
      if (request.status !== "pending" || request.to !== reed ||
          request.resourceId !== "resource:fuel" || c.world.tick - Number(request.at) > 2)
        return refuse(SettlementRejection.Busy, "没有仍然有效的请求。");
      if (occupiedPlaceId(c.world, cook) !== "place:reedbed" ||
          occupiedPlaceId(c.world, reed) !== "place:reedbed")
        return refuse(SettlementRejection.WrongPlace, "没有面对面见到求助的人。");
      if (c.command.payload.accept === true) {
        const itemId = String(c.command.payload.itemId ?? "");
        const owned = c.world.listRelations({ type: ObjectRelations.heldBy, to: reed })
          .map(r => r.from).filter(id => tradeReady(c.world, id, reed, "resource:fuel"));
        if (owned.length < 2 || !owned.includes(itemId))
          return refuse(SettlementRejection.Empty, "阿苇需要保留自己的一份柴草，不能凭空送出。");
        if (!canCarryObject(c.world, cook, itemId))
          return refuse(SettlementRejection.NoRoom, "阿灶手中拿不下这捆柴草。");
      }
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.npcAnswerHelp}.resolve`, commandType: SettlementCommands.npcAnswerHelp,
    resolve: (c): Effect[] => {
      const accepted = c.command.payload.accept === true;
      const itemId = String(c.command.payload.itemId ?? "");
      const request = requestOf(c.world);
      const effects: Effect[] = [{
        kind: "modifyComponent", entityId: cook, component: SettlementComponents.resident,
        patch: { helpRequest: { ...request, status: accepted ? "accepted" : "declined",
          resolvedAt: c.world.tick, itemId: accepted ? itemId : "" } },
        reason: "the other resident's independent answer becomes persistent evidence",
      }, {
        kind: "modifyComponent", entityId: reed, component: SettlementComponents.resident,
        patch: { lastHelpOutcome: accepted ? "shared" : "declined",
          lastHelpAt: c.world.tick,
          trustTowardCook: Math.max(0, Math.min(10, Number(c.world.getComponent(reed, SettlementComponents.resident)?.trustTowardCook ?? 5) + (accepted ? 1 : -1))) },
        reason: "the resident remembers cooperating or protecting their own supply",
      }];
      if (accepted) effects.push(
        { kind: "removeRelation", type: ObjectRelations.heldBy, from: itemId, to: reed, reason: "voluntary aid", announce: false },
        { kind: "removeRelation", type: ObjectRelations.ownedBy, from: itemId, to: reed, reason: "voluntary aid", announce: false },
        { kind: "addRelation", type: ObjectRelations.heldBy, from: itemId, to: cook, announce: false },
        { kind: "addRelation", type: ObjectRelations.ownedBy, from: itemId, to: cook, announce: false },
      );
      effects.push({ kind: "emitEvent",
        eventType: accepted ? "settlement-locations.help_given" : "settlement-locations.help_refused",
        actorId: reed, targetId: cook,
        data: { itemId: accepted ? itemId : "", resourceId: "resource:fuel", reason: accepted ? "spare-resource" : "reserve-protection" },
        historicalSignificance: accepted ? 0.12 : 0.05,
      });
      return effects;
    },
  });
}

/** Lighting the public fire uses (and archives) a real owned bundle. */
function registerNpcFire(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.npcFire}.allowed`, commandType: SettlementCommands.npcFire,
    evaluate: (c) => {
      const cook = residentId("cook");
      if (c.command.source !== "ai" || c.command.actorId !== cook ||
          occupiedPlaceId(c.world, cook) !== "place:hearth-yard")
        return refuse(SettlementRejection.NotYours, "只有在公灶的阿灶能点火。");
      if (String(c.command.payload.itemId ?? "") !== heldIngredient(c.world, cook, "resource:fuel"))
        return refuse(SettlementRejection.Empty, "没有属于阿灶的实物柴草，灶火不能凭空点燃。");
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.npcFire}.resolve`, commandType: SettlementCommands.npcFire,
    resolve: (c): Effect[] => {
      const itemId = String(c.command.payload.itemId);
      const cook = residentId("cook");
      return [{
        kind: "removeRelation", type: ObjectRelations.heldBy, from: itemId, to: cook,
        reason: "the public fire consumes the bundle", announce: false,
      }, {
        kind: "archiveEntity", entityId: itemId, reason: "burned in the public hearth", announce: false,
      }, {
        kind: "modifyComponent", entityId: cook, component: SettlementComponents.resident,
        patch: { lastFireAt: c.world.tick }, reason: "a real fire ran today",
      }, {
        kind: "emitEvent", eventType: "settlement-locations.hearth_lit",
        actorId: cook, data: { itemId }, historicalSignificance: 0.01,
      }];
    },
  });
}

/** Repeatable voluntary aid grounded in a real encounter and one owned item. */
function registerHearthRelief(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.helpHearth}.allowed`,
    commandType: SettlementCommands.helpHearth,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      const cookId = residentId("cook");
      if (!actorId || c.world.getComponent("modern:world", "modern.world_state")?.activeCharacterId !== actorId)
        return refuse(SettlementRejection.NotYours, "只能决定自己如何帮助公灶。");
      if (occupiedPlaceId(c.world, actorId) !== "place:hearth-yard" ||
          occupiedPlaceId(c.world, cookId) !== "place:hearth-yard")
        return refuse(SettlementRejection.WrongPlace, "请到公灶当面把物资交给阿灶。");
      if (contactConversations(c.world, actorId, cookId) < 1)
        return refuse(SettlementRejection.Busy, "先与阿灶搭话，了解公灶需要什么。");
      const objectId = String(c.command.payload.objectId ?? "");
      const item = c.world.getEntity(objectId);
      const resourceId = item && item.archivedAt === undefined ? prototypeOf(c.world, objectId).resourceId : "";
      if (!["resource:fuel", "resource:grain"].includes(resourceId) ||
          heldIngredient(c.world, actorId, resourceId) !== objectId)
        return refuse(SettlementRejection.NotYours, "必须交出自己随身持有的一捆柴草或一份粟粮。");
      if (resourceId === "resource:fuel" && !canCarryObject(c.world, cookId, objectId))
        return refuse(SettlementRejection.NoRoom, "阿灶现在拿不下这捆柴草。");
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.helpHearth}.resolve`,
    commandType: SettlementCommands.helpHearth,
    resolve: (c): Effect[] => {
      const actorId = c.command.actorId as string;
      const itemId = String(c.command.payload.objectId);
      const route = prototypeOf(c.world, itemId).resourceId;
      const cookId = residentId("cook");
      return [{
        kind: "removeRelation", type: ObjectRelations.heldBy, from: itemId, to: actorId,
        reason: "player supplied the hearth", announce: false,
      }, {
        kind: "removeRelation", type: ObjectRelations.ownedBy, from: itemId, to: actorId,
        reason: "voluntary contribution", announce: false,
      }, {
        kind: "addRelation", type: ObjectRelations.ownedBy, from: itemId, to: cookId, announce: false,
      }, ...(route === "resource:fuel" ? [{
        kind: "addRelation" as const, type: ObjectRelations.heldBy, from: itemId, to: cookId,
        announce: false,
      }] : [{
        kind: "addRelation" as const, type: ObjectRelations.containedIn, from: itemId,
        to: "space:hearth", announce: false,
      }]), {
        kind: "modifyComponent", entityId: cookId, component: SettlementComponents.resident,
        patch: { giftCount: Number(c.world.getComponent(cookId, SettlementComponents.resident)?.giftCount ?? 0) + 1,
          lastGift: { route, itemId, playerId: actorId, at: c.world.tick } },
        reason: "resident remembers real help; there is no quest completion flag",
      }, {        kind: "emitEvent", eventType: "settlement-locations.hearth_helped",
        actorId, targetId: cookId, data: { route, itemId, placeId: "place:hearth-yard" },
        historicalSignificance: 0.1,
      }];
    },
  });
}

export interface HomesteadView {
  exists: boolean;
  characterId: string;
  characterInSettlement: boolean;
  placeId: string;
  placeName: string;
  spaceId: string;
  spaceName: string;
  day: number;
  season: string;
  /** 0 = fed; 10 = hungry. Driven by the world day clock. */
  hunger: number;
  /** Budget for several activities in the same authoritative world day. */
  dailyActivity: ReturnType<typeof dailyActivity>;
  dailyPlan: ReturnType<typeof dailyPlan>;
  outfit: { objectId: string; name: string; fieldWorkActivityCost: number } | null;
  /** Only the addressed player can see their cook quote at the hearth. */
  barter: { status: string; grainId: string; fuelId: string; offeredAt: number } | null;
  communitySituation: { visible: boolean; urgent: boolean; title: string; note: string; requestStatus: string; recentHelp: string; fuelStock: number | null };
  /** Field status, visible when standing at the field. */
  crop?: { phase: string; remainingDays: number; tended: boolean; summary: string };
  /** Who carries the village's named routines (from the settlement pack). */
  roles: Record<"farmer" | "cook" | "fuelGatherer", { id: string; name: string; workPlace: string }>;
  /** People in the same place, with what they are doing right now. */
  neighbours: { id: string; name: string; role: string; household: string; placeId: string; atWork: boolean; dailyNote: string; tradeCount: number; contact: string; conversations: number }[];
  /** Objects reachable from here, with the action each allows. */
  objects: { id: string; name: string; prototypeId: string; placement: string; quantity: number; capacity: number; contentsCount: number; canTake: boolean; visible: boolean }[];
  /** Resources this place renews, and what is left. */
  yields: { resourceId: string; label: string; stock: number; capacity: number; unit: string }[];
  /** Where the player could go next, with the day cost. */
  exits: { placeId: string; name: string; costDays: number; purpose: string }[];
  /** What the player is carrying, by resource. */
  carried: { resourceId: string; label: string; count: number; unit: string }[];
  portableLoad: ReturnType<typeof portableLoad>;
  contacts: { id: string; name: string; role: string; contact: string; conversations: number; nearby: boolean }[];
  /** The actions that are legal right now, with a reason when they are not. */
  actions: { id: string; label: string; hint: string; days: number; enabled: boolean; reason: string; payload: Record<string, JsonValue>; activityCost?: number }[];
  note: string;
}

function contactConversations(world: WorldView, actorId: string, targetId: string): number {
  const raw = world.getComponent(actorId, SettlementComponents.holding)?.contacts;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return 0;
  const person = (raw as Record<string, JsonValue>)[targetId];
  if (!person || typeof person !== "object" || Array.isArray(person)) return 0;
  return Math.max(0, Number((person as Record<string, JsonValue>).conversations ?? 0));
}
function contactLevel(world: WorldView, actorId: string, targetId: string): string {
  const count = contactConversations(world, actorId, targetId);
  return count >= 3 ? "相识" : count > 0 ? "见过" : "陌生";
}

export function homestead(world: WorldView, actorId: string): HomesteadView {
  const placeId = occupiedPlaceId(world, actorId);
  const spaceId = occupiedSpaceId(world, actorId);
  const place = placeId ? readPlace(world.getComponent(placeId, SpaceComponents.place)) : undefined;
  const inSettlement = Boolean(world.getEntity(SettlementId));

  const neighbours = world
    .listEntities({ kind: "modern.character" })
    .filter((entity) => entity.archivedAt === undefined && Boolean(entity.components[SettlementComponents.resident]))
    .map((entity) => {
      const resident = readResident(world, entity.id)!;
      const otherPlace = occupiedPlaceId(world, entity.id);
      return {
        id: entity.id,
        name: String(entity.components["modern.identity"]?.givenName ?? entity.id),
        role: resident.role,
        household: resident.household,
        placeId: otherPlace,
        atWork: otherPlace === resident.workPlace,
        dailyNote: resident.lastRoutineAt === world.tick ? resident.standingRoutine : "",
        tradeCount: resident.tradeCount,
        contact: contactLevel(world, actorId, entity.id),
        conversations: contactConversations(world, actorId, entity.id),
      };
    })
    .filter((person) => person.placeId === placeId)
    .sort((a, b) => a.id.localeCompare(b.id));

  // Objects standing in this place, in the space the player occupies, or in the
  // player's own hands. An object in a room the player has not entered is not
  // listed: SPACE-001 says indoor contents appear only once they can be reached.
  const here = occupancyPlaceOf(world, actorId);
  const reachableHolders = new Set([placeId, spaceId].filter(Boolean));
  const objects = world
    .listEntities({ kind: ObjectKinds.item })
    .filter((entity) => entity.archivedAt === undefined)
    .map((entity) => {
      const instance = readObject(entity.components[ObjectComponents.object]);
      const prototype = prototypeOf(world, entity.id);
      const holder = holderOf(world, entity.id);
      const containerId = world
        .listRelations({ type: ObjectRelations.containedIn, from: entity.id })
        .map((relation) => relation.to)[0] ?? "";
      const placement = holder === actorId ? "在手中" : holder ? "在别人手中" : "放着";
      return {
        id: entity.id,
        name: instance.name || prototype.name,
        prototypeId: prototype.prototypeId,
        placement,
        quantity: instance.quantity,
        capacity: prototype.capacity,
        contentsCount: contentsOf(world, entity.id).length,
        canTake: !ownerOf(world, entity.id) || ownerOf(world, entity.id) === actorId || instance.loanPolicy === "public-visitor",
        visible: holder === actorId || reachableHolders.has(containerId),
      };
    })
    .filter((object) => object.visible)
    .sort((a, b) => a.id.localeCompare(b.id));

  const yields = yieldPoints(world)
    .filter((point) => point.placeId === placeId)
    .map((point) => ({
      resourceId: point.resourceId,
      label: point.label,
      stock: point.stock,
      capacity: point.capacity,
      unit: point.unit,
    }));

  const exits = PLACES
    .filter((candidate) => candidate.id !== here)
    .map((candidate) => ({ placeId: candidate.id, name: candidate.name, costDays: candidate.costDays, purpose: PURPOSE[candidate.id] ?? "生活空间" }))
    .sort((a, b) => a.costDays - b.costDays || a.placeId.localeCompare(b.placeId));

  const carried = carrying(world, actorId).map((row) => ({
    resourceId: row.resourceId,
    label: row.label,
    count: row.count,
    unit: row.unit,
  }));

  const cookQuoteRaw = world.getComponent(residentId("cook"), SettlementComponents.resident)?.playerBarterQuote;
  const cookQuote = cookQuoteRaw && typeof cookQuoteRaw === "object" && !Array.isArray(cookQuoteRaw)
    ? cookQuoteRaw as Record<string, JsonValue> : {};
  const ownBarter = placeId === "place:hearth-yard" &&
    cookQuote.customerId === actorId && occupiedPlaceId(world, residentId("cook")) === placeId
    ? { status: String(cookQuote.status ?? ""), grainId: String(cookQuote.grainId ?? ""),
      fuelId: String(cookQuote.fuelId ?? ""), offeredAt: Number(cookQuote.at ?? -1) }
    : null;

  const actions = homesteadActions(world, actorId, placeId, spaceId);
  const cookState = world.getComponent(residentId("cook"), SettlementComponents.resident);
  const rawRequest = cookState?.helpRequest;
  const request = rawRequest && typeof rawRequest === "object" && !Array.isArray(rawRequest)
    ? rawRequest as Record<string, JsonValue> : {};
  const gift = cookState?.lastGift;
  const lastGift = gift && typeof gift === "object" && !Array.isArray(gift)
    ? gift as Record<string, JsonValue> : {};
  const cookHere = occupiedPlaceId(world, residentId("cook")) === placeId;
  const observing = (placeId === "place:hearth-yard" && cookHere) ||
    (placeId === "place:reedbed" && cookHere &&
      occupiedPlaceId(world, residentId("reed-worker")) === placeId);
  const fuelStock = placeId === "place:reedbed"
    ? yieldPoints(world).find(p => p.placeId === "place:reedbed" && p.resourceId === "resource:fuel")?.stock ?? 0 : null;
  const pending = request.status === "pending" && world.tick - Number(request.at ?? -100) <= 2;
  const replyRecent = ["accepted", "declined"].includes(String(request.status)) &&
    world.tick - Number(request.resolvedAt ?? -100) <= 3;
  const fireToday = Number(cookState?.lastFireAt ?? -1) === world.tick;
  const recentHelp = lastGift.playerId === actorId && Number(lastGift.at ?? -100) >= world.tick - 3
    ? (lastGift.route === "resource:fuel" ? "你送来的柴草已归阿灶使用" : "你送来的粟粮留在公灶") : "";
  const communitySituation: HomesteadView["communitySituation"] = observing
    ? { visible: true, urgent: pending || (!fireToday && (fuelStock ?? 0) <= 2),
      title: pending ? "阿灶向阿苇求助中"
        : replyRecent && request.status === "accepted" ? "阿苇决定分享柴草"
        : replyRecent && request.status === "declined" ? "阿苇暂时拒绝了求助"
        : fireToday ? "公灶今天点过火" : "阿灶在安排今天的灶火",
      note: pending ? "阿灶在芦苇滩当面提出请求，等阿苇自己决定。"
        : replyRecent && request.status === "accepted" ? "阿苇把自己多余的一捆真柴草交给阿灶，物品已实际换手。"
        : replyRecent && request.status === "declined" ? "阿苇为保障自家储备拒绝交出柴草。阿灶需要考虑其他办法。"
        : fireToday ? "公灶真实消耗了一捆柴草。明天的生计还得重新安排。"
        : "看看眼前村民的真实行动，或者自愿提出帮助。",
      requestStatus: String(request.status ?? ""), recentHelp, fuelStock }
    : { visible: false, urgent: false, title: "世界在继续生活",
      note: "村民会自己劳动、寻找物资、谈判或拒绝。前往现场才能知道他们的具体处境。",
      requestStatus: "", recentHelp: "", fuelStock };
  return {
    exists: inSettlement,
    characterId: actorId,
    characterInSettlement: Boolean(placeId),
    placeId,
    placeName: place?.name ?? "",
    spaceId,
    spaceName: spaceId ? String(world.getComponent(spaceId, SpaceComponents.space)?.name ?? "") : "",
    day: world.tick,
    season: seasonOf(world.tick),
    hunger: hungerLevel(world, actorId),
    dailyActivity: dailyActivity(world, actorId),
    dailyPlan: dailyPlan(world, actorId),
    barter: ownBarter,
    communitySituation,
    outfit: wornByActor(world, actorId) ? {
      objectId: wornByActor(world, actorId), name: nameOfObject(world, wornByActor(world, actorId)),
      fieldWorkActivityCost: wornWrap(world, actorId) ? 2 : 3,
    } : null,
    ...(placeId === "place:field" ? { crop: { ...fieldCrop(world), summary: cropSummary(world) } } : {}),
    roles: ROLE_VIEW,
    neighbours,
    objects,
    yields,
    exits,
    carried,
    portableLoad: portableLoad(world, actorId),
    contacts: RESIDENTS.map((r) => ({
      id: residentId(r.key), name: r.name, role: r.role,
      contact: contactLevel(world, actorId, residentId(r.key)),
      conversations: contactConversations(world, actorId, residentId(r.key)),
      nearby: occupiedPlaceId(world, residentId(r.key)) === placeId,
    })).filter((r) => r.conversations > 0),
    actions,
    note: inSettlement
      ? place?.name
        ? `你正在${place.name}。`
        : "你站在聚落外的开阔处，先走进一个地方。"
      : "这个世界还没有这座聚落。",
  };
}

const PURPOSE: Record<string, string> = {
  "place:yard": "住处与储粮",
  "place:hearth-yard": "做饭与分食",
  "place:river": "取水",
  "place:field": "田地与收成",
  "place:kiln": "烧制陶器",
  "place:claypits": "取黏土",
  "place:reedbed": "割芦苇与柴草",
  "place:ford": "过河与交换",
};

function homesteadActions(
  world: WorldView,
  actorId: string,
  placeId: string,
  spaceId: string,
): HomesteadView["actions"] {
  const actions: HomesteadView["actions"] = [];
  const add = (
    id: string,
    label: string,
    hint: string,
    days: number,
    enabled: boolean,
    reason: string,
    payload: Record<string, JsonValue> = {},
  ) => {
    const cost = id === SettlementCommands.arrive && payload.travelMode === "local" ? 1 : activityCostFor(world, actorId, id);
    const remaining = dailyActivity(world, actorId).remaining;
    const enoughTime = remaining >= cost;
    actions.push({ id, label, hint, days: cost ? 0 : days,
      enabled: enabled && enoughTime,
      reason: enabled && !enoughTime ? `今日剩余 ${remaining} 格活动时间，不足 ${cost} 格` : reason,
      payload, ...(cost ? { activityCost: cost } : {}) });
  };

  if (!placeId) {
    actionAddExits(add, world, placeId);
    return actions;
  }

  for (const resident of RESIDENTS) {
    const id = residentId(resident.key);
    if (id === actorId || occupiedPlaceId(world, id) !== placeId) continue;
    const raw = world.getComponent(actorId, SettlementComponents.holding)?.contacts;
    const info = raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, JsonValue>)[id] : undefined;
    const talked = info && typeof info === "object" && !Array.isArray(info) &&
      (info as Record<string, JsonValue>).lastTalkAt === world.tick;
    add(SettlementCommands.talk, `与${resident.name}搭话`,
      "当面交流后逐渐相识；搭一次话不会直接成为朋友。",
      0, !talked, talked ? "今天已经聊过，明天再来" : "", { targetId: id });
  }

  const available = yieldPoints(world).filter((point) => point.placeId === placeId && point.stock > 0);
  for (const point of available) {
    add(
      SettlementCommands.draw,
      `取${point.label}`,
      `这个地方还剩 ${point.stock} ${point.unit}；取用占用部分活动时间。`,
      1,
      true,
      "",
      { resourceId: point.resourceId, placeId },
    );
  }

  const carriedJar = jarInHand(world, actorId);
  const waterHere = available.some((point) => point.resourceId === "resource:water");
  const jarHasRoom = carriedJar ? jarRoom(world, actorId, carriedJar) > 0 : false;
  add(
    SettlementCommands.drink,
    "装水带回",
    carriedJar
      ? jarHasRoom
        ? `把${nameOfObject(world, carriedJar)}灌满，再带回家。`
        : `${nameOfObject(world, carriedJar)}已经装满了。`
      : "手里先要有一个容器，才能装水带走。",
    1,
    Boolean(carriedJar) && jarHasRoom && waterHere,
    !carriedJar ? "手里没有可装的容器" : !waterHere ? "这里没有可取的水" : !jarHasRoom ? "容器已经满了" : "",
    carriedJar ? { containerId: carriedJar, resourceId: "resource:water" } : {},
  );

  const food = available.filter((point) => point.resourceId === "resource:cooked" || point.resourceId === "resource:grain");
  for (const point of food) {
    add(
      SettlementCommands.eat,
      `吃${point.label}`,
      "填饱肚子，也把手里的东西用掉。",
      1,
      true,
      "",
      { resourceId: point.resourceId, placeId },
    );
  }

  let rawGrainOffered = false;
  for (const relation of world.listRelations({ type: ObjectRelations.heldBy, to: actorId })) {
    const objectId = relation.from;
    const food = carriedFood(world, actorId, objectId);
    if (food === "resource:cooked") {
      add(SettlementCommands.eat, "吃一份随身熟食",
        "随身的熟食真正减少一份，饥饿程度降低；可在任何聚落地点食用。",
        1, true, "", { objectId, resourceId: "resource:cooked" });
    } else if (food === "resource:grain" && !rawGrainOffered) {
      rawGrainOffered = true;
      add(SettlementCommands.eat, "生嚼一份随身的粟",
        "没有熟食时也能充饥，但只缓解一半饥饿；这份粟就不能再播种或烘制了。",
        1, true, "", { objectId, resourceId: "resource:grain" });
    }
  }

  if (placeId === "place:hearth-yard") {
    const grainId = heldIngredient(world, actorId, "resource:grain");
    const fuelId = heldIngredient(world, actorId, "resource:fuel");
    add(SettlementCommands.cook, "烘制一份粟食",
      "在灶边用自己采集的粟与柴草加工一份可以带走的熟食。",
      1, Boolean(grainId && fuelId && spaceId === "space:hearth"),
      spaceId !== "space:hearth" ? "先走到灶边" : !grainId ? "缺少自己采集的一份粟" : !fuelId ? "缺少一捆自己采集的柴草" : "",
      {});
  }

  if (placeId === "place:hearth-yard" &&
      occupiedPlaceId(world, residentId("cook")) === placeId &&
      actorId !== residentId("cook")) {
    const grainId = heldIngredient(world, actorId, "resource:grain");
    const cook = residentId("cook");
    const fuelId = world.listRelations({ type: ObjectRelations.heldBy, to: cook })
      .map((r) => r.from).sort((a, b) => a.localeCompare(b))
      .find((id) => tradeReady(world, id, cook, "resource:fuel")) ?? "";
    const raw = world.getComponent(cook, SettlementComponents.resident)?.playerBarterQuote;
    const quote = raw && typeof raw === "object" && !Array.isArray(raw)
      ? raw as Record<string, JsonValue> : {};
    const pending = quote.customerId === actorId && quote.status === "offered" &&
      quote.at === world.tick;
    const finished = Number(world.getComponent(actorId, SettlementComponents.holding)?.playerTradeCount ?? 0) >= 1;
    if (pending) {
      const quotePayload = { grainId: String(quote.grainId ?? ""), fuelId: String(quote.fuelId ?? "") };
      add(SettlementCommands.playerBarterAccept, "接受阿灶报价：交 1 份粟，得 1 捆柴",
        "双方已经分别授权；确认后两件实物的持有权和所有权在同一事务中互换。",
        0, !finished && tradeReady(world, quotePayload.grainId, actorId, "resource:grain") &&
          tradeReady(world, quotePayload.fuelId, cook, "resource:fuel"),
        "双方物品必须仍在各自手里", quotePayload);
      add(SettlementCommands.playerBarterDecline, "拒绝这次报价",
        "拒绝只结束这次报价，不扣粮食或柴草。", 0, true, "", quotePayload);
    } else {
      add(SettlementCommands.playerBarterRequest, "向阿灶询价：用一份粟换一捆柴",
        "你先明确提出以自己的一份真实粟换柴；阿灶按实际库存和规则独立给出报价，随后由你决定接受或拒绝。",
        0, !finished && Boolean(grainId && fuelId),
        finished ? "你已与阿灶完成过本次交换" : !grainId ? "请先从田地采集一份属于自己的粟粮" :
          !fuelId ? "阿灶现在没有可交换的柴草，等他采集后再来" : "",
        grainId && fuelId ? { grainId, fuelId } : {});
    }
  }


  if (placeId === "place:hearth-yard" &&
      occupiedPlaceId(world, residentId("cook")) === placeId &&
      actorId !== residentId("cook")) {
    for (const [resourceId, label] of [
      ["resource:fuel", "一捆柴草"], ["resource:grain", "一份粟粮"],
    ] as const) {
      const itemId = heldIngredient(world, actorId, resourceId);
      const introduced = contactConversations(world, actorId, residentId("cook")) > 0;
      add(SettlementCommands.helpHearth, `交给阿灶${label}`,
        "送出一件真正属于自己的物品；阿灶会把柴草用于点火。不是固定任务。",
        0, Boolean(itemId && introduced),
        !introduced ? "请先向阿灶打听公灶的情况" : !itemId ? `随身没有属于自己的${label}` : "",
        { targetId: residentId("cook"), objectId: itemId, resourceId });
    }
  }

  if (placeId === "place:reedbed") {
    const inWeavingArea = spaceId === "space:reed-cut";
    const reeds = reedInputs(world, actorId);
    add(SettlementCommands.weaveBag, "编一只芦苇提袋",
      "用自己持有的两捆芦苇编出一只容量三件的提袋，可装入和取出实物。",
      0, inWeavingArea && reeds.length >= 2,
      !inWeavingArea ? "先到芦苇滩编织处" : reeds.length < 2 ? "缺少两捆自己的芦苇" : "");
    add(SettlementCommands.weaveMat, "编一张苇席",
      "用自己持有的两捆芦苇编席；带回住处休息，次日活动时间增加一格。",
      0, inWeavingArea && reeds.length >= 2,
      !inWeavingArea ? "先到芦苇滩编织处" : reeds.length < 2 ? "缺少两捆自己的芦苇" : "");
    add(SettlementCommands.prepareFiber, "剥取两束苇纤维",
      "真实消耗两捆自己持有的芦苇，加工出两束可以编衣的纤维。",
      0, inWeavingArea && reeds.length >= 2,
      !inWeavingArea ? "先到编织处" : reeds.length < 2 ? "缺少两捆自己的芦苇" : "");
    const fibers = fiberInputs(world, actorId);
    add(SettlementCommands.weaveWrap, "编一件纤维裹身",
      "消耗自己持有的两束纤维，织成可穿脱的裹身衣；穿着下田劳动节省一格活动。",
      0, inWeavingArea && fibers.length >= 2,
      !inWeavingArea ? "先到编织处" : fibers.length < 2 ? "缺少两束自己的纤维" : "");
  }

  const outfitId = wornByActor(world, actorId);
  for (const relation of world.listRelations({ type: ObjectRelations.heldBy, to: actorId })) {
    const id = relation.from;
    if (ownerOf(world, id) !== actorId ||
        !prototypeOf(world, id).capabilities.includes("wearable")) continue;
    if (outfitId === id) {
      add(ObjectCommands.unwear, `脱下${nameOfObject(world, id)}`,
        "脱下后仍保留原来的衣物，田间劳动恢复原活动开销。",
        0, true, "", { objectId: id });
    } else {
      add(ObjectCommands.wear, `穿上${nameOfObject(world, id)}`,
        "只能穿一件自己的衣物；纤维裹身在田间劳动时可节省一格活动时间。",
        0, !outfitId, outfitId ? "已有衣物穿着，需先脱下" : "", { objectId: id });
    }
  }

  // Use the shared world-objects container rules, not another inventory.
  const heldIds = world.listRelations({ type: ObjectRelations.heldBy, to: actorId })
    .map((relation) => relation.from).sort((a, b) => a.localeCompare(b));
  for (const bagId of heldIds) {
    if (ownerOf(world, bagId) !== actorId ||
        prototypeOf(world, bagId).prototypeId !== "prototype:carrying-bag") continue;
    const contents = contentsOf(world, bagId);
    const room = prototypeOf(world, bagId).capacity - contents.length;
    for (const objectId of heldIds) {
      if (objectId === bagId || ownerOf(world, objectId) !== actorId) continue;
      if (contents.includes(objectId)) continue;
      add(ObjectCommands.store, `把${nameOfObject(world, objectId)}装进提袋`,
        "真实放入容器，取出后仍是原来的那件物品。",
        0, room > 0, room <= 0 ? "提袋已装满" : "",
        { objectId, containerId: bagId });
    }
    for (const objectId of contents) {
      add(ObjectCommands.retrieve, `从提袋取出${nameOfObject(world, objectId)}`,
        "从提袋取回原物，可继续烹饪、使用或加工。",
        0, true, "", { objectId });
    }
  }

  if (placeId === "place:field") {
    const crop = fieldCrop(world);
    const grainId = heldIngredient(world, actorId, "resource:grain");
    const inField = spaceId === "space:field-edge";
    add(SettlementCommands.sow, "播种一份粟粒",
      "消耗一份随身粟粒作种子，种下后需照料并等待约三十天。",
      1, inField && !crop.seedId && Boolean(grainId),
      !inField ? "先到田头" : crop.seedId ? "这块田已播种" : !grainId ? "缺少一份自己的粟粒" : "");
    add(SettlementCommands.harvest, "收获田里的粟",
      "成熟且已照料的作物，一次收获三份真实粮食。",
      1, inField && crop.phase === "ready" && canCarryPrototype(world, actorId, "prototype:grain", "", CROP_YIELD),
      !inField ? "先到田头" : !crop.seedId ? "还没有播种" : !crop.tended ? "先照料田地" : crop.remainingDays ? `还需等待 ${crop.remainingDays} 天`
        : !canCarryPrototype(world, actorId, "prototype:grain", "", CROP_YIELD) ? "一次收三份，先腾出双手或行囊" : "");
  }

  const workSpace = SPACE_WORK[spaceId];
  if (workSpace) {
    add(SettlementCommands.tend, workSpace.label, workSpace.hint, workSpace.days, true, "", { spaceId });
  }

  const homeSpace = HOME_SPACES.includes(spaceId);
  if (homeSpace) {
    for (const matId of availableRestMats(world, actorId)) {
      add(SettlementCommands.rest, `铺开${nameOfObject(world, matId)}休息`,
        "用自己的苇席好好休息，次日增加一格活动时间；效果不叠加。",
        0, true, "", { spaceId, matId });
    }
  }
  add(
    SettlementCommands.rest,
    homeSpace ? "在家休息" : "歇一会儿",
    homeSpace ? "在自己家里休息；结束今天才会进入第二天。" : "这里不是住处，只能短暂歇脚。",
    homeSpace ? 0 : 1,
    true,
    "",
    { spaceId },
  );

  add(SettlementCommands.step, "让这一天过去", "时间向前走一天，聚落里的其他人也会继续过日子。", 1, true, "", {});
  actionAddExits(add, world, placeId);
  return actions;
}

function actionAddExits(
  add: (id: string, label: string, hint: string, days: number, enabled: boolean, reason: string, payload?: Record<string, JsonValue>) => void,
  world: WorldView,
  placeId: string,
): void {
  for (const place of PLACES) {
    if (place.id === placeId) continue;
    add(
      SettlementCommands.arrive,
      `走到${place.name}`,
      placeId ? `${PURPOSE[place.id] ?? "生活空间"}；村内步行花 1 格活动时间。` : `${PURPOSE[place.id] ?? "生活空间"}；旧版到达耗时 ${place.costDays} 天。`,
      placeId ? 0 : place.costDays,
      true,
      "",
      placeId ? { placeId: place.id, travelMode: "local" } : { placeId: place.id },
    );
  }
  // Rooms of the current place are one step away, not a day's walk.
  const authored = PLACES.find((place) => place.id === placeId);
  for (const space of authored?.spaces ?? []) {
    add(
      SpaceCommands.moveWithin,
      `走到${space.name}`,
      `就在这个院子里；${space.capacity > 0 ? `最多容纳 ${space.capacity} 人。` : "开阔处，不限制人数。"}`,
      0,
      true,
      "",
      { spaceId: space.id },
    );
  }
}

const HOME_SPACES = [
  "space:main-sleep", "space:yu-sleep", "space:lan-sleep", "space:reed-sleep",
  "space:clay-sleep", "space:water-sleep", "space:hearth-sleep", "space:ford-sleep",
];

const SPACE_WORK: Record<string, { label: string; hint: string; days: number }> = {
  "space:hearth": { label: "在灶边做饭", hint: "把粮食做成能吃的熟食，之后可以取用。", days: 1 },
  "space:field-edge": { label: "照看田地", hint: "除草、看水；田地会记得这次照看。", days: 1 },
  "space:kiln-mouth": { label: "看守窑火", hint: "看一次火候，学到的经验会留在手里。", days: 1 },
  "space:pit-edge": { label: "试挖黏土", hint: "看看这一层土适不适合做器。", days: 1 },
  "space:reed-cut": { label: "割芦苇", hint: "割一捆芦苇，可以编席、编绳。", days: 1 },
  "space:drying-rack": { label: "翻晾坯体", hint: "让湿坯干得更均匀。", days: 1 },
  "space:bank": { label: "在河边洗衣", hint: "把身上的东西洗一洗。", days: 1 },
  "space:ford-landing": { label: "在渡口等船", hint: "听听对岸最近的行情。", days: 1 },
};

function occupancyPlaceOf(world: WorldView, actorId: string): string {
  return occupiedPlaceId(world, actorId);
}

function jarInHand(world: WorldView, actorId: string): string {
  return world
    .listRelations({ type: ObjectRelations.heldBy, to: actorId })
    .map((relation) => relation.from)
    .find((id) => prototypeOf(world, id).capabilities.includes("liquid-holder")) ?? "";
}

function jarRoom(world: WorldView, actorId: string, jarId: string): number {
  const prototype = prototypeOf(world, jarId);
  const inside = contentsOf(world, jarId)
    .map((id) => readObject(world.getComponent(id, ObjectComponents.object)).quantity)
    .reduce((sum, amount) => sum + amount, 0);
  return Math.max(0, prototype.capacity - inside);
}

function nameOfObject(world: WorldView, objectId: string): string {
  const instance = readObject(world.getComponent(objectId, ObjectComponents.object));
  return instance.name || prototypeOf(world, objectId).name;
}

export function carrying(world: WorldView, actorId: string): { resourceId: string; label: string; count: number; unit: string }[] {
  const rows = new Map<string, { resourceId: string; label: string; count: number; unit: string }>();
  const held = world.listRelations({ type: ObjectRelations.heldBy, to: actorId }).map((relation) => relation.from);
  for (const objectId of held) {
    const entity = world.getEntity(objectId);
    if (!entity || entity.archivedAt !== undefined) continue;
    const prototype = prototypeOf(world, objectId);
    const instance = readObject(entity.components[ObjectComponents.object]);
    const amount = prototype.capacity > 0 && instance.quantity === 0 ? 1 : Math.max(1, instance.quantity);
    const row = rows.get(prototype.resourceId) ?? {
      resourceId: prototype.resourceId,
      label: RESOURCE_LABELS[prototype.resourceId] ?? prototype.name,
      count: 0,
      unit: prototype.unit,
    };
    row.count += amount;
    rows.set(prototype.resourceId, row);
    // Contents of a carried container travel with it.
    for (const inner of contentsOf(world, objectId)) {
      const innerPrototype = prototypeOf(world, inner);
      const innerInstance = readObject(world.getComponent(inner, ObjectComponents.object));
      const innerRow = rows.get(innerPrototype.resourceId) ?? {
        resourceId: innerPrototype.resourceId,
        label: RESOURCE_LABELS[innerPrototype.resourceId] ?? innerPrototype.name,
        count: 0,
        unit: innerPrototype.unit,
      };
      innerRow.count += Math.max(1, innerInstance.quantity);
      rows.set(innerPrototype.resourceId, innerRow);
    }
  }
  return [...rows.values()].sort((a, b) => a.resourceId.localeCompare(b.resourceId));
}

export function people(world: WorldView): { residents: Record<string, unknown>[]; households: number } {
  const residents = world
    .listEntities({ kind: "modern.character" })
    .filter((entity) => entity.archivedAt === undefined && Boolean(entity.components[SettlementComponents.resident]))
    .map((entity) => {
      const resident = readResident(world, entity.id)!;
      return {
        id: entity.id,
        name: String(entity.components["modern.identity"]?.givenName ?? entity.id),
        age: Math.floor((world.tick - Number(entity.components["modern.identity"]?.bornAt ?? world.tick)) / DAY_TICKS_PER_YEAR),
        ...resident,
        placeId: occupiedPlaceId(world, entity.id),
        placeName: PLACES.find((place) => place.id === occupiedPlaceId(world, entity.id))?.name ?? "",
        spaceName: String(world.getComponent(resident.homeSpace, SpaceComponents.space)?.name ?? ""),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  return { residents, households: new Set(residents.map((resident) => resident.household)).size };
}

export function worksites(world: WorldView): {
  places: { placeId: string; name: string; purpose: string; costDays: number; occupants: number; resources: YieldState[]; objects: number }[];
  totals: { resourceId: string; label: string; stock: number; capacity: number; unit: string }[];
} {
  const points = yieldPoints(world);
  const places = PLACES.map((place) => {
    // Objects count as "in this place" when they stand in the place itself or
    // in one of its spaces; a jar in the storage room is still the yard's jar.
    const holders = new Set<string>([place.id, ...place.spaces.map((space) => space.id)]);
    return {
      placeId: place.id,
      name: place.name,
      purpose: PURPOSE[place.id] ?? "生活空间",
      costDays: place.costDays,
      occupants: world.listRelations({ type: SpaceRelations.occupancy, to: place.id }).length,
      resources: points.filter((point) => point.placeId === place.id),
      objects: world
        .listEntities({ kind: ObjectKinds.item })
        .filter((entity) => entity.archivedAt === undefined)
        .filter((entity) =>
          world
            .listRelations({ type: ObjectRelations.containedIn, from: entity.id })
            .some((relation) => holders.has(relation.to)),
        ).length,
    };
  });
  const totals = new Map<string, { resourceId: string; label: string; stock: number; capacity: number; unit: string }>();
  for (const point of points) {
    const row = totals.get(point.resourceId) ?? {
      resourceId: point.resourceId,
      label: RESOURCE_LABELS[point.resourceId] ?? point.label,
      stock: 0, capacity: 0, unit: point.unit,
    };
    row.stock += point.stock;
    row.capacity += point.capacity;
    totals.set(point.resourceId, row);
  }
  return { places, totals: [...totals.values()].sort((a, b) => a.resourceId.localeCompare(b.resourceId)) };
}

function isStandingIn(world: WorldView, objectId: string, placeId: string): boolean {
  const container = world
    .listRelations({ type: ObjectRelations.containedIn, from: objectId })
    .map((relation) => relation.to)[0];
  return container === placeId;
}

function seasonOf(tick: number): string {
  const month = (Math.floor(tick / DAYS_PER_MONTH) % 12) + 1;
  if (month >= 3 && month <= 5) return "春";
  if (month >= 6 && month <= 8) return "夏";
  if (month >= 9 && month <= 11) return "秋";
  return "冬";
}

// ---------------------------------------------------------------------------
// Daily actions
// ---------------------------------------------------------------------------

/** A conversation is an encounter, not instant friendship.
 * One real resident, at the player's actual place, at most once each day.
 * Persistent contact grows from first greeting to acquaintance, never
 * secretly creates a new character or a family.friend_of relation.
 */
function registerTalk(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.talk}.allowed`,
    commandType: SettlementCommands.talk,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      const targetId = String(c.command.payload.targetId ?? "");
      if (!actorId || actorId === targetId ||
          c.world.getComponent("modern:world", "modern.world_state")?.activeCharacterId !== actorId)
        return refuse(SettlementRejection.NotYours, "只能由你自己主动搭话。");
      if (!c.world.getComponent(targetId, SettlementComponents.resident))
        return refuse(SettlementRejection.NoSuchResident, "这里没有这位可以搭话的村民。");
      if (!occupiedPlaceId(c.world, actorId) ||
          occupiedPlaceId(c.world, actorId) !== occupiedPlaceId(c.world, targetId))
        return refuse(SettlementRejection.WrongPlace, "需要走到对方面前，才可以搭话。");
      const raw = c.world.getComponent(actorId, SettlementComponents.holding)?.contacts;
      const contacts = raw && typeof raw === "object" && !Array.isArray(raw)
        ? raw as Record<string, JsonValue> : {};
      const contact = contacts[targetId];
      if (contact && typeof contact === "object" && !Array.isArray(contact) &&
          (contact as Record<string, JsonValue>).lastTalkAt === c.world.tick)
        return refuse(SettlementRejection.Already, "今天已经聊过了，明天再来吧。");
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.talk}.resolve`,
    commandType: SettlementCommands.talk,
    resolve: (c) => {
      const actorId = c.command.actorId as string;
      const targetId = String(c.command.payload.targetId);
      const raw = c.world.getComponent(actorId, SettlementComponents.holding)?.contacts;
      const contacts = raw && typeof raw === "object" && !Array.isArray(raw)
        ? { ...raw as Record<string, JsonValue> } : {};
      const before = contacts[targetId] && typeof contacts[targetId] === "object"
        ? contacts[targetId] as Record<string, JsonValue> : {};
      const conversations = Math.max(0, Number(before.conversations ?? 0)) + 1;
      contacts[targetId] = { firstMetAt: before.firstMetAt ?? c.world.tick,
        lastTalkAt: c.world.tick, conversations };
      return [{
        kind: "modifyComponent", entityId: actorId, component: SettlementComponents.holding,
        patch: { contacts }, reason: "player truly met and spoke with a present resident",
      }, {
        kind: "emitEvent", eventType: "settlement-locations.conversation",
        actorId, targetId,
        data: { conversations, relationship: conversations >= 3 ? "acquaintance" : "met" },
        historicalSignificance: 0.02,
      }];
    },
  });
}

function registerDraw(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.draw}.allowed`,
    commandType: SettlementCommands.draw,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      const placeId = String(c.command.payload.placeId ?? occupiedPlaceId(c.world, actorId));
      if (occupiedPlaceId(c.world, actorId) !== placeId) {
        return refuse(SettlementRejection.WrongPlace, "你得先走到那里，才能取用它的东西。");
      }
      const resourceId = String(c.command.payload.resourceId ?? "");
      const point = yieldPoints(c.world).find((candidate) => candidate.placeId === placeId && candidate.resourceId === resourceId);
      if (!point) return refuse(SettlementRejection.NoSuchPlace, "这个地方没有这种资源。");
      if (point.stock <= 0) {
        return refuse(SettlementRejection.Exhausted, `${point.label}这一季已经取尽了，过些时候才会回来。`);
      }
      if (!canCarryPrototype(c.world, actorId, prototypeForResource(resourceId)))
        return refuse(SettlementRejection.NoRoom, "你拿不下这么多东西。先放下或装进提袋。");
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: `${SettlementCommands.draw}.resolve`,
    commandType: SettlementCommands.draw,
    resolve: (c) => {
      const actorId = c.command.actorId as string;
      const placeId = String(c.command.payload.placeId ?? occupiedPlaceId(c.world, actorId));
      const resourceId = String(c.command.payload.resourceId);
      const point = yieldPoints(c.world).find((candidate) => candidate.placeId === placeId && candidate.resourceId === resourceId)!;
      // How much one draw can take is bounded by what the place holds, never by
      // a fixed 1: a player carrying a basket should be able to carry a basket.
      const amount = clampInt(c.command.payload.amount, 1, 1, point.stock);
      const taken = Math.min(amount, point.stock);

      // A draw is one transaction: the place loses exactly what the player
      // gains, and the item that carries it is spawned in the same commit.
      const effects: Effect[] = [{
        kind: "setComponent",
        entityId: `yield:${placeId}:${resourceId}`,
        component: SettlementComponents.yieldPoint,
        value: {
          placeId, resourceId, label: point.label, unit: point.unit,
          capacity: point.capacity, stock: point.stock - taken,
          renewDays: point.renewDays, lastRenewedAt: renewalAnchor(point, c.world.tick),
        },
      }];

      const prototypeId = prototypeForResource(resourceId);
      // Gathered objects are keyed by tick *and* by how much the place has
      // already given up, so two draws in one tick cannot collide while the id
      // stays deterministic for a given seed and command sequence.
      for (let index = 0; index < taken; index += 1) {
        const objectId = `settlement-locations:gathered:${c.world.tick}:${placeId}:${resourceId}:${point.stock - taken + index}`;
        effects.push({
          kind: "spawnEntity",
          localId: `gathered:${index}`,
          id: objectId,
          entityKind: ObjectKinds.item,
          components: {
            [ObjectComponents.object]: {
              prototypeId, name: "", condition: "fresh", quantity: 1,
              durability: 0, madeAt: c.world.tick,
              provenance: { from: placeId, at: c.world.tick },
              visibleFromOutside: true,
            } as unknown as Record<string, never>,
          },
          announce: false,
        }, {
          kind: "addRelation",
          type: ObjectRelations.instanceOf,
          from: objectId,
          to: prototypeId,
          announce: false,
        }, {
          kind: "addRelation",
          type: ObjectRelations.ownedBy,
          from: objectId,
          to: actorId,
          announce: false,
        }, {
          kind: "addRelation",
          type: ObjectRelations.heldBy,
          from: objectId,
          to: actorId,
          announce: false,
        });
      }

      effects.push({
        kind: "emitEvent",
        eventType: "settlement-locations.gathered",
        actorId,
        targetId: placeId,
        data: { placeId, resourceId, amount: taken, remaining: point.stock - taken },
        historicalSignificance: 0,
      });
      return effects;
    },
  });
}

function registerDrink(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.drink}.allowed`,
    commandType: SettlementCommands.drink,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      const containerId = String(c.command.payload.containerId ?? "");
      const holder = holderOf(c.world, containerId);
      if (containerId && holder !== actorId) {
        return refuse(SettlementRejection.NotYours, "要先把容器拿在手里。");
      }
      if (!containerId) return refuse(SettlementRejection.NotYours, "手里没有可装的容器。");
      const prototype = prototypeOf(c.world, containerId);
      if (!prototype.capabilities.includes("liquid-holder")) {
        return refuse(SettlementRejection.NotYours, `${prototype.name}装不了水。`);
      }
      if (jarRoom(c.world, actorId, containerId) <= 0) {
        return refuse(SettlementRejection.NoRoom, `${prototype.name}已经装满了。`);
      }
      const placeId = occupiedPlaceId(c.world, actorId);
      const water = yieldPoints(c.world).some((point) => point.placeId === placeId && point.resourceId === "resource:water" && point.stock > 0);
      if (!water) return refuse(SettlementRejection.NoSuchPlace, "这里没有可取的水。");
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: `${SettlementCommands.drink}.resolve`,
    commandType: SettlementCommands.drink,
    resolve: (c) => fillEffects(c.world, c.command.actorId as string, String(c.command.payload.containerId), "resource:water", c.world.tick),
  });
}

function registerEat(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.eat}.allowed`,
    commandType: SettlementCommands.eat,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      const objectId = String(c.command.payload.objectId ?? "");
      if (objectId) {
        if (!carriedFood(c.world, actorId, objectId)) {
          return refuse(SettlementRejection.NotYours, "要先亲自持有一份可以吃的食物。");
        }
        return { ok: true };
      }
      // Legacy shared meals remain available at the public food point.
      const placeId = occupiedPlaceId(c.world, actorId);
      const resourceId = String(c.command.payload.resourceId ?? "");
      const point = yieldPoints(c.world).find((candidate) => candidate.placeId === placeId && candidate.resourceId === resourceId);
      if (!point || point.stock <= 0 || !["resource:cooked", "resource:grain"].includes(resourceId)) {
        return refuse(SettlementRejection.Empty, "这里现在没有能吃的东西。");
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: `${SettlementCommands.eat}.resolve`,
    commandType: SettlementCommands.eat,
    resolve: (c) => {
      const actorId = c.command.actorId as string;
      const objectId = String(c.command.payload.objectId ?? "");
      const before = hungerLevel(c.world, actorId);
      const eaten = objectId ? carriedFood(c.world, actorId, objectId) : String(c.command.payload.resourceId ?? "");
      const after = Math.max(0, before - (HUNGER_EASED[eaten] ?? 4));
      const effects: Effect[] = [{
        kind: "modifyComponent",
        entityId: actorId,
        component: SettlementComponents.holding,
        patch: { hunger: after, hungerAt: c.world.tick },
        reason: "eating eases hunger; future hunger follows the world clock",
      }];
      if (objectId) {
        const item = readObject(c.world.getComponent(objectId, ObjectComponents.object));
        if (item.quantity > 1) {
          effects.push({
            kind: "modifyComponent", entityId: objectId, component: ObjectComponents.object,
            patch: { quantity: item.quantity - 1 }, reason: "one carried portion eaten",
          });
        } else {
          effects.push({
            kind: "removeRelation", type: ObjectRelations.heldBy,
            from: objectId, to: actorId, reason: "carried food eaten", announce: false,
          }, {
            kind: "archiveEntity", entityId: objectId, reason: "consumed by eating", announce: false,
          });
        }
        effects.push({
          kind: "emitEvent", eventType: "settlement-locations.ate",
          actorId, targetId: objectId,
          data: { objectId, resourceId: eaten, from: "carried", shared: false, hungerBefore: before, hungerAfter: after },
          historicalSignificance: 0,
        });
      } else {
        const placeId = occupiedPlaceId(c.world, actorId);
        const resourceId = String(c.command.payload.resourceId);
        const point = yieldPoints(c.world).find((candidate) => candidate.placeId === placeId && candidate.resourceId === resourceId)!;
        effects.push({
          kind: "setComponent",
          entityId: `yield:${placeId}:${resourceId}`,
          component: SettlementComponents.yieldPoint,
          value: {
            placeId, resourceId, label: point.label, unit: point.unit,
            capacity: point.capacity, stock: point.stock - 1,
            renewDays: point.renewDays, lastRenewedAt: renewalAnchor(point, c.world.tick),
          },
        }, {
          kind: "emitEvent", eventType: "settlement-locations.ate",
          actorId, targetId: placeId,
          data: { resourceId, label: point.label, from: "share", shared: true, hungerBefore: before, hungerAfter: after },
          historicalSignificance: 0,
        });
      }
      return effects;
    },
  });
}


/**
 * M2-A1: turn one personally gathered grain and one fuel bundle into one
 * cooked ration at the shared hearth.  Inputs and output share one transaction.
 */
function heldIngredient(world: WorldView, actorId: string, resourceId: string): string {
  return world.listRelations({ type: ObjectRelations.heldBy, to: actorId })
    .map((relation) => relation.from)
    .sort((a, b) => a.localeCompare(b))
    .find((id) => {
      const entity = world.getEntity(id);
      if (!entity || entity.archivedAt !== undefined) return false;
      return ownerOf(world, id) === actorId
        && prototypeOf(world, id).resourceId === resourceId
        && readObject(entity.components[ObjectComponents.object]).quantity === 1;
    }) ?? "";
}

function registerCook(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.cook}.allowed`,
    commandType: SettlementCommands.cook,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      if (occupiedPlaceId(c.world, actorId) !== "place:hearth-yard" ||
          occupiedSpaceId(c.world, actorId) !== "space:hearth") {
        return refuse(SettlementRejection.WrongPlace, "需要先到公用灶台的灶边。");
      }
      if (!c.world.getEntity("prototype:cooked-food")) {
        return refuse(SettlementRejection.Empty, "这里尚不能加工粮食。");
      }
      if (!heldIngredient(c.world, actorId, "resource:grain")) {
        return refuse(SettlementRejection.Empty, "需先采集一份自己持有的粟。");
      }
      if (!heldIngredient(c.world, actorId, "resource:fuel")) {
        return refuse(SettlementRejection.Empty, "还需要一捆自己采集的柴草。");
      }
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.cook}.resolve`,
    commandType: SettlementCommands.cook,
    resolve: (c) => {
      const actorId = c.command.actorId as string;
      const grainId = heldIngredient(c.world, actorId, "resource:grain");
      const fuelId = heldIngredient(c.world, actorId, "resource:fuel");
      const cookedId = `settlement-locations:cooked:${grainId}`;
      const effects: Effect[] = [];
      for (const ingredientId of [grainId, fuelId]) {
        effects.push({
          kind: "removeRelation", type: ObjectRelations.heldBy,
          from: ingredientId, to: actorId, reason: "consumed in cooking", announce: false,
        }, {
          kind: "archiveEntity", entityId: ingredientId,
          reason: "consumed in cooking", announce: false,
        });
      }
      effects.push({
        kind: "spawnEntity",
        localId: "cooked-ration",
        id: cookedId,
        entityKind: ObjectKinds.item,
        components: {
          [ObjectComponents.object]: {
            prototypeId: "prototype:cooked-food", name: "灶边烘粟", condition: "fresh",
            quantity: 1, durability: 0, madeAt: c.world.tick,
            provenance: { fromGrainId: grainId, fromFuelId: fuelId, at: c.world.tick },
            visibleFromOutside: false,
          } as unknown as Record<string, never>,
        },
        announce: false,
      }, {
        kind: "addRelation", type: ObjectRelations.instanceOf,
        from: cookedId, to: "prototype:cooked-food", announce: false,
      }, {
        kind: "addRelation", type: ObjectRelations.ownedBy,
        from: cookedId, to: actorId, announce: false,
      }, {
        kind: "addRelation", type: ObjectRelations.heldBy,
        from: cookedId, to: actorId, announce: false,
      }, {
        kind: "emitEvent", eventType: "settlement-locations.cooked",
        actorId, targetId: cookedId,
        data: { grainId, fuelId, cookedId, placeId: "place:hearth-yard" },
        historicalSignificance: 0.04,
      });
      return effects;
    },
  });
}


/** M2-B-A: weave two personally held reed bundles into a real carrying bag.
 * The original bundles are archived in the same world transaction.
 */
function reedInputs(world: WorldView, actorId: string): string[] {
  return world.listRelations({ type: ObjectRelations.heldBy, to: actorId })
    .map((relation) => relation.from)
    .filter((objectId) => {
      const item = world.getEntity(objectId);
      return item?.kind === ObjectKinds.item && item.archivedAt === undefined &&
        ownerOf(world, objectId) === actorId &&
        prototypeOf(world, objectId).resourceId === "resource:reed" &&
        readObject(item.components[ObjectComponents.object]).quantity === 1;
    })
    .sort((a, b) => a.localeCompare(b));
}

function registerWeaveBag(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.weaveBag}.allowed`,
    commandType: SettlementCommands.weaveBag,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      if (occupiedPlaceId(c.world, actorId) !== "place:reedbed" ||
          occupiedSpaceId(c.world, actorId) !== "space:reed-cut") {
        return refuse(SettlementRejection.WrongPlace, "编织芦苇提袋需要在芦苇滩的编织处操作。");
      }
      if (reedInputs(c.world, actorId).length < 2) {
        return refuse(SettlementRejection.Empty, "需要自己持有的两捆芦苇才能编袋。");
      }
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.weaveBag}.resolve`,
    commandType: SettlementCommands.weaveBag,
    resolve: (c) => {
      const actorId = c.command.actorId as string;
      const inputs = reedInputs(c.world, actorId).slice(0, 2);
      const bagId = `settlement-locations:reed-bag:${inputs[0]}`;
      const effects: Effect[] = [];
      for (const id of inputs) {
        effects.push({
          kind: "removeRelation", type: ObjectRelations.heldBy,
          from: id, to: actorId, reason: "reeds woven into a bag", announce: false,
        }, {
          kind: "archiveEntity", entityId: id,
          reason: "reeds woven into a bag", announce: false,
        });
      }
      effects.push({
        kind: "spawnEntity", localId: "woven-bag", id: bagId,
        entityKind: ObjectKinds.item, announce: false,
        components: {
          [ObjectComponents.object]: {
            prototypeId: "prototype:carrying-bag", name: "芦苇提袋",
            condition: "woven", quantity: 1, durability: 28, madeAt: c.world.tick,
            provenance: { reedIds: inputs, placeId: "place:reedbed", at: c.world.tick },
            visibleFromOutside: true,
          } as unknown as Record<string, never>,
        },
      }, {
        kind: "addRelation", type: ObjectRelations.instanceOf,
        from: bagId, to: "prototype:carrying-bag", announce: false,
      }, {
        kind: "addRelation", type: ObjectRelations.ownedBy,
        from: bagId, to: actorId, announce: false,
      }, {
        kind: "addRelation", type: ObjectRelations.heldBy,
        from: bagId, to: actorId, announce: false,
      }, {
        kind: "emitEvent", eventType: "settlement-locations.bag_woven",
        actorId, targetId: bagId,
        data: { bagId, reedIds: inputs, capacity: 3 },
        historicalSignificance: 0.03,
      });
      return effects;
    },
  });
}

/** Only one's own, directly held or locally laid-out mat can help rest. */
function availableRestMats(world: WorldView, actorId: string): string[] {
  const placeId = occupiedPlaceId(world, actorId);
  const spaceId = occupiedSpaceId(world, actorId);
  if (!HOME_SPACES.includes(spaceId)) return [];
  return world.listEntities({ kind: ObjectKinds.item })
    .filter((entity) => entity.archivedAt === undefined)
    .filter((entity) => {
      if (ownerOf(world, entity.id) !== actorId ||
          prototypeOf(world, entity.id).prototypeId !== "prototype:mat") return false;
      const holder = holderOf(world, entity.id);
      if (holder === actorId) return true;
      if (holder) return false;
      const location = containerOf(world, entity.id);
      return location === placeId || location === spaceId;
    })
    .map((entity) => entity.id).sort((a, b) => a.localeCompare(b));
}

/** Two gathered reed bundles become a single portable mat with source IDs. */
function registerWeaveMat(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.weaveMat}.allowed`,
    commandType: SettlementCommands.weaveMat,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      if (occupiedPlaceId(c.world, actorId) !== "place:reedbed" ||
          occupiedSpaceId(c.world, actorId) !== "space:reed-cut") {
        return refuse(SettlementRejection.WrongPlace, "必须到芦苇滩的编织处制作苇席。");
      }
      if (reedInputs(c.world, actorId).length < 2) {
        return refuse(SettlementRejection.Empty, "制作苇席需要自己持有的两捆芦苇。");
      }
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.weaveMat}.resolve`,
    commandType: SettlementCommands.weaveMat,
    resolve: (c) => {
      const actorId = c.command.actorId as string;
      const reedIds = reedInputs(c.world, actorId).slice(0, 2);
      const matId = `settlement-locations:reed-mat:${reedIds[0]}`;
      const effects: Effect[] = [];
      for (const reedId of reedIds) {
        effects.push({
          kind: "removeRelation", type: ObjectRelations.heldBy,
          from: reedId, to: actorId, reason: "reed woven into a sleeping mat", announce: false,
        }, {
          kind: "archiveEntity", entityId: reedId,
          reason: "reed woven into a sleeping mat", announce: false,
        });
      }
      effects.push({
        kind: "spawnEntity", localId: "woven-mat", id: matId,
        entityKind: ObjectKinds.item, announce: false,
        components: {
          [ObjectComponents.object]: {
            prototypeId: "prototype:mat", name: "自己编的苇席",
            condition: "woven", quantity: 1, durability: 40, madeAt: c.world.tick,
            provenance: { reedIds, placeId: "place:reedbed", at: c.world.tick },
            visibleFromOutside: true,
          } as unknown as Record<string, never>,
        },
      }, {
        kind: "addRelation", type: ObjectRelations.instanceOf,
        from: matId, to: "prototype:mat", announce: false,
      }, {
        kind: "addRelation", type: ObjectRelations.ownedBy,
        from: matId, to: actorId, announce: false,
      }, {
        kind: "addRelation", type: ObjectRelations.heldBy,
        from: matId, to: actorId, announce: false,
      }, {
        kind: "emitEvent", eventType: "settlement-locations.mat_woven",
        actorId, targetId: matId,
        data: { matId, reedIds },
        historicalSignificance: 0.03,
      });
      return effects;
    },
  });
}

/** M2-B-C: fibre processing and clothing both consume real, directly carried inputs. */
function fiberInputs(world: WorldView, actorId: string): string[] {
  return world.listRelations({ type: ObjectRelations.heldBy, to: actorId })
    .map((r) => r.from)
    .filter((id) => {
      const entity = world.getEntity(id);
      return entity?.kind === ObjectKinds.item && entity.archivedAt === undefined &&
        ownerOf(world, id) === actorId &&
        prototypeOf(world, id).prototypeId === "prototype:fiber-bundle" &&
        readObject(entity.components[ObjectComponents.object]).quantity === 1;
    }).sort((a, b) => a.localeCompare(b));
}

function registerPrepareFiber(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.prepareFiber}.allowed`,
    commandType: SettlementCommands.prepareFiber,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      if (occupiedPlaceId(c.world, actorId) !== "place:reedbed" ||
          occupiedSpaceId(c.world, actorId) !== "space:reed-cut") {
        return refuse(SettlementRejection.WrongPlace, "要在芦苇滩的编织处剥取植物纤维。");
      }
      if (reedInputs(c.world, actorId).length < 2) {
        return refuse(SettlementRejection.Empty, "需要自己持有的两捆芦苇才能整理出两束纤维。");
      }
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.prepareFiber}.resolve`,
    commandType: SettlementCommands.prepareFiber,
    resolve: (c) => {
      const actorId = c.command.actorId as string;
      const reedIds = reedInputs(c.world, actorId).slice(0, 2);
      const effects: Effect[] = [];
      for (const reedId of reedIds) {
        const fiberId = `settlement-locations:processed-fiber:${reedId}`;
        effects.push({
          kind: "removeRelation", type: ObjectRelations.heldBy,
          from: reedId, to: actorId, reason: "reed stripped for weaving fibers", announce: false,
        }, {
          kind: "archiveEntity", entityId: reedId,
          reason: "converted from reed into fiber", announce: false,
        }, {
          kind: "spawnEntity", localId: `fiber-${fiberId}`, id: fiberId,
          entityKind: ObjectKinds.item, announce: false,
          components: {
            [ObjectComponents.object]: {
              prototypeId: "prototype:fiber-bundle", name: "整理好的苇纤维",
              condition: "prepared", quantity: 1, durability: 0, madeAt: c.world.tick,
              provenance: { fromReedId: reedId, placeId: "place:reedbed", at: c.world.tick },
              visibleFromOutside: false,
            } as unknown as Record<string, never>,
          },
        }, {
          kind: "addRelation", type: ObjectRelations.instanceOf, from: fiberId,
          to: "prototype:fiber-bundle", announce: false,
        }, {
          kind: "addRelation", type: ObjectRelations.ownedBy, from: fiberId,
          to: actorId, announce: false,
        }, {
          kind: "addRelation", type: ObjectRelations.heldBy, from: fiberId,
          to: actorId, announce: false,
        });
      }
      effects.push({
        kind: "emitEvent", eventType: "settlement-locations.fiber_prepared",
        actorId, data: { reedIds, fiberCount: 2 }, historicalSignificance: 0.02,
      });
      return effects;
    },
  });
}

function registerWeaveWrap(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.weaveWrap}.allowed`,
    commandType: SettlementCommands.weaveWrap,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      if (occupiedPlaceId(c.world, actorId) !== "place:reedbed" ||
          occupiedSpaceId(c.world, actorId) !== "space:reed-cut") {
        return refuse(SettlementRejection.WrongPlace, "要在芦苇滩的编织处编织裹身衣。");
      }
      if (fiberInputs(c.world, actorId).length < 2) {
        return refuse(SettlementRejection.Empty, "需要两束自己持有的植物纤维。");
      }
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.weaveWrap}.resolve`,
    commandType: SettlementCommands.weaveWrap,
    resolve: (c) => {
      const actorId = c.command.actorId as string;
      const fiberIds = fiberInputs(c.world, actorId).slice(0, 2);
      const wrapId = `settlement-locations:fiber-wrap:${fiberIds[0]}`;
      const effects: Effect[] = [];
      for (const fiberId of fiberIds) {
        effects.push({
          kind: "removeRelation", type: ObjectRelations.heldBy,
          from: fiberId, to: actorId, reason: "fibers woven into one wrap", announce: false,
        }, {
          kind: "archiveEntity", entityId: fiberId,
          reason: "fiber used in woven clothing", announce: false,
        });
      }
      effects.push({
        kind: "spawnEntity", localId: "woven-fiber-wrap", id: wrapId,
        entityKind: ObjectKinds.item, announce: false,
        components: {
          [ObjectComponents.object]: {
            prototypeId: "prototype:fiber-wrap", name: "自己编的纤维裹身",
            condition: "woven", quantity: 1, durability: 25, madeAt: c.world.tick,
            provenance: { fromFiberIds: fiberIds, placeId: "place:reedbed", at: c.world.tick },
            visibleFromOutside: false,
          } as unknown as Record<string, never>,
        },
      }, {
        kind: "addRelation", type: ObjectRelations.instanceOf, from: wrapId,
        to: "prototype:fiber-wrap", announce: false,
      }, {
        kind: "addRelation", type: ObjectRelations.ownedBy, from: wrapId,
        to: actorId, announce: false,
      }, {
        kind: "addRelation", type: ObjectRelations.heldBy, from: wrapId,
        to: actorId, announce: false,
      }, {
        kind: "emitEvent", eventType: "settlement-locations.wrap_woven",
        actorId, targetId: wrapId, data: { fiberIds, wrapId },
        historicalSignificance: 0.03,
      });
      return effects;
    },
  });
}

function registerSow(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.sow}.allowed`,
    commandType: SettlementCommands.sow,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      if (occupiedPlaceId(c.world, actorId) !== "place:field" ||
          occupiedSpaceId(c.world, actorId) !== "space:field-edge") {
        return refuse(SettlementRejection.WrongPlace, "必须到河岸旱地的田头播种。");
      }
      if (fieldCrop(c.world).seedId) {
        return refuse(SettlementRejection.Busy, "这块田已经种了粟，先等收获后再播种。");
      }
      if (!heldIngredient(c.world, actorId, "resource:grain")) {
        return refuse(SettlementRejection.Empty, "播种需要一份自己持有的真实粟粒。");
      }
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.sow}.resolve`,
    commandType: SettlementCommands.sow,
    resolve: (c) => {
      const actorId = c.command.actorId as string;
      const seedId = heldIngredient(c.world, actorId, "resource:grain");
      const previous = fieldCrop(c.world);
      return [{
        kind: "removeRelation", type: ObjectRelations.heldBy, from: seedId, to: actorId,
        reason: "grain planted as seed", announce: false,
      }, {
        kind: "archiveEntity", entityId: seedId, reason: "grain planted as seed", announce: false,
      }, {
        kind: "setComponent", entityId: "place:field",
        component: SettlementComponents.cropPlot,
        value: { seedId, sownAt: c.world.tick, tended: false, harvests: previous.harvests },
        reason: "sow grain in the field",
      }, {
        kind: "emitEvent", eventType: "settlement-locations.sown",
        actorId, targetId: "place:field", data: { seedId, matureAt: c.world.tick + CROP_GROW_DAYS },
        historicalSignificance: 0.04,
      }];
    },
  });
}

function registerHarvest(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.harvest}.allowed`,
    commandType: SettlementCommands.harvest,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      if (occupiedPlaceId(c.world, actorId) !== "place:field" ||
          occupiedSpaceId(c.world, actorId) !== "space:field-edge") {
        return refuse(SettlementRejection.WrongPlace, "需要亲自到田头收获。");
      }
      const crop = fieldCrop(c.world);
      if (!crop.seedId) return refuse(SettlementRejection.Empty, "这块地还没有播种。");
      if (!crop.tended) return refuse(SettlementRejection.Busy, "粟田还没照料，不能收获。");
      if (crop.remainingDays > 0) return refuse(SettlementRejection.Busy, `粟还要生长约 ${crop.remainingDays} 天。`);
      if (!canCarryPrototype(c.world, actorId, "prototype:grain", "", CROP_YIELD))
        return refuse(SettlementRejection.NoRoom, "一次收三份粮食，先腾出双手和行囊空间再收获。");
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.harvest}.resolve`,
    commandType: SettlementCommands.harvest,
    resolve: (c) => {
      const actorId = c.command.actorId as string;
      const crop = fieldCrop(c.world);
      const effects: Effect[] = [{
        kind: "setComponent", entityId: "place:field",
        component: SettlementComponents.cropPlot,
        value: { seedId: "", sownAt: 0, tended: false, harvests: crop.harvests + 1 },
        reason: "harvest completed; plot is fallow again",
      }];
      for (let index = 0; index < CROP_YIELD; index += 1) {
        const objectId = `settlement-locations:harvest:${crop.seedId}:${index}`;
        effects.push({
          kind: "spawnEntity", localId: `harvest-${index}`, id: objectId,
          entityKind: ObjectKinds.item, announce: false,
          components: {
            [ObjectComponents.object]: {
              prototypeId: "prototype:grain", name: "新收的粟", condition: "fresh",
              quantity: 1, durability: 0, madeAt: c.world.tick,
              provenance: { seedId: crop.seedId, from: "place:field", at: c.world.tick },
              visibleFromOutside: false,
            } as unknown as Record<string, never>,
          },
        }, {
          kind: "addRelation", type: ObjectRelations.instanceOf,
          from: objectId, to: "prototype:grain", announce: false,
        }, {
          kind: "addRelation", type: ObjectRelations.ownedBy,
          from: objectId, to: actorId, announce: false,
        }, {
          kind: "addRelation", type: ObjectRelations.heldBy,
          from: objectId, to: actorId, announce: false,
        });
      }
      effects.push({
        kind: "emitEvent", eventType: "settlement-locations.harvested",
        actorId, targetId: "place:field",
        data: { seedId: crop.seedId, amount: CROP_YIELD, harvests: crop.harvests + 1 },
        historicalSignificance: 0.07,
      });
      return effects;
    },
  });
}


function registerTend(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.tend}.allowed`,
    commandType: SettlementCommands.tend,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      const spaceId = String(c.command.payload.spaceId ?? occupiedSpaceId(c.world, actorId));
      if (!spaceId) return refuse(SettlementRejection.WrongPlace, "你不在哪个工作的地方。");
      const space = c.world.getEntity(spaceId);
      if (!space || space.kind !== SpaceKinds.space) {
        return refuse(SettlementRejection.NoSuchPlace, "这里没有这样一个工作的地方。");
      }
      if (occupiedSpaceId(c.world, actorId) !== spaceId) {
        return refuse(SettlementRejection.WrongPlace, "要先走到那个位置上。");
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: `${SettlementCommands.tend}.resolve`,
    commandType: SettlementCommands.tend,
    resolve: (c) => {
      const actorId = c.command.actorId as string;
      const spaceId = String(c.command.payload.spaceId ?? occupiedSpaceId(c.world, actorId));
      const work = SPACE_WORK[spaceId];
      const effects: Effect[] = [{
        kind: "modifyComponent",
        entityId: actorId,
        component: SettlementComponents.holding,
        patch: {
          lastWorkSpace: spaceId,
          lastWorkAt: c.world.tick,
          workCount: Number(c.world.getComponent(actorId, SettlementComponents.holding)?.workCount ?? 0) + 1,
        },
        reason: "a day of work at a settlement worksite",
      }, {
        kind: "emitEvent",
        eventType: "settlement-locations.worked",
        actorId,
        targetId: spaceId,
        data: { spaceId, label: work?.label ?? "劳作" },
        historicalSignificance: 0,
      }];
      const crop = fieldCrop(c.world);
      if (spaceId === "space:field-edge" && crop.seedId && !crop.tended) {
        effects.push({
          kind: "setComponent", entityId: "place:field",
          component: SettlementComponents.cropPlot,
          value: { seedId: crop.seedId, sownAt: crop.sownAt, tended: true, harvests: crop.harvests },
          reason: "field tended after sowing",
        });
      }
      return effects;
    },
  });
}

function registerRest(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.rest}.allowed`,
    commandType: SettlementCommands.rest,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      if (!occupiedPlaceId(c.world, actorId)) {
        return refuse(SettlementRejection.WrongPlace, "先走进一个能休息的地方。");
      }
      const matId = String(c.command.payload.matId ?? "");
      if (matId && !availableRestMats(c.world, actorId).includes(matId)) {
        return refuse(SettlementRejection.NotYours, "只有在住处铺开自己持有或放在身边的苇席才能好好休息。");
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: `${SettlementCommands.rest}.resolve`,
    commandType: SettlementCommands.rest,
    resolve: (c) => {
      const matId = String(c.command.payload.matId ?? "");
      const hadBonusToday = dailyActivity(c.world, c.command.actorId as string).capacity > DAILY_ACTIVITY_CAPACITY;
      return [{
        kind: "modifyComponent", entityId: c.command.actorId as string,
        component: SettlementComponents.holding,
        patch: { lastRestedAt: c.world.tick, ...(matId ? {
          matRestedAt: c.world.tick,
          ...(hadBonusToday ? { matBonusPreservedAt: c.world.tick } : {}),
        } : {}) },
        reason: matId ? "well rested using an owned sleeping mat" : "rested at the settlement",
      }, {
        kind: "emitEvent", eventType: "settlement-locations.rested",
        actorId: c.command.actorId,
        data: { placeId: occupiedPlaceId(c.world, c.command.actorId as string),
          matId: matId || null, nextDayExtraActivity: matId ? 1 : 0 },
        historicalSignificance: 0,
      }];
    },
  });
}

/**
 * "Let a day pass."
 *
 * This is the one action that moves the clock. It is a command, not a direct
 * `advanceBy`, so the day boundary is still observed by the scheduler and the
 * month pulse stays honest (TIME-RFC-001).
 */
function registerEndDay(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.step}.allowed`,
    commandType: SettlementCommands.step,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      if (!c.world.hasEntity(actorId)) return refuse(SettlementRejection.NoSuchResident, "需要一位正在生活的人。");
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: `${SettlementCommands.step}.resolve`,
    commandType: SettlementCommands.step,
    resolve: (c) => [{
      kind: "modifyComponent",
      entityId: c.command.actorId as string,
      component: SettlementComponents.holding,
      patch: { daysLived: Number(c.world.getComponent(c.command.actorId as string, SettlementComponents.holding)?.daysLived ?? 0) + 1 },
      reason: "one day of settlement life passed",
    }, {
      kind: "emitEvent",
      eventType: "settlement-locations.day_passed",
      actorId: c.command.actorId,
      data: { placeId: occupiedPlaceId(c.world, c.command.actorId as string), tick: c.world.tick },
      historicalSignificance: 0,
    }],
  });
}

/**
 * Fills a carried container from a place's water, in one transaction.
 *
 * The container gains contents and the place loses exactly the same amount, so
 * the two halves can never diverge (OBJ-001 stock conservation).
 */
export function fillEffects(world: WorldView, actorId: string, containerId: string, resourceId: string, tick: number): Effect[] {
  const prototype = prototypeOf(world, containerId);
  const room = jarRoom(world, actorId, containerId);
  const placeId = occupiedPlaceId(world, actorId);
  const point = yieldPoints(world).find((candidate) => candidate.placeId === placeId && candidate.resourceId === resourceId);
  const amount = Math.max(0, Math.min(room, point?.stock ?? 0, prototype.capacity));
  if (amount <= 0 || !point) return [];

  const effects: Effect[] = [{
    kind: "setComponent",
    entityId: `yield:${placeId}:${resourceId}`,
    component: SettlementComponents.yieldPoint,
    value: {
      placeId, resourceId, label: point.label, unit: point.unit,
      capacity: point.capacity, stock: point.stock - amount,
      renewDays: point.renewDays, lastRenewedAt: renewalAnchor(point, tick),
    },
  }];

  const prototypeId = prototypeForResource(resourceId);
  const contents = contentsOf(world, containerId);
  const waterId = contents.find((id) => prototypeOf(world, id).resourceId === resourceId);
  if (waterId) {
    const current = readObject(world.getComponent(waterId, ObjectComponents.object));
    effects.push({
      kind: "modifyComponent",
      entityId: waterId,
      component: ObjectComponents.object,
      patch: { quantity: current.quantity + amount, condition: "fresh" },
      reason: "container filled from the settlement water point",
    });
  } else {
    const objectId = `settlement-locations:filled:${tick}:${resourceId}`;
    effects.push({
      kind: "spawnEntity",
      localId: "filled",
      id: objectId,
      entityKind: ObjectKinds.item,
      components: {
        [ObjectComponents.object]: {
          prototypeId, name: "", condition: "fresh", quantity: amount,
          durability: 0, madeAt: tick, provenance: { from: placeId, at: tick },
          visibleFromOutside: false,
        } as unknown as Record<string, never>,
      },
      announce: false,
    }, {
      kind: "addRelation",
      type: ObjectRelations.instanceOf,
      from: objectId,
      to: prototypeId,
      announce: false,
    }, {
      kind: "addRelation",
      type: ObjectRelations.ownedBy,
      from: objectId,
      to: actorId,
      announce: false,
    }, {
      kind: "addRelation",
      type: ObjectRelations.containedIn,
      from: objectId,
      to: containerId,
      announce: false,
    });
  }

  effects.push({
    kind: "emitEvent",
    eventType: "settlement-locations.water_carried",
    actorId,
    targetId: containerId,
    data: { containerId, amount, placeId, remaining: point.stock - amount },
    historicalSignificance: 0,
  });
  return effects;
}

/** Maps a bulk resource to the prototype that carries one unit of it. */
export function prototypeForResource(resourceId: string): string {
  const mapping: Record<string, string> = {
    "resource:water": "prototype:water",
    "resource:grain": "prototype:grain",
    "resource:clay": "prototype:clay-batch",
    "resource:fuel": "prototype:fuel-bundle",
    "resource:reed": "prototype:reed-bundle",
    "resource:cooked": "prototype:cooked-food",
    "resource:fish": "prototype:fish",
    "resource:fiber": "prototype:fiber-bundle",
  };
  return mapping[resourceId] ?? "prototype:grain";
}

// ---------------------------------------------------------------------------
// Authored instances: 80+ objects with a real place and a real owner
// ---------------------------------------------------------------------------

interface InstanceSpec {
  id: string;
  prototypeId: string;
  ownerId: string;
  inId: string;
  quantity?: number;
}

/**
 * Objects the settlement starts with.
 *
 * Generated from the authored places and households so that every instance has
 * both a position and an owner; the counts are asserted by the M1 density test.
 */
function buildInstances(): InstanceSpec[] {
  return RIVER_TERRACE_PACK.instances.map(({ owner, ...seed }) =>
    ({ quantity: 0, ...seed, ownerId: residentId(owner) }));
}

const INSTANCES: InstanceSpec[] = buildInstances();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

/** Exported so tests can assert the authored density without duplicating it. */
export const SettlementContent = {
  residents: RESIDENTS.length,
  households: new Set(RESIDENTS.map((resident) => resident.household)).size,
  places: PLACES.length,
  spaces: PLACES.reduce((sum, place) => sum + place.spaces.length, 0),
  outdoorPlaces: PLACES.filter((place) => place.spaces.some((space) => space.visible)).length,
  prototypes: PROTOTYPES.length,
  instances: INSTANCES.length,
  yields: YIELDS.length,
  residentKeys: RESIDENTS.map((resident) => resident.key),
  placeIds: PLACES.map((place) => place.id),
  spaceIds: PLACES.flatMap((place) => place.spaces.map((space) => space.id)),
  prototypeIds: PROTOTYPES.map((prototype) => prototype.id),
} as const;

export function instanceSpecs(): readonly InstanceSpec[] {
  return INSTANCES;
}

export type { ComponentData };
