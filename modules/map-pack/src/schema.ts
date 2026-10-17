/**
 * Map Pack schema - the typed shape a pack must satisfy, plus the error shape
 * the validator produces.
 *
 * The schema is intentionally flat: a Map Pack v0.1 describes only what world
 * geography needs to exist. Climate, population, resources, polities and
 * history are *later* modules and must not leak in here.
 */

export const MAP_PACK_SCHEMA_VERSION = "0.1";

export const MAP_PACK_TYPE = "map_pack";

/** The relative path of every file a v0.1 pack must ship. */
export const MAP_PACK_FILES = {
  manifest: "manifest.yaml",
  regions: "map/regions.yaml",
  locations: "map/locations.yaml",
  edges: "map/edges.yaml",
  boundaryAnchors: "map/boundary_anchors.yaml",
} as const;

export type MapPackFileKey = keyof typeof MAP_PACK_FILES;

/**
 * Optional content files. A pack without them is still a valid v0.1 pack, and
 * loading it produces exactly the same contents as before.
 */
export const MAP_PACK_OPTIONAL_FILES = {
  eventPoints: "map/event_points.yaml",
} as const;

/** What kind of moment an event point offers; consumers switch on these. */
export const EVENT_POINT_KINDS = ["landmark", "gathering", "encounter", "hazard", "omen", "festival"] as const;
export const EVENT_POINT_SEASONS = ["any", "spring", "summer", "autumn", "winter"] as const;

export interface MapPackManifest {
  id: string;
  name: string;
  version: string;
  schemaVersion: string;
  type: string;
  /** Optional human-readable origin of the map data. */
  description?: string;
  /** Optional player-facing title (any language); UIs fall back to `name`. */
  displayName?: string;
}

export interface MapPackRegion {
  id: string;
  name: string;
  type: string;
}

export interface MapPackLocation {
  id: string;
  name: string;
  regionId: string;
  type: string;
}

export interface MapPackEdge {
  from: string;
  to: string;
  distance: number;
  terrainCost: number;
}

export interface MapPackBoundaryAnchor {
  id: string;
  type: string;
  locationId: string;
  edge: string;
  compatibilityTags: string[];
  /**
   * Boundary anchor types this one is willing to meet. Optional: when absent the
   * anchor accepts any type the compatibility rules allow. Present to disambiguate
   * two anchors that share an edge and a tag family.
   */
  acceptsTypes: string[];
}

/**
 * An authored point of interest at a location: a landmark, a seasonal
 * gathering spot, a danger, an omen. Pure content - registering a pack does
 * not schedule anything; later systems read these to stage moments.
 */
export interface MapPackEventPoint {
  id: string;
  name: string;
  locationId: string;
  kind: (typeof EVENT_POINT_KINDS)[number];
  season: (typeof EVENT_POINT_SEASONS)[number];
  text: string;
}

export interface MapPackContents {
  manifest: MapPackManifest;
  regions: MapPackRegion[];
  locations: MapPackLocation[];
  edges: MapPackEdge[];
  boundaryAnchors: MapPackBoundaryAnchor[];
  /** Present only when the pack ships map/event_points.yaml. */
  eventPoints?: MapPackEventPoint[];
}

/** Machine-readable validation codes. Callers switch on these, not on text. */
export const MapPackIssueCode = {
  FileMissing: "E_PACK_FILE_MISSING",
  FileUnreadable: "E_PACK_FILE_UNREADABLE",
  FileMalformed: "E_PACK_FILE_MALFORMED",
  ManifestMissingField: "E_PACK_MANIFEST_FIELD",
  ManifestType: "E_PACK_MANIFEST_TYPE",
  SchemaVersion: "E_PACK_SCHEMA_VERSION",
  RootShape: "E_PACK_ROOT_SHAPE",
  EmptyCollection: "E_PACK_EMPTY_COLLECTION",
  NonObjectEntry: "E_PACK_ENTRY_SHAPE",
  MissingField: "E_PACK_FIELD_MISSING",
  InvalidField: "E_PACK_FIELD_INVALID",
  DuplicateId: "E_PACK_DUPLICATE_ID",
  UnknownRegion: "E_PACK_UNKNOWN_REGION",
  UnknownLocation: "E_PACK_UNKNOWN_LOCATION",
  SelfEdge: "E_PACK_SELF_EDGE",
  DuplicateEdge: "E_PACK_DUPLICATE_EDGE",
  OrphanLocation: "E_PACK_ORPHAN_LOCATION",
} as const;

export type MapPackIssueCodeValue = (typeof MapPackIssueCode)[keyof typeof MapPackIssueCode];

export interface MapPackIssue {
  code: MapPackIssueCodeValue;
  /** Absolute path of the file the problem lives in. */
  file: string;
  /** Position of the offending entry inside that file (1-based). */
  index?: number;
  /** Identifier of the offending object, when it has one. */
  objectId?: string;
  /** Field name, when the problem is field-scoped. */
  field?: string;
  message: string;
}

export interface MapPackCheck {
  id: string;
  label: string;
  ok: boolean;
}

export interface MapPackValidation {
  ok: boolean;
  /** Content counts, filled even when validation fails. */
  counts: { regions: number; locations: number; edges: number; boundaryAnchors: number };
  checks: MapPackCheck[];
  issues: MapPackIssue[];
}

export interface MapPackLoadResult {
  ok: boolean;
  /** Absolute path of the pack directory. */
  directory: string;
  manifest?: MapPackManifest;
  pack?: MapPackContents;
  validation: MapPackValidation;
}

export function emptyValidation(): MapPackValidation {
  return {
    ok: true,
    counts: { regions: 0, locations: 0, edges: 0, boundaryAnchors: 0 },
    checks: [],
    issues: [],
  };
}

/** Canonical entity id of a pack object, so packs and world state agree. */
export function packEntityId(
  packId: string,
  kind: "region" | "location" | "boundary_anchor",
  id: string,
): string {
  return `${packId}:${kind}:${id}`;
}
