/**
 * Day phases: where villagers can be found while the player's day goes on
 * (map-life M3, first step).
 *
 * The village's real work is still done once per day by the village-day
 * agent, starting from where everyone stood when the day began. This rule only
 * moves residents through the day so the village looks lived in: in the middle
 * of the day each resident walks to their work place; in the evening they go
 * back. Every move is recorded first (where each one started), and before the
 * next day's routines run everyone is put back exactly there, so production,
 * hunger and routines are the same with or without these moves.
 *
 * Moves cost residents nothing and never move the clock. They are ordinary
 * validated effects, saved with the world; a phase never runs twice in a day.
 */
import type { Effect, JsonValue, WorldView } from "@openlife/contracts";
import { moveEffects, occupiedPlaceId, occupiedSpaceId } from "@openlife/module-world-space";
import type { Registration } from "./rules.ts";
import { SettlementCommands, SettlementId, residentId } from "./vocabulary.ts";
import { PLACES } from "./village-reads.ts";
import { RESIDENTS } from "./world-reads.ts";

export const DayPhase = {
  component: "settlement-locations.day-phase",
  command: SettlementCommands.dayPhase,
} as const;

/** 0 morning (as the day began), 1 at work, 2 evening (back where they began). */
export type Phase = 0 | 1 | 2;

interface PhaseState { day: number; phase: number; origins: Record<string, { placeId: string; spaceId: string }> }

function read(world: WorldView): PhaseState {
  const raw = world.getComponent(SettlementId, DayPhase.component) as Record<string, JsonValue> | undefined;
  const origins = raw?.origins && typeof raw.origins === "object" && !Array.isArray(raw.origins)
    ? raw.origins as unknown as PhaseState["origins"] : {};
  return { day: Number(raw?.day ?? -1), phase: Number(raw?.phase ?? 0), origins };
}

/** The phase of a day from how much of it the player has spent. */
export function phaseOf(used: number, capacity: number): Phase {
  const f = capacity > 0 ? used / capacity : 0;
  return f >= 0.75 ? 2 : f >= 0.25 ? 1 : 0;
}

/** The phase already applied today (0 when nothing moved yet). */
export function currentPhase(world: WorldView): number {
  const s = read(world);
  return s.day === world.tick ? s.phase : 0;
}

/** Whether anyone is away from where they began (and must be put back before routines run). */
export function anyoneAway(world: WorldView): boolean {
  return Object.keys(read(world).origins).length > 0;
}

const live = (world: WorldView, id: string) => {
  const e = world.getEntity(id);
  return Boolean(e && e.archivedAt === undefined && world.getComponent(id, "modern.vitals")?.alive !== false);
};

export function registerDayPhase(ctx: Registration): void {
  ctx.registerComponent({ id: DayPhase.component, persist: true, description: "where residents began today, while they are at work" });
  ctx.registerConstraintRule({
    id: `${DayPhase.command}.allowed`,
    commandType: DayPhase.command,
    evaluate: (c) => {
      if (!c.world.getEntity(SettlementId)) return { ok: false, code: "E_DAY_PHASE_NO_SETTLEMENT", message: "这里没有聚落。" };
      const phase = Number(c.command.payload.phase);
      if (phase === 0) return anyoneAway(c.world) ? { ok: true } : { ok: false, code: "E_DAY_PHASE_NOTHING", message: "大家都在原处。" };
      if (phase !== 1 && phase !== 2) return { ok: false, code: "E_DAY_PHASE_BAD", message: "没有这样的时辰。" };
      if (currentPhase(c.world) >= phase) return { ok: false, code: "E_DAY_PHASE_DONE", message: "这个时辰已经过了。" };
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${DayPhase.command}.resolve`,
    commandType: DayPhase.command,
    resolve: (c) => {
      const w = c.world, phase = Number(c.command.payload.phase) as Phase;
      const state = read(w);
      const effects: Effect[] = [];
      let origins = { ...state.origins };
      if (phase === 1) {
        for (const r of RESIDENTS) {
          const id = residentId(r.key);
          if (!live(w, id) || origins[id]) continue;
          const placeId = occupiedPlaceId(w, id);
          const work = PLACES.find((p) => p.id === r.workPlace);
          if (!placeId || !work || placeId === work.id || !PLACES.some((p) => p.id === placeId)) continue;
          origins[id] = { placeId, spaceId: occupiedSpaceId(w, id) };
          effects.push(...moveEffects(w, id, work.id, work.entrySpace, w.tick));
        }
      } else {
        for (const [id, at] of Object.entries(origins)) {
          if (live(w, id) && w.getEntity(at.placeId)) effects.push(...moveEffects(w, id, at.placeId, at.spaceId, w.tick));
        }
        origins = {};
      }
      const value = { day: w.tick, phase: phase === 0 ? currentPhase(w) : phase, origins } as unknown as Record<string, JsonValue>;
      effects.push(w.getComponent(SettlementId, DayPhase.component)
        ? { kind: "modifyComponent", entityId: SettlementId, component: DayPhase.component, patch: value, reason: "day phase" }
        : { kind: "setComponent", entityId: SettlementId, component: DayPhase.component, value, reason: "day phase" });
      effects.push({ kind: "emitEvent", eventType: "settlement-locations.day_phase", data: { phase, moved: effects.length }, historicalSignificance: 0 });
      return effects;
    },
  });
}
