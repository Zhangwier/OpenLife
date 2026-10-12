/**
 * M3-C: one bounded, shared NPC day-boundary entry point.
 * Call only after a real one-day advance. Never backfill skipped years or
 * run on save/load; the persisted NPC daily marker prevents re-execution.
 */
import type { Simulation } from "@openlife/simulation";
import { SettlementId } from "@openlife/module-settlement-locations";
import { reading as clockReading } from "@openlife/module-world-clock";
import { runFirstNpcDay } from "./npc.ts";
import { runSecondNpcDay } from "./npc-cook.ts";
import { runThirdNpcDay } from "./npc-reed.ts";
import { runOtherNpcDays } from "./npc-general.ts";

export interface VillageDayBoundary {
  ran: boolean;
  fromTick: number;
  tick: number;
  notes: string[];
}

export function runVillageDayBoundary(sim: Simulation, fromTick: number): VillageDayBoundary {
  const tick = sim.tick;
  if (!Number.isInteger(fromTick) || tick - fromTick !== 1 ||
      clockReading(sim.worldView()).legacyScale ||
      !sim.worldView().getEntity(SettlementId)) {
    return { ran: false, fromTick, tick, notes: [] };
  }
  const cook = runSecondNpcDay(sim);
  const reed = runThirdNpcDay(sim);
  const farmer = runFirstNpcDay(sim);
  const others = runOtherNpcDays(sim);
  sim.syncHistory();
  return { ran: [cook, reed, farmer, ...others].some(a => !a.skipped), fromTick, tick,
    notes: [cook, reed, farmer, ...others].map(a => a.note) };
}
