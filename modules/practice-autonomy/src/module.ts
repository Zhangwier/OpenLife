/**
 * Minimal autonomous Checkpoint resolver for Practice.
 *
 * It deliberately does not know skills, intelligence or personality yet. It
 * proves only that autonomous actors can consume the exact same Checkpoint and
 * resolve it through the exact same command path as a manually controlled actor.
 */

import type { OpenLifeModule } from "@openlife/contracts";
import { PracticeComponents, PracticeRelations } from "@openlife/module-practice-runtime";

const OWNER = "practice-autonomy";
const RESOLVE_TASK = "practice-autonomy.resolve_checkpoint";

export const practiceAutonomyModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "Practice Autonomy Prototype",
    description: "Deterministic autonomous resolution of Practice checkpoints through normal commands.",
    requires: ["practice.runtime"],
    provides: ["practice.autonomy"],
    capabilities: ["rule.reaction.register", "schedule.register"],
  },

  register(ctx) {
    ctx.registerTask({
      type: RESOLVE_TASK,
      description: "Let an autonomous Practice participant choose one pending checkpoint action.",
      handler: (c) => {
        const checkpointId = String(c.payload.checkpointId ?? "");
        const checkpoint = checkpointId ? c.world.getEntity(checkpointId) : undefined;
        const state = checkpoint?.components[PracticeComponents.checkpoint];
        if (!checkpoint || checkpoint.archivedAt !== undefined || state?.status !== "pending") return undefined;

        const practiceId = String(state.practiceId ?? "");
        if (!practiceId) return undefined;
        const resolverRole = typeof state.resolverRole === "string" ? state.resolverRole : "";
        const autonomous = c.world
          .listRelations({ type: PracticeRelations.participatesIn, to: practiceId })
          .map((relation) => ({
            actorId: relation.from,
            meta: relation.components[PracticeComponents.participation] ?? {},
          }))
          .filter((entry) => entry.meta.decisionMode === "autonomous")
          .filter((entry) => !resolverRole || entry.meta.role === resolverRole)
          .sort((a, b) => a.actorId.localeCompare(b.actorId))[0];
        if (!autonomous) return undefined;

        const actions = Array.isArray(state.candidateActions)
          ? state.candidateActions.flatMap((value) => {
              if (!value || typeof value !== "object" || Array.isArray(value)) return [];
              const action = value as Record<string, unknown>;
              const id = typeof action.id === "string" ? action.id : "";
              if (!id) return [];
              const rawWeight = Number(action.autonomyWeight);
              return [{
                id,
                weight: Number.isFinite(rawWeight) ? Math.max(0, rawWeight) : 1,
              }];
            })
          : [];
        if (actions.length === 0) return undefined;

        const totalWeight = actions.reduce((sum, action) => sum + action.weight, 0);
        let cursor = c.rng.nextFloat() * (totalWeight || actions.length);
        let selected = actions[actions.length - 1]!.id;
        for (const action of actions) {
          cursor -= totalWeight > 0 ? action.weight : 1;
          if (cursor <= 0) {
            selected = action.id;
            break;
          }
        }

        c.note("autonomous practice checkpoint decision", {
          checkpointId,
          practiceId,
          actorId: autonomous.actorId,
          actionId: selected,
        });
        return {
          command: {
            type: "practice-runtime.resolve_checkpoint",
            actorId: autonomous.actorId,
            targetId: checkpointId,
            payload: { checkpointId, actionId: selected },
            source: "autosim",
          },
        };
      },
    });

    ctx.registerReactionRule({
      id: "practice-autonomy.checkpoint_created.schedule",
      eventType: "practice-runtime.checkpoint_created",
      react: (c) => {
        const checkpointId = c.event.targetId;
        const practiceId = String(c.event.data.practiceId ?? "");
        if (!checkpointId || !practiceId) return [];
        const checkpoint = c.world.getEntity(checkpointId);
        const resolverRole = typeof checkpoint?.components[PracticeComponents.checkpoint]?.resolverRole === "string"
          ? String(checkpoint.components[PracticeComponents.checkpoint]?.resolverRole)
          : "";
        const hasAutonomousParticipant = c.world
          .listRelations({ type: PracticeRelations.participatesIn, to: practiceId })
          .some((relation) => {
            const meta = relation.components[PracticeComponents.participation] ?? {};
            return meta.decisionMode === "autonomous" && (!resolverRole || meta.role === resolverRole);
          });
        if (!hasAutonomousParticipant) return [];
        return [{
          kind: "scheduleTask",
          taskType: RESOLVE_TASK,
          afterTicks: 1,
          payload: { checkpointId },
          dedupeKey: `resolve:${checkpointId}`,
        }];
      },
    });
  },
};
