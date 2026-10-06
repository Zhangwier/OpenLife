/**
 * OpenLife Core Contract - Query / Projection (§63).
 *
 * No consumer (UI, AI, network) reads raw world state. Everything goes through
 * a projection so that perception fog can be enforced per observer.
 */

import type { ProjectionId } from "./ids.ts";

export interface ProjectionRequest {
  id: ProjectionId;
  viewerId?: string;
  params?: Record<string, unknown>;
}

export interface ProjectionResult {
  ok: boolean;
  id: ProjectionId;
  viewerId?: string;
  tick: number;
  data: Record<string, unknown>;
  error?: { code: string; message: string };
}

export interface QueryDefinition {
  id: string;
  owner: string;
  description?: string;
  /** Derived, non-persisted state computed on demand (§11). */
  compute(ctx: {
    world: import("./rule.ts").WorldView;
    history: import("./module.ts").HistoryView;
    params: Record<string, unknown>;
    viewerId?: string;
  }): unknown;
}
