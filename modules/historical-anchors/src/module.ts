/**
 * Historical person anchors.
 *
 * Anchors guarantee that an authored historical person enters the world around
 * a known/approximate date. They do NOT grant fame, ideas, achievements or
 * historical importance. Once born, the person is a normal modern.character
 * and lives under the same simulation rules as everyone else.
 */

import type { Effect, OpenLifeModule } from "@openlife/contracts";
import {
  ModernComponents as MW,
  ModernKinds as MWK,
  ModernRelations as MWR,
  tickOfYear,
  formatYear,
} from "@openlife/life-contracts/modern";

const OWNER = "historical-anchors";

export const HistoricalAnchorComponents = {
  identity: "historical-anchors.identity",
} as const;

export interface HistoricalPersonAnchor {
  id: string;
  displayName: string;
  givenName: string;
  familyName: string;
  sex: "female" | "male" | "other";
  birthYear: number;
  lifespan: number;
  datePrecision: "year" | "approximate";
  confidence: "high" | "medium" | "low";
  regionId: string;
  regionLabel: string;
  contextNote: string;
}

export const ANCIENT_PERSON_ANCHORS: readonly HistoricalPersonAnchor[] = [
  {
    id: "confucius",
    displayName: "孔丘",
    givenName: "丘",
    familyName: "孔",
    sex: "male",
    birthYear: -550,
    lifespan: 72,
    datePrecision: "year",
    confidence: "high",
    regionId: "historical:region:lu",
    regionLabel: "鲁地",
    contextNote: "春秋后期的思想人物；锚点只固定其进入世界，不预写其思想与后世地位。",
  },
  {
    id: "mozi",
    displayName: "墨翟",
    givenName: "翟",
    familyName: "墨",
    sex: "male",
    birthYear: -469,
    lifespan: 79,
    datePrecision: "approximate",
    confidence: "medium",
    regionId: "historical:region:song-lu",
    regionLabel: "宋鲁一带",
    contextNote: "生卒年代存在不确定性，因此采用近似出生锚点；实际成就仍由世界运行形成。",
  },
] as const;

export const historicalAnchorsModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "content-pack",
    name: "Historical Person Anchors",
    description: "Optional historical-mode person anchors without preassigned fame.",
    requires: ["time.calendar", "life.population"],
    provides: ["history.person-anchors"],
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
    ctx.registerComponent({
      id: HistoricalAnchorComponents.identity,
      persist: true,
      description: "Authored historical identity metadata; never a fame score.",
    });

    ctx.registerCommand({
      type: "historical-anchors.birth_person",
      description: "Materialize one authored historical person as a normal character.",
    });

    ctx.registerTask({
      type: "historical-anchors.birth",
      description: "Birth one historical person at the authored world time.",
      handler: (c) => {
        const anchorId = String(c.payload.anchorId ?? "");
        if (!anchorId) return undefined;
        return {
          command: {
            type: "historical-anchors.birth_person",
            payload: { anchorId },
            source: "system",
          },
        };
      },
    });

    ctx.registerConstraintRule({
      id: "historical-anchors.birth_person.allowed",
      commandType: "historical-anchors.birth_person",
      evaluate: (c) => {
        const anchorId = String(c.command.payload.anchorId ?? "");
        const anchor = anchorById(anchorId);
        if (!anchor) {
          return { ok: false, code: "E_UNKNOWN_HISTORICAL_ANCHOR", message: "unknown historical person anchor" };
        }
        const entityId = historicalPersonId(anchor.id);
        if (c.world.hasEntity(entityId)) {
          return { ok: false, code: "E_HISTORICAL_PERSON_EXISTS", message: "historical person already exists" };
        }
        return { ok: true };
      },
    });

    ctx.registerResolutionRule({
      id: "historical-anchors.birth_person.resolve",
      commandType: "historical-anchors.birth_person",
      resolve: (c) => {
        const anchor = anchorById(String(c.command.payload.anchorId))!;
        const entityId = historicalPersonId(anchor.id);
        const effects: Effect[] = [];

        if (!c.world.hasEntity(anchor.regionId)) {
          effects.push({
            kind: "spawnEntity",
            localId: `region-${anchor.id}`,
            id: anchor.regionId,
            entityKind: MWK.city,
            components: {
              [MW.identity]: { name: anchor.regionLabel },
            },
            announce: false,
          });
        }

        effects.push(
          {
            kind: "spawnEntity",
            localId: `person-${anchor.id}`,
            id: entityId,
            entityKind: MWK.character,
            components: {
              [MW.identity]: {
                givenName: anchor.givenName,
                familyName: anchor.familyName,
                sex: anchor.sex,
                generation: 1,
                lineageId: `historical:lineage:${anchor.id}`,
                bornAt: c.world.tick,
              },
              [MW.vitals]: {
                alive: true,
                health: 1,
                ageYears: 0,
                lifespan: anchor.lifespan,
              },
              [MW.wealth]: { cash: 0, debt: 0 },
              [MW.residence]: { cityId: anchor.regionId },
              [HistoricalAnchorComponents.identity]: {
                anchorId: anchor.id,
                displayName: anchor.displayName,
                birthYear: anchor.birthYear,
                datePrecision: anchor.datePrecision,
                confidence: anchor.confidence,
                regionLabel: anchor.regionLabel,
                contextNote: anchor.contextNote,
              },
            },
            announce: false,
          },
          {
            kind: "addRelation",
            type: MWR.livesIn,
            from: entityId,
            to: anchor.regionId,
            announce: false,
          },
          {
            kind: "emitEvent",
            eventType: "modern.character_created",
            actorId: entityId,
            data: {
              givenName: anchor.givenName,
              familyName: anchor.familyName,
              generation: 1,
              lineageId: `historical:lineage:${anchor.id}`,
              cityId: anchor.regionId,
              lifespan: anchor.lifespan,
              historicalAnchorId: anchor.id,
            },
            historicalSignificance: 0.35,
          },
          {
            kind: "emitEvent",
            eventType: "historical-anchors.person_entered",
            actorId: entityId,
            data: {
              anchorId: anchor.id,
              displayName: anchor.displayName,
              birthYear: anchor.birthYear,
              displayBirth: formatYear(anchor.birthYear),
              datePrecision: anchor.datePrecision,
              confidence: anchor.confidence,
              regionLabel: anchor.regionLabel,
            },
            historicalSignificance: 0.55,
            visibility: "public",
          },
        );

        return effects;
      },
    });

    ctx.registerReactionRule({
      id: "historical-anchors.world_initialized.schedule",
      eventType: "modern.world_initialized",
      react: () => ANCIENT_PERSON_ANCHORS.map((anchor) => ({
        kind: "scheduleTask" as const,
        taskType: "historical-anchors.birth",
        afterTicks: tickOfYear(anchor.birthYear),
        payload: { anchorId: anchor.id },
        dedupeKey: `birth:${anchor.id}`,
      })),
    });

    ctx.registerProjection({
      id: "historical-anchors.public",
      description: "Historical people who have entered the world; appearance does not imply fame.",
      build: ({ world }) => ({
        people: ANCIENT_PERSON_ANCHORS.flatMap((anchor) => {
          const entity = world.getEntity(historicalPersonId(anchor.id));
          if (!entity) return [];
          return [{
            id: entity.id,
            anchorId: anchor.id,
            name: anchor.displayName,
            alive: entity.archivedAt === undefined,
            birth: formatYear(anchor.birthYear),
            datePrecision: anchor.datePrecision,
            confidence: anchor.confidence,
            region: anchor.regionLabel,
            note: anchor.contextNote,
          }];
        }),
      }),
    });
  },
};

function anchorById(id: string): HistoricalPersonAnchor | undefined {
  return ANCIENT_PERSON_ANCHORS.find((anchor) => anchor.id === id);
}

function historicalPersonId(anchorId: string): string {
  return `historical:person:${anchorId}`;
}
