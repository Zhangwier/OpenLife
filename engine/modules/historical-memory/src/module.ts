/**
 * Historical Memory system pack.
 *
 * Separates four things that are often incorrectly collapsed into one log:
 *   1. World truth: who actually created a work.
 *   2. Material evidence: surviving / discovered artifacts and copies.
 *   3. Historical claims: what later people currently believe.
 *   4. Public memory: projections derived only from evidence + claims.
 *
 * The public projections intentionally never read the hidden creator field from
 * a work. A true creator can therefore be forgotten, misattributed, and later
 * restored when new evidence is rediscovered.
 */

import type { DeterministicRngLike, Effect, OpenLifeModule, WorldView } from "@openlife/contracts";

const OWNER = "historical-memory";

export const HistoricalMemoryComponents = {
  work: "historical-memory.work",
  artifact: "historical-memory.artifact",
  claim: "historical-memory.claim",
} as const;

export const HistoricalMemoryKinds = {
  work: "historical-memory.work",
  artifact: "historical-memory.artifact",
  claim: "historical-memory.claim",
} as const;

export const HistoricalMemoryRelations = {
  createdBy: "historical-memory.created_by",
  embodies: "historical-memory.embodies",
  copyOf: "historical-memory.copy_of",
  evidenceFor: "historical-memory.evidence_for",
} as const;

export const HistoricalMemoryEvents = {
  legacyOffered: "historical-memory.legacy_offered",
  transmissionOffered: "historical-memory.transmission_offered",
} as const;

const COMMANDS = [
  ["historical-memory.create_work", "Create a work and its first surviving artifact."],
  ["historical-memory.copy_artifact", "Create a copy or transmission of an existing artifact."],
  ["historical-memory.form_claim", "Form a public historical attribution from surviving evidence."],
  ["historical-memory.lose_artifact", "Make an artifact inaccessible to civilization."],
  ["historical-memory.damage_artifact", "Reduce an artifact to a fragment."],
  ["historical-memory.rediscover_artifact", "Return a lost artifact to public evidence."],
  ["historical-memory.weather_artifact", "Internal: apply deterministic preservation pressure."],
] as const;

export const historicalMemoryModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "Historical Memory",
    description: "Works, surviving evidence, historical claims, loss and rediscovery.",
    provides: ["history.material-evidence", "history.public-memory"],
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
    for (const id of Object.values(HistoricalMemoryComponents)) {
      ctx.registerComponent({ id, persist: true });
    }

    ctx.registerRelation({
      id: HistoricalMemoryRelations.createdBy,
      allowedFrom: [HistoricalMemoryKinds.work],
      persist: true,
      description: "World-truth creator relation. Public projections must not use it.",
    });
    ctx.registerRelation({
      id: HistoricalMemoryRelations.embodies,
      allowedFrom: [HistoricalMemoryKinds.artifact],
      allowedTo: [HistoricalMemoryKinds.work],
      persist: true,
      description: "An artifact physically or orally carries a work.",
    });
    ctx.registerRelation({
      id: HistoricalMemoryRelations.copyOf,
      allowedFrom: [HistoricalMemoryKinds.artifact],
      allowedTo: [HistoricalMemoryKinds.artifact],
      persist: true,
      description: "Transmission provenance between copies.",
    });
    ctx.registerRelation({
      id: HistoricalMemoryRelations.evidenceFor,
      allowedFrom: [HistoricalMemoryKinds.artifact],
      allowedTo: [HistoricalMemoryKinds.claim],
      persist: true,
      description: "Visible evidence currently supporting a historical claim.",
    });

    for (const [type, description] of COMMANDS) {
      ctx.registerCommand({ type, description });
    }

    ctx.registerTask({
      type: "historical-memory.preservation_check",
      description: "Apply material-specific preservation pressure to one artifact.",
      handler: (c) => {
        const artifactId = String(c.payload.artifactId ?? "");
        if (!artifactId) return undefined;
        const entity = c.world.getEntity(artifactId);
        if (!entity || entity.archivedAt !== undefined || entity.kind !== HistoricalMemoryKinds.artifact) {
          return undefined;
        }
        const artifact = entity.components[HistoricalMemoryComponents.artifact] ?? {};
        const condition = String(artifact.condition ?? "preserved");
        if (condition === "lost" || condition === "destroyed") return undefined;

        const risk = preservationRisk(String(artifact.medium ?? "other"));
        if (!c.rng.chance(risk)) return undefined;
        return {
          command: {
            type: "historical-memory.weather_artifact",
            targetId: artifactId,
            payload: { outcome: condition === "fragmented" ? "lost" : "fragmented" },
            source: "system",
          },
        };
      },
    });

    registerCreateWork(ctx);
    ctx.registerReactionRule({
      id: "historical-memory.legacy_offered.materialize",
      eventType: HistoricalMemoryEvents.legacyOffered,
      react: (c) => {
        const creatorId = c.event.actorId;
        if (!creatorId || !c.world.getEntity(creatorId)) return [];
        const title = String(c.event.data.title ?? "一段留下来的经验");
        return createWorkEffects({
          creatorId,
          title,
          category: String(c.event.data.category ?? "legacy"),
          medium: String(c.event.data.medium ?? "oral"),
          contentKey: String(c.event.data.contentKey ?? title),
          markCreator: c.event.data.markCreator !== false,
          preservationIntervalTicks: positiveNumber(c.event.data.preservationIntervalTicks),
          segments: normalizedSegments(c.event.data.segments, String(c.event.data.contentKey ?? title)),
          sourceEntityId: c.event.targetId,
          tick: c.world.tick,
        });
      },
    });
    registerCopyArtifact(ctx);
    ctx.registerReactionRule({
      id: "historical-memory.transmission_offered.copy",
      eventType: HistoricalMemoryEvents.transmissionOffered,
      react: (c) => {
        const copyistId = c.event.actorId;
        const sourceEntityId = c.event.targetId;
        if (!copyistId || !sourceEntityId || !c.world.getEntity(copyistId)) return [];
        const source = bestVisibleArtifactForSourceEntity(c.world, sourceEntityId);
        if (!source) return [];
        return copyArtifactEffects({
          copyistId,
          sourceId: source.id,
          medium: String(c.event.data.medium ?? source.components[HistoricalMemoryComponents.artifact]?.medium ?? "oral"),
          preserveAttribution: c.event.data.preserveAttribution !== false,
          fidelity: c.event.data.fidelity === undefined
            ? undefined
            : clamp01(Number(c.event.data.fidelity)),
          preservationIntervalTicks: positiveNumber(c.event.data.preservationIntervalTicks),
          localId: "transmissionCopy",
          tick: c.world.tick,
        }, c.world, c.rng);
      },
    });
    registerFormClaim(ctx);
    registerArtifactStateCommands(ctx);
    registerRediscoveryRevision(ctx);
    registerEvidenceDecayReactions(ctx);

    ctx.registerReactionRule({
      id: "historical-memory.artifact_created.schedule_preservation",
      eventType: "historical-memory.artifact_created",
      react: (c) => {
        const artifactId = c.event.targetId;
        const interval = Number(c.event.data.preservationIntervalTicks ?? 0);
        if (!artifactId || !Number.isFinite(interval) || interval <= 0) return [];
        return [{
          kind: "scheduleTask",
          taskType: "historical-memory.preservation_check",
          afterTicks: interval,
          everyTicks: interval,
          payload: { artifactId },
          dedupeKey: `preservation:${artifactId}`,
        }];
      },
    });

    ctx.registerProjection({
      id: "historical-memory.work_memory",
      description: "Public memory of a work derived only from surviving evidence and public claims.",
      build: ({ world, params }) => publicWorkMemory(world, String(params.workId ?? "")),
    });

    ctx.registerProjection({
      id: "historical-memory.subject_footprint",
      description: "How strongly a subject remains visible in surviving public evidence.",
      build: ({ world, params }) => publicSubjectFootprint(world, String(params.subjectId ?? "")),
    });

    ctx.registerProjection({
      id: "historical-memory.public_overview",
      description: "Surviving works, fragmentary transmission and disputed public memory.",
      build: ({ world }) => publicOverview(world),
    });

    ctx.registerProjection({
      id: "historical-memory.notable_subjects",
      description: "People who emerge as historically visible from surviving evidence and claims.",
      build: ({ world }) => ({ subjects: notableSubjects(world) }),
    });
  },
};

type Registration = Parameters<OpenLifeModule["register"]>[0];

function registerCreateWork(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: "historical-memory.create_work.allowed",
    commandType: "historical-memory.create_work",
    evaluate: (c) => {
      const actorId = c.command.actorId;
      if (!actorId) return { ok: false, code: "E_NO_CREATOR", message: "creator required" };
      const actor = c.world.getEntity(actorId);
      if (!actor || actor.archivedAt !== undefined) {
        return { ok: false, code: "E_CREATOR_UNAVAILABLE", message: "creator must exist in the world" };
      }
      const title = String(c.command.payload.title ?? "").trim();
      if (!title) return { ok: false, code: "E_NO_TITLE", message: "work title required" };
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: "historical-memory.create_work.resolve",
    commandType: "historical-memory.create_work",
    resolve: (c) => createWorkEffects({
      creatorId: c.command.actorId as string,
      title: String(c.command.payload.title ?? "Untitled"),
      category: String(c.command.payload.category ?? "work"),
      medium: String(c.command.payload.medium ?? "other"),
      contentKey: String(c.command.payload.contentKey ?? c.command.payload.title ?? "Untitled"),
      markCreator: c.command.payload.markCreator !== false,
      preservationIntervalTicks: positiveNumber(c.command.payload.preservationIntervalTicks),
      segments: normalizedSegments(c.command.payload.segments, String(c.command.payload.contentKey ?? c.command.payload.title ?? "Untitled")),
      tick: c.world.tick,
    }),  });
}

interface CreateWorkInput {
  creatorId: string;
  title: string;
  category: string;
  medium: string;
  contentKey: string;
  markCreator: boolean;
  preservationIntervalTicks: number;
  segments: string[];
  sourceEntityId?: string;
  tick: number;
}

function createWorkEffects(input: CreateWorkInput): Effect[] {
  return [
    {
      kind: "spawnEntity",
      localId: "historicalMemoryWork",
      entityKind: HistoricalMemoryKinds.work,
      components: {
        [HistoricalMemoryComponents.work]: {
          title: input.title,
          category: input.category,
          contentKey: input.contentKey,
          segmentCount: input.segments.length,
          creatorId: input.creatorId,
          ...(input.sourceEntityId ? { sourceEntityId: input.sourceEntityId } : {}),
          createdAt: input.tick,
        },
      },
      announce: false,
    },
    {
      kind: "spawnEntity",
      localId: "historicalMemoryArtifact",
      entityKind: HistoricalMemoryKinds.artifact,
      components: {
        [HistoricalMemoryComponents.artifact]: {
          artifactKind: "original",
          medium: input.medium,
          condition: "preserved",
          discovered: true,
          evidenceStrength: 1,
          attributionCreatorId: input.markCreator ? input.creatorId : "",
          retainedSegments: input.segments,
          contentIntegrity: 1,
          createdAt: input.tick,
        },
      },
      announce: false,
    },
    {
      kind: "addRelation",
      type: HistoricalMemoryRelations.createdBy,
      from: "@historicalMemoryWork",
      to: input.creatorId,
      announce: false,
    },
    {
      kind: "addRelation",
      type: HistoricalMemoryRelations.embodies,
      from: "@historicalMemoryArtifact",
      to: "@historicalMemoryWork",
      announce: false,
    },
    {
      kind: "emitEvent",
      eventType: "historical-memory.work_created",
      actorId: input.creatorId,
      targetId: "@historicalMemoryWork",
      data: {
        title: input.title,
        category: input.category,
        ...(input.sourceEntityId ? { sourceEntityId: input.sourceEntityId } : {}),
      },
      historicalSignificance: 0.55,
      visibility: "public",
    },
    {
      kind: "emitEvent",
      eventType: "historical-memory.artifact_created",
      actorId: input.creatorId,
      targetId: "@historicalMemoryArtifact",
      data: {
        artifactKind: "original",
        medium: input.medium,
        preservationIntervalTicks: input.preservationIntervalTicks,
      },
      historicalSignificance: 0.2,
      visibility: "public",
    },
  ];
}

function registerCopyArtifact(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: "historical-memory.copy_artifact.allowed",
    commandType: "historical-memory.copy_artifact",
    evaluate: (c) => {
      const actorId = c.command.actorId;
      const sourceId = c.command.targetId;
      if (!actorId || !c.world.getEntity(actorId)) {
        return { ok: false, code: "E_NO_COPYIST", message: "copyist required" };
      }
      if (!sourceId) return { ok: false, code: "E_NO_SOURCE", message: "source artifact required" };
      const source = c.world.getEntity(sourceId);
      if (!source || source.kind !== HistoricalMemoryKinds.artifact || source.archivedAt !== undefined) {
        return { ok: false, code: "E_BAD_SOURCE", message: "source artifact unavailable" };
      }
      const artifact = source.components[HistoricalMemoryComponents.artifact] ?? {};
      if (artifact.discovered === false || ["lost", "destroyed"].includes(String(artifact.condition ?? ""))) {
        return { ok: false, code: "E_SOURCE_UNAVAILABLE", message: "source artifact is not accessible" };
      }
      if (!workForArtifact(c.world, sourceId)) {
        return { ok: false, code: "E_NO_WORK", message: "source artifact carries no registered work" };
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: "historical-memory.copy_artifact.resolve",
    commandType: "historical-memory.copy_artifact",
    resolve: (c) => copyArtifactEffects({
      copyistId: c.command.actorId as string,
      sourceId: c.command.targetId as string,
      medium: typeof c.command.payload.medium === "string"
        ? c.command.payload.medium
        : undefined,
      preserveAttribution: c.command.payload.preserveAttribution !== false,
      fidelity: c.command.payload.fidelity === undefined
        ? undefined
        : clamp01(Number(c.command.payload.fidelity)),
      preservationIntervalTicks: positiveNumber(c.command.payload.preservationIntervalTicks),
      localId: "copy",
      tick: c.world.tick,
    }, c.world, c.rng),
  });
}
interface CopyArtifactInput {
  copyistId: string;
  sourceId: string;
  medium?: string;
  preserveAttribution: boolean;
  fidelity?: number;
  preservationIntervalTicks: number;
  localId: string;
  tick: number;
}

function copyArtifactEffects(
  input: CopyArtifactInput,
  world: WorldView,
  rng: DeterministicRngLike,
): Effect[] {
  const source = world.getEntity(input.sourceId);
  if (!source || source.kind !== HistoricalMemoryKinds.artifact) return [];
  const sourceData = source.components[HistoricalMemoryComponents.artifact] ?? {};
  const workId = workForArtifact(world, input.sourceId);
  if (!workId) return [];

  const medium = input.medium ?? String(sourceData.medium ?? "other");
  const attributionCreatorId = input.preserveAttribution
    ? String(sourceData.attributionCreatorId ?? "")
    : "";
  const sourceSegments = stringArray(sourceData.retainedSegments);
  const fidelity = input.fidelity ?? defaultCopyFidelity(medium);
  const retainedSegments = retainSegments(sourceSegments, fidelity, rng);
  const sourceIntegrity = clamp01(Number(sourceData.contentIntegrity ?? 1));
  const transmittedFraction = sourceSegments.length > 0
    ? retainedSegments.length / sourceSegments.length
    : fidelity;
  const contentIntegrity = clamp01(sourceIntegrity * transmittedFraction);
  const localRef = `@${input.localId}`;

  return [
    {
      kind: "spawnEntity",
      localId: input.localId,
      entityKind: HistoricalMemoryKinds.artifact,
      components: {
        [HistoricalMemoryComponents.artifact]: {
          artifactKind: "copy",
          medium,
          condition: contentIntegrity < 0.6 ? "fragmented" : "preserved",
          discovered: true,
          evidenceStrength: 0.65 * Math.max(0.2, contentIntegrity),
          attributionCreatorId,
          retainedSegments,
          contentIntegrity,
          createdAt: input.tick,
        },
      },
      announce: false,
    },
    {
      kind: "addRelation",
      type: HistoricalMemoryRelations.copyOf,
      from: localRef,
      to: input.sourceId,
      announce: false,
    },
    {
      kind: "addRelation",
      type: HistoricalMemoryRelations.embodies,
      from: localRef,
      to: workId,
      announce: false,
    },
    {
      kind: "emitEvent",
      eventType: "historical-memory.artifact_copied",
      actorId: input.copyistId,
      targetId: localRef,
      data: {
        sourceArtifactId: input.sourceId,
        medium,
        attributionPreserved: input.preserveAttribution,
        contentIntegrity,
      },
      historicalSignificance: 0.25,
    },
    {
      kind: "emitEvent",
      eventType: "historical-memory.artifact_created",
      actorId: input.copyistId,
      targetId: localRef,
      data: {
        artifactKind: "copy",
        medium,
        preservationIntervalTicks: input.preservationIntervalTicks,
      },
      historicalSignificance: 0,
    },
  ];
}

function bestVisibleArtifactForSourceEntity(
  world: WorldView,
  sourceEntityId: string,
) {
  const candidateWorkIds = world
    .listEntities({ kind: HistoricalMemoryKinds.work })
    .filter((entity) =>
      String(entity.components[HistoricalMemoryComponents.work]?.sourceEntityId ?? "") === sourceEntityId
    )
    .map((entity) => entity.id);

  const candidates = candidateWorkIds.flatMap((workId) =>
    evidenceForWork(world, workId).map(({ entity, artifact }) => ({
      entity,
      integrity: clamp01(Number(artifact.contentIntegrity ?? 1)),
      strength: Number(artifact.evidenceStrength ?? 0),
    })),
  );

  candidates.sort((a, b) =>
    b.integrity - a.integrity
    || b.strength - a.strength
    || b.entity.createdAt - a.entity.createdAt
  );
  return candidates[0]?.entity;
}

function registerFormClaim(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: "historical-memory.form_claim.allowed",
    commandType: "historical-memory.form_claim",
    evaluate: (c) => {
      const workId = String(c.command.payload.workId ?? "");
      const attributedEntityId = String(c.command.payload.attributedEntityId ?? "");
      const evidenceIds = stringArray(c.command.payload.evidenceArtifactIds);
      if (!workId || c.world.getEntity(workId)?.kind !== HistoricalMemoryKinds.work) {
        return { ok: false, code: "E_UNKNOWN_WORK", message: "known work required" };
      }
      if (!attributedEntityId || !c.world.getEntity(attributedEntityId)) {
        return { ok: false, code: "E_UNKNOWN_ATTRIBUTION", message: "attributed subject required" };
      }
      if (evidenceIds.length === 0) {
        return { ok: false, code: "E_NO_EVIDENCE", message: "historical claim requires surviving evidence" };
      }
      for (const artifactId of evidenceIds) {
        if (!isPublicEvidenceForWork(c.world, artifactId, workId)) {
          return { ok: false, code: "E_BAD_EVIDENCE", message: `artifact is not public evidence: ${artifactId}` };
        }
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: "historical-memory.form_claim.resolve",
    commandType: "historical-memory.form_claim",
    resolve: (c) => {
      const workId = String(c.command.payload.workId);
      const attributedEntityId = String(c.command.payload.attributedEntityId);
      const evidenceIds = stringArray(c.command.payload.evidenceArtifactIds);
      const directSupport = evidenceIds
        .map((id) => c.world.getComponent(id, HistoricalMemoryComponents.artifact) ?? {})
        .filter((artifact) => String(artifact.attributionCreatorId ?? "") === attributedEntityId)
        .reduce(
          (max, artifact) => Math.max(
            max,
            Number(artifact.evidenceStrength ?? 0) * clamp01(Number(artifact.contentIntegrity ?? 1)),
          ),
          0,
        );
      const confidence = directSupport > 0
        ? Math.min(0.95, 0.65 + directSupport * 0.3)
        : Math.min(0.55, 0.25 + evidenceIds.length * 0.1);
      const status = confidence >= 0.6 ? "supported" : "uncertain";

      const effects: Effect[] = [
        {
          kind: "spawnEntity",
          localId: "claim",
          entityKind: HistoricalMemoryKinds.claim,
          components: {
            [HistoricalMemoryComponents.claim]: {
              claimType: "authorship",
              workId,
              attributedEntityId,
              confidence,
              status,
              formedAt: c.world.tick,
              revisedAt: 0,
            },
          },
          announce: false,
        },
      ];

      for (const artifactId of evidenceIds) {
        effects.push({
          kind: "addRelation",
          type: HistoricalMemoryRelations.evidenceFor,
          from: artifactId,
          to: "@claim",
          announce: false,
        });
      }

      effects.push({
        kind: "emitEvent",
        eventType: "historical-memory.claim_formed",
        actorId: c.command.actorId,
        targetId: "@claim",
        data: { workId, attributedEntityId, confidence, status, evidenceCount: evidenceIds.length },
        historicalSignificance: 0.4,
        visibility: "public",
      });
      return effects;
    },
  });
}

function registerArtifactStateCommands(ctx: Registration): void {
  for (const type of [
    "historical-memory.lose_artifact",
    "historical-memory.damage_artifact",
    "historical-memory.rediscover_artifact",
    "historical-memory.weather_artifact",
  ]) {
    ctx.registerConstraintRule({
      id: `${type}.allowed`,
      commandType: type,
      evaluate: (c) => {
        const artifactId = c.command.targetId;
        if (!artifactId) return { ok: false, code: "E_NO_ARTIFACT", message: "artifact required" };
        const entity = c.world.getEntity(artifactId);
        if (!entity || entity.kind !== HistoricalMemoryKinds.artifact || entity.archivedAt !== undefined) {
          return { ok: false, code: "E_UNKNOWN_ARTIFACT", message: "artifact unavailable" };
        }
        return { ok: true };
      },
    });
  }

  ctx.registerResolutionRule({
    id: "historical-memory.lose_artifact.resolve",
    commandType: "historical-memory.lose_artifact",
    resolve: (c) => artifactStateEffects(
      c.command.targetId as string,
      "lost",
      false,
      "historical-memory.artifact_lost",
      0.3,
    ),
  });

  ctx.registerResolutionRule({
    id: "historical-memory.damage_artifact.resolve",
    commandType: "historical-memory.damage_artifact",
    resolve: (c) => {
      const artifactId = c.command.targetId as string;
      const current = c.world.getComponent(artifactId, HistoricalMemoryComponents.artifact) ?? {};
      const segments = stringArray(current.retainedSegments);
      const retainRatio = c.command.payload.retainRatio === undefined
        ? 0.5
        : clamp01(Number(c.command.payload.retainRatio));
      const retainedSegments = retainSegments(segments, retainRatio, c.rng);
      const currentIntegrity = clamp01(Number(current.contentIntegrity ?? 1));
      const fraction = segments.length > 0 ? retainedSegments.length / segments.length : retainRatio;
      const contentIntegrity = clamp01(currentIntegrity * fraction);
      const currentAttribution = String(current.attributionCreatorId ?? "");
      const medium = String(current.medium ?? "other");
      const attributionCreatorId = currentAttribution && c.command.payload.retainAttribution !== undefined
        ? (c.command.payload.retainAttribution === true ? currentAttribution : "")
        : currentAttribution && c.rng.chance(attributionSurvival(medium))
          ? currentAttribution
          : "";
      return artifactStateEffects(
        artifactId,
        "fragmented",
        true,
        "historical-memory.artifact_fragmented",
        0.25,
        Math.min(0.35, Number(current.evidenceStrength ?? 0.35)),
        { retainedSegments, contentIntegrity, attributionCreatorId },
      );
    },
  });

  ctx.registerResolutionRule({
    id: "historical-memory.rediscover_artifact.resolve",
    commandType: "historical-memory.rediscover_artifact",
    resolve: (c) => {
      const artifactId = c.command.targetId as string;
      const current = c.world.getComponent(artifactId, HistoricalMemoryComponents.artifact) ?? {};
      const nextCondition = String(current.condition ?? "") === "lost"
        ? "fragmented"
        : String(current.condition ?? "preserved");
      return artifactStateEffects(
        artifactId,
        nextCondition,
        true,
        "historical-memory.artifact_rediscovered",
        0.6,
        Number(current.evidenceStrength ?? 0.5),
      );
    },
  });

  ctx.registerResolutionRule({
    id: "historical-memory.weather_artifact.resolve",
    commandType: "historical-memory.weather_artifact",
    resolve: (c) => {
      const artifactId = c.command.targetId as string;
      const outcome = String(c.command.payload.outcome ?? "fragmented");
      if (outcome === "lost") {
        return artifactStateEffects(
          artifactId,
          "lost",
          false,
          "historical-memory.artifact_lost",
          0.15,
        );
      }

      const current = c.world.getComponent(artifactId, HistoricalMemoryComponents.artifact) ?? {};
      const segments = stringArray(current.retainedSegments);
      const retainedSegments = retainSegments(segments, 0.55, c.rng);
      const currentIntegrity = clamp01(Number(current.contentIntegrity ?? 1));
      const fraction = segments.length > 0 ? retainedSegments.length / segments.length : 0.55;
      const currentAttribution = String(current.attributionCreatorId ?? "");
      const medium = String(current.medium ?? "other");
      const attributionCreatorId = currentAttribution && c.rng.chance(attributionSurvival(medium))
        ? currentAttribution
        : "";
      return artifactStateEffects(
        artifactId,
        "fragmented",
        true,
        "historical-memory.artifact_fragmented",
        0.1,
        Math.min(0.3, Number(current.evidenceStrength ?? 0.3)),
        {
          retainedSegments,
          contentIntegrity: clamp01(currentIntegrity * fraction),
          attributionCreatorId,
        },
      );
    },
  });
}function registerRediscoveryRevision(ctx: Registration): void {
  ctx.registerReactionRule({
    id: "historical-memory.rediscovery.reassess_claims",
    eventType: "historical-memory.artifact_rediscovered",
    react: (c) => {
      const artifactId = c.event.targetId;
      if (!artifactId) return [];
      const artifact = c.world.getComponent(artifactId, HistoricalMemoryComponents.artifact) ?? {};
      const inscribedCreatorId = String(artifact.attributionCreatorId ?? "");
      if (!inscribedCreatorId) return [];
      const workId = workForArtifact(c.world, artifactId);
      if (!workId) return [];

      const claims = claimsForWork(c.world, workId);
      const wrongClaims = claims.filter((entity) =>
        String(entity.components[HistoricalMemoryComponents.claim]?.attributedEntityId ?? "") !== inscribedCreatorId
      );
      const correctClaim = claims.find((entity) =>
        String(entity.components[HistoricalMemoryComponents.claim]?.attributedEntityId ?? "") === inscribedCreatorId
      );
      const effects: Effect[] = [];

      for (const claimEntity of wrongClaims) {
        const claim = claimEntity.components[HistoricalMemoryComponents.claim] ?? {};
        effects.push({
          kind: "modifyComponent",
          entityId: claimEntity.id,
          component: HistoricalMemoryComponents.claim,
          patch: {
            status: "disputed",
            confidence: Math.min(0.25, Number(claim.confidence ?? 0.25)),
            revisedAt: c.world.tick,
          },
          reason: "rediscovered attributed evidence contradicted this historical claim",
        });
      }

      const supportedClaimRef = correctClaim?.id ?? "@rediscoveredClaim";
      if (correctClaim) {
        effects.push({
          kind: "modifyComponent",
          entityId: correctClaim.id,
          component: HistoricalMemoryComponents.claim,
          patch: { confidence: 0.95, status: "supported", revisedAt: c.world.tick },
          reason: "rediscovered direct evidence strengthened this historical claim",
        });
      } else {
        effects.push({
          kind: "spawnEntity",
          localId: "rediscoveredClaim",
          entityKind: HistoricalMemoryKinds.claim,
          components: {
            [HistoricalMemoryComponents.claim]: {
              claimType: "authorship",
              workId,
              attributedEntityId: inscribedCreatorId,
              confidence: 0.95,
              status: wrongClaims.length > 0 ? "revised" : "supported",
              formedAt: c.world.tick,
              revisedAt: c.world.tick,
            },
          },
          announce: false,
        });
      }

      const hasEvidence = correctClaim
        ? c.world.listRelations({
            type: HistoricalMemoryRelations.evidenceFor,
            from: artifactId,
            to: correctClaim.id,
          }).length > 0
        : false;
      if (!hasEvidence) {
        effects.push({
          kind: "addRelation",
          type: HistoricalMemoryRelations.evidenceFor,
          from: artifactId,
          to: supportedClaimRef,
          announce: false,
        });
      }

      if (wrongClaims.length > 0) {
        effects.push({
          kind: "emitEvent",
          eventType: "historical-memory.claim_revised",
          actorId: artifactId,
          targetId: supportedClaimRef,
          data: {
            workId,
            oldAttributions: wrongClaims.map((entity) =>
              String(entity.components[HistoricalMemoryComponents.claim]?.attributedEntityId ?? "")
            ),
            newAttribution: inscribedCreatorId,
            evidenceArtifactId: artifactId,
          },
          historicalSignificance: 0.75,
          visibility: "public",
        });
      } else {
        effects.push({
          kind: "emitEvent",
          eventType: "historical-memory.claim_supported",
          actorId: artifactId,
          targetId: supportedClaimRef,
          data: { workId, attribution: inscribedCreatorId, evidenceArtifactId: artifactId },
          historicalSignificance: 0.45,
          visibility: "public",
        });
      }
      return effects;
    },
  });
}
function registerEvidenceDecayReactions(ctx: Registration): void {
  ctx.registerReactionRule({
    id: "historical-memory.artifact_lost.weaken_claims",
    eventType: "historical-memory.artifact_lost",
    react: (c) => {
      const artifactId = c.event.targetId;
      if (!artifactId) return [];
      const effects: Effect[] = [];
      for (const relation of c.world.listRelations({
        type: HistoricalMemoryRelations.evidenceFor,
        from: artifactId,
      })) {
        const claimEntity = c.world.getEntity(relation.to);
        if (!claimEntity || claimEntity.kind !== HistoricalMemoryKinds.claim) continue;
        const remainingVisibleEvidence = c.world.listRelations({
          type: HistoricalMemoryRelations.evidenceFor,
          to: claimEntity.id,
        }).filter((candidate) => isVisibleArtifact(c.world, candidate.from));
        if (remainingVisibleEvidence.length > 0) continue;
        const claim = claimEntity.components[HistoricalMemoryComponents.claim] ?? {};
        effects.push({
          kind: "modifyComponent",
          entityId: claimEntity.id,
          component: HistoricalMemoryComponents.claim,
          patch: {
            status: "uncertain",
            confidence: Math.min(0.45, Number(claim.confidence ?? 0.45) * 0.6),
            revisedAt: c.world.tick,
          },
          reason: "the surviving evidence for this historical claim disappeared",
        });
      }
      return effects;
    },
  });
}

function artifactStateEffects(
  artifactId: string,
  condition: string,
  discovered: boolean,
  eventType: string,
  significance: number,
  evidenceStrength?: number,
  extraPatch: Record<string, unknown> = {},
): Effect[] {
  return [
    {
      kind: "modifyComponent",
      entityId: artifactId,
      component: HistoricalMemoryComponents.artifact,
      patch: {
        condition,
        discovered,
        ...(evidenceStrength !== undefined ? { evidenceStrength } : {}),
        ...extraPatch,
      },
      reason: `artifact state changed to ${condition}`,
    },
    {
      kind: "emitEvent",
      eventType,
      targetId: artifactId,
      data: { condition, discovered },
      historicalSignificance: significance,
      visibility: "public",
    },
  ];
}

function publicWorkMemory(world: WorldView, workId: string): Record<string, unknown> {
  const workEntity = world.getEntity(workId);
  if (!workEntity || workEntity.kind !== HistoricalMemoryKinds.work) {
    return { exists: false, evidence: [], claims: [], memoryState: "unknown" };
  }

  const work = workEntity.components[HistoricalMemoryComponents.work] ?? {};
  const evidence = evidenceForWork(world, workId);
  const claims = claimsForWork(world, workId)
    .map((entity) => {
      const claim = entity.components[HistoricalMemoryComponents.claim] ?? {};
      return {
        id: entity.id,
        attributedEntityId: String(claim.attributedEntityId ?? ""),
        confidence: Number(claim.confidence ?? 0),
        status: String(claim.status ?? "uncertain"),
        evidenceCount: world.listRelations({
          type: HistoricalMemoryRelations.evidenceFor,
          to: entity.id,
        }).filter((relation) => isVisibleArtifact(world, relation.from)).length,
      };
    })
    .sort((a, b) => claimRank(b.status) - claimRank(a.status) || b.confidence - a.confidence);

  const activeClaims = claims.filter((claim) => claim.status !== "disputed");
  const best = activeClaims[0];
  const evidenceAttributionRows = evidence
    .map(({ artifact }) => ({
      entityId: String(artifact.attributionCreatorId ?? ""),
      confidence:
        Number(artifact.evidenceStrength ?? 0)
        * clamp01(Number(artifact.contentIntegrity ?? 1)),
    }))
    .filter((row) => row.entityId)
    .sort((a, b) => b.confidence - a.confidence);
  const bestEvidenceAttribution = evidenceAttributionRows[0];
  const visibleAttributions = new Set(
    activeClaims
      .filter((claim) => claim.attributedEntityId)
      .map((claim) => claim.attributedEntityId),
  );
  const evidenceAttributions = new Set(evidenceAttributionRows.map((row) => row.entityId));
  const claimConflictsWithEvidence = Boolean(
    best
    && evidenceAttributions.size > 0
    && !evidenceAttributions.has(best.attributedEntityId),
  );
  const contested =
    visibleAttributions.size > 1
    || evidenceAttributions.size > 1
    || claimConflictsWithEvidence
    || claims.some((claim) => claim.status === "disputed");
  const knownSegments = [...new Set(evidence.flatMap(({ artifact }) => stringArray(artifact.retainedSegments)))];
  const strongestIntegrity = evidence.reduce(
    (max, { artifact }) => Math.max(max, clamp01(Number(artifact.contentIntegrity ?? 1))),
    0,
  );
  const contentState = evidence.length === 0
    ? "lost"
    : strongestIntegrity >= 0.95
      ? "complete"
      : strongestIntegrity >= 0.6
        ? "substantial"
        : "fragmentary";

  return {
    exists: true,
    title: evidence.length > 0 || claims.length > 0 ? String(work.title ?? "Untitled") : null,
    category: evidence.length > 0 || claims.length > 0 ? String(work.category ?? "work") : null,
    evidence: evidence.map(({ entity, artifact }) => ({
      id: entity.id,
      artifactKind: String(artifact.artifactKind ?? "artifact"),
      medium: String(artifact.medium ?? "other"),
      condition: String(artifact.condition ?? "preserved"),
      hasAttribution: Boolean(String(artifact.attributionCreatorId ?? "")),
      contentIntegrity: clamp01(Number(artifact.contentIntegrity ?? 1)),
      retainedSegmentCount: stringArray(artifact.retainedSegments).length,
    })),
    knownSegments,
    knownSegmentCount: knownSegments.length,
    contentState,
    contested,
    claims,
    publicAttribution: best
      ? {
          entityId: best.attributedEntityId,
          confidence: best.confidence,
          status: best.status,
        }
      : bestEvidenceAttribution
        ? {
            entityId: bestEvidenceAttribution.entityId,
            confidence: bestEvidenceAttribution.confidence,
            status: "evidence_only",
          }
        : null,
    memoryState: evidence.length === 0 && claims.length === 0
      ? "lost"
      : contested
        ? "contested"
        : best
          ? "attributed"
          : bestEvidenceAttribution
            ? "attributed_evidence"
            : "anonymous_trace",  };
}

function publicSubjectFootprint(world: WorldView, subjectId: string): Record<string, unknown> {
  if (!subjectId) {
    return { subjectId, score: 0, state: "forgotten", evidenceCount: 0, claimCount: 0, workCount: 0 };
  }

  let evidenceCount = 0;
  let evidenceWeight = 0;
  const workIds = new Set<string>();
  for (const entity of world.listEntities({ kind: HistoricalMemoryKinds.artifact })) {
    if (!isVisibleArtifact(world, entity.id)) continue;
    const artifact = entity.components[HistoricalMemoryComponents.artifact] ?? {};
    if (String(artifact.attributionCreatorId ?? "") !== subjectId) continue;
    evidenceCount += 1;
    evidenceWeight += Number(artifact.evidenceStrength ?? 0.5)
      * clamp01(Number(artifact.contentIntegrity ?? 1));
    const workId = workForArtifact(world, entity.id);
    if (workId) workIds.add(workId);
  }

  const attributedClaims = world
    .listEntities({ kind: HistoricalMemoryKinds.claim })
    .map((entity) => entity.components[HistoricalMemoryComponents.claim] ?? {})
    .filter((claim) => String(claim.attributedEntityId ?? "") === subjectId);
  const claimWeight = attributedClaims.reduce((sum, claim) => {
    const status = String(claim.status ?? "uncertain");
    const statusWeight = status === "disputed" ? 0.1 : status === "uncertain" ? 0.5 : 1;
    if (status !== "disputed" && typeof claim.workId === "string") workIds.add(claim.workId);
    return sum + Number(claim.confidence ?? 0) * statusWeight;
  }, 0);
  const score = evidenceWeight * 3 + claimWeight * 2 + Math.min(5, workIds.size) * 0.5;
  const state = score >= 10
    ? "influential"
    : score >= 4
      ? "remembered"
      : score > 0
        ? "trace"
        : "forgotten";

  return {
    subjectId,
    score,
    evidenceCount,
    claimCount: attributedClaims.length,
    workCount: workIds.size,
    state,
  };
}

function publicOverview(world: WorldView): Record<string, unknown> {
  const works = world
    .listEntities({ kind: HistoricalMemoryKinds.work })
    .map((entity): Record<string, unknown> => ({ id: entity.id, ...publicWorkMemory(world, entity.id) }))
    .filter((memory) => memory.memoryState !== "lost" && memory.memoryState !== "unknown");

  return {
    visibleWorkCount: works.length,
    fragmentaryWorkCount: works.filter((work) => work.contentState === "fragmentary").length,
    contestedWorkCount: works.filter((work) => work.contested === true).length,
    anonymousWorkCount: works.filter((work) => work.memoryState === "anonymous_trace").length,
    works: works.slice(-6).reverse().map((work) => ({
      id: work.id,
      title: work.title,
      memoryState: work.memoryState,
      contentState: work.contentState,
      evidenceCount: Array.isArray(work.evidence) ? work.evidence.length : 0,
      contested: work.contested,
    })),
  };
}

function notableSubjects(world: WorldView): Record<string, unknown>[] {
  const candidates = new Set<string>();
  for (const entity of world.listEntities({ kind: HistoricalMemoryKinds.artifact })) {
    if (!isVisibleArtifact(world, entity.id)) continue;
    const attribution = String(
      entity.components[HistoricalMemoryComponents.artifact]?.attributionCreatorId ?? "",
    );
    if (attribution) candidates.add(attribution);
  }
  for (const entity of world.listEntities({ kind: HistoricalMemoryKinds.claim })) {
    const claim = entity.components[HistoricalMemoryComponents.claim] ?? {};
    if (String(claim.status ?? "") === "disputed") continue;
    const attribution = String(claim.attributedEntityId ?? "");
    if (attribution) candidates.add(attribution);
  }

  return [...candidates]
    .map((subjectId) => publicSubjectFootprint(world, subjectId))
    .filter((entry) => entry.state === "remembered" || entry.state === "influential")
    .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0));
}
function evidenceForWork(
  world: WorldView,
  workId: string,
): { entity: ReturnType<WorldView["getEntity"]> extends infer T ? Exclude<T, undefined> : never; artifact: Readonly<Record<string, unknown>> }[] {
  const rows: { entity: any; artifact: Readonly<Record<string, unknown>> }[] = [];
  for (const relation of world.listRelations({ type: HistoricalMemoryRelations.embodies, to: workId })) {
    const entity = world.getEntity(relation.from);
    if (!entity || !isVisibleArtifact(world, entity.id)) continue;
    rows.push({
      entity,
      artifact: entity.components[HistoricalMemoryComponents.artifact] ?? {},
    });
  }
  return rows;
}

function claimsForWork(world: WorldView, workId: string) {
  return world
    .listEntities({ kind: HistoricalMemoryKinds.claim })
    .filter((entity) =>
      String(entity.components[HistoricalMemoryComponents.claim]?.workId ?? "") === workId
    );
}

function workForArtifact(world: WorldView, artifactId: string): string | undefined {
  return world.listRelations({
    type: HistoricalMemoryRelations.embodies,
    from: artifactId,
  })[0]?.to;
}

function isVisibleArtifact(world: WorldView, artifactId: string): boolean {
  const entity = world.getEntity(artifactId);
  if (!entity || entity.kind !== HistoricalMemoryKinds.artifact || entity.archivedAt !== undefined) return false;
  const artifact = entity.components[HistoricalMemoryComponents.artifact] ?? {};
  const condition = String(artifact.condition ?? "preserved");
  return artifact.discovered !== false && condition !== "lost" && condition !== "destroyed";
}

function isPublicEvidenceForWork(world: WorldView, artifactId: string, workId: string): boolean {
  return isVisibleArtifact(world, artifactId) && workForArtifact(world, artifactId) === workId;
}

function claimRank(status: string): number {
  switch (status) {
    case "revised":
      return 4;
    case "supported":
      return 3;
    case "uncertain":
      return 2;
    case "disputed":
      return 1;
    default:
      return 0;
  }
}

function normalizedSegments(value: unknown, fallback: string): string[] {
  const segments = stringArray(value);
  return segments.length > 0 ? [...new Set(segments)] : [fallback];
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function defaultCopyFidelity(medium: string): number {
  switch (medium) {
    case "stone":
      return 0.98;
    case "bronze":
      return 0.96;
    case "clay":
      return 0.92;
    case "paper":
      return 0.94;
    case "bamboo":
    case "wood":
      return 0.88;
    case "oral":
      return 0.72;
    default:
      return 0.85;
  }
}

function retainSegments(
  segments: string[],
  fraction: number,
  rng: DeterministicRngLike,
): string[] {
  if (segments.length === 0) return [];
  const normalized = clamp01(fraction);
  if (normalized >= 1) return [...segments];
  if (normalized <= 0) return [];

  const targetCount = Math.max(1, Math.min(segments.length, Math.round(segments.length * normalized)));
  const pool = [...segments];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = rng.nextInt(0, i + 1);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const retained = new Set(pool.slice(0, targetCount));
  return segments.filter((segment) => retained.has(segment));
}

function attributionSurvival(medium: string): number {
  switch (medium) {
    case "stone":
      return 0.95;
    case "bronze":
      return 0.9;
    case "clay":
      return 0.8;
    case "paper":
      return 0.7;
    case "bamboo":
    case "wood":
      return 0.65;
    case "oral":
      return 0.4;
    default:
      return 0.6;
  }
}

function preservationRisk(medium: string): number {
  switch (medium) {
    case "stone":
      return 0.02;
    case "clay":
      return 0.04;
    case "bronze":
      return 0.05;
    case "bamboo":
    case "wood":
      return 0.12;
    case "paper":
      return 0.18;
    case "oral":
      return 0.28;
    default:
      return 0.1;
  }
}

function positiveNumber(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}
