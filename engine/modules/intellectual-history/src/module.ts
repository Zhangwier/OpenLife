/**
 * Intellectual History system pack.
 *
 * Ideas, followers, schools and institutional influence are normal module-owned
 * entities/relations. The module never assigns a fixed "famous" flag and never
 * reads hidden historical truth. When Historical Memory is installed, semantic
 * events turn ideas and transmissions into lossy material/oral evidence.
 */

import type { Effect, OpenLifeModule, WorldView } from "@openlife/contracts";

const OWNER = "intellectual-history";

export const IntellectualComponents = {
  idea: "intellectual-history.idea",
  school: "intellectual-history.school",
} as const;

export const IntellectualKinds = {
  idea: "intellectual-history.idea",
  school: "intellectual-history.school",
} as const;

export const IntellectualRelations = {
  proposedBy: "intellectual-history.proposed_by",
  embraces: "intellectual-history.embraces",
  derivedFrom: "intellectual-history.derived_from",
  centersOn: "intellectual-history.centers_on",
  memberOf: "intellectual-history.member_of",
  influences: "intellectual-history.influences",
  documentedBy: "intellectual-history.documented_by",
} as const;

const COMMANDS = [
  ["intellectual-history.propose_idea", "Formulate a new idea or doctrine."],
  ["intellectual-history.adopt_idea", "Adopt an existing idea."],
  ["intellectual-history.teach_idea", "Transmit an idea to another person."],
  ["intellectual-history.form_school", "Turn a shared idea into an organised intellectual tradition."],
  ["intellectual-history.join_school", "Join an existing intellectual school."],
  ["intellectual-history.branch_idea", "Create a derived interpretation from an existing idea."],
  ["intellectual-history.apply_idea", "Let an idea influence a community or institution."],
] as const;

export const intellectualHistoryModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "Intellectual History",
    description: "Ideas, transmission, schools, schisms and social influence.",
    provides: ["culture.intellectual-tradition"],
    expects: ["history.material-evidence"],
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
    for (const id of Object.values(IntellectualComponents)) {
      ctx.registerComponent({ id, persist: true });
    }

    ctx.registerRelation({
      id: IntellectualRelations.proposedBy,
      allowedFrom: [IntellectualKinds.idea],
      persist: true,
    });
    ctx.registerRelation({
      id: IntellectualRelations.embraces,
      allowedTo: [IntellectualKinds.idea],
      persist: true,
    });
    ctx.registerRelation({
      id: IntellectualRelations.derivedFrom,
      allowedFrom: [IntellectualKinds.idea],
      allowedTo: [IntellectualKinds.idea],
      persist: true,
    });
    ctx.registerRelation({
      id: IntellectualRelations.centersOn,
      allowedFrom: [IntellectualKinds.school],
      allowedTo: [IntellectualKinds.idea],
      persist: true,
    });
    ctx.registerRelation({
      id: IntellectualRelations.memberOf,
      allowedTo: [IntellectualKinds.school],
      persist: true,
    });
    ctx.registerRelation({
      id: IntellectualRelations.influences,
      allowedFrom: [IntellectualKinds.idea],
      persist: true,
    });
    ctx.registerRelation({
      id: IntellectualRelations.documentedBy,
      allowedFrom: [IntellectualKinds.idea],
      allowedTo: ["historical-memory.work"],
      persist: true,
    });

    for (const [type, description] of COMMANDS) {
      ctx.registerCommand({ type, description });
    }

    registerProposeIdea(ctx);
    registerAdoptIdea(ctx);
    registerTeachIdea(ctx);
    registerFormSchool(ctx);
    registerJoinSchool(ctx);
    registerBranchIdea(ctx);
    registerApplyIdea(ctx);

    ctx.registerReactionRule({
      id: "intellectual-history.historical_work.link",
      eventType: "historical-memory.work_created",
      react: (c) => {
        const sourceEntityId = String(c.event.data.sourceEntityId ?? "");
        const workId = c.event.targetId;
        if (!sourceEntityId || !workId) return [];
        const source = c.world.getEntity(sourceEntityId);
        const work = c.world.getEntity(workId);
        if (
          !source
          || source.kind !== IntellectualKinds.idea
          || !work
          || work.kind !== "historical-memory.work"
        ) {
          return [];
        }
        if (c.world.listRelations({
          type: IntellectualRelations.documentedBy,
          from: sourceEntityId,
          to: workId,
        }).length > 0) {
          return [];
        }
        return [{
          kind: "addRelation",
          type: IntellectualRelations.documentedBy,
          from: sourceEntityId,
          to: workId,
          announce: false,
        }];
      },
    });

    ctx.registerProjection({
      id: "intellectual-history.idea",
      description: "Public reach of one idea without exposing hidden historical authorship.",
      build: ({ world, params }) => ideaProjection(world, String(params.ideaId ?? "")),
    });

    ctx.registerProjection({
      id: "intellectual-history.overview",
      description: "Public intellectual traditions currently present in the world.",
      build: ({ world }) => ({
        traditions: world
          .listEntities({ kind: IntellectualKinds.idea })
          .map((idea) => ideaProjection(world, idea.id))
          .filter((idea) => idea.exists === true)
          .sort((a, b) => Number(b.reach ?? 0) - Number(a.reach ?? 0)),
        schoolCount: world.countEntities(IntellectualKinds.school),
      }),
    });
  },
};

type Registration = Parameters<OpenLifeModule["register"]>[0];

function registerProposeIdea(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: "intellectual-history.propose_idea.allowed",
    commandType: "intellectual-history.propose_idea",
    evaluate: (c) => {
      const actorId = c.command.actorId;
      if (!actorId) return { ok: false, code: "E_NO_THINKER", message: "thinker required" };
      const actor = c.world.getEntity(actorId);
      if (!actor || actor.archivedAt !== undefined) {
        return { ok: false, code: "E_THINKER_UNAVAILABLE", message: "thinker must exist" };
      }
      const title = String(c.command.payload.title ?? "").trim();
      const thesis = String(c.command.payload.thesis ?? "").trim();
      if (!title || !thesis) {
        return { ok: false, code: "E_INCOMPLETE_IDEA", message: "idea requires a title and thesis" };
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: "intellectual-history.propose_idea.resolve",
    commandType: "intellectual-history.propose_idea",
    resolve: (c): Effect[] => {
      const actorId = c.command.actorId as string;
      const title = String(c.command.payload.title);
      const thesis = String(c.command.payload.thesis);
      const principles = textArray(c.command.payload.principles, thesis);
      const medium = String(c.command.payload.medium ?? "oral");
      const markCreator = typeof c.command.payload.markCreator === "boolean"
        ? c.command.payload.markCreator
        : c.rng.chance(medium === "oral" ? 0.45 : 0.8);
      const preservationIntervalTicks = positiveInt(c.command.payload.preservationIntervalTicks);
      return [
        {
          kind: "spawnEntity",
          localId: "idea",
          entityKind: IntellectualKinds.idea,
          components: {
            [IntellectualComponents.idea]: {
              title,
              thesis,
              principles,
              formedAt: c.world.tick,
              status: "living",
            },
          },
          announce: false,
        },
        {
          kind: "addRelation",
          type: IntellectualRelations.proposedBy,
          from: "@idea",
          to: actorId,
          announce: false,
        },
        {
          kind: "addRelation",
          type: IntellectualRelations.embraces,
          from: actorId,
          to: "@idea",
          components: { [IntellectualRelations.embraces]: {
            conviction: 1,
            adoptedAt: c.world.tick,
            source: "founder",
          } },
          announce: false,
        },
        {
          kind: "emitEvent",
          eventType: "intellectual-history.idea_proposed",
          actorId,
          targetId: "@idea",
          data: { title, thesis },
          historicalSignificance: 0.55,
          visibility: "public",
        },
        {
          kind: "emitEvent",
          eventType: "historical-memory.legacy_offered",
          actorId,
          targetId: "@idea",
          data: {
            title,
            category: "thought",
            contentKey: `thought:${title}`,
            medium,
            markCreator,
            segments: principles,
            preservationIntervalTicks,
          },
          historicalSignificance: 0,
          visibility: "public",
        },
      ];
    },
  });
}

function registerAdoptIdea(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: "intellectual-history.adopt_idea.allowed",
    commandType: "intellectual-history.adopt_idea",
    evaluate: (c) => {
      const actorId = c.command.actorId;
      const ideaId = c.command.targetId;
      if (!actorId || !c.world.getEntity(actorId)) {
        return { ok: false, code: "E_NO_ADHERENT", message: "adherent required" };
      }
      if (!ideaId || c.world.getEntity(ideaId)?.kind !== IntellectualKinds.idea) {
        return { ok: false, code: "E_UNKNOWN_IDEA", message: "known idea required" };
      }
      if (hasRelation(c.world, IntellectualRelations.embraces, actorId, ideaId)) {
        return { ok: false, code: "E_ALREADY_ADOPTED", message: "character already embraces this idea" };
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: "intellectual-history.adopt_idea.resolve",
    commandType: "intellectual-history.adopt_idea",
    resolve: (c) => [{
      kind: "addRelation",
      type: IntellectualRelations.embraces,
      from: c.command.actorId as string,
      to: c.command.targetId as string,
      components: { [IntellectualRelations.embraces]: {
        conviction: clamp01(Number(c.command.payload.conviction ?? 0.65)),
        adoptedAt: c.world.tick,
        source: String(c.command.payload.source ?? "encounter"),
      } },
      announce: false,
    }, {
      kind: "emitEvent",
      eventType: "intellectual-history.idea_adopted",
      actorId: c.command.actorId,
      targetId: c.command.targetId,
      data: {},
      historicalSignificance: 0.15,
    }],
  });
}

function registerTeachIdea(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: "intellectual-history.teach_idea.allowed",
    commandType: "intellectual-history.teach_idea",
    evaluate: (c) => {
      const teacherId = c.command.actorId;
      const studentId = c.command.targetId;
      const ideaId = String(c.command.payload.ideaId ?? "");
      if (!teacherId || !studentId || !c.world.getEntity(teacherId) || !c.world.getEntity(studentId)) {
        return { ok: false, code: "E_BAD_TRANSMISSION", message: "teacher and student must exist" };
      }
      if (c.world.getEntity(ideaId)?.kind !== IntellectualKinds.idea) {
        return { ok: false, code: "E_UNKNOWN_IDEA", message: "known idea required" };
      }
      if (!hasRelation(c.world, IntellectualRelations.embraces, teacherId, ideaId)) {
        return { ok: false, code: "E_TEACHER_DOES_NOT_HOLD_IDEA", message: "teacher does not embrace this idea" };
      }
      if (hasRelation(c.world, IntellectualRelations.embraces, studentId, ideaId)) {
        return { ok: false, code: "E_STUDENT_ALREADY_ADOPTED", message: "student already embraces this idea" };
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: "intellectual-history.teach_idea.resolve",
    commandType: "intellectual-history.teach_idea",
    resolve: (c): Effect[] => {
      const teacherId = c.command.actorId as string;
      const studentId = c.command.targetId as string;
      const ideaId = String(c.command.payload.ideaId);
      const medium = String(c.command.payload.medium ?? "oral");
      const fidelity = clamp01(Number(c.command.payload.fidelity ?? 0.82));
      const preserveAttribution = typeof c.command.payload.preserveAttribution === "boolean"
        ? c.command.payload.preserveAttribution
        : c.rng.chance(medium === "oral" ? 0.62 : 0.9);
      return [
        {
          kind: "addRelation",
          type: IntellectualRelations.embraces,
          from: studentId,
          to: ideaId,
          components: { [IntellectualRelations.embraces]: {
            conviction: clamp01(Number(c.command.payload.conviction ?? 0.6)),
            adoptedAt: c.world.tick,
            source: teacherId,
          } },
          announce: false,
        },
        {
          kind: "emitEvent",
          eventType: "intellectual-history.idea_transmitted",
          actorId: teacherId,
          targetId: studentId,
          data: {
            ideaId,
            title: String(c.world.getComponent(ideaId, IntellectualComponents.idea)?.title ?? "一种思想"),
            fidelity,
          },
          historicalSignificance: 0.38,
        },
        {
          kind: "emitEvent",
          eventType: "historical-memory.transmission_offered",
          actorId: studentId,
          targetId: ideaId,
          data: {
            medium,
            fidelity,
            preserveAttribution,
            preservationIntervalTicks: positiveInt(c.command.payload.preservationIntervalTicks),
          },
          historicalSignificance: 0,
        },
      ];
    },
  });
}

function registerFormSchool(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: "intellectual-history.form_school.allowed",
    commandType: "intellectual-history.form_school",
    evaluate: (c) => {
      const founderId = c.command.actorId;
      const ideaId = String(c.command.payload.ideaId ?? "");
      if (!founderId || !c.world.getEntity(founderId)) {
        return { ok: false, code: "E_NO_FOUNDER", message: "school founder required" };
      }
      if (c.world.getEntity(ideaId)?.kind !== IntellectualKinds.idea) {
        return { ok: false, code: "E_UNKNOWN_IDEA", message: "known idea required" };
      }
      if (!hasRelation(c.world, IntellectualRelations.embraces, founderId, ideaId)) {
        return { ok: false, code: "E_FOUNDER_DOES_NOT_HOLD_IDEA", message: "founder must embrace the idea" };
      }
      const adherents = c.world.listRelations({ type: IntellectualRelations.embraces, to: ideaId });
      if (adherents.length < 2) {
        return { ok: false, code: "E_TOO_FEW_ADHERENTS", message: "a school needs at least two adherents" };
      }
      const existingSchool = c.world
        .listRelations({ type: IntellectualRelations.centersOn, to: ideaId })
        .some((relation) => c.world.getEntity(relation.from)?.archivedAt === undefined);
      if (existingSchool) {
        return { ok: false, code: "E_SCHOOL_EXISTS", message: "this idea already has an active school" };
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: "intellectual-history.form_school.resolve",
    commandType: "intellectual-history.form_school",
    resolve: (c) => {
      const founderId = c.command.actorId as string;
      const ideaId = String(c.command.payload.ideaId);
      const idea = c.world.getComponent(ideaId, IntellectualComponents.idea) ?? {};
      const name = String(c.command.payload.name ?? `${String(idea.title ?? "思想")}之学`);
      const adherents = c.world.listRelations({ type: IntellectualRelations.embraces, to: ideaId });
      const effects: Effect[] = [
        {
          kind: "spawnEntity",
          localId: "school",
          entityKind: IntellectualKinds.school,
          components: {
            [IntellectualComponents.school]: {
              name,
              foundedAt: c.world.tick,
              active: true,
            },
          },
          announce: false,
        },
        {
          kind: "addRelation",
          type: IntellectualRelations.centersOn,
          from: "@school",
          to: ideaId,
          announce: false,
        },
      ];

      for (const adherent of adherents) {
        effects.push({
          kind: "addRelation",
          type: IntellectualRelations.memberOf,
          from: adherent.from,
          to: "@school",
          components: { [IntellectualRelations.memberOf]: {
            joinedAt: c.world.tick,
            founder: adherent.from === founderId,
          } },
          announce: false,
        });
      }

      effects.push({
        kind: "emitEvent",
        eventType: "intellectual-history.school_founded",
        actorId: founderId,
        targetId: "@school",
        data: { name, ideaId, memberCount: adherents.length },
        historicalSignificance: 0.65,
        visibility: "public",
      });
      return effects;
    },
  });
}

function registerJoinSchool(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: "intellectual-history.join_school.allowed",
    commandType: "intellectual-history.join_school",
    evaluate: (c) => {
      const actorId = c.command.actorId;
      const schoolId = c.command.targetId;
      if (!actorId || !c.world.getEntity(actorId)) {
        return { ok: false, code: "E_NO_MEMBER", message: "member required" };
      }
      if (!schoolId || c.world.getEntity(schoolId)?.kind !== IntellectualKinds.school) {
        return { ok: false, code: "E_UNKNOWN_SCHOOL", message: "known school required" };
      }
      const ideaId = schoolIdea(c.world, schoolId);
      if (!ideaId || !hasRelation(c.world, IntellectualRelations.embraces, actorId, ideaId)) {
        return { ok: false, code: "E_DOES_NOT_EMBRACE_SCHOOL_IDEA", message: "member must embrace the school's idea" };
      }
      if (hasRelation(c.world, IntellectualRelations.memberOf, actorId, schoolId)) {
        return { ok: false, code: "E_ALREADY_MEMBER", message: "already a school member" };
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: "intellectual-history.join_school.resolve",
    commandType: "intellectual-history.join_school",
    resolve: (c) => [{
      kind: "addRelation",
      type: IntellectualRelations.memberOf,
      from: c.command.actorId as string,
      to: c.command.targetId as string,
      components: { [IntellectualRelations.memberOf]: { joinedAt: c.world.tick, founder: false } },
      announce: false,
    }, {
      kind: "emitEvent",
      eventType: "intellectual-history.school_joined",
      actorId: c.command.actorId,
      targetId: c.command.targetId,
      data: {},
      historicalSignificance: 0.1,
    }],
  });
}

function registerBranchIdea(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: "intellectual-history.branch_idea.allowed",
    commandType: "intellectual-history.branch_idea",
    evaluate: (c) => {
      const actorId = c.command.actorId;
      const parentIdeaId = String(c.command.payload.parentIdeaId ?? "");
      if (!actorId || !c.world.getEntity(actorId)) {
        return { ok: false, code: "E_NO_INTERPRETER", message: "interpreter required" };
      }
      if (c.world.getEntity(parentIdeaId)?.kind !== IntellectualKinds.idea) {
        return { ok: false, code: "E_UNKNOWN_PARENT_IDEA", message: "parent idea required" };
      }
      if (!hasRelation(c.world, IntellectualRelations.embraces, actorId, parentIdeaId)) {
        return { ok: false, code: "E_INTERPRETER_DOES_NOT_HOLD_PARENT", message: "interpreter must know the parent idea" };
      }
      if (!String(c.command.payload.title ?? "").trim() || !String(c.command.payload.thesis ?? "").trim()) {
        return { ok: false, code: "E_INCOMPLETE_BRANCH", message: "derived idea needs a title and thesis" };
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: "intellectual-history.branch_idea.resolve",
    commandType: "intellectual-history.branch_idea",
    resolve: (c): Effect[] => {
      const actorId = c.command.actorId as string;
      const parentIdeaId = String(c.command.payload.parentIdeaId);
      const title = String(c.command.payload.title);
      const thesis = String(c.command.payload.thesis);
      const principles = textArray(c.command.payload.principles, thesis);
      return [
        {
          kind: "spawnEntity",
          localId: "branchIdea",
          entityKind: IntellectualKinds.idea,
          components: {
            [IntellectualComponents.idea]: {
              title,
              thesis,
              principles,
              formedAt: c.world.tick,
              status: "living",
            },
          },
          announce: false,
        },
        {
          kind: "addRelation",
          type: IntellectualRelations.proposedBy,
          from: "@branchIdea",
          to: actorId,
          announce: false,
        },
        {
          kind: "addRelation",
          type: IntellectualRelations.derivedFrom,
          from: "@branchIdea",
          to: parentIdeaId,
          announce: false,
        },
        {
          kind: "addRelation",
          type: IntellectualRelations.embraces,
          from: actorId,
          to: "@branchIdea",
          components: { [IntellectualRelations.embraces]: {
            conviction: 0.85,
            adoptedAt: c.world.tick,
            source: "reinterpretation",
          } },
          announce: false,
        },
        {
          kind: "emitEvent",
          eventType: "intellectual-history.idea_branched",
          actorId,
          targetId: "@branchIdea",
          data: { title, parentIdeaId },
          historicalSignificance: 0.55,
          visibility: "public",
        },
        {
          kind: "emitEvent",
          eventType: "historical-memory.legacy_offered",
          actorId,
          targetId: "@branchIdea",
          data: {
            title,
            category: "thought",
            contentKey: `thought:${title}`,
            medium: String(c.command.payload.medium ?? "oral"),
            markCreator: typeof c.command.payload.markCreator === "boolean"
              ? c.command.payload.markCreator
              : c.rng.chance(String(c.command.payload.medium ?? "oral") === "oral" ? 0.45 : 0.8),
            segments: principles,
            preservationIntervalTicks: positiveInt(c.command.payload.preservationIntervalTicks),
          },
          historicalSignificance: 0,
        },
      ];
    },
  });
}

function registerApplyIdea(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: "intellectual-history.apply_idea.allowed",
    commandType: "intellectual-history.apply_idea",
    evaluate: (c) => {
      const actorId = c.command.actorId;
      const targetId = c.command.targetId;
      const ideaId = String(c.command.payload.ideaId ?? "");
      if (!actorId || !targetId || !c.world.getEntity(actorId) || !c.world.getEntity(targetId)) {
        return { ok: false, code: "E_BAD_APPLICATION", message: "sponsor and target must exist" };
      }
      if (c.world.getEntity(ideaId)?.kind !== IntellectualKinds.idea) {
        return { ok: false, code: "E_UNKNOWN_IDEA", message: "known idea required" };
      }
      if (!hasRelation(c.world, IntellectualRelations.embraces, actorId, ideaId)) {
        return { ok: false, code: "E_SPONSOR_DOES_NOT_HOLD_IDEA", message: "sponsor must embrace the idea" };
      }
      if (hasRelation(c.world, IntellectualRelations.influences, ideaId, targetId)) {
        return { ok: false, code: "E_ALREADY_INFLUENCES", message: "idea already influences this target" };
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: "intellectual-history.apply_idea.resolve",
    commandType: "intellectual-history.apply_idea",
    resolve: (c): Effect[] => {
      const ideaId = String(c.command.payload.ideaId);
      const targetId = c.command.targetId as string;
      return [{
        kind: "addRelation",
        type: IntellectualRelations.influences,
        from: ideaId,
        to: targetId,
        components: { [IntellectualRelations.influences]: {
          adoptedAt: c.world.tick,
          sponsorId: c.command.actorId as string,
          strength: clamp01(Number(c.command.payload.strength ?? 0.6)),
        } },
        announce: false,
      }, {
        kind: "emitEvent",
        eventType: "intellectual-history.idea_institutionalized",
        actorId: c.command.actorId,
        targetId,
        data: {
          ideaId,
          title: String(c.world.getComponent(ideaId, IntellectualComponents.idea)?.title ?? "一种思想"),
        },
        historicalSignificance: 0.7,
        visibility: "public",
      }];
    },
  });
}

function ideaProjection(world: WorldView, ideaId: string): Record<string, unknown> {
  const ideaEntity = world.getEntity(ideaId);
  if (!ideaEntity || ideaEntity.kind !== IntellectualKinds.idea) {
    return { exists: false };
  }
  const idea = ideaEntity.components[IntellectualComponents.idea] ?? {};
  const adherents = world.listRelations({ type: IntellectualRelations.embraces, to: ideaId });
  const schools = world.listRelations({ type: IntellectualRelations.centersOn, to: ideaId });
  const influences = world.listRelations({ type: IntellectualRelations.influences, from: ideaId });
  const branches = world.listRelations({ type: IntellectualRelations.derivedFrom, to: ideaId });
  const parent = world.listRelations({ type: IntellectualRelations.derivedFrom, from: ideaId })[0]?.to ?? null;
  const documents = world.listRelations({ type: IntellectualRelations.documentedBy, from: ideaId });

  return {
    exists: true,
    id: ideaId,
    title: String(idea.title ?? "无名思想"),
    thesis: String(idea.thesis ?? ""),
    principles: Array.isArray(idea.principles) ? idea.principles : [],
    adherentCount: adherents.length,
    schoolCount: schools.length,
    influenceCount: influences.length,
    branchCount: branches.length,
    parentIdeaId: parent,
    documentedWorkCount: documents.length,
    reach: adherents.length + schools.length * 3 + influences.length * 5 + branches.length * 2,
  };
}

function schoolIdea(world: WorldView, schoolId: string): string | undefined {
  return world.listRelations({
    type: IntellectualRelations.centersOn,
    from: schoolId,
  })[0]?.to;
}

function hasRelation(
  world: WorldView,
  type: string,
  from: string,
  to: string,
): boolean {
  return world.listRelations({ type, from, to }).length > 0;
}

function textArray(value: unknown, fallback: string): string[] {
  if (!Array.isArray(value)) return [fallback];
  const values = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length > 0 ? [...new Set(values)] : [fallback];
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function positiveInt(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}
