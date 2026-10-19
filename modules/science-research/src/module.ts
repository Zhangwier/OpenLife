/**
 * Science Research vertical slice.
 *
 * This module proves that a domain can express real research as a Practice:
 * repeated observation creates a Checkpoint, a participant interprets the
 * evidence, and one interpretation becomes a traceable Insight that references
 * a registered Knowledge node. It deliberately does not promote personal
 * insight into civilization-wide knowledge yet.
 */

import type { OpenLifeModule, Effect } from "@openlife/contracts";
import {
  PracticeComponents,
  PracticeKinds,
  type PracticeRuntimeApi,
} from "@openlife/module-practice-runtime";

const OWNER = "science-research";

export const ScienceResearchDefinitions = {
  magneticDirection: "science-research.observe-magnetic-direction",
} as const;

export const ScienceResearchKnowledge = {
  magneticDirectionPattern: "science-research.magnetic-direction-pattern",
} as const;

export const ScienceResearchKinds = {
  insight: "science-research.insight",
} as const;

export const ScienceResearchComponents = {
  insight: "science-research.insight",
} as const;

export const ScienceResearchRelations = {
  derivedFromPractice: "science-research.derived_from_practice",
} as const;

export const scienceResearchModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "Science Research Prototype",
    description: "A minimal research Practice that turns observation and interpretation into traceable Insight.",
    requires: ["practice.runtime"],
    provides: ["science.research-practice"],
    capabilities: [
      "component.register",
      "relation.register",
      "knowledge.register",
      "rule.reaction.register",
      "projection.register",
    ],
  },

  register(ctx) {
    const practice = ctx.registry.capabilityImplementation("practice.runtime") as PracticeRuntimeApi | undefined;
    if (!practice) throw new Error("science research requires the practice.runtime implementation");

    ctx.registerKnowledge({
      id: ScienceResearchKnowledge.magneticDirectionPattern,
      kind: "observation",
      description: "Repeated observations suggest that a freely suspended magnet settles along a stable directional axis.",
      tags: ["physics", "magnetism", "observation"],
    });

    ctx.registerComponent({
      id: ScienceResearchComponents.insight,
      persist: true,
      description: "A researcher's interpretation tied to a registered Knowledge node and its source Practice.",
    });
    ctx.registerRelation({
      id: ScienceResearchRelations.derivedFromPractice,
      allowedFrom: [ScienceResearchKinds.insight],
      allowedTo: [PracticeKinds.practice],
      persist: true,
      description: "Connects an Insight to the Practice whose evidence produced it.",
    });

    practice.registerDefinition({
      id: ScienceResearchDefinitions.magneticDirection,
      category: "research",
      description: "Observe a freely moving magnet repeatedly and interpret its stable directional tendency.",
      stages: ["observe", "interpret"],
      advance: ({ practice: state }) => {
        const accumulatedWork = Number(state.accumulatedWork ?? 0);
        const checkpointCount = Number(state.checkpointCount ?? 0);
        if (checkpointCount > 0) {
          return { work: 1, nextStage: "interpret", complete: true };
        }
        if (accumulatedWork >= 2) {
          return {
            work: 1,
            nextStage: "interpret",
            checkpoint: {
              type: "interpret-observation",
              interactionMode: "choice",
              context: {
                question: "Repeated trials show the suspended magnet settling along nearly the same axis. What should you conclude next?",
                observations: [
                  "After being disturbed, the magnet returns to nearly the same axis.",
                  "Moving the apparatus nearby does not erase the tendency.",
                  "The repeated direction is more stable than random turning would suggest.",
                ],
              },
              candidateActions: [
                {
                  id: "repeat-observation",
                  label: "Treat the pattern as provisional and repeat more observations",
                  autonomyWeight: 0,
                },
                {
                  id: "propose-stable-direction",
                  label: "Propose that the magnet has a repeatable directional tendency",
                  autonomyWeight: 1,
                },
              ],
            },
          };
        }
        return { work: 1, nextStage: "observe" };
      },
    });

    ctx.registerReactionRule({
      id: "science-research.checkpoint_resolved.form_insight",
      eventType: "practice-runtime.checkpoint_resolved",
      react: (c): Effect[] => {
        if (c.event.data.definitionId !== ScienceResearchDefinitions.magneticDirection) return [];
        if (c.event.data.actionId !== "propose-stable-direction") return [];
        const practiceId = String(c.event.data.practiceId ?? "");
        const checkpointId = c.event.targetId ?? "";
        if (!practiceId || !checkpointId) return [];
        const practiceEntity = c.world.getEntity(practiceId);
        if (!practiceEntity || practiceEntity.kind !== PracticeKinds.practice) return [];
        const state = practiceEntity.components[PracticeComponents.practice] ?? {};
        const insightId = `science-research:insight:${c.world.tick}:${c.rng.nextInt(1, 1_000_000_000)}`;
        const thinkerId = c.event.actorId ?? "";
        return [
          {
            kind: "spawnEntity",
            localId: "insight",
            id: insightId,
            entityKind: ScienceResearchKinds.insight,
            components: {
              [ScienceResearchComponents.insight]: {
                knowledgeId: ScienceResearchKnowledge.magneticDirectionPattern,
                statement: "A freely suspended magnet appears to settle along a stable directional axis.",
                confidence: 0.62,
                formedAt: c.world.tick,
                thinkerId,
                sourceCheckpointId: checkpointId,
                sourcePracticeId: practiceId,
                practiceGoal: String(state.goal ?? ""),
              },
            },
            announce: false,
          },
          {
            kind: "addRelation",
            type: ScienceResearchRelations.derivedFromPractice,
            from: insightId,
            to: practiceId,
            announce: false,
          },
          {
            kind: "emitEvent",
            eventType: "science-research.insight_formed",
            actorId: thinkerId || undefined,
            targetId: insightId,
            data: {
              practiceId,
              checkpointId,
              knowledgeId: ScienceResearchKnowledge.magneticDirectionPattern,
              confidence: 0.62,
            },
            historicalSignificance: 0.2,
            visibility: "private",
          },
          {
            kind: "emitEvent",
            eventType: "epistemic-state.acquire_requested",
            actorId: thinkerId || undefined,
            targetId: insightId,
            data: {
              canonicalKnowledgeId: ScienceResearchKnowledge.magneticDirectionPattern,
              awareness: "examined",
              stance: "accepts",
              confidence: 0.62,
              understanding: 0.45,
              basisRefs: [checkpointId, practiceId],
              source: "science-research.insight",
            },
            historicalSignificance: 0,
            visibility: "private",
          },
        ];
      },
    });

    ctx.registerProjection({
      id: "science-research.insights",
      description: "Personal research insights without promoting them to civilization-wide accepted knowledge.",
      build: ({ world, params }) => {
        const thinkerId = String(params.thinkerId ?? "");
        const insights = world.listEntities({ kind: ScienceResearchKinds.insight }).filter((entity) => {
          if (!thinkerId) return true;
          return entity.components[ScienceResearchComponents.insight]?.thinkerId === thinkerId;
        });
        return {
          insights: insights.map((entity) => ({
            id: entity.id,
            ...entity.components[ScienceResearchComponents.insight],
          })),
        };
      },
    });
  },
};
