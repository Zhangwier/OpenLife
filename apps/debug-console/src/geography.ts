/**
 * `openlife geography <pack-dir>` - the Geography Graph inspector.
 *
 * Loads a Map Pack into a throwaway Simulation, then reports the *topology* the
 * world actually holds: stored counts, derived region adjacency, connected
 * components, boundary edges and the five geography invariants.
 *
 * Nothing here hardcodes pack data. Every number is computed from the world, so
 * the report is a truthful description of the graph rather than a fixture.
 */

import { Simulation } from "@openlife/simulation";
import {
  WORLD_EDGES,
  worldGeographyModule,
  type GeographyApi,
  type WorldEdge,
} from "@openlife/module-world-geography";
import { loadMapPack, mapPackModule, registerMapPack } from "@openlife/module-map-pack";
import { checkGeographyInvariants } from "./invariants.ts";

export interface GeographyCliOptions {
  seed: number;
}

export interface GeographyInspection {
  ok: boolean;
  report: string;
}

export function inspectGeography(directory: string, options: GeographyCliOptions): GeographyInspection {
  const loaded = loadMapPack(directory, { dryRun: true });
  if (!loaded.ok || !loaded.pack) {
    const issues = loaded.validation.issues
      .map((issue) => `  ${issue.code} ${issue.file} - ${issue.message}`)
      .join("\n");
    return {
      ok: false,
      report: [
        "OpenLife Geography Inspector",
        "",
        `Pack: ${directory}`,
        "",
        "Validation:",
        "  FAIL  the pack did not load, so no geography graph could be built",
        "",
        "Issues:",
        issues,
        "",
      ].join("\n"),
    };
  }

  const simulation = new Simulation({
    worldSeed: options.seed,
    modules: [worldGeographyModule, mapPackModule],
  });
  const registration = registerMapPack(simulation, loaded.pack);
  const world = simulation.worldView();
  const geography = simulation.modules.capabilityImplementation<GeographyApi>("world.geography");
  if (!geography) {
    return { ok: false, report: "OpenLife Geography Inspector\n\nworld.geography capability is unavailable\n" };
  }

  const index = geography.buildIndex
    ? geography.buildIndex(world)
    : undefined;

  const regions = geography.listRegions(world);
  const locations = geography.listLocations(world);
  const boundaryAnchors = geography.listBoundaryAnchors(world);
  const components = geography.listConnectedComponents(world);
  const adjacencyRows = world.listRelations({ type: "world-geography.adjacent_to" }).length;
  const logicalConnections = index?.logicalConnections.length
    ?? countLogical(world, locations.map((location) => location.id));

  const lines: string[] = [];
  const push = (line = ""): void => { lines.push(line); };

  push("OpenLife Geography Inspector");
  push();
  push(`Pack:`);
  push(`  ${loaded.manifest?.name ?? "(unnamed)"}`);
  push(`  id: ${loaded.manifest?.id ?? "?"}`);
  push(`  version: ${loaded.manifest?.version ?? "?"}`);
  push();
  push("Stored facts:");
  push(`  Regions:            ${regions.length}`);
  push(`  Locations:          ${locations.length}`);
  push(`  Connections:        ${logicalConnections}`);
  push(`  Adjacency rows:     ${adjacencyRows}`);
  push(`  Boundary Anchors:   ${boundaryAnchors.length}`);
  push();

  push("Connected Components:");
  push(`  ${components.length}`);
  push();

  push("Largest Component:");
  push(`  ${components[0]?.length ?? 0} locations`);
  if (components.length > 1) {
    push(`  other components: ${components.slice(1).map((component) => component.length).join(", ")}`);
  }
  push();

  push("Region Adjacency:");
  for (const region of regions) {
    const neighbors = geography.adjacentRegions(world, region.id);
    const names = neighbors.map((neighbor) => shortId(neighbor.regionId));
    push(`  ${shortId(region.id)} -> ${names.length > 0 ? names.join(", ") : "(none)"}`);
  }
  push();

  push("Boundary Edges:");
  for (const edge of WORLD_EDGES) {
    const count = geography.boundaryAnchorsByEdge(world, edge).length;
    push(`  ${`${edge}:`.padEnd(7)} ${count}`);
  }
  push();

  const invariants = checkGeographyInvariants(simulation);
  push("Invariants:");
  for (const invariant of invariants.checks) {
    push(`  ${invariant.ok ? "OK  " : "FAIL"}  ${invariant.label}`);
  }
  for (const violation of invariants.violations) {
    push(`  FAIL  ${violation}`);
  }
  push();

  const ok = registration.ok && invariants.ok;
  push("Validation:");
  push(`  ${ok ? "PASS" : "FAIL"}`);
  if (!registration.ok) {
    for (const command of registration.commands.filter((entry) => !entry.ok)) {
      push(`  FAIL  ${command.type}: ${command.error ?? "unknown error"}`);
    }
  }
  push();

  return { ok, report: `${lines.join("\n")}` };
}

/** `xia_starter_v0_1:region:R01` -> `R01`, so the report stays readable. */
function shortId(entityId: string): string {
  const parts = entityId.split(":");
  return parts[parts.length - 1] ?? entityId;
}

/** Fallback logical-connection count when no shared index is exposed. */
function countLogical(world: ReturnType<Simulation["worldView"]>, locationIds: string[]): number {
  const seen = new Set<string>();
  for (const locationId of locationIds) {
    for (const relation of world.listRelations({ type: "world-geography.adjacent_to", from: locationId })) {
      const key = locationId < relation.to ? `${locationId}\u0000${relation.to}` : `${relation.to}\u0000${locationId}`;
      seen.add(key);
    }
  }
  return seen.size;
}

export type { WorldEdge };
