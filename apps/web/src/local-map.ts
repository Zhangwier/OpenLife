/**
 * The playable map of the space the player stands in (map-life M1–M2).
 *
 * The rules module (`world-space.local-map`) owns the walls and the player's
 * confirmed cell; this file only hangs the things the player can already act
 * on — people, objects, materials, the work spot, doors and the way out — on
 * fixed anchors of that map. Each target carries the very actions the
 * settlement projection already offers, so the map is a different way to
 * choose the same commands, never a second rule book.
 *
 * `map.walk` and `map.interact` are the only map verbs. Walking is a free
 * `world-space.local_move`; interacting re-reads the current map, checks the
 * target is still there, the action is one of its own, and the player is
 * standing next to it, then runs the original action unchanged.
 */
import type { Simulation } from "@openlife/simulation";
import { SettlementCommands, DayPhase, phaseOf, currentPhase } from "@openlife/module-settlement-locations";
import {
  LocalGrid, approachCell, findPath, hashText, reachDistance,
  type Cell, type LocalMapView,
} from "@openlife/module-world-space";
import { rejected } from "./player.ts";

export type MapAction = Record<string, any> & { id: string; payload?: Record<string, unknown> };
export interface MapTarget {
  key: string;
  type: "person" | "animal" | "object" | "yield" | "work" | "door" | "exit";
  id: string;
  name: string;
  /** a short line under the name: who they are, what it is for */
  note: string;
  /** drawing hint for the client (object kind, resource id, person household) */
  look: string;
  x: number;
  y: number;
  actions: MapAction[];
}
export type SettlementMap = Omit<LocalMapView, "exists"> & { targets: MapTarget[]; playerLook: string; dayPhase: number };

const REED_WORK = new Set([SettlementCommands.weaveBag, SettlementCommands.weaveMat, SettlementCommands.prepareFiber] as string[]);
const FIBER_WORK = new Set([SettlementCommands.weaveWrap] as string[]);
const PERSON_ACTIONS = new Set<string>([
  SettlementCommands.talk, SettlementCommands.helpHearth, SettlementCommands.gift, SettlementCommands.learn,
  SettlementCommands.court, SettlementCommands.wed, SettlementCommands.exchange,
]);
/** Life-scale choices stay in the time menu, they are not done at a spot. */
const NOT_ON_MAP = new Set<string>([SettlementCommands.beginSeason, SettlementCommands.configurePlan]);
const ON_MAP = (s: string) => s === "放着" || s === "" || s === undefined;

const slotFor = (slots: Cell[], seed: string, fallback: Cell): Cell => slots.length ? slots[hashText(seed) % slots.length]! : fallback;
const workName: Record<string, string> = {
  "home-room": "铺位", "store-room": "储物架", riverbank: "取水石", field: "田头", kiln: "窑口", claypit: "坑边",
  reedbed: "割苇处", ford: "渡口岸边", hearth: "灶台", longhouse: "火塘", workshop: "工位", shrine: "祭台",
  market: "摊位", forest: "林缘", stonebeach: "卵石滩", lodge: "网架", herbs: "诊棚", yard: "院中空地",
};

/**
 * What anyone sees at a glance, for drawing a person: age band and build
 * ("adult:f:<id>"). Names, trades and birthdays stay with the knowledge rules;
 * a sprite carries only what a stranger would see.
 */
export function lookOf(sim: Simulation, person: Record<string, any>): string {
  const world = sim.worldView();
  const age = Number(world.getComponent(person.id, "modern.vitals")?.ageYears ?? 30);
  const sexRaw = String(world.getComponent(person.id, "modern.identity")?.sex ?? "");
  const role = String(world.getComponent(person.id, "settlement-locations.resident")?.role ?? "");
  const sex = sexRaw === "female" || /妇|婶|母|婆|女|姑|娘|嫂/.test(role) ? "f"
    : sexRaw === "male" || /叔|公|父|男|汉|翁/.test(role) ? "m" : "";
  const band = age < 12 ? "child" : age < 18 ? "youth" : age < 50 ? "adult" : "elder";
  return `${band}:${sex}:${person.id}`;
}

/**
 * Builds the map for the player's current space. `view` is the settlement
 * view (or a slice of it): objects, neighbours, yields, actions, nature.
 */
export function settlementMap(sim: Simulation, actorId: string, view: Record<string, any>): SettlementMap | null {
  const projected = sim.project({ id: LocalGrid.projection, params: { actorId } });
  const map = projected.ok ? projected.data as unknown as LocalMapView : null;
  if (!map?.exists) return null;
  const { exists: _exists, ...base } = map;
  const pool: MapAction[] = [...(view.actions ?? []), ...(view.nature?.actions ?? [])]
    .filter((a: MapAction) => !NOT_ON_MAP.has(a.id) && !(a.id === "world-space.move_within" && a.payload?.spaceId === map.spaceId));
  const claimed = new Set<MapAction>();
  const claim = (match: (a: MapAction, p: Record<string, any>) => boolean): MapAction[] => {
    const out = pool.filter((a) => !claimed.has(a) && match(a, a.payload ?? {}));
    out.forEach((a) => claimed.add(a));
    return out;
  };
  const targets: MapTarget[] = [];
  const cook = view.roles?.cook?.id ?? "settlement-locations:resident:cook";

  // People and animals move about, so they may shift to the next free spot;
  // objects keep their own spot whatever else is taken.
  const standing = new Set<string>();
  const spotFor = (seed: string): Cell => {
    const slots = map.peopleSlots;
    if (!slots.length) return map.spawn;
    const start = hashText(seed) % slots.length;
    for (let i = 0; i < slots.length; i++) {
      const c = slots[(start + i) % slots.length]!;
      if (!standing.has(`${c.x},${c.y}`)) { standing.add(`${c.x},${c.y}`); return c; }
    }
    return slots[start]!;
  };
  const people = ((view.neighbours ?? []) as Record<string, any>[]).filter((p) => !p.placeId || p.placeId === map.placeId)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  for (const person of people) {
    const at = spotFor(`person:${person.id}`);
    targets.push({
      key: `person:${person.id}`, type: "person", id: person.id, name: person.name, look: lookOf(sim, person),
      note: [person.role, person.atWork ? "正在忙" : "", person.contact].filter(Boolean).join(" · "),
      x: at.x, y: at.y,
      actions: claim((a, p) => (PERSON_ACTIONS.has(a.id) && p.targetId === person.id) || p.targetId === person.id
        || (person.id === cook && a.id.startsWith("settlement-locations.barter."))),
    });
  }
  for (const animal of (view.nature?.animals ?? []) as Record<string, any>[]) {
    const at = spotFor(`animal:${animal.id}`);
    const actions = claim((_a, p) => p.animalId === animal.id);
    if (!actions.length) continue;
    targets.push({ key: `animal:${animal.id}`, type: "animal", id: animal.id, name: animal.name, look: animal.kind,
      note: animal.line ?? "", x: at.x, y: at.y + 0, actions });
  }
  for (const object of (view.objects ?? []) as Record<string, any>[]) {
    if (object.visible === false || !ON_MAP(object.placement)) continue;
    const at = slotFor(map.objectSlots, `object:${object.id}`, map.work);
    const actions = claim((_a, p) => p.objectId === object.id || p.matId === object.id || p.containerId === object.id);
    if (object.placement === "放着") {
      actions.unshift({ id: "world-objects.take", label: `拿起${object.name}`, payload: { objectId: object.id },
        enabled: object.canTake === true, reason: object.canTake ? "" : "这是别人的东西，还没得到物主同意，不能直接拿走。" });
    }
    targets.push({ key: `object:${object.id}`, type: "object", id: object.id, name: object.name, look: object.prototypeId ?? "",
      note: object.capacity ? `装着 ${object.contentsCount ?? 0}/${object.capacity}` : "", x: at.x, y: at.y, actions });
  }
  for (const door of map.doors) {
    targets.push({ key: `door:${door.spaceId}`, type: "door", id: door.spaceId, name: door.name, look: "door", note: "屋里走动不花时间",
      x: door.x, y: door.y, actions: claim((a, p) => a.id === "world-space.move_within" && p.spaceId === door.spaceId) });
  }
  const exits = claim((a) => a.id === SettlementCommands.arrive || a.id === "world-space.enter");
  targets.push({ key: `exit:${map.sceneId}`, type: "exit", id: "exit", name: map.kind === "interior" ? "出门" : "村里的路",
    look: "gate", note: exits.length ? `能去 ${exits.length} 个地方` : "", x: map.gate.x, y: map.gate.y, actions: exits });
  for (const row of (view.yields ?? []) as Record<string, any>[]) {
    const id = String(row.resourceId);
    const actions = claim((a, p) => p.resourceId === id
      || (id === "resource:reed" && REED_WORK.has(a.id)) || (id === "resource:fiber" && FIBER_WORK.has(a.id)));
    if (!actions.length && !(row.stock > 0)) continue;
    const at = slotFor(map.yieldSlots, `yield:${id}`, map.work);
    targets.push({ key: `yield:${id}`, type: "yield", id, name: row.label ?? id, look: id,
      note: row.stock !== undefined ? `还有 ${row.stock}` : "", x: at.x, y: at.y, actions });
  }
  targets.push({ key: `work:${map.sceneId}`, type: "work", id: map.spaceId || map.placeId, name: workName[map.theme] ?? "这里",
    look: map.theme, note: map.spaceName || map.placeName, x: map.work.x, y: map.work.y,
    actions: claim(() => true).sort((a, b) => Number(b.enabled !== false) - Number(a.enabled !== false)) });
  for (const t of targets) t.actions.sort((a, b) => Number(b.enabled !== false) - Number(a.enabled !== false));
  return { ...base, targets, playerLook: lookOf(sim, { id: actorId }), dayPhase: currentPhase(sim.worldView()) };
}

/** Adds `map` to a settlement view (null stays null). */
export function withMap(sim: Simulation, actorId: string, view: Record<string, any> | null): Record<string, any> | null {
  if (!view) return view;
  try {
    return { ...view, map: settlementMap(sim, actorId, view) };
  } catch {
    return view;
  }
}

export const MAP_ACTIONS = new Set(["map.walk", "map.interact"]);

const same = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  }
  return value;
}

/**
 * Runs one map verb. `view` reads the current settlement view (with its map)
 * and `run` is the server's ordinary action runner for the original action.
 */
export function runMapAction(
  sim: Simulation, actorId: string, action: string, payload: Record<string, any>,
  view: () => Record<string, any> | null,
  run: (action: string, payload: Record<string, unknown>) => { ok: boolean; errors: unknown[] } & Record<string, unknown>,
) {
  const map = view()?.map as SettlementMap | null | undefined;
  if (!map) return rejected("你现在不在一处可以走动的地方。");
  if (payload.expectedPosition !== undefined && payload.expectedPosition !== map.player.revision) {
    return rejected("位置已经变了，请重新选一次。");
  }
  if (action === "map.walk") {
    if (payload.sceneId !== map.sceneId) return rejected("你已经不在那张图上了。");
    let dest: Cell, route: Cell[] | null;
    if (payload.targetKey !== undefined) {
      const target = map.targets.find((t) => t.key === payload.targetKey);
      if (!target) return rejected("那个人或东西已经不在这儿了。");
      const near = approachCell(map, map.player, target);
      if (!near) return rejected(`走不到${target.name}跟前。`);
      dest = near.cell; route = near.path;
    } else {
      dest = { x: Number(payload.x), y: Number(payload.y) };
      route = Number.isInteger(dest.x) && Number.isInteger(dest.y) ? findPath(map, map.player, dest) : null;
      if (!route) return rejected("那里走不过去。");
    }
    if (!route.length) return { ok: true, errors: [], events: [], route: [] as Cell[] };
    const moved = sim.dispatch({ type: LocalGrid.move, actorId, source: "player",
      payload: { sceneId: map.sceneId, x: dest.x, y: dest.y, expectedPosition: map.player.revision } });
    return { ...moved, route: moved.ok ? route : [] };
  }
  const target = map.targets.find((t) => t.key === payload.targetKey);
  if (!target) return rejected("那个人或东西已经不在这儿了。");
  const choice = target.actions.find((a) => a.id === payload.action && same(a.payload ?? {}, payload.payload ?? {}));
  if (!choice) return rejected(`对${target.name}做不了这件事。`);
  if (reachDistance(map.player, target) > 1) return rejected(`先走到${target.name}跟前。`);
  return run(choice.id, (choice.payload ?? {}) as Record<string, unknown>);
}

/**
 * After the player's action: if their day has moved into a new phase
 * (morning → working hours → evening), let the village follow. Moves only
 * where residents stand; see settlement-locations/day-phase.ts.
 */
export function advanceDayPhase(sim: Simulation, actorId: string, used: number | undefined, capacity: number | undefined): void {
  // OPENLIFE_DAY_PHASES=0 keeps residents where the day began (for checks of other mechanics that need an empty village).
  if (used === undefined || capacity === undefined || process.env.OPENLIFE_DAY_PHASES === "0") return;
  const want = phaseOf(used, capacity);
  if (want > currentPhase(sim.worldView())) sim.dispatch({ type: DayPhase.command, source: "system", payload: { phase: want } });
}
