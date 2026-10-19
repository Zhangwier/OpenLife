/**
 * Village reads: pure world queries the settlement rules and the autonomy
 * agents both need (daily activity, stocks, roofs, favours, requests, family
 * and season-turn checks).
 *
 * This file must never import module.ts or autonomy/*: the agents read the
 * village through it, so keeping it below both is what keeps the package free
 * of runtime import cycles (tests/unit/import-cycles.test.ts).
 */
import { type PlaceSpec, type ResidentSpec, RIVER_TERRACE_PACK, type YieldSpec } from "./content.ts";
import type { Effect, JsonValue, WorldView } from "@openlife/contracts";
import { residentId, SettlementCommands, SettlementComponents, SettlementId } from "./vocabulary.ts";
import { HUNGER_DAYS_PER_POINT, hungerAt } from "./hunger.ts";
import { mergedEffects, type PlayerOrigin, readOrigin } from "./origin.ts";
import { contentsOf, ObjectComponents, ObjectKinds, ObjectRelations, prototypeOf, readObject, wornByActor } from "@openlife/module-world-objects";
import { isWet, OUTDOOR_PLACES, skyOn } from "./weather.ts";
import { occupiedPlaceId, occupiedSpaceId, SpaceComponents, SpaceRelations } from "@openlife/module-world-space";
import { tradeReady } from "./barter.ts";
import { personName, RESIDENTS, saveSocial, socialOf } from "./world-reads.ts";
import type { Closeness, CounterpartView } from "./exchange.ts";
import { DAY_TICKS_PER_YEAR, DAYS_PER_MONTH } from "@openlife/life-contracts";
import { bondOf, readSocial, REQUEST_DAYS, type SocialMemory, toJson, withBond, withNews } from "./social.ts";
import { spouseOf } from "./marriage.ts";
import { calendarDate } from "./happenings.ts";

/** Places of the settlement, each with a purpose and a cost to reach. */
// Open outdoor arrival spots allow villagers and visitors to pass; 0 is the
// shared world-space convention for unbounded open areas. Indoor rooms remain
// capacity-limited. The main household accommodates its two adults + guests.
export const PLACES: PlaceSpec[] = RIVER_TERRACE_PACK.places;

/** Renewing resources. Each has one authoritative owner: this module. */
export const YIELDS: YieldSpec[] = RIVER_TERRACE_PACK.yields;

export const RESOURCE_LABELS: Record<string, string> = RIVER_TERRACE_PACK.resourceLabels;

// ---------------------------------------------------------------------------
// Reading: homestead, people, worksites
// ---------------------------------------------------------------------------

export interface YieldState {
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

export function yieldPoints(world: WorldView): YieldState[] {
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

export function renewedStock(state: YieldState, tick: number, perCycle: number, seasons?: string[]): number {
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

export function yieldSpecFor(placeId: string, resourceId: string): YieldSpec | undefined {
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
export function renewalPerCycle(world: WorldView, spec: YieldSpec | undefined): number {
  if (spec?.perResidents) return Math.max(1, Math.ceil(villagePopulation(world) / spec.perResidents));
  return spec?.resourceId === "resource:grain" ? 0 : 1;
}

export function readResident(world: WorldView, residentId: string) {
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

/** Hunger is derived from the world's day clock, not an extra ticking timer. */
export function hungerLevel(world: WorldView, actorId: string): number {
  const state = world.getComponent(actorId, SettlementComponents.holding);
  const settlementStart = world.getComponent(SettlementId, SettlementComponents.settlement)?.foundedAt;
  const since = Number(state?.hungerAt ?? settlementStart ?? world.tick);
  const base = Number(state?.hunger ?? 0);
  return hungerAt(base, since, world.tick, talentFx(world, actorId).hungerDaysPerPoint || HUNGER_DAYS_PER_POINT);
}

/** The player's 出身与天赋 (none for villagers and for lives saved before 0.2.0). */
export function originOf(world: WorldView, actorId: string): PlayerOrigin {
  return readOrigin(world.getComponent(actorId, SettlementComponents.holding)?.origin);
}

export function talentFx(world: WorldView, actorId: string) { return mergedEffects(originOf(world, actorId)); }

// ---------------------------------------------------------------------------
// 手艺：跟村里人一课一课学来的本事（陶叔的看火、岚母的编织、阿予的认地）。
// ---------------------------------------------------------------------------
export type Teacher = { residentId: string; key: string; name: string; teaches: NonNullable<ResidentSpec["teaches"]> };

export const TEACHERS: Teacher[] = RIVER_TERRACE_PACK.residents.filter((r) => r.teaches)
  .map((r) => ({ residentId: `settlement-locations:resident:${r.key}`, key: r.key, name: r.name, teaches: r.teaches! }));

export function skillsOf(world: WorldView, actorId: string): string[] {
  const raw = world.getComponent(actorId, SettlementComponents.holding)?.skills;
  return Array.isArray(raw) ? raw.map(String) : [];
}

export function skillCut(world: WorldView, actorId: string, recipeId: string): number {
  const skills = skillsOf(world, actorId);
  return TEACHERS.some((t) => skills.includes(t.teaches.skill) && t.teaches.recipes?.includes(recipeId)) ? 1 : 0;
}

/** M2-UX2-A: a bounded capacity for actions within the current kernel day.
 * This is NOT a second clock: an old save without these fields starts with
 * 8 free activity units at the world's current tick. Time still advances via
 * the existing Simulation clock and its scheduler.
 */
export const DAILY_ACTIVITY_CAPACITY = 8;

export const ACTIVITY_COST: Partial<Record<string, number>> = {
  [SettlementCommands.eat]: 1,
  [SettlementCommands.drink]: 1,
  [SettlementCommands.draw]: 2,
  [SettlementCommands.talk]: 1,
  [SettlementCommands.learn]: 2,
  [SettlementCommands.cook]: 2,
  [SettlementCommands.weaveBag]: 2,
  [SettlementCommands.weaveMat]: 2,
  [SettlementCommands.prepareFiber]: 2,
  [SettlementCommands.weaveWrap]: 2,
  [SettlementCommands.sow]: 3,
  [SettlementCommands.harvest]: 3,
  [SettlementCommands.tend]: 3,
  [SettlementCommands.rest]: 2,
  [SettlementCommands.craft]: 2,
};

/** A single personally owned wrap shields the worker at the field. */
export function wornWrap(world: WorldView, actorId: string): string {
  const id = wornByActor(world, actorId);
  return id && prototypeOf(world, id).prototypeId === "prototype:fiber-wrap" ? id : "";
}

export const CRAFT_COMMANDS = new Set<string>([SettlementCommands.weaveBag, SettlementCommands.weaveMat,
  SettlementCommands.prepareFiber, SettlementCommands.weaveWrap, SettlementCommands.cook]);

export const OUTDOOR_WORK = new Set<string>([SettlementCommands.draw, SettlementCommands.tend, SettlementCommands.sow, SettlementCommands.harvest]);

export function activityCostFor(world: WorldView, actorId: string, commandType: string): number {
  let cost = ACTIVITY_COST[commandType] ?? 0;
  const fx = talentFx(world, actorId);
  if (cost && CRAFT_COMMANDS.has(commandType)) {
    const recipe = (RIVER_TERRACE_PACK.recipes ?? []).find((r) => r.command === commandType);
    cost = Math.max(1, cost - fx.craftActivity - (recipe ? skillCut(world, actorId, recipe.id) : 0));
  }
  // Rain and snow make outdoor labour heavier (unless you are used to hardship).
  if (cost && OUTDOOR_WORK.has(commandType) && isWet(world.tick) && !fx.ignoreWet &&
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
  const capacity = DAILY_ACTIVITY_CAPACITY + (extraToday ? 1 : 0) + (warmToday ? 1 : 0) + talentFx(world, actorId).dailyActivity;
  const used = Number(raw?.activityDay ?? -1) === day
    ? Math.max(0, Math.min(capacity, Number(raw?.activityUsed ?? 0)))
    : 0;
  return { day, used, remaining: capacity - used, capacity };
}

/**
 * M3-B: narrow, explicit two-party barter between the cook and the farmer.
 * Proposal records the cook's consent; acceptance is a second command by Yu.
 * The single acceptance transaction swaps existing ownership AND custody of
 * two concrete, individually held resource bundles. No parallel stock.
 */


// ---------------------------------------------------------------------------
// General exchange (any two people, any valued goods, favours owed)
// ---------------------------------------------------------------------------

export const EXCHANGE_VALUES: Record<string, number> = RIVER_TERRACE_PACK.exchange?.values ?? {};

export const EXCHANGE_WANTS: Record<string, string[]> = RIVER_TERRACE_PACK.exchange?.wants ?? {};

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

export function wantsOf(world: WorldView, personId: string): string[] {
  const key = RESIDENTS.find((r) => residentId(r.key) === personId)?.key;
  return key ? EXCHANGE_WANTS[key] ?? [] : [];
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

export function contactConversations(world: WorldView, actorId: string, targetId: string): number {
  const raw = world.getComponent(actorId, SettlementComponents.holding)?.contacts;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return 0;
  const person = (raw as Record<string, JsonValue>)[targetId];
  if (!person || typeof person !== "object" || Array.isArray(person)) return 0;
  return Math.max(0, Number((person as Record<string, JsonValue>).conversations ?? 0));
}

export function contactLevel(world: WorldView, actorId: string, targetId: string): string {
  const count = contactConversations(world, actorId, targetId);
  return count >= 3 ? "相识" : count > 0 ? "见过" : "陌生";
}

export const PURPOSE: Record<string, string> = {
  "place:yard": "住处与储粮",
  "place:hearth-yard": "做饭与分食",
  "place:river": "取水",
  "place:field": "田地与收成",
  "place:kiln": "烧制陶器",
  "place:claypits": "取黏土",
  "place:reedbed": "割芦苇与柴草",
  "place:ford": "过河与交换", ...Object.fromEntries(RIVER_TERRACE_PACK.places.filter((p) => p.purpose).map((p) => [p.id, p.purpose!])),
};

/** A small stable hash for picking lines deterministically from world state. */
export function pickIndex(key: string, n: number): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return n > 0 ? h % n : 0;
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

export function seasonOf(tick: number): string {
  const month = (Math.floor(tick / DAYS_PER_MONTH) % 12) + 1;
  if (month >= 3 && month <= 5) return "春";
  if (month >= 6 && month <= 8) return "夏";
  if (month >= 9 && month <= 11) return "秋";
  return "冬";
}

export function fill(template: string | number, ctx: Record<string, JsonValue>): JsonValue {
  return typeof template === "string" && template.startsWith("$") && template in ctx ? ctx[template]! : template;
}

// ---------------------------------------------------------------------------
// Homes: roofs wear in rain and snow and are mended with reed, rope and clay.
// ---------------------------------------------------------------------------

export const ROOF_MAX = 10;

/** At or below this the roof leaks: a wet night at home gives no rest bonus. */
export const ROOF_LEAKS_AT = 3;

/** Wet days of wear per lost level (snow counts double). */
export const ROOF_WEAR_PER_LEVEL = 4;

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

export interface RequestRecord {
  status: string; to: string; at: number; resourceId: string; give: string[];
  kind: "borrow" | "trade" | "collect"; placeId: string; reason: string;
}

export function requestOf(world: WorldView, residentId: string): RequestRecord | null {
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

/** How close the counterpart feels to the proposer: talk counts, and so do their own memories. */
export function feltCloseness(world: WorldView, proposerId: string, targetId: string): Closeness {
  const base = contactLevel(world, proposerId, targetId) as Closeness;
  if (!world.getComponent(targetId, SettlementComponents.resident)) return base;
  const bond = bondOf(socialOf(world, targetId), proposerId);
  if (bond.grudge >= 3) return "陌生";
  if (base === "陌生" && bond.familiarity >= 4) return bond.trust >= 7 ? "相识" : "见过";
  if (base === "见过" && (bond.trust >= 8 || bond.familiarity >= 6)) return "相识";
  return base;
}

/** 一次结算里对同一个人的记忆改好几回时，先在这里攒着，最后一并写回（不互相覆盖）。 */
export type SocialDraft = Map<string, SocialMemory>;

export const draftOf = (draft: SocialDraft, world: WorldView, id: string) => draft.get(id) ?? socialOf(world, id);

export const flushDraft = (draft: SocialDraft, reason: string): Effect[] => [...draft].map(([id, m]) => saveSocial(id, m, reason));

// ---------------------------------------------------------------------------
// 成家以后：添丁、出生、孩子一年年长大。六岁起孩子就是村里的一个人，自己过日子。
// ---------------------------------------------------------------------------
export const FAMILY = RIVER_TERRACE_PACK.family;

export const CARRY_DAYS = 270;

/** 年岁以每年长一岁的 vitals 为准（村民的出生日可能早于世界开始，不能拿来算）。 */
export const AGE_OF = (world: WorldView, id: string) => {
  const years = world.getComponent(id, "modern.vitals")?.ageYears;
  if (typeof years === "number") return years;
  const born = Number(world.getComponent(id, "modern.identity")?.bornAt ?? world.tick);
  return Math.floor((world.tick - born) / DAY_TICKS_PER_YEAR);
};

export function childrenOf(world: WorldView, me: string): string[] {
  return world.listRelations({ type: "family.parent_of", from: me }).map((r) => r.to)
    .filter((id) => world.getEntity(id) && world.getEntity(id)!.archivedAt === undefined);
}

export function expectingAt(world: WorldView, me: string): number {
  const v = world.getComponent(me, SettlementComponents.holding)?.expectingAt;
  return typeof v === "number" ? v : -1;
}

/** 这段日子里（days 天）家里发生了什么：怀上、出生、孩子长到六岁。 */
export function familyEffects(world: WorldView, me: string, days: number, inSeason = false, shared?: SocialDraft): { effects: Effect[]; lines: string[] } {
  const effects: Effect[] = [], lines: string[] = [];
  const draft: SocialDraft = shared ?? new Map();
  if (!FAMILY) return { effects, lines };
  const tick = world.tick, spouse = spouseOf(world, me);
  const kids = childrenOf(world, me);
  const expecting = expectingAt(world, me);
  const fill = (t: string, vars: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");
  // 出生：怀上九个月。
  if (expecting >= 0 && tick - expecting >= CARRY_DAYS) {
    const bornAt = expecting + CARRY_DAYS;
    const n = kids.length;
    const used = new Set(kids.map((k) => personName(world, k)));
    const pool = FAMILY.names.filter((x) => !used.has(x));
    const name = (pool.length ? pool[pickIndex(`${me}:${bornAt}:name`, pool.length)] : undefined) ?? `孩子${n + 1}`;
    const sex = pickIndex(`${me}:${bornAt}:sex`, 2) === 0 ? "female" : "male";
    const id = `settlement-locations:child:${bornAt}:${n}`;
    const identity = world.getComponent(me, "modern.identity");
    effects.push(
      { kind: "spawnEntity", localId: `child:${n}`, id, entityKind: "modern.character", components: {
        "modern.identity": { givenName: name, familyName: String(identity?.familyName ?? ""), sex,
          generation: Number(identity?.generation ?? 1) + 1, lineageId: String(identity?.lineageId ?? "family:lineage:1"), bornAt },
        "modern.vitals": { alive: true, health: 1, ageYears: 0, lifespan: 78 },
        "modern.residence": { cityId: "modern:city:north" }, "modern.wealth": { cash: 0, debt: 0 } }, announce: false },
      { kind: "addRelation", type: "family.parent_of", from: me, to: id, components: { "family.parent": { since: bornAt } }, announce: false },
      ...(spouse ? [{ kind: "addRelation" as const, type: "family.parent_of", from: spouse, to: id, components: { "family.parent": { since: bornAt } }, announce: false }] : []),
      { kind: "modifyComponent", entityId: me, component: SettlementComponents.holding, patch: { expectingAt: null, lastBornAt: bornAt }, reason: "a child is born" },
      { kind: "emitEvent", eventType: "family.child_born", actorId: me, targetId: id,
        data: { givenName: name, ...(inSeason ? {} : { line: fill(FAMILY.born, { month: String(calendarDate(bornAt).month), sex: sex === "female" ? "女孩" : "男孩", name }) }) }, historicalSignificance: 0.6 });
    for (const r of RESIDENTS) {
      const rid = residentId(r.key);
      if (world.getEntity(rid)?.archivedAt !== undefined) continue;
      draft.set(rid, withNews(draftOf(draft, world, rid), `born:${id}`, { about: me, text: `${personName(world, me)}家添了个${sex === "female" ? "闺女" : "小子"}，叫${name}`, at: tick }));
    }
    lines.push(fill(FAMILY.born, { month: String(calendarDate(bornAt).month), sex: sex === "female" ? "女孩" : "男孩", name }));
  } else if (expecting < 0 && spouse && world.getComponent(spouse, "modern.vitals")?.alive !== false && kids.length < 4) {
    // 怀上：成了亲、两人都还年轻、上一个孩子满了一岁半；一季大约三成机会。
    const ages = [AGE_OF(world, me), AGE_OF(world, spouse)];
    const lastBorn = Number(world.getComponent(me, SettlementComponents.holding)?.lastBornAt ?? -9999);
    if (ages.every((a) => a >= 18 && a <= 45) && tick - lastBorn >= 720) {
      const perDay = 1 / 360;
      const chance = 1 - Math.pow(1 - perDay, Math.max(1, days));
      if (pickIndex(`${me}:${tick}:conceive`, 1000) < Math.round(chance * 1000)) {
        effects.push({ kind: "modifyComponent", entityId: me, component: SettlementComponents.holding, patch: { expectingAt: tick }, reason: "expecting a child" });
        const line = fill(FAMILY.expecting, { spouse: personName(world, spouse) });
        effects.push({ kind: "emitEvent", eventType: "settlement-locations.expecting", actorId: me, targetId: spouse, data: inSeason ? {} : { line }, historicalSignificance: 0.1 });
        lines.push(line);
      }
    }
  }
  // 长到六岁：成了村里的一个人，跟着家里人过日子。
  for (const kid of kids) {
    if (world.getComponent(kid, SettlementComponents.resident) || AGE_OF(world, kid) < 6) continue;
    const parent = spouse && world.getComponent(spouse, SettlementComponents.resident) ? readResident(world, spouse)! : undefined;
    const name = personName(world, kid);
    effects.push(
      { kind: "setComponent", entityId: kid, component: SettlementComponents.resident, value: {
        household: parent?.household ?? "你家", role: "孩子", trait: "", wish: "",
        workPlace: "place:yard", homeSpace: parent?.homeSpace ?? "", hunger: 0, rested: 1, standingRoutine: "",
        social: toJson(withBond(readSocial(undefined), me, { familiarity: 8, trust: 9 }, tick)) } as unknown as Record<string, never>, reason: "old enough to help at home" },
      { kind: "setComponent", entityId: kid, component: SettlementComponents.holding, value: { hunger: 0, hungerAt: tick }, reason: "a child's own day" },
      { kind: "addRelation", type: SpaceRelations.occupancy, from: kid, to: "place:yard",
        components: { [SpaceComponents.occupancy]: { placeId: "place:yard", spaceId: "", since: tick } }, announce: false },
      { kind: "emitEvent", eventType: "settlement-locations.child_grew", actorId: me, targetId: kid, data: inSeason ? {} : { line: fill(FAMILY.grows, { name }) }, historicalSignificance: 0.1 });
    lines.push(fill(FAMILY.grows, { name }));
  }
  if (!shared) effects.push(...flushDraft(draft, "family news"));
  return { effects, lines };
}

/** 今天家里有没有要发生的事（没事就不发命令，不占一条记录）。 */
export function familyDue(world: WorldView, me: string): boolean {
  return Boolean(me && FAMILY && familyEffects(world, me, 1).effects.length);
}

// ---------------------------------------------------------------------------
// 村里的年景与人事：每到换季，村里总会有点事——年景好坏、天灾来客；
// 村民之间处得好的会结亲、添丁；人少了，渡口会来落脚的外乡人。
// 一季只结算一次（记在聚落上），日子一天天过和一季一季过都走这里。
// ---------------------------------------------------------------------------
export const STORY = RIVER_TERRACE_PACK.storyteller;

export const seasonKey = (tick: number) => `${Math.floor(tick / DAY_TICKS_PER_YEAR)}:${seasonOf(tick)}`;

export function seasonTurnDue(world: WorldView): boolean {
  const s = world.getComponent(SettlementId, SettlementComponents.settlement);
  return Boolean(STORY && s && String(s.lastSeasonTurn ?? "") !== seasonKey(world.tick) && Number(s.foundedAt ?? 0) < world.tick);
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
    "resource:fiber": "prototype:fiber-bundle", ...(RIVER_TERRACE_PACK.rawPrototypes ?? {}),
  };
  return mapping[resourceId] ?? "prototype:grain";
}
