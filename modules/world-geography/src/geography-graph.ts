/**
 * Geography Graph - the query layer over stored geography facts.
 *
 * This file contains **no state**. It is a set of pure read functions over a
 * `WorldView`, plus one small index type used to avoid re-walking relations
 * during a single multi-query pass.
 *
 * Two rules shape everything here:
 *
 *   1. **Stored facts**: exactly three relation types and two kinds carry
 *      spatial truth - `contains`, `adjacent_to` (+ its `connection` component)
 *      and `boundary_anchored_at`. Nothing else is authored.
 *
 *   2. **Derived facts**: Region adjacency, connectivity and connected
 *      components are computed on every call from the stored adjacency. They
 *      are never written to the world. Delete the cross-region edge and the
 *      region adjacency vanishes with it - that property is tested explicitly,
 *      because it is the whole reason this layer exists instead of a graph DB.
 *
 * `distance` and `terrainCost` are *spatial connection facts only*. Nothing in
 * this file multiplies, sums or interprets them. `travelCost`, walk time, army
 * speed and shipping price are Travel / Logistics concerns that will read this
 * same graph with their own models.
 */

import type { WorldView } from "@openlife/contracts";
import { GeographyComponents as COMPONENTS, GeographyKinds as KINDS, GeographyRelations as RELATIONS } from "./ids.ts";
import type { WorldEdge } from "./ids.ts";

export type { WorldEdge } from "./ids.ts";
export { WORLD_EDGES, OPPOSITE_EDGE, isWorldEdge } from "./ids.ts";

export const GeographyGraphIds = { KINDS, COMPONENTS, RELATIONS } as const;

export interface RegionSnapshot {
  id: string;
  name: string;
  type: string;
  /** Locations contained by this region, sorted by id. */
  locationIds: string[];
  /** True while the region entity is not archived. */
  active: boolean;
}

export interface LocationSnapshot {
  id: string;
  name: string;
  type: string;
  /** Region containing this location; `undefined` only for a malformed world. */
  regionId: string | undefined;
  /** Entities currently placed at this location. */
  occupants: string[];
  active: boolean;
}

/** One directional half of a stored adjacency, with its spatial metadata. */
export interface ConnectionFact {
  from: string;
  to: string;
  /** Abstract kilometres. Raw fact; not a travel cost. */
  distance: number;
  /** Positive terrain multiplier. Raw fact; not a travel cost. */
  terrainCost: number | undefined;
}

export interface AdjacencyEntry {
  locationId: string;
  distance: number;
  terrainCost: number | undefined;
}

export interface BoundaryAnchorSnapshot {
  id: string;
  type: string;
  edge: WorldEdge;
  locationId: string;
  compatibilityTags: string[];
  /**
   * Anchor types this anchor may meet. Empty means "no declared restriction";
   * the compatibility rules still apply.
   */
  acceptsTypes: string[];
  /** Pack id derived from the entity id (`<packId>:boundary_anchor:<localId>`). */
  packId: string;
}

/**
 * Reserved name for the object two matched boundary anchors will form.
 * Step 2 deliberately does not produce or store these.
 */
export interface BoundarySeamCandidate {
  westAnchorId: string;
  eastAnchorId: string;
  sharedTags: string[];
}

export interface RegionNeighborSnapshot {
  regionId: string;
  /** How many location-to-location connections cross the border. */
  borderConnectionCount: number;
  /** Shortest authored border distance; not a route length. */
  minDistanceKm: number;
  borderPairs: Array<{ fromLocationId: string; toLocationId: string; distanceKm: number }>;
}

/**
 * A one-pass view of the geography graph.
 *
 * Multi-query callers (the inspector, the invariants checker) build this once
 * so an N-location scan stays O(N + E) instead of O(N * E). Single-query
 * callers use the plain functions below, which build a throwaway index.
 */
export interface GeographyGraphIndex {
  world: WorldView;
  regionIds: string[];
  locationIds: string[];
  locationSet: ReadonlySet<string>;
  /** locationId -> containing regionId. */
  regionByLocation: ReadonlyMap<string, string>;
  /** locationId -> { locationId -> connection fact }. Symmetric. */
  adjacency: ReadonlyMap<string, ReadonlyMap<string, ConnectionFact>>;
  /** Logical undirected connections, deduplicated by unordered pair. */
  logicalConnections: ConnectionFact[];
  /** Logical connections whose two ends sit in different regions. */
  crossRegionConnections: ConnectionFact[];
  boundaryAnchors: BoundaryAnchorSnapshot[];
}

// --- index construction ----------------------------------------------------

export function buildGeometryIndex(world: WorldView): GeographyGraphIndex {
  const regionIds = world
    .listEntities({ kind: KINDS.region })
    .map((entity) => entity.id)
    .sort();
  const locationIds = world
    .listEntities({ kind: KINDS.location })
    .map((entity) => entity.id)
    .sort();
  const locationSet = new Set(locationIds);

  const regionByLocation = new Map<string, string>();
  for (const relation of world.listRelations({ type: RELATIONS.contains })) {
    // First writer wins; duplicate containment is an invariant violation the
    // invariant checker reports, and quietly overwriting would hide it.
    if (!regionByLocation.has(relation.to)) regionByLocation.set(relation.to, relation.from);
  }

  const adjacency = new Map<string, Map<string, ConnectionFact>>();
  const logical = new Map<string, ConnectionFact>();
  const crossRegion: ConnectionFact[] = [];
  for (const relation of world.listRelations({ type: RELATIONS.adjacentTo })) {
    const data = relation.components[COMPONENTS.connection] ?? {};
    const fact: ConnectionFact = {
      from: relation.from,
      to: relation.to,
      distance: Number(data.distanceKm ?? 0),
      terrainCost: data.terrainCost === undefined ? undefined : Number(data.terrainCost),
    };
    let bucket = adjacency.get(fact.from);
    if (!bucket) {
      bucket = new Map();
      adjacency.set(fact.from, bucket);
    }
    bucket.set(fact.to, fact);

    const key = unorderedKey(fact.from, fact.to);
    if (!logical.has(key)) {
      logical.set(key, fact);
      const fromRegion = regionByLocation.get(fact.from);
      const toRegion = regionByLocation.get(fact.to);
      if (fromRegion !== undefined && toRegion !== undefined && fromRegion !== toRegion) {
        crossRegion.push(fact);
      }
    }
  }

  const boundaryAnchors = world
    .listEntities({ kind: KINDS.boundaryAnchor })
    .map(boundaryAnchorSnapshot)
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    world,
    regionIds,
    locationIds,
    locationSet,
    regionByLocation,
    adjacency,
    logicalConnections: [...logical.values()].sort(compareConnection),
    crossRegionConnections: [...crossRegion].sort(compareConnection),
    boundaryAnchors,
  };
}

// --- region ----------------------------------------------------------------

export function getRegion(index: GeographyGraphIndex, regionId: string): RegionSnapshot | undefined {
  const entity = index.world.getEntity(regionId);
  if (!entity || entity.kind !== KINDS.region) return undefined;
  const data = entity.components[COMPONENTS.region] ?? {};
  return {
    id: entity.id,
    name: String(data.name ?? ""),
    type: String(data.type ?? ""),
    locationIds: locationsInRegion(index, regionId),
    active: entity.archivedAt === undefined,
  };
}

export function listRegions(index: GeographyGraphIndex): RegionSnapshot[] {
  return index.regionIds.map((regionId) => getRegion(index, regionId) as RegionSnapshot);
}

export function locationsInRegion(index: GeographyGraphIndex, regionId: string): string[] {
  const out: string[] = [];
  for (const [locationId, owner] of index.regionByLocation) {
    if (owner === regionId) out.push(locationId);
  }
  return out.sort();
}

// --- location --------------------------------------------------------------

export function getLocation(index: GeographyGraphIndex, locationId: string): LocationSnapshot | undefined {
  const entity = index.world.getEntity(locationId);
  if (!entity || entity.kind !== KINDS.location) return undefined;
  const data = entity.components[COMPONENTS.location] ?? {};
  return {
    id: entity.id,
    name: String(data.name ?? ""),
    type: String(data.type ?? ""),
    regionId: index.regionByLocation.get(locationId),
    occupants: index.world
      .listRelations({ type: RELATIONS.locatedAt, to: locationId })
      .map((relation) => relation.from)
      .sort(),
    active: entity.archivedAt === undefined,
  };
}

export function regionOf(index: GeographyGraphIndex, locationId: string): string | undefined {
  return index.regionByLocation.get(locationId);
}

// --- connection ------------------------------------------------------------

export function connectionBetween(
  index: GeographyGraphIndex,
  a: string,
  b: string,
): ConnectionFact | undefined {
  return index.adjacency.get(a)?.get(b);
}

export function neighborsOf(index: GeographyGraphIndex, locationId: string): AdjacencyEntry[] {
  const bucket = index.adjacency.get(locationId);
  if (!bucket) return [];
  return [...bucket.values()]
    .map((fact) => ({
      locationId: fact.to,
      distance: fact.distance,
      terrainCost: fact.terrainCost,
    }))
    .sort((a, b) => a.locationId.localeCompare(b.locationId));
}

export function areAdjacent(index: GeographyGraphIndex, a: string, b: string): boolean {
  return index.adjacency.get(a)?.has(b) === true;
}

// --- derived region adjacency ----------------------------------------------

/**
 * Region adjacency is DERIVED, never stored.
 *
 * It exists exactly where the world contains a stored location-to-location
 * connection whose two ends sit in different regions. The function walks the
 * stored adjacency on every call, so a map pack that stitches a new border
 * location into an existing region makes the new region neighbour appear with
 * no migration, no rebuild step and no second source of truth.
 */
export function adjacentRegions(index: GeographyGraphIndex, regionId: string): RegionNeighborSnapshot[] {
  const byRegion = new Map<string, RegionNeighborSnapshot>();

  for (const fact of index.crossRegionConnections) {
    const fromRegion = index.regionByLocation.get(fact.from);
    const toRegion = index.regionByLocation.get(fact.to);
    if (fromRegion === undefined || toRegion === undefined) continue;
    // A connection is undirected, so it contributes to both endpoints' views.
    if (fromRegion !== regionId && toRegion !== regionId) continue;
    const otherRegion = fromRegion === regionId ? toRegion : fromRegion;
    const selfLocation = fromRegion === regionId ? fact.from : fact.to;
    const otherLocation = fromRegion === regionId ? fact.to : fact.from;

    const entry = byRegion.get(otherRegion) ?? {
      regionId: otherRegion,
      borderConnectionCount: 0,
      minDistanceKm: Number.POSITIVE_INFINITY,
      borderPairs: [],
    };
    entry.borderConnectionCount += 1;
    entry.minDistanceKm = Math.min(entry.minDistanceKm, fact.distance);
    entry.borderPairs.push({
      fromLocationId: selfLocation,
      toLocationId: otherLocation,
      distanceKm: fact.distance,
    });
    byRegion.set(otherRegion, entry);
  }

  return [...byRegion.values()]
    .map((entry) => ({
      ...entry,
      minDistanceKm: Number.isFinite(entry.minDistanceKm) ? entry.minDistanceKm : 0,
      borderPairs: entry.borderPairs.sort((a, b) =>
        a.fromLocationId.localeCompare(b.fromLocationId)
        || a.toLocationId.localeCompare(b.toLocationId)),
    }))
    .sort((a, b) => a.regionId.localeCompare(b.regionId));
}

export function regionGraph(index: GeographyGraphIndex): Array<{ regionId: string; adjacentTo: string[] }> {
  return index.regionIds.map((regionId) => ({
    regionId,
    adjacentTo: adjacentRegions(index, regionId).map((neighbor) => neighbor.regionId),
  }));
}

// --- topology --------------------------------------------------------------

/**
 * Breadth-first reachability over stored adjacency.
 *
 * This is a *topology* question, not a routing question: a high `terrainCost`
 * never makes a connection impassable. There is deliberately no A*, no cost
 * ordering and no path reconstruction - the graph is unweighted here on
 * purpose, because "shortest" is meaningless until a domain module supplies a
 * cost function and a mode of travel.
 */
export function isReachable(index: GeographyGraphIndex, a: string, b: string): boolean {
  if (a === b) return index.locationSet.has(a);
  if (!index.locationSet.has(a) || !index.locationSet.has(b)) return false;
  return reachableSet(index, a).has(b);
}

export function connectedComponent(index: GeographyGraphIndex, locationId: string): string[] {
  if (!index.locationSet.has(locationId)) return [];
  return [...reachableSet(index, locationId)].sort();
}

export function listConnectedComponents(index: GeographyGraphIndex): string[][] {
  const seen = new Set<string>();
  const components: string[][] = [];
  for (const start of index.locationIds) {
    if (seen.has(start)) continue;
    const component = [...reachableSet(index, start)].sort();
    for (const id of component) seen.add(id);
    components.push(component);
  }
  return components.sort((a, b) => b.length - a.length || (a[0] ?? "").localeCompare(b[0] ?? ""));
}

function reachableSet(index: GeographyGraphIndex, start: string): Set<string> {
  const visited = new Set<string>([start]);
  const queue: string[] = [start];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    const bucket = index.adjacency.get(current);
    if (!bucket) continue;
    for (const next of bucket.keys()) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  return visited;
}

// --- boundary anchors ------------------------------------------------------

export function boundaryAnchorsAt(index: GeographyGraphIndex, locationId: string): BoundaryAnchorSnapshot[] {
  return index.boundaryAnchors.filter((anchor) => anchor.locationId === locationId);
}

export function listBoundaryAnchors(index: GeographyGraphIndex): BoundaryAnchorSnapshot[] {
  return [...index.boundaryAnchors];
}

export function boundaryAnchorsByTag(index: GeographyGraphIndex, tag: string): BoundaryAnchorSnapshot[] {
  return index.boundaryAnchors.filter((anchor) => anchor.compatibilityTags.includes(tag));
}

export function boundaryAnchorsByEdge(index: GeographyGraphIndex, edge: string): BoundaryAnchorSnapshot[] {
  return index.boundaryAnchors.filter((anchor) => anchor.edge === edge);
}

function boundaryAnchorSnapshot(entity: {
  id: string;
  components: Record<string, Record<string, unknown>>;
  archivedAt?: number;
}): BoundaryAnchorSnapshot {
  const data = entity.components[COMPONENTS.boundaryAnchor] ?? {};
  return {
    id: entity.id,
    type: String(data.type ?? ""),
    edge: String(data.edge ?? "") as WorldEdge,
    locationId: String(data.locationId ?? ""),
    compatibilityTags: Array.isArray(data.compatibilityTags)
      ? data.compatibilityTags.map((tag) => String(tag))
      : [],
    acceptsTypes: Array.isArray(data.acceptsTypes)
      ? data.acceptsTypes.map((type) => String(type))
      : [],
    packId: entity.id.split(":")[0] ?? "",
  };
}

// --- helpers ---------------------------------------------------------------

function unorderedKey(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

function compareConnection(a: ConnectionFact, b: ConnectionFact): number {
  return a.from.localeCompare(b.from) || a.to.localeCompare(b.to);
}
