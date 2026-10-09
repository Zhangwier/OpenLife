/**
 * World Space - the four-layer spatial model (SPACE-001).
 *
 *   Region -> Location -> Place (building / work site) -> Space (room or spot)
 *
 * The geography module owns layers one and two (regions, locations) and answers
 * "where on the map". This module owns layers three and four and answers the
 * questions a body actually asks:
 *
 *   - may I enter this place, and what does it cost?
 *   - what can I see from where I stand?
 *   - who else is here right now?
 *
 * Design rules taken from SPACE-001:
 *   - every layer has a stable id; no continuous coordinates in v0.1;
 *   - a person or movable object has exactly one effective container;
 *   - a container may never contain itself or its own descendant;
 *   - indoor contents are only listed when the observer can reach or see them.
 */

import type { Effect, OpenLifeModule, WorldView } from "@openlife/contracts";

const OWNER = "world-space";

export const SpaceKinds = {
  place: "world-space.place",
  space: "world-space.space",
} as const;

export const SpaceComponents = {
  place: "world-space.place",
  space: "world-space.space",
  occupancy: "world-space.occupancy",
  access: "world-space.access",
} as const;

export const SpaceRelations = {
  inside: "world-space.inside",
  containsObject: "world-space.contains_object",
  reachableFrom: "world-space.reachable_from",
  hasEntrance: "world-space.has_entrance",
  /**
   * Occupancy: "this actor is currently in this place".
   *
   * Modelled as a relation rather than a component so that both the actor's
   * place and (optionally) their space travel with the save, and so the store's
   * uniqueness index makes "one effective position per person" structural
   * rather than a rule someone has to remember (SPACE-001).
   */
  occupancy: "world-space.occupies",
  /**
   * "This actor is standing in this space" - the finer half of a position.
   *
   * Separate from `occupancy` because occupancy is keyed by the place an actor
   * is in, and moving between two spaces of one place must not create a second
   * occupancy relation.
   */
  standingIn: "world-space.standing_in",
} as const;

export const SpaceCommands = {
  createPlace: "world-space.create_place",
  createSpace: "world-space.create_space",
  enter: "world-space.enter",
  moveWithin: "world-space.move_within",
  leave: "world-space.leave",
} as const;

export const SpaceProjections = {
  scene: "world-space.scene",
  placeDirectory: "world-space.place-directory",
} as const;

/** Why a movement attempt failed. Callers switch on these, not on copy. */
export const SpaceRejection = {
  NoSuchPlace: "E_SPACE_NO_PLACE",
  NoSuchSpace: "E_SPACE_NO_SPACE",
  NotAdjacent: "E_SPACE_NOT_ADJACENT",
  Occupied: "E_SPACE_OCCUPIED",
  MissingKey: "E_SPACE_MISSING_KEY",
  Busy: "E_SPACE_BUSY",
  NotInside: "E_SPACE_NOT_INSIDE",
  NestedCycle: "E_SPACE_NESTED_CYCLE",
  BadActor: "E_SPACE_BAD_ACTOR",
} as const;

/**
 * A place's simulated footprint cost.
 *
 * `costDays` is expressed in **days**, matching the day-scale clock
 * (TIME-RFC-001). A world without that clock reads cost as raw ticks, which is
 * the right degradation: one step, one tick.
 */
export interface PlaceState {
  name: string;
  placeType: string;
  /** Concrete geography Location this place stands on, from world-geography. */
  locationId: string;
  /** Day cost to walk in from a neighbour. */
  costDays: number;
  /** When true the place may only be entered by its listed keepers. */
  private: boolean;
  createdAt: number;
}

export interface SpaceState {
  name: string;
  spaceType: string;
  /** Physical capacity in occupants. 0 means "unbounded outdoors". */
  capacity: number;
  /** Whether contents here are visible from the parent place without entering. */
  visibleFromOutside: boolean;
  createdAt: number;
}

export const worldSpaceModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "World Space",
    description: "Places and spaces inside a geography location, with explicit entrances, capacity and occupancy.",
    requires: ["time.calendar"],
    optional: ["world.geography"],
    provides: ["world.space"],
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
    for (const id of Object.values(SpaceComponents)) {
      ctx.registerComponent({ id, persist: true, description: `world-space component ${id}` });
    }
    for (const [id, allowed] of [
      [SpaceRelations.inside, { allowedFrom: [SpaceKinds.space], allowedTo: [SpaceKinds.place] }],
      [SpaceRelations.containsObject, {}],
      [SpaceRelations.reachableFrom, {}],
      [SpaceRelations.hasEntrance, {}],
      [SpaceRelations.occupancy, { allowedTo: [SpaceKinds.place] }],
      [SpaceRelations.standingIn, { allowedTo: [SpaceKinds.space] }],
    ] as const) {
      ctx.registerRelation({ id, persist: true, ...allowed, description: `world-space relation ${id}` });
    }

    registerCreatePlace(ctx);
    registerCreateSpace(ctx);
    registerEnter(ctx);
    registerMoveWithin(ctx);
    registerLeave(ctx);

    ctx.registerProjection({
      id: SpaceProjections.scene,
      description: "Everything one observer can perceive from where they stand, with the actions each thing allows.",
      build: ({ world, params }) => scene(world, String(params.observerId ?? "")),
    });

    ctx.registerProjection({
      id: SpaceProjections.placeDirectory,
      description: "Every place and space in the world, grouped by the location they sit on.",
      build: ({ world }) => directory(world),
    });
  },
};

type Registration = Parameters<OpenLifeModule["register"]>[0];

// ---------------------------------------------------------------------------
// Creating places and spaces
// ---------------------------------------------------------------------------

function registerCreatePlace(ctx: Registration): void {
  ctx.registerCommand({
    type: SpaceCommands.createPlace,
    params: { name: "string", placeType: "string", locationId: "entity" },
    description: "Create a standing place (building, yard, work site) on a geography location.",
  });

  ctx.registerConstraintRule({
    id: `${SpaceCommands.createPlace}.allowed`,
    commandType: SpaceCommands.createPlace,
    evaluate: (c) => {
      const name = text(c.command.payload.name);
      if (!name) return refuse(SpaceRejection.NoSuchPlace, "地方需要一个名字。");
      const locationId = text(c.command.payload.locationId);
      const explicit = text(c.command.payload.placeId);
      if (explicit && c.world.hasEntity(explicit)) {
        return refuse(SpaceRejection.NoSuchPlace, `地方编号已被占用：${explicit}`);
      }
      // Geography is optional (`world.geography` is a soft requirement). A pack
      // with no map may still build a settlement; a pack that does have map
      // Locations must place every building on a real one.
      const knownLocations = c.world.listEntities({ kind: "world-geography.location" });
      if (knownLocations.length === 0) {
        if (locationId) {
          return refuse(
            SpaceRejection.NoSuchPlace,
            `这个世界还没有地理地点，不能把地方挂到 ${locationId}。`,
          );
        }
        return { ok: true };
      }
      if (!locationId) {
        return refuse(SpaceRejection.NoSuchPlace, "地方必须建在一个已存在的地理地点上。");
      }
      if (!knownLocations.some((location) => location.id === locationId)) {
        return refuse(SpaceRejection.NoSuchPlace, `找不到地理地点 ${locationId}。`);
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: `${SpaceCommands.createPlace}.resolve`,
    commandType: SpaceCommands.createPlace,
    resolve: (c) => {
      const explicit = text(c.command.payload.placeId);
      const state: PlaceState = {
        name: text(c.command.payload.name),
        placeType: text(c.command.payload.placeType) || "yard",
        locationId: text(c.command.payload.locationId),
        costDays: clampInt(c.command.payload.costDays, 0, 1),
        private: c.command.payload.private === true,
        createdAt: c.world.tick,
      };
      return [{
        kind: "spawnEntity",
        localId: "place",
        ...(explicit ? { id: explicit } : {}),
        entityKind: SpaceKinds.place,
        components: { [SpaceComponents.place]: state as unknown as Record<string, never> },
        announce: false,
      }];
    },
  });
}

function registerCreateSpace(ctx: Registration): void {
  ctx.registerCommand({
    type: SpaceCommands.createSpace,
    params: { name: "string", placeId: "entity" },
    description: "Create a space (room or working spot) inside an existing place.",
  });

  ctx.registerConstraintRule({
    id: `${SpaceCommands.createSpace}.allowed`,
    commandType: SpaceCommands.createSpace,
    evaluate: (c) => {
      const placeId = text(c.command.payload.placeId);
      const place = placeId ? c.world.getEntity(placeId) : undefined;
      if (!place || place.kind !== SpaceKinds.place || place.archivedAt !== undefined) {
        return refuse(SpaceRejection.NoSuchPlace, "房间要建在一个已存在的地方里。");
      }
      const spaceId = text(c.command.payload.spaceId);
      if (spaceId && c.world.hasEntity(spaceId)) {
        return refuse(SpaceRejection.NoSuchSpace, `房间编号已被占用：${spaceId}`);
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: `${SpaceCommands.createSpace}.resolve`,
    commandType: SpaceCommands.createSpace,
    resolve: (c) => {
      const explicit = text(c.command.payload.spaceId);
      const placeId = text(c.command.payload.placeId);
      const state: SpaceState = {
        name: text(c.command.payload.name),
        spaceType: text(c.command.payload.spaceType) || "room",
        capacity: clampInt(c.command.payload.capacity, 0, 0),
        visibleFromOutside: c.command.payload.visibleFromOutside === true,
        createdAt: c.world.tick,
      };
      return [{
        kind: "spawnEntity",
        localId: "space",
        ...(explicit ? { id: explicit } : {}),
        entityKind: SpaceKinds.space,
        components: { [SpaceComponents.space]: state as unknown as Record<string, never> },
        announce: false,
      }, {
        kind: "addRelation",
        type: SpaceRelations.inside,
        from: "@space",
        to: placeId,
        announce: false,
      }];
    },
  });
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

function registerEnter(ctx: Registration): void {
  ctx.registerCommand({
    type: SpaceCommands.enter,
    params: { placeId: "entity", days: "number" },
    description: "Walk into a place from wherever the actor currently is.",
  });

  ctx.registerConstraintRule({
    id: `${SpaceCommands.enter}.allowed`,
    commandType: SpaceCommands.enter,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      if (!actorId || !c.world.hasEntity(actorId)) {
        return refuse(SpaceRejection.BadActor, "只有真正在场的人才能移动。");
      }
      const placeId = text(c.command.payload.placeId ?? c.command.targetId);
      const place = placeId ? c.world.getEntity(placeId) : undefined;
      if (!place || place.kind !== SpaceKinds.place || place.archivedAt !== undefined) {
        return refuse(SpaceRejection.NoSuchPlace, "这个地方现在到不了。");
      }
      const current = occupiedPlaceId(c.world, actorId);
      if (current === placeId) {
        return refuse(SpaceRejection.NotAdjacent, "你已经在这里了。");
      }
      // A place whose capacity is entirely consumed by this actor is still
      // enterable: capacity counts other bodies, not the one walking in.
      const capacity = placeCapacity(c.world, placeId);
      const present = occupantsOf(c.world, placeId).filter((id) => id !== actorId).length;
      if (capacity > 0 && present >= capacity) {
        return refuse(SpaceRejection.Occupied, "这里已经满了，得等里面的人先出来。");
      }
      const blocked = blockingReason(c.world, actorId);
      if (blocked) return refuse(SpaceRejection.Busy, blocked);
      if (!canEnter(c.world, actorId, placeId)) {
        return refuse(SpaceRejection.MissingKey, "这里不是随便能进的地方，需要先得到同意。");
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: `${SpaceCommands.enter}.resolve`,
    commandType: SpaceCommands.enter,
    resolve: (c) => moveEffects(
      c.world,
      c.command.actorId as string,
      text(c.command.payload.placeId ?? c.command.targetId),
      "",
      c.world.tick,
    ),
  });
}

function registerMoveWithin(ctx: Registration): void {
  ctx.registerCommand({
    type: SpaceCommands.moveWithin,
    params: { spaceId: "entity" },
    description: "Move inside the current place, to one of its spaces.",
  });

  ctx.registerConstraintRule({
    id: `${SpaceCommands.moveWithin}.allowed`,
    commandType: SpaceCommands.moveWithin,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      const spaceId = text(c.command.payload.spaceId ?? c.command.targetId);
      const space = spaceId ? c.world.getEntity(spaceId) : undefined;
      if (!actorId || !c.world.hasEntity(actorId)) {
        return refuse(SpaceRejection.BadActor, "只有真正在场的人才能移动。");
      }
      if (!space || space.kind !== SpaceKinds.space || space.archivedAt !== undefined) {
        return refuse(SpaceRejection.NoSuchSpace, "这里没有这样一个地方。");
      }
      const placeId = c.world
        .listRelations({ type: SpaceRelations.inside, from: spaceId })
        .map((relation) => relation.to)[0];
      if (!placeId) return refuse(SpaceRejection.NoSuchPlace, "这个空间没有归属的地方。");
      if (occupiedPlaceId(c.world, actorId) !== placeId) {
        return refuse(SpaceRejection.NotInside, "得先进入它所在的地方。");
      }
      const state = readSpace(space.components[SpaceComponents.space]);
      if (state.capacity > 0) {
        const inside = occupantsOfSpace(c.world, spaceId).filter((id) => id !== actorId);
        if (inside.length >= state.capacity) {
          return refuse(SpaceRejection.Occupied, `${state.name}里已经有人了。`);
        }
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: `${SpaceCommands.moveWithin}.resolve`,
    commandType: SpaceCommands.moveWithin,
    resolve: (c) => {
      const actorId = c.command.actorId as string;
      const spaceId = text(c.command.payload.spaceId ?? c.command.targetId);
      const placeId = c.world
        .listRelations({ type: SpaceRelations.inside, from: spaceId })
        .map((relation) => relation.to)[0]!;
      return moveEffects(c.world, actorId, placeId, spaceId, c.world.tick);
    },
  });
}
function registerLeave(ctx: Registration): void {
  ctx.registerCommand({
    type: SpaceCommands.leave,
    description: "Step back out to the location this place stands on.",
  });

  ctx.registerConstraintRule({
    id: `${SpaceCommands.leave}.allowed`,
    commandType: SpaceCommands.leave,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      if (!occupiedPlaceId(c.world, actorId)) {
        return refuse(SpaceRejection.NotInside, "你现在不在任何地方里。");
      }
      const blocked = blockingReason(c.world, actorId);
      if (blocked) return refuse(SpaceRejection.Busy, blocked);
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: `${SpaceCommands.leave}.resolve`,
    commandType: SpaceCommands.leave,
    resolve: (c) => {
      const actorId = c.command.actorId as string;
      const effects: Effect[] = [];
      const current = occupancyRelations(c.world, actorId);
      for (const relation of current) {
        effects.push({
          kind: "removeRelation",
          type: SpaceRelations.occupancy,
          from: actorId,
          to: relation.to,
          reason: "walked out of the place",
          announce: false,
        });
      }
      for (const relation of c.world.listRelations({ type: SpaceRelations.standingIn, from: actorId })) {
        effects.push({
          kind: "removeRelation",
          type: SpaceRelations.standingIn,
          from: actorId,
          to: relation.to,
          reason: "walked out of the place",
          announce: false,
        });
      }
      effects.push({
        kind: "emitEvent",
        eventType: "world-space.left",
        actorId,
        data: { from: current.map((relation) => relation.to).join(",") },
        historicalSignificance: 0,
      });
      return effects;
    },
  });
}

// ---------------------------------------------------------------------------
// Scene projection
// ---------------------------------------------------------------------------

export interface SceneView {
  exists: boolean;
  observerId: string;
  /** Place the observer currently stands in, empty when outdoors. */
  placeId: string;
  placeName: string;
  spaceId: string;
  spaceName: string;
  locationId: string;
  /** Other people the observer can actually perceive right now. */
  people: { id: string; name: string; spaceId: string; here: boolean }[];
  /** Objects the observer can see from here, with the action each allows. */
  objects: { id: string; name: string; kind: string; spaceId: string; visible: boolean; reachable: boolean }[];
  /** Neighbouring places the observer could walk to. */
  exits: { id: string; name: string; costDays: number; blockedReason: string }[];
  spaces: { id: string; name: string; spaceType: string; occupants: number; capacity: number }[];
  summary: string;
}

export function scene(world: WorldView, observerId: string): SceneView {
  const placeId = occupiedPlaceId(world, observerId);
  const spaceId = occupiedSpaceId(world, observerId);
  const placeState = placeId ? readPlace(world.getComponent(placeId, SpaceComponents.place)) : undefined;
  const spaceState = spaceId ? readSpace(world.getComponent(spaceId, SpaceComponents.space)) : undefined;
  const locationId = placeState?.locationId ?? "";

  const people = world
    .listEntities({ kind: "modern.character" })
    .filter((entity) => entity.id !== observerId && entity.archivedAt === undefined)
    .map((entity) => {
      const otherPlace = occupiedPlaceId(world, entity.id);
      const otherSpace = occupiedSpaceId(world, entity.id);
      return {
        id: entity.id,
        name: nameOf(world, entity.id),
        spaceId: otherSpace,
        here: Boolean(placeId) && otherPlace === placeId,
      };
    })
    .filter((person) => person.here);

  const objects: SceneView["objects"] = [];
  if (placeId) {
    for (const holder of [placeId, spaceId].filter(Boolean)) {
      for (const relation of world.listRelations({ type: SpaceRelations.containsObject, from: holder })) {
        const entity = world.getEntity(relation.to);
        if (!entity || entity.archivedAt !== undefined) continue;
        const container = readObjectContainer(entity.components);
        objects.push({
          id: entity.id,
          name: container.name || nameOf(world, entity.id),
          kind: entity.kind,
          spaceId: holder === spaceId ? spaceId : "",
          // An object inside a space is only listed from that space; an object
          // standing in the place itself is visible from anywhere in the place.
          visible: holder === placeId || container.visibleFromOutside,
          reachable: holder === placeId || holder === spaceId,
        });
      }
    }
    // Objects owned here but not carried anywhere stand in the place itself,
    // which is the common case for a jar by the door.
    for (const entity of world.listEntities({ kind: "world-objects.item" })) {
      if (entity.archivedAt !== undefined) continue;
      if (objects.some((object) => object.id === entity.id)) continue;
      const containedIn = world
        .listRelations({ type: "world-objects.contained_in", from: entity.id })
        .map((relation) => relation.to)[0];
      if (!containedIn) continue;
      // The object stands directly in this place (contained by the place, not
      // by a person or another object).
      if (containedIn !== placeId && containedIn !== spaceId) continue;
      if (world.getEntity(containedIn)?.kind !== "world-space.place" && containedIn !== spaceId) continue;
      const container = readObjectContainer(entity.components);
      objects.push({
        id: entity.id,
        name: container.name || nameOf(world, entity.id),
        kind: entity.kind,
        spaceId: containedIn === spaceId ? spaceId : "",
        visible: containedIn === placeId || container.visibleFromOutside,
        reachable: true,
      });
    }
  }

  const exits = world
    .listEntities({ kind: SpaceKinds.place })
    .filter((entity) => entity.id !== placeId && entity.archivedAt === undefined)
    .map((entity) => {
      const state = readPlace(entity.components[SpaceComponents.place]);
      return {
        id: entity.id,
        name: state.name,
        costDays: state.costDays,
        blockedReason: placementReason(world, entity.id, placeId),
      };
    })
    // Only places sharing the observer's location, plus anywhere when the world
    // has no geography at all (a pure fixture), are offered as walkable.
    .filter((exit) => !locationId || sameLocation(world, exit.id, locationId))
    .sort((a, b) => a.id.localeCompare(b.id));

  const spaces = placeId
    ? world
        .listRelations({ type: SpaceRelations.inside, to: placeId })
        .map((relation) => world.getEntity(relation.from))
        .filter((entity): entity is NonNullable<typeof entity> => Boolean(entity && entity.archivedAt === undefined))
        .map((entity) => {
          const state = readSpace(entity.components[SpaceComponents.space]);
          return {
            id: entity.id,
            name: state.name,
            spaceType: state.spaceType,
            occupants: occupantsOfSpace(world, entity.id).length,
            capacity: state.capacity,
          };
        })
        .sort((a, b) => a.id.localeCompare(b.id))
    : [];

  return {
    exists: Boolean(placeId),
    observerId,
    placeId,
    placeName: placeState?.name ?? "",
    spaceId,
    spaceName: spaceState?.name ?? "",
    locationId,
    people,
    objects,
    exits,
    spaces,
    summary: placeId
      ? `${placeState?.name ?? "这里"}${spaceState ? ` · ${spaceState.name}` : ""}`
      : "站在开阔处",
  };
}

export interface DirectoryEntry {
  placeId: string;
  name: string;
  placeType: string;
  locationId: string;
  occupants: number;
  costDays: number;
  spaces: { id: string; name: string; spaceType: string; capacity: number }[];
}

export function directory(world: WorldView): { places: DirectoryEntry[]; spaceCount: number } {
  const places = world
    .listEntities({ kind: SpaceKinds.place })
    .filter((entity) => entity.archivedAt === undefined)
    .map((entity) => {
      const state = readPlace(entity.components[SpaceComponents.place]);
      return {
        placeId: entity.id,
        name: state.name,
        placeType: state.placeType,
        locationId: state.locationId,
        occupants: occupantsOf(world, entity.id).length,
        costDays: state.costDays,
        spaces: world
          .listRelations({ type: SpaceRelations.inside, to: entity.id })
          .map((relation) => world.getEntity(relation.from))
          .filter((space): space is NonNullable<typeof space> => Boolean(space && space.archivedAt === undefined))
          .map((space) => {
            const inner = readSpace(space.components[SpaceComponents.space]);
            return { id: space.id, name: inner.name, spaceType: inner.spaceType, capacity: inner.capacity };
          })
          .sort((a, b) => a.id.localeCompare(b.id)),
      };
    })
    .sort((a, b) => a.placeId.localeCompare(b.placeId));
  return { places, spaceCount: places.reduce((sum, place) => sum + place.spaces.length, 0) };
}

// ---------------------------------------------------------------------------
// Shared helpers (exported: the settlement pack and tests read the same truth)
// ---------------------------------------------------------------------------

function occupancyRelations(world: WorldView, actorId: string, direction: "from" | "to" = "from") {
  return world.listRelations(direction === "from"
    ? { type: SpaceRelations.occupancy, from: actorId }
    : { type: SpaceRelations.occupancy, to: actorId });
}

export function occupiedPlaceId(world: WorldView, actorId: string): string {
  return occupancyRelations(world, actorId).map((relation) => relation.to)[0] ?? "";
}

export function occupiedSpaceId(world: WorldView, actorId: string): string {
  return world.listRelations({ type: SpaceRelations.standingIn, from: actorId })[0]?.to ?? "";
}

export function occupantsOf(world: WorldView, placeId: string): string[] {
  return occupancyRelations(world, placeId, "to").map((relation) => relation.from);
}

export function occupantsOfSpace(world: WorldView, spaceId: string): string[] {
  return world.listRelations({ type: SpaceRelations.standingIn, to: spaceId }).map((relation) => relation.from);
}

export function placeCapacity(world: WorldView, placeId: string): number {
  return world
    .listRelations({ type: SpaceRelations.inside, to: placeId })
    .map((relation) => readSpace(world.getComponent(relation.from, SpaceComponents.space)).capacity)
    .reduce((sum, capacity) => sum + capacity, 0);
}

/**
 * The ordered effect batch one move produces: clear the old spot, claim the new.
 *
 * Re-entering the same place is a legitimate reposition (it only changes which
 * space the actor stands in), so it patches the existing relation instead of
 * adding a duplicate the store would reject.
 */
export function moveEffects(
  world: WorldView,
  actorId: string,
  placeId: string,
  spaceId = "",
  atTick = world.tick,
): Effect[] {
  const effects: Effect[] = [];
  const existing = occupancyRelations(world, actorId);
  for (const relation of existing) {
    if (relation.to === placeId) continue;
    effects.push({
      kind: "removeRelation",
      type: SpaceRelations.occupancy,
      from: actorId,
      to: relation.to,
      reason: "actor moved to another place",
      announce: false,
    });
  }

  const alreadyHere = existing.find((relation) => relation.to === placeId);
  if (alreadyHere) {
    // Same place, different spot. Occupancy is keyed by (type, from, place), so
    // the space cannot be patched through that relation; the space the actor
    // stands in is therefore carried by a dedicated "in space" relation.
    const currentSpace = String(alreadyHere.components[SpaceComponents.occupancy]?.spaceId ?? "");
    if (currentSpace === spaceId) return effects;
    for (const relation of world.listRelations({ type: SpaceRelations.standingIn, from: actorId })) {
      if (relation.to === spaceId) continue;
      effects.push({
        kind: "removeRelation",
        type: SpaceRelations.standingIn,
        from: actorId,
        to: relation.to,
        reason: "actor moved within the place",
        announce: false,
      });
    }
    if (spaceId) {
      effects.push({
        kind: "addRelation",
        type: SpaceRelations.standingIn,
        from: actorId,
        to: spaceId,
        components: {},
        announce: false,
      });
    }
    effects.push({
      kind: "emitEvent",
      eventType: "world-space.repositioned",
      actorId,
      targetId: placeId,
      data: { placeId, from: currentSpace, to: spaceId },
      historicalSignificance: 0,
    });
    return effects;
  }

  effects.push({
    kind: "addRelation",
    type: SpaceRelations.occupancy,
    from: actorId,
    to: placeId,
    components: { [SpaceComponents.occupancy]: { placeId, spaceId, since: atTick } },
    announce: false,
  });
  for (const relation of world.listRelations({ type: SpaceRelations.standingIn, from: actorId })) {
    if (relation.to === spaceId) continue;
    effects.push({
      kind: "removeRelation",
      type: SpaceRelations.standingIn,
      from: actorId,
      to: relation.to,
      reason: "actor moved to another place",
      announce: false,
    });
  }
  if (spaceId) {
    effects.push({
      kind: "addRelation",
      type: SpaceRelations.standingIn,
      from: actorId,
      to: spaceId,
      components: {},
      announce: false,
    });
  }
  effects.push({
    kind: "emitEvent",
    eventType: "world-space.moved",
    actorId,
    targetId: placeId,
    data: { placeId, spaceId },
    historicalSignificance: 0,
  });
  return effects;
}

function blockingReason(world: WorldView, actorId: string): string {
  for (const entity of world.listEntities({ kind: "practice-runtime.practice" })) {
    const state = entity.components[PracticeComponents.practice];
    if (state?.status !== "active") continue;
    const participates = world
      .listRelations({ type: "practice-runtime.participates_in", from: actorId, to: entity.id })
      .length > 0;
    if (participates) return "手里的事情还没做完，走不开。";
  }
  return "";
}
function canEnter(world: WorldView, actorId: string, placeId: string): boolean {
  const state = readPlace(world.getComponent(placeId, SpaceComponents.place));
  if (!state.private) return true;
  const keeper = world.listRelations({ type: SpaceRelations.hasEntrance, to: placeId }).map((relation) => relation.from);
  return keeper.includes(actorId);
}

function placementReason(world: WorldView, placeId: string, fromPlaceId: string): string {
  if (placeId === fromPlaceId) return "";
  const target = readPlace(world.getComponent(placeId, SpaceComponents.place));
  if (!target.locationId) return "";
  const canReach = world
    .listEntities({ kind: "world-geography.location" })
    .some((entity) => entity.id === target.locationId);
  return canReach ? "" : "这条路还没有接通。";
}

function sameLocation(world: WorldView, placeId: string, locationId: string): boolean {
  if (!locationId) return true;
  return readPlace(world.getComponent(placeId, SpaceComponents.place)).locationId === locationId;
}

export function readPlace(raw: Readonly<Record<string, unknown>> | undefined): PlaceState {
  return {
    name: typeof raw?.name === "string" ? raw.name : "",
    placeType: typeof raw?.placeType === "string" ? raw.placeType : "yard",
    locationId: typeof raw?.locationId === "string" ? raw.locationId : "",
    costDays: Math.max(0, Number(raw?.costDays ?? 1)),
    private: raw?.private === true,
    createdAt: Math.max(0, Number(raw?.createdAt ?? 0)),
  };
}

export function readSpace(raw: Readonly<Record<string, unknown>> | undefined): SpaceState {
  return {
    name: typeof raw?.name === "string" ? raw.name : "",
    spaceType: typeof raw?.spaceType === "string" ? raw.spaceType : "room",
    capacity: Math.max(0, Number(raw?.capacity ?? 0)),
    visibleFromOutside: raw?.visibleFromOutside === true,
    createdAt: Math.max(0, Number(raw?.createdAt ?? 0)),
  };
}

function readObjectContainer(raw: Readonly<Record<string, unknown>> | undefined): { name: string; visibleFromOutside: boolean } {
  const nested = raw?.["world-objects.object"] as Record<string, unknown> | undefined;
  return {
    name: typeof nested?.name === "string" ? nested.name : "",
    visibleFromOutside: nested?.visibleFromOutside === true,
  };
}

function nameOf(world: WorldView, entityId: string): string {
  const identity = world.getComponent(entityId, "modern.identity");
  const given = typeof identity?.givenName === "string" ? identity.givenName : "";
  const nested = world.getComponent(entityId, "world-objects.object");
  const label = typeof nested?.name === "string" ? nested.name : "";
  return given || label || entityId;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clampInt(value: unknown, min: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.round(number));
}

function refuse(code: string, message: string) {
  return { ok: false as const, code, message };
}
