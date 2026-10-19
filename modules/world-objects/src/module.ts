/**
 * World Objects - the generic object and container model (OBJ-001).
 *
 * One item vocabulary serves every domain. A pot, a rope and a water jar are
 * not three special cases; they are three capability bundles over one shape:
 *
 *   prototype (what kind of thing is this)
 *     -> instance (this particular one, with its own state)
 *       -> capability (what it can be used for)
 *         -> action (registered once, available to everything with that capability)
 *
 * Ownership, custody and permission are three separate facts. Borrowing a jar
 * never transfers ownership, and a tool in someone else's hands is unavailable
 * without negotiation - not silently duplicated.
 *
 * This module owns no domain physics. Clay state, pottery quality and firing
 * risk stay in `craft-pottery`; this module owns "which object is where, who
 * can touch it, and what state it is in".
 */

import type { Effect, JsonValue, OpenLifeModule, WorldView } from "@openlife/contracts";
import { SpaceComponents, SpaceRelations } from "@openlife/module-world-space";

const OWNER = "world-objects";

export const ObjectKinds = {
  item: "world-objects.item",
  prototype: "world-objects.prototype",
  fixture: "world-objects.fixture",
} as const;

export const ObjectComponents = {
  object: "world-objects.object",
  inventory: "world-objects.inventory",
  prototype: "world-objects.prototype",
  content: "world-objects.content",
  wear: "world-objects.wear",
  loan: "world-objects.loan",
} as const;

export const ObjectRelations = {
  instanceOf: "world-objects.instance_of",
  ownedBy: "world-objects.owned_by",
  heldBy: "world-objects.held_by",
  permittedTo: "world-objects.permitted_to",
  containedIn: "world-objects.contained_in",
  wornBy: "world-objects.worn_by",
} as const;

export const ObjectCommands = {
  registerPrototype: "world-objects.register_prototype",
  spawn: "world-objects.spawn",
  take: "world-objects.take",
  put: "world-objects.put",
  place: "world-objects.place",
  store: "world-objects.store",
  retrieve: "world-objects.retrieve",
  wear: "world-objects.wear",
  unwear: "world-objects.unwear",
  lend: "world-objects.lend",
  returnItem: "world-objects.return",
} as const;

export const ObjectProjections = {
  stock: "world-objects.stock",
  nearby: "world-objects.nearby",
  detail: "world-objects.detail",
} as const;

/** Machine-readable rejection codes; the UI maps these to concrete next steps. */
export const ObjectRejection = {
  UnknownPrototype: "E_OBJECT_UNKNOWN_PROTOTYPE",
  UnknownInstance: "E_OBJECT_UNKNOWN_INSTANCE",
  NotCarryable: "E_OBJECT_NOT_CARRYABLE",
  NotAContainer: "E_OBJECT_NOT_CONTAINER",
  Full: "E_OBJECT_CONTAINER_FULL",
  Overloaded: "E_OBJECT_OVERLOADED",
  NestedCycle: "E_OBJECT_NESTED_CYCLE",
  NotYours: "E_OBJECT_NOT_YOURS",
  InUse: "E_OBJECT_IN_USE",
  WrongPlace: "E_OBJECT_WRONG_PLACE",
  NoSuchPrototype: "E_OBJECT_PROTOTYPE_EXISTS",
  BadAmount: "E_OBJECT_BAD_AMOUNT",
  NotHeld: "E_OBJECT_NOT_HELD",
  AlreadyReturned: "E_OBJECT_ALREADY_RETURNED",
} as const;

/**
 * Capabilities a prototype can declare. Actions are registered against these,
 * never against a specific object type, so a new vessel does not need a new
 * button (OBJ-001).
 */
export type ObjectCapability =
  | "carryable"
  | "container"
  | "edible"
  | "burnable"
  | "wearable"
  | "workable"
  | "tool"
  | "fixture"
  | "liquid-holder"
  | "storage";

export interface PrototypeState {
  name: string;
  material: string;
  /** Namespaced resource id this item counts as when stored in bulk. */
  resourceId: string;
  /** Unit label for player-facing counts, e.g. `件`, `捆`. */
  unit: string;
  /**
   * Mass in a world-defined unit. Only meaningful for things a body must lift;
   * a jar and a bundle of fuel are the same shape otherwise.
   */
  mass: number;
  /** Litres of capacity when the prototype is a container. 0 for everything else. */
  capacity: number;
  capabilities: ObjectCapability[];
  /** Typical durability; 0 means "does not wear out in this version". */
  durability: number;
  visibleFromOutside: boolean;
}

export interface ObjectInstanceState {
  prototypeId: string;
  name: string;
  /** Free-form condition the owning domain may write (fresh, soaked, cracked). */
  condition: string;
  /** Units of `prototype.resourceId` currently inside, for containers. */
  quantity: number;
  durability: number;
  /** Tick this instance first existed, for provenance. */
  madeAt: number;
  /** Domain-owned trace, e.g. the pottery production strategy. */
  provenance: Record<string, JsonValue>;
  visibleFromOutside: boolean;
  loanPolicy?: string; // "public-visitor": anyone visiting may take it (the jar lent at the well)
}

export const worldObjectsModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "World Objects",
    description: "Generic prototypes, instances, containers, ownership, custody and loans.",
    requires: ["world.space"],
    provides: ["world.objects"],
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
    for (const id of Object.values(ObjectComponents)) {
      ctx.registerComponent({ id, persist: true, description: `world-objects component ${id}` });
    }
    for (const [id, allowed] of [
      [ObjectRelations.instanceOf, { allowedFrom: [ObjectKinds.item], allowedTo: [ObjectKinds.prototype] }],
      [ObjectRelations.ownedBy, { allowedFrom: [ObjectKinds.item] }],
      [ObjectRelations.heldBy, { allowedFrom: [ObjectKinds.item] }],
      [ObjectRelations.permittedTo, { allowedFrom: [ObjectKinds.item] }],
      [ObjectRelations.containedIn, { allowedFrom: [ObjectKinds.item] }],
      [ObjectRelations.wornBy, { allowedFrom: [ObjectKinds.item] }],
    ] as const) {
      ctx.registerRelation({ id, persist: true, ...allowed, description: `world-objects relation ${id}` });
    }

    registerPrototypeCommand(ctx);
    registerSpawnCommand(ctx);
    registerTakeCommand(ctx);
    registerPlaceCommand(ctx);
    registerStoreCommand(ctx);
    registerRetrieveCommand(ctx);
    registerLendCommand(ctx);
    registerReturnCommand(ctx);
    registerWearCommands(ctx);

    ctx.registerProjection({
      id: ObjectProjections.stock,
      description: "Bulk resources one person is holding, summed by resource id.",
      build: ({ world, params }) => stock(world, String(params.holderId ?? "")),
    });

    ctx.registerProjection({
      id: ObjectProjections.nearby,
      description: "Every object reachable from where the observer currently stands, with the actions each allows.",
      build: ({ world, params }) => nearby(world, String(params.observerId ?? "")),
    });

    ctx.registerProjection({
      id: ObjectProjections.detail,
      description: "One object instance: prototype, condition, contents, owner, holder and permissions.",
      build: ({ world, params }) => detail(world, String(params.objectId ?? "")),
    });
  },
};

type Registration = Parameters<OpenLifeModule["register"]>[0];

// ---------------------------------------------------------------------------
// Prototypes
// ---------------------------------------------------------------------------

function registerPrototypeCommand(ctx: Registration): void {
  ctx.registerCommand({
    type: ObjectCommands.registerPrototype,
    params: { prototypeId: "string", name: "string", capabilities: "array" },
    description: "Declare a reusable kind of thing: what it is made of and what can be done with it.",
  });

  ctx.registerConstraintRule({
    id: `${ObjectCommands.registerPrototype}.allowed`,
    commandType: ObjectCommands.registerPrototype,
    evaluate: (c) => {
      const prototypeId = text(c.command.payload.prototypeId);
      if (!prototypeId) return refuse(ObjectRejection.NoSuchPrototype, "物件原型需要一个命名空间内的编号。");
      const existing = c.world.getEntity(prototypeId);
      if (existing && existing.kind === ObjectKinds.prototype) {
        return refuse(ObjectRejection.NoSuchPrototype, `这个原型已经登记过：${prototypeId}`);
      }
      if (!text(c.command.payload.name)) return refuse(ObjectRejection.UnknownPrototype, "原型需要一个名字。");
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: `${ObjectCommands.registerPrototype}.resolve`,
    commandType: ObjectCommands.registerPrototype,
    resolve: (c) => {
      const prototypeId = text(c.command.payload.prototypeId);
      const state: PrototypeState = {
        name: text(c.command.payload.name),
        material: text(c.command.payload.material) || "unspecified",
        resourceId: text(c.command.payload.resourceId) || prototypeId,
        unit: text(c.command.payload.unit) || "件",
        mass: Math.max(0, Number(c.command.payload.mass ?? 0.5)),
        capacity: Math.max(0, Number(c.command.payload.capacity ?? 0)),
        capabilities: capabilities(c.command.payload.capabilities),
        durability: Math.max(0, Number(c.command.payload.durability ?? 0)),
        visibleFromOutside: c.command.payload.visibleFromOutside === true,
      };
      return [{
        kind: "spawnEntity",
        localId: "prototype",
        id: prototypeId,
        entityKind: ObjectKinds.prototype,
        components: { [ObjectComponents.prototype]: state as unknown as Record<string, never> },
        announce: false,
      }];
    },
  });
}

// ---------------------------------------------------------------------------
// Spawning instances
// ---------------------------------------------------------------------------

function registerSpawnCommand(ctx: Registration): void {
  ctx.registerCommand({
    type: ObjectCommands.spawn,
    params: { prototypeId: "string", ownerId: "entity" },
    description: "Create one concrete object from a prototype, owned by someone or belonging to a place.",
  });

  ctx.registerConstraintRule({
    id: `${ObjectCommands.spawn}.allowed`,
    commandType: ObjectCommands.spawn,
    evaluate: (c) => {
      const prototypeId = text(c.command.payload.prototypeId);
      const prototype = prototypeId ? c.world.getEntity(prototypeId) : undefined;
      if (!prototype || prototype.kind !== ObjectKinds.prototype || prototype.archivedAt !== undefined) {
        return refuse(ObjectRejection.UnknownPrototype, `没有登记过这种物件：${prototypeId || "(空)"}`);
      }
      const ownerId = text(c.command.payload.ownerId);
      if (ownerId && !c.world.hasEntity(ownerId)) {
        return refuse(ObjectRejection.UnknownInstance, "找不到这件东西的所属者。");
      }
      const objectId = text(c.command.payload.objectId);
      if (objectId && c.world.hasEntity(objectId)) {
        return refuse(ObjectRejection.UnknownInstance, `这件东西的编号已被占用：${objectId}`);
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: `${ObjectCommands.spawn}.resolve`,
    commandType: ObjectCommands.spawn,
    resolve: (c) => {
      const prototypeId = text(c.command.payload.prototypeId);
      const prototype = readPrototype(c.world.getComponent(prototypeId, ObjectComponents.prototype));
      const explicit = text(c.command.payload.objectId);
      const ownerId = text(c.command.payload.ownerId);
      const containerId = text(c.command.payload.containerId);
      const placeId = text(c.command.payload.placeId);
      // `holderId` is deliberately explicit. An object with an owner but no
      // holder is *owned and put something*, which is the normal state for a
      // jar standing in a yard; inferring a holder from the owner would make
      // every household object simultaneously carried.
      const holderId = text(c.command.payload.holderId);
      const state: ObjectInstanceState = {
        prototypeId,
        name: text(c.command.payload.name) || prototype.name,
        condition: text(c.command.payload.condition) || "new",
        quantity: Math.max(0, Number(c.command.payload.quantity ?? (prototype.capacity > 0 ? 0 : 1))),
        durability: Math.max(0, Number(c.command.payload.durability ?? prototype.durability)),
        madeAt: c.world.tick,
        provenance: objectJson(c.command.payload.provenance),
        visibleFromOutside: prototype.visibleFromOutside,
      };
      const effects: Effect[] = [{
        kind: "spawnEntity",
        localId: "object",
        ...(explicit ? { id: explicit } : {}),
        entityKind: ObjectKinds.item,
        components: { [ObjectComponents.object]: state as unknown as Record<string, never> },
        announce: false,
      }, {
        kind: "addRelation",
        type: ObjectRelations.instanceOf,
        from: "@object",
        to: prototypeId,
        announce: false,
      }];
      if (ownerId) {
        effects.push({ kind: "addRelation", type: ObjectRelations.ownedBy, from: "@object", to: ownerId, announce: false });
      }
      if (holderId) {
        effects.push({ kind: "addRelation", type: ObjectRelations.heldBy, from: "@object", to: holderId, announce: false });
      }
      if (containerId) {
        effects.push({ kind: "addRelation", type: ObjectRelations.containedIn, from: "@object", to: containerId, announce: false });
      } else if (placeId) {
        effects.push({ kind: "addRelation", type: ObjectRelations.containedIn, from: "@object", to: placeId, announce: false });
      }
      effects.push({
        kind: "emitEvent",
        eventType: "world-objects.object_created",
        targetId: "@object",
        data: { prototypeId, ownerId, holderId, containerId, placeId },
        historicalSignificance: 0,
      });
      return effects;
    },
  });
}

/** Physical portable load shared by NPCs and players, not a parallel inventory.
 * "Hand slots" are the small collection a character can manage without
 * storing pieces in a bag. A carried bag uses one slot, contents use its own
 * real container limit, and their mass still counts on the wearer.
 */
export const CARRY_LIMITS = { looseSlots: 4, mass: 10 } as const;

function objectMass(world: WorldView, objectId: string, visited = new Set<string>()): number {
  if (visited.has(objectId)) return 0;
  visited.add(objectId);
  const p = prototypeOf(world, objectId);
  const instance = readObject(world.getComponent(objectId, ObjectComponents.object));
  const own = Math.max(0, p.mass) * Math.max(1, p.capacity > 0 ? 1 : instance.quantity);
  return own + contentsOf(world, objectId).reduce((sum, id) => sum + objectMass(world, id, visited), 0);
}

export function portableLoad(world: WorldView, actorId: string, excludeId = "") {
  const held = world.listRelations({ type: ObjectRelations.heldBy, to: actorId })
    .map((r) => r.from)
    .filter((id) => id !== excludeId && world.getEntity(id)?.archivedAt === undefined);
  return { looseSlots: held.length, mass: held.reduce((sum, id) => sum + objectMass(world, id), 0),
    maxSlots: CARRY_LIMITS.looseSlots, maxMass: CARRY_LIMITS.mass };
}

export function canCarryPrototype(world: WorldView, actorId: string, prototypeId: string,
  excludeId = "", amount = 1): boolean {
  const current = portableLoad(world, actorId, excludeId);
  const proto = readPrototype(world.getComponent(prototypeId, ObjectComponents.prototype));
  return Boolean(proto.name) && amount > 0 && Number.isInteger(amount) &&
    current.looseSlots + amount <= current.maxSlots &&
    current.mass + amount * Math.max(0, proto.mass) <= current.maxMass + 0.0001;
}

export function canCarryObject(world: WorldView, actorId: string, objectId: string,
  excludeId = "", fromOwnedContainer = false): boolean {
  const current = portableLoad(world, actorId, excludeId);
  const containedMass = fromOwnedContainer ? objectMass(world, objectId) : 0;
  return current.looseSlots + 1 <= current.maxSlots &&
    current.mass + objectMass(world, objectId) - containedMass <= current.maxMass + 0.0001;
}

// ---------------------------------------------------------------------------
// Take / put / place
// ---------------------------------------------------------------------------

function registerTakeCommand(ctx: Registration): void {
  ctx.registerCommand({
    type: ObjectCommands.take,
    params: { objectId: "entity" },
    description: "Pick up a reachable object, if it is carryable and nobody else is holding it.",
  });

  ctx.registerConstraintRule({
    id: `${ObjectCommands.take}.allowed`,
    commandType: ObjectCommands.take,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      if (!actorId || !c.world.hasEntity(actorId)) return refuse(ObjectRejection.UnknownInstance, "需要一位正在生活的人。");
      const objectId = text(c.command.payload.objectId ?? c.command.targetId);
      const object = objectId ? c.world.getEntity(objectId) : undefined;
      if (!object || object.kind !== ObjectKinds.item || object.archivedAt !== undefined) {
        return refuse(ObjectRejection.UnknownInstance, "这件东西现在不在这里。");
      }
      const prototype = prototypeOf(c.world, objectId);
      if (!prototype.capabilities.includes("carryable")) {
        return refuse(ObjectRejection.NotCarryable, `${prototype.name}搬不动，只能在原处使用。`);
      }
      // Permission is a world rule, shared by Web, NPCs and future AI drivers.
      const owner = ownerOf(c.world, objectId);
      if (owner && owner !== actorId && !permitted(c.world, objectId, actorId)) {
        return refuse(ObjectRejection.NotYours, `要先得到主人许可，才能拿走${prototype.name}。`);
      }
      const holder = holderOf(c.world, objectId);
      if (holder && holder !== actorId && !permitted(c.world, objectId, actorId)) {
        return refuse(ObjectRejection.InUse, `${prototype.name}正在别人手里，得先商量。`);
      }
      if (!reachable(c.world, actorId, objectId)) {
        return refuse(ObjectRejection.WrongPlace, `要先走到${prototype.name}所在的地方。`);
      }
      if (holder === actorId) return refuse(ObjectRejection.NotHeld, `你已经拿着${prototype.name}了。`);
      if (!canCarryObject(c.world, actorId, objectId, "", containerOf(c.world, objectId) !== "" &&
          holderOf(c.world, containerOf(c.world, objectId)) === actorId))
        return refuse(ObjectRejection.Overloaded, "随身东西太多了，先放下或装进提袋。");
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: `${ObjectCommands.take}.resolve`,
    commandType: ObjectCommands.take,
    resolve: (c) => {
      const actorId = c.command.actorId as string;
      const objectId = text(c.command.payload.objectId ?? c.command.targetId);
      const effects: Effect[] = [];
      const held = c.world.listRelations({ type: ObjectRelations.heldBy, from: objectId });
      for (const relation of held) {
        if (relation.to === actorId) continue;
        effects.push({ kind: "removeRelation", type: ObjectRelations.heldBy, from: objectId, to: relation.to, reason: "changed hands", announce: false });
      }
      const contained = c.world.listRelations({ type: ObjectRelations.containedIn, from: objectId });
      for (const relation of contained) {
        effects.push({ kind: "removeRelation", type: ObjectRelations.containedIn, from: objectId, to: relation.to, reason: "taken out of its container", announce: false });
      }
      // Holding a container does not disturb what is inside it: the contents
      // keep their own containment relation and are implicitly in hand. The
      // store keys relations by (type, from, to), so the new holder relation is
      // only added when this actor is not already the holder.
      if (!held.some((relation) => relation.to === actorId)) {
        effects.push({ kind: "addRelation", type: ObjectRelations.heldBy, from: objectId, to: actorId, announce: false });
      }
      effects.push({
        kind: "emitEvent",
        eventType: "world-objects.taken",
        actorId,
        targetId: objectId,
        data: { objectId, previousHolders: held.map((relation) => relation.to) },
        historicalSignificance: 0,
      });
      return effects;
    },
  });
}

function registerPlaceCommand(ctx: Registration): void {
  ctx.registerCommand({
    type: ObjectCommands.place,
    params: { objectId: "entity", placeId: "entity" },
    description: "Put a held object down in the current place, leaving it ownerless of hands but not of rights.",
  });

  ctx.registerConstraintRule({
    id: `${ObjectCommands.place}.allowed`,
    commandType: ObjectCommands.place,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      const objectId = text(c.command.payload.objectId ?? c.command.targetId);
      const placeId = text(c.command.payload.placeId);
      const object = objectId ? c.world.getEntity(objectId) : undefined;
      if (!object || object.kind !== ObjectKinds.item || object.archivedAt !== undefined) {
        return refuse(ObjectRejection.UnknownInstance, "这件东西现在不在你手里。");
      }
      if (holderOf(c.world, objectId) !== actorId) {
        return refuse(ObjectRejection.NotHeld, "只有拿在手里的东西才放得下。");
      }
      const place = placeId ? c.world.getEntity(placeId) : undefined;
      if (!place || place.kind !== "world-space.place" || place.archivedAt !== undefined ||
          occupancyPlace(c.world, actorId) !== placeId) {
        return refuse(ObjectRejection.WrongPlace, "只能把东西放在自己当前所在的地方。");
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: `${ObjectCommands.place}.resolve`,
    commandType: ObjectCommands.place,
    resolve: (c) => {
      const actorId = c.command.actorId as string;
      const objectId = text(c.command.payload.objectId ?? c.command.targetId);
      const placeId = text(c.command.payload.placeId);
      const effects: Effect[] = [];
      const clearHeld = clearHolder(c.world, objectId);
      if (clearHeld) effects.push(clearHeld);
      const clearInner = clearContainer(c.world, objectId);
      if (clearInner) effects.push(clearInner);
      effects.push({ kind: "addRelation", type: ObjectRelations.containedIn, from: objectId, to: placeId, announce: false });
      effects.push({
        kind: "emitEvent",
        eventType: "world-objects.placed",
        actorId,
        targetId: objectId,
        data: { objectId, placeId },
        historicalSignificance: 0,
      });
      return effects;
    },
  });
}

function registerStoreCommand(ctx: Registration): void {
  ctx.registerCommand({
    type: ObjectCommands.store,
    params: { objectId: "entity", containerId: "entity" },
    description: "Put a held object inside a container that has room.",
  });

  ctx.registerConstraintRule({
    id: `${ObjectCommands.store}.allowed`,
    commandType: ObjectCommands.store,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      const objectId = text(c.command.payload.objectId);
      const containerId = text(c.command.payload.containerId);
      const container = containerId ? c.world.getEntity(containerId) : undefined;
      if (!container || container.kind !== ObjectKinds.item || container.archivedAt !== undefined) {
        return refuse(ObjectRejection.UnknownInstance, "找不到这个容器。");
      }
      if (holderOf(c.world, objectId) !== actorId) {
        return refuse(ObjectRejection.NotHeld, "只有拿在手里的东西才装得进容器。");
      }
      const prototype = prototypeOf(c.world, containerId);
      if (!prototype.capabilities.includes("container") && !prototype.capabilities.includes("storage")) {
        return refuse(ObjectRejection.NotAContainer, `${prototype.name}不是容器。`);
      }
      // A container must be reachable and under the actor's control;
      // an object ID cannot teleport supplies into a remote bag.
      if (!reachable(c.world, actorId, containerId)) {
        return refuse(ObjectRejection.WrongPlace, "要先走到容器所在的地方。");
      }
      if (ownerOf(c.world, containerId) !== actorId && !permitted(c.world, containerId, actorId)) {
        return refuse(ObjectRejection.NotYours, "不能擅自往别人的容器里装东西。");
      }
      if (wouldContainItself(c.world, objectId, containerId)) {
        return refuse(ObjectRejection.NestedCycle, "不能把容器装进它自己或它装着的东西里。");
      }
      const used = containedCount(c.world, containerId);
      if (prototype.capacity > 0 && used >= prototype.capacity) {
        return refuse(ObjectRejection.Full, `${prototype.name}已经满了。`);
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: `${ObjectCommands.store}.resolve`,
    commandType: ObjectCommands.store,
    resolve: (c) => {
      const actorId = c.command.actorId as string;
      const objectId = text(c.command.payload.objectId);
      const containerId = text(c.command.payload.containerId);
      const effects: Effect[] = [];
      const clearHeld = clearHolder(c.world, objectId);
      if (clearHeld) effects.push(clearHeld);
      const clearInner = clearContainer(c.world, objectId);
      if (clearInner) effects.push(clearInner);
      effects.push({ kind: "addRelation", type: ObjectRelations.containedIn, from: objectId, to: containerId, announce: false });
      effects.push({
        kind: "emitEvent",
        eventType: "world-objects.stored",
        actorId,
        targetId: objectId,
        data: { objectId, containerId },
        historicalSignificance: 0,
      });
      return effects;
    },
  });
}

function registerRetrieveCommand(ctx: Registration): void {
  ctx.registerCommand({
    type: ObjectCommands.retrieve,
    params: { objectId: "entity" },
    description: "Take an object back out of the container it is in.",
  });

  ctx.registerConstraintRule({
    id: `${ObjectCommands.retrieve}.allowed`,
    commandType: ObjectCommands.retrieve,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      const objectId = text(c.command.payload.objectId);
      const object = objectId ? c.world.getEntity(objectId) : undefined;
      if (!object || object.kind !== ObjectKinds.item || object.archivedAt !== undefined) {
        return refuse(ObjectRejection.UnknownInstance, "这件东西现在不在。");
      }
      const containerId = containerOf(c.world, objectId);
      if (!containerId) return refuse(ObjectRejection.WrongPlace, "这件东西不在任何容器里。");
      const prototype = prototypeOf(c.world, objectId);
      if (!prototype.capabilities.includes("carryable")) {
        return refuse(ObjectRejection.NotCarryable, `${prototype.name}拿不出来，只能连容器一起搬。`);
      }
      if (!reachable(c.world, actorId, objectId)) {
        return refuse(ObjectRejection.WrongPlace, `要先走到${prototype.name}所在的地方。`);
      }
      if (!canCarryObject(c.world, actorId, objectId, "", holderOf(c.world, containerId) === actorId))
        return refuse(ObjectRejection.Overloaded, "双手拿不下了；先放下手里的东西再取。");
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: `${ObjectCommands.retrieve}.resolve`,
    commandType: ObjectCommands.retrieve,
    resolve: (c) => {
      const actorId = c.command.actorId as string;
      const objectId = text(c.command.payload.objectId);
      const effects: Effect[] = [];
      const clear = clearContainer(c.world, objectId);
      if (clear) effects.push(clear);
      // A stored object may still carry an old `heldBy` relation from before it
      // was put away, and the store keys relations by (type, from, to), so the
      // relation must be removed by identity rather than re-added.
      const holder = holderOf(c.world, objectId);
      if (holder !== actorId) {
        const clearHeld = clearHolder(c.world, objectId);
        if (clearHeld) effects.push(clearHeld);
        effects.push({ kind: "addRelation", type: ObjectRelations.heldBy, from: objectId, to: actorId, announce: false });
      }
      effects.push({
        kind: "emitEvent",
        eventType: "world-objects.retrieved",
        actorId,
        targetId: objectId,
        data: { objectId, holderChanged: holder !== actorId },
        historicalSignificance: 0,
      });
      return effects;
    },
  });
}

// ---------------------------------------------------------------------------
// Loans: ownership never moves, custody does
// ---------------------------------------------------------------------------

function registerLendCommand(ctx: Registration): void {
  ctx.registerCommand({
    type: ObjectCommands.lend,
    params: { objectId: "entity", borrowerId: "entity", dueAt: "number" },
    description: "Lend an object: the borrower gains custody and permission, never ownership, with a due date.",
  });

  ctx.registerConstraintRule({
    id: `${ObjectCommands.lend}.allowed`,
    commandType: ObjectCommands.lend,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      const objectId = text(c.command.payload.objectId);
      const borrowerId = text(c.command.payload.borrowerId ?? c.command.targetId);
      const object = objectId ? c.world.getEntity(objectId) : undefined;
      if (!object || object.kind !== ObjectKinds.item || object.archivedAt !== undefined) {
        return refuse(ObjectRejection.UnknownInstance, "找不到要借出的东西。");
      }
      if (!c.world.hasEntity(borrowerId)) return refuse(ObjectRejection.UnknownInstance, "找不到借东西的人。");
      const owner = ownerOf(c.world, objectId);
      if (owner && owner !== actorId) {
        return refuse(ObjectRejection.NotYours, "这件东西不是你的，不能替别人做主。");
      }
      const existing = c.world.getComponent(objectId, ObjectComponents.loan);
      if (existing && Number(existing.active ?? 0) === 1) {
        return refuse(ObjectRejection.InUse, "这件东西已经借出去了。");
      }
      const dueAt = Number(c.command.payload.dueAt ?? 0);
      if (!Number.isFinite(dueAt) || dueAt < c.world.tick) {
        return refuse(ObjectRejection.BadAmount, "归还时间必须在今天之后。");
      }
      if (owner && owner !== borrowerId && !canCarryObject(c.world, borrowerId, objectId))
        return refuse(ObjectRejection.Overloaded, "借物的人已经拿不下了，请先放下东西。");
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: `${ObjectCommands.lend}.resolve`,
    commandType: ObjectCommands.lend,
    resolve: (c) => {
      const actorId = c.command.actorId as string;
      const objectId = text(c.command.payload.objectId);
      const borrowerId = text(c.command.payload.borrowerId ?? c.command.targetId);
      const dueAt = Math.floor(Number(c.command.payload.dueAt));
      const effects: Effect[] = [];
      // `clearHolder` returns undefined when nobody is holding the object, and
      // `Array.prototype.filter(Boolean)` does not narrow that away, so the
      // removal is pushed conditionally instead of filtered afterwards.
      const clearHeld = clearHolder(c.world, objectId);
      if (clearHeld) effects.push(clearHeld);
      effects.push(
        { kind: "addRelation", type: ObjectRelations.heldBy, from: objectId, to: borrowerId, announce: false },
        { kind: "addRelation", type: ObjectRelations.permittedTo, from: objectId, to: borrowerId, announce: false },
        {
          kind: "setComponent",
          entityId: objectId,
          component: ObjectComponents.loan,
          value: { lenderId: actorId, borrowerId, lentAt: c.world.tick, dueAt, active: 1 },
        },
        {
          kind: "emitEvent",
          eventType: "world-objects.lent",
          actorId,
          targetId: objectId,
          data: { objectId, borrowerId, dueAt, dueInDays: Math.max(0, dueAt - c.world.tick) },
          historicalSignificance: 0.1,
        },
      );
      return effects;
    },
  });
}

function registerReturnCommand(ctx: Registration): void {
  ctx.registerCommand({
    type: ObjectCommands.returnItem,
    params: { objectId: "entity" },
    description: "Return a borrowed object to its owner and clear the outstanding promise.",
  });

  ctx.registerConstraintRule({
    id: `${ObjectCommands.returnItem}.allowed`,
    commandType: ObjectCommands.returnItem,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      const objectId = text(c.command.payload.objectId ?? c.command.targetId);
      const loan = c.world.getComponent(objectId, ObjectComponents.loan);
      if (!loan || Number(loan.active ?? 0) !== 1) {
        return refuse(ObjectRejection.AlreadyReturned, "这件东西现在没有借出记录。");
      }
      if (String(loan.borrowerId) !== actorId) {
        return refuse(ObjectRejection.NotYours, "只有借的人才还得了。");
      }
      const lenderId = String(loan.lenderId ?? "");
      if (lenderId && !canCarryObject(c.world, lenderId, objectId))
        return refuse(ObjectRejection.Overloaded, "主人暂时拿不下归还物，需先腾出空间。");
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: `${ObjectCommands.returnItem}.resolve`,
    commandType: ObjectCommands.returnItem,
    resolve: (c) => {
      const actorId = c.command.actorId as string;
      const objectId = text(c.command.payload.objectId ?? c.command.targetId);
      const loan = asRecord(c.world.getComponent(objectId, ObjectComponents.loan));
      const lenderId = String(loan.lenderId ?? "");
      const dueAt = Number(loan.dueAt ?? 0);
      const late = c.world.tick > dueAt;
      const effects: Effect[] = [];
      for (const relation of c.world.listRelations({ type: ObjectRelations.permittedTo, from: objectId })) {
        effects.push({ kind: "removeRelation", type: ObjectRelations.permittedTo, from: objectId, to: relation.to, reason: "loan returned", announce: false });
      }
      const clearHeld = clearHolder(c.world, objectId);
      if (clearHeld) effects.push(clearHeld);
      if (lenderId) {
        effects.push({ kind: "addRelation", type: ObjectRelations.heldBy, from: objectId, to: lenderId, announce: false });
      }
      effects.push(
        { kind: "setComponent", entityId: objectId, component: ObjectComponents.loan, value: { lenderId, borrowerId: actorId, lentAt: Number(loan.lentAt ?? 0), dueAt, active: 0, returnedAt: c.world.tick, late } },
        {
          kind: "emitEvent",
          eventType: "world-objects.returned",
          actorId,
          targetId: objectId,
          data: { objectId, lenderId, late, daysLate: late ? c.world.tick - dueAt : 0 },
          historicalSignificance: late ? 0.25 : 0.08,
        },
      );
      return effects;
    },
  });
}

/** The one garment is still a held/owned item: wearing grants no new custody. */
export function wornBy(world: WorldView, objectId: string): string {
  return world.listRelations({ type: ObjectRelations.wornBy, from: objectId })[0]?.to ?? "";
}
export function wornByActor(world: WorldView, actorId: string): string {
  return world.listRelations({ type: ObjectRelations.wornBy, to: actorId })
    .map((r) => r.from)
    .find((id) => {
      const entity = world.getEntity(id);
      return entity?.kind === ObjectKinds.item && entity.archivedAt === undefined &&
        holderOf(world, id) === actorId && ownerOf(world, id) === actorId &&
        prototypeOf(world, id).capabilities.includes("wearable");
    }) ?? "";
}

function registerWearCommands(ctx: Registration): void {
  ctx.registerCommand({ type: ObjectCommands.wear, params: { objectId: "entity" },
    description: "Wear exactly one carried garment in the sole outfit slot." });
  ctx.registerCommand({ type: ObjectCommands.unwear, params: { objectId: "entity" },
    description: "Remove the garment without losing custody." });
  ctx.registerConstraintRule({
    id: `${ObjectCommands.wear}.allowed`, commandType: ObjectCommands.wear,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      const objectId = text(c.command.payload.objectId);
      const item = c.world.getEntity(objectId);
      if (!item || item.kind !== ObjectKinds.item || item.archivedAt !== undefined) {
        return refuse(ObjectRejection.UnknownInstance, "找不到这件衣物。");
      }
      if (!prototypeOf(c.world, objectId).capabilities.includes("wearable")) {
        return refuse(ObjectRejection.NotCarryable, "这不是可以穿戴的衣物。");
      }
      if (ownerOf(c.world, objectId) !== actorId || holderOf(c.world, objectId) !== actorId) {
        return refuse(ObjectRejection.NotYours, "只能穿自己实际拿在手里的衣物。");
      }
      if (readObject(item.components[ObjectComponents.object]).quantity !== 1) {
        return refuse(ObjectRejection.BadAmount, "只能一次穿一件完整的衣物。");
      }
      if (wornBy(c.world, objectId) || wornByActor(c.world, actorId)) {
        return refuse(ObjectRejection.InUse, "已经穿着衣物，先脱下才能更换。");
      }
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${ObjectCommands.wear}.resolve`, commandType: ObjectCommands.wear,
    resolve: (c) => {
      const actorId = c.command.actorId as string;
      const objectId = text(c.command.payload.objectId);
      return [{
        kind: "addRelation", type: ObjectRelations.wornBy, from: objectId, to: actorId, announce: false,
      }, {
        kind: "emitEvent", eventType: "world-objects.worn", actorId, targetId: objectId,
        data: { objectId }, historicalSignificance: 0,
      }];
    },
  });
  ctx.registerConstraintRule({
    id: `${ObjectCommands.unwear}.allowed`, commandType: ObjectCommands.unwear,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      const objectId = text(c.command.payload.objectId);
      if (!objectId || wornBy(c.world, objectId) !== actorId ||
          holderOf(c.world, objectId) !== actorId) {
        return refuse(ObjectRejection.NotHeld, "这件衣物不是你正在穿着的。");
      }
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${ObjectCommands.unwear}.resolve`, commandType: ObjectCommands.unwear,
    resolve: (c) => {
      const actorId = c.command.actorId as string;
      const objectId = text(c.command.payload.objectId);
      return [{
        kind: "removeRelation", type: ObjectRelations.wornBy, from: objectId, to: actorId,
        reason: "garment taken off", announce: false,
      }, {
        kind: "emitEvent", eventType: "world-objects.unworn", actorId,
        targetId: objectId, data: { objectId }, historicalSignificance: 0,
      }];
    },
  });
  // Transfer and storage cannot strand a garment still worn by its former holder.
  for (const commandType of [ObjectCommands.take, ObjectCommands.place, ObjectCommands.store,
      ObjectCommands.retrieve, ObjectCommands.lend, ObjectCommands.returnItem]) {
    ctx.registerConstraintRule({
      id: `world-objects.wearing-transfer.${commandType}`, commandType,
      evaluate: (c) => {
        const id = text(c.command.payload.objectId ?? c.command.targetId);
        if (id && wornBy(c.world, id)) {
          return refuse(ObjectRejection.InUse, "这件衣物正穿在身上，请先脱下。");
        }
        return { ok: true };
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface StockRow {
  resourceId: string;
  label: string;
  unit: string;
  count: number;
  instances: string[];
}

/** Bulk resources a person holds directly, plus what their containers hold. */
export function stock(world: WorldView, holderId: string): { holderId: string; rows: StockRow[] } {
  const rows = new Map<string, StockRow>();
  if (!holderId) return { holderId, rows: [] };
  const held = world.listRelations({ type: ObjectRelations.heldBy, to: holderId }).map((relation) => relation.from);
  for (const objectId of held) {
    const object = world.getEntity(objectId);
    if (!object || object.archivedAt !== undefined) continue;
    const prototype = prototypeOf(world, objectId);
    const instance = readObject(object.components[ObjectComponents.object]);
    const amount = prototype.capacity > 0 && instance.quantity === 0 ? 1 : Math.max(1, instance.quantity);
    addRow(rows, prototype.resourceId, prototype.name, prototype.unit, amount, objectId);
    for (const inner of contentsOf(world, objectId)) {
      const innerPrototype = prototypeOf(world, inner);
      const innerInstance = readObject(world.getComponent(inner, ObjectComponents.object));
      addRow(rows, innerPrototype.resourceId, innerPrototype.name, innerPrototype.unit, Math.max(1, innerInstance.quantity), inner);
    }
  }
  return { holderId, rows: [...rows.values()].sort((a, b) => a.resourceId.localeCompare(b.resourceId)) };
}

export interface NearbyObject {
  id: string;
  name: string;
  prototypeId: string;
  material: string;
  capabilities: ObjectCapability[];
  condition: string;
  quantity: number;
  /** Where it is: held by someone, inside a container, or standing in a place. */
  placement: "held" | "contained" | "place";
  holderId: string;
  containerId: string;
  placeId: string;
  /** Whether the observer can act on it without walking anywhere. */
  reachable: boolean;
}

/**
 * Objects the observer can perceive from where they stand.
 *
 * The rule from SPACE-001/OBJ-001: an object is listed when it is in the same
 * place, in a container the observer can reach, or carried by someone present.
 * Anything deeper is only reachable by opening the container first.
 */
export function nearby(world: WorldView, observerId: string): { observerId: string; placeId: string; objects: NearbyObject[] } {
  const placeId = occupancyPlace(world, observerId);
  const spaceId = occupancySpace(world, observerId);
  const objects: NearbyObject[] = [];
  const present = placeId
    ? world.listRelations({ type: SpaceRelations.occupancy, to: placeId }).map((relation) => relation.from)
    : [observerId];
  const holders = new Set([observerId, ...present]);

  for (const entity of world.listEntities({ kind: ObjectKinds.item })) {
    if (entity.archivedAt !== undefined) continue;
    const prototype = prototypeOf(world, entity.id);
    const instance = readObject(entity.components[ObjectComponents.object]);
    const holder = holderOf(world, entity.id);
    const containerId = containerOf(world, entity.id);
    const containerPlace = containerId ? placeOfContainer(world, containerId) : "";

    let placement: NearbyObject["placement"] = "place";
    let placeOfObject = "";
    if (holder) {
      placement = "held";
    } else if (containerId) {
      placement = "contained";
    } else {
      placeOfObject = placeOfObjectId(world, entity.id);
    }

    const reachableHere = holder
      ? holders.has(holder)
      : containerId
        ? containerPlace === placeId || holders.has(holderOf(world, containerId))
        : placeOfObject === placeId;

    // Objects in another place are not enumerated: the observer cannot see them.
    if (!reachableHere) continue;
    if (!holder && !containerId && !placeOfObject) continue;

    objects.push({
      id: entity.id,
      name: instance.name || prototype.name,
      prototypeId: prototype.prototypeId,
      material: prototype.material,
      capabilities: prototype.capabilities,
      condition: instance.condition,
      quantity: instance.quantity,
      placement,
      holderId: holder,
      containerId,
      placeId: placeOfObject || containerPlace || placeId,
      reachable: true,
    });
    void spaceId;
  }
  return { observerId, placeId, objects: objects.sort((a, b) => a.id.localeCompare(b.id)) };
}

export function detail(world: WorldView, objectId: string) {
  const entity = objectId ? world.getEntity(objectId) : undefined;
  if (!entity || entity.kind !== ObjectKinds.item) return { exists: false, objectId };
  const prototype = prototypeOf(world, objectId);
  const instance = readObject(entity.components[ObjectComponents.object]);
  return {
    exists: true,
    objectId,
    prototype,
    instance,
    ownerId: ownerOf(world, objectId),
    holderId: holderOf(world, objectId),
    containerId: containerOf(world, objectId),
    placeId: placeOfObjectId(world, objectId),
    contents: contentsOf(world, objectId),
    loan: asRecord(world.getComponent(objectId, ObjectComponents.loan)),
  };
}

// ---------------------------------------------------------------------------
// Helpers shared with other packs and tests
// ---------------------------------------------------------------------------

export function prototypeOf(world: WorldView, objectId: string): PrototypeState & { prototypeId: string } {
  const prototypeId = world
    .listRelations({ type: ObjectRelations.instanceOf, from: objectId })
    .map((relation) => relation.to)[0] ?? "";
  return { prototypeId, ...readPrototype(world.getComponent(prototypeId, ObjectComponents.prototype)) };
}

export function ownerOf(world: WorldView, objectId: string): string {
  return world.listRelations({ type: ObjectRelations.ownedBy, from: objectId })[0]?.to ?? "";
}

export function holderOf(world: WorldView, objectId: string): string {
  return world.listRelations({ type: ObjectRelations.heldBy, from: objectId })[0]?.to ?? "";
}

export function containerOf(world: WorldView, objectId: string): string {
  return world.listRelations({ type: ObjectRelations.containedIn, from: objectId })[0]?.to ?? "";
}

export function permitted(world: WorldView, objectId: string, actorId: string): boolean {
  return world.listRelations({ type: ObjectRelations.permittedTo, from: objectId, to: actorId }).length > 0;
}

export function contentsOf(world: WorldView, containerId: string): string[] {
  return world
    .listRelations({ type: ObjectRelations.containedIn, to: containerId })
    .map((relation) => relation.from)
    .filter((id) => world.getEntity(id)?.kind === ObjectKinds.item);
}

function containedCount(world: WorldView, containerId: string): number {
  return contentsOf(world, containerId).length;
}

/** Walks the containment chain to prove an object cannot contain its own ancestor. */
function wouldContainItself(world: WorldView, objectId: string, containerId: string): boolean {
  let cursor = containerId;
  const seen = new Set<string>([objectId]);
  while (cursor) {
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    const parent = containerOf(world, cursor);
    if (!parent) return false;
    cursor = parent;
  }
  return false;
}

function placeOfObjectId(world: WorldView, objectId: string): string {
  const container = containerOf(world, objectId);
  if (!container) return "";
  const entity = world.getEntity(container);
  if (entity?.kind === "world-space.place") return container;
  if (entity?.kind === "world-space.space") return spacePlace(world, container);
  return placeOfContainer(world, container);
}

function placeOfContainer(world: WorldView, containerId: string): string {
  let cursor = containerId;
  for (let depth = 0; depth < 8; depth += 1) {
    const holder = holderOf(world, cursor);
    if (holder) return occupancyPlace(world, holder);
    const parent = containerOf(world, cursor);
    if (!parent) break;
    cursor = parent;
  }
  return "";
}

function occupancyPlace(world: WorldView, actorId: string): string {
  return world.listRelations({ type: SpaceRelations.occupancy, from: actorId })[0]?.to ?? "";
}

function occupancySpace(world: WorldView, actorId: string): string {
  return world.listRelations({ type: SpaceRelations.standingIn, from: actorId })[0]?.to ?? "";
}

/** Reachable = in the observer's place, held by someone present, or in a reachable container. */
function reachable(world: WorldView, actorId: string, objectId: string): boolean {
  const placeId = occupancyPlace(world, actorId);
  if (!placeId) return false;
  const holder = holderOf(world, objectId);
  if (holder) {
    if (holder === actorId) return true;
    return occupancyPlace(world, holder) === placeId;
  }
  const container = containerOf(world, objectId);
  if (!container) return false;
  // Standing directly in a place (or in one of that place's spaces).
  const containerEntity = world.getEntity(container);
  if (containerEntity?.kind === "world-space.place") return container === placeId;
  if (containerEntity?.kind === "world-space.space") return spacePlace(world, container) === placeId;
  return reachable(world, actorId, container);
}

function spacePlace(world: WorldView, spaceId: string): string {
  return world.listRelations({ type: SpaceRelations.inside, from: spaceId })[0]?.to ?? "";
}

function clearHolder(world: WorldView, objectId: string): Effect | undefined {
  const relation = world.listRelations({ type: ObjectRelations.heldBy, from: objectId })[0];
  if (!relation) return undefined;
  return { kind: "removeRelation", type: ObjectRelations.heldBy, from: objectId, to: relation.to, reason: "object changed hands", announce: false };
}

function clearContainer(world: WorldView, objectId: string): Effect | undefined {
  const relation = world.listRelations({ type: ObjectRelations.containedIn, from: objectId })[0];
  if (!relation) return undefined;
  return { kind: "removeRelation", type: ObjectRelations.containedIn, from: objectId, to: relation.to, reason: "object left its container", announce: false };
}

function addRow(
  rows: Map<string, StockRow>,
  resourceId: string,
  label: string,
  unit: string,
  amount: number,
  instanceId: string,
): void {
  const row = rows.get(resourceId) ?? { resourceId, label, unit, count: 0, instances: [] };
  row.count += amount;
  row.instances.push(instanceId);
  rows.set(resourceId, row);
}

export function readPrototype(raw: Readonly<Record<string, unknown>> | undefined): PrototypeState {
  return {
    name: typeof raw?.name === "string" ? raw.name : "",
    material: typeof raw?.material === "string" ? raw.material : "unspecified",
    resourceId: typeof raw?.resourceId === "string" ? raw.resourceId : "",
    unit: typeof raw?.unit === "string" ? raw.unit : "件",
    mass: Math.max(0, Number(raw?.mass ?? 0)),
    capacity: Math.max(0, Number(raw?.capacity ?? 0)),
    capabilities: capabilities(raw?.capabilities),
    durability: Math.max(0, Number(raw?.durability ?? 0)),
    visibleFromOutside: raw?.visibleFromOutside === true,
  };
}

export function readObject(raw: Readonly<Record<string, unknown>> | undefined): ObjectInstanceState {
  return {
    prototypeId: typeof raw?.prototypeId === "string" ? raw.prototypeId : "",
    name: typeof raw?.name === "string" ? raw.name : "",
    condition: typeof raw?.condition === "string" ? raw.condition : "new",
    quantity: Math.max(0, Number(raw?.quantity ?? 0)),
    durability: Math.max(0, Number(raw?.durability ?? 0)), madeAt: Math.max(0, Number(raw?.madeAt ?? 0)),
    provenance: asRecord(raw?.provenance),
    visibleFromOutside: raw?.visibleFromOutside === true, ...(typeof raw?.loanPolicy === "string" ? { loanPolicy: raw.loanPolicy } : {}),
  };
}

function capabilities(value: unknown): ObjectCapability[] {
  if (!Array.isArray(value)) return [];
  const allowed: ObjectCapability[] = [
    "carryable", "container", "edible", "burnable", "wearable",
    "workable", "tool", "fixture", "liquid-holder", "storage",
  ];
  const out: ObjectCapability[] = [];
  for (const entry of value) {
    const id = String(entry) as ObjectCapability;
    if (allowed.includes(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

function asRecord(value: unknown): Record<string, JsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...(value as Record<string, JsonValue>) };
}

function objectJson(value: unknown): Record<string, JsonValue> {
  return asRecord(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function refuse(code: string, message: string) {
  return { ok: false as const, code, message };
}
