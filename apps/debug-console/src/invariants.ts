/**
 * Geography invariants (§11).
 *
 * These are the properties that must hold for *any* world containing geography,
 * authored or simulated. They are checked against the live world rather than
 * against the pack, so they also catch a module that corrupted the graph at
 * runtime - not just a bad authoring pass.
 *
 * Every violation string names the offending object ids, so a failure is
 * actionable without re-deriving anything by hand.
 */

import type { Simulation } from "@openlife/simulation";
import type { GeographyApi, GeographyGraphIndex } from "@openlife/module-world-geography";

export interface InvariantCheck {
  id: string;
  label: string;
  ok: boolean;
}

export interface InvariantReport {
  ok: boolean;
  checks: InvariantCheck[];
  /** Human-readable descriptions of everything that failed. */
  violations: string[];
}

export function checkGeographyInvariants(simulation: Simulation): InvariantReport {
  const world = simulation.worldView();
  const geography = simulation.modules.capabilityImplementation<GeographyApi>("world.geography");
  if (!geography) {
    return {
      ok: false,
      checks: [{ id: "capability", label: "world.geography capability present", ok: false }],
      violations: ["world.geography capability is not installed"],
    };
  }

  const index = geography.buildIndex(world);
  const violations: string[] = [];
  const check = (id: string, label: string, run: () => string[]): InvariantCheck => {
    const found = run();
    violations.push(...found);
    return { id, label, ok: found.length === 0 };
  };

  const checks: InvariantCheck[] = [
    check("symmetry", "adjacency symmetry: A-B implies B-A with equal distance and terrain cost", () => checkSymmetry(index)),
    check("membership", "region membership: every location belongs to exactly one region", () => checkMembership(index)),
    check("integrity", "connection integrity: every connection endpoint exists as a location", () => checkIntegrity(index)),
    check("uniqueness", "no duplicate logical connection: A-B and B-A is one connection", () => checkUniqueness(index)),
    check("derived", "derived adjacency: every region adjacency traces to a cross-region connection", () => checkDerived(index, geography, world)),
  ];

  return { ok: violations.length === 0, checks, violations };
}

/** Each stored directed half must have its mirrored half with identical data. */
function checkSymmetry(index: GeographyGraphIndex): string[] {
  const violations: string[] = [];
  for (const fact of index.logicalConnections) {
    const forward = index.adjacency.get(fact.from)?.get(fact.to);
    const backward = index.adjacency.get(fact.to)?.get(fact.from);
    if (!forward || !backward) {
      violations.push(
        `asymmetric connection: ${fact.from} <-> ${fact.to} is missing the `
        + `${forward ? "reverse" : "forward"} half`,
      );
      continue;
    }
    if (forward.distance !== backward.distance) {
      violations.push(
        `asymmetric distance: ${fact.from} -> ${fact.to} = ${forward.distance}, `
        + `${fact.to} -> ${fact.from} = ${backward.distance}`,
      );
    }
    if (forward.terrainCost !== backward.terrainCost) {
      violations.push(
        `asymmetric terrain cost: ${fact.from} -> ${fact.to} = ${String(forward.terrainCost)}, `
        + `${fact.to} -> ${fact.from} = ${String(backward.terrainCost)}`,
      );
    }
  }
  return violations;
}

/** Exactly one `contains` region per location: zero and two are both broken. */
function checkMembership(index: GeographyGraphIndex): string[] {
  const violations: string[] = [];
  const owners = new Map<string, string[]>();
  for (const relation of index.world.listRelations({ type: "world-geography.contains" })) {
    const list = owners.get(relation.to) ?? [];
    list.push(relation.from);
    owners.set(relation.to, list);
  }
  for (const locationId of index.locationIds) {
    const regionList = owners.get(locationId) ?? [];
    if (regionList.length === 0) {
      violations.push(`location ${locationId} belongs to no region`);
    } else if (regionList.length > 1) {
      violations.push(`location ${locationId} belongs to ${regionList.length} regions: ${regionList.join(", ")}`);
    }
  }
  for (const [locationId, regionList] of owners) {
    if (!index.locationSet.has(locationId)) {
      violations.push(`contains relation points at ${locationId}, which is not a location (regions: ${regionList.join(", ")})`);
    }
  }
  return violations;
}

/** Both endpoints of every stored adjacency must be real locations. */
function checkIntegrity(index: GeographyGraphIndex): string[] {
  const violations: string[] = [];
  for (const relation of index.world.listRelations({ type: "world-geography.adjacent_to" })) {
    if (!index.locationSet.has(relation.from)) {
      violations.push(`connection starts at ${relation.from}, which is not a location`);
    }
    if (!index.locationSet.has(relation.to)) {
      violations.push(`connection ends at ${relation.to}, which is not a location`);
    }
  }
  return violations;
}

/** Two directed rows are permitted; a second logical connection is not. */
function checkUniqueness(index: GeographyGraphIndex): string[] {
  const violations: string[] = [];
  const rows = index.world.listRelations({ type: "world-geography.adjacent_to" });
  const counts = new Map<string, number>();
  for (const relation of rows) {
    const key = relation.from < relation.to
      ? `${relation.from}\u0000${relation.to}`
      : `${relation.to}\u0000${relation.from}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [key, count] of counts) {
    if (count > 2) {
      const [a, b] = key.split("\u0000");
      violations.push(`connection ${a} <-> ${b} is stored ${count} times; the logical graph holds one`);
    }
  }
  return violations;
}

/**
 * The proof that region adjacency is derived rather than stored: every
 * adjacency reported by the API must correspond to a connection in the index
 * whose two endpoints sit in different regions. A stored `region adjacent_to`
 * row would produce an entry with no backing cross-region connection.
 */
function checkDerived(
  index: GeographyGraphIndex,
  geography: GeographyApi,
  world: ReturnType<Simulation["worldView"]>,
): string[] {
  const violations: string[] = [];
  for (const regionId of index.regionIds) {
    for (const neighbor of geography.adjacentRegions(world, regionId)) {
      if (neighbor.borderConnectionCount <= 0 || neighbor.borderPairs.length === 0) {
        violations.push(`region ${regionId} reports neighbor ${neighbor.regionId} with no border connection`);
        continue;
      }
      for (const pair of neighbor.borderPairs) {
        const fact = index.adjacency.get(pair.fromLocationId)?.get(pair.toLocationId);
        if (!fact) {
          violations.push(
            `region adjacency ${regionId} -> ${neighbor.regionId} cites `
            + `${pair.fromLocationId} -> ${pair.toLocationId}, which is not a stored connection`,
          );
          continue;
        }
        const fromRegion = index.regionByLocation.get(pair.fromLocationId);
        const toRegion = index.regionByLocation.get(pair.toLocationId);
        if (fromRegion === toRegion) {
          violations.push(
            `region adjacency ${regionId} -> ${neighbor.regionId} cites an intra-region connection `
            + `${pair.fromLocationId} -> ${pair.toLocationId} (both in ${String(fromRegion)})`,
          );
        }
      }
    }
  }
  return violations;
}
