/**
 * World geography - spatial facts only.
 *
 * Geography owns stable spatial truth: regions, locations, containment,
 * adjacency/distance and where world entities currently are.
 *
 * Step 2 turns those stored facts into a *queryable topology*. The whole graph
 * layer here is a read/projection layer over Entity + Relation: there is no
 * second graph store, and Region adjacency is derived on every call rather than
 * written down. See `geography-graph.ts` for the query engine.
 *
 * Geography answers "where is this / what is next to this / is this connected
 * to that". It never answers "how long is the walk", "can an army pass",
 * "will a merchant bother" - those are Travel, Logistics, Climate and Migration
 * modules reading the same graph with their own cost models.
 */

import type { Effect, OpenLifeModule, WorldView } from "@openlife/contracts";
import {
  adjacentRegions,
  areAdjacent,
  boundaryAnchorsAt,
  boundaryAnchorsByEdge,
  boundaryAnchorsByTag,
  buildGeometryIndex,
  connectedComponent,
  connectionBetween,
  getLocation,
  getRegion,
  isReachable,
  listBoundaryAnchors,
  listConnectedComponents,
  listRegions,
  locationsInRegion,
  neighborsOf,
  regionOf,
  regionGraph,
} from "./geography-graph.ts";
import type {
  AdjacencyEntry,
  BoundaryAnchorSnapshot,
  ConnectionFact,
  GeographyGraphIndex,
  RegionNeighborSnapshot,
  RegionSnapshot,
  LocationSnapshot,
} from "./geography-graph.ts";
import {
  GeographyCommands,
  GeographyComponents,
  GeographyKinds,
  GeographyProjections,
  GeographyRelations,
  WORLD_EDGES,
  isWorldEdge,
} from "./ids.ts";
import {
  buildConnectionEffects,
  buildDisconnectConnectionEffects,
  isConnected,
  validateLocationConnection,
} from "./connection.ts";
import type { WorldEdge } from "./ids.ts";

const OWNER = "world-geography";

export {
  GeographyKinds,
  GeographyComponents,
  GeographyRelations,
  GeographyCommands,
  GeographyProjections,
  WORLD_EDGES,
  OPPOSITE_EDGE,
  isWorldEdge,
} from "./ids.ts";
export type { WorldEdge } from "./ids.ts";

export type {
  AdjacencyEntry,
  BoundaryAnchorSnapshot,
  ConnectionFact,
  GeographyGraphIndex,
  LocationSnapshot,
  RegionNeighborSnapshot,
  RegionSnapshot,
} from "./geography-graph.ts";

/**
 * GeographyApi v0.1 - the complete read surface.
 *
 * Every method is a pure function of `WorldView`; none of them mutate, cache
 * or persist. Callers pass the world they want to query, so the same API works
 * for a live simulation, a replay, or a save loaded three versions later.
 */
export interface GeographyApi {
  // --- Region -------------------------------------------------------------
  /** One region with its identity and member locations. */
  getRegion(world: WorldView, regionId: string): RegionSnapshot | undefined;
  /** Every region, sorted by id. */
  listRegions(world: WorldView): RegionSnapshot[];
  /** Location ids directly contained by a region, sorted. */
  locationsInRegion(world: WorldView, regionId: string): string[];
  /** Track changes to the resource definitions (command register hook). */

  // --- Location -----------------------------------------------------------
  /** One location with its region, neighbours and occupants. */
  getLocation(world: WorldView, locationId: string): LocationSnapshot | undefined;
  /** Every location, sorted by id. */
  listLocations(world: WorldView): LocationSnapshot[];
  /** The region containing this location, if any. */
  regionOf(world: WorldView, locationId: string): string | undefined;

  // --- Connection ---------------------------------------------------------
  /** The connection fact between two locations, in either direction. */
  connectionBetween(world: WorldView, a: string, b: string): ConnectionFact | undefined;
  /** Direct neighbours with their connection facts, sorted by location id. */
  neighborsOf(world: WorldView, locationId: string): AdjacencyEntry[];
  /** Whether the two locations are directly connected. */
  areAdjacent(world: WorldView, a: string, b: string): boolean;

  // --- Derived region adjacency -------------------------------------------
  /** Regions bordering this one, derived from cross-region location edges. */
  adjacentRegions(world: WorldView, regionId: string): RegionNeighborSnapshot[];
  /** Alias of `adjacentRegions`, kept because the name reads better in reports. */
  neighboringRegions(world: WorldView, regionId: string): RegionNeighborSnapshot[];

  // --- Topology -----------------------------------------------------------
  /** Is there any adjacency path between the two locations? */
  isReachable(world: WorldView, a: string, b: string): boolean;
  /** Every location topologically connected to this one, including itself. */
  connectedComponent(world: WorldView, locationId: string): string[];
  /** All connected components, largest first then by id. */
  listConnectedComponents(world: WorldView): string[][];

  // --- Boundary anchors ---------------------------------------------------
  boundaryAnchorsAt(world: WorldView, locationId: string): BoundaryAnchorSnapshot[];
  listBoundaryAnchors(world: WorldView): BoundaryAnchorSnapshot[];
  boundaryAnchorsByTag(world: WorldView, tag: string): BoundaryAnchorSnapshot[];
  boundaryAnchorsByEdge(world: WorldView, edge: string): BoundaryAnchorSnapshot[];

  // --- Bulk reads ---------------------------------------------------------
  /** Entities on the boundary that could be stitched to another pack. */
  boundaryAnchorsOnEdges(world: WorldView): BoundaryAnchorSnapshot[];
  /**
   * Build one shared index so a multi-query pass (inspector, invariant check)
   * stays linear instead of rebuilding maps per call. Purely a read cache: the
   * returned object is invalid the moment the world changes.
   */
  buildIndex(world: WorldView): GeographyGraphIndex;
}

export const worldGeographyModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "World Geography Prototype",
    description: "Regions, locations, adjacency, distance and entity placement without domain-specific environment rules.",
    provides: ["world.geography"],
    capabilities: [
      "component.register",
      "relation.register",
      "command.register",
      "rule.constraint.register",
      "rule.resolution.register",
      "projection.register",
    ],
  },

  register(ctx) {
    const api: GeographyApi = {
      getRegion(world, regionId) {
        return getRegion(buildGeometryIndex(world), regionId);
      },
      listRegions(world) {
        return listRegions(buildGeometryIndex(world));
      },
      locationsInRegion(world, regionId) {
        return locationsInRegion(buildGeometryIndex(world), regionId);
      },
      getLocation(world, locationId) {
        return getLocation(buildGeometryIndex(world), locationId);
      },
      listLocations(world) {
        const index = buildGeometryIndex(world);
        return index.locationIds.map((locationId) => getLocation(index, locationId) as LocationSnapshot);
      },
      regionOf(world, locationId) {
        return regionOf(buildGeometryIndex(world), locationId);
      },
      connectionBetween(world, a, b) {
        return connectionBetween(buildGeometryIndex(world), a, b);
      },
      neighborsOf(world, locationId) {
        return neighborsOf(buildGeometryIndex(world), locationId);
      },
      areAdjacent(world, a, b) {
        return areAdjacent(buildGeometryIndex(world), a, b);
      },
      adjacentRegions(world, regionId) {
        return adjacentRegions(buildGeometryIndex(world), regionId);
      },
      neighboringRegions(world, regionId) {
        return adjacentRegions(buildGeometryIndex(world), regionId);
      },
      isReachable(world, a, b) {
        return isReachable(buildGeometryIndex(world), a, b);
      },
      connectedComponent(world, locationId) {
        return connectedComponent(buildGeometryIndex(world), locationId);
      },
      listConnectedComponents(world) {
        return listConnectedComponents(buildGeometryIndex(world));
      },
      boundaryAnchorsAt(world, locationId) {
        return boundaryAnchorsAt(buildGeometryIndex(world), locationId);
      },
      listBoundaryAnchors(world) {
        return listBoundaryAnchors(buildGeometryIndex(world));
      },
      boundaryAnchorsByTag(world, tag) {
        return boundaryAnchorsByTag(buildGeometryIndex(world), tag);
      },
      boundaryAnchorsByEdge(world, edge) {
        return boundaryAnchorsByEdge(buildGeometryIndex(world), edge);
      },
      boundaryAnchorsOnEdges(world) {
        return listBoundaryAnchors(buildGeometryIndex(world));
      },
      buildIndex(world) {
        return buildGeometryIndex(world);
      },
    };
    ctx.provideCapability("world.geography", api);
    ctx.registerComponent({ id: GeographyComponents.region, persist: true, description: "Stable identity and label for a broad world region." });
    ctx.registerComponent({ id: GeographyComponents.location, persist: true, description: "Stable identity and label for a concrete world location." });
    ctx.registerComponent({ id: GeographyComponents.connection, persist: true, description: "Distance metadata for an adjacency relation." });
    ctx.registerComponent({ id: GeographyComponents.placement, persist: true, description: "Metadata for an entity's current placement." });
    ctx.registerComponent({ id: GeographyComponents.boundaryAnchor, persist: true, description: "A named boundary or continuity point on a location, used to stitch world maps together." });

    ctx.registerRelation({
      id: GeographyRelations.contains,
      allowedFrom: [GeographyKinds.region],
      allowedTo: [GeographyKinds.location],
      persist: true,
      description: "A region contains a concrete location.",
    });
    ctx.registerRelation({
      id: GeographyRelations.adjacentTo,
      allowedFrom: [GeographyKinds.location],
      allowedTo: [GeographyKinds.location],
      persist: true,
      description: "Directed half of a symmetric adjacency connection between locations.",
    });
    ctx.registerRelation({
      id: GeographyRelations.locatedAt,
      allowedTo: [GeographyKinds.location],
      persist: true,
      description: "A world entity is currently located at one concrete location.",
    });
    ctx.registerRelation({
      id: GeographyRelations.boundaryAnchoredAt,
      allowedFrom: [GeographyKinds.boundaryAnchor],
      allowedTo: [GeographyKinds.location],
      persist: true,
      description: "A boundary anchor sits on one concrete location; the reverse direction is a free lookup.",
    });

    ctx.registerCommand({ type: GeographyCommands.createRegion, description: "Create one broad region." });
    ctx.registerCommand({ type: GeographyCommands.createLocation, description: "Create one location inside an existing region." });
    ctx.registerCommand({ type: GeographyCommands.connectLocations, description: "Create a symmetric adjacency connection with physical distance." });
    ctx.registerCommand({ type: GeographyCommands.disconnectLocations, description: "Remove a symmetric adjacency connection entirely." });
    ctx.registerCommand({ type: GeographyCommands.placeEntity, description: "Place or relocate an entity at one location." });
    ctx.registerCommand({ type: GeographyCommands.createBoundaryAnchor, description: "Create one named world-edge boundary anchor on an existing location." });

    ctx.registerConstraintRule({
      id: `${GeographyCommands.createRegion}.allowed`,
      commandType: GeographyCommands.createRegion,
      evaluate: (c) => {
        if (!nonEmpty(c.command.payload.name)) {
          return { ok: false, code: "E_GEOGRAPHY_NAME", message: "region requires a name" };
        }
        const requestedId = explicitId(c.command.payload.entityId);
        if (requestedId && c.world.hasEntity(requestedId)) {
          return { ok: false, code: "E_GEOGRAPHY_REGION_EXISTS", message: `region id already in use: ${requestedId}` };
        }
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${GeographyCommands.createRegion}.resolve`,
      commandType: GeographyCommands.createRegion,
      resolve: (c) => {
        const requestedId = explicitId(c.command.payload.entityId);
        const regionType = typeof c.command.payload.regionType === "string"
          ? c.command.payload.regionType.trim()
          : "";
        return [{
          kind: "spawnEntity",
          localId: "region",
          ...(requestedId ? { id: requestedId } : {}),
          entityKind: GeographyKinds.region,
          components: {
            [GeographyComponents.region]: {
              name: String(c.command.payload.name).trim(),
              ...(regionType ? { type: regionType } : {}),
              createdAt: c.world.tick,
            },
          },
          announce: false,
        }];
      },
    });

    ctx.registerConstraintRule({
      id: `${GeographyCommands.createLocation}.allowed`,
      commandType: GeographyCommands.createLocation,
      evaluate: (c) => {
        const regionId = String(c.command.payload.regionEntityId ?? c.command.payload.regionId ?? "");
        const region = c.world.getEntity(regionId);
        if (!nonEmpty(c.command.payload.name)) {
          return { ok: false, code: "E_GEOGRAPHY_NAME", message: "location requires a name" };
        }
        if (!region || region.kind !== GeographyKinds.region || region.archivedAt !== undefined) {
          return { ok: false, code: "E_GEOGRAPHY_REGION", message: `location requires an existing region, received "${regionId}"` };
        }
        const requestedId = explicitId(c.command.payload.entityId);
        if (requestedId && c.world.hasEntity(requestedId)) {
          return { ok: false, code: "E_GEOGRAPHY_LOCATION_EXISTS", message: `location id already in use: ${requestedId}` };
        }
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${GeographyCommands.createLocation}.resolve`,
      commandType: GeographyCommands.createLocation,
      resolve: (c) => {
        const requestedId = explicitId(c.command.payload.entityId);
        const locationType = typeof c.command.payload.locationType === "string"
          ? c.command.payload.locationType.trim()
          : "";
        const regionId = String(c.command.payload.regionEntityId ?? c.command.payload.regionId ?? "");
        return [{
          kind: "spawnEntity",
          localId: "location",
          ...(requestedId ? { id: requestedId } : {}),
          entityKind: GeographyKinds.location,
          components: {
            [GeographyComponents.location]: {
              name: String(c.command.payload.name).trim(),
              ...(locationType ? { type: locationType } : {}),
              createdAt: c.world.tick,
            },
          },
          announce: false,
        }, {
          kind: "addRelation",
          type: GeographyRelations.contains,
          from: regionId,
          to: "@location",
          announce: false,
        }];
      },
    });

    ctx.registerConstraintRule({
      id: `${GeographyCommands.connectLocations}.allowed`,
      commandType: GeographyCommands.connectLocations,
      evaluate: (c) => {
        const fromId = String(c.command.payload.fromLocationId ?? "");
        const toId = String(c.command.payload.toLocationId ?? "");
        const terrainCost = c.command.payload.terrainCost === undefined
          ? undefined
          : Number(c.command.payload.terrainCost);
        // Shared primitive: the same rules the boundary handshake applies.
        const check = validateLocationConnection(
          c.world,
          fromId,
          toId,
          { distanceKm: Number(c.command.payload.distanceKm), ...(terrainCost !== undefined ? { terrainCost } : {}) },
        );
        return check.ok
          ? { ok: true }
          : { ok: false, code: check.rejection!.code, message: check.rejection!.message };
      },
    });
    ctx.registerResolutionRule({
      id: `${GeographyCommands.connectLocations}.resolve`,
      commandType: GeographyCommands.connectLocations,
      resolve: (c) => {
        const fromId = String(c.command.payload.fromLocationId);
        const toId = String(c.command.payload.toLocationId);
        const terrainCost = c.command.payload.terrainCost === undefined
          ? undefined
          : Number(c.command.payload.terrainCost);
        // Shared primitive: identical connection shape, in both directions.
        return buildConnectionEffects(fromId, toId, {
          distanceKm: Number(c.command.payload.distanceKm),
          ...(terrainCost !== undefined ? { terrainCost } : {}),
        });
      },
    });

    ctx.registerConstraintRule({
      id: `${GeographyCommands.placeEntity}.allowed`,
      commandType: GeographyCommands.placeEntity,
      evaluate: (c) => {
        const entityId = c.command.actorId;
        const locationId = c.command.targetId;
        if (!entityId || !c.world.hasEntity(entityId)) {
          return { ok: false, code: "E_GEOGRAPHY_ENTITY", message: "placement requires an existing entity" };
        }
        const location = locationId ? c.world.getEntity(locationId) : undefined;
        if (!location || location.kind !== GeographyKinds.location || location.archivedAt !== undefined) {
          return { ok: false, code: "E_GEOGRAPHY_LOCATION", message: "placement target must be an existing location" };
        }
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${GeographyCommands.placeEntity}.resolve`,
      commandType: GeographyCommands.placeEntity,
      resolve: (c) => {
        const entityId = c.command.actorId as string;
        const locationId = c.command.targetId as string;
        const effects: Effect[] = [];
        for (const relation of c.world.listRelations({ type: GeographyRelations.locatedAt, from: entityId })) {
          if (relation.to === locationId) continue;
          effects.push({
            kind: "removeRelation",
            type: GeographyRelations.locatedAt,
            from: entityId,
            to: relation.to,
            reason: "entity relocated to another location",
            announce: false,
          });
        }
        if (c.world.listRelations({ type: GeographyRelations.locatedAt, from: entityId, to: locationId }).length === 0) {
          effects.push({
            kind: "addRelation",
            type: GeographyRelations.locatedAt,
            from: entityId,
            to: locationId,
            components: { [GeographyComponents.placement]: { since: c.world.tick } },
            announce: false,
          });
        }
        effects.push({
          kind: "emitEvent",
          eventType: "world-geography.entity_placed",
          actorId: entityId,
          targetId: locationId,
          data: { locationId },
          historicalSignificance: 0,
        });
        return effects;
      },
    });

    ctx.registerConstraintRule({
      id: `${GeographyCommands.disconnectLocations}.allowed`,
      commandType: GeographyCommands.disconnectLocations,
      evaluate: (c) => {
        const fromId = String(c.command.payload.fromLocationId ?? "");
        const toId = String(c.command.payload.toLocationId ?? "");
        if (!isConnected(c.world, fromId, toId)) {
          return {
            ok: false,
            code: "E_GEOGRAPHY_NOT_CONNECTED",
            message: `no connection to remove between ${fromId} and ${toId}`,
          };
        }
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${GeographyCommands.disconnectLocations}.resolve`,
      commandType: GeographyCommands.disconnectLocations,
      resolve: (c) => {
        const fromId = String(c.command.payload.fromLocationId);
        const toId = String(c.command.payload.toLocationId);
        const reason = typeof c.command.payload.reason === "string"
          ? c.command.payload.reason
          : "connection removed";
        // Shared primitive: symmetric removal, mirroring the builder above.
        return buildDisconnectConnectionEffects(fromId, toId, reason);
      },
    });

    ctx.registerConstraintRule({
      id: `${GeographyCommands.createBoundaryAnchor}.allowed`,
      commandType: GeographyCommands.createBoundaryAnchor,
      evaluate: (c) => {
        const anchorId = String(c.command.payload.anchorId ?? "");
        const locationId = String(c.command.payload.locationId ?? "");
        const edge = String(c.command.payload.edge ?? "");
        if (!nonEmpty(c.command.payload.type)) {
          return { ok: false, code: "E_GEOGRAPHY_BOUNDARY_ANCHOR_TYPE", message: "boundary anchor requires a type" };
        }
        if (!(WORLD_EDGES as readonly string[]).includes(edge)) {
          return {
            ok: false,
            code: "E_GEOGRAPHY_BOUNDARY_ANCHOR_EDGE",
            message: `boundary anchor edge must be one of ${WORLD_EDGES.join("/")}, received: ${edge}`,
          };
        }
        const location = c.world.getEntity(locationId);
        if (!location || location.kind !== GeographyKinds.location || location.archivedAt !== undefined) {
          return { ok: false, code: "E_GEOGRAPHY_BOUNDARY_ANCHOR_LOCATION", message: "boundary anchor requires an existing location" };
        }
        if (anchorId && c.world.hasEntity(anchorId)) {
          return { ok: false, code: "E_GEOGRAPHY_BOUNDARY_ANCHOR_DUPLICATE", message: `boundary anchor id already in use: ${anchorId}` };
        }
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${GeographyCommands.createBoundaryAnchor}.resolve`,
      commandType: GeographyCommands.createBoundaryAnchor,
      resolve: (c) => {
        const explicitId = String(c.command.payload.anchorId ?? "").trim();
        const locationId = String(c.command.payload.locationId);
        const tags = Array.isArray(c.command.payload.compatibilityTags)
          ? (c.command.payload.compatibilityTags as unknown[]).map((tag) => String(tag))
          : [];
        const acceptsTypes = Array.isArray(c.command.payload.acceptsTypes)
          ? (c.command.payload.acceptsTypes as unknown[]).map((type) => String(type))
          : [];
        return [{
          kind: "spawnEntity",
          localId: "boundaryAnchor",
          ...(explicitId ? { id: explicitId } : {}),
          entityKind: GeographyKinds.boundaryAnchor,
          components: {
            [GeographyComponents.boundaryAnchor]: {
              type: String(c.command.payload.type).trim(),
              edge: String(c.command.payload.edge),
              locationId,
              compatibilityTags: tags,
              acceptsTypes,
              createdAt: c.world.tick,
            },
          },
          announce: false,
        }, {
          kind: "addRelation",
          type: GeographyRelations.boundaryAnchoredAt,
          from: "@boundaryAnchor",
          to: locationId,
          announce: false,
        }];
      },
    });

    ctx.registerProjection({
      id: GeographyProjections.regionNeighbors,
      description: "Derive neighboring Regions from cross-region Location adjacency so late-installed map packs stitch into one spatial graph.",
      build: ({ world, params }) => {
        const regionId = String(params.regionId ?? "");
        const index = buildGeometryIndex(world);
        const region = getRegion(index, regionId);
        if (!region || !region.active) return { exists: false, regionId };
        return { exists: true, regionId, neighbors: adjacentRegions(index, regionId) };
      },
    });

    ctx.registerProjection({
      id: GeographyProjections.boundaryAnchors,
      description: "Every world-edge boundary anchor, with the location it sits on and its compatibility tags.",
      build: ({ world, params }) => {
        const index = buildGeometryIndex(world);
        const tag = typeof params.tag === "string" ? params.tag : undefined;
        const edge = typeof params.edge === "string" ? params.edge : undefined;
        const anchors = listBoundaryAnchors(index).filter((anchor) =>
          (tag === undefined || anchor.compatibilityTags.includes(tag))
          && (edge === undefined || anchor.edge === edge));
        return { count: anchors.length, anchors };
      },
    });

    ctx.registerProjection({
      id: GeographyProjections.graph,
      description: "Topology summary of the whole geography graph: regions, locations, logical connections and derived region adjacency.",
      build: ({ world }) => {
        const index = buildGeometryIndex(world);
        const components = listConnectedComponents(index);
        return {
          regions: index.regionIds.length,
          locations: index.locationIds.length,
          logicalConnections: index.logicalConnections.length,
          adjacencyRows: world.listRelations({ type: GeographyRelations.adjacentTo }).length,
          boundaryAnchors: index.boundaryAnchors.length,
          connectedComponents: components.length,
          largestComponent: components[0]?.length ?? 0,
          regionAdjacency: regionGraph(index),
        };
      },
    });

    ctx.registerProjection({
      id: GeographyProjections.location,
      description: "Inspect one location, its region, neighbors and current occupants.",
      build: ({ world, params }) => {
        const locationId = String(params.locationId ?? "");
        const index = buildGeometryIndex(world);
        const location = getLocation(index, locationId);
        if (!location) return { exists: false };
        return {
          exists: true,
          id: locationId,
          name: location.name,
          type: location.type,
          regionId: location.regionId ?? "",
          neighbors: neighborsOf(index, locationId),
          occupants: location.occupants,
          componentSize: connectedComponent(index, locationId).length,
        };
      },
    });
  },
};

function explicitId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function nonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
