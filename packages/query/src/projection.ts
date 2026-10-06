/**
 * Query / Projection layer (§63, §INV-005).
 *
 * Consumers never read raw world state. They ask for a projection, which is
 * built from a read-only view plus the history view and is scoped to a viewer.
 * That is how "an NPC must not know what the world knows" is enforced.
 */

import type {
  ProjectionRequest,
  ProjectionResult,
  WorldView,
  DeterministicRngLike,
} from "@openlife/contracts";
import { ErrorCode, fail } from "@openlife/contracts";
import type { DefinitionSet, Registered } from "@openlife/rule-engine";
import type { HistoryRuntime } from "@openlife/history-runtime";

export interface ProjectionRuntimeOptions {
  definitions: DefinitionSet;
  history: HistoryRuntime;
  worldView: () => WorldView;
  rng: () => DeterministicRngLike;
}

export class ProjectionRuntime {
  readonly #options: ProjectionRuntimeOptions;

  constructor(options: ProjectionRuntimeOptions) {
    this.#options = options;
  }

  list(): { id: string; owner: string; description?: string }[] {
    return this.#options.definitions.projections
      .active()
      .map((definition) => ({
        id: definition.id,
        owner: definition.owner,
        ...(definition.description ? { description: definition.description } : {}),
      }));
  }

  project(request: ProjectionRequest): ProjectionResult {
    const definition = this.#find(request.id);
    if (!definition) {
      return {
        ok: false,
        id: request.id,
        ...(request.viewerId ? { viewerId: request.viewerId } : {}),
        tick: this.#options.worldView().tick,
        data: {},
        error: { code: ErrorCode.UnknownProjection, message: `unknown projection: ${request.id}` },
      };
    }
    const world = this.#options.worldView();
    try {
      const data = definition.build({
        world,
        history: this.#options.history.view(),
        ...(request.viewerId ? { viewerId: request.viewerId } : {}),
        params: request.params ?? {},
        rng: this.#options.rng().fork(`projection:${request.id}`),
      });
      return {
        ok: true,
        id: request.id,
        ...(request.viewerId ? { viewerId: request.viewerId } : {}),
        tick: world.tick,
        data,
      };
    } catch (error) {
      return {
        ok: false,
        id: request.id,
        ...(request.viewerId ? { viewerId: request.viewerId } : {}),
        tick: world.tick,
        data: {},
        error: { code: ErrorCode.Internal, message: (error as Error).message },
      };
    }
  }

  /** Fails loudly instead of returning an empty projection. */
  require(request: ProjectionRequest): ProjectionResult {
    const result = this.project(request);
    if (!result.ok) {
      fail(ErrorCode.UnknownProjection, result.error?.message ?? "projection failed", {
        id: request.id,
      });
    }
    return result;
  }

  #find(id: string): Registered<import("@openlife/contracts").ProjectionDefinition> | undefined {
    return this.#options.definitions.projections.active().find((definition) => definition.id === id);
  }
}
