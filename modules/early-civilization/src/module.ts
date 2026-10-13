/**
 * Early Civilization content/system pack.
 *
 * First playable historical layer around the world anchor (2070 BCE). It
 * deliberately avoids modern schools, salaries, companies and market language.
 * The pack reuses population/time contracts but owns its learning, social-role
 * and legacy vocabulary.
 */

import type { Effect, OpenLifeModule, WorldView } from "@openlife/contracts";
import {
  CITY_NORTH,
  CITY_SOUTH,
  ModernComponents as MW,
  ModernKinds as MWK,
  WORLD_ENTITY_ID,
} from "@openlife/life-contracts/modern";
import { ageInYearsIn, ticksPerYearIn } from "@openlife/life-contracts";

const OWNER = "early-civilization";

export const EarlyComponents = {
  era: "early-civilization.era",
  learning: "early-civilization.learning",
  role: "early-civilization.role",
  legacy: "early-civilization.legacy",
} as const;

const ROLES = [
  { id: "cultivator", title: "耕作者" },
  { id: "craftsperson", title: "手工业者" },
  { id: "forager", title: "采集与狩猎者" },
  { id: "settlement_service", title: "聚落役事承担者" },
] as const;

export const earlyCivilizationModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "content-pack",
    name: "Early Civilization",
    description: "Settlement life, oral learning, practical roles and durable craft legacies.",
    requires: ["time.calendar", "life.population"],
    provides: ["era.early-civilization", "learning.oral-tradition", "work.settlement-role"],
    capabilities: [
      "component.register",
      "command.register",
      "rule.constraint.register",
      "rule.resolution.register",
      "rule.reaction.register",
      "schedule.register",
      "projection.register",
    ],
  },

  register(ctx) {
    for (const id of Object.values(EarlyComponents)) {
      ctx.registerComponent({ id, persist: true });
    }

    ctx.registerCommand({
      type: "early-civilization.begin_learning",
      description: "Begin learning through family, observation and practical imitation.",
    });
    ctx.registerCommand({
      type: "early-civilization.take_role",
      description: "Take on a practical role in the settlement.",
    });
    ctx.registerCommand({
      type: "early-civilization.leave_legacy",
      description: "Turn accumulated practical skill into something remembered.",
    });

    ctx.registerTask({
      type: "early-civilization.life_year",
      description: "Inactive young people make age-appropriate learning and role choices.",
      handler: (c) => {
        const characterId = String(c.payload.characterId ?? "");
        const character = characterId ? c.world.getEntity(characterId) : undefined;
        if (!character || character.kind !== MWK.character || character.archivedAt !== undefined) {
          return undefined;
        }
        const state = c.world.getComponent(WORLD_ENTITY_ID, MW.worldState) ?? {};
        if (state.activeCharacterId === characterId) return undefined;

        const bornAt = Number(character.components[MW.identity]?.bornAt ?? character.createdAt);
        const age = ageInYearsIn(c.world, bornAt, c.world.tick);
        if (age >= 6 && !character.components[EarlyComponents.learning]) {
          return {
            command: {
              type: "early-civilization.begin_learning",
              actorId: characterId,
              source: "autosim",
            },
          };
        }
        if (age >= 14 && !character.components[EarlyComponents.role]) {
          return {
            command: {
              type: "early-civilization.take_role",
              actorId: characterId,
              source: "autosim",
            },
          };
        }
        return undefined;
      },
    });

    ctx.registerReactionRule({
      id: "early-civilization.world_initialized.seed",
      eventType: "modern.world_initialized",
      react: () => [
        {
          kind: "setComponent",
          entityId: WORLD_ENTITY_ID,
          component: EarlyComponents.era,
          value: {
            id: "xia-foundation",
            label: "夏初",
            settlementPattern: "river-valley communities",
          },
          reason: "seed the first playable historical content layer",
        },
        {
          kind: "modifyComponent",
          entityId: CITY_NORTH,
          component: MW.identity,
          patch: { name: "北岸聚落" },
          reason: "early-era presentation replaces modern city naming",
        },
        {
          kind: "modifyComponent",
          entityId: CITY_SOUTH,
          component: MW.identity,
          patch: { name: "南丘聚落" },
          reason: "early-era presentation replaces modern city naming",
        },
        {
          kind: "emitEvent",
          eventType: "early-civilization.era_begun",
          data: { era: "xia-foundation", label: "夏初" },
          historicalSignificance: 0.75,
          visibility: "public",
        },
      ],
    });

    ctx.registerReactionRule({
      id: "early-civilization.historical_era.sync",
      eventType: "historical-era.changed",
      react: (c) => [{
        kind: "modifyComponent",
        entityId: WORLD_ENTITY_ID,
        component: EarlyComponents.era,
        patch: {
          id: String(c.event.data.toId ?? "unknown"),
          label: String(c.event.data.toLabel ?? "时代变迁"),
        },
        reason: "sync early-civilization presentation with the active historical era",
      }],
    });

    const scheduleLife = (
      characterId: string | undefined,
      tick: number,
      year: number,
    ): Effect[] => characterId ? [{
      kind: "scheduleTask",
      taskType: "early-civilization.life_year",
      afterTicks: year,
      everyTicks: year,
      untilTick: tick + 100 * year,
      payload: { characterId },
      dedupeKey: `life:${characterId}`,
    }] : [];

    ctx.registerReactionRule({
      id: "early-civilization.character_created.schedule",
      eventType: "modern.character_created",
      react: (c) => scheduleLife(c.event.actorId, c.world.tick, ticksPerYearIn(c.world)),
    });
    ctx.registerReactionRule({
      id: "early-civilization.child_born.schedule",
      eventType: "family.child_born",
      react: (c) => scheduleLife(c.event.targetId, c.world.tick, ticksPerYearIn(c.world)),
    });

    ctx.registerConstraintRule({
      id: "early-civilization.begin_learning.allowed",
      commandType: "early-civilization.begin_learning",
      evaluate: (c) => {
        const living = requireLivingCharacter(c.world, c.command.actorId);
        if (!living.ok) return living;
        const age = characterAge(c.world, c.command.actorId as string);
        if (age < 6) {
          return { ok: false, code: "E_TOO_YOUNG", message: "practical learning begins around age 6" };
        }
        if (c.world.getComponent(c.command.actorId as string, EarlyComponents.learning)) {
          return { ok: false, code: "E_ALREADY_LEARNING", message: "learning path already established" };
        }
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: "early-civilization.begin_learning.resolve",
      commandType: "early-civilization.begin_learning",
      resolve: (c) => {
        const actorId = c.command.actorId as string;
        return [
          {
            kind: "setComponent",
            entityId: actorId,
            component: EarlyComponents.learning,
            value: { path: "口传、观察与技艺模仿", since: c.world.tick },
            reason: "character began practical learning",
          },
          {
            kind: "emitEvent",
            eventType: "early-civilization.learning_begun",
            actorId,
            data: { path: "口传、观察与技艺模仿" },
            historicalSignificance: 0.25,
          },
        ];
      },
    });

    ctx.registerConstraintRule({
      id: "early-civilization.take_role.allowed",
      commandType: "early-civilization.take_role",
      evaluate: (c) => {
        const living = requireLivingCharacter(c.world, c.command.actorId);
        if (!living.ok) return living;
        const age = characterAge(c.world, c.command.actorId as string);
        if (age < 14) {
          return { ok: false, code: "E_TOO_YOUNG", message: "settlement roles begin in adolescence" };
        }
        if (c.world.getComponent(c.command.actorId as string, EarlyComponents.role)) {
          return { ok: false, code: "E_ALREADY_HAS_ROLE", message: "character already has a settlement role" };
        }
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: "early-civilization.take_role.resolve",
      commandType: "early-civilization.take_role",
      resolve: (c) => {
        const actorId = c.command.actorId as string;
        const requested = typeof c.command.payload.role === "string"
          ? ROLES.find((role) => role.id === c.command.payload.role)
          : undefined;
        const role = requested ?? c.rng.pick(ROLES);
        return [
          {
            kind: "setComponent",
            entityId: actorId,
            component: EarlyComponents.role,
            value: { roleId: role.id, title: role.title, since: c.world.tick },
            reason: "character assumed a settlement role",
          },
          {
            kind: "emitEvent",
            eventType: "early-civilization.role_assumed",
            actorId,
            data: { roleId: role.id, title: role.title },
            historicalSignificance: 0.4,
          },
        ];
      },
    });

    ctx.registerConstraintRule({
      id: "early-civilization.leave_legacy.allowed",
      commandType: "early-civilization.leave_legacy",
      evaluate: (c) => {
        const living = requireLivingCharacter(c.world, c.command.actorId);
        if (!living.ok) return living;
        const actorId = c.command.actorId as string;
        if (!c.world.getComponent(actorId, EarlyComponents.role)) {
          return { ok: false, code: "E_NO_ROLE", message: "a lasting contribution grows from practiced work" };
        }
        if (c.world.getComponent(actorId, EarlyComponents.legacy)) {
          return { ok: false, code: "E_LEGACY_EXISTS", message: "this life already left a remembered craft legacy" };
        }
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: "early-civilization.leave_legacy.resolve",
      commandType: "early-civilization.leave_legacy",
      resolve: (c) => {
        const actorId = c.command.actorId as string;
        const role = c.world.getComponent(actorId, EarlyComponents.role) ?? {};
        const title = String(role.title ?? "一门手艺");
        const roleId = String(role.roleId ?? "craft");
        return [
          {
            kind: "setComponent",
            entityId: actorId,
            component: EarlyComponents.legacy,
            value: { title, at: c.world.tick },
            reason: "a practiced contribution became part of settlement memory",
          },
          {
            kind: "emitEvent",
            eventType: "early-civilization.legacy_left",
            actorId,
            data: { title, roleId },
            historicalSignificance: 0.7,
            visibility: "public",
          },
          {
            kind: "emitEvent",
            eventType: "historical-memory.legacy_offered",
            actorId,
            data: {
              title: `${title}的经验`,
              category: "craft-legacy",
              contentKey: `early-civilization:${roleId}:legacy`,
              medium: roleId === "craftsperson" ? "clay" : "oral",
              markCreator: c.rng.chance(roleId === "craftsperson" ? 0.7 : 0.3),
              preservationIntervalTicks: 40 * ticksPerYearIn(c.world),
            },
            historicalSignificance: 0,
            visibility: "public",
          },
        ];
      },
    });

    ctx.registerProjection({
      id: "early-civilization.overview",
      description: "Visible early-era culture and pulse.",
      build: ({ world }) => {
        const era = world.getComponent(WORLD_ENTITY_ID, EarlyComponents.era) ?? {};
        return {
          eraId: String(era.id ?? "xia-foundation"),
          eraLabel: String(era.label ?? "夏初"),
          pulseLabel: "聚落缓慢生长",
          pulseNote: "农事、手艺、亲族与口传经验维系着共同体的日常。",
        };
      },
    });
  },
};

function requireLivingCharacter(
  world: WorldView,
  actorId: string | undefined,
): { ok: true } | { ok: false; code: string; message: string } {
  if (!actorId) return { ok: false, code: "E_NO_ACTOR", message: "character required" };
  const entity = world.getEntity(actorId);
  if (!entity || entity.kind !== MWK.character || entity.archivedAt !== undefined) {
    return { ok: false, code: "E_NOT_LIVING_CHARACTER", message: "actor is not a living character" };
  }
  return { ok: true };
}

function characterAge(world: WorldView, actorId: string): number {
  const entity = world.getEntity(actorId);
  if (!entity) return 0;
  return ageInYearsIn(
    world,
    Number(entity.components[MW.identity]?.bornAt ?? entity.createdAt),
    world.tick,
  );
}
