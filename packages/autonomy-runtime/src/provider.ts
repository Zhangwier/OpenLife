/**
 * Autonomy Runtime (§40-§44).
 *
 * Every actor (human player, AutoSim, AI, NPC) is represented by a
 * DecisionProvider. A provider never touches world state: it observes a
 * projection and returns Commands, which then go through the normal kernel
 * pipeline. That is what keeps "AI has no world state" true (§INV-003).
 */

import type { CommandIntent, JsonValue } from "@openlife/contracts";

export interface DecisionOption {
  /** Command that would be issued if this option is chosen. */
  command: CommandIntent;
  /** Optional label for the debug console / UI. */
  label?: string;
  /** Provider-supplied weight; only meaningful to the provider itself. */
  weight?: number;
  /** Explanation recorded in the decision trace (§16). */
  reason?: string;
}

export interface DecisionContext {
  actorId: string;
  /** Projection data for this actor; never the raw world state. */
  view: Record<string, JsonValue>;
  tick: number;
  /** Ask for permission for a sensitive action (§42). */
  policy: AutonomyPolicy;
}

export interface DecisionProvider {
  readonly id: string;
  /** Returns the commands this actor wants to issue at the current tick. */
  decide(ctx: DecisionContext): DecisionOption[];
}

/**
 * Autonomy policy (§42): per-action authorisation, e.g. "daily spending: auto",
 * "marriage: always ask".
 */
export type AutonomyLevel = "auto" | "ask" | "never";

export interface AutonomyPolicy {
  /** Action category -> authorisation level. */
  rules: Record<string, AutonomyLevel>;
  /** Default level for categories not listed. */
  default: AutonomyLevel;
}

export const DEFAULT_POLICY: AutonomyPolicy = {
  rules: {},
  default: "ask",
};

export function policyLevel(policy: AutonomyPolicy, category: string): AutonomyLevel {
  return policy.rules[category] ?? policy.default;
}

export function makePolicy(rules: Record<string, AutonomyLevel>, fallback: AutonomyLevel = "ask"): AutonomyPolicy {
  return { rules: { ...rules }, default: fallback };
}
