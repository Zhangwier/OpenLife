/**
 * Knowledge Transmission vertical slice.
 *
 * Teaching is modelled as a multi-participant Practice, not an instant copy.
 * The teacher must personally hold the canonical knowledge. The learner resolves
 * the understanding checkpoint and receives a new personal epistemic state whose
 * understanding/confidence are derived from, but never copied from, the teacher.
 */

import type { JsonValue, OpenLifeModule } from "@openlife/contracts";
import type { EpistemicStateApi } from "@openlife/module-epistemic-state";
import {
  PracticeComponents,
  PracticeRelations,
  type PracticeRuntimeApi,
} from "@openlife/module-practice-runtime";

const OWNER = "knowledge-transmission";

export const KnowledgeTransmissionDefinitions = {
  teachCanonicalKnowledge: "knowledge-transmission.teach-canonical-knowledge",
} as const;

export const knowledgeTransmissionModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "Knowledge Transmission Prototype",
    description: "Multi-participant teaching Practice that transfers personal understanding without cloning beliefs.",
    requires: ["practice.runtime", "cognition.epistemic-state"],
    provides: ["knowledge.transmission-practice"],
    capabilities: ["rule.reaction.register"],
  },

  register(ctx) {
    const practice = ctx.registry.capabilityImplementation("practice.runtime") as PracticeRuntimeApi | undefined;
    const epistemic = ctx.registry.capabilityImplementation("cognition.epistemic-state") as EpistemicStateApi | undefined;
    if (!practice || !epistemic) throw new Error("knowledge transmission requires Practice and Epistemic State implementations");

    practice.registerDefinition({
      id: KnowledgeTransmissionDefinitions.teachCanonicalKnowledge,
      category: "teaching",
      description: "One holder explains canonical knowledge to a learner who must interpret it for themselves.",
      stages: ["explain", "interpret"],
      canStart: ({ world, actorId, payload }) => {
        const context = objectValue(payload.context);
        const knowledgeId = stringValue(context.knowledgeId);
        const teacherId = stringValue(context.teacherId);
        const learnerId = stringValue(context.learnerId);
        if (!knowledgeId || !teacherId || !learnerId) {
          return { ok: false, code: "E_TRANSMISSION_CONTEXT", message: "teaching requires knowledgeId, teacherId and learnerId" };
        }
        if (teacherId !== actorId || stringValue(payload.role) !== "teacher") {
          return { ok: false, code: "E_TRANSMISSION_TEACHER", message: "Practice actor must be the declared teacher" };
        }
        if (learnerId === teacherId) {
          return { ok: false, code: "E_TRANSMISSION_LEARNER", message: "teaching requires a distinct learner" };
        }
        const learnerIsParticipant = participantHasRole(payload.participants, learnerId, "learner");
        if (!learnerIsParticipant) {
          return { ok: false, code: "E_TRANSMISSION_LEARNER", message: "learner must participate in the Practice with role learner" };
        }
        const teacherRecord = epistemic.findRecord(world, actorId, knowledgeId);
        if (!teacherRecord) {
          return { ok: false, code: "E_TRANSMISSION_TEACHER_KNOWLEDGE", message: "teacher does not personally hold this knowledge" };
        }
        if (Number(teacherRecord.state.understanding ?? 0) <= 0) {
          return { ok: false, code: "E_TRANSMISSION_TEACHER_UNDERSTANDING", message: "teacher has no usable understanding to transmit" };
        }
        return { ok: true };
      },
      advance: ({ world, practiceId, practice: state }) => {
        const accumulatedWork = Number(state.accumulatedWork ?? 0);
        const checkpointCount = Number(state.checkpointCount ?? 0);
        if (checkpointCount > 0) return { work: 1, nextStage: "interpret", complete: true };
        if (accumulatedWork < 1) return { work: 1, nextStage: "explain" };

        const context = objectValue(state.context);
        const knowledgeId = stringValue(context.knowledgeId);
        const teacherId = stringValue(context.teacherId);
        const learnerId = stringValue(context.learnerId);
        const teacherRecord = epistemic.findRecord(world, teacherId, knowledgeId);
        return {
          work: 1,
          nextStage: "interpret",
          checkpoint: {
            type: "learner-interpretation",
            interactionMode: "choice",
            resolverRole: "learner",
            context: {
              knowledgeId,
              teacherId,
              learnerId,
              teacherUnderstanding: Number(teacherRecord?.state.understanding ?? 0),
              prompt: "After the explanation and demonstration, how do you currently understand the claim?",
            },
            candidateActions: [
              {
                id: "understand-but-verify",
                label: "I understand the pattern, but I want to verify it myself before accepting it",
                autonomyWeight: 1,
              },
              {
                id: "accept-provisionally",
                label: "I provisionally accept the explanation and can restate its core idea",
                autonomyWeight: 1,
              },
            ],
          },
        };
      },
    });

    ctx.registerReactionRule({
      id: "knowledge-transmission.checkpoint_resolved.transfer",
      eventType: "practice-runtime.checkpoint_resolved",
      react: (c) => {
        if (c.event.data.definitionId !== KnowledgeTransmissionDefinitions.teachCanonicalKnowledge) return [];
        const practiceId = String(c.event.data.practiceId ?? "");
        const practiceEntity = practiceId ? c.world.getEntity(practiceId) : undefined;
        const state = practiceEntity?.components[PracticeComponents.practice] ?? {};
        const context = objectValue(state.context);
        const knowledgeId = stringValue(context.knowledgeId);
        const teacherId = stringValue(context.teacherId);
        const learnerId = stringValue(context.learnerId);
        if (!knowledgeId || !teacherId || !learnerId || c.event.actorId !== learnerId) return [];

        const learnerRelation = c.world.listRelations({
          type: PracticeRelations.participatesIn,
          from: learnerId,
          to: practiceId,
        })[0];
        if (learnerRelation?.components[PracticeComponents.participation]?.role !== "learner") return [];

        const teacherRecord = epistemic.findRecord(c.world, teacherId, knowledgeId);
        if (!teacherRecord) return [];
        const teacherUnderstanding = clamp01(Number(teacherRecord.state.understanding ?? 0));
        const teacherConfidence = clamp01(Number(teacherRecord.state.confidence ?? 0));
        const actionId = String(c.event.data.actionId ?? "");
        const accepts = actionId === "accept-provisionally";
        if (!accepts && actionId !== "understand-but-verify") return [];

        const understanding = clamp01(teacherUnderstanding * (accepts ? 0.65 : 0.78));
        const confidence = clamp01(teacherConfidence * (accepts ? 0.65 : 0.45));
        return [{
          kind: "emitEvent",
          eventType: "epistemic-state.acquire_requested",
          actorId: learnerId,
          targetId: c.event.targetId,
          data: {
            canonicalKnowledgeId: knowledgeId,
            awareness: "examined",
            stance: accepts ? "accepts" : "undecided",
            confidence,
            understanding,
            basisRefs: [teacherRecord.id, practiceId, String(c.event.targetId ?? "")].filter(Boolean),
            source: `teaching:${teacherId}`,
          },
          historicalSignificance: 0,
          visibility: "private",
        }];
      },
    });
  },
};

function objectValue(value: unknown): Record<string, JsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, JsonValue>;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function participantHasRole(value: unknown, participantId: string, role: string): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const record = item as Record<string, unknown>;
    return record.id === participantId && record.role === role;
  });
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
