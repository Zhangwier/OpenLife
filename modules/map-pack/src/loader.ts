/**
 * Map Pack loader (Step 1).
 *
 *   read manifest -> validate manifest -> read regions/locations/edges/boundary anchors
 *   -> validate references -> register into the World
 *
 * Two hard rules shape this file:
 *
 *   1. Validation is exhaustive and non-fatal-by-collection. A bad pack reports
 *      *every* problem it can prove, located by file and object id, instead of
 *      dying on the first one. Nothing is silently dropped.
 *   2. The loader owns no world truth. Registration goes through the existing
 *      kernel pipeline (`Command -> Constraint -> Resolution -> Effects ->
 *      Transaction`), so geography exists exactly as if a player had created
 *      it - thereby making packs save/load-able, replayable and auditable for
 *      free.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { CommandIntent } from "@openlife/contracts";
import type { Simulation } from "@openlife/simulation";
import { GeographyComponents, GeographyKinds, GeographyRelations } from "@openlife/module-world-geography";
import { YamlError, parseYamlDocument, type YamlValue } from "./yaml.ts";
import {
  MAP_PACK_FILES,
  MAP_PACK_OPTIONAL_FILES,
  EVENT_POINT_KINDS,
  EVENT_POINT_SEASONS,
  EVENT_POINT_TIMES,
  type MapPackEventPoint,
  MAP_PACK_SCHEMA_VERSION,
  MAP_PACK_TYPE,
  MapPackIssueCode,
  emptyValidation,
  packEntityId,
  type MapPackBoundaryAnchor,
  type MapPackCheck,
  type MapPackContents,
  type MapPackEdge,
  type MapPackIssue,
  type MapPackIssueCodeValue,
  type MapPackLoadResult,
  type MapPackLocation,
  type MapPackManifest,
  type MapPackRegion,
  type MapPackValidation,
} from "./schema.ts";

const KNOWN_EDGES = ["north", "east", "south", "west"] as const;

interface StagedFile {
  path: string;
  present: boolean;
  value: YamlValue | undefined;
  unreadable?: string;
}

export interface LoadMapPackOptions {
  /** Skip `registerIntoWorld`; used by pure inspection. */
  dryRun?: boolean;
}

/**
 * Loads, validates and (unless `dryRun`) registers one Map Pack.
 *
 * Throws only for programmer error - a nonexistent directory. Every data
 * problem with the pack itself comes back as `validation.issues`.
 */
export function loadMapPack(packPath: string, options: LoadMapPackOptions = {}): MapPackLoadResult {
  const directory = resolve(packPath);
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    throw new Error(`map pack directory does not exist: ${directory}`);
  }

  const files: Record<keyof typeof MAP_PACK_FILES, StagedFile> = {
    manifest: readPackFile(directory, "manifest"),
    regions: readPackFile(directory, "regions"),
    locations: readPackFile(directory, "locations"),
    edges: readPackFile(directory, "edges"),
    boundaryAnchors: readPackFile(directory, "boundaryAnchors"),
  };

  const issues: MapPackIssue[] = [];
  const manifest = parseManifest(files.manifest, issues);
  const regions = parseRegions(files.regions, issues);
  const locations = parseLocations(files.locations, issues);
  const edges = parseEdges(files.edges, issues);
  const boundaryAnchors = parseBoundaryAnchors(files.boundaryAnchors, issues);

  validateReferences(regions, locations, edges, boundaryAnchors, issues);
  const eventPoints = parseEventPoints(directory, locations, issues);

  const checks = buildChecks(issues, regions, locations, edges, boundaryAnchors);
  const validation: MapPackValidation = {
    ok: issues.length === 0,
    counts: {
      regions: regions.length,
      locations: locations.length,
      edges: edges.length,
      boundaryAnchors: boundaryAnchors.length,
    },
    checks,
    issues,
  };

  if (!manifest || !validation.ok || options.dryRun) {
    return {
      ok: validation.ok && manifest !== undefined,
      directory,
      ...(manifest ? { manifest } : {}),
      ...(manifest && validation.ok
        ? { pack: { manifest, regions, locations, edges, boundaryAnchors, ...(eventPoints ? { eventPoints } : {}) } satisfies MapPackContents }
        : {}),
      validation,
    };
  }

  const pack: MapPackContents = { manifest, regions, locations, edges, boundaryAnchors, ...(eventPoints ? { eventPoints } : {}) };
  return { ok: true, directory, manifest, pack, validation };
}

/**
 * Registers a validated pack into a live simulation through the command
 * pipeline. Returns the per-command results so a caller can surface a partial
 * failure instead of pretending the world took everything.
 */
export function registerMapPack(
  simulation: Simulation,
  pack: MapPackContents,
): { ok: boolean; commands: { type: string; ok: boolean; error?: string }[] } {
  const commands: { type: string; ok: boolean; error?: string }[] = [];
  const dispatch = (intent: CommandIntent): void => {
    const result = simulation.dispatch(intent);
    commands.push({
      type: intent.type,
      ok: result.ok,
      ...(result.ok ? {} : { error: result.errors.map((error) => `${error.code}: ${error.message}`).join("; ") }),
    });
  };

  for (const region of pack.regions) {
    dispatch({
      type: "world-geography.create_region",
      payload: {
        entityId: packEntityId(pack.manifest.id, "region", region.id),
        name: region.name,
        regionType: region.type,
        packId: pack.manifest.id,
      },
      source: "module",
    });
  }

  for (const location of pack.locations) {
    dispatch({
      type: "world-geography.create_location",
      payload: {
        entityId: packEntityId(pack.manifest.id, "location", location.id),
        regionEntityId: packEntityId(pack.manifest.id, "region", location.regionId),
        name: location.name,
        locationType: location.type,
        packId: pack.manifest.id,
      },
      source: "module",
    });
  }

  for (const edge of pack.edges) {
    dispatch({
      type: "world-geography.connect_locations",
      payload: {
        fromLocationId: packEntityId(pack.manifest.id, "location", edge.from),
        toLocationId: packEntityId(pack.manifest.id, "location", edge.to),
        distanceKm: edge.distance,
        terrainCost: edge.terrainCost,
        packId: pack.manifest.id,
      },
      source: "module",
    });
  }

  for (const anchor of pack.boundaryAnchors) {
    dispatch({
      type: "world-geography.create_boundary_anchor",
      payload: {
        anchorId: packEntityId(pack.manifest.id, "boundary_anchor", anchor.id),
        type: anchor.type,
        edge: anchor.edge,
        locationId: packEntityId(pack.manifest.id, "location", anchor.locationId),
        compatibilityTags: anchor.compatibilityTags,
        acceptsTypes: anchor.acceptsTypes,
        packId: pack.manifest.id,
      },
      source: "module",
    });
  }

  return { ok: commands.every((entry) => entry.ok), commands };
}

/** Convenience: load a pack and register it, reporting both phases. */
export function installMapPack(
  simulation: Simulation,
  packPath: string,
): MapPackLoadResult & { registration?: { ok: boolean; commands: { type: string; ok: boolean; error?: string }[] } } {
  const loaded = loadMapPack(packPath);
  if (!loaded.ok || !loaded.pack) return loaded;
  return { ...loaded, registration: registerMapPack(simulation, loaded.pack) };
}

// --- file access -----------------------------------------------------------

function readPackFile(directory: string, key: keyof typeof MAP_PACK_FILES): StagedFile {
  const relative = MAP_PACK_FILES[key];
  const path = resolve(directory, relative);
  if (!existsSync(path)) return { path, present: false, value: undefined };
  try {
    const text = readFileSync(path, "utf8");
    return { path, present: true, value: parseYamlDocument(text, path) };
  } catch (error) {
    if (error instanceof YamlError) {
      return { path, present: true, value: undefined, unreadable: error.message };
    }
    return { path, present: true, value: undefined, unreadable: (error as Error).message };
  }
}

function fileIssue(
  file: StagedFile,
  code: MapPackIssue["code"],
  message: string,
  extra: Partial<MapPackIssue> = {},
): MapPackIssue {
  return { code, file: file.path, message, ...extra };
}

// --- manifest --------------------------------------------------------------

function parseManifest(file: StagedFile, issues: MapPackIssue[]): MapPackManifest | undefined {
  if (!file.present) {
    issues.push(fileIssue(file, MapPackIssueCode.FileMissing, `map pack is missing required file ${MAP_PACK_FILES.manifest}`));
    return undefined;
  }
  if (file.unreadable) {
    issues.push(fileIssue(file, MapPackIssueCode.FileMalformed, file.unreadable));
    return undefined;
  }
  const root = file.value;
  if (!isObject(root)) {
    issues.push(fileIssue(file, MapPackIssueCode.RootShape, "manifest.yaml must be a mapping"));
    return undefined;
  }

  const id = requireString(root, "id", file, issues);
  const name = requireString(root, "name", file, issues);
  const version = requireString(root, "version", file, issues);
  const type = requireString(root, "type", file, issues);
  const schemaVersion = requireString(root, "schema_version", file, issues);

  if (type !== undefined && type !== MAP_PACK_TYPE) {
    issues.push(fileIssue(file, MapPackIssueCode.ManifestType, `manifest.type must be "${MAP_PACK_TYPE}", received "${type}"`, { field: "type" }));
  }
  if (schemaVersion !== undefined && schemaVersion !== MAP_PACK_SCHEMA_VERSION) {
    issues.push(fileIssue(file, MapPackIssueCode.SchemaVersion, `manifest.schema_version must be "${MAP_PACK_SCHEMA_VERSION}", received "${schemaVersion}"`, { field: "schema_version" }));
  }
  const description = typeof root.description === "string" ? root.description : undefined;
  const displayName = typeof root.display_name === "string" && root.display_name.trim() ? root.display_name.trim() : undefined;

  if (id === undefined || name === undefined || version === undefined || type === undefined || schemaVersion === undefined) {
    return undefined;
  }
  return {
    id, name, version, type, schemaVersion,
    ...(description !== undefined ? { description } : {}),
    ...(displayName !== undefined ? { displayName } : {}),
  };
}

// --- collections -----------------------------------------------------------

function parseRegions(file: StagedFile, issues: MapPackIssue[]): MapPackRegion[] {
  return parseCollection(file, issues, "regions", (entry, index) => {
    const id = requireString(entry, "id", file, issues, index);
    const name = requireString(entry, "name", file, issues, index);
    const type = requireString(entry, "type", file, issues, index);
    if (id === undefined || name === undefined || type === undefined) return undefined;
    return { id, name, type };
  });
}

function parseLocations(file: StagedFile, issues: MapPackIssue[]): MapPackLocation[] {
  return parseCollection(file, issues, "locations", (entry, index) => {
    const id = requireString(entry, "id", file, issues, index);
    const name = requireString(entry, "name", file, issues, index);
    const regionId = requireString(entry, "region_id", file, issues, index);
    const type = requireString(entry, "type", file, issues, index);
    if (id === undefined || name === undefined || regionId === undefined || type === undefined) return undefined;
    return { id, name, regionId, type };
  });
}

function parseEdges(file: StagedFile, issues: MapPackIssue[]): MapPackEdge[] {
  return parseCollection(file, issues, "edges", (entry, index) => {
    const from = requireString(entry, "from", file, issues, index);
    const to = requireString(entry, "to", file, issues, index);
    const distance = requireNumber(entry, "distance", file, issues, index);
    const terrainCost = requireNumber(entry, "terrain_cost", file, issues, index);

    if (distance !== undefined && distance <= 0) {
      issues.push(fileIssue(file, MapPackIssueCode.InvalidField, `edge.distance must be > 0, received ${distance}`, { index, field: "distance", ...(from ? { objectId: from } : {}) }));
    }
    if (terrainCost !== undefined && terrainCost <= 0) {
      issues.push(fileIssue(file, MapPackIssueCode.InvalidField, `edge.terrain_cost must be > 0, received ${terrainCost}`, { index, field: "terrain_cost", ...(from ? { objectId: from } : {}) }));
    }
    if (from === undefined || to === undefined || distance === undefined || terrainCost === undefined) return undefined;
    return { from, to, distance, terrainCost };
  });
}

function parseBoundaryAnchors(file: StagedFile, issues: MapPackIssue[]): MapPackBoundaryAnchor[] {
  return parseCollection(file, issues, "boundary_anchors", (entry, index) => {
    const id = requireString(entry, "id", file, issues, index);
    const type = requireString(entry, "type", file, issues, index);
    const locationId = requireString(entry, "location_id", file, issues, index);
    const edge = requireString(entry, "edge", file, issues, index);
    const tags = requireStringList(entry, "compatibility_tags", file, issues, index);
    // `accepts_types` is optional; absent means "accepts anything the rules allow".
    const acceptsTypes = entry.accepts_types === undefined
      ? []
      : requireStringList(entry, "accepts_types", file, issues, index);

    if (edge !== undefined && !(KNOWN_EDGES as readonly string[]).includes(edge)) {
      issues.push(fileIssue(file, MapPackIssueCode.InvalidField, `anchor.edge must be one of ${KNOWN_EDGES.join("/")}, received "${edge}"`, { index, field: "edge", ...(id ? { objectId: id } : {}) }));
    }
    if (id === undefined || type === undefined || locationId === undefined || edge === undefined || tags === undefined || acceptsTypes === undefined) {
      return undefined;
    }
    return { id, type, locationId, edge, compatibilityTags: tags, acceptsTypes };
  });
}

function parseCollection<T>(
  file: StagedFile,
  issues: MapPackIssue[],
  label: string,
  parseEntry: (entry: Record<string, YamlValue>, index: number) => T | undefined,
): T[] {
  const relative = label === "regions" ? MAP_PACK_FILES.regions
    : label === "locations" ? MAP_PACK_FILES.locations
    : label === "edges" ? MAP_PACK_FILES.edges
    : MAP_PACK_FILES.boundaryAnchors;

  if (!file.present) {
    issues.push(fileIssue(file, MapPackIssueCode.FileMissing, `map pack is missing required file ${relative}`));
    return [];
  }
  if (file.unreadable) {
    issues.push(fileIssue(file, MapPackIssueCode.FileMalformed, file.unreadable));
    return [];
  }
  const root = file.value;
  if (!isObject(root)) {
    issues.push(fileIssue(file, MapPackIssueCode.RootShape, `${relative} must be a mapping with a "${label}:" list`));
    return [];
  }
  const list = root[label];
  if (list === undefined) {
    issues.push(fileIssue(file, MapPackIssueCode.MissingField, `${relative} must contain a "${label}:" list`, { field: label }));
    return [];
  }
  if (!Array.isArray(list)) {
    issues.push(fileIssue(file, MapPackIssueCode.RootShape, `${relative} "${label}" must be a list`, { field: label }));
    return [];
  }
  if (list.length === 0) {
    issues.push(fileIssue(file, MapPackIssueCode.EmptyCollection, `${relative} "${label}" is empty`));
    return [];
  }

  const out: T[] = [];
  const seen = new Map<string, number>();
  list.forEach((raw, offset) => {
    const index = offset + 1;
    if (!isObject(raw)) {
      issues.push(fileIssue(file, MapPackIssueCode.NonObjectEntry, `${label}[${index}] must be a mapping`, { index }));
      return;
    }
    const idValue = typeof raw.id === "string" ? raw.id : undefined;
    if (idValue !== undefined) {
      const first = seen.get(idValue);
      if (first !== undefined) {
        issues.push(fileIssue(file, MapPackIssueCode.DuplicateId, `${label}[${index}] repeats id "${idValue}" already used at ${label}[${first}]`, { index, objectId: idValue }));
      } else {
        seen.set(idValue, index);
      }
    }
    const parsed = parseEntry(raw, index);
    if (parsed !== undefined) out.push(parsed);
  });
  return out;
}

// --- optional: event points -------------------------------------------------

/** Parses map/event_points.yaml when present; undefined when the pack has none. */
function parseEventPoints(directory: string, locations: MapPackLocation[], issues: MapPackIssue[]): MapPackEventPoint[] | undefined {
  const path = resolve(directory, MAP_PACK_OPTIONAL_FILES.eventPoints);
  if (!existsSync(path)) return undefined;
  let value: YamlValue | undefined;
  const file: StagedFile = { path, present: true, value: undefined };
  try {
    value = parseYamlDocument(readFileSync(path, "utf8"), path);
  } catch (error) {
    issues.push(fileIssue(file, MapPackIssueCode.FileMalformed, (error as Error).message));
    return [];
  }
  const list = isObject(value) ? value.event_points : undefined;
  if (!Array.isArray(list)) {
    issues.push(fileIssue(file, MapPackIssueCode.RootShape, `${MAP_PACK_OPTIONAL_FILES.eventPoints} must contain an "event_points:" list`));
    return [];
  }
  const known = new Set(locations.map((location) => location.id));
  const seen = new Set<string>();
  const out: MapPackEventPoint[] = [];
  list.forEach((raw, offset) => {
    const index = offset + 1;
    if (!isObject(raw)) {
      issues.push(fileIssue(file, MapPackIssueCode.NonObjectEntry, `event_points[${index}] must be a mapping`, { index }));
      return;
    }
    const id = requireString(raw, "id", file, issues, index);
    const name = requireString(raw, "name", file, issues, index);
    const locationId = requireString(raw, "location_id", file, issues, index);
    const kind = requireString(raw, "kind", file, issues, index);
    const text = requireString(raw, "text", file, issues, index);
    const season = raw.season === undefined ? "any" : requireString(raw, "season", file, issues, index);
    if (id !== undefined) {
      if (seen.has(id)) issues.push(fileIssue(file, MapPackIssueCode.DuplicateId, `event_points[${index}] repeats id "${id}"`, { index, objectId: id }));
      seen.add(id);
    }
    if (locationId !== undefined && !known.has(locationId)) {
      issues.push(fileIssue(file, MapPackIssueCode.UnknownLocation, `event point "${id}" references unknown location "${locationId}"`, { index, field: "location_id", ...(id ? { objectId: id } : {}) }));
    }
    if (kind !== undefined && !(EVENT_POINT_KINDS as readonly string[]).includes(kind)) {
      issues.push(fileIssue(file, MapPackIssueCode.InvalidField, `event point kind must be one of ${EVENT_POINT_KINDS.join("/")}, received "${kind}"`, { index, field: "kind" }));
      return;
    }
    if (season !== undefined && !(EVENT_POINT_SEASONS as readonly string[]).includes(season)) {
      issues.push(fileIssue(file, MapPackIssueCode.InvalidField, `event point season must be one of ${EVENT_POINT_SEASONS.join("/")}, received "${season}"`, { index, field: "season" }));
      return;
    }
    if (id === undefined || name === undefined || locationId === undefined || kind === undefined || text === undefined || season === undefined) return;
    // Optional details (time of day, creature, behaviour, drops, danger): checked when present, absent otherwise.
    const detail: Partial<MapPackEventPoint> = {};
    const bad = (field: string, message: string) => issues.push(fileIssue(file, MapPackIssueCode.InvalidField, `event point "${id}" ${message}`, { index, field, objectId: id }));
    if (raw.time !== undefined) {
      if (typeof raw.time === "string" && (EVENT_POINT_TIMES as readonly string[]).includes(raw.time)) detail.time = raw.time as MapPackEventPoint["time"];
      else bad("time", `time must be one of ${EVENT_POINT_TIMES.join("/")}`);
    }
    for (const field of ["creature", "behavior"] as const) {
      if (raw[field] === undefined) continue;
      if (typeof raw[field] === "string" && (raw[field] as string).trim()) detail[field] = raw[field] as string;
      else bad(field, `${field} must be a non-empty string`);
    }
    if (raw.drops !== undefined) {
      if (Array.isArray(raw.drops) && raw.drops.length > 0 && raw.drops.every((d) => typeof d === "string" && d.trim())) detail.drops = raw.drops as string[];
      else bad("drops", "drops must be a non-empty list of names");
    }
    if (raw.danger !== undefined) {
      if (typeof raw.danger === "number" && Number.isInteger(raw.danger) && raw.danger >= 0 && raw.danger <= 3) detail.danger = raw.danger;
      else bad("danger", "danger must be an integer 0-3");
    }
    if ((detail.behavior || detail.drops) && !detail.creature) bad("creature", "behavior and drops need a creature");
    out.push({ id, name, locationId, kind: kind as MapPackEventPoint["kind"], season: season as MapPackEventPoint["season"], text, ...detail });
  });
  return out;
}

// --- reference validation --------------------------------------------------

function validateReferences(
  regions: MapPackRegion[],
  locations: MapPackLocation[],
  edges: MapPackEdge[],
  boundaryAnchors: MapPackBoundaryAnchor[],
  issues: MapPackIssue[],
): void {
  const regionIds = new Set(regions.map((region) => region.id));
  const locationIds = new Set(locations.map((location) => location.id));
  const locationsFile = MAP_PACK_FILES.locations;
  const edgesFile = MAP_PACK_FILES.edges;
  const boundaryAnchorsFile = MAP_PACK_FILES.boundaryAnchors;

  locations.forEach((location, offset) => {
    if (!regionIds.has(location.regionId)) {
      issues.push({
        code: MapPackIssueCode.UnknownRegion,
        file: locationsFile,
        index: offset + 1,
        objectId: location.id,
        field: "region_id",
        message: `location "${location.id}" references unknown region "${location.regionId}"`,
      });
    }
  });

  const edgeKeys = new Map<string, number>();
  const connected = new Set<string>();
  edges.forEach((edge, offset) => {
    const index = offset + 1;
    if (edge.from === edge.to) {
      issues.push({
        code: MapPackIssueCode.SelfEdge,
        file: edgesFile,
        index,
        objectId: edge.from,
        message: `edge[${index}] connects "${edge.from}" to itself`,
      });
    }
    for (const side of ["from", "to"] as const) {
      const value = edge[side];
      if (!locationIds.has(value)) {
        issues.push({
          code: MapPackIssueCode.UnknownLocation,
          file: edgesFile,
          index,
          objectId: value,
          field: side,
          message: `edge[${index}] ${side} references unknown location "${value}"`,
        });
      }
    }
    const key = [edge.from, edge.to].sort().join("\u0000");
    const first = edgeKeys.get(key);
    if (first !== undefined) {
      issues.push({
        code: MapPackIssueCode.DuplicateEdge,
        file: edgesFile,
        index,
        objectId: edge.from,
        message: `edge[${index}] duplicates the connection already declared at edge[${first}]`,
      });
    } else {
      edgeKeys.set(key, index);
    }
    connected.add(edge.from);
    connected.add(edge.to);
  });

  boundaryAnchors.forEach((anchor, offset) => {
    if (!locationIds.has(anchor.locationId)) {
      issues.push({
        code: MapPackIssueCode.UnknownLocation,
        file: boundaryAnchorsFile,
        index: offset + 1,
        objectId: anchor.id,
        field: "location_id",
        message: `anchor "${anchor.id}" references unknown location "${anchor.locationId}"`,
      });
    }
  });

  locations.forEach((location, offset) => {
    if (!connected.has(location.id)) {
      issues.push({
        code: MapPackIssueCode.OrphanLocation,
        file: locationsFile,
        index: offset + 1,
        objectId: location.id,
        message: `location "${location.id}" has no edge, so it is unreachable from the rest of the map`,
      });
    }
  });
}

// --- checks ----------------------------------------------------------------

function buildChecks(
  issues: MapPackIssue[],
  regions: MapPackRegion[],
  locations: MapPackLocation[],
  edges: MapPackEdge[],
  boundaryAnchors: MapPackBoundaryAnchor[],
): MapPackCheck[] {
  const has = (code: MapPackIssue["code"]): boolean => issues.some((issue) => issue.code === code);
  const groupOk = (codes: MapPackIssue["code"][]): boolean => !codes.some((code) => has(code));
  const regionIds = new Set(regions.map((region) => region.id));
  const boundaryAnchorIssues = (): boolean =>
    issues.some((issue) => issue.file.endsWith(MAP_PACK_FILES.boundaryAnchors));

  return [
    {
      id: "files",
      label: "all five pack files present and readable",
      ok: groupOk([MapPackIssueCode.FileMissing, MapPackIssueCode.FileMalformed, MapPackIssueCode.RootShape]),
    },
    {
      id: "manifest",
      label: "manifest declares id, name, version, type and schema_version",
      ok: !issues.some((issue) =>
        issue.file.endsWith(MAP_PACK_FILES.manifest)
        && issue.code !== MapPackIssueCode.NonObjectEntry),
    },
    {
      id: "ids-unique",
      label: "IDs unique",
      ok: groupOk([MapPackIssueCode.DuplicateId]),
    },
    {
      id: "region-references",
      label: "region references valid",
      ok: groupOk([MapPackIssueCode.UnknownRegion]),
    },
    {
      id: "location-references",
      label: "location references valid",
      ok: groupOk([MapPackIssueCode.UnknownLocation]),
    },
    {
      id: "edges",
      label: "edges valid",
      ok: !issues.some((issue) =>
        issue.file.endsWith(MAP_PACK_FILES.edges)
        && ([
          MapPackIssueCode.SelfEdge,
          MapPackIssueCode.DuplicateEdge,
          MapPackIssueCode.InvalidField,
          MapPackIssueCode.MissingField,
          MapPackIssueCode.FileMalformed,
          MapPackIssueCode.RootShape,
          MapPackIssueCode.EmptyCollection,
        ] as MapPackIssueCodeValue[]).includes(issue.code)),
    },
    {
      id: "boundary-anchors",
      label: "boundary anchors valid",
      ok: !boundaryAnchorIssues(),
    },
    {
      id: "connectivity",
      label: "no orphan locations",
      ok: groupOk([MapPackIssueCode.OrphanLocation]),
    },
  ];
}

// --- scalar helpers --------------------------------------------------------

function isObject(value: YamlValue | undefined): value is Record<string, YamlValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(
  entry: Record<string, YamlValue>,
  field: string,
  file: StagedFile,
  issues: MapPackIssue[],
  index?: number,
): string | undefined {
  const value = entry[field];
  if (value === undefined) {
    issues.push(fileIssue(file, MapPackIssueCode.MissingField, `missing required field "${field}"`, { field, ...(index !== undefined ? { index } : {}) }));
    return undefined;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push(fileIssue(file, MapPackIssueCode.InvalidField, `field "${field}" must be a non-empty string, received ${JSON.stringify(value)}`, { field, ...(index !== undefined ? { index } : {}) }));
    return undefined;
  }
  return value.trim();
}

function requireNumber(
  entry: Record<string, YamlValue>,
  field: string,
  file: StagedFile,
  issues: MapPackIssue[],
  index?: number,
): number | undefined {
  const value = entry[field];
  if (value === undefined) {
    issues.push(fileIssue(file, MapPackIssueCode.MissingField, `missing required field "${field}"`, { field, ...(index !== undefined ? { index } : {}) }));
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push(fileIssue(file, MapPackIssueCode.InvalidField, `field "${field}" must be a finite number, received ${JSON.stringify(value)}`, { field, ...(index !== undefined ? { index } : {}) }));
    return undefined;
  }
  return value;
}

function requireStringList(
  entry: Record<string, YamlValue>,
  field: string,
  file: StagedFile,
  issues: MapPackIssue[],
  index?: number,
): string[] | undefined {
  const value = entry[field];
  if (value === undefined) {
    issues.push(fileIssue(file, MapPackIssueCode.MissingField, `missing required field "${field}"`, { field, ...(index !== undefined ? { index } : {}) }));
    return undefined;
  }
  if (!Array.isArray(value)) {
    issues.push(fileIssue(file, MapPackIssueCode.InvalidField, `field "${field}" must be a list`, { field, ...(index !== undefined ? { index } : {}) }));
    return undefined;
  }
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.trim().length === 0) {
      issues.push(fileIssue(file, MapPackIssueCode.InvalidField, `field "${field}" must contain only non-empty strings, received ${JSON.stringify(item)}`, { field, ...(index !== undefined ? { index } : {}) }));
      return undefined;
    }
    out.push(item.trim());
  }
  return out;
}

export { GeographyComponents, GeographyKinds, GeographyRelations };
