/**
 * Shared vocabulary for optional economy system packs.
 *
 * The contract contains no simulation logic. Worlds without an economy module
 * simply never attach these components.
 */

export const EconomyComponents = {
  worldCycle: "economy.world_cycle",
  cityState: "economy.city_state",
} as const;

export type EconomyPhase = "steady" | "expansion" | "slowdown" | "recovery";

export interface EconomyWorldCycleComponent {
  phase: EconomyPhase;
  yearsInPhase: number;
  cycle: number;
}

export interface EconomyCityStateComponent {
  activity: EconomyPhase;
  housing: "cool" | "balanced" | "warm" | "tight";
}
