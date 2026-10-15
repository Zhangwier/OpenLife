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
import { appraise, type CounterpartView, type Closeness } from "./exchange.ts";
import { skyOn, isWet, OUTDOOR_PLACES, SKY_NOTE } from "./weather.ts";
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
import { residentMind, temperamentWords } from "./autonomy/mind.ts";
import { readSocial, bondOf, withBond, mergeHeard, toJson, ASK_COOLDOWN, REQUEST_DAYS, type SocialMemory } from "./social.ts";
import { RIVER_TERRACE_PACK, type ResidentSpec, type PlaceSpec, type YieldSpec, type PrototypeSpec, type RecipeSpec } from "./content.ts";

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
  /** A home's roof, on the home space: level after the last mending and the day it was mended. */
  roof: "settlement-locations.roof",
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
  /** General exchange between any two people in the same place. */
  exchange: "settlement-locations.exchange",
  craft: "settlement-locations.craft",
  helpHearth: "settlement-locations.hearth.help",
  npcAskHelp: "settlement-locations.npc.ask_help",
  npcAnswerHelp: "settlement-locations.npc.answer_help",
  npcFire: "settlement-locations.npc.fire",
  /** A resident looks around: who is here, what they carry; old requests are settled. */
  npcNotice: "settlement-locations.npc.notice",
  /** A resident, face to face, asks the player for something (borrow, trade or collect a favour). */
  npcRequest: "settlement-locations.npc.request",
  /** The player answers a resident's request. */
  requestAnswer: "settlement-locations.request.answer",
  /** A resident hands someone one of their own things (repaying a favour, thanks). */
  npcGive: "settlement-locations.npc.give",
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
    registerExchange(ctx);
    registerCraft(ctx);
    registerHearthRelief(ctx);
    registerNpcHelp(ctx);
    registerNpcFire(ctx);
    registerSocial(ctx);

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

type Registration = Parameters<OpenLifeModule["register"]>[0];

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
/** Cheap read of every gathering point's current stock (no object counting). */
export function currentYields(world: WorldView): YieldState[] { return yieldPoints(world); }
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
      // Capacity and pace come from the content pack, so a rebalanced pack
      // also applies to worlds founded before it (the stored values are a cache).
      const spec = yieldSpecFor(state.placeId, state.resourceId);
      if (spec) { state.capacity = spec.capacity; state.renewDays = spec.renewDays; }
      return { ...state, stock: renewedStock(state, world.tick, renewalPerCycle(world, spec), spec?.seasons) };
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

function renewedStock(state: YieldState, tick: number, perCycle: number, seasons?: string[]): number {
  const elapsed = Math.max(0, tick - state.lastRenewedAt);
  const cycles = Math.floor(elapsed / state.renewDays);
  // perCycle 0 means the point never renews on its own (e.g. finite seed grain
  // in a pack that does not model other households' fields).
  if (!seasons?.length || perCycle <= 0) return Math.min(state.capacity, state.stock + cycles * perCycle);
  // Seasonal points only grow back in cycles that end in one of their seasons.
  let stock = state.stock;
  for (let k = 1; k <= cycles && stock < state.capacity; k += 1) {
    if (seasons.includes(seasonOf(state.lastRenewedAt + k * state.renewDays))) stock += perCycle;
  }
  return Math.min(state.capacity, stock);
}

function yieldSpecFor(placeId: string, resourceId: string): YieldSpec | undefined {
  return YIELDS.find((y) => y.placeId === placeId && y.resourceId === resourceId);
}

/** Living villagers (residents and the player alike) who eat from shared stores. */
export function villagePopulation(world: WorldView): number {
  return world.listEntities({ kind: "modern.character" })
    .filter((e) => e.archivedAt === undefined && e.components["modern.vitals"]?.alive !== false)
    .length;
}

/**
 * Units a point regains per renewal cycle. Points with `perResidents` represent
 * the whole village's off-screen work (other households cooking, other fields),
 * so they scale with how many people live here: one unit per `perResidents`
 * people, rounded up. Grain without `perResidents` stays finite seed stock.
 */
function renewalPerCycle(world: WorldView, spec: YieldSpec | undefined): number {
  if (spec?.perResidents) return Math.max(1, Math.ceil(villagePopulation(world) / spec.perResidents));
  return spec?.resourceId === "resource:grain" ? 0 : 1;
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

/** 给界面看的性格词（来自数据包里的性格数值）。 */
export function residentTemperament(id: string): string[] {
  const mind = residentMind(id);
  return mind ? temperamentWords(mind) : [];
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
  return hungerAt(base, since, world.tick);
}

/** Hunger grows by one point every HUNGER_DAYS_PER_POINT days since the last meal, capped at 10. */
export const HUNGER_DAYS_PER_POINT = 2;
export function hungerAt(base: number, since: number, tick: number): number {
  return Math.max(0, Math.min(10, base + Math.floor(Math.max(0, tick - since) / HUNGER_DAYS_PER_POINT)));
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
function carriedFood(world: WorldView, actorId: string, objectId: string): "resource:cooked" | "resource:grain" | "resource:fish" | "" {
  const entity = world.getEntity(objectId);
  if (!entity || entity.kind !== ObjectKinds.item || entity.archivedAt !== undefined) return "";
  if (ownerOf(world, objectId) !== actorId || holderOf(world, objectId) !== actorId) return "";
  if (readObject(entity.components[ObjectComponents.object]).quantity < 1) return "";
  const resourceId = prototypeOf(world, objectId).resourceId;
  return resourceId === "resource:cooked" || resourceId === "resource:grain" || resourceId === "resource:fish" ? resourceId : "";
}

/** Hunger eased by one portion: cooked food 4, raw grain 2. */
const HUNGER_EASED: Record<string, number> = { "resource:cooked": 4, "resource:grain": 2, "resource:fish": 2 };


/**
 * Seasons shape farming. Millet sown in spring or summer ripens in 30 days;
 * autumn sowing needs 45, winter sowing 60. What a harvest brings depends on
 * the season it is gathered in: autumn is the true harvest.
 * The harvester carries three portions home; the rest goes onto the field heap.
 */
const CROP_GROW_DAYS: Record<string, number> = { "春": 30, "夏": 30, "秋": 45, "冬": 60 };
const CROP_YIELD: Record<string, number> = { "春": 8, "夏": 8, "秋": 10, "冬": 5 };
const HARVEST_IN_HAND = 3;
export function cropGrowDays(sownAt: number): number { return CROP_GROW_DAYS[seasonOf(sownAt)] ?? 30; }
export function cropYield(harvestAt: number): number { return CROP_YIELD[seasonOf(harvestAt)] ?? 8; }

/** A plot lives on the existing field place; missing component means fallow (old saves). */
function fieldCrop(world: WorldView) {
  const raw = world.getComponent("place:field", SettlementComponents.cropPlot);
  const seedId = String(raw?.seedId ?? "");
  const sownAt = Number(raw?.sownAt ?? 0);
  let tended = Boolean(raw?.tended ?? false);
  const harvests = Math.max(0, Number(raw?.harvests ?? 0));
  const remainingDays = seedId ? Math.max(0, cropGrowDays(sownAt) - Math.max(0, world.tick - sownAt)) : 0;
  // Rain on the growing field waters it as well as a day of tending would.
  if (seedId && !tended) {
    for (let day = sownAt + 1; day <= Math.min(world.tick, sownAt + cropGrowDays(sownAt)); day += 1) {
      if (skyOn(day) === "雨") { tended = true; break; }
    }
  }
  return {
    seedId, sownAt, tended, harvests, remainingDays,
    phase: !seedId ? "fallow" : remainingDays === 0 && tended ? "ready" : "growing",
  };
}

function cropSummary(world: WorldView): string {
  const crop = fieldCrop(world);
  if (crop.phase === "fallow") return "田地闲置：带来一份粟作种粮，可开始播种。";
  if (crop.phase === "ready") return `粟已经成熟，${seasonOf(world.tick)}收可得 ${cropYield(world.tick)} 份：三份随身，其余入田边粮堆。`;
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
export function wornWrap(world: WorldView, actorId: string): string {
  const id = wornByActor(world, actorId);
  return id && prototypeOf(world, id).prototypeId === "prototype:fiber-wrap" ? id : "";
}
const OUTDOOR_WORK = new Set<string>([SettlementCommands.draw, SettlementCommands.tend, SettlementCommands.sow, SettlementCommands.harvest]);
export function activityCostFor(world: WorldView, actorId: string, commandType: string): number {
  let cost = ACTIVITY_COST[commandType] ?? 0;
  // Rain and snow make outdoor labour heavier.
  if (cost && OUTDOOR_WORK.has(commandType) && isWet(world.tick) &&
      OUTDOOR_PLACES.has(occupiedPlaceId(world, actorId))) cost += 1;
  if (commandType === SettlementCommands.tend &&
      occupiedSpaceId(world, actorId) === "space:field-edge" && wornWrap(world, actorId)) {
    cost -= 1;
  }
  return cost;
}

export function dailyActivity(world: WorldView, actorId: string) {
  const raw = world.getComponent(actorId, SettlementComponents.holding);
  const day = world.tick;
  // A genuinely used sleeping mat grants exactly one extra unit the next day.
  // The existing world tick stays authoritative; an old save gets 8 units.
  // Preserve today\'s already earned bonus if the player rests again today.
  const extraToday = day > 0 && (Number(raw?.matRestedAt ?? -1) === day - 1 ||
    Number(raw?.matBonusPreservedAt ?? -1) === day);
  // A winter night by one's own fire is worth another unit, on top of a mat.
  const warmToday = day > 0 && Number(raw?.warmNightAt ?? -1) === day - 1;
  const capacity = DAILY_ACTIVITY_CAPACITY + (extraToday ? 1 : 0) + (warmToday ? 1 : 0);
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
 * M3-B: narrow, explicit two-party barter between the cook and the farmer.
 * Proposal records the cook's consent; acceptance is a second command by Yu.
 * The single acceptance transaction swaps existing ownership AND custody of
 * two concrete, individually held resource bundles. No parallel stock.
 */
function tradeReady(world: WorldView, itemId: string, actorId: string, resourceId: string): boolean {
  const item = world.getEntity(itemId);
  return Boolean(item && item.kind === ObjectKinds.item && item.archivedAt === undefined &&
    ownerOf(world, itemId) === actorId && holderOf(world, itemId) === actorId &&
    prototypeOf(world, itemId).resourceId === resourceId &&
    readObject(item.components[ObjectComponents.object]).quantity === 1 &&
    contentsOf(world, itemId).length === 0 &&
    world.listRelations({ type: ObjectRelations.wornBy, from: itemId }).length === 0 &&
    Number(world.getComponent(itemId, ObjectComponents.loan)?.active ?? 0) !== 1);
}

function registerNpcBarter(ctx: Registration): void {
  const cook = residentId("cook"), farmer = residentId("yu");
  const coLocated = (world: WorldView) =>
    occupiedPlaceId(world, cook) === "place:hearth-yard" &&
    occupiedPlaceId(world, farmer) === "place:hearth-yard";
  ctx.registerConstraintRule({
    id: `${SettlementCommands.npcOffer}.allowed`,
    commandType: SettlementCommands.npcOffer,
    evaluate: (c) => {
      if (c.command.source !== "ai" || c.command.actorId !== cook) {
        return refuse(SettlementRejection.NotYours, "只有阿灶可以提出自己的柴草交换报价。");
      }
      if (!coLocated(c.world)) {
        return refuse(SettlementRejection.WrongPlace, "阿灶与阿予必须同时到达公用灶台。");
      }
      if (Number(c.world.getComponent(cook, SettlementComponents.resident)?.tradeCount ?? 0) >= 1) {
        return refuse(SettlementRejection.Already, "本次约定的交换已经完成。");
      }
      const fuelId = String(c.command.payload.fuelId ?? "");
      const grainId = String(c.command.payload.grainId ?? "");
      if (!fuelId || !grainId || fuelId === grainId ||
          !tradeReady(c.world, fuelId, cook, "resource:fuel") ||
          !tradeReady(c.world, grainId, farmer, "resource:grain")) {
        return refuse(SettlementRejection.NotYours, "双方必须各自实际持有可交换的一捆柴草和一份粟。");
      }
      const pending = c.world.getComponent(cook, SettlementComponents.resident)?.tradeOffer;
      if (pending && typeof pending === "object" &&
          (pending as Record<string, JsonValue>).status === "offered" &&
          (pending as Record<string, JsonValue>).at === c.world.tick) {
        return refuse(SettlementRejection.Busy, "已经有一份等待确认的交换报价。");
      }
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.npcOffer}.resolve`,
    commandType: SettlementCommands.npcOffer,
    resolve: (c) => [{
      kind: "modifyComponent", entityId: cook,
      component: SettlementComponents.resident,
      patch: { tradeOffer: { status: "offered", at: c.world.tick, fuelId: c.command.payload.fuelId,
        grainId: c.command.payload.grainId, recipientId: farmer } },
      reason: "cook's explicit conditional barter offer",
    }, {
      kind: "emitEvent", eventType: "settlement-locations.barter_offered",
      actorId: cook, targetId: farmer,
      data: { fuelId: c.command.payload.fuelId, grainId: c.command.payload.grainId },
      historicalSignificance: 0.01,
    }],
  });

  ctx.registerConstraintRule({
    id: `${SettlementCommands.npcAccept}.allowed`,
    commandType: SettlementCommands.npcAccept,
    evaluate: (c) => {
      if (c.command.source !== "ai" || c.command.actorId !== farmer) {
        return refuse(SettlementRejection.NotYours, "只有阿予本人能接受交易。");
      }
      if (!coLocated(c.world)) {
        return refuse(SettlementRejection.WrongPlace, "双方不在公用灶台，不能远程交换。");
      }
      const raw = c.world.getComponent(cook, SettlementComponents.resident)?.tradeOffer;
      const offer = raw && typeof raw === "object" && !Array.isArray(raw)
        ? raw as Record<string, JsonValue> : {};
      const fuelId = String(offer.fuelId ?? ""), grainId = String(offer.grainId ?? "");
      if (offer.status !== "offered" || offer.at !== c.world.tick ||
          offer.recipientId !== farmer || !fuelId || !grainId ||
          c.command.payload.fuelId !== fuelId || c.command.payload.grainId !== grainId) {
        return refuse(SettlementRejection.Busy, "没有双方认可且当天仍有效的具体物品报价。");
      }
      if (!tradeReady(c.world, fuelId, cook, "resource:fuel") ||
          !tradeReady(c.world, grainId, farmer, "resource:grain")) {
        return refuse(SettlementRejection.NotYours, "接受时任一方的物品已不在手中，交易取消。");
      }
      if (!canCarryObject(c.world, farmer, fuelId, grainId) ||
          !canCarryObject(c.world, cook, grainId, fuelId))
        return refuse(SettlementRejection.NoRoom, "交换后有人会超出随身负重，先整理行囊。");
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.npcAccept}.resolve`,
    commandType: SettlementCommands.npcAccept,
    resolve: (c) => {
      const offer = c.world.getComponent(cook, SettlementComponents.resident)!.tradeOffer as Record<string, JsonValue>;
      const fuelId = String(offer.fuelId), grainId = String(offer.grainId);
      const effects: Effect[] = [];
      for (const [id, oldOwner, newOwner] of [
        [fuelId, cook, farmer], [grainId, farmer, cook],
      ] as [string, string, string][]) {
        effects.push({
          kind: "removeRelation", type: ObjectRelations.heldBy, from: id, to: oldOwner,
          reason: "barter accepted, handover", announce: false,
        }, {
          kind: "removeRelation", type: ObjectRelations.ownedBy, from: id, to: oldOwner,
          reason: "barter accepted, ownership transfer", announce: false,
        }, {
          kind: "addRelation", type: ObjectRelations.heldBy, from: id, to: newOwner, announce: false,
        }, {
          kind: "addRelation", type: ObjectRelations.ownedBy, from: id, to: newOwner, announce: false,
        });
      }
      const count = Number(c.world.getComponent(cook, SettlementComponents.resident)?.tradeCount ?? 0) + 1;
      effects.push({
        kind: "modifyComponent", entityId: cook, component: SettlementComponents.resident,
        patch: { tradeCount: count, tradeOffer: { ...offer, status: "accepted", acceptedAt: c.world.tick } },
        reason: "first physical barter completed on both sides",
      }, {
        kind: "modifyComponent", entityId: farmer, component: SettlementComponents.resident,
        patch: { tradeCount: count },
        reason: "farmer accepted the barter for real materials",
      }, {
        kind: "emitEvent", eventType: "settlement-locations.barter_accepted",
        actorId: farmer, targetId: cook,
        data: { fuelId, grainId, cook, farmer, amount: 1 },
        historicalSignificance: 0.08,
      });
      return effects;
    },
  });
}

// ---------------------------------------------------------------------------
// General exchange (any two people, any valued goods, favours owed)
// ---------------------------------------------------------------------------

const EXCHANGE_VALUES: Record<string, number> = RIVER_TERRACE_PACK.exchange?.values ?? {};
const EXCHANGE_WANTS: Record<string, string[]> = RIVER_TERRACE_PACK.exchange?.wants ?? {};
const MAX_EXCHANGE_ITEMS = 4;

function isPerson(world: WorldView, id: string): boolean {
  const entity = world.getEntity(id);
  return Boolean(entity && entity.archivedAt === undefined && entity.kind === "modern.character");
}

/** Items a person holds and owns outright that can change hands, by resource. */
export function tradeableGoods(world: WorldView, personId: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const held = world.listRelations({ type: ObjectRelations.heldBy, to: personId }).map((r) => r.from).sort();
  for (const id of held) {
    const resourceId = prototypeOf(world, id).resourceId ?? "";
    if (!resourceId || !(resourceId in EXCHANGE_VALUES) || !tradeReady(world, id, personId, resourceId)) continue;
    (out[resourceId] ??= []).push(id);
  }
  return out;
}

/** Favours: worth units `debtorId` owes `creditorId` (kept on the creditor). */
export function favourOwed(world: WorldView, creditorId: string, debtorId: string): number {
  const raw = world.getComponent(creditorId, SettlementComponents.resident)?.favours ??
    world.getComponent(creditorId, SettlementComponents.holding)?.favours;
  const map = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, JsonValue> : {};
  return Number(map[debtorId] ?? 0);
}

function wantsOf(world: WorldView, personId: string): string[] {
  const key = RESIDENTS.find((r) => residentId(r.key) === personId)?.key;
  return key ? EXCHANGE_WANTS[key] ?? [] : [];
}

function personName(world: WorldView, personId: string): string {
  const key = RESIDENTS.find((r) => residentId(r.key) === personId);
  return key?.name ?? (world.getEntity(personId)?.name || "对方");
}

export function counterpartView(world: WorldView, proposerId: string, targetId: string): CounterpartView {
  const goods = tradeableGoods(world, targetId);
  return {
    name: personName(world, targetId),
    hunger: hungerLevel(world, targetId),
    holds: Object.fromEntries(Object.entries(goods).map(([r, ids]) => [r, ids.length])),
    wants: wantsOf(world, targetId),
    closeness: feltCloseness(world, proposerId, targetId),
    owed: favourOwed(world, targetId, proposerId),
  };
}

interface ExchangePayload { targetId: string; give: string[]; askResource: string; askAmount: number; credit: boolean }

function readExchange(payload: Record<string, unknown>): ExchangePayload {
  return {
    targetId: String(payload.targetId ?? ""),
    give: Array.isArray(payload.give) ? payload.give.map(String) : [],
    askResource: String(payload.askResource ?? ""),
    askAmount: Number(payload.askAmount ?? 1),
    credit: payload.credit === true,
  };
}

function exchangeProblem(world: WorldView, actorId: string, p: ExchangePayload): string {
  if (!actorId || !isPerson(world, actorId)) return "只有村里的人才能交换东西。";
  if (!p.targetId || p.targetId === actorId || !isPerson(world, p.targetId)) return "要和一位具体的村民交换。";
  const active = String(world.getComponent("modern:world", "modern.world_state")?.activeCharacterId ?? "");
  if (p.targetId === active) return "玩家的东西只能由玩家自己决定是否交换。";
  const here = occupiedPlaceId(world, actorId);
  if (!here || here !== occupiedPlaceId(world, p.targetId)) return "要当面交换：先走到对方所在的地方。";
  if (new Set(p.give).size !== p.give.length || p.give.length > MAX_EXCHANGE_ITEMS) return "一次最多拿出四件不同的东西。";
  if (!(p.askResource in EXCHANGE_VALUES)) return "这样东西在村里还没有约定的价值。";
  if (!Number.isInteger(p.askAmount) || p.askAmount < 1 || p.askAmount > MAX_EXCHANGE_ITEMS) return "一次最多要四份。";
  if (!p.give.length && !p.credit) return "空手只能请求赊欠。";
  for (const id of p.give) {
    const r = prototypeOf(world, id).resourceId ?? "";
    if (!(r in EXCHANGE_VALUES) || !tradeReady(world, id, actorId, r)) return "拿出的东西必须是你自己手里、完整且没借给别人的。";
    if (r === p.askResource) return "不能用同一种东西换同一种东西。";
  }
  const have = tradeableGoods(world, p.targetId)[p.askResource] ?? [];
  if (have.length < p.askAmount) return `${personName(world, p.targetId)}手上没有 ${p.askAmount} 份${RESOURCE_LABELS[p.askResource] ?? "这种东西"}。`;
  // Both sides must be able to carry the result.
  const asked = have.slice(0, p.askAmount);
  const mass = (owner: string, ids: string[]) => ids.reduce((sum, id) =>
    sum + portableLoad(world, owner).mass - portableLoad(world, owner, id).mass, 0);
  const fits = (who: string, outIds: string[], inIds: string[], inOwner: string) => {
    const load = portableLoad(world, who);
    return load.looseSlots - outIds.length + inIds.length <= load.maxSlots &&
      load.mass - mass(who, outIds) + mass(inOwner, inIds) <= load.maxMass + 0.0001;
  };
  if (!fits(actorId, p.give, asked, p.targetId)) return "换完你会拿不下，先放下些东西。";
  if (!fits(p.targetId, asked, p.give, actorId)) return `换完${personName(world, p.targetId)}会拿不下。`;
  return "";
}

function exchangeView(world: WorldView, actorId: string): HomesteadView["exchange"] {
  const here = occupiedPlaceId(world, actorId);
  const partners = here ? RESIDENTS.map((r) => residentId(r.key))
    .filter((id) => id !== actorId && occupiedPlaceId(world, id) === here)
    .map((id) => {
      const v = counterpartView(world, actorId, id);
      return { id, name: v.name, goods: v.holds, wants: v.wants, owed: v.owed, closeness: v.closeness };
    }) : [];
  const raw = world.getComponent(actorId, SettlementComponents.holding)?.lastExchange;
  return {
    labels: Object.fromEntries(Object.keys(EXCHANGE_VALUES).map((r) => [r, RESOURCE_LABELS[r] ?? r])),
    mine: tradeableGoods(world, actorId),
    partners,
    last: raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, JsonValue> : null,
  };
}

function registerExchange(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.exchange}.allowed`,
    commandType: SettlementCommands.exchange,
    evaluate: (c) => {
      const problem = exchangeProblem(c.world, c.command.actorId ?? "", readExchange(c.command.payload ?? {}));
      return problem ? refuse(problem.includes("当面") ? SettlementRejection.WrongPlace
        : problem.includes("拿不下") ? SettlementRejection.NoRoom : SettlementRejection.NotYours, problem) : { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.exchange}.resolve`,
    commandType: SettlementCommands.exchange,
    resolve: (c) => {
      const actorId = c.command.actorId as string;
      const p = readExchange(c.command.payload ?? {});
      const view = counterpartView(c.world, actorId, p.targetId);
      const decision = appraise(view, EXCHANGE_VALUES,
        { resources: p.give.map((id) => prototypeOf(c.world, id).resourceId ?? "") },
        { resourceId: p.askResource, amount: p.askAmount }, p.credit,
        (r) => RESOURCE_LABELS[r] ?? r);
      const asked = (tradeableGoods(c.world, p.targetId)[p.askResource] ?? []).slice(0, p.askAmount);
      const effects: Effect[] = [];
      if (decision.accept) {
        const moves: [string, string, string][] = [
          ...p.give.map((id) => [id, actorId, p.targetId] as [string, string, string]),
          ...asked.map((id) => [id, p.targetId, actorId] as [string, string, string]),
        ];
        for (const [id, from, to] of moves) {
          effects.push(
            { kind: "removeRelation", type: ObjectRelations.heldBy, from: id, to: from, reason: "exchange handover", announce: false },
            { kind: "removeRelation", type: ObjectRelations.ownedBy, from: id, to: from, reason: "exchange ownership", announce: false },
            { kind: "addRelation", type: ObjectRelations.heldBy, from: id, to, announce: false },
            { kind: "addRelation", type: ObjectRelations.ownedBy, from: id, to, announce: false },
          );
        }
        const owed = Math.round((view.owed - decision.repaid + decision.onCredit) * 10) / 10;
        const component = c.world.getComponent(p.targetId, SettlementComponents.resident)
          ? SettlementComponents.resident
          : c.world.getComponent(p.targetId, SettlementComponents.holding) ? SettlementComponents.holding : "";
        if (owed !== view.owed && component) {
          const raw = c.world.getComponent(p.targetId, component)?.favours;
          const favours = { ...(raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, JsonValue> : {}) };
          if (owed > 0) favours[actorId] = owed; else delete favours[actorId];
          effects.push({ kind: "modifyComponent", entityId: p.targetId, component,
            patch: { favours }, reason: decision.onCredit ? "favour owed for an uneven exchange" : "favour repaid" });
        }
      }
      const summary = {
        targetId: p.targetId, accepted: decision.accept, reason: decision.reason, at: c.world.tick,
        gave: p.give.map((id) => prototypeOf(c.world, id).resourceId ?? ""),
        got: decision.accept ? asked.map(() => p.askResource) : [],
        onCredit: decision.onCredit, repaid: decision.repaid,
      };
      if (c.world.getComponent(actorId, SettlementComponents.holding)) {
        effects.push({ kind: "modifyComponent", entityId: actorId, component: SettlementComponents.holding,
          patch: { lastExchange: summary as unknown as JsonValue }, reason: "remember the last exchange outcome" });
      }
      effects.push({
        kind: "emitEvent",
        eventType: decision.accept ? "settlement-locations.exchanged" : "settlement-locations.exchange_declined",
        actorId, targetId: p.targetId,
        data: { ...summary, received: decision.received, cost: decision.cost } as unknown as Record<string, JsonValue>,
        historicalSignificance: decision.accept ? 0.03 : 0,
      });
      return effects;
    },
  });
}

/** M3-D: the player's requested grain-for-fuel barter with the hearth cook.
 * A player-authored request does NOT imply NPC consent. An independent cook
 * command authorizes a concrete quote, and only the player's own acceptance
 * swaps the two real item IDs in a single world transaction.
 */
function registerPlayerBarter(ctx: Registration): void {
  const cook = residentId("cook");
  const activePlayer = (world: WorldView) =>
    String(world.getComponent("modern:world", "modern.world_state")?.activeCharacterId ?? "");
  const nearby = (world: WorldView, playerId: string) =>
    playerId && playerId !== cook && occupiedPlaceId(world, playerId) === "place:hearth-yard" &&
    occupiedPlaceId(world, cook) === "place:hearth-yard";
  const requestOf = (world: WorldView, playerId: string) => {
    const raw = world.getComponent(playerId, SettlementComponents.holding)?.playerBarterRequest;
    return raw && typeof raw === "object" && !Array.isArray(raw)
      ? raw as Record<string, JsonValue> : {};
  };
  const quoteOf = (world: WorldView) => {
    const raw = world.getComponent(cook, SettlementComponents.resident)?.playerBarterQuote;
    return raw && typeof raw === "object" && !Array.isArray(raw)
      ? raw as Record<string, JsonValue> : {};
  };
  const finished = (world: WorldView, playerId: string) =>
    Number(world.getComponent(playerId, SettlementComponents.holding)?.playerTradeCount ?? 0) >= 1;
  const goodsReady = (world: WorldView, playerId: string, grainId: string, fuelId: string) =>
    grainId !== fuelId &&
    tradeReady(world, grainId, playerId, "resource:grain") &&
    tradeReady(world, fuelId, cook, "resource:fuel");

  ctx.registerConstraintRule({
    id: `${SettlementCommands.playerBarterRequest}.allowed`,
    commandType: SettlementCommands.playerBarterRequest,
    evaluate: (c) => {
      const playerId = c.command.actorId ?? "";
      if (c.command.source !== "player" || playerId !== activePlayer(c.world))
        return refuse(SettlementRejection.NotYours, "只能由当前操控角色亲自询价。");
      if (!nearby(c.world, playerId))
        return refuse(SettlementRejection.WrongPlace, "需要与阿灶同在公用灶台才能询价。");
      if (finished(c.world, playerId))
        return refuse(SettlementRejection.Already, "你已经与阿灶完成这次约定的交换。");
      const grainId = String(c.command.payload.grainId ?? "");
      if (!tradeReady(c.world, grainId, playerId, "resource:grain"))
        return refuse(SettlementRejection.NotYours, "先带一份属于自己的真实粟粮才能提议交换。");
      const quote = quoteOf(c.world);
      if (quote.status === "offered" && quote.at === c.world.tick &&
          quote.customerId === playerId)
        return refuse(SettlementRejection.Busy, "阿灶已经提出报价，请先接受或拒绝。");
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.playerBarterRequest}.resolve`,
    commandType: SettlementCommands.playerBarterRequest,
    resolve: (c) => [{
      kind: "modifyComponent", entityId: c.command.actorId as string,
      component: SettlementComponents.holding,
      patch: { playerBarterRequest: { grainId: c.command.payload.grainId,
        cookId: cook, at: c.world.tick, status: "requested" } },
      reason: "player explicitly asks the cook to exchange specific goods",
    }, {
      kind: "emitEvent", eventType: "settlement-locations.player_barter_requested",
      actorId: c.command.actorId, targetId: cook,
      data: { grainId: c.command.payload.grainId }, historicalSignificance: 0,
    }],
  });

  ctx.registerConstraintRule({
    id: `${SettlementCommands.cookBarterQuote}.allowed`,
    commandType: SettlementCommands.cookBarterQuote,
    evaluate: (c) => {
      const playerId = String(c.command.payload.customerId ?? "");
      if (c.command.source !== "ai" || c.command.actorId !== cook ||
          playerId !== activePlayer(c.world))
        return refuse(SettlementRejection.NotYours, "报价必须由阿灶根据实际物资单独确认。");
      if (!nearby(c.world, playerId) || finished(c.world, playerId))
        return refuse(SettlementRejection.WrongPlace, "交易双方必须同在灶台且尚未成交。");
      const request = requestOf(c.world, playerId);
      const grainId = String(request.grainId ?? "");
      const fuelId = String(c.command.payload.fuelId ?? "");
      if (request.status !== "requested" || request.at !== c.world.tick ||
          request.cookId !== cook || !grainId ||
          !goodsReady(c.world, playerId, grainId, fuelId))
        return refuse(SettlementRejection.Empty, "阿灶暂时无法接受这笔报价：必须各自实际持有一份粟和一捆柴。");
      const pending = quoteOf(c.world);
      if (pending.status === "offered" && pending.at === c.world.tick)
        return refuse(SettlementRejection.Busy, "阿灶已有一笔等待回复的实物报价。");
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.cookBarterQuote}.resolve`,
    commandType: SettlementCommands.cookBarterQuote,
    resolve: (c) => {
      const playerId = String(c.command.payload.customerId);
      const grainId = String(requestOf(c.world, playerId).grainId);
      const fuelId = String(c.command.payload.fuelId);
      return [{
        kind: "modifyComponent", entityId: cook,
        component: SettlementComponents.resident,
        patch: { playerBarterQuote: { status: "offered", customerId: playerId,
          grainId, fuelId, at: c.world.tick } },
        reason: "cook independently consents to one real item-for-item quote",
      }, {
        kind: "emitEvent", eventType: "settlement-locations.player_barter_quoted",
        actorId: cook, targetId: playerId,
        data: { grainId, fuelId }, historicalSignificance: 0.01,
      }];
    },
  });
  const playerDecision = (type: string, accept: boolean) => {
    ctx.registerConstraintRule({
      id: `${type}.allowed`, commandType: type,
      evaluate: (c) => {
        const playerId = c.command.actorId ?? "";
        if (c.command.source !== "player" || playerId !== activePlayer(c.world))
          return refuse(SettlementRejection.NotYours, "只有报价指向的玩家本人可以决定。");
        if (!nearby(c.world, playerId))
          return refuse(SettlementRejection.WrongPlace, "必须当面接受或拒绝阿灶的报价。");
        const quote = quoteOf(c.world);
        if (quote.status !== "offered" || quote.at !== c.world.tick ||
            quote.customerId !== playerId || finished(c.world, playerId) ||
            c.command.payload.grainId !== quote.grainId ||
            c.command.payload.fuelId !== quote.fuelId)
          return refuse(SettlementRejection.Busy, "这笔报价已过期、已处理或并非你的报价。");
        if (accept && !goodsReady(c.world, playerId,
          String(quote.grainId), String(quote.fuelId)))
          return refuse(SettlementRejection.NotYours, "物品已不在当事人手中，不能完成交易。");
        if (accept && (!canCarryObject(c.world, playerId, String(quote.fuelId), String(quote.grainId)) ||
          !canCarryObject(c.world, cook, String(quote.grainId), String(quote.fuelId))))
          return refuse(SettlementRejection.NoRoom, "双方需先腾出足够的负重空间才能交换实物。");
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${type}.resolve`, commandType: type,
      resolve: (c) => {
        const playerId = c.command.actorId as string;
        const quote = quoteOf(c.world);
        const grainId = String(quote.grainId), fuelId = String(quote.fuelId);
        const effects: Effect[] = [];
        if (accept) {
          for (const [id, oldOwner, newOwner] of [
            [grainId, playerId, cook], [fuelId, cook, playerId],
          ] as [string, string, string][]) {
            effects.push({
              kind: "removeRelation", type: ObjectRelations.heldBy,
              from: id, to: oldOwner, reason: "player barter handover", announce: false,
            }, {
              kind: "removeRelation", type: ObjectRelations.ownedBy,
              from: id, to: oldOwner, reason: "player barter ownership swap", announce: false,
            }, {
              kind: "addRelation", type: ObjectRelations.heldBy, from: id, to: newOwner, announce: false,
            }, {
              kind: "addRelation", type: ObjectRelations.ownedBy, from: id, to: newOwner, announce: false,
            });
          }
          effects.push({
            kind: "modifyComponent", entityId: playerId, component: SettlementComponents.holding,
            patch: { playerTradeCount: 1 }, reason: "player owns a real completed exchange",
          });
        }
        effects.push({
          kind: "modifyComponent", entityId: cook, component: SettlementComponents.resident,
          patch: { playerBarterQuote: { ...quote, status: accept ? "accepted" : "declined",
            resolvedAt: c.world.tick } },
          reason: accept ? "cook's quote accepted by the player" : "player declined the cook's quote",
        }, {
          kind: "emitEvent", eventType: accept
            ? "settlement-locations.player_barter_accepted"
            : "settlement-locations.player_barter_declined",
          actorId: playerId, targetId: cook,
          data: { grainId, fuelId, accepted: accept },
          historicalSignificance: accept ? 0.07 : 0,
        });
        return effects;
      },
    });
  };
  playerDecision(SettlementCommands.playerBarterAccept, true);
  playerDecision(SettlementCommands.playerBarterDecline, false);
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
  /** Today's sky and what it means for work. */
  weather: { sky: string; note: string };
  /** The roof over the home you stand in (or your household's main room). */
  roof: { spaceId: string; condition: number; max: number; leaking: boolean };
  /** General exchange: what you can offer, and what each person here could trade. */
  exchange: {
    labels: Record<string, string>;
    mine: Record<string, string[]>;
    partners: { id: string; name: string; goods: Record<string, number>; wants: string[]; owed: number; closeness: string }[];
    last: Record<string, JsonValue> | null;
  };
  communitySituation: { visible: boolean; urgent: boolean; title: string; note: string; requestStatus: string; recentHelp: string; fuelStock: number | null };
  /** Field status, visible when standing at the field. */
  crop?: { phase: string; remainingDays: number; tended: boolean; summary: string };
  /** Who carries the village's named routines (from the settlement pack). */
  roles: Record<"farmer" | "cook" | "fuelGatherer", { id: string; name: string; workPlace: string }>;
  /** People in the same place, with what they are doing right now. */
  neighbours: { id: string; name: string; role: string; household: string; placeId: string; atWork: boolean; dailyNote: string; tradeCount: number; contact: string; conversations: number; temperament: string[]; regard: string }[];
  /** Residents who came to ask the player for something and await an answer. */
  requests: PlayerRequestView[];
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
        temperament: residentTemperament(entity.id),
        regard: regardWord(world, entity.id, actorId),
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
    exchange: exchangeView(world, actorId),
    weather: { sky: skyOn(world.tick), note: SKY_NOTE[skyOn(world.tick)] },
    roof: (() => {
      const roofSpace = HOME_SPACES.includes(spaceId) ? spaceId : "space:main-sleep";
      const r = roofState(world, roofSpace);
      return { spaceId: roofSpace, condition: r.condition, max: r.max, leaking: r.leaking };
    })(),
    communitySituation,
    requests: playerRequests(world, actorId),
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
    const cost = id === SettlementCommands.arrive && payload.travelMode === "local" ? 1
      : id === SettlementCommands.craft ? (recipeById(String(payload.recipeId))?.activity ?? 0)
      : activityCostFor(world, actorId, id);
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
      `消耗一份随身粟粒作种子；${seasonOf(world.tick)}天种下约 ${cropGrowDays(world.tick)} 天成熟，需要照料。`,
      1, inField && !crop.seedId && Boolean(grainId),
      !inField ? "先到田头" : crop.seedId ? "这块田已播种" : !grainId ? "缺少一份自己的粟粒" : "");
    add(SettlementCommands.harvest, "收获田里的粟",
      `成熟且已照料的作物，${seasonOf(world.tick)}收 ${cropYield(world.tick)} 份：三份随身，其余入田边粮堆。`,
      1, inField && crop.phase === "ready" && canCarryPrototype(world, actorId, "prototype:grain", "", HARVEST_IN_HAND),
      !inField ? "先到田头" : !crop.seedId ? "还没有播种" : !crop.tended ? "先照料田地" : crop.remainingDays ? `还需等待 ${crop.remainingDays} 天`
        : !canCarryPrototype(world, actorId, "prototype:grain", "", HARVEST_IN_HAND) ? "随身要带走三份新粟，先腾出双手或行囊" : "");
  }

  for (const { recipe, blocker } of recipesHere(world, actorId)) {
    const needs = recipe.inputs.map((i) => `${i.count}份${RIVER_TERRACE_PACK.resourceLabels[i.resourceId] ?? i.resourceId}`).join("、");
    const tool = recipe.tool ? PROTOTYPES.find((p) => p.id === recipe.tool)?.name : "";
    add(recipe.command ?? SettlementCommands.craft, recipe.label,
      recipe.command ? recipe.hint
        : `${recipe.hint}${needs || tool ? `（需要${[needs, tool].filter(Boolean).join("，工具：")}）` : ""}`,
      0, !blocker, blocker, recipe.command ? {} : { recipeId: recipe.id });
  }
  const workSpace = SPACE_WORK[spaceId];
  if (workSpace) {
    const wetKiln = spaceId === "space:kiln-mouth" && isWet(world.tick);
    add(SettlementCommands.tend, workSpace.label, workSpace.hint, workSpace.days, !wetKiln,
      wetKiln ? `今天${skyOn(world.tick)}，窑火点不起来` : "", { spaceId });
  }

  const homeSpace = HOME_SPACES.includes(spaceId);
  if (homeSpace && seasonOf(world.tick) === "冬") {
    const fuelId = heldIngredient(world, actorId, "resource:fuel");
    add(SettlementCommands.rest, "生一盆火过冬夜",
      "烧掉手里一捆柴取暖，暖和地睡一夜，次日多一格活动时间；可以和苇席叠加。",
      0, Boolean(fuelId), fuelId ? "" : "手里没有柴草", { spaceId, ...(fuelId ? { fuelId } : {}) });
  }
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

export function seasonOf(tick: number): string {
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
      }, saveSocial(targetId, withBond(socialOf(c.world, targetId), actorId, { familiarity: 1 }, c.world.tick),
        "the resident remembers the conversation too"), {
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
    resolve: (c) => craftEffects(c.world, c.command.actorId as string, recipeForCommand(SettlementCommands.weaveBag), false),
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
    resolve: (c) => craftEffects(c.world, c.command.actorId as string, recipeForCommand(SettlementCommands.weaveMat), false),
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
    resolve: (c) => craftEffects(c.world, c.command.actorId as string, recipeForCommand(SettlementCommands.prepareFiber), false),
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
    resolve: (c) => craftEffects(c.world, c.command.actorId as string, recipeForCommand(SettlementCommands.weaveWrap), false),
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
        actorId, targetId: "place:field", data: { seedId, matureAt: c.world.tick + cropGrowDays(c.world.tick) },
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
      if (!canCarryPrototype(c.world, actorId, "prototype:grain", "", HARVEST_IN_HAND))
        return refuse(SettlementRejection.NoRoom, "随身要带走三份新粟，先腾出双手和行囊空间再收获。");
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
      for (let index = 0; index < HARVEST_IN_HAND; index += 1) {
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
      // The rest of the crop goes onto the field's shared grain heap.
      const heap = yieldPoints(c.world).find((p) => p.placeId === "place:field" && p.resourceId === "resource:grain");
      if (heap) {
        effects.push({
          kind: "setComponent", entityId: `yield:${heap.placeId}:${heap.resourceId}`,
          component: SettlementComponents.yieldPoint,
          value: {
            placeId: heap.placeId, resourceId: heap.resourceId, label: heap.label, unit: heap.unit,
            capacity: heap.capacity, stock: Math.min(heap.capacity, heap.stock + cropYield(c.world.tick) - HARVEST_IN_HAND),
            renewDays: heap.renewDays, lastRenewedAt: renewalAnchor(heap, c.world.tick),
          } as unknown as Record<string, never>,
          reason: "harvest surplus stored at the field",
        });
      }
      effects.push({
        kind: "emitEvent", eventType: "settlement-locations.harvested",
        actorId, targetId: "place:field",
        data: { seedId: crop.seedId, amount: cropYield(c.world.tick), season: seasonOf(c.world.tick), carried: HARVEST_IN_HAND, harvests: crop.harvests + 1 },
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
      if (spaceId === "space:kiln-mouth" && isWet(c.world.tick)) {
        return refuse(SettlementRejection.Busy, `今天${skyOn(c.world.tick)}，窑口潮湿，窑火点不起来。等天晴再来。`);
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
      const fuelId = String(c.command.payload.fuelId ?? "");
      if (fuelId) {
        if (seasonOf(c.world.tick) !== "冬") return refuse(SettlementRejection.Busy, "不是冬天，不用生火取暖。");
        if (!HOME_SPACES.includes(occupiedSpaceId(c.world, actorId)))
          return refuse(SettlementRejection.WrongPlace, "要在自己的住处才能生火过夜。");
        if (!tradeReady(c.world, fuelId, actorId, "resource:fuel"))
          return refuse(SettlementRejection.NotYours, "要烧的必须是你自己手里的一捆柴草。");
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: `${SettlementCommands.rest}.resolve`,
    commandType: SettlementCommands.rest,
    resolve: (c) => {
      const restSpace = occupiedSpaceId(c.world, c.command.actorId as string);
      // A leaking roof on a wet night soaks the bedding and puts out the fire: no bonus.
      const leaked = HOME_SPACES.includes(restSpace) && isWet(c.world.tick) && roofState(c.world, restSpace).leaking;
      const matId = leaked ? "" : String(c.command.payload.matId ?? "");
      const fuelId = String(c.command.payload.fuelId ?? "");
      const hadBonusToday = dailyActivity(c.world, c.command.actorId as string).capacity > DAILY_ACTIVITY_CAPACITY;
      return [...(fuelId ? [{
        kind: "modifyComponent" as const, entityId: c.command.actorId as string,
        component: SettlementComponents.holding, patch: leaked ? {} : { warmNightAt: c.world.tick },
        reason: "a fire kept the winter night warm",
      }, {
        kind: "archiveEntity" as const, entityId: fuelId, reason: "burned for warmth on a winter night", announce: false,
      }] : []), {
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
          matId: matId || null, fuelId: fuelId || null, leaked,
          nextDayExtraActivity: leaked ? 0 : (matId ? 1 : 0) + (fuelId ? 1 : 0) },
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

function refuse(code: string, message: string) {
  return { ok: false as const, code, message };
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


/* ------------------------------------------------------------------ */
/* Generic recipes: inputs + tool + workplace + time → one output.     */
/* ------------------------------------------------------------------ */

const RECIPES: RecipeSpec[] = RIVER_TERRACE_PACK.recipes ?? [];
export function recipeById(id: string): RecipeSpec | undefined { return RECIPES.find((r) => r.id === id); }

/** The maker's own carried, whole, unlent items for each input, or what is missing. */
function recipeInputs(world: WorldView, actorId: string, recipe: RecipeSpec): { ids: string[]; missing: string } {
  const held = world.listRelations({ type: ObjectRelations.heldBy, to: actorId }).map((r) => r.from).sort();
  const ids: string[] = [];
  for (const input of recipe.inputs) {
    const own = held.filter((id) => !ids.includes(id) && tradeReady(world, id, actorId, input.resourceId));
    const minAge = input.minAgeDays ?? 0;
    const found = own.filter((id) => world.tick - Number(readObject(world.getEntity(id)!.components[ObjectComponents.object]).madeAt ?? -Infinity) >= minAge)
      .slice(0, input.count);
    if (found.length < input.count) {
      const label = RIVER_TERRACE_PACK.resourceLabels[input.resourceId] ?? input.resourceId;
      return { ids, missing: own.length >= input.count ? `${label}还没晾干，要放过一夜` : `缺少${input.count}份自己的${label}` };
    }
    ids.push(...found);
  }
  return { ids, missing: "" };
}

/** A tool in hand (yours or borrowed), or one lying at the workplace. */
function recipeTool(world: WorldView, actorId: string, recipe: RecipeSpec): string {
  if (!recipe.tool) return "";
  const usable = (id: string) => {
    const e = world.getEntity(id);
    return Boolean(e && e.archivedAt === undefined && prototypeOf(world, id).prototypeId === recipe.tool);
  };
  const inHand = world.listRelations({ type: ObjectRelations.heldBy, to: actorId }).map((r) => r.from).filter(usable).sort();
  if (inHand[0]) return inHand[0];
  const here = world.listRelations({ type: ObjectRelations.containedIn, to: recipe.spaceId }).map((r) => r.from).filter(usable).sort();
  return here[0] ?? "";
}

export function recipeBlocker(world: WorldView, actorId: string, recipe: RecipeSpec): string {
  if (recipe.spaceId === "@home") {
    if (!HOME_SPACES.includes(occupiedSpaceId(world, actorId))) return "要在住处的屋里做";
  } else if (occupiedSpaceId(world, actorId) !== recipe.spaceId) {
    const place = PLACES.find((p) => p.spaces.some((sp) => sp.id === recipe.spaceId));
    const space = place?.spaces.find((sp) => sp.id === recipe.spaceId);
    return `要到${place?.name ?? ""}的${space?.name ?? "工作处"}去做`;
  }
  if (recipe.seasons && !recipe.seasons.includes(seasonOf(world.tick))) return `${seasonOf(world.tick)}天做不了，要等${recipe.seasons.join("、")}`;
  if (recipe.dryOnly && isWet(world.tick)) return `今天${skyOn(world.tick)}，${recipe.repairs ? "上不了屋顶" : "窑火点不起来"}`;
  if (recipe.repairs === "roof" && roofState(world, occupiedSpaceId(world, actorId)).condition >= ROOF_MAX) return "屋顶完好，不用修";
  const { missing } = recipeInputs(world, actorId, recipe);
  if (missing) return missing;
  if (recipe.tool && !recipeTool(world, actorId, recipe)) {
    return `手边没有${PROTOTYPES.find((p) => p.id === recipe.tool)?.name ?? "合适的工具"}`;
  }
  const out = recipe.output && PROTOTYPES.find((p) => p.id === recipe.output!.prototypeId);
  // Inputs leave the hands as the output arrives; only a recipe with no inputs needs a free hand.
  if (out?.capabilities.includes("carryable") && recipe.inputs.length === 0 &&
      !canCarryPrototype(world, actorId, recipe.output!.prototypeId)) {
    return "手里拿不下成品，先放下些东西";
  }
  const remaining = dailyActivity(world, actorId).remaining;
  if (remaining < recipe.activity) return `今天只剩 ${remaining} 格活动时间`;
  return "";
}

/** Recipes shown at the actor's current workplace. */
export function recipesHere(world: WorldView, actorId: string) {
  const placeId = occupiedPlaceId(world, actorId);
  const place = PLACES.find((p) => p.id === placeId);
  const spaces = new Set(place?.spaces.map((sp) => sp.id) ?? []);
  return RECIPES.filter((r) => r.spaceId === "@home"
    ? [...spaces].some((sp) => HOME_SPACES.includes(sp)) : spaces.has(r.spaceId)).map((r) => ({ recipe: r, blocker: recipeBlocker(world, actorId, r) }));
}

function registerCraft(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.craft}.allowed`,
    commandType: SettlementCommands.craft,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      if (!c.world.hasEntity(actorId)) return refuse(SettlementRejection.NoSuchResident, "需要一位正在生活的人。");
      const recipe = recipeById(String(c.command.payload.recipeId ?? ""));
      if (!recipe) return refuse(SettlementRejection.Empty, "没有这样的做法。");
      const blocker = recipeBlocker(c.world, actorId, recipe);
      if (!blocker) return { ok: true };
      const code = blocker.startsWith("要到") ? SettlementRejection.WrongPlace
        : blocker.startsWith("今天只剩") ? SettlementRejection.Exhausted : SettlementRejection.Empty;
      return refuse(code, `${recipe.label}：${blocker}。`);
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.craft}.resolve`,
    commandType: SettlementCommands.craft,
    resolve: (c) => craftEffects(c.world, c.command.actorId as string,
      recipeById(String(c.command.payload.recipeId))!, true),
  });
}


function fill(template: string | number, ctx: Record<string, JsonValue>): JsonValue {
  return typeof template === "string" && template.startsWith("$") && template in ctx ? ctx[template]! : template;
}

/**
 * One recipe as one transaction: inputs leave the hands and are archived, the
 * outputs appear owned by the maker (in hand, or at the workplace when they
 * cannot be carried), with provenance and an event. The older dedicated
 * commands pay their time through the activity budget, so they pass charge=false.
 */
function craftEffects(world: WorldView, actorId: string, recipe: RecipeSpec, charge: boolean): Effect[] {
  const { ids } = recipeInputs(world, actorId, recipe);
  const toolId = recipeTool(world, actorId, recipe);
  const before = dailyActivity(world, actorId);
  if (recipe.repairs === "roof") return roofMendEffects(world, actorId, recipe, ids, before.used, charge);
  const out = recipe.output!;
  const count = out.perInput ? ids.length : Math.max(1, out.count ?? 1);
  const outputIds = Array.from({ length: count }, (_, i) => out.idPrefix
    ? `${out.idPrefix}${out.perInput ? ids[i] : ids[0]}${!out.perInput && i > 0 ? `:${i}` : ""}`
    : `settlement-locations:craft:${recipe.id.replace("recipe:", "")}:${actorId.split(":").pop()}:${world.tick}:${before.used}${i ? `:${i}` : ""}`);
  const carryable = PROTOTYPES.find((p) => p.id === out.prototypeId)?.capabilities.includes("carryable");
  const effects: Effect[] = [];
  for (const id of ids) {
    effects.push({ kind: "removeRelation", type: ObjectRelations.heldBy, from: id, to: actorId,
      reason: `used up: ${recipe.label}`, announce: false },
    { kind: "archiveEntity", entityId: id, reason: `used up: ${recipe.label}`, announce: false });
  }
  outputIds.forEach((made, i) => {
    const ctx: Record<string, JsonValue> = { "$inputs": ids, "$input": ids[i] ?? ids[0] ?? null };
    const provenance: Record<string, JsonValue> = recipe.provenance
      ? Object.fromEntries(Object.entries(recipe.provenance).map(([k, v]) => [k, fill(v, ctx)]))
      : { recipeId: recipe.id, inputIds: ids, toolId: toolId || null, spaceId: recipe.spaceId };
    provenance.at = world.tick;
    effects.push({
      kind: "spawnEntity", localId: `crafted-${i}`, id: made, entityKind: ObjectKinds.item, announce: false,
      components: { [ObjectComponents.object]: {
        prototypeId: out.prototypeId, name: out.name, condition: out.condition ?? "made",
        quantity: 1, durability: out.durability, madeAt: world.tick, provenance, visibleFromOutside: true,
      } as unknown as Record<string, never> },
    }, { kind: "addRelation", type: ObjectRelations.instanceOf, from: made, to: out.prototypeId, announce: false },
    { kind: "addRelation", type: ObjectRelations.ownedBy, from: made, to: actorId, announce: false },
    carryable
      ? { kind: "addRelation", type: ObjectRelations.heldBy, from: made, to: actorId, announce: false }
      : { kind: "addRelation", type: ObjectRelations.containedIn, from: made, to: recipe.spaceId, announce: false });
  });
  if (charge) effects.push({ kind: "modifyComponent", entityId: actorId, component: SettlementComponents.holding,
    patch: { activityDay: world.tick, activityUsed: before.used + recipe.activity },
    reason: "activity capacity spent on a recipe" });
  const ctx: Record<string, JsonValue> = { "$inputs": ids, "$output": outputIds[0]!, "$outputs": outputIds, "$count": outputIds.length };
  effects.push({ kind: "emitEvent", eventType: recipe.event?.type ?? "settlement-locations.crafted", actorId,
    targetId: outputIds[0],
    data: recipe.event?.data
      ? Object.fromEntries(Object.entries(recipe.event.data).map(([k, v]) => [k, fill(v, ctx)]))
      : { recipeId: recipe.id, label: recipe.label, objectId: outputIds[0]!, objectIds: outputIds, inputIds: ids, toolId: toolId || null },
    historicalSignificance: recipe.event?.significance ?? 0.02 });
  return effects;
}

/** The recipe a dedicated older command runs. */
function recipeForCommand(command: string): RecipeSpec {
  const r = RECIPES.find((x) => x.command === command);
  if (!r) throw new Error(`settlement pack has no recipe for ${command}`);
  return r;
}


// ---------------------------------------------------------------------------
// Homes: roofs wear in rain and snow and are mended with reed, rope and clay.
// ---------------------------------------------------------------------------

export const ROOF_MAX = 10;
/** At or below this the roof leaks: a wet night at home gives no rest bonus. */
export const ROOF_LEAKS_AT = 3;
/** Wet days of wear per lost level (snow counts double). */
const ROOF_WEAR_PER_LEVEL = 4;

/** Lazy roof state: computed from the last mending and the deterministic weather since. */
export function roofState(world: WorldView, spaceId: string) {
  const raw = world.hasEntity(spaceId) ? world.getComponent(spaceId, SettlementComponents.roof) : undefined;
  const level = Math.max(0, Math.min(ROOF_MAX, Number(raw?.level ?? ROOF_MAX)));
  const since = Math.max(0, Math.floor(Number(raw?.mendedAt ?? 0)));
  let wear = 0;
  for (let d = Math.max(since + 1, world.tick - 720); d <= world.tick; d++) {
    const sky = skyOn(d);
    wear += sky === "雪" ? 2 : sky === "雨" ? 1 : 0;
  }
  const condition = Math.max(0, level - Math.floor(wear / ROOF_WEAR_PER_LEVEL));
  return { condition, max: ROOF_MAX, leaking: condition <= ROOF_LEAKS_AT, mendedAt: since };
}

function roofMendEffects(world: WorldView, actorId: string, recipe: RecipeSpec, ids: string[], used: number, charge: boolean): Effect[] {
  const spaceId = occupiedSpaceId(world, actorId);
  const before = roofState(world, spaceId).condition;
  const effects: Effect[] = [];
  for (const id of ids) {
    effects.push({ kind: "removeRelation", type: ObjectRelations.heldBy, from: id, to: actorId,
      reason: `used up: ${recipe.label}`, announce: false },
    { kind: "archiveEntity", entityId: id, reason: `used up: ${recipe.label}`, announce: false });
  }
  effects.push({ kind: "setComponent", entityId: spaceId, component: SettlementComponents.roof,
    value: { level: ROOF_MAX, mendedAt: world.tick, mendedBy: actorId, inputIds: ids }, reason: "roof mended" });
  if (charge) effects.push({ kind: "modifyComponent", entityId: actorId, component: SettlementComponents.holding,
    patch: { activityDay: world.tick, activityUsed: used + recipe.activity }, reason: "activity capacity spent on a recipe" });
  effects.push({ kind: "emitEvent", eventType: "settlement-locations.roof_mended", actorId, targetId: spaceId,
    data: { recipeId: recipe.id, label: recipe.label, spaceId, before, after: ROOF_MAX, inputIds: ids },
    historicalSignificance: 0.02 });
  return effects;
}

// ---------------------------------------------------------------------------
// 见闻、人情与村民主动开口（social.ts 是纯数据，这里是经过校验的世界命令）
// ---------------------------------------------------------------------------

export interface PlayerRequestView {
  requesterId: string; name: string; kind: "borrow" | "trade" | "collect";
  resourceId: string; label: string; give: string[]; reason: string; at: number;
  /** 对方此刻就在你身边，能当面答应。 */
  here: boolean; whereName: string;
}

interface RequestRecord {
  status: string; to: string; at: number; resourceId: string; give: string[];
  kind: "borrow" | "trade" | "collect"; placeId: string; reason: string;
}

const activeId = (world: WorldView) =>
  String(world.getComponent("modern:world", "modern.world_state")?.activeCharacterId ?? "");

export function socialOf(world: WorldView, personId: string): SocialMemory {
  return readSocial(world.getComponent(personId, SettlementComponents.resident)?.social);
}

function requestOf(world: WorldView, residentId: string): RequestRecord | null {
  const raw = world.getComponent(residentId, SettlementComponents.resident)?.request;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, JsonValue>;
  const kind = r.kind === "trade" || r.kind === "collect" ? r.kind : "borrow";
  return {
    status: String(r.status ?? ""), to: String(r.to ?? ""), at: Number(r.at ?? -100),
    resourceId: String(r.resourceId ?? ""), give: Array.isArray(r.give) ? r.give.map(String) : [],
    kind, placeId: String(r.placeId ?? ""), reason: String(r.reason ?? ""),
  };
}

/** A request still waiting for the person it was made to. */
export function openRequest(world: WorldView, residentId: string): RequestRecord | null {
  const r = requestOf(world, residentId);
  return r && r.status === "pending" && world.tick - r.at <= REQUEST_DAYS ? r : null;
}

function worth(resourceId: string): number { return EXCHANGE_VALUES[resourceId] ?? 0; }

function handover(itemId: string, from: string, to: string, reason: string): Effect[] {
  return [
    { kind: "removeRelation", type: ObjectRelations.heldBy, from: itemId, to: from, reason, announce: false },
    { kind: "removeRelation", type: ObjectRelations.ownedBy, from: itemId, to: from, reason, announce: false },
    { kind: "addRelation", type: ObjectRelations.heldBy, from: itemId, to, announce: false },
    { kind: "addRelation", type: ObjectRelations.ownedBy, from: itemId, to, announce: false },
  ];
}

/** Set what `debtorId` owes `creditorId` (the ledger lives on the creditor). */
function setFavour(world: WorldView, creditorId: string, debtorId: string, value: number, reason: string): Effect[] {
  const component = world.getComponent(creditorId, SettlementComponents.resident) ? SettlementComponents.resident
    : world.getComponent(creditorId, SettlementComponents.holding) ? SettlementComponents.holding : "";
  if (!component) return [];
  const raw = world.getComponent(creditorId, component)?.favours;
  const favours = { ...(raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, JsonValue> : {}) };
  const v = Math.round(value * 10) / 10;
  if (v > 0) favours[debtorId] = v; else delete favours[debtorId];
  return [{ kind: "modifyComponent", entityId: creditorId, component, patch: { favours }, reason }];
}

function saveSocial(residentIdValue: string, memory: SocialMemory, reason: string): Effect {
  return { kind: "modifyComponent", entityId: residentIdValue, component: SettlementComponents.resident,
    patch: { social: toJson(memory) }, reason };
}

/** How close the counterpart feels to the proposer: talk counts, and so do their own memories. */
function feltCloseness(world: WorldView, proposerId: string, targetId: string): Closeness {
  const base = contactLevel(world, proposerId, targetId) as Closeness;
  if (!world.getComponent(targetId, SettlementComponents.resident)) return base;
  const bond = bondOf(socialOf(world, targetId), proposerId);
  if (bond.grudge >= 3) return "陌生";
  if (base === "陌生" && bond.familiarity >= 4) return bond.trust >= 7 ? "相识" : "见过";
  if (base === "见过" && (bond.trust >= 8 || bond.familiarity >= 6)) return "相识";
  return base;
}

/** What a resident feels about you, in a few words. */
function regardWord(world: WorldView, npcId: string, playerId: string): string {
  if (!playerId || npcId === playerId) return "";
  const bond = bondOf(socialOf(world, npcId), playerId);
  const words: string[] = [];
  if (bond.grudge >= 3) words.push("对你有怨气");
  else if (bond.trust >= 8) words.push("信得过你");
  else if (bond.trust <= 3) words.push("不太信你");
  if (favourOwed(world, playerId, npcId) > 0) words.push("欠你人情");
  if (favourOwed(world, npcId, playerId) > 0) words.push("你欠着人情");
  return words.join("、");
}

function playerRequests(world: WorldView, playerId: string): PlayerRequestView[] {
  if (!playerId) return [];
  const here = occupiedPlaceId(world, playerId);
  return RESIDENTS.map((r) => residentId(r.key)).flatMap((id) => {
    const req = openRequest(world, id);
    if (!req || req.to !== playerId) return [];
    const at = occupiedPlaceId(world, id);
    return [{
      requesterId: id, name: personName(world, id), kind: req.kind, resourceId: req.resourceId,
      label: RESOURCE_LABELS[req.resourceId] ?? req.resourceId,
      give: req.give.filter((g) => world.getEntity(g)).map((g) => RESOURCE_LABELS[prototypeOf(world, g).resourceId ?? ""] ?? "东西"),
      reason: req.reason, at: req.at, here: Boolean(here) && here === at,
      whereName: String(world.getComponent(at, SpaceComponents.place)?.name ?? PLACES.find((p) => p.id === at)?.name ?? "别处"),
    }];
  });
}

function registerSocial(ctx: Registration): void {
  const isResident = (world: WorldView, id: string) => Boolean(world.getComponent(id, SettlementComponents.resident));

  // ---- 看一看身边：记下谁在、带着什么；听别人说起旁人；过期的请求算作没回音。
  ctx.registerConstraintRule({
    id: `${SettlementCommands.npcNotice}.allowed`, commandType: SettlementCommands.npcNotice,
    evaluate: (c) => c.command.source === "ai" && isResident(c.world, c.command.actorId ?? "")
      ? { ok: true } : refuse(SettlementRejection.NotYours, "只有村民自己会留意身边的人。"),
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.npcNotice}.resolve`, commandType: SettlementCommands.npcNotice,
    resolve: (c): Effect[] => {
      const me = c.command.actorId as string, tick = c.world.tick;
      const here = occupiedPlaceId(c.world, me);
      let memory = socialOf(c.world, me);
      const effects: Effect[] = [];
      if (here) {
        const others = c.world.listEntities({ kind: "modern.character" })
          .filter((e) => e.id !== me && e.archivedAt === undefined && occupiedPlaceId(c.world, e.id) === here)
          .map((e) => e.id).sort();
        // 记得在这儿的人眼下不在：只知道他不在这儿了，手上有什么还记着。
        for (const [id, seen] of Object.entries(memory.seen))
          if (seen.placeId === here && !others.includes(id)) memory = { ...memory, seen: { ...memory.seen, [id]: { ...seen, placeId: "" } } };
        for (const id of others) {
          const goods = Object.fromEntries(Object.entries(tradeableGoods(c.world, id)).map(([r, ids]) => [r, ids.length]));
          memory = { ...memory, seen: { ...memory.seen, [id]: { placeId: here, at: tick, goods } } };
          // 同处一地的时间多了，自然就熟一些（每天每人最多一次）。
          // 光是常碰面只能熟到「见过」；再深要靠说话、帮忙。
          const bond = bondOf(memory, id);
          if (bond.lastAt !== tick && bond.familiarity < 4) memory = withBond(memory, id, { familiarity: 0.25 }, tick);
          if (isResident(c.world, id)) memory = mergeHeard(memory, socialOf(c.world, id), me, id);
        }
      }
      const req = requestOf(c.world, me);
      if (req && req.status === "pending" && tick - req.at > REQUEST_DAYS) {
        memory = withBond(memory, req.to, { trust: -1, grudge: 0.5 }, tick);
        effects.push({ kind: "modifyComponent", entityId: me, component: SettlementComponents.resident,
          patch: { request: { ...req, status: "lapsed", resolvedAt: tick } as unknown as JsonValue },
          reason: "a request nobody answered" });
      }
      effects.unshift(saveSocial(me, memory, "a resident notices who is around and what they carry"));
      return effects;
    },
  });

  // ---- 当面开口求玩家：借、换、或讨回人情。答不答应由玩家决定。
  const readRequest = (p: Record<string, unknown>) => ({
    targetId: String(p.targetId ?? ""), resourceId: String(p.resourceId ?? ""),
    give: Array.isArray(p.give) ? p.give.map(String) : [], reason: String(p.reason ?? "").slice(0, 40),
  });
  ctx.registerConstraintRule({
    id: `${SettlementCommands.npcRequest}.allowed`, commandType: SettlementCommands.npcRequest,
    evaluate: (c) => {
      const me = c.command.actorId ?? "";
      const p = readRequest(c.command.payload ?? {});
      if (c.command.source !== "ai" || !isResident(c.world, me)) return refuse(SettlementRejection.NotYours, "只有村民会自己开口求人。");
      if (!p.targetId || p.targetId !== activeId(c.world)) return refuse(SettlementRejection.NotYours, "村民之间直接当面交换；这里是向玩家开口。");
      const here = occupiedPlaceId(c.world, me);
      if (!here || here !== occupiedPlaceId(c.world, p.targetId)) return refuse(SettlementRejection.WrongPlace, "要走到对方面前才能开口。");
      if (!(p.resourceId in EXCHANGE_VALUES)) return refuse(SettlementRejection.Empty, "这样东西在村里还没有约定的价值。");
      if (!(tradeableGoods(c.world, p.targetId)[p.resourceId]?.length)) return refuse(SettlementRejection.Empty, "对方手上并没有这样东西。");
      if (openRequest(c.world, me)) return refuse(SettlementRejection.Busy, "还在等对方回话。");
      if (c.world.tick - (socialOf(c.world, me).asked[p.targetId] ?? -100) < ASK_COOLDOWN) return refuse(SettlementRejection.Busy, "前两天刚开过口，不好再去。");
      if (p.give.length > 2 || new Set(p.give).size !== p.give.length) return refuse(SettlementRejection.NotYours, "最多拿出两件东西。");
      for (const id of p.give) {
        const r = prototypeOf(c.world, id).resourceId ?? "";
        if (r === p.resourceId || !tradeReady(c.world, id, me, r)) return refuse(SettlementRejection.NotYours, "拿出来的东西得是自己手里的。");
      }
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.npcRequest}.resolve`, commandType: SettlementCommands.npcRequest,
    resolve: (c): Effect[] => {
      const me = c.command.actorId as string, tick = c.world.tick;
      const p = readRequest(c.command.payload ?? {});
      const kind = favourOwed(c.world, me, p.targetId) > 0 ? "collect" : p.give.length ? "trade" : "borrow";
      const memory = socialOf(c.world, me);
      const record = { status: "pending", to: p.targetId, at: tick, resourceId: p.resourceId, give: p.give,
        kind, placeId: occupiedPlaceId(c.world, me), reason: p.reason };
      return [
        { kind: "modifyComponent", entityId: me, component: SettlementComponents.resident,
          patch: { request: record as unknown as JsonValue }, reason: "a resident asks the player face to face" },
        saveSocial(me, { ...memory, asked: { ...memory.asked, [p.targetId]: tick } }, "remember having asked"),
        { kind: "emitEvent", eventType: "settlement-locations.npc_requested", actorId: me, targetId: p.targetId,
          data: { resourceId: p.resourceId, kind, give: p.give, reason: p.reason }, historicalSignificance: 0.05 },
      ];
    },
  });

  // ---- 玩家回话。答应要当面把东西递过去；拒绝随时都可以。
  ctx.registerConstraintRule({
    id: `${SettlementCommands.requestAnswer}.allowed`, commandType: SettlementCommands.requestAnswer,
    evaluate: (c) => {
      const me = c.command.actorId ?? "";
      const from = String(c.command.payload.requesterId ?? "");
      if (c.command.source !== "player" || !me || me !== activeId(c.world)) return refuse(SettlementRejection.NotYours, "只能由你自己回话。");
      if (typeof c.command.payload.accept !== "boolean") return refuse(SettlementRejection.NotYours, "要说答应还是不答应。");
      const req = openRequest(c.world, from);
      if (!req || req.to !== me) return refuse(SettlementRejection.Busy, "没有等你回话的请求。");
      if (c.command.payload.accept !== true) return { ok: true };
      if (occupiedPlaceId(c.world, me) !== occupiedPlaceId(c.world, from))
        return refuse(SettlementRejection.WrongPlace, `要当面把东西交给${personName(c.world, from)}，先走到对方那里。`);
      const item = (tradeableGoods(c.world, me)[req.resourceId] ?? [])[0];
      if (!item) return refuse(SettlementRejection.Empty, `你手上已经没有${RESOURCE_LABELS[req.resourceId] ?? "这样东西"}了。`);
      if (!canCarryObject(c.world, from, item)) return refuse(SettlementRejection.NoRoom, `${personName(c.world, from)}手上拿不下了。`);
      for (const g of req.give.filter((g) => tradeReady(c.world, g, from, prototypeOf(c.world, g).resourceId ?? "")))
        if (!canCarryObject(c.world, me, g, item)) return refuse(SettlementRejection.NoRoom, "你拿不下对方给的东西，先放下些。");
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.requestAnswer}.resolve`, commandType: SettlementCommands.requestAnswer,
    resolve: (c): Effect[] => {
      const me = c.command.actorId as string, tick = c.world.tick;
      const from = String(c.command.payload.requesterId);
      const req = openRequest(c.world, from)!;
      const accepted = c.command.payload.accept === true;
      let memory = socialOf(c.world, from);
      const effects: Effect[] = [];
      let note = "";
      if (accepted) {
        const item = (tradeableGoods(c.world, me)[req.resourceId] ?? [])[0]!;
        const gifts = req.give.filter((g) => tradeReady(c.world, g, from, prototypeOf(c.world, g).resourceId ?? ""));
        effects.push(...handover(item, me, from, "the player agreed to a resident's request"));
        for (const g of gifts) effects.push(...handover(g, from, me, "what the resident offered in return"));
        const value = worth(req.resourceId);
        const back = gifts.reduce((n, g) => n + worth(prototypeOf(c.world, g).resourceId ?? ""), 0);
        const playerOwed = favourOwed(c.world, from, me);
        const paid = Math.min(playerOwed, Math.max(0, value - back));
        if (paid > 0) effects.push(...setFavour(c.world, from, me, playerOwed - paid, "the player paid back a favour"));
        const left = value - back - paid;
        if (left > 0) effects.push(...setFavour(c.world, me, from, favourOwed(c.world, me, from) + left, "a resident now owes the player"));
        memory = withBond(memory, me, { trust: back >= value ? 1 : 1.5, familiarity: 1, grudge: -1 }, tick);
        note = paid > 0 ? "抵了你欠的人情" : left > 0 ? "对方记下了这份人情" : "两清";
      } else {
        memory = withBond(memory, me, { trust: -0.5, grudge: req.kind === "collect" ? 2 : 1 }, tick);
      }
      effects.push(
        saveSocial(from, memory, accepted ? "remember being helped" : "remember being turned down"),
        { kind: "modifyComponent", entityId: from, component: SettlementComponents.resident,
          patch: { request: { ...req, status: accepted ? "accepted" : "declined", resolvedAt: tick } as unknown as JsonValue },
          reason: "the player's answer" },
        { kind: "emitEvent", eventType: accepted ? "settlement-locations.request_granted" : "settlement-locations.request_refused",
          actorId: me, targetId: from, data: { resourceId: req.resourceId, kind: req.kind, note },
          historicalSignificance: accepted ? 0.08 : 0.04 },
      );
      return effects;
    },
  });

  // ---- 把自己的东西送给某人：还人情、道谢。
  ctx.registerConstraintRule({
    id: `${SettlementCommands.npcGive}.allowed`, commandType: SettlementCommands.npcGive,
    evaluate: (c) => {
      const me = c.command.actorId ?? "";
      const to = String(c.command.payload.targetId ?? "");
      const item = String(c.command.payload.itemId ?? "");
      if (c.command.source !== "ai" || !isResident(c.world, me)) return refuse(SettlementRejection.NotYours, "只有村民自己会送出东西。");
      if (!to || to === me || !isPerson(c.world, to)) return refuse(SettlementRejection.NoSuchResident, "要送给一个具体的人。");
      const here = occupiedPlaceId(c.world, me);
      if (!here || here !== occupiedPlaceId(c.world, to)) return refuse(SettlementRejection.WrongPlace, "要当面交到对方手里。");
      if (!tradeReady(c.world, item, me, prototypeOf(c.world, item).resourceId ?? "")) return refuse(SettlementRejection.NotYours, "只能送自己手里的东西。");
      if (!canCarryObject(c.world, to, item)) return refuse(SettlementRejection.NoRoom, "对方拿不下了。");
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.npcGive}.resolve`, commandType: SettlementCommands.npcGive,
    resolve: (c): Effect[] => {
      const me = c.command.actorId as string;
      const to = String(c.command.payload.targetId), item = String(c.command.payload.itemId);
      const resourceId = prototypeOf(c.world, item).resourceId ?? "";
      const debt = favourOwed(c.world, to, me);
      const repaid = Math.min(debt, worth(resourceId));
      return [
        ...handover(item, me, to, "a resident hands over something of their own"),
        ...(repaid > 0 ? setFavour(c.world, to, me, debt - repaid, "favour repaid with a gift") : []),
        { kind: "emitEvent", eventType: "settlement-locations.gift_given", actorId: me, targetId: to,
          data: { resourceId, repaid }, historicalSignificance: 0.05 },
      ];
    },
  });
}
