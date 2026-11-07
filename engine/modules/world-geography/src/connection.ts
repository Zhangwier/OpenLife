/**
 * The geography connection primitive.
 *
 * A connection between two locations is the single spatial fact that both
 * hand-authored map edges and boundary seams produce. This file is the *only*
 * place that decides:
 *
 *   - what makes a connection legal (endpoints, self-connection, duplicates,
 *     positive distance and terrain multiplier);
 *   - what shape the stored `adjacent_to` rows and their `connection` component
 *     take, including the symmetric pair;
 *   - how a connection is removed again.
 *
 * Both `world-geography.connect_locations` and the boundary handshake call into
 * here, so there is exactly one definition of "a geography connection" in the
 * system. The handshake does *not* dispatch a nested command: it asks this
 * module to build effects, and those effects join the handshake's own
 * transaction. That is what keeps a multi-seam join atomic.
 */

import type { Effect, WorldView } from "@openlife/contracts";
import { GeographyComponents, GeographyRelations } from "./ids.ts";

/** Why a proposed connection cannot be written. */
export interface ConnectionRejection {
  code: string;
  message: string;
}

export interface ConnectionParams {
  distanceKm: number;
  /** Positive multiplier stored alongside the distance. Defaults to 1. */
  terrainCost?: number;
  /** Optional audit breadcrumb, e.g. the seam that created this connection. */
  via?: string;
}

export interface ConnectionCheck {
  ok: boolean;
  rejection?: ConnectionRejection;
}

/** Component data written onto one directed half of a connection. */
export interface ConnectionComponentData {
  distanceKm: number;
  terrainCost: number;
  /** Optional audit breadcrumb, e.g. the seam that created this connection. */
  via?: string;
}

/**
 * Validates one proposed connection between two locations.
 *
 * Deliberately free of any dispatch or mutation: callers may run it for every
 * seam of a join *before* deciding to write any of them, which is how an
 * all-or-nothing join is built.
 *
 * `allowExisting` exists only so a caller that already checked for a duplicate
 * (the handshake, which reports its own conflict code) can skip the generic
 * duplicate check without duplicating the rest of the rules.
 */
export function validateLocationConnection(
  world: WorldView,
  fromLocationId: string,
  toLocationId: string,
  params: { distanceKm: number; terrainCost?: number },
  options: { allowExisting?: boolean } = {},
): ConnectionCheck {
  const from = world.getEntity(fromLocationId);
  if (!from || from.kind !== "world-geography.location" || from.archivedAt !== undefined) {
    return reject("E_GEOGRAPHY_FROM", `${fromLocationId} must be an existing location`);
  }
  const to = world.getEntity(toLocationId);
  if (!to || to.kind !== "world-geography.location" || to.archivedAt !== undefined) {
    return reject("E_GEOGRAPHY_TO", `${toLocationId} must be an existing location`);
  }
  if (fromLocationId === toLocationId) {
    return reject("E_GEOGRAPHY_SELF", `a location cannot be connected to itself: ${fromLocationId}`);
  }
  if (!Number.isFinite(params.distanceKm) || params.distanceKm <= 0) {
    return reject("E_GEOGRAPHY_DISTANCE", `distanceKm must be a positive number, received ${params.distanceKm}`);
  }
  if (params.terrainCost !== undefined && (!Number.isFinite(params.terrainCost) || params.terrainCost <= 0)) {
    return reject("E_GEOGRAPHY_TERRAIN_COST", `terrainCost must be a positive number, received ${params.terrainCost}`);
  }
  if (!options.allowExisting && isConnected(world, fromLocationId, toLocationId)) {
    return reject(
      "E_GEOGRAPHY_CONNECTED",
      `locations are already connected: ${fromLocationId} <-> ${toLocationId}`,
    );
  }
  return { ok: true };
}

/** True when either directed half of the connection is present. */
export function isConnected(world: WorldView, fromLocationId: string, toLocationId: string): boolean {
  return world.listRelations({
    type: GeographyRelations.adjacentTo,
    from: fromLocationId,
    to: toLocationId,
  }).length > 0;
}

/** The `connection` component payload for one directed half. */
export function connectionComponent(params: ConnectionParams): ConnectionComponentData {
  return {
    distanceKm: params.distanceKm,
    terrainCost: params.terrainCost ?? 1,
  };
}

/**
 * Builds both directed halves of a connection.
 *
 * Adjacency is stored symmetrically: every logical connection is two rows with
 * identical distance and terrain cost. Writing it anywhere else would let the
 * two directions drift apart, so this is the only builder.
 */
export function buildConnectionEffects(
  fromLocationId: string,
  toLocationId: string,
  params: ConnectionParams,
): Effect[] {
  const component = connectionComponent(params);
  const shared = {
    distanceKm: component.distanceKm,
    terrainCost: component.terrainCost,
    ...(params.via ? { via: params.via } : {}),
  };
  return [
    {
      kind: "addRelation",
      type: GeographyRelations.adjacentTo,
      from: fromLocationId,
      to: toLocationId,
      components: { [GeographyComponents.connection]: shared },
      announce: false,
    },
    {
      kind: "addRelation",
      type: GeographyRelations.adjacentTo,
      from: toLocationId,
      to: fromLocationId,
      components: { [GeographyComponents.connection]: shared },
      announce: false,
    },
  ];
}

/**
 * Builds the removal of both directed halves.
 *
 * Mirrors `buildConnectionEffects` so a connection is created and destroyed by
 * the same definition of its shape.
 */
export function buildDisconnectConnectionEffects(
  fromLocationId: string,
  toLocationId: string,
  reason: string,
): Effect[] {
  return [
    {
      kind: "removeRelation",
      type: GeographyRelations.adjacentTo,
      from: fromLocationId,
      to: toLocationId,
      reason,
      announce: false,
    },
    {
      kind: "removeRelation",
      type: GeographyRelations.adjacentTo,
      from: toLocationId,
      to: fromLocationId,
      reason,
      announce: false,
    },
  ];
}

function reject(code: string, message: string): ConnectionCheck {
  return { ok: false, rejection: { code, message } };
}
