/**
 * Magic Test World - world pack (§76, §77, MVP criterion 11).
 *
 * This pack exists to answer one question: can a completely different world
 * run without touching the kernel?
 *
 * Beings are souls with an essence pool, places are realms, mana is a resource
 * carried by ley lines and drawn by souls, and the life cycle is ascend then
 * reincarnate. It uses exactly the same Extension Points as the modern world.
 */

import type {
  ConstraintOutcome,
  Effect,
  EntityView,
  OpenLifeModule,
  WorldView,
} from "@openlife/contracts";
import {
  LEY_AETHER,
  LEY_UMBRA,
  MC,
  MK,
  MR,
  REALM_AETHER,
  REALM_UMBRA,
  TICKS_PER_CYCLE,
  WORLD_ID,
  type EssenceComponent,
  type LeyLineComponent,
  type WorldState,
} from "./ontology.ts";

const OWNER = "magic-test-world";

export const magicTestWorldModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "world-pack",
    name: "Magic Test World",
    description: "Souls, realms and ley-line mana. No modern concepts at all.",
    provides: ["magic.mana_network", "time.cycle", "life.population"],
    capabilities: [
      "component.register",
      "relation.register",
      "command.register",
      "rule.constraint.register",
      "rule.resolution.register",
      "rule.reaction.register",
      "resource.register",
      "schedule.register",
      "projection.register",
    ],
  },

  register(ctx) {
    for (const id of [MC.soul, MC.essence, MC.realm, MC.leyLine, MC.worldState]) {
      ctx.registerComponent({ id, persist: true, description: `magic component ${id}` });
    }
    for (const id of [MR.dwellsIn, MR.bondedTo, MR.fedBy]) {
      ctx.registerRelation({ id, persist: true, description: `magic relation ${id}` });
    }

    ctx.registerCommand({ type: "magic.initialize_world", description: "Weave the first realms." });
    ctx.registerCommand({
      type: "magic.create_soul",
      params: { name: "string", realmId: "entity" },
      description: "A new soul enters a realm.",
    });
    ctx.registerCommand({
      type: "magic.meditate",
      params: { effort: "number" },
      description: "Draw mana from the local ley line.",
    });
    ctx.registerCommand({
      type: "magic.bond",
      params: { targetName: "string" },
      description: "Form a soul bond.",
    });
    ctx.registerCommand({ type: "magic.ascend", description: "A soul leaves its body." });
    ctx.registerCommand({ type: "magic.reincarnate", description: "The next soul takes over." });
    ctx.registerCommand({ type: "magic.cycle", description: "Internal: one mana cycle passes." });

    ctx.registerTask({
      type: "magic.mana_cycle",
      description: "Ley lines replenish and souls regenerate.",
      handler: () => ({ command: { type: "magic.cycle", source: "system" } }),
    });

    registerInitialize(ctx);
    registerCreateSoul(ctx);
    registerMeditate(ctx);
    registerBond(ctx);
    registerAscend(ctx);
    registerReincarnate(ctx);
    registerCycle(ctx);

    ctx.registerProjection({
      id: "magic.soul_view",
      description: "The active soul, its essence and the mana network.",
      build: ({ world }) => {
        const state = readWorldState(world);
        if (!state) return { initialized: false };
        return {
          initialized: true,
          tick: world.tick,
          generation: state.generation,
          soulId: state.activeSoulId,
          soul: world.getEntity(state.activeSoulId) ?? null,
          realms: world.listEntities({ kind: MK.realm }).map((realm) => realm.id),
          manaNetwork: world.listEntities({ kind: MK.leyLine }).map((ley) => ({
            id: ley.id,
            flux: ley.components[MC.leyLine]?.flux ?? 0,
          })),
        };
      },
    });
  },
};

type Registration = Parameters<OpenLifeModule["register"]>[0];

function registerInitialize(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: "magic.initialize_world.allowed",
    commandType: "magic.initialize_world",
    evaluate: (c) =>
      readWorldState(c.world)
        ? { ok: false, code: "E_ALREADY_INITIALIZED", message: "world already woven" }
        : { ok: true },
  });

  ctx.registerResolutionRule({
    id: "magic.initialize_world.resolve",
    commandType: "magic.initialize_world",
    resolve: (): Effect[] => [
      {
        kind: "spawnEntity",
        localId: "world",
        id: WORLD_ID,
        entityKind: MK.world,
        components: { [MC.worldState]: { activeSoulId: "", generation: 1 } },
        announce: false,
      },
      {
        kind: "spawnEntity",
        localId: "umbra",
        id: REALM_UMBRA,
        entityKind: MK.realm,
        components: { [MC.realm]: { name: "Umbra", law: "shadows obey memory" } },
        announce: false,
      },
      {
        kind: "spawnEntity",
        localId: "aether",
        id: REALM_AETHER,
        entityKind: MK.realm,
        components: { [MC.realm]: { name: "Aether", law: "distance is a suggestion" } },
        announce: false,
      },
      {
        kind: "spawnEntity",
        localId: "leyUmbra",
        id: LEY_UMBRA,
        entityKind: MK.leyLine,
        components: {
          [MC.leyLine]: { realmId: REALM_UMBRA, flux: 100, flowRate: 4, capacity: 100 },
        },
        announce: false,
      },
      {
        kind: "spawnEntity",
        localId: "leyAether",
        id: LEY_AETHER,
        entityKind: MK.leyLine,
        components: {
          [MC.leyLine]: { realmId: REALM_AETHER, flux: 100, flowRate: 6, capacity: 100 },
        },
        announce: false,
      },
      { kind: "addRelation", type: MR.fedBy, from: REALM_UMBRA, to: LEY_UMBRA, announce: false },
      { kind: "addRelation", type: MR.fedBy, from: REALM_AETHER, to: LEY_AETHER, announce: false },
      {
        kind: "emitEvent",
        eventType: "magic.world_woven",
        actorId: "@world",
        data: { realms: [REALM_UMBRA, REALM_AETHER] },
        historicalSignificance: 0.9,
      },
      {
        kind: "scheduleTask",
        taskType: "magic.mana_cycle",
        afterTicks: TICKS_PER_CYCLE,
        everyTicks: TICKS_PER_CYCLE,
        dedupeKey: "cycle",
      },
    ],
  });
}

function registerCreateSoul(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: "magic.create_soul.allowed",
    commandType: "magic.create_soul",
    evaluate: (c) => {
      if (!readWorldState(c.world)) {
        return {
          ok: false,
          code: "E_WORLD_NOT_INITIALIZED",
          message: "run magic.initialize_world first",
        };
      }
      const realmId = c.command.payload.realmId;
      if (typeof realmId === "string" && !c.world.hasEntity(realmId)) {
        return { ok: false, code: "E_UNKNOWN_REALM", message: `unknown realm: ${realmId}` };
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: "magic.create_soul.resolve",
    commandType: "magic.create_soul",
    resolve: (c) => {
      const name = typeof c.command.payload.name === "string" ? c.command.payload.name : "Wanderer";
      const realmId =
        typeof c.command.payload.realmId === "string" ? c.command.payload.realmId : REALM_UMBRA;
      const affinity = c.rng.pick(["ember", "tide", "void", "dawn"]);
      const maxMana = c.rng.nextInt(40, 90);
      return [
        {
          kind: "spawnEntity",
          localId: "soul",
          entityKind: MK.soul,
          components: {
            [MC.soul]: { name, affinity, generation: 1, bornAt: c.world.tick, reincarnations: 0 },
            [MC.essence]: { mana: Math.round(maxMana / 2), maxMana, alive: true },
          },
          announce: false,
        },
        { kind: "addRelation", type: MR.dwellsIn, from: "@soul", to: realmId, announce: false },
        {
          kind: "emitEvent",
          eventType: "magic.soul_entered",
          actorId: "@soul",
          data: { name, affinity, realmId },
          historicalSignificance: 0.5,
        },
      ];
    },
  });

  ctx.registerReactionRule({
    id: "magic.create_soul.activate_first",
    eventType: "magic.soul_entered",
    react: (c) => {
      const state = readWorldState(c.world);
      if (!state || state.activeSoulId !== "") return [];
      return [
        {
          kind: "modifyComponent",
          entityId: WORLD_ID,
          component: MC.worldState,
          patch: { activeSoulId: c.event.actorId ?? "" },
          reason: "first soul becomes the active soul",
        },
      ];
    },
  });
}

function registerMeditate(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: "magic.meditate.allowed",
    commandType: "magic.meditate",
    evaluate: (c) => {
      const actor = requireSoul(c.world, c.command.actorId);
      if (!actor.ok) return actor.outcome;
      const ley = leyLineFor(c.world, actor.id);
      if (!ley) {
        return { ok: false, code: "E_NO_LEY_LINE", message: "no ley line feeds this realm" };
      }
      if (Number(ley.components[MC.leyLine]?.flux ?? 0) <= 0) {
        return { ok: false, code: "E_LEY_LINE_DEPLETED", message: "the ley line is exhausted" };
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: "magic.meditate.resolve",
    commandType: "magic.meditate",
    resolve: (c): Effect[] => {
      const actor = requireSoul(c.world, c.command.actorId);
      if (!actor.ok) return [];
      const soulId = actor.id;
      const ley = leyLineFor(c.world, soulId);
      if (!ley) return [];
      const line = ley.components[MC.leyLine] as unknown as LeyLineComponent;
      const essence = (c.world.getComponent(soulId, MC.essence) ?? {}) as unknown as EssenceComponent;
      const current = Number(essence.mana ?? 0);
      const maxMana = Number(essence.maxMana ?? 50);
      const effort = Number(c.command.payload.effort ?? 1);

      // The modifier pipeline decides how much mana is drawn, and every
      // contribution is recorded in the decision trace (§15, §16).
      const drawn = Math.max(
        0,
        Math.min(
          Number(line.flux ?? 0),
          Math.round(
            c.resolve("magic.mana.drawn", Number(line.flowRate ?? 4) * effort, [
              {
                id: "magic.mana.affinity",
                source: OWNER,
                target: "magic.mana.drawn",
                op: "mul",
                value: affinityFactor(String(actor.entity.components[MC.soul]?.affinity ?? "void")),
                reason: "soul affinity",
              },
            ]),
          ),
        ),
      );
      const gained = Math.min(drawn, Math.max(0, maxMana - current));

      return [
        {
          kind: "modifyComponent",
          entityId: soulId,
          component: MC.essence,
          patch: { mana: current + gained },
          reason: `drew ${gained} mana from ${ley.id}`,
        },
        {
          kind: "modifyComponent",
          entityId: ley.id,
          component: MC.leyLine,
          patch: { flux: Number(line.flux ?? 0) - drawn },
          reason: "mana drawn by a soul",
        },
        {
          kind: "emitEvent",
          eventType: "magic.mana_drawn",
          actorId: soulId,
          data: { gained, leyLineId: ley.id },
          historicalSignificance: 0.02,
        },
      ];
    },
  });
}

function registerBond(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: "magic.bond.allowed",
    commandType: "magic.bond",
    evaluate: (c) => {
      const actor = requireSoul(c.world, c.command.actorId);
      if (!actor.ok) return actor.outcome;
      const targetId = c.command.targetId;
      if (targetId) {
        if (targetId === actor.id) {
          return { ok: false, code: "E_SELF_TARGET", message: "a soul cannot bond with itself" };
        }
        if (c.world.listRelations({ type: MR.bondedTo, from: actor.id, to: targetId }).length > 0) {
          return { ok: false, code: "E_ALREADY_BONDED", message: "already bonded" };
        }
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: "magic.bond.resolve",
    commandType: "magic.bond",
    resolve: (c) => {
      const soulId = c.command.actorId as string;
      const effects: Effect[] = [];
      let targetRef = c.command.targetId;
      if (!targetRef) {
        effects.push({
          kind: "spawnEntity",
          localId: "other",
          entityKind: MK.soul,
          components: {
            [MC.soul]: {
              name:
                typeof c.command.payload.targetName === "string"
                  ? c.command.payload.targetName
                  : "Echo",
              affinity: c.rng.pick(["ember", "tide", "void", "dawn"]),
              generation: 0,
              bornAt: c.world.tick,
              reincarnations: 0,
            },
            [MC.essence]: { mana: 10, maxMana: c.rng.nextInt(40, 90), alive: true },
          },
          announce: false,
        });
        targetRef = "@other";
      }
      const resonance = c.resolve("magic.bond.resonance", 0.5, [
        {
          id: "magic.bond.affinity",
          source: OWNER,
          target: "magic.bond.resonance",
          op: "add",
          value: c.rng.nextFloat() * 0.3,
          reason: "affinity resonance",
        },
      ]);
      effects.push({
        kind: "addRelation",
        type: MR.bondedTo,
        from: soulId,
        to: targetRef,
        components: { [MC.soul]: { resonance, since: c.world.tick } },
        announce: false,
      });
      effects.push({
        kind: "emitEvent",
        eventType: "magic.souls_bonded",
        actorId: soulId,
        targetId: targetRef,
        data: { resonance },
        historicalSignificance: 0.35,
      });
      return effects;
    },
  });
}

function registerAscend(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: "magic.ascend.allowed",
    commandType: "magic.ascend",
    evaluate: (c) => {
      const actor = requireSoul(c.world, c.command.actorId);
      return actor.ok ? { ok: true } : actor.outcome;
    },
  });

  ctx.registerResolutionRule({
    id: "magic.ascend.resolve",
    commandType: "magic.ascend",
    resolve: (c) => [
      {
        kind: "emitEvent",
        eventType: "magic.soul_ascended",
        actorId: c.command.actorId,
        data: {
          mana: Number(
            c.world.getComponent(c.command.actorId as string, MC.essence)?.mana ?? 0,
          ),
        },
        historicalSignificance: 0.75,
      },
    ],
  });

  ctx.registerReactionRule({
    id: "magic.ascend.apply",
    eventType: "magic.soul_ascended",
    react: (c) => {
      const soulId = c.event.actorId;
      if (!soulId) return [];
      return [
        {
          kind: "modifyComponent",
          entityId: soulId,
          component: MC.essence,
          patch: { alive: false, mana: 0 },
          reason: "soul left its body",
        },
        { kind: "archiveEntity", entityId: soulId, reason: "ascension", announce: false },
      ];
    },
  });
}

function registerReincarnate(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: "magic.reincarnate.allowed",
    commandType: "magic.reincarnate",
    evaluate: (c) => {
      const state = readWorldState(c.world);
      if (!state) {
        return { ok: false, code: "E_WORLD_NOT_INITIALIZED", message: "world is not woven" };
      }
      const current = c.world.getEntity(state.activeSoulId);
      if (current && current.archivedAt === undefined) {
        return {
          ok: false,
          code: "E_ACTIVE_SOUL_PRESENT",
          message: "the active soul has not ascended",
        };
      }
      const successor = successorOf(c.world, state.activeSoulId);
      if (!successor) {
        return { ok: false, code: "E_NO_SUCCESSOR", message: "no other soul remains" };
      }
      c.note("successor chosen", { successorId: successor.id });
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: "magic.reincarnate.resolve",
    commandType: "magic.reincarnate",
    resolve: (c) => {
      const state = readWorldState(c.world);
      if (!state) return [];
      const successor = successorOf(c.world, state.activeSoulId);
      if (!successor) return [];
      const soul = successor.components[MC.soul] ?? {};
      return [
        {
          kind: "modifyComponent",
          entityId: WORLD_ID,
          component: MC.worldState,
          patch: { activeSoulId: successor.id, generation: Number(soul.generation ?? 1) },
          reason: "a new soul takes up the thread",
        },
        {
          kind: "emitEvent",
          eventType: "magic.reincarnated",
          actorId: successor.id,
          data: {
            generation: Number(soul.generation ?? 1),
            previousSoulId: state.activeSoulId,
          },
          historicalSignificance: 0.65,
        },
      ];
    },
  });
}

function registerCycle(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: "magic.cycle.allowed",
    commandType: "magic.cycle",
    evaluate: (c) =>
      readWorldState(c.world)
        ? { ok: true }
        : { ok: false, code: "E_WORLD_NOT_INITIALIZED", message: "world is not woven" },
  });

  ctx.registerResolutionRule({
    id: "magic.cycle.resolve",
    commandType: "magic.cycle",
    resolve: () => [
      {
        kind: "emitEvent",
        eventType: "magic.cycle_passed",
        data: { cycle: true },
        historicalSignificance: 0,
      },
    ],
  });

  // Ley lines replenish and souls regenerate. This is the magic world's
  // analogue of an economic tick and uses the same scheduler as the modern
  // world's annual pass.
  ctx.registerReactionRule({
    id: "magic.cycle.replenish",
    eventType: "magic.cycle_passed",
    react: (c) => {
      const effects: Effect[] = [];
      for (const ley of c.world.listEntities({ kind: MK.leyLine })) {
        const line = ley.components[MC.leyLine] as unknown as LeyLineComponent;
        const flux = Number(line.flux ?? 0);
        const capacity = Number(line.capacity ?? 100);
        if (flux >= capacity) continue;
        effects.push({
          kind: "modifyComponent",
          entityId: ley.id,
          component: MC.leyLine,
          patch: { flux: Math.min(capacity, flux + Math.round(capacity * 0.05)) },
          reason: "ley line replenishment",
        });
      }
      for (const soul of c.world.listEntities({ kind: MK.soul })) {
        const essence = soul.components[MC.essence] as unknown as EssenceComponent | undefined;
        if (!essence) continue;
        const mana = Number(essence.mana ?? 0);
        const maxMana = Number(essence.maxMana ?? 50);
        if (mana >= maxMana) continue;
        effects.push({
          kind: "modifyComponent",
          entityId: soul.id,
          component: MC.essence,
          patch: { mana: Math.min(maxMana, mana + 1) },
          reason: "natural essence regeneration",
        });
      }
      return effects;
    },
  });
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

export function readWorldState(world: WorldView): WorldState | undefined {
  const component = world.getComponent(WORLD_ID, MC.worldState);
  if (!component) return undefined;
  return {
    activeSoulId: String(component.activeSoulId ?? ""),
    generation: Number(component.generation ?? 1),
  };
}

/** The ley line that feeds the realm the soul dwells in. */
export function leyLineFor(world: WorldView, soulId: string): EntityView | undefined {
  const dwelling = world.listRelations({ type: MR.dwellsIn, from: soulId })[0];
  const realmId = dwelling?.to;
  if (!realmId) return undefined;
  const fed = world.listRelations({ type: MR.fedBy, from: realmId })[0];
  const leyId = fed?.to;
  return leyId ? world.getEntity(leyId) : undefined;
}

function successorOf(world: WorldView, currentSoulId: string): EntityView | undefined {
  return world
    .listEntities({ kind: MK.soul })
    .find((entity) => entity.id !== currentSoulId);
}

function requireSoul(
  world: WorldView,
  actorId: string | undefined,
): { ok: true; id: string; entity: EntityView } | { ok: false; outcome: ConstraintOutcome } {
  if (!actorId) {
    return {
      ok: false,
      outcome: { ok: false, code: "E_NO_ACTOR", message: "command requires a soul" },
    };
  }
  const entity = world.getEntity(actorId);
  if (!entity || entity.kind !== MK.soul) {
    return {
      ok: false,
      outcome: { ok: false, code: "E_NOT_A_SOUL", message: `not a soul: ${actorId}` },
    };
  }
  if (entity.archivedAt !== undefined) {
    return {
      ok: false,
      outcome: { ok: false, code: "E_SOUL_DEPARTED", message: "this soul has ascended" },
    };
  }
  return { ok: true, id: actorId, entity };
}

function affinityFactor(affinity: string): number {
  switch (affinity) {
    case "void":
      return 1.3;
    case "ember":
      return 1.15;
    case "tide":
      return 1.0;
    default:
      return 0.9;
  }
}
