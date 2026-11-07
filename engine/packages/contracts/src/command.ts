/**
 * OpenLife Core Contract - Command.
 *
 * A command expresses intent ("what someone wants to do"). It never carries a
 * state mutation. Every external input (player, UI, AI, AutoSim, network,
 * module) is converted into a Command before reaching the kernel (§INV-002).
 */

import type { CommandId, CommandType, EntityId } from "./ids.ts";
import type { JsonValue } from "./entity.ts";
import type { SimTick } from "./time.ts";

export type CommandSource = "player" | "ai" | "autosim" | "module" | "system" | "network";

export interface Command {
  id: CommandId;
  type: CommandType;
  /** Entity that performs the command (character, organisation, ...). */
  actorId?: EntityId;
  /** Entity the command is directed at, when applicable. */
  targetId?: EntityId;
  payload: Record<string, JsonValue>;
  source: CommandSource;
  /** Simulation tick the command was issued at. */
  issuedAt: SimTick;
}

/** Command as supplied by a caller before the kernel stamps id/tick. */
export interface CommandIntent {
  type: CommandType;
  actorId?: EntityId;
  targetId?: EntityId;
  payload?: Record<string, JsonValue>;
  source?: CommandSource;
}

export interface CommandResult {
  ok: boolean;
  commandId: CommandId;
  /** Errors when `ok === false`; empty otherwise. */
  errors: { code: string; message: string; details?: Record<string, unknown> }[];
  /** Events committed by this command (empty when rejected). */
  eventIds: string[];
  transactionId?: string;
  /** True when the command was rejected without touching world state. */
  rejected: boolean;
}
