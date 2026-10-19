/**
 * Modern World - world pack.
 *
 * Provides the minimal modern-life ontology: characters, cities, wealth and a
 * calendar. It also owns the life-cycle commands (create / die / switch
 * generation) and the annual tick that drives ageing.
 *
 * It knows nothing about schools, jobs or marriage: those are separate system
 * packs that react to this module's events. That separation is the point of the
 * prototype.
 */

import type {
  Command,
  ConstraintOutcome,
  Effect,
  EntityId,
  EntityView,
  OpenLifeModule,
  RelationView,
  WorldView,
} from "@openlife/contracts";
import { ageInYears, TICKS_PER_YEAR } from "./calendar.ts";
import { DAY_TICKS_PER_YEAR } from "@openlife/life-contracts";
import {
  C,
  CITY_NORTH,
  CITY_SOUTH,
  K,
  R,
  WORLD_ENTITY_ID,
  type OrganizationComponent,
  type VitalsComponent,
} from "./components.ts";

const OWNER = "modern-world";

/** Relation type owned by the family pack; used only for heir selection. */
const PARENT_OF = "family.parent_of";

interface ActiveWorld {
  activeCharacterId: string;
  generation: number;
}

export const modernWorldModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "world-pack",
    name: "Modern World",
    description: "Minimal modern-life ontology: characters, cities, money, calendar.",
    provides: ["life.population", "time.calendar", "economy.currency"],
    expects: [],
    capabilities: [
      "component.register",
      "relation.register",
      "command.register",
      "rule.constraint.register",
      "rule.resolution.register",
      "rule.reaction.register",
      "schedule.register",
      "projection.register",
    ],
  },

  register(ctx) {
    // INV-007 grants: life modules that legitimately update shared person data.
    const writableBy: Record<string, string[]> = {
      [C.wealth]: ["career"],
      [C.identity]: ["early-civilization"],
      [C.worldState]: ["settlement-life", "settlement-locations"],
    };
    for (const id of [C.identity, C.vitals, C.wealth, C.residence, C.worldState, C.organization]) {
      ctx.registerComponent({ id, persist: true, description: `modern world component ${id}`,
        ...(writableBy[id] ? { writableBy: writableBy[id] } : {}) });
    }
    for (const id of [R.livesIn, R.owns]) {
      ctx.registerRelation({ id, persist: true, description: `modern world relation ${id}` });
    }

    ctx.registerCommand({ type: "modern.initialize_world", description: "Create the initial world." });
    ctx.registerCommand({
      type: "modern.create_character",
      params: { givenName: "string", familyName: "string", cityId: "entity" },
      description: "Create a new character.",
    });
    ctx.registerCommand({ type: "modern.die", description: "End the active character's life." });
    ctx.registerCommand({
      type: "modern.switch_generation",
      description: "Hand control to the heir of the deceased active character.",
    });
    ctx.registerCommand({
      type: "modern.tick_year",
      description: "Internal: advance the calendar by one year of simulation.",
    });
    ctx.registerCommand({ type: "modern.dissolve_organization", description: "Dissolve an organisation." });

    ctx.registerTask({
      type: "modern.annual_tick",
      description: "Yearly ageing and mortality pass.",
      // M1.2-B: the task re-arms itself from the **live** world instead of
      // relying on the interval fixed when `modern.initialize_world` resolved.
      // That resolve runs before `world-clock` creates its component, so the
      // one-shot interval would stay pinned to the legacy twelve forever.
      handler: (c) => ({
        command: { type: "modern.tick_year", source: "system" },
        rescheduleAt: c.at + ticksPerYear(c.world),
      }),
    });

    registerInitializeWorld(ctx);
    registerCreateCharacter(ctx);
    registerDie(ctx);
    registerSwitchGeneration(ctx);
    registerTickYear(ctx);
    registerDissolveOrganization(ctx);

    ctx.registerProjection({
      id: "modern.player",
      description: "What the active character can see about themselves.",
      build: ({ world }) => {
        const worldState = readWorldState(world);
        if (!worldState) return { initialized: false };
        const entity = world.getEntity(worldState.activeCharacterId);
        return {
          initialized: true,
          tick: world.tick,
          generation: worldState.generation,
          characterId: worldState.activeCharacterId,
          character: entity ?? null,
        };
      },
    });

    ctx.registerProjection({
      id: "modern.world_overview",
      description: "System-level summary of the modern world.",
      build: ({ world, history }) => ({
        tick: world.tick,
        cities: world.listEntities({ kind: K.city }).map((city) => ({
          id: city.id,
          name: city.components[C.identity]?.name ?? city.id,
        })),
        livingCharacters: world.listEntities({ kind: K.character }).length,
        organizations: world.listEntities({ kind: K.organization }).map((org) => ({
          id: org.id,
          name: org.components[C.organization]?.name ?? org.id,
          dissolved: org.archivedAt !== undefined,
        })),
        historicalRecords: history.listRecords().length,
      }),
    });
  },
};

// ---------------------------------------------------------------------------
// modern.initialize_world
// ---------------------------------------------------------------------------

function registerInitializeWorld(ctx: Parameters<OpenLifeModule["register"]>[0]): void {
  ctx.registerConstraintRule({
    id: "modern.initialize_world.allowed",
    commandType: "modern.initialize_world",
    evaluate: (c) => {
      if (readWorldState(c.world)) {
        return { ok: false, code: "E_ALREADY_INITIALIZED", message: "world already initialized" };
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: "modern.initialize_world.resolve",
    commandType: "modern.initialize_world",
    resolve: (c): Effect[] => [
      {
        kind: "spawnEntity",
        localId: "world",
        id: WORLD_ENTITY_ID,
        entityKind: K.world,
        components: {
          [C.worldState]: { activeCharacterId: "", generation: 1, initialized: true },
        },
        announce: false,
      },
      {
        kind: "spawnEntity",
        localId: "north",
        id: CITY_NORTH,
        entityKind: K.city,
        components: { [C.identity]: { name: "Northport" } },
        announce: false,
      },
      {
        kind: "spawnEntity",
        localId: "south",
        id: CITY_SOUTH,
        entityKind: K.city,
        components: { [C.identity]: { name: "Southgate" } },
        announce: false,
      },
      {
        kind: "emitEvent",
        eventType: "modern.world_initialized",
        actorId: "@world",
        data: { cities: [CITY_NORTH, CITY_SOUTH] },
        historicalSignificance: 0.4,
      },
      {
        kind: "scheduleTask",
        taskType: "modern.annual_tick",
        // M1.2-B: this resolve runs before `world-clock` has created its
        // component, so it cannot know the world's scale yet. The first due
        // tick is therefore the *legacy* year, and the task's own handler
        // re-arms from the live world - which is the only place the declared
        // scale is knowable. A day-scale world corrects itself on first fire.
        afterTicks: TICKS_PER_YEAR,
        dedupeKey: "annual",
      },
    ],
  });
}

/**
 * Kernel ticks in one year for the world this rule is running in.
 *
 * The world clock publishes its scale; a world without one keeps the legacy
 * month reading, so an old save still ages once per twelve ticks.
 */
export function ticksPerYear(world: WorldView): number {
  const scale = world.getComponent(WORLD_ENTITY_ID, "world-clock.clock") ? "day" : "month";
  return scale === "day" ? DAY_TICKS_PER_YEAR : TICKS_PER_YEAR;
}

// ---------------------------------------------------------------------------
// modern.create_character
// ---------------------------------------------------------------------------

function registerCreateCharacter(ctx: Parameters<OpenLifeModule["register"]>[0]): void {
  ctx.registerConstraintRule({
    id: "modern.create_character.allowed",
    commandType: "modern.create_character",
    evaluate: (c) => {
      if (!readWorldState(c.world)) {
        return { ok: false, code: "E_WORLD_NOT_INITIALIZED", message: "run modern.initialize_world first" };
      }
      const cityId = c.command.payload.cityId;
      if (typeof cityId === "string" && !c.world.hasEntity(cityId)) {
        return { ok: false, code: "E_UNKNOWN_CITY", message: `unknown city: ${cityId}` };
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: "modern.create_character.resolve",
    commandType: "modern.create_character",
    resolve: (c) => {
      const payload = c.command.payload;
      const givenName = asString(payload.givenName, "Unnamed");
      const familyName = asString(payload.familyName, "Family");
      const lineageId = asString(payload.lineageId, "family:lineage:1");
      const generation = asNumber(payload.generation, 1);
      const cityId = asString(payload.cityId, CITY_NORTH);
      // `lifespan` may be supplied explicitly (tests, authored scenarios);
      // otherwise it is drawn from the deterministic RNG.
      const lifespan = asNumber(payload.lifespan, c.rng.nextInt(60, 96));

      const effects: Effect[] = [
        {
          kind: "spawnEntity",
          localId: "character",
          entityKind: K.character,
          components: {
            [C.identity]: {
              givenName,
              familyName,
              sex: asString(payload.sex, "other"),
              generation,
              lineageId,
              bornAt: c.world.tick,
            },
            [C.vitals]: { alive: true, health: 1, ageYears: 0, lifespan },
            [C.wealth]: { cash: asNumber(payload.startingCash, 0), debt: 0 },
            [C.residence]: { cityId },
          },
          announce: false,
        },
        {
          kind: "addRelation",
          type: R.livesIn,
          from: "@character",
          to: cityId,
          announce: false,
        },
        {
          kind: "emitEvent",
          eventType: "modern.character_created",
          actorId: "@character",
          data: { givenName, familyName, generation, lineageId, cityId, lifespan },
          historicalSignificance: 0.5,
        },
      ];
      return effects;
    },
  });

  // The first character becomes the active one.
  ctx.registerReactionRule({
    id: "modern.create_character.activate_first",
    eventType: "modern.character_created",
    react: (c) => {
      const worldState = readWorldState(c.world);
      if (!worldState || worldState.activeCharacterId !== "") return [];
      return [
        {
          kind: "modifyComponent",
          entityId: WORLD_ENTITY_ID,
          component: C.worldState,
          patch: { activeCharacterId: c.event.actorId ?? "" },
          reason: "first character becomes the active character",
        },
      ];
    },
  });
}

// ---------------------------------------------------------------------------
// modern.die
// ---------------------------------------------------------------------------

function registerDie(ctx: Parameters<OpenLifeModule["register"]>[0]): void {
  ctx.registerConstraintRule({
    id: "modern.die.allowed",
    commandType: "modern.die",
    evaluate: (c) => {
      const actor = requireLivingCharacter(c.world, c.command);
      if (!actor.ok) return actor.outcome;
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: "modern.die.resolve",
    commandType: "modern.die",
    resolve: (c) => [
      {
        kind: "emitEvent",
        eventType: "modern.character_died",
        actorId: c.command.actorId,
        data: { cause: asString(c.command.payload.cause, "natural causes") },
        historicalSignificance: 0.8,
      },
    ],
  });

  // Death itself is applied by a reaction, so the fact of death is an event
  // before it becomes a state change.
  ctx.registerReactionRule({
    id: "modern.die.apply",
    eventType: "modern.character_died",
    react: (c) => {
      const characterId = c.event.actorId;
      if (!characterId) return [];
      return [
        {
          kind: "modifyComponent",
          entityId: characterId,
          component: C.vitals,
          patch: { alive: false, health: 0 },
          reason: "character died",
        },
        {
          kind: "archiveEntity",
          entityId: characterId,
          reason: "death",
          announce: false,
        },
      ];
    },
  });
}

// ---------------------------------------------------------------------------
// modern.switch_generation
// ---------------------------------------------------------------------------

function registerSwitchGeneration(ctx: Parameters<OpenLifeModule["register"]>[0]): void {
  ctx.registerConstraintRule({
    id: "modern.switch_generation.allowed",
    commandType: "modern.switch_generation",
    evaluate: (c) => {
      const worldState = readWorldState(c.world);
      if (!worldState) {
        return { ok: false, code: "E_WORLD_NOT_INITIALIZED", message: "world is not initialized" };
      }
      const current = c.world.getEntity(worldState.activeCharacterId);
      if (current && current.archivedAt === undefined) {
        return {
          ok: false,
          code: "E_ACTIVE_CHARACTER_ALIVE",
          message: "the active character is still alive",
        };
      }
      const heir = findHeir(c.world, worldState.activeCharacterId);
      if (!heir) {
        return {
          ok: false,
          code: "E_NO_HEIR",
          message: "no living heir is available",
          details: { lineageId: current?.components[C.identity]?.lineageId },
        };
      }
      c.note("heir selected", { heirId: heir.id });
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: "modern.switch_generation.resolve",
    commandType: "modern.switch_generation",
    resolve: (c) => {
      const worldState = readWorldState(c.world);
      if (!worldState) return [];
      const heir = findHeir(c.world, worldState.activeCharacterId);
      if (!heir) return [];
      const heirIdentity = heir.components[C.identity] ?? {};
      const generation = Number(heirIdentity.generation ?? worldState.generation + 1);
      return [
        {
          kind: "modifyComponent",
          entityId: WORLD_ENTITY_ID,
          component: C.worldState,
          patch: { activeCharacterId: heir.id, generation },
          reason: "generation switch",
        },
        {
          kind: "emitEvent",
          eventType: "modern.generation_switched",
          actorId: heir.id,
          data: { generation, previousCharacterId: worldState.activeCharacterId },
          historicalSignificance: 0.6,
        },
      ];
    },
  });
}

// ---------------------------------------------------------------------------
// modern.tick_year
// ---------------------------------------------------------------------------

function registerTickYear(ctx: Parameters<OpenLifeModule["register"]>[0]): void {
  ctx.registerConstraintRule({
    id: "modern.tick_year.allowed",
    commandType: "modern.tick_year",
    evaluate: (c) =>
      readWorldState(c.world)
        ? { ok: true }
        : { ok: false, code: "E_WORLD_NOT_INITIALIZED", message: "world is not initialized" },
  });

  ctx.registerResolutionRule({
    id: "modern.tick_year.resolve",
    commandType: "modern.tick_year",
    resolve: (c) => [
      {
        kind: "emitEvent",
        eventType: "modern.year_passed",
        data: { tick: c.world.tick },
        historicalSignificance: 0,
        visibility: "public",
      },
    ],
  });

  // Ageing and mortality are a reaction to the passage of a year, so the
  // annual tick itself carries no state change.
  ctx.registerReactionRule({
    id: "modern.tick_year.ageing",
    eventType: "modern.year_passed",
    react: (c) => {
      const effects: Effect[] = [];
      for (const character of c.world.listEntities({ kind: K.character })) {
        const vitals = character.components[C.vitals] as VitalsComponent | undefined;
        const identity = character.components[C.identity];
        if (!vitals || !identity) continue;
        if (vitals.alive === false) continue;
        const bornAt = Number(identity.bornAt ?? character.createdAt);
        // The ageing pass now runs once per world year, so the age it writes
        // must be read in the world's own scale or it would jump 30x at once.
        // `modern.annual_tick` fires on the world's year boundary, so a simple
        // increment keeps age exact and avoids a second scale lookup.
        const age = Number(vitals.ageYears ?? 0) + 1;
        const lifespan = Number(vitals.lifespan ?? 80);

        effects.push({
          kind: "modifyComponent",
          entityId: character.id,
          component: C.vitals,
          patch: { ageYears: age },
          reason: "annual ageing",
        });

        const overLifespan = age >= lifespan;
        const accident = age > 5 && c.rng.chance(0.004);
        if (overLifespan || accident) {
          c.note("mortality triggered", { characterId: character.id, age, overLifespan, accident });
          effects.push({
            kind: "emitEvent",
            eventType: "modern.character_died",
            actorId: character.id,
            data: { cause: overLifespan ? "old age" : "accident", age },
            historicalSignificance: 0.7,
          });
        }
      }
      return effects;
    },
  });

  // If the active character has died, surface that as a distinct event so the
  // console and the UI can prompt for a generation switch.
  ctx.registerReactionRule({
    id: "modern.tick_year.active_death",
    eventType: "modern.character_died",
    priority: -10,
    react: (c) => {
      const worldState = readWorldState(c.world);
      if (!worldState || worldState.activeCharacterId !== c.event.actorId) return [];
      return [
        {
          kind: "emitEvent",
          eventType: "modern.active_character_died",
          actorId: c.event.actorId,
          data: { generation: worldState.generation },
          historicalSignificance: 0.1,
        },
      ];
    },
  });
}

// ---------------------------------------------------------------------------
// modern.dissolve_organization
// ---------------------------------------------------------------------------

function registerDissolveOrganization(ctx: Parameters<OpenLifeModule["register"]>[0]): void {
  ctx.registerConstraintRule({
    id: "modern.dissolve_organization.allowed",
    commandType: "modern.dissolve_organization",
    evaluate: (c) => {
      const targetId = c.command.targetId ?? asString(c.command.payload.organizationId, "");
      const entity = targetId ? c.world.getEntity(targetId) : undefined;
      if (!entity || entity.kind !== K.organization) {
        return { ok: false, code: "E_UNKNOWN_ORGANIZATION", message: `unknown organisation: ${targetId}` };
      }
      if (entity.archivedAt !== undefined) {
        return { ok: false, code: "E_ALREADY_DISSOLVED", message: "organisation already dissolved" };
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: "modern.dissolve_organization.resolve",
    commandType: "modern.dissolve_organization",
    resolve: (c) => {
      const organizationId = c.command.targetId ?? asString(c.command.payload.organizationId, "");
      return [
        {
          kind: "modifyComponent",
          entityId: organizationId,
          component: C.organization,
          patch: { dissolvedAt: c.world.tick },
          reason: "organisation dissolved",
        },
        {
          kind: "emitEvent",
          eventType: "modern.organization_dissolved",
          actorId: organizationId,
          data: { organizationId },
          historicalSignificance: 0.55,
        },
        {
          kind: "archiveEntity",
          entityId: organizationId,
          reason: "dissolved",
          announce: false,
        },
      ];
    },
  });
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

export function readWorldState(world: WorldView): ActiveWorld | undefined {
  const component = world.getComponent(WORLD_ENTITY_ID, C.worldState);
  if (!component) return undefined;
  return {
    activeCharacterId: String(component.activeCharacterId ?? ""),
    generation: Number(component.generation ?? 1),
  };
}

/**
 * Heir selection: the eldest living descendant of the previous active
 * character, searched breadth-first through `family.parent_of` so that
 * grandchildren are reachable when a child has already died.
 *
 * The `family.parent_of` relation is owned by the family pack. Reading another
 * module's relation is allowed (relations are shared world data, not private
 * module state); a future revision should expose this through a
 * `family.heir_provider` capability instead of a naming convention.
 */
export function findHeir(world: WorldView, characterId: string): EntityView | undefined {
  const visited = new Set<string>([characterId]);
  let frontier = [characterId];
  while (frontier.length > 0) {
    const living: { entity: EntityView; bornAt: number }[] = [];
    const next: string[] = [];
    for (const parentId of frontier) {
      for (const relation of childRelations(world, parentId)) {
        if (visited.has(relation.to)) continue;
        visited.add(relation.to);
        next.push(relation.to);
        const child = world.getEntity(relation.to);
        if (!child || child.archivedAt !== undefined) continue;
        living.push({
          entity: child,
          bornAt: Number(child.components[C.identity]?.bornAt ?? child.createdAt),
        });
      }
    }
    if (living.length > 0) {
      living.sort((a, b) =>
        a.bornAt !== b.bornAt ? a.bornAt - b.bornAt : a.entity.id < b.entity.id ? -1 : 1,
      );
      return (living[0] as { entity: EntityView }).entity;
    }
    frontier = next;
  }
  return undefined;
}

function childRelations(world: WorldView, characterId: string): readonly RelationView[] {
  return world.listRelations({ type: PARENT_OF, from: characterId });
}

function requireLivingCharacter(
  world: WorldView,
  command: Command,
): { ok: true } | { ok: false; outcome: ConstraintOutcome } {
  const actorId = command.actorId;
  if (!actorId) {
    return {
      ok: false,
      outcome: { ok: false, code: "E_NO_ACTOR", message: "command requires an actor" },
    };
  }
  const entity = world.getEntity(actorId);
  if (!entity || entity.kind !== K.character) {
    return {
      ok: false,
      outcome: { ok: false, code: "E_NOT_A_CHARACTER", message: `not a character: ${actorId}` },
    };
  }
  if (entity.archivedAt !== undefined) {
    return {
      ok: false,
      outcome: { ok: false, code: "E_CHARACTER_DEAD", message: "character is already dead" },
    };
  }
  return { ok: true };
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function organizationName(entity: { components: Record<string, Record<string, unknown>> }): string {
  const component = entity.components[C.organization] as OrganizationComponent | undefined;
  return component?.name ?? "unnamed";
}
