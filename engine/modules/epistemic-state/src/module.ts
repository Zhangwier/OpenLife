/**
 * Personal epistemic state prototype.
 *
 * KnowledgeDefinition describes content that can be known. This module records
 * how one concrete holder currently relates to that content: whether they have
 * encountered it, what stance they take, how confident they are, how well they
 * understand it, and what evidence/source shaped that state.
 *
 * Confidence is subjective confidence, never truth probability.
 */

import type { Effect, OpenLifeModule, WorldView } from "@openlife/contracts";

const OWNER = "epistemic-state";

export const EpistemicEvents = {
  acquisitionRequested: "epistemic-state.acquire_requested",
} as const;

export const EpistemicKinds = {
  record: "epistemic-state.record",
} as const;

export const EpistemicComponents = {
  record: "epistemic-state.record",
} as const;

export const EpistemicRelations = {
  holds: "epistemic-state.holds",
} as const;

export type EpistemicAwareness = "heard" | "examined";
export type EpistemicStance = "undecided" | "accepts" | "rejects";

export interface EpistemicRecordSnapshot {
  id: string;
  state: Readonly<Record<string, unknown>>;
}

export interface EpistemicStateApi {
  findRecord(
    world: WorldView,
    holderId: string,
    canonicalKnowledgeId?: string,
    claimEntityId?: string,
  ): EpistemicRecordSnapshot | undefined;
}

export const epistemicStateModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "Personal Epistemic State Prototype",
    description: "Per-holder awareness, stance, confidence, understanding and epistemic provenance.",
    provides: ["cognition.epistemic-state"],
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
    const api: EpistemicStateApi = {
      findRecord(world, holderId, canonicalKnowledgeId, claimEntityId) {
        const entity = findRecord(world, holderId, canonicalKnowledgeId, claimEntityId);
        if (!entity) return undefined;
        return { id: entity.id, state: entity.components[EpistemicComponents.record] ?? {} };
      },
    };
    ctx.provideCapability("cognition.epistemic-state", api);

    ctx.registerComponent({
      id: EpistemicComponents.record,
      persist: true,
      description: "One holder's current epistemic state toward one canonical knowledge or runtime claim.",
    });
    ctx.registerRelation({
      id: EpistemicRelations.holds,
      allowedTo: [EpistemicKinds.record],
      persist: true,
      description: "Connects a holder to one personal epistemic record.",
    });

    ctx.registerCommand({
      type: "epistemic-state.acquire",
      description: "Create a holder's first epistemic record for a knowledge node or runtime claim.",
    });
    ctx.registerCommand({
      type: "epistemic-state.revise",
      description: "Revise an existing epistemic record without asserting whether the belief is true.",
    });

    ctx.registerConstraintRule({
      id: "epistemic-state.acquire.allowed",
      commandType: "epistemic-state.acquire",
      evaluate: (c) => {
        const holderId = c.command.actorId;
        if (!holderId || !c.world.hasEntity(holderId)) {
          return { ok: false, code: "E_EPISTEMIC_HOLDER", message: "epistemic acquisition requires an existing holder" };
        }
        const canonicalKnowledgeId = optionalString(c.command.payload.canonicalKnowledgeId);
        const claimEntityId = optionalString(c.command.payload.claimEntityId);
        if (!canonicalKnowledgeId && !claimEntityId) {
          return { ok: false, code: "E_EPISTEMIC_CONTENT", message: "knowledge id or claim entity id required" };
        }
        if (findRecord(c.world, holderId, canonicalKnowledgeId, claimEntityId)) {
          return { ok: false, code: "E_EPISTEMIC_EXISTS", message: "holder already has an epistemic record for this content" };
        }
        return { ok: true };
      },
    });

    ctx.registerResolutionRule({
      id: "epistemic-state.acquire.resolve",
      commandType: "epistemic-state.acquire",
      resolve: (c) => createRecordEffects({
        holderId: c.command.actorId as string,
        canonicalKnowledgeId: optionalString(c.command.payload.canonicalKnowledgeId),
        claimEntityId: optionalString(c.command.payload.claimEntityId),
        awareness: awarenessOf(c.command.payload.awareness),
        stance: stanceOf(c.command.payload.stance),
        confidence: clamp01(Number(c.command.payload.confidence ?? 0.5)),
        understanding: clamp01(Number(c.command.payload.understanding ?? 0.25)),
        basisRefs: stringArray(c.command.payload.basisRefs),
        source: String(c.command.payload.source ?? "encounter"),
        tick: c.world.tick,
        rngId: c.rng.nextInt(1, 1_000_000_000),
      }),
    });

    ctx.registerConstraintRule({
      id: "epistemic-state.revise.allowed",
      commandType: "epistemic-state.revise",
      evaluate: (c) => {
        const holderId = c.command.actorId;
        const recordId = c.command.targetId;
        if (!holderId || !recordId) {
          return { ok: false, code: "E_EPISTEMIC_RECORD", message: "holder and record required" };
        }
        const record = c.world.getEntity(recordId);
        if (!record || record.kind !== EpistemicKinds.record || record.archivedAt !== undefined) {
          return { ok: false, code: "E_EPISTEMIC_RECORD", message: "epistemic record does not exist" };
        }
        const held = c.world.listRelations({ type: EpistemicRelations.holds, from: holderId, to: recordId }).length > 0;
        if (!held) {
          return { ok: false, code: "E_EPISTEMIC_OWNER", message: "holder does not own this epistemic record" };
        }
        return { ok: true };
      },
    });

    ctx.registerResolutionRule({
      id: "epistemic-state.revise.resolve",
      commandType: "epistemic-state.revise",
      resolve: (c) => {
        const recordId = c.command.targetId as string;
        const current = c.world.getComponent(recordId, EpistemicComponents.record) ?? {};
        const basisRefs = uniqueStrings([
          ...stringArray(current.basisRefs),
          ...stringArray(c.command.payload.basisRefs),
        ]);
        const patch: Record<string, import("@openlife/contracts").JsonValue> = {
          updatedAt: c.world.tick,
          basisRefs,
        };
        if (c.command.payload.awareness !== undefined) patch.awareness = awarenessOf(c.command.payload.awareness);
        if (c.command.payload.stance !== undefined) patch.stance = stanceOf(c.command.payload.stance);
        if (c.command.payload.confidence !== undefined) patch.confidence = clamp01(Number(c.command.payload.confidence));
        if (c.command.payload.understanding !== undefined) patch.understanding = clamp01(Number(c.command.payload.understanding));
        return [
          {
            kind: "modifyComponent",
            entityId: recordId,
            component: EpistemicComponents.record,
            patch,
            reason: "holder revised their epistemic state",
          },
          {
            kind: "emitEvent",
            eventType: "epistemic-state.revised",
            actorId: c.command.actorId,
            targetId: recordId,
            data: {
              stance: String(patch.stance ?? current.stance ?? "undecided"),
              confidence: Number(patch.confidence ?? current.confidence ?? 0),
              understanding: Number(patch.understanding ?? current.understanding ?? 0),
            },
            visibility: "private",
          },
        ];
      },
    });

    ctx.registerReactionRule({
      id: "epistemic-state.acquire_requested.materialize",
      eventType: EpistemicEvents.acquisitionRequested,
      react: (c) => {
        const holderId = c.event.actorId;
        if (!holderId || !c.world.hasEntity(holderId)) return [];
        const canonicalKnowledgeId = optionalString(c.event.data.canonicalKnowledgeId);
        const claimEntityId = optionalString(c.event.data.claimEntityId);
        if (!canonicalKnowledgeId && !claimEntityId) return [];
        if (findRecord(c.world, holderId, canonicalKnowledgeId, claimEntityId)) return [];
        return createRecordEffects({
          holderId,
          canonicalKnowledgeId,
          claimEntityId,
          awareness: awarenessOf(c.event.data.awareness),
          stance: stanceOf(c.event.data.stance),
          confidence: clamp01(Number(c.event.data.confidence ?? 0.5)),
          understanding: clamp01(Number(c.event.data.understanding ?? 0.25)),
          basisRefs: uniqueStrings([
            ...stringArray(c.event.data.basisRefs),
            ...(c.event.targetId ? [c.event.targetId] : []),
          ]),
          source: String(c.event.data.source ?? c.event.owner ?? "event"),
          tick: c.world.tick,
          rngId: c.rng.nextInt(1, 1_000_000_000),
        });
      },
    });

    ctx.registerProjection({
      id: "epistemic-state.holder",
      description: "One holder's current epistemic records; absence means unaware.",
      build: ({ world, params }) => {
        const holderId = String(params.holderId ?? "");
        if (!holderId || !world.hasEntity(holderId)) return { exists: false, records: [] };
        const records = world
          .listRelations({ type: EpistemicRelations.holds, from: holderId })
          .map((relation) => world.getEntity(relation.to))
          .filter((entity): entity is NonNullable<typeof entity> => Boolean(entity && entity.kind === EpistemicKinds.record))
          .map((entity) => ({ id: entity.id, ...entity.components[EpistemicComponents.record] }));
        return { exists: true, holderId, records };
      },
    });
  },
};

function createRecordEffects(input: {
  holderId: string;
  canonicalKnowledgeId?: string;
  claimEntityId?: string;
  awareness: EpistemicAwareness;
  stance: EpistemicStance;
  confidence: number;
  understanding: number;
  basisRefs: string[];
  source: string;
  tick: number;
  rngId: number;
}): Effect[] {
  const recordId = `epistemic-state:record:${input.tick}:${input.rngId}`;
  return [
    {
      kind: "spawnEntity",
      localId: "epistemicRecord",
      id: recordId,
      entityKind: EpistemicKinds.record,
      components: {
        [EpistemicComponents.record]: {
          ...(input.canonicalKnowledgeId ? { canonicalKnowledgeId: input.canonicalKnowledgeId } : {}),
          ...(input.claimEntityId ? { claimEntityId: input.claimEntityId } : {}),
          awareness: input.awareness,
          stance: input.stance,
          confidence: input.confidence,
          understanding: input.understanding,
          basisRefs: uniqueStrings(input.basisRefs),
          source: input.source,
          firstEncounteredAt: input.tick,
          updatedAt: input.tick,
        },
      },
      announce: false,
    },
    {
      kind: "addRelation",
      type: EpistemicRelations.holds,
      from: input.holderId,
      to: recordId,
      announce: false,
    },
    {
      kind: "emitEvent",
      eventType: "epistemic-state.acquired",
      actorId: input.holderId,
      targetId: recordId,
      data: {
        ...(input.canonicalKnowledgeId ? { canonicalKnowledgeId: input.canonicalKnowledgeId } : {}),
        ...(input.claimEntityId ? { claimEntityId: input.claimEntityId } : {}),
        awareness: input.awareness,
        stance: input.stance,
        confidence: input.confidence,
        understanding: input.understanding,
      },
      visibility: "private",
    },
  ];
}

function findRecord(
  world: WorldView,
  holderId: string,
  canonicalKnowledgeId?: string,
  claimEntityId?: string,
) {
  for (const relation of world.listRelations({ type: EpistemicRelations.holds, from: holderId })) {
    const entity = world.getEntity(relation.to);
    if (!entity || entity.kind !== EpistemicKinds.record || entity.archivedAt !== undefined) continue;
    const state = entity.components[EpistemicComponents.record] ?? {};
    if (canonicalKnowledgeId && state.canonicalKnowledgeId === canonicalKnowledgeId) return entity;
    if (claimEntityId && state.claimEntityId === claimEntityId) return entity;
  }
  return undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function awarenessOf(value: unknown): EpistemicAwareness {
  return value === "heard" ? "heard" : "examined";
}

function stanceOf(value: unknown): EpistemicStance {
  return value === "accepts" || value === "rejects" ? value : "undecided";
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
