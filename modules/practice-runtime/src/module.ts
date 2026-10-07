/**
 * Practice Runtime prototype.
 *
 * A Practice is a persistent, stateful activity carried out by one or more
 * world entities over time. This module owns only lifecycle mechanics. Domain
 * modules define how a Practice advances and interpret checkpoint resolutions.
 */

import type {
  DeterministicRngLike,
  Effect,
  JsonValue,
  OpenLifeModule,
  WorldView,
} from "@openlife/contracts";

const OWNER = "practice-runtime";
const ADVANCE_TASK = "practice-runtime.advance_task";
const RUNTIME_CAPABILITY = "practice.runtime";

export const PracticeKinds = {
  practice: "practice-runtime.practice",
  checkpoint: "practice-runtime.checkpoint",
} as const;

export const PracticeComponents = {
  practice: "practice-runtime.practice",
  checkpoint: "practice-runtime.checkpoint",
  participation: "practice-runtime.participation",
} as const;

export const PracticeRelations = {
  participatesIn: "practice-runtime.participates_in",
  hasCheckpoint: "practice-runtime.has_checkpoint",
} as const;

export type PracticeStatus = "active" | "blocked" | "paused" | "abandoned" | "completed" | "failed";

export interface PracticeCandidateAction {
  id: string;
  label: string;
  /** Player-facing tradeoff hint; domain wording, not hidden simulation math. */
  hint?: string;
  /** Disabled choices remain visible so players can understand what they are missing. */
  enabled?: boolean;
  disabledReason?: string;
  /** Optional neutral preference hint for simple autonomous resolvers. */
  autonomyWeight?: number;
}

export interface PracticeCheckpointSpec {
  type: string;
  interactionMode: string;
  /** Optional participant role that is allowed to resolve this checkpoint. */
  resolverRole?: string;
  context?: Record<string, JsonValue>;
  candidateActions?: PracticeCandidateAction[];
}

export interface PracticeStartContext {
  world: WorldView;
  actorId: string;
  payload: Readonly<Record<string, JsonValue>>;
}

export interface PracticeStartOutcome {
  ok: boolean;
  code?: string;
  message?: string;
}

export interface PracticeAdvanceContext {
  world: WorldView;
  practiceId: string;
  practice: Readonly<Record<string, unknown>>;
  rng: DeterministicRngLike;
}

export interface PracticeAdvanceDecision {
  /** Effective work added during this advance. This is effort, not discovery progress. */
  work: number;
  nextStage?: string;
  checkpoint?: PracticeCheckpointSpec;
  complete?: boolean;
}

export interface PracticeCheckpointResolutionContext {
  world: WorldView;
  practiceId: string;
  practice: Readonly<Record<string, unknown>>;
  checkpoint: Readonly<Record<string, unknown>>;
  resolverId: string;
  actionId: string;
  rng: DeterministicRngLike;
}

export interface PracticeCheckpointResolutionDecision {
  /** Domain-owned facts remembered by the Practice for later stages. */
  contextPatch?: Record<string, JsonValue>;
  nextStage?: string;
}

export interface PracticeDefinition {
  id: string;
  category: string;
  stages: string[];
  description?: string;
  /** Domain-owned start validation; Practice Runtime still owns lifecycle mutation. */
  canStart?(ctx: PracticeStartContext): PracticeStartOutcome;
  /** Domain interprets a choice; Runtime remains the only owner that mutates Practice lifecycle state. */
  resolveCheckpoint?(ctx: PracticeCheckpointResolutionContext): PracticeCheckpointResolutionDecision;
  advance(ctx: PracticeAdvanceContext): PracticeAdvanceDecision;
}

export interface PracticeParticipantInput {
  id: string;
  role: string;
  decisionMode: string;
}

export interface PracticeRuntimeApi {
  registerDefinition(definition: PracticeDefinition): void;
  getDefinition(id: string): PracticeDefinition | undefined;
  listDefinitions(): PracticeDefinition[];
}

export const practiceRuntimeModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "Practice Runtime Prototype",
    description: "Persistent activities and checkpoints shared by player and autonomous actors.",
    provides: [RUNTIME_CAPABILITY],
    capabilities: [
      "component.register",
      "relation.register",
      "command.register",
      "rule.constraint.register",
      "rule.resolution.register",
      "schedule.register",
      "projection.register",
    ],
  },

  register(ctx) {
    const definitions = new Map<string, PracticeDefinition>();
    const api: PracticeRuntimeApi = {
      registerDefinition(definition) {
        if (!definition.id.includes(".")) throw new Error(`practice definition id must be namespaced: ${definition.id}`);
        if (definitions.has(definition.id)) throw new Error(`practice definition already registered: ${definition.id}`);
        if (definition.stages.length === 0) throw new Error(`practice definition needs at least one stage: ${definition.id}`);
        definitions.set(definition.id, definition);
      },
      getDefinition: (id) => definitions.get(id),
      listDefinitions: () => [...definitions.values()],
    };
    ctx.provideCapability(RUNTIME_CAPABILITY, api);

    ctx.registerComponent({
      id: PracticeComponents.practice,
      persist: true,
      description: "Persistent state of one concrete Practice instance.",
    });
    ctx.registerComponent({
      id: PracticeComponents.checkpoint,
      persist: true,
      description: "A pending or resolved decision/interaction point inside a Practice.",
    });
    ctx.registerComponent({
      id: PracticeComponents.participation,
      persist: true,
      description: "Participant role metadata on a Practice relation.",
    });

    ctx.registerRelation({
      id: PracticeRelations.participatesIn,
      allowedTo: [PracticeKinds.practice],
      persist: true,
      description: "An actor participates in a Practice instance.",
    });
    ctx.registerRelation({
      id: PracticeRelations.hasCheckpoint,
      allowedFrom: [PracticeKinds.practice],
      allowedTo: [PracticeKinds.checkpoint],
      persist: true,
      description: "A Practice produced a Checkpoint.",
    });

    for (const [type, description] of [
      ["practice-runtime.start", "Start a persistent Practice instance."],
      ["practice-runtime.advance", "Advance one active Practice using its domain definition."],
      ["practice-runtime.resolve_checkpoint", "Resolve a pending Practice checkpoint."],
    ] as const) {
      ctx.registerCommand({ type, description });
    }

    ctx.registerTask({
      type: ADVANCE_TASK,
      description: "Advance one Practice after simulated time passes.",
      handler: (c) => {
        const practiceId = String(c.payload.practiceId ?? "");
        const practice = practiceId ? c.world.getEntity(practiceId) : undefined;
        const state = practice?.components[PracticeComponents.practice];
        if (!practice || practice.archivedAt !== undefined || state?.status !== "active") return undefined;
        return {
          command: {
            type: "practice-runtime.advance",
            targetId: practiceId,
            payload: { practiceId },
            source: "system",
          },
        };
      },
    });

    ctx.registerConstraintRule({
      id: "practice-runtime.start.allowed",
      commandType: "practice-runtime.start",
      evaluate: (c) => {
        const definitionId = String(c.command.payload.definitionId ?? "");
        if (!api.getDefinition(definitionId)) {
          return { ok: false, code: "E_PRACTICE_DEFINITION", message: `unknown practice definition: ${definitionId}` };
        }
        if (!c.command.actorId || !c.world.hasEntity(c.command.actorId)) {
          return { ok: false, code: "E_PRACTICE_ACTOR", message: "practice requires an existing actor" };
        }
        for (const participant of participantInputs(c.command.payload.participants)) {
          if (!c.world.hasEntity(participant.id)) {
            return { ok: false, code: "E_PRACTICE_PARTICIPANT", message: `practice participant does not exist: ${participant.id}` };
          }
        }
        const startOutcome = api.getDefinition(definitionId)?.canStart?.({
          world: c.world,
          actorId: c.command.actorId,
          payload: c.command.payload,
        });
        if (startOutcome && !startOutcome.ok) {
          return {
            ok: false,
            code: startOutcome.code ?? "E_PRACTICE_START",
            message: startOutcome.message ?? "practice cannot start in the current domain state",
          };
        }
        return { ok: true };
      },
    });

    ctx.registerResolutionRule({
      id: "practice-runtime.start.resolve",
      commandType: "practice-runtime.start",
      resolve: (c) => {
        const actorId = c.command.actorId as string;
        const definitionId = String(c.command.payload.definitionId);
        const definition = api.getDefinition(definitionId)!;
        const practiceId = `practice-runtime:practice:${c.world.tick}:${c.rng.nextInt(1, 1_000_000_000)}`;
        const goal = String(c.command.payload.goal ?? "");
        const context = objectValue(c.command.payload.context);
        const participants = new Map<string, PracticeParticipantInput>();
        participants.set(actorId, {
          id: actorId,
          role: String(c.command.payload.role ?? "lead"),
          decisionMode: String(c.command.payload.decisionMode ?? "manual"),
        });
        for (const participant of participantInputs(c.command.payload.participants)) {
          participants.set(participant.id, participant);
        }
        const effects: Effect[] = [
          {
            kind: "spawnEntity",
            localId: "practice",
            id: practiceId,
            entityKind: PracticeKinds.practice,
            components: {
              [PracticeComponents.practice]: {
                definitionId,
                category: definition.category,
                goal,
                stage: definition.stages[0]!,
                status: "active",
                startedAt: c.world.tick,
                lastAdvancedAt: c.world.tick,
                accumulatedWork: 0,
                checkpointCount: 0,
                activeCheckpointId: "",
                context,
              },
            },
            announce: false,
          },
          {
            kind: "scheduleTask",
            taskType: ADVANCE_TASK,
            afterTicks: 1,
            payload: { practiceId },
            dedupeKey: `advance:${practiceId}`,
          },
          {
            kind: "emitEvent",
            eventType: "practice-runtime.started",
            actorId,
            targetId: practiceId,
            data: { practiceId, definitionId, goal, participantCount: participants.size },
          },
        ];
        for (const participant of participants.values()) {
          effects.splice(effects.length - 2, 0, {
            kind: "addRelation",
            type: PracticeRelations.participatesIn,
            from: participant.id,
            to: practiceId,
            components: {
              [PracticeComponents.participation]: {
                role: participant.role,
                decisionMode: participant.decisionMode,
              },
            },
            announce: false,
          });
        }
        return effects;
      },
    });

    ctx.registerConstraintRule({
      id: "practice-runtime.advance.allowed",
      commandType: "practice-runtime.advance",
      evaluate: (c) => {
        const practiceId = String(c.command.payload.practiceId ?? c.command.targetId ?? "");
        const practice = c.world.getEntity(practiceId);
        const state = practice?.components[PracticeComponents.practice];
        if (!practice || practice.kind !== PracticeKinds.practice || practice.archivedAt !== undefined) {
          return { ok: false, code: "E_PRACTICE_MISSING", message: "practice does not exist" };
        }
        if (state?.status !== "active") {
          return { ok: false, code: "E_PRACTICE_NOT_ACTIVE", message: "practice is not active" };
        }
        if (!api.getDefinition(String(state.definitionId ?? ""))) {
          return { ok: false, code: "E_PRACTICE_DEFINITION", message: "practice definition is unavailable" };
        }
        return { ok: true };
      },
    });

    ctx.registerResolutionRule({
      id: "practice-runtime.advance.resolve",
      commandType: "practice-runtime.advance",
      resolve: (c) => {
        const practiceId = String(c.command.payload.practiceId ?? c.command.targetId);
        const entity = c.world.getEntity(practiceId)!;
        const state = entity.components[PracticeComponents.practice] ?? {};
        const definition = api.getDefinition(String(state.definitionId))!;
        const decision = definition.advance({ world: c.world, practiceId, practice: state, rng: c.rng });
        const work = Math.max(0, Number(decision.work) || 0);
        const accumulatedWork = Number(state.accumulatedWork ?? 0) + work;
        const stage = decision.nextStage && definition.stages.includes(decision.nextStage)
          ? decision.nextStage
          : String(state.stage ?? definition.stages[0]);

        if (decision.checkpoint) {
          const checkpointId = `practice-runtime:checkpoint:${c.world.tick}:${c.rng.nextInt(1, 1_000_000_000)}`;
          const checkpointCount = Number(state.checkpointCount ?? 0) + 1;
          return [
            {
              kind: "modifyComponent",
              entityId: practiceId,
              component: PracticeComponents.practice,
              patch: {
                accumulatedWork,
                stage,
                status: "blocked",
                lastAdvancedAt: c.world.tick,
                activeCheckpointId: checkpointId,
                checkpointCount,
              },
              reason: "practice reached a checkpoint",
            },
            {
              kind: "spawnEntity",
              localId: "checkpoint",
              id: checkpointId,
              entityKind: PracticeKinds.checkpoint,
              components: {
                [PracticeComponents.checkpoint]: {
                  practiceId,
                  definitionId: definition.id,
                  type: decision.checkpoint.type,
                  interactionMode: decision.checkpoint.interactionMode,
                  ...(decision.checkpoint.resolverRole ? { resolverRole: decision.checkpoint.resolverRole } : {}),
                  context: decision.checkpoint.context ?? {},
                  candidateActions: decision.checkpoint.candidateActions ?? [],
                  status: "pending",
                  createdAt: c.world.tick,
                },
              },
              announce: false,
            },
            {
              kind: "addRelation",
              type: PracticeRelations.hasCheckpoint,
              from: practiceId,
              to: checkpointId,
              announce: false,
            },
            {
              kind: "emitEvent",
              eventType: "practice-runtime.checkpoint_created",
              targetId: checkpointId,
              data: { practiceId, checkpointId, definitionId: definition.id, type: decision.checkpoint.type },
            },
          ];
        }

        if (decision.complete) {
          return [
            {
              kind: "modifyComponent",
              entityId: practiceId,
              component: PracticeComponents.practice,
              patch: { accumulatedWork, stage, status: "completed", lastAdvancedAt: c.world.tick },
              reason: "practice completed",
            },
            {
              kind: "emitEvent",
              eventType: "practice-runtime.completed",
              targetId: practiceId,
              data: { practiceId, definitionId: definition.id, accumulatedWork },
            },
          ];
        }

        return [
          {
            kind: "modifyComponent",
            entityId: practiceId,
            component: PracticeComponents.practice,
            patch: { accumulatedWork, stage, lastAdvancedAt: c.world.tick },
            reason: "practice accumulated effective work",
          },
          {
            kind: "scheduleTask",
            taskType: ADVANCE_TASK,
            afterTicks: 1,
            payload: { practiceId },
            dedupeKey: `advance:${practiceId}:${c.world.tick + 1}`,
          },
          {
            kind: "emitEvent",
            eventType: "practice-runtime.advanced",
            targetId: practiceId,
            data: { practiceId, definitionId: definition.id, work, accumulatedWork, stage },
          },
        ];
      },
    });

    ctx.registerConstraintRule({
      id: "practice-runtime.resolve_checkpoint.allowed",
      commandType: "practice-runtime.resolve_checkpoint",
      evaluate: (c) => {
        const checkpointId = String(c.command.payload.checkpointId ?? c.command.targetId ?? "");
        const checkpoint = c.world.getEntity(checkpointId);
        const state = checkpoint?.components[PracticeComponents.checkpoint];
        if (!checkpoint || checkpoint.kind !== PracticeKinds.checkpoint || state?.status !== "pending") {
          return { ok: false, code: "E_CHECKPOINT_PENDING", message: "checkpoint is not pending" };
        }
        const practiceId = String(state.practiceId ?? "");
        const resolverId = c.command.actorId;
        if (!resolverId) {
          return { ok: false, code: "E_CHECKPOINT_RESOLVER", message: "checkpoint resolution requires a participant" };
        }
        const participation = c.world.listRelations({
          type: PracticeRelations.participatesIn,
          from: resolverId,
          to: practiceId,
        })[0];
        if (!participation) {
          return { ok: false, code: "E_CHECKPOINT_RESOLVER", message: "resolver must participate in the practice" };
        }
        const resolverRole = typeof state.resolverRole === "string" ? state.resolverRole : "";
        const participantRole = String(participation.components[PracticeComponents.participation]?.role ?? "participant");
        if (resolverRole && participantRole !== resolverRole) {
          return { ok: false, code: "E_CHECKPOINT_ROLE", message: `checkpoint must be resolved by role: ${resolverRole}` };
        }
        const actionId = String(c.command.payload.actionId ?? "");
        const actions = Array.isArray(state.candidateActions) ? state.candidateActions : [];
        const selected = actions.find((value) => {
          if (!value || typeof value !== "object" || Array.isArray(value)) return false;
          return String((value as Record<string, unknown>).id ?? "") === actionId;
        }) as Record<string, unknown> | undefined;
        if (actions.length > 0 && !selected) {
          return { ok: false, code: "E_CHECKPOINT_ACTION", message: "checkpoint action is not available" };
        }
        if (selected?.enabled === false) {
          return {
            ok: false,
            code: "E_CHECKPOINT_ACTION_DISABLED",
            message: String(selected.disabledReason ?? "checkpoint action is currently unavailable"),
          };
        }
        return { ok: true };
      },
    });

    ctx.registerResolutionRule({
      id: "practice-runtime.resolve_checkpoint.resolve",
      commandType: "practice-runtime.resolve_checkpoint",
      resolve: (c) => {
        const checkpointId = String(c.command.payload.checkpointId ?? c.command.targetId);
        const checkpoint = c.world.getEntity(checkpointId)!;
        const checkpointState = checkpoint.components[PracticeComponents.checkpoint] ?? {};
        const practiceId = String(checkpointState.practiceId);
        const practice = c.world.getEntity(practiceId)!;
        const practiceState = practice.components[PracticeComponents.practice] ?? {};
        const actionId = String(c.command.payload.actionId ?? "");
        const resolverId = c.command.actorId ?? "";
        const definition = api.getDefinition(String(practiceState.definitionId ?? ""));
        const domainDecision = definition?.resolveCheckpoint?.({
          world: c.world,
          practiceId,
          practice: practiceState,
          checkpoint: checkpointState,
          resolverId,
          actionId,
          rng: c.rng,
        });
        const currentContext = objectValue(practiceState.context);
        const nextContext = domainDecision?.contextPatch
          ? { ...currentContext, ...domainDecision.contextPatch }
          : currentContext;
        const nextStage = domainDecision?.nextStage && definition?.stages.includes(domainDecision.nextStage)
          ? domainDecision.nextStage
          : String(practiceState.stage ?? definition?.stages[0] ?? "");
        return [
          {
            kind: "modifyComponent",
            entityId: checkpointId,
            component: PracticeComponents.checkpoint,
            patch: {
              status: "resolved",
              resolvedAt: c.world.tick,
              resolvedBy: resolverId,
              resolution: { actionId },
            },
            reason: "checkpoint resolved through the common Practice command path",
          },
          {
            kind: "modifyComponent",
            entityId: practiceId,
            component: PracticeComponents.practice,
            patch: {
              status: "active",
              activeCheckpointId: "",
              lastAdvancedAt: c.world.tick,
              stage: nextStage,
              context: nextContext,
            },
            reason: "resolved checkpoint allows the practice to continue",
          },
          {
            kind: "scheduleTask",
            taskType: ADVANCE_TASK,
            afterTicks: 1,
            payload: { practiceId },
            dedupeKey: `advance:${practiceId}:resume:${c.world.tick + 1}`,
          },
          {
            kind: "emitEvent",
            eventType: "practice-runtime.checkpoint_resolved",
            actorId: resolverId || undefined,
            targetId: checkpointId,
            data: {
              practiceId,
              checkpointId,
              definitionId: String(practiceState.definitionId ?? ""),
              actionId,
            },
          },
        ];
      },
    });

    ctx.registerProjection({
      id: "practice-runtime.interaction",
      description: "Player-facing active Practice interaction and its available choices.",
      build: ({ world, params }) => {
        const practiceId = String(params.practiceId ?? "");
        const participantId = String(params.participantId ?? "");
        const practice = practiceId ? world.getEntity(practiceId) : undefined;
        if (!practice || practice.kind !== PracticeKinds.practice) return { exists: false };
        const practiceState = practice.components[PracticeComponents.practice] ?? {};
        const checkpointId = String(practiceState.activeCheckpointId ?? "");
        if (!checkpointId) {
          return {
            exists: true,
            practiceId,
            status: String(practiceState.status ?? ""),
            stage: String(practiceState.stage ?? ""),
            interaction: null,
          };
        }
        const checkpoint = world.getEntity(checkpointId);
        const checkpointState = checkpoint?.components[PracticeComponents.checkpoint] ?? {};
        const participation = participantId
          ? world.listRelations({ type: PracticeRelations.participatesIn, from: participantId, to: practiceId })[0]
          : undefined;
        const participantRole = String(participation?.components[PracticeComponents.participation]?.role ?? "");
        const resolverRole = String(checkpointState.resolverRole ?? "");
        const canResolve = Boolean(participation) && (!resolverRole || participantRole === resolverRole);
        return {
          exists: true,
          practiceId,
          status: String(practiceState.status ?? ""),
          stage: String(practiceState.stage ?? ""),
          interaction: {
            checkpointId,
            type: String(checkpointState.type ?? ""),
            interactionMode: String(checkpointState.interactionMode ?? "choice"),
            resolverRole,
            participantRole,
            canResolve,
            context: checkpointState.context ?? {},
            actions: Array.isArray(checkpointState.candidateActions) ? checkpointState.candidateActions : [],
          },
        };
      },
    });

    ctx.registerProjection({
      id: "practice-runtime.practice",
      description: "Inspect one Practice without interpreting its domain-specific meaning.",
      build: ({ world, params }) => {
        const practiceId = String(params.practiceId ?? "");
        const entity = practiceId ? world.getEntity(practiceId) : undefined;
        if (!entity || entity.kind !== PracticeKinds.practice) return { exists: false };
        return {
          exists: true,
          id: entity.id,
          state: entity.components[PracticeComponents.practice] ?? {},
          participants: world.listRelations({ type: PracticeRelations.participatesIn, to: entity.id }).map((relation) => ({
            id: relation.from,
            role: relation.components[PracticeComponents.participation]?.role ?? "participant",
            decisionMode: relation.components[PracticeComponents.participation]?.decisionMode ?? "manual",
          })),
          checkpoints: world.listRelations({ type: PracticeRelations.hasCheckpoint, from: entity.id }).map((relation) => relation.to),
        };
      },
    });
  },
};

function participantInputs(value: unknown): PracticeParticipantInput[] {
  if (!Array.isArray(value)) return [];
  const participants: PracticeParticipantInput[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    if (!id) continue;
    participants.push({
      id,
      role: typeof record.role === "string" && record.role.trim() ? record.role.trim() : "participant",
      decisionMode: typeof record.decisionMode === "string" && record.decisionMode.trim()
        ? record.decisionMode.trim()
        : "manual",
    });
  }
  return participants;
}

function objectValue(value: unknown): Record<string, JsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...(value as Record<string, JsonValue>) };
}
