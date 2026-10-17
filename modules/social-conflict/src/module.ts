/**
 * Social conflict ladder (lowest rungs).
 *
 * Conflict starts small and personal, and only grows when causes pile up:
 *
 *   quarrel (< 0.35)  ->  feud (< 0.7)  ->  vendetta (>= 0.7)
 *
 * Grievances are held by the aggrieved party about one other party, with the
 * list of causes kept for explainability (§16). They can be eased by amends
 * (deep vendettas need mediation, not just an apology), and serious ones can
 * be inherited by heirs, so a grudge outlives the person who held it (§92).
 *
 * Raids between settlements, alliances and war resolution are later rungs and
 * belong in their own module built on top of this one.
 */

import type { Effect, JsonValue, OpenLifeModule, WorldView } from "@openlife/contracts";

const OWNER = "social-conflict";
const CAPABILITY = "social.conflict";

export const ConflictComponents = { grievances: "social-conflict.grievances" } as const;

export type ConflictStage = "quarrel" | "feud" | "vendetta";
export type AmendsGesture = "apology" | "gift" | "mediation";

export interface GrievanceCause {
  cause: string;
  severity: number;
  at: number;
  inheritedFrom?: string;
}

export interface Grievance {
  intensity: number;
  stage: ConflictStage;
  causes: GrievanceCause[];
}

export interface GrievanceBook {
  byTarget: Record<string, Grievance>;
}

export interface ConflictApi {
  grievance(world: WorldView, holderId: string, targetId: string): Grievance | undefined;
}

export const ConflictTuning = {
  feudAt: 0.35,
  vendettaAt: 0.7,
  amends: { apology: 0.15, gift: 0.3, mediation: 0.45 } as Record<AmendsGesture, number>,
  inheritFactor: 0.6,
  maxCauses: 8,
} as const;

const STAGE_RANK: Record<ConflictStage, number> = { quarrel: 0, feud: 1, vendetta: 2 };
const STAGE_SIGNIFICANCE: Record<ConflictStage, number> = { quarrel: 0.02, feud: 0.2, vendetta: 0.4 };

export function stageOf(intensity: number): ConflictStage {
  if (intensity >= ConflictTuning.vendettaAt) return "vendetta";
  if (intensity >= ConflictTuning.feudAt) return "feud";
  return "quarrel";
}

export const socialConflictModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "Social Conflict Ladder",
    description: "Personal grievances that escalate quarrel -> feud -> vendetta, can be eased, and can be inherited.",
    provides: [CAPABILITY],
    capabilities: ["component.register", "command.register", "rule.constraint.register", "rule.resolution.register", "projection.register"],
  },

  register(ctx) {
    const api: ConflictApi = { grievance: (world, holder, target) => book(world, holder).byTarget[target] };
    ctx.provideCapability(CAPABILITY, api);

    ctx.registerComponent({ id: ConflictComponents.grievances, persist: true, description: "Grievances this entity holds against others." });
    ctx.registerCommand({ type: "social-conflict.record_grievance", description: "The actor was wronged by the target.", params: { cause: "what happened", severity: "0..1" } });
    ctx.registerCommand({ type: "social-conflict.make_amends", description: "The actor tries to ease the target's grievance against them.", params: { gesture: "apology | gift | mediation" } });
    ctx.registerCommand({ type: "social-conflict.inherit_grievances", description: "The actor (heir) takes up the serious grievances of the target (ancestor)." });

    const pair = (commandType: string) => ctx.registerConstraintRule({
      id: `${commandType}.parties`,
      commandType,
      evaluate: (c) => {
        const { actorId, targetId } = c.command;
        if (!actorId || !targetId || !c.world.hasEntity(actorId) || !c.world.hasEntity(targetId)) {
          return { ok: false, code: "E_CONFLICT_PARTIES", message: "both actor and target must exist" };
        }
        if (actorId === targetId) return { ok: false, code: "E_CONFLICT_SELF", message: "cannot be in conflict with oneself" };
        return { ok: true };
      },
    });
    pair("social-conflict.record_grievance");
    pair("social-conflict.make_amends");
    pair("social-conflict.inherit_grievances");

    ctx.registerConstraintRule({
      id: "social-conflict.record_grievance.payload",
      commandType: "social-conflict.record_grievance",
      evaluate: (c) => {
        const severity = Number(c.command.payload.severity);
        if (!c.command.payload.cause) return { ok: false, code: "E_CONFLICT_CAUSE", message: "a cause is required" };
        if (!Number.isFinite(severity) || severity <= 0 || severity > 1) return { ok: false, code: "E_CONFLICT_SEVERITY", message: "severity must be in (0, 1]" };
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: "social-conflict.record_grievance.resolve",
      commandType: "social-conflict.record_grievance",
      resolve: (c) => {
        const holder = c.command.actorId as string;
        const target = c.command.targetId as string;
        const current = book(c.world, holder);
        const prev = current.byTarget[target];
        const cause: GrievanceCause = { cause: String(c.command.payload.cause), severity: Number(c.command.payload.severity), at: c.world.tick };
        const intensity = round3(Math.min(1, (prev?.intensity ?? 0) + cause.severity));
        const next: Grievance = {
          intensity,
          stage: stageOf(intensity),
          causes: [...(prev?.causes ?? []), cause].slice(-ConflictTuning.maxCauses),
        };
        const effects: Effect[] = [write(holder, { ...current.byTarget, [target]: next }, "a new grievance")];
        if (!prev || STAGE_RANK[next.stage] > STAGE_RANK[prev.stage]) {
          effects.push({
            kind: "emitEvent",
            eventType: prev ? "social-conflict.escalated" : "social-conflict.started",
            actorId: holder,
            targetId: target,
            data: { stage: next.stage, from: prev?.stage ?? null, causes: next.causes.map((x) => x.cause) },
            historicalSignificance: STAGE_SIGNIFICANCE[next.stage],
          });
        }
        return effects;
      },
    });

    ctx.registerConstraintRule({
      id: "social-conflict.make_amends.allowed",
      commandType: "social-conflict.make_amends",
      evaluate: (c) => {
        const { actorId, targetId } = c.command;
        if (!actorId || !targetId) return { ok: true };
        const grievance = book(c.world, targetId).byTarget[actorId];
        if (!grievance) return { ok: false, code: "E_CONFLICT_NONE", message: "there is no grievance to ease" };
        const gesture = String(c.command.payload.gesture ?? "apology") as AmendsGesture;
        if (!(gesture in ConflictTuning.amends)) return { ok: false, code: "E_CONFLICT_GESTURE", message: "gesture must be apology, gift or mediation" };
        if (grievance.stage === "vendetta" && gesture !== "mediation") {
          return { ok: false, code: "E_CONFLICT_TOO_DEEP", message: "a vendetta needs a mediator; an apology or gift is not enough" };
        }
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: "social-conflict.make_amends.resolve",
      commandType: "social-conflict.make_amends",
      resolve: (c) => {
        const offender = c.command.actorId as string;
        const holder = c.command.targetId as string;
        const gesture = String(c.command.payload.gesture ?? "apology") as AmendsGesture;
        const current = book(c.world, holder);
        const prev = current.byTarget[offender]!;
        const intensity = round3(Math.max(0, prev.intensity - ConflictTuning.amends[gesture]));
        const byTarget = { ...current.byTarget };
        if (intensity <= 0) {
          delete byTarget[offender];
          return [
            write(holder, byTarget, `reconciled by ${gesture}`),
            { kind: "emitEvent", eventType: "social-conflict.reconciled", actorId: offender, targetId: holder, data: { gesture, from: prev.stage }, historicalSignificance: STAGE_SIGNIFICANCE[prev.stage] },
          ];
        }
        byTarget[offender] = { ...prev, intensity, stage: stageOf(intensity) };
        return [write(holder, byTarget, `eased by ${gesture}`)];
      },
    });

    ctx.registerResolutionRule({
      id: "social-conflict.inherit_grievances.resolve",
      commandType: "social-conflict.inherit_grievances",
      resolve: (c) => {
        const heir = c.command.actorId as string;
        const ancestor = c.command.targetId as string;
        const inherited = book(c.world, ancestor).byTarget;
        const current = book(c.world, heir);
        const byTarget = { ...current.byTarget };
        const passed: string[] = [];
        for (const [target, grievance] of Object.entries(inherited)) {
          if (STAGE_RANK[grievance.stage] < STAGE_RANK.feud || target === heir) continue;
          const own = byTarget[target];
          const intensity = round3(Math.min(1, Math.max(own?.intensity ?? 0, grievance.intensity * ConflictTuning.inheritFactor)));
          byTarget[target] = {
            intensity,
            stage: stageOf(intensity),
            causes: [...(own?.causes ?? []), ...grievance.causes.map((x) => ({ ...x, inheritedFrom: ancestor }))].slice(-ConflictTuning.maxCauses),
          };
          passed.push(target);
        }
        if (passed.length === 0) return [];
        return [
          write(heir, byTarget, "inherited grievances"),
          { kind: "emitEvent", eventType: "social-conflict.inherited", actorId: heir, targetId: ancestor, data: { targets: passed }, historicalSignificance: 0.15 },
        ];
      },
    });

    ctx.registerProjection({
      id: "social-conflict.grievances",
      description: "Grievances one entity holds.",
      build: ({ world, params }) => {
        const holderId = String(params.holderId ?? "");
        return { holderId, byTarget: book(world, holderId).byTarget };
      },
    });
  },
};

function book(world: WorldView, holderId: string): GrievanceBook {
  const raw = world.getComponent(holderId, ConflictComponents.grievances) as unknown as GrievanceBook | undefined;
  return { byTarget: { ...(raw?.byTarget ?? {}) } };
}

function write(holderId: string, byTarget: Record<string, Grievance>, reason: string): Effect {
  const value = { byTarget } as unknown as Record<string, JsonValue>;
  // setComponent (not a shallow patch) so removed targets really disappear.
  return { kind: "setComponent", entityId: holderId, component: ConflictComponents.grievances, value, reason };
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
