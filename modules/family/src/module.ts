/**
 * Family system pack.
 *
 * Owns relationships (friendship, marriage, parenthood), childbirth and the
 * lineage bookkeeping that makes multi-generation play possible.
 *
 * Note what this module does *not* do: it never writes to the world store
 * directly, and it never invents its own random numbers. Everything is a
 * command, an effect or a reaction.
 */

import type { Effect, OpenLifeModule } from "@openlife/contracts";
import { ageInYears, TICKS_PER_YEAR } from "@openlife/module-modern-world";
import { C as MW, K as MWK, R as MWR } from "@openlife/module-modern-world";

const OWNER = "family";

export const FC = {
  friendship: "family.friendship",
  marriage: "family.marriage",
  parent: "family.parent",
  lineage: "family.lineage_membership",
  lineageRecord: "family.lineage_record",
} as const;

/** Entity kind for a lineage. Lineages are first-class entities (§10). */
export const FK = {
  lineage: "family.lineage",
} as const;

export const FR = {
  parentOf: "family.parent_of",
  marriedTo: "family.married_to",
  friendOf: "family.friend_of",
  memberOfLineage: "family.member_of_lineage",
} as const;

const MARRIAGE_MIN_AGE = 18;
const FRIENDSHIP_MIN_AGE = 5;

export const familyModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "Family",
    description: "Friendship, marriage, childbirth and lineage.",
    requires: ["time.calendar", "life.population"],
    provides: ["family.relationship_provider", "family.heir_provider"],
    expects: ["life.population"],
    capabilities: [
      "component.register",
      "relation.register",
      "command.register",
      "rule.constraint.register",
      "rule.resolution.register",
      "rule.reaction.register",
      "projection.register",
    ],
  },

  register(ctx) {
    for (const id of [FC.friendship, FC.marriage, FC.parent, FC.lineage]) {
      ctx.registerComponent({ id, persist: true });
    }
    ctx.registerComponent({ id: FC.lineageRecord, persist: true });
    for (const id of [FR.parentOf, FR.marriedTo, FR.friendOf, FR.memberOfLineage]) {
      ctx.registerRelation({ id, persist: true });
    }

    ctx.registerCommand({
      type: "family.make_friend",
      params: { targetName: "string" },
      description: "Befriend a newly met character.",
    });
    ctx.registerCommand({
      type: "family.marry",
      params: { spouseName: "string" },
      description: "Marry a partner.",
    });
    ctx.registerCommand({
      type: "family.have_child",
      params: { givenName: "string" },
      description: "Have a child with the current spouse.",
    });
    ctx.registerCommand({
      type: "family.register_lineage_member",
      description: "Internal: record a character in the lineage chronicle.",
    });

    // --- lineage bookkeeping ---------------------------------------------
    // Every character created anywhere in the world joins its lineage. This is
    // a reaction, so the modern-world pack needs no knowledge of lineages.
    ctx.registerReactionRule({
      id: "family.character_created.join_lineage",
      kind: "reaction",
      eventType: "modern.character_created",
      react: (c) => {
        const actorId = c.event.actorId;
        if (!actorId) return [];
        const lineageId = String(c.event.data.lineageId ?? "");
        if (!lineageId) return [];
        const generation = Number(c.event.data.generation ?? 1);
        const effects: Effect[] = [];
        // A lineage is an entity, so it survives its members (§10, §39).
        if (!c.world.hasEntity(lineageId)) {
          effects.push({
            kind: "spawnEntity",
            localId: "lineage",
            id: lineageId,
            entityKind: FK.lineage,
            components: {
              [FC.lineageRecord]: { founderId: actorId, foundedAt: c.world.tick, generations: 1 },
            },
            announce: false,
          });
        }
        effects.push(
          {
            kind: "addFact",
            factType: "family.born_into_lineage",
            subject: actorId,
            data: { lineageId, generation, bornAt: c.world.tick },
            historicalSignificance: 0.5,
            visibility: "public",
          },
          {
            kind: "addRelation",
            type: FR.memberOfLineage,
            from: actorId,
            to: lineageId,
            components: { [FC.lineage]: { generation, joinedAt: c.world.tick } },
            announce: false,
          },
        );
        return effects;
      },
    });

    // --- make_friend ------------------------------------------------------
    ctx.registerConstraintRule({
      id: "family.make_friend.allowed",
      kind: "constraint",
      commandType: "family.make_friend",
      evaluate: (c) => {
        const actor = requireLivingCharacter(c.world, c.command.actorId);
        if (!actor.ok) return actor.outcome;
        const targetId = c.command.targetId;
        if (targetId) {
          const target = c.world.getEntity(targetId);
          if (!target || target.kind !== MWK.character) {
            return { ok: false, code: "E_UNKNOWN_TARGET", message: `unknown character: ${targetId}` };
          }
          if (target.archivedAt !== undefined) {
            return { ok: false, code: "E_TARGET_DEAD", message: "target is deceased" };
          }
          if (targetId === c.command.actorId) {
            return { ok: false, code: "E_SELF_TARGET", message: "cannot befriend yourself" };
          }
          const existing = c.world.listRelations({
            type: FR.friendOf,
            from: c.command.actorId,
            to: targetId,
          });
          if (existing.length > 0) {
            return { ok: false, code: "E_ALREADY_FRIENDS", message: "already friends" };
          }
        }
        return { ok: true };
      },
    });

    ctx.registerResolutionRule({
      id: "family.make_friend.resolve",
      kind: "resolution",
      commandType: "family.make_friend",
      resolve: (c) => {
        const actorId = c.command.actorId as string;
        const effects: Effect[] = [];
        let targetRef = c.command.targetId;
        if (!targetRef) {
          // Materialise a new acquaintance rather than hard-coding one.
          effects.push({
            kind: "spawnEntity",
            localId: "friend",
            entityKind: MWK.character,
            components: {
              [MW.identity]: {
                givenName: typeof c.command.payload.targetName === "string"
                  ? c.command.payload.targetName
                  : "Alex",
                familyName: "Acquaintance",
                sex: "other",
                generation: 0,
                lineageId: "npc",
                bornAt: c.world.tick,
              },
              [MW.vitals]: {
                alive: true,
                health: 1,
                ageYears: c.rng.nextInt(18, 60),
                lifespan: c.rng.nextInt(60, 96),
              },
              [MW.wealth]: { cash: c.rng.nextInt(0, 20000), debt: 0 },
              [MW.residence]: {
                cityId: String(c.world.getComponent(actorId, MW.residence)?.cityId ?? "modern:city:north"),
              },
            },
            announce: false,
          });
          targetRef = "@friend";
        }
        const closeness = c.resolve("family.friendship.closeness", 0.5, [
          {
            id: "family.friendship.base",
            source: OWNER,
            target: "family.friendship.closeness",
            op: "add",
            value: 0,
            reason: "new acquaintance baseline",
          },
        ]);
        effects.push({
          kind: "addRelation",
          type: FR.friendOf,
          from: actorId,
          to: targetRef,
          components: {
            [FC.friendship]: { closeness, trust: 0.4, since: c.world.tick },
          },
          announce: false,
        });
        effects.push({
          kind: "emitEvent",
          eventType: "family.friendship_started",
          actorId,
          targetId: targetRef,
          data: { closeness },
          historicalSignificance: 0.2,
        });
        return effects;
      },
    });

    // --- marry ------------------------------------------------------------
    ctx.registerConstraintRule({
      id: "family.marry.allowed",
      kind: "constraint",
      commandType: "family.marry",
      evaluate: (c) => {
        const actorId = c.command.actorId;
        const actor = requireLivingCharacter(c.world, actorId);
        if (!actor.ok) return actor.outcome;
        const age = characterAge(c.world, actorId as string);
        if (age < MARRIAGE_MIN_AGE) {
          return {
            ok: false,
            code: "E_TOO_YOUNG_TO_MARRY",
            message: `must be at least ${MARRIAGE_MIN_AGE} to marry (age ${age})`,
            details: { age, minimum: MARRIAGE_MIN_AGE },
          };
        }
        if (c.world.listRelations({ type: FR.marriedTo, from: actorId }).length > 0) {
          return { ok: false, code: "E_ALREADY_MARRIED", message: "character is already married" };
        }
        return { ok: true };
      },
    });

    ctx.registerResolutionRule({
      id: "family.marry.resolve",
      kind: "resolution",
      commandType: "family.marry",
      resolve: (c) => {
        const actorId = c.command.actorId as string;
        const effects: Effect[] = [];
        let spouseRef = c.command.targetId;
        if (!spouseRef) {
          effects.push({
            kind: "spawnEntity",
            localId: "spouse",
            entityKind: MWK.character,
            components: {
              [MW.identity]: {
                givenName: typeof c.command.payload.spouseName === "string"
                  ? c.command.payload.spouseName
                  : "Sam",
                familyName: "Partner",
                sex: "other",
                generation: 0,
                lineageId: "npc",
                bornAt: c.world.tick - TICKS_PER_YEAR * c.rng.nextInt(20, 35),
              },
              [MW.vitals]: {
                alive: true,
                health: 1,
                ageYears: c.rng.nextInt(20, 40),
                lifespan: c.rng.nextInt(60, 96),
              },
              [MW.wealth]: { cash: c.rng.nextInt(0, 30000), debt: 0 },
              [MW.residence]: {
                cityId: String(c.world.getComponent(actorId, MW.residence)?.cityId ?? "modern:city:north"),
              },
            },
            announce: false,
          });
          spouseRef = "@spouse";
        }
        effects.push({
          kind: "addRelation",
          type: FR.marriedTo,
          from: actorId,
          to: spouseRef,
          components: { [FC.marriage]: { since: c.world.tick, trust: 0.7 } },
          announce: false,
        });
        effects.push({
          kind: "addRelation",
          type: FR.marriedTo,
          from: spouseRef,
          to: actorId,
          components: { [FC.marriage]: { since: c.world.tick, trust: 0.7 } },
          announce: false,
        });
        effects.push({
          kind: "emitEvent",
          eventType: "family.married",
          actorId,
          targetId: spouseRef,
          data: { since: c.world.tick },
          historicalSignificance: 0.55,
        });
        return effects;
      },
    });

    // --- have_child -------------------------------------------------------
    ctx.registerConstraintRule({
      id: "family.have_child.allowed",
      kind: "constraint",
      commandType: "family.have_child",
      evaluate: (c) => {
        const actorId = c.command.actorId;
        const actor = requireLivingCharacter(c.world, actorId);
        if (!actor.ok) return actor.outcome;
        const age = characterAge(c.world, actorId as string);
        if (age < MARRIAGE_MIN_AGE) {
          return {
            ok: false,
            code: "E_TOO_YOUNG_FOR_CHILD",
            message: `must be at least ${MARRIAGE_MIN_AGE} to have a child (age ${age})`,
          };
        }
        const marriages = c.world.listRelations({ type: FR.marriedTo, from: actorId });
        if (marriages.length === 0) {
          return {
            ok: false,
            code: "E_NO_SPOUSE",
            message: "having a child requires a spouse in this world",
          };
        }
        return { ok: true };
      },
    });

    ctx.registerResolutionRule({
      id: "family.have_child.resolve",
      kind: "resolution",
      commandType: "family.have_child",
      resolve: (c) => {
        const actorId = c.command.actorId as string;
        const actorEntity = c.world.getEntity(actorId);
        const identity = actorEntity?.components[MW.identity] ?? {};
        const generation = Number(identity.generation ?? 0) + 1;
        const lineageId = String(identity.lineageId ?? "family:lineage:1");
        const residence = c.world.getComponent(actorId, MW.residence);
        const givenName = typeof c.command.payload.givenName === "string"
          ? c.command.payload.givenName
          : "Child";
        const childSex = c.rng.chance(0.5) ? "female" : "male";

        return [
          {
            kind: "spawnEntity",
            localId: "child",
            entityKind: MWK.character,
            components: {
              [MW.identity]: {
                givenName,
                familyName: String(identity.familyName ?? "Family"),
                sex: childSex,
                generation,
                lineageId,
                bornAt: c.world.tick,
              },
              [MW.vitals]: {
                alive: true,
                health: 1,
                ageYears: 0,
                lifespan:
                  typeof c.command.payload.lifespan === "number"
                    ? c.command.payload.lifespan
                    : c.rng.nextInt(60, 96),
              },
              [MW.wealth]: { cash: 0, debt: 0 },
              [MW.residence]: { cityId: String(residence?.cityId ?? "modern:city:north") },
            },
            announce: false,
          },
          {
            kind: "addRelation",
            type: FR.parentOf,
            from: actorId,
            to: "@child",
            components: { [FC.parent]: { since: c.world.tick } },
            announce: false,
          },
          {
            kind: "emitEvent",
            eventType: "family.child_born",
            actorId,
            targetId: "@child",
            data: { givenName, generation, lineageId },
            historicalSignificance: 0.6,
          },
        ];
      },
    });

    // The spouse is recorded as a parent too, so heir selection works
    // regardless of which parent the player controlled.
    ctx.registerReactionRule({
      id: "family.child_born.spouse_parent",
      kind: "reaction",
      eventType: "family.child_born",
      react: (c) => {
        const actorId = c.event.actorId;
        const childId = c.event.targetId;
        if (!actorId || !childId) return [];
        const marriages = c.world.listRelations({ type: FR.marriedTo, from: actorId });
        const spouse = marriages[0]?.to;
        if (!spouse) return [];
        if (c.world.listRelations({ type: FR.parentOf, from: spouse, to: childId }).length > 0) {
          return [];
        }
        return [
          {
            kind: "addRelation",
            type: FR.parentOf,
            from: spouse,
            to: childId,
            components: { [FC.parent]: { since: c.world.tick } },
            announce: false,
          },
        ];
      },
    });

    ctx.registerProjection({
      id: "family.lineage",
      description: "Family tree and chronicle for a lineage.",
      build: ({ world, history, params }) => {
        const lineageId = typeof params.lineageId === "string"
          ? params.lineageId
          : "family:lineage:1";
        const lineage = history.lineage(lineageId);
        const members = world
          .listEntities({ kind: MWK.character, includeArchived: true })
          .filter((entity) => {
            const identity = entity.components[MW.identity] as { lineageId?: string } | undefined;
            return identity?.lineageId === lineageId;
          })
          .map((entity) => ({
            id: entity.id,
            name: `${entity.components[MW.identity]?.givenName ?? "?"} ${
              entity.components[MW.identity]?.familyName ?? "?"
            }`,
            generation: Number(entity.components[MW.identity]?.generation ?? 0),
            alive: entity.archivedAt === undefined,
            archivedAt: entity.archivedAt ?? null,
          }));
        return {
          lineageId,
          members,
          chronicle: lineage?.records ?? [],
        };
      },
    });
  },
};

function requireLivingCharacter(
  world: import("@openlife/contracts").WorldView,
  actorId: string | undefined,
): { ok: true } | { ok: false; outcome: import("@openlife/contracts").ConstraintOutcome } {
  if (!actorId) {
    return { ok: false, outcome: { ok: false, code: "E_NO_ACTOR", message: "command requires an actor" } };
  }
  const entity = world.getEntity(actorId);
  if (!entity || entity.kind !== MWK.character) {
    return {
      ok: false,
      outcome: { ok: false, code: "E_NOT_A_CHARACTER", message: `not a character: ${actorId}` },
    };
  }
  if (entity.archivedAt !== undefined) {
    return {
      ok: false,
      outcome: { ok: false, code: "E_CHARACTER_DEAD", message: "character is dead" },
    };
  }
  return { ok: true };
}

function characterAge(world: import("@openlife/contracts").WorldView, actorId: string): number {
  const entity = world.getEntity(actorId);
  if (!entity) return 0;
  const bornAt = Number(entity.components[MW.identity]?.bornAt ?? entity.createdAt);
  return ageInYears(bornAt, world.tick);
}

export { MWR };
