/**
 * World-geography identifier vocabulary.
 *
 * Every namespaced id owned by this module lives here and nowhere else. Both
 * `module.ts` (registration and rules) and `geography-graph.ts` (pure read
 * queries) import from this file, which is what lets the graph layer stay a
 * leaf module without duplicating constants or importing back into `module.ts`.
 *
 * Adding a component, relation or kind means editing exactly one file.
 */

export const GeographyKinds = {
  region: "world-geography.region",
  location: "world-geography.location",
  boundaryAnchor: "world-geography.boundary_anchor",
} as const;

export const GeographyComponents = {
  region: "world-geography.region",
  location: "world-geography.location",
  connection: "world-geography.connection",
  placement: "world-geography.placement",
  boundaryAnchor: "world-geography.boundary_anchor",
} as const;

export const GeographyRelations = {
  contains: "world-geography.contains",
  adjacentTo: "world-geography.adjacent_to",
  locatedAt: "world-geography.located_at",
  boundaryAnchoredAt: "world-geography.boundary_anchored_at",
} as const;

export const GeographyCommands = {
  createRegion: "world-geography.create_region",
  createLocation: "world-geography.create_location",
  connectLocations: "world-geography.connect_locations",
  disconnectLocations: "world-geography.disconnect_locations",
  placeEntity: "world-geography.place_entity",
  createBoundaryAnchor: "world-geography.create_boundary_anchor",
} as const;

export const GeographyProjections = {
  regionNeighbors: "world-geography.region-neighbors",
  boundaryAnchors: "world-geography.boundary-anchors",
  graph: "world-geography.graph",
  location: "world-geography.location",
} as const;

/** Direction of a map boundary on the world edge. */
export type WorldEdge = "north" | "east" | "south" | "west";

export const WORLD_EDGES: readonly WorldEdge[] = ["north", "east", "south", "west"];

/**
 * Which world edge faces which.
 *
 * A boundary can only be stitched to the opposite side: a map that ends on its
 * east edge continues on the next map's west edge. Same-side and adjacent-side
 * pairs are never stitched, no matter how compatible their tags look.
 */
export const OPPOSITE_EDGE: Readonly<Record<WorldEdge, WorldEdge>> = {
  east: "west",
  west: "east",
  north: "south",
  south: "north",
};

export function isWorldEdge(value: unknown): value is WorldEdge {
  return typeof value === "string" && (WORLD_EDGES as readonly string[]).includes(value);
}
