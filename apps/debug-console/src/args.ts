/**
 * Debug console - command line parsing.
 *
 * Command syntax:  <command.type> [key=value ...]
 * Values are coerced to number / boolean / string.
 */

import type { CommandIntent, JsonValue } from "@openlife/contracts";

export interface ParsedLine {
  verb: string;
  positional: string[];
  options: Record<string, JsonValue>;
}

export function parseLine(line: string): ParsedLine | undefined {
  const tokens = tokenize(line);
  if (tokens.length === 0) return undefined;
  const verb = tokens[0] as string;
  const rest = tokens.slice(1);
  const positional: string[] = [];
  const options: Record<string, JsonValue> = {};
  for (const token of rest) {
    const equals = token.indexOf("=");
    if (equals <= 0) {
      positional.push(token);
      continue;
    }
    const key = token.slice(0, equals);
    options[key] = coerce(token.slice(equals + 1));
  }
  return { verb, positional, options };
}

function tokenize(line: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  let started = false;
  for (const char of line) {
    if (quote) {
      if (char === quote) quote = undefined;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      started = true;
      continue;
    }
    if (char === " " || char === "\t") {
      if (started || current.length > 0) tokens.push(current);
      current = "";
      started = false;
      continue;
    }
    current += char;
  }
  if (started || current.length > 0) tokens.push(current);
  return tokens;
}

function coerce(value: string): JsonValue {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (value !== "" && /^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

export function toCommandIntent(parsed: ParsedLine): CommandIntent {
  const payload: Record<string, JsonValue> = { ...parsed.options };
  const actorId = extractString(payload, "actor") ?? parsed.positional[0];
  const targetId = extractString(payload, "target");
  if (actorId) delete payload.actor;
  if (targetId) delete payload.target;
  return {
    type: parsed.verb,
    ...(actorId ? { actorId } : {}),
    ...(targetId ? { targetId } : {}),
    payload,
    source: "player",
  };
}

function extractString(payload: Record<string, JsonValue>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" ? value : undefined;
}
