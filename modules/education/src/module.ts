/**
 * Education system pack.
 *
 * Owns schooling: enrolment, a school organisation entity that outlives the
 * student, graduation and the education level used by the career pack.
 *
 * Depends on `time.calendar` (a capability), never on the modern-world module
 * by name (§56).
 */

import type { Effect, OpenLifeModule } from "@openlife/contracts";
import {
  ModernComponents as MW,
  ModernKinds as MWK,
} from "@openlife/life-contracts/modern";
import { ageInYearsIn, ticksPerYearIn } from "@openlife/life-contracts";
import {
  EducationComponents as EC,
  EducationRelations as ER,
  EducationKinds as EK,
  educationLevelOf,
  type EducationLevel,
} from "@openlife/life-contracts/education";

export { EC, ER, EK, educationLevelOf };
export type { EducationLevel };

const OWNER = "education";
const SCHOOL_ID = "education:school:academy";
const PROGRAM_YEARS = 4;

export const educationModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "Education",
    description: "Enrolment, schooling and education level.",
    requires: ["time.calendar"],
    provides: ["education.provider"],
    expects: ["life.population"],
    capabilities: [
      "component.register",
      "relation.register",
      "command.register",
      "rule.constraint.register",
      "rule.resolution.register",
      "rule.reaction.register",
      "schedule.register",
    ],
  },

  register(ctx) {
    ctx.registerComponent({ id: EC.student, persist: true });
    ctx.registerComponent({ id: EC.level, persist: true });
    ctx.registerRelation({ id: ER.enrolledAt, persist: true });

    ctx.registerCommand({
      type: "education.enroll_school",
      params: { schoolName: "string" },
      description: "Enrol a character in a school.",
    });
    ctx.registerCommand({
      type: "education.graduate",
      description: "Internal: graduate a student when their programme ends.",
    });
    ctx.registerCommand({
      type: "education.set_level",
      description: "Internal: record an education level on a character.",
    });

    ctx.registerTask({
      type: "education.program_end",
      description: "Fires when a study programme is due to finish.",
      handler: (c) => ({
        command: {
          type: "education.graduate",
          actorId: c.payload.characterId as string,
          payload: { level: c.payload.level },
          source: "system",
        },
      }),
    });

    // --- create the school once the world exists -------------------------
    ctx.registerReactionRule({
      id: "education.world_initialized.create_school",
      kind: "reaction",
      eventType: "modern.world_initialized",
      react: () => [
        {
          kind: "spawnEntity",
          localId: "school",
          id: SCHOOL_ID,
          entityKind: EK.school,
          components: {
            [MW.organization]: {
              name: "Northport Academy",
              orgKind: "school",
              foundedAt: 0,
            },
          },
          announce: false,
        },
        {
          kind: "emitEvent",
          eventType: "education.school_founded",
          actorId: "@school",
          data: { name: "Northport Academy", schoolId: SCHOOL_ID },
          historicalSignificance: 0.45,
        },
      ],
    });

    // --- enrolment --------------------------------------------------------
    ctx.registerConstraintRule({
      id: "education.enroll_school.allowed",
      kind: "constraint",
      commandType: "education.enroll_school",
      evaluate: (c) => {
        const actorId = c.command.actorId;
        if (!actorId) return { ok: false, code: "E_NO_ACTOR", message: "enrol requires an actor" };
        const entity = c.world.getEntity(actorId);
        if (!entity || entity.kind !== MWK.character) {
          return { ok: false, code: "E_NOT_A_CHARACTER", message: `not a character: ${actorId}` };
        }
        if (entity.archivedAt !== undefined) {
          return { ok: false, code: "E_CHARACTER_DEAD", message: "character is dead" };
        }
        const status = entity.components[EC.student] as { enrolled?: boolean } | undefined;
        if (status?.enrolled === true) {
          return { ok: false, code: "E_ALREADY_ENROLLED", message: "character is already enrolled" };
        }
        const bornAt = Number(entity.components[MW.identity]?.bornAt ?? entity.createdAt);
        const age = ageInYearsIn(c.world, bornAt, c.world.tick);
        if (age < 6) {
          return {
            ok: false,
            code: "E_TOO_YOUNG_FOR_SCHOOL",
            message: `character must be at least 6 to enrol (age ${age})`,
            details: { age, minimum: 6 },
          };
        }
        c.note("enrolment allowed", { age });
        return { ok: true };
      },
    });

    ctx.registerResolutionRule({
      id: "education.enroll_school.resolve",
      kind: "resolution",
      commandType: "education.enroll_school",
      resolve: (c) => {
        const actorId = c.command.actorId as string;
        const schoolName = typeof c.command.payload.schoolName === "string"
          ? c.command.payload.schoolName
          : "Northport Academy";
        const programmeTicks = c.resolve("education.program_duration", PROGRAM_YEARS * ticksPerYearIn(c.world), [
          {
            id: "education.enroll.base_duration",
            source: OWNER,
            target: "education.program_duration",
            op: "add",
            value: 0,
            reason: "standard four-year programme",
          },
        ]);
        return [
          {
            kind: "setComponent",
            entityId: actorId,
            component: EC.student,
            value: {
              enrolled: true,
              schoolId: SCHOOL_ID,
              schoolName,
              startedAt: c.world.tick,
              finishesAt: c.world.tick + programmeTicks,
              level: "higher",
            },
            reason: "enrolled in school",
          },
          {
            kind: "addRelation",
            type: ER.enrolledAt,
            from: actorId,
            to: SCHOOL_ID,
            components: { [EC.student]: { startedAt: c.world.tick } },
            announce: false,
          },
          {
            kind: "emitEvent",
            eventType: "education.enrolled",
            actorId,
            targetId: SCHOOL_ID,
            data: { schoolName, finishesAt: c.world.tick + programmeTicks },
            historicalSignificance: 0.3,
          },
          {
            kind: "scheduleTask",
            taskType: "education.program_end",
            afterTicks: programmeTicks,
            payload: { characterId: actorId, level: "higher" },
            dedupeKey: `program:${actorId}`,
          },
        ];
      },
    });

    // --- graduation -------------------------------------------------------
    ctx.registerConstraintRule({
      id: "education.graduate.allowed",
      kind: "constraint",
      commandType: "education.graduate",
      evaluate: (c) => {
        const actorId = c.command.actorId;
        if (!actorId) return { ok: false, code: "E_NO_ACTOR", message: "graduate requires an actor" };
        const entity = c.world.getEntity(actorId);
        if (!entity) {
          return { ok: false, code: "E_UNKNOWN_ENTITY", message: `unknown character: ${actorId}` };
        }
        const status = entity.components[EC.student] as { enrolled?: boolean } | undefined;
        if (status?.enrolled !== true) {
          return { ok: false, code: "E_NOT_ENROLLED", message: "character is not enrolled" };
        }
        return { ok: true };
      },
    });

    ctx.registerResolutionRule({
      id: "education.graduate.resolve",
      kind: "resolution",
      commandType: "education.graduate",
      resolve: (c) => {
        const actorId = c.command.actorId as string;
        const level = typeof c.command.payload.level === "string"
          ? (c.command.payload.level as EducationLevel)
          : "higher";
        const effects: Effect[] = [
          {
            kind: "modifyComponent",
            entityId: actorId,
            component: EC.student,
            patch: { enrolled: false, graduatedAt: c.world.tick },
            reason: "graduated",
          },
          {
            kind: "setComponent",
            entityId: actorId,
            component: EC.level,
            value: { level, at: c.world.tick },
            reason: "education level recorded",
          },
          {
            kind: "emitEvent",
            eventType: "education.graduated",
            actorId,
            data: { level },
            historicalSignificance: 0.4,
          },
        ];
        const enrolledRelation = c.world.listRelations({ type: ER.enrolledAt, from: actorId });
        for (const relation of enrolledRelation) {
          effects.push({
            kind: "removeRelation",
            type: ER.enrolledAt,
            from: relation.from,
            to: relation.to,
            reason: "graduated",
            announce: false,
          });
        }
        return effects;
      },
    });
  },
};
