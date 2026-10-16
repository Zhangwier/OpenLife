/**
 * Everyone without a village duty (farmer, cook, fuel gatherer) lives by the
 * shared brain (brain.ts): needs + personality + recipe/yield knowledge pick
 * each next step; no per-person schedule is authored.
 */
import type { AgentHost as NpcHost } from "@openlife/contracts";
import { people } from "../module.ts";
import { ROLES } from "./roles.ts";
import { runBrainDays } from "./brain.ts";

const SPECIAL = new Set([ROLES.farmer.id, ROLES.cook.id, ROLES.fuelGatherer.id]);
export function runOtherNpcDays(sim: NpcHost) {
  const list = (people(sim.worldView()).residents as Array<Record<string, unknown>>)
    .filter(p => !SPECIAL.has(String(p.id)));
  return runBrainDays(sim, list);
}
