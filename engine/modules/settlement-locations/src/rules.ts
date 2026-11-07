/** Small rule-authoring helpers shared by settlement-locations source files. */

import type { OpenLifeModule } from "@openlife/contracts";

export type Registration = Parameters<OpenLifeModule["register"]>[0];

export function refuse(code: string, message: string) {
  return { ok: false as const, code, message };
}
