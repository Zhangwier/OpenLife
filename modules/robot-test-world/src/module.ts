/**
 * Robot Test World.
 *
 * An extreme World Pack used to prove that the Kernel does not assume humans,
 * money, schools, families, mana or souls. Robots consume a generic module-owned
 * resource through registered Processes and can fabricate successor units.
 */

import type { Effect, OpenLifeModule, WorldView } from "@openlife/contracts";

const OWNER = "robot-test-world";
const WORLD_ID = "robot:world";
const STATION_ID = "robot:station:forge";
const TICKS_PER_CYCLE = 4;

export const RobotComponents = {
  worldState: "robot.world_state",
  unit: "robot.unit",
  power: "robot.power",
  station: "robot.station",
} as const;

export const RobotKinds = {
  world: "robot.world",
  unit: "robot.unit",
  station: "robot.station",
} as const;

export const RobotRelations = {
  fabricated: "robot.fabricated",
  dockedAt: "robot.docked_at",
} as const;

export const robotTestWorldModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "world-pack",
    name: "Robot Test World",
    description: "Autonomous machines, energy accounting and fabricated successors.",
    provides: ["robot.population", "robot.energy_network", "time.machine_cycle"],
    capabilities: [
      "component.register",
      "relation.register",
      "command.register",
      "rule.constraint.register",
      "rule.resolution.register",
      "rule.reaction.register",
      "resource.register",
      "process.register",
      "schedule.register",
      "projection.register",
    ],
  },

  register(ctx) {
    for (const id of Object.values(RobotComponents)) {
      ctx.registerComponent({ id, persist: true, description: `robot component ${id}` });
    }
    ctx.registerRelation({
      id: RobotRelations.fabricated,
      persist: true,
      allowedFrom: [RobotKinds.unit],
      allowedTo: [RobotKinds.unit],
    });
    ctx.registerRelation({
      id: RobotRelations.dockedAt,
      persist: true,
      allowedFrom: [RobotKinds.unit],
      allowedTo: [RobotKinds.station],
    });

    ctx.registerResource({
      id: "robot.energy",
      unit: "charge",
      description: "Stored machine energy.",
      tags: ["energy"],
    });
    ctx.registerProcess({
      id: "robot.work_process",
      consumes: { "robot.energy": 12 },
      description: "Convert stored energy into useful machine work.",
    });
    ctx.registerProcess({
      id: "robot.recharge_process",
      produces: { "robot.energy": 30 },
      description: "Transfer station energy into a unit.",
    });
    ctx.registerProcess({
      id: "robot.fabrication_process",
      consumes: { "robot.energy": 25 },
      description: "Fabricate a successor unit from a running unit's blueprint.",
    });

    for (const definition of [
      ["robot.initialize_world", "Bring the machine world online."],
      ["robot.assemble_unit", "Assemble a new autonomous unit."],
      ["robot.work", "Spend energy to perform useful work."],
      ["robot.recharge", "Recharge a unit at the forge."],
      ["robot.fabricate_successor", "Fabricate a successor unit."],
      ["robot.shutdown", "Permanently shut down a unit."],
      ["robot.switch_unit", "Transfer control to a fabricated successor."],
      ["robot.cycle", "Internal machine energy cycle."],
    ] as const) {
      ctx.registerCommand({ type: definition[0], description: definition[1] });
    }

    ctx.registerTask({
      type: "robot.energy_cycle",
      description: "Periodic idle energy drain.",
      handler: () => ({ command: { type: "robot.cycle", source: "system" } }),
    });

    registerInitialize(ctx);
    registerAssemble(ctx);
    registerWork(ctx);
    registerRecharge(ctx);
    registerFabricate(ctx);
    registerShutdown(ctx);
    registerSwitch(ctx);
    registerCycle(ctx);

    ctx.registerProjection({
      id: "robot.unit_view",
      description: "Active unit and machine-world energy state.",
      build: ({ world }) => {
        const state = world.getComponent(WORLD_ID, RobotComponents.worldState) ?? {};
        const activeUnitId = String(state.activeUnitId ?? "");
        return {
          initialized: world.hasEntity(WORLD_ID),
          generation: Number(state.generation ?? 0),
          activeUnitId,
          activeUnit: activeUnitId ? world.getEntity(activeUnitId) ?? null : null,
          units: world.listEntities({ kind: RobotKinds.unit, includeArchived: true }).map((unit) => ({
            id: unit.id,
            archived: unit.archivedAt !== undefined,
            charge: Number(unit.components[RobotComponents.power]?.charge ?? 0),
          })),
        };
      },
    });
  },
};

type Registration = Parameters<OpenLifeModule["register"]>[0];

function registerInitialize(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: "robot.initialize_world.allowed",
    commandType: "robot.initialize_world",
    evaluate: (c) => c.world.hasEntity(WORLD_ID)
      ? { ok: false, code: "E_ALREADY_INITIALIZED", message: "machine world already online" }
      : { ok: true },
  });
  ctx.registerResolutionRule({
    id: "robot.initialize_world.resolve",
    commandType: "robot.initialize_world",
    resolve: () => [
      {
        kind: "spawnEntity",
        localId: "world",
        id: WORLD_ID,
        entityKind: RobotKinds.world,
        components: { [RobotComponents.worldState]: { activeUnitId: "", generation: 1 } },
        announce: false,
      },
      {
        kind: "spawnEntity",
        localId: "station",
        id: STATION_ID,
        entityKind: RobotKinds.station,
        components: { [RobotComponents.station]: { name: "Forge", output: 30 } },
        announce: false,
      },
      {
        kind: "emitEvent",
        eventType: "robot.world_online",
        actorId: "@world",
        data: { stationId: STATION_ID },
        historicalSignificance: 0.8,
      },
      {
        kind: "scheduleTask",
        taskType: "robot.energy_cycle",
        afterTicks: TICKS_PER_CYCLE,
        everyTicks: TICKS_PER_CYCLE,
        dedupeKey: "energy-cycle",
      },
    ],
  });
}

function registerAssemble(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: "robot.assemble_unit.allowed",
    commandType: "robot.assemble_unit",
    evaluate: (c) => c.world.hasEntity(WORLD_ID)
      ? { ok: true }
      : { ok: false, code: "E_WORLD_OFFLINE", message: "initialize robot world first" },
  });
  ctx.registerResolutionRule({
    id: "robot.assemble_unit.resolve",
    commandType: "robot.assemble_unit",
    resolve: (c) => {
      const name = typeof c.command.payload.name === "string" ? c.command.payload.name : "Unit";
      const model = c.rng.pick(["atlas", "lumen", "vector", "relay"]);
      const capacity = c.rng.nextInt(70, 111);
      return [
        {
          kind: "spawnEntity",
          localId: "unit",
          entityKind: RobotKinds.unit,
          components: {
            [RobotComponents.unit]: { name, model, generation: 1, assembledAt: c.world.tick },
            [RobotComponents.power]: { charge: capacity, capacity, online: true },
          },
          announce: false,
        },
        {
          kind: "addRelation",
          type: RobotRelations.dockedAt,
          from: "@unit",
          to: STATION_ID,
          announce: false,
        },
        {
          kind: "emitEvent",
          eventType: "robot.unit_assembled",
          actorId: "@unit",
          data: { name, model, capacity },
          historicalSignificance: 0.45,
        },
      ];
    },
  });
  ctx.registerReactionRule({
    id: "robot.unit_assembled.activate_first",
    eventType: "robot.unit_assembled",
    react: (c) => {
      const state = c.world.getComponent(WORLD_ID, RobotComponents.worldState) ?? {};
      if (state.activeUnitId) return [];
      return [{
        kind: "modifyComponent",
        entityId: WORLD_ID,
        component: RobotComponents.worldState,
        patch: { activeUnitId: c.event.actorId ?? "", generation: 1 },
        reason: "first assembled unit becomes active",
      }];
    },
  });
}

function registerWork(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: "robot.work.allowed",
    commandType: "robot.work",
    evaluate: (c) => requirePoweredUnit(c.world, c.command.actorId, 12),
  });
  ctx.registerResolutionRule({
    id: "robot.work.resolve",
    commandType: "robot.work",
    resolve: (c) => {
      const id = c.command.actorId as string;
      const power = c.world.getComponent(id, RobotComponents.power) ?? {};
      const charge = Number(power.charge ?? 0);
      return [
        {
          kind: "modifyComponent",
          entityId: id,
          component: RobotComponents.power,
          patch: { charge: Math.max(0, charge - 12) },
          reason: "robot.work_process consumed energy",
        },
        {
          kind: "emitEvent",
          eventType: "robot.work_completed",
          actorId: id,
          data: { energySpent: 12 },
          historicalSignificance: 0.2,
        },
      ];
    },
  });
}

function registerRecharge(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: "robot.recharge.allowed",
    commandType: "robot.recharge",
    evaluate: (c) => requireUnit(c.world, c.command.actorId),
  });
  ctx.registerResolutionRule({
    id: "robot.recharge.resolve",
    commandType: "robot.recharge",
    resolve: (c) => {
      const id = c.command.actorId as string;
      const power = c.world.getComponent(id, RobotComponents.power) ?? {};
      const capacity = Number(power.capacity ?? 100);
      const next = Math.min(capacity, Number(power.charge ?? 0) + 30);
      return [
        {
          kind: "modifyComponent",
          entityId: id,
          component: RobotComponents.power,
          patch: { charge: next, online: true },
          reason: "robot.recharge_process restored energy",
        },
        {
          kind: "emitEvent",
          eventType: "robot.recharged",
          actorId: id,
          data: { charge: next },
          historicalSignificance: 0.1,
        },
      ];
    },
  });
}

function registerFabricate(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: "robot.fabricate_successor.allowed",
    commandType: "robot.fabricate_successor",
    evaluate: (c) => requirePoweredUnit(c.world, c.command.actorId, 25),
  });
  ctx.registerResolutionRule({
    id: "robot.fabricate_successor.resolve",
    commandType: "robot.fabricate_successor",
    resolve: (c) => {
      const parentId = c.command.actorId as string;
      const unit = c.world.getComponent(parentId, RobotComponents.unit) ?? {};
      const power = c.world.getComponent(parentId, RobotComponents.power) ?? {};
      const generation = Number(unit.generation ?? 1) + 1;
      const capacity = c.rng.nextInt(80, 121);
      const name = typeof c.command.payload.name === "string"
        ? c.command.payload.name
        : `Unit-G${generation}`;
      return [
        {
          kind: "modifyComponent",
          entityId: parentId,
          component: RobotComponents.power,
          patch: { charge: Number(power.charge ?? 0) - 25 },
          reason: "robot.fabrication_process consumed energy",
        },
        {
          kind: "spawnEntity",
          localId: "successor",
          entityKind: RobotKinds.unit,
          components: {
            [RobotComponents.unit]: {
              name,
              model: c.rng.pick(["atlas", "lumen", "vector", "relay"]),
              generation,
              assembledAt: c.world.tick,
            },
            [RobotComponents.power]: { charge: capacity, capacity, online: true },
          },
          announce: false,
        },
        {
          kind: "addRelation",
          type: RobotRelations.fabricated,
          from: parentId,
          to: "@successor",
          announce: false,
        },
        {
          kind: "addRelation",
          type: RobotRelations.dockedAt,
          from: "@successor",
          to: STATION_ID,
          announce: false,
        },
        {
          kind: "emitEvent",
          eventType: "robot.successor_fabricated",
          actorId: parentId,
          targetId: "@successor",
          data: { generation, name },
          historicalSignificance: 0.65,
        },
      ];
    },
  });
}

function registerShutdown(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: "robot.shutdown.allowed",
    commandType: "robot.shutdown",
    evaluate: (c) => requireUnit(c.world, c.command.actorId),
  });
  ctx.registerResolutionRule({
    id: "robot.shutdown.resolve",
    commandType: "robot.shutdown",
    resolve: (c) => [{
      kind: "emitEvent",
      eventType: "robot.unit_shutdown",
      actorId: c.command.actorId,
      data: {},
      historicalSignificance: 0.6,
    }],
  });
  ctx.registerReactionRule({
    id: "robot.unit_shutdown.apply",
    eventType: "robot.unit_shutdown",
    react: (c) => c.event.actorId ? [
      {
        kind: "modifyComponent",
        entityId: c.event.actorId,
        component: RobotComponents.power,
        patch: { online: false },
        reason: "unit permanently shut down",
      },
      {
        kind: "archiveEntity",
        entityId: c.event.actorId,
        reason: "shutdown",
        announce: false,
      },
    ] : [],
  });
}

function registerSwitch(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: "robot.switch_unit.allowed",
    commandType: "robot.switch_unit",
    evaluate: (c) => {
      const state = c.world.getComponent(WORLD_ID, RobotComponents.worldState) ?? {};
      const active = String(state.activeUnitId ?? "");
      const current = active ? c.world.getEntity(active) : undefined;
      if (current && current.archivedAt === undefined) {
        return { ok: false, code: "E_ACTIVE_UNIT_ONLINE", message: "active unit is still online" };
      }
      return findSuccessor(c.world, active)
        ? { ok: true }
        : { ok: false, code: "E_NO_SUCCESSOR", message: "no online fabricated successor" };
    },
  });
  ctx.registerResolutionRule({
    id: "robot.switch_unit.resolve",
    commandType: "robot.switch_unit",
    resolve: (c) => {
      const state = c.world.getComponent(WORLD_ID, RobotComponents.worldState) ?? {};
      const previous = String(state.activeUnitId ?? "");
      const successor = findSuccessor(c.world, previous);
      if (!successor) return [];
      const generation = Number(successor.components[RobotComponents.unit]?.generation ?? 1);
      return [
        {
          kind: "modifyComponent",
          entityId: WORLD_ID,
          component: RobotComponents.worldState,
          patch: { activeUnitId: successor.id, generation },
          reason: "control transferred to fabricated successor",
        },
        {
          kind: "emitEvent",
          eventType: "robot.control_transferred",
          actorId: successor.id,
          data: { previousUnitId: previous, generation },
          historicalSignificance: 0.65,
        },
      ];
    },
  });
}

function registerCycle(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: "robot.cycle.allowed",
    commandType: "robot.cycle",
    evaluate: () => ({ ok: true }),
  });
  ctx.registerResolutionRule({
    id: "robot.cycle.resolve",
    commandType: "robot.cycle",
    resolve: () => [{
      kind: "emitEvent",
      eventType: "robot.cycle_passed",
      data: {},
      historicalSignificance: 0,
    }],
  });
  ctx.registerReactionRule({
    id: "robot.cycle.drain",
    eventType: "robot.cycle_passed",
    react: (c) => {
      const effects: Effect[] = [];
      for (const unit of c.world.listEntities({ kind: RobotKinds.unit })) {
        const power = unit.components[RobotComponents.power] ?? {};
        if (power.online === false) continue;
        const next = Math.max(0, Number(power.charge ?? 0) - 2);
        effects.push({
          kind: "modifyComponent",
          entityId: unit.id,
          component: RobotComponents.power,
          patch: { charge: next, ...(next === 0 ? { online: false } : {}) },
          reason: "idle machine cycle consumed energy",
        });
        if (next === 0) {
          effects.push({
            kind: "emitEvent",
            eventType: "robot.energy_depleted",
            actorId: unit.id,
            data: {},
            historicalSignificance: 0.25,
          });
        }
      }
      return effects;
    },
  });
}

function requireUnit(world: WorldView, actorId: string | undefined) {
  if (!actorId) return { ok: false as const, code: "E_NO_ACTOR", message: "unit id required" };
  const unit = world.getEntity(actorId);
  if (!unit || unit.kind !== RobotKinds.unit || unit.archivedAt !== undefined) {
    return { ok: false as const, code: "E_NOT_UNIT", message: "actor is not an online unit" };
  }
  return { ok: true as const };
}

function requirePoweredUnit(world: WorldView, actorId: string | undefined, minimum: number) {
  const unit = requireUnit(world, actorId);
  if (!unit.ok) return unit;
  const power = world.getComponent(actorId as string, RobotComponents.power) ?? {};
  if (power.online === false || Number(power.charge ?? 0) < minimum) {
    return { ok: false as const, code: "E_INSUFFICIENT_ENERGY", message: "unit lacks stored energy" };
  }
  return { ok: true as const };
}

function findSuccessor(world: WorldView, parentId: string) {
  const relation = world
    .listRelations({ type: RobotRelations.fabricated, from: parentId })
    .find((candidate) => {
      const target = world.getEntity(candidate.to);
      return target?.archivedAt === undefined
        && target?.components[RobotComponents.power]?.online !== false;
    });
  return relation ? world.getEntity(relation.to) : undefined;
}
