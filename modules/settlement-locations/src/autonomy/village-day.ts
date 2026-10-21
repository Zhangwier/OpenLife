/**
 * The village's daily life, as one module-owned agent (M4-B).
 *
 * The kernel runs this agent once after every world tick it steps through,
 * whichever caller advanced the clock: the Web game, the debug console or
 * AutoSim. Residents act only through ordinary validated Commands, issued by
 * the agent host as `source: "ai"`. Each resident's persisted lastRoutineAt
 * marker keeps a day from running twice, including across save/load. Long
 * clock jumps are time skips: the kernel does not replay skipped days.
 */
import type { AgentHost, AgentStep } from "@openlife/contracts";
import { scaleIn } from "@openlife/life-contracts";
import { SettlementId, SettlementCommands } from "../vocabulary.ts";
import { familyDue, seasonTurnDue } from "../village-reads.ts";
import { runFirstNpcDay, type NpcDailyResult } from "./npc.ts";
import { runSecondNpcDay } from "./npc-cook.ts";
import { runThirdNpcDay } from "./npc-reed.ts";
import { runOtherNpcDays } from "./npc-general.ts";

export const VILLAGE_DAY_AGENT = "settlement-locations.village-day";

export interface VillageDayResident {
  actorId: string;
  skipped: boolean;
  actions: string[];
  note: string;
}

export interface VillageDayBoundary {
  ran: boolean;
  fromTick: number;
  tick: number;
  notes: string[];
  residents: VillageDayResident[];
}

/** One village day. Does nothing unless exactly one day-scale tick passed. */
export function runVillageDayBoundary(sim: AgentHost, fromTick: number): VillageDayBoundary {
  const tick = sim.tick;
  const world = sim.worldView();
  if (!Number.isInteger(fromTick) || tick - fromTick !== 1 ||
      scaleIn(world) !== "day" || !world.getEntity(SettlementId)) {
    return { ran: false, fromTick, tick, notes: [], residents: [] };
  }
  // 你家的日子也往前走一天：添丁、出生、孩子长大（没事就什么也不记）。
  const player = String(world.getComponent("modern:world", "modern.world_state")?.activeCharacterId ?? "");
  // 换季那天，村里这一季的大事。
  if (seasonTurnDue(world)) sim.dispatch({ type: SettlementCommands.seasonTurn, payload: {} });
  if (player && familyDue(world, player)) sim.dispatch({ type: SettlementCommands.familyTick, actorId: player, payload: {} });
  const cook = runSecondNpcDay(sim);
  const reed = runThirdNpcDay(sim);
  const farmer = runFirstNpcDay(sim);
  const others = runOtherNpcDays(sim);
  const all = [cook, reed, farmer, ...others] as NpcDailyResult[];
  return {
    ran: all.some(a => !a.skipped), fromTick, tick,
    notes: all.map(a => a.note),
    residents: all.map(a => ({ actorId: a.actorId, skipped: a.skipped, actions: [...a.actions], note: a.note })),
  };
}

/** Agent entry point registered by the settlement module. */
export function runVillageAgent(host: AgentHost, step: AgentStep): VillageDayBoundary {
  return runVillageDayBoundary(host, step.fromTick);
}
